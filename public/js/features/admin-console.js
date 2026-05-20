import * as api from '../services/api-client.js';
import { holeAbfrage, invalidiereAbfrage } from '../services/query-cache.js';
import { t, getLanguage } from '../services/i18n.js';
import { normalisiereAuswahl, paginiereElemente } from '../services/view-state.js';
import { showError, showSuccess } from '../components/toast.js';
import { escapeHtml, openModal, confirmDialog } from '../components/modal.js';
import { renderAdminSection, renderAdminPanel, renderAdminEmptyState } from '../components/admin-ui.js';
import { renderListensteuerung, verbindeListensteuerung } from '../components/list-controls.js';
import { icon } from '../components/icons.js';

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
    navigateTo('/admin', { ersetzen: true, erzwingen: true });
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
      context.navigateTo(context.path || '/admin/feed', { ersetzen: true, erzwingen: true });
      return;
    }

    showError(result.data?.error || t('admin.error'));
  });
}

async function renderAdminShell(container, context, section) {
  container.innerHTML = `
    <div class="admin-layout">
      <aside class="admin-sidebar">
        ${Object.keys(SECTION_META).map((key) => `
          <a class="admin-nav-link ${section === key ? 'aktiv' : ''}"
            href="${SECTION_META[key].path}" data-admin-route="${key}">
            ${icon(SECTION_META[key].icon, 16)}
            <span>${t('admin.' + key)}</span>
          </a>
        `).join('')}
        <hr class="admin-trenner">
        <button class="admin-nav-link" id="sign-out-button" type="button">
          ${icon('logOut', 16)}
          <span>${t('admin.signOut')}</span>
        </button>
      </aside>
      <div class="admin-inhalt" id="admin-content">
        <p class="sektion-beschreibung">${t('general.loading')}</p>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-admin-route]').forEach((link) => {
    link.addEventListener('click', (event) => {
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
    context.navigateTo('/admin', { ersetzen: true, erzwingen: true });
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
      <select class="formular-select question-type-select">
        <option value="free_text">${t('admin.freeText')}</option>
        <option value="rating">${t('admin.rating')}</option>
        <option value="yes_no">${t('admin.yesNo')}</option>
      </select>
    `;
    questionList.appendChild(wrapper);
  });

  addQuestionButton.click();
}

function collectQuestionsFromForm(overlay) {
  const questions = [];
  const textInputs = overlay.querySelectorAll('.question-text-input');
  const typeInputs = overlay.querySelectorAll('.question-type-select');

  textInputs.forEach((input, index) => {
    const text = input.value.trim();
    if (!text) {
      return;
    }

    questions.push({
      text,
      type: typeInputs[index] ? typeInputs[index].value : 'free_text'
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
  const typeFilter = normalisiereAuswahl(context.searchParams?.get('type'), ['all', 'announcement', 'release', 'article', 'tool', 'skill', 'video', 'tutorial'], 'all');
  const filteredItems = typeFilter === 'all' ? feedItems : feedItems.filter((item) => item.type === typeFilter);
  const sortierung = normalisiereAuswahl(context.searchParams?.get('sort'), ['newest', 'oldest', 'title-asc', 'title-desc'], 'newest');
  const sortierteElemente = sortiereFeedElemente(filteredItems, sortierung);
  const pagination = paginiereElemente(sortierteElemente, context.searchParams?.get('page'), ADMIN_PRO_SEITE);

  const TYPE_LABELS = {
    announcement: 'News',
    release: 'Release',
    article: t('feed.article'),
    tool: t('feed.tool'),
    skill: t('feed.skill'),
    video: t('feed.video'),
    tutorial: t('feed.tutorial')
  };

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
            <td><span class="karte-kategorie">${TYPE_LABELS[item.type] || item.type}</span></td>
            <td>${formatDate(item.createdAt)}</td>
            <td class="tabelle-aktionen">
              ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="btn btn-klein btn-sekundaer">${icon('externalLink', 14)}</a>` : ''}
              <button class="btn btn-klein btn-gefahr feed-delete-button" data-id="${item.id}" data-source="${item.source}">
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
      ${['all', 'announcement', 'release', 'article', 'tool', 'skill', 'video', 'tutorial']
        .filter((f) => f === 'all' || feedItems.some((item) => item.type === f))
        .map((f) => `
          <button class="feed-filter-chip ${f === typeFilter ? 'aktiv' : ''}" data-type-filter="${f}">
            ${t('feed.filter_' + f)}
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

  container.querySelectorAll('[data-type-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      context.setSearchParams?.({ type: btn.dataset.typeFilter === 'all' ? null : btn.dataset.typeFilter, page: null });
    });
  });

  container.querySelector('#create-feed-button').addEventListener('click', () => {
    openModal({
      title: t('admin.create') + ': ' + t('admin.feed'),
      content: `
        <div class="formular-gruppe">
          <label class="formular-label">${t('admin.title')} *</label>
          <input type="text" class="formular-eingabe" id="new-feed-title" maxlength="200" required>
        </div>
        <div class="formular-gruppe">
          <label class="formular-label">${t('admin.category')}</label>
          <select class="formular-select" id="new-feed-type">
            <option value="announcement">News</option>
            <option value="release">Release</option>
            <option value="article">${t('feed.article')}</option>
            <option value="tool">${t('feed.tool')}</option>
            <option value="skill">${t('feed.skill')}</option>
            <option value="video">${t('feed.video')}</option>
            <option value="tutorial">${t('feed.tutorial')}</option>
          </select>
        </div>
        <div class="formular-gruppe">
          <label class="formular-label">${t('admin.url')}</label>
          <input type="url" class="formular-eingabe" id="new-feed-url" placeholder="https://...">
        </div>
        <div class="formular-gruppe">
          <label class="formular-label">${t('admin.content')}</label>
          <textarea class="formular-textarea" id="new-feed-content" maxlength="5000" rows="3"></textarea>
        </div>
      `,
      confirmText: t('admin.save'),
      cancelText: t('admin.cancel'),
      onConfirm: async (overlay) => {
        const title = overlay.querySelector('#new-feed-title').value.trim();
        if (!title) {
          return;
        }

        const type = overlay.querySelector('#new-feed-type').value;
        const url = overlay.querySelector('#new-feed-url').value.trim();
        const content = overlay.querySelector('#new-feed-content').value.trim();

        const result = await api.post('/api/admin/news', { title, content, url, type });
        if (behandleNichtAutorisierteAntwort(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        invalidiereAdminFeed();
        showSuccess(t('admin.feedCreated'));
        context.navigateTo('/admin/feed');
      }
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
        context.navigateTo('/admin/feed');
      });
    });
  });
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
            <td>
              <select class="formular-select concern-status-select" data-id="${concern.id}">
                <option value="open" ${concern.status === 'open' ? 'selected' : ''}>${t('admin.open')}</option>
                <option value="in_progress" ${concern.status === 'in_progress' ? 'selected' : ''}>${t('admin.inProgress')}</option>
                <option value="done" ${concern.status === 'done' ? 'selected' : ''}>${t('admin.done')}</option>
              </select>
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

  container.querySelectorAll('.concern-status-select').forEach((select) => {
    select.addEventListener('change', async () => {
      const result = await api.put('/api/admin/concerns/' + select.dataset.id, {
        status: select.value
      });
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