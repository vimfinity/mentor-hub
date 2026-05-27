'use strict';

const store = require('./store');

const FILE_NAME = 'news.json';

function normalizeNewsItem(item) {
  const normalizedType = normalizeType(item.type || item.art || 'announcement');
  return {
    id: item.id,
    title: item.title || item.titel || '',
    content: item.content || item.inhalt || '',
    detailContent: item.detailContent || item.detailInhalt || item.content || item.inhalt || '',
    imageUrl: item.imageUrl || item.bildUrl || item.thumbnailUrl || '',
    url: item.url || '',
    type: normalizedType,
    kind: 'update',
    subtype: normalizedType,
    summary: item.summary || item.zusammenfassung || item.content || item.inhalt || '',
    source: item.source || item.quelle || detectSource(item.url || ''),
    tags: normalizeTags(item.tags || item.schlagwoerter, normalizedType),
    featured: item.featured || false,
    createdAt: item.createdAt || item.erstelltAm || new Date().toISOString(),
    updatedAt: item.updatedAt || item.aktualisiertAm || null
  };
}

function normalizeType(type) {
  const normalized = String(type || '').toLowerCase();

  if (normalized === 'news') return 'announcement';
  if (normalized === 'artikel') return 'article';

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

function loadNewsItems() {
  return store.readDataFile(FILE_NAME).map(normalizeNewsItem);
}

/**
 * Returns all news items sorted by newest first.
 * @returns {Array} News list
 */
function getAll() {
  const newsItems = loadNewsItems();
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
    title: data.title,
    content: data.content || '',
    detailContent: data.detailContent || data.content || '',
    imageUrl: data.imageUrl || '',
    url: data.url || '',
    type: data.type || 'announcement',
    subtype: data.subtype || data.type || 'announcement',
    summary: data.summary || data.content || '',
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

  if (changes.title !== undefined || changes.titel !== undefined) {
    filteredChanges.title = changes.title !== undefined ? changes.title : changes.titel;
  }
  if (changes.content !== undefined || changes.inhalt !== undefined) {
    filteredChanges.content = changes.content !== undefined ? changes.content : changes.inhalt;
  }
  if (changes.detailContent !== undefined || changes.detailInhalt !== undefined) {
    filteredChanges.detailContent = changes.detailContent !== undefined ? changes.detailContent : changes.detailInhalt;
  }
  if (changes.imageUrl !== undefined || changes.bildUrl !== undefined || changes.thumbnailUrl !== undefined) {
    filteredChanges.imageUrl = changes.imageUrl !== undefined
      ? changes.imageUrl
      : changes.bildUrl !== undefined
        ? changes.bildUrl
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
  if (changes.summary !== undefined || changes.zusammenfassung !== undefined) {
    filteredChanges.summary = changes.summary !== undefined ? changes.summary : changes.zusammenfassung;
  }
  if (changes.source !== undefined || changes.quelle !== undefined) {
    filteredChanges.source = changes.source !== undefined ? changes.source : changes.quelle;
  }
  if (changes.tags !== undefined || changes.schlagwoerter !== undefined) {
    filteredChanges.tags = normalizeTags(changes.tags !== undefined ? changes.tags : changes.schlagwoerter, changes.type || changes.subtype);
  }
  if (changes.featured !== undefined) {
    filteredChanges.featured = changes.featured;
  }
  if (changes.createdAt !== undefined || changes.erstelltAm !== undefined) {
    filteredChanges.createdAt = changes.createdAt !== undefined ? changes.createdAt : changes.erstelltAm;
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
