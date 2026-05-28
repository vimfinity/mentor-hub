'use strict';

const fs = require('fs');
const path = require('path');

// Base path for persisted JSON data files.
const dataDirectory = path.join(__dirname, '..', '..', 'data');

// Simple per-file write locks to keep read-modify-write cycles atomic per process.
const writeLocks = new Map();

/**
 * Reads and parses a JSON data file.
 * @param {string} fileName - JSON file name, for example "surveys.json"
 * @returns {Array|Object} Parsed JSON contents
 */
function readDataFile(fileName) {
  const filePath = path.join(dataDirectory, fileName);
  try {
    const contents = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Writes JSON data atomically to disk.
 * @param {string} fileName - JSON file name
 * @param {Array|Object} data - Data to persist
 */
function writeDataFile(fileName, data) {
  const filePath = path.join(dataDirectory, fileName);

  if (writeLocks.get(fileName)) {
    throw new Error(`Write operation for ${fileName} is already active`);
  }

  writeLocks.set(fileName, true);
  try {
    writeJsonAtomically(filePath, data);
  } finally {
    writeLocks.set(fileName, false);
  }
}

function writeJsonAtomically(filePath, data) {
  const tempFilePath = filePath + '.tmp';
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tempFilePath, json, 'utf-8');
  fs.renameSync(tempFilePath, filePath);
}

/**
 * Reads, mutates and persists a JSON file within one critical section.
 * @param {string} fileName - JSON file name
 * @param {Function} mutator - Receives mutable records and returns metadata
 * @returns {*} Mutation result
 */
function mutateDataFile(fileName, mutator) {
  const filePath = path.join(dataDirectory, fileName);

  if (writeLocks.get(fileName)) {
    throw new Error(`Write operation for ${fileName} is already active`);
  }

  writeLocks.set(fileName, true);
  try {
    const records = readDataFile(fileName);
    const mutation = mutator(records) || {};
    const changed = mutation.changed !== undefined ? mutation.changed : true;

    if (changed) {
      writeJsonAtomically(filePath, records);
    }

    return Object.prototype.hasOwnProperty.call(mutation, 'result')
      ? mutation.result
      : records;
  } finally {
    writeLocks.set(fileName, false);
  }
}

/**
 * Finds a record by id in a JSON data file.
 * @param {string} fileName - JSON file name
 * @param {string} id - Record id
 * @returns {Object|null} Found record or null
 */
function findById(fileName, id) {
  const records = readDataFile(fileName);
  return records.find((record) => record.id === id) || null;
}

/**
 * Adds a new record to a JSON data file.
 * @param {string} fileName - JSON file name
 * @param {Object} entry - Record payload
 * @returns {Object} Persisted record
 */
function addItem(fileName, entry) {
  const createdItem = {
    id: createId(),
    createdAt: new Date().toISOString(),
    ...entry
  };

  mutateDataFile(fileName, (records) => {
    records.push(createdItem);
    return { changed: true, result: createdItem };
  });

  return createdItem;
}

/**
 * Updates a record by id.
 * @param {string} fileName - JSON file name
 * @param {string} id - Record id
 * @param {Object} changes - Fields to update
 * @returns {Object|null} Updated record or null
 */
function updateItem(fileName, id, changes) {
  return mutateDataFile(fileName, (records) => {
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) {
      return { changed: false, result: null };
    }

    records[index] = {
      ...records[index],
      ...changes,
      id: records[index].id,
      createdAt: changes.createdAt || records[index].createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    delete records[index].createdAt;
    delete records[index].updatedAt;

    return { changed: true, result: records[index] };
  });
}

/**
 * Deletes a record by id.
 * @param {string} fileName - JSON file name
 * @param {string} id - Record id
 * @returns {boolean} True if deleted, otherwise false
 */
function deleteItem(fileName, id) {
  return mutateDataFile(fileName, (records) => {
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) {
      return { changed: false, result: false };
    }

    records.splice(index, 1);
    return { changed: true, result: true };
  });
}

/**
 * Creates a UUID v4 identifier.
 * @returns {string} UUID
 */
function createId() {
  const crypto = require('crypto');
  return crypto.randomUUID();
}

module.exports = {
  readDataFile,
  writeDataFile,
  mutateDataFile,
  findById,
  addItem,
  updateItem,
  deleteItem,
  createId
};
