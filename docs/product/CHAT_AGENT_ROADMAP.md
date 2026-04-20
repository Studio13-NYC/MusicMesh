# Chat Agent Roadmap

This document captures what we have learned from wiring the first live product chat path, what is still missing, and what we are doing next.

It is meant to be an active working note for the clean-sheet MusicMesh chat agent.

## What We Learned

### 1. A live chat path is now real, but thin

The product now has:

- a local API server
- a GPT-5.4-backed chat path
- an append-only conversation tape
- a runtime event log

This is enough to inspect real prompts and real answers without going through Neo4j.

It is not enough yet to make the model behave like the actual MusicMesh operator.

### 2. The product LLM currently behaves like a generic strong model, not like MusicMesh

From the tape:

- it can answer music questions
- it can infer generic graph advice
- it does not reliably know MusicMesh persistence rules
- it does not know the current graph contract strongly enough
- it drifts between answers across repeated asks

The root cause is simple:

- the system instruction has been too thin
- the model has not yet been given enough explicit product rules
- the tool layer is not yet connected

### 3. Logging must separate transport failures from model failures

We hit several classes of failure:

- static frontend serving HTML where JSON was expected
- browser `Failed to fetch`
- missing tape writes because the request never reached the API
- valid API responses with poor product behavior

That means one log is not enough.

We now need:

- conversation tape for request/response history
- runtime event log for request lifecycle
- later, tool-level logs for canon checks, schema checks, and persistence actions

### 4. Old mock shell assumptions were still leaking into the product

The UI was still carrying prototype URL defaults like:

- `rem-canon-pass`
- `Logs`
- `rem-artifact-1`

That created confusion and made the live product feel less trustworthy.

Those stale router defaults have now been removed.

### 5. The next capability layer must be rules first

The current product agent does not first need “more personality.”

It first needs:

- product rules
- then tools
- then reusable workflow skills

That order matters.

Without the rules, the model falls back to generic helpfulness.
Without the tools, the model cannot actually inspect canon or persist safely.

## Current Reality

Right now the product agent can:

- answer in the product UI
- log user and assistant messages to tape
- log request lifecycle events to runtime logs

Right now it cannot yet:

- inspect canon live from the product chat path
- inspect existing schema/property vocabulary from the product chat path
- prepare or submit real review-shaped persistence work from the product chat path
- distinguish answer-now vs answer-then-persist vs persist-now in a structured way

## What We Are Doing Next

The immediate next step is:

- replace the thin server instruction with a real MusicMesh chat system prompt

That prompt should encode:

- answer-first behavior
- canon-first behavior
- propose-before-canon review boundary
- reuse of existing entities, relationships, and properties
- explicit handling of uncertainty
- the difference between direct answer, persistence preparation, and persistence intent

After that, the next step is:

- attach a small tool layer for canon and persistence workflows

## Active Todo List

This list should be updated as work progresses.

### In Progress

1. log which decision mode the chat agent chose
2. attach canon/schema inspection tool checks before persistence-shaped answers

### Next

3. show decision mode and tool findings in the worksurface
4. add proposal-shaping and review-submission tools
5. add product-side canon lookup tools that can resolve identities more precisely
6. add product-side schema/property inspection tools that can cover more than relationship snapshots

### After That

7. add explicit persistence-review artifacts to the product UI
8. remove remaining obsolete prototype code and sample data that no longer matches the clean-sheet direction
9. support safe write-mode progression from:
   - `answer_now`
   - `answer_then_persist`
   - `persist_now`
