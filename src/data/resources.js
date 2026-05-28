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
  const normalizedCategory = normalizeCategory(resource.category || resource.kategorie || 'article');
  const title = resource.title || resource.titel || '';
  const description = resource.description || resource.beschreibung || '';
  const detailContent = resource.detailContent || resource.detailInhalt || resource.content || resource.inhalt || '';
  const summary = resource.summary || resource.zusammenfassung || resource.description || resource.beschreibung || '';
  return {
    id: resource.id,
    title: resolveLocalizedValue(title, locale),
    titleLocalized: toLocalizedValue(title),
    url: resource.url || '',
    description: resolveLocalizedValue(description, locale),
    descriptionLocalized: toLocalizedValue(description),
    detailContent: resolveLocalizedValue(detailContent, locale),
    detailContentLocalized: toLocalizedValue(detailContent),
    imageUrl: resource.imageUrl || resource.bildUrl || resource.thumbnailUrl || '',
    category: normalizedCategory,
    kind: normalizeKind(resource.kind || resource.art || normalizedCategory),
    subtype: normalizeSubtype(resource.subtype || resource.untertyp || normalizedCategory),
    summary: resolveLocalizedValue(summary, locale),
    summaryLocalized: toLocalizedValue(summary),
    source: resource.source || resource.quelle || detectSource(resource.url || ''),
    tags: normalizeTags(resource.tags || resource.schlagwoerter, normalizedCategory),
    attachments: normalizeAttachments(resource.attachments || resource.anhaenge, resource.id, locale),
    featured: resource.featured || false,
    createdAt: resource.createdAt || resource.erstelltAm || new Date().toISOString(),
    updatedAt: resource.updatedAt || resource.aktualisiertAm || null
  };
}

function normalizeCategory(category) {
  if (category === 'artikel') return 'article';
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

  if (normalized === 'artikel') return 'article';
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
      const filename = attachment.filename || attachment.dateiname || attachment.originalName || attachment.name || '';
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

  if (changes.title !== undefined || changes.titel !== undefined) {
    filteredChanges.title = trimLocalizedValue(changes.title !== undefined ? changes.title : changes.titel);
  }
  if (changes.url !== undefined) {
    filteredChanges.url = changes.url;
  }
  if (changes.description !== undefined || changes.beschreibung !== undefined) {
    filteredChanges.description = trimLocalizedValue(changes.description !== undefined ? changes.description : changes.beschreibung);
  }
  if (changes.detailContent !== undefined || changes.detailInhalt !== undefined || changes.content !== undefined || changes.inhalt !== undefined) {
    filteredChanges.detailContent = trimLocalizedValue(changes.detailContent !== undefined
      ? changes.detailContent
      : changes.detailInhalt !== undefined
        ? changes.detailInhalt
        : changes.content !== undefined
          ? changes.content
          : changes.inhalt);
  }
  if (changes.imageUrl !== undefined || changes.bildUrl !== undefined || changes.thumbnailUrl !== undefined) {
    filteredChanges.imageUrl = changes.imageUrl !== undefined
      ? changes.imageUrl
      : changes.bildUrl !== undefined
        ? changes.bildUrl
        : changes.thumbnailUrl;
  }
  if (changes.category !== undefined || changes.kategorie !== undefined) {
    filteredChanges.category = normalizeCategory(changes.category !== undefined ? changes.category : changes.kategorie);
  }
  if (changes.kind !== undefined || changes.art !== undefined) {
    filteredChanges.kind = normalizeKind(changes.kind !== undefined ? changes.kind : changes.art);
  }
  if (changes.subtype !== undefined || changes.untertyp !== undefined) {
    const subtype = normalizeSubtype(changes.subtype !== undefined ? changes.subtype : changes.untertyp);
    filteredChanges.subtype = subtype;
    filteredChanges.category = normalizeCategory(subtype);
  }
  if (changes.summary !== undefined || changes.zusammenfassung !== undefined) {
    filteredChanges.summary = trimLocalizedValue(changes.summary !== undefined ? changes.summary : changes.zusammenfassung);
  }
  if (changes.source !== undefined || changes.quelle !== undefined) {
    filteredChanges.source = changes.source !== undefined ? changes.source : changes.quelle;
  }
  if (changes.tags !== undefined || changes.schlagwoerter !== undefined) {
    filteredChanges.tags = normalizeTags(changes.tags !== undefined ? changes.tags : changes.schlagwoerter, changes.subtype || changes.category);
  }
  if (changes.attachments !== undefined || changes.anhaenge !== undefined) {
    filteredChanges.attachments = normalizeAttachments(changes.attachments !== undefined ? changes.attachments : changes.anhaenge, id);
  }
  if (changes.featured !== undefined) {
    filteredChanges.featured = changes.featured;
  }
  if (changes.createdAt !== undefined || changes.erstelltAm !== undefined) {
    filteredChanges.createdAt = changes.createdAt !== undefined ? changes.createdAt : changes.erstelltAm;
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
