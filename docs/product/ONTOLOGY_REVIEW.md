# Ontology Review

MusicMesh should not let meaningful music-domain concepts disappear into generic `Other` buckets or opaque properties.

The current rule:

- `Other` is a review queue, not a final ontology state.
- `Entity` is a temporary fallback, not the preferred label for graph-worthy music objects.
- Relationship properties are allowed for nuance, but they should be reviewed when they contain concepts that a human may want to search, browse, compare, or expand.

## How To Run The Review

From the repo root:

```powershell
npm run ontology:review
```

The report reads the active Neo4j database configured by `.env`, compares visible graph objects to the browse/filter catalog, and prints:

- nodes that still fall into `Other`
- relationship types that still fall into `Other`
- non-housekeeping node properties that may be hiding domain concepts
- non-housekeeping relationship properties that may need modeling review

This report is observability. It does not decide the ontology by regex and it does not mutate the graph.

## Modeling Rule

If a fact should be navigable, inspectable, reusable, or comparable, prefer a node and relationship.

Examples that should normally be first-class graph objects:

- instruments
- amplifiers
- effects
- consoles
- recording equipment
- studios and rooms
- recording sessions and studio events
- producers, engineers, contributors, and credits
- mixes, masters, stems, recordings, works, and compositions
- techniques and processes
- sources and evidence records when source inspection becomes part of the workflow

Examples that can stay as properties:

- confidence
- dates and years
- degree or strength
- short role nuance on a relationship
- source basis or evidence note
- performance name when it is just a name for the same event

The line is practical: if the user might ask "show me everything connected to this thing," it probably deserves a node.

## Current Live Review Snapshot

Last run:

- command: `npm run ontology:review`
- generated: `2026-05-06T22:14:14.754Z`
- result: `141` nodes and `245` relationships

The current graph has no relationship types falling into `Other` after the filter catalog expansion.

The current graph still has `9` generic `Entity` nodes that should be reviewed:

- `Fender Deluxe Reverb`
- `Fender Stratocaster`
- `Fender Telecaster`
- `Fender Twin Reverb`
- `Gibson Les Paul`
- `Marshall amplifiers`
- `Roland Corporation`
- `Roland GR guitar synthesizer systems`
- `Roland Jazz Chorus`

These are not bad facts. They are strong ontology-upgrade candidates. Likely directions include:

- guitar models as `Instrument` or `Guitar`
- amplifiers as `Amplifier` or `Equipment`
- Roland Corporation as `Manufacturer` or `Company`
- Roland GR guitar synthesizer systems as `Equipment`, `Synthesizer`, or `GuitarSynthesizerSystem` if that label is intentionally added

The current graph has no non-housekeeping node properties that appear to be hiding domain concepts.

The report found relationship properties that deserve periodic review:

- `basis`
- `date`
- `format`
- `foundingMember`
- `performanceName`
- `role`
- `year`

Those properties are not automatically wrong. They become ontology issues when their values are really hidden objects, roles, events, versions, instruments, techniques, or evidence sources that should be reusable in later exploration.

## Prompt And Writer Guardrail

The graph planner is now instructed not to bury graph-worthy domain objects in generic `Entity` nodes or relationship properties.

The domain writer now allows a broader label catalog for the layers this project cares about, including:

- `RecordingSession`, `StudioEvent`, `Recording`, `Work`, `Composition`, `Mix`, `Master`, `Stem`
- `Studio`, `StudioRoom`
- `Instrument`, `Equipment`, `Amplifier`, `Effect`, `EffectsPedal`, `Guitar`, `Synthesizer`, `Console`, `SignalChain`
- `Contributor`, `Credit`, `Contribution`, `Producer`, `Engineer`
- `Manufacturer`, `Company`
- `Technique`, `Process`, `Format`, `Medium`, `Technology`
- `Source`, `Evidence`, `Reference`

The LLM remains responsible for the semantic decision. Deterministic code only validates safe identifiers, writes Cypher, groups filters, and reports review candidates.

## Review Workflow

When the report finds `Other` or suspicious properties:

1. Inspect the examples in `npm run ontology:review`.
2. Decide whether the concept should be a first-class node, a relationship type, or a property.
3. Update the LLM prompt/label catalog only when the concept is durable enough to reuse.
4. If existing data should be corrected, do a deliberate graph maintenance pass instead of silently mutating records during normal chat.
5. Re-run the report and verify the review queue got smaller or more intentional.
