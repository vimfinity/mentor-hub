let translations = {};
let currentLocale = 'de-DE';
const languageListeners = [];
const SUPPORTED_LOCALES = ['de-DE', 'en-US'];

function normalizeLocale(value) {
  const locale = String(value || '').trim();
  if (SUPPORTED_LOCALES.includes(locale)) {
    return locale;
  }

  const lower = locale.toLowerCase();
  if (lower === 'de' || lower === 'de-de') return 'de-DE';
  if (lower === 'en' || lower === 'en-us') return 'en-US';
  return 'de-DE';
}

function getLocaleFromPath(pathname = window.location.pathname) {
  const segment = String(pathname || '').split('/').filter(Boolean)[0];
  return SUPPORTED_LOCALES.includes(segment) ? segment : null;
}

function getLanguageFromLocale(locale) {
  return normalizeLocale(locale).slice(0, 2);
}

async function loadLanguage(language) {
  const locale = normalizeLocale(language);
  const baseLanguage = getLanguageFromLocale(locale);
  const response = await fetch('/api/i18n/' + locale);
  if (!response.ok) {
    throw new Error('Failed to load locale: ' + locale);
  }

  translations = await response.json();
  currentLocale = locale;

  try {
    localStorage.setItem('mentor-hub-language', baseLanguage);
    localStorage.setItem('mentor-hub-locale', locale);
  } catch (error) {
    // Ignore localStorage access failures.
  }

  languageListeners.forEach((listener) => listener(baseLanguage, locale));
}

function t(key) {
  const ptypes = key.split('.');
  let value = translations;

  for (const ptype of ptypes) {
    if (value && typeof value === 'object' && ptype in value) {
      value = value[ptype];
    } else {
      return key;
    }
  }

  return typeof value === 'string' ? value : key;
}

async function toggleLanguage() {
  const nextLanguage = getLanguage() === 'de' ? 'en-US' : 'de-DE';
  await loadLanguage(nextLanguage);
}

function getLanguage() {
  return getLanguageFromLocale(currentLocale);
}

function getLocale() {
  return currentLocale;
}

function onLanguageChange(listener) {
  languageListeners.push(listener);
}

async function initI18n() {
  let storedLanguage = getLocaleFromPath() || 'de-DE';
  try {
    storedLanguage = getLocaleFromPath()
      || localStorage.getItem('mentor-hub-locale')
      || localStorage.getItem('mentor-hub-language')
      || 'de-DE';
  } catch (error) {
    // Ignore localStorage access failures.
  }

  await loadLanguage(storedLanguage);
}

export { t, toggleLanguage, getLanguage, getLocale, getLocaleFromPath, normalizeLocale, onLanguageChange, initI18n };
