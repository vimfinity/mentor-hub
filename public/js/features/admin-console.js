import * as api from '../services/api-client.js';
import { fetchQuery, invalidateQuery, invalidateQueriesByPrefix } from '../services/query-cache.js';
import { t, getLanguage } from '../services/i18n.js';
import { normalizeSelection, paginateItems } from '../services/view-state.js';
import { showError, showSuccess } from '../components/toast.js';
import { escapeHtml, openModal, confirmDialog } from '../components/modal.js';
import { renderAdminSection, renderAdminPanel, renderAdminEmptyState } from '../components/admin-ui.js';
import { renderListControls, bindListControls } from '../components/list-controls.js';
import { icon } from '../components/icons.js';
import { renderSelect, bindSelect } from '../components/select.js';
import { mountMarkdownEditor } from '../components/markdown-editor.js';
import { renderResponsiveImage } from '../components/responsive-image.js';
import { copySurveyLink } from '../components/survey-detail.js';

const SESSION_CACHE_KEY = 'admin:session';
const SURVEYS_CACHE_KEY = 'admin:surveys';
const FEED_ADMIN_CACHE_KEY = 'admin:feed';
const CONCERNS_CACHE_KEY = 'admin:concerns';
const ITEMS_PER_ADMIN_PAGE = 8;
const CONTENT_LOCALES = ['de-DE', 'en-US'];

function getLocalizedField(item, field, locale) {
  const localized = item?.[field + 'Localized'];
  if (localized && typeof localized === 'object') {
    return localized[locale] || '';
  }

  return locale === 'de-DE' ? (item?.[field] || '') : '';
}

function renderLocalizedInput({ idBase, label, value = {}, required = false, textarea = false, rows = 3, maxlength = 200, placeholder = '' }) {
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

function readLocalizedField(overlay, idBase) {
  return {
    'de-DE': (overlay.querySelector(`#${idBase}-de-DE`)?.value || '').trim(),
    'en-US': (overlay.querySelector(`#${idBase}-en-US`)?.value || '').trim()
  };
}

function hasAnyLocalizedText(value) {
  return CONTENT_LOCALES.some((locale) => String(value?.[locale] || '').trim().length > 0);
}

const SECTION_META = {
  feed: { key: 'feed', path: '/admin/feed', icon: 'newspaper' },
  surveys: { key: 'surveys', path: '/admin/surveys', icon: 'clipboardList' },
  concerns: { key: 'concerns', path: '/admin/concerns', icon: 'messageSquare' }
};

function formatDate(value) {
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US';
  return new Date(value).toLocaleDateString(locale);
}

function formatDateTime(value) {
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US';
  return new Date(value).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDateTimeInput(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function parseDateTimeInput(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getFeedTypeLabels() {
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

const FEED_KIND_OPTIONS = ['update', 'guide', 'agent-asset'];
const FEED_SUBTYPES_BY_KIND = {
  update: ['announcement', 'release', 'article', 'video'],
  guide: ['tutorial', 'playbook', 'use-case', 'onboarding', 'comparison'],
  'agent-asset': ['skill', 'mcp', 'agents-md', 'agent', 'template', 'script', 'prompt-pack', 'repo', 'tool']
};

function getFeedKindLabel(kind) {
  if (kind === 'guide') return t('feed.filter_guide');
  if (kind === 'agent-asset') return t('feed.filter_agent_asset');
  if (kind === 'update') return t('feed.filter_update');
  return kind || '';
}

async function fetchAdminSession() {
  return fetchQuery({
    key: SESSION_CACHE_KEY,
    ttlMs: 15 * 1000,
    fetchFunction: () => api.get('/api/admin/session')
  });
}

function preload() {
  return fetchAdminSession();
}

function invalidateAdminSession() {
  invalidateQuery(SESSION_CACHE_KEY);
}

function invalidateAdminSurveys() {
  invalidateQuery(SURVEYS_CACHE_KEY);
  invalidateQueriesByPrefix([SURVEYS_CACHE_KEY]);
  invalidateQueriesByPrefix(['surveys']);
}

function invalidateAdminFeed() {
  invalidateQuery(FEED_ADMIN_CACHE_KEY);
  invalidateQueriesByPrefix([FEED_ADMIN_CACHE_KEY]);
  invalidateQueriesByPrefix(['feed']);
}

function invalidateAdminConcerns() {
  invalidateQuery(CONCERNS_CACHE_KEY);
}

function handleUnauthorizedResponse(response, navigateTo) {
  if (response && response.status === 401) {
    api.removeToken();
    invalidateAdminSession();
    showError(t('admin.sessionExpired'));
    navigateTo('/admin', { replace: true, force: true });
    return true;
  }

  return false;
}

async function render(container, context) {
  const section = SECTION_META[context.section] ? context.section : 'feed';
  const session = await fetchAdminSession();

  if (handleUnauthorizedResponse(session, context.navigateTo)) {
    return;
  }

  const sessionData = session.ok ? session.data : null;

  if (!session.ok || !sessionData) {
    renderAdminError(container);
    return;
  }

  if (!sessionData.configured) {
    renderSetup(container, context);
    return;
  }

  if (!sessionData.authenticated) {
    renderLogin(container, context);
    return;
  }

  await renderAdminShell(container, context, section);
}

function renderAdminError(container) {
  container.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <div class="login-icon">${icon('alertCircle', 24)}</div>
        <h1 class="login-title">${t('admin.pageTitle')}</h1>
        <p class="login-subtitle">${t('general.error')}</p>
      </div>
    </div>
  `;
}

function renderSetup(container, context) {
  container.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <div class="login-icon">${icon('settings', 24)}</div>
        <h1 class="login-title">${t('admin.setup')}</h1>
        <p class="login-subtitle">${t('admin.setupDescription')}</p>
        <form id="setup-form">
          <div class="form-group">
            <label class="form-label" for="setup-password">${t('admin.password')}</label>
            <input type="password" id="setup-password" class="form-input"
              minlength="8" required autocomplete="new-password">
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%">
            ${t('admin.save')}
          </button>
        </form>
      </div>
    </div>
  `;

  container.querySelector('#setup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = container.querySelector('#setup-password').value;
    const result = await api.post('/api/admin/setup', { password });

    if (!result.ok) {
      showError(result.data?.error || t('general.error'));
      return;
    }

    invalidateAdminSession();
    showSuccess(t('admin.setupSuccess'));
    await render(container, context);
  });
}

function renderLogin(container, context) {
  container.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <div class="login-icon">${icon('layoutDashboard', 24)}</div>
        <h1 class="login-title">${t('admin.login')}</h1>
        <p class="login-subtitle">${t('admin.pageTitle')}</p>
        <form id="login-form">
          <div class="form-group">
            <label class="form-label" for="login-password">${t('admin.password')}</label>
            <input type="password" id="login-password" class="form-input"
              required autocomplete="current-password">
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%">
            ${t('admin.signIn')}
          </button>
        </form>
      </div>
    </div>
  `;

  container.querySelector('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = container.querySelector('#login-password').value;
    const result = await api.post('/api/admin/login', { password });

    if (result.ok && result.data?.token) {
      api.setToken(result.data.token);
      invalidateAdminSession();
      showSuccess(t('admin.signInSuccess'));
      context.navigateTo('/admin/feed', { replace: true, force: true });
      return;
    }

    showError(result.data?.error || t('admin.error'));
  });
}

async function renderAdminShell(container, context, section) {
  container.innerHTML = `
    <div class="admin-shell">
      <nav class="sub-nav" aria-label="${escapeHtml(t('admin.pageTitle'))}">
        <div class="sub-nav-tabs">
          ${Object.keys(SECTION_META).map((key) => `
            <a class="sub-nav-tab ${section === key ? 'active' : ''}"
              href="${SECTION_META[key].path}" data-admin-route="${key}">
              ${icon(SECTION_META[key].icon, 15)}
              <span>${t('admin.' + key)}</span>
            </a>
          `).join('')}
        </div>
        <button class="sub-nav-action" id="sign-out-button" type="button">
          ${icon('logOut', 14)}
          <span>${t('admin.signOut')}</span>
        </button>
      </nav>
      <div class="admin-content" id="admin-content">
        <p class="section-description">${t('general.loading')}</p>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-admin-route]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      context.navigateTo(link.getAttribute('href'));
    });
  });

  container.querySelector('#sign-out-button').addEventListener('click', async () => {
    await api.post('/api/admin/logout', {});
    api.removeToken();
    invalidateAdminSession();
    invalidateAdminSurveys();
    invalidateAdminFeed();
    invalidateAdminConcerns();
    context.navigateTo('/admin', { replace: true, force: true });
  });

  const adminContent = container.querySelector('#admin-content');

  switch (section) {
    case 'surveys':
      await renderSurveysAdmin(adminContent, context);
      break;
    case 'concerns':
      await renderConcernsAdmin(adminContent, context);
      break;
    case 'feed':
    default:
      await renderFeedAdmin(adminContent, context);
      break;
  }
}

