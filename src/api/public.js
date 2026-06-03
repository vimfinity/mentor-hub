'use strict';

const path = require('path');
const fs = require('fs');
const { loadConfig } = require('../config');
const surveys = require('../data/surveys');
const resources = require('../data/resources');
const concerns = require('../data/concerns');
const newsItems = require('../data/news');
const media = require('../data/media');
const { normalizeLocale } = require('../data/localization');

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
    const requestedLocale = params.locale;
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(requestedLocale)) {
      sendJson(res, 400, { error: 'Invalid locale code' });
      return;
    }

    const locale = normalizeLocale(requestedLocale).slice(0, 2);
    const filePath = path.join(localesDirectory, locale + '.json');
    try {
      const fileContents = fs.readFileSync(filePath, 'utf-8');
      sendJson(res, 200, JSON.parse(fileContents));
    } catch (error) {
      sendJson(res, 404, { error: 'Locale not available' });
    }
  });

  router.get('/api/surveys', (req, res) => {
    sendJson(res, 200, surveys.getActive(getRequestLocale(req)));
  });

  router.get('/api/surveys/:id', (req, res, params) => {
    const survey = surveys.getActiveById(params.id, getRequestLocale(req));
    if (!survey) {
      sendJson(res, 404, { error: 'Survey not found or inactive' });
      return;
    }

    sendJson(res, 200, survey);
  });

  router.post('/api/surveys/:id/responses', (req, res, params) => {
    readBody(req, res, (body) => {
      const responses = body?.responses;
      const answers = body?.answers;
      const hasAnswers = answers && typeof answers === 'object' && !Array.isArray(answers);

      if (!body || (!Array.isArray(responses) && !hasAnswers)) {
        sendJson(res, 400, { error: 'Responses are required' });
        return;
      }

      if (body.name && body.name.length > 100) {
        sendJson(res, 400, { error: 'Name is too long (max 100 characters)' });
        return;
      }

      const success = surveys.addResponse(params.id, {
        name: body.name || null,
        answers: hasAnswers ? answers : undefined,
        responses: Array.isArray(responses) ? responses : undefined
      });

      if (success) {
        sendJson(res, 201, { success: true });
      } else {
        sendJson(res, 404, { error: 'Survey not found or inactive' });
      }
    });
  });

  router.get('/api/resources', (req, res) => {
    sendJson(res, 200, resources.getAll(getRequestLocale(req)).map(withImageMetadata));
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
      const title = body?.title;
      const description = body?.description || '';

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
    sendJson(res, 200, newsItems.getAll(getRequestLocale(req)));
  });

  router.get('/api/feed', (req, res) => {
    const locale = getRequestLocale(req);
    const merged = buildMergedFeed(locale);

    const query = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
    const hasLimit = req.query?.limit !== undefined;
    const hasOffset = req.query?.offset !== undefined;

    // Backwards compatible: with no q/limit/offset params, return the plain
    // array the existing clients expect. When any are present, return a
    // paginated envelope { items, total, offset, limit }.
    if (!query && !hasLimit && !hasOffset) {
      sendJson(res, 200, merged);
      return;
    }

    const filtered = query ? merged.filter((item) => matchesFeedQuery(item, query)) : merged;
    const total = filtered.length;
    const offset = clampNonNegativeInt(req.query.offset, 0);
    const limit = hasLimit ? clampNonNegativeInt(req.query.limit, total) : total;
    const items = filtered.slice(offset, offset + limit);

    sendJson(res, 200, { items, total, offset, limit, query });
  });

  router.get('/api/feed.xml', (req, res) => {
    const locale = getRequestLocale(req);
    const config = loadConfig();
    const items = buildMergedFeed(locale).slice(0, FEED_EXPORT_LIMIT);
    const baseUrl = getBaseUrl(req);
    const xml = buildRssFeed(items, config, baseUrl, locale);

    res.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
    res.end(xml);
  });

  router.get('/api/feed.json', (req, res) => {
    const locale = getRequestLocale(req);
    const config = loadConfig();
    const items = buildMergedFeed(locale).slice(0, FEED_EXPORT_LIMIT);
    const baseUrl = getBaseUrl(req);

    res.writeHead(200, { 'Content-Type': 'application/feed+json; charset=utf-8' });
    res.end(JSON.stringify(buildJsonFeed(items, config, baseUrl)));
  });

  router.get('/api/feed/:id', (req, res, params) => {
    const locale = getRequestLocale(req);
    const merged = buildMergedFeed(locale);
    const item = merged.find((feedItem) => feedItem.id === params.id);
    if (!item) {
      sendJson(res, 404, { error: 'Feed item not found' });
      return;
    }

    sendJson(res, 200, item);
  });
}

