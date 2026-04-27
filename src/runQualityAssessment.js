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

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function stableString(value) {
  return typeof value === "string" ? value.trim() : "";
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

function clampScore(value) {
  const score = Number(value);

  if (!Number.isFinite(score)) {
    return null;
  }

  return Math.max(1, Math.min(5, Math.round(score)));
}

function normalizeAssessment(rawAssessment) {
  const assessment = rawAssessment && typeof rawAssessment === "object" ? rawAssessment : {};

  return {
    summary: stableString(assessment.summary),
    overallScore: clampScore(assessment.overallScore),
    answeringThePrompt: normalizeScoredSection(assessment.answeringThePrompt),
    speedOfCompletion: normalizeScoredSection(assessment.speedOfCompletion),
    processEfficiency: normalizeScoredSection(assessment.processEfficiency),
    bugsOrAnomalies: normalizeList(assessment.bugsOrAnomalies),
    suggestedEnhancements: normalizeList(assessment.suggestedEnhancements),
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
        return item.trim();
      }

      if (item && typeof item === "object") {
        return {
          severity: stableString(item.severity),
          description: stableString(item.description || item.issue || item.suggestion),
          evidence: stableString(item.evidence)
        };
      }

      return "";
    })
    .filter((item) => {
      if (typeof item === "string") {
        return Boolean(item);
      }

      return Boolean(item.description || item.evidence || item.severity);
    });
}

function summarizeGraphPipeline(graphPipeline) {
  return {
    mode: graphPipeline?.mode || null,
    graphAnchorId: graphPipeline?.graphAnchorId || null,
    graphAnchorName: graphPipeline?.graphAnchorName || "",
    graphNodeCount: graphPipeline?.graphNodeCount ?? null,
    graphRelationshipCount: graphPipeline?.graphRelationshipCount ?? null,
    humanInputNeeded: graphPipeline?.humanInputNeeded ?? null,
    skippedRelationshipCount: graphPipeline?.persistence?.skippedRelationshipCount ?? null
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

function selectTapeEntries(tapeEntries, { threadId, tapeEventIds, start, end }) {
  const ids = new Set(Array.isArray(tapeEventIds) ? tapeEventIds : []);

  return tapeEntries.filter((entry) => {
    if (ids.has(entry?.id)) {
      return true;
    }

    if (entry?.threadId !== threadId) {
      return false;
    }

    return createdAtInWindow(entry?.createdAt, start, end) &&
      ["user_message", "assistant_message", "graph_preview", "graph_update", "chat_error", "run_quality_assessment"].includes(entry?.type);
  });
}

async function buildRunSnapshot({
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
    tapeEventIds,
    start,
    end
  });

  return {
    requestId,
    threadId,
    prompt,
    assistantOutput: assistantText,
    responseId,
    graphPending: Boolean(graphPending),
    graphErrorMessage: stableString(graphErrorMessage),
    graphPipeline: summarizeGraphPipeline(graphPipeline),
    runtimeEvents: runEvents.map((event) => ({
      type: event.type,
      createdAt: event.createdAt,
      payload: event.payload
    })),
    tapeEntries: selectedTapeEntries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      createdAt: entry.createdAt,
      payload: entry.payload
    }))
  };
}

async function callAssessmentModel({ snapshot, telemetryContext }) {
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
    "Review only the supplied prompt, assistant output, tape entries, and runtime events.",
    "Assess the run in five areas: answering the prompt, speed of completion, process efficiency, bugs or anomalies, and suggested system enhancements.",
    "Preserve uncertainty. If a fact is not visible in the logs or output, say it is unknown.",
    "Do not claim graph persistence, deferred completion, or external actions happened unless the supplied events prove it.",
    "Return JSON only with this shape:",
    "{ summary, overallScore, answeringThePrompt: { score, rationale }, speedOfCompletion: { score, rationale }, processEfficiency: { score, rationale }, bugsOrAnomalies: [{ severity, description, evidence }], suggestedEnhancements: [{ description, evidence }], requiresFollowUp }.",
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
          content: JSON.stringify(snapshot, null, 2)
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

  return normalizeAssessment(parsed);
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

  try {
    await appendRuntimeEvent({
      id: createId("log"),
      type: "run_quality_assessment_started",
      payload: {
        requestId,
        threadId,
        responseId,
        graphPending: Boolean(graphPending)
      }
    });

    const snapshot = await buildRunSnapshot({
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
    const assessment = await callAssessmentModel({ snapshot, telemetryContext });
    const tapeEntry = await appendTapeEntry({
      id: createId("evt"),
      type: "run_quality_assessment",
      threadId,
      payload: {
        requestId,
        responseId,
        graphPending: Boolean(graphPending),
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
        overallScore: assessment.overallScore,
        requiresFollowUp: assessment.requiresFollowUp,
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