async function renderSurveysAdmin(container, context) {
  const response = await fetchQuery({
    key: [SURVEYS_CACHE_KEY, getLanguage()],
    ttlMs: 30 * 1000,
    fetchFunction: () => api.get('/api/admin/surveys')
  });

  if (handleUnauthorizedResponse(response, context.navigateTo)) {
    return;
  }

  const surveys = response.ok ? response.data : [];
  const sortOrder = normalizeSelection(
    context.searchParams?.get('sort'),
    ['manual', 'newest', 'oldest', 'title-asc', 'title-desc', 'responses-desc', 'status'],
    'manual'
  );
  const sortedSurveys = sortSurveys(surveys, sortOrder);
  const pagination = paginateItems(sortedSurveys, context.searchParams?.get('page'), ITEMS_PER_ADMIN_PAGE);
  const tablenHtml = surveys.length === 0 ? renderAdminEmptyState(t('survey.empty')) : renderAdminPanel(`
    ${renderListControls({
      sortOptions: [
        { value: 'manual', label: t('admin.sortManual') },
        { value: 'newest', label: t('general.sortNewest') },
        { value: 'oldest', label: t('general.sortOldest') },
        { value: 'responses-desc', label: t('admin.sortResponsesDesc') },
        { value: 'status', label: t('admin.sortStatus') },
        { value: 'title-asc', label: t('general.sortTitleAsc') },
        { value: 'title-desc', label: t('general.sortTitleDesc') }
      ],
      currentSort: sortOrder,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems,
      resultLabel: t('general.resultsCount').replace('{count}', String(pagination.totalItems))
    })}
    <table class="table">
      <thead>
        <tr>
          <th>${t('admin.title')}</th>
          <th>${t('admin.date')}</th>
          <th>${t('admin.status')}</th>
          <th>${t('admin.responses')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${pagination.items.map((survey, index) => {
          const absoluteIndex = pagination.startIndex + index;
          const isFirstSurvey = absoluteIndex === 0;
          const isLastSurvey = absoluteIndex === sortedSurveys.length - 1;
          return `
          <tr>
            <td data-label="${escapeHtml(t('admin.title'))}">${escapeHtml(survey.title)}</td>
            <td data-label="${escapeHtml(t('admin.date'))}">${escapeHtml(formatDate(survey.createdAt))}</td>
            <td data-label="${escapeHtml(t('admin.status'))}">
              <span class="status-badge ${survey.active ? 'status-open' : 'status-done'}">
                ${survey.active ? t('admin.active') : t('admin.inactive')}
              </span>
            </td>
            <td data-label="${escapeHtml(t('admin.responses'))}">${(survey.responses || []).length}</td>
            <td class="table-aktionen" data-label="${escapeHtml(t('general.actions'))}">
              ${sortOrder === 'manual' ? `
                <button class="btn btn-small btn-secondary" data-action="move-up" data-id="${survey.id}" title="${escapeHtml(t('admin.moveUp'))}" aria-label="${escapeHtml(t('admin.moveUp'))}" ${isFirstSurvey ? 'disabled' : ''}>
                  ${icon('chevronUp', 16)}
                </button>
                <button class="btn btn-small btn-secondary" data-action="move-down" data-id="${survey.id}" title="${escapeHtml(t('admin.moveDown'))}" aria-label="${escapeHtml(t('admin.moveDown'))}" ${isLastSurvey ? 'disabled' : ''}>
                  ${icon('chevronDown', 16)}
                </button>
              ` : ''}
              ${survey.active ? `
                <button class="btn btn-small btn-secondary" data-action="copy-link" data-id="${survey.id}" title="${escapeHtml(t('survey.copyLink'))}" aria-label="${escapeHtml(t('survey.copyLink'))}">
                  ${icon('link', 16)}
                </button>
              ` : ''}
              <button class="btn btn-small btn-secondary" data-action="toggle" data-id="${survey.id}">
                ${survey.active ? icon('pause', 16) : icon('play', 16)}
              </button>
              <button class="btn btn-small btn-secondary" data-action="details" data-id="${survey.id}">
                ${icon('eye', 16)}
              </button>
              <button class="btn btn-small btn-danger" data-action="delete" data-id="${survey.id}">
                ${icon('trash', 16)}
              </button>
            </td>
          </tr>
        `;
        }).join('')}
      </tbody>
    </table>
  `, 'admin-panel-table');

  container.innerHTML = renderAdminSection({
    title: t('admin.surveys'),
    description: t('admin.surveysDescription'),
    iconName: 'clipboardList',
    actions: `<button class="btn btn-primary" id="create-survey-button">${icon('plus', 14)} ${t('admin.create')}</button>`,
    content: tablenHtml
  });

  container.querySelector('#create-survey-button').addEventListener('click', () => {
    openSurveyForm(container, context);
  });

  bindListControls(container, {
    onSort: (value) => context.setSearchParams?.({ sort: value === 'manual' ? null : value, page: null }),
    onPage: (page) => context.setSearchParams?.({ page: page <= 1 ? null : page })
  });

  container.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      const action = button.dataset.action;
      const survey = surveys.find((item) => item.id === id);

      if (action === 'copy-link' && survey) {
        await copySurveyLink(survey.id);
        return;
      }

      if ((action === 'move-up' || action === 'move-down') && survey) {
        const result = await api.post('/api/admin/surveys/' + id + '/move', {
          direction: action === 'move-up' ? 'up' : 'down'
        });
        if (handleUnauthorizedResponse(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        invalidateAdminSurveys();
        await renderSurveysAdmin(container, context);
        return;
      }

      if (action === 'toggle' && survey) {
        const result = await api.put('/api/admin/surveys/' + id, { active: !survey.active });
        if (handleUnauthorizedResponse(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        invalidateAdminSurveys();
        await renderSurveysAdmin(container, context);
        return;
      }

      if (action === 'delete') {
        confirmDialog(t('admin.confirmation'), async () => {
          const result = await api.remove('/api/admin/surveys/' + id);
          if (handleUnauthorizedResponse(result, context.navigateTo)) {
            return;
          }
          if (!result.ok) {
            showError(result.data?.error || t('general.error'));
            return;
          }

          invalidateAdminSurveys();
          showSuccess(t('admin.deleted'));
          await renderSurveysAdmin(container, context);
        });
        return;
      }

      if (action === 'details' && survey) {
        openSurveyDetails(survey);
      }
    });
  });
}

