// ===========================================
// News-Feed Komponente
// ===========================================

import * as api from '../services/api-client.js';
import { t } from '../services/i18n.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';

/**
 * Rendert die News-Sektion.
 * @param {HTMLElement} container - Ziel-Container
 */
async function rendere(container) {
  const antwort = await api.get('/api/news');

  if (!antwort.ok || !antwort.daten || antwort.daten.length === 0) {
    container.innerHTML = `
      <div class="leer-zustand">
        <div class="leer-zustand-icon">${icon('newspaper', 48)}</div>
        <p class="leer-zustand-text">${t('news.leer')}</p>
      </div>
    `;
    return;
  }

  const html = `
    <h1 class="sektion-titel">${t('news.titel')}</h1>
    <div class="news-liste">
      ${antwort.daten.map(eintrag => rendereEintrag(eintrag)).join('')}
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Rendert einen einzelnen News-Eintrag.
 * @param {Object} eintrag - News-Objekt
 * @returns {string} HTML-String
 */
function rendereEintrag(eintrag) {
  const datum = new Date(eintrag.erstelltAm).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return `
    <article class="news-eintrag">
      <time class="news-datum">${datum}</time>
      <h2 class="news-titel">${escapeHtml(eintrag.titel)}</h2>
      <p class="news-inhalt">${escapeHtml(eintrag.inhalt)}</p>
    </article>
  `;
}

export { rendere };
