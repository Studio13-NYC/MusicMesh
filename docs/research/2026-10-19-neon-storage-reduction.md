# Lossless Neon storage reduction

19 October 2026, New York. Nick authorized moving additional data to Azure while preserving the complete graph and research. No billing change is part of this operation.

## Current checkpoint

The main conversion, reclamation, independent preservation audit and deployed workbench checks passed. Conversion completed at 01:00:20 UTC on 20 October (9:00 p.m. New York on 19 October); reclamation completed at 01:00:41 UTC. The reader and incremental importer are deployed in commits `80b380f` and `2577821`; GitHub runs `39348409177` and `39349676969` succeeded. Retiring the obsolete test branch remains a separate pending approval; billing is unchanged.

| Measurement | Bytes |
|---|---:|
| Main before storage changes | 2,222,186,496 |
| Full local graph after conversion, new indexes and reclamation | 894,695,091 |
| Main after verified conversion and reclamation | 896,147,456 |
| Reclaimed from main | 1,326,039,040 |

All 488,631 entities, 858,394 relationships and 21,415 plays remain. Main is **59.7% smaller**, at 896 MB / 854.6 MiB. This is 177,594,368 bytes below the formerly observed 1 GiB limit, or 103,852,544 bytes below a decimal 1 GB threshold. These are database headroom figures, not whole-project billing eligibility: other branch/database and retained-history usage still matter.

## What moved and what remains

PostgreSQL retains the typed graph, searchable attributes, dates, roles, relationship attributes, acoustic features and comparison scores. All research claims, confidence assessments/history, sources, assertion links, listening events and identity mappings are excluded from this compaction.

Private Azure Blob Storage in `rg-musicmesh`, account `samusicmesh`, container `musicmeshevidence`, now holds 5,601 additional immutable pages containing exact original metadata (193,940,168 gzip bytes). These pages consolidate raw fragments, observations, source envelopes, references to older archived evidence, detailed explanations and redundant relationship bookkeeping. Every changed row passed an exact reconstruction check before upload. Every page passed upload verification. The original individual evidence documents remain intact.

Graph IDs and every relationship endpoint/type remain unchanged. Redundant MusicBrainz identity values are reconstructed from validated stable IDs and also preserved in the archive. Two large composite indexes were replaced with smaller indexes on the leading query fields; primary keys, both endpoint access paths, labels and type indexes remain. No music relationships were removed.

The app retrieves archived details only when requested through the owning public graph record. Existing source retrieval still works. `field=details` returns that record's metadata, never its containing page; `field=explanation` supplies acoustic context. Private records remain inaccessible. Normal graph traversal does not download pages.

## Preservation and product proof

- Full transactionally consistent main backup: all five tables restored locally and matched the original server-side fingerprints.
- Local and main migrations: 442,429 entity rows and 535,259 relationship rows converted; every changed row passed locked comparison and exact readback. Concurrent changes cause a conflict and rollback; retry is idempotent.
- Independent local and final main audits: every graph identity, endpoint/type and retained query field matched the pre-migration main baseline. All 239 claims, 240 sources, 718 assertion links, 21,415 listening events, 21,415 mappings and 22 research-run records matched exactly. Audits explicitly use `COLLATE "C"` when ordering IDs because Neon and local PostgreSQL have different default collations.
- Both local and freshly reloaded deployed fullscreen workbenches retained Champagne Supernova's 29 nodes and 45 connections, with the E-Bow claim at 93/100, direct scope and source link. Deployed Browse/Load used the title search and no LLM call or graph write.
- API checks restored Version 2.0's original provider evidence and metadata, retained the medium's 14 tracks, and rejected private node/relationship evidence with 404.
- Default suite: 118 passed, 21 opt-in skips, zero failures. Separate actual PostgreSQL/Azure tests passed packed import/create/refresh/replay, preservation of user corrections, existing relationship matching, rollback and idempotent storage updates. UI build and Azure API bundle verification passed.

## Backups and recovery

The main custom-format PostgreSQL backup is `output/storage/2026-10-19/main-before-storage-verified-tls.dump` (194,517,200 bytes), SHA-256 `5a26bf358a4fa4c5a14a94fb46836313c3c289f89e71aca345c037191640a229`. Its private Azure blob is `backups/database/2026-10-19-5a26bf358a4fa4c5a14a94fb46836313c3c289f89e71aca345c037191640a229.dump`. A complete Azure download matched the checksum. Restoration to `127.0.0.1:55433/musicmesh_storage_20261019` matched every original table before conversion.

The obsolete `migration-validation` branch has a separate 27,956,963-byte backup, SHA-256 `344119c7e2e29b719838cfe9d8f402807f68dc17d2747827a71d797d7b749ea4`, under `backups/database/validation-2026-10-19-344119c7e2e29b719838cfe9d8f402807f68dc17d2747827a71d797d7b749ea4.dump`. Its local restoration in `musicmesh_validation_archive_20261019` matched all 68,264 entities, 88,481 relationships and other tables. Deletion of the cloud test branch is awaiting Nick's separate decision; it has not been deleted.

