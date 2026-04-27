const crypto = require("crypto");
const { appendRuntimeEvent, appendTapeEntry, readRuntimeEvents, readTapeEntries } = require("./activityStore");
const { validateEnv } = require("./env");
const { recordLlmCallCompleted, recordLlmCallFailed } = require("./llmTelemetry");
const {
  REASONING_STAGES,
  resolveOpenAiModel,
  resolveReasoningEffort,
  resolveVerbosity
} = require("./reasoningConfig");

const REVIEW_PACKET_VERSION = 2;
const MAX_PROMPT_CHARS = 1800;
const MAX_ASSISTANT_CHARS = 5000;
const MAX_ERROR_CHARS = 700;
const REVIEW_TAPE_TYPES = new Set([
  "user_message",
  "assistant_message",
  "graph_preview",
  "graph_update",
  "chat_error"
]);

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function stableString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boolOrNull(value) {
  return typeof value === "boolean" ? value : null;
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

function parseJsonObject(text) {
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clampScore(value) {
  const score = Number(value);

  if (!Number.isFinite(score)) {
    return null;
  }

  return Math.max(1, Math.min(5, Math.round(score)));
}

function normalizeAssessment(rawAssessment, reviewPacket) {
  const assessment = rawAssessment && typeof rawAssessment === "object" ? rawAssessment : {};
  const operationalRunRecord = reviewPacket?.operationalRunRecord || {};
  const stageTimings = normalizeStageTimings(
    assessment.stageTimings,
    operationalRunRecord.stageTimings || []
  );

  return {
    summary: stableString(assessment.summary),
    outcome: stableString(operationalRunRecord.outcome) || stableString(assessment.outcome) || "unknown",
    overallScore: clampScore(assessment.overallScore),
    answeringThePrompt: normalizeScoredSection(assessment.answeringThePrompt),
    speedOfCompletion: normalizeScoredSection(assessment.speedOfCompletion),
    processEfficiency: normalizeScoredSection(assessment.processEfficiency),
    stageTimings,
    bugsOrAnomalies: normalizeList(assessment.bugsOrAnomalies),
    suggestedEnhancements: normalizeList(assessment.suggestedEnhancements),
    topFindings: normalizeList(assessment.topFindings).slice(0, 5),
    nextActions: normalizeList(assessment.nextActions).slice(0, 5),
    needsOperatorAttention: Boolean(assessment.needsOperatorAttention),
    requiresFollowUp: Boolean(assessment.requiresFollowUp)
  };
}

function normalizeScoredSection(section) {
  const value = section && typeof section === "object" ? section : {};

  return {
    score: clampScore(value.score),
    rationale: stableString(value.rationale)
  };
}

function normalizeList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return {
          description: item.trim(),
          evidence: "",
          severity: ""
        };
      }

      if (item && typeof item === "object") {
        return {
          severity: stableString(item.severity || item.priority),
          description: stableString(item.description || item.issue || item.suggestion || item.action),
          evidence: stableString(item.evidence || item.reason)
        };
      }

      return null;
    })
    .filter((item) => item && (item.description || item.evidence || item.severity));
}

function normalizeStageTimings(rawTimings, factTimings) {
  const explanationsByStage = new Map();

  if (Array.isArray(rawTimings)) {
    for (const timing of rawTimings) {
      const stage = stableString(timing?.stage || timing?.id || timing?.name);
      const explanation = stableString(timing?.explanation || timing?.rationale || timing?.summary);

      if (stage && explanation) {
        explanationsByStage.set(stage, explanation);
      }
    }
  }

  return factTimings.map((timing) => ({
    stage: timing.stage,
    label: timing.label,
    status: timing.status,
    startedAt: timing.startedAt || null,
    completedAt: timing.completedAt || null,
    elapsedMs: numberOrNull(timing.elapsedMs),
    model: timing.model || null,
    reasoningEffort: timing.reasoningEffort || null,
    inputTokens: numberOrNull(timing.inputTokens),
    outputTokens: numberOrNull(timing.outputTokens),
    reasoningTokens: numberOrNull(timing.reasoningTokens),
    totalTokens: numberOrNull(timing.totalTokens),
    graphNodeCount: numberOrNull(timing.graphNodeCount),
    graphRelationshipCount: numberOrNull(timing.graphRelationshipCount),
    sourceEvents: Array.isArray(timing.sourceEvents) ? timing.sourceEvents : [],
    explanation: explanationsByStage.get(timing.stage) || timing.explanationHint || ""
  }));
}

