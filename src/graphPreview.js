const crypto = require("crypto");
const { appendRuntimeEvent, appendTapeEntry } = require("./activityStore");
const { validateEnv } = require("./env");
const { recordLlmCallCompleted, recordLlmCallFailed } = require("./llmTelemetry");
const {
  REASONING_STAGES,
  resolveOpenAiModel,
  resolveReasoningEffort,
  resolveVerbosity
} = require("./reasoningConfig");
const { ALLOWED_NODE_LABELS, sanitizeIdentifier, stableString } = require("./graphDomainWriter");

const RELATIONSHIP_EXAMPLES = [
  "ASSOCIATED_WITH_SCENE",
  "LOCATED_IN",
  "FORMED_IN",
  "ORIGINATED_IN",
  "MEMBER_OF",
  "RELEASED_ALBUM",
  "COLLABORATED_WITH",
  "RELATED_TO"
];

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function slugify(value, fallback = "item") {
  const slug = stableString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || fallback;
}

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

function normalizeKind(value) {
  const normalized = sanitizeIdentifier(value, "Entity");

  if (ALLOWED_NODE_LABELS.has(normalized)) {
    return normalized;
  }

  return "Entity";
}

function pickColorKey(kind) {
  const normalized = String(kind || "node").toLowerCase();

  if (normalized.includes("artist") || normalized.includes("band")) {
    return "artist";
  }

  if (normalized.includes("album") || normalized.includes("release")) {
    return "album";
  }

  if (normalized.includes("track") || normalized.includes("song")) {
    return "track";
  }

  if (normalized.includes("person") || normalized.includes("member")) {
    return "person";
  }

  if (normalized.includes("label")) {
    return "label";
  }

  if (normalized.includes("venue")) {
    return "venue";
  }

  if (normalized.includes("place") || normalized.includes("city") || normalized.includes("state")) {
    return "venue";
  }

  if (normalized.includes("scene")) {
    return "scene";
  }

  if (normalized.includes("genre")) {
    return "genre";
  }

  return "node";
}

function pickShapeKey(kind) {
  const normalized = String(kind || "node").toLowerCase();

  if (normalized.includes("album") || normalized.includes("release")) {
    return "round-rectangle";
  }

  if (normalized.includes("track") || normalized.includes("song")) {
    return "diamond";
  }

  if (normalized.includes("person") || normalized.includes("member")) {
    return "hexagon";
  }

  return "ellipse";
}

function pickRelationshipStyle(type) {
  const normalized = String(type || "").toUpperCase();

  if (normalized.includes("INFLUENCE") || normalized.includes("RELATED") || normalized.includes("SIMILAR")) {
    return "dotted";
  }

  if (
    normalized.includes("MEMBER") ||
    normalized.includes("COLLAB") ||
    normalized.includes("PRODUC") ||
    normalized.includes("PERFORM")
  ) {
    return "dashed";
  }

  return "solid";
}

function normalizeRawNode(node, index, seedId) {
  const label = stableString(node?.label || node?.name);

  if (!label) {
    return null;
  }

  const kind = normalizeKind(node.kind || node.type || node.labels?.[0]);
  const id = `preview-node-${slugify(node.id || label, `node-${index + 1}`)}`;
  const labels = Array.isArray(node.labels)
    ? node.labels.map(normalizeKind).filter(Boolean)
    : [kind];
  const uniqueLabels = [...new Set(labels.length > 0 ? labels : [kind])];

  return {
    id,
    label,
    kind,
    colorKey: pickColorKey(kind),
    shapeKey: pickShapeKey(kind),
    x: 0,
    y: 0,
    summary: {
      subtitle: stableString(node.subtitle || node.description || node.reason) || kind,
      labels: uniqueLabels
    },
    isSeed: id === seedId,
    isPreview: true
  };
}

function normalizeRawEdge(edge, index, nodeIdByRef) {
  const sourceRef = stableString(edge?.source || edge?.sourceId || edge?.sourceRef || edge?.sourceLabel);
  const targetRef = stableString(edge?.target || edge?.targetId || edge?.targetRef || edge?.targetLabel);
  const source = nodeIdByRef.get(sourceRef.toLowerCase());
  const target = nodeIdByRef.get(targetRef.toLowerCase());

  if (!source || !target || source === target) {
    return null;
  }

  const type = sanitizeIdentifier(edge.type, "RELATED_TO").toUpperCase();

  return {
    id: `preview-edge-${slugify(edge.id || `${source}-${type}-${target}`, `edge-${index + 1}`)}`,
    source,
    target,
    type,
    styleKey: pickRelationshipStyle(type),
    summary: {
      propertyCount: 0,
      preview: true
    }
  };
}

function applyPreviewPositions(graph) {
  const seedId = graph.seedNode?.id || graph.nodes[0]?.id || "";
  const positionedNodes = graph.nodes.map((node, index) => {
    if (node.id === seedId) {
      return { ...node, x: 0, y: 0, isSeed: true };
    }

    const nonSeedIndex = graph.nodes
      .filter((candidate) => candidate.id !== seedId)
      .findIndex((candidate) => candidate.id === node.id);
    const total = Math.max(1, graph.nodes.length - 1);
    const angle = -Math.PI / 2 + (nonSeedIndex / total) * Math.PI * 2;
    const radius = graph.nodes.length > 12 ? 330 : 240;

    return {
      ...node,
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
      isSeed: false
    };
  });

  return {
    ...graph,
    seedNode: positionedNodes.find((node) => node.id === seedId) || graph.seedNode,
    nodes: positionedNodes
  };
}

