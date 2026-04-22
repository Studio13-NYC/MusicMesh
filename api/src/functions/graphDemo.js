const { app } = require("@azure/functions");
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