function appendRunReviewTiming(stageTimings, { startedAt, completedAt, reviewPacketBytes }) {
  const model = resolveOpenAiModel();

  return [
    ...stageTimings,
    {
      stage: "run_quality_assessment",
      label: "Run quality assessment",
      status: "completed",
      startedAt,
      completedAt,
      elapsedMs: durationBetween(startedAt, completedAt),
      model,
      reasoningEffort: resolveReasoningEffort(REASONING_STAGES.RUN_REVIEW).effort,
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      totalTokens: null,
      graphNodeCount: null,
      graphRelationshipCount: null,
      sourceEvents: ["run_quality_assessment_started", "run_quality_assessment_completed"],
      explanation: `${model} reviewed the compact run packet after completion (${reviewPacketBytes || 0} bytes).`
    }
  ];
}

function limitText(value, maxChars) {
  const text = stableString(value);

  if (!text) {
    return {
      text: "",
      charCount: 0,
      truncated: false,
      omittedChars: 0
    };
  }

  if (text.length <= maxChars) {
    return {
      text,
      charCount: text.length,
      truncated: false,
      omittedChars: 0
    };
  }

  return {
    text: text.slice(0, maxChars),
    charCount: text.length,
    truncated: true,
    omittedChars: text.length - maxChars
  };
}

function uniqueSorted(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(stableString)
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function summarizeGraphPipeline(graphPipeline) {
  const planEntities = Array.isArray(graphPipeline?.plan?.entities) ? graphPipeline.plan.entities : [];
  const planRelationships = Array.isArray(graphPipeline?.plan?.relationships)
    ? graphPipeline.plan.relationships
    : [];
  const groundedNodes = Array.isArray(graphPipeline?.groundedGraph?.nodes)
    ? graphPipeline.groundedGraph.nodes
    : [];
  const groundedRelationships = Array.isArray(graphPipeline?.groundedGraph?.relationships)
    ? graphPipeline.groundedGraph.relationships
    : [];

  return {
    mode: graphPipeline?.mode || null,
    graphAnchorId: graphPipeline?.graphAnchorId || null,
    graphAnchorName: graphPipeline?.graphAnchorName || "",
    graphNodeCount: graphPipeline?.graphNodeCount ?? null,
    graphRelationshipCount: graphPipeline?.graphRelationshipCount ?? null,
    humanInputNeeded: graphPipeline?.humanInputNeeded ?? null,
    humanMessagePresent: Boolean(stableString(graphPipeline?.humanMessage)),
    planEntityCount: planEntities.length,
    planRelationshipCount: planRelationships.length,
    planEntityTypes: uniqueSorted(planEntities.map((entity) => entity.type || entity.labels?.[0])),
    planRelationshipTypes: uniqueSorted(planRelationships.map((relationship) => relationship.type)),
    groundedNodeCount: groundedNodes.length,
    groundedRelationshipCount: groundedRelationships.length,
    groundedNodeTypes: uniqueSorted(groundedNodes.map((node) => node.type || node.labels?.[0])),
    groundedRelationshipTypes: uniqueSorted(groundedRelationships.map((relationship) => relationship.type)),
    persistedNodeCount: graphPipeline?.persistence?.persistedNodeCount ?? null,
    persistedRelationshipCount: graphPipeline?.persistence?.persistedRelationshipCount ?? null,
    skippedRelationshipCount: graphPipeline?.persistence?.skippedRelationshipCount ?? null,
    errorMessage: limitText(graphPipeline?.errorMessage, MAX_ERROR_CHARS)
  };
}

function summarizePreviewGraph(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];

  return {
    preview: Boolean(graph?.meta?.preview || nodes.some((node) => node?.isPreview)),
    seed: {
      id: stableString(graph?.seedNode?.id),
      label: stableString(graph?.seedNode?.label)
    },
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeKinds: uniqueSorted(nodes.map((node) => node?.kind || node?.labels?.[0] || node?.summary?.labels?.[0])),
    relationshipTypes: uniqueSorted(edges.map((edge) => edge?.type))
  };
}

function findRunWindow(runtimeEvents, requestId) {
  const runEvents = runtimeEvents.filter((event) => event?.payload?.requestId === requestId);
  const start = runEvents[0]?.createdAt || null;
  const end = runEvents[runEvents.length - 1]?.createdAt || null;

  return { runEvents, start, end };
}

function createdAtInWindow(createdAt, start, end) {
  if (!createdAt || !start) {
    return false;
  }

  const created = Date.parse(createdAt);
  const lower = Date.parse(start);
  const upper = Date.parse(end || new Date().toISOString()) + 5 * 60 * 1000;

  return Number.isFinite(created) &&
    Number.isFinite(lower) &&
    Number.isFinite(upper) &&
    created >= lower &&
    created <= upper;
}

