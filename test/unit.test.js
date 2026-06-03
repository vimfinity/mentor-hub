'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { matchRoute } = require('../src/router');
const auth = require('../src/auth');
const localization = require('../src/data/localization');

test('matchRoute extracts named params', () => {
  assert.deepEqual(matchRoute('/api/feed/:id', '/api/feed/abc'), { id: 'abc' });
  assert.deepEqual(
    matchRoute('/api/resources/:id/attachments/:attachmentId', '/api/resources/r1/attachments/a1'),
    { id: 'r1', attachmentId: 'a1' }
  );
});

test('matchRoute rejects non-matching paths', () => {
  assert.equal(matchRoute('/api/feed/:id', '/api/feed'), null);
  assert.equal(matchRoute('/api/feed', '/api/news'), null);
});

test('password hashing round-trips and rejects wrong passwords', () => {
  const hash = auth.hashPassword('correct horse battery');
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(auth.verifyPassword('correct horse battery', hash, ''), true);
  assert.equal(auth.verifyPassword('wrong password', hash, ''), false);
});

test('needsRehash flags legacy hashes only', () => {
  const modern = auth.hashPassword('secret123');
  assert.equal(auth.needsRehash(modern), false);
  assert.equal(auth.needsRehash('deadbeef'), true);
  assert.equal(auth.needsRehash(''), true);
});

test('sessions validate, expire and end', () => {
  const token = auth.createSession();
  assert.equal(auth.verifySession(token, 60000), true);
  assert.equal(auth.verifySession(token, -1), false); // already expired -> purged
  assert.equal(auth.verifySession(token, 60000), false);

  const second = auth.createSession();
  auth.endSession(second);
  assert.equal(auth.verifySession(second, 60000), false);
});

test('locale normalization maps short and unknown codes', () => {
  assert.equal(localization.normalizeLocale('de'), 'de-DE');
  assert.equal(localization.normalizeLocale('en-US'), 'en-US');
  assert.equal(localization.normalizeLocale('fr'), 'de-DE'); // default
});

test('resolveLocalizedValue falls back across locales', () => {
  const value = { 'de-DE': '', 'en-US': 'Hello' };
  assert.equal(localization.resolveLocalizedValue(value, 'de-DE'), 'Hello');
  assert.equal(localization.resolveLocalizedValue('plain string', 'en-US'), 'plain string');
});
