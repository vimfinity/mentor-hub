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
  tutorial: { icon: 'graduationCap', labelKey: 'feed.tutorial', accent: 'accent-tutorial' },
  comparison: { icon: 'layoutDashboard', labelKey: 'feed.comparison', accent: 'accent-tutorial' },
  playbook: { icon: 'clipboardList', labelKey: 'feed.playbook', accent: 'accent-article' },
  'use-case': { icon: 'layoutDashboard', labelKey: 'feed.useCase', accent: 'accent-article' },
  onboarding: { icon: 'bookOpen', labelKey: 'feed.onboarding', accent: 'accent-tutorial' },
  mcp: { icon: 'settings', labelKey: 'feed.mcp', accent: 'accent-tool' },
  agent: { icon: 'layoutDashboard', labelKey: 'feed.agent', accent: 'accent-skill' },
  'agents-md': { icon: 'fileText', labelKey: 'feed.agentsMd', accent: 'accent-article' },
  template: { icon: 'fileText', labelKey: 'feed.template', accent: 'accent-article' },
  script: { icon: 'wrench', labelKey: 'feed.script', accent: 'accent-tool' },
  'prompt-pack': { icon: 'messageSquare', labelKey: 'feed.promptPack', accent: 'accent-skill' },
  repo: { icon: 'bookOpen', labelKey: 'feed.repo', accent: 'accent-tool' }
};

const FILTER_CONFIG = {
  all: { labelKey: 'feed.filter_all' },
  update: { labelKey: 'feed.filter_update' },
  guide: { labelKey: 'feed.filter_guide' },
  'agent-asset': { labelKey: 'feed.filter_agent_asset' }
};

const VALID_FILTERS = Object.keys(FILTER_CONFIG);

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

  const allItems = response.data.map(normalizeFeedItem);
  const requestedFilter = context.searchParams?.get('kind') || 'all';
  const currentFilter = VALID_FILTERS.includes(requestedFilter) ? requestedFilter : 'all';
  const filteredItems = currentFilter === 'all'
    ? allItems
    : allItems.filter((item) => item.kind === currentFilter);

  const highlights = currentFilter === 'all' ? selectHighlights(allItems) : { lead: null, secondary: [] };
  const highlightIds = new Set([
    highlights.lead?.id,
    ...highlights.secondary.map((item) => item.id)
  ].filter(Boolean));
  const sections = buildSections(filteredItems, currentFilter, highlightIds);

  container.innerHTML = `
    <div class="feed-page">
      <header class="feed-header">
        <div class="feed-header-text">
          <h1 class="feed-titel">${t('feed.title')}</h1>
          <p class="feed-untertitel">${t('feed.subtitle')}</p>
        </div>
      </header>

      ${renderHighlights(highlights)}

      <div class="feed-filter-bar">
        ${VALID_FILTERS.filter((value) => value === 'all' || allItems.some((item) => item.kind === value)).map((value) => `
          <button class="feed-filter-chip ${value === currentFilter ? 'aktiv' : ''}" data-kind-filter="${value}">
            ${value !== 'all' ? `<span class="feed-filter-dot ${getKindAccent(value)}"></span>` : ''}
            ${t(FILTER_CONFIG[value].labelKey)}
          </button>
        `).join('')}
      </div>

      ${sections.map((section, sectionIndex) => renderSection(section, sectionIndex)).join('')}

      ${filteredItems.length === 0 ? `
        <div class="feed-keine-ergebnisse">
          <p>${t('feed.noResults')}</p>
        </div>
      ` : ''}
    </div>
  `;

  bindEvents(container, context);
}

function preload() {
  return holeAbfrage({
    schluessel: FEED_CACHE_KEY,
    abrufFunktion: () => api.get('/api/feed'),
    ttlMs: FEED_CACHE_TTL_MS
  });
}

function normalizeFeedItem(item) {
  const normalizedType = item.subtype || item.type || 'article';
  return {
    ...item,
    kind: item.kind || inferKind(normalizedType),
    subtype: normalizedType,
    type: normalizedType,
    summary: item.summary || item.content || item.description || '',
    source: item.source || 'internal',
    tags: Array.isArray(item.tags) ? Array.from(new Set(item.tags.filter(Boolean))) : []
  };
}

function inferKind(type) {
  if (['release', 'announcement', 'article', 'video'].includes(type)) {
    return 'update';
  }

  if (['tutorial', 'playbook', 'use-case', 'onboarding', 'comparison'].includes(type)) {
    return 'guide';
  }

  return 'agent-asset';
}

