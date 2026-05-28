'use strict';

const store = require('./store');
const {
  DEFAULT_LOCALE,
  resolveLocalizedValue,
  toLocalizedValue,
  trimLocalizedValue
} = require('./localization');

const FILE_NAME = 'resources.json';

function normalizeResource(resource, locale = DEFAULT_LOCALE) {
  const normalizedCategory = normalizeCategory(resource.category || 'article');
  const title = resource.title || '';
  const description = resource.description || '';
  const detailContent = resource.detailContent || resource.content || '';
  const summary = resource.summary || resource.description || '';
  return {
    id: resource.id,
    title: resolveLocalizedValue(title, locale),
    titleLocalized: toLocalizedValue(title),
    url: resource.url || '',
    description: resolveLocalizedValue(description, locale),
    descriptionLocalized: toLocalizedValue(description),
    detailContent: resolveLocalizedValue(detailContent, locale),
    detailContentLocalized: toLocalizedValue(detailContent),
    imageUrl: resource.imageUrl || resource.thumbnailUrl || '',
    category: normalizedCategory,
    kind: normalizeKind(resource.kind || resource.type || normalizedCategory),
    subtype: normalizeSubtype(resource.subtype || normalizedCategory),
    summary: resolveLocalizedValue(summary, locale),
    summaryLocalized: toLocalizedValue(summary),
    source: resource.source || detectSource(resource.url || ''),
    tags: normalizeTags(resource.tags, normalizedCategory),
    attachments: normalizeAttachments(resource.attachments, resource.id, locale),
    featured: resource.featured || false,
    createdAt: resource.createdAt || new Date().toISOString(),
    updatedAt: resource.updatedAt || null
  };
}

function normalizeCategory(category) {
  return category || 'article';
}

function normalizeKind(kind) {
  const normalized = String(kind || '').toLowerCase();

  if (normalized === 'guide' || normalized === 'guides') return 'guide';
  if (normalized === 'agent-asset' || normalized === 'asset' || normalized === 'assets') return 'agent-asset';
  if (normalized === 'update' || normalized === 'news') return 'update';

  if (['tutorial', 'playbook', 'use-case', 'onboarding', 'comparison'].includes(normalized)) {
    return 'guide';
  }

  if (['skill', 'mcp', 'agents-md', 'agent', 'template', 'script', 'prompt-pack', 'repo', 'tool'].includes(normalized)) {
    return 'agent-asset';
  }

  return 'agent-asset';
}

function normalizeSubtype(subtype) {
  const normalized = String(subtype || '').toLowerCase();

  if (normalized === 'howto') return 'tutorial';

  return normalized || 'article';
}

function normalizeTags(tags, fallbackCategory) {
  const values = Array.isArray(tags)
    ? tags
    : typeof tags === 'string'
      ? tags.split(',')
      : [];

  const normalized = values
    .map((tag) => String(tag || '').trim().toLowerCase())
    .filter(Boolean);

  if (fallbackCategory && !normalized.includes(fallbackCategory)) {
    normalized.unshift(fallbackCategory);
  }

  return Array.from(new Set(normalized));
}

function normalizeAttachments(attachments, resourceId, locale = DEFAULT_LOCALE) {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments
    .map((attachment) => {
      if (!attachment || !attachment.id) {
        return null;
      }

      const id = String(attachment.id);
      const filename = attachment.filename || attachment.originalName || attachment.name || '';
      const originalName = attachment.originalName || attachment.name || filename;
      const label = attachment.label || attachment.title || originalName || filename || 'Download';

      return {
        id,
        label: resolveLocalizedValue(label, locale),
        labelLocalized: toLocalizedValue(label),
        filename,
        originalName,
        mimeType: attachment.mimeType || attachment.type || 'application/octet-stream',
        sizeBytes: Number.isFinite(Number(attachment.sizeBytes || attachment.size))
          ? Number(attachment.sizeBytes || attachment.size)
          : 0,
        url: attachment.url || (resourceId ? `/api/resources/${encodeURIComponent(resourceId)}/attachments/${encodeURIComponent(id)}` : ''),
        createdAt: attachment.createdAt || new Date().toISOString()
      };
    })
    .filter(Boolean);
}

function detectSource(url) {
  if (!url) {
    return 'internal';
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname.includes('openai.com') || hostname.includes('chatgpt.com')) return 'openai';
    if (hostname.includes('anthropic.com') || hostname.includes('claude.com')) return 'anthropic';
    if (hostname.includes('google.') || hostname.includes('deepmind.google')) return 'google';
    if (hostname.includes('github.com')) return 'github';
    if (hostname.includes('modelcontextprotocol.io')) return 'mcp';

    return hostname.replace(/^www\./, '');
  } catch (error) {
    return 'external';
  }
}

function loadResources(locale = DEFAULT_LOCALE) {
  return store.readDataFile(FILE_NAME).map((resource) => {
    const normalizedResource = normalizeResource(resource, locale);
    normalizedResource.category = normalizeCategory(normalizedResource.category);
    return normalizedResource;
  });
}

/**
 * Returns all resources sorted by newest first.
 * @returns {Array} Resource list
 */
