'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createRouter } = require('./router');
const { loadConfig } = require('./config');
const rateLimiter = require('./rate-limit');
const publicApi = require('./api/public');
const adminApi = require('./api/admin');

const config = loadConfig();
const publicDirectory = path.join(__dirname, '..', 'public');
const localesDirectory = path.join(__dirname, '..', 'locales');
const devReloadClients = new Set();
const devReloadWatchers = [];
let devReloadVersion = Date.now();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.zip': 'application/zip',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const router = createRouter();
publicApi.registerRoutes(router);
adminApi.registerRoutes(router);

if (config.devReloadEnabled) {
  initializeDevReload();
}

/**
 * Sets security headers on every response.
 * @param {Object} res - HTTP response
 */
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https: data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-src 'self' data:; child-src 'self' data:"
  );
}

function applyRateLimitHeaders(res, headers) {
  Object.keys(headers || {}).forEach((headerName) => {
    res.setHeader(headerName, headers[headerName]);
  });
}

/**
 * Validates the Origin header for state-changing requests.
 * @param {Object} req - HTTP request
 * @returns {boolean} True if the origin is allowed
 */
function isOriginAllowed(req) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  const origin = req.headers.origin;
  const host = req.headers.host;

  if (!origin) {
    return true;
  }

  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch (error) {
    return false;
  }
}

/**
 * Serves static files from the public directory.
 * @param {Object} req - HTTP request
 * @param {Object} res - HTTP response
 * @returns {boolean} True if a file was served
 */
function serveStaticFile(req, res) {
  let requestedPath = req.url.split('?')[0];

  if (requestedPath === '/' || requestedPath === '') {
    requestedPath = '/index.html';
  }

  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const absolutePath = path.join(publicDirectory, safePath);

  if (!absolutePath.startsWith(publicDirectory)) {
    res.writeHead(403);
    res.end('Access denied');
    return true;
  }

  try {
    const fileStats = fs.statSync(absolutePath);
    if (!fileStats.isFile()) {
      return false;
    }

    const extension = path.extname(absolutePath).toLowerCase();
    const mimeType = MIME_TYPES[extension] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': mimeType });
    const stream = fs.createReadStream(absolutePath);
    stream.pipe(res);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Extracts the client IP address from the request.
 * @param {Object} req - HTTP request
 * @returns {string} Client IP address
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  return req.socket.remoteAddress || '0.0.0.0';
}

function isDevReloadRequest(req) {
  return config.devReloadEnabled && req.url.split('?')[0] === '/api/dev/events';
}

function handleDevReloadRequest(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  res.write('event: ready\n');
  res.write('data: ' + JSON.stringify({ version: devReloadVersion }) + '\n\n');

  devReloadClients.add(res);

  req.on('close', () => {
    devReloadClients.delete(res);
  });
}

function broadcastDevReload(changedPath) {
  devReloadVersion = Date.now();
  const payload = JSON.stringify({ version: devReloadVersion, changedPath });

  for (const client of devReloadClients) {
    client.write('event: reload\n');
    client.write('data: ' + payload + '\n\n');
  }
}

function initializeDevReload() {
  const watchedDirectories = [
    publicDirectory,
    localesDirectory
  ];

  watchedDirectories.forEach((directory) => {
    try {
      const watcher = fs.watch(directory, { recursive: true }, (eventType, fileName) => {
        if (!fileName) {
          return;
        }

        if (String(fileName).indexOf('.git') >= 0) {
          return;
        }

        broadcastDevReload(String(fileName));
      });

      devReloadWatchers.push(watcher);
    } catch (error) {
      console.warn('Dev reload watcher failed for', directory, error.message);
    }
  });
}

const server = http.createServer((req, res) => {
  setSecurityHeaders(res);

  const requestPath = req.url.split('?')[0];

  if (requestPath === '/admin.html') {
    res.writeHead(301, { Location: '/admin' });
    res.end();
    return;
  }

  if (isDevReloadRequest(req)) {
    handleDevReloadRequest(req, res);
    return;
  }

  const clientIp = getClientIp(req);
  const rateLimitStatus = rateLimiter.checkRequest(req, clientIp);
  applyRateLimitHeaders(res, rateLimitStatus.headers);

  if (!rateLimitStatus.allowed) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: 'Too many requests. Please try again later.',
      fehler: 'Zu viele Anfragen. Bitte spaeter erneut versuchen.',
      retryAfterSeconds: rateLimitStatus.retryAfterSeconds
    }));
    return;
  }

  if (!isOriginAllowed(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Origin not allowed' }));
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url.startsWith('/api/')) {
    const routeFound = router.handle(req, res);
    if (!routeFound) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    }
    return;
  }

  if (!serveStaticFile(req, res)) {
    const indexPath = path.join(publicDirectory, 'index.html');
    try {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const stream = fs.createReadStream(indexPath);
      stream.pipe(res);
    } catch (error) {
      res.writeHead(404);
      res.end('Page not found');
    }
  }
});

server.listen(config.port, config.host, () => {
  console.log('');
  console.log('===========================================');
  console.log('  KI-Hub');
  console.log('===========================================');
  console.log(`  Server running on: http://localhost:${config.port}`);
  console.log(`  Network:           http://${getLocalIp()}:${config.port}`);
  console.log(`  Language:          ${config.defaultLanguage}`);
  console.log('-------------------------------------------');

  if (!config.adminPasswordHash || config.adminPasswordHash.length === 0) {
    console.log('');
    console.log('  WARNING: Admin password has not been set yet.');
    console.log('  Please call POST /api/admin/setup.');
    console.log('');
  }

  console.log('  Stop with Ctrl+C');
  console.log('===========================================');
  console.log('');
});

/**
 * Resolves the local network IP address.
 * @returns {string} Local IP address or localhost
 */
function getLocalIp() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }

  return 'localhost';
}

process.on('SIGINT', () => {
  console.log('\nStopping server...');
  devReloadWatchers.forEach((watcher) => watcher.close());
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  devReloadWatchers.forEach((watcher) => watcher.close());
  server.close(() => {
    process.exit(0);
  });
});
