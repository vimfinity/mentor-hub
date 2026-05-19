'use strict';

const crypto = require('crypto');

// Aktive Sitzungen: Map<token, { erstelltAm: number }>
const sitzungen = new Map();

/**
 * Erzeugt einen SHA-256 Hash mit Salt.
 * @param {string} passwort - Klartext-Passwort
 * @param {string} salt - Zufaelliger Salt
 * @returns {string} Hex-kodierter Hash
 */
function hashPasswort(passwort, salt) {
  return crypto
    .createHash('sha256')
    .update(salt + ':' + passwort)
    .digest('hex');
}

/**
 * Erzeugt einen zufaelligen Salt.
 * @returns {string} 32 Byte Salt als Hex-String
 */
function erzeugeSalt() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Prueft ein Passwort gegen Hash und Salt.
 * @param {string} passwort - Eingegebenes Passwort
 * @param {string} hash - Gespeicherter Hash
 * @param {string} salt - Gespeicherter Salt
 * @returns {boolean} true wenn korrekt
 */
function pruefePasswort(passwort, hash, salt) {
  const berechnet = hashPasswort(passwort, salt);
  // Timing-sicherer Vergleich
  return crypto.timingSafeEqual(
    Buffer.from(berechnet, 'hex'),
    Buffer.from(hash, 'hex')
  );
}

/**
 * Erstellt eine neue Sitzung.
 * @returns {string} Sitzungs-Token
 */
function erstelleSitzung() {
  const token = crypto.randomUUID();
  sitzungen.set(token, { erstelltAm: Date.now() });
  return token;
}

/**
 * Prueft ob ein Sitzungs-Token gueltig ist.
 * @param {string} token - Zu pruefender Token
 * @param {number} maxDauerMs - Maximale Sitzungsdauer in Millisekunden
 * @returns {boolean} true wenn gueltig
 */
function pruefeSitzung(token, maxDauerMs) {
  if (!token || !sitzungen.has(token)) {
    return false;
  }
  const sitzung = sitzungen.get(token);
  const abgelaufen = (Date.now() - sitzung.erstelltAm) > maxDauerMs;
  if (abgelaufen) {
    sitzungen.delete(token);
    return false;
  }
  return true;
}

/**
 * Beendet eine Sitzung.
 * @param {string} token - Zu entfernender Token
 */
function beendeSitzung(token) {
  sitzungen.delete(token);
}

/**
 * Entfernt alle abgelaufenen Sitzungen.
 * @param {number} maxDauerMs - Maximale Sitzungsdauer in Millisekunden
 */
function bereinigeSitzungen(maxDauerMs) {
  const jetzt = Date.now();
  for (const [token, sitzung] of sitzungen) {
    if ((jetzt - sitzung.erstelltAm) > maxDauerMs) {
      sitzungen.delete(token);
    }
  }
}

module.exports = {
  hashPasswort,
  erzeugeSalt,
  pruefePasswort,
  erstelleSitzung,
  pruefeSitzung,
  beendeSitzung,
  bereinigeSitzungen
};
