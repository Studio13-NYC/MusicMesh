# MusicMesh

MusicMesh is a clean-sheet restart of an LLM-native operator product for music knowledge work.

The current repo is intentionally narrow:

- a real startup and verification path
- a chat-first operator workbench served at `/`
- one chat-driven graph persistence path
- a Cytoscape graph sidecar with browse, inspect, focus, and graph history
- a workflow rail for recent tape, runtime, and run-quality activity

This is not the archived legacy system.

## What Is Real Right Now

Today, the repo has:

- a Node bootstrap with environment validation
- startup checks for OpenAI, Neo4j through Docker MCP, and Playwright
- a Vite/React SPA with the operator graph workbench as the default screen
- a local API and synced Azure Functions API bundle
- answer-first chat backed by GPT-5.5
- chat-derived graph preview, grounding, persistence, and run-quality review
- graph APIs that return only music-domain nodes and relationships
- an append-only conversation tape and runtime log on disk
- LLM-call telemetry summarized by `npm run llm:report`

Important limits:

- the product is still an active clean-sheet build
- graph persistence must be verified separately from a good chat answer
- Docker MCP must be running for `npm run check` graph connectivity checks

## Core Product Direction

The active product direction is:

- answer first
- graph work happens through the same chat pipeline
- directly persist real music-domain nodes and relationships
- keep `canonicalStatus` / `isProposed` as hidden offline-maintenance metadata
- reuse existing canon and schema before inventing structure
- keep the product simple and legible

Primary docs:

- [LLM Operator Contract](./docs/product/LLM_OPERATOR_CONTRACT_V1.md)
- [One Chat Pipeline](./docs/product/ONE_CHAT_PIPELINE.md)
- [Execution Lessons](./docs/product/EXECUTION_LESSONS.md)
- [Roleplay Spec](./docs/product/roleplay-spec.md)
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
- `OPENAI_MODEL`
- `OPENAI_REASONING_EFFORT`
- `OPENAI_REASONING_LEVEL`
- `OPENAI_VERBOSITY`
- stage-specific `OPENAI_REASONING_EFFORT_*` keys
- `MUSICMESH_CHAT_GRAPH_SYNC_TIMEOUT_MS`
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

Build the app bundle:

```powershell
npm run build
```

Verify the synced Azure Functions bundle:

```powershell
npm run check:api
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
  - stages the Azure Functions shared bundle under `api/`
  - verifies the SPA builds successfully
- `npm run build:api`
  - stages the Azure Functions shared bundle
  - installs API package dependencies from `api/package-lock.json`
  - verifies the Functions entrypoint loads
- `npm run verify`
  - runs environment/infrastructure checks
  - verifies the deployable API bundle
  - builds the SPA
  - runs the local Playwright suite
- `npm run smoke`
  - proves the runtime entrypoint boots
- `npm run smoke:playwright`
  - proves browser automation works and writes a smoke screenshot

## Current UX Reality

The current product shell is:

- chat-first
- paired with a neighboring graph/workflow workbench
- suitable for product-side testing

The current graph workbench supports:

- graph seed search
- browse filters and legend
- Cytoscape selection, drag, inspect, fit, and reset
- double-click or `Expand` to center a node and load its connected graph
- `Back` and `Forward` to redisplay graph views already seen without new research

The Workflow tab surfaces recent run-quality, tape, and runtime activity.

## Working Rules

- simplicity first
- no one-off hacks
- running code over architecture
- when in doubt, ask a question

## Read This First If You Are Taking Over

1. [AGENTS.md](./AGENTS.md)
2. [Current State And Handoff](./docs/product/CURRENT_STATE_AND_HANDOFF.md)
3. [One Chat Pipeline](./docs/product/ONE_CHAT_PIPELINE.md)
4. [Execution Lessons](./docs/product/EXECUTION_LESSONS.md)
5. [LLM Operator Contract](./docs/product/LLM_OPERATOR_CONTRACT_V1.md)
6. [Project Startup Guide](./docs/project_startup_guide.md)
