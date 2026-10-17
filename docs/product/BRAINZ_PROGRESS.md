# Brainz progress report

Updated 17 October 2026, New York time. This is the running implementation record.

## Agreed direction

Use the [standalone design](../research/2026-10-17-music-data-standards/MODEL_AND_IMPORT_DESIGN.md) and [implementation plan](../plans/2026-10-17-brainz.md). Improve the domain structure with actual classes and machine-readable semantic definitions. Keep Prisma, PostgreSQL, the generic graph persistence architecture, and the operator workbench. Import the user's 21,415-play history and enrich its catalog, not the entire global catalog. The previous generated graph is disposable and must not be reused as evidence.

## 17 October — preparation

- Compared local `main` with GitHub: both at `a9cb4d7` before changes.
- Confirmed last successful Azure build: `5a404fa`, run `34173029047`; created annotated `prebrainz` tag at that commit.
- Audited tracked files, untracked research/history, active UI imports, and CI deployment behavior. [Audit details](../research/2026-10-17-music-data-standards/REPOSITORY_AUDIT.md).
- Original history stays local and ignored; importer and documentation are source-controlled. GitHub is public. Credentials and captured music are excluded from Git.
- The `withBrainz` checkpoint is documentation and cleanup before domain/import implementation. It must never be described as a completed import.

## Implementation status

| Work | State | Evidence / limitation |
|---|---|---|
| Repository cleanup and preparation | Complete and pushed | `c960400`; both annotated tags verified on origin. Azure run `39067600782` succeeded. Private/generated files ignored; no untracked leftovers at checkpoint. |
| Domain classes and semantic catalog | Implemented and deployed | 41 concrete entity classes, 14 relationship classes in semantic version 1.1.0; 58 legacy labels and 56 predicates classified. Generated [reference](DOMAIN_MODEL.md); public ontology matches local catalog. |
| Agent/API access to semantics | Discovery implemented; prompt integration pending | `src/domain`, constructor `.definition`, generated docs and `GET /api/ontology`; Azure route included. Prompt integration moves with writer enforcement to avoid conflicting with the old allow-list. |
| Import preparation and validation | Prepared and reconciled locally | All 21,415 CSV events match the official ListenBrainz export. 20,448 plays have provider matches to 8,289 recordings; 967 remain unresolved. Baseline now loaded in isolated validation; production unchanged. |
| MusicBrainz enrichment | Recording retrieval started | Three live lookups passed; resumable worker started for all 8,289 matched recordings. Read local progress before claiming completion. Linked detail and acoustic passes remain pending. |
| AcousticBrainz enrichment | Access verified, import pending | Count and low-level data retrieved for Severed; not a coverage audit. |
| Replacement of old database data | Isolated validation replaced; production pending | Verified snapshot and replay in Neon validation. Production cutover follows chat-writer enforcement and remaining enrichment. |

## Credentials

Database and OpenAI settings exist. MusicBrainz/AcousticBrainz public reads need no key. The full ListenBrainz export was obtained through the signed-in Edge session without saving an API token. No Last.fm API key is configured in the checked project files or process environment; the CSV is sufficient for the baseline.

## Resuming

Read this file, the plan, `git status --short`, and `git log -5`. Root `.env` is production; use an explicitly selected isolated target for write tests. Do not repeat the earlier ListenBrainz submission. Record every implementation checkpoint, executed checks, actual import totals, and unresolved external-service failures here.

## 17 October — first implementation checkpoint

Implemented typed domain constructors, immutable machine-readable semantics, graph serialization, structural endpoint/reference validation, typed MBID identity, ordered artist credits, partial dates, source-event fields, acoustic analysis and similarity evidence fields. Every catalog entity definition has a concrete constructor. Structural relationship classes use explicit assertion keys so parallel assertions do not collapse.

Local `/api/ontology` was exercised by an HTTP integration test without database or model calls. The Azure route and domain files are included in the deployment bundle. `getOntologyPrompt()` exists, but prompt injection and graph-writer enforcement are deliberately deferred together; no new graph writes or database migration occurred in this phase.

Validation: `npm test` — 18 passed, 1 database integration test skipped (no isolated test database selected). `npm run build` passed with the existing large-bundle warning. `npm run check:api` passed; its Azure test-mode warnings mean bundle loading is verified, not a live Functions host. A fresh read-only code review found provider-identity and conditional-required-field bypasses; both were reproduced with failing tests and fixed, and the full suite passed again. Generated documentation is checked against the registry by a test.

Implementation commit `ae77a2b` is pushed and deployed. Azure run `39068182813` succeeded. The public `https://musicmesh.s13.nyc/api/ontology` endpoint returned HTTP 200, semantic version `1.0.0`, 41 entity definitions and 11 structural relationship definitions; the full JSON exactly matched the local catalog. This phase begins the process; it does not claim the 21,415 plays have been imported into MusicMesh or enriched.

