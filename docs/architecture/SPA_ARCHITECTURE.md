# SPA Architecture

This document defines the frontend architecture direction for the clean-sheet MusicMesh app.

## Decision

MusicMesh will use:

- `React`
- `Vite`
- `TanStack Router`
- `Radix UI`
- `react-resizable-panels`

## Why This Stack

This product is chat-centric.

The app shell needs to support:

- chat as the primary surface
- multiple coordinated panels
- adaptive worksurfaces that can change with context
- strong keyboard and accessibility behavior
- SPA-level responsiveness and polish

Plain HTML5 is still the design baseline in spirit:

- simple DOM structure
- no unnecessary abstraction
- no giant component framework

But for this product, the UI needs more polish and stronger state coordination than raw handcrafted HTML alone will give us efficiently.

This stack is the chosen compromise.

## Role Of Each Layer

### React

React is the component layer.

Use it for:

- the persistent app shell
- streaming chat rendering
- coordinated panel composition
- reusable interaction primitives

Do not use it as an excuse to over-componentize simple markup.

### Vite

Vite is the SPA build and development toolchain.

Use it for:

- fast local startup
- fast HMR
- predictable bundling

Do not build custom tooling around problems Vite already solves.

### TanStack Router

TanStack Router is the navigation and URL-state layer.

Use it for:

- routing between major app contexts
- preserving selected thread, workspace, and inspector state in the URL
- deep-linking into chat and work surfaces

Routing is not just page-to-page navigation here.
It is part of the workspace model.

### Radix UI

Radix UI is the primitive interaction layer.

Use it for:

- dialogs
- menus
- tabs
- tooltips
- popovers
- scroll areas

Radix should provide behavior and accessibility, not visual identity.

The visual system should still feel like MusicMesh, not a default component library.

### react-resizable-panels

This is the layout spine for the adaptive workspace.

Use it for:

- left navigation
- center chat
- right work surface
- optional nested splits inside the work surface

Resizable panels are part of the product, not just a convenience.

## App Shape

The app is a single-page application with a persistent shell.

The shell should feel like one continuous operator environment, not a set of disconnected screens.

Core structure:

- left rail for global navigation
- secondary navigation area for chats, projects, and scoped context
- center chat surface as the primary interaction area
- right adaptive worksurface for graph, file, proposal, evidence, and inspector views
- overlays only when a transient flow truly needs one

## Current Implementation Status

The current repo now has a real SPA shell in `ui/`.

What is implemented:

- Vite-based SPA entry
- TanStack Router root route
- a chat-first shell
- a neighboring worksurface panel
- resizable horizontal split
- seeded local data for threads, messages, logs, traces, database views, and artifacts

What is not yet implemented:

- live GPT-5.4 chat wiring
- live backend streaming
- live worksurface data fed from actual product execution

This means the shell is real, but still functioning as a controlled prototype until the product wiring is added.

## Architectural Rules

- chat is the first-class citizen
- the right-side worksurface is subordinate to chat context
- avoid hard page transitions inside the operator loop
- preserve workspace state in the URL when practical
- keep layout state explicit
- prefer a few strong primitives over many one-off widgets

## File And Code Direction

Current repo state already uses `src/` for clean-sheet bootstrap and startup checks.

Frontend SPA code should therefore live in a dedicated UI area rather than colliding with the Node bootstrap files.

Planned frontend area:

- `ui/`

Suggested structure:

- `ui/index.html`
- `ui/src/main.jsx`
- `ui/src/app/`
- `ui/src/routes/`
- `ui/src/components/`
- `ui/src/features/chat/`
- `ui/src/features/worksurface/`
- `ui/src/features/navigation/`
- `ui/src/styles/`

## State Boundaries

Use local component state for:

- open and closed UI details
- hover and focus behavior
- transient view-level state

Use routed state for:

- current chat
- current workspace target
- selected right-panel mode
- filters that should survive refresh or sharing

Do not create a broad global state layer early unless we have a real coordination problem that routing and local state cannot handle.

## Non-Goals

- do not rebuild the old app shell
- do not add a heavy design framework
- do not let the routing layer become business logic sprawl
- do not hide poor information architecture behind visual polish
