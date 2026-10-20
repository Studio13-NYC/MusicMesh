# Reduce Neon storage without losing the graph

Nick authorized this work on 19 October 2026. The shared development graph must fit the previous 1 GiB allowance with headroom. Billing changes are outside this task.

## Baseline

488,631 entities, 858,394 relationships and 21,415 plays occupy 2,222,186,496 bytes. All research is retained. Most space belongs to MusicBrainz relationships and their repeated source metadata; estimated table bloat alone cannot solve the problem. The existing private Azure evidence container is `samusicmesh/musicmeshevidence`, in `rg-musicmesh`.

## Execution and acceptance

1. Export one transactionally consistent full database backup, including research, operational state and migration/import receipts. Save it privately in Azure and verify a local restoration against server-side fingerprints. Preserve earlier source snapshots and research backups.
2. Rehearse storage changes against that dedicated local restoration, never reset the older validation database. Measure actual table/index allocation. Prefer lossless evidence compaction and removal of demonstrably redundant storage; retain identities, typed relationships, queryable credits, acoustic measurements, source access, confidence history and privacy boundaries.
3. Test the storage codec and import/replay behavior before shared writes. Existing research edits must survive. Deploy any required reader support before changing shared data.
4. Apply the proven migration with guarded target selection, bounded writes, concurrency checks and resumable receipts. Reclaim allocated space only after preservation checks pass.
5. Verify all graph identities/relationships and research/history content independently; test the actual deployed Discovery view and source access. Measure the resulting database and confirm account limits before calling it downgrade-ready.

Evidence and executable operational scripts are under `output/storage/2026-10-19/`. This document is the execution plan; the running report records measured completion. Do not equate a smaller JSON estimate with reclaimed PostgreSQL storage.

## Verified outcome

Main conversion and reclamation completed on 19 October, followed by independent preservation and deployed graph checks. Allocation fell from 2,222,186,496 to 896,147,456 bytes (59.7%) while retaining every graph record and all research/history. See [completion report](../research/2026-10-19-neon-storage-reduction.md). The obsolete cloud test branch was deleted with explicit approval on 20 October; verified Azure backup and local restore remain. Only main remains and Neon's refreshed logical size is 919,445,504 bytes. Deployed graph/evidence checks passed again. Account downgrade eligibility and effective date still require checking. Billing is unchanged.
