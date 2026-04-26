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
  findGraphProposalSeed,
  getNodeDetail,
  searchGraphSeeds
} = require("./graphDemoRepository");
const {
  applyGraphProposal,
  createGraphProposalFromEntities,
  getProposal,
  listProposals,
  reviewGraphProposal
} = require("./graphProposalService");
const { createAssistantReply, DEFAULT_MODEL } = require("./chatService");

const DEFAULT_PORT = Number(process.env.MUSICMESH_API_PORT || 43101);
const SYSTEM_PROMPT_PATH = path.join(
  process.cwd(),
  "docs",
  "product",
  "MUSICMESH_CHAT_SYSTEM_PROMPT.md"
);
const GRAPH_ENRICHMENT_TOOL = {
  type: "function",
  name: "create_graph_enrichment",
  description:
    "Create a proposed graph enrichment from the current conversation turn. Use for durable entities/relationships worth staging in graph workspace.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      entities: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            type: { type: "string" },
            aliases: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["name"]
        }
      },
      contextNote: { type: "string" },
      traversalDepth: { type: "integer", minimum: 1, maximum: 3 },
      evidenceMode: {
        type: "string",
        enum: ["model_knowledge", "web_search"]
      }
    },
    required: ["entities"]
  }
};

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

    let graphProposalId = null;
    const assistantReply = await createAssistantReply({
      prompt,
      messages,
      threadId,
      systemPromptPath: SYSTEM_PROMPT_PATH,
      tools: [GRAPH_ENRICHMENT_TOOL],
      executeToolCall: async (call) => {
        if (!call || call.name !== "create_graph_enrichment") {
          return {
            status: "ignored",
            reason: "Unsupported tool call."
          };
        }

        const args = parseToolArguments(call.arguments);
        const entities = normalizeToolEntities(args.entities);

        if (entities.length === 0) {
          return {
            status: "skipped",
            reason: "No valid entities supplied."
          };
        }

        const traversalDepth = clampTraversalDepth(args.traversalDepth);
        const evidenceMode = args.evidenceMode === "web_search" ? "web_search" : "model_knowledge";
        const contextNote =
          typeof args.contextNote === "string" && args.contextNote.trim()
            ? args.contextNote.trim()
            : prompt;

        const proposal = await createGraphProposalFromEntities({
          entities,
          context: {
            title: `Chat graph proposal for ${entities
              .slice(0, 3)
              .map((entity) => entity.name)
              .join(", ")}`,
            note: contextNote
          },
          evidenceMode,
          traversalDepth
        });

        graphProposalId = proposal.id;

        return {
          status: "created",
          graphProposalId: proposal.id,
          proposalTitle: proposal.title,
          candidateNodeCount: proposal.candidateNodes?.length || 0,
          candidateRelationshipCount: proposal.candidateRelationships?.length || 0,
          workspacePersistence: proposal.workspacePersistence || null,
          review: proposal.review || null
        };
      }
    });
    const assistantText = graphProposalId
      ? `${assistantReply.text}\n\n---\nGraph enrichment: created proposal ${graphProposalId} (review/apply required before canon).`
      : assistantReply.text;

    const assistantEntry = await appendTapeEntry({
      id: createId("evt"),
      type: "assistant_message",
      threadId,
      payload: {
        responseId: assistantReply.responseId,
        text: assistantText,
        graphProposalId
      }
    });

    sendJson(response, 200, {
      threadId,
      message: assistantText,
      responseId: assistantReply.responseId,
      graphProposalId,
      tapeEventIds: [userEntry.id, assistantEntry.id]
    });

    await appendRuntimeEvent({
      id: createId("log"),
      type: "chat_request_completed",
      payload: {
        requestId,
        threadId,
        responseId: assistantReply.responseId,
        graphProposalId,
        tapeEventIds: [userEntry.id, assistantEntry.id]
      }
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

function parseToolArguments(rawArguments) {
  if (!rawArguments || typeof rawArguments !== "string") {
    return {};
  }

  try {
    return JSON.parse(rawArguments);
  } catch {
    return {};
  }
}

function normalizeToolEntities(entities) {
  if (!Array.isArray(entities)) {
    return [];
  }

  return entities
    .map((entity) => ({
      name: typeof entity?.name === "string" ? entity.name.trim() : "",
      type: typeof entity?.type === "string" ? entity.type.trim() : "",
      aliases: Array.isArray(entity?.aliases)
        ? entity.aliases.filter((alias) => typeof alias === "string" && alias.trim())
        : []
    }))
    .filter((entity) => entity.name);
}

function clampTraversalDepth(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 2;
  }

  const rounded = Math.trunc(numeric);
  return Math.max(1, Math.min(3, rounded));
}

async function handleGraphDemoThreadFocus(request, response) {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    const threadId = stableThreadId(requestUrl.searchParams.get("threadId"));
    const tapeWindowSize = Number(requestUrl.searchParams.get("window") || 200);
    const entries = await readTapeEntries(tapeWindowSize);
    const latestProposalId = findLatestThreadProposalId(entries, threadId);

    if (!latestProposalId) {
      sendJson(response, 200, {
        threadId,
        hasFocus: false,
        graphProposalId: null,
        reason: "No graph proposal found for this thread yet."
      });
      return;
    }

    const directProposalSeed = await findGraphProposalSeed(latestProposalId);
    const candidates = await searchGraphSeeds(latestProposalId, 25);
    const fallbackProposalSeed =
      candidates.find((candidate) => candidate.kind === "GraphProposal") ||
      candidates.find((candidate) => candidate.label === latestProposalId) ||
      candidates[0] ||
      null;
    const focusSeed = directProposalSeed || fallbackProposalSeed;

    if (!focusSeed) {
      sendJson(response, 200, {
        threadId,
        hasFocus: false,
        graphProposalId: latestProposalId,
        reason: "Proposal exists but no focusable graph node was found."
      });
      return;
    }

    const graph = await fetchSeededGraph(focusSeed.id, {
      depth: 2,
      maxNodes: 90,
      maxEdges: 140,
      pathLimit: 180
    });

    sendJson(response, 200, {
      threadId,
      hasFocus: true,
      graphProposalId: latestProposalId,
      focusSeed,
      graph
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

function stableThreadId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "default-thread";
}

function findLatestThreadProposalId(entries, threadId) {
  if (!Array.isArray(entries)) {
    return null;
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry?.threadId !== threadId || entry?.type !== "assistant_message") {
      continue;
    }

    const proposalId = entry?.payload?.graphProposalId;

    if (typeof proposalId === "string" && proposalId.trim()) {
      return proposalId.trim();
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

function handleGraphProposalList(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const limit = Number(requestUrl.searchParams.get("limit") || 50);

  listProposals(limit)
    .then((payload) => {
      sendJson(response, 200, payload);
    })
    .catch((error) => {
      sendJson(response, 500, { error: error.message });
    });
}

async function handleGraphProposalCreate(request, response) {
  try {
    const body = await parseJsonBody(request);
    const proposal = await createGraphProposalFromEntities(body);

    sendJson(response, 200, proposal);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

function handleGraphProposalDetail(response, proposalId) {
  getProposal(proposalId)
    .then((proposal) => {
      sendJson(response, 200, proposal);
    })
    .catch((error) => {
      sendJson(response, 404, { error: error.message });
    });
}

async function handleGraphProposalReview(request, response, proposalId) {
  try {
    const body = await parseJsonBody(request);
    const proposal = await reviewGraphProposal(proposalId, body);

    sendJson(response, 200, proposal);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

async function handleGraphProposalApply(response, proposalId) {
  try {
    const proposal = await applyGraphProposal(proposalId);

    sendJson(response, 200, proposal);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
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

    if (request.method === "GET" && requestUrl.pathname === "/api/graph/proposals") {
      handleGraphProposalList(request, response);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/graph/proposals/from-entities") {
      handleGraphProposalCreate(request, response);
      return;
    }

    if (requestUrl.pathname.startsWith("/api/graph/proposals/")) {
      const proposalPath = requestUrl.pathname.slice("/api/graph/proposals/".length);
      const [proposalId, action] = proposalPath.split("/");
      const decodedProposalId = decodeURIComponent(proposalId || "");

      if (request.method === "GET" && decodedProposalId && !action) {
        handleGraphProposalDetail(response, decodedProposalId);
        return;
      }

      if (request.method === "POST" && decodedProposalId && action === "review") {
        handleGraphProposalReview(request, response, decodedProposalId);
        return;
      }

      if (request.method === "POST" && decodedProposalId && action === "apply") {
        handleGraphProposalApply(response, decodedProposalId);
        return;
      }
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