Restore backups into a **new empty database**, using PostgreSQL 17 `pg_restore --no-owner --no-acl --dbname <new-local-database> <dump>`, then compare the saved restoration fingerprints. The backups contain the original inline metadata and graph state; do not restore over a live graph with newer research. Keep the earlier research-file backup, original Last.fm CSV, snapshots and all Azure evidence versions. No automatic blob cleanup is implemented or authorized.

## Commands and receipts

Run from `D:\Studio13\Lab\Code\MusicMesh`. The packed archive is `output/storage/2026-10-19/packed-evidence-v2/`; its manifest SHA-256 is `3296ee11bc1669477f8c03f5aa0e68444a10c5e1bd7a5459179e47e7478fc6f8`. The similarly named earlier `packed-evidence/` folder is an incomplete preparation attempt and must not be used.

```powershell
# Dedicated local rehearsal only:
node --env-file=output/storage/2026-10-19/local-target.env scripts/compactGraphStorage.js apply-local --archive output/storage/2026-10-19/packed-evidence-v2
node --env-file=output/storage/2026-10-19/local-target.env scripts/compactGraphStorage.js reclaim-local --archive output/storage/2026-10-19/packed-evidence-v2

# Main, after reader deployment, verified backup, archive and local audit:
node --env-file=.env scripts/compactGraphStorage.js apply-main --archive output/storage/2026-10-19/packed-evidence-v2 --backup output/storage/2026-10-19
node --env-file=.env scripts/compactGraphStorage.js reclaim-main --archive output/storage/2026-10-19/packed-evidence-v2 --backup output/storage/2026-10-19
```

Prisma migration `20261020003000_compact_graph_indexes` must also be applied. `prisma.config.ts` selects `DIRECT_URL`; for local migrations explicitly set **both** `DATABASE_URL` and `DIRECT_URL` to the intended local database before `npx prisma migrate deploy`. Never rely on overriding only `DATABASE_URL`, because the root environment contains main's `DIRECT_URL`.

The migration checks targets and archive file checksums, requires the verified backup and archive for main, uses a graph-writer lock per batch, and records exact verification in `apply-*-receipt.json`. Reclamation requires a verified apply receipt and holds the graph-writer lock while `VACUUM FULL` briefly blocks table reads. It is not recurring maintenance. A running receipt or UPDATE completion alone is not proof of reclaimed storage.

Independent audit script/receipts: `output/storage/2026-10-19/verify-storage.cjs`, `baseline-main.json`, `verify-local.json` and `verify-main.json` (state `verified`). Backup receipts, Azure readback checks, `deployed-workbench-verification.json` and operation logs are in the same directory. Future imports detect `storage:packed-evidence:v2`, use exact baseline comparisons and preserve this representation; inline-only/replacement bulk loads are rejected.

A private, readback-verified Azure bundle preserves 19 audit files and this report's completion checkpoint: `backups/storage-maintenance/2026-10-19-b78004a617a5385bb58f5472094e919e0507126a9d35dacc354f103818280691.json.gz`. Its receipt is `audit-archive-receipt.json`. The temporary local API/Vite processes used for testing were stopped; the previously running PostgreSQL validation container and both restored databases remain intact.

## Free-plan decision

Main's final measured size fits below the former storage threshold. The obsolete test branch is still reported at 312,147,968 logical bytes; this cannot simply be added to main to infer billed incremental storage. Its removal is awaiting Nick's separate approval. Backups and a verified local replacement are ready.

Immediately after reclamation, Neon's branch API still reported the old main size, 2,245,615,616 bytes, with an update timestamp preceding reclamation. The SQL measurement is fresh; the provider counter is stale. The project still reports subscription `build`, a 5 GiB branch limit, six-hour history retention, and the consumption-period end at 2026-11-01T00:00:00Z. Transfer remained 1,260,243,181 bytes in that response; this lagging counter does not establish the full cost of this operation. Evidence: `neon-after-storage.json`.

A second bounded check at 01:06 UTC measured **918,880,256 bytes across every database on main**, including PostgreSQL/template overhead (the application database had settled to 896,016,384 bytes). The branch API still had not reflected the reduction. Evidence: `main-branch-databases.json` and `neon-refreshed-branches.json`. Thus main's complete live database allocation fits below 1 GB, but the additional branch and provider eligibility still prevent a whole-project downgrade claim.

Confirm refreshed project usage, the test-branch decision and the account's actual downgrade eligibility before changing plans. The public [Neon plans documentation](https://neon.com/docs/introduction/plans) describes a Free per-project storage allowance; the account's effective limit and other projects also need checking. No plan downgrade, retention change, extra subscription or Prism migration has occurred. Azure free-tier eligibility is not asserted.
