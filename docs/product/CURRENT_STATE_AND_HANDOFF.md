# MusicMesh current state and handoff

Updated 18 October 2026. The deployed site and root `.env` select the shared **development** instance, not production. Never use Alexander. Keep `STAY/` and original source files intact.

## Researcher runtime

The [approved specification](../superpowers/specs/2026-10-18-researcher-design.md) and [implementation plan](../superpowers/plans/2026-10-18-researcher.md) define the current change. Local code now uses a single GPT-6 Luna/high Responses API researcher. Current runtime commit `ad5d6ff` deployed successfully in run 39159228539; verification is recorded below.

- `src/researchRunner.js`: one model call per durable step, tool-directed exploration, bounded history/context/calls. No automatic model preview, planner, grounder or review chain.
- `src/researchTools.js`: compact catalog search/detail/adjacency/neighbors, edition tracklist, acoustic comparisons, private-history aggregates, semantics, evidence, sources, scoped credits and factor comparison.
- `src/researchStore.js`: Prisma ResearchRun state, lease/version retries, transactional Approve/Deny/Defer actions. State expires after 24 hours; new runs remove up to 100 expired records. Save decisions before expiry. No authentication boundary is claimed.
- `src/enrichment.js`: all-tracks album defaults versus album-only credits; direct track/recording additions and named exceptions. Edition membership is checked. Provider assertions remain unchanged.
- `src/publicSource.js`: bounded public HTTPS text retrieval, validated and pinned DNS, bounded redirects. Private networks, unsupported documents and oversized pages are rejected. Source text is untrusted evidence. Source excerpts must be tied to their fetched URL or supplied explicitly by the user before review.
- `src/domain/`: typed SourceDocument/EvidenceAssertion fields and private PreferenceSignal; four explicit assertion/preference relationships. Generated DOMAIN_MODEL.md remains synchronized.
- Local and Azure APIs share `researchApi.js`: POST `/api/chat`, POST `/api/chat/decision`, GET `/api/chat/run?id=...`. The browser drives saved steps and renders retrieved graph IDs directly. Pending decisions appear in a Radix modal with exact subject/factor IDs, edition and overridden source claim; deferred runs have Resume and Cancel buttons. Expired in-flight leases require an explicit retry decision rather than silently repeating a potentially billed call.
- Default Nick / optional Guest attribution. Plays are not likes. Raw listening records remain excluded from graph tools; the single-owner development researcher can query listening aggregates.

## Verified data baseline

Shared backend: **182,221 entities, 368,477 relationships, 21,415 plays**, snapshot `main-development-snapshot-3`. Acoustic data includes 7,220 analyses and 31,357 comparisons including historical pilot comparisons. These counts describe the last verified backend receipt, not the ongoing collector.

Private provider evidence is in `samusicmesh/musicmeshevidence` in `rg-musicmesh`. The compact conversion was verified 18 October at 17:55:58 UTC, followed by compaction at 17:56:21. Main measured 702,447,616 bytes (669.91 MiB). Read [EVIDENCE_STORAGE.md](EVIDENCE_STORAGE.md) before import work. Future enrichment imports require a prepared/uploaded archive. No full database reread is needed for monitoring.

The expanded MusicBrainz collector continues independently; read `output/imports/2026-10-17/musicbrainz/catalog-progress.json` and the hourly state. Its `requested` is attempts so far, not a final total. Later downloaded data has not automatically been imported. Read [BRAINZ_PROGRESS.md](BRAINZ_PROGRESS.md) for receipts and chronology. Preserve the October-only allowance in [OCTOBER_NEON_BUDGET.md](OCTOBER_NEON_BUDGET.md).

## Commands and verification

```powershell
npm ci
npm run db:generate
npm run db:migrate
npm start
# Separate shell:
npm run dev
# Tests/build:
npm test
npm run build:api
npm run build
$env:MUSICMESH_TEST_DATABASE='isolated'
node --env-file=.env.restore --test tests/researchPostgres.test.js
```

Root `.env` is main. The local full restoration test database uses `.env.restore` and Docker container `musicmesh-evidence-validation` on 127.0.0.1:55433. Do not reset it. Existing UI/API processes may belong to other work; use a dedicated port for tests. `MUSICMESH_API_PORT=43102` with Vite `--port 3001` selects the test API proxy.

## Current limits

