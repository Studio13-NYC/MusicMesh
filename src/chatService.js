const fs = require("fs");
const { validateEnv } = require("./env");

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

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

function loadSystemPrompt(systemPromptPath) {
  return fs.readFileSync(systemPromptPath, "utf8");
}

async function callResponsesApi({ input, instructions, threadId, purpose }) {
  const envResult = validateEnv();

  if (!envResult.isValid) {
    throw new Error(
      "MusicMesh chat is missing required environment variables (see validateEnv / SWA app settings)."
    );
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

async function createAssistantReply({ prompt, messages, threadId, systemPromptPath }) {
  const input = buildInputFromMessages(messages, prompt);
  const instructions = loadSystemPrompt(systemPromptPath);

  const payload = await callResponsesApi({
    threadId,
    purpose: "chat",
    input,
    instructions
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

module.exports = {
  DEFAULT_MODEL,
  buildInputFromMessages,
  getOutputText,
  createAssistantReply
};
