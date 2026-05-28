import * as api from '../services/api-client.js';
import { t } from '../services/i18n.js';
import { showError, showSuccess } from './toast.js';

function render(container) {
  const html = `
    <h1 class="section-title">${t('concern.title')}</h1>
    <p class="section-description">${t('concern.description')}</p>
    <form class="form" id="concern-form">
      <div class="form-group">
        <label class="form-label" for="concern-title">${t('concern.titleLabel')}</label>
        <input type="text" id="concern-title" class="form-input"
          placeholder="${t('concern.titlePlaceholder')}"
          maxlength="200" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="concern-detail">${t('concern.detailLabel')}</label>
        <textarea id="concern-detail" class="form-textarea"
          placeholder="${t('concern.detailPlaceholder')}"
          maxlength="2000"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label" for="concern-name">${t('concern.nameLabel')}</label>
        <input type="text" id="concern-name" class="form-input"
          placeholder="${t('concern.namePlaceholder')}"
          maxlength="100">
      </div>
      <button type="submit" class="btn btn-primary">${t('concern.submit')}</button>
    </form>
  `;

  container.innerHTML = html;
  registerEvents(container);
}

function registerEvents(container) {
  const form = container.querySelector('#concern-form');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const title = container.querySelector('#concern-title').value.trim();
    const description = container.querySelector('#concern-detail').value.trim();
    const name = container.querySelector('#concern-name').value.trim();

    if (!title) {
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    const result = await api.post('/api/concerns', {
      title,
      description,
      name: name || null
    });

    submitButton.disabled = false;

    if (result.ok) {
      showSuccess(t('concern.success'));
      form.reset();
    } else {
      showError(t('concern.error'));
    }
  });
}

export { render };