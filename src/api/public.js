'use strict';

const path = require('path');
const fs = require('fs');
const { loadConfig } = require('../config');
const surveys = require('../data/surveys');
const resources = require('../data/resources');
const concerns = require('../data/concerns');
const newsItems = require('../data/news');

const localesDirectory = path.join(__dirname, '..', '..', 'locales');

/**
 * Registers public API routes.
 * @param {Object} router - Router instance
 */
function registerRoutes(router) {
  router.get('/api/runtime-config', (req, res) => {
    const config = loadConfig();
    sendJson(res, 200, {
      title: config.title,
      defaultLanguage: config.defaultLanguage,
      devReloadEnabled: !!config.devReloadEnabled
    });
  });

  router.get('/api/i18n/:locale', (req, res, params) => {
    const locale = params.locale;
    if (!/^[a-z]{2}$/.test(locale)) {
      sendJson(res, 400, { error: 'Invalid locale code' });
      return;
    }

    const filePath = path.join(localesDirectory, locale + '.json');
    try {
      const fileContents = fs.readFileSync(filePath, 'utf-8');
      sendJson(res, 200, JSON.parse(fileContents));
    } catch (error) {
      sendJson(res, 404, { error: 'Locale not available' });
    }
  });

  router.get('/api/surveys', (req, res) => {
    sendJson(res, 200, surveys.getActive());
  });

  router.post('/api/surveys/:id/responses', (req, res, params) => {
    readBody(req, res, (body) => {
      const responses = body?.responses || body?.antworten;

      if (!body || !Array.isArray(responses)) {
        sendJson(res, 400, { error: 'Responses array is required' });
        return;
      }

      if (body.name && body.name.length > 100) {
        sendJson(res, 400, { error: 'Name is too long (max 100 characters)' });
        return;
      }

      const success = surveys.addResponse(params.id, {
        name: body.name || null,
        responses
      });

      if (success) {
        sendJson(res, 201, { success: true });
      } else {
        sendJson(res, 404, { error: 'Survey not found or inactive' });
      }
    });
  });

  router.get('/api/resources', (req, res) => {
    sendJson(res, 200, resources.getAll());
  });

  router.post('/api/concerns', (req, res) => {
    readBody(req, res, (body) => {
      const title = body?.title || body?.titel;
      const description = body?.description || body?.beschreibung || '';

      if (!title || title.trim().length === 0) {
        sendJson(res, 400, { error: 'Title is required' });
        return;
      }

      if (title.length > 200) {
        sendJson(res, 400, { error: 'Title is too long (max 200 characters)' });
        return;
      }
      if (description.length > 2000) {
        sendJson(res, 400, { error: 'Description is too long (max 2000 characters)' });
        return;
      }
      if (body.name && body.name.length > 100) {
        sendJson(res, 400, { error: 'Name is too long (max 100 characters)' });
        return;
      }

      const created = concerns.create({
        title: title.trim(),
        description: description.trim(),
        name: body.name || null
      });

      sendJson(res, 201, created);
    });
  });

  router.get('/api/news', (req, res) => {
    sendJson(res, 200, newsItems.getAll());
  });

  router.get('/api/feed', (req, res) => {
    const news = newsItems.getAll().map((item) => ({
      ...item,
      feedSource: 'news',
      kind: item.kind || 'update',
      subtype: item.subtype || item.type || 'announcement',
      type: item.type || 'announcement',
      summary: item.summary || item.content || '',
      tags: Array.isArray(item.tags) ? item.tags : []
    }));
    const allResources = resources.getAll().map((item) => ({
      ...item,
      feedSource: 'resource',
      kind: item.kind || 'agent-asset',
      subtype: item.subtype || item.category || 'article',
      type: item.subtype || item.category || 'article',
      summary: item.summary || item.description || '',
      tags: Array.isArray(item.tags) ? item.tags : []
    }));
    const merged = [...news, ...allResources].sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );
    sendJson(res, 200, merged);
  });
}

/**
 * Sends a JSON response.
 * @param {Object} res - HTTP response
 * @param {number} statusCode - HTTP status code
 * @param {Object} data - Response payload
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

/**
 * Reads a request body as JSON.
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 * @param {Function} callback - Callback receiving parsed data
 */
function readBody(req, res, callback) {
  let body = '';
  const maxSize = 1024 * 100;

  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > maxSize) {
      req.destroy();
      sendJson(res, 413, { error: 'Request entity too large' });
    }
  });

  req.on('end', () => {
    try {
      const parsedBody = JSON.parse(body);
      callback(parsedBody);
    } catch (error) {
      sendJson(res, 400, { error: 'Invalid JSON payload' });
    }
  });
}

module.exports = { registerRoutes, sendJson, readBody };
