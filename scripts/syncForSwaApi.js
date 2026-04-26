/**
 * Copies shared Node modules and the chat system prompt into api/ so the Azure
 * Functions bundle can load them without depending on the full monorepo layout.
 * Run before `npm ci` in the api folder (see GitHub workflow api_build_command).
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const apiRoot = path.join(root, "api");
const sharedDir = path.join(apiRoot, "shared");
const contentDir = path.join(apiRoot, "content");

fs.mkdirSync(sharedDir, { recursive: true });
fs.mkdirSync(contentDir, { recursive: true });

const copies = [
  ["src/env.js", "shared/env.js"],
  ["src/activityStore.js", "shared/activityStore.js"],
  ["src/chatService.js", "shared/chatService.js"],
  ["src/graphChatOrchestrator.js", "shared/graphChatOrchestrator.js"],
  ["src/graphDemoRepository.js", "shared/graphDemoRepository.js"],
  ["src/graphCanonRepository.js", "shared/graphCanonRepository.js"],
  ["src/graphProposalService.js", "shared/graphProposalService.js"],
  ["src/graphProposalStore.js", "shared/graphProposalStore.js"],
  ["src/graphProposalWriter.js", "shared/graphProposalWriter.js"],
  ["docs/product/MUSICMESH_CHAT_SYSTEM_PROMPT.md", "content/MUSICMESH_CHAT_SYSTEM_PROMPT.md"]
];

for (const [fromRel, toRel] of copies) {
  const from = path.join(root, ...fromRel.split("/"));
  const to = path.join(apiRoot, ...toRel.split("/"));
  fs.copyFileSync(from, to);
}

console.log("syncForSwaApi: staged shared runtime files and system prompt under api/.");
