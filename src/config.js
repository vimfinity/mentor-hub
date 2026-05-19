'use strict';

const fs = require('fs');
const path = require('path');

const baseConfigPath = path.join(__dirname, '..', 'config.json');
const localConfigPath = path.join(__dirname, '..', 'config.local.json');

/**
 * Reads a JSON file or returns a fallback value.
 * @param {string} filePath - Absolute file path
 * @param {Object} fallback - Fallback value
 * @returns {Object} Parsed JSON data
 */
function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

function normalizeConfig(config) {
  return {
    title: config.title || config.titel || 'KI-Hub',
    defaultLanguage: config.defaultLanguage || config.standardSprache || 'de',
    host: config.host || '127.0.0.1',
    port: config.port || 3000,
    sessionDurationMs: config.sessionDurationMs || config.sitzungsDauerMs || 86400000,
    adminPasswordHash: config.adminPasswordHash || config.adminPasswortHash || '',
    adminPasswordSalt: config.adminPasswordSalt || config.adminPasswortSalt || ''
  };
}

/**
 * Loads public base config plus local overrides.
 * @returns {Object} Merged configuration
 */
function loadConfig() {
  const baseConfig = readJsonFile(baseConfigPath, {});
  const localConfig = readJsonFile(localConfigPath, {});

  return normalizeConfig({
    ...baseConfig,
    ...localConfig
  });
}

/**
 * Persists local-only configuration overrides.
 * @param {Object} changes - Config changes to persist
 */
function saveLocalConfig(changes) {
  const localConfig = normalizeConfig(readJsonFile(localConfigPath, {}));
  const nextConfig = {
    ...localConfig,
    ...changes
  };

  fs.writeFileSync(localConfigPath, JSON.stringify(nextConfig, null, 2), 'utf-8');
}

module.exports = {
  loadConfig,
  saveLocalConfig
};