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
    const requestId = createId("req");

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

      await appendRuntimeEvent({
        id: createId("log"),
        type: "chat_graph_pipeline_started",
        payload: {
          requestId,
          threadId,
          responseId: assistantReply.responseId
        }
      });

      const graphPipeline = await runChatTurnPipeline({
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
      const assistantText = graphPipeline.humanInputNeeded && graphPipeline.humanMessage
        ? `${assistantReply.text}\n\n${graphPipeline.humanMessage}`
        : assistantReply.text;

      const assistantEntry = await appendTapeEntry({
        id: createId("evt"),
        type: "assistant_message",
        threadId,
        payload: {
          responseId: assistantReply.responseId,
          text: assistantText,
          graphAnchorId: graphPipeline.graphAnchorId,
          graphAnchorName: graphPipeline.graphAnchorName,
          graphNodeCount: graphPipeline.graphNodeCount,
          graphRelationshipCount: graphPipeline.graphRelationshipCount,
          graphMode: graphPipeline.mode,
          humanInputNeeded: graphPipeline.humanInputNeeded
        }
      });

      await appendRuntimeEvent({
        id: createId("log"),
        type: "chat_graph_pipeline_completed",
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

      await appendRuntimeEvent({
        id: createId("log"),
        type: "chat_request_completed",
        payload: {
          requestId,
          threadId,
          responseId: assistantReply.responseId,
          graphAnchorId: graphPipeline.graphAnchorId,
          graphMode: graphPipeline.mode,
          tapeEventIds: [userEntry.id, assistantEntry.id]
        }
      });

      return jsonResponse(200, {
        threadId,
        message: assistantText,
        responseId: assistantReply.responseId,
        graphAnchorId: graphPipeline.graphAnchorId,
        graphAnchorName: graphPipeline.graphAnchorName,
        graphNodeCount: graphPipeline.graphNodeCount,
        graphRelationshipCount: graphPipeline.graphRelationshipCount,
        graphMode: graphPipeline.mode,
        humanInputNeeded: graphPipeline.humanInputNeeded,
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
