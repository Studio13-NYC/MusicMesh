// Album evidence is evaluated in its edition context, never copied to recordings.
const ROLES = [
  "producer",
  "engineer",
  "mixing-engineer",
  "mastering-engineer",
  "performer",
  "instrument",
  "equipment",
  "studio",
  "genre",
  "technique",
  "influenced-by",
];
function validateConfidence(a) {
  if (!Number.isInteger(a.confidenceScore) || a.confidenceScore < 0 || a.confidenceScore > 100)
    throw new Error("Confidence score must be an integer from 0 to 100");
  if (typeof a.confidenceReason !== "string" || !a.confidenceReason.trim() || a.confidenceReason.length > 1200)
    throw new Error("A confidence reason of 1-1200 characters is required");
}
function validateEvidence(a, ctx = {}) {
  if (!["quote", "summary"].includes(a.evidenceKind || "quote"))
    throw new Error("Evidence kind must be quote or summary");
  const url = new URL(a.sourceUrl);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Source must be a public https URL");
  if (typeof a.excerpt !== "string" || !a.excerpt.trim() || a.excerpt.length > 1200)
    throw new Error("Evidence text must contain 1-1200 characters");
  const fetched = (ctx.evidenceTexts || []).filter(t => t.url === a.sourceUrl && t.text?.trim());
  const supplied = [ctx.userPrompt, ...(ctx.userStatements || [])].filter(t => typeof t === "string" && t.includes(a.sourceUrl));
  if ((a.evidenceKind || "quote") === "quote") {
    if (![...fetched.map(t => t.text), ...supplied].some(t => t.includes(a.excerpt)))
      throw new Error("The exact excerpt must be supplied by the user or retrieved from stored evidence first.");
  } else if (!fetched.length && !supplied.some(t => t.includes(a.excerpt))) {
    throw new Error("A summary needs retrieved source text or a user-supplied source summary; a bare URL is not evidence.");
  }
}
// The reviewer supplies a reasoned assessment, not a statistically calibrated probability.
// Repeated URLs never add points automatically. Every revision retains the old assessment.
function confidenceRevision(previous, assessment, { actor, at, decisionId }) {
  validateConfidence(assessment);
  const revision = (previous.confidenceRevision || 0) + 1;
  const history = [...(previous.confidenceHistory || [])];
  if (!history.length && previous.confidenceScore != null)
    history.push({ revision: 0, confidenceScore: previous.confidenceScore, confidenceReason: previous.confidenceReason || "Legacy assessment; rationale unavailable", at: previous.confidenceUpdatedAt || null, actor: previous.attribution || null, sourceUrl: previous.sourceUrl || null });
  history.push({ revision, confidenceScore: assessment.confidenceScore, confidenceReason: assessment.confidenceReason.trim(), sourceUrl: assessment.sourceUrl, excerpt: assessment.excerpt, evidenceKind: assessment.evidenceKind || "quote", evidenceRelation: assessment.evidenceRelation || "support", actor, at, decisionId });
  return { confidenceScore: assessment.confidenceScore, confidenceReason: assessment.confidenceReason.trim(), confidenceRevision: revision, confidenceUpdatedAt: at, confidenceHistory: history };
}
function validateAssertion(a) {
  for (const key of [
    "subjectId",
    "subjectType",
    "factorId",
    "role",
    "scope",
    "mode",
    "sourceUrl",
    "excerpt",
    "certainty",
  ])
    if (typeof a[key] !== "string" || !a[key].trim())
      throw new Error(`Assertion ${key} is required`);
  if (
    !["Artist", "Release", "ReleaseGroup", "Track", "Recording"].includes(a.subjectType)
  )
    throw new Error("Unsupported subject type");
  if (!ROLES.includes(a.role)) throw new Error("Unsupported credit role");
  if (a.subjectType === "Artist") {
    if (a.scope !== "artist-context" || a.mode !== "add" || a.releaseId || a.overridesAssertionId)
      throw new Error("Artist context cannot inherit to recordings or override album credits");
    if (!["instrument", "equipment", "technique", "genre", "influenced-by"].includes(a.role))
      throw new Error("Artist context requires a practice, equipment, genre or influence role");
  } else if (
    !["album-credit", "all-tracks", "direct"].includes(a.scope) ||
    (["Recording", "Track"].includes(a.subjectType) && a.scope !== "direct")
  )
    throw new Error("Invalid assertion scope");
  if (a.role === "influenced-by" && a.subjectType !== "Artist")
    throw new Error("Influence describes artist context, not a recording credit");
  if (!["add", "exclude", "replace"].includes(a.mode))
    throw new Error("Invalid assertion mode");
  if (a.mode !== "add" && !a.overridesAssertionId)
    throw new Error("An exception must name the original assertion");
  if (a.mode !== "add" && !["Recording", "Track"].includes(a.subjectType))
    throw new Error("Exceptions require track or recording context");
  if (a.mode !== "add" && !a.releaseId)
    throw new Error("Exceptions require a release context");
  if (!["documented", "uncertain", "user-stated"].includes(a.certainty))
    throw new Error("Invalid assertion certainty");
  if (a.confidenceScore !== undefined) validateConfidence(a);
  if (a.evidenceKind !== undefined && !["quote", "summary"].includes(a.evidenceKind))
    throw new Error("Invalid evidence kind");
  const url = new URL(a.sourceUrl);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Source must be a public https URL");
  if (a.excerpt.length > 1200)
    throw new Error("Evidence excerpt must be at most 1200 characters");
  return a;
}
function resolveCredits({
  releaseId,
  releaseGroupId,
  recordingId,
  trackId,
  assertions = [],
}) {
  // Assessment history is available through claim_history, not every credit read.
  assertions = assertions.map(({ confidenceHistory, ...claim }) => claim);
  const album = assertions.filter(
    (a) =>
      (!a.releaseId || a.releaseId === releaseId) &&
      ((a.subjectType === "Release" && a.subjectId === releaseId) ||
        (a.subjectType === "ReleaseGroup" &&
          releaseGroupId &&
          a.subjectId === releaseGroupId)),
  );
  const defaults = album
    .filter((a) => a.scope === "all-tracks" && a.mode === "add" && a.confidenceScore !== 0)
    .map((a) => ({ ...a, inherited: true }));
  const direct = assertions.filter(
    (a) =>
      ((a.subjectType === "Recording" && a.subjectId === recordingId) ||
        (a.subjectType === "Track" && a.subjectId === trackId)) &&
      (!a.releaseId || a.releaseId === releaseId),
  );
  const removed = new Set(
    direct
      .filter((a) => a.confidenceScore !== 0 && (a.mode === "exclude" || a.mode === "replace"))
      .map((a) => a.overridesAssertionId),
  );
  const effective = [
    ...defaults,
    ...direct
      .filter((a) => a.confidenceScore !== 0 && (a.mode === "add" || a.mode === "replace"))
      .map((a) => ({ ...a, inherited: false })),
  ].filter((a) => !removed.has(a.id));
  return {
    effective,
    excluded: defaults.filter((a) => removed.has(a.id)),
    albumCredits: album.filter((a) => a.scope === "album-credit"),
    exceptions: direct.filter((a) => a.mode !== "add"),
    unsupported: [...album, ...direct].filter((a) => a.confidenceScore === 0),
    meaning:
      "Inherited credits require explicit all-tracks evidence; multiple values are retained, not silently resolved. Zero-confidence claims remain inspectable but do not apply credits or exceptions. Full assessment history is available through claim_history.",
  };
}
function compareFactors(recordings) {
  const map = new Map();
  for (const row of recordings) {
    const seen = new Set();
    for (const a of row.factors) {
      const key = JSON.stringify([a.role, a.factorId]);
      const item = map.get(key) || {
        role: a.role,
        factorId: a.factorId,
        factorName: a.factorName || a.factorId,
        factorType: a.factorType || null,
        recordingIds: [],
        assertionIds: [],
        assessments: [],
      };
      if (!seen.has(key) && a.confidenceScore !== 0) item.recordingIds.push(row.id);
      if (a.confidenceScore !== 0) seen.add(key);
      item.assertionIds.push(a.id);
      item.assessments.push({ recordingId: row.id, assertionId: a.id, confidenceScore: a.confidenceScore ?? null, confidenceReason: a.confidenceReason || null, certainty: a.certainty || null });
      map.set(key, item);
    }
  }
  return {
    total: recordings.length,
    withEvidence: recordings.filter((r) => r.factors.some(a => a.confidenceScore !== 0)).length,
    factors: [...map.values()]
      .map((f) => ({
        ...f,
        recordingCount: f.recordingIds.length,
        missingFrom: recordings
          .filter((r) => !f.recordingIds.includes(r.id))
          .map((r) => r.id),
      }))
      .sort((a, b) => b.recordingCount - a.recordingCount),
    interpretation:
      "Shared factors suggest hypotheses, not causes of preference. Inspect assessments: low confidence is tentative, null is unassessed, and zero is excluded from positive counts. Scores are reviewer judgments, not calibrated probabilities. Missing evidence is not evidence of absence. Plays are not likes.",
  };
}
module.exports = { ROLES, validateAssertion, resolveCredits, compareFactors, validateConfidence, validateEvidence, confidenceRevision };
