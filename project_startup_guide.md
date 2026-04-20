# Project Startup Guide

This document is the clean-sheet startup checklist for MusicMesh.

The goal is simple: prove the local project can boot, reach its required tools, and talk to its external systems before we build product code.

## Startup Goal

Before writing feature code, we should be able to say all of these are true:

- the repo has a valid Node project
- environment variables are present and readable from the root `.env`
- the required MCP connections are known and working
- the Docker-backed MCP gateway is available
- Playwright tooling is reachable
- the graph connection can be exercised
- OpenAI connectivity is working
- the app can run a minimal local smoke path

## Phase 1: Project Skeleton

- create a fresh `package.json`
- choose the Node version and document it
- add the first npm scripts:
  - `start`
  - `dev`
  - `check`
  - `test`
  - `smoke`
- create the initial source layout
- decide the minimum runtime entrypoint
- confirm `npm install` completes cleanly

Minimum expected result:

- `package.json` exists
- `package-lock.json` exists after install
- `npm run check` can execute without crashing

## Phase 2: Environment Setup

- confirm `.env` exists in the repo root
- document every required environment variable
- separate required variables from optional variables
- fail fast when required variables are missing
- add a startup validation script that checks env presence without leaking secrets

Minimum expected result:

- one command can verify env readiness
- missing env values produce a clear error

Current env classification:

- required:
  - `OPENAI_API_KEY`
  - `NEO4J_URI`
  - `NEO4J_USERNAME`
  - `NEO4J_PASSWORD`
  - `NEO4J_DATABASE`
- optional:
  - `BRAVE_API_KEY`
  - `DISCOGS_TOKEN`
  - `MUSICMESH_HTTP_USER_AGENT`
  - `AURA_INSTANCEID`
  - `AURA_INSTANCENAME`

## Phase 3: MCP Inventory

- list the MCP servers this project depends on
- identify which ones are required for day-one startup
- identify which ones are optional for later workflows
- confirm each required MCP server is visible to the runtime
- document the expected success check for each MCP server

Initial MCPs to verify:

- Neo4j access through `MCP_DOCKER`
- Playwright access
- any other MCP connection we decide is part of the core operator loop

Minimum expected result:

- we know which MCPs are required
- we have a concrete check for each one
- startup can fail clearly if a required MCP is unavailable

Current clean-sheet baseline:

- required MCP/tool connection:
  - `MCP_DOCKER` for Neo4j graph access
- required local tool check:
  - Playwright availability

Operational requirement:

- the Docker-backed MCP service must be running before startup verification
- if `MCP_DOCKER` is unavailable, graph checks should be treated as blocked infrastructure rather than as application failures

Current verification status:

- `MCP_DOCKER`: verified live with `RETURN 1 AS ok`
- Playwright: verified locally with `npx playwright --version`

Important note:

- in this session, Playwright has been verified as an available local toolchain
- a separate Playwright MCP server has not been established as a clean-sheet requirement yet

## Phase 4: Graph Connectivity

- verify the graph credentials from `.env`
- confirm the active graph target
- run a minimal read query
- run a minimal write-safe health check if appropriate
- document what a passing graph connection looks like

Minimum expected result:

- we can prove the graph is reachable
- we can prove credentials are valid
- the project knows whether it is in read-only check mode or write-capable mode

Current verification status:

- live graph read check passed through `MCP_DOCKER`
- minimal query used: `read_neo4j_cypher query="RETURN 1 AS ok"`

## Phase 5: Playwright Readiness

- confirm Playwright tooling is installed or reachable
- confirm the Playwright MCP path is available if that is part of the new workflow
- run a minimal browser smoke action
- document whether Playwright is part of the required startup path or only a developer tool

Minimum expected result:

- one simple browser automation check succeeds
- failures are easy to distinguish from app failures

Current verification status:

- `npx playwright --version` succeeded
- current verified version: `1.59.1`
- browser automation itself should be exercised through `npm run smoke:playwright`

## Phase 6: LLM and External Service Readiness

- decide which model path is part of the clean-sheet system
- verify the API key exists in `.env`
- run a minimal health check against the configured provider
- make sure failures are explicit and actionable

Minimum expected result:

- we know the model provider is reachable
- we know auth is configured

## Phase 7: Startup Verification Commands

We should end up with a small set of commands that answer the whole startup question:

- `npm install`
- `npm run startup`
- `npm run check`
- `npm run smoke`

Suggested checks inside those scripts:

- env validation
- MCP visibility check
- graph connection check
- Playwright availability check
- minimal app boot

Current `npm run check` target:

- validate the root `.env`
- verify the Docker MCP gateway is available and exposes required tools
- run a live Neo4j MCP read query through the Docker MCP gateway
- verify OpenAI connectivity against the configured model target
- verify Playwright CLI availability

Current `npm run startup` target:

- run `npm run check`
- run `npm run smoke`
- run `npm run smoke:playwright`

## Phase 8: First Documentation Set

- create a short `README.md`
- document the setup order
- document the required env values
- document the startup verification commands
- document the current system boundary so we do not drift
- document the current UI reality so new agents do not mistake the shell for a fully wired product

## Non-Goals

- do not rebuild old architecture just because it existed before
- do not add one-off setup scripts that hide missing understanding
- do not make startup depend on optional tooling unless the product truly needs it
- do not treat every historical integration as part of the clean-sheet baseline

## Immediate Work Items

1. initialize the npm project
2. create env validation
3. define the required MCP list
4. verify `MCP_DOCKER`
5. verify Playwright access
6. verify graph connectivity
7. add a dedicated Playwright smoke action
8. wire up `check` and `smoke` scripts around the real checks
9. write the minimal README

## Open Questions

- which MCP connections are required on day one versus optional
- whether Playwright is part of the product runtime or only a developer verification tool
- whether graph startup should be read-only by default
- what the minimum useful app boot looks like before feature work starts
- how quickly the UI should be moved from seeded sample data to fully live product wiring
