# AGENTS.md

This file is for new agents entering the MusicMesh clean-sheet repo.

Read this first.

More specific direct user instructions take priority over this file.

## Always Check Current Status

The MusicMesh UI and operator workflow are being actively refined.

Before acting on this file's current-state claims, always re-check the live repo status:

```powershell
git status --short
git log --oneline -n 5
Get-Content -LiteralPath "docs/product/CURRENT_STATE_AND_HANDOFF.md" -Raw
Get-Content -LiteralPath "package.json" -Raw
```

Then inspect the specific files, routes, docs, logs, and UI surfaces involved in the task.

Treat this file as orientation, not as proof that the UI, graph workflow, command set, or product wiring has not changed.

## What This Repo Is

MusicMesh is a clean-sheet restart.

The old system has been archived into:

- [_CLEAN_SHEET_ARCHIVE_2026-04-20.zip](/D:/Studio13/Lab/Code/MusicMesh/_CLEAN_SHEET_ARCHIVE_2026-04-20.zip)

Do not treat the archived system as the active implementation.

The active repo is intentionally narrow. Keep it small, legible, and oriented around the current LLM-native operator product.

## Current Active Files

Product and process docs:

- [LLM_OPERATOR_CONTRACT_V1.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/LLM_OPERATOR_CONTRACT_V1.md)
- [roleplay-spec.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/roleplay-spec.md)
- [CURRENT_STATE_AND_HANDOFF.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/CURRENT_STATE_AND_HANDOFF.md)
- [project_startup_guide.md](/D:/Studio13/Lab/Code/MusicMesh/docs/project_startup_guide.md)

Current runtime and bootstrap code:

- [package.json](/D:/Studio13/Lab/Code/MusicMesh/package.json)
- [src/index.js](/D:/Studio13/Lab/Code/MusicMesh/src/index.js)
- [src/server.js](/D:/Studio13/Lab/Code/MusicMesh/src/server.js)
- [src/chatService.js](/D:/Studio13/Lab/Code/MusicMesh/src/chatService.js)
- [src/env.js](/D:/Studio13/Lab/Code/MusicMesh/src/env.js)
- [src/check.js](/D:/Studio13/Lab/Code/MusicMesh/src/check.js)
- [scripts/playwrightSmoke.js](/D:/Studio13/Lab/Code/MusicMesh/scripts/playwrightSmoke.js)

Current SPA UI code:

- [ui/index.html](/D:/Studio13/Lab/Code/MusicMesh/ui/index.html)
- [ui/vite.config.mjs](/D:/Studio13/Lab/Code/MusicMesh/ui/vite.config.mjs)
- [ui/src/main.jsx](/D:/Studio13/Lab/Code/MusicMesh/ui/src/main.jsx)
- [ui/src/router.jsx](/D:/Studio13/Lab/Code/MusicMesh/ui/src/router.jsx)
- [ui/src/app/AppShell.jsx](/D:/Studio13/Lab/Code/MusicMesh/ui/src/app/AppShell.jsx)
- [ui/src/styles/app.css](/D:/Studio13/Lab/Code/MusicMesh/ui/src/styles/app.css)

Protected local folder:

- `STAY/`

Do not touch `STAY/` unless the user explicitly asks.

## Product Direction

MusicMesh is an LLM-native operator system for music knowledge work.

The clean-sheet direction is:

- the LLM is the primary point of contact
- the product is chat-first
- direct answers and graph work should feel like one system
- the user should get a direct answer first when that is what they need
- graph persistence is explicit and must be verifiable
- default graph rule is `propose first, review before canon`
- reuse existing canon and schema before inventing new structure
- avoid overengineering and drift from the core operator product

If you need the behavioral contract, read:

- [LLM_OPERATOR_CONTRACT_V1.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/LLM_OPERATOR_CONTRACT_V1.md)

If you need the transcript that shaped this direction, read:

- [roleplay-spec.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/roleplay-spec.md)

## Current UI Reality

The operator graph workbench is now the default SPA at `/`.

It is not just a plan.

Current stack:

- React
- Vite
- Radix UI
- `react-resizable-panels`
- Cytoscape for graph visualization

Current workbench shape:

- chat-first main surface
- neighboring graph/workflow panel
- resizable layout
- simple local API path for chat requests
- graph seed search and Cytoscape graph inspection
- chat-derived domain graph persistence
- append-only conversation tape written to `output/chat/conversation-tape.ndjson`
- runtime event log written to `output/chat/runtime-events.ndjson`

Important limitations:

- the UI is wired to a thin GPT-5.5-backed API path
- the workbench reads recent conversation tape entries and runtime events from disk
- chat and graph demo routes can read and write Neo4j through the local API
- the operator surface is minimally live, not complete
- there is one chat-driven graph path and no separate graph creation workspace

