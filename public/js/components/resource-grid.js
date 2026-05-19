import * as api from '../services/api-client.js';
import { holeAbfrage } from '../services/query-cache.js';
import { t } from '../services/i18n.js';
import { normalisiereAuswahl, paginiereElemente } from '../services/view-state.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';
import { renderListensteuerung, verbindeListensteuerung } from './list-controls.js';

let currentFilter = 'all';
let currentSort = 'newest';

const RESSOURCEN_CACHE_KEY = ['resources'];
const RESSOURCEN_CACHE_TTL_MS = 5 * 60 * 1000;
const VALID_FILTERS = ['all', 'tool', 'article', 'video', 'tutorial'];
const VALID_SORTS = ['newest', 'oldest', 'title-asc', 'title-desc'];
const RESSOURCEN_PRO_SEITE = 6;

async function render(container, context = {}) {
  const response = await holeAbfrage({
    schluessel: RESSOURCEN_CACHE_KEY,
    abrufFunktion: () => api.get('/api/resources'),
    ttlMs: RESSOURCEN_CACHE_TTL_MS
  });

  if (!response.ok || !response.data || response.data.length === 0) {
    container.innerHTML = `
      <div class="leer-zustand">
        <div class="leer-zustand-icon">${icon('bookOpen', 48)}</div>
        <p class="leer-zustand-text">${t('resource.empty')}</p>
      </div>
    `;
    return;
  }

  currentFilter = normalisiereFilter(context.suchparameter?.get('filter'));
  currentSort = normalisiereAuswahl(context.suchparameter?.get('sort'), VALID_SORTS, 'newest');
  renderContent(container, response.data, context);
}

function renderContent(container, resources, context = {}) {
  const categories = VALID_FILTERS;
  const sortierOptionen = [
    { value: 'newest', label: t('general.sortNewest') },
    { value: 'oldest', label: t('general.sortOldest') },
    { value: 'title-asc', label: t('general.sortTitleAsc') },
    { value: 'title-desc', label: t('general.sortTitleDesc') }
  ];

  const filteredResources = currentFilter === 'all'
    ? resources
    : resources.filter((resource) => resource.category === currentFilter);
  const sortierteRessourcen = sortiereRessourcen(filteredResources, currentSort);
  const pagination = paginiereElemente(sortierteRessourcen, context.suchparameter?.get('page'), RESSOURCEN_PRO_SEITE);

  const html = `
    <h1 class="sektion-titel">${t('resource.title')}</h1>
    <div class="filter-leiste">
      ${categories.map((category) => `
        <button class="filter-btn ${category === currentFilter ? 'aktiv' : ''}"
          data-category="${category}">
          ${t('resource.' + category)}
        </button>
      `).join('')}
    </div>
    ${renderListensteuerung({
      sortierOptionen,
      aktuelleSortierung: currentSort,
      aktuelleSeite: pagination.aktuelleSeite,
      gesamtSeiten: pagination.gesamtSeiten,
      gesamtElemente: pagination.gesamtElemente,
      ergebnisLabel: t('general.resultsCount').replace('{count}', String(pagination.gesamtElemente))
    })}
    <div class="karten-grid">
      ${pagination.elemente.map((resource) => renderCard(resource)).join('')}
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

  verbindeListensteuerung(container, {
    onSortierung: (sortierung) => {
      currentSort = normalisiereAuswahl(sortierung, VALID_SORTS, 'newest');
      context.setSearchParams?.({ sort: currentSort === 'newest' ? null : currentSort, page: null });
      renderContent(container, resources, context);
    },
    onSeite: (seite) => {
      context.setSearchParams?.({ page: seite <= 1 ? null : seite });
      renderContent(container, resources, context);
    }
  });
}

function normalisiereFilter(filter) {
  return VALID_FILTERS.includes(filter) ? filter : 'all';
}

function preload() {
  return holeAbfrage({
    schluessel: RESSOURCEN_CACHE_KEY,
    abrufFunktion: () => api.get('/api/resources'),
    ttlMs: RESSOURCEN_CACHE_TTL_MS
  });
}

function sortiereRessourcen(resources, sortierung) {
  const kopie = [...resources];

  kopie.sort((links, rechts) => {
    switch (sortierung) {
      case 'oldest':
        return new Date(links.createdAt || 0) - new Date(rechts.createdAt || 0);
      case 'title-asc':
        return links.title.localeCompare(rechts.title, document.documentElement.lang);
      case 'title-desc':
        return rechts.title.localeCompare(links.title, document.documentElement.lang);
      case 'newest':
      default:
        return new Date(rechts.createdAt || 0) - new Date(links.createdAt || 0);
    }
  });

  return kopie;
}

function renderCard(resource) {
  return `
    <div class="karte">
      <div class="karte-meta">
        <span class="karte-kategorie">${escapeHtml(t('resource.' + resource.category))}</span>
      </div>
      <h3 class="karte-titel">${escapeHtml(resource.title)}</h3>
      ${resource.description ? `<p class="karte-text">${escapeHtml(resource.description)}</p>` : ''}
      <a href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer" class="karte-link">
        ${icon('externalLink', 14)} ${t('resource.open')}
      </a>
    </div>
  `;
}

export { render, preload };
