'use strict';

const fs = require('fs');
const path = require('path');

// Basis-Pfad fuer Datendateien
const datenVerzeichnis = path.join(__dirname, '..', '..', 'data');

// Schreibsperre pro Datei (verhindert gleichzeitige Schreibvorgaenge)
const schreibSperren = new Map();

/**
 * Liest eine JSON-Datei und gibt den geparsten Inhalt zurueck.
 * @param {string} dateiName - Name der JSON-Datei (z.B. "surveys.json")
 * @returns {Array|Object} Geparster Inhalt
 */
function lesen(dateiName) {
  const pfad = path.join(datenVerzeichnis, dateiName);
  try {
    const inhalt = fs.readFileSync(pfad, 'utf-8');
    return JSON.parse(inhalt);
  } catch (fehler) {
    if (fehler.code === 'ENOENT') {
      return [];
    }
    throw fehler;
  }
}

/**
 * Schreibt Daten atomar in eine JSON-Datei.
 * Schreibt zuerst in .tmp, benennt dann um (crash-sicher).
 * @param {string} dateiName - Name der JSON-Datei
 * @param {Array|Object} daten - Zu schreibende Daten
 */
function schreiben(dateiName, daten) {
  const pfad = path.join(datenVerzeichnis, dateiName);
  const tmpPfad = pfad + '.tmp';

  // Einfache Schreibsperre (synchron, fuer Single-Threaded Node ausreichend)
  if (schreibSperren.get(dateiName)) {
    throw new Error(`Schreibvorgang fuer ${dateiName} bereits aktiv`);
  }

  schreibSperren.set(dateiName, true);
  try {
    const json = JSON.stringify(daten, null, 2);
    fs.writeFileSync(tmpPfad, json, 'utf-8');
    fs.renameSync(tmpPfad, pfad);
  } finally {
    schreibSperren.set(dateiName, false);
  }
}

/**
 * Sucht einen Eintrag anhand der ID.
 * @param {string} dateiName - Name der JSON-Datei
 * @param {string} id - Gesuchte ID
 * @returns {Object|null} Gefundener Eintrag oder null
 */
function sucheNachId(dateiName, id) {
  const daten = lesen(dateiName);
  return daten.find(eintrag => eintrag.id === id) || null;
}

/**
 * Fuegt einen neuen Eintrag hinzu.
 * @param {string} dateiName - Name der JSON-Datei
 * @param {Object} eintrag - Neuer Eintrag (bekommt automatisch ID + Zeitstempel)
 * @returns {Object} Der erstellte Eintrag mit ID
 */
function hinzufuegen(dateiName, eintrag) {
  const daten = lesen(dateiName);
  const neuerEintrag = {
    id: erzeugeId(),
    erstelltAm: new Date().toISOString(),
    ...eintrag
  };
  daten.push(neuerEintrag);
  schreiben(dateiName, daten);
  return neuerEintrag;
}

/**
 * Aktualisiert einen Eintrag anhand der ID.
 * @param {string} dateiName - Name der JSON-Datei
 * @param {string} id - ID des zu aktualisierenden Eintrags
 * @param {Object} aenderungen - Zu uebernehmende Aenderungen
 * @returns {Object|null} Aktualisierter Eintrag oder null
 */
function aktualisieren(dateiName, id, aenderungen) {
  const daten = lesen(dateiName);
  const index = daten.findIndex(eintrag => eintrag.id === id);
  if (index === -1) {
    return null;
  }
  daten[index] = {
    ...daten[index],
    ...aenderungen,
    id: daten[index].id,
    erstelltAm: daten[index].erstelltAm,
    aktualisiertAm: new Date().toISOString()
  };
  schreiben(dateiName, daten);
  return daten[index];
}

/**
 * Loescht einen Eintrag anhand der ID.
 * @param {string} dateiName - Name der JSON-Datei
 * @param {string} id - ID des zu loeschenden Eintrags
 * @returns {boolean} true wenn geloescht, false wenn nicht gefunden
 */
function loeschen(dateiName, id) {
  const daten = lesen(dateiName);
  const vorherLaenge = daten.length;
  const gefiltert = daten.filter(eintrag => eintrag.id !== id);
  if (gefiltert.length === vorherLaenge) {
    return false;
  }
  schreiben(dateiName, gefiltert);
  return true;
}

/**
 * Erzeugt eine eindeutige ID (UUID v4 via crypto).
 * @returns {string} UUID
 */
function erzeugeId() {
  const crypto = require('crypto');
  return crypto.randomUUID();
}

module.exports = {
  lesen,
  schreiben,
  sucheNachId,
  hinzufuegen,
  aktualisieren,
  loeschen,
  erzeugeId
};
