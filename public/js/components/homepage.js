import * as api from '../services/api-client.js';
import { holeAbfrage } from '../services/query-cache.js';
import { t } from '../services/i18n.js';
import { escapeHtml, openModal } from './modal.js';
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
const VALID_SORTS = ['newest', 'oldest', 'title'];
const VALID_LAYOUTS = ['grid', 'list'];

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
  const requestedSort = context.searchParams?.get('sort') || 'newest';
  const currentSort = VALID_SORTS.includes(requestedSort) ? requestedSort : 'newest';
  const requestedLayout = context.searchParams?.get('layout') || 'grid';
  const currentLayout = VALID_LAYOUTS.includes(requestedLayout) ? requestedLayout : 'grid';
  const filteredItems = currentFilter === 'all'
    ? allItems
    : allItems.filter((item) => item.kind === currentFilter);
  const sortedItems = sortFeedItems(filteredItems, currentSort);

  const highlights = currentFilter === 'all' ? selectHighlights(allItems) : { lead: null, secondary: [] };
  const highlightIds = new Set([
    highlights.lead?.id,
    ...highlights.secondary.map((item) => item.id)
  ].filter(Boolean));
  const sections = buildSections(sortedItems, currentFilter, highlightIds);

  container.innerHTML = `
    <div class="feed-page">
      <header class="feed-header">
        <div class="feed-header-text">
          <h1 class="feed-titel">${t('feed.title')}</h1>
          <p class="feed-untertitel">${t('feed.subtitle')}</p>
        </div>
      </header>

      ${renderFeedToolbar({ allItems, currentFilter, currentSort, currentLayout })}

      ${renderHighlights(highlights)}

      ${sections.map((section, sectionIndex) => renderSection(section, sectionIndex, currentLayout)).join('')}

      ${sortedItems.length === 0 ? `
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
    detailContent: item.detailContent || item.content || item.description || '',
    imageUrl: item.imageUrl || '',
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

function sortFeedItems(items, sortierung) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (sortierung === 'oldest') {
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    }
    if (sortierung === 'title') {
      return a.title.localeCompare(b.title, document.documentElement.lang || 'de');
    }

    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
  return sorted;
}

