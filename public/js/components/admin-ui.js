import { icon } from './icons.js';

function renderAdminSection({ title, description = '', actions = '', content = '', iconName = '' }) {
  return `
    <section class="admin-section">
      <div class="admin-section-header">
        <div class="admin-section-meta">
          <h2 class="section-title admin-section-title">
            ${iconName ? `<span class="admin-section-icon">${icon(iconName, 22)}</span>` : ''}${title}
          </h2>
          ${description ? `<p class="section-description admin-section-description">${description}</p>` : ''}
        </div>
        ${actions ? `<div class="admin-section-actions">${actions}</div>` : ''}
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
    <div class="empty-state">
      <div class="empty-state-icon">${icon(iconName, 40)}</div>
      <p class="empty-state-text">${text}</p>
    </div>
  `, 'admin-panel-centered');
}

export {
  renderAdminSection,
  renderAdminPanel,
  renderAdminEmptyState
};