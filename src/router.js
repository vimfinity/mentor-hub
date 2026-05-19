'use strict';

const url = require('url');

/**
 * Extracts route params from a request path.
 * @param {string} pattern - Route pattern
 * @param {string} requestPath - Actual request path
 * @returns {Object|null} Extracted params or null
 */
function matchRoute(pattern, requestPath) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = requestPath.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params = {};

  for (let index = 0; index < patternParts.length; index++) {
    if (patternParts[index].startsWith(':')) {
      const paramName = patternParts[index].slice(1);
      params[paramName] = decodeURIComponent(pathParts[index]);
      continue;
    }

    if (patternParts[index] !== pathParts[index]) {
      return null;
    }
  }

  return params;
}

/**
 * Creates a simple router with registered routes.
 * @returns {Object} Router instance
 */
function createRouter() {
  const routes = [];

  /**
   * Registers a new route.
   * @param {string} method - HTTP method
   * @param {string} pattern - Route pattern
   * @param {Function} handler - Request handler
   */
  function register(method, pattern, handler) {
    routes.push({
      method: method.toUpperCase(),
      pattern,
      handler
    });
  }

  /**
   * Handles an incoming request.
   * @param {Object} req - HTTP request
   * @param {Object} res - HTTP response
   * @returns {boolean} True if a route matched
   */
  function handle(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const requestPath = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    for (const route of routes) {
      if (route.method !== method) {
        continue;
      }

      const params = matchRoute(route.pattern, requestPath);
      if (params !== null) {
        req.params = params;
        req.query = parsedUrl.query;
        route.handler(req, res, params);
        return true;
      }
    }

    return false;
  }

  return {
    get: (pattern, handler) => register('GET', pattern, handler),
    post: (pattern, handler) => register('POST', pattern, handler),
    put: (pattern, handler) => register('PUT', pattern, handler),
    delete: (pattern, handler) => register('DELETE', pattern, handler),
    handle
  };
}

module.exports = { createRouter, matchRoute };
