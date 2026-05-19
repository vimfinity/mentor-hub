import * as api from '../services/api-client.js';
import { t } from '../services/i18n.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';
import { showError, showSuccess } from './toast.js';

async function render(container) {
  const response = await api.get('/api/surveys');
  const hasSurveys = response.ok && response.data && response.data.length > 0;

  let html = `<h1 class="sektion-titel">${t('survey.title')}</h1>`;

  if (hasSurveys) {
    html += `
      <div class="umfragen-container">
        ${response.data.map((survey) => renderSurvey(survey)).join('')}
      </div>
    `;
  }

  html += renderConcernForm();

  container.innerHTML = html;
  registerEvents(container);
}

function renderConcernForm() {
  return `
    <div class="anliegen-sektion">
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
    </div>
  `;
}

function renderSurvey(survey) {
  const questionsHtml = survey.questions.map((question, index) => renderQuestion(question, index)).join('');

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
        <button type="submit" class="btn btn-primaer">
          ${icon('send', 16)}
          <span>${t('survey.submit')}</span>
        </button>
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
          ${[1, 2, 3, 4, 5].map((value) => `
            <span class="stern" data-wert="${value}">${icon('star', 28)}</span>
          `).join('')}
        </div>
      `;
      break;
    case 'yes_no':
      inputHtml = `
        <div class="ja-nein-auswahl frage-eingabe" data-index="${index}" data-wert="">
          <button type="button" class="ja-nein-btn" data-wert="yes">
            ${icon('thumbsUp', 16)} ${t('survey.yesLabel')}
          </button>
          <button type="button" class="ja-nein-btn" data-wert="no">
            ${icon('thumbsDown', 16)} ${t('survey.noLabel')}
          </button>
        </div>
      `;
      break;
    case 'choice':
      inputHtml = `
        <div class="auswahl-gruppe frage-eingabe" data-index="${index}" data-wert="">
          ${(question.options || []).map((option) => `
            <label class="auswahl-option">
              <input type="radio" name="frage_${index}" value="${escapeHtml(option)}">
              <span>${escapeHtml(option)}</span>
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
        choice.querySelectorAll('.ja-nein-btn').forEach((element) => element.classList.remove('ausgewaehlt'));
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

function updateStars(rating, value) {
  rating.querySelectorAll('.stern').forEach((star) => {
    const starValue = parseInt(star.dataset.wert, 10);
    star.classList.toggle('aktiv', starValue <= value);
  });
}

async function submitSurvey(form) {
  const card = form.closest('.umfrage-karte');
  const surveyId = card.dataset.surveyId;
  const responses = [];

  form.querySelectorAll('.frage-eingabe').forEach((input) => {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      responses.push(input.value.trim());
    } else if (input.classList.contains('sterne-bewertung')) {
      responses.push(parseInt(input.dataset.wert, 10) || 0);
    } else if (input.classList.contains('ja-nein-auswahl')) {
      responses.push(input.dataset.wert || '');
    } else if (input.classList.contains('auswahl-gruppe')) {
      const selected = input.querySelector('input:checked');
      responses.push(selected ? selected.value : '');
    }
  });

  const nameInput = form.querySelector('.umfrage-name');
  const name = nameInput ? nameInput.value.trim() : null;

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  const result = await api.post('/api/surveys/' + surveyId + '/responses', {
    name: name || null,
    responses
  });

  submitButton.disabled = false;

  if (result.ok) {
    showSuccess(t('survey.success'));
    card.style.opacity = '0.6';
    card.style.pointerEvents = 'none';
  } else {
    showError(result.data?.error || t('survey.error'));
  }
}

export { render };