function selectTapeEntries(tapeEntries, { threadId, requestId, tapeEventIds, start, end }) {
  const ids = new Set(Array.isArray(tapeEventIds) ? tapeEventIds : []);

  return tapeEntries.filter((entry) => {
    if (!REVIEW_TAPE_TYPES.has(entry?.type)) {
      return false;
    }

    if (ids.has(entry?.id)) {
      return true;
    }

    if (entry?.payload?.requestId === requestId) {
      return true;
    }

    if (entry?.payload?.requestId || entry?.threadId !== threadId) {
      return false;
    }

    return createdAtInWindow(entry?.createdAt, start, end);
  });
}

function summarizeTapePayload(entry) {
  const payload = entry?.payload || {};

  if (entry?.type === "user_message") {
    return {
      requestId: payload.requestId || null,
      messageCount: numberOrNull(payload.messageCount),
      prompt: limitText(payload.prompt, MAX_PROMPT_CHARS)
    };
  }

  if (entry?.type === "assistant_message") {
    return {
      requestId: payload.requestId || null,
      responseId: payload.responseId || null,
      assistantOutput: limitText(payload.text, MAX_ASSISTANT_CHARS),
      graphPending: boolOrNull(payload.graphPending),
      previewGraphPending: boolOrNull(payload.previewGraphPending),
      graphAnchorId: payload.graphAnchorId || null,
      graphMode: payload.graphMode || null,
      humanInputNeeded: boolOrNull(payload.humanInputNeeded)
    };
  }

  if (entry?.type === "graph_preview") {
    return {
      requestId: payload.requestId || null,
      responseId: payload.responseId || null,
      previewGraphId: payload.previewGraphId || null,
      preview: boolOrNull(payload.preview),
      graph: summarizePreviewGraph(payload.graph)
    };
  }

  if (entry?.type === "graph_update") {
    return {
      requestId: payload.requestId || null,
      responseId: payload.responseId || null,
      graphAnchorId: payload.graphAnchorId || null,
      graphAnchorName: payload.graphAnchorName || "",
      graphNodeCount: numberOrNull(payload.graphNodeCount),
      graphRelationshipCount: numberOrNull(payload.graphRelationshipCount),
      graphMode: payload.graphMode || null,
      humanInputNeeded: boolOrNull(payload.humanInputNeeded)
    };
  }

  if (entry?.type === "chat_error") {
    return {
      requestId: payload.requestId || null,
      message: limitText(payload.message, MAX_ERROR_CHARS)
    };
  }

  return {
    requestId: payload.requestId || null,
    responseId: payload.responseId || null,
    payloadKeys: Object.keys(payload).sort()
  };
}

function summarizeTapeEntry(entry) {
  return {
    id: entry.id,
    type: entry.type,
    createdAt: entry.createdAt,
    payload: summarizeTapePayload(entry)
  };
}

