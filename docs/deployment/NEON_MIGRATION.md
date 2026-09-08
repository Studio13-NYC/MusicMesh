# MusicMesh Neo4j to Neon migration

Status: implementation and isolated validation completed on 2026-09-07 (New York time). Production cutover is in progress. The user approved nearest-connections-first ordering with stable ID ties and a 10–15 minute maintenance window.

## Infrastructure

- Account verified with `neon me`: GitHub nickknyc, nick@katsivelos.com.
- Organization: Studio13, `org-bitter-night-23282516`, Free.
- Dedicated MusicMesh project: `withered-grass-63686198`, PostgreSQL 17, AWS US East 1.
- Neon rejected `azure-eastus2` for this organization; AWS US East 1 is near the unchanged Azure East US 2 host.
- Root branch: `main`, `br-purple-band-auotfxz3`, schema applied; final source import pending.
- Validation branch: `migration-validation`, `br-nameless-night-aujt3mbr`.
- Database / role: `musicmesh` / `musicmesh_owner`. Credentials are project-specific and saved only in ignored environment files.
- Azure: `swa-musicmesh`, resource group `rg-musicmesh`, East US 2, Free. Public URL: https://musicmesh.s13.nyc/.
- Deployment remains `.github/workflows/azure-static-web-apps-green-flower-05b42040f.yml`, triggered by `main` pushes. Last verified public deployment: commit `7157a79`, Actions run `25833143185`.
- No Alexander database or credentials were used. Its setup report and installed skills were read as references only.
- No Neon Auth, storage, functions, gateway, or Data API was enabled. Azure Blob and OpenAI settings remain unchanged.

