# MusicMesh API: local vs Azure Static Web Apps

## The problem we fixed

The React shell originally called the chat API at `http://<hostname>:43101`. That works only when a **local** Node server is bound to loopback and the browser can reach it. On **HTTPS** production (`musicmesh.s13.nyc` or the default `*.azurestaticapps.net` host):

1. **Mixed content** — a secure page cannot reliably call a plain `http:` API.
2. **No listener** — Azure Static Web Apps deploys the **Vite build** (`output/ui-dist`). The dev API in `src/server.js` is **not** running in that environment unless you host it elsewhere.

So chat appeared “broken” in production even though the UI built successfully.

## Target behavior

| Environment | UI | Chat (`POST /api/chat`) |
|---------------|----|-------------------------|
| **Local** | Vite dev server (e.g. port 3000) | Proxied to `127.0.0.1:43101` (`ui/vite.config.mjs`) → `src/server.js` (tape + NDJSON runtime log) |
| **Azure SWA** | Static files from `output/ui-dist` | Azure Functions in `api/` (`api/src/functions/chat.js`) — same URL path `/api/chat` |

The browser always uses **same-origin** requests: `/api/chat`, `/api/chat/tape`, etc. No port `43101` in the client.

## Frontend configuration (`VITE_*`)

Vite exposes only variables prefixed with `VITE_` to the client.

| Variable | Purpose |
|----------|---------|
| `VITE_MUSICMESH_API_BASE` | Optional absolute base for API calls (no trailing slash). **Default:** empty → use relative URLs (`/api/...`). |

Examples:

- **Normal local + production** — unset or leave empty so the app uses `/api/...`.
- **Split deployment** (UI on SWA, API on another origin) — set `VITE_MUSICMESH_API_BASE=https://your-api.example.com` at **build time** (e.g. GitHub Actions secret + env) so requests go to that host.

Local file convention: `ui/.env.development` (not committed) can set overrides for Vite.

## Azure Static Web Apps

### Workflow

GitHub Actions runs:

1. `app_build_command` — `npm ci && npm run build` (Vite → `output/ui-dist`).
2. `api_build_command` — `node ../scripts/syncForSwaApi.js && npm ci`  
   - Copies `src/env.js`, `src/chatService.js`, and `docs/product/MUSICMESH_CHAT_SYSTEM_PROMPT.md` into `api/shared/` and `api/content/` so the Functions bundle is self-contained.
3. SWA deploy action uploads the static app + the API.

### App settings (environment variables)

Configure required keys on the Static Web App (or linked Function settings) the same way as local `.env`. Chat uses `validateEnv()` from `src/env.js`, which requires at least:

- `OPENAI_API_KEY`
- `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`

Optional keys are listed in `src/env.js`. **Note:** the hosted Function does not use Neo4j for chat today, but validation still expects those variables until that requirement is split for “chat-only” deployments.

### SPA routing

`ui/public/staticwebapp.config.json` is copied into the build output so unknown paths fall back to `index.html` for the client router, while `/api/*` is excluded.

## Local development quick reference

1. Copy/configure `.env` at the repo root (see `src/env.js` for required keys).
2. Terminal A: `npm run dev:api` (or `npm run dev:api` / `node src/index.js`) — API on `43101`.
3. Terminal B: `npm run dev` — Vite on `3000` with `/api` → `43101`.

Tape and runtime NDJSON logs under `output/chat/` are written by the **local** Node server only. The Azure Function path does not write tape yet (`tapeEventIds` is an empty array).

## Logging and Application Insights

| Mechanism | Where |
|-----------|--------|
| **Local API** | `console.log` on the Node process; structured events in `output/chat/runtime-events.ndjson`; conversation tape alongside it. |
| **Azure Functions** | `context.log` / platform logging; `api/host.json` enables host-side sampling. |
| **This repo** | No Application Insights SDK in the React app or the local Node server. |

**Azure (MusicMesh):** resource group `rg-musicmesh` includes an Application Insights component **`appi-musicmesh`**. The Static Web App **`swa-musicmesh`** app settings include `APPLICATIONINSIGHTS_CONNECTION_STRING` and `ApplicationInsightsAgent_EXTENSION_VERSION=~3` so the integrated Functions host can emit telemetry. Use **Azure portal → Application Insights → Logs / Live metrics** (or SWA **Monitoring**) after deployments.

To debug a failed deploy or runtime 500, use GitHub Actions logs, **Azure portal → Static Web App → Monitoring / Log stream**, or **Application Insights** queries as above.

## Maintenance

When changing chat logic or env validation, update:

- `src/chatService.js` (shared OpenAI path),
- `scripts/syncForSwaApi.js` if new files must be copied into `api/`,
- this document if URLs or workflow commands change.
