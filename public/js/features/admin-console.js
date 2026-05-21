import * as api from '../services/api-client.js';
import { holeAbfrage, invalidiereAbfrage } from '../services/query-cache.js';
import { t, getLanguage } from '../services/i18n.js';
import { normalisiereAuswahl, paginiereElemente } from '../services/view-state.js';
import { showError, showSuccess } from '../components/toast.js';
import { escapeHtml, openModal, confirmDialog } from '../components/modal.js';
import { renderAdminSection, renderAdminPanel, renderAdminEmptyState } from '../components/admin-ui.js';
import { renderListensteuerung, verbindeListensteuerung } from '../components/list-controls.js';
import { icon } from '../components/icons.js';
import { renderSelect, bindSelect } from '../components/select.js';

const SESSION_CACHE_KEY = 'admin:session';
const SURVEYS_CACHE_KEY = 'admin:surveys';
const FEED_ADMIN_CACHE_KEY = 'admin:feed';
const CONCERNS_CACHE_KEY = 'admin:concerns';
const ADMIN_PRO_SEITE = 8;

const SECTION_META = {
  feed: { key: 'feed', path: '/admin/feed', icon: 'newspaper' },
  surveys: { key: 'surveys', path: '/admin/surveys', icon: 'clipboardList' },
  concerns: { key: 'concerns', path: '/admin/concerns', icon: 'messageSquare' }
};

