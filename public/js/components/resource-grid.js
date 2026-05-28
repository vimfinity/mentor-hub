import * as api from '../services/api-client.js';
import { fetchQuery } from '../services/query-cache.js';
import { t } from '../services/i18n.js';
import { normalizeSelection, paginateItems } from '../services/view-state.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';
import { renderListControls, bindListControls } from './list-controls.js';

let currentFilter = 'all';
let currentSort = 'newest';

const RESOURCES_CACHE_KEY = ['resources'];
const RESOURCES_CACHE_TTL_MS = 5 * 60 * 1000;
const VALID_FILTERS = ['all', 'tool', 'article', 'video', 'tutorial'];
const VALID_SORTS = ['newest', 'oldest', 'title-asc', 'title-desc'];
const RESOURCES_PER_PAGE = 6;

async function render(container, context = {}) {
  const response = await fetchQuery({
    key: RESOURCES_CACHE_KEY,
    fetchFunction: () => api.get('/api/resources'),
    ttlMs: RESOURCES_CACHE_TTL_MS
  });

  if (!response.ok || !response.data || response.data.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${icon('bookOpen', 48)}</div>
        <p class="empty-state-text">${t('resource.empty')}</p>
      </div>
    `;
    return;
  }

  currentFilter = normalizeFilter(context.searchParams?.get('filter'));
  currentSort = normalizeSelection(context.searchParams?.get('sort'), VALID_SORTS, 'newest');
  renderContent(container, response.data, context);
}

function renderContent(container, resources, context = {}) {
  const categories = VALID_FILTERS;
  const sortOptions = [
    { value: 'newest', label: t('general.sortNewest') },
    { value: 'oldest', label: t('general.sortOldest') },
    { value: 'title-asc', label: t('general.sortTitleAsc') },
    { value: 'title-desc', label: t('general.sortTitleDesc') }
  ];

  const filteredResources = currentFilter === 'all'
    ? resources
    : resources.filter((resource) => resource.category === currentFilter);
  const sortedResources = sortResources(filteredResources, currentSort);
  const pagination = paginateItems(sortedResources, context.searchParams?.get('page'), RESOURCES_PER_PAGE);

  const html = `
    <h1 class="section-title">${t('resource.title')}</h1>
    <div class="filter-bar">
      ${categories.map((category) => `
        <button class="filter-btn ${category === currentFilter ? 'active' : ''}"
          data-category="${category}">
          ${t('resource.' + category)}
        </button>
      `).join('')}
    </div>
    ${renderListControls({
      sortOptions,
      currentSort: currentSort,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems,
      resultLabel: t('general.resultsCount').replace('{count}', String(pagination.totalItems))
    })}
    <div class="card-grid">
      ${pagination.items.map((resource) => renderCard(resource)).join('')}
    </div>
  `;

  container.innerHTML = html;

  container.querySelectorAll('.filter-btn').forEach((button) => {
    button.addEventListener('click', () => {
      currentFilter = button.dataset.category;
      if (context.setSearchParams) {
        context.setSearchParams({
          filter: currentFilter === 'all' ? null : currentFilter,
          page: null
        });
        return;
      }
      renderContent(container, resources, context);
    });
  });

  bindListControls(container, {
    onSort: (sortOrder) => {
      currentSort = normalizeSelection(sortOrder, VALID_SORTS, 'newest');
      context.setSearchParams?.({ sort: currentSort === 'newest' ? null : currentSort, page: null });
      renderContent(container, resources, context);
    },
    onPage: (page) => {
      context.setSearchParams?.({ page: page <= 1 ? null : page });
      renderContent(container, resources, context);
    }
  });
}

function normalizeFilter(filter) {
  return VALID_FILTERS.includes(filter) ? filter : 'all';
}

function preload() {
  return fetchQuery({
    key: RESOURCES_CACHE_KEY,
    fetchFunction: () => api.get('/api/resources'),
    ttlMs: RESOURCES_CACHE_TTL_MS
  });
}

function sortResources(resources, sortOrder) {
  const copy = [...resources];

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

function renderCard(resource) {
  return `
    <div class="card">
      <div class="card-meta">
        <span class="card-category">${escapeHtml(t('resource.' + resource.category))}</span>
      </div>
      <h3 class="card-title">${escapeHtml(resource.title)}</h3>
      ${resource.description ? `<p class="card-text">${escapeHtml(resource.description)}</p>` : ''}
      <a href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer" class="card-link">
        ${icon('externalLink', 14)} ${t('resource.open')}
      </a>
    </div>
  `;
}

export { render, preload };
