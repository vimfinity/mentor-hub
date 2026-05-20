import * as api from '../services/api-client.js';
import { holeAbfrage } from '../services/query-cache.js';
import { t } from '../services/i18n.js';
import { normalisiereAuswahl, paginiereElemente } from '../services/view-state.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';
import { renderListensteuerung, verbindeListensteuerung } from './list-controls.js';

const NEWS_CACHE_KEY = ['news'];
const NEWS_CACHE_TTL_MS = 60 * 1000;
const VALID_SORTS = ['newest', 'oldest', 'title-asc', 'title-desc'];
const NEWS_PRO_SEITE = 5;

async function render(container, context = {}) {
  const response = await holeAbfrage({
    schluessel: NEWS_CACHE_KEY,
    abrufFunktion: () => api.get('/api/news'),
    ttlMs: NEWS_CACHE_TTL_MS
  });

  if (!response.ok || !response.data || response.data.length === 0) {
    container.innerHTML = `
      <div class="leer-zustand">
        <div class="leer-zustand-icon">${icon('newspaper', 48)}</div>
        <p class="leer-zustand-text">${t('news.empty')}</p>
      </div>
    `;
    return;
  }

  const aktuelleSortierung = normalisiereAuswahl(context.searchParams?.get('sort'), VALID_SORTS, 'newest');
  const sortierteEintraege = sortiereEintraege(response.data, aktuelleSortierung);
  const pagination = paginiereElemente(sortierteEintraege, context.searchParams?.get('page'), NEWS_PRO_SEITE);
  const sortierOptionen = [
    { value: 'newest', label: t('general.sortNewest') },
    { value: 'oldest', label: t('general.sortOldest') },
    { value: 'title-asc', label: t('general.sortTitleAsc') },
    { value: 'title-desc', label: t('general.sortTitleDesc') }
  ];

  const html = `
    <h1 class="sektion-titel">${t('news.title')}</h1>
    ${renderListensteuerung({
      sortierOptionen,
      aktuelleSortierung,
      aktuelleSeite: pagination.aktuelleSeite,
      gesamtSeiten: pagination.gesamtSeiten,
      gesamtElemente: pagination.gesamtElemente,
      ergebnisLabel: t('general.resultsCount').replace('{count}', String(pagination.gesamtElemente))
    })}
    <div class="news-liste">
      ${pagination.elemente.map((entry) => renderEntry(entry)).join('')}
    </div>
  `;

  container.innerHTML = html;

  verbindeListensteuerung(container, {
    onSortierung: (sortierung) => {
      const normalisierteSortierung = normalisiereAuswahl(sortierung, VALID_SORTS, 'newest');
      context.setSearchParams?.({ sort: normalisierteSortierung === 'newest' ? null : normalisierteSortierung, page: null });
    },
    onSeite: (seite) => {
      context.setSearchParams?.({ page: seite <= 1 ? null : seite });
    }
  });
}

function preload() {
  return holeAbfrage({
    schluessel: NEWS_CACHE_KEY,
    abrufFunktion: () => api.get('/api/news'),
    ttlMs: NEWS_CACHE_TTL_MS
  });
}

function renderEntry(entry) {
  const locale = document.documentElement.lang === 'de' ? 'de-DE' : 'en-US';
  const date = new Date(entry.createdAt).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return `
    <article class="news-eintrag">
      <time class="news-datum">${date}</time>
      <h2 class="news-titel">${escapeHtml(entry.title)}</h2>
      <p class="news-inhalt">${escapeHtml(entry.content)}</p>
    </article>
  `;
}

function sortiereEintraege(entries, sortierung) {
  const kopie = [...entries];

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

export { render, preload };
