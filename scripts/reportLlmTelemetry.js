const {
  getRuntimeLogPathLabel,
  getTapePathLabel,
  readRuntimeEvents,
  readTapeEntries
} = require("../src/activityStore");

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
    if (
      event.type !== "chat_graph_pipeline_completed" &&
      event.type !== "chat_graph_pipeline_deferred_completed"
    ) {
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

function assessmentEntries(tapeEntries) {
  return tapeEntries
    .filter((entry) => entry.type === "run_quality_assessment" && entry.payload?.assessment)
    .map((entry) => ({
      createdAt: entry.createdAt,
      requestId: entry.payload?.requestId || null,
      responseId: entry.payload?.responseId || null,
      reviewPacketBytes: numberOrNull(entry.payload?.reviewPacketBytes),
      assessment: entry.payload.assessment
    }));
}

function summarizeAssessments(tapeEntries) {
  const entries = assessmentEntries(tapeEntries);
  const outcomeCounts = new Map();
  const stageDurations = new Map();

  for (const entry of entries) {
    const assessment = entry.assessment || {};
    const outcome = assessment.outcome || "unknown";
    outcomeCounts.set(outcome, (outcomeCounts.get(outcome) || 0) + 1);

    for (const timing of Array.isArray(assessment.stageTimings) ? assessment.stageTimings : []) {
      const stage = timing.stage || timing.label || "unknown";
      const duration = numberOrNull(timing.elapsedMs);

      if (duration === null) {
        continue;
      }

      if (!stageDurations.has(stage)) {
        stageDurations.set(stage, []);
      }

      stageDurations.get(stage).push(duration);
    }
  }

  return {
    entries,
    outcomeCounts: [...outcomeCounts.entries()].sort((left, right) => right[1] - left[1]),
    stageAverages: [...stageDurations.entries()]
      .map(([stage, durations]) => ({
        stage,
        count: durations.length,
        averageMs: average(durations)
      }))
      .sort((left, right) => (right.averageMs || 0) - (left.averageMs || 0))
  };
}

function printAssessmentSummary(summary) {
  console.log("");
  console.log("Run quality assessments");

  if (summary.entries.length === 0) {
    console.log("  none found");
    return;
  }

  const assessments = summary.entries.map((entry) => entry.assessment || {});
  const followUps = assessments.filter((assessment) => assessment.requiresFollowUp).length;
  const attention = assessments.filter((assessment) => assessment.needsOperatorAttention).length;
  const latest = summary.entries[summary.entries.length - 1];
  const latestAssessment = latest.assessment || {};

  console.log(`  reviews: ${summary.entries.length}`);
  console.log(`  avg overall score: ${formatNumber(average(assessments.map((assessment) => assessment.overallScore)))}`);
  console.log(`  follow-up rate: ${percent(followUps, summary.entries.length)}`);
  console.log(`  operator-attention rate: ${percent(attention, summary.entries.length)}`);
  console.log(`  latest outcome: ${latestAssessment.outcome || "-"}`);
  console.log(`  latest score: ${latestAssessment.overallScore || "-"}`);
  console.log(`  latest summary: ${latestAssessment.summary || "-"}`);

  if (summary.outcomeCounts.length > 0) {
    console.log(`  outcomes: ${summary.outcomeCounts.map(([outcome, count]) => `${outcome}=${count}`).join(", ")}`);
  }

  const slowestStages = summary.stageAverages.slice(0, 5);

  if (slowestStages.length > 0) {
    console.log("  slowest avg stages:");

    for (const stage of slowestStages) {
      console.log(`    ${stage.stage}: ${formatNumber(stage.averageMs)} ms (${stage.count} samples)`);
    }
  }
}

async function main() {
  const limit = Number(process.argv[2] || 0);
  const [events, tapeEntries] = await Promise.all([
    readRuntimeEvents(limit),
    readTapeEntries(limit)
  ]);
  const groups = summarizeLlmEvents(events);
  const assessmentSummary = summarizeAssessments(tapeEntries);

  console.log(`Runtime log: ${getRuntimeLogPathLabel()}`);
  console.log(`Tape: ${getTapePathLabel()}`);
  console.log(`Telemetry window: ${limit > 0 ? `${events.length} recent events` : `${events.length} events`}`);

  if (groups.length === 0) {
    console.log("No LLM telemetry events found.");
    printAssessmentSummary(assessmentSummary);
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

  printAssessmentSummary(assessmentSummary);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
