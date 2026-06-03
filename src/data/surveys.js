'use strict';

const store = require('./store');
const {
  DEFAULT_LOCALE,
  resolveLocalizedValue,
  toLocalizedValue,
  trimLocalizedValue
} = require('./localization');

const FILE_NAME = 'surveys.json';

/**
 * Normalizes incoming question payloads for persistence, assigning a stable
 * id to any question that lacks one. Ids let responses survive question
 * reordering, insertion or deletion.
 * @param {Array} questions - Raw question payloads
 * @returns {Array} Questions ready to persist
 */
function prepareQuestions(questions) {
  return (questions || []).map((question) => ({
    id: String(question.id || store.createId()),
    text: trimLocalizedValue(question.text),
    type: question.type || 'free_text',
    options: (question.options || []).map((option) => {
      if (option && typeof option === 'object' && !Array.isArray(option)) {
        return {
          id: String(option.id || option.value || '').trim(),
          label: trimLocalizedValue(option.label || option.text || option.value || '')
        };
      }
      return option;
    })
  }));
}

function normalizeOption(option, locale = DEFAULT_LOCALE) {
  if (option && typeof option === 'object' && !Array.isArray(option)) {
    const label = option.label || option.text || option.value || '';
    return {
      id: String(option.id || option.value || resolveLocalizedValue(label, locale)).trim(),
      label: resolveLocalizedValue(label, locale),
      labelLocalized: toLocalizedValue(label)
    };
  }

  const text = typeof option === 'string' ? option : '';
  return {
    id: text,
    label: text,
    labelLocalized: toLocalizedValue(text)
  };
}

function normalizeQuestion(question, index = 0, locale = DEFAULT_LOCALE) {
  const text = question.text || question.question || '';
  return {
    // Stable identifier so responses can be keyed by question rather than by
    // position. Legacy questions without an id fall back to a positional id.
    id: question.id || ('q' + index),
    text: resolveLocalizedValue(text, locale),
    textLocalized: toLocalizedValue(text),
    type: question.type || 'free_text',
    options: (question.options || []).map((option) => normalizeOption(option, locale))
  };
}

function normalizeResponse(response, questions = []) {
  // Newer responses store answers keyed by question id, which survives question
  // reordering/insertion. Older responses only have a positional array. We
  // always expose both: `answers` (id-keyed) and `responses` (a positional
  // array realigned to the current question order) so consumers keep working.
  const storedAnswers = response.answers && typeof response.answers === 'object' && !Array.isArray(response.answers)
    ? response.answers
    : null;
  const legacyArray = Array.isArray(response.responses) ? response.responses : [];

  let answers;
  let positional;

  if (storedAnswers) {
    answers = { ...storedAnswers };
    positional = questions.map((question) => {
      const value = answers[question.id];
      return value === undefined ? null : value;
    });
  } else {
    // Map the legacy positional array onto the current question ids.
    answers = {};
    questions.forEach((question, index) => {
      if (index < legacyArray.length) {
        answers[question.id] = legacyArray[index];
      }
    });
    positional = questions.length > 0
      ? questions.map((question, index) => (index < legacyArray.length ? legacyArray[index] : null))
      : legacyArray.slice();
  }

  return {
    id: response.id,
    name: response.name || null,
    answers,
    responses: positional,
    submittedAt: response.submittedAt || new Date().toISOString()
  };
}

function normalizeSurvey(survey, index = 0, locale = DEFAULT_LOCALE) {
  const sortOrder = Number(survey.sortOrder);
  const title = survey.title || '';
  const description = survey.description || '';
  const questions = (survey.questions || []).map((question, questionIndex) =>
    normalizeQuestion(question, questionIndex, locale));

  return {
    id: survey.id,
    title: resolveLocalizedValue(title, locale),
    titleLocalized: toLocalizedValue(title),
    description: resolveLocalizedValue(description, locale),
    descriptionLocalized: toLocalizedValue(description),
    questions,
    active: survey.active,
    responses: (survey.responses || []).map((response) => normalizeResponse(response, questions)),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : index,
    createdAt: survey.createdAt || new Date().toISOString(),
    updatedAt: survey.updatedAt || null
  };
}

function loadSurveys(locale = DEFAULT_LOCALE) {
  return store.readDataFile(FILE_NAME).map((survey, index) => normalizeSurvey(survey, index, locale));
}

function compareSurveyOrder(left, right) {
  const byOrder = left.sortOrder - right.sortOrder;
  if (byOrder !== 0) {
    return byOrder;
  }
  return new Date(right.createdAt) - new Date(left.createdAt);
}

/**
 * Returns all active surveys without responses.
 * @returns {Array} List of active surveys
 */
function getActive(locale = DEFAULT_LOCALE) {
  return loadSurveys(locale)
    .filter((survey) => survey.active)
    .sort(compareSurveyOrder)
    .map((survey) => ({
      id: survey.id,
      title: survey.title,
      description: survey.description,
      questions: survey.questions,
      sortOrder: survey.sortOrder,
      createdAt: survey.createdAt
    }));
}

function getActiveById(id, locale = DEFAULT_LOCALE) {
  return getActive(locale).find((survey) => survey.id === id) || null;
}

