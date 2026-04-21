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
- `MUSICMESH_HTTP_USER_AGENT`
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
