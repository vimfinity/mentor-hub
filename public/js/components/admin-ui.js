function renderAdminSection({ title, description = '', actions = '', content = '' }) {
  return `
    <section class="admin-bereich">
      <div class="admin-bereich-kopf">
        <div class="admin-bereich-meta">
          <h2 class="sektion-titel admin-bereich-titel">${title}</h2>
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

function renderAdminEmptyState(text) {
  return renderAdminPanel(`<p class="leer-zustand-text">${text}</p>`, 'admin-panel-zentriert');
}

export {
  renderAdminSection,
  renderAdminPanel,
  renderAdminEmptyState
};