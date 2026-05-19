'use strict';

const crypto = require('crypto');

// Active sessions: Map<token, { createdAt: number }>
const sessions = new Map();

/**
 * Creates a SHA-256 password hash with salt.
 * @param {string} password - Plain text password
 * @param {string} salt - Random salt
 * @returns {string} Hex-encoded hash
 */
function hashPassword(password, salt) {
  return crypto
    .createHash('sha256')
    .update(salt + ':' + password)
    .digest('hex');
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
  const computedHash = hashPassword(password, salt);
  // Use a timing-safe comparison to avoid leaking information.
  return crypto.timingSafeEqual(
    Buffer.from(computedHash, 'hex'),
    Buffer.from(hash, 'hex')
  );
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
  createSession,
  verifySession,
  endSession,
  cleanupSessions
};
