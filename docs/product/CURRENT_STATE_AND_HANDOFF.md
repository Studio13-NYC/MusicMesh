# Current State And Handoff

Updated 17 October 2026, New York time.

## Current environment and data

The user explicitly clarified that **there is no production environment**. The deployed app at https://musicmesh.s13.nyc/ and dedicated Neon main branch are the shared development instance. Root `.env` selects that backend. `.env.migration` remains available for isolated tests. Do not delay loading available verified data behind a production-release gate. Do not use Alexander.

The initial `load-main` operation completed at 00:30 UTC on 18 October (20:30 New York on 17 October) for `output/imports/2026-10-17/main-development-snapshot-1`, replacing the disposable old generated graph. Direct PostgreSQL verification found 76,779 entities and 118,861 relationships, including all 21,415 ListeningEvents, 21,415 IdentityMappings, 11,429 Recordings, 7,013 Artists, 6,515 Works, 986 ArtistCredits, 7,930 URLs, 25 AcousticAnalyses and 51 SimilarityAssessments. Additional Recordings are linked context and redirect targets, not extra plays. Of the original plays, 20,448 have provider matches and 967 remain explicitly unresolved. The database occupies 344,195,072 bytes at this checkpoint.

The deployed graph API returned the imported catalog, and Edge loaded I Think I’m Paranoid with 60 nodes/90 relationships and provider recording details. An anonymous private-listen detail request still returned 404. Private receipts: `main-development-initial-import.json`, `main-development-read-verification.json`, and `main-development-workbench.png` under the run directory. A complete non-destructive replay is being checked separately; do not infer its result from the initial import.

All 8,289 initial MusicBrainz recording lookups completed successfully, with 37 redirects and zero missing/error responses. The expanded catalog worker is now running its full recording-relationship pass; selected editions, direct artist/work/group lookups and bounded context follow. The AcousticBrainz feature worker is also running (over 5,300 collected at this checkpoint). The loaded snapshot includes only the completed 25-analysis comparison pilot. See live progress rather than assuming every downloaded response is already in the database.

Use [HISTORY_IMPORT.md](HISTORY_IMPORT.md) for commands and [BRAINZ_PROGRESS.md](BRAINZ_PROGRESS.md) for receipts and verification. Main imports use the explicit `load-main` command, exact source audit and known-host guard. Partial enrichment is allowed and reported. Exact replay rejects changed records; refreshed snapshots are not yet a general incremental enrichment updater. Check for new user work before any later replacement.

The object-oriented domain model and Prisma/PostgreSQL graph remain in place. Semantic catalog 1.2.0 exposes 41 entity and 15 relationship classes through `GET /api/ontology`, domain constructors and generated DOMAIN_MODEL.md. Typed chat reuses provider assertions without changing them. Personal listening events and mappings remain hidden from anonymous catalog routes; the catalog, works and public acoustic evidence are browseable. Existing conversation tape is retained, but old graph links may refer to the discarded graph.

The [standalone design](../research/2026-10-17-music-data-standards/MODEL_AND_IMPORT_DESIGN.md) and [implementation plan](../plans/2026-10-17-brainz.md) include the development-instance correction. `prebrainz` stays at `5a404fa`; `withBrainz` stays at cleanup/design checkpoint `c960400`. Neither tag means enrichment is complete. Source history, caches and import receipts remain private local artifacts. Keep `STAY/` untouched.

## Historical deployment terminology

The September record below used “production” for the public deployment. The user's current clarification supersedes that label; retain the record as migration evidence, not as a release restriction.

## Historical migration state — September 2026

Local and public production now use Prisma 7.10.0 and dedicated MusicMesh Neon PostgreSQL. **Cutover and public read/write verification are complete.** Read [NEON_MIGRATION.md](../deployment/NEON_MIGRATION.md) for project IDs, exact commands, verified data counts, backup/restore evidence, and cutover/rollback gates.

