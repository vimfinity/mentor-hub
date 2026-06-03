'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const surveys = require('../src/data/surveys');

const SURVEYS_PATH = path.join(__dirname, '..', 'data', 'surveys.json');

// These tests mutate the real surveys.json (the store has no injectable path),
// so we snapshot and restore it around each run. The store also writes a
// backup copy under data/backups, which we clean up afterwards.
function withSurveysSnapshot(run) {
  const original = fs.existsSync(SURVEYS_PATH) ? fs.readFileSync(SURVEYS_PATH) : null;
  try {
    run();
  } finally {
    if (original !== null) {
      fs.writeFileSync(SURVEYS_PATH, original);
    }
  }
}

test('survey answers stay aligned to questions after reordering', () => {
  withSurveysSnapshot(() => {
    const created = surveys.create({
      title: { 'de-DE': 'Test', 'en-US': 'Test' },
      description: { 'de-DE': '', 'en-US': '' },
      questions: [
        { text: { 'de-DE': 'Q1', 'en-US': 'Q1' }, type: 'free_text' },
        { text: { 'de-DE': 'Q2', 'en-US': 'Q2' }, type: 'rating' },
        { text: { 'de-DE': 'Q3', 'en-US': 'Q3' }, type: 'yes_no' }
      ]
    });

    const ids = created.questions.map((q) => q.id);
    assert.equal(ids.length, 3);
    assert.ok(ids.every(Boolean), 'every question gets a stable id');

    surveys.addResponse(created.id, {
      name: 'Alice',
      answers: { [ids[0]]: 'hello', [ids[1]]: 4, [ids[2]]: 'yes' }
    });

    // Move Q3 to the front.
    surveys.update(created.id, {
      questions: [
        { id: ids[2], text: { 'de-DE': 'Q3', 'en-US': 'Q3' }, type: 'yes_no' },
        { id: ids[0], text: { 'de-DE': 'Q1', 'en-US': 'Q1' }, type: 'free_text' },
        { id: ids[1], text: { 'de-DE': 'Q2', 'en-US': 'Q2' }, type: 'rating' }
      ]
    });

    const after = surveys.getAll('en-US').find((s) => s.id === created.id);
    const response = after.responses[0];

    // Positional array realigned to the new question order.
    assert.deepEqual(response.responses, ['yes', 'hello', 4]);
    // Id-keyed answers remain stable regardless of order.
    assert.equal(response.answers[ids[0]], 'hello');
    assert.equal(response.answers[ids[2]], 'yes');

    surveys.remove(created.id);
  });
});

test('legacy positional responses normalize onto question ids', () => {
  withSurveysSnapshot(() => {
    // Write a legacy-shaped survey directly (positional responses, no question ids).
    const legacy = [{
      id: 'legacy-survey',
      title: { 'de-DE': 'L', 'en-US': 'L' },
      description: { 'de-DE': '', 'en-US': '' },
      active: true,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      questions: [
        { text: { 'de-DE': 'A', 'en-US': 'A' }, type: 'free_text' },
        { text: { 'de-DE': 'B', 'en-US': 'B' }, type: 'rating' }
      ],
      responses: [{ id: 'r1', name: null, responses: ['answer', 5], submittedAt: new Date().toISOString() }]
    }];
    fs.writeFileSync(SURVEYS_PATH, JSON.stringify(legacy, null, 2));

    const survey = surveys.getAll('en-US').find((s) => s.id === 'legacy-survey');
    const response = survey.responses[0];

    assert.deepEqual(response.responses, ['answer', 5]);
    assert.equal(response.answers[survey.questions[0].id], 'answer');
    assert.equal(response.answers[survey.questions[1].id], 5);
  });
});
