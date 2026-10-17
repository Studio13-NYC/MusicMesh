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
| Domain classes and semantic catalog | Implemented and locally verified | 41 concrete entity classes, 11 structural relationship classes; 58 legacy labels and 56 predicates classified. Generated [reference](DOMAIN_MODEL.md). |
| Agent/API access to semantics | Discovery implemented; prompt integration pending | `src/domain`, constructor `.definition`, generated docs and `GET /api/ontology`; Azure route included. Prompt integration moves with writer enforcement to avoid conflicting with the old allow-list. |
| Import preparation and validation | Planned | Existing CSV and ListenBrainz receipt available; no new import yet. |
| MusicBrainz enrichment | Retrieval recovered; import pending | Later direct recording lookup returned HTTP 200 and correct Severed recording ID/title. Earlier 503 is not a permanent blocker. |
| AcousticBrainz enrichment | Access verified, import pending | Count and low-level data retrieved for Severed; not a coverage audit. |
| Replacement of old database data | Not performed | User says old data is not needed. Reset only as part of verified replacement process. |

## Credentials

Database and OpenAI settings exist. MusicBrainz/AcousticBrainz public reads need no key. Full ListenBrainz export requires retrieving the existing user token again; it was not stored by the earlier import. No Last.fm API key is configured in the checked project files or process environment; the CSV is sufficient for the baseline.

## Resuming

Read this file, the plan, `git status --short`, and `git log -5`. Root `.env` is production; use an explicitly selected isolated target for write tests. Do not repeat the earlier ListenBrainz submission. Record every implementation checkpoint, executed checks, actual import totals, and unresolved external-service failures here.

## 17 October — first implementation checkpoint

Implemented typed domain constructors, immutable machine-readable semantics, graph serialization, structural endpoint/reference validation, typed MBID identity, ordered artist credits, partial dates, source-event fields, acoustic analysis and similarity evidence fields. Every catalog entity definition has a concrete constructor. Structural relationship classes use explicit assertion keys so parallel assertions do not collapse.

Local `/api/ontology` was exercised by an HTTP integration test without database or model calls. The Azure route and domain files are included in the deployment bundle. `getOntologyPrompt()` exists, but prompt injection and graph-writer enforcement are deliberately deferred together; no new graph writes or database migration occurred in this phase.

Validation: `npm test` — 18 passed, 1 database integration test skipped (no isolated test database selected). `npm run build` passed with the existing large-bundle warning. `npm run check:api` passed; its Azure test-mode warnings mean bundle loading is verified, not a live Functions host. A fresh read-only code review found provider-identity and conditional-required-field bypasses; both were reproduced with failing tests and fixed, and the full suite passed again. Generated documentation is checked against the registry by a test.

Implementation commit `ae77a2b` is pushed and deployed. Azure run `39068182813` succeeded. The public `https://musicmesh.s13.nyc/api/ontology` endpoint returned HTTP 200, semantic version `1.0.0`, 41 entity definitions and 11 structural relationship definitions; the full JSON exactly matched the local catalog. This phase begins the process; it does not claim the 21,415 plays have been imported into MusicMesh or enriched.

The original CSV was rechecked: 21,415 rows and unique timestamp/artist/title combinations; SHA-256 `3d08352ed6a56b1e8f1d33c36609d1807f6773fe67244aa97cfd9afe5ca0feff` remains unchanged.