function normalizePreviewGraph(rawPreview, { requestId, responseId }) {
  const rawNodes = Array.isArray(rawPreview?.nodes) ? rawPreview.nodes : [];
  const rawSeed = rawPreview?.seed || rawPreview?.anchor || rawNodes[0] || null;
  const seedLabel = stableString(rawSeed?.label || rawSeed?.name);
  const seedId = seedLabel ? `preview-node-${slugify(rawSeed.id || seedLabel, "seed")}` : "";
  const nodeMap = new Map();
  const nodeIdByRef = new Map();

  for (const rawNode of [rawSeed, ...rawNodes].filter(Boolean)) {
    const normalized = normalizeRawNode(rawNode, nodeMap.size, seedId);

    if (!normalized) {
      continue;
    }

    nodeMap.set(normalized.id, normalized);
    [
      rawNode.id,
      rawNode.tempId,
      rawNode.label,
      rawNode.name,
      normalized.id
    ].map(stableString)
      .filter(Boolean)
      .forEach((ref) => nodeIdByRef.set(ref.toLowerCase(), normalized.id));
  }

  const nodes = [...nodeMap.values()];
  const edges = (Array.isArray(rawPreview?.edges) ? rawPreview.edges : rawPreview?.relationships || [])
    .map((edge, index) => normalizeRawEdge(edge, index, nodeIdByRef))
    .filter(Boolean);
  const graph = applyPreviewPositions({
    seedNode: nodes.find((node) => node.id === seedId) || nodes[0] || null,
    nodes,
    edges,
    meta: {
      preview: true,
      source: "assistant_answer",
      requestId,
      responseId,
      status: "Preview graph generated from the assistant answer. It has not been written to canon.",
      availableNodeKinds: [...new Set(nodes.map((node) => node.kind))].sort((left, right) => left.localeCompare(right)),
      availableRelationshipTypes: [...new Set(edges.map((edge) => edge.type))].sort((left, right) => left.localeCompare(right)),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      visibleNodeCount: nodes.length,
      visibleEdgeCount: edges.length
    }
  });

  return graph.nodes.length > 0 ? graph : null;
}

async function callPreviewModel({ prompt, assistantText, telemetryContext }) {
  const envResult = validateEnv();
  const model = resolveOpenAiModel();
  const reasoningStage = REASONING_STAGES.GRAPH_PREVIEW;
  const reasoningConfig = resolveReasoningEffort(reasoningStage);
  const verbosityConfig = resolveVerbosity();
  const startedAt = Date.now();

  if (!envResult.isValid) {
    const errorMessage = "Cannot run graph preview: missing MusicMesh environment variables.";
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

  const instructions = [
    "Create a provisional graph preview for display only.",
    "Use only entities and relationships that are visible in the supplied user prompt and assistant answer.",
    "Do not create canon, proposal, review, task, or workflow nodes.",
    `Use node kinds from this catalog when possible: ${[...ALLOWED_NODE_LABELS].join(", ")}.`,
    `Use music-domain relationship types such as ${RELATIONSHIP_EXAMPLES.join(", ")}.`,
    "Prefer a compact graph centered on the main subject of the prompt.",
    "Return JSON only with this shape:",
    "{ seed: { id, label, kind, subtitle }, nodes: [{ id, label, kind, subtitle }], edges: [{ id, source, target, type }] }."
  ].join("\n");
  const input = JSON.stringify(
    {
      prompt,
      assistantAnswer: assistantText
    },
    null,
    2
  );
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
      `OpenAI graph preview request failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`;
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
    const errorMessage = "OpenAI graph preview returned invalid JSON.";
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

async function createGraphPreview({ requestId, threadId, prompt, assistantText, responseId }) {
  const telemetryContext = {
    requestId,
    threadId,
    turnId: requestId,
    purpose: "graph_preview"
  };
  const startedAt = Date.now();

  await appendRuntimeEvent({
    id: createId("log"),
    type: "graph_preview_started",
    payload: {
      requestId,
      threadId,
      responseId
    }
  });

  try {
    const rawPreview = await callPreviewModel({ prompt, assistantText, telemetryContext });
    const graph = normalizePreviewGraph(rawPreview, { requestId, responseId });

    if (!graph) {
      await appendRuntimeEvent({
        id: createId("log"),
        type: "graph_preview_completed",
        payload: {
          requestId,
          threadId,
          responseId,
          graphNodeCount: 0,
          graphRelationshipCount: 0,
          durationMs: Date.now() - startedAt
        }
      });
      return null;
    }

    const tapeEntry = await appendTapeEntry({
      id: createId("evt"),
      type: "graph_preview",
      threadId,
      payload: {
        requestId,
        responseId,
        previewGraphId: graph.seedNode?.id || null,
        preview: true,
        graph
      }
    });

    await appendRuntimeEvent({
      id: createId("log"),
      type: "graph_preview_completed",
      payload: {
        requestId,
        threadId,
        responseId,
        tapeEventId: tapeEntry.id,
        graphNodeCount: graph.nodes.length,
        graphRelationshipCount: graph.edges.length,
        durationMs: Date.now() - startedAt
      }
    });

    return graph;
  } catch (error) {
    await appendRuntimeEvent({
      id: createId("log"),
      type: "graph_preview_failed",
      payload: {
        requestId,
        threadId,
        responseId,
        durationMs: Date.now() - startedAt,
        message: error.message || "Graph preview failed."
      }
    });
    return null;
  }
}

function queueGraphPreview(context) {
  createGraphPreview(context).catch(() => {
    // createGraphPreview records its own failures.
  });
}

module.exports = {
  createGraphPreview,
  queueGraphPreview
};
