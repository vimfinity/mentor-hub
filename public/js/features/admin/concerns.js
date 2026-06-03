import * as api from '../../services/api-client.js';
import { fetchQuery } from '../../services/query-cache.js';
import { t, getLanguage } from '../../services/i18n.js';
import { normalizeSelection, paginateItems } from '../../services/view-state.js';
import { showError, showSuccess } from '../../components/toast.js';
import { escapeHtml, confirmDialog } from '../../components/modal.js';
import { renderAdminSection, renderAdminPanel, renderAdminEmptyState } from '../../components/admin-ui.js';
import { renderListControls, bindListControls } from '../../components/list-controls.js';
import { icon } from '../../components/icons.js';
import { renderSelect, bindSelect } from '../../components/select.js';
import {
  CONCERNS_CACHE_KEY,
  ITEMS_PER_ADMIN_PAGE,
  formatDate,
  invalidateAdminConcerns,
  handleUnauthorizedResponse
} from './shared.js';

export async function renderConcernsAdmin(container, context) {
  const response = await fetchQuery({
    key: CONCERNS_CACHE_KEY,
    ttlMs: 15 * 1000,
    fetchFunction: () => api.get('/api/admin/concerns')
  });

  if (handleUnauthorizedResponse(response, context.navigateTo)) {
    return;
  }

  const concerns = response.ok ? response.data : [];
  const sortOrder = normalizeSelection(context.searchParams?.get('sort'), ['newest', 'oldest', 'status', 'title-asc', 'title-desc'], 'newest');
  const statusFilter = normalizeSelection(context.searchParams?.get('status'), ['all', 'open', 'in_progress', 'done'], 'all');
  const filteredConcerns = statusFilter === 'all'
    ? concerns
    : concerns.filter((concern) => concern.status === statusFilter);
  const sortedConcerns = sortConcerns(filteredConcerns, sortOrder);
  const pagination = paginateItems(sortedConcerns, context.searchParams?.get('page'), ITEMS_PER_ADMIN_PAGE);

  const statusCounts = {
    all: concerns.length,
    open: concerns.filter((c) => c.status === 'open').length,
    in_progress: concerns.filter((c) => c.status === 'in_progress').length,
    done: concerns.filter((c) => c.status === 'done').length
  };
  const filterChips = [
    { value: 'all', label: t('admin.filterAll') },
    { value: 'open', label: t('admin.open') },
    { value: 'in_progress', label: t('admin.inProgress') },
    { value: 'done', label: t('admin.done') }
  ].map((option) => `
    <button type="button" class="filter-chip ${option.value === statusFilter ? 'active' : ''}"
      data-concern-filter="${option.value}" aria-pressed="${option.value === statusFilter}">
      ${escapeHtml(option.label)} <span class="filter-chip-count">${statusCounts[option.value]}</span>
    </button>
  `).join('');

  const emptyHtml = concerns.length === 0
    ? renderAdminEmptyState(t('admin.noConcerns'))
    : renderAdminEmptyState(t('admin.noConcernsForFilter'));

  const tablenHtml = renderAdminPanel(`
    <div class="filter-chip-bar" role="group" aria-label="${escapeHtml(t('admin.filterByStatus'))}">
      ${filterChips}
    </div>
    ${sortedConcerns.length === 0 ? emptyHtml : `
    ${renderListControls({
      sortOptions: [
        { value: 'newest', label: t('general.sortNewest') },
        { value: 'oldest', label: t('general.sortOldest') },
        { value: 'status', label: t('admin.sortStatus') },
        { value: 'title-asc', label: t('general.sortTitleAsc') },
        { value: 'title-desc', label: t('general.sortTitleDesc') }
      ],
      currentSort: sortOrder,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems,
      resultLabel: t('general.resultsCount').replace('{count}', String(pagination.totalItems))
    })}
    <table class="table">
      <thead>
        <tr>
          <th>${t('admin.title')}</th>
          <th>${t('admin.name')}</th>
          <th>${t('admin.status')}</th>
          <th>${t('admin.adminComment')}</th>
          <th>${t('admin.date')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${pagination.items.map((concern) => `
          <tr>
            <td data-label="${escapeHtml(t('admin.title'))}" title="${escapeHtml(concern.description || '')}">${escapeHtml(concern.title)}</td>
            <td data-label="${escapeHtml(t('admin.name'))}">${concern.name ? escapeHtml(concern.name) : '<em>' + escapeHtml(t('admin.anonymous')) + '</em>'}</td>
            <td data-label="${escapeHtml(t('admin.status'))}" data-concern-status-cell="${escapeHtml(concern.id)}">
              ${renderSelect({
                name: 'concern-status-' + concern.id,
                value: concern.status,
                size: 'klein',
                options: [
                  { value: 'open', label: t('admin.open') },
                  { value: 'in_progress', label: t('admin.inProgress') },
                  { value: 'done', label: t('admin.done') }
                ],
                ariaLabel: t('admin.status')
              })}
            </td>
            <td data-label="${escapeHtml(t('admin.adminComment'))}">
              <input type="text" class="form-input concern-comment-input" data-id="${escapeHtml(concern.id)}"
                value="${escapeHtml(concern.adminComment || '')}" maxlength="2000"
                placeholder="${escapeHtml(t('admin.editComment'))}" aria-label="${escapeHtml(t('admin.adminComment'))}">
            </td>
            <td data-label="${escapeHtml(t('admin.date'))}">${formatDate(concern.createdAt)}</td>
            <td class="table-aktionen" data-label="${escapeHtml(t('general.actions'))}">
              <button class="btn btn-small btn-danger concern-delete-button" data-id="${concern.id}">
                ${icon('trash', 16)}
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    `}
  `, 'admin-panel-table');

  container.innerHTML = renderAdminSection({
    title: t('admin.concerns'),
    description: t('admin.concernsDescription'),
    iconName: 'messageSquare',
    content: tablenHtml
  });

  bindListControls(container, {
    onSort: (value) => context.setSearchParams?.({ sort: value === 'newest' ? null : value, page: null }),
    onPage: (page) => context.setSearchParams?.({ page: page <= 1 ? null : page })
  });

  container.querySelectorAll('[data-concern-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const value = chip.dataset.concernFilter;
      context.setSearchParams?.({ status: value === 'all' ? null : value, page: null });
    });
  });

  container.querySelectorAll('.concern-comment-input').forEach((input) => {
    let lastSaved = input.value;
    const save = async () => {
      const value = input.value.trim();
      if (value === lastSaved) {
        return;
      }
      const result = await api.put('/api/admin/concerns/' + input.dataset.id, { adminComment: value });
      if (handleUnauthorizedResponse(result, context.navigateTo)) {
        return;
      }
      if (!result.ok) {
        showError(result.data?.error || t('general.error'));
        return;
      }
      lastSaved = value;
      invalidateAdminConcerns();
      showSuccess(t('admin.commentSaved'));
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    });
  });

  container.querySelectorAll('[data-concern-status-cell]').forEach((cell) => {
    const concernId = cell.dataset.concernStatusCell;
    const root = cell.querySelector('[data-select]');
    if (!root) {
      return;
    }
    bindSelect(root, async (value) => {
      const result = await api.put('/api/admin/concerns/' + concernId, { status: value });
      if (handleUnauthorizedResponse(result, context.navigateTo)) {
        return;
      }
      if (!result.ok) {
        showError(result.data?.error || t('general.error'));
        return;
      }
      invalidateAdminConcerns();
      showSuccess(t('admin.statusUpdated'));
    });
  });

  container.querySelectorAll('.concern-delete-button').forEach((button) => {
    button.addEventListener('click', () => {
      confirmDialog(t('admin.confirmation'), async () => {
        const result = await api.remove('/api/admin/concerns/' + button.dataset.id);
        if (handleUnauthorizedResponse(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        invalidateAdminConcerns();
        showSuccess(t('admin.deleted'));
        await renderConcernsAdmin(container, context);
      });
    });
  });
}

function sortConcerns(concerns, sortOrder) {
  const statusReihenfolge = { open: 0, in_progress: 1, done: 2 };
  const copy = [...concerns];

  copy.sort((left, right) => {
    switch (sortOrder) {
      case 'oldest':
        return new Date(left.createdAt || 0) - new Date(right.createdAt || 0);
      case 'status':
        return (statusReihenfolge[left.status] ?? 99) - (statusReihenfolge[right.status] ?? 99);
      case 'title-asc':
        return left.title.localeCompare(right.title, getLanguage());
      case 'title-desc':
        return right.title.localeCompare(left.title, getLanguage());
      case 'newest':
      default:
        return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
    }
  });

  return copy;
}
