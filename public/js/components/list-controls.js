import { t } from '../services/i18n.js';

function renderListensteuerung({
  sortierOptionen = [],
  aktuelleSortierung,
  aktuelleSeite,
  gesamtSeiten,
  gesamtElemente,
  ergebnisLabel
}) {
  const paginationHtml = gesamtSeiten > 1
    ? `
      <div class="pagination" data-pagination>
        <button class="pagination-btn" type="button" data-page="${aktuelleSeite - 1}" ${aktuelleSeite <= 1 ? 'disabled' : ''}>
          ${t('general.previous')}
        </button>
        ${Array.from({ length: gesamtSeiten }).map((_, index) => {
          const seite = index + 1;
          return `
            <button class="pagination-btn ${seite === aktuelleSeite ? 'aktiv' : ''}" type="button" data-page="${seite}">
              ${seite}
            </button>
          `;
        }).join('')}
        <button class="pagination-btn" type="button" data-page="${aktuelleSeite + 1}" ${aktuelleSeite >= gesamtSeiten ? 'disabled' : ''}>
          ${t('general.next')}
        </button>
      </div>
    `
    : '';

  return `
    <div class="listensteuerung">
      <div class="listensteuerung-kopf">
        <p class="listensteuerung-meta">${ergebnisLabel || t('general.resultsCount').replace('{count}', String(gesamtElemente))}</p>
        <label class="listensteuerung-sortierung">
          <span>${t('general.sort')}</span>
          <select class="formular-select listensteuerung-auswahl" data-list-sort>
            ${sortierOptionen.map((option) => `
              <option value="${option.value}" ${option.value === aktuelleSortierung ? 'selected' : ''}>${option.label}</option>
            `).join('')}
          </select>
        </label>
      </div>
      ${paginationHtml}
    </div>
  `;
}

function verbindeListensteuerung(container, { onSortierung, onSeite }) {
  const sortierung = container.querySelector('[data-list-sort]');
  if (sortierung && onSortierung) {
    sortierung.addEventListener('change', () => {
      onSortierung(sortierung.value);
    });
  }

  container.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!button.disabled && onSeite) {
        onSeite(Number.parseInt(button.dataset.page, 10));
      }
    });
  });
}

export { renderListensteuerung, verbindeListensteuerung };