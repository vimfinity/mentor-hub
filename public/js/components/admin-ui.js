import { icon } from './icons.js';

function renderAdminSection({ title, description = '', actions = '', content = '', iconName = '' }) {
  return `
    <section class="admin-bereich">
      <div class="admin-bereich-kopf">
        <div class="admin-bereich-meta">
          <h2 class="sektion-titel admin-bereich-titel">
            ${iconName ? `<span class="admin-bereich-icon">${icon(iconName, 22)}</span>` : ''}${title}
          </h2>
          ${description ? `<p class="sektion-beschreibung admin-bereich-beschreibung">${description}</p>` : ''}
        </div>
        ${actions ? `<div class="admin-bereich-aktionen">${actions}</div>` : ''}
      </div>
      ${content}
    </section>
  `;
}

function renderAdminPanel(content, extraClasses = '') {
  return `<div class="admin-panel ${extraClasses}">${content}</div>`;
}

function renderAdminEmptyState(text, iconName = 'inbox') {
  return renderAdminPanel(`
    <div class="leer-zustand">
      <div class="leer-zustand-icon">${icon(iconName, 40)}</div>
      <p class="leer-zustand-text">${text}</p>
    </div>
  `, 'admin-panel-zentriert');
}

export {
  renderAdminSection,
  renderAdminPanel,
  renderAdminEmptyState
};