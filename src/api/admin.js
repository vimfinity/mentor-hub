'use strict';

const path = require('path');
const fs = require('fs');
const auth = require('../auth');
const umfragen = require('../data/surveys');
const ressourcen = require('../data/resources');
const painpoints = require('../data/painpoints');
const neuigkeiten = require('../data/news');
const { sendeJson, leseBody } = require('./public');

const configPfad = path.join(__dirname, '..', '..', 'config.json');

/**
 * Liest die aktuelle Konfiguration.
 * @returns {Object} Konfiguration
 */
function ladeConfig() {
  const inhalt = fs.readFileSync(configPfad, 'utf-8');
  return JSON.parse(inhalt);
}

/**
 * Speichert die Konfiguration.
 * @param {Object} config - Konfigurationsobjekt
 */
function speichereConfig(config) {
  fs.writeFileSync(configPfad, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Prueft den Authorization-Header und gibt true zurueck wenn gueltig.
 * @param {Object} req - HTTP Request
 * @param {Object} res - HTTP Response
 * @returns {boolean} true wenn autorisiert
 */
function pruefeAuth(req, res) {
  const config = ladeConfig();
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');

  if (!auth.pruefeSitzung(token, config.sitzungsDauerMs)) {
    sendeJson(res, 401, { fehler: 'Nicht autorisiert' });
    return false;
  }
  return true;
}

/**
 * Registriert Admin-API-Routen.
 * @param {Object} router - Router-Instanz
 */
function registriere(router) {

  // --- Ersteinrichtung Status (GET) ---
  router.get('/api/admin/setup', (req, res) => {
    const config = ladeConfig();
    sendeJson(res, 200, {
      eingerichtet: !!(config.adminPasswortHash && config.adminPasswortHash.length > 0)
    });
  });

  // --- Ersteinrichtung (nur wenn kein Passwort gesetzt) ---
  router.post('/api/admin/setup', (req, res) => {
    const config = ladeConfig();

    if (config.adminPasswortHash && config.adminPasswortHash.length > 0) {
      sendeJson(res, 403, { fehler: 'Einrichtung bereits abgeschlossen' });
      return;
    }

    leseBody(req, res, (body) => {
      if (!body || !body.passwort || body.passwort.length < 8) {
        sendeJson(res, 400, { fehler: 'Passwort erforderlich (min. 8 Zeichen)' });
        return;
      }

      const salt = auth.erzeugeSalt();
      const hash = auth.hashPasswort(body.passwort, salt);

      config.adminPasswortHash = hash;
      config.adminPasswortSalt = salt;
      speichereConfig(config);

      sendeJson(res, 200, { erfolg: true, nachricht: 'Admin-Passwort gesetzt' });
    });
  });

  // --- Login ---
  router.post('/api/admin/login', (req, res) => {
    const config = ladeConfig();

    if (!config.adminPasswortHash || config.adminPasswortHash.length === 0) {
      sendeJson(res, 503, { fehler: 'Ersteinrichtung erforderlich (POST /api/admin/setup)' });
      return;
    }

    leseBody(req, res, (body) => {
      if (!body || !body.passwort) {
        sendeJson(res, 400, { fehler: 'Passwort erforderlich' });
        return;
      }

      const gueltig = auth.pruefePasswort(
        body.passwort,
        config.adminPasswortHash,
        config.adminPasswortSalt
      );

      if (!gueltig) {
        sendeJson(res, 401, { fehler: 'Falsches Passwort' });
        return;
      }

      const token = auth.erstelleSitzung();
      sendeJson(res, 200, { token });
    });
  });

  // --- Logout ---
  router.post('/api/admin/logout', (req, res) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '');
    auth.beendeSitzung(token);
    sendeJson(res, 200, { erfolg: true });
  });

  // --- Passwort aendern ---
  router.post('/api/admin/password', (req, res) => {
    if (!pruefeAuth(req, res)) return;

    leseBody(req, res, (body) => {
      if (!body || !body.neuesPasswort || body.neuesPasswort.length < 8) {
        sendeJson(res, 400, { fehler: 'Neues Passwort erforderlich (min. 8 Zeichen)' });
        return;
      }

      const config = ladeConfig();
      const salt = auth.erzeugeSalt();
      const hash = auth.hashPasswort(body.neuesPasswort, salt);

      config.adminPasswortHash = hash;
      config.adminPasswortSalt = salt;
      speichereConfig(config);

      sendeJson(res, 200, { erfolg: true });
    });
  });

  // --- Umfragen (Admin) ---
  router.get('/api/admin/surveys', (req, res) => {
    if (!pruefeAuth(req, res)) return;
    sendeJson(res, 200, umfragen.holeAlle());
  });

  router.post('/api/admin/surveys', (req, res) => {
    if (!pruefeAuth(req, res)) return;

    leseBody(req, res, (body) => {
      if (!body || !body.titel || body.titel.trim().length === 0) {
        sendeJson(res, 400, { fehler: 'Titel erforderlich' });
        return;
      }
      if (body.titel.length > 200) {
        sendeJson(res, 400, { fehler: 'Titel zu lang (max 200 Zeichen)' });
        return;
      }
      if (!body.fragen || !Array.isArray(body.fragen) || body.fragen.length === 0) {
        sendeJson(res, 400, { fehler: 'Mindestens eine Frage erforderlich' });
        return;
      }

      const erstellt = umfragen.erstelle({
        titel: body.titel.trim(),
        beschreibung: (body.beschreibung || '').trim(),
        fragen: body.fragen
      });

      sendeJson(res, 201, erstellt);
    });
  });

  router.put('/api/admin/surveys/:id', (req, res, params) => {
    if (!pruefeAuth(req, res)) return;

    leseBody(req, res, (body) => {
      const aktualisiert = umfragen.aktualisiere(params.id, body);
      if (aktualisiert) {
        sendeJson(res, 200, aktualisiert);
      } else {
        sendeJson(res, 404, { fehler: 'Umfrage nicht gefunden' });
      }
    });
  });

  router.delete('/api/admin/surveys/:id', (req, res, params) => {
    if (!pruefeAuth(req, res)) return;

    if (umfragen.loesche(params.id)) {
      sendeJson(res, 200, { erfolg: true });
    } else {
      sendeJson(res, 404, { fehler: 'Umfrage nicht gefunden' });
    }
  });

  // --- Ressourcen (Admin) ---
  router.post('/api/admin/resources', (req, res) => {
    if (!pruefeAuth(req, res)) return;

    leseBody(req, res, (body) => {
      if (!body || !body.titel || body.titel.trim().length === 0) {
        sendeJson(res, 400, { fehler: 'Titel erforderlich' });
        return;
      }
      if (!body.url || body.url.trim().length === 0) {
        sendeJson(res, 400, { fehler: 'URL erforderlich' });
        return;
      }
      if (body.titel.length > 200) {
        sendeJson(res, 400, { fehler: 'Titel zu lang (max 200 Zeichen)' });
        return;
      }
      if (body.url.length > 2000) {
        sendeJson(res, 400, { fehler: 'URL zu lang (max 2000 Zeichen)' });
        return;
      }

      const gueltigeKategorien = ['tool', 'artikel', 'video', 'tutorial'];
      if (body.kategorie && !gueltigeKategorien.includes(body.kategorie)) {
        sendeJson(res, 400, { fehler: 'Ungueltige Kategorie' });
        return;
      }

      const erstellt = ressourcen.erstelle({
        titel: body.titel.trim(),
        url: body.url.trim(),
        beschreibung: (body.beschreibung || '').trim(),
        kategorie: body.kategorie || 'artikel'
      });

      sendeJson(res, 201, erstellt);
    });
  });

  router.put('/api/admin/resources/:id', (req, res, params) => {
    if (!pruefeAuth(req, res)) return;

    leseBody(req, res, (body) => {
      const aktualisiert = ressourcen.aktualisiere(params.id, body);
      if (aktualisiert) {
        sendeJson(res, 200, aktualisiert);
      } else {
        sendeJson(res, 404, { fehler: 'Ressource nicht gefunden' });
      }
    });
  });

  router.delete('/api/admin/resources/:id', (req, res, params) => {
    if (!pruefeAuth(req, res)) return;

    if (ressourcen.loesche(params.id)) {
      sendeJson(res, 200, { erfolg: true });
    } else {
      sendeJson(res, 404, { fehler: 'Ressource nicht gefunden' });
    }
  });

  // --- Painpoints (Admin) ---
  router.get('/api/admin/painpoints', (req, res) => {
    if (!pruefeAuth(req, res)) return;
    sendeJson(res, 200, painpoints.holeAlle());
  });

  router.put('/api/admin/painpoints/:id', (req, res, params) => {
    if (!pruefeAuth(req, res)) return;

    leseBody(req, res, (body) => {
      const aktualisiert = painpoints.aktualisiere(params.id, body);
      if (aktualisiert) {
        sendeJson(res, 200, aktualisiert);
      } else {
        sendeJson(res, 404, { fehler: 'Painpoint nicht gefunden' });
      }
    });
  });

  router.delete('/api/admin/painpoints/:id', (req, res, params) => {
    if (!pruefeAuth(req, res)) return;

    if (painpoints.loesche(params.id)) {
      sendeJson(res, 200, { erfolg: true });
    } else {
      sendeJson(res, 404, { fehler: 'Painpoint nicht gefunden' });
    }
  });

  // --- Neuigkeiten (Admin) ---
  router.post('/api/admin/news', (req, res) => {
    if (!pruefeAuth(req, res)) return;

    leseBody(req, res, (body) => {
      if (!body || !body.titel || body.titel.trim().length === 0) {
        sendeJson(res, 400, { fehler: 'Titel erforderlich' });
        return;
      }
      if (body.titel.length > 200) {
        sendeJson(res, 400, { fehler: 'Titel zu lang (max 200 Zeichen)' });
        return;
      }
      if (body.inhalt && body.inhalt.length > 5000) {
        sendeJson(res, 400, { fehler: 'Inhalt zu lang (max 5000 Zeichen)' });
        return;
      }

      const erstellt = neuigkeiten.erstelle({
        titel: body.titel.trim(),
        inhalt: (body.inhalt || '').trim()
      });

      sendeJson(res, 201, erstellt);
    });
  });

  router.put('/api/admin/news/:id', (req, res, params) => {
    if (!pruefeAuth(req, res)) return;

    leseBody(req, res, (body) => {
      const aktualisiert = neuigkeiten.aktualisiere(params.id, body);
      if (aktualisiert) {
        sendeJson(res, 200, aktualisiert);
      } else {
        sendeJson(res, 404, { fehler: 'Neuigkeit nicht gefunden' });
      }
    });
  });

  router.delete('/api/admin/news/:id', (req, res, params) => {
    if (!pruefeAuth(req, res)) return;

    if (neuigkeiten.loesche(params.id)) {
      sendeJson(res, 200, { erfolg: true });
    } else {
      sendeJson(res, 404, { fehler: 'Neuigkeit nicht gefunden' });
    }
  });

  // --- Status ---
  router.get('/api/admin/status', (req, res) => {
    const config = ladeConfig();
    sendeJson(res, 200, {
      eingerichtet: !!(config.adminPasswortHash && config.adminPasswortHash.length > 0)
    });
  });
}

module.exports = { registriere };