function renderFeedToolbar({ allItems, currentFilter, currentSort, currentLayout }) {
  return `
    <div class="feed-toolbar">
      <nav class="feed-category-tabs" aria-label="${escapeHtml(t('feed.categories'))}">
        ${VALID_FILTERS.filter((value) => value === 'all' || allItems.some((item) => item.kind === value)).map((value) => `
          <button class="feed-category-tab ${value === currentFilter ? 'aktiv' : ''}" data-kind-filter="${value}">
            ${t(FILTER_CONFIG[value].labelKey)}
          </button>
        `).join('')}
      </nav>
      <div class="feed-toolbar-actions">
        <label class="feed-sort-label" for="feed-sort-select">${t('feed.sort')}</label>
        <select class="feed-sort-select" id="feed-sort-select">
          <option value="newest" ${currentSort === 'newest' ? 'selected' : ''}>${t('general.sortNewest')}</option>
          <option value="oldest" ${currentSort === 'oldest' ? 'selected' : ''}>${t('general.sortOldest')}</option>
          <option value="title" ${currentSort === 'title' ? 'selected' : ''}>${t('general.sortTitleAsc')}</option>
        </select>
        <div class="feed-layout-toggle" aria-label="${escapeHtml(t('feed.layout'))}">
          <button class="${currentLayout === 'grid' ? 'aktiv' : ''}" data-layout-option="grid" title="${escapeHtml(t('feed.layoutGrid'))}">
            ${icon('layoutDashboard', 15)}
          </button>
          <button class="${currentLayout === 'list' ? 'aktiv' : ''}" data-layout-option="list" title="${escapeHtml(t('feed.layoutList'))}">
            ${icon('list', 15)}
          </button>
        </div>
      </div>
    </div>
  `;
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

function renderSection(section, sectionIndex, layout) {
  return `
    <section class="feed-section feed-section-${escapeHtml(section.key)}" style="animation-delay: ${Math.min(sectionIndex * 40, 200)}ms">
      <div class="feed-section-header">
        <div>
          <div class="feed-section-kicker">${section.title}</div>
          <h2 class="feed-section-title">${section.title}</h2>
          <p class="feed-section-subtitle">${section.subtitle}</p>
        </div>
      </div>
      <div class="feed-grid feed-grid-${escapeHtml(layout)}">
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
    <article class="feed-featured ${config.accent}" data-feed-detail="${escapeHtml(item.id)}">
      ${renderFeedImage(item, 'feed-featured-image')}
      <h2 class="feed-featured-titel">${escapeHtml(item.title)}</h2>
      ${getItemSummary(item) ? `<p class="feed-featured-text">${linkifyText(escapeHtml(getItemSummary(item)))}</p>` : ''}
      <div class="feed-featured-footer">
        <span>${t(config.labelKey)}</span>
        <time class="feed-featured-zeit">${formatRelativeTime(item.createdAt)}</time>
        ${hasLink ? `
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="feed-featured-link">
            <span>${extractDomain(url)}</span>
          </a>
        ` : ''}
      </div>
      ${sourceLabel || visibleTags.length > 0 ? `
        <div class="feed-card-tags feed-card-tags-featured">
          ${sourceLabel ? `<span class="feed-card-tag feed-card-source">${escapeHtml(sourceLabel)}</span>` : ''}
          ${visibleTags.map((tag) => `<span class="feed-card-tag">${escapeHtml(formatTag(tag))}</span>`).join('')}
        </div>
      ` : ''}
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
    ${renderFeedImage(item, 'feed-card-image')}
    <div class="feed-card-body">
      <div class="feed-card-meta">
        <span class="feed-card-type ${config.accent}">
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

  return `
    <article class="feed-card feed-card-clickable" style="animation-delay: ${delay}ms" data-feed-detail="${escapeHtml(item.id)}">
      ${cardContent}
    </article>
  `;
}

function renderFeedImage(item, className) {
  if (item.imageUrl) {
    return `<img class="${className}" src="${escapeHtml(item.imageUrl)}" alt="">`;
  }

  const config = getTypeConfig(item);
  const size = className === 'feed-featured-image' ? 42 : 24;
  return `
    <div class="${className} feed-image-placeholder ${config.accent}" aria-hidden="true">
      ${icon(config.icon, size)}
    </div>
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

function getItemDetailContent(item) {
  return item.detailContent || item.content || item.description || item.summary || '';
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

  const sortSelect = container.querySelector('#feed-sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      context.setSearchParams?.({ sort: sortSelect.value === 'newest' ? null : sortSelect.value });
    });
  }

  container.querySelectorAll('[data-layout-option]').forEach((button) => {
    button.addEventListener('click', () => {
      context.setSearchParams?.({ layout: button.dataset.layoutOption === 'grid' ? null : button.dataset.layoutOption });
    });
  });

  container.querySelectorAll('[data-feed-detail]').forEach((card) => {
    card.addEventListener('click', () => {
      const item = [...container.querySelectorAll('[data-feed-detail]')]
        .map((node) => node.dataset.feedDetail)
        .includes(card.dataset.feedDetail);
      if (!item) {
        return;
      }
      const feedItem = card.dataset.feedDetail;
      api.get('/api/feed/' + encodeURIComponent(feedItem)).then((response) => {
        if (!response.ok || !response.data) {
          return;
        }
        openFeedDetail(response.data);
      });
    });
  });
}

function openFeedDetail(item) {
  const config = getTypeConfig(item);
  const visibleTags = getVisibleTags(item);
  const sourceLabel = formatSourceLabel(item.source);
  openModal({
    title: item.title,
    content: `
      <article class="feed-detail">
        ${item.imageUrl ? `<img class="feed-detail-image" src="${escapeHtml(item.imageUrl)}" alt="">` : ''}
        <div class="feed-card-meta">
          <span class="feed-card-type ${config.accent}">
            ${icon(config.icon, 13)}
            ${t(config.labelKey)}
          </span>
          <time class="feed-card-zeit">${formatRelativeTime(item.createdAt)}</time>
        </div>
        ${getItemDetailContent(item) ? `<div class="feed-detail-content">${linkifyText(escapeHtml(getItemDetailContent(item))).replace(/\n/g, '<br>')}</div>` : ''}
        ${sourceLabel || visibleTags.length > 0 ? `
          <div class="feed-card-tags">
            ${sourceLabel ? `<span class="feed-card-tag feed-card-source">${escapeHtml(sourceLabel)}</span>` : ''}
            ${visibleTags.map((tag) => `<span class="feed-card-tag">${escapeHtml(formatTag(tag))}</span>`).join('')}
          </div>
        ` : ''}
        ${item.url ? `
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sekundaer">
            ${icon('externalLink', 14)}
            ${extractDomain(item.url)}
          </a>
        ` : ''}
      </article>
    `,
    cancelText: t('general.close')
  });
}

export { render, preload };
