import * as api from '../services/api-client.js';
import { fetchQuery } from '../services/query-cache.js';
import { t, getLocale } from '../services/i18n.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';
import { mountRichDocument } from '../services/rich-content.js';
import { showSuccess } from './toast.js';

const DETAIL_CACHE_TTL_MS = 60 * 1000;

/**
 * Renders the full detail page for a single feed item.
 * Reachable via /feed/:id; internal items use this as their canonical view.
 */
async function render(container, context = {}) {
  const id = extractIdFromPath(context.path);
  if (!id) {
    renderNotFound(container, context);
    return;
  }

  const response = await fetchQuery({
    key: ['feed-detail', getLocale(), id],
    fetchFunction: () => api.get('/api/feed/' + encodeURIComponent(id)),
    ttlMs: DETAIL_CACHE_TTL_MS
  });

  if (!response.ok || !response.data) {
    renderNotFound(container, context);
    return;
  }

  const item = response.data;
  const detailContent = (item.detailContent || item.content || item.description || item.summary || '').trim();
  const sourceLabel = formatSourceLabel(item.source);
  const visibleTags = getVisibleTags(item);
  const attachments = Array.isArray(item.attachments) ? item.attachments : [];
  const config = getTypeConfig(item);

  container.innerHTML = `
    <article class="feed-detail-page">
      <header class="feed-detail-header">
        <div class="feed-detail-meta">
          <span class="feed-card-type ${escapeHtml(config.accent)}">${escapeHtml(t(config.labelKey))}</span>
          <time class="feed-card-time">${escapeHtml(formatDate(item.createdAt))}</time>
          ${sourceLabel ? `<span class="feed-detail-source">${escapeHtml(sourceLabel)}</span>` : ''}
        </div>
        <h1 class="feed-detail-title">${escapeHtml(item.title)}</h1>
        ${item.summary ? `<p class="feed-detail-lead">${escapeHtml(item.summary)}</p>` : ''}
        <div class="feed-detail-actions">
          <button class="tab-link tab-link-utility tab-link-icon" type="button" data-copy-article-link aria-label="Link copy" title="Link copy">
            <span class="tab-icon">${icon('link', 16)}</span>
          </button>
        </div>
      </header>

      ${item.imageUrl ? `<img class="feed-detail-image" src="${escapeHtml(item.imageUrl)}" alt="">` : ''}

      ${detailContent ? `
        <div class="feed-detail-content" data-rich-host></div>
      ` : `
        <p class="feed-detail-empty">${escapeHtml(t('feed.detailEmpty'))}</p>
      `}

      ${visibleTags.length > 0 ? `
        <div class="feed-detail-tags">
          ${visibleTags.map((tag) => `<span class="feed-card-tag">${escapeHtml(formatTag(tag))}</span>`).join('')}
        </div>
      ` : ''}

      ${attachments.length > 0 ? `
        <section class="feed-detail-attachments" aria-label="Downloads">
          <h2>Downloads</h2>
          <div class="feed-detail-attachment-list">
            ${attachments.map((attachment) => `
              <a class="feed-detail-attachment" href="${escapeHtml(attachment.url || '')}" download>
                ${icon('fileText', 16)}
                <span>${escapeHtml(attachment.label || attachment.originalName || attachment.filename || 'Download')}</span>
                ${attachment.sizeBytes ? `<small>${escapeHtml(formatBytes(attachment.sizeBytes))}</small>` : ''}
              </a>
            `).join('')}
          </div>
        </section>
      ` : ''}

      ${item.url ? `
        <a class="btn btn-secondary feed-detail-external"
          href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
          ${icon('externalLink', 14)}
          <span>${escapeHtml(extractDomain(item.url))}</span>
        </a>
      ` : ''}
    </article>
  `;

  const richHost = container.querySelector('[data-rich-host]');
  if (richHost && detailContent) {
    mountRichDocument(richHost, detailContent, {
      minHeight: 0,
      className: 'feed-detail-iframe'
    });
  }

  const copyButton = container.querySelector('[data-copy-article-link]');
  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      await copyToClipboard(new URL('/' + getLocale() + '/feed/' + encodeURIComponent(item.id), window.location.origin).href);
      showSuccess('Link copied');
    });
  }
}

