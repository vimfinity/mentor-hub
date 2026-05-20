/**
 * Opens a modal dialog.
 * @param {Object} options - Modal configuration
 * @param {string} options.title - Modal title
 * @param {string} options.content - Modal body HTML
 * @param {Function} [options.onConfirm] - Confirmation callback
 * @param {string} [options.confirmText] - Confirm button label
 * @param {string} [options.cancelText] - Cancel button label
 * @returns {HTMLElement} Modal element
 */
function openModal(options) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const contentHtml = `
    <div class="modal-inhalt">
      <h2 class="modal-titel">${escapeHtml(options.title)}</h2>
      <div class="modal-body">${options.content}</div>
      <div class="modal-aktionen">
        <button class="btn btn-sekundaer modal-abbrechen">
          ${escapeHtml(options.cancelText || 'Cancel')}
        </button>
        ${options.onConfirm ? `
          <button class="btn btn-primaer modal-bestaetigen">
            ${escapeHtml(options.confirmText || 'OK')}
          </button>
        ` : ''}
      </div>
    </div>
  `;

  overlay.innerHTML = contentHtml;
  document.body.appendChild(overlay);

  const cancelButton = overlay.querySelector('.modal-abbrechen');
  cancelButton.addEventListener('click', () => closeModal(overlay));

  const confirmButton = overlay.querySelector('.modal-bestaetigen');
  if (confirmButton && options.onConfirm) {
    confirmButton.addEventListener('click', async () => {
      confirmButton.disabled = true;
      try {
        await options.onConfirm(overlay);
      } finally {
        closeModal(overlay);
      }
    });
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal(overlay);
    }
  });

  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal(overlay);
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);

  return overlay;
}

/**
 * Closes a modal dialog.
 * @param {HTMLElement} overlay - Modal overlay element
 */
function closeModal(overlay) {
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
}

/**
 * Shows a confirmation dialog.
 * @param {string} message - Confirmation message
 * @param {Function} onConfirm - Confirmation callback
 * @param {string} [confirmText] - Confirm button label
 */
function confirmDialog(message, onConfirm, confirmText) {
  openModal({
    title: 'Confirm',
    content: '<p>' + escapeHtml(message) + '</p>',
    confirmText: confirmText || 'OK',
    cancelText: 'Cancel',
    onConfirm
  });
}

/**
 * Escapes HTML special characters to reduce XSS risk.
 * @param {string} text - Raw text
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export { openModal, closeModal, confirmDialog, escapeHtml };
