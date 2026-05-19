'use strict';

const speicher = require('./store');

const DATEI = 'painpoints.json';

// Gueltige Status-Werte
const GUELTIGE_STATUS = ['offen', 'in_bearbeitung', 'erledigt'];

/**
 * Gibt alle Painpoints zurueck (neueste zuerst).
 * @returns {Array} Liste aller Painpoints
 */
function holeAlle() {
  const alle = speicher.lesen(DATEI);
  return alle.sort((a, b) =>
    new Date(b.erstelltAm) - new Date(a.erstelltAm)
  );
}

/**
 * Gibt nur offene Painpoints zurueck (fuer oeffentliche Ansicht).
 * @returns {Array} Offene und in Bearbeitung befindliche Painpoints
 */
function holeOffene() {
  const alle = holeAlle();
  return alle.filter(p => p.status !== 'erledigt');
}

/**
 * Erstellt einen neuen Painpoint.
 * @param {Object} daten - Painpoint-Daten
 * @param {string} daten.titel - Kurzbeschreibung des Problems
 * @param {string} daten.beschreibung - Ausfuehrliche Beschreibung
 * @param {string} [daten.name] - Optionaler Name des Einreichenden
 * @returns {Object} Erstellter Painpoint
 */
function erstelle(daten) {
  const painpoint = {
    titel: daten.titel,
    beschreibung: daten.beschreibung || '',
    name: daten.name || null,
    status: 'offen'
  };
  return speicher.hinzufuegen(DATEI, painpoint);
}

/**
 * Aktualisiert den Status eines Painpoints.
 * @param {string} id - Painpoint-ID
 * @param {Object} aenderungen - Aenderungen (v.a. status)
 * @returns {Object|null} Aktualisierter Painpoint oder null
 */
function aktualisiere(id, aenderungen) {
  const gefiltert = {};

  if (aenderungen.status && GUELTIGE_STATUS.includes(aenderungen.status)) {
    gefiltert.status = aenderungen.status;
  }
  if (aenderungen.adminKommentar !== undefined) {
    gefiltert.adminKommentar = aenderungen.adminKommentar;
  }

  if (Object.keys(gefiltert).length === 0) {
    return null;
  }

  return speicher.aktualisieren(DATEI, id, gefiltert);
}

/**
 * Loescht einen Painpoint.
 * @param {string} id - Painpoint-ID
 * @returns {boolean} true wenn geloescht
 */
function loesche(id) {
  return speicher.loeschen(DATEI, id);
}

module.exports = {
  holeAlle,
  holeOffene,
  erstelle,
  aktualisiere,
  loesche,
  GUELTIGE_STATUS
};
