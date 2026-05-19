// ===========================================
// App Entry-Point - Oeffentliche Seite
// ===========================================

import { initialisiere as initI18n, t, beiSprachwechsel, wechsleSprache, holeSprache } from './services/i18n.js';
import { icon } from './components/icons.js';
import * as newsFeed from './components/news-feed.js';
import * as feedbackSektion from './components/feedback-sektion.js';
import * as resourceGrid from './components/resource-grid.js';

/** @type {string} Aktuell aktiver Tab */
let aktiverTab = 'neuigkeiten';

/** @type {boolean} Verhindert doppeltes Rendern */
let rendertGerade = false;

/** @type {Object} Tab-Konfiguration mit Icon-Zuordnung */
const TABS = {
  neuigkeiten: { rendere: newsFeed.rendere, icon: 'megaphone' },
  feedback: { rendere: feedbackSektion.rendere, icon: 'messageSquare' },
  ressourcen: { rendere: resourceGrid.rendere, icon: 'bookOpen' }
};

/** @type {Object} Cache fuer bereits geladene Tab-Inhalte */
const tabInhaltCache = {};

/**
 * Initialisiert die Anwendung.
 */
async function starte() {
  try {
    await initI18n();
  } catch (e) {
    console.error('i18n Initialisierung fehlgeschlagen:', e);
  }

  erstelleTabContainer();
  rendereNavigation();
  await ladeTab(aktiverTab);

  // Bei Sprachwechsel Labels aktualisieren, Inhalt neu laden
  beiSprachwechsel(async () => {
    aktualisiereNavLabels();
    // Tab-Cache invalidieren und aktuellen Tab neu laden
    Object.keys(tabInhaltCache).forEach(k => { tabInhaltCache[k] = false; });
    await ladeTab(aktiverTab);
  });
}

/**
 * Erstellt die Tab-Container-Elemente (einmalig).
 * Verwendet display:none/block statt innerHTML-Ersatz.
 */
function erstelleTabContainer() {
  const hauptinhalt = document.getElementById('hauptinhalt');
  if (!hauptinhalt) return;

  hauptinhalt.innerHTML = '';

  Object.keys(TABS).forEach(key => {
    const sektion = document.createElement('section');
    sektion.id = 'tab-' + key;
    sektion.className = 'sektion';
    if (key === aktiverTab) sektion.classList.add('aktiv');
    hauptinhalt.appendChild(sektion);
  });
}

/**
 * Rendert die Tab-Navigation (einmalig, dann nur Labels aktualisieren).
 */
function rendereNavigation() {
  const navContainer = document.getElementById('tab-navigation');
  if (!navContainer) return;

  const tabKeys = Object.keys(TABS);
  const html = tabKeys.map(key => `
    <button class="tab-link ${key === aktiverTab ? 'aktiv' : ''}"
      data-tab="${key}" aria-selected="${key === aktiverTab}">
      <span class="tab-icon">${icon(TABS[key].icon, 18)}</span>
      <span class="tab-label">${t('nav.' + key)}</span>
    </button>
  `).join('');

  const sprachwechselHtml = `
    <button class="sprach-wechsel" id="sprach-btn" title="${t('nav.sprache')}">
      ${icon('globe', 16)}
      <span>${holeSprache() === 'de' ? 'EN' : 'DE'}</span>
    </button>
  `;

  navContainer.innerHTML = html + sprachwechselHtml;

  // Tab-Click Events
  navContainer.querySelectorAll('.tab-link').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === aktiverTab) return;
      wechsleTab(btn.dataset.tab);
    });
  });

  // Sprachwechsel
  const sprachBtn = document.getElementById('sprach-btn');
  if (sprachBtn) {
    sprachBtn.addEventListener('click', async () => {
      sprachBtn.disabled = true;
      await wechsleSprache();
      sprachBtn.disabled = false;
    });
  }
}

/**
 * Aktualisiert nur die Tab-Labels (bei Sprachwechsel).
 */
function aktualisiereNavLabels() {
  const navContainer = document.getElementById('tab-navigation');
  if (!navContainer) return;

  navContainer.querySelectorAll('.tab-link').forEach(btn => {
    const key = btn.dataset.tab;
    const label = btn.querySelector('.tab-label');
    if (label) label.textContent = t('nav.' + key);
  });

  const sprachBtn = document.getElementById('sprach-btn');
  if (sprachBtn) {
    const span = sprachBtn.querySelector('span');
    if (span) span.textContent = holeSprache() === 'de' ? 'EN' : 'DE';
  }
}

/**
 * Wechselt den aktiven Tab (sofortige CSS-Klassen-Umschaltung).
 * @param {string} neuerTab - Tab-Key
 */
async function wechsleTab(neuerTab) {
  if (neuerTab === aktiverTab) return;

  // Alten Tab ausblenden
  const alterContainer = document.getElementById('tab-' + aktiverTab);
  if (alterContainer) alterContainer.classList.remove('aktiv');

  // Navigation aktualisieren
  const navContainer = document.getElementById('tab-navigation');
  if (navContainer) {
    navContainer.querySelectorAll('.tab-link').forEach(btn => {
      const istAktiv = btn.dataset.tab === neuerTab;
      btn.classList.toggle('aktiv', istAktiv);
      btn.setAttribute('aria-selected', istAktiv);
    });
  }

  aktiverTab = neuerTab;

  // Neuen Tab einblenden
  const neuerContainer = document.getElementById('tab-' + neuerTab);
  if (neuerContainer) neuerContainer.classList.add('aktiv');

  // Inhalt laden falls noch nicht gecacht
  await ladeTab(neuerTab);
}

/**
 * Laedt den Inhalt eines Tabs (einmal, dann gecacht).
 * @param {string} tabKey - Tab-Key
 */
async function ladeTab(tabKey) {
  if (rendertGerade) return;
  rendertGerade = true;

  try {
    const container = document.getElementById('tab-' + tabKey);
    const tab = TABS[tabKey];
    if (!container || !tab) return;

    if (!tabInhaltCache[tabKey]) {
      await tab.rendere(container);
      tabInhaltCache[tabKey] = true;
    }
  } finally {
    rendertGerade = false;
  }
}

// App starten wenn DOM bereit
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', starte);
} else {
  starte();
}
