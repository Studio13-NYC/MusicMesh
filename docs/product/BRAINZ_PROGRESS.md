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
| Agent/API access to semantics | Implemented and locally verified | Shared definitions in answer/preview/planning/grounding; typed chat writer, stored-catalog context and public acoustic evidence projection. Azure bundle loading verified. |
| Import preparation and validation | Prepared and reconciled locally | All 21,415 CSV events match the official ListenBrainz export. 20,448 plays have provider matches to 8,289 recordings; 967 remain unresolved. Baseline now loaded in isolated validation; production unchanged. |
| MusicBrainz enrichment | Recording retrieval started | Three live lookups passed; resumable worker started for all 8,289 matched recordings. Read local progress before claiming completion. Linked detail and acoustic passes remain pending. |
| AcousticBrainz enrichment | Coverage complete; feature collection running | 7,220/8,289 recordings have submissions, covering 17,766 plays. First 25 feature documents validated; full earliest-submission pass started. Comparisons/database activation pending. |
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

Import checkpoint `17db8ce` is pushed and deployed. Azure run `39073476798` succeeded. Public `/api/ontology` returned HTTP 200 and exactly matched local semantic catalog 1.1.0; an absent public node returned 404. Direct production reads still show 312 entities, 505 relationships and zero ListeningEvents, confirming this checkpoint did not activate the private catalog there.

## 17 October — AcousticBrainz coverage collection

Added `brainz:import acoustic-coverage`, using the same provider-cache mechanism with a separate explicit AcousticBrainz origin. It validates 25-ID count batches, verifies prepared-input hashes, honors exhausted-quota reset headers, distinguishes unavailable requests from absent data, and reports both distinct-recording and play-weighted coverage. Cached successes replay without network requests; failures remain retryable and unknown. No feature comparison or acoustic database import is claimed by count collection.

The initial 25-ID live diagnostic returned 20 recordings with analyses and five without. The full 8,289-ID pass then started as a hidden local process, initially PID 22180, independently of the MusicBrainz metadata worker. Live evidence is under `output/imports/2026-10-17/acousticbrainz/`; consult [HISTORY_IMPORT.md](HISTORY_IMPORT.md) for commands and interpretation. Tests cover invalid counts, unexpected IDs, unknown-versus-missing handling, repeated-play weighting, input tampering, 503 recovery, cache replay and quota headers. Read-only review found permanent negative caching of an aggregate HTTP 404; this was reproduced with a failing regression test and corrected so resumption retries those requests.

Validation after the coverage change: `npm test` passed 40 tests with four database-dependent skips. No runtime/UI files changed after the already verified import deployment. At 22:07 UTC, 2,000 recordings had been checked; 1,713 had available analyses, 287 were absent and the remaining 6,289 were still unknown. There were no failed batches in that observation. These partial counts do not establish final coverage or feature usability.

## 17 October — typed chat integration and completed acoustic coverage

The count audit finished at 22:13:32 UTC: 7,220 of 8,289 mapped recordings have submissions, 1,069 are absent and zero remain unknown. Available recordings cover 17,766 of 21,415 plays (82.96%); distinct mapped-recording coverage is 87.10%. The 391,369 submissions are multiple analyses of audio files, not distinct songs. Counts alone do not establish feature usability or similarity.

Replaced the label-only chat writer with validated domain objects and an atomic Prisma transaction. New identities use thread/turn/reference identity rather than names; parallel assertions remain separate. Existing provider records/assertions are reused without edits. Chat cannot invent provider IDs, relationship UUIDs, analyses or comparisons, but may reference existing public analyses. Private listens/mappings stay excluded. Unsupported relationships require a modeling/evidence decision; the 14 classes do not provide an unsourced local predicate for every musical claim.

Answer, preview, planning and grounding share the semantic registry. Normal chat and expansion receive selected-node context; the answer reads a bounded database neighborhood (up to 80 public nodes/160 edges). Grounding receives stored relationship IDs and provenance. Legacy incompatible rows are excluded from matching. Acoustic context retains measurements, units, versions and comparison methods/scores. Preview identities preserve same-title recordings and parallel edges.

