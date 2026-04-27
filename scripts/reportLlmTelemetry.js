const { getRuntimeLogPathLabel, readRuntimeEvents } = require("../src/activityStore");

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function average(values) {
  const numbers = values.map(numberOrNull).filter((value) => value !== null);

  if (numbers.length === 0) {
    return null;
  }

  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined) {
    return "-";
  }

  return Number(value).toFixed(digits);
}

function percent(numerator, denominator) {
  if (!denominator) {
    return "-";
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function summarizePipelineEvents(events) {
  const byRequestId = new Map();

  for (const event of events) {
    if (event.type !== "chat_graph_pipeline_completed") {
      continue;
    }

    const requestId = event.payload?.requestId;

    if (!requestId) {
      continue;
    }

    byRequestId.set(requestId, event.payload);
  }

  return byRequestId;
}

function summarizeLlmEvents(events) {
  const pipelineByRequestId = summarizePipelineEvents(events);
  const groups = new Map();

  for (const event of events) {
    if (event.type !== "llm_call_completed" && event.type !== "llm_call_failed") {
      continue;
    }

    const payload = event.payload || {};
    const stage = payload.stage || "unknown";
    const effort = payload.reasoningEffortRequested || "unknown";
    const key = `${stage}|${effort}`;

    if (!groups.has(key)) {
      groups.set(key, {
        stage,
        effort,
        events: [],
        completed: 0,
        failed: 0,
        pipelineEvents: []
      });
    }

    const group = groups.get(key);
    group.events.push(event);

    if (event.type === "llm_call_failed") {
      group.failed += 1;
    } else {
      group.completed += 1;
    }

    const requestId = payload.requestId;
    const pipeline = requestId ? pipelineByRequestId.get(requestId) : null;

    if (pipeline) {
      group.pipelineEvents.push(pipeline);
    }
  }

  return [...groups.values()].sort((a, b) => {
    const stageCompare = a.stage.localeCompare(b.stage);
    return stageCompare || a.effort.localeCompare(b.effort);
  });
}

async function main() {
  const limit = Number(process.argv[2] || 0);
  const events = await readRuntimeEvents(limit);
  const groups = summarizeLlmEvents(events);

  console.log(`Runtime log: ${getRuntimeLogPathLabel()}`);
  console.log(`Telemetry window: ${limit > 0 ? `${events.length} recent events` : `${events.length} events`}`);

  if (groups.length === 0) {
    console.log("No LLM telemetry events found.");
    return;
  }

  for (const group of groups) {
    const payloads = group.events.map((event) => event.payload || {});
    const pipelines = group.pipelineEvents;
    const persisted = pipelines.filter((event) => event.mode === "persist_graph").length;
    const humanLoops = pipelines.filter((event) => event.humanInputNeeded).length;
    const skippedRelationships = pipelines.map((event) => event.skippedRelationshipCount || 0);

    console.log("");
    const verbosity = payloads.find((payload) => payload.verbosityRequested)?.verbosityRequested || "-";
    console.log(`${group.stage} / ${group.effort} / verbosity ${verbosity}`);
    console.log(`  calls: ${group.events.length}`);
    console.log(`  completed: ${group.completed}`);
    console.log(`  failed: ${group.failed} (${percent(group.failed, group.events.length)})`);
    console.log(`  avg duration ms: ${formatNumber(average(payloads.map((payload) => payload.durationMs)))}`);
    console.log(`  avg input tokens: ${formatNumber(average(payloads.map((payload) => payload.inputTokens)))}`);
    console.log(`  avg output tokens: ${formatNumber(average(payloads.map((payload) => payload.outputTokens)))}`);
    console.log(`  avg reasoning tokens: ${formatNumber(average(payloads.map((payload) => payload.reasoningTokens)))}`);
    console.log(`  avg total tokens: ${formatNumber(average(payloads.map((payload) => payload.totalTokens)))}`);
    console.log(`  graph persistence rate: ${percent(persisted, pipelines.length)}`);
    console.log(`  human-loop rate: ${percent(humanLoops, pipelines.length)}`);
    console.log(`  avg skipped relationships: ${formatNumber(average(skippedRelationships))}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
