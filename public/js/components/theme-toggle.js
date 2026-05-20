import { icon } from './icons.js';

/** @type {string} */
const STORAGE_KEY = 'theme-preference';

/**
 * Returns the current theme preference.
 * @returns {'light'|'dark'}
 */
function getTheme() {
  const storedTheme = localStorage.getItem(STORAGE_KEY);
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Applies the theme to the document.
 * @param {'light'|'dark'} theme
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Toggles between light and dark mode.
 * @returns {'light'|'dark'} The new theme
 */
function toggleTheme() {
  const currentTheme = getTheme();
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
  return nextTheme;
}

/**
 * Returns the theme toggle button markup.
 * @returns {string}
 */
function renderThemeToggle() {
  const theme = getTheme();
  const iconName = theme === 'dark' ? 'sun' : 'moon';
  return `<button class="theme-toggle" id="theme-toggle" title="Toggle theme">${icon(iconName, 16)}</button>`;
}

/**
 * Initializes the theme on page load.
 */
function initTheme() {
  applyTheme(getTheme());
}

/**
 * Binds the click handler to the toggle button.
 */
function bindThemeToggle() {
  const button = document.getElementById('theme-toggle');
  if (!button) {
    return;
  }

  button.addEventListener('click', () => {
    const nextTheme = toggleTheme();
    const iconName = nextTheme === 'dark' ? 'sun' : 'moon';
    button.innerHTML = icon(iconName, 16);
  });
}

export { renderThemeToggle, bindThemeToggle, initTheme };
