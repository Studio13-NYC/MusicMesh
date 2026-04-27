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

1. `app_build_command` — `npm ci && npm run build`.
   - Runs `scripts/syncForSwaApi.js`.
   - Builds the Vite app into `output/ui-dist`.
2. `api_build_command` — `npm run sync && npm ci && npm run check`.
   - Runs the same API sync from inside `api/`.
   - Installs the Functions package from `api/package-lock.json`.
   - Loads `api/src/index.js` through `scripts/verifySwaApiBundle.js` so missing copied files or missing function dependencies fail the deploy build.
3. SWA deploy action uploads the static app + the API.

The local equivalents are:

- `npm run build` for the coordinated UI build.
- `npm run build:api` for the coordinated API package build.
- `npm run verify` for check + API build + UI build + local Playwright.

The sync copies shared runtime modules and `docs/product/MUSICMESH_CHAT_SYSTEM_PROMPT.md` into `api/shared/` and `api/content/` so the Functions bundle is self-contained.

### App settings (environment variables)

Configure required keys on the Static Web App (or linked Function settings) the same way as local `.env`. Chat uses `validateEnv()` from `src/env.js`, which requires at least:

- `OPENAI_API_KEY`
- `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`

Optional keys are listed in `src/env.js`. **Note:** the hosted Function does not use Neo4j for chat today, but validation still expects those variables until that requirement is split for “chat-only” deployments.

For the current OpenAI chat path, `OPENAI_MODEL` can override the default model. Model IDs are normalized to lowercase so `GPT-5.5` is treated as `gpt-5.5`.

Reasoning effort is stage-specific and can be configured with the same environment variable names locally or in Azure app settings:

| Variable | Default | Used for |
|----------|---------|----------|
| `OPENAI_REASONING_EFFORT_DEFAULT` | `medium` | fallback for any stage without a more specific setting |
| `OPENAI_REASONING_EFFORT_KNOWLEDGE` | `low` | direct answer from model knowledge |
| `OPENAI_REASONING_EFFORT_CHAT_COMPLEX` | `medium` | longer or multi-turn answer synthesis |
| `OPENAI_REASONING_EFFORT_GRAPH_PLAN` | `medium` | deriving graph structure from the answer |
| `OPENAI_REASONING_EFFORT_GRAPH_GROUNDING` | `high` | canon matching and duplicate avoidance |
| `OPENAI_REASONING_EFFORT_HUMAN_LOOP` | `low` | short human-in-the-loop clarification |
| `OPENAI_REASONING_EFFORT_MAINTENANCE` | `high` | offline maintenance/eval-style work |

Legacy `OPENAI_REASONING_EFFORT` remains supported as a compatibility fallback.
`OPENAI_REASONING_LEVEL` is also accepted as a compatibility alias, but the preferred names are the `OPENAI_REASONING_EFFORT_*` keys above.

`OPENAI_VERBOSITY` can be `low`, `medium`, or `high` and defaults to `medium`.

`MUSICMESH_CHAT_GRAPH_SYNC_TIMEOUT_MS` controls how long `/api/chat` waits for graph persistence before returning the answer with `graphPending: true`. The default is `25000`, which keeps Azure Static Web Apps from returning a plain-text backend timeout while longer graph work continues as a deferred graph update.

### SPA routing

`ui/public/staticwebapp.config.json` is copied into the build output when present so unknown paths can fall back to `index.html`, while `/api/*` is excluded. The active UI is currently a single root screen rather than a client-routed app.

## Local development quick reference

1. Copy/configure `.env` at the repo root (see `src/env.js` for required keys).
2. Terminal A: `npm run dev:api` (or `npm run dev:api` / `node src/index.js`) — API on `43101`.
3. Terminal B: `npm run dev` — Vite on `3000` with `/api` → `43101`.

Tape and runtime NDJSON logs under `output/chat/` are written by the local Node server by default. When `MUSICMESH_BLOB_CONNECTION_STRING` is configured, both the local API and the Azure Function path write append-only NDJSON records to Azure Blob Storage instead.

## Logging and Application Insights

| Mechanism | Where |
|-----------|--------|
| **Local API** | `console.log` on the Node process; structured events in `output/chat/runtime-events.ndjson` by default, or Azure Blob when blob persistence is configured. |
| **Azure Functions** | Platform logging via Application Insights plus append-only tape/runtime blobs when `MUSICMESH_BLOB_CONNECTION_STRING` is configured. |
| **This repo** | No Application Insights SDK in the React app or the local Node server. |

Every OpenAI Responses API call emits an `llm_call_completed` or `llm_call_failed` runtime event with stage, model, requested reasoning effort, env source, duration, response id, status, token usage, and reasoning token usage when returned by the API. To summarize long-term local or blob-backed logs:

```powershell
npm run llm:report
```

Pass a numeric limit to summarize only the most recent runtime events:

```powershell
npm run llm:report -- 500
```

**Azure (MusicMesh):** resource group `rg-musicmesh` includes an Application Insights component **`appi-musicmesh`**. The Static Web App **`swa-musicmesh`** app settings include `APPLICATIONINSIGHTS_CONNECTION_STRING` and `ApplicationInsightsAgent_EXTENSION_VERSION=~3` so the integrated Functions host can emit telemetry. Use **Azure portal → Application Insights → Logs / Live metrics** (or SWA **Monitoring**) after deployments.

To debug a failed deploy or runtime 500, use GitHub Actions logs, **Azure portal → Static Web App → Monitoring / Log stream**, or **Application Insights** queries as above.

## Production append-only tape via Azure Blob

To enable durable append-only tape and runtime logs in production, set these Static Web App environment variables:

- `MUSICMESH_BLOB_CONNECTION_STRING`
- `MUSICMESH_BLOB_CONTAINER` (optional, defaults to `musicmeshchat`)

With blob persistence enabled, the deployed API serves:

- `GET /api/chat/tape`
- `GET /api/chat/runtime`

and returns path labels like `azureblob://<container>/conversation-tape.ndjson`.

## Maintenance

When changing chat logic or env validation, update:

- `src/chatService.js` (shared OpenAI path),
- `scripts/syncForSwaApi.js` if new files must be copied into `api/`,
- run `npm run build:api` so the copied Functions bundle is verified,
- this document if URLs or workflow commands change.
