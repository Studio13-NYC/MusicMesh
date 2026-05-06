# One Chat Pipeline Refactor Proposal

Historical note: this file memorializes the implementation plan that drove the one-chat-pipeline refactor. It is not the current-state source of truth.

For current behavior, use:

- [Current State And Handoff](product/CURRENT_STATE_AND_HANDOFF.md)
- [One Chat Pipeline](product/ONE_CHAT_PIPELINE.md)
- [Execution Lessons](product/EXECUTION_LESSONS.md)

## Summary

MusicMesh will have one user-facing path: chat. A chat turn answers the user, asks the LLM to derive graph-worthy domain structure from that same answer, grounds it against Neo4j canon, persists real music-domain nodes and relationships directly, and updates the graph workbench from those persisted entities.

`proposed` becomes hidden metadata only. It is never a node kind, relationship type, tab, filter, label, visible status, or review/apply concept in this app.

## Key Changes

| Request | Proposed Change |
|---|---|
| One path only | Remove chat tool-call lane, post-answer fallback lane, proposal tab lane, and GraphProposal seed lane. Route all graph writes through one chat pipeline. |
| No proposed entities/relationships in UX | Stop creating visible `GraphProposal`, `ProposalItem`, `ProposedEntity`, and `ProposedRelationship` records from chat. Existing old records are excluded from graph API/UI. |
| Real relationship names | Persist edges as `MEMBER_OF`, `IS_A_TRACK_ON`, `RELEASED_ALBUM`, etc. Add `canonicalStatus: "proposed"` and `isProposed: true` as hidden properties. Never create `PROPOSED_RELATIONSHIP` from chat. |
| No Chat graph proposal entity | Graph focus anchors become real domain nodes such as `R.E.M.`. Thread focus stores `graphAnchorId`, not `graphProposalId`. |
| Better Browse filters | Restore complete filter groups with counts: Artist/Band, Album/Release, Track/Song, Person/Member, Record Label, Scene, Venue, Genre/Style, Place, Other; relationship groups include Membership, Releases, Recording/Label, Production/Collaboration, Scene/Place, Influence/Related, Other. |
| LLM reasoning system-wide | LLM prompts decide graphable entities and relationships. Deterministic code is limited to JSON validation, ID generation, Cypher safety, grouping known schema labels, and hiding housekeeping labels. |
| Image deliverables | Use Image Gen for polished raster flowchart bases, then overlay exact readable labels locally. Save final PNGs under `docs/assets/pipeline-refactor/`. |

## Function-By-Function Plan

| Function / Area | Change |
|---|---|
| `handleChat` in local server and Azure function | Replace tool-call-plus-fallback logic with a single `runChatTurnPipeline()` call. Response includes answer text plus optional `graphAnchorId`, `graphNodeCount`, `graphRelationshipCount`, and `humanInputNeeded`. No `graphProposalId`. |
| `chatService.createAssistantReply` | Make this answer-only. It receives prompt/messages/system prompt and returns assistant prose. It does not expose or execute graph tools. |
| `graphChatOrchestrator.runChatTurnPipeline` | New single coordinator: answer already exists, then plan graph, ground against canon, persist direct domain graph, return graph anchor or human-loop message. |
| `graphChatOrchestrator.planGraphFromAnswer` | LLM-only graph planner. It decides `answer_only`, `persist_graph`, or `needs_human_input`; emits domain entities and relationships only. |
| `graphChatOrchestrator.groundGraphPlan` | LLM-assisted grounding using Neo4j candidate matches. Prefer existing canon when same entity; create new domain nodes only when no reasonable match exists. |
| `graphDomainWriter.persistChatGraph` | New writer replacing app use of `persistProposalWorkspace`. MERGE domain nodes and real relationship types directly. Set hidden properties: `canonicalStatus`, `isProposed`, `source: "chat"`, `threadId`, `turnId`, `confidenceScore`, `evidenceBasis`. |
| `graphProposalService` / proposal routes | Remove from active app path. Proposal/review/apply endpoints are removed or made inaccessible from the public UI/API bundle unless later rebuilt as offline maintenance tooling. |
| `graphDemoRepository` | Query only domain nodes/relationships. Exclude labels `GraphProposal`, `ProposalItem`, `ProposedEntity`, `ProposedRelationship` and relationships `HAS_ITEM`, `PROPOSED_SOURCE`, `PROPOSED_TARGET`, `PROPOSED_RELATIONSHIP`, `PROPOSES_CANON_MATCH`. Strip housekeeping props from details. |
| `OperatorGraphDemo.jsx` | Remove `Proposals` mode and all proposal builder/review/apply UI. Workbench modes are `Graph` and `Workflow`. Chat is the only creation surface. |
| `GraphDemoApp.jsx` / graph state | Load by `graphAnchorId` or Browse selection. Restore full static filter catalog with counts and disabled zero-count groups. Never show housekeeping filters. |
| API sync/build | Update the shared API sync so local and deployed builds use the same pipeline files. No separate deployed behavior. |

## LLM Prompt Contract

### Prompt 1: Chat Answer

Caller: `chatService.createAssistantReply`

System instruction:

```text
You are MusicMesh, an LLM-native operator for music knowledge work.
Answer the user directly and naturally.
Do not mention proposal IDs, review/apply workflows, GraphProposal records, ProposedEntity records, ProposedRelationship records, or graph housekeeping.
When the user asks to show, map, connect, inspect, or graph music knowledge, answer the question; the system will derive and persist graph structure after your response.
```

Output: assistant text only.

### Prompt 2: Graph Plan From Answer

