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

function normalizeSurvey(survey) {
  return {
    id: survey.id,
    title: survey.title || survey.titel || '',
    description: survey.description || survey.beschreibung || '',
    questions: (survey.questions || survey.fragen || []).map(normalizeQuestion),
    active: survey.active !== undefined ? survey.active : !!survey.aktiv,
    responses: (survey.responses || survey.antworten || []).map(normalizeResponse),
    createdAt: survey.createdAt || survey.erstelltAm || new Date().toISOString(),
    updatedAt: survey.updatedAt || survey.aktualisiertAm || null
  };
}

function loadSurveys() {
  return store.readDataFile(FILE_NAME).map(normalizeSurvey);
}

/**
 * Returns all active surveys without responses.
 * @returns {Array} List of active surveys
 */
function getActive() {
  return loadSurveys()
    .filter((survey) => survey.active)
    .map((survey) => ({
      id: survey.id,
      title: survey.title,
      description: survey.description,
      questions: survey.questions,
      createdAt: survey.createdAt
    }));
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
  const survey = {
    title: data.title,
    description: data.description || '',
    questions: (data.questions || []).map(normalizeQuestion),
    active: true,
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
  const allowedFields = ['title', 'description', 'questions', 'active'];
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

  for (const field of Object.keys(filteredChanges)) {
    if (!allowedFields.includes(field)) {
      delete filteredChanges[field];
    }
  }

  return store.updateItem(FILE_NAME, id, filteredChanges);
}

/**
 * Adds a response to a survey.
 * @param {string} surveyId - Survey id
 * @param {Object} response - Response payload
 * @returns {boolean} True if successful
 */
function addResponse(surveyId, response) {
  const surveys = loadSurveys();
  const index = surveys.findIndex((survey) => survey.id === surveyId);

  if (index === -1 || !surveys[index].active) {
    return false;
  }

  const newResponse = {
    id: store.createId(),
    name: response.name || null,
    responses: response.responses || response.antworten || [],
    submittedAt: new Date().toISOString()
  };

  surveys[index].responses.push(newResponse);
  store.writeDataFile(FILE_NAME, surveys);
  return true;
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
  getAll,
  create,
  update,
  addResponse,
  remove
};
