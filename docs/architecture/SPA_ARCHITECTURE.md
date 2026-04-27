# SPA Architecture

This document describes the frontend architecture that actually exists in the repo today.

## Stack

The current SPA uses:

- `React`
- `Vite`
- `Radix UI`
- `react-resizable-panels`

## Current App Shape

The current UI is a single-page operator graph workbench served from `/` with:

- a primary chat surface
- a neighboring graph/workflow workbench panel
- a horizontal resizable split

There is no client router or separate standalone graph page in the active UI.

## What The UI Actually Does

The current shell supports:

- rendering user and assistant messages
- markdown rendering for assistant replies
- a textarea composer with send action
- a right-side workbench with graph and workflow tabs
- graph seed search and Cytoscape graph inspection
- chat-driven graph persistence and graph-anchor loading
- reading recent conversation tape entries from the local API
- reading recent runtime events from the local API

## What The UI Does Not Yet Do

- token streaming
- trace/database/artifact inspectors
- deep routed workspace state

## Code Layout

Frontend code lives in `ui/`.

Current important files:

- `ui/index.html`
- `ui/src/main.jsx`
- `ui/src/operator-graph-demo/OperatorGraphDemo.jsx`
- `ui/src/operator-graph-demo/styles.css`
- `ui/src/graph-demos/GraphDemoApp.jsx`
- `ui/src/graph-demos/CytoscapeCanvas.jsx`
- `ui/src/styles/app.css`

Bootstrap and API code live separately in `src/`.

## Architecture Rules

- keep the shell chat-first
- keep the worksurface subordinate to the current conversation
- prefer simple direct wiring over extra frontend layers
- do not document UI areas that do not exist yet
