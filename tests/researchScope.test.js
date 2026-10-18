const test = require("node:test");
const assert = require("node:assert/strict");
const { executeResearchTool } = require("../src/researchTools");
function fixture({
  assertions = [],
  members = [{ id: "track", recording: "recording" }],
} = {}) {
  const nodes = {
    release: { id: "release", name: "Album", kind: "Release" },
    group: { id: "group", name: "Album", kind: "ReleaseGroup" },
    recording: { id: "recording", name: "Song", kind: "Recording" },
    track: { id: "track", name: "Song", kind: "Track" },
    factor: { id: "factor", name: "Producer", kind: "Artist" },
  };
  return {
    relationship: { findMany: async () => [{ targetId: "group" }] },
    entity: {
      findMany: async ({ where }) =>
        assertions.filter((r) =>
          where.OR.some((c) => c.extra.equals === r.extra.subjectId),
        ),
      findFirst: async ({ where }) => assertions.find((r) => r.id === where.id),
    },
    $queryRaw: async (query, ...values) => {
      const sql = query.sql || query.join("?");
      if (sql.includes("SELECT t.id,r.id AS recording")) return members;
      if (sql.includes("providerTypeName")) return [];
      if (sql.includes("SELECT e.id,e.name"))
        return (query.values.find(Array.isArray) || [])
          .map((id) => nodes[id])
          .filter(Boolean);
      throw Error("Unexpected query " + sql);
    },
  };
}
const album = {
  id: "album-default",
  extra: {
    subjectId: "group",
    subjectType: "ReleaseGroup",
    factorId: "factor",
    role: "producer",
    mode: "add",
    scope: "all-tracks",
    sourceUrl: "https://example.org/album",
    excerpt: "All tracks produced by Producer.",
  },
};
const exception = {
  id: "exception",
  extra: {
    subjectId: "recording",
    subjectType: "Recording",
    releaseId: "release",
    factorId: "factor",
    role: "producer",
    mode: "exclude",
    scope: "direct",
    overridesAssertionId: "album-default",
  },
};
test("track credit resolution includes its recording exception and refuses ambiguous positions", async () => {
  const db = fixture({ assertions: [album, exception] });
  const r = await executeResearchTool(
    "credits",
    { releaseId: "release", trackId: "track" },
    { db },
  );
  assert.equal(r.data.effective.length, 0);
  assert.equal(r.data.excluded[0].id, "album-default");
  await assert.rejects(
    executeResearchTool(
      "credits",
      { releaseId: "release", recordingId: "recording" },
      {
        db: fixture({
          members: [
            { id: "a", recording: "recording" },
            { id: "b", recording: "recording" },
          ],
        }),
      },
    ),
    /multiple track positions/,
  );
});
test("context-free factor comparisons exclude edition-restricted claims", async () => {
  const restricted = {
    id: "restricted",
    extra: { ...exception.extra, mode: "add" },
  };
  const r = await executeResearchTool(
    "compare_factors",
    { recordingIds: ["recording", "other"] },
    { db: fixture({ assertions: [restricted] }) },
  );
  assert.equal(r.data.withEvidence, 0);
  assert.equal(r.data.editionRestrictedClaims, 1);
});
test("ReleaseGroup defaults accept edition-bound exceptions and expose exact approval scope", async () => {
  const db = fixture({ assertions: [album] });
  const r = await executeResearchTool(
    "prepare_enrichment",
    {
      ...exception.extra,
      sourceUrl: "https://example.org/song",
      excerpt: "Producer did not produce this track.",
      certainty: "user-stated",
    },
    {
      db,
      userPrompt:
        "https://example.org/song Producer did not produce this track.",
    },
  );
  assert.match(r.decision.display.subjectIdentity, /recording/);
  assert.match(r.decision.display.edition, /release/);
  assert.match(r.decision.display.overrides, /album-default/);
  assert.match(r.decision.display.overrides, /https:\/\/example.org\/album/);
});
