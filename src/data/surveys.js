'use strict';

const store = require('./store');

const FILE_NAME = 'surveys.json';

function normalizeQuestion(question) {
  return {
    text: question.text,
    type: question.type || question.typ || 'free_text',
    options: question.options || question.optionen || []
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

function normalizeSurvey(survey, index = 0) {
  const sortOrder = Number(survey.sortOrder ?? survey.reihenfolge);

  return {
    id: survey.id,
    title: survey.title || survey.titel || '',
    description: survey.description || survey.beschreibung || '',
    questions: (survey.questions || survey.fragen || []).map(normalizeQuestion),
    active: survey.active !== undefined ? survey.active : !!survey.aktiv,
    responses: (survey.responses || survey.antworten || []).map(normalizeResponse),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : index,
    createdAt: survey.createdAt || survey.erstelltAm || new Date().toISOString(),
    updatedAt: survey.updatedAt || survey.aktualisiertAm || null
  };
}

function loadSurveys() {
  return store.readDataFile(FILE_NAME).map((survey, index) => normalizeSurvey(survey, index));
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
function getActive() {
  return loadSurveys()
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

function getActiveById(id) {
  return getActive().find((survey) => survey.id === id) || null;
}

/**
 * Returns all surveys including responses.
 * @returns {Array} All surveys
 */
function getAll() {
  return loadSurveys();
}

/**
 * Creates a new survey.
 * @param {Object} data - Survey payload
 * @returns {Object} Created survey
 */
function create(data) {
  const existing = loadSurveys();
  const survey = {
    title: data.title,
    description: data.description || '',
    questions: (data.questions || []).map(normalizeQuestion),
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
    filteredChanges.title = changes.title !== undefined ? changes.title : changes.titel;
  }
  if (changes.description !== undefined || changes.beschreibung !== undefined) {
    filteredChanges.description = changes.description !== undefined ? changes.description : changes.beschreibung;
  }
  if (changes.questions !== undefined || changes.fragen !== undefined) {
    filteredChanges.questions = (changes.questions || changes.fragen || []).map(normalizeQuestion);
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
    const normalized = records
      .map((survey, index) => normalizeSurvey(survey, index))
      .sort(compareSurveyOrder);
    const index = normalized.findIndex((survey) => survey.id === id);
    const targetIndex = index + step;

    if (index === -1 || targetIndex < 0 || targetIndex >= normalized.length) {
      return { changed: false, result: null };
    }

    const [survey] = normalized.splice(index, 1);
    normalized.splice(targetIndex, 0, survey);

    records.length = 0;
    normalized.forEach((item, sortOrder) => {
      records.push({
        ...item,
        sortOrder,
        updatedAt: item.id === id ? new Date().toISOString() : item.updatedAt
      });
    });

    return { changed: true, result: records.find((surveyItem) => surveyItem.id === id) };
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
      id: normalizedSurvey.id,
      title: normalizedSurvey.title,
      description: normalizedSurvey.description,
      questions: normalizedSurvey.questions,
      active: normalizedSurvey.active,
      responses: [...normalizedSurvey.responses, newResponse],
      sortOrder: normalizedSurvey.sortOrder,
      createdAt: normalizedSurvey.createdAt,
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
