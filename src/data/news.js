'use strict';

const store = require('./store');
const {
  DEFAULT_LOCALE,
  resolveLocalizedValue,
  toLocalizedValue,
  trimLocalizedValue
} = require('./localization');

const FILE_NAME = 'news.json';

function normalizeNewsItem(item, locale = DEFAULT_LOCALE) {
  const normalizedType = normalizeType(item.type || 'announcement');
  const title = item.title || '';
  const content = item.content || '';
  const detailContent = item.detailContent || item.content || '';
  const summary = item.summary || item.content || '';
  return {
    id: item.id,
    title: resolveLocalizedValue(title, locale),
    titleLocalized: toLocalizedValue(title),
    content: resolveLocalizedValue(content, locale),
    contentLocalized: toLocalizedValue(content),
    detailContent: resolveLocalizedValue(detailContent, locale),
    detailContentLocalized: toLocalizedValue(detailContent),
    imageUrl: item.imageUrl || item.thumbnailUrl || '',
    url: item.url || '',
    type: normalizedType,
    kind: 'update',
    subtype: normalizedType,
    summary: resolveLocalizedValue(summary, locale),
    summaryLocalized: toLocalizedValue(summary),
    source: item.source || detectSource(item.url || ''),
    tags: normalizeTags(item.tags, normalizedType),
    featured: item.featured || false,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || null
  };
}

function normalizeType(type) {
  const normalized = String(type || '').toLowerCase();

  if (normalized === 'news') return 'announcement';
  return normalized || 'announcement';
}

function normalizeTags(tags, fallbackType) {
  const values = Array.isArray(tags)
    ? tags
    : typeof tags === 'string'
      ? tags.split(',')
      : [];

  const normalized = values
    .map((tag) => String(tag || '').trim().toLowerCase())
    .filter(Boolean);

  if (fallbackType && !normalized.includes(fallbackType)) {
    normalized.unshift(fallbackType);
  }

  return Array.from(new Set(normalized));
}

function detectSource(url) {
  if (!url) {
    return 'internal';
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname.includes('openai.com') || hostname.includes('chatgpt.com')) return 'openai';
    if (hostname.includes('anthropic.com') || hostname.includes('claude.com')) return 'anthropic';
    if (hostname.includes('google.') || hostname.includes('deepmind.google')) return 'google';
    if (hostname.includes('github.com')) return 'github';
    if (hostname.includes('modelcontextprotocol.io')) return 'mcp';

    return hostname.replace(/^www\./, '');
  } catch (error) {
    return 'external';
  }
}

function loadNewsItems(locale = DEFAULT_LOCALE) {
  return store.readDataFile(FILE_NAME).map((item) => normalizeNewsItem(item, locale));
}

/**
 * Returns all news items sorted by newest first.
 * @returns {Array} News list
 */
function getAll(locale = DEFAULT_LOCALE) {
  const newsItems = loadNewsItems(locale);
  return newsItems.sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Creates a new news item.
 * @param {Object} data - News payload
 * @returns {Object} Created news item
 */
function create(data) {
  const newsItem = {
    title: trimLocalizedValue(data.title),
    content: trimLocalizedValue(data.content || ''),
    detailContent: trimLocalizedValue(data.detailContent || data.content || ''),
    imageUrl: data.imageUrl || '',
    url: data.url || '',
    type: data.type || 'announcement',
    subtype: data.subtype || data.type || 'announcement',
    summary: trimLocalizedValue(data.summary || data.content || ''),
    source: data.source || detectSource(data.url || ''),
    tags: normalizeTags(data.tags, data.type || 'announcement'),
    featured: data.featured || false,
    createdAt: data.createdAt || new Date().toISOString()
  };
  return store.addItem(FILE_NAME, newsItem);
}

/**
 * Updates a news item.
 * @param {string} id - News id
 * @param {Object} changes - Fields to update
 * @returns {Object|null} Updated news item or null
 */
function update(id, changes) {
  const filteredChanges = {};

  if (changes.title !== undefined) {
    filteredChanges.title = trimLocalizedValue(changes.title);
  }
  if (changes.content !== undefined) {
    filteredChanges.content = trimLocalizedValue(changes.content);
  }
  if (changes.detailContent !== undefined) {
    filteredChanges.detailContent = trimLocalizedValue(changes.detailContent);
  }
  if (changes.imageUrl !== undefined || changes.thumbnailUrl !== undefined) {
    filteredChanges.imageUrl = changes.imageUrl !== undefined
      ? changes.imageUrl
      : changes.thumbnailUrl;
  }
  if (changes.url !== undefined) {
    filteredChanges.url = changes.url;
  }
  if (changes.type !== undefined) {
    filteredChanges.type = changes.type;
  }
  if (changes.subtype !== undefined) {
    filteredChanges.subtype = changes.subtype;
    filteredChanges.type = changes.subtype;
  }
  if (changes.summary !== undefined) {
    filteredChanges.summary = trimLocalizedValue(changes.summary);
  }
  if (changes.source !== undefined) {
    filteredChanges.source = changes.source;
  }
  if (changes.tags !== undefined) {
    filteredChanges.tags = normalizeTags(changes.tags, changes.type || changes.subtype);
  }
  if (changes.featured !== undefined) {
    filteredChanges.featured = changes.featured;
  }
  if (changes.createdAt !== undefined) {
    filteredChanges.createdAt = changes.createdAt;
  }

  return store.updateItem(FILE_NAME, id, filteredChanges);
}

/**
 * Deletes a news item.
 * @param {string} id - News id
 * @returns {boolean} True if deleted
 */
function remove(id) {
  return store.deleteItem(FILE_NAME, id);
}

module.exports = {
  getAll,
  create,
  update,
  remove
};
