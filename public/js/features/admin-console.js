import * as api from '../services/api-client.js';
import { t } from '../services/i18n.js';
import { showError, showSuccess } from '../components/toast.js';
import { escapeHtml } from '../components/modal.js';
import { icon } from '../components/icons.js';
import {
  fetchAdminSession,
  invalidateAdminSession,
  invalidateAdminSurveys,
  invalidateAdminFeed,
  invalidateAdminConcerns,
  handleUnauthorizedResponse
} from './admin/shared.js';
import { renderSurveysAdmin } from './admin/surveys.js';
import { renderFeedAdmin } from './admin/feed.js';
import { renderConcernsAdmin } from './admin/concerns.js';

const SECTION_META = {
  feed: { key: 'feed', path: '/admin/feed', icon: 'newspaper' },
  surveys: { key: 'surveys', path: '/admin/surveys', icon: 'clipboardList' },
  concerns: { key: 'concerns', path: '/admin/concerns', icon: 'messageSquare' }
};

function preload() {
  return fetchAdminSession();
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

export { render, preload };
