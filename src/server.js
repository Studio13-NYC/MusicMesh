const http = require("http");
const crypto = require("crypto");
const path = require("path");
const {
  appendRuntimeEvent,
  appendTapeEntry,
  getRuntimeLogPathLabel,
  getTapePathLabel,
  readRuntimeEvents,
  readTapeEntries
} = require("./activityStore");
const { validateEnv } = require("./env");
const {
  expandGraphNode,
  fetchSeededGraph,
  getNodeDetail,
  searchGraphSeeds
} = require("./graphDemoRepository");
const { runChatTurnPipeline } = require("./graphChatOrchestrator");
const { createAssistantReply, DEFAULT_MODEL } = require("./chatService");
const { queueGraphPreview } = require("./graphPreview");
const { queueRunQualityAssessment } = require("./runQualityAssessment");

const DEFAULT_PORT = Number(process.env.MUSICMESH_API_PORT || 43101);
const SYSTEM_PROMPT_PATH = path.join(
  process.cwd(),
  "docs",
  "product",
  "MUSICMESH_CHAT_SYSTEM_PROMPT.md"
);

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  response.end(JSON.stringify(payload));
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk.toString("utf8");
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
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

function stableClientRequestId(value) {
  const requestId = typeof value === "string" ? value.trim() : "";

  if (/^req-[a-zA-Z0-9-]{8,80}$/.test(requestId)) {
    return requestId;
  }

  return "";
}

async function handleChat(request, response) {
  let requestId = createId("req");

  try {
    const body = await parseJsonBody(request);
    requestId = stableClientRequestId(body.clientRequestId) || requestId;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const threadId = typeof body.threadId === "string" ? body.threadId : "default-thread";
    const messages = Array.isArray(body.messages) ? body.messages : [];

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
      sendJson(response, 400, { error: "Missing prompt." });
      return;
    }

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

    sendJson(response, 200, {
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
  } catch (error) {
    await appendTapeEntry({
      id: createId("evt"),
      type: "chat_error",
      threadId: "default-thread",
      payload: {
        message: error.message
      }
    });

    await appendRuntimeEvent({
      id: createId("log"),
      type: "chat_request_failed",
      payload: {
        requestId,
        message: error.message
      }
    });

    sendJson(response, 500, { error: error.message });
  }
}

async function handleGraphDemoThreadFocus(request, response) {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    const threadId = stableThreadId(requestUrl.searchParams.get("threadId"));
    const tapeWindowSize = Number(requestUrl.searchParams.get("window") || 200);
    const entries = await readTapeEntries(tapeWindowSize);
      const latestFocus = findLatestThreadGraphFocus(entries, threadId);

      if (!latestFocus) {
        sendJson(response, 200, {
          threadId,
          hasFocus: false,
          graphAnchorId: null,
        reason: "No graph anchor found for this thread yet."
      });
        return;
      }

      if (latestFocus.kind === "preview") {
        sendJson(response, 200, {
          threadId,
          hasFocus: true,
          focusKind: "preview",
          graphAnchorId: latestFocus.id,
          focusSeed: {
            id: latestFocus.id,
            label: latestFocus.name || latestFocus.graph?.seedNode?.label || latestFocus.id
          },
          graph: latestFocus.graph
        });
        return;
      }

      const graph = await fetchSeededGraph(latestFocus.id, {
        depth: 2,
        maxNodes: 90,
        maxEdges: 140,
      pathLimit: 180
    });

    sendJson(response, 200, {
        threadId,
        hasFocus: true,
        focusKind: "persisted",
        graphAnchorId: latestFocus.id,
        focusSeed: {
          id: latestFocus.id,
          label: latestFocus.name || graph.seedNode?.label || latestFocus.id
        },
        graph
      });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

function stableThreadId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "default-thread";
}

function stableString(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function timestampValue(entry) {
  const parsed = Date.parse(entry?.createdAt || "");

  return Number.isFinite(parsed) ? parsed : 0;
}

function newestThreadEntries(entries, threadId) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry?.threadId === threadId)
    .sort((left, right) => {
      const timeDifference = timestampValue(right.entry) - timestampValue(left.entry);

      if (timeDifference !== 0) {
        return timeDifference;
      }

      return right.index - left.index;
    })
    .map(({ entry }) => entry);
}

