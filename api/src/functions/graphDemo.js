const { app } = require("@azure/functions");
const { readTapeEntries } = require("../../shared/activityStore");
const {
  expandGraphNode,
  fetchSeededGraph,
  getNodeDetail,
  searchGraphSeeds
} = require("../../shared/graphDemoRepository");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

function jsonResponse(status, payload) {
  return {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    jsonBody: payload
  };
}

async function parseJsonBody(request) {
  try {
    const raw = await request.text();
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function handleOptions(request) {
  if (request.method === "OPTIONS") {
    return { status: 204, headers: corsHeaders };
  }

  return null;
}

app.http("graphDemoSearch", {
  methods: ["GET", "OPTIONS"],
  route: "graph-demo/search",
  authLevel: "anonymous",
  handler: async (request) => {
    const optionsResponse = handleOptions(request);

    if (optionsResponse) {
      return optionsResponse;
    }

    try {
      const requestUrl = new URL(request.url);
      const results = await searchGraphSeeds(
        requestUrl.searchParams.get("q") || "",
        Number(requestUrl.searchParams.get("limit") || 8)
      );

      return jsonResponse(200, { results });
    } catch (error) {
      return jsonResponse(500, { error: error.message || "Graph demo search failed." });
    }
  }
});

app.http("graphDemoThreadFocus", {
  methods: ["GET", "OPTIONS"],
  route: "graph-demo/thread-focus",
  authLevel: "anonymous",
  handler: async (request) => {
    const optionsResponse = handleOptions(request);

    if (optionsResponse) {
      return optionsResponse;
    }

    try {
      const requestUrl = new URL(request.url);
      const threadId = stableThreadId(requestUrl.searchParams.get("threadId"));
      const tapeWindowSize = Number(requestUrl.searchParams.get("window") || 200);
      const entries = await readTapeEntries(tapeWindowSize);
      const latestFocus = findLatestThreadGraphFocus(entries, threadId);

      if (!latestFocus) {
        return jsonResponse(200, {
          threadId,
          hasFocus: false,
          graphAnchorId: null,
          reason: "No graph anchor found for this thread yet."
        });
      }

      if (latestFocus.kind === "preview") {
        return jsonResponse(200, {
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
      }

      const graph = await fetchSeededGraph(latestFocus.id, {
        depth: 2,
        maxNodes: 90,
        maxEdges: 140,
        pathLimit: 180
      });

      return jsonResponse(200, {
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
      return jsonResponse(500, { error: error.message || "Graph demo thread focus failed." });
    }
  }
});

app.http("graphDemoSubgraph", {
  methods: ["POST", "OPTIONS"],
  route: "graph-demo/subgraph",
  authLevel: "anonymous",
  handler: async (request) => {
    const optionsResponse = handleOptions(request);

    if (optionsResponse) {
      return optionsResponse;
    }

    try {
      const body = await parseJsonBody(request);
      const payload = await fetchSeededGraph(body.seedId, body);
      return jsonResponse(200, payload);
    } catch (error) {
      const status = error.message === "Invalid JSON body." ? 400 : 500;
      return jsonResponse(status, { error: error.message || "Graph demo subgraph failed." });
    }
  }
});

app.http("graphDemoExpand", {
  methods: ["POST", "OPTIONS"],
  route: "graph-demo/expand",
  authLevel: "anonymous",
  handler: async (request) => {
    const optionsResponse = handleOptions(request);

    if (optionsResponse) {
      return optionsResponse;
    }

    try {
      const body = await parseJsonBody(request);
      const payload = await expandGraphNode(body.nodeId, body);
      return jsonResponse(200, payload);
    } catch (error) {
      const status = error.message === "Invalid JSON body." ? 400 : 500;
      return jsonResponse(status, { error: error.message || "Graph demo expand failed." });
    }
  }
});

app.http("graphDemoNodeDetail", {
  methods: ["GET", "OPTIONS"],
  route: "graph-demo/node/{id}",
  authLevel: "anonymous",
  handler: async (request) => {
    const optionsResponse = handleOptions(request);

    if (optionsResponse) {
      return optionsResponse;
    }

    try {
      const payload = await getNodeDetail(request.params.id);
      return jsonResponse(200, payload);
    } catch (error) {
      return jsonResponse(500, { error: error.message || "Graph demo node detail failed." });
    }
  }
});

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

function findLatestThreadGraphFocus(entries, threadId) {
  if (!Array.isArray(entries)) {
    return null;
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry?.threadId !== threadId) {
      continue;
    }

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
