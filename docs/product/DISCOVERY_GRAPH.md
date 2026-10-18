# Interactive discovery graph

## Selected design and implementation plan — 18 October 2026

Nick selected the interactive Lowe/Edmunds and Mickey Jupp graphs shown in this conversation as the app design reference. Bring the same node buttons, curved connections, focused neighborhood and source/confidence inspector into the existing workbench. Fullscreen is a first-class viewing mode. Keep existing graph history, seed search, filters and chat-driven expansion.

Implementation sequence:
1. Add a reusable discovery renderer over the existing graph payload. Use an immediate deterministic layout, accessible node/connection buttons and a responsive inspector. Keep the existing network renderer available for dense catalog inspection.
2. Preserve compact evidence fields in graph projections. Present a saved EvidenceAssertion as a subject-to-factor connection only when both identities are present; retain its ID, scope, mode, source and confidence. Do not merge similarly named entities or infer credits.
3. Extend the existing `graph` researcher tool with `action: present`. Select a bounded set of saved public IDs, retrieve their actual connecting relationships and applicable saved assertions, and replace the current presentation. This is a read, not a graph write. No generated HTML or separate layout model call.
4. Verify projections, bounds, privacy, runner state and the actual local/deployed workbench. Record results below.

The supplied Astra-high Lowe/Edmunds report is a research coverage reference: start with artist associations, then albums/sessions, personnel, studios, repertoire, equipment and methods. Its reported 3.5-minute duration is not an app latency measurement. Supplied claims remain attributed research until checked/saved with their appropriate scope and confidence. This UI change does not change the application model or automatically import the report.

## Implemented interface

Discovery is the default graph view. **Browse → search → Load** reads the saved neighborhood directly, with zero model calls. **Full screen** opens the graph and its inspector; Escape returns focus to the button and preserves the selected node/connection. **Network view** retains Cytoscape inspection of the underlying graph. Double-click / Explore continues through the existing chat expansion path. Back/Forward reuse graph payloads in this browser session.

Nodes and connection buttons support keyboard navigation. The inspector shows scope, add/exclude/override mode, labeled evidence summary or excerpt, score/reason, source and stored identity. Missing scores remain unassessed; zero remains unsupported. Parallel claims and similarly named recordings remain distinct. Mobile uses two columns with the inspector below; desktop fullscreen uses three columns and a side inspector. Layout is immediate, without a force simulation or model call.

## Agent contract

Use the existing `graph` tool. Resolve the identity first, then:

```json
{
  "action": "present",
  "id": "musicbrainz:release-group:8f3528a4-8f36-3614-8de8-a353c8d47b4f",
  "title": "Juppanese — two production teams"
}
```

For a curated view, replace `id` with `nodeIds`, an ordered list of 1–30 exact saved public IDs. The first ID is the seed; order controls grid placement. A seed lookup prioritizes the subject's saved claim factors, then catalog neighbors, at most 29. Both modes load up to 60 relevant assertions and 240 actual relationships, indicating truncation. Unknown/private IDs are rejected. The returned `replaceGraph` replaces accumulated search clutter; subsequent reads leave that presentation intact until another `present` call.

The renderer receives the existing `{seedNode,nodes,edges,meta}` payload. `meta.title`, `meta.presentation` and `meta.nodeOrder` are optional presentation fields. `properties` holds a strict compact evidence projection. An assertion is displayed as one subject→factor edge only when both endpoints are in the view; its `assertionId` remains available. Incomplete assertions remain nodes. This is display normalization, not a persisted relationship or identity merge. Multi-hop paths remain their actual component relationships; the model cannot invent a summary edge or supply executable HTML.

Direct clients use `POST /api/graph-demo/subgraph` with `{seedId, presentation:true}`. Local and Azure use the same implementation. No schema migration, new dependencies, catalog writes or bulk reads are required. A view is browser-session state; durable research runs retain their existing 24-hour lifetime, not a permanent saved-view library.

## Verification

Local workbench: natural-language Juppanese request `req-97baddee-8540-4632-919c-cc9e50c54f06` displayed 14 domain nodes and 19 connections. Nick Lowe and Gary Brooker producer inspectors exposed their 95/100 partial-album claims and real source URLs. The first attempt exhausted retrieval budget; adding seed presentation corrected this. Successful chat used 5 response steps / 17,153 total tokens; token use still merits separate optimization. Direct browsing rendered the same view without a model call. Display-only selections do not invoke research.

Desktop 1280px and narrow 375px checks found no horizontal graph overflow; keyboard connection selection, Escape/focus return and retained selection passed. UI console had no errors. `npm test`: 103 passed, 17 opt-in database tests skipped. `npm run build`, `npm run build:api`, `npm run check:api` passed; existing bundle-size and API dependency-audit warnings remain. The bounded live graph read exercised main's saved data; no domain writes were performed by this feature test.

Runtime: `src/researchTools.js`, `src/researchRunner.js`, `src/discoveryProjection.js`, `src/graphDemoRepository.js`; renderer: `ui/src/graph-demos/DiscoveryCanvas.jsx`, `discoveryGraph.mjs`, `discovery.css`. Tests: `tests/discoveryGraph.test.js`.
