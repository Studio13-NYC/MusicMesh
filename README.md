# MusicMesh

MusicMesh is a clean-sheet restart of an LLM-native operator product for music knowledge work.

The current repo is intentionally narrow:

- a real startup and verification path
- a basic chat-first SPA shell
- a simple local API path for chat
- an adjacent worksurface for inspecting recent activity

This is not the archived legacy system.

## What Is Real Right Now

Today, the repo has:

- a Node bootstrap with environment validation
- startup checks for OpenAI, Neo4j through Docker MCP, and Playwright
- a Vite/React SPA with a chat-first layout
- a thin local chat API
- an append-only conversation tape and runtime log on disk
- a worksurface that reads recent tape and runtime entries through the local API

What it does not have yet:

- a full graph-aware persistence workflow in the product
- deep trace/log/database readback in the worksurface
- a finished production operator loop

## Core Product Direction

The active product direction is:

- answer first
- explicit persistence when graph work is requested
- `propose first, review before canon`
- reuse existing canon and schema before inventing structure
- keep the product simple and legible

Primary docs:

- [LLM Operator Contract](./docs/product/LLM_OPERATOR_CONTRACT_V1.md)
- [Roleplay Spec](./docs/product/roleplay-spec.md)
- [Graph Ingestion Proposals](./docs/product/GRAPH_INGESTION_PROPOSALS.md)
- [Current State And Handoff](./docs/product/CURRENT_STATE_AND_HANDOFF.md)
- [Project Startup Guide](./docs/project_startup_guide.md)

## Repo Shape

Important paths:

- `src/`
  - bootstrap, env validation, startup checks, local API server
- `ui/`
  - Vite/React SPA shell
- `scripts/`
  - smoke and inspection scripts
- `docs/`
  - active product, UI, and architecture notes
- `output/`
  - local runtime artifacts such as the conversation tape

Do not treat the archived clean-sheet zip as the active codebase.

## Requirements

- Node.js and npm
- a root `.env` with required credentials
- Docker MCP available for Neo4j checks
- Playwright available locally

Required env keys:

- `OPENAI_API_KEY`
- `NEO4J_URI`
- `NEO4J_USERNAME`
- `NEO4J_PASSWORD`
- `NEO4J_DATABASE`

Optional env keys:

- `BRAVE_API_KEY`
- `DISCOGS_TOKEN`
- `OPENAI_REASONING_EFFORT`
- `MUSICMESH_HTTP_USER_AGENT`
- `MUSICMESH_BLOB_CONNECTION_STRING`
- `MUSICMESH_BLOB_CONTAINER`
- `AURA_INSTANCEID`
- `AURA_INSTANCENAME`

## Getting Started

Install dependencies:

```powershell
npm install
```

Run the startup verification path:

```powershell
npm run startup
```

Start the local API:

```powershell
npm start
```

Start the SPA:

```powershell
npm run dev
```

Build the UI:

```powershell
npm run build
```

Inspect the recent tape from the terminal:

```powershell
npm run tape -- 50
```

## What The Commands Prove

- `npm run check`
  - validates the root `.env`
  - verifies Docker MCP availability
  - verifies Neo4j connectivity through Docker MCP
  - verifies OpenAI connectivity
  - verifies Playwright availability
- `npm run startup`
  - runs `check`, `smoke`, and `smoke:playwright`
- `npm start`
  - starts the local MusicMesh API
- `npm run dev`
  - starts the Vite SPA for product-side testing
- `npm run build`
  - verifies the SPA builds successfully
- `npm run smoke`
  - proves the runtime entrypoint boots
- `npm run smoke:playwright`
  - proves browser automation works and writes a smoke screenshot

## Current UX Reality

The current product shell is:

- chat-first
- paired with a neighboring worksurface
- suitable for product-side testing

The current chat path is intentionally thin.

It is good enough to test:

- prompt/response feel
- message rendering
- tape/log inspection
- basic operator interaction shape

It is not yet the full MusicMesh product.

## Working Rules

- simplicity first
- no one-off hacks
- running code over architecture
- when in doubt, ask a question

## Read This First If You Are Taking Over

1. [AGENTS.md](./AGENTS.md)
2. [Current State And Handoff](./docs/product/CURRENT_STATE_AND_HANDOFF.md)
3. [LLM Operator Contract](./docs/product/LLM_OPERATOR_CONTRACT_V1.md)
4. [Roleplay Spec](./docs/product/roleplay-spec.md)
5. [Project Startup Guide](./docs/project_startup_guide.md)
