import * as api from '../services/api-client.js';
import { holeAbfrage } from '../services/query-cache.js';
import { t } from '../services/i18n.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';

const FEED_CACHE_KEY = ['feed'];
const FEED_CACHE_TTL_MS = 60 * 1000;

const TYPE_CONFIG = {
  release: { icon: 'megaphone', labelKey: 'feed.release', accent: 'accent-release' },
  announcement: { icon: 'megaphone', labelKey: 'feed.announcement', accent: 'accent-announcement' },
  article: { icon: 'fileText', labelKey: 'feed.article', accent: 'accent-article' },
  tool: { icon: 'wrench', labelKey: 'feed.tool', accent: 'accent-tool' },
  skill: { icon: 'lightbulb', labelKey: 'feed.skill', accent: 'accent-skill' },
  video: { icon: 'video', labelKey: 'feed.video', accent: 'accent-video' },
  tutorial: { icon: 'graduationCap', labelKey: 'feed.tutorial', accent: 'accent-tutorial' }
};

const VALID_FILTERS = ['all', 'release', 'announcement', 'article', 'tool', 'skill', 'video', 'tutorial'];

async function render(container, context = {}) {
  const response = await holeAbfrage({
    schluessel: FEED_CACHE_KEY,
    abrufFunktion: () => api.get('/api/feed'),
    ttlMs: FEED_CACHE_TTL_MS
  });

  if (!response.ok || !response.data || response.data.length === 0) {
    container.innerHTML = `
      <div class="feed-leer">
        <div class="feed-leer-icon">${icon('newspaper', 56)}</div>
        <h2 class="feed-leer-titel">${t('feed.emptyTitle')}</h2>
        <p class="feed-leer-text">${t('feed.emptyText')}</p>
      </div>
    `;
    return;
  }

  const currentFilter = context.searchParams?.get('filter') || 'all';
  const items = currentFilter === 'all'
    ? response.data
    : response.data.filter((item) => item.type === currentFilter);

  const featured = response.data.find((item) => item.featured);
  const feedItems = featured
    ? items.filter((item) => item.id !== featured.id)
    : items;

  const grouped = groupByTime(feedItems);

  container.innerHTML = `
    <div class="feed-page">
      <header class="feed-header">
        <div class="feed-header-text">
          <h1 class="feed-titel">${t('feed.title')}</h1>
          <p class="feed-untertitel">${t('feed.subtitle')}</p>
        </div>
      </header>

      ${featured && currentFilter === 'all' ? renderFeatured(featured) : ''}

      <div class="feed-filter-bar">
        ${VALID_FILTERS.filter((f) => f === 'all' || response.data.some((item) => item.type === f)).map((f) => `
          <button class="feed-filter-chip ${f === currentFilter ? 'aktiv' : ''}" data-filter="${f}">
            ${f !== 'all' ? `<span class="feed-filter-dot ${TYPE_CONFIG[f]?.accent || ''}"></span>` : ''}
            ${t('feed.filter_' + f)}
          </button>
        `).join('')}
      </div>

      <div class="feed-stream">
        ${grouped.map(({ label, items: groupItems }) => `
          <section class="feed-gruppe">
            <div class="feed-gruppe-header">
              <span class="feed-gruppe-label">${label}</span>
              <span class="feed-gruppe-linie"></span>
            </div>
            <div class="feed-grid">
              ${groupItems.map((item, index) => renderFeedCard(item, index)).join('')}
            </div>
          </section>
        `).join('')}
      </div>

      ${items.length === 0 ? `
        <div class="feed-keine-ergebnisse">
          <p>${t('feed.noResults')}</p>
        </div>
      ` : ''}
    </div>
  `;

  bindEvents(container, context, response.data);
}

function preload() {
  return holeAbfrage({
    schluessel: FEED_CACHE_KEY,
    abrufFunktion: () => api.get('/api/feed'),
    ttlMs: FEED_CACHE_TTL_MS
  });
}

