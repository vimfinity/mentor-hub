# KI-Hub (mentor-hub)

A zero-dependency Node.js content hub: a curated feed of news/guides/agent
assets, user surveys with result dashboards, and a concern (feedback) inbox —
all behind a small password-protected admin console. The frontend is a vanilla
ES-module single-page app; the backend is the Node standard library only (no npm
runtime dependencies). Data is persisted as JSON files on disk.

## Requirements

- Node.js 18 or newer (uses `node --test`, `crypto.scryptSync`, etc.)
- No `npm install` step needed — there are no runtime dependencies.

## Running

```bash
npm start
```

On Windows you can also double-click `start.bat`, which locates Node via common
environment variables / `fnm` and then runs `src/server.js`.

The server prints its local and network URLs on startup. Defaults live in
`config.json`:

| Key                 | Default     | Meaning                                        |
| ------------------- | ----------- | ---------------------------------------------- |
| `port`              | `21000`     | TCP port                                       |
| `host`              | `127.0.0.1` | Bind address                                   |
| `title`             | `KI-Hub`    | Site title (shown in UI and feed exports)      |
| `defaultLanguage`   | `de`        | Default locale (`de` or `en`)                  |
| `sessionDurationMs` | `28800000`  | Admin session lifetime (8h)                    |
| `devReloadEnabled`  | `false`     | Server-sent-events live reload during dev      |

Secrets and overrides go in `config.local.json` (gitignored), which is merged
over `config.json`. The admin password hash is written there by the setup flow.

## First-time admin setup

1. Start the server and open it in a browser.
2. Navigate to `/admin`. On first run it prompts to create an admin password
   (minimum 8 characters), stored as a salted scrypt hash in
   `config.local.json`.
3. Log in to manage the feed, surveys, concerns and media library.

## Scripts

```bash
npm start            # run the server
npm test             # run the node:test suite (unit + HTTP smoke tests)
npm run lint         # dependency-free syntax/debug lint pass
npm run optimize:images  # regenerate responsive image variants (needs sharp)
```

## Project layout

```
config.json            Base configuration (committed)
config.local.json      Local overrides + admin hash (gitignored)
data/                  JSON data files (surveys, news, resources, concerns, media)
  backups/             Timestamped pre-write backups (gitignored)
  uploads/             Resource attachments
locales/               de.json / en.json translation bundles
public/                Static frontend
  index.html           SPA shell
  css/style.css        All styles
  js/app.js            SPA bootstrap + routing wiring
  js/services/         Router, i18n, API client, query cache, etc.
  js/components/        UI components (feed, surveys, modal, selects, ...)
  js/features/          Larger features (admin console)
src/                   Backend (Node stdlib only)
  server.js            HTTP server, static files, security headers, rate limiting
  router.js            Tiny pattern-matching router
  config.js            Config load/merge/save
  auth.js              scrypt password hashing + in-memory sessions
  rate-limit.js        Token-bucket rate limiting per IP/policy
  image-optimizer.js   Optional sharp-based responsive variants
  api/public.js        Public endpoints (feed, surveys, concerns, i18n, uploads)
  api/admin.js         Authenticated admin endpoints
  data/                Per-entity data access on top of store.js
scripts/               lint + image optimization
test/                  node:test unit and HTTP smoke tests
```

## HTTP API (overview)

Public:

- `GET /api/runtime-config` — title, default language, dev-reload flag
- `GET /api/i18n/:locale` — translation bundle (`de` / `en`)
- `GET /api/feed` — merged feed (plain array). With `?q=`, `?limit=`, `?offset=`
  returns `{ items, total, offset, limit, query }`
- `GET /api/feed.xml` — RSS 2.0 export · `GET /api/feed.json` — JSON Feed 1.1
- `GET /api/feed/:id` — single feed entry
- `GET /api/news` · `GET /api/resources` — source lists
- `GET /api/surveys` · `GET /api/surveys/:id` — active surveys
- `POST /api/surveys/:id/responses` — submit answers (id-keyed `answers` map,
  legacy positional `responses` array still accepted)
- `POST /api/concerns` — submit a concern
- `GET /api/uploads/images/:filename` · `GET /api/resources/:id/attachments/:attachmentId`

Admin (require `Authorization: Bearer <token>`): setup/login/logout/password,
plus full CRUD for surveys, resources, news, concerns and the media library
under `/api/admin/*`.

## Localization

Only German (`de`) and English (`en`) are supported. User-authored content is
stored as localized objects (`{ "de-DE": "...", "en-US": "..." }`) and resolved
per request via the `?locale=` param or the `Accept-Language` header.

## Notes on data safety

`src/data/store.js` performs atomic writes (temp file + rename), per-file
in-process write locks, and takes a timestamped backup under `data/backups/`
before each overwrite (keeping the 10 most recent per file). This is a
single-process JSON store — fine for the current scale; a move to SQLite would
be the natural next step if concurrency or volume grows.
