# On-demand external links and acoustic comparisons

20 October 2026. Local rehearsal, deployment, main conversion, independent audit and live graph checks are complete. Reader/importer commit `b0d5dc1` deployed successfully in GitHub run `39424595708` before main conversion.

## Runtime contract

The existing `entities` and `relationships` tables hold the complete searchable graph directory. Every public ID, name, search value, endpoint, relationship type, provider role and attribute remains available to PostgreSQL queries. No edge is deleted. Domain classes and Prisma remain in place.

`src/coldGraph.js` stores complete eligible records in version-3 immutable private Azure pages using the existing evidence archive. Eligibility is restricted to imported MusicBrainz URLs, MusicMesh SimilarityAssessments, their ComparesRecording/SupportedByAnalysis edges, and imported MusicBrainz URL links. Chat-owned or edited rows are excluded. Claims, confidence history, sources, preferences, plays and identity mappings are never candidates.

An eligible row retains directory values and `extra.coldRef`. Bounded graph results, node detail and acoustic queries restore requested records. A containing page is never a public response. Evidence routes still authorize the owner and both relationship endpoints. Checksums, record identity, directory values and kind must match. A missing or corrupt page produces an error, never a fabricated empty neighborhood.

Verified pages use a process-local LRU cache capped at 32 MiB of serialized page data with a five-minute TTL; JavaScript object overhead adds memory beyond that serialized cap. Concurrent requests for the same page share a read. Hydration uses at most four workers per result set. Azure reads occur after graph read transactions finish. This cache does not insert anything back into Neon, so exploration cannot refill the database with archived payloads. A restart merely makes the next lookup fetch its page again.

Existing v2 metadata references inside a restored record still work. `expandRow` resolves cold storage then the earlier packed metadata when complete original data is required. Future packed imports detect `storage:cold-graph:v1`, retain this representation, reject conflicting edits and archive changed data before database writes. Chat cannot manufacture `coldRef`.

## Rehearsal and application

Use the dedicated existing local restoration, `127.0.0.1:55433/musicmesh_storage_20261019`, rather than the retired cloud validation branch. Never replace it with main to make a test pass.

```powershell
node --env-file=output/storage/2026-10-19/local-target.env scripts/compactGraphStorage.js prepare --cold --archive output/storage/2026-10-20/cold-graph-v1
node --env-file=.env scripts/importListeningHistory.js upload-evidence --archive output/storage/2026-10-20/cold-graph-v1 --upload-concurrency 16
node --env-file=output/storage/2026-10-19/local-target.env scripts/auditColdGraphStorage.js baseline-local output/storage/2026-10-20/cold-audit
node --env-file=output/storage/2026-10-19/local-target.env scripts/compactGraphStorage.js apply-local --archive output/storage/2026-10-20/cold-graph-v1
node --env-file=output/storage/2026-10-19/local-target.env scripts/auditColdGraphStorage.js verify-local output/storage/2026-10-20/cold-audit
node --env-file=output/storage/2026-10-19/local-target.env scripts/compactGraphStorage.js reclaim-local --archive output/storage/2026-10-20/cold-graph-v1
```

Preparation writes a new directory and checks exact roundtrip reconstruction. Upload is immutable; rerunning it reads and checksum-verifies every existing page. Apply locks each batch, compares the exact original or already-applied row, and checks the result. Concurrent changes stop the batch. Reclamation requires a successful apply receipt and briefly blocks table access. Do not reclaim routinely.

The following main sequence completed after local preservation/product checks and reader deployment. These commands require the dedicated main host and verified private backup/restoration receipts. Do not repeat maintenance routinely or overwrite baseline receipts.

```powershell
node --env-file=.env scripts/auditColdGraphStorage.js baseline-main output/storage/2026-10-20/cold-audit
node --env-file=.env scripts/compactGraphStorage.js apply-main --archive output/storage/2026-10-20/cold-graph-v1 --backup output/storage/2026-10-19
node --env-file=.env scripts/auditColdGraphStorage.js verify-main output/storage/2026-10-20/cold-audit
node --env-file=.env scripts/compactGraphStorage.js reclaim-main --archive output/storage/2026-10-20/cold-graph-v1 --backup output/storage/2026-10-19
```

