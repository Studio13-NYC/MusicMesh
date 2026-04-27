const VALID_REASONING_EFFORTS = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh"
]);
const VALID_VERBOSITY_LEVELS = new Set(["low", "medium", "high"]);

const REASONING_STAGES = {
  DEFAULT: "default",
  KNOWLEDGE: "knowledge",
  CHAT_COMPLEX: "chat_complex",
  GRAPH_PREVIEW: "graph_preview",
  GRAPH_PLAN: "graph_plan",
  GRAPH_GROUNDING: "graph_grounding",
  HUMAN_LOOP: "human_loop",
  RUN_REVIEW: "run_review",
  MAINTENANCE: "maintenance"
};

const STAGE_CONFIG = {
  [REASONING_STAGES.DEFAULT]: {
    envKey: "OPENAI_REASONING_EFFORT_DEFAULT",
    defaultEffort: "medium"
  },
  [REASONING_STAGES.KNOWLEDGE]: {
    envKey: "OPENAI_REASONING_EFFORT_KNOWLEDGE",
    defaultEffort: "low"
  },
  [REASONING_STAGES.CHAT_COMPLEX]: {
    envKey: "OPENAI_REASONING_EFFORT_CHAT_COMPLEX",
    defaultEffort: "medium"
  },
  [REASONING_STAGES.GRAPH_PREVIEW]: {
    envKey: "OPENAI_REASONING_EFFORT_GRAPH_PREVIEW",
    defaultEffort: "low"
  },
  [REASONING_STAGES.GRAPH_PLAN]: {
    envKey: "OPENAI_REASONING_EFFORT_GRAPH_PLAN",
    defaultEffort: "medium"
  },
  [REASONING_STAGES.GRAPH_GROUNDING]: {
    envKey: "OPENAI_REASONING_EFFORT_GRAPH_GROUNDING",
    defaultEffort: "high"
  },
  [REASONING_STAGES.HUMAN_LOOP]: {
    envKey: "OPENAI_REASONING_EFFORT_HUMAN_LOOP",
    defaultEffort: "low"
  },
  [REASONING_STAGES.RUN_REVIEW]: {
    envKey: "OPENAI_REASONING_EFFORT_RUN_REVIEW",
    defaultEffort: "low"
  },
  [REASONING_STAGES.MAINTENANCE]: {
    envKey: "OPENAI_REASONING_EFFORT_MAINTENANCE",
    defaultEffort: "high"
  }
};

function normalizeReasoningEffort(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return VALID_REASONING_EFFORTS.has(normalized) ? normalized : "";
}

function configuredEffortFromEnv(envKey) {
  const effort = normalizeReasoningEffort(process.env[envKey]);

  if (!effort) {
    return null;
  }

  return {
    effort,
    source: envKey
  };
}

function resolveReasoningEffort(stage = REASONING_STAGES.DEFAULT) {
  const stageConfig = STAGE_CONFIG[stage] || STAGE_CONFIG[REASONING_STAGES.DEFAULT];
  const candidates = [
    configuredEffortFromEnv(stageConfig.envKey),
    configuredEffortFromEnv(STAGE_CONFIG[REASONING_STAGES.DEFAULT].envKey),
    configuredEffortFromEnv("OPENAI_REASONING_EFFORT"),
    configuredEffortFromEnv("OPENAI_REASONING_LEVEL")
  ].filter(Boolean);

  if (candidates.length > 0) {
    return {
      stage,
      effort: candidates[0].effort,
      source: candidates[0].source
    };
  }

  return {
    stage,
    effort: stageConfig.defaultEffort,
    source: `${stageConfig.envKey}:default`
  };
}

function normalizeOpenAiModel(model) {
  const normalized = typeof model === "string" ? model.trim() : "";

  if (!normalized) {
    return "gpt-5.5";
  }

  return normalized.toLowerCase();
}

function resolveOpenAiModel() {
  return normalizeOpenAiModel(process.env.OPENAI_MODEL);
}

function normalizeVerbosity(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return VALID_VERBOSITY_LEVELS.has(normalized) ? normalized : "";
}

function resolveVerbosity() {
  const verbosity = normalizeVerbosity(process.env.OPENAI_VERBOSITY);

  return {
    verbosity: verbosity || "medium",
    source: verbosity ? "OPENAI_VERBOSITY" : "OPENAI_VERBOSITY:default"
  };
}

function resolveChatGraphSyncTimeoutMs() {
  const configured = Number(process.env.MUSICMESH_CHAT_GRAPH_SYNC_TIMEOUT_MS);

  if (Number.isFinite(configured) && configured >= 1000) {
    return configured;
  }

  return 25000;
}

function resolveChatAnswerReasoningStage({ prompt, messages }) {
  const promptLength = typeof prompt === "string" ? prompt.trim().length : 0;
  const messageCount = Array.isArray(messages) ? messages.length : 0;

  if (promptLength > 800 || messageCount >= 6) {
    return REASONING_STAGES.CHAT_COMPLEX;
  }

  return REASONING_STAGES.KNOWLEDGE;
}

function getReasoningEnvKeys() {
  return [
    "OPENAI_REASONING_EFFORT",
    "OPENAI_REASONING_LEVEL",
    "OPENAI_VERBOSITY",
    "MUSICMESH_CHAT_GRAPH_SYNC_TIMEOUT_MS",
    ...Object.values(STAGE_CONFIG).map((config) => config.envKey)
  ];
}

module.exports = {
  REASONING_STAGES,
  VALID_REASONING_EFFORTS,
  VALID_VERBOSITY_LEVELS,
  getReasoningEnvKeys,
  normalizeOpenAiModel,
  resolveChatAnswerReasoningStage,
  resolveChatGraphSyncTimeoutMs,
  resolveOpenAiModel,
  resolveReasoningEffort,
  resolveVerbosity
};
