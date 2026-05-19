// ===========================================
// Ressourcen-Grid Komponente
// ===========================================

import * as api from '../services/api-client.js';
import { t } from '../services/i18n.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';

/** @type {string} Aktueller Kategorie-Filter */
let aktuellerFilter = 'alle';

/**
 * Rendert die Ressourcen-Sektion.
 * @param {HTMLElement} container - Ziel-Container
 */
async function rendere(container) {
  const antwort = await api.get('/api/resources');

  if (!antwort.ok || !antwort.daten || antwort.daten.length === 0) {
    container.innerHTML = `
      <div class="leer-zustand">
        <div class="leer-zustand-icon">${icon('bookOpen', 48)}</div>
        <p class="leer-zustand-text">${t('resource.leer')}</p>
      </div>
    `;
    return;
  }

  aktuellerFilter = 'alle';
  rendereInhalt(container, antwort.daten);
}

/**
 * Rendert Filter-Leiste und Karten-Grid.
 * @param {HTMLElement} container - Ziel-Container
 * @param {Array} ressourcen - Alle Ressourcen
 */
function rendereInhalt(container, ressourcen) {
  const kategorien = ['alle', 'tool', 'artikel', 'video', 'tutorial'];

  const gefiltert = aktuellerFilter === 'alle'
    ? ressourcen
    : ressourcen.filter(r => r.kategorie === aktuellerFilter);

  const html = `
    <h1 class="sektion-titel">${t('resource.titel')}</h1>
    <div class="filter-leiste">
      ${kategorien.map(kat => `
        <button class="filter-btn ${kat === aktuellerFilter ? 'aktiv' : ''}"
          data-kategorie="${kat}">
          ${t('resource.' + kat)}
        </button>
      `).join('')}
    </div>
    <div class="karten-grid">
      ${gefiltert.map(r => rendereKarte(r)).join('')}
    </div>
  `;

  container.innerHTML = html;

  // Filter-Events registrieren
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      aktuellerFilter = btn.dataset.kategorie;
      rendereInhalt(container, ressourcen);
    });
  });
}

/**
 * Rendert eine einzelne Ressourcen-Karte.
 * @param {Object} ressource - Ressource-Objekt
 * @returns {string} HTML-String
 */
function rendereKarte(ressource) {
  return `
    <div class="karte">
      <div class="karte-meta">
        <span class="karte-kategorie">${escapeHtml(t('resource.' + ressource.kategorie))}</span>
      </div>
      <h3 class="karte-titel">${escapeHtml(ressource.titel)}</h3>
      ${ressource.beschreibung ? `<p class="karte-text">${escapeHtml(ressource.beschreibung)}</p>` : ''}
      <a href="${escapeHtml(ressource.url)}" target="_blank" rel="noopener noreferrer" class="karte-link">
        ${icon('externalLink', 14)} ${t('resource.oeffnen')}
      </a>
    </div>
  `;
}

export { rendere };