const FEED_EXPORT_LIMIT = 50;

/**
 * Reconstructs the public base URL (scheme://host) from the request headers.
 * @param {Object} req - HTTP request
 * @returns {string} Base URL without trailing slash
 */
function getBaseUrl(req) {
  const host = req.headers.host || 'localhost';
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || (req.socket && req.socket.encrypted ? 'https' : 'http');
  return `${protocol}://${host}`;
}

function feedItemLink(item, baseUrl) {
  const ownContent = String(item.detailContent || '').trim();
  const externalUrl = String(item.url || '').trim();
  if (!ownContent && externalUrl) {
    return externalUrl;
  }
  return `${baseUrl}/feed/${encodeURIComponent(item.id)}`;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildRssFeed(items, config, baseUrl, locale) {
  const title = escapeXml(config.title || 'KI-Hub');
  const selfUrl = `${baseUrl}/api/feed.xml`;
  const lastBuild = new Date().toUTCString();

  const entries = items.map((item) => {
    const link = feedItemLink(item, baseUrl);
    const description = item.summary || item.description || item.content || '';
    return [
      '    <item>',
      `      <title>${escapeXml(item.title)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      `      <guid isPermaLink="false">${escapeXml(item.id)}</guid>`,
      `      <pubDate>${new Date(item.createdAt).toUTCString()}</pubDate>`,
      `      <description>${escapeXml(description)}</description>`,
      '    </item>'
    ].join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${title}</title>`,
    `    <link>${escapeXml(baseUrl)}</link>`,
    `    <description>${title}</description>`,
    `    <language>${escapeXml(locale)}</language>`,
    `    <lastBuildDate>${lastBuild}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml" />`,
    entries,
    '  </channel>',
    '</rss>',
    ''
  ].join('\n');
}

function buildJsonFeed(items, config, baseUrl) {
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: config.title || 'KI-Hub',
    home_page_url: baseUrl,
    feed_url: `${baseUrl}/api/feed.json`,
    items: items.map((item) => ({
      id: item.id,
      url: feedItemLink(item, baseUrl),
      title: item.title,
      content_text: item.summary || item.description || item.content || '',
      date_published: item.createdAt,
      tags: Array.isArray(item.tags) ? item.tags : []
    }))
  };
}

/**
 * Merges news items and resources into a single, date-sorted feed.
 * @param {string} locale - Resolved request locale
 * @returns {Array} Merged feed entries
 */
function buildMergedFeed(locale) {
  const news = newsItems.getAll(locale).map((item) => withImageMetadata({
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
  const allResources = resources.getAll(locale).map((item) => withImageMetadata({
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

  return [...news, ...allResources].sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Case-insensitive match of a feed item against a search query, scanning the
 * fields a reader would expect to search by.
 * @param {Object} item - Feed entry
 * @param {string} query - Raw search query
 * @returns {boolean} True if the item matches
 */
function matchesFeedQuery(item, query) {
  const needle = query.toLowerCase();
  const haystack = [
    item.title,
    item.summary,
    item.description,
    item.source,
    item.subtype,
    item.type,
    ...(Array.isArray(item.tags) ? item.tags : [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(needle);
}

/**
 * Parses a query param into a non-negative integer, falling back when invalid.
 * @param {*} value - Raw query value
 * @param {number} fallback - Value to use when parsing fails
 * @returns {number} Parsed non-negative integer
 */
function clampNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
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

function getRequestLocale(req) {
  if (req.query?.locale) {
    return normalizeLocale(req.query.locale);
  }

  const acceptLanguage = String(req.headers['accept-language'] || '');
  const firstLanguage = acceptLanguage.split(',')[0]?.trim();
  return normalizeLocale(firstLanguage);
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
