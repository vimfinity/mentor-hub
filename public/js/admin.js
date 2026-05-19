import { initI18n, t, onLanguageChange, toggleLanguage, getLanguage } from './services/i18n.js';
import * as api from './services/api-client.js';
import { showError, showSuccess } from './components/toast.js';
import { icon } from './components/icons.js';
import {
  escapeHtml,
  openModal,
  confirmDialog
} from './components/modal.js';

let activeSection = 'surveys';
let isLoggedIn = false;

function formatDate(value) {
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US';
  return new Date(value).toLocaleDateString(locale);
}

function initializePageChrome() {
  const languageButton = document.getElementById('admin-language-button');
  if (languageButton) {
    languageButton.innerHTML = `${icon('globe', 16)}<span></span>`;
    languageButton.addEventListener('click', async () => {
      languageButton.disabled = true;
      await toggleLanguage();
      languageButton.disabled = false;
    });
  }

  updatePageChrome();
}

function updatePageChrome() {
  document.documentElement.lang = getLanguage();
  document.title = t('admin.pageTitle') + ' - ' + t('app.title');

  document.querySelectorAll('.logo-text').forEach((element) => {
    element.textContent = t('app.title');
  });

  document.querySelectorAll('.logo-bild').forEach((element) => {
    element.alt = t('app.logoAlt');
  });

  const backLink = document.getElementById('admin-back-link');
  if (backLink) {
    backLink.textContent = '\u2190 ' + t('admin.backToHome');
  }

  const loadingText = document.getElementById('admin-loading-text');
  if (loadingText) {
    loadingText.textContent = t('admin.loading');
  }

  const languageButton = document.getElementById('admin-language-button');
  if (languageButton) {
    languageButton.title = t('nav.language');
    const label = languageButton.querySelector('span');
    if (label) {
      label.textContent = getLanguage() === 'de' ? 'EN' : 'DE';
    }
  }
}

async function start() {
  try {
    await initI18n();
  } catch (error) {
    console.error('i18n initialization failed:', error);
  }

  initializePageChrome();

  const token = api.getToken();
  if (token) {
    const healthCheck = await api.get('/api/admin/surveys');
    if (healthCheck.ok) {
      isLoggedIn = true;
    } else {
      api.removeToken();
    }
  }

  await render();
  onLanguageChange(() => {
    updatePageChrome();
    render();
  });
}

async function render() {
  const app = document.getElementById('admin-app');
  if (!app) {
    return;
  }

  const status = await api.get('/api/admin/status');
  const configured = status.data && status.data.configured;

  if (!configured) {
    renderSetup(app);
    return;
  }

  if (!isLoggedIn) {
    renderLogin(app);
    return;
  }

  renderAdmin(app);
}

function renderSetup(container) {
  container.innerHTML = `
    <div class="login-container">
      <div class="login-karte">
        <h1 class="login-titel">${t('admin.setup')}</h1>
        <p style="margin-bottom: 1.5rem; color: var(--farbe-text-sekundaer);">
          ${t('admin.setupDescription')}
        </p>
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

    if (result.ok) {
      showSuccess(t('admin.setupSuccess'));
      render();
      return;
    }

    showError(result.data ? result.data.error : t('general.error'));
  });
}

function renderLogin(container) {
  container.innerHTML = `
    <div class="login-container">
      <div class="login-karte">
        <h1 class="login-titel">${t('admin.login')}</h1>
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
      isLoggedIn = true;
      render();
      return;
    }

    showError(result.data?.error || t('admin.error'));
  });
}

