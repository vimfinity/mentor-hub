// ===========================================
// i18n Service - Sprachverwaltung
// ===========================================

/** @type {Object} Geladene Uebersetzungen */
let uebersetzungen = {};

/** @type {string} Aktuelle Sprache */
let aktuelleSprache = 'de';

/** @type {Array<Function>} Listener fuer Sprachwechsel */
const listener = [];

/**
 * Laedt eine Locale-Datei vom Server.
 * @param {string} sprache - Sprach-Code (de/en)
 */
async function ladeSprache(sprache) {
  const antwort = await fetch('/api/i18n/' + sprache);
  if (!antwort.ok) {
    throw new Error('Sprache konnte nicht geladen werden: ' + sprache);
  }
  uebersetzungen = await antwort.json();
  aktuelleSprache = sprache;

  // Sprache im localStorage speichern
  try {
    localStorage.setItem('mentor-hub-sprache', sprache);
  } catch (e) {
    // localStorage nicht verfuegbar - ignorieren
  }

  // Listener benachrichtigen
  listener.forEach(fn => fn(sprache));
}

/**
 * Gibt die Uebersetzung fuer einen Schluessel zurueck.
 * Unterstuetzt verschachtelte Schluessel mit Punkt-Notation: "nav.neuigkeiten"
 * @param {string} schluessel - Uebersetzungs-Schluessel
 * @returns {string} Uebersetzer Text oder Schluessel als Fallback
 */
function t(schluessel) {
  const teile = schluessel.split('.');
  let wert = uebersetzungen;

  for (const teil of teile) {
    if (wert && typeof wert === 'object' && teil in wert) {
      wert = wert[teil];
    } else {
      return schluessel;
    }
  }

  return typeof wert === 'string' ? wert : schluessel;
}

/**
 * Wechselt zur naechsten verfuegbaren Sprache.
 */
async function wechsleSprache() {
  const neueSprache = aktuelleSprache === 'de' ? 'en' : 'de';
  await ladeSprache(neueSprache);
}

/**
 * Gibt die aktuelle Sprache zurueck.
 * @returns {string} Aktueller Sprach-Code
 */
function holeSprache() {
  return aktuelleSprache;
}

/**
 * Registriert einen Listener fuer Sprachwechsel.
 * @param {Function} fn - Callback-Funktion
 */
function beiSprachwechsel(fn) {
  listener.push(fn);
}

/**
 * Initialisiert den i18n-Service.
 * Laedt die gespeicherte oder Standard-Sprache.
 */
async function initialisiere() {
  let gespeichert = 'de';
  try {
    gespeichert = localStorage.getItem('mentor-hub-sprache') || 'de';
  } catch (e) {
    // localStorage nicht verfuegbar
  }
  await ladeSprache(gespeichert);
}

export { t, wechsleSprache, holeSprache, beiSprachwechsel, initialisiere };
