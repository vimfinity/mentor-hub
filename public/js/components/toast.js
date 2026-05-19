// ===========================================
// Toast-Komponente - Benachrichtigungen
// ===========================================

let container = null;

/**
 * Erstellt den Toast-Container (einmalig).
 */
function initialisiereContainer() {
  if (container) return;
  container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
}

/**
 * Zeigt eine Toast-Benachrichtigung an.
 * @param {string} nachricht - Anzuzeigende Nachricht
 * @param {string} typ - Typ: "erfolg", "fehler", "info"
 * @param {number} dauerMs - Anzeigedauer in ms (Standard: 4000)
 */
function zeige(nachricht, typ, dauerMs) {
  initialisiereContainer();

  const dauer = dauerMs || 4000;
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + typ;
  toast.textContent = nachricht;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 300ms ease';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, dauer);
}

/**
 * Zeigt eine Erfolgsmeldung.
 * @param {string} nachricht - Text
 */
function erfolg(nachricht) {
  zeige(nachricht, 'erfolg', 4000);
}

/**
 * Zeigt eine Fehlermeldung.
 * @param {string} nachricht - Text
 */
function fehler(nachricht) {
  zeige(nachricht, 'fehler', 5000);
}

/**
 * Zeigt eine Infomeldung.
 * @param {string} nachricht - Text
 */
function info(nachricht) {
  zeige(nachricht, 'info', 4000);
}

export { erfolg, fehler, info };
