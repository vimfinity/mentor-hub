'use strict';

const auth = require('../auth');
const { loadConfig, saveLocalConfig } = require('../config');
const surveys = require('../data/surveys');
const resources = require('../data/resources');
const concerns = require('../data/concerns');
const newsItems = require('../data/news');
const { sendJson, readBody } = require('./public');

const NEWS_TYPES = ['announcement', 'release', 'article', 'tool', 'skill', 'video', 'tutorial'];
const FEED_KINDS = ['update', 'guide', 'agent-asset'];
const GUIDE_TYPES = ['tutorial', 'playbook', 'use-case', 'onboarding', 'comparison'];
const AGENT_ASSET_TYPES = ['skill', 'mcp', 'agents-md', 'agent', 'template', 'script', 'prompt-pack', 'repo', 'tool'];
const RESOURCE_TYPES = [...GUIDE_TYPES, ...AGENT_ASSET_TYPES, 'article', 'video'];

/**
 * Checks the Authorization header and validates the session token.
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 * @returns {boolean} True if authorized
 */
function requireAuth(req, res) {
  const config = loadConfig();
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');

  if (!auth.verifySession(token, config.sessionDurationMs)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return false;
  }

  return true;
}

/**
 * Registers admin API routes.
 * @param {Object} router - Router instance
 */