function renderAdmin(container) {
  container.innerHTML = `
    <div class="admin-layout">
      <aside class="admin-sidebar">
        <button class="admin-nav-link ${activeSection === 'surveys' ? 'aktiv' : ''}"
          data-section="surveys">${t('admin.surveys')}</button>
        <button class="admin-nav-link ${activeSection === 'resources' ? 'aktiv' : ''}"
          data-section="resources">${t('admin.resources')}</button>
        <button class="admin-nav-link ${activeSection === 'concerns' ? 'aktiv' : ''}"
          data-section="concerns">${t('admin.concerns')}</button>
        <button class="admin-nav-link ${activeSection === 'news' ? 'aktiv' : ''}"
          data-section="news">${t('admin.news')}</button>
        <hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--farbe-grau-200);">
        <button class="admin-nav-link" id="sign-out-button">${t('admin.signOut')}</button>
      </aside>
      <div class="admin-inhalt" id="admin-content"></div>
    </div>
  `;

  container.querySelectorAll('.admin-nav-link[data-section]').forEach((button) => {
    button.addEventListener('click', () => {
      activeSection = button.dataset.section;
      renderAdmin(container);
    });
  });

  container.querySelector('#sign-out-button').addEventListener('click', async () => {
    await api.post('/api/admin/logout', {});
    api.removeToken();
    isLoggedIn = false;
    render();
  });

  const adminContent = container.querySelector('#admin-content');
  switch (activeSection) {
    case 'surveys':
      renderSurveysAdmin(adminContent);
      break;
    case 'resources':
      renderResourcesAdmin(adminContent);
      break;
    case 'concerns':
      renderConcernsAdmin(adminContent);
      break;
    case 'news':
      renderNewsAdmin(adminContent);
      break;
  }
}

async function renderSurveysAdmin(container) {
  const response = await api.get('/api/admin/surveys');
  const surveys = response.ok ? response.data : [];

  container.innerHTML = `
    <div class="admin-kopfzeile">
      <h2>${t('admin.surveys')}</h2>
      <button class="btn btn-primaer" id="create-survey-button">${t('admin.create')}</button>
    </div>
    ${surveys.length === 0 ? '<p class="leer-zustand-text">' + t('survey.empty') + '</p>' : ''}
    <table class="tabelle" ${surveys.length === 0 ? 'style="display:none"' : ''}>
      <thead>
        <tr>
          <th>${t('admin.title')}</th>
          <th>${t('admin.status')}</th>
          <th>${t('admin.responses')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${surveys.map((survey) => `
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
                ${survey.active ? '&#10074;&#10074;' : '&#9654;'}
              </button>
              <button class="btn btn-klein btn-sekundaer" data-action="details" data-id="${survey.id}">
                &#128065;
              </button>
              <button class="btn btn-klein btn-gefahr" data-action="delete" data-id="${survey.id}">
                &#128465;
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.querySelector('#create-survey-button').addEventListener('click', () => {
    openSurveyForm(container);
  });

  container.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      const action = button.dataset.action;
      const survey = surveys.find((item) => item.id === id);

      if (action === 'toggle' && survey) {
        await api.put('/api/admin/surveys/' + id, { active: !survey.active });
        renderSurveysAdmin(container);
        return;
      }

      if (action === 'delete') {
        confirmDialog(t('admin.confirmation'), async () => {
          await api.remove('/api/admin/surveys/' + id);
          renderSurveysAdmin(container);
        });
        return;
      }

      if (action === 'details' && survey) {
        openSurveyDetails(survey);
      }
    });
  });
}

