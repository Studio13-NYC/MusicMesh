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
const { resolveChatGraphSyncTimeoutMs } = require("./reasoningConfig");
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

function graphPipelineTimeout(timeoutMs) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        timedOut: true,
        graphPipeline: pendingGraphPipelineResult()
      });
    }, timeoutMs);
  });
}

function waitForGraphPipeline(graphPipelinePromise, timeoutMs) {
  return Promise.race([
    graphPipelinePromise.then((graphPipeline) => ({
      timedOut: false,
      graphPipeline
    })),
    graphPipelineTimeout(timeoutMs)
  ]);
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

async function appendGraphUpdate({ threadId, graphPipeline }) {
  if (!graphPipeline?.graphAnchorId) {
    return null;
  }

  return appendTapeEntry({
    id: createId("evt"),
    type: "graph_update",
    threadId,
    payload: {
      graphAnchorId: graphPipeline.graphAnchorId,
      graphAnchorName: graphPipeline.graphAnchorName,
      graphNodeCount: graphPipeline.graphNodeCount,
      graphRelationshipCount: graphPipeline.graphRelationshipCount,
      graphMode: graphPipeline.mode,
      humanInputNeeded: graphPipeline.humanInputNeeded
    }
  });
}

async function handleChat(request, response) {
  const requestId = createId("req");

  try {
    const body = await parseJsonBody(request);
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
    const graphSyncTimeoutMs = resolveChatGraphSyncTimeoutMs();
    const graphWaitResult = await waitForGraphPipeline(graphPipelinePromise, graphSyncTimeoutMs);
    const graphPipeline = graphWaitResult.graphPipeline;
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
        humanInputNeeded: graphPipeline.humanInputNeeded,
        graphPending: graphWaitResult.timedOut
      }
    });

    sendJson(response, 200, {
      threadId,
      message: assistantText,
      responseId: assistantReply.responseId,
      graphAnchorId: graphPipeline.graphAnchorId,
      graphAnchorName: graphPipeline.graphAnchorName,
      graphNodeCount: graphPipeline.graphNodeCount,
      graphRelationshipCount: graphPipeline.graphRelationshipCount,
      graphMode: graphPipeline.mode,
      humanInputNeeded: graphPipeline.humanInputNeeded,
      graphPending: graphWaitResult.timedOut,
      tapeEventIds: [userEntry.id, assistantEntry.id]
    });

    if (graphWaitResult.timedOut) {
      graphPipelinePromise
        .then(async (deferredGraphPipeline) => {
          await appendGraphUpdate({ threadId, graphPipeline: deferredGraphPipeline });
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
            assistantText,
            responseId: assistantReply.responseId,
            graphPipeline: deferredGraphPipeline,
            graphPending: false,
            tapeEventIds: [userEntry.id, assistantEntry.id]
          });
        })
        .catch(async (error) => {
          await appendGraphPipelineFailed({ requestId, threadId, error, deferred: true });
          queueRunQualityAssessment({
            requestId,
            threadId,
            prompt,
            assistantText,
            responseId: assistantReply.responseId,
            graphPipeline,
            graphPending: false,
            graphErrorMessage: error.message || "Graph pipeline failed.",
            tapeEventIds: [userEntry.id, assistantEntry.id]
          });
        });
    } else {
      await appendGraphPipelineCompleted({
        requestId,
        threadId,
        graphPipeline,
        deferred: false
      });
    }

    await appendRuntimeEvent({
      id: createId("log"),
      type: "chat_request_completed",
      payload: {
        requestId,
        threadId,
        responseId: assistantReply.responseId,
        graphAnchorId: graphPipeline.graphAnchorId,
        graphMode: graphPipeline.mode,
        graphPending: graphWaitResult.timedOut,
        tapeEventIds: [userEntry.id, assistantEntry.id]
      }
    });

    if (!graphWaitResult.timedOut) {
      queueRunQualityAssessment({
        requestId,
        threadId,
        prompt,
        assistantText,
        responseId: assistantReply.responseId,
        graphPipeline,
        graphPending: false,
        tapeEventIds: [userEntry.id, assistantEntry.id]
      });
    }
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
    const latestAnchor = findLatestThreadGraphAnchor(entries, threadId);

    if (!latestAnchor?.id) {
      sendJson(response, 200, {
        threadId,
        hasFocus: false,
        graphAnchorId: null,
        reason: "No graph anchor found for this thread yet."
      });
      return;
    }

    const graph = await fetchSeededGraph(latestAnchor.id, {
      depth: 2,
      maxNodes: 90,
      maxEdges: 140,
      pathLimit: 180
    });

    sendJson(response, 200, {
      threadId,
      hasFocus: true,
      graphAnchorId: latestAnchor.id,
      focusSeed: {
        id: latestAnchor.id,
        label: latestAnchor.name || graph.seedNode?.label || latestAnchor.id
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

function findLatestThreadGraphAnchor(entries, threadId) {
  if (!Array.isArray(entries)) {
    return null;
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry?.threadId !== threadId) {
      continue;
    }

    const anchorId = entry?.payload?.graphAnchorId;

    if (typeof anchorId === "string" && anchorId.trim()) {
      return {
        id: anchorId.trim(),
        name:
          typeof entry?.payload?.graphAnchorName === "string"
            ? entry.payload.graphAnchorName.trim()
            : ""
      };
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
