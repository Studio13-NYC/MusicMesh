const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { appendTapeEntry, readTapeEntries, tapePath } = require("./conversationTape");
const { appendRuntimeEvent, readRuntimeEvents, runtimeLogPath } = require("./runtimeLog");
const { validateEnv } = require("./env");

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";
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

function buildInputFromMessages(messages, prompt) {
  const input = Array.isArray(messages)
    ? messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    : [];

  if (typeof prompt === "string" && prompt.trim()) {
    const normalizedPrompt = prompt.trim();
    const lastMessage = input[input.length - 1];
    const promptAlreadyPresent =
      lastMessage &&
      lastMessage.role === "user" &&
      typeof lastMessage.content === "string" &&
      lastMessage.content.trim() === normalizedPrompt;

    if (!promptAlreadyPresent) {
      input.push({
        role: "user",
        content: normalizedPrompt
      });
    }
  }

  return input;
}

function getOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (!Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function loadSystemPrompt() {
  return fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8");
}

async function callResponsesApi({ input, instructions, threadId, purpose }) {
  const envResult = validateEnv();

  if (!envResult.isValid) {
    throw new Error("MusicMesh API cannot run chat without a valid root .env.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input,
      instructions
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `OpenAI ${purpose} request failed for thread ${threadId}: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`
    );
  }

  return response.json();
}

async function createAssistantReply({ prompt, messages, threadId }) {
  const input = buildInputFromMessages(messages, prompt);

  const payload = await callResponsesApi({
    threadId,
    purpose: "chat",
    input,
    instructions: loadSystemPrompt()
  });
  const text = getOutputText(payload);

  if (!text) {
    throw new Error(`OpenAI chat request returned no assistant text for thread ${threadId}.`);
  }

  return {
    responseId: payload.id || null,
    text
  };
}

async function handleChat(request, response) {
  const requestId = createId("req");

  try {
    const body = await parseJsonBody(request);
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const threadId = typeof body.threadId === "string" ? body.threadId : "default-thread";
    const messages = Array.isArray(body.messages) ? body.messages : [];

    appendRuntimeEvent({
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
      appendRuntimeEvent({
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

    const userEntry = appendTapeEntry({
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
      threadId
    });

    const assistantEntry = appendTapeEntry({
      id: createId("evt"),
      type: "assistant_message",
      threadId,
      payload: {
        responseId: assistantReply.responseId,
        text: assistantReply.text
      }
    });

    sendJson(response, 200, {
      threadId,
      message: assistantReply.text,
      responseId: assistantReply.responseId,
      tapeEventIds: [userEntry.id, assistantEntry.id]
    });

    appendRuntimeEvent({
      id: createId("log"),
      type: "chat_request_completed",
      payload: {
        requestId,
        threadId,
        responseId: assistantReply.responseId,
        tapeEventIds: [userEntry.id, assistantEntry.id]
      }
    });
  } catch (error) {
    appendTapeEntry({
      id: createId("evt"),
      type: "chat_error",
      threadId: "default-thread",
      payload: {
        message: error.message
      }
    });

    appendRuntimeEvent({
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

function handleTape(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const limitParam = Number(requestUrl.searchParams.get("limit") || 100);
  const entries = readTapeEntries(limitParam);

  sendJson(response, 200, {
    tapePath,
    entries
  });
}

function handleRuntimeLog(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const limitParam = Number(requestUrl.searchParams.get("limit") || 100);
  const events = readRuntimeEvents(limitParam);

  sendJson(response, 200, {
    runtimeLogPath,
    events
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
        tapePath,
        runtimeLogPath,
        systemPromptPath: SYSTEM_PROMPT_PATH
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/chat/tape") {
      handleTape(request, response);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/runtime/logs") {
      handleRuntimeLog(request, response);
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
    console.log(`Conversation tape: ${tapePath}`);
  });

  return server;
}

module.exports = {
  startServer
};
