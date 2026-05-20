function renderSkeletonBlock(classes) {
  return `<div class="skelett-block ${classes}"></div>`;
}

function renderListSkeleton(count, itemClass) {
  return Array.from({ length: count }).map(() => `
    <div class="${itemClass}">
      ${renderSkeletonBlock('skelett-zeile skelett-zeile-kurz')}
      ${renderSkeletonBlock('skelett-zeile skelett-zeile-mittel')}
      ${renderSkeletonBlock('skelett-zeile')}
    </div>
  `).join('');
}

function renderRouteSkeleton(variant) {
  switch (variant) {
    case 'resources':
      return `
        <div class="skelett-seite">
          ${renderSkeletonBlock('skelett-ueberschrift')}
          <div class="filter-leiste">
            ${Array.from({ length: 5 }).map(() => renderSkeletonBlock('skelett-pill')).join('')}
          </div>
          <div class="karten-grid">
            ${renderListSkeleton(6, 'karte skelett-karte')}
          </div>
        </div>
      `;
    case 'feedback':
      return `
        <div class="skelett-seite">
          ${renderSkeletonBlock('skelett-ueberschrift')}
          <div class="umfragen-container">
            ${renderListSkeleton(2, 'umfrage-karte skelett-karte')}
          </div>
          <div class="anliegen-sektion skelett-panel">
            ${renderSkeletonBlock('skelett-zeile skelett-zeile-kurz')}
            ${renderSkeletonBlock('skelett-zeile')}
            ${renderSkeletonBlock('skelett-eingabe')}
            ${renderSkeletonBlock('skelett-eingabe skelett-eingabe-gross')}
            ${renderSkeletonBlock('skelett-button')}
          </div>
        </div>
      `;
    case 'admin':
      return `
        <div class="admin-layout admin-layout-laden">
          <aside class="admin-sidebar admin-panel">
            ${Array.from({ length: 5 }).map(() => renderSkeletonBlock('skelett-button skelett-button-breit')).join('')}
          </aside>
          <div class="admin-inhalt admin-panel">
            ${renderSkeletonBlock('skelett-ueberschrift')}
            <div class="skelett-tabelle">
              ${Array.from({ length: 5 }).map(() => renderSkeletonBlock('skelett-zeile')).join('')}
            </div>
          </div>
        </div>
      `;
    case 'feed':
      return `
        <div class="skelett-seite">
          ${renderSkeletonBlock('skelett-ueberschrift')}
          ${renderSkeletonBlock('skelett-zeile skelett-zeile-mittel')}
          <div class="feed-filter-bar" style="margin-top: 1.5rem">
            ${Array.from({ length: 4 }).map(() => renderSkeletonBlock('skelett-pill')).join('')}
          </div>
          <div class="feed-grid" style="margin-top: 1.5rem">
            ${renderListSkeleton(3, 'feed-card skelett-karte')}
          </div>
        </div>
      `;
    case 'news':
    default:
      return `
        <div class="skelett-seite">
          ${renderSkeletonBlock('skelett-ueberschrift')}
          <div class="news-liste">
            ${renderListSkeleton(4, 'news-eintrag skelett-karte')}
          </div>
        </div>
      `;
  }
}

export { renderRouteSkeleton };