function summarizeRuntimePayload(event) {
  const payload = event?.payload || {};

  if (event?.type === "chat_request_received") {
    return {
      requestId: payload.requestId || null,
      threadId: payload.threadId || null,
      messageCount: numberOrNull(payload.messageCount),
      promptCharCount: stableString(payload.prompt).length,
      systemPromptPath: payload.systemPromptPath || null
    };
  }

  if (event?.type === "chat_answer_returned") {
    return {
      requestId: payload.requestId || null,
      threadId: payload.threadId || null,
      responseId: payload.responseId || null,
      tapeEventIds: Array.isArray(payload.tapeEventIds) ? payload.tapeEventIds : []
    };
  }

  if (event?.type === "chat_request_completed") {
    return {
      requestId: payload.requestId || null,
      threadId: payload.threadId || null,
      responseId: payload.responseId || null,
      graphMode: payload.graphMode || null,
      graphPending: boolOrNull(payload.graphPending),
      previewGraphPending: boolOrNull(payload.previewGraphPending),
      tapeEventIds: Array.isArray(payload.tapeEventIds) ? payload.tapeEventIds : []
    };
  }

  if (event?.type === "graph_preview_started" || event?.type === "chat_graph_pipeline_started") {
    return {
      requestId: payload.requestId || null,
      threadId: payload.threadId || null,
      responseId: payload.responseId || null
    };
  }

  if (event?.type === "graph_preview_completed") {
    return {
      requestId: payload.requestId || null,
      threadId: payload.threadId || null,
      responseId: payload.responseId || null,
      tapeEventId: payload.tapeEventId || null,
      graphNodeCount: numberOrNull(payload.graphNodeCount),
      graphRelationshipCount: numberOrNull(payload.graphRelationshipCount),
      durationMs: numberOrNull(payload.durationMs)
    };
  }

  if (event?.type === "graph_preview_failed" || event?.type === "chat_graph_pipeline_failed" ||
    event?.type === "chat_graph_pipeline_deferred_failed" || event?.type === "chat_request_failed" ||
    event?.type === "run_quality_assessment_failed") {
    return {
      requestId: payload.requestId || null,
      threadId: payload.threadId || null,
      responseId: payload.responseId || null,
      durationMs: numberOrNull(payload.durationMs),
      message: limitText(payload.message, MAX_ERROR_CHARS)
    };
  }

  if (event?.type === "chat_graph_pipeline_completed" ||
    event?.type === "chat_graph_pipeline_deferred_completed") {
    return {
      requestId: payload.requestId || null,
      threadId: payload.threadId || null,
      mode: payload.mode || null,
      graphAnchorId: payload.graphAnchorId || null,
      graphAnchorName: payload.graphAnchorName || "",
      graphNodeCount: numberOrNull(payload.graphNodeCount),
      graphRelationshipCount: numberOrNull(payload.graphRelationshipCount),
      humanInputNeeded: boolOrNull(payload.humanInputNeeded),
      skippedRelationshipCount: numberOrNull(payload.skippedRelationshipCount)
    };
  }

  if (event?.type === "llm_call_completed" || event?.type === "llm_call_failed") {
    return {
      requestId: payload.requestId || null,
      threadId: payload.threadId || null,
      purpose: payload.purpose || null,
      stage: payload.stage || null,
      model: payload.model || null,
      reasoningEffortRequested: payload.reasoningEffortRequested || null,
      reasoningEffortSource: payload.reasoningEffortSource || null,
      verbosityRequested: payload.verbosityRequested || null,
      durationMs: numberOrNull(payload.durationMs),
      responseId: payload.responseId || null,
      status: payload.status || null,
      errorCode: payload.errorCode || null,
      errorMessage: limitText(payload.errorMessage, MAX_ERROR_CHARS),
      inputTokens: numberOrNull(payload.inputTokens),
      outputTokens: numberOrNull(payload.outputTokens),
      reasoningTokens: numberOrNull(payload.reasoningTokens),
      totalTokens: numberOrNull(payload.totalTokens)
    };
  }

  if (event?.type === "run_quality_assessment_started") {
    return {
      requestId: payload.requestId || null,
      threadId: payload.threadId || null,
      responseId: payload.responseId || null,
      graphPending: boolOrNull(payload.graphPending),
      reviewPacketVersion: numberOrNull(payload.reviewPacketVersion)
    };
  }

  if (event?.type === "run_quality_assessment_completed") {
    return {
      requestId: payload.requestId || null,
      threadId: payload.threadId || null,
      responseId: payload.responseId || null,
      tapeEventId: payload.tapeEventId || null,
      overallScore: numberOrNull(payload.overallScore),
      outcome: payload.outcome || null,
      requiresFollowUp: boolOrNull(payload.requiresFollowUp),
      needsOperatorAttention: boolOrNull(payload.needsOperatorAttention),
      reviewPacketBytes: numberOrNull(payload.reviewPacketBytes),
      reviewDurationMs: numberOrNull(payload.reviewDurationMs),
      bugOrAnomalyCount: numberOrNull(payload.bugOrAnomalyCount),
      suggestedEnhancementCount: numberOrNull(payload.suggestedEnhancementCount)
    };
  }

  return {
    requestId: payload.requestId || null,
    threadId: payload.threadId || null,
    responseId: payload.responseId || null,
    payloadKeys: Object.keys(payload).sort()
  };
}

function summarizeRuntimeEvent(event) {
  return {
    id: event.id,
    type: event.type,
    createdAt: event.createdAt,
    payload: summarizeRuntimePayload(event)
  };
}

function parseTime(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function toIso(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function durationBetween(start, end) {
  const startMs = parseTime(start);
  const endMs = parseTime(end);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }

  return endMs - startMs;
}

function startFromCompletedAt(completedAt, durationMs) {
  const completedMs = parseTime(completedAt);
  const duration = numberOrNull(durationMs);

  if (!Number.isFinite(completedMs) || duration === null) {
    return null;
  }

  return toIso(completedMs - duration);
}

function firstEvent(events, type, predicate = () => true) {
  return events.find((event) => event.type === type && predicate(event)) || null;
}

function lastEvent(events, types, predicate = () => true) {
  const wantedTypes = new Set(Array.isArray(types) ? types : [types]);

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (wantedTypes.has(event.type) && predicate(event)) {
      return event;
    }
  }

  return null;
}

