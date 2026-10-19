# Final enrichment import — 19 October 2026

Nick explicitly requested retrying collection, compiling, auditing and importing the final enrichment while preserving all research. The hourly monitor had reporting-only authority; this operator run has explicit execution authority. Main is the shared development backend. No database replacement or listening-history resubmission is authorized or performed.

## Verified preparation

- Collection completed at 2026-10-19T14:54:00Z: 71,249 successful requests, zero missing/error/pending requests. The failed series lookup succeeded on retry; successful cache responses were reused.
- Source audit passed: 21,415 plays, 20,448 mapped events, 967 unresolved events and 8,289 distinct mapped recording IDs. Acoustic collection and bounded catalog closure are complete.
- The original compiled snapshot has 487,221 entities and 855,935 relationships. Its files exceed V8's single-string limit, so snapshot writing and reading now stream NDJSON with exact byte checksums.
- Eleven committed research packets were checked against their ImportBatch records. The reconciled snapshot contains 488,101 entities and 857,472 relationships, retaining 1,083 research catalog entities and 1,848 research catalog relationships.
- On overlap, frozen research catalog objects take precedence over the bulk collector. Seven researched artists would otherwise regress from lookup to embedded metadata. The original compiled snapshot and source caches retain the incoming provider evidence. Later improvements can reconcile those sources explicitly.
- All EvidenceAssertions, SourceDocuments and their links remain separate from the bulk snapshot and are not replaced. Pre-import server-side fingerprints cover 239 assertions, 240 sources, 718 assertion/source links, all plays and all mappings. History fingerprint comparison excludes only the ontology-version marker.
- Before import, Neon held 183,783 entities, 371,043 relationships and 21,415 plays; allocated database size was 707,829,760 bytes. These are dated observations, not a post-import result.

## Import protections and changes

`readSnapshot` validates known historical ontology versions. Normal reads validate and normalize to current semantics; comparison baselines retain the original serialized ontology marker so exact SQL comparisons remain valid. Unknown versions are rejected. Every object still passes current constructors and endpoint validation.

`preserve-research` writes a new checksummed snapshot, never overwrites the compiled source, preserves exact research rows on overlap and retains research-only catalog paths. The manifest binds the eleven research packet hashes. The loader requires those same packets to match committed transactions in the selected database.

`--research-baseline` extends the previous bulk baseline with these authenticated catalog rows. Unchanged research rows are carried forward, omitted records remain, and changed source objects still require exact locked compare-and-swap. Later conflicting edits stop and roll back the affected batch; there is no reset or forced overwrite.

Unit suite: 112 passed / 19 opt-in skipped. Isolated PostgreSQL suite: 9 passed, including historical-version refresh, research retention and rollback on later user edits. Application build and Azure bundle entrypoint validation passed.

Evidence preparation produced 389,733 distinct documents, totaling 300,375,746 compressed bytes. Upload concurrency is configurable from 1 to 32 (default 8), without changing conditional creation, existing-object readback, checksum checks or receipt requirements. This run uses 32 after an initial eight-worker attempt; both logs are retained.

All 1,335 files under `output/research/` were separately archived before the load. A local restore matched every original SHA-256, and the private Azure upload matched on readback. The archive is 5,058,919 bytes; its SHA-256 is `67129cd4a2d13280928722c3ecfcdfd88b10de648947080072a854ee641689e2`. The private object is `samusicmesh/musicmeshevidence/backups/research/2026-10-19-67129cd4a2d13280928722c3ecfcdfd88b10de648947080072a854ee641689e2.tar.gz`. Receipt: `output/imports/2026-10-19/research-backup-receipt.json`. This protects local source packets and notes, not a general backup of every mutable database table.

## Paths and commands

Working directory: `D:\Studio13\Lab\Code\MusicMesh`.

- Collected cache: `output/imports/2026-10-17/musicbrainz/`
- Immutable prepared history: `output/imports/2026-10-17/prepared/`
- Previous bulk baseline: `output/imports/2026-10-17/main-development-snapshot-3/`
- Original final compilation: `output/imports/2026-10-19/main-development-final/`
- Reconciled final snapshot: `output/imports/2026-10-19/main-development-final-preserved/`
- Final evidence archive: `output/imports/2026-10-19/final-evidence/`
- Source audit: `output/imports/2026-10-19/final-snapshot-audit.json`
- Research receipt audit: `output/imports/2026-10-19/research-baseline-audit.json`
- Pre-import fingerprints: `output/imports/2026-10-19/before-import.json`
- Live operator progress: `output/imports/2026-10-19/final-import-progress.json`

The recorded eleven directories are in `before-import.json`; use that frozen list rather than treating every future research directory as already imported:

```powershell
node --env-file=.env scripts/importListeningHistory.js upload-evidence --archive output/imports/2026-10-19/final-evidence --upload-concurrency 32
$researchDirectories = (Get-Content -LiteralPath 'output/imports/2026-10-19/before-import.json' -Raw | ConvertFrom-Json).researchDirectories
$researchArguments = foreach ($directory in $researchDirectories) { '--research-baseline'; $directory }
node --max-old-space-size=24576 --env-file=.env scripts/importListeningHistory.js load-main --prepared output/imports/2026-10-17/prepared --snapshot output/imports/2026-10-19/main-development-final-preserved --previous-snapshot output/imports/2026-10-17/main-development-snapshot-3 --archive output/imports/2026-10-19/final-evidence @researchArguments
```

Do not run the load until the archive upload receipt exists and matches the reconciled snapshot. Upload uses the existing private `samusicmesh/musicmeshevidence` container in `rg-musicmesh`. Keep the October-only 25 GB allowance and check post-import storage against the lower-plan limit before any downgrade. No billing change is part of this run.

## Current boundary

Preparation, source audit and evidence upload are complete. All 389,733 archive documents were verified at 2026-10-19T15:25:46.312Z. Final database loading and independent post-import/product verification are in progress. A compiled snapshot is not an import receipt. Do not disable hourly monitoring until the final import and its independent verification succeed.
