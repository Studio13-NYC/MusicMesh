# MusicMesh Parking Lot

This file tracks useful follow-up work that should not interrupt the current path.

Keep entries concrete: what surfaced, why it matters, and what proof would close it.

## Open Items

### Review Existing Generic Gear Nodes

Status: parked

What surfaced:

- `npm run ontology:review` currently finds `9` visible nodes still labeled only as `Entity`.
- They are all musically useful gear/manufacturer concepts: Fender and Gibson guitars, Fender and Marshall amplifiers, Roland equipment, and Roland Corporation.

Why it matters:

- These are exactly the below-the-surface connections MusicMesh should make navigable.
- Leaving them as `Entity` makes them look like `Other` instead of first-class instruments, equipment, amplifiers, or manufacturers.

Likely direction:

- Do a deliberate maintenance pass that reviews each generic gear node.
- Promote durable labels such as `Instrument`, `Guitar`, `Amplifier`, `Equipment`, `Synthesizer`, `Manufacturer`, or `Company` where appropriate.
- Keep this as maintenance, not as silent mutation during normal chat.

Definition of done:

- `npm run ontology:review` reports no unreviewed generic gear nodes.
- Browse filters show these concepts under Instrument / Gear or Maker / Manufacturer instead of Other.
- A headed browser test can load a gear-centered graph and inspect the promoted labels.

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
