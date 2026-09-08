# Current State And Handoff

Updated 2026-09-07, New York time.

## Migration state

Local and public production now use Prisma 7.10.0 and dedicated MusicMesh Neon PostgreSQL. **Cutover and public read/write verification are complete.** Read [NEON_MIGRATION.md](../deployment/NEON_MIGRATION.md) for project IDs, exact commands, verified data counts, backup/restore evidence, and cutover/rollback gates.

The dedicated MusicMesh Neon Free project contains all 306 source entities and 493 relationships. Every ID, label, property, direction and endpoint matched the final Aura export, including after restoring the final PostgreSQL dump into an isolated database. Search/detail/canonical lookup comparisons passed. Source Aura and all backups are retained.

The user approved a 10–15 minute maintenance window and deterministic capped traversal: nearest connections first, then stable IDs. Source ordering was undefined, so large-hub subsets can differ. Chat was paused for approximately ten minutes; maintenance is now off.

## Run locally

Root `.env` now selects the production Neon branch. The ignored `.env.migration` selects the isolated validation branch; use it for development writes. Source credentials remain in the private local environment for export/rollback, but have been removed from Azure.

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

Production: https://musicmesh.s13.nyc/ on unchanged Azure Static Web Apps (swa-musicmesh, rg-musicmesh, East US 2). Runtime release `5a404fa`, Actions run `34173029047`, succeeded. The existing main-push workflow now prebuilds and tests with Node 22.23.2, then deploys the verified UI and Functions bundles to Node 22.

Local PostgreSQL UI proof: output/playwright/neon-validation-graph.png. Request req-6d0fab69-4ca1-43a8-8a81-e6f7875a0e81 saved five nodes and four relationships with no skipped edges. Runtime and tape evidence live under output/chat/.

Public request `req-8ea6edce-068e-470c-8f70-ff730819d957` saved five matched R.E.M. entities and four membership relationships. Direct PostgreSQL queries, blob tape, runtime completion and saved-graph reload all confirmed it. No matching request writes occurred in Aura. Evidence: `output/migration/public-write-verification.json`, `public-read-verification.json`, and `output/playwright/neon-production-graph.png`.

Known pre-existing limitation: 22 older graph-update entries in the inspected blob-tape window reference IDs absent from the final Aura source. Those old graph links cannot reload; the original chat history is intact. Current IDs were preserved and the new saved graph reloads. No guessed remapping was performed.

Keep Aura and all backups. Backups currently reside on this workstation; no off-machine backup automation was provisioned. After new PostgreSQL writes, rollback requires reconciliation, not only redeploying old code. See the migration document.

## Protected work

STAY/ and the clean-sheet archive remain protected. The pre-existing untracked Neo4J-snapshot-export/ folder was not altered. No unrelated user changes were reverted.
