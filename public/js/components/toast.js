let container = null;

/**
 * Creates the toast container once.
 */
function initializeContainer() {
  if (container) {
    return;
  }
  container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
}

/**
 * Shows a toast notification.
 * @param {string} message - Message text
 * @param {string} type - Toast type
 * @param {number} durationMs - Display duration in milliseconds
 */
function showToast(message, type, durationMs) {
  initializeContainer();

  const duration = durationMs || 4000;
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = message;

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
  }, duration);
}

/**
 * Shows a success message.
 * @param {string} message - Message text
 */
function showSuccess(message) {
  showToast(message, 'success', 4000);
}

/**
 * Shows an error message.
 * @param {string} message - Message text
 */
function showError(message) {
  showToast(message, 'error', 5000);
}

/**
 * Shows an info message.
 * @param {string} message - Message text
 */
function showInfo(message) {
  showToast(message, 'info', 4000);
}

export { showSuccess, showError, showInfo };
