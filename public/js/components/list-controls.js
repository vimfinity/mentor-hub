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

  const aktuelleOption = sortierOptionen.find((o) => o.value === aktuelleSortierung);
  const aktuellesLabel = aktuelleOption ? aktuelleOption.label : sortierOptionen[0]?.label || '';

  return `
    <div class="listensteuerung">
      <div class="listensteuerung-kopf">
        <p class="listensteuerung-meta">${ergebnisLabel || t('general.resultsCount').replace('{count}', String(gesamtElemente))}</p>
        <div class="listensteuerung-sortierung">
          <span>${t('general.sort')}</span>
          <div class="dropdown" data-list-sort data-value="${aktuelleSortierung}">
            <button type="button" class="dropdown-trigger" aria-haspopup="listbox" aria-expanded="false">
              <span class="dropdown-label">${aktuellesLabel}</span>
              <svg class="dropdown-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <ul class="dropdown-menu" role="listbox">
              ${sortierOptionen.map((option) => `
                <li class="dropdown-item ${option.value === aktuelleSortierung ? 'aktiv' : ''}" role="option" data-dropdown-value="${option.value}" aria-selected="${option.value === aktuelleSortierung}">
                  ${option.label}
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      </div>
      ${paginationHtml}
    </div>
  `;
}

function verbindeListensteuerung(container, { onSortierung, onSeite }) {
  const dropdown = container.querySelector('[data-list-sort]');
  if (dropdown && onSortierung) {
    const trigger = dropdown.querySelector('.dropdown-trigger');
    const menu = dropdown.querySelector('.dropdown-menu');
    const label = dropdown.querySelector('.dropdown-label');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.toggle('offen');
      trigger.setAttribute('aria-expanded', String(isOpen));
    });

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.dropdown-item');
      if (!item) return;
      const value = item.dataset.dropdownValue;
      dropdown.dataset.value = value;
      label.textContent = item.textContent.trim();
      menu.querySelectorAll('.dropdown-item').forEach((i) => {
        i.classList.remove('aktiv');
        i.setAttribute('aria-selected', 'false');
      });
      item.classList.add('aktiv');
      item.setAttribute('aria-selected', 'true');
      dropdown.classList.remove('offen');
      trigger.setAttribute('aria-expanded', 'false');
      onSortierung(value);
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('offen');
      trigger.setAttribute('aria-expanded', 'false');
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