function registerRoutes(router) {
  router.get('/api/admin/session', (req, res) => {
    const config = loadConfig();
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    sendJson(res, 200, {
      configured: !!(config.adminPasswordHash && config.adminPasswordHash.length > 0),
      authenticated: auth.verifySession(token, config.sessionDurationMs)
    });
  });

  router.get('/api/admin/setup', (req, res) => {
    const config = loadConfig();
    sendJson(res, 200, {
      configured: !!(config.adminPasswordHash && config.adminPasswordHash.length > 0)
    });
  });

  router.post('/api/admin/setup', (req, res) => {
    const config = loadConfig();

    if (config.adminPasswordHash && config.adminPasswordHash.length > 0) {
      sendJson(res, 403, { error: 'Setup has already been completed' });
      return;
    }

    readBody(req, res, (body) => {
      const password = body?.password || body?.passwort;

      if (!password || password.length < 8) {
        sendJson(res, 400, { error: 'Password is required (minimum 8 characters)' });
        return;
      }

      const hash = auth.hashPassword(password);

      saveLocalConfig({
        adminPasswordHash: hash,
        adminPasswordSalt: ''
      });

      sendJson(res, 200, { success: true, message: 'Admin password saved' });
    });
  });

  router.post('/api/admin/login', (req, res) => {
    const config = loadConfig();

    if (!config.adminPasswordHash || config.adminPasswordHash.length === 0) {
      sendJson(res, 503, { error: 'Initial setup required (POST /api/admin/setup)' });
      return;
    }

    readBody(req, res, (body) => {
      const password = body?.password || body?.passwort;

      if (!password) {
        sendJson(res, 400, { error: 'Password is required' });
        return;
      }

      const isValid = auth.verifyPassword(
        password,
        config.adminPasswordHash,
        config.adminPasswordSalt
      );

      if (!isValid) {
        sendJson(res, 401, { error: 'Invalid password' });
        return;
      }

      if (auth.needsRehash(config.adminPasswordHash)) {
        try {
          saveLocalConfig({
            adminPasswordHash: auth.hashPassword(password),
            adminPasswordSalt: ''
          });
        } catch (error) {
          console.warn('Admin password hash upgrade failed:', error.message);
        }
      }

      const token = auth.createSession();
      sendJson(res, 200, { token });
    });
  });

  router.post('/api/admin/logout', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    auth.endSession(token);
    sendJson(res, 200, { success: true });
  });

  router.post('/api/admin/password', (req, res) => {
    if (!requireAuth(req, res)) {
      return;
    }

    readBody(req, res, (body) => {
      const newPassword = body?.newPassword || body?.neuesPasswort;

      if (!newPassword || newPassword.length < 8) {
        sendJson(res, 400, { error: 'New password is required (minimum 8 characters)' });
        return;
      }

      const hash = auth.hashPassword(newPassword);

      saveLocalConfig({
        adminPasswordHash: hash,
        adminPasswordSalt: ''
      });

      sendJson(res, 200, { success: true });
    });
  });

  router.get('/api/admin/surveys', (req, res) => {
    if (!requireAuth(req, res)) {
      return;
    }

    sendJson(res, 200, surveys.getAll());
  });

  router.post('/api/admin/surveys', (req, res) => {
    if (!requireAuth(req, res)) {
      return;
    }

    readBody(req, res, (body) => {
      const title = body?.title || body?.titel;
      const description = body?.description || body?.beschreibung || '';
      const questions = body?.questions || body?.fragen;

      if (!title || title.trim().length === 0) {
        sendJson(res, 400, { error: 'Title is required' });
        return;
      }
      if (title.length > 200) {
        sendJson(res, 400, { error: 'Title is too long (max 200 characters)' });
        return;
      }
      if (!Array.isArray(questions) || questions.length === 0) {
        sendJson(res, 400, { error: 'At least one question is required' });
        return;
      }

      const created = surveys.create({
        title: title.trim(),
        description: description.trim(),
        questions
      });

      sendJson(res, 201, created);
    });
  });

  router.put('/api/admin/surveys/:id', (req, res, params) => {
    if (!requireAuth(req, res)) {
      return;
    }

    readBody(req, res, (body) => {
      const updated = surveys.update(params.id, body);
      if (!updated) {
        sendJson(res, 404, { error: 'Survey not found' });
        return;
      }

      sendJson(res, 200, updated);
    });
  });

  router.delete('/api/admin/surveys/:id', (req, res, params) => {
    if (!requireAuth(req, res)) {
      return;
    }

    if (!surveys.remove(params.id)) {
      sendJson(res, 404, { error: 'Survey not found' });
      return;
    }

    sendJson(res, 200, { success: true });
  });

  router.post('/api/admin/resources', (req, res) => {
    if (!requireAuth(req, res)) {
      return;
    }

    readBody(req, res, (body) => {
      const title = body?.title || body?.titel;
      const description = body?.description || body?.beschreibung || '';
      const category = body?.category || body?.kategorie || 'article';
      const kind = body?.kind || body?.art || 'agent-asset';
      const subtype = body?.subtype || body?.untertyp || category;

      if (!title || title.trim().length === 0) {
        sendJson(res, 400, { error: 'Title is required' });
        return;
      }
      if (title.length > 200) {
        sendJson(res, 400, { error: 'Title is too long (max 200 characters)' });
        return;
      }
      if (body.url && body.url.length > 2000) {
        sendJson(res, 400, { error: 'URL is too long (max 2000 characters)' });
        return;
      }

      if (!FEED_KINDS.includes(kind) || kind === 'update') {
        sendJson(res, 400, { error: 'Invalid kind for resource' });
        return;
      }
      if (subtype && !RESOURCE_TYPES.includes(subtype)) {
        sendJson(res, 400, { error: 'Invalid category' });
        return;
      }

      const created = resources.create({
        title: title.trim(),
        url: (body.url || '').trim(),
        description: description.trim(),
        detailContent: (body.detailContent || body.content || '').trim(),
        imageUrl: (body.imageUrl || '').trim(),
        category: subtype,
        kind,
        subtype,
        summary: (body.summary || description).trim(),
        source: (body.source || '').trim(),
        tags: body.tags,
        featured: body.featured || false
      });

      sendJson(res, 201, created);
    });
  });

  router.put('/api/admin/resources/:id', (req, res, params) => {
    if (!requireAuth(req, res)) {
      return;
    }

    readBody(req, res, (body) => {
      const title = body?.title || body?.titel;
      const description = body?.description || body?.beschreibung || '';
      const category = body?.category || body?.kategorie;
      const kind = body?.kind || body?.art;
      const subtype = body?.subtype || body?.untertyp || category;

      if (title !== undefined && title.trim().length === 0) {
        sendJson(res, 400, { error: 'Title is required' });
        return;
      }
      if (title !== undefined && title.length > 200) {
        sendJson(res, 400, { error: 'Title is too long (max 200 characters)' });
        return;
      }
      if (body.url !== undefined && body.url.length > 2000) {
        sendJson(res, 400, { error: 'URL is too long (max 2000 characters)' });
        return;
      }
      if (description !== undefined && description.length > 50000) {
        sendJson(res, 400, { error: 'Description is too long (max 50000 characters)' });
        return;
      }
      if (body.detailContent !== undefined && String(body.detailContent).length > 200000) {
        sendJson(res, 400, { error: 'Detail content is too long (max 200000 characters)' });
        return;
      }

      if (kind && (!FEED_KINDS.includes(kind) || kind === 'update')) {
        sendJson(res, 400, { error: 'Invalid kind for resource' });
        return;
      }
      if (subtype && !RESOURCE_TYPES.includes(subtype)) {
        sendJson(res, 400, { error: 'Invalid category' });
        return;
      }

      const updated = resources.update(params.id, body);
      if (!updated) {
        sendJson(res, 404, { error: 'Resource not found' });
        return;
      }

      sendJson(res, 200, updated);
    });
  });

  router.delete('/api/admin/resources/:id', (req, res, params) => {
    if (!requireAuth(req, res)) {
      return;
    }

    if (!resources.remove(params.id)) {
      sendJson(res, 404, { error: 'Resource not found' });
      return;
    }

    sendJson(res, 200, { success: true });
  });

  router.get('/api/admin/concerns', (req, res) => {
    if (!requireAuth(req, res)) {
      return;
    }

    sendJson(res, 200, concerns.getAll());
  });

  router.put('/api/admin/concerns/:id', (req, res, params) => {
    if (!requireAuth(req, res)) {
      return;
    }

    readBody(req, res, (body) => {
      const updated = concerns.update(params.id, body);
      if (!updated) {
        sendJson(res, 404, { error: 'Concern not found' });
        return;
      }

      sendJson(res, 200, updated);
    });
  });

  router.delete('/api/admin/concerns/:id', (req, res, params) => {
    if (!requireAuth(req, res)) {
      return;
    }

    if (!concerns.remove(params.id)) {
      sendJson(res, 404, { error: 'Concern not found' });
      return;
    }

    sendJson(res, 200, { success: true });
  });

  router.post('/api/admin/news', (req, res) => {
    if (!requireAuth(req, res)) {
      return;
    }

    readBody(req, res, (body) => {
      const title = body?.title || body?.titel;
      const content = body?.content || body?.inhalt || '';
      const url = body?.url || '';
      const type = body?.type || 'announcement';
      const featured = body?.featured || false;

      if (!title || title.trim().length === 0) {
        sendJson(res, 400, { error: 'Title is required' });
        return;
      }
      if (title.length > 200) {
        sendJson(res, 400, { error: 'Title is too long (max 200 characters)' });
        return;
      }
      if (content.length > 50000) {
        sendJson(res, 400, { error: 'Content is too long (max 50000 characters)' });
        return;
      }
      if (body.detailContent !== undefined && String(body.detailContent).length > 200000) {
        sendJson(res, 400, { error: 'Detail content is too long (max 200000 characters)' });
        return;
      }
      if (!NEWS_TYPES.includes(type)) {
        sendJson(res, 400, { error: 'Invalid type' });
        return;
      }

      const created = newsItems.create({
        title: title.trim(),
        content: content.trim(),
        detailContent: (body.detailContent || content).trim(),
        imageUrl: (body.imageUrl || '').trim(),
        url: url.trim(),
        type,
        subtype: type,
        summary: (body.summary || content).trim(),
        source: (body.source || '').trim(),
        tags: body.tags,
        featured
      });

      sendJson(res, 201, created);
    });
  });

  router.put('/api/admin/news/:id', (req, res, params) => {
    if (!requireAuth(req, res)) {
      return;
    }

    readBody(req, res, (body) => {
      const title = body?.title || body?.titel;
      const content = body?.content || body?.inhalt || '';
      const url = body?.url;
      const type = body?.type;

      if (title !== undefined && title.trim().length === 0) {
        sendJson(res, 400, { error: 'Title is required' });
        return;
      }
      if (title !== undefined && title.length > 200) {
        sendJson(res, 400, { error: 'Title is too long (max 200 characters)' });
        return;
      }
      if (content !== undefined && content.length > 50000) {
        sendJson(res, 400, { error: 'Content is too long (max 50000 characters)' });
        return;
      }
      if (body.detailContent !== undefined && String(body.detailContent).length > 200000) {
        sendJson(res, 400, { error: 'Detail content is too long (max 200000 characters)' });
        return;
      }
      if (url !== undefined && url.length > 2000) {
        sendJson(res, 400, { error: 'URL is too long (max 2000 characters)' });
        return;
      }
      if (type && !NEWS_TYPES.includes(type)) {
        sendJson(res, 400, { error: 'Invalid type' });
        return;
      }

      const updated = newsItems.update(params.id, body);
      if (!updated) {
        sendJson(res, 404, { error: 'News item not found' });
        return;
      }

      sendJson(res, 200, updated);
    });
  });

  router.delete('/api/admin/news/:id', (req, res, params) => {
    if (!requireAuth(req, res)) {
      return;
    }

    if (!newsItems.remove(params.id)) {
      sendJson(res, 404, { error: 'News item not found' });
      return;
    }

    sendJson(res, 200, { success: true });
  });

  router.get('/api/admin/status', (req, res) => {
    const config = loadConfig();
    sendJson(res, 200, {
      configured: !!(config.adminPasswordHash && config.adminPasswordHash.length > 0)
    });
  });
}

module.exports = { registerRoutes };
