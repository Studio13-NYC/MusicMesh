const path = require("path");
const { app } = require("@azure/functions");
const { createAssistantReply } = require("../../shared/chatService");

const SYSTEM_PROMPT_PATH = path.join(__dirname, "..", "..", "content", "MUSICMESH_CHAT_SYSTEM_PROMPT.md");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

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
      return {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
        jsonBody: { error: "Invalid JSON body." }
      };
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const threadId = typeof body.threadId === "string" ? body.threadId : "default-thread";
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (!prompt) {
      return {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
        jsonBody: { error: "Missing prompt." }
      };
    }

    try {
      const assistantReply = await createAssistantReply({
        prompt,
        messages,
        threadId,
        systemPromptPath: SYSTEM_PROMPT_PATH
      });

      return {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
        jsonBody: {
          threadId,
          message: assistantReply.text,
          responseId: assistantReply.responseId,
          tapeEventIds: []
        }
      };
    } catch (error) {
      return {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
        jsonBody: { error: error.message || "Chat request failed." }
      };
    }
  }
});