function llmEventForStage(events, stage) {
  return firstEvent(
    events,
    "llm_call_completed",
    (event) => event.payload?.stage === stage
  ) || firstEvent(
    events,
    "llm_call_failed",
    (event) => event.payload?.stage === stage
  );
}

function timingFromLlmEvent(event, { stage, label, explanationHint }) {
  if (!event) {
    return null;
  }

  const payload = event.payload || {};
  const elapsedMs = numberOrNull(payload.durationMs);

  return {
    stage,
    label,
    status: event.type === "llm_call_failed" ? "failed" : "completed",
    startedAt: startFromCompletedAt(event.createdAt, elapsedMs),
    completedAt: event.createdAt,
    elapsedMs,
    model: payload.model || null,
    reasoningEffort: payload.reasoningEffortRequested || null,
    inputTokens: numberOrNull(payload.inputTokens),
    outputTokens: numberOrNull(payload.outputTokens),
    reasoningTokens: numberOrNull(payload.reasoningTokens),
    totalTokens: numberOrNull(payload.totalTokens),
    graphNodeCount: null,
    graphRelationshipCount: null,
    sourceEvents: [event.type],
    explanationHint
  };
}

function timingFromStartAndTerminal({ stage, label, startEvent, completedEvent, failedEvent, explanationHint, extra = {} }) {
  const terminalEvent = completedEvent || failedEvent;

  if (!startEvent && !terminalEvent) {
    return null;
  }

  const payloadDuration = numberOrNull(terminalEvent?.payload?.durationMs);
  const startedAt = startEvent?.createdAt || startFromCompletedAt(terminalEvent?.createdAt, payloadDuration);
  const completedAt = terminalEvent?.createdAt || null;
  const status = completedEvent ? "completed" : failedEvent ? "failed" : "started";
  const elapsedMs = payloadDuration ?? durationBetween(startedAt, completedAt);

  return {
    stage,
    label,
    status,
    startedAt,
    completedAt,
    elapsedMs,
    model: extra.model || null,
    reasoningEffort: extra.reasoningEffort || null,
    inputTokens: numberOrNull(extra.inputTokens),
    outputTokens: numberOrNull(extra.outputTokens),
    reasoningTokens: numberOrNull(extra.reasoningTokens),
    totalTokens: numberOrNull(extra.totalTokens),
    graphNodeCount: numberOrNull(extra.graphNodeCount),
    graphRelationshipCount: numberOrNull(extra.graphRelationshipCount),
    sourceEvents: [startEvent?.type, terminalEvent?.type].filter(Boolean),
    explanationHint
  };
}

