function renderAdminBereich({ titel, beschreibung = '', aktionen = '', inhalt = '' }) {
  return `
    <section class="admin-bereich">
      <div class="admin-bereich-kopf">
        <div class="admin-bereich-meta">
          <h2 class="sektion-titel admin-bereich-titel">${titel}</h2>
          ${beschreibung ? `<p class="sektion-beschreibung admin-bereich-beschreibung">${beschreibung}</p>` : ''}
        </div>
        ${aktionen ? `<div class="admin-bereich-aktionen">${aktionen}</div>` : ''}
      </div>
      ${inhalt}
    </section>
  `;
}

function renderAdminPanel(inhalt, zusatzKlassen = '') {
  return `<div class="admin-panel ${zusatzKlassen}">${inhalt}</div>`;
}

function renderAdminLeerzustand(text) {
  return renderAdminPanel(`<p class="leer-zustand-text">${text}</p>`, 'admin-panel-zentriert');
}

export {
  renderAdminBereich,
  renderAdminPanel,
  renderAdminLeerzustand
};