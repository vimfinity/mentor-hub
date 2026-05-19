// ===========================================
// Modal-Komponente - Dialog
// ===========================================

/**
 * Oeffnet einen Modal-Dialog.
 * @param {Object} optionen - Modal-Konfiguration
 * @param {string} optionen.titel - Modal-Titel
 * @param {string} optionen.inhalt - HTML-Inhalt des Modals
 * @param {Function} [optionen.beiBestaetigung] - Callback bei Bestaetigung
 * @param {string} [optionen.bestaetigenText] - Text des Bestaetigen-Buttons
 * @param {string} [optionen.abbrechenText] - Text des Abbrechen-Buttons
 * @returns {HTMLElement} Modal-Element
 */
function oeffne(optionen) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const inhaltHtml = `
    <div class="modal-inhalt">
      <h2 class="modal-titel">${escapeHtml(optionen.titel)}</h2>
      <div class="modal-body">${optionen.inhalt}</div>
      <div class="modal-aktionen">
        <button class="btn btn-sekundaer modal-abbrechen">
          ${escapeHtml(optionen.abbrechenText || 'Abbrechen')}
        </button>
        ${optionen.beiBestaetigung ? `
          <button class="btn btn-primaer modal-bestaetigen">
            ${escapeHtml(optionen.bestaetigenText || 'OK')}
          </button>
        ` : ''}
      </div>
    </div>
  `;

  overlay.innerHTML = inhaltHtml;
  document.body.appendChild(overlay);

  // Event-Listener
  const abbrechenBtn = overlay.querySelector('.modal-abbrechen');
  abbrechenBtn.addEventListener('click', () => schliesse(overlay));

  const bestaetigenBtn = overlay.querySelector('.modal-bestaetigen');
  if (bestaetigenBtn && optionen.beiBestaetigung) {
    bestaetigenBtn.addEventListener('click', () => {
      optionen.beiBestaetigung(overlay);
      schliesse(overlay);
    });
  }

  // Schliessen bei Klick auf Overlay
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      schliesse(overlay);
    }
  });

  // Schliessen mit Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      schliesse(overlay);
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  return overlay;
}

/**
 * Schliesst einen Modal-Dialog.
 * @param {HTMLElement} overlay - Modal-Overlay-Element
 */
function schliesse(overlay) {
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
}

/**
 * Zeigt einen Bestaetigungs-Dialog.
 * @param {string} nachricht - Bestaetigungsfrage
 * @param {Function} beiJa - Callback bei Bestaetigung
 * @param {string} [jaText] - Text fuer Ja-Button
 */
function bestaetigung(nachricht, beiJa, jaText) {
  oeffne({
    titel: 'Bestaetigung',
    inhalt: '<p>' + escapeHtml(nachricht) + '</p>',
    bestaetigenText: jaText || 'Ja',
    abbrechenText: 'Abbrechen',
    beiBestaetigung: beiJa
  });
}

/**
 * Escaped HTML-Sonderzeichen zur XSS-Praevention.
 * @param {string} text - Roher Text
 * @returns {string} Escapeter Text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export { oeffne, schliesse, bestaetigung, escapeHtml };
