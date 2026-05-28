import * as api from '../services/api-client.js';
import { fetchQuery } from '../services/query-cache.js';
import { t, getLocale } from '../services/i18n.js';
import { normalizeSelection, paginateItems } from '../services/view-state.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';
import { renderListControls, bindListControls } from './list-controls.js';

const NEWS_CACHE_KEY = ['news'];
const NEWS_CACHE_TTL_MS = 60 * 1000;
const VALID_SORTS = ['newest', 'oldest', 'title-asc', 'title-desc'];
const NEWS_PER_PAGE = 5;

async function render(container, context = {}) {
  const response = await fetchQuery({
    key: [...NEWS_CACHE_KEY, getLocale()],
    fetchFunction: () => api.get('/api/news'),
    ttlMs: NEWS_CACHE_TTL_MS
  });

  if (!response.ok || !response.data || response.data.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon('newspaper', 48)}</div>
        <p class="empty-state-text">${t('news.empty')}</p>
      </div>
    `;
    return;
  }

  const currentSort = normalizeSelection(context.searchParams?.get('sort'), VALID_SORTS, 'newest');
  const sortedEntries = sortEntries(response.data, currentSort);
  const pagination = paginateItems(sortedEntries, context.searchParams?.get('page'), NEWS_PER_PAGE);
  const sortOptions = [
    { value: 'newest', label: t('general.sortNewest') },
    { value: 'oldest', label: t('general.sortOldest') },
    { value: 'title-asc', label: t('general.sortTitleAsc') },
    { value: 'title-desc', label: t('general.sortTitleDesc') }
  ];

  const html = `
    <h1 class="section-title">${t('news.title')}</h1>
    ${renderListControls({
      sortOptions,
      currentSort,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems,
      resultLabel: t('general.resultsCount').replace('{count}', String(pagination.totalItems))
    })}
    <div class="news-list">
      ${pagination.items.map((entry) => renderEntry(entry)).join('')}
    </div>
  `;

  container.innerHTML = html;

  bindListControls(container, {
    onSort: (sortOrder) => {
      const normalisierteSortierung = normalizeSelection(sortOrder, VALID_SORTS, 'newest');
      context.setSearchParams?.({ sort: normalisierteSortierung === 'newest' ? null : normalisierteSortierung, page: null });
    },
    onPage: (page) => {
      context.setSearchParams?.({ page: page <= 1 ? null : page });
    }
  });
}

function preload() {
  return fetchQuery({
    key: [...NEWS_CACHE_KEY, getLocale()],
    fetchFunction: () => api.get('/api/news'),
    ttlMs: NEWS_CACHE_TTL_MS
  });
}

function renderEntry(entry) {
  const locale = document.documentElement.lang.startsWith('de') ? 'de-DE' : 'en-US';
  const date = new Date(entry.createdAt).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return `
    <article class="news-entry">
      <time class="news-date">${date}</time>
      <h2 class="news-title">${escapeHtml(entry.title)}</h2>
      <p class="news-content">${escapeHtml(entry.content)}</p>
    </article>
  `;
}

function sortEntries(entries, sortOrder) {
  const copy = [...entries];

  copy.sort((left, right) => {
    switch (sortOrder) {
      case 'oldest':
        return new Date(left.createdAt || 0) - new Date(right.createdAt || 0);
      case 'title-asc':
        return left.title.localeCompare(right.title, document.documentElement.lang);
      case 'title-desc':
        return right.title.localeCompare(left.title, document.documentElement.lang);
      case 'newest':
      default:
        return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
    }
  });

  return copy;
}

export { render, preload };
