'use strict';

const speicher = require('./store');

const DATEI = 'news.json';

/**
 * Gibt alle Neuigkeiten zurueck (neueste zuerst).
 * @returns {Array} Liste aller News-Eintraege
 */
function holeAlle() {
  const alle = speicher.lesen(DATEI);
  return alle.sort((a, b) =>
    new Date(b.erstelltAm) - new Date(a.erstelltAm)
  );
}

/**
 * Erstellt eine neue Neuigkeit.
 * @param {Object} daten - News-Daten
 * @param {string} daten.titel - Titel der Neuigkeit
 * @param {string} daten.inhalt - Textinhalt
 * @returns {Object} Erstellte Neuigkeit
 */
function erstelle(daten) {
  const nachricht = {
    titel: daten.titel,
    inhalt: daten.inhalt || ''
  };
  return speicher.hinzufuegen(DATEI, nachricht);
}

/**
 * Aktualisiert eine Neuigkeit.
 * @param {string} id - News-ID
 * @param {Object} aenderungen - Zu uebernehmende Felder
 * @returns {Object|null} Aktualisierte Neuigkeit oder null
 */
function aktualisiere(id, aenderungen) {
  const erlaubteFelder = ['titel', 'inhalt'];
  const gefiltert = {};
  for (const feld of erlaubteFelder) {
    if (aenderungen[feld] !== undefined) {
      gefiltert[feld] = aenderungen[feld];
    }
  }
  return speicher.aktualisieren(DATEI, id, gefiltert);
}

/**
 * Loescht eine Neuigkeit.
 * @param {string} id - News-ID
 * @returns {boolean} true wenn geloescht
 */
function loesche(id) {
  return speicher.loeschen(DATEI, id);
}

module.exports = {
  holeAlle,
  erstelle,
  aktualisiere,
  loesche
};