function getAll(locale = DEFAULT_LOCALE) {
  const resources = loadResources(locale);
  return resources.sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Returns resources for a single category.
 * @param {string} category - Category filter
 * @returns {Array} Filtered resources
 */
function getByCategory(category, locale = DEFAULT_LOCALE) {
  const resources = getAll(locale);
  return resources.filter((resource) => resource.category === normalizeCategory(category));
}

/**
 * Creates a new resource.
 * @param {Object} data - Resource payload
 * @returns {Object} Created resource
 */
function create(data) {
  const resource = {
    title: trimLocalizedValue(data.title),
    url: data.url,
    description: trimLocalizedValue(data.description || ''),
    detailContent: trimLocalizedValue(data.detailContent || data.content || ''),
    imageUrl: data.imageUrl || '',
    category: normalizeCategory(data.category || data.subtype || 'article'),
    kind: normalizeKind(data.kind || data.category || data.subtype || 'agent-asset'),
    subtype: normalizeSubtype(data.subtype || data.category || 'article'),
    summary: trimLocalizedValue(data.summary || data.description || ''),
    source: data.source || detectSource(data.url || ''),
    tags: normalizeTags(data.tags, data.subtype || data.category || 'article'),
    attachments: normalizeAttachments(data.attachments, null),
    featured: data.featured || false,
    createdAt: data.createdAt || new Date().toISOString()
  };
  return store.addItem(FILE_NAME, resource);
}

/**
 * Updates a resource.
 * @param {string} id - Resource id
 * @param {Object} changes - Fields to update
 * @returns {Object|null} Updated resource or null
 */
function update(id, changes) {
  const filteredChanges = {};

  if (changes.title !== undefined) {
    filteredChanges.title = trimLocalizedValue(changes.title);
  }
  if (changes.url !== undefined) {
    filteredChanges.url = changes.url;
  }
  if (changes.description !== undefined) {
    filteredChanges.description = trimLocalizedValue(changes.description);
  }
  if (changes.detailContent !== undefined || changes.content !== undefined) {
    filteredChanges.detailContent = trimLocalizedValue(changes.detailContent !== undefined
      ? changes.detailContent
      : changes.content);
  }
  if (changes.imageUrl !== undefined || changes.thumbnailUrl !== undefined) {
    filteredChanges.imageUrl = changes.imageUrl !== undefined
      ? changes.imageUrl
      : changes.thumbnailUrl;
  }
  if (changes.category !== undefined) {
    filteredChanges.category = normalizeCategory(changes.category);
  }
  if (changes.kind !== undefined || changes.type !== undefined) {
    filteredChanges.kind = normalizeKind(changes.kind !== undefined ? changes.kind : changes.type);
  }
  if (changes.subtype !== undefined) {
    const subtype = normalizeSubtype(changes.subtype);
    filteredChanges.subtype = subtype;
    filteredChanges.category = normalizeCategory(subtype);
  }
  if (changes.summary !== undefined) {
    filteredChanges.summary = trimLocalizedValue(changes.summary);
  }
  if (changes.source !== undefined) {
    filteredChanges.source = changes.source;
  }
  if (changes.tags !== undefined) {
    filteredChanges.tags = normalizeTags(changes.tags, changes.subtype || changes.category);
  }
  if (changes.attachments !== undefined) {
    filteredChanges.attachments = normalizeAttachments(changes.attachments, id);
  }
  if (changes.featured !== undefined) {
    filteredChanges.featured = changes.featured;
  }
  if (changes.createdAt !== undefined) {
    filteredChanges.createdAt = changes.createdAt;
  }

  return store.updateItem(FILE_NAME, id, filteredChanges);
}

function addAttachment(id, attachment) {
  return store.mutateDataFile(FILE_NAME, (records) => {
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) {
      return { changed: false, result: null };
    }

    const currentAttachments = normalizeAttachments(records[index].attachments, id);
    const nextAttachment = normalizeAttachments([attachment], id)[0];
    if (!nextAttachment) {
      return { changed: false, result: null };
    }

    records[index] = {
      ...records[index],
      attachments: [...currentAttachments.filter((item) => item.id !== nextAttachment.id), nextAttachment],
      updatedAt: new Date().toISOString()
    };

    return { changed: true, result: normalizeResource(records[index]) };
  });
}

function removeAttachment(id, attachmentId) {
  return store.mutateDataFile(FILE_NAME, (records) => {
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) {
      return { changed: false, result: null };
    }

    const currentAttachments = normalizeAttachments(records[index].attachments, id);
    const nextAttachments = currentAttachments.filter((attachment) => attachment.id !== attachmentId);
    if (nextAttachments.length === currentAttachments.length) {
      return { changed: false, result: null };
    }

    records[index] = {
      ...records[index],
      attachments: nextAttachments,
      updatedAt: new Date().toISOString()
    };

    return { changed: true, result: normalizeResource(records[index]) };
  });
}

/**
 * Deletes a resource.
 * @param {string} id - Resource id
 * @returns {boolean} True if deleted
 */
function remove(id) {
  return store.deleteItem(FILE_NAME, id);
}

module.exports = {
  getAll,
  getByCategory,
  create,
  update,
  addAttachment,
  removeAttachment,
  remove
};
