# On-demand external links and acoustic comparisons

20 October 2026. Reader and importer implementation; main rollout is pending the local rehearsal and compatible reader deployment. See the dated receipts before assuming a database has been converted.

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

After local preservation/product checks and reader deployment, run `baseline-main`, then `apply-main --backup output/storage/2026-10-19`, `verify-main`, and `reclaim-main` using root `.env`. These commands require the dedicated main host and verified private backup/restoration receipts. Never overwrite baseline receipts after starting an operation.

Tests: `npm test`. Actual local PostgreSQL/Azure fixture: set `MUSICMESH_TEST_COLD=azure-local`, then `node --env-file=.env --env-file=.env.restore --test tests/coldGraphPostgres.test.js`. The fixture refuses main and removes only its generated IDs.

## Evidence and limits

Archive: 2,748 pages, 54,449,962 gzip bytes, manifest SHA-256 `3999a0c14179547ba48d68123a60da1bbacdb2e94f4d362b099be019d9b976d4`. All pages were uploaded and read back. The conversion covers 205,767 entities and 304,441 relationships; original graph counts remain 488,631 and 858,394. Earlier incomplete preparation `cold-graph/` is retained as a diagnostic artifact and must not be applied.

Independent local fingerprints matched every graph identity/directory field, every unaffected row, 43,309 protected research/history entities and 718 protected relationships. The fresh main baseline matches those same fingerprints. Local API/agent tools recovered the exact acoustic score, method and participants, and the app displayed Ocean Way Recording's Discogs link and the Rhythm similarity candidate graph. Local reclamation completed at 12:42 UTC: 828,711,439 bytes versus 894,695,091 before, saving 65,983,652 bytes. This does not reach the exploratory 600-700 MB target: complete search/traversal directory rows and indexes remain online. Main conversion is still pending at this checkpoint.

Receipts: `output/storage/2026-10-20/cold-graph-v1/`, `cold-audit/`, `cold-reads-local.json`, and the local screenshots. Original database backups, source snapshots, v1 evidence and v2 metadata remain intact. Azure uses online Blob access; no offline Archive-tier rehydration, retention change, billing change or automatic blob deletion is part of this work.
