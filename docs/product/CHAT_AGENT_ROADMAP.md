# Chat Agent Notes

This file records the current state of the MusicMesh chat agent.

It is intentionally short.

## What Is Real

The product currently has:

- a thin local API server
- a GPT-5.4-backed chat request path
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

## Working Interpretation

Right now the product agent should be treated as:

- a thin conversational MusicMesh shell
- useful for testing answer quality and interaction feel
- not yet a trusted graph operator inside the product