Caller: `graphChatOrchestrator.planGraphFromAnswer`

System instruction:

```text
Read the user request, recent messages, and assistant answer.
Decide whether this turn should produce graph data.
Use music-domain reasoning to identify real entities and real relationships.
Do not create task phrases, section headings, proposal objects, review objects, or relationship-as-entity nodes.
Relationship names must be real relationship types such as MEMBER_OF, IS_A_TRACK_ON, RELEASED_ALBUM, PRODUCED_BY, ASSOCIATED_WITH_SCENE, LOCATED_IN, or INFLUENCED.
Never emit PROPOSED_RELATIONSHIP as a relationship type.
Return JSON only: { mode, anchor, entities, relationships, humanInputNeeded, reason }.
```

Modes: `answer_only`, `persist_graph`, `needs_human_input`.

### Prompt 3: Canon Grounding

Caller: `graphChatOrchestrator.groundGraphPlan`

System instruction:

```text
Resolve planned entities against provided Neo4j candidate matches.
Prefer existing canon when the intended entity is the same.
Create a new domain entity only when no candidate is a reasonable match.
Return JSON only with grounded domain nodes and relationships.
Do not emit GraphProposal, ProposalItem, ProposedEntity, ProposedRelationship, or PROPOSED_RELATIONSHIP.
The proposed/candidate status is metadata only and must not change labels or relationship types.
```

Output: grounded graph patch.

### Prompt 4: Human Loop

Caller: `graphChatOrchestrator.createHumanLoopMessage`

System instruction:

```text
If the graph cannot be persisted safely, ask the human for the smallest useful next decision.
Offer concrete options: narrow scope, provide entities, inspect canon first, or answer without graph persistence.
Do not invent graph structure to avoid asking.
Do not mention internal proposal machinery.
```

Output: assistant-visible clarification appended only when graph persistence is blocked.

## Data Model Contract

Persisted node labels are real domain labels: `Artist`, `Band`, `Album`, `Track`, `Person`, `RecordLabel`, `Scene`, `Venue`, `Genre`, `Place`, or `Entity` only when the domain type is genuinely unknown.

Persisted relationship types are real domain types: `MEMBER_OF`, `IS_A_TRACK_ON`, `RELEASED_ALBUM`, `SIGNED_TO`, `RECORDED_FOR`, `PRODUCED_BY`, `COLLABORATED_WITH`, `ASSOCIATED_WITH_SCENE`, `LOCATED_IN`, `FORMED_IN`, `INFLUENCED`, or `RELATED_TO`.

Housekeeping properties may exist on nodes and edges, but are hidden from the app:

```json
{
  "canonicalStatus": "proposed",
  "isProposed": true,
  "source": "chat",
  "threadId": "...",
  "turnId": "...",
  "confidenceScore": 0.82,
  "evidenceBasis": "assistant_answer"
}
```

## Image Gen Deliverables

Create these final tracked assets:

| File | Content |
|---|---|
| `docs/assets/pipeline-refactor/current-vs-target-pipeline.png` | Split-screen flowchart: current multiple lanes in red/orange vs target one chat pipeline in green/blue. |
| `docs/assets/pipeline-refactor/llm-prompt-map.png` | Swimlane chart for the four LLM prompts, each with inputs and outputs. |
| `docs/assets/pipeline-refactor/data-model-before-after.png` | Before/after model diagram showing GraphProposal/ProposalItem clutter removed, with hidden `canonicalStatus: proposed` metadata on normal domain nodes/edges. |

Use Image Gen for polished raster bases. Because exact diagram text must be readable, overlay final labels/callouts locally after generation and verify the PNGs before committing.

## Test Plan

Run `npm run build`, `npm run check:api`, and `npm run check`.

Use headed Playwright against `http://127.0.0.1:3000/`:

| Scenario | Expected Result |
|---|---|
| Ask `show me what is connected to REM` | Assistant answers in chat; graph centers on `R.E.M.` or the best matched domain node; no proposal node appears. |
| Inspect graph relationships | Edges show real types such as `MEMBER_OF`, `RELEASED_ALBUM`, `ASSOCIATED_WITH_SCENE`; never `PROPOSED_RELATIONSHIP`. |
| Ask `how do I review and apply?` | No proposal workflow instructions. The app explains graph work happens through chat unless the user explicitly asks about offline maintenance. |
| Open Browse | Complete filter catalog appears with counts; housekeeping filters are absent. |
| Open Workflow | Logs show one chat pipeline event sequence, not tool-call plus fallback plus proposal path. |

Run Neo4j verification before and after the browser test:

```cypher
MATCH (n)
WHERE any(label IN labels(n) WHERE label IN ["GraphProposal", "ProposalItem", "ProposedEntity", "ProposedRelationship"])
RETURN count(n) AS housekeepingNodes;

MATCH ()-[r:PROPOSED_RELATIONSHIP]->()
RETURN count(r) AS proposedRelationshipEdges;

MATCH ()-[r]->()
WHERE r.canonicalStatus = "proposed"
RETURN type(r) AS relationshipType, count(*) AS count
ORDER BY count DESC;
```

Success means the first two counts do not increase from chat, and proposed persisted edges use real relationship types.

## Assumptions

- Existing old proposal data may remain in Neo4j, but the graph API/UI must hide it and new chat turns must not create more.
- `canonicalStatus: "proposed"` plus `isProposed: true` is the hidden maintenance marker.
- Offline maintenance is out of scope for this app surface.
- Any partial interrupted worktree edits should be folded into this refactor or replaced; they are not considered complete by themselves.
