'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const auth = require('../auth');
const { loadConfig, saveLocalConfig } = require('../config');
const surveys = require('../data/surveys');
const resources = require('../data/resources');
const concerns = require('../data/concerns');
const newsItems = require('../data/news');
const media = require('../data/media');
const { hasLocalizedText, localizedLength, trimLocalizedValue, normalizeLocale } = require('../data/localization');
const { createImageVariants } = require('../image-optimizer');
const { sendJson, readBody } = require('./public');

const NEWS_TYPES = ['announcement', 'release', 'article', 'tool', 'skill', 'video', 'tutorial'];
const FEED_KINDS = ['update', 'guide', 'agent-asset'];
const GUIDE_TYPES = ['tutorial', 'playbook', 'use-case', 'onboarding', 'comparison'];
const AGENT_ASSET_TYPES = ['skill', 'mcp', 'agents-md', 'agent', 'template', 'script', 'prompt-pack', 'repo', 'tool'];
const RESOURCE_TYPES = [...GUIDE_TYPES, ...AGENT_ASSET_TYPES, 'article', 'video'];
const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'data', 'uploads', 'resources');
const IMAGE_UPLOAD_ROOT = path.join(__dirname, '..', '..', 'public', 'uploads', 'images');
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  '.zip',
  '.pdf',
  '.docx',
  '.xlsx',
  '.pptx',
  '.txt',
  '.md',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp'
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const IMAGE_MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

function normalizeEditableDate(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

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

function readLargeJsonBody(req, res, callback) {
  let body = '';
  let receivedBytes = 0;
  let responseSent = false;
  const maxSize = Math.ceil(MAX_ATTACHMENT_BYTES * 1.4) + 4096;

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
      sendError(413, { error: 'Attachment is too large' });
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
      callback(JSON.parse(body));
    } catch (error) {
      sendError(400, { error: 'Invalid JSON payload' });
    }
  });

  req.on('error', () => {
    sendError(400, { error: 'Invalid request payload' });
  });
}

function sanitizeFileName(filename) {
  const basename = path.basename(String(filename || 'attachment.bin'));
  const sanitized = basename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized || 'attachment.bin';
}

function safeAttachmentDirectory(resourceId, attachmentId) {
  const targetDirectory = path.join(UPLOAD_ROOT, resourceId, attachmentId);
  const resolvedRoot = path.resolve(UPLOAD_ROOT);
  const resolvedTarget = path.resolve(targetDirectory);

  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw new Error('Invalid attachment path');
  }

  return resolvedTarget;
}

