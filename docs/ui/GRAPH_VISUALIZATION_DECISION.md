# Graph Visualization Decision

## Status

Cytoscape is the chosen graph visualization path for MusicMesh.

NVL is deprecated.

## Decision

MusicMesh should build the active graph product surface on Cytoscape.

This decision is based on the current side-by-side implementation work in the repo, not on abstract library comparison alone.

## Why Cytoscape

- better product-level control over styling and canvas behavior
- easier to shape into an intentional MusicMesh surface rather than a generic graph widget
- simpler interaction debugging for selection, dragging, expansion, and drawer behavior
- better fit for the current operator-plus-workbench direction

## What Deprecation Means

- the main shell should link only to the Cytoscape demo and the operator plus graph demo
- the integrated operator workbench should link only to Cytoscape as the standalone graph path
- the old NVL URL may remain reachable as a deprecated reference page, but it should not be treated as an active option
- future graph UX work should assume Cytoscape unless the user explicitly changes direction

## Guardrails

- do not keep both libraries as equal product directions in the UI
- do not add brittle label-based UI hacks to make the demos look aligned
- if a graph issue is real in the payload, fix it in the shared graph shaping path rather than papering over it in one canvas
