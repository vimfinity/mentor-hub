import * as api from '../../services/api-client.js';
import { fetchQuery } from '../../services/query-cache.js';
import { t, getLanguage } from '../../services/i18n.js';
import { normalizeSelection, paginateItems } from '../../services/view-state.js';
import { showError, showSuccess } from '../../components/toast.js';
import { escapeHtml, openModal, confirmDialog } from '../../components/modal.js';
import { renderAdminSection, renderAdminPanel, renderAdminEmptyState } from '../../components/admin-ui.js';
import { renderListControls, bindListControls } from '../../components/list-controls.js';
import { icon } from '../../components/icons.js';
import { renderSelect, bindSelect } from '../../components/select.js';
import { copySurveyLink } from '../../components/survey-detail.js';
import {
  SURVEYS_CACHE_KEY,
  ITEMS_PER_ADMIN_PAGE,
  renderLocalizedInput,
  readLocalizedField,
  hasAnyLocalizedText,
  formatDate,
  invalidateAdminSurveys,
  handleUnauthorizedResponse
} from './shared.js';

export async function renderSurveysAdmin(container, context) {
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

function formatAnswerDisplay(answer, question) {
  if (answer == null || answer === '') {
    return '—';
  }
  if (question.type === 'rating') {
    const value = Number(answer);
    if (value >= 1 && value <= 5) {
      return Array.from({ length: 5 }, (_, i) => i < value ? icon('starFilled', 14) : icon('star', 14)).join('');
    }
    return escapeHtml(String(answer));
  }
  if (question.type === 'yes_no') {
    return answer === true || answer === 'yes'
      ? '<span class="status-badge status-open">Yes</span>'
      : '<span class="status-badge status-done">No</span>';
  }
  if ((question.type === 'multiple_choice' || question.type === 'choice') && Array.isArray(answer)) {
    return answer.map((id) => {
      const option = (question.options || []).find((o) => o.id === id);
      return '<span class="survey-results-choice-badge">' + escapeHtml(option ? option.label : id) + '</span>';
    }).join(' ');
  }
  if ((question.type === 'multiple_choice' || question.type === 'choice') && typeof answer === 'string') {
    const option = (question.options || []).find((o) => o.id === answer);
    return '<span class="survey-results-choice-badge">' + escapeHtml(option ? option.label : answer) + '</span>';
  }
  return escapeHtml(String(answer));
}

function getAnswer(response, question, questionIndex) {
  // Prefer the id-keyed answers map (reorder-safe); fall back to the positional
  // array for any legacy response shape.
  if (response.answers && Object.prototype.hasOwnProperty.call(response.answers, question.id)) {
    return response.answers[question.id];
  }
  return Array.isArray(response.responses) ? response.responses[questionIndex] : undefined;
}

function renderQuestionResults(question, questionIndex, responses) {
  const answers = responses.map((r) => getAnswer(r, question, questionIndex)).filter((a) => a != null && a !== '');
  const typeLabel = {
    free_text: t('admin.freeText'),
    rating: t('admin.rating'),
    yes_no: t('admin.yesNo'),
    choice: t('admin.choice'),
    multiple_choice: t('admin.multipleChoice')
  }[question.type] || question.type;

  let bodyHtml = '';

  if (question.type === 'rating') {
    const values = answers.map(Number).filter((v) => v >= 1 && v <= 5);
    const avg = values.length > 0 ? (values.reduce((sum, v) => sum + v, 0) / values.length) : 0;
    const distribution = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: values.filter((v) => v === star).length
    }));
    const maxCount = Math.max(...distribution.map((d) => d.count), 1);

    bodyHtml = `
      <div class="survey-results-rating-summary">
        <span class="survey-results-rating-avg">${avg.toFixed(1)}</span>
        <span class="survey-results-rating-stars">
          ${Array.from({ length: 5 }, (_, i) => i < Math.round(avg) ? icon('starFilled', 16) : icon('star', 16)).join('')}
        </span>
        <span style="font-size:var(--font-xs);color:var(--color-text-muted)">(${values.length})</span>
      </div>
      ${distribution.map((d) => `
        <div class="survey-results-bar-row">
          <div class="survey-results-bar-row-inline">
            <span class="survey-results-bar-label">${d.star} ${icon('starFilled', 12)}</span>
            <div class="survey-results-bar-track">
              <div class="survey-results-bar-fill" style="width:${maxCount > 0 ? (d.count / maxCount * 100) : 0}%"></div>
            </div>
            <span class="survey-results-bar-count">${d.count}</span>
          </div>
        </div>
      `).join('')}
    `;
  } else if (question.type === 'yes_no') {
    const yesCount = answers.filter((a) => a === true || a === 'yes').length;
    const noCount = answers.filter((a) => a === false || a === 'no').length;
    const total = yesCount + noCount || 1;

    bodyHtml = `
      <div class="survey-results-bar-row">
        <div class="survey-results-bar-row-inline">
          <span class="survey-results-bar-label">${escapeHtml(t('admin.yes'))}</span>
          <div class="survey-results-bar-track">
            <div class="survey-results-bar-fill" style="width:${(yesCount / total * 100)}%"></div>
          </div>
          <span class="survey-results-bar-count">${yesCount} · ${Math.round(yesCount / total * 100)}%</span>
        </div>
      </div>
      <div class="survey-results-bar-row">
        <div class="survey-results-bar-row-inline">
          <span class="survey-results-bar-label">${escapeHtml(t('admin.no'))}</span>
          <div class="survey-results-bar-track">
            <div class="survey-results-bar-fill" style="width:${(noCount / total * 100)}%"></div>
          </div>
          <span class="survey-results-bar-count">${noCount} · ${Math.round(noCount / total * 100)}%</span>
        </div>
      </div>
    `;
  } else if (question.type === 'choice' || question.type === 'multiple_choice') {
    const optionCounts = {};
    (question.options || []).forEach((o) => { optionCounts[o.id] = 0; });
    answers.forEach((answer) => {
      const items = Array.isArray(answer) ? answer : [answer];
      items.forEach((id) => {
        optionCounts[id] = (optionCounts[id] || 0) + 1;
      });
    });
    const maxCount = Math.max(...Object.values(optionCounts), 1);
    const respondentCount = answers.length || 1;

    bodyHtml = (question.options || []).map((o) => {
      const count = optionCounts[o.id] || 0;
      const percent = Math.round(count / respondentCount * 100);
      return `
        <div class="survey-results-bar-row">
          <span class="survey-results-bar-label">${escapeHtml(o.label)}</span>
          <div class="survey-results-bar-row-inline">
            <div class="survey-results-bar-track">
              <div class="survey-results-bar-fill" style="width:${maxCount > 0 ? (count / maxCount * 100) : 0}%"></div>
            </div>
            <span class="survey-results-bar-count">${count} · ${percent}%</span>
          </div>
        </div>
      `;
    }).join('');
  } else {
    bodyHtml = answers.length === 0
      ? '<p style="color:var(--color-text-muted);font-size:var(--font-sm)">—</p>'
      : `<ul class="survey-results-text-list">${answers.map((answer, i) => {
          const resp = responses.filter((r) => {
            const value = getAnswer(r, question, questionIndex);
            return value != null && value !== '';
          })[i];
          return `<li class="survey-results-text-item">
            ${escapeHtml(String(answer))}
            ${resp ? '<div class="survey-results-text-item-meta">' + (resp.name ? escapeHtml(resp.name) : '<em>' + escapeHtml(t('admin.anonymous')) + '</em>') + ' · ' + formatDate(resp.submittedAt) + '</div>' : ''}
          </li>`;
        }).join('')}</ul>`;
  }

  return `
    <div class="survey-results-question">
      <h4 class="survey-results-question-title">
        ${escapeHtml(question.text)}
        <span class="survey-results-question-type">${escapeHtml(typeLabel)}</span>
      </h4>
      ${bodyHtml}
    </div>
  `;
}

