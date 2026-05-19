'use strict';

const path = require('path');
const fs = require('fs');
const umfragen = require('../data/surveys');
const ressourcen = require('../data/resources');
const painpoints = require('../data/painpoints');
const neuigkeiten = require('../data/news');

const localesVerzeichnis = path.join(__dirname, '..', '..', 'locales');

/**
 * Registriert oeffentliche API-Routen.
 * @param {Object} router - Router-Instanz
 */
function registriere(router) {

  // --- i18n ---
  router.get('/api/i18n/:locale', (req, res, params) => {
    const locale = params.locale;
    // Nur erlaubte Locales (Sicherheit: kein Path-Traversal)
    if (!/^[a-z]{2}$/.test(locale)) {
      sendeJson(res, 400, { fehler: 'Ungueltiger Sprach-Code' });
      return;
    }

    const pfad = path.join(localesVerzeichnis, locale + '.json');
    try {
      const inhalt = fs.readFileSync(pfad, 'utf-8');
      sendeJson(res, 200, JSON.parse(inhalt));
    } catch (fehler) {
      sendeJson(res, 404, { fehler: 'Sprache nicht verfuegbar' });
    }
  });

  // --- Umfragen (oeffentlich) ---
  router.get('/api/surveys', (req, res) => {
    const aktive = umfragen.holeAktive();
    sendeJson(res, 200, aktive);
  });

  router.post('/api/surveys/:id/responses', (req, res, params) => {
    leseBody(req, res, (body) => {
      if (!body || !body.antworten || !Array.isArray(body.antworten)) {
        sendeJson(res, 400, { fehler: 'Antworten-Array erforderlich' });
        return;
      }

      // Eingabe-Validierung
      if (body.name && body.name.length > 100) {
        sendeJson(res, 400, { fehler: 'Name zu lang (max 100 Zeichen)' });
        return;
      }

      const erfolg = umfragen.fuegeAntwortHinzu(params.id, {
        name: body.name || null,
        antworten: body.antworten
      });

      if (erfolg) {
        sendeJson(res, 201, { erfolg: true });
      } else {
        sendeJson(res, 404, { fehler: 'Umfrage nicht gefunden oder inaktiv' });
      }
    });
  });

  // --- Ressourcen (oeffentlich) ---
  router.get('/api/resources', (req, res) => {
    const alle = ressourcen.holeAlle();
    sendeJson(res, 200, alle);
  });

  // --- Painpoints (oeffentlich: Einreichen) ---
  router.post('/api/painpoints', (req, res) => {
    leseBody(req, res, (body) => {
      if (!body || !body.titel || body.titel.trim().length === 0) {
        sendeJson(res, 400, { fehler: 'Titel erforderlich' });
        return;
      }

      // Eingabe-Validierung
      if (body.titel.length > 200) {
        sendeJson(res, 400, { fehler: 'Titel zu lang (max 200 Zeichen)' });
        return;
      }
      if (body.beschreibung && body.beschreibung.length > 2000) {
        sendeJson(res, 400, { fehler: 'Beschreibung zu lang (max 2000 Zeichen)' });
        return;
      }
      if (body.name && body.name.length > 100) {
        sendeJson(res, 400, { fehler: 'Name zu lang (max 100 Zeichen)' });
        return;
      }

      const erstellt = painpoints.erstelle({
        titel: body.titel.trim(),
        beschreibung: (body.beschreibung || '').trim(),
        name: body.name || null
      });

      sendeJson(res, 201, erstellt);
    });
  });

  // --- Neuigkeiten (oeffentlich: Lesen) ---
  router.get('/api/news', (req, res) => {
    const alle = neuigkeiten.holeAlle();
    sendeJson(res, 200, alle);
  });
}

// --- Hilfsfunktionen ---

/**
 * Sendet eine JSON-Antwort.
 * @param {Object} res - HTTP Response
 * @param {number} statusCode - HTTP Status-Code
 * @param {Object} daten - Zu sendende Daten
 */
function sendeJson(res, statusCode, daten) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(daten));
}

/**
 * Liest den Request-Body als JSON.
 * @param {Object} req - HTTP Request
 * @param {Object} res - HTTP Response (fuer Fehler-Antwort)
 * @param {Function} callback - Wird mit geparsten Daten aufgerufen
 */
function leseBody(req, res, callback) {
  let body = '';
  const maxGroesse = 1024 * 100; // 100 KB Maximum

  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > maxGroesse) {
      req.destroy();
      sendeJson(res, 413, { fehler: 'Anfrage zu gross' });
    }
  });

  req.on('end', () => {
    try {
      const geparst = JSON.parse(body);
      callback(geparst);
    } catch (fehler) {
      sendeJson(res, 400, { fehler: 'Ungueltiges JSON' });
    }
  });
}

module.exports = { registriere, sendeJson, leseBody };
