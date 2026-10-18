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
];
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
    !["Release", "ReleaseGroup", "Track", "Recording"].includes(a.subjectType)
  )
    throw new Error("Unsupported subject type");
  if (!ROLES.includes(a.role)) throw new Error("Unsupported credit role");
  if (
    !["album-credit", "all-tracks", "direct"].includes(a.scope) ||
    (["Recording", "Track"].includes(a.subjectType) && a.scope !== "direct")
  )
    throw new Error("Invalid assertion scope");
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
  const album = assertions.filter(
    (a) =>
      (!a.releaseId || a.releaseId === releaseId) &&
      ((a.subjectType === "Release" && a.subjectId === releaseId) ||
        (a.subjectType === "ReleaseGroup" &&
          releaseGroupId &&
          a.subjectId === releaseGroupId)),
  );
  const defaults = album
    .filter((a) => a.scope === "all-tracks" && a.mode === "add")
    .map((a) => ({ ...a, inherited: true }));
  const direct = assertions.filter(
    (a) =>
      ((a.subjectType === "Recording" && a.subjectId === recordingId) ||
        (a.subjectType === "Track" && a.subjectId === trackId)) &&
      (!a.releaseId || a.releaseId === releaseId),
  );
  const removed = new Set(
    direct
      .filter((a) => a.mode === "exclude" || a.mode === "replace")
      .map((a) => a.overridesAssertionId),
  );
  const effective = [
    ...defaults,
    ...direct
      .filter((a) => a.mode === "add" || a.mode === "replace")
      .map((a) => ({ ...a, inherited: false })),
  ].filter((a) => !removed.has(a.id));
  return {
    effective,
    excluded: defaults.filter((a) => removed.has(a.id)),
    albumCredits: album.filter((a) => a.scope === "album-credit"),
    exceptions: direct.filter((a) => a.mode !== "add"),
    meaning:
      "Inherited credits require explicit all-tracks evidence; multiple values are retained, not silently resolved.",
  };
}
function compareFactors(recordings) {
  const map = new Map();
  for (const row of recordings) {
    const seen = new Set();
    for (const a of row.factors) {
      const key = JSON.stringify([a.role, a.factorId]);
      if (seen.has(key)) continue;
      seen.add(key);
      const item = map.get(key) || {
        role: a.role,
        factorId: a.factorId,
        factorName: a.factorName || a.factorId,
        factorType: a.factorType || null,
        recordingIds: [],
        assertionIds: [],
      };
      item.recordingIds.push(row.id);
      item.assertionIds.push(a.id);
      map.set(key, item);
    }
  }
  return {
    total: recordings.length,
    withEvidence: recordings.filter((r) => r.factors.length).length,
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
      "Shared factors suggest hypotheses, not causes of preference. Missing evidence is not evidence of absence. Plays are not likes.",
  };
}
module.exports = { ROLES, validateAssertion, resolveCredits, compareFactors };
