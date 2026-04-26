# Graph Ingestion Proposals

This document describes the first implemented graph-creation lane in the clean-sheet MusicMesh repo.

## What Exists Now

MusicMesh now has a proposal-first ingestion path for entity lists:

1. The user submits a list of entities.
2. The backend checks existing Neo4j canon and schema.
3. The backend runs bounded multi-hop traversal around exact canon matches.
4. GPT-5.5 drafts candidate nodes and relationships as structured JSON.
5. MusicMesh stores a reviewable proposal under `output/graph-proposals/`.
6. MusicMesh persists proposed entities and proposed relationships into Neo4j as non-canonical graph workspace items.
7. Review endpoints can approve or reject individual nodes and relationships.
8. The apply endpoint writes only approved items to canonical Neo4j shape with explicit write sessions.

The canonical safety rule remains unchanged: `propose first, review before canon`.

## Proposed Graph Workspace Persistence

Proposal creation writes graph-readable, non-canonical records to Neo4j so the visualization can inspect them before canonization:

- `(:GraphProposal {id})`
- `(:ProposalItem:ProposedEntity {canonicalStatus: "proposed"})`
- `(:ProposalItem:ProposedRelationship {canonicalStatus: "proposed"})`
- `(:GraphProposal)-[:HAS_ITEM]->(:ProposalItem)`
- `(:ProposedEntity)-[:PROPOSED_RELATIONSHIP {proposedType}]->(:ProposedEntity)`
- `(:ProposedEntity)-[:PROPOSES_CANON_MATCH]->(canon)` when a candidate matches an existing canonical node

These records are intentionally separate from canonical artist, album, label, venue, and studio nodes. They are persisted for visualization and review, not treated as approved canon.

## API Surface

Local and Azure API routes:

- `GET /api/graph/proposals`
- `POST /api/graph/proposals/from-entities`
- `GET /api/graph/proposals/{id}`
- `POST /api/graph/proposals/{id}/review`
- `POST /api/graph/proposals/{id}/apply`

Example request:

```json
{
  "entities": ["R.E.M.", "Talking Heads", "Brian Eno"],
  "context": {
    "title": "Post-punk producer relationship pass",
    "note": "Create graph-worthy music relationships and find missing multi-hop connections."
  },
  "evidenceMode": "model_knowledge",
  "traversalDepth": 2
}
```

## Multi-Hop Traversal

The ingestion path runs bounded traversal after canon lookup. It currently supports depths from 1 to 3 and returns:

- matched seed ids
- nearby nodes and relationships
- bridge nodes
- relationship type counts

This traversal data is included in the proposal so GPT-5.5 can identify missing relationships that direct entity search would miss.

## Review Payload

Review requests accept node and relationship decisions by `tempId`:

```json
{
  "nodes": [
    { "tempId": "node-1", "status": "approved", "note": "Existing canon match is correct." }
  ],
  "relationships": [
    { "tempId": "rel-1", "status": "approved", "note": "Credit is reviewable." }
  ]
}
```

Only items with `reviewStatus: "approved"` are applied.

## Current Limits

- Proposal storage is file-backed under `output/graph-proposals/`.
- Web evidence retrieval is only used when `evidenceMode` is `web_search` and `BRAVE_API_KEY` is configured.
- The first UI entry point is the `Proposals` tab in the operator graph demo.
- The apply path is intentionally conservative and does not auto-approve generated facts.