function preload(context = {}) {
  const id = extractIdFromPath(context.path);
  if (!id) {
    return Promise.resolve();
  }
  return fetchQuery({
    key: ['feed-detail', getLocale(), id],
    fetchFunction: () => api.get('/api/feed/' + encodeURIComponent(id)),
    ttlMs: DETAIL_CACHE_TTL_MS
  });
}

function renderNotFound(container, context) {
  container.innerHTML = `
    <div class="feed-empty">
      <div class="feed-empty-icon">${icon('alertCircle', 56)}</div>
      <h2 class="feed-empty-title">${escapeHtml(t('feed.detailMissingTitle'))}</h2>
      <p class="feed-empty-text">${escapeHtml(t('feed.detailMissingText'))}</p>
      <a class="btn btn-secondary" href="/" data-back="1" style="margin-top: 1rem;">
        ${escapeHtml(t('feed.backToFeed'))}
      </a>
    </div>
  `;

  const backLink = container.querySelector('[data-back="1"]');
  if (backLink) {
    backLink.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      context.navigateTo?.('/');
    });
  }
}

function extractIdFromPath(path) {
  if (!path) {
    return null;
  }
  const match = String(path).match(/^(?:\/(?:de-DE|en-US))?\/feed\/([^/?#]+)/);
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch (error) {
    return match[1];
  }
}

function formatDate(value) {
  if (!value) {
    return '';
  }
  const lang = document.documentElement.lang || 'de-DE';
  return new Date(value).toLocaleDateString(lang.startsWith('de') ? 'de-DE' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.substring(0, 30);
  }
}

function formatTag(tag) {
  return tag
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((ptype) => ptype.charAt(0).toUpperCase() + ptype.slice(1))
    .join(' ');
}

function formatSourceLabel(source) {
  if (!source || source === 'internal') {
    return '';
  }
  const known = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    github: 'GitHub',
    mcp: 'MCP'
  };
  return known[source] || formatTag(source);
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace('.0', '') + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1).replace('.0', '') + ' MB';
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

function getVisibleTags(item) {
  const blocked = new Set([item.kind, item.type, item.subtype, item.source].filter(Boolean));
  return (item.tags || []).filter((tag) => !blocked.has(tag)).slice(0, 6);
}

const TYPE_CONFIG = {
  release: { labelKey: 'feed.release', accent: 'accent-release' },
  announcement: { labelKey: 'feed.announcement', accent: 'accent-announcement' },
  article: { labelKey: 'feed.article', accent: 'accent-article' },
  tool: { labelKey: 'feed.tool', accent: 'accent-tool' },
  skill: { labelKey: 'feed.skill', accent: 'accent-skill' },
  video: { labelKey: 'feed.video', accent: 'accent-video' },
  tutorial: { labelKey: 'feed.tutorial', accent: 'accent-tutorial' },
  comparison: { labelKey: 'feed.comparison', accent: 'accent-tutorial' },
  playbook: { labelKey: 'feed.playbook', accent: 'accent-article' },
  'use-case': { labelKey: 'feed.useCase', accent: 'accent-article' },
  onboarding: { labelKey: 'feed.onboarding', accent: 'accent-tutorial' },
  mcp: { labelKey: 'feed.mcp', accent: 'accent-tool' },
  agent: { labelKey: 'feed.agent', accent: 'accent-skill' },
  'agents-md': { labelKey: 'feed.agentsMd', accent: 'accent-article' },
  template: { labelKey: 'feed.template', accent: 'accent-article' },
  script: { labelKey: 'feed.script', accent: 'accent-tool' },
  'prompt-pack': { labelKey: 'feed.promptPack', accent: 'accent-skill' },
  repo: { labelKey: 'feed.repo', accent: 'accent-tool' }
};

function getTypeConfig(item) {
  return TYPE_CONFIG[item.subtype] || TYPE_CONFIG[item.type] || TYPE_CONFIG.article;
}

export { render, preload };
