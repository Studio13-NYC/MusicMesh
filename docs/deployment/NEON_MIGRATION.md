# PostgreSQL migration record

The September database migration is complete. Its historical commands and source-system rollback procedure are retired; use Git history for the original record. The active application uses Prisma/PostgreSQL on dedicated MusicMesh Neon main, with stable identities retained. Never use Alexander.

The October Brainz catalog and private Blob evidence architecture supersede the small September migration baseline. Read [CURRENT_STATE_AND_HANDOFF.md](../product/CURRENT_STATE_AND_HANDOFF.md), [BRAINZ_PROGRESS.md](../product/BRAINZ_PROGRESS.md) and [EVIDENCE_STORAGE.md](../product/EVIDENCE_STORAGE.md). No retired database driver or source exporter/importer is required or supported.

The root `.env` and public site are the shared development environment. Apply additive Prisma migrations with `npm run db:migrate`; use `.env.restore` for isolated fixture tests. Preserve existing graph IDs, provider snapshots and import receipts. Recovery uses PostgreSQL backups and verified Blob archives, not a reverse migration.
