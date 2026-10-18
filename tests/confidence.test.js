const test = require("node:test");
const assert = require("node:assert/strict");
const { executeResearchTool } = require("../src/researchTools");
test("confidence revision checks ownership/version, and paginates history", async () => {
  const row = { id: "research:claim", name: "A tentative credit", source: "user-reviewed", confidenceScore: 40, extra: { confidenceRevision: 1, confidenceHistory: [{ revision: 1, confidenceScore: 40 }] } };
  const db = { entity: { findFirst: async () => row } };
  const a = { assertionId: row.id, expectedRevision: 1, confidenceScore: 75, confidenceReason: "New independent credit", sourceUrl: "https://example.org/credits", excerpt: "New evidence summarized", evidenceKind: "summary", evidenceRelation: "support" };
  const ctx = { db, evidenceTexts: [{ url: a.sourceUrl, text: "Credits: an independently reported producer." }] };
  const r = await executeResearchTool("prepare_confidence_revision", a, ctx);
  assert.equal(r.decision.kind, "confidence");
  assert.match(r.decision.display.confidence, /75/);
  await assert.rejects(executeResearchTool("prepare_confidence_revision", { ...a, expectedRevision: 0 }, ctx), /revision changed/);
  row.source = "musicbrainz";
  await assert.rejects(executeResearchTool("prepare_confidence_revision", a, ctx), /imported evidence/);
  const history = await executeResearchTool("claim_history", { assertionId: row.id, offset: 1, limit: 1 }, { db });
  assert.equal(history.data.assessments.length, 0);
  assert.equal(history.data.total, 1);
});
