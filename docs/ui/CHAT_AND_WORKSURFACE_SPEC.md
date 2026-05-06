# Chat And Worksurface Spec

This document describes the chat and worksurface behavior that exists in the current shell.

## Current Product Goal

The shell should let the user:

- ask MusicMesh a question in chat
- receive an assistant answer
- inspect graph context and workflow activity next to the chat

## Chat Surface

The current chat surface supports:

- user messages
- assistant answers
- markdown rendering for assistant replies
- a multiline composer
- submit through the UI button

The current chat path is an answer-first API call. Graph preview, graph persistence, and run-quality review can continue after the answer returns.

It is not token-streamed.

## Worksurface

The current workbench has two modes.

Graph mode shows:

- a Cytoscape graph canvas
- graph seed search
- browse filters and legend
- fit/reset controls
- node/relationship inspection
- `Back` / `Forward` graph view history
- double-click or `Expand` to center a selected node and load its connected subgraph

Workflow mode shows:

- the tape file path
- the runtime log file path
- recent tape entries
- recent runtime events
- the latest run-quality assessment when available

The workbench is a live sidecar for the chat. It is not a separate graph creation workspace.

## Layout

The current layout is:

- left: chat
- right: Graph / Workflow workbench
- resizable horizontal split

## What Is Not Implemented

The current shell does not yet provide:

- trace-specific views
- database readback views
- artifact previews
- deep message-to-panel coordination
- persistent graph history across browser refreshes

## Working Rules

- chat stays primary
- the workbench supports the chat rather than competing with it
- keep the shell simple
- do not document UI modes that are not in the code
