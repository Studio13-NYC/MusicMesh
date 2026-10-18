# Researcher implementation plan

**Goal:** deliver the approved task-directed researcher, scoped enrichment and decision UI.
**Architecture:** shared Responses API step runner with durable bounded state, compact graph tools, typed evidence assertions, existing Prisma/PostgreSQL and private Blob.
**Tech stack:** CommonJS Node 22, Prisma 7, PostgreSQL, React/Radix/Cytoscape, Azure Functions.
**Spec:** ../specs/2026-10-18-researcher-design.md

## Global constraints

Preserve imported identities, original CSV, STAY and unrelated work. Never use Alexander. No full Neon verification/download, duplicate collector or repeat ListenBrainz submission. Root env/main is the shared development instance. Keep large evidence in Blob. Default Nick attribution is not authentication. User authorized writing this plan and immediately implementing it without another approval gate. Use existing checkout/runtime as requested; baseline db96e68 is clean. Model `gpt-6-luna`, researcher effort `high`.

## Review focus

1. Durable step/decision retries: duplicate approval, stale lease, failure after write (researcher tests and DB integration).
2. Evidence scope: single-track evidence promoted to album, compilation/edition leakage, additive versus replacing credits (enrichment tests).
3. Token/runtime growth: long history, repetitive tool use, provider text/prompt injection, truncated responses (runner tests).
4. Data access: private graph leakage, arbitrary source URL requests, imported entity mutation (tool/domain tests).
5. Product behavior: graph result arrives between research steps, no idle polling, modal Deny/Defer/resume and actual API parity (workbench checks).

## Task 1: Domain enrichment and source semantics

- [x] Add typed assertion/preference fields and relationships in src/domain; retain old provider class semantics.
- [x] Create src/enrichment.js: pure scoped resolution/validation and shared-factor comparison. No copying across album tracks; explicit all-tracks defaults and named overrides.
- [x] Create src/researchSources.js: capability catalog and bounded source search with configured Brave key; distinguish available/manual/unconfigured Roon/Qobuz. No arbitrary URL fetch.
- [x] Tests first: all-tracks vs album-credit, track add/exclude/replace, cross-edition rejection, conflicts, explicit preference vs plays, source capability truth. Run node --test tests/enrichment.test.js.
- [x] Expected: tests pass with deterministic source-backed scope resolution; regenerate domain documentation.

## Task 2: Compact research tools

- [x] Create src/researchTools.js using existing Prisma/graph/evidence access. Exports toolDefinitions, executeResearchTool(name,args,context), and graph accumulation helpers.
- [x] Tools accept exact stored IDs, bounded integer limits and explicit scope. Return {data,graph?,decision?}; graph uses existing node/edge workbench shape. Tool cache keys canonical name+arguments.
- [x] Include listening aggregate, release tracklist, acoustic neighbors, source catalog/search, domain definition, scoped evidence reads and enrichment/explicit preference preparation. SQL filters private catalog types, never supplies raw listen rows.
- [x] Tests first for bounds, unknown/invalid tools, source/identity protections and result projection. Live local restored DB checks for selected node, adjacency, listening aggregate and album scope.
- [x] Expected: queries return bounded useful data with exact IDs, coverage and no full records.

## Task 3: Durable single researcher runtime

- [x] Add Prisma ResearchRun operational table/migration; bounded JSON state and optimistic lease/version, no workflow nodes in music graph.
- [x] Create src/researchRunner.js and src/researchStore.js. One model call per advance; at most 8 model steps, 16 tools, bounded context and output. Persist model tool call/output continuation; stop/recover visibly on error/limit. Each step returns {requestId,status,message,graph,decision,usage,version}.
- [x] Statuses: running, needs_input, deferred, completed, denied, failed. Decisions have immutable id/version/action/choices; only allowlisted actions, atomic/idempotent application. Nick/Guest attribution.
- [x] Tests first for no-tool one-call answer, cached repeated reads, limits, completed idempotency, deny/defer/resume and duplicate/stale approval. Local DB transaction checks.
- [x] Expected: no preview/planner/ground/review calls; high effort model verified through telemetry.

## Task 4: API and workbench integration

- [x] Replace chat handlers with shared researcher functions; retain tape/runtime read endpoints with bounded tails. POST /api/chat starts or advances requestId; POST /api/chat/decision applies decision; GET /api/chat/run?id= retrieves resumable state. Existing endpoint compatibility fields remain where useful.
- [x] Update syncForSwaApi explicit bundle list. Local and Azure handlers use identical shared runtime.
- [x] Client advances running requests, displays real graph results between steps, bounded history, no detached promises or permanent idle polls. Add Approve/Deny/Defer modal and deferred resume affordance, Nick/Guest attribution. Replace expansion prompt with task/evidence-directed exploration.
- [x] Tests/build first where possible, then actual local SPA/API for simple question, graph expansion and decision interactions. Expected: no misleading preview-saving wait.

