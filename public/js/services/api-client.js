// ===========================================
// API Client - Fetch-Wrapper
// ===========================================

const BASIS_URL = '';

/**
 * Fuehrt einen GET-Request aus.
 * @param {string} pfad - API-Pfad (z.B. "/api/news")
 * @returns {Promise<Object>} Geparste Antwort
 */
async function get(pfad) {
  const antwort = await fetch(BASIS_URL + pfad, {
    method: 'GET',
    headers: erzeugeHeader()
  });
  return verarbeiteAntwort(antwort);
}

/**
 * Fuehrt einen POST-Request aus.
 * @param {string} pfad - API-Pfad
 * @param {Object} daten - Zu sendende Daten
 * @returns {Promise<Object>} Geparste Antwort
 */
async function post(pfad, daten) {
  const antwort = await fetch(BASIS_URL + pfad, {
    method: 'POST',
    headers: erzeugeHeader(),
    body: JSON.stringify(daten)
  });
  return verarbeiteAntwort(antwort);
}

/**
 * Fuehrt einen PUT-Request aus.
 * @param {string} pfad - API-Pfad
 * @param {Object} daten - Zu sendende Daten
 * @returns {Promise<Object>} Geparste Antwort
 */
async function put(pfad, daten) {
  const antwort = await fetch(BASIS_URL + pfad, {
    method: 'PUT',
    headers: erzeugeHeader(),
    body: JSON.stringify(daten)
  });
  return verarbeiteAntwort(antwort);
}

/**
 * Fuehrt einen DELETE-Request aus.
 * @param {string} pfad - API-Pfad
 * @returns {Promise<Object>} Geparste Antwort
 */
async function loeschen(pfad) {
  const antwort = await fetch(BASIS_URL + pfad, {
    method: 'DELETE',
    headers: erzeugeHeader()
  });
  return verarbeiteAntwort(antwort);
}

/**
 * Erzeugt Request-Header inkl. Auth-Token falls vorhanden.
 * @returns {Object} Headers
 */
function erzeugeHeader() {
  const headers = {
    'Content-Type': 'application/json'
  };

  const token = holeToken();
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  return headers;
}

/**
 * Verarbeitet die Fetch-Antwort.
 * @param {Response} antwort - Fetch Response
 * @returns {Promise<Object>} Geparste Daten mit Statusinfo
 */
async function verarbeiteAntwort(antwort) {
  const daten = await antwort.json().catch(() => null);

  return {
    ok: antwort.ok,
    status: antwort.status,
    daten
  };
}

/**
 * Speichert den Auth-Token.
 * @param {string} token - Session-Token
 */
function setzeToken(token) {
  try {
    sessionStorage.setItem('mentor-hub-token', token);
  } catch (e) {
    // Fallback: Im Speicher halten
    window.__mentorHubToken = token;
  }
}

/**
 * Gibt den gespeicherten Auth-Token zurueck.
 * @returns {string|null} Token oder null
 */
function holeToken() {
  try {
    return sessionStorage.getItem('mentor-hub-token');
  } catch (e) {
    return window.__mentorHubToken || null;
  }
}

/**
 * Entfernt den Auth-Token.
 */
function entferneToken() {
  try {
    sessionStorage.removeItem('mentor-hub-token');
  } catch (e) {
    window.__mentorHubToken = null;
  }
}

export { get, post, put, loeschen, setzeToken, holeToken, entferneToken };
