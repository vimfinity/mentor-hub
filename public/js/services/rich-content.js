const SANDBOX_FLAGS = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals';

const BASE_STYLES = `
  :root { color-scheme: light dark; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    color: #1a1a1a;
    background: transparent;
    line-height: 1.65;
    padding: 1rem 0;
  }
  h1, h2, h3, h4 {
    font-family: 'Outfit', system-ui, -apple-system, Segoe UI, sans-serif;
    line-height: 1.25;
    margin: 1.5rem 0 0.75rem;
  }
  h1 { font-size: 1.75rem; } h2 { font-size: 1.4rem; } h3 { font-size: 1.15rem; }
  p { margin: 0 0 1rem; }
  ul, ol { margin: 0 0 1rem; padding-left: 1.4rem; }
  li + li { margin-top: 0.25rem; }
  a { color: #007d8f; text-decoration: underline; text-underline-offset: 2px; }
  a:hover { color: #005c6a; }
  img, video, canvas, svg { max-width: 100%; height: auto; border-radius: 0.5rem; }
  blockquote {
    border-left: 3px solid #007d8f;
    margin: 1rem 0;
    padding: 0.25rem 0 0.25rem 1rem;
    color: #4b4a45;
    font-style: italic;
  }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.95rem; }
  th, td { border: 1px solid #d9d9d9; padding: 0.55rem 0.75rem; text-align: left; vertical-align: top; }
  th { background: #f3f3f3; font-weight: 700; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em;
    background: #f3f3f3; padding: 0.1rem 0.35rem; border-radius: 4px; }
  pre { background: #f3f3f3; border-radius: 0.5rem; padding: 1rem; overflow-x: auto; line-height: 1.55; }
  pre code { background: transparent; padding: 0; }
  hr { border: none; border-top: 1px solid #e8e8e8; margin: 2rem 0; }
  details { border: 1px solid #e8e8e8; border-radius: 0.5rem; padding: 0.5rem 0.75rem; margin: 1rem 0; }
  details > summary { cursor: pointer; font-weight: 600; }
  input[type="range"] { width: 100%; }
  button { font: inherit; cursor: pointer; }
  @media (prefers-color-scheme: dark) {
    body { color: #f5f5f5; }
    th { background: #1f1f1f; }
    th, td { border-color: #333; }
    code, pre { background: #1f1f1f; }
    blockquote { color: #c5c5c5; }
    hr, details { border-color: #333; }
  }
`;

const AUTOSIZE_SCRIPT = `
  (function () {
    var pendingFrame = null;

    function contentHeight() {
      var root = document.documentElement;
      var body = document.body;
      if (!body) return root.scrollHeight || 0;

      var bodyRect = body.getBoundingClientRect();
      var top = bodyRect.top;
      var height = Math.max(
        root.scrollHeight,
        body.scrollHeight,
        root.offsetHeight,
        body.offsetHeight,
        bodyRect.bottom - top
      );

      var elements = body.querySelectorAll('*');
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        var style = getComputedStyle(element);
        if (style.display === 'none' || style.position === 'fixed') continue;

        var rect = element.getBoundingClientRect();
        if (!rect.width && !rect.height) continue;

        height = Math.max(height, rect.bottom - top + (parseFloat(style.marginBottom) || 0));
      }

      return Math.ceil(height);
    }

    function report() {
      try {
        parent.postMessage({ __mhRichResize: true, height: contentHeight() }, '*');
      } catch (error) {}
    }

    function schedule() {
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      pendingFrame = requestAnimationFrame(report);
    }

    function openExternalLinksInNewTabs(event) {
      var link = event.target.closest('a[href]');
      if (!link || link.target === '_blank') return;

      var href = link.getAttribute('href') || '';
      if (!/^https?:/i.test(href)) return;

      event.preventDefault();
      window.open(href, '_blank', 'noopener');
    }

    schedule();
    window.addEventListener('load', schedule);
    window.addEventListener('resize', schedule);

    if ('ResizeObserver' in window) {
      new ResizeObserver(schedule).observe(document.documentElement);
      if (document.body) new ResizeObserver(schedule).observe(document.body);
    }

    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    setTimeout(schedule, 50);
    setTimeout(schedule, 250);
    setTimeout(schedule, 1000);
    setInterval(schedule, 1500);
    document.addEventListener('click', openExternalLinksInNewTabs);
  })();
`;

/**
 * Builds the srcdoc HTML document that wraps user-authored content.
 * @param {string} userHtml
 * @returns {string}
 */
export function buildRichDocument(userHtml) {
  const body = userHtml || '';
  return `<!doctype html><html><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<style>${BASE_STYLES}</style></head><body>${body}`
    + `<script>${AUTOSIZE_SCRIPT}<\/script></body></html>`;
}

/**
 * Mounts a sandboxed iframe that renders user-authored HTML/JS with autosize.
 * @param {HTMLElement} host
 * @param {string} html
 * @param {{ minHeight?: number, className?: string }} [options]
 * @returns {{ update: (html: string) => void, destroy: () => void, element: HTMLIFrameElement }}
 */
export function mountRichDocument(host, html, options = {}) {
  const minHeight = options.minHeight ?? 200;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', SANDBOX_FLAGS);
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.setAttribute('scrolling', 'no');
  iframe.className = options.className || 'rich-document';
  iframe.style.width = '100%';
  iframe.style.border = '0';
  iframe.style.display = 'block';
  iframe.style.minHeight = minHeight + 'px';

  const handleMessage = (event) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (!data || !data.__mhRichResize) return;
    const next = Math.max(minHeight, Math.ceil(Number(data.height) || 0));
    if (Number.isFinite(next) && next > 0) {
      iframe.style.height = next + 'px';
    }
  };
  window.addEventListener('message', handleMessage);

  function update(nextHtml) {
    iframe.srcdoc = buildRichDocument(nextHtml || '');
  }

  host.appendChild(iframe);
  update(html);

  return {
    element: iframe,
    update,
    destroy: () => {
      window.removeEventListener('message', handleMessage);
      iframe.remove();
    }
  };
}

/**
 * Strips HTML to short preview text for cards / summaries.
 * @param {string} html
 * @param {number} maxLength
 * @returns {string}
 */
export function previewText(html, maxLength = 200) {
  if (!html) return '';
  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '…';
}
