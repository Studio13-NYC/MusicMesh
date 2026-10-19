# October-only Neon capacity window

Recorded 18 October 2026; updated after the final import on 19 October. America/New_York.

## User direction

Nick reported reaching 100% of the monthly 5 GB network-transfer allowance and upgrading to 25 GB. The increased allowance is for **October 2026 only**. Complete necessary bulk MusicMesh database work in this window; do not assume a continuing paid allowance in November. This does not authorize additional paid upgrades or changes to other projects. Keep the existing OO domain classes, Prisma, Neon and Azure architecture.

Operational completion target: **30 October**, leaving time to review the plan before the current consumption period ends at **2026-11-01T00:00:00Z (31 October, 8 p.m. New York)**. The upgrade does not itself establish a scheduled downgrade. A one-time Codex review reminder is active for 30 October at 10 a.m. local time (`review-october-only-neon-upgrade`); it checks completion/capacity and reminds Nick, but does not change billing or run bulk jobs.

## Verified state and limits of the evidence

- MusicMesh project `withered-grass-63686198` reports owner subscription `build`, updated 2026-10-18T16:32:42Z, and a 5 GiB branch logical-size limit. The previous observed main limit was 1 GiB. Account-specific limits take precedence over generic public plan comparisons.
- The new consumption period starts 2026-10-18T16:32:41Z and ends 2026-11-01T00:00:00Z. The project response reported zero transfer just after the upgrade; that is not evidence that October's earlier 5 GB was unused or refunded. The 25 GB allowance is user-reported, not independently returned by that response.
- Final enrichment is imported and independently verified on 19 October: 488,631 entities, 858,394 relationships and 21,415 plays. All research and listening-history preservation checks passed. Main allocation is **2,222,186,496 bytes (2.22 GB / 2.07 GiB)**, which does **not** fit the former 1 GiB limit. Relationships including indexes occupy 1,410,285,568 bytes; entities including indexes occupy 802,799,616 bytes. Further measured storage reduction is required before downgrade. Do not delete research or assume a month rollover or table maintenance will solve this.
- The bounded collection is complete: 71,249 successes, zero errors/pending requests. The final archive has 389,733 verified documents / 300,375,746 compressed bytes in private Azure storage. MusicBrainz downloads and local compilation did not use Neon egress. The hourly monitor is paused after final verification; the October 30 capacity review remains active.
- Neon returned 509,167,979 transfer bytes both before and immediately after this import. These lagging observations do not establish actual import transfer or prove zero additional usage. Private evidence: output/imports/2026-10-19/neon-before-metadata.json and neon-after-metadata.json. No billing change occurred.
- `pg_stat_statements` was not installed in the checked database. No historical per-query attribution is available; no statistics were reset and no extension was installed for this audit.

## Transfer diagnosis

Before commit `8fd9b62`, `src/domain/repository.js` read complete inserted/existing records for verification, and complete endpoint entities again for each 200-relationship batch. Refresh also read old complete rows. The deployed implementation now compares exact rows/baselines in PostgreSQL and returns conflict IDs/counts, with bounded endpoint projections. Raw provider JSON makes these wide records. These are verified code paths, but they are not exact billing attribution.

A local-only scan of snapshot 3 estimated 432,569,516 bytes of entity JSON, 367,687,250 bytes of relationship JSON, and **1,540,254,294 bytes of repeated endpoint payload** across 1,842 relationship batches (391,683 endpoint returns). Total: **2,340,511,060 bytes (~2.34 GB) for those read shapes in one full pass**, before refresh pre-reads, protocol/serialization differences and other queries. This is a payload estimate, not measured Neon wire usage. Private evidence: `output/imports/2026-10-17/neon-egress-code-estimate.json`. The estimate was computed locally, without rereading the Neon graph.

