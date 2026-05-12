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
  "PLAYED_INSTRUMENT",
  "USED_AMPLIFIER",
  "RECORDED_AT",
  "ENGINEERED_BY",
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

function normalizeContextNode(node) {
  if (!node || typeof node !== "object") {
    return null;
  }

  const label = stableString(node.label || node.name);

  if (!label) {
    return null;
  }

  return {
    id: stableString(node.id),
    label,
    kind: stableString(node.kind || node.type || node.labelType)
  };
}

function summarizeGraphContextForPrompt(graphContext) {
  if (!graphContext || typeof graphContext !== "object") {
    return null;
  }

  const selectedNode = normalizeContextNode(graphContext.selectedNode);
  const currentView = graphContext.currentView && typeof graphContext.currentView === "object"
    ? graphContext.currentView
    : {};
  const nodes = (Array.isArray(currentView.nodes) ? currentView.nodes : [])
    .map(normalizeContextNode)
    .filter(Boolean)
    .slice(0, 80);
  const relationships = (Array.isArray(currentView.relationships)
    ? currentView.relationships
    : []
  )
    .map((relationship) => ({
      source: stableString(relationship?.source),
      sourceLabel: stableString(relationship?.sourceLabel),
      type: sanitizeIdentifier(relationship?.type, "RELATED_TO").toUpperCase(),
      target: stableString(relationship?.target),
      targetLabel: stableString(relationship?.targetLabel)
    }))
    .filter((relationship) => relationship.type && (relationship.source || relationship.sourceLabel) && (relationship.target || relationship.targetLabel))
    .slice(0, 120);

  return {
    intent: stableString(graphContext.intent) || "prompt",
    selectedNode,
    currentView: {
      seedNode: normalizeContextNode(currentView.seedNode),
      nodeCount: Number.isFinite(Number(currentView.nodeCount)) ? Number(currentView.nodeCount) : nodes.length,
      relationshipCount: Number.isFinite(Number(currentView.relationshipCount))
        ? Number(currentView.relationshipCount)
        : relationships.length,
      nodes,
      relationships
    }
  };
}

