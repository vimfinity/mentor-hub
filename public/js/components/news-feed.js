import * as api from '../services/api-client.js';
import { t } from '../services/i18n.js';
import { escapeHtml } from './modal.js';
import { icon } from './icons.js';

async function render(container) {
  const response = await api.get('/api/news');

  if (!response.ok || !response.data || response.data.length === 0) {
    container.innerHTML = `
      <div class="leer-zustand">
        <div class="leer-zustand-icon">${icon('newspaper', 48)}</div>
        <p class="leer-zustand-text">${t('news.empty')}</p>
      </div>
    `;
    return;
  }

  const html = `
    <h1 class="sektion-titel">${t('news.title')}</h1>
    <div class="news-liste">
      ${response.data.map((entry) => renderEntry(entry)).join('')}
    </div>
  `;

  container.innerHTML = html;
}

function renderEntry(entry) {
  const locale = document.documentElement.lang === 'de' ? 'de-DE' : 'en-US';
  const date = new Date(entry.createdAt).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return `
    <article class="news-eintrag">
      <time class="news-datum">${date}</time>
      <h2 class="news-titel">${escapeHtml(entry.title)}</h2>
      <p class="news-inhalt">${escapeHtml(entry.content)}</p>
    </article>
  `;
}

export { render };
