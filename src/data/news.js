'use strict';

const store = require('./store');

const FILE_NAME = 'news.json';

function normalizeNewsItem(item) {
  return {
    id: item.id,
    title: item.title || item.titel || '',
    content: item.content || item.inhalt || '',
    createdAt: item.createdAt || item.erstelltAm || new Date().toISOString(),
    updatedAt: item.updatedAt || item.aktualisiertAm || null
  };
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
    content: data.content || ''
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
