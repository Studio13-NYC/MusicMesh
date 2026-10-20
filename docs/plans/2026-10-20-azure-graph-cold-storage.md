# Azure-backed external links and acoustic comparisons

20 October 2026. Authorized: implement, rehearse locally, then apply to main after preservation and discovery checks pass. No billing change.

## Approach

Keep public node identities and a complete relationship directory in the existing PostgreSQL tables. Put complete external-link relationships, acoustic-comparison relationships and comparison payloads in private immutable Azure pages. The remaining rows retain names, searchable text, IDs, endpoints and traversal roles. Filtering, both traversal directions, pagination and discovery therefore work without fetching archive pages. Bounded query results restore requested payloads from Azure. This reuses the existing storage path; no extra graph table, SQL view or alternative traversal engine is needed. Domain classes and public IDs remain unchanged.

Resolve archived records on demand through their owning record and public endpoints. A bounded process cache holds verified Azure pages; it cannot grow Neon. Research claims, confidence history, source documents, listening events, mappings and research-owned relationships are excluded.

## Sequence and gates

1. Implement schema/read view, verified archive reader, bounded cache and importer support. Missing/corrupt Azure data must fail explicitly, not masquerade as no relationships.
2. Prepare immutable pages from the verified local restoration. Verify exact reconstruction and upload/readback checksums.
3. Rehearse against the local restored database. Compare full logical graph identities and values, protected research fingerprints, search, traversal, relationship detail and acoustic results. Measure reclaimed size rather than promise an estimated saving.
4. Build/test and deploy compatible readers before changing main data. Preserve original snapshots, backups and all research. Apply with locked baseline comparisons; conflicts stop rather than overwrite concurrent edits.
5. Verify main independently with bounded reads and server-side aggregates; exercise the deployed graph and source inspection. Record actual storage, receipts and remaining limitations.

Initial state: design recorded; implementation and migration not yet completed. Existing evidence compaction remains active. Receipts will live under `output/storage/2026-10-20/cold-graph/`.