/**
 * Returns all surveys including responses.
 * @returns {Array} All surveys
 */
function getAll(locale = DEFAULT_LOCALE) {
  return loadSurveys(locale);
}

/**
 * Creates a new survey.
 * @param {Object} data - Survey payload
 * @returns {Object} Created survey
 */
function create(data) {
  const existing = loadSurveys();
  const survey = {
    title: trimLocalizedValue(data.title),
    description: trimLocalizedValue(data.description || ''),
    questions: prepareQuestions(data.questions),
    active: true,
    sortOrder: existing.length > 0
      ? Math.max(...existing.map((item) => Number(item.sortOrder) || 0)) + 1
      : 0,
    responses: []
  };
  return store.addItem(FILE_NAME, survey);
}

/**
 * Updates a survey.
 * @param {string} id - Survey id
 * @param {Object} changes - Fields to update
 * @returns {Object|null} Updated survey or null
 */
function update(id, changes) {
  const allowedFields = ['title', 'description', 'questions', 'active', 'sortOrder'];
  const filteredChanges = {};

  if (changes.title !== undefined) {
    filteredChanges.title = trimLocalizedValue(changes.title);
  }
  if (changes.description !== undefined) {
    filteredChanges.description = trimLocalizedValue(changes.description);
  }
  if (changes.questions !== undefined) {
    filteredChanges.questions = prepareQuestions(changes.questions);
  }
  if (changes.active !== undefined) {
    filteredChanges.active = changes.active;
  }
  if (changes.sortOrder !== undefined) {
    const sortOrder = Number(changes.sortOrder);
    if (Number.isFinite(sortOrder)) {
      filteredChanges.sortOrder = sortOrder;
    }
  }

  for (const field of Object.keys(filteredChanges)) {
    if (!allowedFields.includes(field)) {
      delete filteredChanges[field];
    }
  }

  return store.updateItem(FILE_NAME, id, filteredChanges);
}

function move(id, direction) {
  const step = direction === 'down' ? 1 : -1;

  return store.mutateDataFile(FILE_NAME, (records) => {
    const ordered = records
      .map((survey, index) => ({
        raw: survey,
        normalized: normalizeSurvey(survey, index)
      }))
      .sort((left, right) => compareSurveyOrder(left.normalized, right.normalized));
    const index = ordered.findIndex((entry) => entry.normalized.id === id);
    const targetIndex = index + step;

    if (index === -1 || targetIndex < 0 || targetIndex >= ordered.length) {
      return { changed: false, result: null };
    }

    const [entry] = ordered.splice(index, 1);
    ordered.splice(targetIndex, 0, entry);

    records.length = 0;
    ordered.forEach((item, sortOrder) => {
      records.push({
        ...item.raw,
        sortOrder,
        updatedAt: item.normalized.id === id ? new Date().toISOString() : item.raw.updatedAt
      });
    });

    return { changed: true, result: normalizeSurvey(records.find((surveyItem) => surveyItem.id === id)) };
  });
}

/**
 * Adds a response to a survey.
 * @param {string} surveyId - Survey id
 * @param {Object} response - Response payload
 * @returns {boolean} True if successful
 */
function addResponse(surveyId, response) {
  return store.mutateDataFile(FILE_NAME, (surveys) => {
    const index = surveys.findIndex((survey) => survey.id === surveyId);
    if (index === -1) {
      return { changed: false, result: false };
    }

    const normalizedSurvey = normalizeSurvey(surveys[index]);
    if (!normalizedSurvey.active) {
      return { changed: false, result: false };
    }

    // Persist answers keyed by question id so they stay correct even if the
    // questions are later reordered. Accept either an id-keyed `answers` map
    // (preferred) or a legacy positional `responses` array from older clients.
    const questions = normalizedSurvey.questions;
    const answers = {};
    if (response.answers && typeof response.answers === 'object' && !Array.isArray(response.answers)) {
      questions.forEach((question) => {
        if (Object.prototype.hasOwnProperty.call(response.answers, question.id)) {
          answers[question.id] = response.answers[question.id];
        }
      });
    } else {
      const positional = Array.isArray(response.responses) ? response.responses : [];
      questions.forEach((question, questionIndex) => {
        if (questionIndex < positional.length) {
          answers[question.id] = positional[questionIndex];
        }
      });
    }

    const newResponse = {
      id: store.createId(),
      name: response.name || null,
      answers,
      submittedAt: new Date().toISOString()
    };

    // Persist the raw stored responses (id-keyed), not the normalized view.
    const storedResponses = Array.isArray(surveys[index].responses) ? surveys[index].responses : [];
    surveys[index] = {
      ...surveys[index],
      responses: [...storedResponses, newResponse],
      updatedAt: new Date().toISOString()
    };

    return { changed: true, result: true };
  });
}

/**
 * Deletes a survey.
 * @param {string} id - Survey id
 * @returns {boolean} True if deleted
 */
function remove(id) {
  return store.deleteItem(FILE_NAME, id);
}

module.exports = {
  getActive,
  getActiveById,
  getAll,
  create,
  update,
  move,
  addResponse,
  remove
};
