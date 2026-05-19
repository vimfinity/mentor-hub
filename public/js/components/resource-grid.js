import * as api from '../services/api-client.js';
import { t } from '../services/i18n.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';

let currentFilter = 'all';

async function render(container) {
  const response = await api.get('/api/resources');

  if (!response.ok || !response.data || response.data.length === 0) {
    container.innerHTML = `
      <div class="leer-zustand">
        <div class="leer-zustand-icon">${icon('bookOpen', 48)}</div>
        <p class="leer-zustand-text">${t('resource.empty')}</p>
      </div>
    `;
    return;
  }

  currentFilter = 'all';
  renderContent(container, response.data);
}

function renderContent(container, resources) {
  const categories = ['all', 'tool', 'article', 'video', 'tutorial'];

  const filteredResources = currentFilter === 'all'
    ? resources
    : resources.filter((resource) => resource.category === currentFilter);

  const html = `
    <h1 class="sektion-titel">${t('resource.title')}</h1>
    <div class="filter-leiste">
      ${categories.map((category) => `
        <button class="filter-btn ${category === currentFilter ? 'aktiv' : ''}"
          data-category="${category}">
          ${t('resource.' + category)}
        </button>
      `).join('')}
    </div>
    <div class="karten-grid">
      ${filteredResources.map((resource) => renderCard(resource)).join('')}
    </div>
  `;

  container.innerHTML = html;

  container.querySelectorAll('.filter-btn').forEach((button) => {
    button.addEventListener('click', () => {
      currentFilter = button.dataset.category;
      renderContent(container, resources);
    });
  });
}

function renderCard(resource) {
  return `
    <div class="karte">
      <div class="karte-meta">
        <span class="karte-kategorie">${escapeHtml(t('resource.' + resource.category))}</span>
      </div>
      <h3 class="karte-titel">${escapeHtml(resource.title)}</h3>
      ${resource.description ? `<p class="karte-text">${escapeHtml(resource.description)}</p>` : ''}
      <a href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer" class="karte-link">
        ${icon('externalLink', 14)} ${t('resource.open')}
      </a>
    </div>
  `;
}

export { render };
