const { app } = require("@azure/functions");
const {
  applyGraphProposal,
  createGraphProposalFromEntities,
  getProposal,
  listProposals,
  reviewGraphProposal
} = require("../../shared/graphProposalService");

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

app.http("graphProposalList", {
  methods: ["GET", "OPTIONS"],
  route: "graph/proposals",
  authLevel: "anonymous",
  handler: async (request) => {
    const optionsResponse = handleOptions(request);

    if (optionsResponse) {
      return optionsResponse;
    }

    try {
      const requestUrl = new URL(request.url);
      const payload = await listProposals(Number(requestUrl.searchParams.get("limit") || 50));
      return jsonResponse(200, payload);
    } catch (error) {
      return jsonResponse(500, { error: error.message || "Graph proposal list failed." });
    }
  }
});

app.http("graphProposalCreateFromEntities", {
  methods: ["POST", "OPTIONS"],
  route: "graph/proposals/from-entities",
  authLevel: "anonymous",
  handler: async (request) => {
    const optionsResponse = handleOptions(request);

    if (optionsResponse) {
      return optionsResponse;
    }

    try {
      const body = await parseJsonBody(request);
      const proposal = await createGraphProposalFromEntities(body);
      return jsonResponse(200, proposal);
    } catch (error) {
      const status = error.message === "Invalid JSON body." ? 400 : 500;
      return jsonResponse(status, { error: error.message || "Graph proposal creation failed." });
    }
  }
});

app.http("graphProposalDetail", {
  methods: ["GET", "OPTIONS"],
  route: "graph/proposals/{id}",
  authLevel: "anonymous",
  handler: async (request) => {
    const optionsResponse = handleOptions(request);

    if (optionsResponse) {
      return optionsResponse;
    }

    try {
      const proposal = await getProposal(request.params.id);
      return jsonResponse(200, proposal);
    } catch (error) {
      return jsonResponse(404, { error: error.message || "Graph proposal not found." });
    }
  }
});

app.http("graphProposalReview", {
  methods: ["POST", "OPTIONS"],
  route: "graph/proposals/{id}/review",
  authLevel: "anonymous",
  handler: async (request) => {
    const optionsResponse = handleOptions(request);

    if (optionsResponse) {
      return optionsResponse;
    }

    try {
      const body = await parseJsonBody(request);
      const proposal = await reviewGraphProposal(request.params.id, body);
      return jsonResponse(200, proposal);
    } catch (error) {
      const status = error.message === "Invalid JSON body." ? 400 : 500;
      return jsonResponse(status, { error: error.message || "Graph proposal review failed." });
    }
  }
});

app.http("graphProposalApply", {
  methods: ["POST", "OPTIONS"],
  route: "graph/proposals/{id}/apply",
  authLevel: "anonymous",
  handler: async (request) => {
    const optionsResponse = handleOptions(request);

    if (optionsResponse) {
      return optionsResponse;
    }

    try {
      const proposal = await applyGraphProposal(request.params.id);
      return jsonResponse(200, proposal);
    } catch (error) {
      return jsonResponse(500, { error: error.message || "Graph proposal apply failed." });
    }
  }
});
