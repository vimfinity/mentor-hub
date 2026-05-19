'use strict';

const url = require('url');

/**
 * Analysiert eine URL und extrahiert Pfad-Parameter.
 * Unterstuetzt Muster wie "/api/surveys/:id/responses"
 *
 * @param {string} muster - Route-Muster (z.B. "/api/surveys/:id")
 * @param {string} pfad - Tatsaechlicher Request-Pfad
 * @returns {Object|null} Extrahierte Parameter oder null bei keinem Match
 */
function matchRoute(muster, pfad) {
  const musterTeile = muster.split('/').filter(Boolean);
  const pfadTeile = pfad.split('/').filter(Boolean);

  if (musterTeile.length !== pfadTeile.length) {
    return null;
  }

  const parameter = {};

  for (let i = 0; i < musterTeile.length; i++) {
    if (musterTeile[i].startsWith(':')) {
      const paramName = musterTeile[i].slice(1);
      parameter[paramName] = decodeURIComponent(pfadTeile[i]);
    } else if (musterTeile[i] !== pfadTeile[i]) {
      return null;
    }
  }

  return parameter;
}

/**
 * Erstellt einen Router mit registrierbaren Routen.
 * @returns {Object} Router-Instanz
 */
function erstelleRouter() {
  const routen = [];

  /**
   * Registriert eine neue Route.
   * @param {string} methode - HTTP-Methode (GET, POST, PUT, DELETE)
   * @param {string} muster - URL-Muster
   * @param {Function} handler - Request-Handler (req, res, params)
   */
  function registriere(methode, muster, handler) {
    routen.push({
      methode: methode.toUpperCase(),
      muster,
      handler
    });
  }

  /**
   * Verarbeitet einen eingehenden Request.
   * @param {Object} req - HTTP Request
   * @param {Object} res - HTTP Response
   * @returns {boolean} true wenn eine Route gefunden wurde
   */
  function verarbeite(req, res) {
    const geparst = url.parse(req.url, true);
    const pfad = geparst.pathname;
    const methode = req.method.toUpperCase();

    for (const route of routen) {
      if (route.methode !== methode) {
        continue;
      }

      const parameter = matchRoute(route.muster, pfad);
      if (parameter !== null) {
        req.parameter = parameter;
        req.query = geparst.query;
        route.handler(req, res, parameter);
        return true;
      }
    }

    return false;
  }

  return {
    get: (muster, handler) => registriere('GET', muster, handler),
    post: (muster, handler) => registriere('POST', muster, handler),
    put: (muster, handler) => registriere('PUT', muster, handler),
    delete: (muster, handler) => registriere('DELETE', muster, handler),
    verarbeite
  };
}

module.exports = { erstelleRouter, matchRoute };