Workbench testing exposed ordinary chat omitting graph selection and redundant name searches exhausting the four-connection pool. Both were corrected. The final browser request reused the existing I Think I'm Paranoid Recording and Work plus their MusicBrainz performance assertion. Tape event `evt-f79b6982-bbe9-4844-a989-d4ec29bb75e6` records two nodes/one relationship and `persist_graph`; database counts stayed at 60,449 entities/63,295 relationships and the imported recording hash was unchanged. Private evidence: `output/imports/2026-10-17/chat-validation-before.json`, `chat-validation-after.json`, `chat-catalog-validation.png`, and runtime/tape logs. This verifies reuse, not a new catalog import.

Validation: 48 default tests passed, eight database tests skipped by default; 12 targeted tests passed on explicit Neon validation. Build and Azure bundle loading passed (existing chunk-size and Functions test-mode warnings remain). Fresh review findings about acoustic references, legacy compatibility and stripped acoustic evidence were reproduced and fixed. Local restore port 55433 remains unavailable; its legacy test fixture was updated but not executed there.

Added `acoustic-features` with verified count evidence, retryable bulk requests, full local response caching and compact typed analyses. A live 25-recording pilot collected 25 valid analyses with no missing/unsupported/errors. Full collection started hidden (initial PID 53132); read `acoustic-features/progress.json` for current truth. Read-only review verified all 8,289 coverage identities against cached counts and all 25 pilot analyses. At 22:34 UTC, 100 analyses were collected without errors; MusicBrainz was at 4,442/8,289 successful lookups. No acoustic database writes or computed similarities are claimed here.

Ruling: first feature pass selects offset 0, the earliest available submission, for each available recording. Preserve total submission count and exact offset/content hash. This does not prove the analyzed audio equals the scrobbled file. Do not average versions, silently substitute submissions, infer influence, or download all 391,369 analyses. Version-compatible comparisons, linked MusicBrainz details and production history activation remain pending.

## 17 October — explainable acoustic comparison pilot

Typed chat/feature collection commit `3d1118d` deployed successfully (Azure run `39075734326`). Public ontology JSON exactly matched the local catalog. A production read at 22:38 UTC still found 312 entities, 505 relationships and zero ListeningEvents; this was a runtime deployment, not history activation.

Implemented deterministic comparisons separately for rhythm (BPM, onset rate, Essentia danceability) and timbre (13 MFCC mean coefficients). Cohorts require identical extractor version context, analysis sample rate, downmix and equal-loudness setting. Population z-scores exclude constant dimensions; RMS Euclidean distance retains up to three neighbors per recording, with unordered pairs deduplicated. Each assessment keeps the two analyses, exact cohort identity, method/version, distance meaning and per-feature differences. Missing/incompatible features, ambiguous multiple submissions and cohorts smaller than three are excluded explicitly. These are relative candidates, not calibrated perceptual similarity or evidence of influence, identity, or preference.

Fresh review found neighbor-selection settings changing the payload of an otherwise identical pair and numerical overflow producing false zero distances. Both were reproduced with failing tests and fixed: selection count stays in the run receipt, and non-finite normalization statistics are rejected. Separate review of the new snapshot integration verified identities, hashes and all 229 acoustic relationships without important findings.

The completed 25-analysis pilot produced 51 assessments in eight family/version cohorts, with 16 family-specific exclusions. Compiled `validation-snapshot-3` at 22:45 UTC: 68,264 entities and 88,481 relationships, including all 21,415 ListeningEvents, 25 AcousticAnalyses and 51 SimilarityAssessments. It includes 4,971 MusicBrainz lookups, 3,318 pending, 24 redirects and zero lookup errors/missing responses. Loaded only into the explicit Neon validation target; the receipt completed at 22:48 UTC. Its acoustic receipt explicitly says `limited`.

Actual workbench validation explained Omnibus (94.91 BPM) versus Deep in the Heart of Texas (161.58 BPM), distance 1.6258, a three-recording cohort and the first-submission limitation. The response did not call that pair globally similar. Stored evidence supplied the answer; tape assistant event `evt-52e04a41-cfd1-495a-b4fc-59aaab4efd22` and graph preview `evt-4a3ffcfa-302f-4a6e-9b39-69979bf686e9` record the result. Before/after database counts were unchanged. Private proof: `acoustic-ui-before.json`, `acoustic-ui-after.json`, `acoustic-workbench-validation.png` under `output/imports/2026-10-17/`.

