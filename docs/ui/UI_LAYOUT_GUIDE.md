# UI Layout Guide

This document defines the UI pieces of the MusicMesh SPA and how they should be used.

## Core Principle

The center of gravity is the chat.

Everything else exists to support the chat:

- navigation helps the user find the right conversation or context
- the worksurface shows the object the chat is currently acting on
- overlays handle temporary flows without stealing the app

## Primary Shell

The shell should have four persistent zones:

1. global rail
2. context navigation
3. primary chat pane
4. adaptive worksurface

## 1. Global Rail

Purpose:

- top-level navigation
- workspace switching
- search entry
- settings

Use this for stable app destinations only.

Do not overload it with thread-specific actions.

## 2. Context Navigation

Purpose:

- chat thread list
- project context
- agent context
- saved views

This is the place for “what conversation or context am I in?”

This column should be fast to scan and keyboard-friendly.

Use:

- scrollable lists
- density over decoration
- inline status where needed
- dropdown or context actions for row-level controls

## 3. Primary Chat Pane

Purpose:

- the main conversation
- user input
- streamed assistant output
- attached artifacts
- action affordances that move from answer into graph work

Rules:

- chat must stay readable at all times
- messages should not compete visually with surrounding chrome
- the composer should always feel available
- actions should appear near the relevant message, not scattered around the shell

This pane is first-class.
It should get the strongest visual hierarchy.

## 4. Adaptive Worksurface

Purpose:

- files
- graph readback
- evidence
- proposal details
- inspectors
- structured views that support the current chat

Rules:

- the worksurface responds to current chat context
- it should be resizable and optionally collapsible
- it should not replace the chat as the primary mode of interaction
- it should handle multiple view types without changing the whole app structure

Recommended internal pattern:

- tabs for view switching within the worksurface
- nested panels only when there is a clear need
- detail and metadata on the right side of the worksurface, not everywhere

## Resizable Panel Rules

Use `react-resizable-panels` for the outer shell.

Recommended default layout:

- narrow global rail
- medium context navigation
- large chat pane
- medium right worksurface

Behavior rules:

- users should be able to collapse side surfaces
- chat should get the largest default share
- panel sizes should persist during a session
- the app should remain usable when the worksurface is hidden

## Radix Usage Rules

Use Radix primitives intentionally:

- `Dialog`
  - confirmation flows
  - focused creation or review moments
- `DropdownMenu`
  - row actions
  - secondary controls
- `ContextMenu`
  - object-level power actions
- `Tabs`
  - switching views inside the worksurface
- `Popover`
  - compact detail reveals
- `Tooltip`
  - explain terse controls
- `ScrollArea`
  - long lists and panes
- `Separator`
  - subtle structure, not decoration

Do not use dialogs for normal navigation.
Do not use popovers to hide essential information.

## Routing Rules

Use TanStack Router to preserve meaningful workspace state.

Route or search-param candidates:

- active thread
- active project
- selected worksurface mode
- selected entity or file
- inspector sub-state when shareable

Not every UI twitch belongs in the URL.
But anything that should survive refresh, sharing, or reopen likely does.

## Responsive Behavior

Desktop-first is the primary target.

On narrower widths:

- collapse the worksurface first
- then compress context navigation
- preserve chat readability before preserving side chrome

Mobile support should remain possible, but the initial design target is a serious desktop operator workspace.

## Visual Direction

The UI should feel:

- calm
- precise
- dense where useful
- polished but not ornamental

Avoid:

- generic dashboard cards everywhere
- oversized padding that wastes workspace
- heavy modal workflows
- component-library-looking defaults

## Interaction Model

The user should feel that:

- the chat is the control center
- the worksurface is the current object of attention
- side navigation helps them move, not think
- the whole shell is one coordinated instrument
