# CLAUDE.md

Guidance for AI agents working in this repository. See `README.md` for the
user-facing overview.

## What this is

KI-Hub is a small content hub: a curated feed, user surveys with result
dashboards, and a concern/feedback inbox, behind a password-protected admin
console. Keep it boring and dependency-free.

## Hard constraints

- **No runtime dependencies.** The backend uses only the Node standard library;
  the frontend uses native ES modules with no build step. Do not introduce npm
  runtime packages or a bundler. `sharp` is an *optional* dev-only tool for
  image optimization and must stay optional (the code already degrades when it
  is missing).
- **Only two locales: `de` and `en`.** Do not add more. User-authored content is
  stored as `{ "de-DE": "...", "en-US": "..." }`; use the helpers in
  `src/data/localization.js` and the client `i18n` service rather than
  hand-rolling locale logic.
- **Match the surrounding style.** English identifiers and comments, JSDoc on
  exported/server functions, two-space indent, single quotes, semicolons,
  `'use strict';` at the top of CommonJS files.

## Architecture

- `src/server.js` — HTTP server: security headers (incl. CSP), per-IP token
  bucket rate limiting, origin checks, static file serving, then routing for
  `/api/*`. Unmatched non-API routes fall back to `index.html` (SPA).
- `src/router.js` — tiny `:param` pattern router. `req.params` / `req.query` are
  attached before the handler runs.
- `src/api/public.js` and `src/api/admin.js` — register routes. `admin.js`
  guards every handler with `requireAuth`. `sendJson` / `readBody` are exported
  from `public.js` and reused by `admin.js`.
- `src/data/store.js` — JSON persistence: atomic write (temp + rename),
  per-file write locks, and timestamped backups under `data/backups/` before
  each overwrite. All entity modules (`surveys`, `news`, `resources`,
  `concerns`, `media`) build on it.
- `src/auth.js` — scrypt password hashing with an encoded `scheme$salt$hash`
  format (legacy sha256 hashes still verify and are upgraded on next login).
  Sessions are in-memory (a restart logs admins out) and purged on an interval.
- Frontend: `public/js/app.js` wires routing; `services/` holds the router,
  i18n, API client, and a small query cache; `components/` and `features/` hold
  UI. `features/admin-console.js` is large — when touching it, prefer extracting
  cohesive sections over growing it further.

## Surveys: answers are keyed by question id

Each survey question has a stable `id`. Responses are stored as an id-keyed
`answers` map so they survive question reordering/insertion/deletion. The
normalized survey also exposes a positional `responses` array realigned to the
current question order for backward compatibility. When reading answers in the
admin UI, use the `getAnswer(response, question, index)` helper (prefers
`answers[id]`, falls back to positional). Legacy positional-only responses are
migrated to the id-keyed shape on read.

## Rich content is sandboxed

Admin-authored HTML is rendered via `iframe.srcdoc` with a restrictive `sandbox`
(no `allow-same-origin`) in `public/js/services/rich-content.js`. Because srcdoc
iframes inherit the page CSP, `script-src 'unsafe-inline'` is intentionally kept
so chart/mermaid/autosize scripts run inside that isolated frame. Do not remove
it without first moving rich content to a separate origin/endpoint. Always
escape interpolated user data in normal (non-iframe) DOM with `escapeHtml`.

## Before you finish

- `npm run lint` — dependency-free syntax/debug check.
- `npm test` — `node:test` unit + HTTP smoke tests. The HTTP suite spawns the
  server on the configured port; make sure no instance is already bound to it.
- The surveys tests mutate the real `data/surveys.json` (the store has no
  injectable path) and restore it; they leave `data/backups/` entries, which are
  gitignored.

## Conventions

- Validate and length-limit all user input in the API layer (see existing
  `localizedLength` / max-length checks).
- Keep responses as `sendJson(res, status, payload)`; keep error bodies as
  `{ error: '...' }`.
- Commit/branch only when asked. Co-author trailer per repo policy.
