import * as api from '../../services/api-client.js';
import { fetchQuery } from '../../services/query-cache.js';
import { t, getLanguage } from '../../services/i18n.js';
import { normalizeSelection, paginateItems } from '../../services/view-state.js';
import { showError, showSuccess } from '../../components/toast.js';
import { escapeHtml, openModal, confirmDialog } from '../../components/modal.js';
import { renderAdminSection, renderAdminPanel, renderAdminEmptyState } from '../../components/admin-ui.js';
import { renderListControls, bindListControls } from '../../components/list-controls.js';
import { icon } from '../../components/icons.js';
import { renderSelect, bindSelect } from '../../components/select.js';
import { mountMarkdownEditor } from '../../components/markdown-editor.js';
import { renderResponsiveImage } from '../../components/responsive-image.js';
import {
  FEED_ADMIN_CACHE_KEY,
  ITEMS_PER_ADMIN_PAGE,
  CONTENT_LOCALES,
  FEED_KIND_OPTIONS,
  FEED_SUBTYPES_BY_KIND,
  getFeedKindLabel,
  getFeedTypeLabels,
  getLocalizedField,
  renderLocalizedInput,
  readLocalizedField,
  hasAnyLocalizedText,
  formatDateTime,
  formatDateTimeInput,
  parseDateTimeInput,
  formatBytes,
  readFileAsBase64,
  invalidateAdminFeed,
  handleUnauthorizedResponse
} from './shared.js';