This distinction matters:

- the operator workbench is real
- the interaction model is real
- graph persistence exists, but must be verified separately from the chat answer

Key UI docs:

- [SPA_ARCHITECTURE.md](/D:/Studio13/Lab/Code/MusicMesh/docs/architecture/SPA_ARCHITECTURE.md)
- [UI_LAYOUT_GUIDE.md](/D:/Studio13/Lab/Code/MusicMesh/docs/ui/UI_LAYOUT_GUIDE.md)
- [CHAT_AND_WORKSURFACE_SPEC.md](/D:/Studio13/Lab/Code/MusicMesh/docs/ui/CHAT_AND_WORKSURFACE_SPEC.md)
- [GRAPH_VISUALIZATION_DECISION.md](/D:/Studio13/Lab/Code/MusicMesh/docs/ui/GRAPH_VISUALIZATION_DECISION.md)

## LLM-Centered Operator Rules

Treat LLM behavior as core product behavior, not glue code.

- Start with the actual runtime path: prompt assembly, model selection, tool calls, graph retrieval, proposal generation, persistence, tape writes, runtime events, and UI rendering.
- Inspect the real instructions sent to the model before editing prompts or surrounding orchestration.
- Keep prompts outcome-first: define the role, success criteria, grounding rules, output shape, and failure behavior.
- Give the LLM enough structured context to reason over the data directly: existing canon, candidate entities, schemas, retrieved evidence, proposal state, tool results, and relevant constraints.
- Avoid brittle parsing such as regex or fragile string splitting for entity interpretation, intent detection, graph modeling, proposal construction, or citation/evidence recovery.
- Use regex only for stable lexical tasks such as simple validation, known filename patterns, or mechanical cleanup where the pattern is stable and testable.
- Do not patch bad behavior by stacking more prompt text on top of unclear product logic.
- Keep one primary answer path unless there is a clear product reason for multiple modes.
- Make tool use serve the answer; do not expose internal workflow steps to the user unless that helps them.
- If graph context is thin, noisy, or ambiguous, improve retrieval/tool contracts before adding prompt pressure.
- If graph tooling returns ambiguity or `needs_human_input`, ask the user what to do next instead of inventing entities or relationships.
- Never imply that persistence, graph updates, canon changes, or external actions happened unless tool output, runtime logs, or database state proves it.
- Preserve uncertainty: distinguish known graph facts, retrieved evidence, model inference, and unresolved ambiguity.
- For agentic workflows, define the boundary between what the model may decide, what tools may do, and what requires human review.

## Startup Commands

Run these first from [MusicMesh](/D:/Studio13/Lab/Code/MusicMesh):

```powershell
npm install
npm run startup
```

Common development commands:

```powershell
npm start
npm run dev
npm run build
npm run build:api
npm run check
npm run smoke
npm run smoke:playwright
npm run tape -- 50
npm run llm:report
```

What they currently prove:

- `npm run check`
  - validates the root `.env`
  - verifies the Docker MCP gateway is available
  - verifies Neo4j connectivity through the Docker MCP gateway with a live read query
  - verifies OpenAI connectivity
  - verifies Playwright CLI availability
- `npm run startup`
  - runs `npm run check`
  - runs the bootstrap smoke check
  - runs the Playwright smoke check
- `npm start`
  - starts the local API server
- `npm run dev`
  - starts the Vite SPA for product-side testing
- `npm run build`
  - stages the shared Azure Functions bundle and verifies the current UI builds
- `npm run build:api`
  - installs and verifies the SWA Functions package
- `npm run smoke`
  - proves the runtime entrypoint executes
- `npm run smoke:playwright`
  - proves browser automation works and writes a screenshot artifact
- `npm run tape -- 50`
  - inspects recent conversation tape entries from the terminal
- `npm run llm:report`
  - summarizes LLM reasoning effort, latency, token usage, and graph outcome telemetry from runtime events

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
- `OPENAI_REASONING_EFFORT`
- `OPENAI_REASONING_EFFORT_DEFAULT`
- `OPENAI_REASONING_EFFORT_KNOWLEDGE`
- `OPENAI_REASONING_EFFORT_CHAT_COMPLEX`
- `OPENAI_REASONING_EFFORT_GRAPH_PREVIEW`
- `OPENAI_REASONING_EFFORT_GRAPH_PLAN`
- `OPENAI_REASONING_EFFORT_GRAPH_GROUNDING`
- `OPENAI_REASONING_EFFORT_HUMAN_LOOP`
- `OPENAI_REASONING_EFFORT_RUN_REVIEW`
- `OPENAI_REASONING_EFFORT_MAINTENANCE`
- `MUSICMESH_HTTP_USER_AGENT`
- `MUSICMESH_BLOB_CONNECTION_STRING`
- `MUSICMESH_BLOB_CONTAINER`
- `AURA_INSTANCEID`
- `AURA_INSTANCENAME`

