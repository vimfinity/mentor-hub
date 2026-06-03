import * as api from '../../services/api-client.js';
import { fetchQuery, invalidateQuery, invalidateQueriesByPrefix } from '../../services/query-cache.js';
import { t, getLanguage } from '../../services/i18n.js';
import { showError } from '../../components/toast.js';
import { escapeHtml } from '../../components/modal.js';

export const SESSION_CACHE_KEY = 'admin:session';
export const SURVEYS_CACHE_KEY = 'admin:surveys';
export const FEED_ADMIN_CACHE_KEY = 'admin:feed';
export const CONCERNS_CACHE_KEY = 'admin:concerns';
export const ITEMS_PER_ADMIN_PAGE = 8;
export const CONTENT_LOCALES = ['de-DE', 'en-US'];

export function getLocalizedField(item, field, locale) {
  const localized = item?.[field + 'Localized'];
  if (localized && typeof localized === 'object') {
    return localized[locale] || '';
  }

  return locale === 'de-DE' ? (item?.[field] || '') : '';
}

export function renderLocalizedInput({ idBase, label, value = {}, required = false, textarea = false, rows = 3, maxlength = 200, placeholder = '' }) {
  return `
    <div class="form-group">
      <label class="form-label">${label}${required ? ' *' : ''}</label>
      <div class="feed-form-row">
        ${CONTENT_LOCALES.map((locale) => {
          const inputId = `${idBase}-${locale}`;
          const text = escapeHtml(value[locale] || '');
          const localeLabel = locale === 'de-DE' ? 'DE' : 'EN';
          return `
            <div class="form-group">
              <label class="form-label" for="${inputId}">${localeLabel}</label>
              ${textarea
                ? `<textarea class="form-textarea" id="${inputId}" rows="${rows}" maxlength="${maxlength}" placeholder="${escapeHtml(placeholder)}">${text}</textarea>`
                : `<input type="text" class="form-input" id="${inputId}" maxlength="${maxlength}" value="${text}" placeholder="${escapeHtml(placeholder)}">`
              }
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

export function readLocalizedField(overlay, idBase) {
  return {
    'de-DE': (overlay.querySelector(`#${idBase}-de-DE`)?.value || '').trim(),
    'en-US': (overlay.querySelector(`#${idBase}-en-US`)?.value || '').trim()
  };
}

export function hasAnyLocalizedText(value) {
  return CONTENT_LOCALES.some((locale) => String(value?.[locale] || '').trim().length > 0);
}

export function formatDate(value) {
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US';
  return new Date(value).toLocaleDateString(locale);
}

export function formatDateTime(value) {
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US';
  return new Date(value).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDateTimeInput(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

export function parseDateTimeInput(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function getFeedTypeLabels() {
  return {
    announcement: 'News',
    release: 'Release',
    article: t('feed.article'),
    tool: t('feed.tool'),
    skill: t('feed.skill'),
    video: t('feed.video'),
    tutorial: t('feed.tutorial'),
    comparison: t('feed.comparison'),
    playbook: t('feed.playbook'),
    'use-case': t('feed.useCase'),
    onboarding: t('feed.onboarding'),
    mcp: t('feed.mcp'),
    agent: t('feed.agent'),
    'agents-md': t('feed.agentsMd'),
    template: t('feed.template'),
    script: t('feed.script'),
    'prompt-pack': t('feed.promptPack'),
    repo: t('feed.repo')
  };
}

export const FEED_KIND_OPTIONS = ['update', 'guide', 'agent-asset'];
export const FEED_SUBTYPES_BY_KIND = {
  update: ['announcement', 'release', 'article', 'video'],
  guide: ['tutorial', 'playbook', 'use-case', 'onboarding', 'comparison'],
  'agent-asset': ['skill', 'mcp', 'agents-md', 'agent', 'template', 'script', 'prompt-pack', 'repo', 'tool']
};

export function getFeedKindLabel(kind) {
  if (kind === 'guide') return t('feed.filter_guide');
  if (kind === 'agent-asset') return t('feed.filter_agent_asset');
  if (kind === 'update') return t('feed.filter_update');
  return kind || '';
}

export async function fetchAdminSession() {
  return fetchQuery({
    key: SESSION_CACHE_KEY,
    ttlMs: 15 * 1000,
    fetchFunction: () => api.get('/api/admin/session')
  });
}

export function invalidateAdminSession() {
  invalidateQuery(SESSION_CACHE_KEY);
}

export function invalidateAdminSurveys() {
  invalidateQuery(SURVEYS_CACHE_KEY);
  invalidateQueriesByPrefix([SURVEYS_CACHE_KEY]);
  invalidateQueriesByPrefix(['surveys']);
}

export function invalidateAdminFeed() {
  invalidateQuery(FEED_ADMIN_CACHE_KEY);
  invalidateQueriesByPrefix([FEED_ADMIN_CACHE_KEY]);
  invalidateQueriesByPrefix(['feed']);
}

export function invalidateAdminConcerns() {
  invalidateQuery(CONCERNS_CACHE_KEY);
}

export function handleUnauthorizedResponse(response, navigateTo) {
  if (response && response.status === 401) {
    api.removeToken();
    invalidateAdminSession();
    showError(t('admin.sessionExpired'));
    navigateTo('/admin', { replace: true, force: true });
    return true;
  }

  return false;
}

export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(String(reader.result || '').replace(/^data:[^,]+,/, ''));
    });
    reader.addEventListener('error', () => reject(reader.error || new Error('File could not be read')));
    reader.readAsDataURL(file);
  });
}

export function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace('.0', '') + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1).replace('.0', '') + ' MB';
}
