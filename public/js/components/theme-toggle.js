// ===========================================
// Theme Toggle - Light/Dark Mode Umschaltung
// ===========================================

import { icon } from './icons.js';

/** @type {string} */
const SPEICHER_KEY = 'theme-preference';

/**
 * Ermittelt die aktuelle Theme-Praeferenz.
 * @returns {'light'|'dark'}
 */
function holeTheme() {
  const gespeichert = localStorage.getItem(SPEICHER_KEY);
  if (gespeichert === 'light' || gespeichert === 'dark') {
    return gespeichert;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Wendet das Theme auf das Dokument an.
 * @param {'light'|'dark'} theme
 */
function wendeThemeAn(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Wechselt zwischen Light und Dark Mode.
 * @returns {'light'|'dark'} Das neue Theme
 */
function wechsleTheme() {
  const aktuell = holeTheme();
  const neu = aktuell === 'dark' ? 'light' : 'dark';
  localStorage.setItem(SPEICHER_KEY, neu);
  wendeThemeAn(neu);
  return neu;
}

/**
 * Gibt das HTML fuer den Theme-Toggle-Button zurueck.
 * @returns {string}
 */
function renderThemeToggle() {
  const theme = holeTheme();
  const iconName = theme === 'dark' ? 'sun' : 'moon';
  return `<button class="theme-toggle" id="theme-toggle" title="Theme wechseln">${icon(iconName, 16)}</button>`;
}

/**
 * Initialisiert das Theme beim Seitenstart.
 */
function initTheme() {
  wendeThemeAn(holeTheme());
}

/**
 * Bindet den Click-Handler an den Toggle-Button.
 */
function bindeThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) {
    return;
  }
  btn.addEventListener('click', () => {
    const neuesTheme = wechsleTheme();
    const iconName = neuesTheme === 'dark' ? 'sun' : 'moon';
    btn.innerHTML = icon(iconName, 16);
  });
}

export { renderThemeToggle, bindeThemeToggle, initTheme };
