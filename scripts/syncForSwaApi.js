/**
 * Copies shared Node modules and the chat system prompt into api/ so the Azure
 * Functions bundle can load them without depending on the full monorepo layout.
 * The root `npm run build` and SWA API build both run this so local and deployed
 * bundles stay coordinated.
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const apiRoot = path.join(root, "api");
const sharedDir = path.join(apiRoot, "shared");
const contentDir = path.join(apiRoot, "content");

fs.rmSync(sharedDir, { recursive: true, force: true });
fs.rmSync(contentDir, { recursive: true, force: true });
fs.mkdirSync(sharedDir, { recursive: true });
fs.mkdirSync(contentDir, { recursive: true });

const copies = [
  ["src/publicSource.js", "shared/publicSource.js"],
  ["src/enrichment.js", "shared/enrichment.js"],
  ["src/researchSources.js", "shared/researchSources.js"],
  ["src/researchTools.js", "shared/researchTools.js"],
  ["src/discoveryProjection.js", "shared/discoveryProjection.js"],
  ["src/researchRunner.js", "shared/researchRunner.js"],
  ["src/researchStore.js", "shared/researchStore.js"],
  ["src/researchApi.js", "shared/researchApi.js"],

  ["src/evidenceArchive.js", "shared/evidenceArchive.js"],
  ["src/packedEvidence.js", "shared/packedEvidence.js"],
  ["src/coldGraph.js", "shared/coldGraph.js"],
  ["src/packedImport.js", "shared/packedImport.js"],
  ["src/evidenceService.js", "shared/evidenceService.js"],
  ["src/domain/catalog.js", "shared/domain/catalog.js"],
  ["src/domain/index.js", "shared/domain/index.js"],
  ["src/domain/repository.js", "shared/domain/repository.js"],
  ["src/domain/serialization.js", "shared/domain/serialization.js"],
  ["src/domain/versions.js", "shared/domain/versions.js"],
  ["src/env.js", "shared/env.js"],
  ["src/postgres.js", "shared/postgres.js"],
  ["src/graphStore.js", "shared/graphStore.js"],
  ["src/graphProperties.js", "shared/graphProperties.js"],
  ["src/activityStore.js", "shared/activityStore.js"],
  ["src/reasoningConfig.js", "shared/reasoningConfig.js"],
  ["src/llmTelemetry.js", "shared/llmTelemetry.js"],
  ["src/graphDomainWriter.js", "shared/graphDomainWriter.js"],
  ["src/graphDemoRepository.js", "shared/graphDemoRepository.js"],
  ["src/graphCanonRepository.js", "shared/graphCanonRepository.js"],
  ["docs/product/MUSICMESH_CHAT_SYSTEM_PROMPT.md", "content/MUSICMESH_CHAT_SYSTEM_PROMPT.md"]
];

for (const [fromRel, toRel] of copies) {
  const from = path.join(root, ...fromRel.split("/"));
  const to = path.join(apiRoot, ...toRel.split("/"));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

console.log("syncForSwaApi: staged shared runtime files and system prompt under api/.");
const generatedClient = path.join(root, "generated", "prisma");
if (!fs.existsSync(generatedClient)) throw new Error("Run npm run db:generate before staging the API.");
fs.cpSync(generatedClient, path.join(apiRoot, "generated", "prisma"), { recursive: true });
