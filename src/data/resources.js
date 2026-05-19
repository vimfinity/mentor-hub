'use strict';

const speicher = require('./store');

const DATEI = 'resources.json';

/**
 * Gibt alle Ressourcen zurueck (sortiert nach Erstellungsdatum, neueste zuerst).
 * @returns {Array} Liste aller Ressourcen
 */
function holeAlle() {
  const alle = speicher.lesen(DATEI);
  return alle.sort((a, b) =>
    new Date(b.erstelltAm) - new Date(a.erstelltAm)
  );
}

/**
 * Gibt Ressourcen einer bestimmten Kategorie zurueck.
 * @param {string} kategorie - Kategorie-Filter (tool, artikel, video, tutorial)
 * @returns {Array} Gefilterte Ressourcen
 */
function holeNachKategorie(kategorie) {
  const alle = holeAlle();
  return alle.filter(r => r.kategorie === kategorie);
}

/**
 * Erstellt eine neue Ressource.
 * @param {Object} daten - Ressourcen-Daten
 * @param {string} daten.titel - Titel
 * @param {string} daten.url - Link zur Ressource
 * @param {string} daten.beschreibung - Kurzbeschreibung
 * @param {string} daten.kategorie - Kategorie (tool, artikel, video, tutorial)
 * @returns {Object} Erstellte Ressource
 */
function erstelle(daten) {
  const ressource = {
    titel: daten.titel,
    url: daten.url,
    beschreibung: daten.beschreibung || '',
    kategorie: daten.kategorie || 'artikel'
  };
  return speicher.hinzufuegen(DATEI, ressource);
}

/**
 * Aktualisiert eine Ressource.
 * @param {string} id - Ressource-ID
 * @param {Object} aenderungen - Zu uebernehmende Felder
 * @returns {Object|null} Aktualisierte Ressource oder null
 */
function aktualisiere(id, aenderungen) {
  const erlaubteFelder = ['titel', 'url', 'beschreibung', 'kategorie'];
  const gefiltert = {};
  for (const feld of erlaubteFelder) {
    if (aenderungen[feld] !== undefined) {
      gefiltert[feld] = aenderungen[feld];
    }
  }
  return speicher.aktualisieren(DATEI, id, gefiltert);
}

/**
 * Loescht eine Ressource.
 * @param {string} id - Ressource-ID
 * @returns {boolean} true wenn geloescht
 */
function loesche(id) {
  return speicher.loeschen(DATEI, id);
}

module.exports = {
  holeAlle,
  holeNachKategorie,
  erstelle,
  aktualisiere,
  loesche
};
