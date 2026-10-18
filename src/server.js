const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { getOntology } = require("./domain");
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
const DEFAULT_MODEL = require("./researchRunner").MODEL;

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

async function handleChat(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const action = url.pathname.endsWith('/decision') ? 'decision' : url.pathname.endsWith('/run') ? 'read' : 'advance';
    const body = action === 'read' ? {id:url.searchParams.get('id')} : await parseJsonBody(request);
    const result = await require('./researchApi').researchApi(action,body);
    sendJson(response,result.status,result.body);
  } catch(error) { sendJson(response,400,{error:error.message}); }
}

async function handleGraphDemoThreadFocus(request, response) {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    const threadId = stableThreadId(requestUrl.searchParams.get("threadId"));
    const tapeWindowSize = Number(requestUrl.searchParams.get("window") || 200);
    const requestId = stableString(requestUrl.searchParams.get("requestId"));
    const entries = await readTapeEntries(tapeWindowSize);
      const latestFocus = findLatestThreadGraphFocus(entries, threadId, requestId);

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

function normalizeGraphContextNode(node) {
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
    kind: stableString(node.kind || node.type)
  };
}

function normalizeGraphContext(rawContext) {
  if (!rawContext || typeof rawContext !== "object") {
    return null;
  }

  const currentView = rawContext.currentView && typeof rawContext.currentView === "object"
    ? rawContext.currentView
    : {};
  const nodes = (Array.isArray(currentView.nodes) ? currentView.nodes : [])
    .map(normalizeGraphContextNode)
    .filter(Boolean)
    .slice(0, 80);
  const relationships = (Array.isArray(currentView.relationships)
    ? currentView.relationships
    : []
  )
    .map((relationship) => ({
      source: stableString(relationship?.source),
      sourceLabel: stableString(relationship?.sourceLabel),
      type: stableString(relationship?.type),
      target: stableString(relationship?.target),
      targetLabel: stableString(relationship?.targetLabel)
    }))
    .filter(
      (relationship) =>
        relationship.type &&
        (relationship.source || relationship.sourceLabel) &&
        (relationship.target || relationship.targetLabel)
    )
    .slice(0, 120);

  return {
    intent: stableString(rawContext.intent) || "prompt",
    selectedNode: normalizeGraphContextNode(rawContext.selectedNode),
    currentView: {
      seedNode: normalizeGraphContextNode(currentView.seedNode),
      nodeCount: Number.isFinite(Number(currentView.nodeCount)) ? Number(currentView.nodeCount) : nodes.length,
      relationshipCount: Number.isFinite(Number(currentView.relationshipCount))
        ? Number(currentView.relationshipCount)
        : relationships.length,
      nodes,
      relationships
    }
  };
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

function findLatestThreadGraphFocus(entries, threadId, requestId = "") {
  const threadEntries = newestThreadEntries(entries, threadId);
  const seenRequestIds = new Set();

  function focusFromEntryGroup(entryGroup) {
    const persistedEntry = entryGroup.find((entry) => {
      const anchorId = entry?.payload?.graphAnchorId;

      return typeof anchorId === "string" && anchorId.trim();
    });

    if (persistedEntry) {
      return {
        kind: "persisted",
        id: persistedEntry.payload.graphAnchorId.trim(),
        name:
          typeof persistedEntry?.payload?.graphAnchorName === "string"
            ? persistedEntry.payload.graphAnchorName.trim()
            : ""
      };
    }

    const previewEntry = entryGroup.find(
      (entry) => entry?.type === "graph_preview" && entry?.payload?.graph?.nodes?.length > 0
    );

    if (previewEntry) {
      const graph = previewEntry.payload.graph;
      const previewId = stableString(previewEntry.payload.previewGraphId || graph.seedNode?.id || previewEntry.id);

      return {
        kind: "preview",
        id: previewId,
        name: stableString(graph.seedNode?.label || previewId),
        graph
      };
    }

    return null;
  }

  if (requestId) {
    return focusFromEntryGroup(
      threadEntries.filter((entry) => stableString(entry?.payload?.requestId) === requestId)
    );
  }

  for (const entry of threadEntries) {
    const entryRequestId = stableString(entry?.payload?.requestId);

    if (!entryRequestId || seenRequestIds.has(entryRequestId)) {
      continue;
    }

    seenRequestIds.add(entryRequestId);

    const focus = focusFromEntryGroup(
      threadEntries.filter((candidate) => stableString(candidate?.payload?.requestId) === entryRequestId)
    );

    if (focus) {
      return focus;
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
      presentation: body.presentation === true,
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
      sendJson(response, error.code === "GRAPH_NODE_NOT_FOUND" ? 404 : 500, { error: error.message });
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

    if (request.method === "GET" && requestUrl.pathname === "/api/ontology") {
      sendJson(response, 200, getOntology());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/graph/evidence") {
      const q=requestUrl.searchParams;
      require('./evidenceService').evidenceResponse({kind:q.get('kind'),id:q.get('id'),field:q.get('field')})
        .then(result=>sendJson(response,result.status,result.body));
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

    if ((request.method === "POST" && ["/api/chat", "/api/chat/decision"].includes(requestUrl.pathname)) || (request.method === "GET" && requestUrl.pathname === "/api/chat/run")) {
      if (process.env.MUSICMESH_MAINTENANCE === "true") {
        sendJson(response, 503, { error: "MusicMesh is undergoing maintenance. Please try again shortly." });
        return;
      }
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
