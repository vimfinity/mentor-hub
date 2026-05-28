import { t } from '../services/i18n.js';

function renderListControls({
  sortOptions = [],
  currentSort,
  currentPage,
  totalPages,
  totalItems,
  resultLabel
}) {
  const paginationHtml = totalPages > 1
    ? `
      <div class="pagination" data-pagination>
        <button class="pagination-btn" type="button" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>
          ${t('general.previous')}
        </button>
        ${Array.from({ length: totalPages }).map((_, index) => {
          const page = index + 1;
          return `
            <button class="pagination-btn ${page === currentPage ? 'active' : ''}" type="button" data-page="${page}">
              ${page}
            </button>
          `;
        }).join('')}
        <button class="pagination-btn" type="button" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>
          ${t('general.next')}
        </button>
      </div>
    `
    : '';

  const currentOption = sortOptions.find((o) => o.value === currentSort);
  const currentLabel = currentOption ? currentOption.label : sortOptions[0]?.label || '';

  return `
    <div class="list-controls">
      <div class="list-controls-header">
        <p class="list-controls-meta">${resultLabel || t('general.resultsCount').replace('{count}', String(totalItems))}</p>
        <div class="list-controls-sortOrder">
          <span>${t('general.sort')}</span>
          <div class="dropdown" data-list-sort data-value="${currentSort}">
            <button type="button" class="dropdown-trigger" aria-haspopup="listbox" aria-expanded="false">
              <span class="dropdown-label">${currentLabel}</span>
              <svg class="dropdown-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            <ul class="dropdown-menu" role="listbox">
              ${sortOptions.map((option) => `
                <li class="dropdown-item ${option.value === currentSort ? 'active' : ''}" role="option" data-dropdown-value="${option.value}" aria-selected="${option.value === currentSort}">
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

function bindListControls(container, { onSort, onPage }) {
  const dropdown = container.querySelector('[data-list-sort]');
  if (dropdown && onSort) {
    const trigger = dropdown.querySelector('.dropdown-trigger');
    const menu = dropdown.querySelector('.dropdown-menu');
    const label = dropdown.querySelector('.dropdown-label');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.toggle('open');
      trigger.setAttribute('aria-expanded', String(isOpen));
    });

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.dropdown-item');
      if (!item) return;
      const value = item.dataset.dropdownValue;
      dropdown.dataset.value = value;
      label.textContent = item.textContent.trim();
      menu.querySelectorAll('.dropdown-item').forEach((i) => {
        i.classList.remove('active');
        i.setAttribute('aria-selected', 'false');
      });
      item.classList.add('active');
      item.setAttribute('aria-selected', 'true');
      dropdown.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      onSort(value);
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    });
  }

  container.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!button.disabled && onPage) {
        onPage(Number.parseInt(button.dataset.page, 10));
      }
    });
  });
}

export { renderListControls, bindListControls };