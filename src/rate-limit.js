'use strict';

const counters = new Map();

const MAX_REQUESTS = 30;
const WINDOW_MS = 60000;

/**
 * Checks whether an IP is still allowed to make requests.
 * @param {string} ip - Client IP address
 * @returns {boolean} True if the request is allowed
 */
function isAllowed(ip) {
  const now = Date.now();
  const entry = counters.get(ip);

  if (!entry || (now - entry.windowStart) > WINDOW_MS) {
    counters.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= MAX_REQUESTS) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Returns remaining requests for the current window.
 * @param {string} ip - Client IP address
 * @returns {number} Remaining requests
 */
function getRemainingRequests(ip) {
  const now = Date.now();
  const entry = counters.get(ip);

  if (!entry || (now - entry.windowStart) > WINDOW_MS) {
    return MAX_REQUESTS;
  }

  return Math.max(0, MAX_REQUESTS - entry.count);
}

/**
 * Removes expired window entries.
 */
function cleanup() {
  const now = Date.now();
  for (const [ip, entry] of counters) {
    if ((now - entry.windowStart) > WINDOW_MS) {
      counters.delete(ip);
    }
  }
}

setInterval(cleanup, 300000).unref();

module.exports = {
  isAllowed,
  getRemainingRequests
};