export async function renderFeedAdmin(container, context) {
  const response = await fetchQuery({
    key: [FEED_ADMIN_CACHE_KEY, getLanguage()],
    ttlMs: 30 * 1000,
    fetchFunction: () => api.get('/api/feed')
  });

  if (handleUnauthorizedResponse(response, context.navigateTo)) {
    return;
  }

  if (!response.ok) {
    showError(t('general.error'));
    return;
  }

  const feedItems = Array.isArray(response.data) ? response.data : [];
  const kindFilter = normalizeSelection(context.searchParams?.get('kind'), ['all', ...FEED_KIND_OPTIONS], 'all');
  const filteredItems = kindFilter === 'all' ? feedItems : feedItems.filter((item) => item.kind === kindFilter);
  const sortOrder = normalizeSelection(context.searchParams?.get('sort'), ['newest', 'oldest', 'title-asc', 'title-desc'], 'newest');
  const sortedItems = sortFeedItems(filteredItems, sortOrder);
  const pagination = paginateItems(sortedItems, context.searchParams?.get('page'), ITEMS_PER_ADMIN_PAGE);

  const TYPE_LABELS = getFeedTypeLabels();

  const tablenHtml = feedItems.length === 0 ? renderAdminEmptyState(t('feed.emptyTitle'), 'newspaper') : renderAdminPanel(`
    ${renderListControls({
      sortOptions: [
        { value: 'newest', label: t('general.sortNewest') },
        { value: 'oldest', label: t('general.sortOldest') },
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
          <th>${t('admin.feedKind')}</th>
          <th>${t('admin.category')}</th>
          <th>${t('admin.date')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${pagination.items.map((item) => `
          <tr>
            <td data-label="${escapeHtml(t('admin.title'))}">
              ${escapeHtml(item.title)}
              ${item.featured ? `<span class="status-badge status-open">${t('admin.featured')}</span>` : ''}
            </td>
            <td data-label="${escapeHtml(t('admin.feedKind'))}"><span class="status-badge">${getFeedKindLabel(item.kind)}</span></td>
            <td data-label="${escapeHtml(t('admin.category'))}"><span class="card-category">${TYPE_LABELS[item.type] || item.type}</span></td>
            <td data-label="${escapeHtml(t('admin.date'))}">${formatDateTime(item.createdAt)}</td>
            <td class="table-aktionen" data-label="${escapeHtml(t('general.actions'))}">
              ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="btn btn-small btn-secondary">${icon('externalLink', 14)}</a>` : ''}
              <button class="btn btn-small btn-secondary feed-edit-button" data-id="${item.id}">
                ${icon('edit', 16)}
              </button>
              <button class="btn btn-small btn-danger feed-delete-button" data-id="${item.id}" data-source="${item.feedSource || item.source}">
                ${icon('trash', 16)}
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `, 'admin-panel-table');

  const filterChips = `
    <div class="feed-filter-bar" style="margin-bottom: 0;">
      ${['all', ...FEED_KIND_OPTIONS]
        .filter((f) => f === 'all' || feedItems.some((item) => item.kind === f))
        .map((f) => `
          <button class="feed-filter-chip ${f === kindFilter ? 'active' : ''}" data-kind-filter="${f}">
            ${f === 'all' ? t('feed.filter_all') : getFeedKindLabel(f)}
          </button>
        `).join('')}
    </div>
  `;

  container.innerHTML = renderAdminSection({
    title: t('admin.feed'),
    description: t('admin.feedDescription'),
    iconName: 'newspaper',
    actions: `<button class="btn btn-primary" id="create-feed-button">${icon('plus', 14)} ${t('admin.create')}</button>`,
    content: filterChips + tablenHtml
  });

  bindListControls(container, {
    onSort: (value) => context.setSearchParams?.({ sort: value === 'newest' ? null : value, page: null }),
    onPage: (page) => context.setSearchParams?.({ page: page <= 1 ? null : page })
  });

  container.querySelectorAll('[data-kind-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      context.setSearchParams?.({ kind: btn.dataset.kindFilter === 'all' ? null : btn.dataset.kindFilter, page: null });
    });
  });

  container.querySelector('#create-feed-button').addEventListener('click', () => {
    openFeedForm({ context, mode: 'create' });
  });

  container.querySelectorAll('.feed-edit-button').forEach((button) => {
    button.addEventListener('click', () => {
      const item = feedItems.find((feedItem) => feedItem.id === button.dataset.id);
      if (!item) {
        return;
      }

      openFeedForm({ context, mode: 'edit', item });
    });
  });

  container.querySelectorAll('.feed-delete-button').forEach((button) => {
    button.addEventListener('click', () => {
      confirmDialog(t('admin.confirmation'), async () => {
        const source = button.dataset.source;
        const endpoint = source === 'resource'
          ? '/api/admin/resources/' + button.dataset.id
          : '/api/admin/news/' + button.dataset.id;
        const result = await api.remove(endpoint);
        if (handleUnauthorizedResponse(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        invalidateAdminFeed();
        showSuccess(t('admin.deleted'));
        context.navigateTo('/admin/feed', { force: true });
      });
    });
  });
}

function openFeedForm({ context, mode, item = null }) {
  const isEdit = mode === 'edit';
  const typeLabels = getFeedTypeLabels();
  const editors = {};
  const selectedKind = FEED_KIND_OPTIONS.includes(item?.kind) ? item.kind : 'update';
  const selectedType = item?.subtype || item?.type || FEED_SUBTYPES_BY_KIND[selectedKind][0];
  const titleValue = {
    'de-DE': getLocalizedField(item, 'title', 'de-DE'),
    'en-US': getLocalizedField(item, 'title', 'en-US')
  };
  const urlValue = escapeHtml(item?.url || '');
  const summaryValue = {
    'de-DE': getLocalizedField(item, 'summary', 'de-DE') || getLocalizedField(item, 'content', 'de-DE') || getLocalizedField(item, 'description', 'de-DE'),
    'en-US': getLocalizedField(item, 'summary', 'en-US') || getLocalizedField(item, 'content', 'en-US') || getLocalizedField(item, 'description', 'en-US')
  };
  const contentValue = {
    'de-DE': getLocalizedField(item, 'detailContent', 'de-DE') || getLocalizedField(item, 'content', 'de-DE') || getLocalizedField(item, 'description', 'de-DE'),
    'en-US': getLocalizedField(item, 'detailContent', 'en-US') || getLocalizedField(item, 'content', 'en-US') || getLocalizedField(item, 'description', 'en-US')
  };
  const imageValue = escapeHtml(item?.imageUrl || '');
  const sourceValue = escapeHtml(item?.source || '');
  const tagValue = escapeHtml(Array.isArray(item?.tags) ? item.tags.join(', ') : '');
  const createdAtValue = escapeHtml(formatDateTimeInput(item?.createdAt));
  const isResourceEdit = isEdit && (item?.feedSource === 'resource' || selectedKind !== 'update');
  let selectedImage = item?.image?.url === item?.imageUrl ? item?.image : null;

  const kindSelectOptions = FEED_KIND_OPTIONS.map((value) => ({
    value,
    label: getFeedKindLabel(value)
  }));

  openModal({
    size: 'wide',
    persistent: true,
    title: (isEdit ? t('admin.edit') : t('admin.create')) + ': ' + t('admin.feed'),
    content: `
      <div class="feed-form-layout">
        <aside class="feed-form-side">
          ${renderLocalizedInput({ idBase: 'feed-form-title', label: t('admin.title'), value: titleValue, required: true })}
          <div class="feed-form-row">
            <div class="form-group">
              <label class="form-label">${t('admin.feedKind')}</label>
              ${renderSelect({
                name: 'feed-form-kind',
                value: selectedKind,
                options: kindSelectOptions,
                disabled: isEdit,
                ariaLabel: t('admin.feedKind')
              })}
            </div>
            <div class="form-group">
              <label class="form-label">${t('admin.category')}</label>
              <div id="feed-form-subtype-host"></div>
            </div>
          </div>
          ${renderLocalizedInput({ idBase: 'feed-form-summary', label: t('admin.summary'), value: summaryValue, textarea: true, rows: 3, maxlength: 1000, placeholder: 'Kurze Description, erscheint auf der card im Feed' })}
          <div class="form-group">
            <label class="form-label" for="feed-form-image">${t('admin.imageUrl')}</label>
            <input type="url" class="form-input" id="feed-form-image" maxlength="2000" placeholder="https://..." value="${imageValue}">
            <div class="feed-image-actions">
              <button type="button" class="tab-link tab-link-utility" data-open-media-library>
                ${icon('image', 14)}
                <span class="tab-label">Mediathek</span>
              </button>
              <button type="button" class="tab-link tab-link-utility" data-clear-image>
                ${icon('x', 14)}
                <span class="tab-label">Remove image</span>
              </button>
            </div>
            <label class="attachment-file-picker feed-image-picker">
              <input type="file" data-image-file accept=".png,.jpg,.jpeg,.webp,.gif">
              <span>${icon('image', 14)} Upload image</span>
              <em data-image-file-name>PNG, JPG, WebP oder GIF</em>
            </label>
          </div>
          <div class="form-group">
            <label class="form-label" for="feed-form-url">${t('admin.url')}</label>
            <input type="url" class="form-input" id="feed-form-url" maxlength="2000" placeholder="https://..." value="${urlValue}">
          </div>
          <div class="feed-form-row">
            <div class="form-group">
              <label class="form-label" for="feed-form-source">${t('admin.source')}</label>
              <input type="text" class="form-input" id="feed-form-source" maxlength="100" value="${sourceValue}">
            </div>
            <div class="form-group">
              <label class="form-label" for="feed-form-date">${t('admin.date')}</label>
              <input type="datetime-local" class="form-input" id="feed-form-date" value="${createdAtValue}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="feed-form-tags">${t('admin.tags')}</label>
            <input type="text" class="form-input" id="feed-form-tags" placeholder="mcp, codex" value="${tagValue}">
          </div>
          <label class="checkbox-label">
            <input type="checkbox" id="feed-form-featured" ${item?.featured ? 'checked' : ''}>
            <span>${t('admin.featured')}</span>
          </label>
          ${isResourceEdit ? `
            <div class="feed-form-attachments">
              <div class="feed-form-attachments-header">
                <label class="form-label">Attachments</label>
                <span>Files that appear as downloads on the article.</span>
              </div>
              <div class="feed-form-attachment-list" data-attachment-list></div>
              <div class="feed-form-attachment-upload">
                <label class="attachment-file-picker">
                  <input type="file" data-attachment-file accept=".zip,.pdf,.docx,.xlsx,.pptx,.txt,.md,.json,.png,.jpg,.jpeg,.webp">
                  <span>${icon('fileText', 14)} Select file</span>
                  <em data-attachment-file-name>No file selected</em>
                </label>
                <input type="text" class="form-input" data-attachment-label maxlength="120" placeholder="Display name, optional">
                <button type="button" class="btn btn-secondary" data-attachment-upload>
                  ${icon('plus', 14)}
                  <span>Upload attachment</span>
                </button>
              </div>
            </div>
          ` : ''}
          <div class="feed-form-card-preview">
            <div class="feed-form-card-preview-label">${t('admin.preview') || 'cards-Vorschau'}</div>
            <div class="feed-admin-preview" id="feed-form-preview"></div>
          </div>
        </aside>
        <section class="feed-form-main">
          <div class="form-group form-group-full">
            <label class="form-label feed-form-editor-label">
              ${t('admin.detailContent')}
              <span class="feed-form-editor-sub">${t('admin.detailContentPlaceholder')}</span>
            </label>
            <div class="feed-form-row">
              <div class="form-group form-group-full">
                <label class="form-label">DE</label>
                <div id="feed-form-content-host-de-DE" class="feed-form-editor-host"></div>
              </div>
              <div class="form-group form-group-full">
                <label class="form-label">EN</label>
                <div id="feed-form-content-host-en-US" class="feed-form-editor-host"></div>
              </div>
            </div>
          </div>
        </section>
      </div>
    `,
    confirmText: t('admin.save'),
    cancelText: t('admin.cancel'),
    onConfirm: async (overlay) => {
      const title = readLocalizedField(overlay, 'feed-form-title');
      if (!hasAnyLocalizedText(title)) {
        return;
      }

      const kind = overlay.querySelector('[data-select="feed-form-kind"]').dataset.value;
      const subtype = overlay.querySelector('[data-select="feed-form-subtype"]').dataset.value;
      const url = overlay.querySelector('#feed-form-url').value.trim();
      const summary = readLocalizedField(overlay, 'feed-form-summary');
      const content = {
        'de-DE': (editors['de-DE']?.getValue() || '').trim(),
        'en-US': (editors['en-US']?.getValue() || '').trim()
      };
      const imageUrl = overlay.querySelector('#feed-form-image').value.trim();
      const source = overlay.querySelector('#feed-form-source').value.trim();
      const createdAt = parseDateTimeInput(overlay.querySelector('#feed-form-date').value);
      if (!createdAt) {
        showError('Enter a valid date.');
        return;
      }
      const tags = overlay.querySelector('#feed-form-tags').value.split(',').map((tag) => tag.trim()).filter(Boolean);
      const featured = overlay.querySelector('#feed-form-featured').checked;
      const payload = kind === 'update'
        ? { title, content: summary, detailContent: content, summary, url, imageUrl, source, tags, type: subtype, subtype, featured, createdAt }
        : { title, description: summary, detailContent: content, summary, url, imageUrl, source, tags, kind, category: subtype, subtype, featured, createdAt };
      const endpoint = isEdit
        ? ((item.feedSource || item.source) === 'resource' ? '/api/admin/resources/' : '/api/admin/news/') + item.id
        : kind === 'update'
          ? '/api/admin/news'
          : '/api/admin/resources';
      const result = isEdit
        ? await api.put(endpoint, payload)
        : await api.post(endpoint, payload);

      if (handleUnauthorizedResponse(result, context.navigateTo)) {
        return;
      }
      if (!result.ok) {
        showError(result.data?.error || t('general.error'));
        return;
      }

      invalidateAdminFeed();
      showSuccess(isEdit ? t('admin.feedUpdated') : t('admin.feedCreated'));
      context.navigateTo('/admin/feed', { force: true });
    }
  });

  const overlay = document.querySelector('.modal-overlay:last-child');
  const kindSelect = overlay.querySelector('[data-select="feed-form-kind"]');
  const subtypeHost = overlay.querySelector('#feed-form-subtype-host');
  const preview = overlay.querySelector('#feed-form-preview');
  let currentAttachments = Array.isArray(item?.attachments) ? [...item.attachments] : [];

  const refreshPreview = () => {
    const imageUrl = overlay.querySelector('#feed-form-image').value.trim();
    const activeLocale = getLanguage() === 'de' ? 'de-DE' : 'en-US';
    const title = readLocalizedField(overlay, 'feed-form-title')[activeLocale] || readLocalizedField(overlay, 'feed-form-title')['de-DE'] || readLocalizedField(overlay, 'feed-form-title')['en-US'];
    const summary = readLocalizedField(overlay, 'feed-form-summary')[activeLocale] || readLocalizedField(overlay, 'feed-form-summary')['de-DE'] || readLocalizedField(overlay, 'feed-form-summary')['en-US'];
    const subtypeRoot = subtypeHost.querySelector('[data-select="feed-form-subtype"]');
    const subtypeValue = subtypeRoot ? subtypeRoot.dataset.value : '';
    preview.innerHTML = `
      ${imageUrl ? renderResponsiveImage({
        image: selectedImage?.url === imageUrl ? selectedImage : null,
        src: imageUrl,
        alt: '',
        sizes: '96px',
        includeDimensions: false
      }) : `<div class="feed-admin-preview-placeholder">${icon('image', 22)}</div>`}
      <div>
        <strong>${escapeHtml(title || t('admin.title'))}</strong>
        <span>${getFeedKindLabel(kindSelect.dataset.value)} - ${typeLabels[subtypeValue] || subtypeValue}</span>
        ${summary ? `<p>${escapeHtml(summary)}</p>` : ''}
      </div>
    `;
  };

  const renderSubtypeSelect = () => {
    const kind = kindSelect.dataset.value;
    const allowed = FEED_SUBTYPES_BY_KIND[kind] || FEED_SUBTYPES_BY_KIND.update;
    const previousRoot = subtypeHost.querySelector('[data-select="feed-form-subtype"]');
    const previousValue = previousRoot ? previousRoot.dataset.value : selectedType;
    const nextSubtype = allowed.includes(previousValue)
      ? previousValue
      : allowed.includes(selectedType)
        ? selectedType
        : allowed[0];
    subtypeHost.innerHTML = renderSelect({
      name: 'feed-form-subtype',
      value: nextSubtype,
      options: allowed.map((value) => ({ value, label: typeLabels[value] || value })),
      ariaLabel: t('admin.category')
    });
    const subtypeRoot = subtypeHost.querySelector('[data-select="feed-form-subtype"]');
    bindSelect(subtypeRoot, () => refreshPreview());
    refreshPreview();
  };

  bindSelect(kindSelect, () => renderSubtypeSelect());
  ['feed-form-title-de-DE', 'feed-form-title-en-US', 'feed-form-summary-de-DE', 'feed-form-summary-en-US', 'feed-form-image'].forEach((id) => {
    overlay.querySelector('#' + id)?.addEventListener('input', refreshPreview);
  });
  renderSubtypeSelect();

  const imageFileInput = overlay.querySelector('[data-image-file]');
  const imageFileName = overlay.querySelector('[data-image-file-name]');
  if (imageFileInput && imageFileName) {
    imageFileInput.addEventListener('change', async () => {
      const file = imageFileInput.files?.[0];
      if (!file) {
        imageFileName.textContent = 'PNG, JPG, WebP oder GIF';
        return;
      }

      imageFileName.textContent = file.name;
      try {
        const contentBase64 = await readFileAsBase64(file);
        const result = await api.post('/api/admin/uploads/images', {
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          contentBase64
        });

        if (handleUnauthorizedResponse(result, context.navigateTo)) {
          return;
        }
        if (!result.ok || !result.data?.url) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        const imageInput = overlay.querySelector('#feed-form-image');
        imageInput.value = result.data.url;
        selectedImage = result.data;
        refreshPreview();
        showSuccess('Image uploaded');
      } finally {
        imageFileInput.value = '';
      }
    });
  }

  const mediaButton = overlay.querySelector('[data-open-media-library]');
  if (mediaButton) {
    mediaButton.addEventListener('click', () => openMediaLibrary({
      context,
      selectedUrl: overlay.querySelector('#feed-form-image').value.trim(),
      onSelect: (url, image) => {
        overlay.querySelector('#feed-form-image').value = url;
        selectedImage = image || null;
        refreshPreview();
      }
    }));
  }

  const clearImageButton = overlay.querySelector('[data-clear-image]');
  if (clearImageButton) {
    clearImageButton.addEventListener('click', () => {
      overlay.querySelector('#feed-form-image').value = '';
      selectedImage = null;
      refreshPreview();
    });
  }

  const attachmentList = overlay.querySelector('[data-attachment-list]');
  const renderAttachments = () => {
    if (!attachmentList) {
      return;
    }

    attachmentList.innerHTML = currentAttachments.length === 0
      ? '<p class="feed-form-attachment-empty">No attachments yet.</p>'
      : currentAttachments.map((attachment) => `
        <div class="feed-form-attachment-row">
          <div>
            <strong>${escapeHtml(attachment.label || attachment.originalName || attachment.filename || 'Download')}</strong>
            <span>${escapeHtml(attachment.originalName || attachment.filename || '')}${attachment.sizeBytes ? ' · ' + escapeHtml(formatBytes(attachment.sizeBytes)) : ''}</span>
          </div>
          <button type="button" class="icon-button" data-attachment-delete="${escapeHtml(attachment.id)}" aria-label="Delete attachment">
            ${icon('trash', 15)}
          </button>
        </div>
      `).join('');

    attachmentList.querySelectorAll('[data-attachment-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const result = await api.remove('/api/admin/resources/' + encodeURIComponent(item.id) + '/attachments/' + encodeURIComponent(button.dataset.attachmentDelete));
        if (handleUnauthorizedResponse(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        currentAttachments = Array.isArray(result.data?.attachments) ? result.data.attachments : [];
        item.attachments = currentAttachments;
        invalidateAdminFeed();
        renderAttachments();
        showSuccess('Attachment deleted');
      });
    });
  };

  renderAttachments();

  const uploadButton = overlay.querySelector('[data-attachment-upload]');
  if (uploadButton) {
    const fileInput = overlay.querySelector('[data-attachment-file]');
    const fileNameLabel = overlay.querySelector('[data-attachment-file-name]');
    if (fileInput && fileNameLabel) {
      fileInput.addEventListener('change', () => {
        fileNameLabel.textContent = fileInput.files?.[0]?.name || 'No file selected';
      });
    }

    uploadButton.addEventListener('click', async () => {
      const labelInput = overlay.querySelector('[data-attachment-label]');
      const file = fileInput?.files?.[0];
      if (!file) {
        showError('Select a file first.');
        return;
      }

      uploadButton.disabled = true;
      try {
        const contentBase64 = await readFileAsBase64(file);
        const result = await api.post('/api/admin/resources/' + encodeURIComponent(item.id) + '/attachments', {
          filename: file.name,
          label: labelInput.value.trim(),
          mimeType: file.type || 'application/octet-stream',
          contentBase64
        });

        if (handleUnauthorizedResponse(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }

        currentAttachments = Array.isArray(result.data?.attachments) ? result.data.attachments : [];
        item.attachments = currentAttachments;
        fileInput.value = '';
        fileNameLabel.textContent = 'No file selected';
        labelInput.value = '';
        invalidateAdminFeed();
        renderAttachments();
        showSuccess('Attachment uploaded');
      } finally {
        uploadButton.disabled = false;
      }
    });
  }

  CONTENT_LOCALES.forEach((locale) => {
    const editorHost = overlay.querySelector('#feed-form-content-host-' + locale);
    if (editorHost) {
      editors[locale] = mountMarkdownEditor(editorHost, {
        value: contentValue[locale] || '',
        placeholder: t('admin.detailContentPlaceholder')
      });
    }
  });
}

async function openMediaLibrary({ context, selectedUrl, onSelect }) {
  const response = await api.get('/api/admin/media/images');
  if (handleUnauthorizedResponse(response, context.navigateTo)) {
    return;
  }
  if (!response.ok) {
    showError(response.data?.error || t('general.error'));
    return;
  }

  let images = Array.isArray(response.data) ? response.data : [];
  const overlay = openModal({
    title: 'Mediathek',
    size: 'wide',
    content: `
      <div class="media-library">
        <div class="media-library-toolbar">
          <p>Select an existing image or remove unused files.</p>
          <button type="button" class="btn btn-secondary" data-media-cleanup>
            ${icon('trash', 14)}
            <span>Remove unused images</span>
          </button>
        </div>
        <div class="media-library-grid" data-media-grid></div>
      </div>
    `,
    cancelText: t('admin.cancel')
  });

  const grid = overlay.querySelector('[data-media-grid]');
  const renderGrid = () => {
    grid.innerHTML = images.length === 0
      ? '<p class="feed-form-attachment-empty">No images uploaded yet.</p>'
      : images.map((image) => `
        <article class="media-library-item ${image.url === selectedUrl ? 'active' : ''}">
          <button type="button" class="media-library-select" data-media-select="${escapeHtml(image.url)}">
            ${renderResponsiveImage({
              image,
              src: image.url,
              alt: '',
              sizes: '(max-width: 680px) calc(100vw - 48px), 180px',
              includeDimensions: false
            })}
          </button>
          <div class="media-library-meta">
            <strong>${escapeHtml(image.originalName || image.filename)}</strong>
            <span>${escapeHtml(formatBytes(image.sizeBytes))} · ${image.usageCount || 0} Verwendung${image.usageCount === 1 ? '' : 'en'}</span>
          </div>
          <button type="button" class="tab-link tab-link-utility tab-link-icon" data-media-delete="${escapeHtml(image.id)}" title="Delete image" aria-label="Delete image" ${image.usageCount > 0 ? 'disabled' : ''}>
            <span class="tab-icon">${icon('trash', 14)}</span>
          </button>
        </article>
      `).join('');

    grid.querySelectorAll('[data-media-select]').forEach((button) => {
      button.addEventListener('click', () => {
        const image = images.find((entry) => entry.url === button.dataset.mediaSelect) || null;
        onSelect(button.dataset.mediaSelect, image);
        overlay.querySelector('.modal-cancel')?.click();
      });
    });

    grid.querySelectorAll('[data-media-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const result = await api.remove('/api/admin/media/images/' + encodeURIComponent(button.dataset.mediaDelete));
        if (handleUnauthorizedResponse(result, context.navigateTo)) {
          return;
        }
        if (!result.ok) {
          showError(result.data?.error || t('general.error'));
          return;
        }
        images = images.filter((image) => image.id !== button.dataset.mediaDelete);
        renderGrid();
        showSuccess('Image deleted');
      });
    });
  };

  overlay.querySelector('[data-media-cleanup]').addEventListener('click', async () => {
    const result = await api.post('/api/admin/media/images/cleanup', {});
    if (handleUnauthorizedResponse(result, context.navigateTo)) {
      return;
    }
    if (!result.ok) {
      showError(result.data?.error || t('general.error'));
      return;
    }
    const refreshed = await api.get('/api/admin/media/images');
    images = refreshed.ok && Array.isArray(refreshed.data) ? refreshed.data : images;
    renderGrid();
    showSuccess(`${result.data?.removed || 0} images removed`);
  });

  renderGrid();
}

function sortFeedItems(items, sortOrder) {
  const copy = [...items];

  copy.sort((left, right) => {
    switch (sortOrder) {
      case 'oldest':
        return compareFeedDate(left, right, 'asc');
      case 'title-asc':
        return left.title.localeCompare(right.title, getLanguage());
      case 'title-desc':
        return right.title.localeCompare(left.title, getLanguage());
      case 'newest':
      default:
        return compareFeedDate(left, right, 'desc');
    }
  });

  return copy;
}

function compareFeedDate(left, right, direction) {
  const leftDate = new Date(left.createdAt || 0).getTime();
  const rightDate = new Date(right.createdAt || 0).getTime();
  const dateResult = direction === 'asc'
    ? leftDate - rightDate
    : rightDate - leftDate;

  if (dateResult !== 0) {
    return dateResult;
  }

  return String(left.id || '').localeCompare(String(right.id || ''));
}
