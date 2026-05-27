import { mountRichDocument } from '../services/rich-content.js';
import { t } from '../services/i18n.js';
import { icon } from './icons.js';

const TOOLBAR_GROUPS = [
  {
    label: 'Text',
    buttons: [
      { action: 'heading', labelKey: 'editor.heading', iconName: 'newspaper', snippet: '<h2>Überschrift</h2>\n<p>Einleitungstext...</p>\n' },
      { action: 'paragraph', labelKey: 'editor.paragraph', iconName: 'edit', snippet: '<p>Absatz...</p>\n' },
      { action: 'list', labelKey: 'editor.list', iconName: 'clipboardList', snippet: '<ul>\n  <li>Punkt 1</li>\n  <li>Punkt 2</li>\n</ul>\n' },
      { action: 'code', labelKey: 'editor.code', iconName: 'edit', snippet: '<pre><code>const x = 42;\nconsole.log(x);</code></pre>\n' }
    ]
  },
  {
    label: 'Layout',
    buttons: [
      { action: 'image', labelKey: 'editor.image', iconName: 'image', snippet: '<figure>\n  <img src="https://..." alt="Beschreibung">\n  <figcaption>Bildunterschrift</figcaption>\n</figure>\n' },
      { action: 'table', labelKey: 'editor.table', iconName: 'clipboardList', snippet: '<table>\n  <thead>\n    <tr><th>Spalte 1</th><th>Spalte 2</th></tr>\n  </thead>\n  <tbody>\n    <tr><td>Wert A</td><td>Wert B</td></tr>\n    <tr><td>Wert C</td><td>Wert D</td></tr>\n  </tbody>\n</table>\n' },
      { action: 'callout', labelKey: 'editor.callout', iconName: 'alertCircle', snippet: '<aside style="padding:1rem;border-left:4px solid #007d8f;background:#f4f4f5;border-radius:.5rem">\n  <strong>Hinweis:</strong> Wichtige Information für den Leser.\n</aside>\n' },
      { action: 'details', labelKey: 'editor.details', iconName: 'eye', snippet: '<details>\n  <summary>Mehr anzeigen</summary>\n  <p>Versteckter Inhalt, der erst beim Klick erscheint.</p>\n</details>\n' }
    ]
  },
  {
    label: 'Interaktiv',
    buttons: [
      { action: 'slider', labelKey: 'editor.slider', iconName: 'play', snippet: buildSliderSnippet() },
      { action: 'tabs', labelKey: 'editor.tabs', iconName: 'layoutDashboard', snippet: buildTabsSnippet() },
      { action: 'quiz', labelKey: 'editor.quiz', iconName: 'clipboardList', snippet: buildQuizSnippet() },
      { action: 'chart', labelKey: 'editor.chart', iconName: 'newspaper', snippet: buildChartSnippet() },
      { action: 'diagram', labelKey: 'editor.diagram', iconName: 'newspaper', snippet: buildMermaidSnippet() }
    ]
  }
];

/**
 * Mounts an HTML editor with live sandboxed preview into the host element.
 * The editor and preview stack vertically (editor on top, preview below).
 * Stored value is raw HTML; full JS/CSS interactivity works in the preview
 * and on the rendered detail page because both run inside a sandboxed iframe.
 *
 * @param {HTMLElement} host
 * @param {{ value?: string, placeholder?: string }} [options]
 * @returns {{ getValue: () => string, setValue: (v: string) => void, focus: () => void }}
 */