function openSurveyForm(container, context) {
  openModal({
    title: t('admin.create') + ': ' + t('admin.surveys'),
    content: `
      <form id="new-survey-form">
        ${renderLocalizedInput({ idBase: 'new-survey-title', label: t('admin.title'), required: true })}
        ${renderLocalizedInput({ idBase: 'new-survey-description', label: t('admin.description'), textarea: true, maxlength: 2000 })}
        <div class="form-group">
          <label class="form-label">${t('admin.questions')}</label>
          <div id="question-list"></div>
          <button type="button" class="btn btn-secondary btn-small" id="add-question-button">+ ${t('admin.add')}</button>
        </div>
      </form>
    `,
    confirmText: t('admin.save'),
    cancelText: t('admin.cancel'),
    onConfirm: async (overlay) => {
      const title = readLocalizedField(overlay, 'new-survey-title');
      if (!hasAnyLocalizedText(title)) {
        return;
      }

      const questions = collectQuestionsFromForm(overlay);
      if (questions.length === 0) {
        showError(t('admin.atLeastOneQuestion'));
        return;
      }

      const description = readLocalizedField(overlay, 'new-survey-description');
      const result = await api.post('/api/admin/surveys', { title, description, questions });
      if (handleUnauthorizedResponse(result, context.navigateTo)) {
        return;
      }
      if (!result.ok) {
        showError(result.data?.error || t('general.error'));
        return;
      }

      invalidateAdminSurveys();
      showSuccess(t('admin.surveyCreated'));
      await renderSurveysAdmin(container, context);
    }
  });

  const questionList = document.querySelector('#question-list');
  const addQuestionButton = document.querySelector('#add-question-button');
  let questionCounter = 0;

  addQuestionButton.addEventListener('click', () => {
    questionCounter += 1;
    const wrapper = document.createElement('div');
    wrapper.className = 'admin-question-item';
    wrapper.innerHTML = `
      ${renderLocalizedInput({ idBase: 'question-text-' + questionCounter, label: t('admin.question') + ' ' + questionCounter, required: true, maxlength: 500 })}
      ${renderSelect({
        name: 'question-type-' + questionCounter,
        value: 'free_text',
        size: 'klein',
        options: [
          { value: 'free_text', label: t('admin.freeText') },
          { value: 'rating', label: t('admin.rating') },
          { value: 'yes_no', label: t('admin.yesNo') }
        ],
        ariaLabel: t('admin.question')
      })}
    `;
    wrapper.dataset.questionId = String(questionCounter);
    wrapper.querySelector('[data-select]').classList.add('question-type-select');
    questionList.appendChild(wrapper);
    bindSelect(wrapper.querySelector('.question-type-select'), () => {});
  });

  addQuestionButton.click();
}

function collectQuestionsFromForm(overlay) {
  const questions = [];
  const items = overlay.querySelectorAll('.admin-question-item');

  items.forEach((item) => {
    const questionId = item.dataset.questionId;
    const typeSelect = item.querySelector('.question-type-select');
    const text = readLocalizedField(item, 'question-text-' + questionId);
    if (!hasAnyLocalizedText(text)) {
      return;
    }
    questions.push({
      text,
      type: typeSelect ? typeSelect.dataset.value : 'free_text'
    });
  });

  return questions;
}

function openSurveyDetails(survey) {
  const responseHtml = (survey.responses || []).map((response) => {
    const submittedAt = formatDate(response.submittedAt);
    return `
      <div class="admin-detail-item">
        <div class="admin-detail-meta">
          ${response.name ? escapeHtml(response.name) : '<em>' + escapeHtml(t('admin.anonymous')) + '</em>'}
          <span class="admin-detail-time">${submittedAt}</span>
        </div>
        <div class="admin-detail-body">${response.responses.map((answer, index) => `
          <p><strong>${escapeHtml(survey.questions[index] ? survey.questions[index].text : t('admin.question') + ' ' + (index + 1))}:</strong> ${escapeHtml(String(answer))}</p>
        `).join('')}</div>
      </div>
    `;
  }).join('');

  openModal({
    title: escapeHtml(survey.title) + ' - ' + t('admin.responses'),
    content: responseHtml || '<p>' + escapeHtml(t('admin.noResponses')) + '</p>',
    cancelText: t('general.close')
  });
}

