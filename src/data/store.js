'use strict';

const fs = require('fs');
const path = require('path');

// Base path for persisted JSON data files.
const dataDirectory = path.join(__dirname, '..', '..', 'data');

// Simple per-file write locks to avoid concurrent writes.
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
  const tempFilePath = filePath + '.tmp';

  if (writeLocks.get(fileName)) {
    throw new Error(`Write operation for ${fileName} is already active`);
  }

  writeLocks.set(fileName, true);
  try {
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(tempFilePath, json, 'utf-8');
    fs.renameSync(tempFilePath, filePath);
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
  const records = readDataFile(fileName);
  const createdItem = {
    id: createId(),
    createdAt: new Date().toISOString(),
    ...entry
  };
  records.push(createdItem);
  writeDataFile(fileName, records);
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
  const records = readDataFile(fileName);
  const index = records.findIndex((record) => record.id === id);
  if (index === -1) {
    return null;
  }
  records[index] = {
    ...records[index],
    ...changes,
    id: records[index].id,
    createdAt: records[index].createdAt || records[index].erstelltAm || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  delete records[index].erstelltAm;
  delete records[index].aktualisiertAm;
  writeDataFile(fileName, records);
  return records[index];
}

/**
 * Deletes a record by id.
 * @param {string} fileName - JSON file name
 * @param {string} id - Record id
 * @returns {boolean} True if deleted, otherwise false
 */
function deleteItem(fileName, id) {
  const records = readDataFile(fileName);
  const originalLength = records.length;
  const filteredRecords = records.filter((record) => record.id !== id);
  if (filteredRecords.length === originalLength) {
    return false;
  }
  writeDataFile(fileName, filteredRecords);
  return true;
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
  findById,
  addItem,
  updateItem,
  deleteItem,
  createId
};
