const test = require("node:test"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto");
const enabled = process.env.MUSICMESH_TEST_DATABASE === "isolated";
process.env.MUSICMESH_BLOB_CONNECTION_STRING = "";
const { getDatabase, closeDatabase } = require("../src/postgres");
const { executeResearchTool } = require("../src/researchTools");
const {
  startOrAdvance,
  decide,
  readRun,
  cancel,
} = require("../src/researchStore");
test.after(closeDatabase);
test(
  "research tools use compact stored public facts and private aggregates",
  { skip: !enabled },
  async () => {
    assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
    const db = getDatabase();
    const r = await db.entity.findFirst({
      where: { primaryLabel: "Release" },
      select: { id: true },
    });
    const n = await executeResearchTool(
      "graph",
      { action: "node", id: r.id },
      { db },
    );
    assert.equal(n.data.id, r.id);
    assert.equal(Object.hasOwn(n.data.properties, "rawProvider"), false);
    const adjacent = await executeResearchTool(
      "graph",
      { action: "adjacency", id: r.id },
      { db },
    );
    assert.ok(adjacent.data.relationshipFamilies.length > 0);
    const neighbors = await executeResearchTool(
      "graph",
      { action: "neighbors", id: r.id, limit: 3 },
      { db },
    );
    assert.ok(neighbors.data.relationships.length <= 3);
    const album = await executeResearchTool(
      "graph",
      { action: "album", id: r.id, limit: 5 },
      { db },
    );
    assert.ok(Array.isArray(album.data.tracks));
    const listens = await executeResearchTool(
      "listening",
      { group: "summary" },
      { db },
    );
    assert.equal(listens.data.plays, 21415);
    const genres = await executeResearchTool(
      "listening",
      { group: "genre" },
      { db },
    );
    assert.match(genres.data.coverage, /genre/);
    const pair =
      await db.$queryRaw`SELECT DISTINCT "targetId" AS id FROM relationships WHERE type='MusicBrainzRelationship' AND extra->>'providerTypeName'='producer' AND extra->>'targetType'='Recording' LIMIT 2`;
    const factors = await executeResearchTool(
      "compare_factors",
      { recordingIds: pair.map((r) => r.id) },
      { db },
    );
    assert.ok(factors.data.factors.some((f) => f.role === "producer"));
    const p = await db.entity.findFirst({
      where: { primaryLabel: "ListeningEvent" },
      select: { id: true },
    });
    await assert.rejects(
      executeResearchTool("graph", { action: "node", id: p.id }, { db }),
      /not found/,
    );
  },
);
test(
  "research run retry/version/lease and approval are durable and idempotent",
  { skip: !enabled },
  async () => {
    const db = getDatabase(),
      id = `req-${randomUUID()}`;
    let calls = 0;
    try {
      const advance = async (s) => {
        calls++;
        return {
          ...s,
          status: "needs_input",
          decision: {
            id: "decision-test",
            kind: "clarification",
            question: "Pick",
            choices: ["A", "B"],
            action: {},
          },
        };
      };
      const first = await startOrAdvance(
        { clientRequestId: id, prompt: "test", version: 0 },
        { db, advance },
      );
      assert.equal(first.version, 1);
      const duplicate = await startOrAdvance(
        { clientRequestId: id, prompt: "test", version: 0 },
        { db, advance },
      );
      assert.equal(duplicate.version, 1);
      assert.equal(calls, 1);
      const deferred = await decide(
        {
          requestId: id,
          version: 1,
          decisionId: "decision-test",
          choice: "defer",
        },
        { db },
      );
      assert.equal(deferred.status, "deferred");
      await assert.rejects(
        decide(
          {
            requestId: id,
            version: 1,
            decisionId: "decision-test",
            choice: "approve",
            selection: "A",
          },
          { db },
        ),
        /changed/,
      );
      const approved = await decide(
        {
          requestId: id,
          version: deferred.version,
          decisionId: "decision-test",
          choice: "approve",
          selection: "A",
        },
        { db },
      );
      assert.equal(approved.status, "running");
      const retry = await decide(
        {
          requestId: id,
          version: deferred.version,
          decisionId: "decision-test",
          choice: "approve",
          selection: "A",
        },
        { db },
      );
      assert.equal(retry.version, approved.version);
      assert.equal((await readRun(id, db)).status, "running");
      const tape = (
        await require("../src/activityStore").readTapeEntries(200)
      ).filter((e) => e.payload.requestId === id);
      assert.equal(tape.filter((e) => e.type === "user_message").length, 1);
      assert.deepEqual(
        tape
          .filter((e) => e.type === "research_decision")
          .map((e) => e.payload.choice),
        ["defer", "approve"],
      );
      const cancelled = await cancel(
        { requestId: id, version: approved.version },
        { db },
      );
      assert.equal(cancelled.status, "cancelled");
      assert.equal(
        (await cancel({ requestId: id, version: approved.version }, { db }))
          .version,
        cancelled.version,
      );
      await startOrAdvance(
        { requestId: id, version: cancelled.version },
        { db, advance },
      );
      assert.equal(calls, 1);
    } finally {
      await db.researchRun.deleteMany({ where: { id } });
    }
  },
);
test(
  "uncertain model result is never automatically replayed after lease expiry",
  { skip: !enabled },
  async () => {
    const db = getDatabase(),
      id = `req-${randomUUID()}`;
    let calls = 0;
    const advance = async (s) => {
      calls++;
      return {
        ...s,
        status: "completed",
        message: "Answer delivered by model",
      };
    };
    const failingDb = {
      ...db,
      researchRun: {
        findUnique: db.researchRun.findUnique.bind(db.researchRun),
        create: db.researchRun.create.bind(db.researchRun),
        updateMany: async (args) => {
          if (args.data.state?.status === "completed")
            throw Error("Simulated save failure after model completed");
          return db.researchRun.updateMany(args);
        },
      },
      $executeRaw: db.$executeRaw.bind(db),
    };
    try {
      await assert.rejects(
        startOrAdvance(
          { clientRequestId: id, prompt: "answer", version: 0 },
          { db: failingDb, advance },
        ),
        /Simulated save failure/,
      );
      await db.researchRun.update({
        where: { id },
        data: { leaseUntil: new Date(0) },
      });
      const recovered = await startOrAdvance(
        { requestId: id, version: 0 },
        { db, advance },
      );
      assert.equal(calls, 1);
      assert.equal(recovered.status, "needs_input");
      assert.equal(recovered.decision.kind, "retry");
      assert.match(recovered.decision.question, /may have been billed/);
      const denied = await decide(
        {
          requestId: id,
          version: recovered.version,
          decisionId: recovered.decision.id,
          choice: "deny",
        },
        { db },
      );
      assert.equal(denied.status, "denied");
      assert.equal(calls, 1);
      const tape = (
        await require("../src/activityStore").readTapeEntries(200)
      ).filter((e) => e.payload.requestId === id);
      assert.equal(
        tape.filter(
          (e) => e.type === "research_decision" && e.payload.choice === "deny",
        ).length,
        1,
      );
    } finally {
      await db.researchRun.deleteMany({ where: { id } });
    }
  },
);
test(
  "reviewed enrichment creates typed factor and claim once without changing imported subject",
  { skip: !enabled },
  async () => {
    const db = getDatabase(),
      id = `req-${randomUUID()}`,
      decisionId = randomUUID();
    let factorId;
    const release = await db.entity.findFirst({
      where: { primaryLabel: "Release" },
      select: { id: true, extra: true },
    });
    const prompt =
      "Test evidence at https://example.org/credits: All tracks used the test console.";
    try {
      const prepared = await executeResearchTool(
        "prepare_enrichment",
        {
          subjectId: release.id,
          subjectType: "Release",
          newFactor: {
            type: "Console",
            name: "Isolated test console " + decisionId,
          },
          role: "equipment",
          scope: "all-tracks",
          mode: "add",
          sourceUrl: "https://example.org/credits",
          excerpt: "All tracks used the test console.",
          certainty: "user-stated",
        },
        { db, userPrompt: prompt },
      );
      factorId = prepared.decision.action.factorId;
      const run = await startOrAdvance(
        { clientRequestId: id, prompt },
        {
          db,
          advance: async (s) => ({
            ...s,
            status: "needs_input",
            decision: { ...prepared.decision, id: decisionId },
          }),
        },
      );
      const body = {
        requestId: id,
        version: run.version,
        decisionId,
        choice: "approve",
      };
      const approved = await decide(body, { db });
      const duplicate = await decide(body, { db });
      assert.equal(approved.version, duplicate.version);
      assert.equal(await db.entity.count({ where: { id: factorId } }), 1);
      assert.equal(
        await db.relationship.count({
          where: { sourceId: "research:" + decisionId },
        }),
        3,
      );
      assert.deepEqual(
        (
          await db.entity.findUnique({
            where: { id: release.id },
            select: { extra: true },
          })
        ).extra,
        release.extra,
      );
      const credits = await executeResearchTool(
        "credits",
        { releaseId: release.id },
        { db },
      );
      assert.ok(credits.data.effective.some((a) => a.factorId === factorId));
    } finally {
      await db.relationship.deleteMany({
        where: { sourceId: "research:" + decisionId },
      });
      await db.entity.deleteMany({
        where: {
          id: {
            in: [
              "research:" + decisionId,
              "research:" + decisionId + ":source",
              factorId,
            ].filter(Boolean),
          },
        },
      });
      await db.researchRun.deleteMany({ where: { id } });
    }
  },
);