function renderFeatured(item) {
  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.announcement;
  const url = item.url || '';
  const hasLink = url.length > 0;

  return `
    <article class="feed-featured ${config.accent}">
      <div class="feed-featured-badge">
        ${icon(config.icon, 16)}
        <span>${t(config.labelKey)}</span>
      </div>
      <h2 class="feed-featured-titel">${escapeHtml(item.title)}</h2>
      ${item.content ? `<p class="feed-featured-text">${linkifyText(escapeHtml(item.content))}</p>` : ''}
      <div class="feed-featured-footer">
        <time class="feed-featured-zeit">${formatRelativeTime(item.createdAt)}</time>
        ${hasLink ? `
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="feed-featured-link">
            ${icon('externalLink', 14)}
            <span>${extractDomain(url)}</span>
          </a>
        ` : ''}
      </div>
    </article>
  `;
}

function renderFeedCard(item, index) {
  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.article;
  const url = item.url || '';
  const hasLink = url.length > 0;
  const delay = Math.min(index * 40, 300);

  const cardContent = `
    <div class="feed-card-accent ${config.accent}"></div>
    <div class="feed-card-body">
      <div class="feed-card-meta">
        <span class="feed-card-type ${config.accent}">
          ${icon(config.icon, 13)}
          ${t(config.labelKey)}
        </span>
        <time class="feed-card-zeit">${formatRelativeTime(item.createdAt)}</time>
      </div>
      <h3 class="feed-card-titel">${escapeHtml(item.title)}</h3>
      ${item.content || item.description ? `
        <p class="feed-card-text">${linkifyText(escapeHtml(item.content || item.description))}</p>
      ` : ''}
      ${hasLink ? `
        <span class="feed-card-link">
          ${icon('externalLink', 13)}
          ${extractDomain(url)}
        </span>
      ` : ''}
    </div>
  `;

  if (hasLink) {
    return `
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
         class="feed-card feed-card-clickable" style="animation-delay: ${delay}ms">
        ${cardContent}
      </a>
    `;
  }

  return `
    <article class="feed-card" style="animation-delay: ${delay}ms">
      ${cardContent}
    </article>
  `;
}

function groupByTime(items) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const groups = { today: [], week: [], earlier: [] };

  for (const item of items) {
    const date = new Date(item.createdAt);
    if (date >= todayStart) {
      groups.today.push(item);
    } else if (date >= weekStart) {
      groups.week.push(item);
    } else {
      groups.earlier.push(item);
    }
  }

  const result = [];
  if (groups.today.length > 0) {
    result.push({ label: t('feed.today'), items: groups.today });
  }
  if (groups.week.length > 0) {
    result.push({ label: t('feed.thisWeek'), items: groups.week });
  }
  if (groups.earlier.length > 0) {
    result.push({ label: t('feed.earlier'), items: groups.earlier });
  }

  if (result.length === 0 && items.length > 0) {
    result.push({ label: t('feed.latest'), items });
  }

  return result;
}

function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  const lang = document.documentElement.lang || 'de';

  if (diffMin < 1) return lang === 'de' ? 'Gerade eben' : 'Just now';
  if (diffMin < 60) return lang === 'de' ? `vor ${diffMin} Min.` : `${diffMin}m ago`;
  if (diffH < 24) return lang === 'de' ? `vor ${diffH} Std.` : `${diffH}h ago`;
  if (diffD < 7) return lang === 'de' ? `vor ${diffD} Tag${diffD > 1 ? 'en' : ''}` : `${diffD}d ago`;

  return date.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname;
  } catch {
    return url.substring(0, 30);
  }
}

function linkifyText(text) {
  return text.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="feed-inline-link">$1</a>'
  );
}

function bindEvents(container, context, allData) {
  container.querySelectorAll('.feed-filter-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      context.setSearchParams?.({ filter: filter === 'all' ? null : filter });
    });
  });
}

export { render, preload };
