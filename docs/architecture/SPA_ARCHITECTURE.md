# SPA Architecture

This document describes the frontend architecture that actually exists in the repo today.

## Stack

The current SPA uses:

- `React`
- `Vite`
- `TanStack Router`
- `Radix UI`
- `react-resizable-panels`

## Current App Shape

The current UI is a single-page shell with:

- a primary chat surface
- a neighboring worksurface panel
- a horizontal resizable split

There is no left rail, secondary navigation column, or multi-view workspace model implemented today.

## What The UI Actually Does

The current shell supports:

- rendering user and assistant messages
- markdown rendering for assistant replies
- a textarea composer with send action
- a right-side worksurface
- reading recent conversation tape entries from the local API
- reading recent runtime events from the local API

## What The UI Does Not Yet Do

- token streaming
- multiple real product views
- graph readback views
- trace/database/artifact inspectors
- deep routed workspace state

## Code Layout

Frontend code lives in `ui/`.

Current important files:

- `ui/index.html`
- `ui/src/main.jsx`
- `ui/src/router.jsx`
- `ui/src/app/AppShell.jsx`
- `ui/src/styles/app.css`

Bootstrap and API code live separately in `src/`.

## Architecture Rules

- keep the shell chat-first
- keep the worksurface subordinate to the current conversation
- prefer simple direct wiring over extra frontend layers
- do not document UI areas that do not exist yet
