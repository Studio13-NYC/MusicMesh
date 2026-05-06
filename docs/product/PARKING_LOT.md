# MusicMesh Parking Lot

This file tracks useful follow-up work that should not interrupt the current path.

Keep entries concrete: what surfaced, why it matters, and what proof would close it.

## Open Items

### Add Nearby Graph Context To New Entity Grounding

Status: parked

What surfaced:

- When a chat turn adds a new entity, the current pipeline grounds planned entities against likely Neo4j candidate matches.
- That helps reuse existing nodes when the entity is already mentioned in the plan.
- It does not yet proactively include a compact neighborhood packet around the likely anchor/core nodes so the LLM can discover additional good existing nodes to connect to.

Why it matters:

- New entities should connect naturally to existing graph context when useful.
- Example: adding a CBGB-related person should give the grounding stage enough existing context to consider links to `CBGB`, `Talking Heads`, `Blondie`, `New York punk scene`, or other nearby nodes when those links are musically meaningful.
- This should stay LLM-reasoned, not regex or deterministic relationship guessing.

Likely direction:

- Before graph planning or grounding, retrieve a small existing-neighborhood context packet for the current anchor/core entities.
- Include node names, labels, relationship types, and concise degree/context summaries.
- Ask the graph planner/grounder to use that packet to propose only meaningful additional links.
- Keep human-in-the-loop behavior when a link is ambiguous or canon risk is high.

Definition of done:

- A headed browser test adds a new related entity and shows it connected to relevant existing graph nodes.
- Runtime logs show one chat pipeline, with neighborhood context used in graph planning or grounding.
- Neo4j verification shows no proposal scaffolding nodes and no `PROPOSED_RELATIONSHIP` edges.
- Existing canonized `canonicalStatus` values are not overwritten.
