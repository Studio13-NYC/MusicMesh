# October-only Neon capacity window

Recorded 18 October 2026, America/New_York.

## User direction

Nick reported reaching 100% of the monthly 5 GB network-transfer allowance and upgrading to 25 GB. The increased allowance is for **October 2026 only**. Complete necessary bulk MusicMesh database work in this window; do not assume a continuing paid allowance in November. This does not authorize additional paid upgrades or changes to other projects. Keep the existing OO domain classes, Prisma, Neon and Azure architecture.

Operational completion target: **30 October**, leaving time to review the plan before the current consumption period ends at **2026-11-01T00:00:00Z (31 October, 8 p.m. New York)**. The upgrade does not itself establish a scheduled downgrade. A one-time Codex review reminder is active for 30 October at 10 a.m. local time (`review-october-only-neon-upgrade`); it checks completion/capacity and reminds Nick, but does not change billing or run bulk jobs.

## Verified state and limits of the evidence

- MusicMesh project `withered-grass-63686198` reports owner subscription `build`, updated 2026-10-18T16:32:42Z, and a 5 GiB branch logical-size limit. The previous observed main limit was 1 GiB. Account-specific limits take precedence over generic public plan comparisons.
- The new consumption period starts 2026-10-18T16:32:41Z and ends 2026-11-01T00:00:00Z. The project response reported zero transfer just after the upgrade; that is not evidence that October's earlier 5 GB was unused or refunded. The 25 GB allowance is user-reported, not independently returned by that response.
- Last verified main database size is 905,715,712 bytes (~864 MiB), from snapshot 3. Stored data persists beyond the billing month. The final enriched database may not fit the previous lower storage limit; check before downgrade and surface a concrete decision without deleting evidence.
- At 16:37 UTC, the existing local collector (PID 63456) had 50,288 successful requests, zero missing/errors, stage `context`, and `databaseWritten:false`. MusicBrainz-to-local downloads and local compilation do not consume Neon database egress.
- `pg_stat_statements` was not installed in the checked database. No historical per-query attribution is available; no statistics were reset and no extension was installed for this audit.

## Transfer diagnosis

`src/domain/repository.js` reads complete inserted/existing records for verification, and complete endpoint entities again for each 200-relationship batch. Refresh also reads old complete rows. Raw provider JSON makes these wide records. These are verified code paths, but they are not exact billing attribution.

A local-only scan of snapshot 3 estimated 432,569,516 bytes of entity JSON, 367,687,250 bytes of relationship JSON, and **1,540,254,294 bytes of repeated endpoint payload** across 1,842 relationship batches (391,683 endpoint returns). Total: **2,340,511,060 bytes (~2.34 GB) for those read shapes in one full pass**, before refresh pre-reads, protocol/serialization differences and other queries. This is a payload estimate, not measured Neon wire usage. Private evidence: `output/imports/2026-10-17/neon-egress-code-estimate.json`. The estimate was computed locally, without rereading the Neon graph.

