'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { erstelleRouter } = require('./router');
const rateLimiter = require('./rate-limit');
const oeffentlicheApi = require('./api/public');
const adminApi = require('./api/admin');

// Konfiguration laden
const configPfad = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPfad, 'utf-8'));

// Verzeichnis fuer statische Dateien
const publicVerzeichnis = path.join(__dirname, '..', 'public');

// MIME-Typen fuer Static-Serving
const MIME_TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// Router erstellen und Routen registrieren
const router = erstelleRouter();
oeffentlicheApi.registriere(router);
adminApi.registriere(router);

/**
 * Sicherheits-Header fuer alle Antworten.
 * @param {Object} res - HTTP Response
 */
function setzeSicherheitsHeader(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'"
  );
}

/**
 * Prueft den Origin-Header bei zustandsveraendernden Requests (CSRF-Schutz).
 * @param {Object} req - HTTP Request
 * @returns {boolean} true wenn erlaubt
 */
function pruefeOrigin(req) {
  const methode = req.method.toUpperCase();
  if (methode === 'GET' || methode === 'HEAD' || methode === 'OPTIONS') {
    return true;
  }

  const origin = req.headers['origin'];
  const host = req.headers['host'];

  // Wenn kein Origin-Header (z.B. curl, Postman) - erlauben (internes Tool)
  if (!origin) {
    return true;
  }

  // Origin muss zum Host passen
  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch (fehler) {
    return false;
  }
}

/**
 * Liefert statische Dateien aus dem public-Verzeichnis.
 * @param {Object} req - HTTP Request
 * @param {Object} res - HTTP Response
 * @returns {boolean} true wenn Datei geliefert wurde
 */
function liefereStatischeDatei(req, res) {
  let angefragterPfad = req.url.split('?')[0];

  // Standardseite
  if (angefragterPfad === '/' || angefragterPfad === '') {
    angefragterPfad = '/index.html';
  }

  // Sicherheit: Path-Traversal verhindern
  const sichererPfad = path.normalize(angefragterPfad).replace(/^(\.\.[\/\\])+/, '');
  const vollstaendigerPfad = path.join(publicVerzeichnis, sichererPfad);

  // Sicherstellen, dass Pfad innerhalb von public/ liegt
  if (!vollstaendigerPfad.startsWith(publicVerzeichnis)) {
    res.writeHead(403);
    res.end('Zugriff verweigert');
    return true;
  }

  try {
    const stat = fs.statSync(vollstaendigerPfad);
    if (!stat.isFile()) {
      return false;
    }

    const erweiterung = path.extname(vollstaendigerPfad).toLowerCase();
    const mimeTyp = MIME_TYPEN[erweiterung] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': mimeTyp });
    const stream = fs.createReadStream(vollstaendigerPfad);
    stream.pipe(res);
    return true;
  } catch (fehler) {
    return false;
  }
}

/**
 * Extrahiert die Client-IP aus dem Request.
 * @param {Object} req - HTTP Request
 * @returns {string} IP-Adresse
 */
function holeClientIp(req) {
  return req.headers['x-forwarded-for'] ||
    req.socket.remoteAddress ||
    '0.0.0.0';
}

// HTTP-Server erstellen
const server = http.createServer((req, res) => {
  // Sicherheits-Header setzen
  setzeSicherheitsHeader(res);

  // Rate-Limiting pruefen
  const clientIp = holeClientIp(req);
  if (!rateLimiter.istErlaubt(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ fehler: 'Zu viele Anfragen. Bitte spaeter erneut versuchen.' }));
    return;
  }

  // CSRF-Schutz
  if (!pruefeOrigin(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ fehler: 'Origin nicht erlaubt' }));
    return;
  }

  // CORS fuer lokales Netzwerk
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Preflight-Requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API-Routen versuchen
  if (req.url.startsWith('/api/')) {
    const gefunden = router.verarbeite(req, res);
    if (!gefunden) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ fehler: 'Endpunkt nicht gefunden' }));
    }
    return;
  }

  // Statische Dateien versuchen
  if (!liefereStatischeDatei(req, res)) {
    // Fallback: index.html fuer Client-Side-Routing
    const indexPfad = path.join(publicVerzeichnis, 'index.html');
    try {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const stream = fs.createReadStream(indexPfad);
      stream.pipe(res);
    } catch (fehler) {
      res.writeHead(404);
      res.end('Seite nicht gefunden');
    }
  }
});

// Server starten
server.listen(config.port, config.host, () => {
  console.log('');
  console.log('===========================================');
  console.log('  KI-Mentor Hub');
  console.log('===========================================');
  console.log(`  Server laeuft auf: http://localhost:${config.port}`);
  console.log(`  Netzwerk:          http://${getLocalIp()}:${config.port}`);
  console.log(`  Sprache:           ${config.standardSprache}`);
  console.log('-------------------------------------------');

  // Pruefen ob Admin-Passwort gesetzt ist
  if (!config.adminPasswortHash || config.adminPasswortHash.length === 0) {
    console.log('');
    console.log('  ACHTUNG: Admin-Passwort noch nicht gesetzt!');
    console.log('  Bitte POST /api/admin/setup aufrufen.');
    console.log('');
  }

  console.log('  Beenden mit Strg+C');
  console.log('===========================================');
  console.log('');
});

/**
 * Ermittelt die lokale IP-Adresse.
 * @returns {string} Lokale IP oder "localhost"
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

// Graceful Shutdown
process.on('SIGINT', () => {
  console.log('\nServer wird beendet...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});
