import * as api from '../services/api-client.js';
import { fetchQuery, invalidateQuery } from '../services/query-cache.js';
import { t, getLocale } from '../services/i18n.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';
import { showError, showSuccess } from './toast.js';

const DETAIL_CACHE_TTL_MS = 60 * 1000;

async function render(container, context = {}) {
  const id = extractIdFromPath(context.path);
  if (!id) {
    renderNotFound(container, context);
    return;
  }

  const response = await fetchQuery({
    key: ['survey-detail', getLocale(), id],
    fetchFunction: () => getSurveyById(id),
    ttlMs: DETAIL_CACHE_TTL_MS
  });

  if (!response.ok || !response.data) {
    renderNotFound(container, context);
    return;
  }

  const survey = response.data;
  const questionsHtml = survey.questions.map((question, index) => renderQuestion(question, index)).join('');

  container.innerHTML = `
    <article class="feed-detail-page survey-detail-page">
      <header class="feed-detail-header">
        <div class="feed-detail-meta">
          <span class="feed-card-type accent-skill">${escapeHtml(t('survey.singleLabel'))}</span>
          <time class="feed-card-time">${escapeHtml(formatDate(survey.createdAt))}</time>
        </div>
        <h1 class="feed-detail-title">${escapeHtml(survey.title)}</h1>
        ${survey.description ? `<p class="feed-detail-lead">${escapeHtml(survey.description)}</p>` : ''}
        <div class="feed-detail-actions">
          <button class="tab-link tab-link-utility tab-link-icon" type="button" data-copy-survey-link aria-label="${escapeHtml(t('survey.copyLink'))}" title="${escapeHtml(t('survey.copyLink'))}">
            <span class="tab-icon">${icon('link', 16)}</span>
          </button>
        </div>
      </header>

      <form class="survey-form survey-detail-form" data-survey-id="${escapeHtml(survey.id)}">
        ${questionsHtml}
        <div class="form-group">
          <input type="text" class="form-input survey-name"
            placeholder="${escapeHtml(t('survey.namePlaceholder'))}">
        </div>
        <button type="submit" class="btn btn-primary">
          ${icon('send', 16)}
          <span>${escapeHtml(t('survey.submit'))}</span>
        </button>
      </form>
    </article>
  `;

  registerSurveyEvents(container, survey.id);

  const copyButton = container.querySelector('[data-copy-survey-link]');
  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      await copySurveyLink(survey.id);
    });
  }
}

function preload(context = {}) {
  const id = extractIdFromPath(context.path);
  if (!id) {
    return Promise.resolve();
  }
  return fetchQuery({
    key: ['survey-detail', getLocale(), id],
    fetchFunction: () => getSurveyById(id),
    ttlMs: DETAIL_CACHE_TTL_MS
  });
}

async function getSurveyById(id) {
  const response = await api.get('/api/surveys/' + encodeURIComponent(id));
  if (response.ok || response.status !== 404) {
    return response;
  }

  const fallback = await api.get('/api/surveys');
  if (!fallback.ok || !Array.isArray(fallback.data)) {
    return response;
  }

  const survey = fallback.data.find((item) => item.id === id);
  return survey
    ? { ok: true, status: 200, data: survey }
    : response;
}

function renderQuestion(question, index) {
  let inputHtml = '';
  const qid = escapeHtml(question.id || ('q' + index));

  switch (question.type) {
    case 'free_text':
      inputHtml = `
        <textarea class="form-textarea question-input"
          data-index="${index}" data-question-id="${qid}"
          placeholder="${escapeHtml(t('survey.freeText'))}"
          rows="3"></textarea>
      `;
      break;
    case 'rating':
      inputHtml = `
        <div class="star-rating question-input" data-index="${index}" data-question-id="${qid}" data-value="0">
          ${[1, 2, 3, 4, 5].map((value) => `
            <span class="star" data-value="${value}">${icon('star', 28)}</span>
          `).join('')}
        </div>
      `;
      break;
    case 'yes_no':
      inputHtml = `
        <div class="yes-no-choice question-input" data-index="${index}" data-question-id="${qid}" data-value="">
          <button type="button" class="yes-no-button" data-value="yes">
            ${icon('thumbsUp', 16)} ${escapeHtml(t('survey.yesLabel'))}
          </button>
          <button type="button" class="yes-no-button" data-value="no">
            ${icon('thumbsDown', 16)} ${escapeHtml(t('survey.noLabel'))}
          </button>
        </div>
      `;
      break;
    case 'choice':
      inputHtml = `
        <div class="option-group question-input" data-index="${index}" data-question-id="${qid}" data-value="">
          ${(question.options || []).map((option) => `
            <label class="option-choice">
              <input type="radio" name="question_${index}" value="${escapeHtml(getOptionValue(option))}">
              <span>${escapeHtml(getOptionLabel(option))}</span>
            </label>
          `).join('')}
        </div>
      `;
      break;
    case 'multiple_choice':
      inputHtml = `
        <div class="option-group question-input" data-index="${index}" data-question-id="${qid}" data-value="">
          ${(question.options || []).map((option) => `
            <label class="option-choice">
              <input type="checkbox" name="question_${index}" value="${escapeHtml(getOptionValue(option))}">
              <span>${escapeHtml(getOptionLabel(option))}</span>
            </label>
          `).join('')}
        </div>
      `;
      break;
    default:
      inputHtml = `
        <input type="text" class="form-input question-input"
          data-index="${index}" data-question-id="${qid}"
          placeholder="${escapeHtml(t('survey.freeText'))}">
      `;
  }

  return `
    <div class="question-block">
      <p class="question-text">${escapeHtml(question.text)}</p>
      ${inputHtml}
    </div>
  `;
}

