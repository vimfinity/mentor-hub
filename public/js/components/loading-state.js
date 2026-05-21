/**
 * Route-Skeletons.
 *
 * Bilden die tatsächliche Layout-Struktur ab (statt generischer Blöcke) und
 * verwenden die echten Layout-Klassen (`.feed-toolbar`, `.feed-card`, ...),
 * sodass die Skelette exakt an die Stelle springen, an der später der Inhalt
 * erscheint — kein sichtbares Reflow beim Auflösen.
 */

function block(extraClasses = '', inlineStyle = '') {
  return `<div class="skelett-block ${extraClasses}"${inlineStyle ? ` style="${inlineStyle}"` : ''}></div>`;
}

function renderFeedCardSkeleton({ withImage = true } = {}) {
  return `
    <article class="feed-card skelett-karte" aria-hidden="true">
      ${withImage ? block('feed-card-image skelett-medienflaeche') : ''}
      <div class="feed-card-body">
        <div class="feed-card-meta" style="margin-bottom: 10px;">
          ${block('skelett-pill', 'width: 4rem;')}
          ${block('skelett-zeile', 'width: 3rem;')}
        </div>
        ${block('skelett-ueberschrift', 'margin-bottom: 10px;')}
        ${block('skelett-zeile', 'margin-bottom: 6px;')}
        ${block('skelett-zeile skelett-zeile-mittel')}
      </div>
    </article>
  `;
}

function renderFeedFeaturedSkeleton() {
  return `
    <article class="feed-featured skelett-karte" aria-hidden="true">
      ${block('skelett-featured-bild')}
      <div style="margin-top: var(--abstand-lg); display: flex; flex-direction: column; gap: 12px;">
        ${block('skelett-titel-gross')}
        ${block('skelett-zeile skelett-zeile-mittel')}
        ${block('skelett-zeile', 'width: 60%;')}
        <div style="display: inline-flex; gap: 12px; margin-top: 4px;">
          ${block('skelett-pill', 'width: 4rem;')}
          ${block('skelett-pill', 'width: 5rem;')}
        </div>
      </div>
    </article>
  `;
}

function renderFeedToolbarSkeleton() {
  return `
    <div class="feed-toolbar" aria-hidden="true">
      <div class="feed-category-tabs">
        ${block('skelett-pill skelett-pill-rechteckig', 'width: 3rem;')}
        ${block('skelett-pill skelett-pill-rechteckig', 'width: 4.5rem;')}
        ${block('skelett-pill skelett-pill-rechteckig', 'width: 4rem;')}
        ${block('skelett-pill skelett-pill-rechteckig', 'width: 5.5rem;')}
      </div>
      <div class="feed-toolbar-actions">
        ${block('skelett-pill skelett-pill-rechteckig', 'width: 7.5rem;')}
        <div style="display: inline-flex; gap: 2px;">
          ${block('skelett-pill skelett-pill-rechteckig', 'width: 32px; height: 32px;')}
          ${block('skelett-pill skelett-pill-rechteckig', 'width: 32px; height: 32px;')}
        </div>
      </div>
    </div>
  `;
}

function renderFeedSkeleton() {
  return `
    <div class="feed-page skelett-seite">
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
            ${block('skelett-ueberschrift', 'width: 12rem;')}
            ${block('skelett-zeile skelett-zeile-mittel')}
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
    <article class="feed-detail-page skelett-seite" aria-hidden="true">
      ${block('skelett-zeile', 'width: 8rem;')}
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: inline-flex; gap: 12px;">
          ${block('skelett-pill', 'width: 4rem;')}
          ${block('skelett-pill', 'width: 6rem;')}
        </div>
        ${block('skelett-titel-gross', 'height: 2.75rem; width: min(28rem, 90%);')}
        ${block('skelett-zeile skelett-zeile-mittel')}
      </div>
      ${block('', 'aspect-ratio: 16/7; width: 100%; max-height: 460px; border-radius: var(--radius-lg);')}
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${block('skelett-zeile')}
        ${block('skelett-zeile')}
        ${block('skelett-zeile skelett-zeile-mittel')}
        ${block('skelett-zeile')}
        ${block('skelett-zeile', 'width: 80%;')}
      </div>
    </article>
  `;
}

function renderTabelleSkeleton(rows = 6, cols = 4) {
  return `
    <div class="admin-panel admin-panel-tabelle skelett-tabelle" aria-hidden="true">
      <div class="listensteuerung">
        <div class="listensteuerung-kopf">
          ${block('skelett-zeile', 'width: 8rem; height: 0.625rem;')}
          ${block('skelett-pill skelett-pill-rechteckig', 'width: 11rem;')}
        </div>
      </div>
      <table class="tabelle">
        <thead>
          <tr>
            ${Array.from({ length: cols }).map(() => `
              <th>${block('skelett-zeile', 'width: 60%; height: 0.5rem;')}</th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          ${Array.from({ length: rows }).map(() => `
            <tr>
              ${Array.from({ length: cols }).map((_, columnIndex) => `
                <td>${block('skelett-zeile', `width: ${[80, 50, 40, 60][columnIndex] || 60}%;`)}</td>
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
    <div class="admin-shell skelett-seite" aria-hidden="true">
      <nav class="sub-nav">
        <div class="sub-nav-tabs">
          ${block('skelett-pill skelett-pill-rechteckig', 'width: 5rem; height: 32px;')}
          ${block('skelett-pill skelett-pill-rechteckig', 'width: 5.5rem; height: 32px;')}
          ${block('skelett-pill skelett-pill-rechteckig', 'width: 5rem; height: 32px;')}
        </div>
        ${block('skelett-pill skelett-pill-rechteckig', 'width: 6rem; height: 32px;')}
      </nav>
      <div class="admin-bereich">
        <div class="admin-bereich-kopf">
          <div class="admin-bereich-meta" style="display: flex; flex-direction: column; gap: 10px;">
            ${block('skelett-titel-gross', 'height: 2rem; width: 14rem;')}
            ${block('skelett-zeile', 'width: 22rem; max-width: 80%;')}
          </div>
          ${block('skelett-knopf')}
        </div>
        ${renderTabelleSkeleton(6, 4)}
      </div>
    </div>
  `;
}

function renderFeedbackSkeleton() {
  return `
    <div class="skelett-seite" aria-hidden="true">
      ${block('skelett-titel-gross', 'height: 1.75rem;')}
      <div class="umfrage-karte skelett-karte" style="margin-bottom: var(--abstand-md);">
        ${block('skelett-ueberschrift', 'width: 14rem; margin-bottom: 10px;')}
        ${block('skelett-zeile skelett-zeile-mittel', 'margin-bottom: var(--abstand-lg);')}
        <div style="display: flex; flex-direction: column; gap: 14px;">
          ${block('skelett-zeile', 'width: 50%;')}
          ${block('skelett-eingabe')}
          ${block('skelett-zeile', 'width: 40%;')}
          ${block('skelett-eingabe skelett-eingabe-gross')}
        </div>
        <div style="margin-top: var(--abstand-lg);">${block('skelett-knopf')}</div>
      </div>
      <div class="anliegen-sektion skelett-panel">
        ${block('skelett-ueberschrift', 'width: 11rem;')}
        ${block('skelett-zeile skelett-zeile-mittel')}
        ${block('skelett-eingabe')}
        ${block('skelett-eingabe skelett-eingabe-gross')}
        ${block('skelett-knopf')}
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
