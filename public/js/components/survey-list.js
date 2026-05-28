import * as api from '../services/api-client.js';
import { t } from '../services/i18n.js';
import { escapeHtml } from './modal.js';
import { showError, showSuccess } from './toast.js';

async function render(container) {
  container.innerHTML = '<p class="leer-zustand-text">' + t('general.loading') + '</p>';

  const response = await api.get('/api/surveys');

  if (!response.ok || !response.data || response.data.length === 0) {
    container.innerHTML = `
      <div class="leer-zustand">
        <div class="leer-zustand-icon">&#128203;</div>
        <p class="leer-zustand-text">${t('survey.empty')}</p>
      </div>
    `;
    return;
  }

  const html = `
    <h1 class="sektion-titel">${t('survey.title')}</h1>
    <div class="umfragen-container">
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
    <div class="umfrage-karte" data-survey-id="${escapeHtml(survey.id)}">
      <h2 class="karte-titel">${escapeHtml(survey.title)}</h2>
      ${survey.description ? `<p class="karte-text">${escapeHtml(survey.description)}</p>` : ''}
      <form class="umfrage-formular">
        ${questionsHtml}
        <div class="formular-gruppe">
          <input type="text" class="formular-eingabe umfrage-name"
            placeholder="${t('survey.namePlaceholder')}">
        </div>
        <button type="submit" class="btn btn-primaer">${t('survey.submit')}</button>
      </form>
    </div>
  `;
}

function renderQuestion(question, index) {
  let inputHtml = '';

  switch (question.type) {
    case 'free_text':
      inputHtml = `
        <textarea class="formular-textarea frage-eingabe"
          data-index="${index}"
          placeholder="${t('survey.freeText')}"
          rows="3"></textarea>
      `;
      break;

    case 'rating':
      inputHtml = `
        <div class="sterne-bewertung frage-eingabe" data-index="${index}" data-wert="0">
          ${[1,2,3,4,5].map(n => `
            <svg class="stern" data-wert="${n}" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          `).join('')}
        </div>
      `;
      break;

    case 'yes_no':
      inputHtml = `
        <div class="ja-nein-auswahl frage-eingabe" data-index="${index}" data-wert="">
          <button type="button" class="ja-nein-btn" data-wert="yes">${t('survey.yesLabel')}</button>
          <button type="button" class="ja-nein-btn" data-wert="no">${t('survey.noLabel')}</button>
        </div>
      `;
      break;

    case 'choice':
      inputHtml = `
        <div class="auswahl-gruppe frage-eingabe" data-index="${index}" data-wert="">
          ${(question.options || []).map(option => `
            <label class="auswahl-option">
              <input type="radio" name="frage_${index}" value="${escapeHtml(getOptionValue(option))}">
              <span>${escapeHtml(getOptionLabel(option))}</span>
            </label>
          `).join('')}
        </div>
      `;
      break;
    case 'multiple_choice':
      inputHtml = `
        <div class="auswahl-gruppe frage-eingabe" data-index="${index}" data-wert="">
          ${(question.options || []).map(option => `
            <label class="auswahl-option">
              <input type="checkbox" name="frage_${index}" value="${escapeHtml(getOptionValue(option))}">
              <span>${escapeHtml(getOptionLabel(option))}</span>
            </label>
          `).join('')}
        </div>
      `;
      break;

    default:
      inputHtml = `
        <input type="text" class="formular-eingabe frage-eingabe"
          data-index="${index}"
          placeholder="${t('survey.freeText')}">
      `;
  }

  return `
    <div class="frage-block">
      <p class="frage-text">${escapeHtml(question.text)}</p>
      ${inputHtml}
    </div>
  `;
}

function registerEvents(container) {
  container.querySelectorAll('.sterne-bewertung').forEach((rating) => {
    rating.querySelectorAll('.stern').forEach((star) => {
      star.addEventListener('click', () => {
        const value = parseInt(star.dataset.wert, 10);
        rating.dataset.wert = value;
        updateStars(rating, value);
      });
    });
  });

  container.querySelectorAll('.ja-nein-auswahl').forEach((choice) => {
    choice.querySelectorAll('.ja-nein-btn').forEach((button) => {
      button.addEventListener('click', () => {
        choice.querySelectorAll('.ja-nein-btn').forEach((element) =>
          element.classList.remove('ausgewaehlt')
        );
        button.classList.add('ausgewaehlt');
        choice.dataset.wert = button.dataset.wert;
      });
    });
  });

  container.querySelectorAll('.umfrage-formular').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitSurvey(form);
    });
  });
}

function updateStars(rating, value) {
  rating.querySelectorAll('.stern').forEach((star) => {
    const starValue = parseInt(star.dataset.wert, 10);
    if (starValue <= value) {
      star.classList.add('aktiv');
    } else {
      star.classList.remove('aktiv');
    }
  });
}

async function submitSurvey(form) {
  const card = form.closest('.umfrage-karte');
  const surveyId = card.dataset.surveyId;
  const nameInput = form.querySelector('.umfrage-name');
  const name = nameInput ? nameInput.value.trim() : '';

  const responses = [];
  form.querySelectorAll('.frage-eingabe').forEach((input) => {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      responses.push(input.value);
    } else if (input.classList.contains('sterne-bewertung')) {
      responses.push(parseInt(input.dataset.wert, 10) || 0);
    } else if (input.classList.contains('ja-nein-auswahl')) {
      responses.push(input.dataset.wert || '');
    } else if (input.classList.contains('auswahl-gruppe')) {
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
    form.querySelectorAll('.stern').forEach((star) => star.classList.remove('aktiv'));
    form.querySelectorAll('.ja-nein-btn').forEach((button) => button.classList.remove('ausgewaehlt'));
    form.querySelectorAll('.sterne-bewertung').forEach((rating) => { rating.dataset.wert = '0'; });
    form.querySelectorAll('.ja-nein-auswahl').forEach((choice) => { choice.dataset.wert = ''; });
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
