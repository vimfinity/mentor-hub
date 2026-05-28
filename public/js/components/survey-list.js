import * as api from '../services/api-client.js';
import { t } from '../services/i18n.js';
import { escapeHtml } from './modal.js';
import { showError, showSuccess } from './toast.js';

async function render(container) {
  container.innerHTML = '<p class="empty-state-text">' + t('general.loading') + '</p>';

  const response = await api.get('/api/surveys');

  if (!response.ok || !response.data || response.data.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#128203;</div>
        <p class="empty-state-text">${t('survey.empty')}</p>
      </div>
    `;
    return;
  }

  const html = `
    <h1 class="section-title">${t('survey.title')}</h1>
    <div class="surveys-container">
      ${response.data.map((survey) => renderSurvey(survey)).join('')}
    </div>
  `;

  container.innerHTML = html;
  registerEvents(container);
}

function renderSurvey(survey) {
  const questionsHtml = survey.questions.map((question, index) =>
    renderQuestion(question, index)
  ).join('');

  return `
    <div class="survey-card" data-survey-id="${escapeHtml(survey.id)}">
      <h2 class="card-title">${escapeHtml(survey.title)}</h2>
      ${survey.description ? `<p class="card-text">${escapeHtml(survey.description)}</p>` : ''}
      <form class="survey-form">
        ${questionsHtml}
        <div class="form-group">
          <input type="text" class="form-input survey-name"
            placeholder="${t('survey.namePlaceholder')}">
        </div>
        <button type="submit" class="btn btn-primary">${t('survey.submit')}</button>
      </form>
    </div>
  `;
}

function renderQuestion(question, index) {
  let inputHtml = '';

  switch (question.type) {
    case 'free_text':
      inputHtml = `
        <textarea class="form-textarea question-input"
          data-index="${index}"
          placeholder="${t('survey.freeText')}"
          rows="3"></textarea>
      `;
      break;

    case 'rating':
      inputHtml = `
        <div class="star-rating question-input" data-index="${index}" data-value="0">
          ${[1,2,3,4,5].map(n => `
            <svg class="star" data-value="${n}" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          `).join('')}
        </div>
      `;
      break;

    case 'yes_no':
      inputHtml = `
        <div class="yes-no-choice question-input" data-index="${index}" data-value="">
          <button type="button" class="yes-no-button" data-value="yes">${t('survey.yesLabel')}</button>
          <button type="button" class="yes-no-button" data-value="no">${t('survey.noLabel')}</button>
        </div>
      `;
      break;

    case 'choice':
      inputHtml = `
        <div class="option-group question-input" data-index="${index}" data-value="">
          ${(question.options || []).map(option => `
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
        <div class="option-group question-input" data-index="${index}" data-value="">
          ${(question.options || []).map(option => `
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
          data-index="${index}"
          placeholder="${t('survey.freeText')}">
      `;
  }

  return `
    <div class="question-block">
      <p class="question-text">${escapeHtml(question.text)}</p>
      ${inputHtml}
    </div>
  `;
}

function registerEvents(container) {
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
        choice.querySelectorAll('.yes-no-button').forEach((element) =>
          element.classList.remove('selected')
        );
        button.classList.add('selected');
        choice.dataset.value = button.dataset.value;
      });
    });
  });

  container.querySelectorAll('.survey-form').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitSurvey(form);
    });
  });
}

function updateStars(rating, value) {
  rating.querySelectorAll('.star').forEach((star) => {
    const starValue = parseInt(star.dataset.value, 10);
    if (starValue <= value) {
      star.classList.add('active');
    } else {
      star.classList.remove('active');
    }
  });
}

async function submitSurvey(form) {
  const card = form.closest('.survey-card');
  const surveyId = card.dataset.surveyId;
  const nameInput = form.querySelector('.survey-name');
  const name = nameInput ? nameInput.value.trim() : '';

  const responses = [];
  form.querySelectorAll('.question-input').forEach((input) => {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      responses.push(input.value);
    } else if (input.classList.contains('star-rating')) {
      responses.push(parseInt(input.dataset.value, 10) || 0);
    } else if (input.classList.contains('yes-no-choice')) {
      responses.push(input.dataset.value || '');
    } else if (input.classList.contains('option-group')) {
      const selected = Array.from(input.querySelectorAll('input:checked')).map((option) => option.value);
      responses.push(input.querySelector('input[type="checkbox"]') ? selected : (selected[0] || ''));
    }
  });

  const result = await api.post('/api/surveys/' + surveyId + '/responses', {
    name: name || null,
    responses
  });

  if (result.ok) {
    showSuccess(t('survey.success'));
    form.reset();
    form.querySelectorAll('.star').forEach((star) => star.classList.remove('active'));
    form.querySelectorAll('.yes-no-button').forEach((button) => button.classList.remove('selected'));
    form.querySelectorAll('.star-rating').forEach((rating) => { rating.dataset.value = '0'; });
    form.querySelectorAll('.yes-no-choice').forEach((choice) => { choice.dataset.value = ''; });
  } else {
    showError(t('survey.error'));
  }
}

function getOptionLabel(option) {
  return option && typeof option === 'object' ? option.label || option.id || '' : option;
}

function getOptionValue(option) {
  return option && typeof option === 'object' ? option.id || option.label || '' : option;
}

export { render };
