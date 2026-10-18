# Graph Visualization Decision

Updated 18 October 2026. Nick selected the interactive Lowe/Edmunds and Mickey Jupp conversation graphs as the app reference, explicitly leaving technology choice open.

## Current decision

The default is **Discovery**: readable node buttons, curved SVG connections, focused neighborhoods and an inspector for sources, scope and confidence. Fullscreen viewing is available from the workbench. An immediate deterministic layout avoids waiting for a simulation or another model.

**Network view** retains the existing Cytoscape renderer for underlying catalog inspection and node dragging. Both consume the existing saved-ID graph payload, graph history, filters and chat expansion. They do not create separate stores or persistence workflows. NVL remains retired; standalone demo pages are not part of the active build.

## Interaction and data contract

- Select a node to highlight its neighborhood; choose a connection to inspect its evidence. Connection buttons provide keyboard access equivalent to clicking a line.
- Full screen uses a dialog with Escape and focus return, retaining node/connection selection.
- Back/Forward redisplay already-seen payloads without further research.
- Double-click / Explore continues through chat. Seed browsing reads saved connections without an LLM call.
- EvidenceAssertions can display as qualified subject-to-factor connections without becoming new canonical relationships. Scores, exclusions, overrides, scope and source remain attached.
- IDs determine identity. Equal titles never merge entities; missing evidence is not invented for presentation.

Read [DISCOVERY_GRAPH.md](../product/DISCOVERY_GRAPH.md) for the researcher tool, exact API shape, limits, verification and current limitations.