function graphContextEntities(graphContext) {
  const summary = summarizeGraphContextForPrompt(graphContext);

  if (!summary) {
    return [];
  }

  const candidates = [
    summary.selectedNode,
    summary.currentView.seedNode,
    ...summary.currentView.nodes
  ].filter(Boolean);
  const seen = new Set();

  return candidates
    .map((node) => ({
      name: node.label,
      type: node.kind
    }))
    .filter((entity) => {
      const key = `${entity.name.toLowerCase()}|||${entity.type.toLowerCase()}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function mergeCanonLookups(...lookupGroups) {
  const lookupByKey = new Map();

  for (const lookup of lookupGroups.flat()) {
    const inputName = stableString(lookup?.input?.name);
    const inputType = stableString(lookup?.input?.type);

    if (!inputName) {
      continue;
    }

    const key = `${inputName.toLowerCase()}|||${inputType.toLowerCase()}`;
    const currentLookup = lookupByKey.get(key) || {
      input: {
        name: inputName,
        type: inputType
      },
      matches: []
    };
    const matchById = new Map(
      currentLookup.matches.map((match) => [stableString(match.id), match])
    );

    for (const match of lookup.matches || []) {
      const matchId = stableString(match.id);

      if (matchId && !matchById.has(matchId)) {
        matchById.set(matchId, match);
      }
    }

    currentLookup.matches = [...matchById.values()];
    lookupByKey.set(key, currentLookup);
  }

  return [...lookupByKey.values()];
}

function normalizeGraphPlan(rawPlan, graphContext = {}) {
  const mode = ["answer_only", "persist_graph", "needs_human_input"].includes(rawPlan.mode)
    ? rawPlan.mode
    : "answer_only";
  const contextSummary = summarizeGraphContextForPrompt(graphContext);
  const selectedAnchorName =
    contextSummary?.intent === "expand_node"
      ? stableString(contextSummary.selectedNode?.label)
      : "";
  const selectedAnchorKind =
    contextSummary?.intent === "expand_node"
      ? stableString(contextSummary.selectedNode?.kind)
      : "";
  let entities = (Array.isArray(rawPlan.entities) ? rawPlan.entities : [])
    .map(normalizePlanEntity)
    .filter(Boolean);

  if (
    selectedAnchorName &&
    !entities.some((entity) => entity.name.toLowerCase() === selectedAnchorName.toLowerCase())
  ) {
    const selectedLabel = sanitizeIdentifier(selectedAnchorKind, "Entity");
    const selectedLabels = ALLOWED_NODE_LABELS.has(selectedLabel) ? [selectedLabel] : ["Entity"];

    entities = [
      {
        tempId: "context-selected-node",
        name: selectedAnchorName,
        type: selectedLabels[0],
        labels: selectedLabels,
        aliases: [],
        properties: {},
        confidenceScore: 1,
        evidenceBasis: "graph_context"
      },
      ...entities
    ];
  }

  const entityByName = new Map(
    entities.map((entity) => [entity.name.toLowerCase(), entity])
  );
  const relationships = (Array.isArray(rawPlan.relationships) ? rawPlan.relationships : [])
    .map((relationship, index) => normalizePlanRelationship(relationship, entityByName, index))
    .filter(Boolean);
  const anchorName = selectedAnchorName || stableString(rawPlan.anchor?.name || rawPlan.anchor);
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

async function planGraphFromAnswer({
  prompt,
  messages,
  assistantText,
  graphContext = {},
  telemetryContext = {}
}) {
  const graphContextSummary = summarizeGraphContextForPrompt(graphContext);
  const instructions = [
    "Read the user request, recent messages, and assistant answer.",
    "Decide whether this turn should produce graph data.",
    "Use music-domain reasoning to identify real entities and real relationships.",
    "The Complete Graph is the full Neo4j database. The current view is only the graph slice visible in the browser.",
    "When graphContext.intent is expand_node, use graphContext.selectedNode as the expansion anchor.",
    "For expansion, every graph-worthy new fact must connect back to the selected node or another reasonable existing Complete Graph candidate.",
    "For expansion, do not ask for human input merely because some facts may need later verification; use confidenceScore and evidenceBasis, then persist a connected graph patch when the selected entity is clear.",
    "Do not create detached album, track, label, or scene clusters during expansion.",
    "Do not create task phrases, section headings, proposal objects, review objects, or relationship-as-entity nodes.",
    `Use node labels only from this catalog when possible: ${[...ALLOWED_NODE_LABELS].join(", ")}.`,
    "Do not bury graph-worthy domain objects in generic Entity nodes or relationship properties.",
    "If the answer names a producer, engineer, instrument, amplifier, effect, console, studio, room, recording session, mix, master, source, or technique that a human may want to browse or compare, model it as a domain node with a real relationship.",
    "Use properties for nuance only, such as role, date, confidence, source basis, degree, or a short note.",
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
    "Graph context:",
    graphContextSummary ? JSON.stringify(graphContextSummary, null, 2) : "None supplied.",
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

  return normalizeGraphPlan(rawPlan, graphContextSummary || graphContext);
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

function enforceExpansionConnectivity(groundedGraph, graphContext) {
  const graphContextSummary = summarizeGraphContextForPrompt(graphContext);

  if (graphContextSummary?.intent !== "expand_node") {
    return groundedGraph;
  }

  const nodes = Array.isArray(groundedGraph.nodes) ? groundedGraph.nodes : [];
  const relationships = Array.isArray(groundedGraph.relationships)
    ? groundedGraph.relationships
    : [];
  const completeGraphAnchorIds = nodes
    .filter((node) => stableString(node.matchedCanonId))
    .map((node) => node.tempId);

  if (completeGraphAnchorIds.length === 0) {
    return {
      ...groundedGraph,
      humanInputNeeded: true,
      reason:
        "Expansion could not be connected to an existing Complete Graph node. The preview was not safe to persist."
    };
  }

  const adjacency = new Map(nodes.map((node) => [node.tempId, new Set()]));

  for (const relationship of relationships) {
    if (!adjacency.has(relationship.sourceRef) || !adjacency.has(relationship.targetRef)) {
      continue;
    }

    adjacency.get(relationship.sourceRef).add(relationship.targetRef);
    adjacency.get(relationship.targetRef).add(relationship.sourceRef);
  }

  const reachableNodeIds = new Set(completeGraphAnchorIds);
  const queue = [...completeGraphAnchorIds];

  while (queue.length > 0) {
    const currentId = queue.shift();

    for (const nextId of adjacency.get(currentId) || []) {
      if (reachableNodeIds.has(nextId)) {
        continue;
      }

      reachableNodeIds.add(nextId);
      queue.push(nextId);
    }
  }

  const connectedNodes = nodes.filter((node) => reachableNodeIds.has(node.tempId));
  const connectedRelationships = relationships.filter(
    (relationship) =>
      reachableNodeIds.has(relationship.sourceRef) &&
      reachableNodeIds.has(relationship.targetRef)
  );

  if (connectedRelationships.length === 0 && connectedNodes.length > 1) {
    return {
      ...groundedGraph,
      humanInputNeeded: true,
      reason:
        "Expansion found Complete Graph candidates but no safe connected relationships to persist."
    };
  }

  const droppedNodeCount = nodes.length - connectedNodes.length;
  const anchorRef = stableString(groundedGraph.anchor?.tempId || groundedGraph.anchor?.id);
  const anchor =
    anchorRef && reachableNodeIds.has(anchorRef)
      ? groundedGraph.anchor
      : connectedNodes.find((node) => stableString(node.matchedCanonId)) || connectedNodes[0] || groundedGraph.anchor;

  return {
    ...groundedGraph,
    anchor,
    nodes: connectedNodes,
    relationships: connectedRelationships,
    reason:
      droppedNodeCount > 0
        ? `${stableString(groundedGraph.reason)} Dropped ${droppedNodeCount} disconnected expansion node(s) before persistence.`.trim()
        : groundedGraph.reason
  };
}

async function groundGraphPlan(plan, { graphContext = {}, telemetryContext = {} } = {}) {
  const contextEntities = graphContextEntities(graphContext);
  const [schema, canonLookups, contextCanonLookups] = await Promise.all([
    inspectSchema(),
    lookupCanonEntities(plan.entities, { limit: 5 }),
    lookupCanonEntities(contextEntities, { limit: 5 })
  ]);
  const combinedCanonLookups = mergeCanonLookups(canonLookups, contextCanonLookups);
  const graphContextSummary = summarizeGraphContextForPrompt(graphContext);
  const instructions = [
    "Resolve planned entities against provided Neo4j candidate matches.",
    "The Complete Graph is the full Neo4j database. Candidate matches are existing Complete Graph nodes.",
    "Prefer existing canon when the intended entity is the same.",
    "Create a new domain entity only when no candidate is a reasonable match.",
    "When graphContext.intent is expand_node, preserve the selected node as the anchor when possible.",
    "For expansion, use matchedCanonId for existing nodes such as labels, albums, artists, studios, and people already present in the Complete Graph.",
    "For expansion, do not return a disconnected local cluster. New nodes must connect to selectedNode or to another existing Complete Graph candidate through real domain relationships.",
    "Return JSON only with keys: anchor, nodes, relationships, humanInputNeeded, reason.",
    "Do not emit GraphProposal, ProposalItem, ProposedEntity, ProposedRelationship, or PROPOSED_RELATIONSHIP.",
    "The proposed/candidate status is metadata only and must not change labels or relationship types.",
    "Do not collapse a graph-worthy thing into a property when it should be searchable, inspectable, or reusable as a node.",
    "If an entity only survived as a generic Entity because the label is unclear, keep humanInputNeeded true and ask for the smallest useful modeling decision.",
    "Use matchedCanonId only when it exactly matches one of the provided candidate ids.",
    `Relationship types must be real domain names such as ${RELATIONSHIP_EXAMPLES.join(", ")}.`,
    "The examples are not an allow-list; preserve a new uppercase snake_case relationship type when it is domain-meaningful and not housekeeping."
  ].join("\n");
  const input = JSON.stringify(
    {
      schema,
      graphContext: graphContextSummary,
      plan,
      candidateMatches: summarizeCandidates(combinedCanonLookups)
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

  return enforceExpansionConnectivity(
    validateGroundedGraph(rawGrounded, plan, combinedCanonLookups),
    graphContextSummary || graphContext
  );
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
  graphContext = {},
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
    plan = await planGraphFromAnswer({
      prompt,
      messages,
      assistantText,
      graphContext,
      telemetryContext
    });
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
    groundedGraph = await groundGraphPlan(plan, { graphContext, telemetryContext });
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
