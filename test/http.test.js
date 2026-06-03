'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER_PATH = path.join(__dirname, '..', 'src', 'server.js');

let serverProcess = null;
let baseUrl = '';

function request(method, urlPath, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + urlPath);
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const req = http.request(url, {
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function json(response) {
  return JSON.parse(response.body);
}

test.before(async () => {
  serverProcess = spawn(process.execPath, [SERVER_PATH], { stdio: ['ignore', 'pipe', 'pipe'] });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server did not start in time')), 10000);
    serverProcess.stdout.on('data', (chunk) => {
      const match = String(chunk).match(/http:\/\/localhost:(\d+)/);
      if (match) {
        baseUrl = `http://127.0.0.1:${match[1]}`;
        clearTimeout(timeout);
        resolve();
      }
    });
    serverProcess.on('error', reject);
  });
});

test.after(() => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

test('GET /api/feed returns a plain array by default', async () => {
  const response = await request('GET', '/api/feed');
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(json(response)));
});

test('GET /api/feed paginates when params are present', async () => {
  const response = await request('GET', '/api/feed?limit=2');
  assert.equal(response.status, 200);
  const data = json(response);
  assert.ok(Array.isArray(data.items));
  assert.ok(data.items.length <= 2);
  assert.equal(typeof data.total, 'number');
});

test('GET /api/feed?q= filters results', async () => {
  const response = await request('GET', '/api/feed?q=zzzznomatchzzzz');
  assert.equal(response.status, 200);
  assert.equal(json(response).total, 0);
});

test('GET /api/feed.xml returns RSS', async () => {
  const response = await request('GET', '/api/feed.xml');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /rss\+xml/);
  assert.match(response.body, /<rss/);
});

test('GET /api/feed.json returns JSON Feed', async () => {
  const response = await request('GET', '/api/feed.json');
  assert.equal(response.status, 200);
  const data = json(response);
  assert.match(data.version, /jsonfeed\.org/);
  assert.ok(Array.isArray(data.items));
});

test('GET /api/news, /api/surveys, /api/resources respond 200', async () => {
  for (const endpoint of ['/api/news', '/api/surveys', '/api/resources']) {
    const response = await request('GET', endpoint);
    assert.equal(response.status, 200, `${endpoint} should return 200`);
    assert.ok(Array.isArray(json(response)), `${endpoint} should return an array`);
  }
});

test('i18n endpoint validates locale codes', async () => {
  const ok = await request('GET', '/api/i18n/en');
  assert.equal(ok.status, 200);

  const bad = await request('GET', '/api/i18n/not-a-locale');
  assert.equal(bad.status, 400);
});

test('admin endpoints require authentication', async () => {
  const response = await request('GET', '/api/admin/surveys');
  assert.equal(response.status, 401);
});

test('unknown API route returns 404', async () => {
  const response = await request('GET', '/api/does-not-exist');
  assert.equal(response.status, 404);
});

test('security headers are present', async () => {
  const response = await request('GET', '/api/feed');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.ok(response.headers['content-security-policy']);
  assert.match(response.headers['content-security-policy'], /object-src 'none'/);
});
