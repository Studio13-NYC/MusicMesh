const path = require("path");
const crypto = require("crypto");
const { app } = require("@azure/functions");
const {
  appendRuntimeEvent,
  appendTapeEntry,
  getRuntimeLogPathLabel,
  getTapePathLabel,
  readRuntimeEvents,
  readTapeEntries
} = require("../../shared/activityStore");
const { createAssistantReply } = require("../../shared/chatService");
const { runChatTurnPipeline } = require("../../shared/graphChatOrchestrator");
const { queueGraphPreview } = require("../../shared/graphPreview");
const { queueRunQualityAssessment } = require("../../shared/runQualityAssessment");

const SYSTEM_PROMPT_PATH = path.join(__dirname, "..", "..", "content", "MUSICMESH_CHAT_SYSTEM_PROMPT.md");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function jsonResponse(status, payload) {
  return {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    jsonBody: payload
  };
}

function stableClientRequestId(value) {
  const requestId = typeof value === "string" ? value.trim() : "";

  if (/^req-[a-zA-Z0-9-]{8,80}$/.test(requestId)) {
    return requestId;
  }

  return "";
}

function pendingGraphPipelineResult() {
  return {
    mode: "pending",
    graphAnchorId: null,
    graphAnchorName: "",
    graphNodeCount: 0,
    graphRelationshipCount: 0,
    humanInputNeeded: false,
    humanMessage: "",
    persistence: null
  };
}

async function appendGraphPipelineCompleted({
  requestId,
  threadId,
  graphPipeline,
  deferred
}) {
  await appendRuntimeEvent({
    id: createId("log"),
    type: deferred ? "chat_graph_pipeline_deferred_completed" : "chat_graph_pipeline_completed",
    payload: {
      requestId,
      threadId,
      mode: graphPipeline.mode,
      graphAnchorId: graphPipeline.graphAnchorId,
      graphAnchorName: graphPipeline.graphAnchorName,
      graphNodeCount: graphPipeline.graphNodeCount,
      graphRelationshipCount: graphPipeline.graphRelationshipCount,
      humanInputNeeded: graphPipeline.humanInputNeeded,
      skippedRelationshipCount: graphPipeline.persistence?.skippedRelationshipCount || 0
    }
  });
}

async function appendGraphPipelineFailed({ requestId, threadId, error, deferred }) {
  await appendRuntimeEvent({
    id: createId("log"),
    type: deferred ? "chat_graph_pipeline_deferred_failed" : "chat_graph_pipeline_failed",
    payload: {
      requestId,
      threadId,
      message: error.message || "Graph pipeline failed."
    }
  });
}

async function appendGraphUpdate({ threadId, graphPipeline, requestId, responseId }) {
  if (!graphPipeline?.graphAnchorId) {
    return null;
  }

  return appendTapeEntry({
    id: createId("evt"),
    type: "graph_update",
    threadId,
    payload: {
      requestId,
      responseId,
      graphAnchorId: graphPipeline.graphAnchorId,
      graphAnchorName: graphPipeline.graphAnchorName,
      graphNodeCount: graphPipeline.graphNodeCount,
      graphRelationshipCount: graphPipeline.graphRelationshipCount,
      graphMode: graphPipeline.mode,
      humanInputNeeded: graphPipeline.humanInputNeeded
    }
  });
}

