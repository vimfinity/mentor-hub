/**
 * Route-Skeletons.
 *
 * Mirrors the actual layout structure and uses the real layout classes
 * (`.feed-toolbar`, `.feed-card`, ...) so skeletons occupy the same slots as
 * the eventual content and avoid visible reflow when they resolve.
 */

function block(extraClasses = '', inlineStyle = '') {
  return `<div class="skeleton-block ${extraClasses}"${inlineStyle ? ` style="${inlineStyle}"` : ''}></div>`;
}

function renderFeedCardSkeleton({ withImage = true } = {}) {
  return `
    <article class="feed-card skeleton-card" aria-hidden="true">
      ${withImage ? block('feed-card-image skeleton-media-surface') : ''}
      <div class="feed-card-body">
        <div class="feed-card-meta" style="margin-bottom: 10px;">
          ${block('skeleton-pill', 'width: 4rem;')}
          ${block('skeleton-line', 'width: 3rem;')}
        </div>
        ${block('skeleton-heading', 'margin-bottom: 10px;')}
        ${block('skeleton-line', 'margin-bottom: 6px;')}
        ${block('skeleton-line skeleton-line-medium')}
      </div>
    </article>
  `;
}

function renderFeedFeaturedSkeleton() {
  return `
    <article class="feed-featured skeleton-card" aria-hidden="true">
      ${block('skeleton-featured-image')}
      <div style="margin-top: var(--space-lg); display: flex; flex-direction: column; gap: 12px;">
        ${block('skeleton-title-large')}
        ${block('skeleton-line skeleton-line-medium')}
        ${block('skeleton-line', 'width: 60%;')}
        <div style="display: inline-flex; gap: 12px; margin-top: 4px;">
          ${block('skeleton-pill', 'width: 4rem;')}
          ${block('skeleton-pill', 'width: 5rem;')}
        </div>
      </div>
    </article>
  `;
}

function renderFeedToolbarSkeleton() {
  return `
    <div class="feed-toolbar" aria-hidden="true">
      <div class="feed-category-tabs">
        ${block('skeleton-pill skeleton-pill-rectangular', 'width: 3rem;')}
        ${block('skeleton-pill skeleton-pill-rectangular', 'width: 4.5rem;')}
        ${block('skeleton-pill skeleton-pill-rectangular', 'width: 4rem;')}
        ${block('skeleton-pill skeleton-pill-rectangular', 'width: 5.5rem;')}
      </div>
      <div class="feed-toolbar-actions">
        ${block('skeleton-pill skeleton-pill-rectangular', 'width: 7.5rem;')}
        <div style="display: inline-flex; gap: 2px;">
          ${block('skeleton-pill skeleton-pill-rectangular', 'width: 32px; height: 32px;')}
          ${block('skeleton-pill skeleton-pill-rectangular', 'width: 32px; height: 32px;')}
        </div>
      </div>
    </div>
  `;
}

function renderFeedSkeleton() {
  return `
    <div class="feed-page skeleton-page">
      ${renderFeedToolbarSkeleton()}
      <section class="feed-highlights" aria-hidden="true">
        ${renderFeedFeaturedSkeleton()}
        <div class="feed-highlight-grid">
          ${renderFeedCardSkeleton()}
          ${renderFeedCardSkeleton()}
          ${renderFeedCardSkeleton()}
        </div>
      </section>
      <section class="feed-section" aria-hidden="true">
        <div class="feed-section-header">
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${block('skeleton-heading', 'width: 12rem;')}
            ${block('skeleton-line skeleton-line-medium')}
          </div>
        </div>
        <div class="feed-grid">
          ${renderFeedCardSkeleton()}
          ${renderFeedCardSkeleton()}
          ${renderFeedCardSkeleton()}
          ${renderFeedCardSkeleton()}
        </div>
      </section>
    </div>
  `;
}

