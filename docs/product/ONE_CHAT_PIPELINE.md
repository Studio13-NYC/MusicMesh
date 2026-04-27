# One Chat Pipeline

MusicMesh has one user-facing graph creation path: chat.

## Runtime Flow

![Current vs target pipeline](../assets/pipeline-refactor/current-vs-target-pipeline.png)

1. `POST /api/chat` receives the user's turn.
2. `chatService.createAssistantReply` returns the direct answer with no graph tools.
3. `graphChatOrchestrator.planGraphFromAnswer` asks the LLM whether the answer should produce graph data.
4. `graphChatOrchestrator.groundGraphPlan` asks the LLM to resolve planned entities against Neo4j candidates.
5. `graphDomainWriter.persistChatGraph` MERGEs domain nodes and real relationship types directly.
6. The graph workbench loads from `graphAnchorId`, which is a real music-domain node.

## Visible Model

The user sees only music-domain graph objects:

- node labels such as `Artist`, `Band`, `Album`, `Track`, `Person`, `RecordLabel`, `Scene`, `Venue`, `Genre`, and `Place`
- relationship types such as `MEMBER_OF`, `IS_A_TRACK_ON`, `RELEASED_ALBUM`, `PRODUCED_BY`, `ASSOCIATED_WITH_SCENE`, `LOCATED_IN`, and `INFLUENCED`

## Hidden Maintenance Metadata

![Data model before and after](../assets/pipeline-refactor/data-model-before-after.png)

New chat-persisted facts can carry housekeeping properties:

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

These properties are for offline maintenance. They must not appear as node kinds, relationship types, filters, workflow tabs, or review/apply UI.

## Removed User-Facing Concepts

The operator app no longer exposes:

- proposal builder
- review/apply buttons
- `GraphProposal` seed nodes
- `ProposalItem`, `ProposedEntity`, or `ProposedRelationship` nodes
- `PROPOSED_RELATIONSHIP` edges

If graph staging is unsafe, the LLM asks the human for the smallest useful next decision instead of creating proposal scaffolding.

## LLM Prompt Map

![LLM prompt map](../assets/pipeline-refactor/llm-prompt-map.png)
