# Project Startup Guide

This document is the current startup checklist for the clean-sheet MusicMesh repo.

## Startup Goal

Before working on product code, we should be able to prove:

- the repo installs cleanly
- the root `.env` is readable
- Docker MCP is reachable
- Neo4j can be queried through Docker MCP
- OpenAI connectivity works
- Playwright is available
- the local runtime boots

## Required Environment

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
- `OPENAI_REASONING_EFFORT_DEFAULT`
- `OPENAI_REASONING_EFFORT_KNOWLEDGE`
- `OPENAI_REASONING_EFFORT_CHAT_COMPLEX`
- `OPENAI_REASONING_EFFORT_GRAPH_PREVIEW`
- `OPENAI_REASONING_EFFORT_GRAPH_PLAN`
- `OPENAI_REASONING_EFFORT_GRAPH_GROUNDING`
- `OPENAI_REASONING_EFFORT_HUMAN_LOOP`
- `OPENAI_REASONING_EFFORT_RUN_REVIEW`
- `OPENAI_REASONING_EFFORT_MAINTENANCE`
- `OPENAI_VERBOSITY`
- `MUSICMESH_CHAT_GRAPH_SYNC_TIMEOUT_MS`
- `MUSICMESH_HTTP_USER_AGENT`
- `MUSICMESH_BLOB_CONNECTION_STRING`
- `MUSICMESH_BLOB_CONTAINER`
- `AURA_INSTANCEID`
- `AURA_INSTANCENAME`

## Required External Runtime

- Docker MCP must be running for graph checks
- Playwright must be available locally

Important rule:

- if Docker MCP is unavailable, graph checks are blocked infrastructure, not an app bug

## Commands

Install dependencies:

```powershell
npm install
```

Run the full startup path:

```powershell
npm run startup
```

Run individual checks:

```powershell
npm run check
npm run smoke
npm run smoke:playwright
npm run build
npm run build:api
npm run verify
```

Start the local API:

```powershell
npm start
```

Start the SPA:

```powershell
npm run dev
```

Inspect recent tape entries:

```powershell
npm run tape -- 50
```

Summarize LLM reasoning telemetry:

```powershell
npm run llm:report
```

## What The Commands Verify

`npm run check` verifies:

- root `.env`
- Docker MCP availability
- Neo4j connectivity through Docker MCP
- OpenAI connectivity
- Playwright availability

`npm run startup` runs:

- `npm run check`
- `npm run smoke`
- `npm run smoke:playwright`

## Current Boundary

The startup path proves the repo can boot and talk to its required external systems.

It does not prove:

- graph persistence behavior inside the product
- full product wiring in the worksurface
- deeper operator workflows
