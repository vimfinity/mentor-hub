'use strict';

const crypto = require('crypto');

// Active sessions: Map<token, { createdAt: number }>
const sessions = new Map();
const PASSWORD_SCHEME = 'scrypt';
const PASSWORD_KEY_LENGTH = 64;

/**
 * Creates a password hash with an embedded algorithm marker and salt.
 * @param {string} password - Plain text password
 * @param {string} [salt] - Optional random salt
 * @returns {string} Encoded password hash
 */
function hashPassword(password, salt = generateSalt()) {
  const derivedKey = crypto.scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex');
  return `${PASSWORD_SCHEME}$${salt}$${derivedKey}`;
}

/**
 * Creates a random salt.
 * @returns {string} 32-byte salt as hex string
 */
function generateSalt() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verifies a password against the stored hash and salt.
 * @param {string} password - Submitted password
 * @param {string} hash - Stored hash
 * @param {string} salt - Stored salt
 * @returns {boolean} True if the password matches
 */
function verifyPassword(password, hash, salt) {
  if (typeof hash !== 'string' || hash.length === 0) {
    return false;
  }

  if (hash.startsWith(PASSWORD_SCHEME + '$')) {
    return verifyScryptPassword(password, hash);
  }

  if (typeof salt !== 'string' || salt.length === 0) {
    return false;
  }

  return compareHexStrings(hashLegacyPassword(password, salt), hash);
}

function verifyScryptPassword(password, encodedHash) {
  const parts = encodedHash.split('$');
  if (parts.length !== 3) {
    return false;
  }

  const [, salt, expectedHash] = parts;
  const computedHash = crypto.scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex');
  return compareHexStrings(computedHash, expectedHash);
}

function hashLegacyPassword(password, salt) {
  return crypto
    .createHash('sha256')
    .update(salt + ':' + password)
    .digest('hex');
}

function compareHexStrings(left, right) {
  try {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');

    if (leftBuffer.length === 0 || rightBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  } catch (error) {
    return false;
  }
}

function needsRehash(hash) {
  return typeof hash !== 'string' || !hash.startsWith(PASSWORD_SCHEME + '$');
}

/**
 * Creates a new session token.
 * @returns {string} Session token
 */
function createSession() {
  const token = crypto.randomUUID();
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

/**
 * Verifies whether a session token is still valid.
 * @param {string} token - Session token to check
 * @param {number} maxDurationMs - Maximum session duration in milliseconds
 * @returns {boolean} True if the session is valid
 */
function verifySession(token, maxDurationMs) {
  if (!token || !sessions.has(token)) {
    return false;
  }
  const session = sessions.get(token);
  const isExpired = (Date.now() - session.createdAt) > maxDurationMs;
  if (isExpired) {
    sessions.delete(token);
    return false;
  }
  return true;
}

/**
 * Ends a session.
 * @param {string} token - Session token to remove
 */
function endSession(token) {
  sessions.delete(token);
}

/**
 * Removes all expired sessions.
 * @param {number} maxDurationMs - Maximum session duration in milliseconds
 */
function cleanupSessions(maxDurationMs) {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if ((now - session.createdAt) > maxDurationMs) {
      sessions.delete(token);
    }
  }
}

module.exports = {
  hashPassword,
  generateSalt,
  verifyPassword,
  needsRehash,
  createSession,
  verifySession,
  endSession,
  cleanupSessions
};
