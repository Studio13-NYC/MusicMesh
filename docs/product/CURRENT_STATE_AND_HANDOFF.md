# Current State And Handoff

This document is the short takeover note for the next agent.

It should answer one question:

What is real in the repo right now, and how should the next agent work?

Last refreshed: 2026-05-13 after rolling back the Workbench rails UI pass.

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
- [ONTOLOGY_REVIEW.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/ONTOLOGY_REVIEW.md)
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
- recent startup/infrastructure check passed with `npm run check`

## Current Deployment Reality

The deployment path is push-driven:

- GitHub Actions uses Azure Static Web Apps
- UI build output: `output/ui-dist`
- API bundle: `api/`
- workflow: [.github/workflows/azure-static-web-apps-green-flower-05b42040f.yml](/D:/Studio13/Lab/Code/MusicMesh/.github/workflows/azure-static-web-apps-green-flower-05b42040f.yml)
- deployment/API notes: [LOCAL_AND_AZURE_API.md](/D:/Studio13/Lab/Code/MusicMesh/docs/deployment/LOCAL_AND_AZURE_API.md)

Deployment verification should check:

```powershell
gh run list --workflow azure-static-web-apps-green-flower-05b42040f.yml --limit 1
curl.exe -I https://musicmesh.s13.nyc/
curl.exe https://musicmesh.s13.nyc/api/chat/tape?limit=1
```

Known stable deployment proof before the rollback:

- GitHub Actions run `25741185320` completed successfully for commit `b82d3e9`
- `https://musicmesh.s13.nyc/` returned `200`
- `https://musicmesh.s13.nyc/api/chat/tape?limit=1` returned a deployed API response from `azureblob://musicmeshchat/conversation-tape.ndjson`

## Current UI Reality

The operator graph workbench is now the default SPA at `/`.

It is not just a plan.

Current stack:

- React
- Vite
- Radix UI
- Cytoscape
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
- double-click or `Expand` routes through chat and asks MusicMesh to expand the selected node
- chat-derived domain graph persistence
- append-only conversation tape written to `output/chat/conversation-tape.ndjson`
- runtime event log written to `output/chat/runtime-events.ndjson`
- post-run quality assessment writes `run_quality_assessment` tape entries after completed chat/graph runs, with outcome, stage timings, findings, next actions, and an operator-attention flag
- answer-first chat responses now return after the chat LLM completes; graph preview, graph persistence, and run review continue as background work
- provisional graph previews are written as `graph_preview` tape entries and are never persisted to Neo4j
- graph progress is visible after the answer appears, including preview, Complete Graph grounding, saving, saved, and human-input-needed states
- expansion sends the selected node and current graph view as context, then grounds output against the Complete Graph, meaning all Neo4j content rather than only the visible canvas
- expansion previews that cannot be safely connected to existing Complete Graph nodes are not silently persisted
- graph subgraph reads now rehydrate direct relationships among the visible Complete Graph nodes, so a node such as `Capitol Records` should not appear isolated when its persisted edges are in the returned graph
- graph writes persist real domain relationships; relationship examples are guidance, not an allow-list
- `canonicalStatus` / `isProposed` are hidden maintenance metadata and must not be overwritten on existing canonized graph objects
- `Other` and generic `Entity` are ontology-review signals, not final modeling destinations

Important limitation:

- the UI is now wired to a thin GPT-5.5-backed API path
- the workbench can now read recent conversation tape entries and runtime events from disk
- the Workflow panel surfaces the latest run-quality assessment before the raw tape/runtime event streams
- chat and graph demo routes can read and write Neo4j through the local API
- the graph workspace prefers completed `graph_update` entries and falls back to the latest `graph_preview` while persistence is still running
- the graph workspace keeps richer local views from being collapsed by narrower focused-graph refreshes
- for the same request, persisted graph updates should win over previews when the thread focus is resolved

Build/deploy note:

- `npm run build` stages the shared Azure Functions bundle before building the SPA
- `npm run build:api` installs and verifies the SWA Functions package
- GitHub Actions runs the same API sync/check path during deployment

Schema-growth note:

- relationship types are LLM-reasoned and are not restricted to a hard allow-list; the writer sanitizes and persists real domain relationship names, not `PROPOSED_RELATIONSHIP`
- entity labels are still constrained by `ALLOWED_NODE_LABELS` in [graphDomainWriter.js](/D:/Studio13/Lab/Code/MusicMesh/src/graphDomainWriter.js)
- when the LLM needs a new entity type that is not in that catalog, the current fallback can still drift toward generic `Entity`
- the next clean step is a chat-driven ontology/type registry with a small human confirmation loop, so the user can create types such as `MixingConsole`, `TapeMachine`, `Microphone`, or `MasteringEngineer` without editing code

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
- double-click and `Expand` now use chat-routed expansion, then show whether the preview was saved to the Complete Graph or needs human input before saving
- graph-read sanity check for `Capitol Records` returned `13` nodes and `14` edges, including persisted links to The Beatles, The Beach Boys, Capitol Studios, Hollywood, founders, and label/release relationships
- screenshots:
  - [graph-history-workbench.png](/D:/Studio13/Lab/Code/MusicMesh/output/playwright/graph-history-workbench.png)
  - [double-click-focus-workbench.png](/D:/Studio13/Lab/Code/MusicMesh/output/playwright/double-click-focus-workbench.png)

Latest verification commands:

```powershell
npm run build:ui
npm run build
npm run check:api
npm run check
```

Known nonfatal verification noise:

- Vite reports the main bundle is larger than 500 kB after minification
- Azure Functions local verification logs test-mode warnings because it is not running inside the Functions runtime

Rollback note:

- The Workbench rails UI pass from commit `799421a` was rolled back because it introduced multiple UI issues and there was no time to tune them safely.
- The rollback restores the previous resizable chat/workbench layout and the Browse/Inspect graph drawers.
- Graph APIs, Neo4j persistence, LLM orchestration, chat-routed expansion, tape reads, runtime reads, and GitNexus segregation remain unchanged.

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
- run `npm run ontology:review` to inspect generic `Other` graph objects and non-housekeeping properties that may be hiding reusable domain concepts
- treat the SPA as the main place to test the product experience
- keep terminal scripts for startup and infrastructure validation
- avoid rebuilding old architecture from the archive
- prefer simple direct wiring over abstraction sprawl
- verify product behavior in a headed browser when UI, graph, or persistence behavior changes
- for graph writes, verify the UI state, runtime events, tape entries, and Neo4j state separately; a good answer or preview is not proof of persistence

## Immediate Priority

The current repo is best used to test:

- answer quality in the product shell
- message rendering and interaction feel
- tape and runtime-log visibility from the worksurface
- graph focus/history/compare interactions
- graph persistence and visualization staying aligned with the answer-owned chat workflow
- schema/ontology growth from chat, especially adding reusable entity types without falling back to generic `Entity`
