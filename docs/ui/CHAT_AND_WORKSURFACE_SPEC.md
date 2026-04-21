# Chat And Worksurface Spec

This document describes the chat and worksurface behavior that exists in the current shell.

## Current Product Goal

The shell should let the user:

- ask MusicMesh a question in chat
- receive an assistant answer
- inspect recent system-side activity next to the chat

## Chat Surface

The current chat surface supports:

- user messages
- assistant answers
- markdown rendering for assistant replies
- a multiline composer
- submit through the UI button

The current chat path is a single local API call.

It is not token-streamed.

## Worksurface

The current worksurface shows:

- the tape file path
- the runtime log file path
- recent tape entries
- recent runtime events

It is a readable inspection panel, not a full trace/database/artifact workspace yet.

## Layout

The current layout is:

- left: chat
- right: worksurface
- resizable horizontal split

## What Is Not Implemented

The current shell does not yet provide:

- trace-specific views
- database readback views
- artifact previews
- deep message-to-panel coordination
- multiple workspace tabs or modes

## Working Rules

- chat stays primary
- the worksurface supports the chat rather than competing with it
- keep the shell simple
- do not document UI modes that are not in the code
