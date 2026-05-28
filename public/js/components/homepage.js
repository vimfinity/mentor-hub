import * as api from '../services/api-client.js';
import { fetchQuery } from '../services/query-cache.js';
import { t, getLocale } from '../services/i18n.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';
import { renderSelect, bindSelect } from './select.js';
import { renderResponsiveImage } from './responsive-image.js';

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
  const response = await fetchQuery({
    key: [...FEED_CACHE_KEY, getLocale()],
    fetchFunction: () => api.get('/api/feed'),
    ttlMs: FEED_CACHE_TTL_MS
  });

  if (!response.ok || !response.data || response.data.length === 0) {
    container.innerHTML = `
      <div class="feed-empty">
        <div class="feed-empty-icon">${icon('newspaper', 56)}</div>
        <h2 class="feed-empty-title">${t('feed.emptyTitle')}</h2>
        <p class="feed-empty-text">${t('feed.emptyText')}</p>
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
      ${renderFeedToolbar({ allItems, currentFilter, currentSort, currentLayout })}

      ${renderHighlights(highlights)}

      ${sections.map((section, sectionIndex) => renderSection(section, sectionIndex, currentLayout)).join('')}

      ${sortedItems.length === 0 ? `
        <div class="feed-no-results">
          <p>${t('feed.noResults')}</p>
        </div>
      ` : ''}
    </div>
  `;

  bindEvents(container, context);
}