Validation: 52 default tests passed, eight database tests skipped by default; all 12 targeted isolated tests passed. Build and Azure bundle loading passed with the existing warnings. Full replay at 22:53 UTC verified all 68,264 nodes and 88,481 relationships and created zero records; the receipt is `validation-snapshot-3/isolated-import-receipt.json`. At 22:51 UTC the recording worker had 5,272 successful lookups. Acoustic features had 1,000 collected and 25 errors from one batch exhausting three timeout attempts; errors remain retryable and are not classified as absent. Full collection and production replacement remain pending.

Ruling: comparison pilots remain explicitly limited. Recompute cohorts and pair identities after full feature collection; scores from different cohorts are not interchangeable. Keep the same immutable source events and database architecture. The full feature worker writes its final manifest only at completion, so its current `progress.json` can be ahead of the completed pilot manifest.


Comparison checkpoint `8553d01` is pushed and deployed (Azure run `39076958039`, success). Public ontology returned HTTP 200 and exactly matched the local catalog. Production read-only verification at 22:56 UTC remained 312 entities, 505 relationships and zero listens. Private receipt: `output/imports/2026-10-17/acoustic-comparison-deployment.json`. Remote annotated tags still resolve to the original `prebrainz` and `withBrainz` commits. At 22:56 UTC, both collectors were alive: MusicBrainz 5,522/8,289 successful; AcousticBrainz 1,175 collected, 25 retryable timeout errors. No production history activation is implied by deployment success.


## 17 October — selected-release catalog closure and timeout recovery

The ListenBrainz mapping evidence contains 2,655 distinct nonempty release MBIDs. Added a finite `fetch-catalog` pass: those selected editions first, direct listened-recording artists/works and edition release groups/billing artists next, then one layer of referenced labels, areas, places, instruments, events and series. Related artists/works beyond that boundary remain embedded identities. Raw response fields and actual provider relationship UUIDs are retained. This is not every edition containing every recording or any artist's full discography.

Ruling: use the provider-selected release IDs as catalog context, not as proof of the edition heard. Exact lookups avoid capped release-list subqueries; complete edition tracklists are checked against supplied counts. No browse pagination is necessary for this selected-ID pass. A future browse feature must paginate separately. Referenced sibling recordings remain context and create no ListeningEvents.

Semantic catalog 1.2.0 adds ReleaseLabel with exact catalog numbers and extends RedirectsTo to same-type provider entities. ReleaseGroup, Release, Medium, Track and Recording retain separate identities. Pregap and data-track positions are retained. Chat may reuse an existing ReleaseLabel assertion but cannot invent provider label evidence. Agent context includes edition dates, barcodes, catalog numbers, formats and track numbers. The shared Prisma storage schema is unchanged. Earlier version-1.1 snapshots remain historical; recompile with current code before loading, rather than replaying their versioned files into a changed catalog.

`fetch-catalog` shares the recording worker's `fetch.lock`, cache and rate-limited client. `--wait-for-lock` waits for a live owner and refuses a stale lock; it does not launch parallel MusicBrainz requests. Its waiting worker was started as hidden PID 9476, with `catalog-fetch.pid`, `catalog-fetch.log`, `catalog-fetch.error.log` and `musicbrainz/catalog-progress.json` under the run directory. No live release lookup or release UI import is claimed while it waits. The full catalog manifest is written only when a pass finishes; cached responses remain resumable after interruption.

AcousticBrainz interrupted at 1,325 collected / 150 timeout errors. Added adaptive splitting only after exhausted bulk timeouts, retaining successful cache entries and error distinctions. A resumed real pass recovered all 150 affected analyses. Fresh review found eager splitting bypassed the three-failure circuit breaker; split responses now stream to the caller so it can stop before issuing further requests. The final worker was restarted from verified cache as PID 46252, using `acoustic-features-resume-2.log` and `.error.log`. Read the PID/progress files for current state. No personal plays were resubmitted.