## Task 5: Model and obsolete implementation cleanup

- [x] Default configured model to gpt-6-luna/high for researcher; update root env without exposing secrets and Azure settings at deployment.
- [x] Remove Neo4j-only exporter/importer, driver and npm commands, Aura settings and obsolete current guidance. Preserve protected archive/history and stable IDs. Remove unused sequential live chat path modules after dependency review.
- [x] Update current state, operator contract/system prompt, ONE_CHAT_PIPELINE and running Brainz progress; remove contradictory instructions. Run npm test, npm run build, npm run build:api and targeted DB checks.
- [x] Expected: no active Neo4j dependencies/code; package lock consistent.

## Task 6: Review, deployment and proof

- [x] Fresh whole-change review; resolve correctness findings with regression tests.
- [x] Commit scoped changes, push under existing authorization, monitor deployment. Apply additive operational schema before new runtime. No existing music data reset.
- [x] Actual deployed workbench tests and API/log checks; compare model calls/tokens for simple answer and real graph query. Verify modal behavior without leaving fabricated evidence in real catalog.
- [x] Record exact commands/results, limitations, available source integrations and remaining provider access requirements. Expected: current-state docs match shipped code.

## Execution ledger

2026-10-18: specification and plan written before implementation. Baseline clean db96e68. Shared interfaces reviewed: domain -> tools -> runner -> API/UI; graph payload retains current rendering schema; decision endpoint consumes persisted immutable decision. Runtime storage is operational, separate from music entities. Tests will prove exact JSON shapes before UI integration. Use inline implementation to keep this tightly coupled change coherent, with a fresh final review. No additional design approval requested because Nick explicitly authorized implementation.


2026-10-18 implementation ledger: Tasks 1–3 implemented and unit/local DB tests passing. Task 4 local API/workbench exercised: 21,415-play response, Defer -> Resume -> Approve. Task 5 executable source driver/importer and old model pipeline removed; current guidance updated. Final review/deployment still pending. Ruling: add typed new-factor creation to enrichment because instrument models will often be absent from the imported catalog; modal discloses the new identity and source. Cost if wrong: a duplicate user-reviewed local factor may need reconciliation; no imported object is overwritten. Ruling: preserve the historical user transcript and protected archives while removing executable dependencies and current guidance; rewriting user history would lose useful product evidence.

2026-10-18 review fix ledger: fresh reviewer reported six Important, no Critical. All six accepted and fixed in one pass: resolved track/recording identity; excluded edition-bound claims from context-free aggregates; ReleaseGroup defaults validated through the same preparation/execution contract; exact IDs/edition/prior claim disclosed; uncertain lease recovery requires explicit retry; stable prompt/decision tape events restored. Added cancellation and removed obsolete review UI. RED: three scope tests plus two SQL recovery/tape tests failed for the expected reasons. GREEN: 90 unit passes, 16 SQL passes; build and API bundle pass. Tape is observational, not a transactional outbox; storage outages are logged and remain a transcript-reliability limitation. Shared additive migration and Azure model configuration applied; deployment verification follows.

2026-10-18 deployment ledger: core commits 4a53698/d941309 pushed; Azure run 39158340330 succeeded. Live workbench returned 7 stored nodes / 6 edges in request req-e43d759b-9b07-4998-9b96-118d607dae2a; API/tape/runtime separately verified. Model gpt-6-luna/high; 8,875 tokens, four model steps. Local modal displayed exact identities and source; test claim denied/deferred without persistence. Final usability fix retains explicit user quotations across bounded follow-ups (never assistant claims), compacts scope details and keeps decision actions visible. 91 unit + 16 SQL checks pass. Final polish deployment follows; no source metadata bulk import was started.

Product verification caught a three-row shell being laid out with two explicit CSS rows: the chat header intercepted Resume/Cancel clicks. Read-only browser hit testing reproduced the intercept, then verified the button itself receives the hit after adding the controls row. This is a product-surface fix, not a backend retry failure. Final UI build passed.

Final scope audit added a regression for a ReleaseGroup default explicitly restricted to one edition. Observed RED (leaked into another edition), then fixed resolver filtering and preparation/override membership checks. All 91 unit checks and four targeted SQL researcher checks pass; API bundle loads. Full 16-test SQL suite passed immediately before this narrow fix. Cancel and resumed exact decision were visibly verified in the corrected local workbench.