function formatDate(value) {
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US';
  return new Date(value).toLocaleDateString(locale);
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

async function holeAdminSitzung() {
  return holeAbfrage({
    schluessel: SESSION_CACHE_KEY,
    ttlMs: 15 * 1000,
    abrufFunktion: () => api.get('/api/admin/session')
  });
}

function preload() {
  return holeAdminSitzung();
}

function invalidiereAdminSitzung() {
  invalidiereAbfrage(SESSION_CACHE_KEY);
}

function invalidiereAdminSurveys() {
  invalidiereAbfrage(SURVEYS_CACHE_KEY);
  invalidiereAbfrage(['surveys']);
}

function invalidiereAdminFeed() {
  invalidiereAbfrage(FEED_ADMIN_CACHE_KEY);
  invalidiereAbfrage(['feed']);
}

function invalidiereAdminConcerns() {
  invalidiereAbfrage(CONCERNS_CACHE_KEY);
}

function behandleNichtAutorisierteAntwort(antwort, navigateTo) {
  if (antwort && antwort.status === 401) {
    api.removeToken();
    invalidiereAdminSitzung();
    showError(t('admin.sessionExpired'));
    navigateTo('/admin', { replace: true, force: true });
    return true;
  }

  return false;
}

async function render(container, context) {
  const section = SECTION_META[context.section] ? context.section : 'feed';
  const sitzung = await holeAdminSitzung();

  if (behandleNichtAutorisierteAntwort(sitzung, context.navigateTo)) {
    return;
  }

  const sitzungsDaten = sitzung.ok ? sitzung.data : null;

  if (!sitzung.ok || !sitzungsDaten) {
    renderAdminError(container);
    return;
  }

  if (!sitzungsDaten.configured) {
    renderSetup(container, context);
    return;
  }

  if (!sitzungsDaten.authenticated) {
    renderLogin(container, context);
    return;
  }

  await renderAdminShell(container, context, section);
}

function renderAdminError(container) {
  container.innerHTML = `
    <div class="login-container">
      <div class="login-karte">
        <div class="login-icon">${icon('alertCircle', 24)}</div>
        <h1 class="login-titel">${t('admin.pageTitle')}</h1>
        <p class="login-untertitel">${t('general.error')}</p>
      </div>
    </div>
  `;
}

function renderSetup(container, context) {
  container.innerHTML = `
    <div class="login-container">
      <div class="login-karte">
        <div class="login-icon">${icon('settings', 24)}</div>
        <h1 class="login-titel">${t('admin.setup')}</h1>
        <p class="login-untertitel">${t('admin.setupDescription')}</p>
        <form id="setup-form">
          <div class="formular-gruppe">
            <label class="formular-label" for="setup-password">${t('admin.password')}</label>
            <input type="password" id="setup-password" class="formular-eingabe"
              minlength="8" required autocomplete="new-password">
          </div>
          <button type="submit" class="btn btn-primaer" style="width:100%">
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

    invalidiereAdminSitzung();
    showSuccess(t('admin.setupSuccess'));
    await render(container, context);
  });
}

function renderLogin(container, context) {
  container.innerHTML = `
    <div class="login-container">
      <div class="login-karte">
        <div class="login-icon">${icon('layoutDashboard', 24)}</div>
        <h1 class="login-titel">${t('admin.login')}</h1>
        <p class="login-untertitel">${t('admin.pageTitle')}</p>
        <form id="login-form">
          <div class="formular-gruppe">
            <label class="formular-label" for="login-password">${t('admin.password')}</label>
            <input type="password" id="login-password" class="formular-eingabe"
              required autocomplete="current-password">
          </div>
          <button type="submit" class="btn btn-primaer" style="width:100%">
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
      invalidiereAdminSitzung();
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
            <a class="sub-nav-tab ${section === key ? 'aktiv' : ''}"
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
      <div class="admin-inhalt" id="admin-content">
        <p class="sektion-beschreibung">${t('general.loading')}</p>
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
    invalidiereAdminSitzung();
    invalidiereAdminSurveys();
    invalidiereAdminFeed();
    invalidiereAdminConcerns();
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
  const response = await holeAbfrage({
    schluessel: SURVEYS_CACHE_KEY,
    ttlMs: 30 * 1000,
    abrufFunktion: () => api.get('/api/admin/surveys')
  });

  if (behandleNichtAutorisierteAntwort(response, context.navigateTo)) {
    return;
  }

  const surveys = response.ok ? response.data : [];
  const sortierung = normalisiereAuswahl(context.searchParams?.get('sort'), ['title-asc', 'title-desc', 'responses-desc', 'status'], 'responses-desc');
  const sortierteUmfragen = sortiereUmfragen(surveys, sortierung);
  const pagination = paginiereElemente(sortierteUmfragen, context.searchParams?.get('page'), ADMIN_PRO_SEITE);
  const tabellenHtml = surveys.length === 0 ? renderAdminEmptyState(t('survey.empty')) : renderAdminPanel(`
    ${renderListensteuerung({
      sortierOptionen: [
        { value: 'responses-desc', label: t('admin.sortResponsesDesc') },
        { value: 'status', label: t('admin.sortStatus') },
        { value: 'title-asc', label: t('general.sortTitleAsc') },
        { value: 'title-desc', label: t('general.sortTitleDesc') }
      ],
      aktuelleSortierung: sortierung,
      aktuelleSeite: pagination.aktuelleSeite,
      gesamtSeiten: pagination.gesamtSeiten,
      gesamtElemente: pagination.gesamtElemente,
      ergebnisLabel: t('general.resultsCount').replace('{count}', String(pagination.gesamtElemente))
    })}
    <table class="tabelle">
      <thead>
        <tr>
          <th>${t('admin.title')}</th>
          <th>${t('admin.status')}</th>
          <th>${t('admin.responses')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${pagination.elemente.map((survey) => `
          <tr>
            <td>${escapeHtml(survey.title)}</td>
            <td>
              <span class="status-badge ${survey.active ? 'status-open' : 'status-done'}">
                ${survey.active ? t('admin.active') : t('admin.inactive')}
              </span>
            </td>
            <td>${(survey.responses || []).length}</td>
            <td class="tabelle-aktionen">
              <button class="btn btn-klein btn-sekundaer" data-action="toggle" data-id="${survey.id}">
                ${survey.active ? icon('pause', 16) : icon('play', 16)}
              </button>
              <button class="btn btn-klein btn-sekundaer" data-action="details" data-id="${survey.id}">
                ${icon('eye', 16)}
              </button>
              <button class="btn btn-klein btn-gefahr" data-action="delete" data-id="${survey.id}">
                ${icon('trash', 16)}
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `, 'admin-panel-tabelle');

  container.innerHTML = renderAdminSection({
    title: t('admin.surveys'),
    description: t('admin.surveysDescription'),
    iconName: 'clipboardList',
    actions: `<button class="btn btn-primaer" id="create-survey-button">${icon('plus', 14)} ${t('admin.create')}</button>`,
    content: tabellenHtml
  });

  container.querySelector('#create-survey-button').addEventListener('click', () => {
    openSurveyForm(container, context);
  });

  verbindeListensteuerung(container, {
    onSortierung: (wert) => context.setSearchParams?.({ sort: wert === 'responses-desc' ? null : wert, page: null }),
    onSeite: (seite) => context.setSearchParams?.({ page: seite <= 1 ? null : seite })
  });

  container.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      const action = button.dataset.action;
      const survey = surveys.find((item) => item.id === id);

      if (action === 'toggle' && survey) {
        const result = await api.put('/api/admin/surveys/' + id, { active: !survey.active });
        if (behandleNichtAutorisierteAntwort(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        invalidiereAdminSurveys();
        await renderSurveysAdmin(container, context);
        return;
      }

      if (action === 'delete') {
        confirmDialog(t('admin.confirmation'), async () => {
          const result = await api.remove('/api/admin/surveys/' + id);
          if (behandleNichtAutorisierteAntwort(result, context.navigateTo)) {
            return;
          }
          if (!result.ok) {
            showError(result.data?.error || t('general.error'));
            return;
          }

          invalidiereAdminSurveys();
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
        <div class="formular-gruppe">
          <label class="formular-label">${t('admin.title')} *</label>
          <input type="text" class="formular-eingabe" id="new-survey-title" required maxlength="200">
        </div>
        <div class="formular-gruppe">
          <label class="formular-label">${t('admin.description')}</label>
          <textarea class="formular-textarea" id="new-survey-description"></textarea>
        </div>
        <div class="formular-gruppe">
          <label class="formular-label">${t('admin.questions')}</label>
          <div id="question-list"></div>
          <button type="button" class="btn btn-sekundaer btn-klein" id="add-question-button">+ ${t('admin.add')}</button>
        </div>
      </form>
    `,
    confirmText: t('admin.save'),
    cancelText: t('admin.cancel'),
    onConfirm: async (overlay) => {
      const title = overlay.querySelector('#new-survey-title').value.trim();
      if (!title) {
        return;
      }

      const questions = collectQuestionsFromForm(overlay);
      if (questions.length === 0) {
        showError(t('admin.atLeastOneQuestion'));
        return;
      }

      const description = overlay.querySelector('#new-survey-description').value.trim();
      const result = await api.post('/api/admin/surveys', { title, description, questions });
      if (behandleNichtAutorisierteAntwort(result, context.navigateTo)) {
        return;
      }
      if (!result.ok) {
        showError(result.data?.error || t('general.error'));
        return;
      }

      invalidiereAdminSurveys();
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
      <input type="text" class="formular-eingabe question-text-input"
        placeholder="${t('admin.question')} ${questionCounter}" style="margin-bottom:0.5rem">
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
    const input = item.querySelector('.question-text-input');
    const typeSelect = item.querySelector('.question-type-select');
    const text = input ? input.value.trim() : '';
    if (!text) {
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
          <span class="admin-detail-zeit">${submittedAt}</span>
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
  const response = await holeAbfrage({
    schluessel: FEED_ADMIN_CACHE_KEY,
    ttlMs: 30 * 1000,
    abrufFunktion: () => api.get('/api/feed')
  });

  if (behandleNichtAutorisierteAntwort(response, context.navigateTo)) {
    return;
  }

  if (!response.ok) {
    showError(t('general.error'));
    return;
  }

  const feedItems = Array.isArray(response.data) ? response.data : [];
  const kindFilter = normalisiereAuswahl(context.searchParams?.get('kind'), ['all', ...FEED_KIND_OPTIONS], 'all');
  const filteredItems = kindFilter === 'all' ? feedItems : feedItems.filter((item) => item.kind === kindFilter);
  const sortierung = normalisiereAuswahl(context.searchParams?.get('sort'), ['newest', 'oldest', 'title-asc', 'title-desc'], 'newest');
  const sortierteElemente = sortiereFeedElemente(filteredItems, sortierung);
  const pagination = paginiereElemente(sortierteElemente, context.searchParams?.get('page'), ADMIN_PRO_SEITE);

  const TYPE_LABELS = getFeedTypeLabels();

  const tabellenHtml = feedItems.length === 0 ? renderAdminEmptyState(t('feed.emptyTitle'), 'newspaper') : renderAdminPanel(`
    ${renderListensteuerung({
      sortierOptionen: [
        { value: 'newest', label: t('general.sortNewest') },
        { value: 'oldest', label: t('general.sortOldest') },
        { value: 'title-asc', label: t('general.sortTitleAsc') },
        { value: 'title-desc', label: t('general.sortTitleDesc') }
      ],
      aktuelleSortierung: sortierung,
      aktuelleSeite: pagination.aktuelleSeite,
      gesamtSeiten: pagination.gesamtSeiten,
      gesamtElemente: pagination.gesamtElemente,
      ergebnisLabel: t('general.resultsCount').replace('{count}', String(pagination.gesamtElemente))
    })}
    <table class="tabelle">
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
        ${pagination.elemente.map((item) => `
          <tr>
            <td>
              ${escapeHtml(item.title)}
              ${item.featured ? `<span class="status-badge status-open">${t('admin.featured')}</span>` : ''}
            </td>
            <td><span class="status-badge">${getFeedKindLabel(item.kind)}</span></td>
            <td><span class="karte-kategorie">${TYPE_LABELS[item.type] || item.type}</span></td>
            <td>${formatDate(item.createdAt)}</td>
            <td class="tabelle-aktionen">
              ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="btn btn-klein btn-sekundaer">${icon('externalLink', 14)}</a>` : ''}
              <button class="btn btn-klein btn-sekundaer feed-edit-button" data-id="${item.id}">
                ${icon('edit', 16)}
              </button>
              <button class="btn btn-klein btn-gefahr feed-delete-button" data-id="${item.id}" data-source="${item.feedSource || item.source}">
                ${icon('trash', 16)}
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `, 'admin-panel-tabelle');

  const filterChips = `
    <div class="feed-filter-bar" style="margin-bottom: 0;">
      ${['all', ...FEED_KIND_OPTIONS]
        .filter((f) => f === 'all' || feedItems.some((item) => item.kind === f))
        .map((f) => `
          <button class="feed-filter-chip ${f === kindFilter ? 'aktiv' : ''}" data-kind-filter="${f}">
            ${f === 'all' ? t('feed.filter_all') : getFeedKindLabel(f)}
          </button>
        `).join('')}
    </div>
  `;

  container.innerHTML = renderAdminSection({
    title: t('admin.feed'),
    description: t('admin.feedDescription'),
    iconName: 'newspaper',
    actions: `<button class="btn btn-primaer" id="create-feed-button">${icon('plus', 14)} ${t('admin.create')}</button>`,
    content: filterChips + tabellenHtml
  });

  verbindeListensteuerung(container, {
    onSortierung: (wert) => context.setSearchParams?.({ sort: wert === 'newest' ? null : wert, page: null }),
    onSeite: (seite) => context.setSearchParams?.({ page: seite <= 1 ? null : seite })
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
        if (behandleNichtAutorisierteAntwort(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        invalidiereAdminFeed();
        showSuccess(t('admin.deleted'));
        context.navigateTo('/admin/feed', { force: true });
      });
    });
  });
}

function openFeedForm({ context, mode, item = null }) {
  const isEdit = mode === 'edit';
  const typeLabels = getFeedTypeLabels();
  const selectedKind = FEED_KIND_OPTIONS.includes(item?.kind) ? item.kind : 'update';
  const selectedType = item?.subtype || item?.type || FEED_SUBTYPES_BY_KIND[selectedKind][0];
  const titleValue = escapeHtml(item?.title || '');
  const urlValue = escapeHtml(item?.url || '');
  const summaryValue = escapeHtml(item?.summary || item?.content || item?.description || '');
  const contentValue = escapeHtml(item?.detailContent || item?.content || item?.description || '');
  const imageValue = escapeHtml(item?.imageUrl || '');
  const sourceValue = escapeHtml(item?.source || '');
  const tagValue = escapeHtml(Array.isArray(item?.tags) ? item.tags.join(', ') : '');
  const kindOptions = FEED_KIND_OPTIONS.map((value) => `
    <option value="${value}" ${value === selectedKind ? 'selected' : ''}>${getFeedKindLabel(value)}</option>
  `).join('');

  const kindSelectOptions = FEED_KIND_OPTIONS.map((value) => ({
    value,
    label: getFeedKindLabel(value)
  }));

  openModal({
    title: (isEdit ? t('admin.edit') : t('admin.create')) + ': ' + t('admin.feed'),
    content: `
      <div class="formular-gruppe">
        <label class="formular-label" for="feed-form-title">${t('admin.title')} *</label>
        <input type="text" class="formular-eingabe" id="feed-form-title" maxlength="200" required value="${titleValue}">
      </div>
      <div class="formular-gruppe">
        <label class="formular-label">${t('admin.feedKind')}</label>
        ${renderSelect({
          name: 'feed-form-kind',
          value: selectedKind,
          options: kindSelectOptions,
          disabled: isEdit,
          ariaLabel: t('admin.feedKind')
        })}
      </div>
      <div class="formular-gruppe">
        <label class="formular-label">${t('admin.category')}</label>
        <div id="feed-form-subtype-host"></div>
      </div>
      <div class="formular-gruppe">
        <label class="formular-label" for="feed-form-summary">${t('admin.summary')}</label>
        <textarea class="formular-textarea" id="feed-form-summary" maxlength="1000" rows="2">${summaryValue}</textarea>
      </div>
      <div class="formular-gruppe">
        <label class="formular-label" for="feed-form-content">${t('admin.detailContent')}</label>
        <textarea class="formular-textarea" id="feed-form-content" maxlength="10000" rows="6">${contentValue}</textarea>
      </div>
      <div class="formular-gruppe">
        <label class="formular-label" for="feed-form-url">${t('admin.url')}</label>
        <input type="url" class="formular-eingabe" id="feed-form-url" maxlength="2000" placeholder="https://..." value="${urlValue}">
      </div>
      <div class="formular-gruppe">
        <label class="formular-label" for="feed-form-image">${t('admin.imageUrl')}</label>
        <input type="url" class="formular-eingabe" id="feed-form-image" maxlength="2000" placeholder="https://..." value="${imageValue}">
      </div>
      <div class="formular-gruppe">
        <label class="formular-label" for="feed-form-source">${t('admin.source')}</label>
        <input type="text" class="formular-eingabe" id="feed-form-source" maxlength="100" value="${sourceValue}">
      </div>
      <div class="formular-gruppe">
        <label class="formular-label" for="feed-form-tags">${t('admin.tags')}</label>
        <input type="text" class="formular-eingabe" id="feed-form-tags" placeholder="mcp, codex, workflow" value="${tagValue}">
      </div>
      <label class="checkbox-label">
        <input type="checkbox" id="feed-form-featured" ${item?.featured ? 'checked' : ''}>
        ${t('admin.featured')}
      </label>
      <div class="feed-admin-vorschau" id="feed-form-preview"></div>
      <p class="formular-hilfe">${t('admin.feedFormHint')}</p>
    `,
    confirmText: t('admin.save'),
    cancelText: t('admin.cancel'),
    onConfirm: async (overlay) => {
      const title = overlay.querySelector('#feed-form-title').value.trim();
      if (!title) {
        return;
      }

      const kind = overlay.querySelector('[data-select="feed-form-kind"]').dataset.value;
      const subtype = overlay.querySelector('[data-select="feed-form-subtype"]').dataset.value;
      const url = overlay.querySelector('#feed-form-url').value.trim();
      const summary = overlay.querySelector('#feed-form-summary').value.trim();
      const content = overlay.querySelector('#feed-form-content').value.trim();
      const imageUrl = overlay.querySelector('#feed-form-image').value.trim();
      const source = overlay.querySelector('#feed-form-source').value.trim();
      const tags = overlay.querySelector('#feed-form-tags').value.split(',').map((tag) => tag.trim()).filter(Boolean);
      const featured = overlay.querySelector('#feed-form-featured').checked;
      const payload = kind === 'update'
        ? { title, content: summary, detailContent: content, summary, url, imageUrl, source, tags, type: subtype, subtype, featured }
        : { title, description: summary, detailContent: content, summary, url, imageUrl, source, tags, kind, category: subtype, subtype, featured };
      const endpoint = isEdit
        ? ((item.feedSource || item.source) === 'resource' ? '/api/admin/resources/' : '/api/admin/news/') + item.id
        : kind === 'update'
          ? '/api/admin/news'
          : '/api/admin/resources';
      const result = isEdit
        ? await api.put(endpoint, payload)
        : await api.post(endpoint, payload);

      if (behandleNichtAutorisierteAntwort(result, context.navigateTo)) {
        return;
      }
      if (!result.ok) {
        showError(result.data?.error || t('general.error'));
        return;
      }

      invalidiereAdminFeed();
      showSuccess(isEdit ? t('admin.feedUpdated') : t('admin.feedCreated'));
      context.navigateTo('/admin/feed', { force: true });
    }
  });

  const overlay = document.querySelector('.modal-overlay:last-child');
  const kindSelect = overlay.querySelector('[data-select="feed-form-kind"]');
  const subtypeHost = overlay.querySelector('#feed-form-subtype-host');
  const preview = overlay.querySelector('#feed-form-preview');

  const refreshPreview = () => {
    const imageUrl = overlay.querySelector('#feed-form-image').value.trim();
    const title = overlay.querySelector('#feed-form-title').value.trim();
    const summary = overlay.querySelector('#feed-form-summary').value.trim();
    const subtypeRoot = subtypeHost.querySelector('[data-select="feed-form-subtype"]');
    const subtypeValue = subtypeRoot ? subtypeRoot.dataset.value : '';
    preview.innerHTML = `
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="">` : `<div class="feed-admin-vorschau-placeholder">${icon('image', 22)}</div>`}
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
  ['feed-form-title', 'feed-form-summary', 'feed-form-image'].forEach((id) => {
    overlay.querySelector('#' + id).addEventListener('input', refreshPreview);
  });
  renderSubtypeSelect();
}

async function renderConcernsAdmin(container, context) {
  const response = await holeAbfrage({
    schluessel: CONCERNS_CACHE_KEY,
    ttlMs: 15 * 1000,
    abrufFunktion: () => api.get('/api/admin/concerns')
  });

  if (behandleNichtAutorisierteAntwort(response, context.navigateTo)) {
    return;
  }

  const concerns = response.ok ? response.data : [];
  const sortierung = normalisiereAuswahl(context.searchParams?.get('sort'), ['newest', 'oldest', 'status', 'title-asc', 'title-desc'], 'newest');
  const sortierteAnliegen = sortiereAnliegen(concerns, sortierung);
  const pagination = paginiereElemente(sortierteAnliegen, context.searchParams?.get('page'), ADMIN_PRO_SEITE);
  const tabellenHtml = concerns.length === 0 ? renderAdminEmptyState(t('admin.noConcerns')) : renderAdminPanel(`
    ${renderListensteuerung({
      sortierOptionen: [
        { value: 'newest', label: t('general.sortNewest') },
        { value: 'oldest', label: t('general.sortOldest') },
        { value: 'status', label: t('admin.sortStatus') },
        { value: 'title-asc', label: t('general.sortTitleAsc') },
        { value: 'title-desc', label: t('general.sortTitleDesc') }
      ],
      aktuelleSortierung: sortierung,
      aktuelleSeite: pagination.aktuelleSeite,
      gesamtSeiten: pagination.gesamtSeiten,
      gesamtElemente: pagination.gesamtElemente,
      ergebnisLabel: t('general.resultsCount').replace('{count}', String(pagination.gesamtElemente))
    })}
    <table class="tabelle">
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
        ${pagination.elemente.map((concern) => `
          <tr>
            <td title="${escapeHtml(concern.description || '')}">${escapeHtml(concern.title)}</td>
            <td>${concern.name ? escapeHtml(concern.name) : '<em>' + escapeHtml(t('admin.anonymous')) + '</em>'}</td>
            <td data-concern-status-cell="${escapeHtml(concern.id)}">
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
            <td>${formatDate(concern.createdAt)}</td>
            <td class="tabelle-aktionen">
              <button class="btn btn-klein btn-gefahr concern-delete-button" data-id="${concern.id}">
                ${icon('trash', 16)}
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `, 'admin-panel-tabelle');

  container.innerHTML = renderAdminSection({
    title: t('admin.concerns'),
    description: t('admin.concernsDescription'),
    iconName: 'messageSquare',
    content: tabellenHtml
  });

  verbindeListensteuerung(container, {
    onSortierung: (wert) => context.setSearchParams?.({ sort: wert === 'newest' ? null : wert, page: null }),
    onSeite: (seite) => context.setSearchParams?.({ page: seite <= 1 ? null : seite })
  });

  container.querySelectorAll('[data-concern-status-cell]').forEach((cell) => {
    const concernId = cell.dataset.concernStatusCell;
    const root = cell.querySelector('[data-select]');
    if (!root) {
      return;
    }
    bindSelect(root, async (value) => {
      const result = await api.put('/api/admin/concerns/' + concernId, { status: value });
      if (behandleNichtAutorisierteAntwort(result, context.navigateTo)) {
        return;
      }
      if (!result.ok) {
        showError(result.data?.error || t('general.error'));
        return;
      }
      invalidiereAdminConcerns();
      showSuccess(t('admin.statusUpdated'));
    });
  });

  container.querySelectorAll('.concern-delete-button').forEach((button) => {
    button.addEventListener('click', () => {
      confirmDialog(t('admin.confirmation'), async () => {
        const result = await api.remove('/api/admin/concerns/' + button.dataset.id);
        if (behandleNichtAutorisierteAntwort(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        invalidiereAdminConcerns();
        showSuccess(t('admin.deleted'));
        await renderConcernsAdmin(container, context);
      });
    });
  });
}

function sortiereUmfragen(surveys, sortierung) {
  const kopie = [...surveys];

  kopie.sort((links, rechts) => {
    switch (sortierung) {
      case 'title-asc':
        return links.title.localeCompare(rechts.title, getLanguage());
      case 'title-desc':
        return rechts.title.localeCompare(links.title, getLanguage());
      case 'status':
        return Number(rechts.active) - Number(links.active);
      case 'responses-desc':
      default:
        return (rechts.responses || []).length - (links.responses || []).length;
    }
  });

  return kopie;
}

function sortiereFeedElemente(items, sortierung) {
  const kopie = [...items];

  kopie.sort((links, rechts) => {
    switch (sortierung) {
      case 'oldest':
        return new Date(links.createdAt || 0) - new Date(rechts.createdAt || 0);
      case 'title-asc':
        return links.title.localeCompare(rechts.title, getLanguage());
      case 'title-desc':
        return rechts.title.localeCompare(links.title, getLanguage());
      case 'newest':
      default:
        return new Date(rechts.createdAt || 0) - new Date(links.createdAt || 0);
    }
  });

  return kopie;
}

function sortiereAnliegen(concerns, sortierung) {
  const statusReihenfolge = { open: 0, in_progress: 1, done: 2 };
  const kopie = [...concerns];

  kopie.sort((links, rechts) => {
    switch (sortierung) {
      case 'oldest':
        return new Date(links.createdAt || 0) - new Date(rechts.createdAt || 0);
      case 'status':
        return (statusReihenfolge[links.status] ?? 99) - (statusReihenfolge[rechts.status] ?? 99);
      case 'title-asc':
        return links.title.localeCompare(rechts.title, getLanguage());
      case 'title-desc':
        return rechts.title.localeCompare(links.title, getLanguage());
      case 'newest':
      default:
        return new Date(rechts.createdAt || 0) - new Date(links.createdAt || 0);
    }
  });

  return kopie;
}

export { render, preload };
