# Current State And Handoff

Updated 2026-09-07, New York time.

## Migration state

The local implementation now uses Prisma 7.10.0 and PostgreSQL. **Production has not been migrated and still uses Neo4j.** Read [NEON_MIGRATION.md](../deployment/NEON_MIGRATION.md) for project IDs, exact commands, verified data counts, backup/restore evidence, and cutover/rollback gates.

The dedicated MusicMesh Neon Free project has an isolated validation branch with the imported live corpus (306 nodes / 493 relationships). Full property and identity comparison passed, including after a native PostgreSQL backup restoration to a separate local database. Search/detail/canonical lookup parity passed. A real local chat persisted graph updates against Neon, independently verified through the tape, runtime logs and database.

The user approved a 10–15 minute maintenance window and deterministic capped traversal: nearest connections first, then stable IDs. Source ordering was undefined, so large-hub subsets can differ. Updated integration checks pass. Production cutover is in progress; do not assume it has completed until public verification is recorded.

## Run locally

Root .env retains original application and source settings. The ignored .env.migration contains isolated Neon credentials. It must be explicitly loaded until final configuration is selected:

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

Production: https://musicmesh.s13.nyc/ on Azure Static Web Apps (swa-musicmesh, rg-musicmesh, East US 2). Existing main-push GitHub Actions deployment remains active. Last verified deployed commit is 7157a79; run 25833143185 succeeded. Public homepage and Neo4j-backed graph search returned 200 before the migration work.

Local PostgreSQL UI proof: output/playwright/neon-validation-graph.png. Request req-6d0fab69-4ca1-43a8-8a81-e6f7875a0e81 saved five nodes and four relationships with no skipped edges. Runtime and tape evidence live under output/chat/.

Never promote the test branch as the final snapshot. Freeze source writes during the user-approved cutover, export/import again into the clean root branch, verify, deploy, and verify public persistence. Keep Aura and all backups. See the migration document for rollback limitations after new PostgreSQL writes.

## Protected work

STAY/ and the clean-sheet archive remain protected. The pre-existing untracked Neo4J-snapshot-export/ folder was not altered. No unrelated user changes were reverted.
