'use strict';

const store = require('./store');
const {
  DEFAULT_LOCALE,
  resolveLocalizedValue,
  toLocalizedValue,
  trimLocalizedValue
} = require('./localization');

const FILE_NAME = 'surveys.json';

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

function normalizeQuestion(question, locale = DEFAULT_LOCALE) {
  const text = question.text || question.frage || '';
  return {
    text: resolveLocalizedValue(text, locale),
    textLocalized: toLocalizedValue(text),
    type: question.type || question.typ || 'free_text',
    options: (question.options || question.optionen || []).map((option) => normalizeOption(option, locale))
  };
}

function normalizeResponse(response) {
  return {
    id: response.id,
    name: response.name || null,
    responses: response.responses || response.antworten || [],
    submittedAt: response.submittedAt || response.eingereichtAm || new Date().toISOString()
  };
}

function normalizeSurvey(survey, index = 0, locale = DEFAULT_LOCALE) {
  const sortOrder = Number(survey.sortOrder ?? survey.reihenfolge);
  const title = survey.title || survey.titel || '';
  const description = survey.description || survey.beschreibung || '';

  return {
    id: survey.id,
    title: resolveLocalizedValue(title, locale),
    titleLocalized: toLocalizedValue(title),
    description: resolveLocalizedValue(description, locale),
    descriptionLocalized: toLocalizedValue(description),
    questions: (survey.questions || survey.fragen || []).map((question) => normalizeQuestion(question, locale)),
    active: survey.active !== undefined ? survey.active : !!survey.aktiv,
    responses: (survey.responses || survey.antworten || []).map(normalizeResponse),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : index,
    createdAt: survey.createdAt || survey.erstelltAm || new Date().toISOString(),
    updatedAt: survey.updatedAt || survey.aktualisiertAm || null
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
    questions: (data.questions || []).map((question) => ({
      text: trimLocalizedValue(question.text),
      type: question.type || question.typ || 'free_text',
      options: (question.options || question.optionen || []).map((option) => {
        if (option && typeof option === 'object' && !Array.isArray(option)) {
          return {
            id: String(option.id || option.value || '').trim(),
            label: trimLocalizedValue(option.label || option.text || option.value || '')
          };
        }
        return option;
      })
    })),
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

  if (changes.title !== undefined || changes.titel !== undefined) {
    filteredChanges.title = trimLocalizedValue(changes.title !== undefined ? changes.title : changes.titel);
  }
  if (changes.description !== undefined || changes.beschreibung !== undefined) {
    filteredChanges.description = trimLocalizedValue(changes.description !== undefined ? changes.description : changes.beschreibung);
  }
  if (changes.questions !== undefined || changes.fragen !== undefined) {
    filteredChanges.questions = (changes.questions || changes.fragen || []).map((question) => ({
      text: trimLocalizedValue(question.text),
      type: question.type || question.typ || 'free_text',
      options: (question.options || question.optionen || []).map((option) => {
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
  if (changes.active !== undefined || changes.aktiv !== undefined) {
    filteredChanges.active = changes.active !== undefined ? changes.active : changes.aktiv;
  }
  if (changes.sortOrder !== undefined || changes.reihenfolge !== undefined) {
    const sortOrder = Number(changes.sortOrder !== undefined ? changes.sortOrder : changes.reihenfolge);
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
  const step = direction === 'down' || direction === 'runter' ? 1 : -1;

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
  const newResponse = {
    id: store.createId(),
    name: response.name || null,
    responses: response.responses || response.antworten || [],
    submittedAt: new Date().toISOString()
  };

  return store.mutateDataFile(FILE_NAME, (surveys) => {
    const index = surveys.findIndex((survey) => survey.id === surveyId);
    if (index === -1) {
      return { changed: false, result: false };
    }

    const normalizedSurvey = normalizeSurvey(surveys[index]);
    if (!normalizedSurvey.active) {
      return { changed: false, result: false };
    }

    surveys[index] = {
      ...surveys[index],
      responses: [...normalizedSurvey.responses, newResponse],
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