async function renderFeedAdmin(container, context) {
  const response = await fetchQuery({
    key: [FEED_ADMIN_CACHE_KEY, getLanguage()],
    ttlMs: 30 * 1000,
    fetchFunction: () => api.get('/api/feed')
  });

  if (handleUnauthorizedResponse(response, context.navigateTo)) {
    return;
  }

  if (!response.ok) {
    showError(t('general.error'));
    return;
  }

  const feedItems = Array.isArray(response.data) ? response.data : [];
  const kindFilter = normalizeSelection(context.searchParams?.get('kind'), ['all', ...FEED_KIND_OPTIONS], 'all');
  const filteredItems = kindFilter === 'all' ? feedItems : feedItems.filter((item) => item.kind === kindFilter);
  const sortOrder = normalizeSelection(context.searchParams?.get('sort'), ['newest', 'oldest', 'title-asc', 'title-desc'], 'newest');
  const sortedItems = sortFeedItems(filteredItems, sortOrder);
  const pagination = paginateItems(sortedItems, context.searchParams?.get('page'), ITEMS_PER_ADMIN_PAGE);

  const TYPE_LABELS = getFeedTypeLabels();

  const tablenHtml = feedItems.length === 0 ? renderAdminEmptyState(t('feed.emptyTitle'), 'newspaper') : renderAdminPanel(`
    ${renderListControls({
      sortOptions: [
        { value: 'newest', label: t('general.sortNewest') },
        { value: 'oldest', label: t('general.sortOldest') },
        { value: 'title-asc', label: t('general.sortTitleAsc') },
        { value: 'title-desc', label: t('general.sortTitleDesc') }
      ],
      currentSort: sortOrder,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems,
      resultLabel: t('general.resultsCount').replace('{count}', String(pagination.totalItems))
    })}
    <table class="table">
      <thead>
        <tr>
          <th>${t('admin.title')}</th>
          <th>${t('admin.feedKind')}</th>
          <th>${t('admin.category')}</th>
          <th>${t('admin.date')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${pagination.items.map((item) => `
          <tr>
            <td data-label="${escapeHtml(t('admin.title'))}">
              ${escapeHtml(item.title)}
              ${item.featured ? `<span class="status-badge status-open">${t('admin.featured')}</span>` : ''}
            </td>
            <td data-label="${escapeHtml(t('admin.feedKind'))}"><span class="status-badge">${getFeedKindLabel(item.kind)}</span></td>
            <td data-label="${escapeHtml(t('admin.category'))}"><span class="card-category">${TYPE_LABELS[item.type] || item.type}</span></td>
            <td data-label="${escapeHtml(t('admin.date'))}">${formatDateTime(item.createdAt)}</td>
            <td class="table-aktionen" data-label="${escapeHtml(t('general.actions'))}">
              ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="btn btn-small btn-secondary">${icon('externalLink', 14)}</a>` : ''}
              <button class="btn btn-small btn-secondary feed-edit-button" data-id="${item.id}">
                ${icon('edit', 16)}
              </button>
              <button class="btn btn-small btn-danger feed-delete-button" data-id="${item.id}" data-source="${item.feedSource || item.source}">
                ${icon('trash', 16)}
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `, 'admin-panel-table');

  const filterChips = `
    <div class="feed-filter-bar" style="margin-bottom: 0;">
      ${['all', ...FEED_KIND_OPTIONS]
        .filter((f) => f === 'all' || feedItems.some((item) => item.kind === f))
        .map((f) => `
          <button class="feed-filter-chip ${f === kindFilter ? 'active' : ''}" data-kind-filter="${f}">
            ${f === 'all' ? t('feed.filter_all') : getFeedKindLabel(f)}
          </button>
        `).join('')}
    </div>
  `;

  container.innerHTML = renderAdminSection({
    title: t('admin.feed'),
    description: t('admin.feedDescription'),
    iconName: 'newspaper',
    actions: `<button class="btn btn-primary" id="create-feed-button">${icon('plus', 14)} ${t('admin.create')}</button>`,
    content: filterChips + tablenHtml
  });

  bindListControls(container, {
    onSort: (value) => context.setSearchParams?.({ sort: value === 'newest' ? null : value, page: null }),
    onPage: (page) => context.setSearchParams?.({ page: page <= 1 ? null : page })
  });

  container.querySelectorAll('[data-kind-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      context.setSearchParams?.({ kind: btn.dataset.kindFilter === 'all' ? null : btn.dataset.kindFilter, page: null });
    });
  });

  container.querySelector('#create-feed-button').addEventListener('click', () => {
    openFeedForm({ context, mode: 'create' });
  });

  container.querySelectorAll('.feed-edit-button').forEach((button) => {
    button.addEventListener('click', () => {
      const item = feedItems.find((feedItem) => feedItem.id === button.dataset.id);
      if (!item) {
        return;
      }

      openFeedForm({ context, mode: 'edit', item });
    });
  });

  container.querySelectorAll('.feed-delete-button').forEach((button) => {
    button.addEventListener('click', () => {
      confirmDialog(t('admin.confirmation'), async () => {
        const source = button.dataset.source;
        const endpoint = source === 'resource'
          ? '/api/admin/resources/' + button.dataset.id
          : '/api/admin/news/' + button.dataset.id;
        const result = await api.remove(endpoint);
        if (handleUnauthorizedResponse(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        invalidateAdminFeed();
        showSuccess(t('admin.deleted'));
        context.navigateTo('/admin/feed', { force: true });
      });
    });
  });
}

function openFeedForm({ context, mode, item = null }) {
  const isEdit = mode === 'edit';
  const typeLabels = getFeedTypeLabels();
  const editors = {};
  const selectedKind = FEED_KIND_OPTIONS.includes(item?.kind) ? item.kind : 'update';
  const selectedType = item?.subtype || item?.type || FEED_SUBTYPES_BY_KIND[selectedKind][0];
  const titleValue = {
    'de-DE': getLocalizedField(item, 'title', 'de-DE'),
    'en-US': getLocalizedField(item, 'title', 'en-US')
  };
  const urlValue = escapeHtml(item?.url || '');
  const summaryValue = {
    'de-DE': getLocalizedField(item, 'summary', 'de-DE') || getLocalizedField(item, 'content', 'de-DE') || getLocalizedField(item, 'description', 'de-DE'),
    'en-US': getLocalizedField(item, 'summary', 'en-US') || getLocalizedField(item, 'content', 'en-US') || getLocalizedField(item, 'description', 'en-US')
  };
  const contentValue = {
    'de-DE': getLocalizedField(item, 'detailContent', 'de-DE') || getLocalizedField(item, 'content', 'de-DE') || getLocalizedField(item, 'description', 'de-DE'),
    'en-US': getLocalizedField(item, 'detailContent', 'en-US') || getLocalizedField(item, 'content', 'en-US') || getLocalizedField(item, 'description', 'en-US')
  };
  const imageValue = escapeHtml(item?.imageUrl || '');
  const sourceValue = escapeHtml(item?.source || '');
  const tagValue = escapeHtml(Array.isArray(item?.tags) ? item.tags.join(', ') : '');
  const createdAtValue = escapeHtml(formatDateTimeInput(item?.createdAt));
  const isResourceEdit = isEdit && (item?.feedSource === 'resource' || selectedKind !== 'update');
  let selectedImage = item?.image?.url === item?.imageUrl ? item.image : null;
  const kindOptions = FEED_KIND_OPTIONS.map((value) => `
    <option value="${value}" ${value === selectedKind ? 'selected' : ''}>${getFeedKindLabel(value)}</option>
  `).join('');

  const kindSelectOptions = FEED_KIND_OPTIONS.map((value) => ({
    value,
    label: getFeedKindLabel(value)
  }));

  openModal({
    size: 'wide',
    persistent: true,
    title: (isEdit ? t('admin.edit') : t('admin.create')) + ': ' + t('admin.feed'),
    content: `
      <div class="feed-form-layout">
        <aside class="feed-form-side">
          ${renderLocalizedInput({ idBase: 'feed-form-title', label: t('admin.title'), value: titleValue, required: true })}
          <div class="feed-form-row">
            <div class="form-group">
              <label class="form-label">${t('admin.feedKind')}</label>
              ${renderSelect({
                name: 'feed-form-kind',
                value: selectedKind,
                options: kindSelectOptions,
                disabled: isEdit,
                ariaLabel: t('admin.feedKind')
              })}
            </div>
            <div class="form-group">
              <label class="form-label">${t('admin.category')}</label>
              <div id="feed-form-subtype-host"></div>
            </div>
          </div>
          ${renderLocalizedInput({ idBase: 'feed-form-summary', label: t('admin.summary'), value: summaryValue, textarea: true, rows: 3, maxlength: 1000, placeholder: 'Kurze Description, erscheint auf der card im Feed' })}
          <div class="form-group">
            <label class="form-label" for="feed-form-image">${t('admin.imageUrl')}</label>
            <input type="url" class="form-input" id="feed-form-image" maxlength="2000" placeholder="https://..." value="${imageValue}">
            <div class="feed-image-actions">
              <button type="button" class="tab-link tab-link-utility" data-open-media-library>
                ${icon('image', 14)}
                <span class="tab-label">Mediathek</span>
              </button>
              <button type="button" class="tab-link tab-link-utility" data-clear-image>
                ${icon('x', 14)}
                <span class="tab-label">Remove image</span>
              </button>
            </div>
            <label class="attachment-file-picker feed-image-picker">
              <input type="file" data-image-file accept=".png,.jpg,.jpeg,.webp,.gif">
              <span>${icon('image', 14)} Upload image</span>
              <em data-image-file-name>PNG, JPG, WebP oder GIF</em>
            </label>
          </div>
          <div class="form-group">
            <label class="form-label" for="feed-form-url">${t('admin.url')}</label>
            <input type="url" class="form-input" id="feed-form-url" maxlength="2000" placeholder="https://..." value="${urlValue}">
          </div>
          <div class="feed-form-row">
            <div class="form-group">
              <label class="form-label" for="feed-form-source">${t('admin.source')}</label>
              <input type="text" class="form-input" id="feed-form-source" maxlength="100" value="${sourceValue}">
            </div>
            <div class="form-group">
              <label class="form-label" for="feed-form-date">${t('admin.date')}</label>
              <input type="datetime-local" class="form-input" id="feed-form-date" value="${createdAtValue}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="feed-form-tags">${t('admin.tags')}</label>
            <input type="text" class="form-input" id="feed-form-tags" placeholder="mcp, codex" value="${tagValue}">
          </div>
          <label class="checkbox-label">
            <input type="checkbox" id="feed-form-featured" ${item?.featured ? 'checked' : ''}>
            <span>${t('admin.featured')}</span>
          </label>
          ${isResourceEdit ? `
            <div class="feed-form-attachments">
              <div class="feed-form-attachments-header">
                <label class="form-label">Attachments</label>
                <span>Files that appear as downloads on the article.</span>
              </div>
              <div class="feed-form-attachment-list" data-attachment-list></div>
              <div class="feed-form-attachment-upload">
                <label class="attachment-file-picker">
                  <input type="file" data-attachment-file accept=".zip,.pdf,.docx,.xlsx,.pptx,.txt,.md,.json,.png,.jpg,.jpeg,.webp">
                  <span>${icon('fileText', 14)} Select file</span>
                  <em data-attachment-file-name>No file selected</em>
                </label>
                <input type="text" class="form-input" data-attachment-label maxlength="120" placeholder="Display name, optional">
                <button type="button" class="btn btn-secondary" data-attachment-upload>
                  ${icon('plus', 14)}
                  <span>Upload attachment</span>
                </button>
              </div>
            </div>
          ` : ''}
          <div class="feed-form-card-preview">
            <div class="feed-form-card-preview-label">${t('admin.preview') || 'cards-Vorschau'}</div>
            <div class="feed-admin-preview" id="feed-form-preview"></div>
          </div>
        </aside>
        <section class="feed-form-main">
          <div class="form-group form-group-full">
            <label class="form-label feed-form-editor-label">
              ${t('admin.detailContent')}
              <span class="feed-form-editor-sub">${t('admin.detailContentPlaceholder')}</span>
            </label>
            <div class="feed-form-row">
              <div class="form-group form-group-full">
                <label class="form-label">DE</label>
                <div id="feed-form-content-host-de-DE" class="feed-form-editor-host"></div>
              </div>
              <div class="form-group form-group-full">
                <label class="form-label">EN</label>
                <div id="feed-form-content-host-en-US" class="feed-form-editor-host"></div>
              </div>
            </div>
          </div>
        </section>
      </div>
    `,
    confirmText: t('admin.save'),
    cancelText: t('admin.cancel'),
    onConfirm: async (overlay) => {
      const title = readLocalizedField(overlay, 'feed-form-title');
      if (!hasAnyLocalizedText(title)) {
        return;
      }

      const kind = overlay.querySelector('[data-select="feed-form-kind"]').dataset.value;
      const subtype = overlay.querySelector('[data-select="feed-form-subtype"]').dataset.value;
      const url = overlay.querySelector('#feed-form-url').value.trim();
      const summary = readLocalizedField(overlay, 'feed-form-summary');
      const content = {
        'de-DE': (editors['de-DE']?.getValue() || '').trim(),
        'en-US': (editors['en-US']?.getValue() || '').trim()
      };
      const imageUrl = overlay.querySelector('#feed-form-image').value.trim();
      const source = overlay.querySelector('#feed-form-source').value.trim();
      const createdAt = parseDateTimeInput(overlay.querySelector('#feed-form-date').value);
      if (!createdAt) {
        showError('Enter a valid date.');
        return;
      }
      const tags = overlay.querySelector('#feed-form-tags').value.split(',').map((tag) => tag.trim()).filter(Boolean);
      const featured = overlay.querySelector('#feed-form-featured').checked;
      const payload = kind === 'update'
        ? { title, content: summary, detailContent: content, summary, url, imageUrl, source, tags, type: subtype, subtype, featured, createdAt }
        : { title, description: summary, detailContent: content, summary, url, imageUrl, source, tags, kind, category: subtype, subtype, featured, createdAt };
      const endpoint = isEdit
        ? ((item.feedSource || item.source) === 'resource' ? '/api/admin/resources/' : '/api/admin/news/') + item.id
        : kind === 'update'
          ? '/api/admin/news'
          : '/api/admin/resources';
      const result = isEdit
        ? await api.put(endpoint, payload)
        : await api.post(endpoint, payload);

      if (handleUnauthorizedResponse(result, context.navigateTo)) {
        return;
      }
      if (!result.ok) {
        showError(result.data?.error || t('general.error'));
        return;
      }

      invalidateAdminFeed();
      showSuccess(isEdit ? t('admin.feedUpdated') : t('admin.feedCreated'));
      context.navigateTo('/admin/feed', { force: true });
    }
  });

  const overlay = document.querySelector('.modal-overlay:last-child');
  const kindSelect = overlay.querySelector('[data-select="feed-form-kind"]');
  const subtypeHost = overlay.querySelector('#feed-form-subtype-host');
  const preview = overlay.querySelector('#feed-form-preview');
  let currentAttachments = Array.isArray(item?.attachments) ? [...item.attachments] : [];

  const refreshPreview = () => {
    const imageUrl = overlay.querySelector('#feed-form-image').value.trim();
    const activeLocale = getLanguage() === 'de' ? 'de-DE' : 'en-US';
    const title = readLocalizedField(overlay, 'feed-form-title')[activeLocale] || readLocalizedField(overlay, 'feed-form-title')['de-DE'] || readLocalizedField(overlay, 'feed-form-title')['en-US'];
    const summary = readLocalizedField(overlay, 'feed-form-summary')[activeLocale] || readLocalizedField(overlay, 'feed-form-summary')['de-DE'] || readLocalizedField(overlay, 'feed-form-summary')['en-US'];
    const subtypeRoot = subtypeHost.querySelector('[data-select="feed-form-subtype"]');
    const subtypeValue = subtypeRoot ? subtypeRoot.dataset.value : '';
    preview.innerHTML = `
      ${imageUrl ? renderResponsiveImage({
        image: selectedImage?.url === imageUrl ? selectedImage : null,
        src: imageUrl,
        alt: '',
        sizes: '96px',
        includeDimensions: false
      }) : `<div class="feed-admin-preview-placeholder">${icon('image', 22)}</div>`}
      <div>
        <strong>${escapeHtml(title || t('admin.title'))}</strong>
        <span>${getFeedKindLabel(kindSelect.dataset.value)} - ${typeLabels[subtypeValue] || subtypeValue}</span>
        ${summary ? `<p>${escapeHtml(summary)}</p>` : ''}
      </div>
    `;
  };

  const renderSubtypeSelect = () => {
    const kind = kindSelect.dataset.value;
    const allowed = FEED_SUBTYPES_BY_KIND[kind] || FEED_SUBTYPES_BY_KIND.update;
    const previousRoot = subtypeHost.querySelector('[data-select="feed-form-subtype"]');
    const previousValue = previousRoot ? previousRoot.dataset.value : selectedType;
    const nextSubtype = allowed.includes(previousValue)
      ? previousValue
      : allowed.includes(selectedType)
        ? selectedType
        : allowed[0];
    subtypeHost.innerHTML = renderSelect({
      name: 'feed-form-subtype',
      value: nextSubtype,
      options: allowed.map((value) => ({ value, label: typeLabels[value] || value })),
      ariaLabel: t('admin.category')
    });
    const subtypeRoot = subtypeHost.querySelector('[data-select="feed-form-subtype"]');
    bindSelect(subtypeRoot, () => refreshPreview());
    refreshPreview();
  };

  bindSelect(kindSelect, () => renderSubtypeSelect());
  ['feed-form-title-de-DE', 'feed-form-title-en-US', 'feed-form-summary-de-DE', 'feed-form-summary-en-US', 'feed-form-image'].forEach((id) => {
    overlay.querySelector('#' + id)?.addEventListener('input', refreshPreview);
  });
  renderSubtypeSelect();

  const imageFileInput = overlay.querySelector('[data-image-file]');
  const imageFileName = overlay.querySelector('[data-image-file-name]');
  if (imageFileInput && imageFileName) {
    imageFileInput.addEventListener('change', async () => {
      const file = imageFileInput.files?.[0];
      if (!file) {
        imageFileName.textContent = 'PNG, JPG, WebP oder GIF';
        return;
      }

      imageFileName.textContent = file.name;
      try {
        const contentBase64 = await readFileAsBase64(file);
        const result = await api.post('/api/admin/uploads/images', {
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          contentBase64
        });

        if (handleUnauthorizedResponse(result, context.navigateTo)) {
          return;
        }
        if (!result.ok || !result.data?.url) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        const imageInput = overlay.querySelector('#feed-form-image');
        imageInput.value = result.data.url;
        selectedImage = result.data;
        refreshPreview();
        showSuccess('Image uploaded');
      } finally {
        imageFileInput.value = '';
      }
    });
  }

  const mediaButton = overlay.querySelector('[data-open-media-library]');
  if (mediaButton) {
    mediaButton.addEventListener('click', () => openMediaLibrary({
      context,
      selectedUrl: overlay.querySelector('#feed-form-image').value.trim(),
      onSelect: (url, image) => {
        overlay.querySelector('#feed-form-image').value = url;
        selectedImage = image || null;
        refreshPreview();
      }
    }));
  }

  const clearImageButton = overlay.querySelector('[data-clear-image]');
  if (clearImageButton) {
    clearImageButton.addEventListener('click', () => {
      overlay.querySelector('#feed-form-image').value = '';
      selectedImage = null;
      refreshPreview();
    });
  }

  const attachmentList = overlay.querySelector('[data-attachment-list]');
  const renderAttachments = () => {
    if (!attachmentList) {
      return;
    }

    attachmentList.innerHTML = currentAttachments.length === 0
      ? '<p class="feed-form-attachment-empty">No attachments yet.</p>'
      : currentAttachments.map((attachment) => `
        <div class="feed-form-attachment-row">
          <div>
            <strong>${escapeHtml(attachment.label || attachment.originalName || attachment.filename || 'Download')}</strong>
            <span>${escapeHtml(attachment.originalName || attachment.filename || '')}${attachment.sizeBytes ? ' · ' + escapeHtml(formatBytes(attachment.sizeBytes)) : ''}</span>
          </div>
          <button type="button" class="icon-button" data-attachment-delete="${escapeHtml(attachment.id)}" aria-label="Delete attachment">
            ${icon('trash', 15)}
          </button>
        </div>
      `).join('');

    attachmentList.querySelectorAll('[data-attachment-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const result = await api.remove('/api/admin/resources/' + encodeURIComponent(item.id) + '/attachments/' + encodeURIComponent(button.dataset.attachmentDelete));
        if (handleUnauthorizedResponse(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        currentAttachments = Array.isArray(result.data?.attachments) ? result.data.attachments : [];
        item.attachments = currentAttachments;
        invalidateAdminFeed();
        renderAttachments();
        showSuccess('Attachment deleted');
      });
    });
  };

  renderAttachments();

  const uploadButton = overlay.querySelector('[data-attachment-upload]');
  if (uploadButton) {
    const fileInput = overlay.querySelector('[data-attachment-file]');
    const fileNameLabel = overlay.querySelector('[data-attachment-file-name]');
    if (fileInput && fileNameLabel) {
      fileInput.addEventListener('change', () => {
        fileNameLabel.textContent = fileInput.files?.[0]?.name || 'No file selected';
      });
    }

    uploadButton.addEventListener('click', async () => {
      const labelInput = overlay.querySelector('[data-attachment-label]');
      const file = fileInput?.files?.[0];
      if (!file) {
        showError('Select a file first.');
        return;
      }

      uploadButton.disabled = true;
      try {
        const contentBase64 = await readFileAsBase64(file);
        const result = await api.post('/api/admin/resources/' + encodeURIComponent(item.id) + '/attachments', {
          filename: file.name,
          label: labelInput.value.trim(),
          mimeType: file.type || 'application/octet-stream',
          contentBase64
        });

        if (handleUnauthorizedResponse(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        currentAttachments = Array.isArray(result.data?.attachments) ? result.data.attachments : [];
        item.attachments = currentAttachments;
        fileInput.value = '';
        fileNameLabel.textContent = 'No file selected';
        labelInput.value = '';
        invalidateAdminFeed();
        renderAttachments();
        showSuccess('Attachment uploaded');
      } finally {
        uploadButton.disabled = false;
      }
    });
  }

  CONTENT_LOCALES.forEach((locale) => {
    const editorHost = overlay.querySelector('#feed-form-content-host-' + locale);
    if (editorHost) {
      editors[locale] = mountMarkdownEditor(editorHost, {
        value: contentValue[locale] || '',
        placeholder: t('admin.detailContentPlaceholder')
      });
    }
  });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(String(reader.result || '').replace(/^data:[^,]+,/, ''));
    });
    reader.addEventListener('error', () => reject(reader.error || new Error('File could not be read')));
    reader.readAsDataURL(file);
  });
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace('.0', '') + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1).replace('.0', '') + ' MB';
}

