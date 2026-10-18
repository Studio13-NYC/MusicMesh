const test = require("node:test"), assert = require("node:assert/strict"), { randomUUID } = require("node:crypto");
const enabled = process.env.MUSICMESH_TEST_DATABASE === "isolated";
process.env.MUSICMESH_BLOB_CONNECTION_STRING = "";
const { getDatabase, closeDatabase } = require("../src/postgres");
const { executeResearchTool } = require("../src/researchTools");
const { startOrAdvance, decide } = require("../src/researchStore");
test.after(closeDatabase);
test("tentative claim persists, revisions raise/lower confidence atomically, and reads expose it", { skip: !enabled }, async () => {
  assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
  const db = getDatabase(), runs = [], decisions = [];
  let factorId, assertionId;
  async function approve(tool, action, prompt) {
    const prepared = await executeResearchTool(tool, action, { db, userPrompt: prompt });
    const id = `req-${randomUUID()}`, decisionId = randomUUID();
    runs.push(id); decisions.push(decisionId);
    const run = await startOrAdvance({ clientRequestId: id, prompt }, { db, advance: async s => ({ ...s, status: "needs_input", decision: { ...prepared.decision, id: decisionId } }) });
    const body = { requestId: id, version: run.version, decisionId, choice: "approve" };
    const result = await decide(body, { db });
    assert.equal((await decide(body, { db })).version, result.version);
    return prepared.decision.action;
  }
  try {
    const subject = await db.entity.findFirst({ where: { primaryLabel: "Release" }, select: { id: true } });
    const action = { subjectId: subject.id, subjectType: "Release", newFactor: { type: "Technique", name: `Confidence test ${randomUUID()}` }, role: "technique", scope: "album-credit", mode: "add", sourceUrl: "https://example.org/confidence-test", excerpt: "Reported possible use of this technique", evidenceKind: "summary", certainty: "uncertain", confidenceScore: 35, confidenceReason: "Tentative reported context" };
    const saved = await approve("prepare_enrichment", action, `${action.sourceUrl} ${action.excerpt}`);
    factorId = saved.factorId; assertionId = `research:${decisions[0]}`;
    for (const [score, relation, expectedRevision] of [[80, "support", 1], [15, "contradict", 2]]) {
      const revision = { assertionId, expectedRevision, confidenceScore: score, confidenceReason: `New ${relation} evidence`, sourceUrl: `https://example.org/${relation}`, excerpt: `${relation} evidence for this claim`, evidenceKind: "summary", evidenceRelation: relation };
      await approve("prepare_confidence_revision", revision, `${revision.sourceUrl} ${revision.excerpt}`);
    }
    const row = await db.entity.findUnique({ where: { id: assertionId } });
    assert.equal(row.confidenceScore, 15);
    assert.equal(row.extra.certainty, "uncertain");
    assert.deepEqual(row.extra.confidenceHistory.map(h => h.confidenceScore), [35, 80, 15]);
    assert.equal(row.extra.confidenceRevision, 3);
    const graph = await executeResearchTool("graph", { action: "node", id: assertionId }, { db });
    assert.equal(graph.data.properties.confidenceScore, 15);
    assert.equal(Object.hasOwn(graph.data.properties, "confidenceHistory"), false);
    const credits = await executeResearchTool("credits", { releaseId: subject.id }, { db });
    assert.equal(credits.data.albumCredits.find(c => c.id === assertionId).confidenceScore, 15);
    const history = await executeResearchTool("claim_history", { assertionId, offset: 1, limit: 1 }, { db });
    assert.equal(history.data.assessments[0].confidenceScore, 80);
    assert.equal(history.data.truncated, true);
    await assert.rejects(approve("prepare_confidence_revision", { assertionId, expectedRevision: 1 }, ""), /revision changed/);
    assert.equal(await db.relationship.count({ where: { sourceId: assertionId, type: "SupportedBySource" } }), 3);
  } finally {
    if (assertionId) await db.relationship.deleteMany({ where: { sourceId: assertionId } });
    await db.entity.deleteMany({ where: { id: { in: [assertionId, factorId, ...decisions.map(id => `research:${id}:source`)].filter(Boolean) } } });
    await db.researchRun.deleteMany({ where: { id: { in: runs } } });
  }
});
