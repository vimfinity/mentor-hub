'use strict';

const path = require('path');
const fs = require('fs');
const { loadConfig } = require('../config');
const surveys = require('../data/surveys');
const resources = require('../data/resources');
const concerns = require('../data/concerns');
const newsItems = require('../data/news');
const media = require('../data/media');

const localesDirectory = path.join(__dirname, '..', '..', 'locales');
const resourceUploadDirectory = path.join(__dirname, '..', '..', 'data', 'uploads', 'resources');
const imageUploadDirectory = path.join(__dirname, '..', '..', 'public', 'uploads', 'images');
const imageMimeTypes = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

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

  router.get('/api/surveys/:id', (req, res, params) => {
    const survey = surveys.getActiveById(params.id);
    if (!survey) {
      sendJson(res, 404, { error: 'Survey not found or inactive' });
      return;
    }

    sendJson(res, 200, survey);
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
    sendJson(res, 200, resources.getAll().map(withImageMetadata));
  });

  router.get('/api/uploads/images/:filename', (req, res, params) => {
    const filePath = safeImagePath(params.filename);
    if (!filePath || !fs.existsSync(filePath)) {
      sendJson(res, 404, { error: 'Image not found' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': imageMimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': fs.statSync(filePath).size,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(filePath).pipe(res);
  });

  router.get('/api/resources/:id/attachments/:attachmentId', (req, res, params) => {
    const resource = resources.getAll().find((item) => item.id === params.id);
    const attachment = resource?.attachments?.find((item) => item.id === params.attachmentId);

    if (!attachment) {
      sendJson(res, 404, { error: 'Attachment not found' });
      return;
    }

    const filePath = safeAttachmentPath(params.id, params.attachmentId, attachment.filename);
    if (!filePath || !fs.existsSync(filePath)) {
      sendJson(res, 404, { error: 'Attachment file not found' });
      return;
    }

    const downloadName = encodeURIComponent(attachment.originalName || attachment.filename || 'download')
      .replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase());

    res.writeHead(200, {
      'Content-Type': attachment.mimeType || 'application/octet-stream',
      'Content-Length': fs.statSync(filePath).size,
      'Content-Disposition': `attachment; filename*=UTF-8''${downloadName}`,
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(filePath).pipe(res);
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
    const news = newsItems.getAll().map((item) => withImageMetadata({
      ...item,
      feedSource: 'news',
      kind: item.kind || 'update',
      subtype: item.subtype || item.type || 'announcement',
      type: item.type || 'announcement',
      summary: item.summary || item.content || '',
      detailContent: item.detailContent || item.content || '',
      imageUrl: item.imageUrl || '',
      tags: Array.isArray(item.tags) ? item.tags : []
    }));
    const allResources = resources.getAll().map((item) => withImageMetadata({
      ...item,
      feedSource: 'resource',
      kind: item.kind || 'agent-asset',
      subtype: item.subtype || item.category || 'article',
      type: item.subtype || item.category || 'article',
      summary: item.summary || item.description || '',
      detailContent: item.detailContent || '',
      imageUrl: item.imageUrl || '',
      tags: Array.isArray(item.tags) ? item.tags : []
    }));
    const merged = [...news, ...allResources].sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );
    sendJson(res, 200, merged);
  });

  router.get('/api/feed/:id', (req, res, params) => {
    const merged = [
      ...newsItems.getAll().map((item) => withImageMetadata({
        ...item,
        feedSource: 'news',
        kind: item.kind || 'update',
        subtype: item.subtype || item.type || 'announcement',
        type: item.type || 'announcement',
        summary: item.summary || item.content || '',
        detailContent: item.detailContent || item.content || '',
        imageUrl: item.imageUrl || '',
        tags: Array.isArray(item.tags) ? item.tags : []
      })),
      ...resources.getAll().map((item) => withImageMetadata({
        ...item,
        feedSource: 'resource',
        kind: item.kind || 'agent-asset',
        subtype: item.subtype || item.category || 'article',
        type: item.subtype || item.category || 'article',
        summary: item.summary || item.description || '',
        detailContent: item.detailContent || '',
        imageUrl: item.imageUrl || '',
        tags: Array.isArray(item.tags) ? item.tags : []
      }))
    ];
    const item = merged.find((feedItem) => feedItem.id === params.id);
    if (!item) {
      sendJson(res, 404, { error: 'Feed item not found' });
      return;
    }

    sendJson(res, 200, item);
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

function withImageMetadata(item) {
  const imageUrl = item.imageUrl || '';
  const image = media.findByUrl(imageUrl);
  if (!image) {
    return item;
  }

  return {
    ...item,
    image: {
      url: image.url,
      width: image.width,
      height: image.height,
      variants: image.variants
    }
  };
}

function safeAttachmentPath(resourceId, attachmentId, filename) {
  const resolvedRoot = path.resolve(resourceUploadDirectory);
  const resolvedTarget = path.resolve(resourceUploadDirectory, resourceId, attachmentId, filename || '');

  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    return null;
  }

  return resolvedTarget;
}

function safeImagePath(filename) {
  if (!/^[a-f0-9-]+\.(png|jpg|jpeg|webp|gif)$/i.test(filename || '')) {
    return null;
  }

  const resolvedRoot = path.resolve(imageUploadDirectory);
  const resolvedTarget = path.resolve(imageUploadDirectory, filename);

  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    return null;
  }

  return resolvedTarget;
}

/**
 * Reads a request body as JSON.
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 * @param {Function} callback - Callback receiving parsed data
 */
function readBody(req, res, callback) {
  let body = '';
  let receivedBytes = 0;
  let responseSent = false;
  const maxSize = 1024 * 512;

  function sendError(statusCode, payload) {
    if (responseSent) {
      return;
    }

    responseSent = true;
    sendJson(res, statusCode, payload);
  }

  req.on('data', (chunk) => {
    if (responseSent) {
      return;
    }

    receivedBytes += chunk.length;
    if (receivedBytes > maxSize) {
      sendError(413, { error: 'Request entity too large' });
      req.destroy();
      return;
    }

    body += chunk;
  });

  req.on('end', () => {
    if (responseSent) {
      return;
    }

    try {
      const parsedBody = JSON.parse(body);
      callback(parsedBody);
    } catch (error) {
      sendError(400, { error: 'Invalid JSON payload' });
    }
  });

  req.on('error', () => {
    sendError(400, { error: 'Invalid request payload' });
  });
}

module.exports = { registerRoutes, sendJson, readBody };
