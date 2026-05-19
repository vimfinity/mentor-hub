// ===========================================
// State Service - Einfacher Event-Bus
// ===========================================

/** @type {Map<string, Array<Function>>} Event-Listener Map */
const abonnenten = new Map();

/**
 * Registriert einen Listener fuer ein Event.
 * @param {string} ereignis - Event-Name
 * @param {Function} callback - Callback-Funktion
 * @returns {Function} Abmelde-Funktion
 */
function abonniere(ereignis, callback) {
  if (!abonnenten.has(ereignis)) {
    abonnenten.set(ereignis, []);
  }
  abonnenten.get(ereignis).push(callback);

  // Abmelde-Funktion zurueckgeben
  return () => {
    const liste = abonnenten.get(ereignis);
    if (liste) {
      const index = liste.indexOf(callback);
      if (index > -1) {
        liste.splice(index, 1);
      }
    }
  };
}

/**
 * Sendet ein Event an alle Abonnenten.
 * @param {string} ereignis - Event-Name
 * @param {*} daten - Zu uebergebende Daten
 */
function sende(ereignis, daten) {
  const liste = abonnenten.get(ereignis);
  if (liste) {
    liste.forEach(callback => callback(daten));
  }
}

export { abonniere, sende };