Neon meters public database-to-client traffic. Verification reads and full dumps count; MusicBrainz requests and local processing do not. Client-side `pg_dump` compression does not reduce Neon transfer. Sources: [network-transfer documentation](https://neon.com/docs/introduction/network-transfer), [billing documentation](https://neon.com/docs/introduction/manage-billing).

## Remaining October work, in order

1. **Reduce importer verification transfer and validate a compact storage representation before the next bulk load.** Preserve exact conflict detection, baseline comparison, row locks, endpoint/type validation and transaction rollback. Move large equality checks into PostgreSQL or return bounded validation results; do not skip proof or add an unchecked fast path. Test correction preservation and idempotent replay on small isolated fixtures. This optimization is planned, not yet implemented.
2. Let the existing collector finish, then compile/source-audit the final bounded catalog from local caches. Consolidate remaining enrichment into as few verified imports as practical; do not repeatedly replay the entire already-verified graph merely for reassurance. Use snapshot 3 as the current verified baseline until a newer import receipt exists.
3. Load the remaining selected releases, direct artists/works/groups and bounded context into main, within the reported 25 GB budget. Record actual usage before/after and keep missing/error/partial status explicit. Check storage and compute limits too. No new global database mirror or parallel provider collector is needed.
4. Verify source-history integrity, graph counts, representative release/track/personnel paths, privacy, and the actual workbench. Improve bounded chat retrieval/projections so ordinary questions do not fetch or expose unnecessary raw provider payloads. Use server-side counts/aggregates and targeted checks; avoid repeated whole-table downloads.
5. Once the final import is stable, make **one** durable recoverable export if still needed, retain local source/cache/manifests and check the backup by restoring locally rather than repeatedly exporting/reimporting Neon. Record the export's actual scope and restore proof; a cache alone is not a backup of later user graph changes.
6. By 30 October, review final storage, normal application transfer and remaining work. Verify lower-plan eligibility and the actual plan-change effective date in the account before returning to the lower allowance. Do not promise a safe downgrade based solely on completing imports. No billing change has been made by the agent.

## Future sessions

Read this constraint before any bulk Neon operation. Prefer local snapshots for analysis, SQL aggregates for inventory, small isolated test fixtures, and bounded field projections for runtime reads. Do not add full-database polling or scheduled full exports. Report if required work would exceed the remaining allowance or the October window rather than silently extending the upgrade.


## Storage reduction strategy — 18 October

Nick explicitly does not want an ongoing $10/month subscription. Complete the storage work **before** the temporary upgrade ends; treat the lower-plan limit as a design constraint rather than assuming renewal. This section is a proposed implementation strategy, not a completed migration.

A read-only server-side aggregate audit at `output/imports/2026-10-18/storage-audit.json` found 656,719,872 bytes in user tables/TOAST and 241,082,368 bytes in indexes. Database size from the live check was 905,715,712 bytes. Relationship indexes account for 183,394,304 bytes; entity indexes 57,655,296. These are actual allocated sizes, not evidence that the indexes are unnecessary. Uncompressed field text totals are 237,911,782 bytes of rawProvider, 130,009,788 bytes of relationship observations, and 98,663,257 bytes of providerEvidence. PostgreSQL compresses large JSON values; these text totals are **not additive disk savings**, and repeated observations can contain useful independent provenance.

### Primary approach

- Keep all listening events, identities, searchable music facts, semantic definitions, structural relationships, useful acoustic features and comparison results in the existing OO/Prisma graph. Preserve stable public IDs and the user's ability to query connections.
- Store each fetched provider response once in a compressed, content-addressed private evidence archive, with checksum, source URL and retrieval time. Nick authorized Azure storage on 18 October; **Azure Blob Storage in the existing MusicMesh account is the preferred destination**. Use a separate private evidence container, not the chat-log container. A workstation-only path cannot serve as the deployed API's evidence resolver.
- Replace copied rawProvider bodies, repeated source envelopes and repeated full observation bodies with explicit evidence references and pointers into those documents. Preserve distinct observation history through references. Extract meaningful fields into the typed model before moving raw payloads; current country/tracklist retrieval gaps must not be made worse. References must be resolvable by authorized agents, with provenance intact and private listening evidence protected.
- Store shared acoustic method/cohort definitions once rather than copying their invariant explanatory material into every comparison; retain per-pair scores/features and source identities. Use shared domain definitions, without flattening incompatible cohorts or losing interpretation.
- Keep isolated tests small and short-lived. Review retained validation data after backing it up and establishing a local fixture workflow; no branch deletion is authorized by this strategy alone. Branch logical sizes cannot simply be added to infer billed incremental storage.
- Inspect index usage/definitions and update bloat. Keep indexes needed by graph queries. Reclaim/rebuild space with a verified maintenance procedure after compacting, allowing for locks, temporary space and retained history; do not assume a JSON update or ordinary VACUUM instantly reduces provider-reported usage.

### Acceptance and fallback

Build the compact final snapshot locally, test representative/full-size storage on local PostgreSQL, verify source counts/identities/provenance resolution and actual workbench queries, then migrate main once using a versioned baseline that preserves user corrections. Update the importer so subsequent enrichment cannot restore duplicated payloads, and keep source-audit/replay protection valid across the representation change.

Engineering target: approximately **700 MiB or less** for the final main branch, leaving margin below the previously verified 1 GiB lower-plan limit. This is a target, not a measured forecast. Confirm the actual account's storage, transfer, compute and branch limits before downgrade. If the complete useful graph still does not fit, report the measured gap and evaluate hosting PostgreSQL on existing Prism capacity as a separate deployment decision; do not silently discard music relationships, split across free projects, or renew the paid plan. No Prism migration or evidence offload has occurred yet.

### Azure destination verified — 18 October

Read-only Azure CLI checks confirmed subscription `KatsivelosAzureSub`, resource group `rg-musicmesh`, and storage account `samusicmesh`: StorageV2, Standard_LRS, Hot tier, eastus2, with anonymous blob access disabled. Entra-authenticated container listing succeeded. The existing private container is `musicmeshchat`; `src/activityStore.js` already uses `@azure/storage-blob` for chat/runtime logs. Root `.env` has no Blob credential configured. The evidence writer and deployed resolver still need explicit configuration and access validation; do not infer write access from a successful listing.

Reproduce metadata checks without retrieving secrets:

```powershell
az storage account list --resource-group rg-musicmesh --query "[].{name:name,kind:kind,sku:sku.name,location:location,accessTier:accessTier,allowBlobPublicAccess:allowBlobPublicAccess}" -o json
az storage container list --account-name samusicmesh --auth-mode login --query "[].{name:name,publicAccess:properties.publicAccess}" -o json
```

Planned implementation uses gzip-compressed, checksum-addressed immutable source documents and references from the graph. Keep typed fields needed for ordinary queries in PostgreSQL so routine graph requests do not download entire blobs. Authorized evidence retrieval must verify checksums and preserve source provenance; private listening data must remain private. Table Storage is not needed for this initial design because Prisma/PostgreSQL already supplies the queryable model and evidence index.

Account-specific free allowance and actual incremental storage/operation/transfer costs remain unverified. Azure free-service eligibility can depend on subscription age and offer; an existing account does not establish that all additional use is free ([Microsoft guidance](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/avoid-charges-free-account)). Measure compressed cache size and expected reads/writes, check the subscription allowance, and verify an upload/read round trip before the database migration. No evidence container, blob upload, database offload or billing change was performed during this inspection.
