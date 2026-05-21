'use strict';

const store = require('./store');

const FILE_NAME = 'resources.json';

function normalizeResource(resource) {
  const normalizedCategory = normalizeCategory(resource.category || resource.kategorie || 'article');
  return {
    id: resource.id,
    title: resource.title || resource.titel || '',
    url: resource.url || '',
    description: resource.description || resource.beschreibung || '',
    detailContent: resource.detailContent || resource.detailInhalt || resource.content || resource.inhalt || '',
    imageUrl: resource.imageUrl || resource.bildUrl || resource.thumbnailUrl || '',
    category: normalizedCategory,
    kind: normalizeKind(resource.kind || resource.art || normalizedCategory),
    subtype: normalizeSubtype(resource.subtype || resource.untertyp || normalizedCategory),
    summary: resource.summary || resource.zusammenfassung || resource.description || resource.beschreibung || '',
    source: resource.source || resource.quelle || detectSource(resource.url || ''),
    tags: normalizeTags(resource.tags || resource.schlagwoerter, normalizedCategory),
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

function loadResources() {
  return store.readDataFile(FILE_NAME).map((resource) => {
    const normalizedResource = normalizeResource(resource);
    normalizedResource.category = normalizeCategory(normalizedResource.category);
    return normalizedResource;
  });
}

/**
 * Returns all resources sorted by newest first.
 * @returns {Array} Resource list
 */
function getAll() {
  const resources = loadResources();
  return resources.sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Returns resources for a single category.
 * @param {string} category - Category filter
 * @returns {Array} Filtered resources
 */
function getByCategory(category) {
  const resources = getAll();
  return resources.filter((resource) => resource.category === normalizeCategory(category));
}

/**
 * Creates a new resource.
 * @param {Object} data - Resource payload
 * @returns {Object} Created resource
 */
function create(data) {
  const resource = {
    title: data.title,
    url: data.url,
    description: data.description || '',
    detailContent: data.detailContent || data.content || '',
    imageUrl: data.imageUrl || '',
    category: normalizeCategory(data.category || data.subtype || 'article'),
    kind: normalizeKind(data.kind || data.category || data.subtype || 'agent-asset'),
    subtype: normalizeSubtype(data.subtype || data.category || 'article'),
    summary: data.summary || data.description || '',
    source: data.source || detectSource(data.url || ''),
    tags: normalizeTags(data.tags, data.subtype || data.category || 'article'),
    featured: data.featured || false
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
    filteredChanges.title = changes.title !== undefined ? changes.title : changes.titel;
  }
  if (changes.url !== undefined) {
    filteredChanges.url = changes.url;
  }
  if (changes.description !== undefined || changes.beschreibung !== undefined) {
    filteredChanges.description = changes.description !== undefined ? changes.description : changes.beschreibung;
  }
  if (changes.detailContent !== undefined || changes.detailInhalt !== undefined || changes.content !== undefined || changes.inhalt !== undefined) {
    filteredChanges.detailContent = changes.detailContent !== undefined
      ? changes.detailContent
      : changes.detailInhalt !== undefined
        ? changes.detailInhalt
        : changes.content !== undefined
          ? changes.content
          : changes.inhalt;
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
    filteredChanges.summary = changes.summary !== undefined ? changes.summary : changes.zusammenfassung;
  }
  if (changes.source !== undefined || changes.quelle !== undefined) {
    filteredChanges.source = changes.source !== undefined ? changes.source : changes.quelle;
  }
  if (changes.tags !== undefined || changes.schlagwoerter !== undefined) {
    filteredChanges.tags = normalizeTags(changes.tags !== undefined ? changes.tags : changes.schlagwoerter, changes.subtype || changes.category);
  }
  if (changes.featured !== undefined) {
    filteredChanges.featured = changes.featured;
  }

  return store.updateItem(FILE_NAME, id, filteredChanges);
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
  remove
};