The dedicated MusicMesh Neon Free project contains all 306 source entities and 493 relationships. Every ID, label, property, direction and endpoint matched the final Aura export, including after restoring the final PostgreSQL dump into an isolated database. Search/detail/canonical lookup comparisons passed. Source Aura and all backups are retained.

The user approved a 10–15 minute maintenance window and deterministic capped traversal: nearest connections first, then stable IDs. Source ordering was undefined, so large-hub subsets can differ. Chat was paused for approximately ten minutes; maintenance is now off.

## Run locally

Root `.env` selects the shared main development backend. The ignored `.env.migration` selects an optional isolated validation branch for test fixtures. The historical production terminology below does not establish a production environment. Source credentials remain in the private local environment for export/rollback, but have been removed from Azure.

~~~powershell
npm ci
npm run db:generate
node --env-file=.env.migration src/index.js --check
node --env-file=.env.migration src/index.js
# In a separate terminal:
npm run dev
~~~

The check now verifies PostgreSQL schema reads, OpenAI and Playwright. Docker MCP is no longer an application runtime prerequisite. Neo4j's driver remains a development dependency solely for the read-only source exporter.

Validation commands:

~~~powershell
npm test
npm run test:db
npm run build:api
npm run build
node --env-file=.env.restore scripts/verifyMigrationReads.js output/migration/source-baseline/queries.json
~~~

The database integration test requires the separate musicmesh-restore-test container and ignored .env.restore. Ordinary npm test skips that integration test unless explicitly configured. The source comparison uses the unchanged restored baseline; the Neon validation branch has subsequent UI test updates.

## Product

MusicMesh remains a chat-first operator workbench with React, Vite, Radix, resizable panels and Cytoscape. The LLM answer, graph preview, grounding and persistence run through one pipeline. Back/Forward replays graph views; Expand routes through chat. Hidden canonicalStatus/isProposed maintenance metadata stays out of the operator workflow. Graph persistence must always be verified separately from the answer.

The graph storage port preserves the public API shapes, stable imported IDs, graph relationships, label catalog and canonical protections. Authentication behavior, Azure hosting, blob activity storage, and AI configuration were not changed. Existing handlers are anonymous; there is no application login flow to migrate.

## Production and evidence

Production: https://musicmesh.s13.nyc/ on unchanged Azure Static Web Apps (swa-musicmesh, rg-musicmesh, East US 2). Runtime release `5a404fa`, Actions run `34173029047`, succeeded. The existing main-push workflow now prebuilds and tests with Node 22.23.2, then deploys the verified UI and Functions bundles to Node 22.

Local PostgreSQL UI proof: output/playwright/neon-validation-graph.png. Request req-6d0fab69-4ca1-43a8-8a81-e6f7875a0e81 saved five nodes and four relationships with no skipped edges. Runtime and tape evidence live under output/chat/.

Public request `req-8ea6edce-068e-470c-8f70-ff730819d957` saved five matched R.E.M. entities and four membership relationships. Direct PostgreSQL queries, blob tape, runtime completion and saved-graph reload all confirmed it. No matching request writes occurred in Aura. Evidence: `output/migration/public-write-verification.json`, `public-read-verification.json`, and `output/playwright/neon-production-graph.png`.

Known pre-existing limitation: 22 older graph-update entries in the inspected blob-tape window reference IDs absent from the final Aura source. Those old graph links cannot reload; the original chat history is intact. Current IDs were preserved and the new saved graph reloads. No guessed remapping was performed.

Keep Aura and all backups. Backups currently reside on this workstation; no off-machine backup automation was provisioned. After new PostgreSQL writes, rollback requires reconciliation, not only redeploying old code. See the migration document.

## Protected work and cleanup

STAY/ and the clean-sheet archive remain protected. The October cleanup removes the obsolete July Neo4j snapshot under the user's instruction that previous generated data is no longer needed. Private source history and captured audio remain locally available and explicitly ignored. See the repository audit for the exact scope.