async function openMediaLibrary({ context, selectedUrl, onSelect }) {
  const response = await api.get('/api/admin/media/images');
  if (handleUnauthorizedResponse(response, context.navigateTo)) {
    return;
  }
  if (!response.ok) {
    showError(response.data?.error || t('general.error'));
    return;
  }

  let images = Array.isArray(response.data) ? response.data : [];
  const overlay = openModal({
    title: 'Mediathek',
    size: 'wide',
    content: `
      <div class="media-library">
        <div class="media-library-toolbar">
          <p>Select an existing image or remove unused files.</p>
          <button type="button" class="btn btn-secondary" data-media-cleanup>
            ${icon('trash', 14)}
            <span>Remove unused images</span>
          </button>
        </div>
        <div class="media-library-grid" data-media-grid></div>
      </div>
    `,
    cancelText: t('admin.cancel')
  });

  const grid = overlay.querySelector('[data-media-grid]');
  const renderGrid = () => {
    grid.innerHTML = images.length === 0
      ? '<p class="feed-form-attachment-empty">No images uploaded yet.</p>'
      : images.map((image) => `
        <article class="media-library-item ${image.url === selectedUrl ? 'active' : ''}">
          <button type="button" class="media-library-select" data-media-select="${escapeHtml(image.url)}">
            ${renderResponsiveImage({
              image,
              src: image.url,
              alt: '',
              sizes: '(max-width: 680px) calc(100vw - 48px), 180px',
              includeDimensions: false
            })}
          </button>
          <div class="media-library-meta">
            <strong>${escapeHtml(image.originalName || image.filename)}</strong>
            <span>${escapeHtml(formatBytes(image.sizeBytes))} · ${image.usageCount || 0} Verwendung${image.usageCount === 1 ? '' : 'en'}</span>
          </div>
          <button type="button" class="tab-link tab-link-utility tab-link-icon" data-media-delete="${escapeHtml(image.id)}" title="Delete image" aria-label="Delete image" ${image.usageCount > 0 ? 'disabled' : ''}>
            <span class="tab-icon">${icon('trash', 14)}</span>
          </button>
        </article>
      `).join('');

    grid.querySelectorAll('[data-media-select]').forEach((button) => {
      button.addEventListener('click', () => {
        const image = images.find((entry) => entry.url === button.dataset.mediaSelect) || null;
        onSelect(button.dataset.mediaSelect, image);
        overlay.querySelector('.modal-cancel')?.click();
      });
    });

    grid.querySelectorAll('[data-media-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const result = await api.remove('/api/admin/media/images/' + encodeURIComponent(button.dataset.mediaDelete));
        if (handleUnauthorizedResponse(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }
        images = images.filter((image) => image.id !== button.dataset.mediaDelete);
        renderGrid();
        showSuccess('Image deleted');
      });
    });
  };

  overlay.querySelector('[data-media-cleanup]').addEventListener('click', async () => {
    const result = await api.post('/api/admin/media/images/cleanup', {});
    if (handleUnauthorizedResponse(result, context.navigateTo)) {
      return;
    }
    if (!result.ok) {
      showError(result.data?.error || t('general.error'));
      return;
    }
    const refreshed = await api.get('/api/admin/media/images');
    images = refreshed.ok && Array.isArray(refreshed.data) ? refreshed.data : images;
    renderGrid();
    showSuccess(`${result.data?.removed || 0} images removed`);
  });

  renderGrid();
}

