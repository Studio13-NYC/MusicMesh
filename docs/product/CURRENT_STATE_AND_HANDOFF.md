# Current State And Handoff

This document is the short takeover note for the next agent.

It should answer one question:

What is real in the repo right now, and how should the next agent work?

## Clean-Sheet Status

MusicMesh is in a clean-sheet rebuild.

The old implementation is archived and should not be treated as the active codebase:

- [\_CLEAN_SHEET_ARCHIVE_2026-04-20.zip](/D:/Studio13/Lab/Code/MusicMesh/_CLEAN_SHEET_ARCHIVE_2026-04-20.zip)

The active repo is intentionally narrow.

## Product Direction

The live direction is:

- LLM-native operator product
- chat-first
- one chat pipeline for answer and graph persistence
- `proposed` exists only as hidden graph maintenance metadata
- supporting worksurface next to the chat
- product testing should increasingly happen inside the product UI

Primary contract doc:

- [LLM_OPERATOR_CONTRACT_V1.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/LLM_OPERATOR_CONTRACT_V1.md)
- [ONE_CHAT_PIPELINE.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/ONE_CHAT_PIPELINE.md)
- [EXECUTION_LESSONS.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/EXECUTION_LESSONS.md)

## Infrastructure Reality

The startup path is real and working.

Core commands:

- `npm run check`
- `npm run startup`
- `npm run smoke`
- `npm run smoke:playwright`
- `npm run build`
- `npm run build:api`

What `npm run check` currently verifies:

- root `.env`
- Docker MCP gateway availability
- Neo4j connectivity through MCP
- OpenAI connectivity
- Playwright availability

Current local caveat:

- if Docker Desktop is not running, `npm run check` fails at the Docker MCP gateway probe; that is blocked infrastructure, not an app bug
- recent app-level checks passed with `npm run build` and `npm run check:api`

## Current UI Reality

The operator graph workbench is now the default SPA at `/`.

It is not just a plan.

Current stack:

- React
- Vite
- Radix UI
- `react-resizable-panels`

Current workbench shape:

- chat-first main surface
- neighboring graph/workflow panel
- resizable layout
- simple local API path for chat requests
- graph seed search and Cytoscape graph inspection
- graph browse filters and legend
- node/relationship inspect drawer
- `Back` / `Forward` graph history for views already shown, with no new graph research/API call
- double-click or `Expand` centers the selected node and loads that node's connected subgraph
- chat-derived domain graph persistence
- append-only conversation tape written to `output/chat/conversation-tape.ndjson`
- runtime event log written to `output/chat/runtime-events.ndjson`
- post-run quality assessment writes `run_quality_assessment` tape entries after completed chat/graph runs, with outcome, stage timings, findings, next actions, and an operator-attention flag
- answer-first chat responses now return after the chat LLM completes; graph preview, graph persistence, and run review continue as background work
- provisional graph previews are written as `graph_preview` tape entries and are never persisted to Neo4j
- graph writes persist real domain relationships; relationship examples are guidance, not an allow-list
- `canonicalStatus` / `isProposed` are hidden maintenance metadata and must not be overwritten on existing canonized graph objects

Important limitation:

- the UI is now wired to a thin GPT-5.5-backed API path
- the workbench can now read recent conversation tape entries and runtime events from disk
- the Workflow rail surfaces the latest run-quality assessment before the raw tape/runtime event streams
- chat and graph demo routes can read and write Neo4j through the local API
- the graph rail prefers completed `graph_update` entries and falls back to the latest `graph_preview` while persistence is still running
- the graph rail keeps richer local views from being collapsed by narrower focused-graph refreshes

Build/deploy note:

- `npm run build` stages the shared Azure Functions bundle before building the SPA
- `npm run build:api` installs and verifies the SWA Functions package
- GitHub Actions runs the same API sync/check path during deployment

So the operator surface is now minimally live, with one chat-driven graph path and no separate graph creation workspace.

Latest headed-browser proof from a cleared Neo4j database:

- prompt: `show me what is connected to REM`
- graph anchor: `R.E.M.`
- result: `57` nodes, `82` relationships
- housekeeping nodes: `0`
- `PROPOSED_RELATIONSHIP` edges: `0`
- runtime path: one chat pipeline sequence, not tool-call plus fallback plus proposal flow

Latest graph-interaction proofs:

- `Back` / `Forward` restored already-seen `CBGB` and `Brian Eno` graph views with `0` graph API requests during history navigation
- dragging on the canvas did not change graph counts
- double-clicking the centered `CBGB` node called `/api/graph-demo/subgraph` and did not call `/api/graph-demo/expand`
- screenshots:
  - [graph-history-workbench.png](/D:/Studio13/Lab/Code/MusicMesh/output/playwright/graph-history-workbench.png)
  - [double-click-focus-workbench.png](/D:/Studio13/Lab/Code/MusicMesh/output/playwright/double-click-focus-workbench.png)

Graph visualization decision:

- Cytoscape is the chosen graph visualization path
- NVL is removed from the active UI surface
- standalone graph demo HTML pages are removed from the active build

Decision note:

- [GRAPH_VISUALIZATION_DECISION.md](/D:/Studio13/Lab/Code/MusicMesh/docs/ui/GRAPH_VISUALIZATION_DECISION.md)
- [EXECUTION_LESSONS.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/EXECUTION_LESSONS.md)

## How The Next Agent Should Work

- run `npm run startup` first
- run `npm start` to start the local API server
- run `npm run dev` to work in the SPA
- run `npm run tape -- 50` to inspect recent tape entries from the terminal
- run `npm run llm:report` to summarize LLM stage, reasoning effort, latency, token, graph outcome, and run-quality telemetry
- treat the SPA as the main place to test the product experience
- keep terminal scripts for startup and infrastructure validation
- avoid rebuilding old architecture from the archive
- prefer simple direct wiring over abstraction sprawl
- verify product behavior in a headed browser when UI, graph, or persistence behavior changes

## Immediate Priority

The current repo is best used to test:

- answer quality in the product shell
- message rendering and interaction feel
- tape and runtime-log visibility from the worksurface
- graph focus/history/compare interactions
- graph persistence and visualization staying aligned with the answer-owned chat workflow