function removeAttachmentDirectory(resourceId, attachmentId) {
  const directory = safeAttachmentDirectory(resourceId, attachmentId);
  if (fs.existsSync(directory)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function removeResourceAttachmentDirectory(resourceId) {
  const targetDirectory = path.join(UPLOAD_ROOT, resourceId);
  const resolvedRoot = path.resolve(UPLOAD_ROOT);
  const resolvedTarget = path.resolve(targetDirectory);

  if (resolvedTarget.startsWith(resolvedRoot + path.sep) && fs.existsSync(resolvedTarget)) {
    fs.rmSync(resolvedTarget, { recursive: true, force: true });
  }
}

function safeImageUploadPath(filename) {
  const targetPath = path.join(IMAGE_UPLOAD_ROOT, filename);
  const resolvedRoot = path.resolve(IMAGE_UPLOAD_ROOT);
  const resolvedTarget = path.resolve(targetPath);

  if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw new Error('Invalid image path');
  }

  return resolvedTarget;
}

function getRequestLocale(req) {
  if (req.query?.locale) {
    return normalizeLocale(req.query.locale);
  }

  const acceptLanguage = String(req.headers['accept-language'] || '');
  const firstLanguage = acceptLanguage.split(',')[0]?.trim();
  return normalizeLocale(firstLanguage);
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
      const password = body?.password;

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

    if (config.adminPasswordHash.length === 0) {
      sendJson(res, 503, { error: 'Initial setup required (POST /api/admin/setup)' });
      return;
    }

    readBody(req, res, (body) => {
      const password = body?.password;

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
      const newPassword = body?.newPassword;

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

  router.post('/api/admin/uploads/images', (req, res) => {
    if (!requireAuth(req, res)) {
      return;
    }

    readLargeJsonBody(req, res, async (body) => {
      const originalName = sanitizeFileName(body?.filename || body?.name);
      const extension = path.extname(originalName).toLowerCase();
      const contentBase64 = String(body?.contentBase64 || '').replace(/^data:[^,]+,/, '');

      if (!originalName || !contentBase64) {
        sendJson(res, 400, { error: 'Image filename and content are required' });
        return;
      }
      if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
        sendJson(res, 400, { error: 'Image file type is not allowed' });
        return;
      }

      let buffer;
      try {
        buffer = Buffer.from(contentBase64, 'base64');
      } catch (error) {
        sendJson(res, 400, { error: 'Invalid image content' });
        return;
      }

      if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
        sendJson(res, 413, { error: 'Image is too large' });
        return;
      }

      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      const filename = `${sha256}${extension}`;
      fs.mkdirSync(IMAGE_UPLOAD_ROOT, { recursive: true });
      const imagePath = safeImageUploadPath(filename);
      if (!fs.existsSync(imagePath)) {
        fs.writeFileSync(imagePath, buffer);
      }

      let optimized = { width: null, height: null, variants: [] };
      try {
        optimized = await createImageVariants({ sourcePath: imagePath, filename });
      } catch (error) {
        console.warn('Image optimization failed:', error.message);
      }

      const existing = media.addImage({
        filename,
        originalName,
        mimeType: IMAGE_MIME_TYPES[extension] || body?.mimeType || 'application/octet-stream',
        sizeBytes: buffer.length,
        sha256,
        width: optimized.width,
        height: optimized.height,
        variants: optimized.variants
      });

      sendJson(res, 201, existing);
    });
  });

  router.get('/api/admin/media/images', (req, res) => {
    if (!requireAuth(req, res)) {
      return;
    }

    sendJson(res, 200, media.getImagesWithUsage());
  });

  router.delete('/api/admin/media/images/:id', (req, res, params) => {
    if (!requireAuth(req, res)) {
      return;
    }

    const result = media.removeImage(params.id);
    if (!result.ok && result.reason === 'missing') {
      sendJson(res, 404, { error: 'Image not found' });
      return;
    }
    if (!result.ok && result.reason === 'in-use') {
      sendJson(res, 409, { error: 'Image is still used', image: result.image });
      return;
    }

    sendJson(res, 200, { success: true });
  });

  router.post('/api/admin/media/images/cleanup', (req, res) => {
    if (!requireAuth(req, res)) {
      return;
    }

    sendJson(res, 200, media.removeUnusedImages());
  });

  router.get('/api/admin/surveys', (req, res) => {
    if (!requireAuth(req, res)) {
      return;
    }

    sendJson(res, 200, surveys.getAll(getRequestLocale(req)));
  });

  router.post('/api/admin/surveys', (req, res) => {
    if (!requireAuth(req, res)) {
      return;
    }

    readBody(req, res, (body) => {
      const title = body?.title;
      const description = body?.description || '';
      const questions = body?.questions;

      if (!hasLocalizedText(title)) {
        sendJson(res, 400, { error: 'Title is required' });
        return;
      }
      if (localizedLength(title) > 200) {
        sendJson(res, 400, { error: 'Title is too long (max 200 characters)' });
        return;
      }
      if (!Array.isArray(questions) || questions.length === 0) {
        sendJson(res, 400, { error: 'At least one question is required' });
        return;
      }

      const created = surveys.create({
        title: trimLocalizedValue(title),
        description: trimLocalizedValue(description),
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

  router.post('/api/admin/surveys/:id/move', (req, res, params) => {
    if (!requireAuth(req, res)) {
      return;
    }

    readBody(req, res, (body) => {
      const direction = body?.direction;
      if (direction !== 'up' && direction !== 'down') {
        sendJson(res, 400, { error: 'Direction must be up or down' });
        return;
      }

      const updated = surveys.move(params.id, direction);
      if (!updated) {
        sendJson(res, 404, { error: 'Survey not found or cannot be moved' });
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
      const title = body?.title;
      const description = body?.description || '';
      const category = body?.category || 'article';
      const kind = body?.kind || body?.type || 'agent-asset';
      const subtype = body?.subtype || category;

      if (!hasLocalizedText(title)) {
        sendJson(res, 400, { error: 'Title is required' });
        return;
      }
      if (localizedLength(title) > 200) {
        sendJson(res, 400, { error: 'Title is too long (max 200 characters)' });
        return;
      }
      if (body.url && body.url.length > 2000) {
        sendJson(res, 400, { error: 'URL is too long (max 2000 characters)' });
        return;
      }
      const createdAt = normalizeEditableDate(body.createdAt);
      if (!createdAt) {
        sendJson(res, 400, { error: 'Invalid date' });
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
        title: trimLocalizedValue(title),
        url: (body.url || '').trim(),
        description: trimLocalizedValue(description),
        detailContent: trimLocalizedValue(body.detailContent || body.content || ''),
        imageUrl: (body.imageUrl || '').trim(),
        category: subtype,
        kind,
        subtype,
        summary: trimLocalizedValue(body.summary || description),
        source: (body.source || '').trim(),
        tags: body.tags,
        featured: body.featured || false,
        createdAt
      });

      sendJson(res, 201, created);
    });
  });

  router.put('/api/admin/resources/:id', (req, res, params) => {
    if (!requireAuth(req, res)) {
      return;
    }

    readBody(req, res, (body) => {
      const title = body?.title;
      const description = body?.description;
      const category = body?.category;
      const kind = body?.kind || body?.type;
      const subtype = body?.subtype || category;

      if (title !== undefined && !hasLocalizedText(title)) {
        sendJson(res, 400, { error: 'Title is required' });
        return;
      }
      if (title !== undefined && localizedLength(title) > 200) {
        sendJson(res, 400, { error: 'Title is too long (max 200 characters)' });
        return;
      }
      if (body.url !== undefined && body.url.length > 2000) {
        sendJson(res, 400, { error: 'URL is too long (max 2000 characters)' });
        return;
      }
      if (description !== undefined && localizedLength(description) > 50000) {
        sendJson(res, 400, { error: 'Description is too long (max 50000 characters)' });
        return;
      }
      if (body.detailContent !== undefined && localizedLength(body.detailContent) > 200000) {
        sendJson(res, 400, { error: 'Detail content is too long (max 200000 characters)' });
        return;
      }
      if (body.createdAt !== undefined) {
        const createdAt = normalizeEditableDate(body.createdAt);
        if (!createdAt) {
          sendJson(res, 400, { error: 'Invalid date' });
          return;
        }
        body.createdAt = createdAt;
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

    removeResourceAttachmentDirectory(params.id);
    sendJson(res, 200, { success: true });
  });

  router.post('/api/admin/resources/:id/attachments', (req, res, params) => {
    if (!requireAuth(req, res)) {
      return;
    }

    const resource = resources.getAll().find((entry) => entry.id === params.id);
    if (!resource) {
      sendJson(res, 404, { error: 'Resource not found' });
      return;
    }

    readLargeJsonBody(req, res, (body) => {
      const originalName = sanitizeFileName(body?.filename || body?.name);
      const extension = path.extname(originalName).toLowerCase();
      const contentBase64 = String(body?.contentBase64 || '').replace(/^data:[^,]+,/, '');

      if (!originalName || !contentBase64) {
        sendJson(res, 400, { error: 'Attachment filename and content are required' });
        return;
      }
      if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(extension)) {
        sendJson(res, 400, { error: 'Attachment file type is not allowed' });
        return;
      }

      let buffer;
      try {
        buffer = Buffer.from(contentBase64, 'base64');
      } catch (error) {
        sendJson(res, 400, { error: 'Invalid attachment content' });
        return;
      }

      if (buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) {
        sendJson(res, 413, { error: 'Attachment is too large' });
        return;
      }

      const attachmentId = crypto.randomUUID();
      const directory = safeAttachmentDirectory(params.id, attachmentId);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, originalName), buffer);

      const updated = resources.addAttachment(params.id, {
        id: attachmentId,
        label: String(body?.label || '').trim() || originalName,
        filename: originalName,
        originalName,
        mimeType: body?.mimeType || body?.type || 'application/octet-stream',
        sizeBytes: buffer.length,
        createdAt: new Date().toISOString()
      });

      if (!updated) {
        removeAttachmentDirectory(params.id, attachmentId);
        sendJson(res, 404, { error: 'Resource not found' });
        return;
      }

      sendJson(res, 201, updated);
    });
  });

  router.delete('/api/admin/resources/:id/attachments/:attachmentId', (req, res, params) => {
    if (!requireAuth(req, res)) {
      return;
    }

    const updated = resources.removeAttachment(params.id, params.attachmentId);
    if (!updated) {
      sendJson(res, 404, { error: 'Attachment not found' });
      return;
    }

    removeAttachmentDirectory(params.id, params.attachmentId);
    sendJson(res, 200, updated);
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
      if (body.adminComment !== undefined && String(body.adminComment).length > 2000) {
        sendJson(res, 400, { error: 'Comment is too long (max 2000 characters)' });
        return;
      }

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
      const title = body?.title;
      const content = body?.content || '';
      const url = body?.url || '';
      const type = body?.type || 'announcement';
      const featured = body?.featured || false;

      if (!hasLocalizedText(title)) {
        sendJson(res, 400, { error: 'Title is required' });
        return;
      }
      if (localizedLength(title) > 200) {
        sendJson(res, 400, { error: 'Title is too long (max 200 characters)' });
        return;
      }
      if (localizedLength(content) > 50000) {
        sendJson(res, 400, { error: 'Content is too long (max 50000 characters)' });
        return;
      }
      if (body.detailContent !== undefined && localizedLength(body.detailContent) > 200000) {
        sendJson(res, 400, { error: 'Detail content is too long (max 200000 characters)' });
        return;
      }
      if (!NEWS_TYPES.includes(type)) {
        sendJson(res, 400, { error: 'Invalid type' });
        return;
      }
      const createdAt = normalizeEditableDate(body.createdAt);
      if (!createdAt) {
        sendJson(res, 400, { error: 'Invalid date' });
        return;
      }

      const created = newsItems.create({
        title: trimLocalizedValue(title),
        content: trimLocalizedValue(content),
        detailContent: trimLocalizedValue(body.detailContent || content),
        imageUrl: (body.imageUrl || '').trim(),
        url: url.trim(),
        type,
        subtype: type,
        summary: trimLocalizedValue(body.summary || content),
        source: (body.source || '').trim(),
        tags: body.tags,
        featured,
        createdAt
      });

      sendJson(res, 201, created);
    });
  });

  router.put('/api/admin/news/:id', (req, res, params) => {
    if (!requireAuth(req, res)) {
      return;
    }

    readBody(req, res, (body) => {
      const title = body?.title;
      const content = body?.content || '';
      const url = body?.url;
      const type = body?.type;

      if (title !== undefined && !hasLocalizedText(title)) {
        sendJson(res, 400, { error: 'Title is required' });
        return;
      }
      if (title !== undefined && localizedLength(title) > 200) {
        sendJson(res, 400, { error: 'Title is too long (max 200 characters)' });
        return;
      }
      if (content !== undefined && localizedLength(content) > 50000) {
        sendJson(res, 400, { error: 'Content is too long (max 50000 characters)' });
        return;
      }
      if (body.detailContent !== undefined && localizedLength(body.detailContent) > 200000) {
        sendJson(res, 400, { error: 'Detail content is too long (max 200000 characters)' });
        return;
      }
      if (body.createdAt !== undefined) {
        const createdAt = normalizeEditableDate(body.createdAt);
        if (!createdAt) {
          sendJson(res, 400, { error: 'Invalid date' });
          return;
        }
        body.createdAt = createdAt;
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
