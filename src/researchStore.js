const crypto = require("node:crypto");
const { getDatabase } = require("./postgres");
const {
  newState,
  advanceState,
  applyDecisionState,
} = require("./researchRunner");
const domain = require("./domain");
const { entityFromGraph } = require("./domain/serialization");
const { entityRecord } = require("./graphProperties");
const { persistDomainBatchInTransaction, nodeRow } = require("./domain/repository");
const { confidenceRevision } = require("./enrichment");
const { visible, executeResearchTool } = require("./researchTools");
function publicRun(row) {
  return {
    requestId: row.id,
    version: row.version,
    status: row.state.status,
    message: row.state.message,
    progress: row.state.progress,
    graph: row.state.graph,
    decision: row.state.decision,
    usage: row.state.usage,
    actor: row.state.actor,
    busy: Boolean(row.leaseUntil && row.leaseUntil > new Date()),
    responseId: row.state.responseId || null,
  };
}
function requestId(value) {
  if (typeof value !== "string" || !/^req-[a-zA-Z0-9-]{8,80}$/.test(value))
    throw new Error("Invalid research request ID");
  return value;
}
async function tape(entry) {
  try {
    await require("./activityStore").appendTapeEntry(entry);
  } catch (error) {
    console.error("Research transcript write failed:", error.message);
  }
}
async function readRun(id, db = getDatabase()) {
  const row = await db.researchRun.findUnique({ where: { id: requestId(id) } });
  if (!row || row.expiresAt < new Date())
    throw new Error("Research run not found or expired");
  return publicRun(row);
}
async function startOrAdvance(
  body,
  { db = getDatabase(), advance = advanceState } = {},
) {
  const id = requestId(body.clientRequestId || body.requestId);
  let row = await db.researchRun.findUnique({ where: { id } });
  if (!row) {
    await db.$executeRaw`DELETE FROM research_runs WHERE id IN (SELECT id FROM research_runs WHERE "expiresAt"<now() ORDER BY "expiresAt" LIMIT 100)`;
    const state = newState(body);
    try {
      row = await db.researchRun.create({
        data: { id, state, expiresAt: new Date(Date.now() + 86400000) },
      });
      await tape({
        id: `user-${id}`,
        type: "user_message",
        threadId: state.threadId,
        payload: { requestId: id, text: state.prompt, actor: state.actor },
      });
    } catch (error) {
      if (error.code !== "P2002") throw error;
      row = await db.researchRun.findUnique({ where: { id } });
    }
  }
  if (row.expiresAt < new Date()) throw new Error("Research run expired");
  const expected = Number.isInteger(body.version) ? body.version : 0;
  if (row.version !== expected || row.state.status !== "running")
    return publicRun(row);
  // A lease is persisted before dispatch. Expiry cannot establish whether the
  // provider completed/billed an interrupted call. Never replay it implicitly.
  if (row.lease && row.leaseUntil && row.leaseUntil <= new Date()) {
    const state = {
      ...row.state,
      status: "needs_input",
      progress: "Interrupted step needs a decision",
      message:
        "The last research step was interrupted and its result could not be saved.",
      decision: {
        id: crypto.randomUUID(),
        kind: "retry",
        choices: [],
        action: {},
        question:
          "The interrupted model call may have been billed, but its result was not saved. Approve to retry this step, Deny to stop, or Defer to decide later.",
        display: {
          attempt: row.lease,
          request: id,
          step: (row.state.steps || 0) + 1,
        },
      },
    };
    await db.researchRun.updateMany({
      where: {
        id,
        version: expected,
        lease: row.lease,
        leaseUntil: { lte: new Date() },
      },
      data: { state, version: { increment: 1 }, lease: null, leaseUntil: null },
    });
    return readRun(id, db);
  }
  const lease = crypto.randomUUID();
  const claimed = await db.researchRun.updateMany({
    where: {
      id,
      version: expected,
      lease: null,
      leaseUntil: null,
    },
    data: { lease, leaseUntil: new Date(Date.now() + 120000) },
  });
  if (!claimed.count) return readRun(id, db);
  let state;
  try {
    state = await advance(row.state, {
      telemetryContext: {
        requestId: id,
        threadId: row.state.threadId,
        turnId: id,
      },
    });
    if (Buffer.byteLength(JSON.stringify(state)) > 250000)
      throw new Error("Research context exceeded storage budget");
  } catch (error) {
    state = {
      ...row.state,
      status: "failed",
      message: `Research stopped: ${String(error.message).slice(0, 400)}. Retrieved graph results are retained.`,
      progress: "Stopped",
    };
  }
  const saved = await db.researchRun.updateMany({
    where: { id, version: expected, lease },
    data: { state, version: { increment: 1 }, lease: null, leaseUntil: null },
  });
  if (!saved.count) return readRun(id, db);
  const result = await readRun(id, db);
  // Logging is observational, not the source of run truth or a detached worker.
  try {
    await require("./activityStore").appendRuntimeEvent({
      type: "research_step_completed",
      payload: {
        requestId: id,
        status: state.status,
        steps: state.steps,
        toolCalls: state.toolCalls,
        usage: state.usage,
      },
    });
    if (["completed", "failed", "denied"].includes(state.status))
      await require("./activityStore").appendTapeEntry({
        id: `evt-${id}`,
        type: "assistant_message",
        threadId: state.threadId,
        payload: {
          requestId: id,
          responseId: state.responseId,
          text: state.message,
          graphPending: false,
          previewGraphPending: false,
          graphMode: "researcher",
        },
      });
  } catch {
    /* Durable run is still retrievable if activity logging is unavailable. */
  }
  return result;
}
async function endpoint(tx, id) {
  const row = await tx.entity.findFirst({ where: { id, ...visible } });
  if (!row) throw new Error("Decision endpoint no longer exists");
  return entityFromGraph(entityRecord(row));
}
async function persistDecision(tx, state, d) {
  if (["clarification", "retry"].includes(d.kind)) return { confirmed: true };
  const a = d.action,
    actor = state.actor,
    source = "user-reviewed",
    id = `research:${d.id}`;
  if (d.kind === "preference") {
    const recording = await endpoint(tx, a.recordingId);
    if (recording.type !== "Recording")
      throw new Error("Preference recording changed");
    const signal = new domain.PreferenceSignal({
      id,
      name: `${actor}: ${a.value}`,
      properties: {
        recordingId: recording.id,
        account: actor,
        value: a.value,
        note: a.note,
        source,
      },
    });
    return persistDomainBatchInTransaction(tx, {
      nodes: [signal],
      relationships: [
        new domain.PreferenceFor({
          source: signal,
          target: recording,
          assertionKey: id,
          properties: { source },
        }),
      ],
    });
  }
  if (d.kind === "confidence") {
    await tx.$queryRaw`SELECT id FROM entities WHERE id=${a.assertionId} FOR UPDATE`;
    await executeResearchTool("prepare_confidence_revision", a, { db: tx, userPrompt: state.prompt, userStatements: state.sourceStatements || [], evidenceTexts: state.evidenceTexts, actor });
    const prior = await endpoint(tx, a.assertionId);
    const assessment = confidenceRevision(prior.properties, a, { actor, at: new Date().toISOString(), decisionId: d.id });
    const revised = new domain.EvidenceAssertion({ id: prior.id, name: prior.name, properties: { ...prior.properties, ...assessment } });
    const row = nodeRow(revised);
    await tx.entity.update({ where: { id: prior.id }, data: { extra: row.extra, confidenceScore: row.confidenceScore } });
    const doc = new domain.SourceDocument({ id: `${id}:source`, name: a.sourceUrl, properties: { url: a.sourceUrl, retrievedAt: assessment.confidenceUpdatedAt, attribution: actor, source } });
    const receipt = await persistDomainBatchInTransaction(tx, { nodes: [doc], relationships: [new domain.SupportedBySource({ source: revised, target: doc, assertionKey: id, properties: { source, evidenceRelation: a.evidenceRelation } })] });
    return { ...receipt, updatedAssertionId: prior.id, confidenceScore: assessment.confidenceScore, confidenceRevision: assessment.confidenceRevision };
  }
  if (d.kind !== "enrichment") throw new Error("Unsupported decision action");
  await executeResearchTool("prepare_enrichment", a, {
    db: tx,
    userPrompt: state.prompt,
    userStatements: state.sourceStatements || [state.prompt],
    evidenceTexts: state.evidenceTexts,
    actor,
  });
  const subject = await endpoint(tx, a.subjectId),
    factor = a.newFactor
      ? new domain[a.newFactor.type]({
          id: a.factorId,
          name: a.newFactor.name.trim(),
          properties: { source, attribution: actor },
        })
      : await endpoint(tx, a.factorId);
  if (subject.type !== a.subjectType)
    throw new Error("Decision subject changed");
  // prepare_enrichment above revalidates membership and the exact applicable
  // Release/ReleaseGroup default inside this transaction, using one contract.
  const doc = new domain.SourceDocument({
    id: `${id}:source`,
    name: a.sourceUrl,
    properties: {
      url: a.sourceUrl,
      retrievedAt: state.startedAt,
      attribution: actor,
      source,
    },
  });
  const assertion = new domain.EvidenceAssertion({
    id,
    name: `${subject.name}: ${a.role} ${factor.name}`,
    properties: {
      ...Object.fromEntries(
        Object.entries(a).filter(([key]) => key !== "newFactor"),
      ),
      attribution: actor,
      ...(a.confidenceScore != null ? confidenceRevision({}, a, { actor, at: new Date().toISOString(), decisionId: d.id }) : {}),
      source,
    },
  });
  const relationships = [
    new domain.AssertionSubject({
      source: assertion,
      target: subject,
      assertionKey: id,
      properties: { source },
    }),
    new domain.AssertionFactor({
      source: assertion,
      target: factor,
      assertionKey: id,
      properties: { source },
    }),
    new domain.SupportedBySource({
      source: assertion,
      target: doc,
      assertionKey: id,
      properties: { source },
    }),
  ];
  return persistDomainBatchInTransaction(tx, {
    nodes: [...(a.newFactor ? [factor] : []), doc, assertion],
    relationships,
  });
}
async function decide(body, { db = getDatabase() } = {}) {
  const id = requestId(body.requestId);
  let accepted;
  const result = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM research_runs WHERE id=${id} FOR UPDATE`;
      const row = await tx.researchRun.findUnique({ where: { id } });
      if (!row || row.expiresAt < new Date())
        throw new Error("Research run not found or expired");
      if (
        row.state.lastDecision?.id === body.decisionId &&
        row.state.lastDecision?.choice === body.choice &&
        row.state.lastDecision?.selection === (body.selection || null)
      )
        return publicRun(row);
      if (row.version !== body.version || row.leaseUntil > new Date())
        throw new Error("Decision changed; refresh before choosing");
      // Validate before writes, then apply and record in the SAME transaction.
      let state = applyDecisionState(row.state, body);
      if (body.choice === "approve") {
        const receipt = await persistDecision(
          tx,
          row.state,
          row.state.decision,
        );
        state = applyDecisionState(row.state, body, receipt);
      }
      state.lastDecision = {
        id: body.decisionId,
        choice: body.choice,
        selection: body.selection || null,
      };
      accepted = {
        threadId: state.threadId,
        question: row.state.decision.question,
        kind: row.state.decision.kind,
        action: row.state.decision.action,
        message: state.message,
      };
      return publicRun(
        await tx.researchRun.update({
          where: { id },
          data: { state, version: { increment: 1 } },
        }),
      );
    },
    { timeout: 15000 },
  );
  if (accepted) {
    await tape({
      id: `decision-${id}-${result.version}`,
      type: "research_decision",
      threadId: accepted.threadId,
      payload: {
        requestId: id,
        decisionId: body.decisionId,
        choice: body.choice,
        selection: body.selection || null,
        question: accepted.question,
        kind: accepted.kind,
        action: accepted.action,
      },
    });
    if (body.choice === "deny")
      await tape({
        id: `assistant-${id}`,
        type: "assistant_message",
        threadId: accepted.threadId,
        payload: {
          requestId: id,
          text: accepted.message,
          graphMode: "researcher",
        },
      });
  }
  return result;
}
async function cancel(body, { db = getDatabase() } = {}) {
  const id = requestId(body.requestId);
  let cancelled;
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM research_runs WHERE id=${id} FOR UPDATE`;
    const row = await tx.researchRun.findUnique({ where: { id } });
    if (!row || row.expiresAt < new Date())
      throw Error("Research run not found or expired");
    if (["completed", "denied", "cancelled"].includes(row.state.status))
      return publicRun(row);
    if (row.version !== body.version)
      throw Error("Research run changed; refresh before cancelling");
    const state = {
      ...row.state,
      status: "cancelled",
      decision: null,
      progress: "Cancelled",
      message:
        "Research cancelled. Retrieved evidence is retained; no further steps will run. A call already in flight may still be billed.",
    };
    cancelled = state;
    return publicRun(
      await tx.researchRun.update({
        where: { id },
        data: {
          state,
          version: { increment: 1 },
          lease: null,
          leaseUntil: null,
        },
      }),
    );
  });
  if (cancelled)
    await tape({
      id: `cancel-${id}`,
      type: "assistant_message",
      threadId: cancelled.threadId,
      payload: { requestId: id, text: cancelled.message, cancelled: true },
    });
  return result;
}
module.exports = {
  publicRun,
  readRun,
  startOrAdvance,
  decide,
  persistDecision,
  cancel,
};
