# Current State And Handoff

Updated 17 October 2026, New York time.

## Current environment and data

The user explicitly clarified that **there is no production environment**. The deployed app at https://musicmesh.s13.nyc/ and dedicated Neon main branch are the shared development instance. Root `.env` selects that backend. `.env.migration` remains available for isolated tests. Do not delay loading available verified data behind a production-release gate. Do not use Alexander.

The initial `load-main` operation completed at 00:30 UTC on 18 October (20:30 New York on 17 October) for `output/imports/2026-10-17/main-development-snapshot-1`, replacing the disposable old generated graph. Direct PostgreSQL verification found 76,779 entities and 118,861 relationships, including all 21,415 ListeningEvents, 21,415 IdentityMappings, 11,429 Recordings, 7,013 Artists, 6,515 Works, 986 ArtistCredits, 7,930 URLs, 25 AcousticAnalyses and 51 SimilarityAssessments. Additional Recordings are linked context and redirect targets, not extra plays. Of the original plays, 20,448 have provider matches and 967 remain explicitly unresolved. The database occupies 344,195,072 bytes at this checkpoint.

The deployed graph API returned the imported catalog, and Edge loaded I Think I’m Paranoid with 60 nodes/90 relationships and provider recording details. An anonymous private-listen detail request still returned 404. Private receipts: `main-development-initial-import.json`, `main-development-read-verification.json`, and `main-development-workbench.png` under the run directory. A complete non-destructive replay finished at 00:35:53 UTC, verifying every entity and relationship and creating zero records. Commit `e956d87` passed GitHub deployment run `39083277247`.

The full AcousticBrainz refresh completed at 03:11:03 UTC on 18 October (23:11 New York on 17 October). At that checkpoint main contained **115,280 entities and 251,280 relationships**, including all 21,415 plays, 7,220 AcousticAnalyses and 31,357 SimilarityAssessments (31,306 full-data candidates plus 51 retained pilot candidates). The refresh added 38,501 entities and 132,419 relationships, updated explanatory text on 25 analyses, and deleted nothing. Direct PostgreSQL counts, a public comparison detail/subgraph (5 nodes/6 edges), and private-listen 404 passed. Database size is 588,201,984 bytes at this checkpoint. Targeted replay of all 25 refreshed analyses plus one new comparison created/updated zero records.

The live workbench explained GIRL ON TV versus The Desert Babbler using actual stored BPM/onset/danceability values and the 1,825-recording cohort limitation. Runtime request `req-a1bd17ce-ec60-4104-b595-a212b6bc7aae` completed `answer_only` with zero persisted graph objects. Its visual preview is distinct from the imported graph. Private evidence: `acoustic-full-main-verification.json`, `acoustic-refresh-targeted-replay.json`, `acoustic-full-runtime.json`, `acoustic-full-tape.json`, `acoustic-full-workbench.png` and snapshot 2's import receipt under the run directory. Code commit `e6b3d2d` passed deployment run `39092323551`; 66 default tests passed (11 DB tests skipped), five live isolated tests passed, build/API bundle checks passed.

The first frozen expanded-catalog checkpoint finished importing at **03:34:48 UTC on 18 October (23:34 New York on 17 October)**. Main now contains **182,221 entities and 368,477 relationships**, including all **21,415 plays**, 30,035 Tracks, 2,302 Media, 1,919 Releases, 1,817 ReleaseGroups, 9,222 Artists, 6,515 Works and the unchanged full acoustic evidence. The refresh created 66,941 entities/117,197 relationships and updated 8,324 entities/67,377 relationships with broader metadata and provenance. Nothing was deleted. Snapshot 3 has 182,170 entities/368,273 relationships; the difference is the retained 51 pilot comparisons/204 links. Database size: 905,715,712 bytes (about 864 MiB). Check capacity before the next large import; the last observed branch limit was 1 GiB.

Direct database counts, import receipt, public release detail and private-listen 404 passed. Garbage's selected Version 2.0 release has one CD medium, 14 Track nodes, 14 UsesRecording links and two label/catalog-number links; its public medium subgraph returned 43 nodes/72 edges with all 14 tracks and recordings. Edge loaded the release graph (60-node/90-edge display cap). Chat correctly explained the edition/group distinction, date, barcode, catalog numbers and uncertainty about the exact edition heard. Request `req-a8fff4db-97c6-4470-99f7-fd308d99d81f` completed `answer_only` with zero persisted objects; its 13-node/12-edge preview is separate from the stored graph.

**Known product limitation found by this test:** `readCatalogContext` retrieves only a one-hop neighborhood and `catalogProperties` omits release-country from raw provider data. The API/database contain country KR and the complete selected tracklist, but chat could not see those facts in this request. Improve bounded catalog retrieval and its field projection next; do not infer missing data or alter stored provider facts to compensate. No fix for this limitation is claimed here.

Private evidence under `output/imports/2026-10-17/`: `catalog-checkpoint-main-verification.json`, `catalog-release-structure.json`, `catalog-medium-public-subgraph.json`, `catalog-checkpoint-runtime.json`, `catalog-checkpoint-tape.json`, `catalog-checkpoint-workbench.png`, load-3 logs, and snapshot 3's import receipt. Code commit `f83c607` passed deployment run `39093302686`. Default tests: 66 passed, 12 DB tests skipped; six live isolated tests and build/API checks passed. The independent read verification exceeded Prisma's default five-second transaction timeout once; rerunning with an explicit 30-second read-only timeout passed. No write retry/reset was needed.

All 8,289 initial recording lookups are loaded, with 37 redirects and zero missing/error responses. Frozen checkpoint 1 pins 8,289 broader recording responses and 1,915 selected-release responses; later downloads are excluded until another explicit checkpoint/import. The live catalog worker is now fetching direct artists/works/groups: 11,238 successes and zero errors at 2026-10-18T03:35:13.065Z; bounded context follows. It remains running as PID 63456. Acoustic collection is complete: 7,220 available recordings cover 17,766 plays (82.96%); 31,306 full-data comparisons span 68 compatible cohorts. Retained pilot distances belong to different cohorts and must not be merged into the full-cohort distance scale.

Use [HISTORY_IMPORT.md](HISTORY_IMPORT.md) for exact commands. Main uses `load-main` with explicit target/source checks. For enrichment, supply `--previous-snapshot` pointing to the most recently loaded snapshot (currently `output/imports/2026-10-17/main-development-snapshot-3`). Updates compare against that imported baseline under row locks; user corrections fail rather than being overwritten. Omitted objects remain as historical evidence. This additive path does not synchronize provider deletions. Do not reset the database for routine enrichment.


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
