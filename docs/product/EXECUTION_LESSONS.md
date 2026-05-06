# Execution Lessons

This is the short operating guide for good MusicMesh execution and planning.

It is based on what has worked in the current repo, not on aspirational process.

## Start From The Product Surface

Work from the real files, running app, logs, and database state before forming strong conclusions.

For product behavior, a passing script is not enough. Use the operator workbench and confirm what the user would see.

When graph behavior matters, verify at least two surfaces:

- browser result in the SPA
- runtime/tape/API/database evidence for the same action

## Keep One Path Clear

MusicMesh works best when the user-facing path stays simple:

1. user asks in chat
2. assistant answers
3. graph preview/persistence happens through the chat pipeline
4. graph workbench displays real music-domain nodes and relationships

Avoid adding parallel proposal, review, apply, or alternate graph creation flows unless the product direction explicitly changes.

## Prove The Exact Failure

When a visible UI bug appears, trace the actual state transition.

Recent examples:

- dragging a node did not remove graph data directly; a later graph reload could replace a richer local view with a narrower focused graph
- double-clicking a node was wired correctly as an event, but it used incremental expansion instead of recentering the selected node

The useful fix came from matching the user's mental model:

- graph history replays views already seen without new research
- double-click / `Expand` centers the selected node and loads its connected subgraph

## Make State Navigable

Interactive graph work is exploratory. Users need to compare, backtrack, and revisit.

Graph view changes should become navigable snapshots when they materially change the graph payload:

- new seed loaded
- chat focus loaded
- preview replaced by persisted graph
- selected node centered

Position-only changes, such as dragging a node, should update the current snapshot rather than create another history step.

## Separate Housekeeping From UX

`canonicalStatus` and `isProposed` are offline maintenance metadata.

They must not become:

- node kinds
- relationship types
- graph labels
- browse filters
- workflow modes
- review/apply UI

Users should see real domain relationships such as `MEMBER_OF`, `IS_A_TRACK_ON`, `RELEASED_ALBUM`, or an LLM-proposed real relationship type when the existing examples do not fit.

## Prefer LLM Reasoning For Semantics

Use the LLM for music-domain interpretation:

- what entities are meant
- what relationships are real
- whether ambiguity requires human input
- whether an existing canon entity is the same intended entity

Use deterministic code for stable mechanical work:

- JSON shape validation
- Cypher writes
- graph payload filtering
- UI grouping/counting
- log aggregation

Do not patch semantic failures with regex-heavy post-processing.

## Validate Before Claiming Done

Use the smallest proof that covers the changed behavior.

Typical checks:

```powershell
npm run build
npm run check:api
```

Use `npm run check` or `npm run startup` when Docker MCP is running and infrastructure readiness is part of the claim.

For UI behavior, run a headed browser proof and save a screenshot under `output/playwright/`.

For deployment, confirm:

- commit pushed
- GitHub Actions deployment succeeded
- `https://musicmesh.s13.nyc/` returns `200`

## Report Blockers As Blockers

If Docker Desktop, Docker MCP, Aura, OpenAI, Playwright, or Azure deployment is unavailable, say that directly.

Do not turn infrastructure absence into an app diagnosis.

## Keep Docs Current

Docs should state what exists now:

- current routes and files
- current commands
- current behavior
- known limitations
- recent verification evidence

When the implementation changes, update the canonical docs instead of leaving stale architectural plans beside the working product.