function deriveStageTimings(runEvents) {
  const timings = [];
  const requestReceived = firstEvent(runEvents, "chat_request_received");
  const answerReturned = firstEvent(runEvents, "chat_answer_returned");
  const chatLlmEvent =
    llmEventForStage(runEvents, REASONING_STAGES.KNOWLEDGE) ||
    llmEventForStage(runEvents, REASONING_STAGES.CHAT_COMPLEX);
  const previewStarted = firstEvent(runEvents, "graph_preview_started");
  const previewCompleted = lastEvent(runEvents, "graph_preview_completed");
  const previewFailed = lastEvent(runEvents, "graph_preview_failed");
  const previewLlmEvent = llmEventForStage(runEvents, REASONING_STAGES.GRAPH_PREVIEW);
  const graphPipelineStarted = firstEvent(runEvents, "chat_graph_pipeline_started");
  const graphPipelineCompleted = lastEvent(runEvents, [
    "chat_graph_pipeline_completed",
    "chat_graph_pipeline_deferred_completed"
  ]);
  const graphPipelineFailed = lastEvent(runEvents, [
    "chat_graph_pipeline_failed",
    "chat_graph_pipeline_deferred_failed"
  ]);

  const promptToAnswer = timingFromStartAndTerminal({
    stage: "prompt_to_visible_answer",
    label: "Prompt to visible answer",
    startEvent: requestReceived,
    completedEvent: answerReturned,
    failedEvent: null,
    explanationHint: "The API accepted the prompt, wrote the user turn, generated the assistant answer, and returned visible text."
  });

  if (promptToAnswer) {
    timings.push(promptToAnswer);
  }

  const chatLlmTiming = timingFromLlmEvent(chatLlmEvent, {
    stage: "chat_answer_llm",
    label: "Chat answer LLM",
    explanationHint: `${chatLlmEvent?.payload?.model || "The selected chat model"} generated the visible answer text.`
  });

  if (chatLlmTiming) {
    timings.push(chatLlmTiming);
  }

  const previewPayload = (previewCompleted || previewFailed)?.payload || {};
  const previewLlmPayload = previewLlmEvent?.payload || {};
  const previewTiming = timingFromStartAndTerminal({
    stage: "graph_preview",
    label: "Graph preview",
    startEvent: previewStarted,
    completedEvent: previewCompleted,
    failedEvent: previewFailed,
    explanationHint: "A low-latency preview graph was generated from the assistant answer for display only.",
    extra: {
      model: previewLlmPayload.model,
      reasoningEffort: previewLlmPayload.reasoningEffortRequested,
      inputTokens: previewLlmPayload.inputTokens,
      outputTokens: previewLlmPayload.outputTokens,
      reasoningTokens: previewLlmPayload.reasoningTokens,
      totalTokens: previewLlmPayload.totalTokens,
      graphNodeCount: previewPayload.graphNodeCount,
      graphRelationshipCount: previewPayload.graphRelationshipCount
    }
  });

  if (previewTiming) {
    timings.push(previewTiming);
  }

  const graphPlanTiming = timingFromLlmEvent(
    llmEventForStage(runEvents, REASONING_STAGES.GRAPH_PLAN),
    {
      stage: "graph_plan_llm",
      label: "Graph plan LLM",
      explanationHint: "The LLM decided whether the answer should produce graph data and proposed domain entities and relationships."
    }
  );

  if (graphPlanTiming) {
    timings.push(graphPlanTiming);
  }

  const graphGroundingTiming = timingFromLlmEvent(
    llmEventForStage(runEvents, REASONING_STAGES.GRAPH_GROUNDING),
    {
      stage: "graph_grounding_llm",
      label: "Graph grounding LLM",
      explanationHint: "The LLM resolved planned graph data against existing canon candidates."
    }
  );

  if (graphGroundingTiming) {
    timings.push(graphGroundingTiming);
  }

  const humanLoopTiming = timingFromLlmEvent(
    llmEventForStage(runEvents, REASONING_STAGES.HUMAN_LOOP),
    {
      stage: "human_loop_llm",
      label: "Human loop LLM",
      explanationHint: "The LLM produced a clarification when graph persistence needed a human decision."
    }
  );

  if (humanLoopTiming) {
    timings.push(humanLoopTiming);
  }

  const pipelinePayload = (graphPipelineCompleted || graphPipelineFailed)?.payload || {};
  const graphPipelineTiming = timingFromStartAndTerminal({
    stage: "graph_pipeline",
    label: "Grounded graph pipeline",
    startEvent: graphPipelineStarted,
    completedEvent: graphPipelineCompleted,
    failedEvent: graphPipelineFailed,
    explanationHint: "The background graph pipeline planned, grounded, and either persisted domain graph data or stopped safely.",
    extra: {
      graphNodeCount: pipelinePayload.graphNodeCount,
      graphRelationshipCount: pipelinePayload.graphRelationshipCount
    }
  });

  if (graphPipelineTiming) {
    timings.push(graphPipelineTiming);
  }

  return timings;
}

function countByType(records) {
  return records.reduce((counts, record) => {
    counts[record.type] = (counts[record.type] || 0) + 1;
    return counts;
  }, {});
}

function buildOutcome({ runEvents, selectedTapeEntries, graphPipeline, graphErrorMessage }) {
  const hasChatFailure = runEvents.some((event) => event.type === "chat_request_failed") ||
    selectedTapeEntries.some((entry) => entry.type === "chat_error");
  const answerReturned = runEvents.some((event) => event.type === "chat_answer_returned");
  const previewCreated = selectedTapeEntries.some((entry) => entry.type === "graph_preview");
  const graphUpdateCreated = selectedTapeEntries.some((entry) => entry.type === "graph_update");
  const graphFailed = Boolean(stableString(graphErrorMessage)) ||
    runEvents.some((event) => event.type === "chat_graph_pipeline_failed" ||
      event.type === "chat_graph_pipeline_deferred_failed");
  const pipelineMode = stableString(graphPipeline?.mode);
  const humanInputNeeded = Boolean(graphPipeline?.humanInputNeeded);
  const graphPersisted = graphUpdateCreated || pipelineMode === "persist_graph" ||
    Boolean(stableString(graphPipeline?.graphAnchorId));

  let outcome = "unknown";

  if (hasChatFailure) {
    outcome = "chat_failed";
  } else if (graphFailed && answerReturned) {
    outcome = "answer_returned_graph_failed";
  } else if (humanInputNeeded || pipelineMode === "needs_human_input") {
    outcome = "needs_human_input";
  } else if (graphPersisted) {
    outcome = "answer_returned_graph_persisted";
  } else if (pipelineMode === "answer_only") {
    outcome = "answer_only";
  } else if (previewCreated && answerReturned) {
    outcome = "answer_returned_preview_only";
  } else if (answerReturned) {
    outcome = "answer_returned";
  }

  return {
    outcome,
    flags: {
      answerReturned,
      previewCreated,
      graphUpdateCreated,
      graphFailed,
      humanInputNeeded,
      graphPersisted
    }
  };
}

function measureJsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function buildOperationalRunRecord({
  requestId,
  threadId,
  prompt,
  assistantText,
  responseId,
  graphPipeline,
  graphPending,
  graphErrorMessage,
  runEvents,
  selectedTapeEntries
}) {
  const graphPipelineSummary = summarizeGraphPipeline(graphPipeline);
  const { outcome, flags } = buildOutcome({
    runEvents,
    selectedTapeEntries,
    graphPipeline: graphPipelineSummary,
    graphErrorMessage
  });

  return {
    requestId,
    threadId,
    responseId,
    generatedAt: new Date().toISOString(),
    outcome,
    flags,
    prompt: limitText(prompt, MAX_PROMPT_CHARS),
    assistantOutput: limitText(assistantText, MAX_ASSISTANT_CHARS),
    graphPending: Boolean(graphPending),
    graphErrorMessage: limitText(graphErrorMessage, MAX_ERROR_CHARS),
    graphPipeline: graphPipelineSummary,
    eventCounts: {
      runtimeEvents: runEvents.length,
      tapeEntries: selectedTapeEntries.length,
      runtimeEventTypes: countByType(runEvents),
      tapeEntryTypes: countByType(selectedTapeEntries)
    },
    stageTimings: deriveStageTimings(runEvents),
    runtimeEvents: runEvents.map(summarizeRuntimeEvent),
    tapeEntries: selectedTapeEntries.map(summarizeTapeEntry)
  };
}

async function buildReviewPacket({
  requestId,
  threadId,
  prompt,
  assistantText,
  responseId,
  graphPipeline,
  graphPending,
  graphErrorMessage,
  tapeEventIds
}) {
  const [runtimeEvents, tapeEntries] = await Promise.all([
    readRuntimeEvents(300),
    readTapeEntries(300)
  ]);
  const { runEvents, start, end } = findRunWindow(runtimeEvents, requestId);
  const selectedTapeEntries = selectTapeEntries(tapeEntries, {
    threadId,
    requestId,
    tapeEventIds,
    start,
    end
  });

  return {
    reviewPacketVersion: REVIEW_PACKET_VERSION,
    generatedAt: new Date().toISOString(),
    reviewScope: {
      requestId,
      threadId,
      responseId,
      note: "This packet contains compact mechanical facts from structured logs and tape. The reviewer LLM performs qualitative judgment."
    },
    operationalRunRecord: buildOperationalRunRecord({
      requestId,
      threadId,
      prompt,
      assistantText,
      responseId,
      graphPipeline,
      graphPending,
      graphErrorMessage,
      runEvents,
      selectedTapeEntries
    })
  };
}

async function callAssessmentModel({ reviewPacket, telemetryContext }) {
  const envResult = validateEnv();
  const model = resolveOpenAiModel();
  const reasoningStage = REASONING_STAGES.RUN_REVIEW;
  const reasoningConfig = resolveReasoningEffort(reasoningStage);
  const verbosityConfig = resolveVerbosity();
  const startedAt = Date.now();

  if (!envResult.isValid) {
    const errorMessage = "Cannot run quality assessment: missing MusicMesh environment variables.";
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
    "You are the MusicMesh run quality reviewer.",
    "Review only the supplied operationalRunRecord. It contains mechanical facts from structured logs, tape entries, and the visible output.",
    "The deterministic packet facts are authoritative for timings, counts, order, and outcome. Do not invent missing timing values.",
    "Use the LLM for qualitative judgment: whether the answer satisfied the prompt, whether the process was efficient, what anomalies matter, and what would improve the system.",
    "Preserve uncertainty. If a fact is not visible in the packet, say it is unknown.",
    "Do not claim graph persistence, deferred completion, or external actions happened unless the packet proves it.",
    "Do not recommend brittle regex or string parsing for semantic interpretation. Recommend LLM-managed flow or better structured tool contracts instead.",
    "Keep the review concise and operational.",
    "Return JSON only with this shape:",
    "{ summary, outcome, overallScore, answeringThePrompt: { score, rationale }, speedOfCompletion: { score, rationale }, processEfficiency: { score, rationale }, stageTimings: [{ stage, explanation }], bugsOrAnomalies: [{ severity, description, evidence }], suggestedEnhancements: [{ description, evidence }], topFindings: [{ severity, description, evidence }], nextActions: [{ priority, description, evidence }], needsOperatorAttention, requiresFollowUp }.",
    "Scores are integers from 1 to 5, where 5 is excellent."
  ].join("\n");

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
          content: JSON.stringify(reviewPacket, null, 2)
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
      `OpenAI run quality assessment failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`;
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
  await recordLlmCallCompleted({
    telemetryContext,
    stage: reasoningStage,
    model,
    reasoningConfig,
    verbosityConfig,
    startedAt,
    payload
  });

  const parsed = parseJsonObject(getOutputText(payload));

  if (!parsed) {
    throw new Error("OpenAI run quality assessment returned invalid JSON.");
  }

  return parsed;
}

