# Local and Azure API

Both runtimes use `src/researchApi.js`, `researchStore.js`, `researchRunner.js`, and `researchTools.js`. `scripts/syncForSwaApi.js` stages these and their dependencies under ignored `api/shared`; do not edit generated copies. Azure Functions registers routes in `api/src/functions/chat.js`; local Node uses `src/server.js`.

- POST `/api/chat`: start with `{clientRequestId:"req-<uuid>",version:0,prompt,messages,graphContext,actor}`; continue with `{requestId,version}`. Returns status, message, graph, decision, usage and version. One model call per advance. Repeat a version safely to recover its result.
- GET `/api/chat/run?id=req-<uuid>`: recover bounded saved run state. Runs expire after 24 hours.
- POST `/api/chat/decision`: `{requestId,version,decisionId,choice:"approve"|"deny"|"defer",selection?}`. Approvals are allowlisted and transactional. A duplicate identical resolved action returns the saved state; stale conflicting actions fail.
- GET `/api/chat/tape?limit=40` and `/api/chat/runtime?limit=40`: bounded 256 KiB tails, at most 200 records. Historical records outside the tail are not returned.
- Existing graph search/detail/ontology/evidence endpoints remain. Raw private listening/mapping/preference nodes are excluded from graph browsing.

The application model is explicitly `gpt-6-luna` with `reasoning.effort=high` in the researcher. Environment `OPENAI_MODEL` also defaults to this for connectivity checks; old per-stage settings do not control the new researcher. No ChatGPT session is used. `OPENAI_API_KEY` and dedicated MusicMesh `DATABASE_URL` are required. `DIRECT_URL` is used for Prisma migrations. Optional BRAVE_API_KEY enables search; public source reads do not require it. Roon/Qobuz are not connected. `MUSICMESH_LISTENING_ACCOUNT` defaults to `bobdobbsnyc` for imported-history aggregates; attribution Nick/Guest does not establish authentication.

```powershell
npm run db:generate
npm run db:migrate
npm start
npm run dev
npm run build:api
npm run build
```

The deployed site and main database are development. Apply additive schema migration before deploying the matching runtime. GitHub Actions is the normal deployment path. Check the successful run, the live ontology, real UI/API behavior and persisted receipts separately. Builds alone do not prove deployment. Never use Alexander. See [current handoff](../product/CURRENT_STATE_AND_HANDOFF.md) for verified state and known limits.