Operational rules:

- Aura is the active graph target unless the user explicitly changes direction.
- Do not silently switch to local Neo4j or another graph target to make a check pass.
- If Aura, Docker MCP, OpenAI, or Playwright is unavailable, report blocked infrastructure rather than treating it as an app bug.
- Never print or commit secrets.

## Verified External Connections

As of the current clean-sheet bootstrap:

- Neo4j graph access through `MCP_DOCKER` is working
- Playwright is available locally

Operational requirement:

- the Docker-backed MCP service must be running before relying on `MCP_DOCKER`
- if `MCP_DOCKER` is unavailable, graph-dependent work is blocked infrastructure

Verified checks used so far:

```powershell
docker mcp tools call read_neo4j_cypher query="RETURN 1 AS ok"
npx playwright --version
npm run smoke:playwright
```

## Testing Posture

Product testing should happen in the SPA, not just through scripts and terminal checks.

The next agent should assume:

- the goal is to exercise MusicMesh through its own chat and worksurface
- terminal scripts remain important for infrastructure verification
- UI and product behavior should increasingly be tested from inside the product itself
- Playwright is currently verified as a local toolchain
- a separate Playwright MCP server has not been established as a required baseline

For UI, persist-path, storage-path, or graph-path changes, prefer visible browser validation when practical.

## Validation Expectations

Before claiming work is done, run the smallest useful proof.

- For infrastructure readiness, use `npm run check` or `npm run startup`.
- For UI behavior, test through the SPA/workbench, not only through terminal scripts.
- For graph or persistence behavior, verify logs, tape entries, proposal output, and Neo4j state separately from the chat answer.
- Do not treat a good answer as proof that the graph updated.
- Do not treat browser completion as proof that persistence worked.
- Pair live UI runs with saved-log inspection when persistence, graph writes, or runtime orchestration matters.
- Use `npm run tape -- 50` to inspect recent conversation tape entries.
- Use `npm run llm:report` to inspect long-term LLM stage and reasoning-effort telemetry.
- Inspect `output/chat/runtime-events.ndjson` when diagnosing runtime behavior.
- If a check cannot run, say exactly why and what remains unverified.

## Working Rules

- Simplicity first.
- No one-off hacks.
- Running code over architecture.
- When in doubt, ask a question.
- Start from the real repo: files, scripts, docs, logs, runtime behavior, and visible product behavior.
- Prefer one clear path over multiple overlapping flows.
- Keep the active repo small and legible.
- Prefer existing canon, schema, runtime patterns, and UI conventions over new structure.
- Keep changes scoped to the user's request.
- Do not revert or overwrite user changes unless explicitly asked.
- Write docs when decisions matter, and keep docs aligned with current code.
- Verify claims by running code where possible.

## What Not To Do

- Do not grep the archive zip and treat it as the current codebase.
- Do not restore large parts of the old implementation unless the user explicitly asks.
- Do not add optional integrations to the startup path without a clear reason.
- Do not invent schema, runtime layers, or workflows just because they existed before.
- Do not create generic graph entities from failed extraction.
- Do not silently create canon writes when ambiguity remains.
- Do not hide workflow machinery in the user experience unless it improves the operator task.

## Specialist Sub-Agents

Specialist sub-agents are optional, not required.

Use them only for bounded, separable work such as:

- codebase exploration
- graph/schema review
- prompt or tool-contract review
- UI/UX review
- test/log investigation
- implementation in a clearly owned module

The main agent remains responsible for product judgment, integration, and final verification.

Do not delegate the immediate blocking step if the main task depends on it right now.
Do not run competing agents against the same files or problem.
Treat sub-agent output as input to review and integrate, not as automatically correct.

## Documentation Expectations

Docs should state current truth:

- what exists
- how to run it
- how to verify it
- what is incomplete
- what should not be used anymore

Avoid documenting planned architecture as if it already exists.
Remove or correct stale guidance when it conflicts with current code.
Prefer takeover-grade current-state notes over aspirational architecture.

## Git Expectations

Before edits:

```powershell
git status --short
```

Git rules:

- keep user changes intact
- do not commit unrelated changes
- use clear, descriptive commit messages when asked to commit
- do not run destructive commands such as reset, clean, checkout, or force-push unless explicitly instructed
- if the working tree is dirty, work with the existing changes instead of assuming they are disposable

## Next Likely Work

The current repo is best used for:

- testing answer quality in the product shell
- tightening message rendering and interaction feel
- improving tape and runtime-log visibility from the worksurface
- verifying that chat-derived graph persistence behaves correctly
- keeping graph visualization aligned with the answer-owned operator workflow