Fresh review also found catalog compilation could use stale recording evidence after a failed seed recording later succeeded. Compilation now verifies the seed IDs, response statuses and hashes and requires recollection if they changed. Both review findings were reproduced as failing tests and fixed. Tests also cover finite expansion, locking/waiting, cache replay, partial manifests, changed source identity, truncated tracklists, distinct track/recording identities, redirects and label semantics. At 23:14 UTC: MusicBrainz 6,461 successful recordings, AcousticBrainz 1,575 analyses with zero errors in the resumed pass, catalog worker waiting. Production remains unchanged.


Validation for this phase: 59 default tests passed, nine database tests skipped by default; all 13 targeted tests passed on explicit Neon validation. Build and Azure bundle verification passed with the existing chunk-size and Functions test-mode warnings. Release graph compilation is proven with fixtures and checked domain endpoints; actual provider release retrieval/workbench display awaits the queued collector. Remaining enrichment audit must also account for recording relation categories not requested by the original recording pass (such as place/event/instrument relationships); this checkpoint does not claim exhaustive recording metadata.


Commit `eb66a7d` deployed successfully in Azure run `39078487463`. Public `/api/ontology` returned HTTP 200 and exactly matched semantic catalog 1.2.0 (41 entity classes, 15 relationship classes) at 23:19 UTC. Production read-only counts remained 312 entities, 505 relationships, zero listens. Receipt: `catalog-deployment.json`. The local validation API was restarted on current code (PID 6052); its ontology also returned version 1.2.0. The stored validation pilot was not replaced.

Storage preflight: the isolated database currently occupies 288,669,696 bytes including indexes. The live Neon project API now reports `branch_logical_size_limit_bytes=1073741824` (1 GiB), unlike September's 512 MiB record. No plan or limit was changed. Check capacity again against the complete catalog before importing it. Evidence: `validation-storage-size.json` and the read-only project response. This does not establish the final enriched catalog's size.

## 17 October — complete recording relationship requests and source integrity audit

The initial recording request omitted several relationship categories. Added a full recording lookup to the finite catalog pass using all 13 categories in the official MusicBrainz API documentation. Order is now full recording relationships, selected releases, direct artists/works/groups, bounded context. Full recording payloads take precedence during compilation; both narrower and broader caches remain available as evidence. Outside linked recordings/releases/genres stay embedded unless independently selected. This adds 8,289 serial requests, at least about 2.5 hours at configured spacing before response time/retries. It closes the request-plan gap, not a claim that those responses have already been collected.

The waiting catalog worker was restarted after checking its PID, command and lock ownership; original recording/acoustic workers remain running. Current queued PID 63456 uses `catalog-fetch-v2.log` and `.error.log`. Manifest version 2 records requested relationship categories and the full-recording subset. Compilation rejects older closure manifests for recollection. Tests verify new place relationships enter the graph, related places are fetched, sibling tracks do not expand the listened seed list, and the complete raw recording payload supersedes the first pass.

Added read-only `audit-snapshot` to validate source identity, every original event/mapping, deterministic mapping links, exact mapped recording identities, graph hashes/classes/endpoints and actual per-class counts. Reports retain unavailable/error counts; collection completion is separate from database verification. Tests reject modified events even when snapshot hashes are recomputed, wrong source identity/class counts, missing mapping relationships and contradictory request counts.

Live file audit at 23:29 UTC: `validation-snapshot-4` has 74,001 entities/108,362 relationships and exactly 21,415 source events, 20,448 mapped/967 unresolved. It includes 7,161 first-pass recording lookups, 1,128 pending, 33 redirects and no recording errors/missing responses, plus the older 25-analysis/51-comparison pilot. `snapshot-4-audit.json` reports `collectionComplete: false`, `databaseVerified: false` and `databaseWritten: false`. This snapshot was not loaded. The isolated database remains snapshot 3; production was not changed.

Validation: 64 tests passed, nine database tests skipped by default; no failures. Tests cover the offline request/compile/audit changes; no UI/runtime modules changed and no new workbench completion is claimed. At 23:32 UTC the original MusicBrainz worker had 7,278 successful recordings; AcousticBrainz had 2,325 analyses with zero current-pass errors. Catalog worker remained queued. Actual expanded provider responses, completed comparisons, capacity verification, isolated full import and production replacement remain outstanding.