function renderFeedDetailSkeleton() {
  return `
    <article class="feed-detail-page skeleton-page" aria-hidden="true">
      ${block('skeleton-line', 'width: 8rem;')}
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: inline-flex; gap: 12px;">
          ${block('skeleton-pill', 'width: 4rem;')}
          ${block('skeleton-pill', 'width: 6rem;')}
        </div>
        ${block('skeleton-title-large', 'height: 2.75rem; width: min(28rem, 90%);')}
        ${block('skeleton-line skeleton-line-medium')}
      </div>
      ${block('', 'aspect-ratio: 16/7; width: 100%; max-height: 460px; border-radius: var(--radius-lg);')}
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${block('skeleton-line')}
        ${block('skeleton-line')}
        ${block('skeleton-line skeleton-line-medium')}
        ${block('skeleton-line')}
        ${block('skeleton-line', 'width: 80%;')}
      </div>
    </article>
  `;
}

function renderTabelleSkeleton(rows = 6, cols = 4) {
  return `
    <div class="admin-panel admin-panel-table skeleton-table" aria-hidden="true">
      <div class="list-controls">
        <div class="list-controls-header">
          ${block('skeleton-line', 'width: 8rem; height: 0.625rem;')}
          ${block('skeleton-pill skeleton-pill-rectangular', 'width: 11rem;')}
        </div>
      </div>
      <table class="table">
        <thead>
          <tr>
            ${Array.from({ length: cols }).map(() => `
              <th>${block('skeleton-line', 'width: 60%; height: 0.5rem;')}</th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          ${Array.from({ length: rows }).map(() => `
            <tr>
              ${Array.from({ length: cols }).map((_, columnIndex) => `
                <td>${block('skeleton-line', `width: ${[80, 50, 40, 60][columnIndex] || 60}%;`)}</td>
              `).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderAdminSkeleton() {
  return `
    <div class="admin-shell skeleton-page" aria-hidden="true">
      <nav class="sub-nav">
        <div class="sub-nav-tabs">
          ${block('skeleton-pill skeleton-pill-rectangular', 'width: 5rem; height: 32px;')}
          ${block('skeleton-pill skeleton-pill-rectangular', 'width: 5.5rem; height: 32px;')}
          ${block('skeleton-pill skeleton-pill-rectangular', 'width: 5rem; height: 32px;')}
        </div>
        ${block('skeleton-pill skeleton-pill-rectangular', 'width: 6rem; height: 32px;')}
      </nav>
      <div class="admin-section">
        <div class="admin-section-header">
          <div class="admin-section-meta" style="display: flex; flex-direction: column; gap: 10px;">
            ${block('skeleton-title-large', 'height: 2rem; width: 14rem;')}
            ${block('skeleton-line', 'width: 22rem; max-width: 80%;')}
          </div>
          ${block('skeleton-button')}
        </div>
        ${renderTabelleSkeleton(6, 4)}
      </div>
    </div>
  `;
}

function renderFeedbackSkeleton() {
  return `
    <div class="skeleton-page" aria-hidden="true">
      ${block('skeleton-title-large', 'height: 1.75rem;')}
      <div class="survey-card skeleton-card" style="margin-bottom: var(--space-md);">
        ${block('skeleton-heading', 'width: 14rem; margin-bottom: 10px;')}
        ${block('skeleton-line skeleton-line-medium', 'margin-bottom: var(--space-lg);')}
        <div style="display: flex; flex-direction: column; gap: 14px;">
          ${block('skeleton-line', 'width: 50%;')}
          ${block('skeleton-input')}
          ${block('skeleton-line', 'width: 40%;')}
          ${block('skeleton-input skeleton-input-large')}
        </div>
        <div style="margin-top: var(--space-lg);">${block('skeleton-button')}</div>
      </div>
      <div class="concern-section skeleton-panel">
        ${block('skeleton-heading', 'width: 11rem;')}
        ${block('skeleton-line skeleton-line-medium')}
        ${block('skeleton-input')}
        ${block('skeleton-input skeleton-input-large')}
        ${block('skeleton-button')}
      </div>
    </div>
  `;
}

function renderRouteSkeleton(variant) {
  switch (variant) {
    case 'feedback':
      return renderFeedbackSkeleton();
    case 'admin':
      return renderAdminSkeleton();
    case 'feed-detail':
      return renderFeedDetailSkeleton();
    case 'feed':
    default:
      return renderFeedSkeleton();
  }
}

export { renderRouteSkeleton };