function exportSurveyCsv(survey) {
  const questions = survey.questions || [];
  const responses = survey.responses || [];

  const headers = [t('admin.respondent'), t('admin.date'), ...questions.map((q) => q.text)];
  const rows = responses.map((r) => {
    return [
      r.name || t('admin.anonymous'),
      formatDate(r.submittedAt),
      ...questions.map((q, i) => {
        const answer = getAnswer(r, q, i);
        if (answer == null) {
          return '';
        }
        if (Array.isArray(answer)) {
          return answer.map((id) => {
            const option = (q.options || []).find((o) => o.id === id);
            return option ? option.label : id;
          }).join(', ');
        }
        if (q.type === 'yes_no') {
          return answer === true || answer === 'yes' ? t('admin.yes') : t('admin.no');
        }
        return String(answer);
      })
    ];
  });

  const escape = (val) => {
    const str = String(val).replace(/"/g, '""');
    return /[",;\n\r]/.test(str) ? '"' + str + '"' : str;
  };

  const csvContent = [headers.map(escape).join(';'), ...rows.map((row) => row.map(escape).join(';'))].join('\r\n');
  const bom = '﻿';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (survey.title || 'survey').replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '') + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openSurveyDetails(survey) {
  const responses = survey.responses || [];
  const questions = survey.questions || [];

  if (responses.length === 0) {
    openModal({
      title: escapeHtml(survey.title) + ' – ' + t('admin.responses'),
      content: '<p>' + escapeHtml(t('admin.noResponses')) + '</p>',
      cancelText: t('general.close')
    });
    return;
  }

  const ratingQuestions = questions.filter((q) => q.type === 'rating');
  const ratingValues = ratingQuestions.flatMap((q) => {
    const idx = questions.indexOf(q);
    return responses.map((r) => Number(getAnswer(r, q, idx))).filter((v) => v >= 1 && v <= 5);
  });
  const overallAvg = ratingValues.length > 0 ? (ratingValues.reduce((s, v) => s + v, 0) / ratingValues.length) : null;

  const statsHtml = `
    <div class="survey-results-stats">
      <div class="survey-results-stat">
        <span class="survey-results-stat-value">${responses.length}</span>
        <span class="survey-results-stat-label">${escapeHtml(t('admin.totalResponses'))}</span>
      </div>
      ${overallAvg !== null ? `
        <div class="survey-results-stat">
          <span class="survey-results-stat-value">${overallAvg.toFixed(1)}</span>
          <span class="survey-results-stat-label">${escapeHtml(t('admin.averageRating'))}</span>
        </div>
      ` : ''}
    </div>
  `;

  const questionsHtml = questions.map((q, i) => renderQuestionResults(q, i, responses)).join('');

  const individualHtml = `
    <details class="survey-results-individual">
      <summary>${escapeHtml(t('admin.individualResponses'))} (${responses.length})</summary>
      <div style="overflow-x:auto">
        <table class="table">
          <thead>
            <tr>
              <th>${escapeHtml(t('admin.respondent'))}</th>
              <th>${escapeHtml(t('admin.date'))}</th>
              ${questions.map((q) => '<th>' + escapeHtml(q.text) + '</th>').join('')}
            </tr>
          </thead>
          <tbody>
            ${responses.map((r) => `
              <tr>
                <td>${r.name ? escapeHtml(r.name) : '<em>' + escapeHtml(t('admin.anonymous')) + '</em>'}</td>
                <td>${formatDate(r.submittedAt)}</td>
                ${questions.map((q, i) => '<td>' + formatAnswerDisplay(getAnswer(r, q, i), q) + '</td>').join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </details>
  `;

  const content = `
    <div class="survey-results-header">
      ${statsHtml}
      <button class="btn btn-secondary btn-small" id="survey-export-csv">
        ${icon('download', 14)} ${escapeHtml(t('admin.exportCsv'))}
      </button>
    </div>
    ${questionsHtml}
    ${individualHtml}
  `;

  const modal = openModal({
    title: escapeHtml(survey.title) + ' – ' + t('admin.responses'),
    content,
    cancelText: t('general.close'),
    size: 'medium'
  });

  const exportButton = modal.querySelector('#survey-export-csv');
  if (exportButton) {
    exportButton.addEventListener('click', () => exportSurveyCsv(survey));
  }
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
