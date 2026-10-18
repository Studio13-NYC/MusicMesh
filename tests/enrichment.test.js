const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateAssertion,
  resolveCredits,
  compareFactors,
  validateConfidence,
  validateEvidence,
  confidenceRevision,
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
test("tentative scores are persistable judgments and evidence summaries remain labeled", () => {
  const a = { ...base, confidenceScore: 35, confidenceReason: "Provider credit; exact model remains uncertain", evidenceKind: "summary", excerpt: "The source attributes this production credit." };
  assert.equal(validateAssertion(a), a);
  validateEvidence(a, { evidenceTexts: [{ url: a.sourceUrl, text: "Producer credits: X" }] });
  assert.throws(() => validateEvidence({ ...a, evidenceKind: "quote" }, { evidenceTexts: [{ url: a.sourceUrl, text: "Producer credits: X" }] }), /exact excerpt/);
  assert.throws(() => validateEvidence(a, { userPrompt: a.sourceUrl }), /bare URL/);
  assert.throws(() => validateConfidence({ ...a, confidenceScore: 101 }), /0 to 100/);
  assert.throws(() => validateConfidence({ ...a, confidenceScore: NaN }), /0 to 100/);
});
test("reassessments preserve history, allow decreases and never auto-inflate repeated sources", () => {
  const a = { ...base, confidenceScore: 60, confidenceReason: "One provider credit" };
  const first = confidenceRevision({}, a, { actor: "Nick", at: "2026-10-18T20:00:00Z", decisionId: "one" });
  const same = confidenceRevision(first, a, { actor: "Nick", at: "2026-10-18T20:01:00Z", decisionId: "two" });
  assert.equal(same.confidenceScore, 60);
  const lower = confidenceRevision(same, { ...a, confidenceScore: 20, confidenceReason: "Conflicting session evidence", evidenceRelation: "contradict" }, { actor: "Nick", at: "2026-10-18T20:02:00Z", decisionId: "three" });
  assert.equal(first.confidenceHistory.length, 1);
  assert.deepEqual(lower.confidenceHistory.map(h => h.confidenceScore), [60, 60, 20]);
  assert.equal(lower.confidenceHistory[2].evidenceRelation, "contradict");
});
test("comparison retains competing assessments and excludes zero-confidence positive counts", () => {
  const result = compareFactors([
    { id: "r1", factors: [{ ...base, confidenceScore: 60 }, { ...base, id: "b", confidenceScore: 80 }] },
    { id: "r2", factors: [{ ...base, confidenceScore: 0 }] },
    { id: "r3", factors: [base] },
  ]);
  assert.equal(result.factors[0].recordingCount, 2);
  assert.equal(result.factors[0].assessments.length, 4);
  assert.equal(result.factors[0].assessments.at(-1).confidenceScore, null);
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
test("zero-confidence exceptions do not remove credits and histories stay on demand", () => {
  const result = resolveCredits({ releaseId: "release:1", recordingId: "r1", assertions: [
    { ...base, confidenceScore: 80, confidenceHistory: [{ confidenceScore: 80 }] },
    { ...base, id: "exception", subjectId: "r1", subjectType: "Recording", scope: "direct", releaseId: "release:1", mode: "exclude", overridesAssertionId: "a", confidenceScore: 0 },
    { ...base, id: "unsupported", confidenceScore: 0 },
  ] });
  assert.deepEqual(result.effective.map(a => a.id), ["a"]);
  assert.equal(Object.hasOwn(result.effective[0], "confidenceHistory"), false);
  assert.equal(result.excluded.length, 0);
  assert.equal(result.unsupported.length, 2);
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
