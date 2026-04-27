const { validateEnv } = require("./env");
const { inspectSchema, lookupCanonEntities } = require("./graphCanonRepository");
const { ALLOWED_NODE_LABELS, persistChatGraph, sanitizeIdentifier, stableString } = require("./graphDomainWriter");
const {
  REASONING_STAGES,
  resolveOpenAiModel,
  resolveReasoningEffort,
  resolveVerbosity
} = require("./reasoningConfig");
const { recordLlmCallCompleted, recordLlmCallFailed } = require("./llmTelemetry");

const DEFAULT_MODEL = resolveOpenAiModel();
const DEFAULT_REASONING_EFFORT = resolveReasoningEffort().effort;
const RELATIONSHIP_EXAMPLES = [
  "MEMBER_OF",
  "IS_A_TRACK_ON",
  "RELEASED_ALBUM",
  "SIGNED_TO",
  "RECORDED_FOR",
  "PRODUCED_BY",
  "COLLABORATED_WITH",
  "ASSOCIATED_WITH_SCENE",
  "LOCATED_IN",
  "FORMED_IN",
  "INFLUENCED",
  "RELATED_TO"
];

function parseJsonObject(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function getOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (!Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

async function callStructuredModel({
  instructions,
  input,
  purpose,
  reasoningStage = REASONING_STAGES.DEFAULT,
  telemetryContext = {}
}) {
  const envResult = validateEnv();
  const model = resolveOpenAiModel();
  const reasoningConfig = resolveReasoningEffort(reasoningStage);
  const verbosityConfig = resolveVerbosity();
  const startedAt = Date.now();

  if (!envResult.isValid) {
    const errorMessage = `Cannot run ${purpose}: missing MusicMesh environment variables.`;
    await recordLlmCallFailed({
      telemetryContext,
      stage: reasoningStage,
      model,
      reasoningConfig,
      verbosityConfig,
      startedAt,
      errorCode: "missing_environment",
      errorMessage
    });
    throw new Error(errorMessage);
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions,
      input: [
        {
          role: "user",
          content: input
        }
      ],
      reasoning: {
        effort: reasoningConfig.effort
      },
      text: {
        verbosity: verbosityConfig.verbosity
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    const errorMessage =
      `OpenAI ${purpose} request failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`;
    await recordLlmCallFailed({
      telemetryContext,
      stage: reasoningStage,
      model,
      reasoningConfig,
      verbosityConfig,
      startedAt,
      status: String(response.status),
      errorCode: "openai_http_error",
      errorMessage: errorMessage.slice(0, 1000)
    });
    throw new Error(errorMessage);
  }

  const payload = await response.json();
  const parsed = parseJsonObject(getOutputText(payload));

  if (!parsed || typeof parsed !== "object") {
    const errorMessage = `OpenAI ${purpose} returned invalid JSON.`;
    await recordLlmCallFailed({
      telemetryContext,
      stage: reasoningStage,
      model,
      reasoningConfig,
      verbosityConfig,
      startedAt,
      responseId: payload.id || null,
      status: payload.status || "completed",
      errorCode: "invalid_json",
      errorMessage,
      payload
    });
    throw new Error(errorMessage);
  }

  await recordLlmCallCompleted({
    telemetryContext,
    stage: reasoningStage,
    model,
    reasoningConfig,
    verbosityConfig,
    startedAt,
    payload
  });

  return parsed;
}

function buildRecentMessageText(messages) {
  return (Array.isArray(messages) ? messages : [])
    .slice(-8)
    .map((message) => `${message.role || "unknown"}: ${message.content || ""}`.trim())
    .filter(Boolean)
    .join("\n");
}

function normalizePlanEntity(entity, index) {
  const name = stableString(entity?.name || entity?.label);

  if (!name) {
    return null;
  }

  const tempId = stableString(entity.id || entity.tempId) || `node-${index + 1}`;
  const labels = [
    ...(Array.isArray(entity.labels) ? entity.labels : []),
    entity.type
  ]
    .map((label) => sanitizeIdentifier(label, "Entity"))
    .filter((label) => ALLOWED_NODE_LABELS.has(label));

  return {
    tempId,
    name,
    type: labels[0] || stableString(entity.type) || "Entity",
    labels: labels.length > 0 ? [...new Set(labels)] : ["Entity"],
    aliases: Array.isArray(entity.aliases) ? entity.aliases.map(stableString).filter(Boolean) : [],
    properties: entity.properties && typeof entity.properties === "object" ? entity.properties : {},
    confidenceScore: Number.isFinite(Number(entity.confidenceScore))
      ? Number(entity.confidenceScore)
      : null,
    evidenceBasis: stableString(entity.evidenceBasis) || "assistant_answer"
  };
}

function normalizePlanRelationship(relationship, entityByName, index) {
  const sourceRef = stableString(
    relationship?.sourceRef ||
      relationship?.sourceId ||
      relationship?.source ||
      entityByName.get(stableString(relationship?.sourceName).toLowerCase())?.tempId
  );
  const targetRef = stableString(
    relationship?.targetRef ||
      relationship?.targetId ||
      relationship?.target ||
      entityByName.get(stableString(relationship?.targetName).toLowerCase())?.tempId
  );
  const type = sanitizeIdentifier(relationship?.type, "RELATED_TO").toUpperCase();

  if (!sourceRef || !targetRef || sourceRef === targetRef) {
    return null;
  }

  return {
    tempId: stableString(relationship.tempId || relationship.id) || `rel-${index + 1}`,
    sourceRef,
    targetRef,
    type: type === "PROPOSED_RELATIONSHIP" ? "RELATED_TO" : type,
    properties: relationship.properties && typeof relationship.properties === "object"
      ? relationship.properties
      : {},
    confidenceScore: Number.isFinite(Number(relationship.confidenceScore))
      ? Number(relationship.confidenceScore)
      : null,
    evidenceBasis: stableString(relationship.evidenceBasis) || "assistant_answer"
  };
}

function normalizeGraphPlan(rawPlan) {
  const mode = ["answer_only", "persist_graph", "needs_human_input"].includes(rawPlan.mode)
    ? rawPlan.mode
    : "answer_only";
  const entities = (Array.isArray(rawPlan.entities) ? rawPlan.entities : [])
    .map(normalizePlanEntity)
    .filter(Boolean);
  const entityByName = new Map(
    entities.map((entity) => [entity.name.toLowerCase(), entity])
  );
  const relationships = (Array.isArray(rawPlan.relationships) ? rawPlan.relationships : [])
    .map((relationship, index) => normalizePlanRelationship(relationship, entityByName, index))
    .filter(Boolean);
  const anchorName = stableString(rawPlan.anchor?.name || rawPlan.anchor);
  const anchorByName = anchorName ? entityByName.get(anchorName.toLowerCase()) : null;

  return {
    mode,
    anchor: anchorByName
      ? { tempId: anchorByName.tempId, name: anchorByName.name }
      : entities[0]
        ? { tempId: entities[0].tempId, name: entities[0].name }
        : null,
    entities,
    relationships,
    humanInputNeeded: Boolean(rawPlan.humanInputNeeded),
    reason: stableString(rawPlan.reason)
  };
}

async function planGraphFromAnswer({ prompt, messages, assistantText, telemetryContext = {} }) {
  const instructions = [
    "Read the user request, recent messages, and assistant answer.",
    "Decide whether this turn should produce graph data.",
    "Use music-domain reasoning to identify real entities and real relationships.",
    "Do not create task phrases, section headings, proposal objects, review objects, or relationship-as-entity nodes.",
    `Use node labels only from this catalog when possible: ${[...ALLOWED_NODE_LABELS].join(", ")}.`,
    `Relationship names must be real, domain-meaningful relationship types such as ${RELATIONSHIP_EXAMPLES.join(", ")}.`,
    "Those examples are not an allow-list. You may emit a new uppercase snake_case relationship type when the music-domain relationship is real and none of the examples fit.",
    "Never emit GraphProposal, ProposalItem, ProposedEntity, ProposedRelationship, or PROPOSED_RELATIONSHIP.",
    "Return JSON only: { mode, anchor, entities, relationships, humanInputNeeded, reason }.",
    "Each entity must include id, name, labels, optional aliases, confidenceScore, and evidenceBasis.",
    "Each relationship must include sourceRef, targetRef, type, optional properties, confidenceScore, and evidenceBasis.",
    "Modes are answer_only, persist_graph, or needs_human_input.",
    "Use needs_human_input only when the graph cannot be staged safely without a human decision."
  ].join("\n");
  const input = [
    "Latest user prompt:",
    prompt,
    "",
    "Recent messages:",
    buildRecentMessageText(messages),
    "",
    "Assistant answer:",
    assistantText
  ].join("\n");
  const rawPlan = await callStructuredModel({
    instructions,
    input,
    purpose: "graph_plan",
    reasoningStage: REASONING_STAGES.GRAPH_PLAN,
    telemetryContext: {
      ...telemetryContext,
      purpose: "graph_plan"
    }
  });

  return normalizeGraphPlan(rawPlan);
}

function summarizeCandidates(canonLookups) {
  return canonLookups.map((lookup) => ({
    input: lookup.input,
    matches: (lookup.matches || []).map((match) => ({
      id: match.id,
      label: match.label,
      labels: match.labels,
      kind: match.kind,
      degree: match.degree,
      matchRank: match.matchRank
    }))
  }));
}

function validateGroundedGraph(rawGrounded, plan, canonLookups) {
  const validMatchIds = new Set(
    canonLookups.flatMap((lookup) => (lookup.matches || []).map((match) => match.id))
  );
  const planEntityById = new Map(plan.entities.map((entity) => [entity.tempId, entity]));
  const nodes = (Array.isArray(rawGrounded.nodes) ? rawGrounded.nodes : [])
    .map((node, index) => {
      const tempId = stableString(node.tempId || node.id) || `node-${index + 1}`;
      const planEntity = planEntityById.get(tempId);
      const base = planEntity || normalizePlanEntity(node, index);

      if (!base) {
        return null;
      }

      const matchedCanonId = stableString(node.matchedCanonId);

      return {
        ...base,
        name: stableString(node.name) || base.name,
        labels: normalizePlanEntity({
          ...base,
          labels: Array.isArray(node.labels) ? node.labels : base.labels
        }, index).labels,
        matchedCanonId: validMatchIds.has(matchedCanonId) ? matchedCanonId : "",
        properties: node.properties && typeof node.properties === "object"
          ? node.properties
          : base.properties,
        confidenceScore: Number.isFinite(Number(node.confidenceScore))
          ? Number(node.confidenceScore)
          : base.confidenceScore,
        evidenceBasis: stableString(node.evidenceBasis) || base.evidenceBasis
      };
    })
    .filter(Boolean);
  const nodeIds = new Set(nodes.map((node) => node.tempId));
  const relationships = (Array.isArray(rawGrounded.relationships)
    ? rawGrounded.relationships
    : plan.relationships
  )
    .map((relationship, index) => {
      const sourceRef = stableString(relationship.sourceRef || relationship.sourceId);
      const targetRef = stableString(relationship.targetRef || relationship.targetId);
      const type = sanitizeIdentifier(relationship.type, "RELATED_TO").toUpperCase();

      if (!nodeIds.has(sourceRef) || !nodeIds.has(targetRef) || type === "PROPOSED_RELATIONSHIP") {
        return null;
      }

      return {
        tempId: stableString(relationship.tempId || relationship.id) || `rel-${index + 1}`,
        sourceRef,
        targetRef,
        type,
        properties: relationship.properties && typeof relationship.properties === "object"
          ? relationship.properties
          : {},
        confidenceScore: Number.isFinite(Number(relationship.confidenceScore))
          ? Number(relationship.confidenceScore)
          : null,
        evidenceBasis: stableString(relationship.evidenceBasis) || "assistant_answer"
      };
    })
    .filter(Boolean);

  return {
    anchor: rawGrounded.anchor?.tempId || rawGrounded.anchor?.id
      ? rawGrounded.anchor
      : plan.anchor,
    nodes,
    relationships,
    humanInputNeeded: Boolean(rawGrounded.humanInputNeeded),
    reason: stableString(rawGrounded.reason)
  };
}

async function groundGraphPlan(plan, { telemetryContext = {} } = {}) {
  const [schema, canonLookups] = await Promise.all([
    inspectSchema(),
    lookupCanonEntities(plan.entities, { limit: 5 })
  ]);
  const instructions = [
    "Resolve planned entities against provided Neo4j candidate matches.",
    "Prefer existing canon when the intended entity is the same.",
    "Create a new domain entity only when no candidate is a reasonable match.",
    "Return JSON only with keys: anchor, nodes, relationships, humanInputNeeded, reason.",
    "Do not emit GraphProposal, ProposalItem, ProposedEntity, ProposedRelationship, or PROPOSED_RELATIONSHIP.",
    "The proposed/candidate status is metadata only and must not change labels or relationship types.",
    "Use matchedCanonId only when it exactly matches one of the provided candidate ids.",
    `Relationship types must be real domain names such as ${RELATIONSHIP_EXAMPLES.join(", ")}.`,
    "The examples are not an allow-list; preserve a new uppercase snake_case relationship type when it is domain-meaningful and not housekeeping."
  ].join("\n");
  const input = JSON.stringify(
    {
      schema,
      plan,
      candidateMatches: summarizeCandidates(canonLookups)
    },
    null,
    2
  );
  const rawGrounded = await callStructuredModel({
    instructions,
    input,
    purpose: "graph_grounding",
    reasoningStage: REASONING_STAGES.GRAPH_GROUNDING,
    telemetryContext: {
      ...telemetryContext,
      purpose: "graph_grounding"
    }
  });

  return validateGroundedGraph(rawGrounded, plan, canonLookups);
}

async function createHumanLoopMessage({
  prompt,
  plan,
  groundedGraph,
  errorMessage,
  telemetryContext = {}
}) {
  const instructions = [
    "If the graph cannot be persisted safely, ask the human for the smallest useful next decision.",
    "Offer concrete options: narrow scope, provide entities, inspect canon first, or answer without graph persistence.",
    "Do not invent graph structure to avoid asking.",
    "Do not mention internal proposal machinery."
  ].join("\n");
  const input = JSON.stringify(
    {
      userPrompt: prompt,
      planReason: plan?.reason || "",
      groundedReason: groundedGraph?.reason || "",
      errorMessage: errorMessage || ""
    },
    null,
    2
  );

  try {
    const payload = await callStructuredModel({
      instructions: `${instructions}\nReturn JSON only: { message }.`,
      input,
      purpose: "graph_human_loop",
      reasoningStage: REASONING_STAGES.HUMAN_LOOP,
      telemetryContext: {
        ...telemetryContext,
        purpose: "graph_human_loop"
      }
    });

    return stableString(payload.message) ||
      "I can answer this, but I need one more decision before changing the graph: narrow the scope, provide the exact entities, inspect canon first, or continue without graph persistence.";
  } catch {
    return "I can answer this, but I need one more decision before changing the graph: narrow the scope, provide the exact entities, inspect canon first, or continue without graph persistence.";
  }
}

async function runChatTurnPipeline({
  prompt,
  messages,
  assistantText,
  threadId,
  turnId,
  telemetryContext = {}
}) {
  const resultBase = {
    mode: "answer_only",
    graphAnchorId: null,
    graphAnchorName: "",
    graphNodeCount: 0,
    graphRelationshipCount: 0,
    humanInputNeeded: false,
    humanMessage: "",
    plan: null,
    groundedGraph: null,
    persistence: null
  };

  let plan;

  try {
    plan = await planGraphFromAnswer({ prompt, messages, assistantText, telemetryContext });
  } catch (error) {
    const humanMessage = await createHumanLoopMessage({
      prompt,
      errorMessage: error.message,
      telemetryContext
    });

    return {
      ...resultBase,
      mode: "needs_human_input",
      humanInputNeeded: true,
      humanMessage,
      errorMessage: error.message
    };
  }

  if (
    plan.mode === "answer_only" ||
    plan.entities.length === 0 ||
    (plan.relationships.length === 0 && !plan.anchor)
  ) {
    return {
      ...resultBase,
      mode: "answer_only",
      plan
    };
  }

  if (plan.mode === "needs_human_input" || plan.humanInputNeeded) {
    const humanMessage = await createHumanLoopMessage({ prompt, plan, telemetryContext });

    return {
      ...resultBase,
      mode: "needs_human_input",
      humanInputNeeded: true,
      humanMessage,
      plan
    };
  }

  let groundedGraph;

  try {
    groundedGraph = await groundGraphPlan(plan, { telemetryContext });
  } catch (error) {
    const humanMessage = await createHumanLoopMessage({
      prompt,
      plan,
      errorMessage: error.message,
      telemetryContext
    });

    return {
      ...resultBase,
      mode: "needs_human_input",
      humanInputNeeded: true,
      humanMessage,
      plan,
      errorMessage: error.message
    };
  }

  if (
    groundedGraph.humanInputNeeded ||
    groundedGraph.nodes.length === 0 ||
    (groundedGraph.relationships.length === 0 && plan.relationships.length > 0)
  ) {
    const humanMessage = await createHumanLoopMessage({
      prompt,
      plan,
      groundedGraph,
      telemetryContext
    });

    return {
      ...resultBase,
      mode: "needs_human_input",
      humanInputNeeded: true,
      humanMessage,
      plan,
      groundedGraph
    };
  }

  const persistence = await persistChatGraph({
    groundedGraph,
    threadId,
    turnId
  });

  return {
    ...resultBase,
    mode: "persist_graph",
    graphAnchorId: persistence.anchor?.elementId || null,
    graphAnchorName: persistence.anchor?.label || "",
    graphNodeCount: persistence.persistedNodeCount,
    graphRelationshipCount: persistence.persistedRelationshipCount,
    plan,
    groundedGraph,
    persistence
  };
}

module.exports = {
  createHumanLoopMessage,
  groundGraphPlan,
  planGraphFromAnswer,
  runChatTurnPipeline
};