app.http("chat", {
  methods: ["POST", "OPTIONS"],
  route: "chat",
  authLevel: "anonymous",
  handler: async (request) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders };
    }

    let body;
    try {
      const raw = await request.text();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return jsonResponse(400, { error: "Invalid JSON body." });
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const threadId = typeof body.threadId === "string" ? body.threadId : "default-thread";
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const requestId = stableClientRequestId(body.clientRequestId) || createId("req");

    if (!prompt) {
      await appendRuntimeEvent({
        id: createId("log"),
        type: "chat_request_rejected",
        payload: {
          requestId,
          threadId,
          reason: "Missing prompt"
        }
      });
      return jsonResponse(400, { error: "Missing prompt." });
    }

    try {
      await appendRuntimeEvent({
        id: createId("log"),
        type: "chat_request_received",
        payload: {
          requestId,
          threadId,
          prompt,
          messageCount: messages.length,
          systemPromptPath: SYSTEM_PROMPT_PATH
        }
      });

      const userEntry = await appendTapeEntry({
        id: createId("evt"),
        type: "user_message",
        threadId,
        payload: {
          requestId,
          prompt,
          messageCount: messages.length
        }
      });

      const assistantReply = await createAssistantReply({
        prompt,
        messages,
        threadId,
        systemPromptPath: SYSTEM_PROMPT_PATH,
        telemetryContext: {
          requestId,
          threadId,
          turnId: requestId
        }
      });

      const assistantEntry = await appendTapeEntry({
        id: createId("evt"),
        type: "assistant_message",
        threadId,
        payload: {
          requestId,
          responseId: assistantReply.responseId,
          text: assistantReply.text,
          graphAnchorId: null,
          graphAnchorName: "",
          graphNodeCount: 0,
          graphRelationshipCount: 0,
          graphMode: "pending",
          humanInputNeeded: false,
          graphPending: true,
          previewGraphPending: true
        }
      });

      await appendRuntimeEvent({
        id: createId("log"),
        type: "chat_answer_returned",
        payload: {
          requestId,
          threadId,
          responseId: assistantReply.responseId,
          tapeEventIds: [userEntry.id, assistantEntry.id]
        }
      });

      await appendRuntimeEvent({
        id: createId("log"),
        type: "chat_graph_pipeline_started",
        payload: {
          requestId,
          threadId,
          responseId: assistantReply.responseId
        }
      });

      const graphPipelinePromise = runChatTurnPipeline({
        prompt,
        messages,
        assistantText: assistantReply.text,
        threadId,
        turnId: requestId,
        telemetryContext: {
          requestId,
          threadId,
          turnId: requestId
        }
      });

      queueGraphPreview({
        requestId,
        threadId,
        prompt,
        assistantText: assistantReply.text,
        responseId: assistantReply.responseId
      });

      graphPipelinePromise
        .then(async (deferredGraphPipeline) => {
          const graphUpdateEntry = await appendGraphUpdate({
            threadId,
            graphPipeline: deferredGraphPipeline,
            requestId,
            responseId: assistantReply.responseId
          });
          await appendGraphPipelineCompleted({
            requestId,
            threadId,
            graphPipeline: deferredGraphPipeline,
            deferred: true
          });
          queueRunQualityAssessment({
            requestId,
            threadId,
            prompt,
            assistantText: assistantReply.text,
            responseId: assistantReply.responseId,
            graphPipeline: deferredGraphPipeline,
            graphPending: false,
            tapeEventIds: [userEntry.id, assistantEntry.id, graphUpdateEntry?.id].filter(Boolean)
          });
        })
        .catch(async (error) => {
          await appendGraphPipelineFailed({ requestId, threadId, error, deferred: true });
          queueRunQualityAssessment({
            requestId,
            threadId,
            prompt,
            assistantText: assistantReply.text,
            responseId: assistantReply.responseId,
            graphPipeline: pendingGraphPipelineResult(),
            graphPending: false,
            graphErrorMessage: error.message || "Graph pipeline failed.",
            tapeEventIds: [userEntry.id, assistantEntry.id]
          });
        });

      await appendRuntimeEvent({
        id: createId("log"),
        type: "chat_request_completed",
        payload: {
          requestId,
          threadId,
          responseId: assistantReply.responseId,
          graphAnchorId: null,
          graphMode: "pending",
          graphPending: true,
          previewGraphPending: true,
          tapeEventIds: [userEntry.id, assistantEntry.id]
        }
      });

      return jsonResponse(200, {
        requestId,
        threadId,
        message: assistantReply.text,
        responseId: assistantReply.responseId,
        graphAnchorId: null,
        graphAnchorName: "",
        graphNodeCount: 0,
        graphRelationshipCount: 0,
        graphMode: "pending",
        humanInputNeeded: false,
        graphPending: true,
        previewGraphPending: true,
        tapeEventIds: [userEntry.id, assistantEntry.id]
      });
    } catch (error) {
      await appendTapeEntry({
        id: createId("evt"),
        type: "chat_error",
        threadId,
        payload: {
          message: error.message || "Chat request failed."
        }
      });

      await appendRuntimeEvent({
        id: createId("log"),
        type: "chat_request_failed",
        payload: {
          requestId,
          threadId,
          message: error.message || "Chat request failed."
        }
      });

      return jsonResponse(500, { error: error.message || "Chat request failed." });
    }
  }
});

app.http("chatTape", {
  methods: ["GET", "OPTIONS"],
  route: "chat/tape",
  authLevel: "anonymous",
  handler: async (request) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders };
    }

    const requestUrl = new URL(request.url);
    const limit = Number(requestUrl.searchParams.get("limit") || 100);
    const entries = await readTapeEntries(limit);

    return jsonResponse(200, {
      tapePath: getTapePathLabel(),
      entries
    });
  }
});

app.http("runtimeLogs", {
  methods: ["GET", "OPTIONS"],
  route: "chat/runtime",
  authLevel: "anonymous",
  handler: async (request) => {
    if (request.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders };
    }

    const requestUrl = new URL(request.url);
    const limit = Number(requestUrl.searchParams.get("limit") || 100);
    const events = await readRuntimeEvents(limit);

    return jsonResponse(200, {
      runtimeLogPath: getRuntimeLogPathLabel(),
      events
    });
  }
});
