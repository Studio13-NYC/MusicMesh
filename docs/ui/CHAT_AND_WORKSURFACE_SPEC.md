# Chat And Worksurface Spec

This document defines the first concrete UI behavior for the MusicMesh SPA.

It is intentionally inspired by Codex:

- chat is the primary surface
- adjacent panels show the machine-readable or operator-relevant context
- the app feels like one coordinated workspace, not a chatbot plus a separate inspector

## Product Goal

The user should be able to:

- talk to MusicMesh through a first-class chat interface
- receive direct answers from a GPT-5.4-backed assistant
- watch supporting data appear in a neighboring panel
- move naturally from conversation into evidence, logs, traces, graph returns, and structured work

The core interaction is:

- ask in chat
- receive streamed response
- inspect machine and graph context in the right panel
- continue the same interaction without mode switching

## Core UI Decision

The initial shell should prioritize two surfaces:

1. a first-class chat component
2. a first-class data panel next to it

Other navigation can exist, but these two surfaces define the operator experience.

## 1. First-Class Chat Component

### Purpose

The chat component is the main point of contact for the product.

It is where the user:

- asks questions
- requests graph work
- reviews the assistant's answers
- continues multi-step operator flows

### Model Target

The default assistant target should be:

- `GPT-5.4`

This should be treated as the primary conversational model for the clean-sheet UI unless the product explicitly changes direction later.

### Required Behaviors

- support streamed assistant output
- support multi-turn thread continuity
- support long-form answers when needed
- support short operational replies when appropriate
- render attached artifacts inline when useful
- allow user actions to stay close to the relevant message

### Chat Message Types

The chat surface should support at least these message types:

- user message
- assistant answer
- assistant status update
- tool activity summary
- structured artifact attachment

The UI should not expose raw implementation noise by default, but it should be able to reveal it when useful.

### Composer Requirements

The composer should:

- stay anchored and always available
- support multiline input
- support submit by keyboard
- support disabled and busy states clearly
- allow future attachment support without redesign

### Chat Design Rules

- chat readability is the top visual priority
- assistant output should feel calm and high-signal
- actions should attach to relevant messages, not to unrelated global chrome
- the chat should feel capable, not decorative

## 2. First-Class Data Panel

### Purpose

The panel next to chat exists to show the system's supporting data.

This is where the user can inspect:

- logs
- traces
- database returns
- graph readback
- evidence
- structured tool outputs

The panel should feel like a coordinated sidecar to the chat, not a separate application.

### Relationship To Chat

The panel is subordinate to the chat context.

That means:

- the currently selected message or task should drive what the panel shows
- panel content should update when the active conversation context changes
- the panel should help the user understand or act on the current conversation

### Initial Panel Modes

The first version should support these panel modes:

- `Logs`
- `Trace`
- `Database`
- `Artifacts`

Recommended meanings:

- `Logs`
  - app or workflow event summaries
- `Trace`
  - request steps, tool activity, and timing
- `Database`
  - query results, graph readback, and structured returns
- `Artifacts`
  - saved outputs, generated files, proposal payloads, or structured extracts

### Panel Behavior Rules

- the panel should be resizable
- the panel should be collapsible
- the panel should preserve its selected tab during a session
- the panel should be empty-state friendly
- the panel should never visually overpower the chat

### Panel Content Rules

- logs should be readable, not raw dumps by default
- traces should show sequence and status clearly
- database returns should prefer table, JSON, or graph-friendly presentation over plain blobs
- artifacts should be previewable without leaving the shell

## Coordination Between Chat And Panel

The two surfaces should work together in these ways:

- selecting a message can focus the relevant data panel content
- tool activity mentioned in chat can open the matching trace entry
- graph answers in chat can open matching database results
- artifacts referenced in chat can open the relevant artifact preview

The coordination should feel helpful and quiet.

It should not jerk the UI around unexpectedly.

## Initial Layout

Recommended default proportions:

- chat pane as the dominant center surface
- data panel as a medium-width right panel

Initial priority:

- preserve chat width first
- allow the data panel to collapse on smaller screens
- keep the right panel persistent on desktop by default

## Routing And State

The initial routed or shareable UI state should support:

- active thread
- active right-panel mode
- selected message or artifact context when meaningful

Local state can handle:

- scroll state
- temporary expansion state
- tab-local view details

## Non-Goals

- do not build a full dashboard around the chat
- do not make the data panel a dumping ground for every internal detail
- do not treat logs and traces as separate apps
- do not force users out of chat to inspect supporting data

## First Implementation Slice

The first UI implementation should deliver:

1. a persistent shell with chat and right data panel
2. a working chat composer
3. streamed assistant message rendering
4. GPT-5.4 as the default chat model target
5. tabs in the right panel for `Logs`, `Trace`, `Database`, and `Artifacts`
6. placeholder but realistic sample content in the panel
7. resizable layout using `react-resizable-panels`

## Success Criteria

The UI is on the right track when:

- the user immediately understands that chat is the main control surface
- the right panel feels useful within seconds
- the shell feels like one instrument instead of two stitched surfaces
- the layout supports deep work without clutter
- the app already feels more like Codex than like a generic admin dashboard

## Current Implementation Reality

The current repo now partially implements this spec.

Implemented now:

- a basic chat-first SPA shell
- a neighboring worksurface panel
- resizable layout
- seeded sample threads and sample panel data

Not yet implemented:

- real GPT-5.4-backed chat
- real log, trace, database, and artifact wiring
- live product testing through actual model responses

The next agent should treat the current UI as the place where the product starts getting tested for real, rather than as a disposable mock.
