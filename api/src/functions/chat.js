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
const { createGraphProposalFromEntities } = require("../../shared/graphProposalService");

const SYSTEM_PROMPT_PATH = path.join(__dirname, "..", "..", "content", "MUSICMESH_CHAT_SYSTEM_PROMPT.md");
const GRAPH_ENRICHMENT_TOOL = {
  type: "function",
  name: "create_graph_enrichment",
  description:
    "Create a proposed graph enrichment from the current conversation turn. Use for durable entities/relationships worth staging in graph workspace. Use reasoning to supply resolved music entities, not task phrases or raw search questions.",
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
              status: "needs_human_input",
              reason: "No graph entities were identified from the model tool arguments.",
              promptForHuman:
                "I could not identify concrete graph entities to stage. Ask the user whether to retry with a narrower list, provide explicit entities, or continue without graph persistence."
            };
          }

          const traversalDepth = clampTraversalDepth(args.traversalDepth);
          const evidenceMode = args.evidenceMode === "web_search" ? "web_search" : "model_knowledge";
          const contextNote =
            typeof args.contextNote === "string" && args.contextNote.trim()
              ? args.contextNote.trim()
              : prompt;

          let proposal;

          try {
            proposal = await createGraphProposalFromEntities({
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
          } catch (error) {
            return {
              status: "needs_human_input",
              reason: error.message || "Graph proposal generation failed.",
              entities,
              promptForHuman:
                "Graph proposal generation hit a blocker. Ask the user whether to retry, narrow the entity list, inspect canon first, or proceed without creating a proposal."
            };
          }

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

      return jsonResponse(200, {
        threadId,
        message: assistantText,
        responseId: assistantReply.responseId,
        graphProposalId,
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
