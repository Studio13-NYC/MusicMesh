const fs = require("fs");
const { validateEnv } = require("./env");
const {
  REASONING_STAGES,
  resolveChatAnswerReasoningStage,
  resolveOpenAiModel,
  resolveReasoningEffort,
  resolveVerbosity
} = require("./reasoningConfig");
const {
  recordLlmCallCompleted,
  recordLlmCallFailed
} = require("./llmTelemetry");

const DEFAULT_MODEL = resolveOpenAiModel();
const DEFAULT_REASONING_EFFORT = resolveReasoningEffort().effort;

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

async function callResponsesApi({
  input,
  instructions,
  threadId,
  purpose,
  reasoningStage = REASONING_STAGES.KNOWLEDGE,
  telemetryContext = {}
}) {
  const envResult = validateEnv();
  const model = resolveOpenAiModel();
  const reasoningConfig = resolveReasoningEffort(reasoningStage);
  const verbosityConfig = resolveVerbosity();
  const startedAt = Date.now();

  if (!envResult.isValid) {
    const errorMessage =
      "MusicMesh chat is missing required environment variables (see validateEnv / SWA app settings).";
    await recordLlmCallFailed({
      telemetryContext,
      stage: reasoningStage,
      model,
      reasoningConfig,
      verbosityConfig,
      startedAt,
      errorCode: "missing_environment",
      errorMessage
    });
    throw new Error(errorMessage);
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input,
      instructions,
      reasoning: {
        effort: reasoningConfig.effort
      },
      text: {
        verbosity: verbosityConfig.verbosity
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    const errorMessage =
      `OpenAI ${purpose} request failed for thread ${threadId}: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`;
    await recordLlmCallFailed({
      telemetryContext,
      stage: reasoningStage,
      model,
      reasoningConfig,
      verbosityConfig,
      startedAt,
      status: String(response.status),
      errorCode: "openai_http_error",
      errorMessage: errorMessage.slice(0, 1000)
    });
    throw new Error(errorMessage);
  }

  const payload = await response.json();
  await recordLlmCallCompleted({
    telemetryContext,
    stage: reasoningStage,
    model,
    reasoningConfig,
    verbosityConfig,
    startedAt,
    payload
  });

  return payload;
}

async function createAssistantReply({
  prompt,
  messages,
  threadId,
  systemPromptPath,
  reasoningStage,
  telemetryContext = {}
}) {
  const input = buildInputFromMessages(messages, prompt);
  const instructions = loadSystemPrompt(systemPromptPath);
  const selectedReasoningStage = reasoningStage ||
    resolveChatAnswerReasoningStage({ prompt, messages });

  const payload = await callResponsesApi({
    threadId,
    purpose: "chat",
    input: input,
    instructions,
    reasoningStage: selectedReasoningStage,
    telemetryContext: {
      ...telemetryContext,
      purpose: "chat"
    }
  });

  const text = getOutputText(payload);

  if (!text) {
    throw new Error(`OpenAI chat request returned no assistant text for thread ${threadId}.`);
  }

  return {
    responseId: payload.id || null,
    text,
    reasoningStage: selectedReasoningStage
  };
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  buildInputFromMessages,
  getOutputText,
  createAssistantReply
};
