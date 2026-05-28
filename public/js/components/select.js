/**
 * Reusable styled select component.
 * Renders as <div class="select"> with a button trigger and a popover menu.
 * Replaces native <select> for visual consistency across the app.
 */

import { escapeHtml } from './modal.js';

let openInstance = null;
let documentListenerAttached = false;

function attachDocumentListener() {
  if (documentListenerAttached) {
    return;
  }
  document.addEventListener('click', (event) => {
    if (!openInstance) {
      return;
    }
    if (openInstance.root.contains(event.target)) {
      return;
    }
    closeInstance(openInstance);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openInstance) {
      closeInstance(openInstance);
    }
  });
  documentListenerAttached = true;
}

function closeInstance(instance) {
  if (!instance) {
    return;
  }
  instance.root.classList.remove('open');
  instance.trigger.setAttribute('aria-expanded', 'false');
  if (openInstance === instance) {
    openInstance = null;
  }
}

/**
 * Renders the markup for a select component.
 *
 * @param {Object} options
 * @param {string} options.name - Stable identifier (used for aria + data attrs)
 * @param {string} [options.value] - Selected value
 * @param {Array<{value: string, label: string}>} options.options - Options list
 * @param {string} [options.placeholder] - Label when nothing selected
 * @param {string} [options.size] - 'normal' (default), 'klein'
 * @param {boolean} [options.disabled]
 * @param {string} [options.ariaLabel]
 * @returns {string} HTML markup
 */
function renderSelect({
  name,
  value = '',
  options = [],
  placeholder = '',
  size = 'normal',
  disabled = false,
  ariaLabel = ''
}) {
  const selected = options.find((option) => option.value === value);
  const triggerLabel = selected ? selected.label : placeholder || (options[0] && options[0].label) || '';
  const classes = ['select'];
  if (size === 'klein') {
    classes.push('select-klein');
  }
  if (disabled) {
    classes.push('select-disabled');
  }

  return `
    <div class="${classes.join(' ')}" data-select="${escapeHtml(name)}" data-value="${escapeHtml(value)}">
      <button type="button"
        class="select-trigger"
        aria-haspopup="listbox"
        aria-expanded="false"
        ${ariaLabel ? `aria-label="${escapeHtml(ariaLabel)}"` : ''}
        ${disabled ? 'disabled' : ''}>
        <span class="select-label">${escapeHtml(triggerLabel)}</span>
        <svg class="select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>
      <ul class="select-menu" role="listbox">
        ${options.map((option) => `
          <li class="select-option ${option.value === value ? 'active' : ''}"
            role="option"
            data-select-value="${escapeHtml(option.value)}"
            aria-selected="${option.value === value ? 'true' : 'false'}">
            ${escapeHtml(option.label)}
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

/**
 * Binds interactivity to a rendered select.
 *
 * @param {HTMLElement} root - The .select element
 * @param {Function} onChange - Callback receiving the new value
 * @returns {Function} Detach function
 */
function bindSelect(root, onChange) {
  if (!root || root.dataset.bound === '1') {
    return () => {};
  }
  root.dataset.bound = '1';
  attachDocumentListener();

  const trigger = root.querySelector('.select-trigger');
  const menu = root.querySelector('.select-menu');
  const label = root.querySelector('.select-label');
  const instance = { root, trigger };

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (trigger.disabled) {
      return;
    }
    const isOpen = root.classList.contains('open');
    if (isOpen) {
      closeInstance(instance);
      return;
    }
    if (openInstance && openInstance !== instance) {
      closeInstance(openInstance);
    }
    root.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    openInstance = instance;
  });

  menu.addEventListener('click', (event) => {
    const item = event.target.closest('.select-option');
    if (!item) {
      return;
    }

    const newValue = item.dataset.selectValue;
    if (newValue === root.dataset.value) {
      closeInstance(instance);
      return;
    }

    root.dataset.value = newValue;
    if (label) {
      label.textContent = item.textContent.trim();
    }
    menu.querySelectorAll('.select-option').forEach((option) => {
      const isActive = option === item;
      option.classList.toggle('active', isActive);
      option.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    closeInstance(instance);

    if (typeof onChange === 'function') {
      onChange(newValue);
    }
  });

  return () => {
    if (openInstance === instance) {
      closeInstance(instance);
    }
    delete root.dataset.bound;
  };
}

/**
 * Convenience helper: find all selects under a container that have a name
 * and bind them via a value -> callback map.
 *
 * @param {HTMLElement} container
 * @param {Record<string, (value: string) => void>} handlers - name -> callback
 */
function bindSelectsIn(container, handlers) {
  container.querySelectorAll('[data-select]').forEach((root) => {
    const name = root.dataset.select;
    const handler = handlers[name];
    if (!handler) {
      return;
    }
    bindSelect(root, handler);
  });
}

export { renderSelect, bindSelect, bindSelectsIn };