async function renderConcernsAdmin(container, context) {
  const response = await fetchQuery({
    key: CONCERNS_CACHE_KEY,
    ttlMs: 15 * 1000,
    fetchFunction: () => api.get('/api/admin/concerns')
  });

  if (handleUnauthorizedResponse(response, context.navigateTo)) {
    return;
  }

  const concerns = response.ok ? response.data : [];
  const sortOrder = normalizeSelection(context.searchParams?.get('sort'), ['newest', 'oldest', 'status', 'title-asc', 'title-desc'], 'newest');
  const sortedConcerns = sortConcerns(concerns, sortOrder);
  const pagination = paginateItems(sortedConcerns, context.searchParams?.get('page'), ITEMS_PER_ADMIN_PAGE);
  const tablenHtml = concerns.length === 0 ? renderAdminEmptyState(t('admin.noConcerns')) : renderAdminPanel(`
    ${renderListControls({
      sortOptions: [
        { value: 'newest', label: t('general.sortNewest') },
        { value: 'oldest', label: t('general.sortOldest') },
        { value: 'status', label: t('admin.sortStatus') },
        { value: 'title-asc', label: t('general.sortTitleAsc') },
        { value: 'title-desc', label: t('general.sortTitleDesc') }
      ],
      currentSort: sortOrder,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems,
      resultLabel: t('general.resultsCount').replace('{count}', String(pagination.totalItems))
    })}
    <table class="table">
      <thead>
        <tr>
          <th>${t('admin.title')}</th>
          <th>${t('admin.name')}</th>
          <th>${t('admin.status')}</th>
          <th>${t('admin.date')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${pagination.items.map((concern) => `
          <tr>
            <td data-label="${escapeHtml(t('admin.title'))}" title="${escapeHtml(concern.description || '')}">${escapeHtml(concern.title)}</td>
            <td data-label="${escapeHtml(t('admin.name'))}">${concern.name ? escapeHtml(concern.name) : '<em>' + escapeHtml(t('admin.anonymous')) + '</em>'}</td>
            <td data-label="${escapeHtml(t('admin.status'))}" data-concern-status-cell="${escapeHtml(concern.id)}">
              ${renderSelect({
                name: 'concern-status-' + concern.id,
                value: concern.status,
                size: 'klein',
                options: [
                  { value: 'open', label: t('admin.open') },
                  { value: 'in_progress', label: t('admin.inProgress') },
                  { value: 'done', label: t('admin.done') }
                ],
                ariaLabel: t('admin.status')
              })}
            </td>
            <td data-label="${escapeHtml(t('admin.date'))}">${formatDate(concern.createdAt)}</td>
            <td class="table-aktionen" data-label="${escapeHtml(t('general.actions'))}">
              <button class="btn btn-small btn-danger concern-delete-button" data-id="${concern.id}">
                ${icon('trash', 16)}
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `, 'admin-panel-table');

  container.innerHTML = renderAdminSection({
    title: t('admin.concerns'),
    description: t('admin.concernsDescription'),
    iconName: 'messageSquare',
    content: tablenHtml
  });

  bindListControls(container, {
    onSort: (value) => context.setSearchParams?.({ sort: value === 'newest' ? null : value, page: null }),
    onPage: (page) => context.setSearchParams?.({ page: page <= 1 ? null : page })
  });

  container.querySelectorAll('[data-concern-status-cell]').forEach((cell) => {
    const concernId = cell.dataset.concernStatusCell;
    const root = cell.querySelector('[data-select]');
    if (!root) {
      return;
    }
    bindSelect(root, async (value) => {
      const result = await api.put('/api/admin/concerns/' + concernId, { status: value });
      if (handleUnauthorizedResponse(result, context.navigateTo)) {
        return;
      }
      if (!result.ok) {
        showError(result.data?.error || t('general.error'));
        return;
      }
      invalidateAdminConcerns();
      showSuccess(t('admin.statusUpdated'));
    });
  });

  container.querySelectorAll('.concern-delete-button').forEach((button) => {
    button.addEventListener('click', () => {
      confirmDialog(t('admin.confirmation'), async () => {
        const result = await api.remove('/api/admin/concerns/' + button.dataset.id);
        if (handleUnauthorizedResponse(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        invalidateAdminConcerns();
        showSuccess(t('admin.deleted'));
        await renderConcernsAdmin(container, context);
      });
    });
  });
}

function sortSurveys(surveys, sortOrder) {
  const copy = [...surveys];

  copy.sort((left, right) => {
    switch (sortOrder) {
      case 'manual': {
        const byOrder = (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0);
        if (byOrder !== 0) return byOrder;
        return compareDate(right.createdAt, left.createdAt);
      }
      case 'newest':
        return compareDate(right.createdAt, left.createdAt);
      case 'oldest':
        return compareDate(left.createdAt, right.createdAt);
      case 'title-asc':
        return left.title.localeCompare(right.title, getLanguage());
      case 'title-desc':
        return right.title.localeCompare(left.title, getLanguage());
      case 'status':
        return Number(right.active) - Number(left.active);
      case 'responses-desc':
      default:
        return (right.responses || []).length - (left.responses || []).length;
    }
  });

  return copy;
}

function compareDate(left, right) {
  return new Date(left || 0) - new Date(right || 0);
}

function sortFeedItems(items, sortOrder) {
  const copy = [...items];

  copy.sort((left, right) => {
    switch (sortOrder) {
      case 'oldest':
        return compareFeedDate(left, right, 'asc');
      case 'title-asc':
        return left.title.localeCompare(right.title, getLanguage());
      case 'title-desc':
        return right.title.localeCompare(left.title, getLanguage());
      case 'newest':
      default:
        return compareFeedDate(left, right, 'desc');
    }
  });

  return copy;
}

function compareFeedDate(left, right, direction) {
  const leftDate = new Date(left.createdAt || 0).getTime();
  const rightDate = new Date(right.createdAt || 0).getTime();
  const dateResult = direction === 'asc'
    ? leftDate - rightDate
    : rightDate - leftDate;

  if (dateResult !== 0) {
    return dateResult;
  }

  return String(left.id || '').localeCompare(String(right.id || ''));
}

function sortConcerns(concerns, sortOrder) {
  const statusReihenfolge = { open: 0, in_progress: 1, done: 2 };
  const copy = [...concerns];

  copy.sort((left, right) => {
    switch (sortOrder) {
      case 'oldest':
        return new Date(left.createdAt || 0) - new Date(right.createdAt || 0);
      case 'status':
        return (statusReihenfolge[left.status] ?? 99) - (statusReihenfolge[right.status] ?? 99);
      case 'title-asc':
        return left.title.localeCompare(right.title, getLanguage());
      case 'title-desc':
        return right.title.localeCompare(left.title, getLanguage());
      case 'newest':
      default:
        return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
    }
  });

  return copy;
}

export { render, preload };
