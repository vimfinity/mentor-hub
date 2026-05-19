'use strict';

const store = require('./store');

const PRIMARY_FILE_NAME = 'concerns.json';
const LEGACY_FILE_NAME = 'painpoints.json';

const STATUS_BY_LEGACY_VALUE = {
  offen: 'open',
  in_bearbeitung: 'in_progress',
  erledigt: 'done'
};

const VALID_STATUSES = ['open', 'in_progress', 'done'];

function normalizeStatus(status) {
  return STATUS_BY_LEGACY_VALUE[status] || status || 'open';
}

function normalizeConcern(concern) {
  return {
    id: concern.id,
    title: concern.title || concern.titel || '',
    description: concern.description || concern.beschreibung || '',
    name: concern.name || null,
    status: normalizeStatus(concern.status),
    adminComment: concern.adminComment || concern.adminKommentar || '',
    createdAt: concern.createdAt || concern.erstelltAm || new Date().toISOString(),
    updatedAt: concern.updatedAt || concern.aktualisiertAm || null
  };
}

function loadStoredConcerns() {
  const concerns = store.readDataFile(PRIMARY_FILE_NAME);
  if (Array.isArray(concerns) && concerns.length > 0) {
    return concerns;
  }

  const legacyConcerns = store.readDataFile(LEGACY_FILE_NAME);
  if (!Array.isArray(legacyConcerns) || legacyConcerns.length === 0) {
    return concerns;
  }

  const migratedConcerns = legacyConcerns.map(normalizeConcern);
  store.writeDataFile(PRIMARY_FILE_NAME, migratedConcerns);
  return migratedConcerns;
}

function loadConcerns() {
  return loadStoredConcerns().map(normalizeConcern);
}

function getAll() {
  const concerns = loadConcerns();
  return concerns.sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

function getOpen() {
  const concerns = getAll();
  return concerns.filter((concern) => concern.status !== 'done');
}

function create(data) {
  const concern = {
    title: data.title,
    description: data.description || '',
    name: data.name || null,
    status: 'open',
    adminComment: ''
  };
  return store.addItem(PRIMARY_FILE_NAME, concern);
}

function update(id, changes) {
  const filteredChanges = {};

  if (changes.status) {
    const normalizedStatus = normalizeStatus(changes.status);
    if (VALID_STATUSES.includes(normalizedStatus)) {
      filteredChanges.status = normalizedStatus;
    }
  }
  if (changes.adminComment !== undefined || changes.adminKommentar !== undefined) {
    filteredChanges.adminComment = changes.adminComment !== undefined
      ? changes.adminComment
      : changes.adminKommentar;
  }

  if (Object.keys(filteredChanges).length === 0) {
    return null;
  }

  return store.updateItem(PRIMARY_FILE_NAME, id, filteredChanges);
}

function remove(id) {
  return store.deleteItem(PRIMARY_FILE_NAME, id);
}

module.exports = {
  getAll,
  getOpen,
  create,
  update,
  remove,
  VALID_STATUSES
};