# UI Layout Guide

This document describes the layout that exists in the current SPA.

## Core Principle

The chat is the center of gravity.

The worksurface exists to support the current chat session.

## Current Shell

The current shell has two persistent zones:

1. primary chat pane
2. worksurface pane

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

## Worksurface Pane

The worksurface contains:

- tape file path
- runtime log path
- recent tape entries
- recent runtime events

Rules:

- it stays subordinate to the chat
- it is useful for inspection, not as a separate application
- it should not visually dominate the chat

## Resizable Layout

The outer shell uses `react-resizable-panels`.

Current behavior:

- chat gets the larger default share
- worksurface sits on the right
- the split is horizontally resizable

## Visual Direction

The current shell should feel:

- calm
- direct
- readable
- functional

Avoid documenting larger UI systems that are not built yet.
