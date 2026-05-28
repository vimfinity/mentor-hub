'use strict';

const SUPPORTED_LOCALES = ['de-DE', 'en-US'];
const DEFAULT_LOCALE = 'de-DE';

function normalizeLocale(locale) {
  const value = String(locale || '').trim();
  if (SUPPORTED_LOCALES.includes(value)) {
    return value;
  }

  const lower = value.toLowerCase();
  if (lower === 'de' || lower === 'de-de') return 'de-DE';
  if (lower === 'en' || lower === 'en-us') return 'en-US';

  return DEFAULT_LOCALE;
}

function getFallbackLocales(locale) {
  const normalized = normalizeLocale(locale);
  return normalized === 'de-DE'
    ? ['de-DE', 'de', 'en-US', 'en']
    : ['en-US', 'en', 'de-DE', 'de'];
}

function isLocalizedValue(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && SUPPORTED_LOCALES.some((locale) => typeof value[locale] === 'string' || typeof value[locale.slice(0, 2)] === 'string');
}

function resolveLocalizedValue(value, locale = DEFAULT_LOCALE) {
  if (isLocalizedValue(value)) {
    const fallbacks = getFallbackLocales(locale);
    for (const key of fallbacks) {
      const translated = value[key];
      if (typeof translated === 'string' && translated.trim().length > 0) {
        return translated;
      }
    }
    return '';
  }

  return typeof value === 'string' ? value : '';
}

function toLocalizedValue(value, locale = DEFAULT_LOCALE) {
  if (isLocalizedValue(value)) {
    return {
      'de-DE': value['de-DE'] ?? value.de ?? '',
      'en-US': value['en-US'] ?? value.en ?? ''
    };
  }

  const text = typeof value === 'string' ? value : '';
  return {
    [normalizeLocale(locale)]: text,
    [normalizeLocale(locale) === 'de-DE' ? 'en-US' : 'de-DE']: ''
  };
}

function trimLocalizedValue(value) {
  if (isLocalizedValue(value)) {
    return {
      'de-DE': String(value['de-DE'] ?? value.de ?? '').trim(),
      'en-US': String(value['en-US'] ?? value.en ?? '').trim()
    };
  }

  return typeof value === 'string' ? value.trim() : '';
}

function hasLocalizedText(value) {
  return resolveLocalizedValue(value, 'de-DE').trim().length > 0
    || resolveLocalizedValue(value, 'en-US').trim().length > 0;
}

function localizedLength(value) {
  if (isLocalizedValue(value)) {
    return Math.max(
      String(value['de-DE'] ?? value.de ?? '').length,
      String(value['en-US'] ?? value.en ?? '').length
    );
  }

  return typeof value === 'string' ? value.length : 0;
}

module.exports = {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  normalizeLocale,
  resolveLocalizedValue,
  toLocalizedValue,
  trimLocalizedValue,
  hasLocalizedText,
  localizedLength
};