Tests: `npm test`. Actual local PostgreSQL/Azure fixture: set `MUSICMESH_TEST_COLD=azure-local`, then `node --env-file=.env --env-file=.env.restore --test tests/coldGraphPostgres.test.js`. The fixture refuses main and removes only its generated IDs.

## Evidence and limits

Archive: 2,748 pages, 54,449,962 gzip bytes, manifest SHA-256 `3999a0c14179547ba48d68123a60da1bbacdb2e94f4d362b099be019d9b976d4`. All pages were uploaded and read back. The conversion covers 205,767 entities and 304,441 relationships; original graph counts remain 488,631 and 858,394. Earlier incomplete preparation `cold-graph/` is retained as a diagnostic artifact and must not be applied.

Independent local and main fingerprints matched every graph identity/directory field, every unaffected full row, 43,309 protected research/history entities and 718 protected relationships. These include 239 claims, 240 sources, 21,415 plays and 21,415 identity mappings. Changed records passed exact reconstruction, locked original-row comparison and SQL readback. All 488,631 entities and 858,394 relationships remain.

Local reclamation completed at 12:42 UTC: 828,711,439 bytes versus 894,695,091 before. Main conversion completed at 12:51:55 UTC, independent audit at 12:52:30 and reclamation at 12:54:08. Main application allocation is **829,759,488 bytes**; all databases on main total **852,623,360 bytes**, down from 918,822,912. Additional savings are **66,199,552 bytes**, with **147,376,640 bytes below decimal 1 GB**. This does not reach the exploratory 600-700 MB target: complete search/traversal directory rows and indexes remain online. Neon's immediate branch API still reported the earlier 919,445,504 bytes; the SQL measurement is newer. These measurements do not establish account-level plan eligibility.

Local and deployed API/agent tools restored the exact acoustic score `0.12743318485461932`, method and participants. The deployed Browse/Load and fullscreen graph displayed Ocean Way Recording's Discogs link (2 nodes/1 connection), the Rhythm similarity candidate (5 nodes/6 connections), and Champagne Supernova (29 nodes/45 connections) with the E-Bow claim, direct scope, 93/100 confidence and Sound On Sound source. These checks used no LLM calls or graph writes. The separate inspect drawer remained at "Loading node detail"; fullscreen connection inspection and the bounded node-detail API passed independently. This existing UI limitation is not claimed fixed.

Validation: default suite 123 passed, 22 opt-in skipped, zero failures; separate actual PostgreSQL/Azure fixtures passed hydration, bidirectional traversal, import refresh/replay and conflicting-edit preservation. UI build and API bundle passed.

Receipts under `output/storage/2026-10-20/`: `cold-graph-v1/`, `cold-audit/`, `cold-reads-local.json`, `cold-reads-main.json`, `cold-main-final-size.json`, `cold-local-ui.json`, `cold-main-ui.json` and local/main screenshots. Original database backups, source snapshots, v1 evidence and v2 metadata remain intact. Azure uses online Blob access; no offline Archive-tier rehydration, retention change, billing change or automatic blob deletion is part of this work.

Keep compatible readers deployed while `storage:cold-graph:v1` is active. An old reader cannot interpret these rows. Recovery must preserve research added after backup: restore backups into a separate empty database and reconcile changes, never overwrite current main with an older dump. The verified source pages allow reconstruction without losing identities.

The completion audit bundle is privately archived and readback-verified: `backups/storage-maintenance/2026-10-20-cold-5c55ee98ac25404ce4484dfc32b69d35b5ff737536be9eb4b75dcae8ccec9c98.json.gz` (132,266 bytes, 18 files). Receipt: `output/storage/2026-10-20/cold-audit-archive-receipt.json`. It includes the archive manifest, local/main preservation and operation receipts, API/UI observations, audit code, runtime commit and this report's completion checkpoint.