- Genre arrays/tags exist in archived provider payloads but are not yet normalized into complete queryable genre assignments. The aggregate reports this coverage gap while returning real play totals.
- Factor comparison covers direct reviewed recording assertions plus imported MusicBrainz recording credits and instrument descriptors; use `credits` for edition-aware inherited factors. Imported provider release credits remain album-only unless separately evidenced as all-tracks.
- The researcher can prepare a missing typed factor (such as equipment model, studio or person) together with its scoped evidence. The modal explicitly shows the new identity; no model assertion becomes provider evidence.
- Roon needs a local Core extension connection and verified credit capabilities. Qobuz needs granted developer access. Neither is claimed connected. Public source search requires BRAVE_API_KEY; public HTTPS text reads and supplied excerpts work independently.
- No automatic claim of why Nick likes a song: explicit preferences and evidence coverage are separate from listening frequency and acoustic distance.
- No Neo4j runtime, exporter/importer, driver, credential setting or rollback workflow remains. Historical Git commits and protected archives are history, not instructions.

## Local performance evidence

`output/researcher-live-local.json`: greeting 1,150 total tokens / 1.86 seconds; selected release country 2,691 tokens / 2.78 seconds. These are two live API examples, not a general latency guarantee. The old country run used 56,935 tokens across answer/plan/preview/review. New simple answers invoke no automatic downstream model stages.

## Review and pre-deployment verification

Fresh review of `db96e68..4a53698` identified six important findings and no critical findings. Fixed track/recording context resolution, edition restrictions in comparisons/genre aggregates, ReleaseGroup default exceptions, approval scope display, uncertain-call retry handling and prompt/decision tape logging. Added cancellation. Regression tests were observed failing before fixes, then passing. `npm test`: 91 passed / 16 opt-in skipped. Isolated SQL suite: 16/16 passed. `npm run build` and `npm run build:api` passed; existing UI bundle size warning remains. Local workbench proved real 7-node/6-edge graph, Defer/Resume/Approve, and Deny without writes.

18 October 19:19 UTC: additive `20261018190000_research_runs` migration applied to MusicMesh main. Azure model settings set to `gpt-6-luna` / `high`. Application deployment proof still pending. No bulk catalog reads/imports were performed for this change.

## Deployed proof — 18 October

Commit `d941309` deployed successfully in [run 39158340330](https://github.com/Studio13-NYC/MusicMesh/actions/runs/39158340330). Actual Edge workbench request `req-e43d759b-9b07-4998-9b96-118d607dae2a` completed with seven stored nodes/six edges, four researcher calls, 8,875 total tokens and 13,139 ms summed model latency. Runtime telemetry confirms `gpt-6-luna` / high. Tape contains both the user prompt and final answer. Proof: `output/researcher-live-deployed.json`, `output/researcher-deployed-graph.jpg`.

Final usability pass: compact approval details keep Approve/Deny/Defer visible; user-supplied source quotations can carry through the bounded recent user history. Assistant assertions and selected-node text do not become source evidence. Current tests: 91 unit passes and 16 isolated SQL passes. Transcript appends use stable IDs and ordinary retry suppression, but are observational rather than a transactional outbox; a storage outage can leave a tape gap even though run state is saved.

## Completion — 18 October 19:31 UTC

Core runtime `740bafa` deployed successfully in [run 39158974520](https://github.com/Studio13-NYC/MusicMesh/actions/runs/39158974520). Build, unit tests and Azure bundle checks all passed in CI. Actual deployed Defer -> full page reload -> Resume -> Approve completed request `req-5e8bbd40-a7dc-434b-a89e-748042a7342f` with the chosen answer; tape independently contains prompt, defer, approve and answer. Local Deny and Cancel stopped test enrichment without saving it. No fabricated claims remain in the catalog.

Deployed country lookup `req-cd250054-e0ab-48e8-9d5e-e93617876693`: South Korea (KR), 2,820 tokens / 3,121 ms end-to-end. This is a representative lookup, not a latency guarantee. Final graph workbench check again showed seven stored nodes/six edges; screenshot `output/researcher-deployed-graph.jpg`. Proof files include `output/researcher-deployed-country.json`, `output/researcher-deployed-decision.json`, and `output/researcher-enrichment-modal.jpg`.

Temporary test API/Vite processes and the local restoration container have been stopped; its data remains intact. Existing user services and the MusicBrainz collector were left running. Remaining work is content enrichment/source coverage and optional provider access, not the replaced orchestration. This implementation does not claim every instrument model, studio or personnel credit is populated.

Final visual verification: `ad5d6ff` deployed successfully in [run 39159228539](https://github.com/Studio13-NYC/MusicMesh/actions/runs/39159228539). Retrieved neighborhoods now place their most-connected node centrally, with neighbors around it; the seven-node/six-edge workbench view was visibly verified and saved in `output/researcher-deployed-graph.jpg`. Unit tests and deployment build/API checks pass. GitHub contains the complete runtime and handoff; no source changes remain untracked.
