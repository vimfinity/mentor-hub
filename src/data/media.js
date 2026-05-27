'use strict';

const fs = require('fs');
const path = require('path');
const store = require('./store');
const newsItems = require('./news');
const resources = require('./resources');

const FILE_NAME = 'media.json';
const IMAGE_UPLOAD_ROOT = path.join(__dirname, '..', '..', 'data', 'uploads', 'images');

function normalizeMediaItem(item) {
  return {
    id: item.id,
    kind: item.kind || 'image',
    filename: item.filename || '',
    originalName: item.originalName || item.name || item.filename || '',
    mimeType: item.mimeType || 'application/octet-stream',
    sizeBytes: Number.isFinite(Number(item.sizeBytes || item.size)) ? Number(item.sizeBytes || item.size) : 0,
    sha256: item.sha256 || '',
    url: item.url || (item.filename ? `/api/uploads/images/${encodeURIComponent(item.filename)}` : ''),
    createdAt: item.createdAt || new Date().toISOString()
  };
}

function getAll() {
  return store.readDataFile(FILE_NAME).map(normalizeMediaItem);
}

function getImagesWithUsage() {
  const usage = getUsageMap();
  return getAll()
    .filter((item) => item.kind === 'image')
    .map((item) => ({
      ...item,
      usageCount: usage.get(item.url)?.length || 0,
      usedBy: usage.get(item.url) || []
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function findByHash(sha256) {
  return getAll().find((item) => item.sha256 === sha256) || null;
}

function addImage(data) {
  const existing = findByHash(data.sha256);
  if (existing) {
    return normalizeMediaItem(existing);
  }

  const item = {
    id: store.createId(),
    kind: 'image',
    filename: data.filename,
    originalName: data.originalName,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
    sha256: data.sha256,
    url: `/api/uploads/images/${encodeURIComponent(data.filename)}`,
    createdAt: new Date().toISOString()
  };

  store.mutateDataFile(FILE_NAME, (records) => {
    records.push(item);
    return { changed: true, result: item };
  });

  return normalizeMediaItem(item);
}

function removeImage(id) {
  const images = getImagesWithUsage();
  const image = images.find((item) => item.id === id);
  if (!image) {
    return { ok: false, reason: 'missing' };
  }
  if (image.usageCount > 0) {
    return { ok: false, reason: 'in-use', image };
  }

  const removed = store.mutateDataFile(FILE_NAME, (records) => {
    const index = records.findIndex((item) => item.id === id);
    if (index === -1) {
      return { changed: false, result: null };
    }

    return { changed: true, result: normalizeMediaItem(records.splice(index, 1)[0]) };
  });

  if (removed?.filename) {
    removeImageFile(removed.filename);
  }

  return { ok: true, image: removed };
}

function removeUnusedImages() {
  const images = getImagesWithUsage();
  const unusedIds = new Set(images.filter((item) => item.usageCount === 0).map((item) => item.id));
  if (unusedIds.size === 0) {
    return { removed: 0 };
  }

  const removedImages = store.mutateDataFile(FILE_NAME, (records) => {
    const removed = [];
    for (let index = records.length - 1; index >= 0; index--) {
      if (unusedIds.has(records[index].id)) {
        removed.push(normalizeMediaItem(records.splice(index, 1)[0]));
      }
    }
    return { changed: removed.length > 0, result: removed };
  });

  for (const image of removedImages) {
    removeImageFile(image.filename);
  }

  return { removed: removedImages.length };
}

function getUsageMap() {
  const usage = new Map();
  const add = (url, entry) => {
    if (!url || !String(url).startsWith('/api/uploads/images/')) {
      return;
    }
    if (!usage.has(url)) {
      usage.set(url, []);
    }
    usage.get(url).push(entry);
  };

  for (const item of newsItems.getAll()) {
    add(item.imageUrl, { id: item.id, title: item.title, type: 'news' });
  }
  for (const item of resources.getAll()) {
    add(item.imageUrl, { id: item.id, title: item.title, type: 'resource' });
  }

  return usage;
}

function removeImageFile(filename) {
  const filePath = path.join(IMAGE_UPLOAD_ROOT, filename || '');
  const resolvedRoot = path.resolve(IMAGE_UPLOAD_ROOT);
  const resolvedFile = path.resolve(filePath);
  if (resolvedFile.startsWith(resolvedRoot + path.sep) && fs.existsSync(resolvedFile)) {
    fs.rmSync(resolvedFile, { force: true });
  }
}

module.exports = {
  getImagesWithUsage,
  addImage,
  removeImage,
  removeUnusedImages
};
