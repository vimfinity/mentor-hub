import * as api from '../services/api-client.js';
import { holeAbfrage } from '../services/query-cache.js';
import { t, getLocale } from '../services/i18n.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';
import { showError, showSuccess } from './toast.js';

const UMFRAGEN_CACHE_KEY = ['surveys'];
const UMFRAGEN_CACHE_TTL_MS = 60 * 1000;

async function render(container, context = {}) {
  const response = await holeAbfrage({
    schluessel: [...UMFRAGEN_CACHE_KEY, getLocale()],
    abrufFunktion: () => api.get('/api/surveys'),
    ttlMs: UMFRAGEN_CACHE_TTL_MS
  });
  const hasSurveys = response.ok && response.data && response.data.length > 0;

  let surveysHtml = `
    <div class="leer-zustand feedback-empty">
      <p class="leer-zustand-text">${escapeHtml(t('survey.empty'))}</p>
    </div>
  `;

  if (hasSurveys) {
    surveysHtml = `
      <div class="umfragen-container">
        ${response.data.map((survey) => renderSurvey(survey)).join('')}
      </div>
    `;
  }

  const html = `
    <div class="feedback-layout">
      <section class="feedback-panel feedback-surveys">
        <h1 class="sektion-titel">${escapeHtml(t('survey.title'))}</h1>
        ${surveysHtml}
      </section>
      ${renderConcernForm()}
    </div>
  `;

  container.innerHTML = html;
  registerEvents(container, context);
}

function preload() {
  return holeAbfrage({
    schluessel: [...UMFRAGEN_CACHE_KEY, getLocale()],
    abrufFunktion: () => api.get('/api/surveys'),
    ttlMs: UMFRAGEN_CACHE_TTL_MS
  });
}

function renderConcernForm() {
  return `
    <section class="anliegen-sektion feedback-panel">
      <h2 class="anliegen-titel">
        ${icon('lightbulb', 22)}
        <span>${t('concern.title')}</span>
      </h2>
      <p class="sektion-beschreibung">${t('concern.description')}</p>
      <form class="formular" id="concern-form">
        <div class="formular-gruppe">
          <label class="formular-label" for="concern-title">${t('concern.titleLabel')}</label>
          <input type="text" id="concern-title" class="formular-eingabe"
            placeholder="${t('concern.titlePlaceholder')}"
            maxlength="200" required>
        </div>
        <div class="formular-gruppe">
          <label class="formular-label" for="concern-detail">${t('concern.detailLabel')}</label>
          <textarea id="concern-detail" class="formular-textarea"
            placeholder="${t('concern.detailPlaceholder')}"
            maxlength="2000"></textarea>
        </div>
        <div class="formular-gruppe">
          <label class="formular-label" for="concern-name">${t('concern.nameLabel')}</label>
          <input type="text" id="concern-name" class="formular-eingabe"
            placeholder="${t('concern.namePlaceholder')}"
            maxlength="100">
        </div>
        <button type="submit" class="btn btn-primaer">
          ${icon('send', 16)}
          <span>${t('concern.submit')}</span>
        </button>
      </form>
    </section>
  `;
}

function renderSurvey(survey) {
  const detailHref = '/surveys/' + encodeURIComponent(survey.id);
  const questionCount = Array.isArray(survey.questions) ? survey.questions.length : 0;
  const metaParts = [
    t('survey.questionsCount').replace('{count}', String(questionCount)),
    survey.createdAt ? t('survey.createdOn').replace('{date}', formatDate(survey.createdAt)) : ''
  ].filter(Boolean);

  return `
    <a class="feed-card feed-card-clickable umfrage-preview" href="${detailHref}" data-survey-id="${escapeHtml(survey.id)}" data-survey-internal="1">
      <div class="feed-card-body">
        <div class="feed-card-meta">
          <span class="feed-card-type accent-skill">
            ${escapeHtml(t('survey.singleLabel'))}
          </span>
          <span class="feed-card-zeit">${escapeHtml(metaParts.join(' · '))}</span>
        </div>
        <h2 class="feed-card-titel">${escapeHtml(survey.title)}</h2>
        ${survey.description ? `<p class="feed-card-text">${escapeHtml(survey.description)}</p>` : ''}
      </div>
    </a>
  `;
}

function formatDate(value) {
  const locale = document.documentElement.lang.startsWith('de') ? 'de-DE' : 'en-US';
  return new Date(value).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function registerEvents(container, context = {}) {
  container.querySelectorAll('[data-survey-internal="1"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      event.preventDefault();
      context.navigateTo?.(anchor.getAttribute('href'));
    });
  });

  const concernForm = container.querySelector('#concern-form');
  if (concernForm) {
    concernForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const title = container.querySelector('#concern-title').value.trim();
      const description = container.querySelector('#concern-detail').value.trim();
      const name = container.querySelector('#concern-name').value.trim();

      if (!title) {
        return;
      }

      const submitButton = concernForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;

      const result = await api.post('/api/concerns', {
        title,
        description,
        name: name || null
      });

      submitButton.disabled = false;

      if (result.ok) {
        showSuccess(t('concern.success'));
        concernForm.reset();
      } else {
        showError(t('concern.error'));
      }
    });
  }
}

export { render, preload };
