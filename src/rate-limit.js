'use strict';

// Anfragen-Zaehler pro IP: Map<ip, { anzahl: number, fensterStart: number }>
const zaehler = new Map();

// Konfiguration
const MAX_ANFRAGEN = 30;
const FENSTER_MS = 60000; // 1 Minute

/**
 * Prueft ob eine IP das Rate-Limit ueberschritten hat.
 * @param {string} ip - Client-IP-Adresse
 * @returns {boolean} true wenn die Anfrage erlaubt ist, false wenn blockiert
 */
function istErlaubt(ip) {
  const jetzt = Date.now();
  const eintrag = zaehler.get(ip);

  if (!eintrag || (jetzt - eintrag.fensterStart) > FENSTER_MS) {
    // Neues Zeitfenster starten
    zaehler.set(ip, { anzahl: 1, fensterStart: jetzt });
    return true;
  }

  if (eintrag.anzahl >= MAX_ANFRAGEN) {
    return false;
  }

  eintrag.anzahl++;
  return true;
}

/**
 * Gibt die verbleibenden Anfragen fuer eine IP zurueck.
 * @param {string} ip - Client-IP-Adresse
 * @returns {number} Verbleibende Anfragen im aktuellen Fenster
 */
function verbleibendeAnfragen(ip) {
  const jetzt = Date.now();
  const eintrag = zaehler.get(ip);

  if (!eintrag || (jetzt - eintrag.fensterStart) > FENSTER_MS) {
    return MAX_ANFRAGEN;
  }

  return Math.max(0, MAX_ANFRAGEN - eintrag.anzahl);
}

/**
 * Bereinigt alte Eintraege (aufraeumen).
 */
function bereinigen() {
  const jetzt = Date.now();
  for (const [ip, eintrag] of zaehler) {
    if ((jetzt - eintrag.fensterStart) > FENSTER_MS) {
      zaehler.delete(ip);
    }
  }
}

// Alle 5 Minuten alte Eintraege bereinigen
setInterval(bereinigen, 300000).unref();

module.exports = {
  istErlaubt,
  verbleibendeAnfragen
};