function registerSurveyEvents(container, surveyId) {
  container.querySelectorAll('.star-rating').forEach((rating) => {
    rating.querySelectorAll('.star').forEach((star) => {
      star.addEventListener('click', () => {
        const value = parseInt(star.dataset.value, 10);
        rating.dataset.value = value;
        updateStars(rating, value);
      });
    });
  });

  container.querySelectorAll('.yes-no-choice').forEach((choice) => {
    choice.querySelectorAll('.yes-no-button').forEach((button) => {
      button.addEventListener('click', () => {
        choice.querySelectorAll('.yes-no-button').forEach((element) => element.classList.remove('selected'));
        button.classList.add('selected');
        choice.dataset.value = button.dataset.value;
      });
    });
  });

  container.querySelectorAll('.survey-form').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitSurvey(form, surveyId);
    });
  });
}

function updateStars(rating, value) {
  rating.querySelectorAll('.star').forEach((star) => {
    const starValue = parseInt(star.dataset.value, 10);
    star.classList.toggle('active', starValue <= value);
  });
}

async function submitSurvey(form, surveyId) {
  const answers = {};

  form.querySelectorAll('.question-input').forEach((input) => {
    const questionId = input.dataset.questionId;
    if (!questionId) {
      return;
    }
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      answers[questionId] = input.value.trim();
    } else if (input.classList.contains('star-rating')) {
      answers[questionId] = parseInt(input.dataset.value, 10) || 0;
    } else if (input.classList.contains('yes-no-choice')) {
      answers[questionId] = input.dataset.value || '';
    } else if (input.classList.contains('option-group')) {
      const selected = Array.from(input.querySelectorAll('input:checked')).map((option) => option.value);
      answers[questionId] = input.querySelector('input[type="checkbox"]') ? selected : (selected[0] || '');
    }
  });

  const nameInput = form.querySelector('.survey-name');
  const name = nameInput ? nameInput.value.trim() : null;
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  const result = await api.post('/api/surveys/' + encodeURIComponent(surveyId) + '/responses', {
    name: name || null,
    answers
  });

  submitButton.disabled = false;

  if (result.ok) {
    invalidateQuery(['survey-detail', getLocale(), surveyId]);
    showSuccess(t('survey.success'));
    form.reset();
    form.querySelectorAll('.star').forEach((star) => star.classList.remove('active'));
    form.querySelectorAll('.yes-no-button').forEach((button) => button.classList.remove('selected'));
    form.querySelectorAll('.star-rating').forEach((rating) => { rating.dataset.value = '0'; });
    form.querySelectorAll('.yes-no-choice').forEach((choice) => { choice.dataset.value = ''; });
  } else {
    showError(result.data?.error || t('survey.error'));
  }
}

function renderNotFound(container, context) {
  container.innerHTML = `
    <div class="feed-empty">
      <div class="feed-empty-icon">${icon('alertCircle', 56)}</div>
      <h2 class="feed-empty-title">${escapeHtml(t('survey.detailMissingTitle'))}</h2>
      <p class="feed-empty-text">${escapeHtml(t('survey.detailMissingText'))}</p>
      <a class="btn btn-secondary" href="/feedback" data-back="1" style="margin-top: 1rem;">
        ${escapeHtml(t('survey.backToFeedback'))}
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
      context.navigateTo?.('/feedback');
    });
  }
}

function extractIdFromPath(path) {
  if (!path) {
    return null;
  }
  const match = String(path).match(/^(?:\/(?:de-DE|en-US))?\/surveys\/([^/?#]+)/);
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

async function copySurveyLink(id) {
  await copyToClipboard(new URL('/' + getLocale() + '/surveys/' + encodeURIComponent(id), window.location.origin).href);
  showSuccess(t('survey.linkCopied'));
}

function getOptionLabel(option) {
  return option && typeof option === 'object' ? option.label || option.id || '' : option;
}

function getOptionValue(option) {
  return option && typeof option === 'object' ? option.id || option.label || '' : option;
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

export { render, preload, copySurveyLink };
