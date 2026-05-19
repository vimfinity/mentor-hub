let translations = {};
let currentLanguage = 'de';
const languageListeners = [];

async function loadLanguage(language) {
  const response = await fetch('/api/i18n/' + language);
  if (!response.ok) {
    throw new Error('Failed to load locale: ' + language);
  }

  translations = await response.json();
  currentLanguage = language;

  try {
    localStorage.setItem('mentor-hub-language', language);
  } catch (error) {
    // Ignore localStorage access failures.
  }

  languageListeners.forEach((listener) => listener(language));
}

function t(key) {
  const parts = key.split('.');
  let value = translations;

  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return key;
    }
  }

  return typeof value === 'string' ? value : key;
}

async function toggleLanguage() {
  const nextLanguage = currentLanguage === 'de' ? 'en' : 'de';
  await loadLanguage(nextLanguage);
}

function getLanguage() {
  return currentLanguage;
}

function onLanguageChange(listener) {
  languageListeners.push(listener);
}

async function initI18n() {
  let storedLanguage = 'de';
  try {
    storedLanguage = localStorage.getItem('mentor-hub-language') || 'de';
  } catch (error) {
    // Ignore localStorage access failures.
  }

  await loadLanguage(storedLanguage);
}

export { t, toggleLanguage, getLanguage, onLanguageChange, initI18n };