function preload() {
  return fetchQuery({
    key: [...FEED_CACHE_KEY, getLocale()],
    fetchFunction: () => api.get('/api/feed'),
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

function sortFeedItems(items, sortOrder) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (sortOrder === 'oldest') {
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    }
    if (sortOrder === 'title') {
      return a.title.localeCompare(b.title, document.documentElement.lang || 'de');
    }

    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
  return sorted;
}

function renderFeedToolbar({ allItems, currentFilter, currentSort, currentLayout }) {
  const sortOptions = [
    { value: 'newest', label: t('general.sortNewest') },
    { value: 'oldest', label: t('general.sortOldest') },
    { value: 'title', label: t('general.sortTitleAsc') }
  ];

  return `
    <div class="feed-toolbar">
      <nav class="feed-category-tabs" aria-label="${escapeHtml(t('feed.categories'))}">
        ${VALID_FILTERS.filter((value) => value === 'all' || allItems.some((item) => item.kind === value)).map((value) => `
          <button class="feed-category-tab ${value === currentFilter ? 'active' : ''}" data-kind-filter="${value}">
            ${t(FILTER_CONFIG[value].labelKey)}
          </button>
        `).join('')}
      </nav>
      <div class="feed-toolbar-actions">
        <span class="feed-sort-label">${t('feed.sort')}</span>
        ${renderSelect({
          name: 'feed-sort',
          value: currentSort,
          options: sortOptions,
          size: 'klein',
          ariaLabel: t('feed.sort')
        })}
        <div class="feed-layout-toggle" aria-label="${escapeHtml(t('feed.layout'))}">
          <button class="${currentLayout === 'grid' ? 'active' : ''}" data-layout-option="grid" title="${escapeHtml(t('feed.layoutGrid'))}">
            ${icon('layoutDashboard', 15)}
          </button>
          <button class="${currentLayout === 'list' ? 'active' : ''}" data-layout-option="list" title="${escapeHtml(t('feed.layoutList'))}">
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
    <section class="feed-section feed-section-${escapeHtml(section.key)}">
      <div class="feed-section-header">
        <div>
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
  const sourceLabel = formatSourceLabel(item.source);
  const visibleTags = getVisibleTags(item);
  const target = resolveFeedTarget(item);

  const innerHtml = `
    ${renderFeedImage(item, 'feed-featured-image')}
    <h2 class="feed-featured-title">${escapeHtml(item.title)}</h2>
    ${getItemSummary(item) ? `<p class="feed-featured-text">${linkifyText(escapeHtml(getItemSummary(item)))}</p>` : ''}
    <div class="feed-featured-footer">
      <span>${t(config.labelKey)}</span>
      <time class="feed-featured-time">${formatRelativeTime(item.createdAt)}</time>
      ${target.kind === 'external' ? `<span class="feed-featured-link">${extractDomain(target.url)}</span>` : ''}
    </div>
    ${sourceLabel || visibleTags.length > 0 ? `
      <div class="feed-card-tags feed-card-tags-featured">
        ${sourceLabel ? `<span class="feed-card-tag feed-card-source">${escapeHtml(sourceLabel)}</span>` : ''}
        ${visibleTags.map((tag) => `<span class="feed-card-tag">${escapeHtml(formatTag(tag))}</span>`).join('')}
      </div>
    ` : ''}
  `;

  return renderFeedAnchor(item, target, `feed-featured ${config.accent}`, innerHtml);
}

/**
 * Decides where a feed card should lead when clicked:
 *  - 'detail'  -> internal route /feed/:id (full page, kein Modal)
 *  - 'external' -> direct external link, opens in new tab
 *  - 'none'    -> nothing to navigate to (rare; fallback to detail)
 */
function resolveFeedTarget(item) {
  const hasOwnContent = Boolean((item.detailContent || '').trim());
  const url = (item.url || '').trim();

  if (hasOwnContent) {
    return { kind: 'detail', href: '/feed/' + encodeURIComponent(item.id) };
  }
  if (url) {
    return { kind: 'external', href: url, url };
  }
  return { kind: 'detail', href: '/feed/' + encodeURIComponent(item.id) };
}

function renderFeedAnchor(item, target, className, innerHtml) {
  if (target.kind === 'external') {
    return `
      <a class="${className}"
        href="${escapeHtml(target.href)}"
        target="_blank"
        rel="noopener noreferrer"
        data-feed-id="${escapeHtml(item.id)}">
        ${innerHtml}
      </a>
    `;
  }

  return `
    <a class="${className}"
      href="${escapeHtml(target.href)}"
      data-feed-id="${escapeHtml(item.id)}"
      data-feed-internal="1">
      ${innerHtml}
    </a>
  `;
}

function renderFeedCard(item, index) {
  const config = getTypeConfig(item);
  const sourceLabel = formatSourceLabel(item.source);
  const visibleTags = getVisibleTags(item);
  const target = resolveFeedTarget(item);

  const cardContent = `
    ${renderFeedImage(item, 'feed-card-image')}
    <div class="feed-card-body">
      <div class="feed-card-meta">
        <span class="feed-card-type ${config.accent}">
          ${t(config.labelKey)}
        </span>
        <time class="feed-card-time">${formatRelativeTime(item.createdAt)}</time>
      </div>
      <h3 class="feed-card-title">${escapeHtml(item.title)}</h3>
      ${getItemSummary(item) ? `
        <p class="feed-card-text">${linkifyText(escapeHtml(getItemSummary(item)))}</p>
      ` : ''}
      ${sourceLabel || visibleTags.length > 0 ? `
        <div class="feed-card-tags">
          ${sourceLabel ? `<span class="feed-card-tag feed-card-source">${escapeHtml(sourceLabel)}</span>` : ''}
          ${visibleTags.map((tag) => `<span class="feed-card-tag">${escapeHtml(formatTag(tag))}</span>`).join('')}
        </div>
      ` : ''}
      ${target.kind === 'external' ? `
        <span class="feed-card-link">
          ${icon('externalLink', 13)}
          ${extractDomain(target.url)}
        </span>
      ` : ''}
    </div>
  `;

  return renderFeedAnchor(item, target, 'feed-card feed-card-clickable', cardContent);
}

function renderFeedImage(item, className) {
  if (item.imageUrl) {
    const isFeatured = className === 'feed-featured-image';
    return renderResponsiveImage({
      image: item.image,
      src: item.imageUrl,
      className,
      alt: '',
      sizes: isFeatured
        ? '(max-width: 768px) calc(100vw - 32px), 960px'
        : '(max-width: 768px) calc(100vw - 32px), 176px',
      loading: isFeatured ? 'eager' : 'lazy',
      fetchPriority: isFeatured ? 'high' : 'auto',
      includeDimensions: false
    });
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

  const lang = document.documentElement.lang || 'de-DE';
  const isGerman = lang.startsWith('de');

  if (diffMin < 1) return isGerman ? 'Gerade eben' : 'Just now';
  if (diffMin < 60) return isGerman ? `vor ${diffMin} Min.` : `${diffMin}m ago`;
  if (diffH < 24) return isGerman ? `vor ${diffH} Std.` : `${diffH}h ago`;
  if (diffD < 7) return isGerman ? `vor ${diffD} Tag${diffD > 1 ? 'en' : ''}` : `${diffD}d ago`;

  return date.toLocaleDateString(isGerman ? 'de-DE' : 'en-US', {
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
    .map((ptype) => ptype.charAt(0).toUpperCase() + ptype.slice(1))
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

  const sortSelect = container.querySelector('[data-select="feed-sort"]');
  if (sortSelect) {
    bindSelect(sortSelect, (value) => {
      context.setSearchParams?.({ sort: value === 'newest' ? null : value });
    });
  }

  container.querySelectorAll('[data-layout-option]').forEach((button) => {
    button.addEventListener('click', () => {
      context.setSearchParams?.({ layout: button.dataset.layoutOption === 'grid' ? null : button.dataset.layoutOption });
    });
  });

  // Interne Detail-Links: SPA-Navigation; externe Links: nativer Klick.
  container.querySelectorAll('[data-feed-internal="1"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      context.navigateTo?.(anchor.getAttribute('href'));
    });
  });
}

export { render, preload };