Neon meters public database-to-client traffic. Verification reads and full dumps count; MusicBrainz requests and local processing do not. Client-side `pg_dump` compression does not reduce Neon transfer. Sources: [network-transfer documentation](https://neon.com/docs/introduction/network-transfer), [billing documentation](https://neon.com/docs/introduction/manage-billing).

## Remaining October work, in order

1. **Reduce importer verification transfer and validate a compact storage representation before the next bulk load.** Preserve exact conflict detection, baseline comparison, row locks, endpoint/type validation and transaction rollback. Move large equality checks into PostgreSQL or return bounded validation results; do not skip proof or add an unchecked fast path. Test correction preservation and idempotent replay on small isolated fixtures. Implemented and deployed in `8fd9b62`; small SQL tests and the full local rehearsal passed. See [EVIDENCE_STORAGE.md](EVIDENCE_STORAGE.md).
2. **Completed 19 October:** collection, compilation and source audit passed. The current verified baseline is `output/imports/2026-10-19/main-development-final-preserved/`, with its evidence-v1 import receipt and the eleven authenticated research baselines. Do not replay the whole graph for reassurance.
3. **Completed 19 October:** final selected catalog and acoustic enrichment are in main; 304,848 entities and 487,351 relationships were added. Actual billed transfer is still unconfirmed because counters did not refresh. No global mirror or extra collector was started. See the [final report](../research/2026-10-19-final-enrichment-import.md).
4. **Completed 19 October:** independent SQL fingerprints, exact research catalog comparisons, public/private evidence routes, release tracklist, retried series lookup and the actual fullscreen workbench passed. Continue using bounded projections and server-side checks; avoid whole-table downloads.
5. All 1,335 local research files now have a private Azure backup with full local restore/hash verification and remote checksum readback. Original source snapshots and caches remain. This is not an export of every mutable database table. Before a future storage migration, determine whether one complete recoverable database export is still needed; do not repeatedly export/reimport Neon.
6. By 30 October, review final storage, normal application transfer and remaining work. Verify lower-plan eligibility and the actual plan-change effective date in the account before returning to the lower allowance. Do not promise a safe downgrade based solely on completing imports. No billing change has been made by the agent.

## Future sessions

Read this constraint before any bulk Neon operation. Prefer local snapshots for analysis, SQL aggregates for inventory, small isolated test fixtures, and bounded field projections for runtime reads. Do not add full-database polling or scheduled full exports. Report if required work would exceed the remaining allowance or the October window rather than silently extending the upgrade.


## Storage reduction strategy — 18 October

Nick explicitly does not want an ongoing $10/month subscription. Complete the storage work **before** the temporary upgrade ends; treat the lower-plan limit as a design constraint rather than assuming renewal. The evidence archive and SQL verification changes are implemented and deployed. Shared migration results are recorded in BRAINZ_PROGRESS.md; the remaining acoustic metadata/index ideas below are not claimed as implemented.

A read-only server-side aggregate audit at `output/imports/2026-10-18/storage-audit.json` found 656,719,872 bytes in user tables/TOAST and 241,082,368 bytes in indexes. Database size from the live check was 905,715,712 bytes. Relationship indexes account for 183,394,304 bytes; entity indexes 57,655,296. These are actual allocated sizes, not evidence that the indexes are unnecessary. Uncompressed field text totals are 237,911,782 bytes of rawProvider, 130,009,788 bytes of relationship observations, and 98,663,257 bytes of providerEvidence. PostgreSQL compresses large JSON values; these text totals are **not additive disk savings**, and repeated observations can contain useful independent provenance.

### Primary approach

- Keep all listening events, identities, searchable music facts, semantic definitions, structural relationships, useful acoustic features and comparison results in the existing OO/Prisma graph. Preserve stable public IDs and the user's ability to query connections.
- Store exact large JSON evidence values in a compressed, content-addressed private archive; identical values deduplicate. Source URL/retrieval provenance remains inline or within the preserved evidence. Values may be whole responses, fragments or observation arrays. Nick authorized Azure storage on 18 October; **Azure Blob Storage in the existing MusicMesh account is the preferred destination**. Use a separate private evidence container, not the chat-log container. A workstation-only path cannot serve as the deployed API's evidence resolver.
- Replace large rawProvider bodies, source envelopes and observation arrays with explicit versioned references to their exact JSON documents. Preserve distinct observation history through references. Extract meaningful fields into the typed model before moving raw payloads; current country/tracklist retrieval gaps must not be made worse. References must be resolvable by authorized agents, with provenance intact and private listening evidence protected.
- Store shared acoustic method/cohort definitions once rather than copying their invariant explanatory material into every comparison; retain per-pair scores/features and source identities. Use shared domain definitions, without flattening incompatible cohorts or losing interpretation.
- Keep isolated tests small and short-lived. Review retained validation data after backing it up and establishing a local fixture workflow; no branch deletion is authorized by this strategy alone. Branch logical sizes cannot simply be added to infer billed incremental storage.
- Inspect index usage/definitions and update bloat. Keep indexes needed by graph queries. Reclaim/rebuild space with a verified maintenance procedure after compacting, allowing for locks, temporary space and retained history; do not assume a JSON update or ordinary VACUUM instantly reduces provider-reported usage.

### Acceptance and fallback

Build the compact final snapshot locally, test representative/full-size storage on local PostgreSQL, verify source counts/identities/provenance resolution and actual workbench queries, then migrate main once using a versioned baseline that preserves user corrections. Update the importer so subsequent enrichment cannot restore duplicated payloads, and keep source-audit/replay protection valid across the representation change.

Engineering target: approximately **700 MiB or less** for the final main branch. The current checkpoint meets this at 670 MiB after compaction; the final enriched graph remains unmeasured. This target leaves margin below the previously verified 1 GiB lower-plan limit. This is a target, not a measured forecast. Confirm the actual account's storage, transfer, compute and branch limits before downgrade. If the complete useful graph still does not fit, report the measured gap and evaluate hosting PostgreSQL on existing Prism capacity as a separate deployment decision; do not silently discard music relationships, split across free projects, or renew the paid plan. No Prism migration has occurred. The Azure archive and shared conversion/reclamation are verified; consult the progress report for receipts and measured allocation.

### Azure destination verified — 18 October

Read-only Azure CLI checks confirmed subscription `KatsivelosAzureSub`, resource group `rg-musicmesh`, and storage account `samusicmesh`: StorageV2, Standard_LRS, Hot tier, eastus2, with anonymous blob access disabled. Entra-authenticated container listing succeeded. The existing private container is `musicmeshchat`; `src/activityStore.js` already uses `@azure/storage-blob` for chat/runtime logs. Root `.env` now uses the evidence-specific connection setting, and the deployed resolver reuses the existing Blob setting. The separate private `musicmeshevidence` container contains 165,644 checksum-verified documents. No credential value is committed.

Reproduce metadata checks without retrieving secrets:

```powershell
az storage account list --resource-group rg-musicmesh --query "[].{name:name,kind:kind,sku:sku.name,location:location,accessTier:accessTier,allowBlobPublicAccess:allowBlobPublicAccess}" -o json
az storage container list --account-name samusicmesh --auth-mode login --query "[].{name:name,publicAccess:properties.publicAccess}" -o json
```

The deployed implementation uses gzip-compressed, checksum-addressed immutable source documents and references from the graph. Keep typed fields needed for ordinary queries in PostgreSQL so routine graph requests do not download entire blobs. Authorized evidence retrieval must verify checksums and preserve source provenance; private listening data must remain private. Table Storage is not needed for this initial design because Prisma/PostgreSQL already supplies the queryable model and evidence index.

Account-specific free allowance and actual incremental storage/operation/transfer costs remain unverified. Azure free-service eligibility can depend on subscription age and offer; an existing account does not establish that all additional use is free ([Microsoft guidance](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/avoid-charges-free-account)). The archive measures 107,384,956 compressed bytes. Upload/read/checksum verification passed for all 165,644 documents at 17:26 UTC. Base retail storage is below $0.01/month; one initial set of writes is approximately $0.83 before retries, reads, bandwidth, tax and allowances. These are estimates, not the actual bill. No billing change was made. See EVIDENCE_STORAGE.md for the pricing evidence and access contract.
