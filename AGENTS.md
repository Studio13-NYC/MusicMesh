# AGENTS.md

This file is for new agents entering the MusicMesh clean-sheet repo.

Read this first.

## What This Repo Is

This is a clean-sheet restart of MusicMesh.

The old system has been archived into:

- [\_CLEAN_SHEET_ARCHIVE_2026-04-20.zip](/D:/Studio13/Lab/Code/MusicMesh/_CLEAN_SHEET_ARCHIVE_2026-04-20.zip)

Do not treat the archived system as the active implementation.

The active repo is intentionally small.

## Current Active Files

Product and process docs:

- [LLM_OPERATOR_CONTRACT_V1.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/LLM_OPERATOR_CONTRACT_V1.md)
- [roleplay-spec.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/roleplay-spec.md)
- [CURRENT_STATE_AND_HANDOFF.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/CURRENT_STATE_AND_HANDOFF.md)
- [project_startup_guide.md](/D:/Studio13/Lab/Code/MusicMesh/docs/project_startup_guide.md)

Current bootstrap code:

- [package.json](/D:/Studio13/Lab/Code/MusicMesh/package.json)
- [src/index.js](/D:/Studio13/Lab/Code/MusicMesh/src/index.js)
- [src/env.js](/D:/Studio13/Lab/Code/MusicMesh/src/env.js)
- [src/check.js](/D:/Studio13/Lab/Code/MusicMesh/src/check.js)
- [scripts/playwrightSmoke.js](/D:/Studio13/Lab/Code/MusicMesh/scripts/playwrightSmoke.js)

Current SPA UI code:

- [ui/index.html](/D:/Studio13/Lab/Code/MusicMesh/ui/index.html)
- [ui/vite.config.mjs](/D:/Studio13/Lab/Code/MusicMesh/ui/vite.config.mjs)
- [ui/src/main.jsx](/D:/Studio13/Lab/Code/MusicMesh/ui/src/main.jsx)
- [ui/src/router.jsx](/D:/Studio13/Lab/Code/MusicMesh/ui/src/router.jsx)
- [ui/src/app/AppShell.jsx](/D:/Studio13/Lab/Code/MusicMesh/ui/src/app/AppShell.jsx)
- [ui/src/data/workspace.js](/D:/Studio13/Lab/Code/MusicMesh/ui/src/data/workspace.js)
- [ui/src/styles/app.css](/D:/Studio13/Lab/Code/MusicMesh/ui/src/styles/app.css)

Protected local folder:

- `STAY/`

Do not touch `STAY/` unless the user explicitly asks.

## Product Direction

The clean-sheet direction is:

- MusicMesh is an LLM-native operator system for music knowledge work
- the LLM is the primary point of contact
- direct answers and graph work should feel like one system
- default graph rule is `propose first, review before canon`
- reuse existing canon and schema before inventing new structure
- avoid overengineering and drift from the core operator product

If you need the behavioral contract, read:

- [LLM_OPERATOR_CONTRACT_V1.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/LLM_OPERATOR_CONTRACT_V1.md)

If you need the transcript that shaped this direction, read:

- [roleplay-spec.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/roleplay-spec.md)

## Startup Commands

Run these first:

```powershell
npm install
npm run startup
npm run dev
npm run build
npm run check
npm run smoke
npm run smoke:playwright
```

What they currently prove:

- `npm run check`
  - validates the root `.env`
  - verifies the Docker MCP gateway is available
  - verifies Neo4j connectivity through the Docker MCP gateway with a live read query
  - verifies OpenAI connectivity
  - verifies Playwright CLI availability
- `npm run startup`
  - runs the full startup verification path
  - runs the bootstrap smoke check
  - runs the Playwright smoke check
- `npm run dev`
  - starts the Vite SPA for product-side testing
- `npm run build`
  - verifies the current UI builds successfully
- `npm run smoke`
  - proves the runtime entrypoint executes
- `npm run smoke:playwright`
  - proves browser automation works and writes a screenshot artifact

Current screenshot artifact:

- [smoke.png](/D:/Studio13/Lab/Code/MusicMesh/output/playwright/smoke.png)

## Environment

The root `.env` is active.

Current required env keys:

- `OPENAI_API_KEY`
- `NEO4J_URI`
- `NEO4J_USERNAME`
- `NEO4J_PASSWORD`
- `NEO4J_DATABASE`

Current optional env keys:

- `BRAVE_API_KEY`
- `DISCOGS_TOKEN`
- `MUSICMESH_HTTP_USER_AGENT`
- `AURA_INSTANCEID`
- `AURA_INSTANCENAME`

## Verified External Connections

As of the current clean-sheet bootstrap:

- Neo4j graph access through `MCP_DOCKER` is working
- Playwright is available locally

Operational requirement:

- the Docker-backed MCP service must be running before you rely on `MCP_DOCKER`
- if `MCP_DOCKER` is unavailable, treat graph-dependent work as blocked infrastructure, not as an app bug

Verified checks used so far:

- `docker mcp tools call read_neo4j_cypher query="RETURN 1 AS ok"`
- `npx playwright --version`
- `npm run smoke:playwright`

## Current UI Reality

As of the current repo state:

- a basic SPA shell exists
- it is chat-first
- it has a neighboring worksurface panel
- it uses React, Vite, TanStack Router, Radix UI, and `react-resizable-panels`
- the current shell still includes seeded local conversation and panel scaffolding
- it is wired to a thin GPT-5.4-backed local API path
- the worksurface reads recent conversation tape entries and runtime events from disk
- it is not yet wired to deeper trace, graph, or database returns from the running product

This distinction matters:

- the shell is real
- the interaction model is real
- the current product wiring is thin, not complete

The current UI build has been verified with:

- `npm run build`

Key UI docs:

- [SPA_ARCHITECTURE.md](/D:/Studio13/Lab/Code/MusicMesh/docs/architecture/SPA_ARCHITECTURE.md)
- [UI_LAYOUT_GUIDE.md](/D:/Studio13/Lab/Code/MusicMesh/docs/ui/UI_LAYOUT_GUIDE.md)
- [CHAT_AND_WORKSURFACE_SPEC.md](/D:/Studio13/Lab/Code/MusicMesh/docs/ui/CHAT_AND_WORKSURFACE_SPEC.md)

## Testing Posture

The next agent should assume:

- product testing should happen in the SPA, not just through scripts and terminal checks
- the goal is to exercise MusicMesh through its own chat and worksurface
- terminal scripts remain important for infrastructure verification
- but UI and product behavior should increasingly be tested from inside the product itself

Important distinction:

- `MCP_DOCKER` is a required clean-sheet graph connection
- Playwright is currently verified as a local toolchain
- a separate Playwright MCP server has not been established as a required baseline

## Working Rules

- simplicity first
- no one-off hacks
- running code over architecture
- when in doubt, ask a question

Additional repo guardrails:

- do not rebuild the archived system by accident
- keep the active repo small and legible
- prefer one clear path over multiple overlapping flows
- write docs when decisions matter
- verify claims by running code where possible

## What Not To Do

- do not grep the zip and treat it as the current codebase
- do not restore large parts of the old implementation unless the user explicitly asks
- do not add optional integrations to the startup path without a clear reason
- do not invent schema, runtime layers, or workflows just because they existed before

## Next Likely Work

The current repo is best used for:

- testing answer quality in the shell
- tightening the interaction feel
- improving what the worksurface shows without adding fake product layers
