'use strict';

const store = require('./store');

const FILE_NAME = 'resources.json';

function normalizeResource(resource) {
  return {
    id: resource.id,
    title: resource.title || resource.titel || '',
    url: resource.url || '',
    description: resource.description || resource.beschreibung || '',
    category: resource.category || resource.kategorie || 'article',
    createdAt: resource.createdAt || resource.erstelltAm || new Date().toISOString(),
    updatedAt: resource.updatedAt || resource.aktualisiertAm || null
  };
}

function normalizeCategory(category) {
  if (category === 'artikel') return 'article';
  return category || 'article';
}

function loadResources() {
  return store.readDataFile(FILE_NAME).map((resource) => {
    const normalizedResource = normalizeResource(resource);
    normalizedResource.category = normalizeCategory(normalizedResource.category);
    return normalizedResource;
  });
}

/**
 * Returns all resources sorted by newest first.
 * @returns {Array} Resource list
 */
function getAll() {
  const resources = loadResources();
  return resources.sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Returns resources for a single category.
 * @param {string} category - Category filter
 * @returns {Array} Filtered resources
 */
function getByCategory(category) {
  const resources = getAll();
  return resources.filter((resource) => resource.category === normalizeCategory(category));
}

/**
 * Creates a new resource.
 * @param {Object} data - Resource payload
 * @returns {Object} Created resource
 */
function create(data) {
  const resource = {
    title: data.title,
    url: data.url,
    description: data.description || '',
    category: normalizeCategory(data.category || 'article')
  };
  return store.addItem(FILE_NAME, resource);
}

/**
 * Updates a resource.
 * @param {string} id - Resource id
 * @param {Object} changes - Fields to update
 * @returns {Object|null} Updated resource or null
 */
function update(id, changes) {
  const filteredChanges = {};

  if (changes.title !== undefined || changes.titel !== undefined) {
    filteredChanges.title = changes.title !== undefined ? changes.title : changes.titel;
  }
  if (changes.url !== undefined) {
    filteredChanges.url = changes.url;
  }
  if (changes.description !== undefined || changes.beschreibung !== undefined) {
    filteredChanges.description = changes.description !== undefined ? changes.description : changes.beschreibung;
  }
  if (changes.category !== undefined || changes.kategorie !== undefined) {
    filteredChanges.category = normalizeCategory(changes.category !== undefined ? changes.category : changes.kategorie);
  }

  return store.updateItem(FILE_NAME, id, filteredChanges);
}

/**
 * Deletes a resource.
 * @param {string} id - Resource id
 * @returns {boolean} True if deleted
 */
function remove(id) {
  return store.deleteItem(FILE_NAME, id);
}

module.exports = {
  getAll,
  getByCategory,
  create,
  update,
  remove
};
