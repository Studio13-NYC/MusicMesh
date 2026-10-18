const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateAssertion,
  resolveCredits,
  compareFactors,
} = require("../src/enrichment");
const base = {
  id: "a",
  subjectId: "release:1",
  subjectType: "Release",
  factorId: "artist:1",
  role: "producer",
  scope: "all-tracks",
  mode: "add",
  sourceUrl: "https://example.org/credits",
  excerpt: "Produced by X on all tracks",
  certainty: "documented",
};
test("album credits require explicit all-tracks scope to inherit", () => {
  const scopedGroup = {
    ...base,
    subjectType: "ReleaseGroup",
    subjectId: "group:1",
    releaseId: "release:1",
  };
  assert.equal(
    resolveCredits({
      releaseId: "release:2",
      releaseGroupId: "group:1",
      recordingId: "r1",
      assertions: [scopedGroup],
    }).effective.length,
    0,
  );
  assert.equal(
    resolveCredits({
      releaseId: "release:1",
      recordingId: "r1",
      assertions: [base],
    }).effective.length,
    1,
  );
  assert.equal(
    resolveCredits({
      releaseId: "release:1",
      recordingId: "r1",
      assertions: [{ ...base, scope: "album-credit" }],
    }).effective.length,
    0,
  );
  assert.equal(
    resolveCredits({
      releaseId: "release:2",
      recordingId: "r1",
      assertions: [base],
    }).effective.length,
    0,
  );
});
test("track exceptions target exact assertions and keep additions", () => {
  const exception = {
    ...base,
    id: "b",
    subjectId: "r1",
    subjectType: "Recording",
    releaseId: "release:1",
    scope: "direct",
    mode: "exclude",
    overridesAssertionId: "a",
  };
  const added = {
    ...exception,
    id: "c",
    mode: "add",
    overridesAssertionId: null,
    factorId: "artist:2",
  };
  const result = resolveCredits({
    releaseId: "release:1",
    recordingId: "r1",
    assertions: [base, exception, added],
  });
  assert.deepEqual(
    result.effective.map((x) => x.factorId),
    ["artist:2"],
  );
  assert.equal(result.excluded[0].id, "a");
  assert.equal(
    resolveCredits({
      releaseId: "release:1",
      recordingId: "r2",
      assertions: [base, exception],
    }).effective.length,
    1,
  );
});
test("assertion validation rejects inferred album promotion and missing evidence", () => {
  assert.throws(
    () => validateAssertion({ ...base, subjectType: "Recording" }),
    /scope/,
  );
  assert.throws(() => validateAssertion({ ...base, excerpt: "" }), /excerpt/);
  assert.throws(
    () => validateAssertion({ ...base, sourceUrl: "file:///secret" }),
    /https/,
  );
});
test("shared factors use explicit comparisons and expose incomplete coverage", () => {
  const r = compareFactors([
    { id: "r1", factors: [base] },
    { id: "r2", factors: [base] },
    { id: "r3", factors: [] },
  ]);
  assert.equal(r.factors[0].recordingCount, 2);
  assert.equal(r.withEvidence, 2);
  assert.equal(r.total, 3);
  assert.match(r.interpretation, /hypothes/i);
});
