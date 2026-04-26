# Chat Agent Notes

This file records the current state of the MusicMesh chat agent.

It is intentionally short.

## What Is Real

The product currently has:

- a thin local API server
- a GPT-5.5-backed chat request path
- a chat-first SPA shell
- a neighboring worksurface
- an append-only conversation tape on disk
- a runtime event log on disk

## What The Agent Currently Does

- answers through a single chat call
- uses the MusicMesh system prompt in `docs/product/MUSICMESH_CHAT_SYSTEM_PROMPT.md`
- writes user and assistant turns to the conversation tape
- writes request lifecycle events to the runtime log

## What The Agent Does Not Yet Do

- live graph-aware persistence from the product
- canon lookup from the product chat path
- schema inspection from the product chat path
- review-shaped proposal generation from the product chat path

## First Graph Ingestion Slice

The repo now includes a proposal-first entity-list ingestion path outside the normal chat call:

- canon and schema lookup
- bounded multi-hop traversal around matched canon entities
- GPT-5.5 structured proposal drafting
- file-backed proposal storage
- review and approved-apply API routes

The chat path itself is still intentionally thin. The next product step is to let the operator chat invoke this proposal lane when the user asks to create graph data.

## Working Interpretation

Right now the product agent should be treated as:

- a thin conversational MusicMesh shell
- useful for testing answer quality and interaction feel
- not yet a trusted graph operator inside the product
