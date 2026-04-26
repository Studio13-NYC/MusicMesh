const fs = require("fs");
const { validateEnv } = require("./env");

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
const DEFAULT_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || "medium";
const MAX_TOOL_ROUNDS = 6;

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
  tools = [],
  previousResponseId = null
}) {
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
      instructions,
      tools: Array.isArray(tools) && tools.length > 0 ? tools : undefined,
      tool_choice: Array.isArray(tools) && tools.length > 0 ? "auto" : undefined,
      previous_response_id: previousResponseId || undefined,
      reasoning: {
        effort: DEFAULT_REASONING_EFFORT
      }
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

function extractFunctionCalls(payload) {
  if (!Array.isArray(payload?.output)) {
    return [];
  }

  return payload.output.filter(
    (item) =>
      item &&
      item.type === "function_call" &&
      typeof item.name === "string" &&
      typeof item.call_id === "string"
  );
}

function serializeToolOutput(output) {
  if (typeof output === "string") {
    return output;
  }

  return JSON.stringify(output ?? {});
}

async function createAssistantReply({
  prompt,
  messages,
  threadId,
  systemPromptPath,
  tools = [],
  executeToolCall
}) {
  const input = buildInputFromMessages(messages, prompt);
  const instructions = loadSystemPrompt(systemPromptPath);

  let payload = await callResponsesApi({
    threadId,
    purpose: "chat",
    input: input,
    instructions,
    tools
  });

  const toolResults = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const functionCalls = extractFunctionCalls(payload);

    if (functionCalls.length === 0) {
      break;
    }

    if (typeof executeToolCall !== "function") {
      throw new Error("Model requested a tool call but no tool execution handler was provided.");
    }

    const toolOutputs = [];

    for (const call of functionCalls) {
      const result = await executeToolCall(call);
      toolResults.push({
        callId: call.call_id,
        name: call.name,
        result
      });
      toolOutputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: serializeToolOutput(result)
      });
    }

    payload = await callResponsesApi({
      threadId,
      purpose: "chat_tool_followup",
      input: toolOutputs,
      instructions,
      tools,
      previousResponseId: payload.id || null
    });
  }

  if (extractFunctionCalls(payload).length > 0) {
    throw new Error("Tool-calling did not converge to a final assistant response.");
  }

  const text = getOutputText(payload);

  if (!text) {
    throw new Error(`OpenAI chat request returned no assistant text for thread ${threadId}.`);
  }

  return {
    responseId: payload.id || null,
    text,
    toolResults
  };
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  buildInputFromMessages,
  getOutputText,
  createAssistantReply
};
