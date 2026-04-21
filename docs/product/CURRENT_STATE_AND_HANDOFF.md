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
- answer-first with explicit persistence
- propose-first review boundary for graph changes
- supporting worksurface next to the chat
- product testing should increasingly happen inside the product UI

Primary contract doc:

- [LLM_OPERATOR_CONTRACT_V1.md](/D:/Studio13/Lab/Code/MusicMesh/docs/product/LLM_OPERATOR_CONTRACT_V1.md)

## Infrastructure Reality

The startup path is real and working.

Verified commands:

- `npm run check`
- `npm run startup`
- `npm run smoke`
- `npm run smoke:playwright`
- `npm run build`

What `npm run check` currently verifies:

- root `.env`
- Docker MCP gateway availability
- Neo4j connectivity through MCP
- OpenAI connectivity
- Playwright availability

## Current UI Reality

A basic SPA shell now exists.

It is not just a plan.

Current stack:

- React
- Vite
- TanStack Router
- Radix UI
- `react-resizable-panels`

Current shell shape:

- chat-first main surface
- neighboring worksurface panel
- local sample thread and sample panel data
- resizable layout
- simple local API path for chat requests
- append-only conversation tape written to `output/chat/conversation-tape.ndjson`
- runtime event log written to `output/chat/runtime-events.ndjson`

Important limitation:

- the UI is now wired to a thin GPT-5.4-backed API path
- the worksurface can now read recent conversation tape entries and runtime events from disk
- the product still does not have deeper log, trace, or database readback wiring

So the shell is now minimally live, but the broader product wiring is still not finished.

## How The Next Agent Should Work

- run `npm run startup` first
- run `npm start` to start the local API server
- run `npm run dev` to work in the SPA
- run `npm run tape -- 50` to inspect recent tape entries from the terminal
- treat the SPA as the main place to test the product experience
- keep terminal scripts for startup and infrastructure validation
- avoid rebuilding old architecture from the archive
- prefer simple direct wiring over abstraction sprawl

## Immediate Priority

The current repo is best used to test:

- answer quality in the product shell
- message rendering and interaction feel
- tape and runtime-log visibility from the worksurface
