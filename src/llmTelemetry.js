const crypto = require("crypto");
const { appendRuntimeEvent } = require("./activityStore");

function createLogId() {
  return `log-${crypto.randomUUID()}`;
}

function extractUsage(payload) {
  const usage = payload?.usage || {};
  const outputDetails = usage.output_tokens_details || {};

  return {
    inputTokens: Number.isFinite(Number(usage.input_tokens))
      ? Number(usage.input_tokens)
      : null,
    outputTokens: Number.isFinite(Number(usage.output_tokens))
      ? Number(usage.output_tokens)
      : null,
    reasoningTokens: Number.isFinite(Number(outputDetails.reasoning_tokens))
      ? Number(outputDetails.reasoning_tokens)
      : null,
    totalTokens: Number.isFinite(Number(usage.total_tokens))
      ? Number(usage.total_tokens)
      : null
  };
}

function basePayload({
  telemetryContext = {},
  stage,
  model,
  reasoningConfig,
  verbosityConfig,
  durationMs
}) {
  return {
    requestId: telemetryContext.requestId || null,
    threadId: telemetryContext.threadId || null,
    turnId: telemetryContext.turnId || telemetryContext.requestId || null,
    purpose: telemetryContext.purpose || stage,
    stage,
    model,
    reasoningEffortRequested: reasoningConfig?.effort || null,
    reasoningEffortSource: reasoningConfig?.source || null,
    verbosityRequested: verbosityConfig?.verbosity || null,
    verbositySource: verbosityConfig?.source || null,
    durationMs,
    graphMode: telemetryContext.graphMode || null,
    graphNodeCount: telemetryContext.graphNodeCount ?? null,
    graphRelationshipCount: telemetryContext.graphRelationshipCount ?? null,
    humanInputNeeded: telemetryContext.humanInputNeeded ?? null
  };
}

async function recordLlmCallCompleted({
  telemetryContext,
  stage,
  model,
  reasoningConfig,
  verbosityConfig,
  startedAt,
  payload
}) {
  try {
    await appendRuntimeEvent({
      id: createLogId(),
      type: "llm_call_completed",
      payload: {
        ...basePayload({
          telemetryContext,
          stage,
          model,
          reasoningConfig,
          verbosityConfig,
          durationMs: Date.now() - startedAt
        }),
        responseId: payload?.id || null,
        status: payload?.status || "completed",
        ...extractUsage(payload)
      }
    });
  } catch {
    // Telemetry must never break the operator path.
  }
}

async function recordLlmCallFailed({
  telemetryContext,
  stage,
  model,
  reasoningConfig,
  verbosityConfig,
  startedAt,
  responseId = null,
  status = "failed",
  errorCode = null,
  errorMessage,
  payload = null
}) {
  try {
    await appendRuntimeEvent({
      id: createLogId(),
      type: "llm_call_failed",
      payload: {
        ...basePayload({
          telemetryContext,
          stage,
          model,
          reasoningConfig,
          verbosityConfig,
          durationMs: Date.now() - startedAt
        }),
        responseId,
        status,
        errorCode,
        errorMessage,
        ...extractUsage(payload)
      }
    });
  } catch {
    // Telemetry must never break the operator path.
  }
}

module.exports = {
  recordLlmCallCompleted,
  recordLlmCallFailed
};