function findLatestThreadGraphFocus(entries, threadId) {
  for (const entry of newestThreadEntries(entries, threadId)) {
    if (entry?.type === "graph_preview" && entry?.payload?.graph?.nodes?.length > 0) {
      const graph = entry.payload.graph;
      const previewId = stableString(entry.payload.previewGraphId || graph.seedNode?.id || entry.id);

      return {
        kind: "preview",
        id: previewId,
        name: stableString(graph.seedNode?.label || previewId),
        graph
      };
    }

    const anchorId = entry?.payload?.graphAnchorId;

    if (typeof anchorId === "string" && anchorId.trim()) {
      return {
        kind: "persisted",
        id: anchorId.trim(),
        name:
          typeof entry?.payload?.graphAnchorName === "string"
            ? entry.payload.graphAnchorName.trim()
            : ""
      };
    }

    if (entry?.type === "assistant_message" && entry?.payload?.graphPending) {
      return null;
    }
  }

  return null;
}

function handleTape(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const limitParam = Number(requestUrl.searchParams.get("limit") || 100);
  readTapeEntries(limitParam)
    .then((entries) => {
      sendJson(response, 200, {
        tapePath: getTapePathLabel(),
        entries
      });
    })
    .catch((error) => {
      sendJson(response, 500, { error: error.message });
    });
}

function handleRuntimeLog(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const limitParam = Number(requestUrl.searchParams.get("limit") || 100);
  readRuntimeEvents(limitParam)
    .then((events) => {
      sendJson(response, 200, {
        runtimeLogPath: getRuntimeLogPathLabel(),
        events
      });
    })
    .catch((error) => {
      sendJson(response, 500, { error: error.message });
    });
}

function handleGraphDemoSearch(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const query = requestUrl.searchParams.get("q") || "";
  const limit = Number(requestUrl.searchParams.get("limit") || 8);

  searchGraphSeeds(query, limit)
    .then((results) => {
      sendJson(response, 200, {
        query,
        results
      });
    })
    .catch((error) => {
      sendJson(response, 500, { error: error.message });
    });
}

async function handleGraphDemoSubgraph(request, response) {
  try {
    const body = await parseJsonBody(request);
    const payload = await fetchSeededGraph(body.seedId, {
      depth: body.depth,
      maxNodes: body.maxNodes,
      maxEdges: body.maxEdges,
      pathLimit: body.pathLimit
    });

    sendJson(response, 200, payload);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

async function handleGraphDemoExpand(request, response) {
  try {
    const body = await parseJsonBody(request);
    const payload = await expandGraphNode(body.nodeId, {
      currentNodeIds: body.currentNodeIds,
      currentEdgeIds: body.currentEdgeIds,
      depth: body.depth,
      maxNodes: body.maxNodes,
      maxEdges: body.maxEdges,
      pathLimit: body.pathLimit
    });

    sendJson(response, 200, payload);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

function handleGraphDemoNodeDetail(request, response, nodeId) {
  getNodeDetail(nodeId)
    .then((detail) => {
      sendJson(response, 200, detail);
    })
    .catch((error) => {
      sendJson(response, 500, { error: error.message });
    });
}

function startServer(port = DEFAULT_PORT) {
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
      });
      response.end();
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        model: DEFAULT_MODEL,
        tapePath: getTapePathLabel(),
        runtimeLogPath: getRuntimeLogPathLabel(),
        systemPromptPath: SYSTEM_PROMPT_PATH
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/chat/tape") {
      handleTape(request, response);
      return;
    }

    if (
      request.method === "GET" &&
      (requestUrl.pathname === "/api/runtime/logs" ||
        requestUrl.pathname === "/api/chat/runtime")
    ) {
      handleRuntimeLog(request, response);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/graph-demo/search") {
      handleGraphDemoSearch(request, response);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/graph-demo/thread-focus") {
      handleGraphDemoThreadFocus(request, response);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/graph-demo/subgraph") {
      handleGraphDemoSubgraph(request, response);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/graph-demo/expand") {
      handleGraphDemoExpand(request, response);
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname.startsWith("/api/graph-demo/node/")
    ) {
      const nodeId = decodeURIComponent(
        requestUrl.pathname.slice("/api/graph-demo/node/".length)
      );
      handleGraphDemoNodeDetail(request, response, nodeId);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/chat") {
      handleChat(request, response);
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`MusicMesh API listening on http://127.0.0.1:${port}`);
    console.log(`Conversation tape: ${getTapePathLabel()}`);
  });

  return server;
}

module.exports = {
  startServer
};