export function mountMarkdownEditor(host, options = {}) {
  const initialValue = options.value || '';
  const placeholder = options.placeholder || translate('editor.placeholder');

  const toolbarHtml = TOOLBAR_GROUPS.map((group, groupIndex) => `
    ${groupIndex > 0 ? '<span class="md-editor-divider" aria-hidden="true"></span>' : ''}
    <div class="md-editor-group" role="group" aria-label="${escape(group.label)}">
      ${group.buttons.map((button) => `
        <button type="button" class="md-editor-button" data-action="${button.action}"
          title="${escape(translate(button.labelKey))}"
          aria-label="${escape(translate(button.labelKey))}">
          ${icon(button.iconName, 14)}
        </button>
      `).join('')}
    </div>
  `).join('');

  host.innerHTML = `
    <div class="md-editor md-editor-vertical">
      <div class="md-editor-toolbar" role="toolbar" aria-label="${escape(translate('editor.toolbar'))}">
        ${toolbarHtml}
        <div class="md-editor-spacer"></div>
        <button type="button" class="md-editor-button md-editor-toggle" data-toggle-preview
          aria-pressed="true" title="${escape(translate('editor.togglePreview'))}">
          ${icon('eye', 14)}
          <span>${escape(translate('editor.preview'))}</span>
        </button>
      </div>
      <div class="md-editor-pane md-editor-source">
        <textarea class="md-editor-textarea" spellcheck="false"
          placeholder="${escape(placeholder)}">${escape(initialValue)}</textarea>
      </div>
      <div class="md-editor-pane md-editor-preview-wrap">
        <div class="md-editor-preview-header">
          <span>${escape(translate('editor.preview'))}</span>
          <button type="button" class="md-editor-mini" data-refresh-preview
            title="${escape(translate('editor.refresh'))}">
            ${icon('externalLink', 12)}
          </button>
        </div>
        <div class="md-editor-preview-host"></div>
      </div>
      <p class="md-editor-hint">${escape(translate('editor.hint'))}</p>
    </div>
  `;

  const root = host.querySelector('.md-editor');
  const textarea = root.querySelector('.md-editor-textarea');
  const previewHost = root.querySelector('.md-editor-preview-host');
  const previewWrap = root.querySelector('.md-editor-preview-wrap');
  const toggleButton = root.querySelector('[data-toggle-preview]');
  const refreshButton = root.querySelector('[data-refresh-preview]');

  const doc = mountRichDocument(previewHost, textarea.value, { minHeight: 240, className: 'md-editor-iframe' });

  const updatePreview = debounce(() => doc.update(textarea.value), 350);
  textarea.addEventListener('input', updatePreview);

  refreshButton.addEventListener('click', () => doc.update(textarea.value));

  toggleButton.addEventListener('click', () => {
    const collapsed = previewWrap.classList.toggle('hidden');
    toggleButton.setAttribute('aria-pressed', collapsed ? 'false' : 'true');
  });

  const allButtons = TOOLBAR_GROUPS.flatMap((group) => group.buttons);
  root.querySelectorAll('.md-editor-button[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const definition = allButtons.find((entry) => entry.action === button.dataset.action);
      if (!definition) return;
      insertAtCursor(textarea, definition.snippet);
      updatePreview();
      textarea.focus();
    });
  });

  return {
    getValue: () => textarea.value,
    setValue: (next) => {
      textarea.value = next || '';
      doc.update(textarea.value);
    },
    focus: () => textarea.focus()
  };
}

function insertAtCursor(textarea, snippet) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const prefix = value.slice(0, start);
  const suffix = value.slice(end);
  const needsLeading = prefix.length > 0 && !prefix.endsWith('\n');
  const insertion = (needsLeading ? '\n' : '') + snippet + (suffix.startsWith('\n') ? '' : '\n');
  textarea.value = prefix + insertion + suffix;
  const caret = prefix.length + insertion.length;
  textarea.setSelectionRange(caret, caret);
}

function debounce(fn, wait) {
  let timer = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, wait);
  };
}

function translate(key) {
  const value = t(key);
  if (value !== key) return value;
  return FALLBACK_LABELS[key] || key;
}

