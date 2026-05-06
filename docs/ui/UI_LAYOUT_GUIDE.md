# UI Layout Guide

This document describes the layout that exists in the current SPA.

## Core Principle

The chat is the center of gravity.

The worksurface exists to support the current chat session.

## Current Shell

The current shell has two persistent zones:

1. primary chat pane
2. graph/workflow workbench pane

There is no implemented global rail or context navigation column in the current product.

## Primary Chat Pane

The chat pane contains:

- the chat header
- the message stream
- the composer

Rules:

- chat readability comes first
- the composer stays visible
- assistant output should be easy to scan

## Workbench Pane

The workbench contains:

- a Graph tab for Cytoscape graph inspection
- a Workflow tab for recent tape, runtime, and run-quality inspection

Rules:

- it stays subordinate to the chat
- it is useful for inspection and comparison, not as a separate creation workflow
- it should not visually dominate the chat

Graph interaction rules:

- `Back` and `Forward` redisplay graph views already seen without new research
- double-clicking a node or pressing `Expand` centers that node and loads its connected graph
- dragging a node changes layout only; it should not remove graph data or create a new history item

## Resizable Layout

The outer shell uses `react-resizable-panels`.

Current behavior:

- chat gets the larger default share
- workbench sits on the right
- the split is horizontally resizable

## Visual Direction

The current shell should feel:

- calm
- direct
- readable
- functional

Avoid documenting larger UI systems that are not built yet.