Current Free-plan documentation lists 0.5 GB per project, 100 CU-hours/month, 5 GB egress/month, and six hours of history. Computes suspend after five idle minutes; queries wake them. The project API confirms a 512 MiB storage limit and `history_retention_seconds=21600`. Do not rely on this short restore window instead of durable exports. [Pricing](https://neon.com/pricing.md), [scale to zero](https://neon.com/docs/introduction/scale-to-zero.md), [restore](https://neon.com/docs/introduction/branch-restore.md).

## Source inventory and mapping

The live Aura database was reachable. The baseline contains 306 nodes, 493 directed relationships, 19 labels, and 56 relationship types. Only node/relationship token lookup indexes exist; no uniqueness constraints, embeddings, vector indexes, ingestion jobs, or scheduled graph writes were found in active source. The existing untracked `Neo4J-snapshot-export/2fa8caf9-2026-07-19T18-47-06-2fa8caf9.backup` was preserved untouched.

Active database paths were `graphCanonRepository.js` (lookup/schema/traversal), `graphDemoRepository.js` (search/subgraph/expand/detail), `graphDomainWriter.js` (transactional writes), `reportOntologyReview.js`, environment/startup checks, and the staged Azure Functions bundle. Graph preview and grounding prompts now refer to the Complete Graph without naming Neo4j.

Prisma 7.10.0 is pinned. The existing CommonJS runtime uses the supported `prisma-client-js` generator with explicit output; `@prisma/adapter-pg` uses a pooled connection. The CLI/import uses `DIRECT_URL`. Both remote URLs require `sslmode=verify-full`. No TLS verification bypass is installed. Node 20.19+ is required. [Prisma setup](https://www.prisma.io/docs/orm/overview/databases/neon), [connection methods](https://neon.com/docs/connect/choose-connection.md).

`entities` stores stable element ID, original domain ID, labels, names, descriptions, aliases and provenance as explicit columns. `relationships` stores independent stable ID, foreign-key source/target IDs, type, year, role, date, other known domain fields, and provenance. Extra evolving properties use JSONB. Parallel relationships are not collapsed by import. Existing date strings are retained exactly rather than reformatted. New entity/relationship IDs are UUIDs; imported IDs remain unchanged so saved tape references work.

Writes retain the original label catalog, merge semantics, matched-canon protection, hidden metadata, direction, and atomic graph transaction. A transaction-scoped PostgreSQL advisory lock serializes chat merges across processes. Search preserves literal case-insensitive substring matching and ranking, including literal `%` and `_`. Traversal permits revisiting nodes but never reuses an edge in a path, as Cypher does.

Capped traversal now selects nearest connections first, then stable IDs. The user authorized this deterministic choice because Neo4j applied caps without defined ordering. Some large-hub subsets intentionally differ; exact search/detail/lookup comparisons still match. Cycle and deterministic-cap integration checks passed.

There is no application login/account-management flow in the current SPA. Azure Functions handlers use `authLevel: anonymous`; no ownership authorization filters were found. This migration preserves that existing behavior. File/image storage and durable conversation tape remain outside the graph database.

## Commands from the repository root

```powershell
npm ci
npm run db:generate
node --env-file=.env.migration node_modules/prisma/build/index.js migrate deploy
node --env-file=.env.migration scripts/importNeo4j.js output/migration/source-baseline
node --env-file=.env.migration src/index.js --check
node --env-file=.env.migration src/index.js
# Separate terminal:
npm run dev
```

`.env.migration` points only at the isolated Neon branch. Root `.env` still retains original settings and source credentials. Environment loading resolves from the application module directory, not arbitrary shell working directories. Never print connection strings. The import refuses mismatched hashes, conflicting rows, or extra destination rows; it does not overwrite or delete them. Re-running against an unchanged import resumes safely via stable IDs and verifies all values.

## Evidence and backups

- Source export: `output/migration/source-baseline/neo4j-export.json`.
- Manifest: `output/migration/source-baseline/manifest.json`.
- Source SHA-256: `a75f885e390cd2b72ce9bb49e895afcb954a06374a751e994b2fe8e1da2ef428`.
- Export code: `node scripts/exportNeo4j.js <new-output-directory>`; read-only, refuses to overwrite an export. Neo4j special values are tagged in the backup. The current corpus uses scalar strings, booleans and numbers.
- Native PostgreSQL dump: `output/migration/neon-validation.dump`.
- Dump SHA-256: `615243ce94ff16db6c83f60327491c8637e791b6cb1f8db86cac4efe215d1dc1`.
- That dump restored atomically into independent Docker container `musicmesh-restore-test`, PostgreSQL 17, port `127.0.0.1:55433`, database `musicmesh_restore`. Every imported identifier, label, relationship endpoint/type and property matched the source again after restoration.
- Dumps omit platform ownership/ACL definitions for portable restoration. Database role provisioning is documented separately above.
- Backup files are ignored by Git. They are local files, not an off-machine backup service. Retain them and the original Aura database.
- `npm run test:db`: concurrent merge, canonical preservation, transaction rollback, directed edges, cycles, caps and hidden-node tests against `.env.restore`. This refuses non-local/non-restoration databases and cleans only its own fixture IDs.
- `node --env-file=.env.restore scripts/verifyMigrationReads.js output/migration/source-baseline/queries.json`: exact comparison of seven searches, eight details and five canonical lookups. Neon measurements before UI writes were 168 ms cold-first query and approximately 13 ms warm per search from this workstation; this is not production latency.
- `npm run build:api`, `npm run build`, PostgreSQL/OpenAI startup checks passed. Vite retains the existing large-bundle warning; Azure bundle checks run in Functions test mode.
- Real local workbench request `req-6d0fab69-4ca1-43a8-8a81-e6f7875a0e81` returned an R.E.M. answer, then persisted five matched nodes and four MEMBER_OF relationships on the Neon validation branch. Tape, runtime completion event, and direct PostgreSQL `lastChatTurnId` queries independently confirmed this. No skipped relationships.
- Screenshot: `output/playwright/neon-validation-graph.png`. Back/Forward and Inspect were exercised.
- The validation branch now contains the test run's legitimate graph metadata updates and is intentionally no longer identical to the initial source backup. Do not promote test data as the final source snapshot.

To repeat portable backup/restore with Docker:

```powershell
# .env.pg-backup holds PGHOST/PGUSER/PGPASSWORD/PGDATABASE plus
# PGSSLMODE=verify-full and PGSSLROOTCERT=/backup/trusted-roots.pem.
docker run --rm --env-file .env.pg-backup --mount 'type=bind,source=D:\Studio13\Lab\Code\MusicMesh\output\migration,target=/backup' pgvector/pgvector:pg17 pg_dump -Fc --no-owner --no-acl -f /backup/neon-validation.dump
# Use a NEW EMPTY target database. Never add --clean for production.
docker exec musicmesh-restore-test pg_restore --single-transaction --no-owner --no-acl --exit-on-error -U musicmesh_test -d NEW_EMPTY_DATABASE /backup/neon-validation.dump
```

The dump image lacked a CA bundle; `trusted-roots.pem` was exported from Node's standard trusted roots and mounted read-only for verification. TLS remained verified throughout.

## Cutover and rollback gate

The user approved the maintenance window. A dedicated `MUSICMESH_MAINTENANCE=true` switch returns HTTP 503 before chat starts; graph read endpoints remain available. Azure SWA rejected its reserved `AzureWebJobs.chat.Disabled` setting, so the app implements the pause directly. The maintenance-only release is commit `5828987`. Verify public HTTP 503 and absence of in-flight source transactions before the final export. Existing settings are privately backed up to `output/migration/azure-settings-before.json`; original root environment to `output/migration/root-env-before.env`.

Before deployment: preserve the existing Azure app settings privately, apply the versioned migration to the clean root branch via its direct URL, import the final export, and configure only MusicMesh's pooled `DATABASE_URL` on Azure. Keep old source credentials for rollback. Deploy via the existing GitHub Actions workflow and wait for its successful completion. Prove public search, graph reads, chat, background graph writes and blob tape access; a homepage response is insufficient. Reopen traffic only after successful validation.

Rollback before accepting PostgreSQL writes: redeploy the previously verified commit `7157a79` and restore the privately saved Azure settings. The original Aura database remains available. **After accepting PostgreSQL writes, rolling back the code alone would lose those new changes:** pause writes, back up PostgreSQL and reconcile those changes into the rollback target first, or repair forward. No automatic reverse migration is implemented.

No user decisions remain. Production migration remains incomplete until final import, deployment and public persistence verification are recorded.