async function runQualityAssessment({
  requestId,
  threadId,
  prompt,
  assistantText,
  responseId,
  graphPipeline,
  graphPending = false,
  graphErrorMessage = "",
  tapeEventIds = []
}) {
  const telemetryContext = {
    requestId,
    threadId,
    turnId: requestId,
    purpose: "run_quality_assessment"
  };
  const reviewStartedAt = new Date().toISOString();
  const reviewStartedMs = Date.now();
  let reviewPacketBytes = null;

  try {
    await appendRuntimeEvent({
      id: createId("log"),
      type: "run_quality_assessment_started",
      payload: {
        requestId,
        threadId,
        responseId,
        graphPending: Boolean(graphPending),
        reviewPacketVersion: REVIEW_PACKET_VERSION
      }
    });

    const reviewPacket = await buildReviewPacket({
      requestId,
      threadId,
      prompt,
      assistantText,
      responseId,
      graphPipeline,
      graphPending,
      graphErrorMessage,
      tapeEventIds
    });
    reviewPacketBytes = measureJsonBytes(reviewPacket);
    const rawAssessment = await callAssessmentModel({ reviewPacket, telemetryContext });
    const reviewCompletedAt = new Date().toISOString();
    const assessment = normalizeAssessment(rawAssessment, reviewPacket);
    assessment.stageTimings = appendRunReviewTiming(assessment.stageTimings, {
      startedAt: reviewStartedAt,
      completedAt: reviewCompletedAt,
      reviewPacketBytes
    });
    assessment.needsOperatorAttention = Boolean(
      assessment.needsOperatorAttention ||
        assessment.requiresFollowUp ||
        assessment.bugsOrAnomalies.some((item) => stableString(item.severity).toLowerCase() === "high")
    );

    const tapeEntry = await appendTapeEntry({
      id: createId("evt"),
      type: "run_quality_assessment",
      threadId,
      payload: {
        requestId,
        responseId,
        graphPending: Boolean(graphPending),
        reviewPacketVersion: REVIEW_PACKET_VERSION,
        reviewPacketBytes,
        outcome: assessment.outcome,
        needsOperatorAttention: assessment.needsOperatorAttention,
        assessment
      }
    });

    await appendRuntimeEvent({
      id: createId("log"),
      type: "run_quality_assessment_completed",
      payload: {
        requestId,
        threadId,
        responseId,
        tapeEventId: tapeEntry.id,
        reviewPacketVersion: REVIEW_PACKET_VERSION,
        reviewPacketBytes,
        reviewDurationMs: Date.now() - reviewStartedMs,
        outcome: assessment.outcome,
        overallScore: assessment.overallScore,
        requiresFollowUp: assessment.requiresFollowUp,
        needsOperatorAttention: assessment.needsOperatorAttention,
        stageTimingCount: assessment.stageTimings.length,
        topFindingCount: assessment.topFindings.length,
        nextActionCount: assessment.nextActions.length,
        bugOrAnomalyCount: assessment.bugsOrAnomalies.length,
        suggestedEnhancementCount: assessment.suggestedEnhancements.length
      }
    });

    return assessment;
  } catch (error) {
    await appendRuntimeEvent({
      id: createId("log"),
      type: "run_quality_assessment_failed",
      payload: {
        requestId,
        threadId,
        responseId,
        reviewPacketVersion: REVIEW_PACKET_VERSION,
        reviewPacketBytes,
        reviewDurationMs: Date.now() - reviewStartedMs,
        message: error.message || "Run quality assessment failed."
      }
    });

    return null;
  }
}

function queueRunQualityAssessment(context) {
  runQualityAssessment(context).catch(() => {
    // runQualityAssessment records its own failures. Keep the operator path non-blocking.
  });
}

module.exports = {
  queueRunQualityAssessment,
  runQualityAssessment
};