function openSurveyForm(container) {
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
      await api.post('/api/admin/surveys', { title, description, questions });
      showSuccess(t('admin.surveyCreated'));
      renderSurveysAdmin(container);
    }
  });

  const questionList = document.querySelector('#question-list');
  const addQuestionButton = document.querySelector('#add-question-button');
  let questionCounter = 0;

  addQuestionButton.addEventListener('click', () => {
    questionCounter += 1;
    const wrapper = document.createElement('div');
    wrapper.className = 'formular-gruppe';
    wrapper.style.padding = '0.5rem';
    wrapper.style.border = '1px solid var(--farbe-grau-200)';
    wrapper.style.borderRadius = '8px';
    wrapper.style.marginBottom = '0.5rem';
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
      <div style="padding:0.5rem; border-bottom: 1px solid var(--farbe-grau-100); margin-bottom:0.5rem">
        <small style="color:var(--farbe-text-gedaempft)">
          ${submittedAt} ${response.name ? '- ' + escapeHtml(response.name) : '(' + escapeHtml(t('admin.anonymous')) + ')'}
        </small>
        <div>${response.responses.map((answer, index) => `
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

async function renderResourcesAdmin(container) {
  const response = await api.get('/api/resources');
  const resources = response.ok ? response.data : [];

  container.innerHTML = `
    <div class="admin-kopfzeile">
      <h2>${t('admin.resources')}</h2>
      <button class="btn btn-primaer" id="create-resource-button">${t('admin.create')}</button>
    </div>
    ${resources.length === 0 ? '<p class="leer-zustand-text">' + t('resource.empty') + '</p>' : ''}
    <table class="tabelle" ${resources.length === 0 ? 'style="display:none"' : ''}>
      <thead>
        <tr>
          <th>${t('admin.title')}</th>
          <th>${t('admin.category')}</th>
          <th>${t('admin.url')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${resources.map((resource) => `
          <tr>
            <td>${escapeHtml(resource.title)}</td>
            <td><span class="karte-kategorie">${escapeHtml(t('resource.' + resource.category))}</span></td>
            <td><a href="${escapeHtml(resource.url)}" target="_blank" rel="noopener">&#128279;</a></td>
            <td class="tabelle-aktionen">
              <button class="btn btn-klein btn-gefahr" data-id="${resource.id}">
                &#128465;
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.querySelector('#create-resource-button').addEventListener('click', () => {
    openModal({
      title: t('admin.create') + ': ' + t('admin.resources'),
      content: `
        <div class="formular-gruppe">
          <label class="formular-label">${t('admin.title')} *</label>
          <input type="text" class="formular-eingabe" id="new-resource-title" maxlength="200" required>
        </div>
        <div class="formular-gruppe">
          <label class="formular-label">${t('admin.url')} *</label>
          <input type="url" class="formular-eingabe" id="new-resource-url" required>
        </div>
        <div class="formular-gruppe">
          <label class="formular-label">${t('admin.description')}</label>
          <textarea class="formular-textarea" id="new-resource-description"></textarea>
        </div>
        <div class="formular-gruppe">
          <label class="formular-label">${t('admin.category')}</label>
          <select class="formular-select" id="new-resource-category">
            <option value="article">${t('resource.article')}</option>
            <option value="tool">${t('resource.tool')}</option>
            <option value="video">${t('resource.video')}</option>
            <option value="tutorial">${t('resource.tutorial')}</option>
          </select>
        </div>
      `,
      confirmText: t('admin.save'),
      cancelText: t('admin.cancel'),
      onConfirm: async (overlay) => {
        const title = overlay.querySelector('#new-resource-title').value.trim();
        const url = overlay.querySelector('#new-resource-url').value.trim();
        if (!title || !url) {
          return;
        }

        await api.post('/api/admin/resources', {
          title,
          url,
          description: overlay.querySelector('#new-resource-description').value.trim(),
          category: overlay.querySelector('#new-resource-category').value
        });
        showSuccess(t('admin.resourceCreated'));
        renderResourcesAdmin(container);
      }
    });
  });

  container.querySelectorAll('[data-id]').forEach((button) => {
    button.addEventListener('click', () => {
      confirmDialog(t('admin.confirmation'), async () => {
        await api.remove('/api/admin/resources/' + button.dataset.id);
        renderResourcesAdmin(container);
      });
    });
  });
}

async function renderConcernsAdmin(container) {
  const response = await api.get('/api/admin/concerns');
  const concerns = response.ok ? response.data : [];

  container.innerHTML = `
    <div class="admin-kopfzeile">
      <h2>${t('admin.concerns')}</h2>
    </div>
    ${concerns.length === 0 ? '<p class="leer-zustand-text">' + t('admin.noConcerns') + '</p>' : ''}
    <table class="tabelle" ${concerns.length === 0 ? 'style="display:none"' : ''}>
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
        ${concerns.map((concern) => `
          <tr>
            <td title="${escapeHtml(concern.description || '')}">${escapeHtml(concern.title)}</td>
            <td>${concern.name ? escapeHtml(concern.name) : '<em>' + escapeHtml(t('admin.anonymous')) + '</em>'}</td>
            <td>
              <select class="formular-select concern-status-select" data-id="${concern.id}" style="width:auto;padding:0.25rem">
                <option value="open" ${concern.status === 'open' ? 'selected' : ''}>${t('admin.open')}</option>
                <option value="in_progress" ${concern.status === 'in_progress' ? 'selected' : ''}>${t('admin.inProgress')}</option>
                <option value="done" ${concern.status === 'done' ? 'selected' : ''}>${t('admin.done')}</option>
              </select>
            </td>
            <td>${formatDate(concern.createdAt)}</td>
            <td class="tabelle-aktionen">
              <button class="btn btn-klein btn-gefahr concern-delete-button" data-id="${concern.id}">
                &#128465;
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.querySelectorAll('.concern-status-select').forEach((select) => {
    select.addEventListener('change', async () => {
      await api.put('/api/admin/concerns/' + select.dataset.id, {
        status: select.value
      });
      showSuccess(t('admin.statusUpdated'));
    });
  });

  container.querySelectorAll('.concern-delete-button').forEach((button) => {
    button.addEventListener('click', () => {
      confirmDialog(t('admin.confirmation'), async () => {
        await api.remove('/api/admin/concerns/' + button.dataset.id);
        renderConcernsAdmin(container);
      });
    });
  });
}

async function renderNewsAdmin(container) {
  const response = await api.get('/api/news');
  const newsItems = response.ok ? response.data : [];

  container.innerHTML = `
    <div class="admin-kopfzeile">
      <h2>${t('admin.news')}</h2>
      <button class="btn btn-primaer" id="create-news-button">${t('admin.create')}</button>
    </div>
    ${newsItems.length === 0 ? '<p class="leer-zustand-text">' + t('news.empty') + '</p>' : ''}
    <table class="tabelle" ${newsItems.length === 0 ? 'style="display:none"' : ''}>
      <thead>
        <tr>
          <th>${t('admin.title')}</th>
          <th>${t('admin.date')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${newsItems.map((item) => `
          <tr>
            <td>${escapeHtml(item.title)}</td>
            <td>${formatDate(item.createdAt)}</td>
            <td class="tabelle-aktionen">
              <button class="btn btn-klein btn-gefahr news-delete-button" data-id="${item.id}">
                &#128465;
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.querySelector('#create-news-button').addEventListener('click', () => {
    openModal({
      title: t('admin.create') + ': ' + t('admin.news'),
      content: `
        <div class="formular-gruppe">
          <label class="formular-label">${t('admin.title')} *</label>
          <input type="text" class="formular-eingabe" id="new-news-title" maxlength="200" required>
        </div>
        <div class="formular-gruppe">
          <label class="formular-label">${t('admin.content')}</label>
          <textarea class="formular-textarea" id="new-news-content" maxlength="5000" rows="6"></textarea>
        </div>
      `,
      confirmText: t('admin.save'),
      cancelText: t('admin.cancel'),
      onConfirm: async (overlay) => {
        const title = overlay.querySelector('#new-news-title').value.trim();
        if (!title) {
          return;
        }

        await api.post('/api/admin/news', {
          title,
          content: overlay.querySelector('#new-news-content').value.trim()
        });
        showSuccess(t('admin.newsCreated'));
        renderNewsAdmin(container);
      }
    });
  });

  container.querySelectorAll('.news-delete-button').forEach((button) => {
    button.addEventListener('click', () => {
      confirmDialog(t('admin.confirmation'), async () => {
        await api.remove('/api/admin/news/' + button.dataset.id);
        renderNewsAdmin(container);
      });
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