function selectHighlights(items) {
  const updateItems = items.filter((item) => item.kind === 'update');
  const pool = updateItems.length > 0 ? updateItems : items;

  if (pool.length === 0) {
    return { lead: null, secondary: [] };
  }

  const sorted = [...pool].sort((a, b) => {
    if (Boolean(a.featured) !== Boolean(b.featured)) {
      return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    }

    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return {
    lead: sorted[0],
    secondary: sorted.slice(1, 4)
  };
}

function buildSections(items, currentFilter, highlightIds) {
  if (currentFilter !== 'all') {
    return [{
      key: currentFilter,
      title: t(getSectionTitleKey(currentFilter)),
      subtitle: t(getSectionSubtitleKey(currentFilter)),
      items
    }];
  }

  return [
    {
      key: 'updates',
      title: t('feed.sectionUpdates'),
      subtitle: t('feed.sectionUpdatesSubtitle'),
      items: items.filter((item) => item.kind === 'update' && !highlightIds.has(item.id))
    },
    {
      key: 'guides',
      title: t('feed.sectionGuides'),
      subtitle: t('feed.sectionGuidesSubtitle'),
      items: items.filter((item) => item.kind === 'guide')
    },
    {
      key: 'agent-assets',
      title: t('feed.sectionAssets'),
      subtitle: t('feed.sectionAssetsSubtitle'),
      items: items.filter((item) => item.kind === 'agent-asset')
    }
  ].filter((section) => section.items.length > 0);
}

function getSectionTitleKey(filter) {
  if (filter === 'update') return 'feed.sectionUpdates';
  if (filter === 'guide') return 'feed.sectionGuides';
  return 'feed.sectionAssets';
}

function getSectionSubtitleKey(filter) {
  if (filter === 'update') return 'feed.sectionUpdatesSubtitle';
  if (filter === 'guide') return 'feed.sectionGuidesSubtitle';
  return 'feed.sectionAssetsSubtitle';
}

function renderHighlights({ lead, secondary }) {
  if (!lead) {
    return '';
  }

  return `
    <section class="feed-highlights">
      <div class="feed-section-header">
        <div>
          <div class="feed-section-kicker">${t('feed.sectionHighlights')}</div>
          <h2 class="feed-section-title">${t('feed.sectionHighlights')}</h2>
          <p class="feed-section-subtitle">${t('feed.sectionHighlightsSubtitle')}</p>
        </div>
      </div>
      ${renderFeatured(lead)}
      ${secondary.length > 0 ? `
        <div class="feed-highlight-grid">
          ${secondary.map((item, index) => renderFeedCard(item, index)).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

function renderSection(section, sectionIndex) {
  return `
    <section class="feed-section feed-section-${escapeHtml(section.key)}" style="animation-delay: ${Math.min(sectionIndex * 40, 200)}ms">
      <div class="feed-section-header">
        <div>
          <div class="feed-section-kicker">${section.title}</div>
          <h2 class="feed-section-title">${section.title}</h2>
          <p class="feed-section-subtitle">${section.subtitle}</p>
        </div>
      </div>
      <div class="feed-grid">
        ${section.items.map((item, index) => renderFeedCard(item, index)).join('')}
      </div>
    </section>
  `;
}

function renderFeatured(item) {
  const config = getTypeConfig(item);
  const url = item.url || '';
  const hasLink = url.length > 0;
  const sourceLabel = formatSourceLabel(item.source);
  const visibleTags = getVisibleTags(item);

  return `
    <article class="feed-featured ${config.accent}">
      <div class="feed-featured-badge">
        ${icon(config.icon, 16)}
        <span>${t(config.labelKey)}</span>
      </div>
      <h2 class="feed-featured-titel">${escapeHtml(item.title)}</h2>
      ${getItemSummary(item) ? `<p class="feed-featured-text">${linkifyText(escapeHtml(getItemSummary(item)))}</p>` : ''}
      ${sourceLabel || visibleTags.length > 0 ? `
        <div class="feed-card-tags feed-card-tags-featured">
          ${sourceLabel ? `<span class="feed-card-tag feed-card-source">${escapeHtml(sourceLabel)}</span>` : ''}
          ${visibleTags.map((tag) => `<span class="feed-card-tag">${escapeHtml(formatTag(tag))}</span>`).join('')}
        </div>
      ` : ''}
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
  const config = getTypeConfig(item);
  const url = item.url || '';
  const hasLink = url.length > 0;
  const delay = Math.min(index * 40, 300);
  const sourceLabel = formatSourceLabel(item.source);
  const visibleTags = getVisibleTags(item);

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
      ${getItemSummary(item) ? `
        <p class="feed-card-text">${linkifyText(escapeHtml(getItemSummary(item)))}</p>
      ` : ''}
      ${sourceLabel || visibleTags.length > 0 ? `
        <div class="feed-card-tags">
          ${sourceLabel ? `<span class="feed-card-tag feed-card-source">${escapeHtml(sourceLabel)}</span>` : ''}
          ${visibleTags.map((tag) => `<span class="feed-card-tag">${escapeHtml(formatTag(tag))}</span>`).join('')}
        </div>
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

function getTypeConfig(item) {
  return TYPE_CONFIG[item.subtype] || TYPE_CONFIG[item.type] || TYPE_CONFIG.article;
}

function getKindAccent(kind) {
  if (kind === 'guide') return 'accent-tutorial';
  if (kind === 'agent-asset') return 'accent-skill';
  return 'accent-release';
}

function getItemSummary(item) {
  return item.summary || item.content || item.description || '';
}

function getVisibleTags(item) {
  const blocked = new Set([
    item.kind,
    item.type,
    item.subtype,
    item.source
  ].filter(Boolean));

  return (item.tags || [])
    .filter((tag) => !blocked.has(tag))
    .slice(0, 3);
}

function formatTag(tag) {
  return tag
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatSourceLabel(source) {
  if (!source || source === 'internal') {
    return '';
  }

  const knownLabels = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    github: 'GitHub',
    mcp: 'MCP'
  };

  return knownLabels[source] || formatTag(source);
}

function bindEvents(container, context) {
  container.querySelectorAll('[data-kind-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.kindFilter;
      context.setSearchParams?.({ kind: filter === 'all' ? null : filter });
    });
  });
}

export { render, preload };