const FALLBACK_LABELS = {
  'editor.heading': 'Überschrift',
  'editor.paragraph': 'Absatz',
  'editor.list': 'Liste',
  'editor.image': 'Bild',
  'editor.table': 'Tabelle',
  'editor.code': 'Code',
  'editor.callout': 'Hinweis',
  'editor.details': 'Aufklappbar',
  'editor.slider': 'Slider',
  'editor.tabs': 'Tabs',
  'editor.quiz': 'Quiz',
  'editor.chart': 'Chart',
  'editor.diagram': 'Diagramm',
  'editor.preview': 'Vorschau',
  'editor.togglePreview': 'Vorschau ein-/ausblenden',
  'editor.refresh': 'Vorschau neu laden',
  'editor.toolbar': 'Format',
  'editor.placeholder': 'Schreibe deinen Inhalt als HTML. Style und Script sind erlaubt.',
  'editor.hint': 'HTML, CSS und JavaScript funktionieren. Inhalt läuft in einem sandboxed iframe – also isoliert vom Rest der Seite.'
};

function escape(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

function buildSliderSnippet() {
  return `<div style="padding:1rem;border:1px solid #d9d9d9;border-radius:.5rem">
  <label style="display:block;margin-bottom:.5rem">
    Wert: <output id="slider-out">50</output>
  </label>
  <input id="slider" type="range" min="0" max="100" value="50">
  <script>
    const s = document.getElementById('slider');
    const o = document.getElementById('slider-out');
    s.addEventListener('input', () => o.textContent = s.value);
  </script>
</div>
`;
}

function buildTabsSnippet() {
  return `<div class="tabs" style="border:1px solid #d9d9d9;border-radius:.5rem;overflow:hidden">
  <div style="display:flex;background:#f3f3f3;border-bottom:1px solid #d9d9d9">
    <button data-tab="a" class="tab-btn" style="flex:1;padding:.6rem;border:0;background:#fff;cursor:pointer">Tab A</button>
    <button data-tab="b" class="tab-btn" style="flex:1;padding:.6rem;border:0;background:transparent;cursor:pointer">Tab B</button>
    <button data-tab="c" class="tab-btn" style="flex:1;padding:.6rem;border:0;background:transparent;cursor:pointer">Tab C</button>
  </div>
  <div style="padding:1rem">
    <div data-pane="a">Inhalt von Tab A.</div>
    <div data-pane="b" hidden>Inhalt von Tab B.</div>
    <div data-pane="c" hidden>Inhalt von Tab C.</div>
  </div>
  <script>
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.style.background = 'transparent');
        btn.style.background = '#fff';
        document.querySelectorAll('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== btn.dataset.tab);
      });
    });
  </script>
</div>
`;
}

function buildQuizSnippet() {
  return `<div style="padding:1rem;border:1px solid #d9d9d9;border-radius:.5rem">
  <p><strong>Frage:</strong> Was ist 2 + 2?</p>
  <div style="display:flex;flex-direction:column;gap:.4rem">
    <button data-ok="false" class="opt" style="padding:.5rem;text-align:left">3</button>
    <button data-ok="true"  class="opt" style="padding:.5rem;text-align:left">4</button>
    <button data-ok="false" class="opt" style="padding:.5rem;text-align:left">5</button>
  </div>
  <p id="quiz-out" style="margin-top:.75rem;font-weight:600"></p>
  <script>
    document.querySelectorAll('.opt').forEach(b => {
      b.addEventListener('click', () => {
        const ok = b.dataset.ok === 'true';
        document.getElementById('quiz-out').textContent = ok ? '✓ Richtig!' : '✗ Falsch — versuch es nochmal.';
        document.getElementById('quiz-out').style.color = ok ? '#007d8f' : '#b91c1c';
      });
    });
  </script>
</div>
`;
}

function buildChartSnippet() {
  return `<div>
  <canvas id="chart" width="600" height="320"></canvas>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script>
    new Chart(document.getElementById('chart'), {
      type: 'bar',
      data: {
        labels: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai'],
        datasets: [{ label: 'Anfragen', data: [12, 19, 8, 15, 22], backgroundColor: '#007d8f' }]
      },
      options: { responsive: true }
    });
  </script>
</div>
`;
}

function buildMermaidSnippet() {
  return `<div class="mermaid">
flowchart LR
  A[Start] --> B{Entscheidung}
  B -->|Ja| C[Schritt 1]
  B -->|Nein| D[Schritt 2]
  C --> E[Ende]
  D --> E
</div>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: true, theme: 'default' });
</script>
`;
}