The original CSV was rechecked: 21,415 rows and unique timestamp/artist/title combinations; SHA-256 `3d08352ed6a56b1e8f1d33c36609d1807f6773fe67244aa97cfd9afe5ca0feff` remains unchanged.

## 17 October — history preparation and retrieval

Downloaded official ListenBrainz export job 5949 through Edge. Reconciled all 21,415 events against the CSV by exact submitted fields and timestamp, with zero missing/extra events. Provider mappings cover 20,448 plays and 8,289 distinct recordings; 967 plays remain unresolved and are preserved. Created immutable source-event and mapping domain objects, serialized locally with checksums and deterministic IDs. No CSV record was dropped or re-submitted.

Implemented `brainz:import prepare` and `fetch-recordings`, with strict CSV parsing, exported-account validation, duplicate occurrence handling, explicit ambiguous matches, checksum-verified resumption, serialized requests, Retry-After and bounded retries. The first pass retrieves recordings and their included credits/relationships; it does not yet materialize the whole linked catalog or write PostgreSQL. [Exact commands and limitations](HISTORY_IMPORT.md).

Validation: 29 tests passed and one existing isolated-database test skipped; `npm run build` passed. Initial failing tests covered missing implementation, official export directory handling and duplicate occurrence reuse; each was made green. Three real recording responses passed validation. Repeating preparation returned the identical manifest and verified payload hashes. Full recording retrieval started in a hidden process, initially PID 48996; current truth is in `output/imports/2026-10-17/musicbrainz/progress.json` and the process/log files, not this historical PID.

Ruling: use the signed-in official export rather than retrieve/save an API token — the exported data includes the needed provider matches; future refreshes require another export or a separately configured token.

## 17 October — isolated catalog import and workbench validation

Implemented checksum-validated graph compilation and typed Prisma batch persistence without changing the Entity/Relationship storage architecture. Semantic version 1.1.0 adds CreditsArtist, MusicBrainzRelationship and RedirectsTo. Provider relationship UUIDs, canonical direction, dates, attributes, observation hashes and definition URLs remain accessible. Embedded linked entities are distinguished from full lookups and unresolved mapped placeholders.

The first fixed snapshot contains 60,449 entities and 63,295 relationships, including all 21,415 plays and 21,415 mapping records. It includes 2,336 fetched recording responses, 13 redirects, 5,953 pending responses and zero failures at compile time. Node totals: 9,119 Recording, 3,862 Artist, 585 ArtistCredit, 1,912 Work and 2,141 Url. Extra Recording objects are linked context/redirect targets, not additional scrobbles. All 967 unresolved plays are retained.

Loaded explicitly into the existing Neon validation branch using `.env.migration`; production was not reset. Local restore on port 55433 was unavailable, so that infrastructure limitation is recorded rather than bypassed. Replayed the full snapshot without replacement: 60,449 nodes and 63,295 relationships verified, zero records created. Receipt completed at 21:59 UTC. [Commands, exact targets and limitations](HISTORY_IMPORT.md).

Read paths now exclude private source-event and mapping classes before search, degree counts, direct detail and traversal. Private nodes cannot bridge otherwise public nodes. Missing and private IDs both return HTTP 404. Schema discovery uses aggregate type queries and semantic definitions instead of reading all payloads. UI identity handling retains distinct same-title recordings and parallel assertions; MusicBrainz edges show provider names, and Work has a separate filter group.

Browser validation on the local workbench backed by Neon validation loaded Severed as a still-pending recording and These Are the Times with billing metadata. I Think I'm Paranoid loaded a 44-node/53-edge neighborhood including artists, its distinct Work, recording versions and public URLs. Provider relationship labels and filter groups rendered correctly. Screenshot: `output/imports/2026-10-17/validation-workbench.png`. The inspector currently exposes raw provider JSON; a polished evidence display remains future UI work. Chat writes were disabled on this local validation server because the old writer is not migrated yet.

Validation: 35 default tests passed, four database-dependent tests skipped; all three Brainz integration tests passed separately on the explicit Neon validation target. Build and Azure bundle loading passed (existing large-chunk and Functions test-mode warnings remain). Fresh read-only review found a cached-client target-switch hazard and insufficient stored-endpoint validation. Both were reproduced as failing tests and fixed; full replay and integration tests passed afterward. Local HTTP checks verified catalog detail 200, private/absent detail 404. Private evidence: `validation-read-verification.json`, `validation-replay.log`, and the snapshot receipt under `output/imports/2026-10-17/`.

At 22:01 UTC the existing collection worker was still running: 2,911 of 8,289 responses successful, zero failed/missing responses. This is a point-in-time observation; inspect `musicbrainz/progress.json` for current state. No second MusicBrainz worker was started. Next implementation work remains semantic prompt/chat-writer enforcement, linked release/work/artist detail closure, AcousticBrainz coverage/comparisons and production activation. Full collection and complete product migration are not claimed by this checkpoint.
