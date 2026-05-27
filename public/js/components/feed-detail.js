import * as api from '../services/api-client.js';
import { holeAbfrage } from '../services/query-cache.js';
import { t } from '../services/i18n.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';
import { mountRichDocument } from '../services/rich-content.js';

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

  const response = await holeAbfrage({
    schluessel: ['feed-detail', id],
    abrufFunktion: () => api.get('/api/feed/' + encodeURIComponent(id)),
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
  const config = getTypeConfig(item);

  container.innerHTML = `
    <article class="feed-detail-page">
      <a class="feed-detail-back" href="/" data-back="1">
        ${icon('externalLink', 14)}
        <span>${escapeHtml(t('feed.backToFeed'))}</span>
      </a>

      <header class="feed-detail-header">
        <div class="feed-detail-meta">
          <span class="feed-card-type ${escapeHtml(config.accent)}">${escapeHtml(t(config.labelKey))}</span>
          <time class="feed-card-zeit">${escapeHtml(formatDate(item.createdAt))}</time>
          ${sourceLabel ? `<span class="feed-detail-source">${escapeHtml(sourceLabel)}</span>` : ''}
        </div>
        <h1 class="feed-detail-titel">${escapeHtml(item.title)}</h1>
        ${item.summary ? `<p class="feed-detail-lead">${escapeHtml(item.summary)}</p>` : ''}
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

      ${item.url ? `
        <a class="btn btn-sekundaer feed-detail-external"
          href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
          ${icon('externalLink', 14)}
          <span>${escapeHtml(extractDomain(item.url))}</span>
        </a>
      ` : ''}
    </article>
  `;

  const richHost = container.querySelector('[data-rich-host]');
  if (richHost && detailContent) {
    mountRichDocument(richHost, detailContent, { minHeight: 240, className: 'feed-detail-iframe' });
  }

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

function preload(context = {}) {
  const id = extractIdFromPath(context.path);
  if (!id) {
    return Promise.resolve();
  }
  return holeAbfrage({
    schluessel: ['feed-detail', id],
    abrufFunktion: () => api.get('/api/feed/' + encodeURIComponent(id)),
    ttlMs: DETAIL_CACHE_TTL_MS
  });
}

function renderNotFound(container, context) {
  container.innerHTML = `
    <div class="feed-leer">
      <div class="feed-leer-icon">${icon('alertCircle', 56)}</div>
      <h2 class="feed-leer-titel">${escapeHtml(t('feed.detailMissingTitle'))}</h2>
      <p class="feed-leer-text">${escapeHtml(t('feed.detailMissingText'))}</p>
      <a class="btn btn-sekundaer" href="/" data-back="1" style="margin-top: 1rem;">
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
  const match = String(path).match(/^\/feed\/([^/?#]+)/);
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
  const lang = document.documentElement.lang || 'de';
  return new Date(value).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', {
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
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
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
