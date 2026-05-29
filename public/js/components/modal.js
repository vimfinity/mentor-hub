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
let modalScrollPosition = 0;

function openModal(options) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const sizeClass = options.size === 'wide' ? ' modal-content-wide' : options.size === 'medium' ? ' modal-content-medium' : '';
  const persistent = options.persistent === true;
  const contentHtml = `
    <div class="modal-content${sizeClass}">
      <header class="modal-header">
        <h2 class="modal-title">${escapeHtml(options.title)}</h2>
        <button class="modal-close" type="button" aria-label="Close">×</button>
      </header>
      <div class="modal-body">${options.content}</div>
      <div class="modal-actions">
        <button class="btn btn-secondary modal-cancel">
          ${escapeHtml(options.cancelText || 'Cancel')}
        </button>
        ${options.onConfirm ? `
          <button class="btn btn-primary modal-confirm">
            ${escapeHtml(options.confirmText || 'OK')}
          </button>
        ` : ''}
      </div>
    </div>
  `;

  overlay.innerHTML = contentHtml;
  document.body.appendChild(overlay);
  lockPageScroll();

  const cancelButton = overlay.querySelector('.modal-cancel');
  cancelButton.addEventListener('click', () => closeModal(overlay));

  const confirmButton = overlay.querySelector('.modal-confirm');
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

  const closeButton = overlay.querySelector('.modal-close');
  if (closeButton) {
    closeButton.addEventListener('click', () => closeModal(overlay));
  }

  if (!persistent) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay);
      }
    });
  }

  const escapeHandler = (e) => {
    if (e.key === 'Escape' && !persistent) {
      closeModal(overlay);
    }
  };
  overlay._escapeHandler = escapeHandler;
  document.addEventListener('keydown', escapeHandler);

  return overlay;
}

/**
 * Closes a modal dialog.
 * @param {HTMLElement} overlay - Modal overlay element
 */
function closeModal(overlay) {
  if (overlay && overlay.parentNode) {
    if (overlay._escapeHandler) {
      document.removeEventListener('keydown', overlay._escapeHandler);
    }
    overlay.parentNode.removeChild(overlay);
  }
  if (!document.querySelector('.modal-overlay')) {
    unlockPageScroll();
  }
}

function lockPageScroll() {
  if (document.body.classList.contains('modal-open')) {
    return;
  }

  modalScrollPosition = window.scrollY || document.documentElement.scrollTop || 0;
  document.documentElement.classList.add('modal-open');
  document.body.classList.add('modal-open');
  document.body.style.position = 'fixed';
  document.body.style.top = `-${modalScrollPosition}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}

function unlockPageScroll() {
  document.documentElement.classList.remove('modal-open');
  document.body.classList.remove('modal-open');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, modalScrollPosition);
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
