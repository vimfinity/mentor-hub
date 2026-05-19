'use strict';

const speicher = require('./store');

const DATEI = 'surveys.json';

/**
 * Gibt alle aktiven Umfragen zurueck (ohne Antworten).
 * @returns {Array} Liste aktiver Umfragen
 */
function holeAktive() {
  const alle = speicher.lesen(DATEI);
  return alle
    .filter(umfrage => umfrage.aktiv)
    .map(umfrage => ({
      id: umfrage.id,
      titel: umfrage.titel,
      beschreibung: umfrage.beschreibung,
      fragen: umfrage.fragen,
      erstelltAm: umfrage.erstelltAm
    }));
}

/**
 * Gibt alle Umfragen zurueck (mit Antworten, fuer Admin).
 * @returns {Array} Alle Umfragen mit Antworten
 */
function holeAlle() {
  return speicher.lesen(DATEI);
}

/**
 * Erstellt eine neue Umfrage.
 * @param {Object} daten - Umfrage-Daten
 * @param {string} daten.titel - Titel der Umfrage
 * @param {string} daten.beschreibung - Beschreibung
 * @param {Array} daten.fragen - Array von Frage-Objekten
 * @returns {Object} Erstellte Umfrage
 */
function erstelle(daten) {
  const umfrage = {
    titel: daten.titel,
    beschreibung: daten.beschreibung || '',
    fragen: daten.fragen || [],
    aktiv: true,
    antworten: []
  };
  return speicher.hinzufuegen(DATEI, umfrage);
}

/**
 * Aktualisiert eine Umfrage.
 * @param {string} id - Umfrage-ID
 * @param {Object} aenderungen - Zu uebernehmende Felder
 * @returns {Object|null} Aktualisierte Umfrage oder null
 */
function aktualisiere(id, aenderungen) {
  // Antworten duerfen nicht ueberschrieben werden
  const erlaubteFelder = ['titel', 'beschreibung', 'fragen', 'aktiv'];
  const gefiltert = {};
  for (const feld of erlaubteFelder) {
    if (aenderungen[feld] !== undefined) {
      gefiltert[feld] = aenderungen[feld];
    }
  }
  return speicher.aktualisieren(DATEI, id, gefiltert);
}

/**
 * Fuegt eine Antwort zu einer Umfrage hinzu.
 * @param {string} umfrageId - ID der Umfrage
 * @param {Object} antwort - Antwort-Daten
 * @param {string} [antwort.name] - Optionaler Name des Antwortenden
 * @param {Array} antwort.antworten - Array von Antwort-Werten
 * @returns {boolean} true wenn erfolgreich
 */
function fuegeAntwortHinzu(umfrageId, antwort) {
  const alle = speicher.lesen(DATEI);
  const index = alle.findIndex(u => u.id === umfrageId);

  if (index === -1 || !alle[index].aktiv) {
    return false;
  }

  const neueAntwort = {
    id: speicher.erzeugeId(),
    name: antwort.name || null,
    antworten: antwort.antworten,
    eingereichtAm: new Date().toISOString()
  };

  alle[index].antworten.push(neueAntwort);
  speicher.schreiben(DATEI, alle);
  return true;
}

/**
 * Loescht eine Umfrage.
 * @param {string} id - Umfrage-ID
 * @returns {boolean} true wenn geloescht
 */
function loesche(id) {
  return speicher.loeschen(DATEI, id);
}

module.exports = {
  holeAktive,
  holeAlle,
  erstelle,
  aktualisiere,
  fuegeAntwortHinzu,
  loesche
};
