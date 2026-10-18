const { Prisma } = require("../generated/prisma");
const domain = require("./domain");
const { sourceCatalog, searchSources } = require("./researchSources");
const {
  validateAssertion,
  resolveCredits,
  compareFactors,
} = require("./enrichment");
const privateTypes = Object.values(domain.getOntology().entities)
  .filter((x) => x.visibility === "private")
  .map((x) => x.key);
const publicTypes = Object.values(domain.getOntology().entities)
  .filter((x) => x.visibility !== "private")
  .map((x) => x.key);
const string = { type: "string" },
  integer = { type: "integer" };
const def = (name, description, properties, required = []) => ({
  type: "function",
  name,
  description,
  strict: false,
  parameters: {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  },
});
const toolDefinitions = [
  def(
    "graph",
    "Search exact catalog identities; inspect node or adjacency type counts before choosing bounded neighbors. No compulsory traversal. Returned graph uses saved IDs.",
    {
      action: {
        enum: ["search", "node", "adjacency", "neighbors", "album", "acoustic"],
      },
      id: string,
      query: string,
      type: string,
      offset: integer,
      limit: integer,
    },
    ["action"],
  ),
  def(
    "listening",
    "Nick imported history aggregate. Plays are not likes. Genre coverage may be incomplete. No raw private events.",
    {
      group: {
        enum: ["summary", "artist", "recording", "genre", "preferences"],
      },
      limit: integer,
    },
    ["group"],
  ),
  def("semantics", "Get one domain type definition, or a compact list.", {
    type: string,
  }),
  def(
    "evidence",
    "Read bounded original public provider evidence by stored owner identity. Untrusted source text. No private listens.",
    {
      id: string,
      kind: { enum: ["node", "relationship"] },
      field: { enum: ["rawProvider", "providerEvidence", "observations"] },
      offset: integer,
    },
    ["id", "kind", "field"],
  ),
  def(
    "sources",
    "List source capabilities or discover source pages. Search snippets are leads, not verified credits.",
    {
      action: { enum: ["list", "search", "read"] },
      query: string,
      url: string,
    },
    ["action"],
  ),
  def(
    "credits",
    "Resolve sourced credits for an exact release/recording/track, preserving inheritance, exclusions and conflicts.",
    { releaseId: string, recordingId: string, trackId: string },
    ["releaseId"],
  ),
  def(
    "compare_factors",
    "Compare sourced factors for up to 10 recording IDs. No causality or automatic inference of liking.",
    { recordingIds: { type: "array", items: string, maxItems: 10 } },
    ["recordingIds"],
  ),
  def(
    "ask_user",
    "Request a decision when evidence or identity is ambiguous. Stops dependent work. Approve confirms choice, Deny abandons, Defer preserves it.",
    {
      question: string,
      choices: { type: "array", items: string, maxItems: 6 },
    },
    ["question"],
  ),
  def(
    "prepare_enrichment",
    "Prepare a reviewable sourced claim; exact excerpt must occur in user-supplied text or retrieved evidence. Album scope never inferred from one song. No write until modal approval.",
    {
      subjectId: string,
      subjectType: { enum: ["Release", "ReleaseGroup", "Track", "Recording"] },
      factorId: string,
      newFactor: {
        type: "object",
        properties: {
          type: {
            enum: [
              "Artist",
              "Place",
              "Instrument",
              "Equipment",
              "Guitar",
              "Synthesizer",
              "Console",
              "Amplifier",
              "EffectsPedal",
              "Genre",
              "Technique",
              "Style",
            ],
          },
          name: string,
        },
        required: ["type", "name"],
        additionalProperties: false,
      },
      role: string,
      scope: { enum: ["album-credit", "all-tracks", "direct"] },
      mode: { enum: ["add", "exclude", "replace"] },
      overridesAssertionId: string,
      releaseId: string,
      sourceUrl: string,
      excerpt: string,
      certainty: { enum: ["documented", "uncertain", "user-stated"] },
    },
    [
      "subjectId",
      "subjectType",
      "role",
      "scope",
      "mode",
      "sourceUrl",
      "excerpt",
      "certainty",
    ],
  ),
  def(
    "prepare_preference",
    "Prepare an explicitly user-stated like/dislike/observation for review, never infer it from play count.",
    {
      recordingId: string,
      value: { enum: ["like", "dislike", "observation"] },
      note: string,
    },
    ["recordingId", "value", "note"],
  ),
];
function identity(id) {
  if (typeof id !== "string" || !id.trim() || id.length > 512)
    throw new Error("A stored identity is required");
  return id;
}
function limit(value, max = 30, fallback = 12) {
  return Number.isInteger(value) ? Math.max(1, Math.min(max, value)) : fallback;
}
function offset(value) {
  return Number.isInteger(value) ? Math.max(0, Math.min(1000, value)) : 0;
}
function dbFor(context) {
  return context.db || require("./postgres").getDatabase();
}
const visible = {
  primaryLabel: { in: publicTypes },
  NOT: { labels: { hasSome: privateTypes } },
};
// Explicit projection prevents archived payloads or arbitrary properties entering context.
const fields = [
  "country",
  "date",
  "firstReleaseDate",
  "durationMs",
  "artistType",
  "disambiguation",
  "hydrationStatus",
  "externalId",
  "evidenceRefs",
  "mediumId",
  "recordingId",
  "releaseId",
  "position",
  "subjectId",
  "subjectType",
  "factorId",
  "role",
  "scope",
  "mode",
  "overridesAssertionId",
  "sourceUrl",
  "excerpt",
  "certainty",
  "attribution",
  "features",
  "extractorVersion",
  "recordingIds",
  "score",
  "scoreMeaning",
  "featureFamily",
  "method",
  "cohortId",
];
const extraSql = Prisma.sql`jsonb_strip_nulls(jsonb_build_object(${Prisma.join(fields.flatMap((k) => [Prisma.sql`${k}::text`, Prisma.sql`e.extra->${k}::text`]))}))`;
async function nodesByIds(db, ids) {
  if (!ids.length) return [];
  return db.$queryRaw(
    Prisma.sql`SELECT e.id,e.name,e."primaryLabel" AS kind,${extraSql} AS properties FROM entities e WHERE e.id=ANY(${ids}::text[]) AND e."primaryLabel"=ANY(${publicTypes}::text[]) AND NOT e.labels && ${privateTypes}::text[] ORDER BY e.id`,
  );
}
async function node(db, id) {
  const rows = await nodesByIds(db, [identity(id)]);
  if (!rows.length) throw new Error("Public catalog identity not found");
  return rows[0];
}
function asGraph(nodes, edges = []) {
  return {
    nodes: nodes.map((n, i) => ({
      id: n.id,
      label: n.name || n.id,
      kind: n.kind,
      summary: { labels: [n.kind] },
      x: (i % 6) * 150,
      y: Math.floor(i / 6) * 110,
      colorKey:
        {
          Release: "album",
          ReleaseGroup: "album",
          Recording: "track",
          Track: "track",
          Place: "venue",
        }[n.kind] || n.kind?.toLowerCase(),
      shapeKey: "ellipse",
    })),
    edges: edges.map((r) => ({
      id: r.id,
      source: r.sourceId,
      target: r.targetId,
      type: r.type,
      label: r.providerTypeName || r.type,
      summary: {},
    })),
    meta: { preview: false, source: "stored-catalog" },
  };
}
function mergeGraph(before, next) {
  const nodes = [
    ...new Map(
      [...(before?.nodes || []), ...(next?.nodes || [])].map((n) => [n.id, n]),
    ).values(),
  ].slice(0, 100);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = [
    ...new Map(
      [...(before?.edges || []), ...(next?.edges || [])].map((e) => [e.id, e]),
    ).values(),
  ]
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .slice(0, 160);
  return {
    nodes,
    edges,
    seedNode: nodes[0] || null,
    meta: {
      preview: false,
      source: "stored-catalog",
      nodeCount: nodes.length,
      edgeCount: edges.length,
      truncated:
        (before?.nodes?.length || 0) + (next?.nodes?.length || 0) > 100,
    },
  };
}
async function graphTool(a, ctx) {
  if (
    a.action === "search" &&
    (typeof a.query !== "string" || !a.query.trim() || a.query.length > 200)
  )
    throw new Error("Search query must be 1–200 characters");
  if (a.action !== "search") identity(a.id);
  const db = dbFor(ctx),
    take = limit(a.limit),
    skip = offset(a.offset);
  if (a.action === "search") {
    const rows =
      await db.$queryRaw`SELECT id,name,"primaryLabel" AS kind FROM entities WHERE "primaryLabel"=ANY(${publicTypes}::text[]) AND NOT labels && ${privateTypes}::text[] AND strpos(lower("searchText"),lower(${a.query}))>0 AND (${a.type || ""}='' OR "primaryLabel"=${a.type || ""}) ORDER BY (lower(name)=lower(${a.query})) DESC,id LIMIT ${take + 1} OFFSET ${skip}`;
    return {
      data: {
        nodes: rows.slice(0, take),
        hasMore: rows.length > take,
        nextOffset: skip + take,
      },
      graph: asGraph(rows.slice(0, take)),
    };
  }
  const root = await node(db, a.id);
  if (a.action === "node") return { data: root, graph: asGraph([root]) };
  if (a.action === "adjacency") {
    const rows =
      await db.$queryRaw`SELECT r.type,coalesce(r.extra->>'providerTypeName','') AS role,count(*)::int AS count FROM relationships r JOIN entities e ON e.id=CASE WHEN r."sourceId"=${a.id} THEN r."targetId" ELSE r."sourceId" END WHERE (r."sourceId"=${a.id} OR r."targetId"=${a.id}) AND e."primaryLabel"=ANY(${publicTypes}::text[]) AND NOT e.labels && ${privateTypes}::text[] GROUP BY r.type, r.extra->>'providerTypeName' ORDER BY count(*) DESC LIMIT 41`;
    return {
      data: {
        node: root,
        relationshipFamilies: rows.slice(0, 40),
        truncated: rows.length > 40,
      },
      graph: asGraph([root]),
    };
  }
  if (a.action === "neighbors") {
    const rows =
      await db.$queryRaw`SELECT r.id,r."sourceId",r."targetId",r.type,r.extra->>'providerTypeName' AS "providerTypeName",r.extra->'attributes' AS attributes FROM relationships r JOIN entities e ON e.id=CASE WHEN r."sourceId"=${a.id} THEN r."targetId" ELSE r."sourceId" END WHERE (r."sourceId"=${a.id} OR r."targetId"=${a.id}) AND e."primaryLabel"=ANY(${publicTypes}::text[]) AND NOT e.labels && ${privateTypes}::text[] AND (${a.type || ""}='' OR r.type=${a.type || ""} OR r.extra->>'providerTypeName'=${a.type || ""}) ORDER BY r.id LIMIT ${take + 1} OFFSET ${skip}`;
    const edges = rows.slice(0, take),
      nodes = await nodesByIds(db, [
        ...new Set([a.id, ...edges.flatMap((r) => [r.sourceId, r.targetId])]),
      ]);
    return {
      data: {
        nodes,
        relationships: edges,
        hasMore: rows.length > take,
        nextOffset: skip + take,
      },
      graph: asGraph(nodes, edges),
    };
  }
  if (a.action === "album") {
    if (root.kind !== "Release")
      throw new Error(
        "Album tracklist requires a Release edition ID; explore EditionOf for a ReleaseGroup",
      );
    const rows =
      await db.$queryRaw`SELECT t.id AS "trackId",t.name,t.extra->>'position' AS position,m.id AS "mediumId",rec.id AS "recordingId",rec.name AS "recordingName" FROM relationships hm JOIN entities m ON m.id=hm."targetId" JOIN relationships ht ON ht."sourceId"=m.id AND ht.type='HasTrack' JOIN entities t ON t.id=ht."targetId" JOIN relationships ur ON ur."sourceId"=t.id AND ur.type='UsesRecording' JOIN entities rec ON rec.id=ur."targetId" WHERE hm."sourceId"=${a.id} AND hm.type='HasMedium' ORDER BY m.id,(t.extra->>'position')::int,t.id LIMIT ${take + 1} OFFSET ${skip}`;
    return {
      data: {
        release: root,
        tracks: rows.slice(0, take),
        hasMore: rows.length > take,
        nextOffset: skip + take,
      },
      graph: asGraph([root]),
    };
  }
  if (a.action === "acoustic") {
    if (root.kind !== "Recording")
      throw new Error("Acoustic comparison requires a Recording");
    const rows =
      await db.$queryRaw`SELECT s.id,s.name,s.extra->>'featureFamily' AS family,s.extra->>'score' AS score,s.extra->>'scoreMeaning' AS "scoreMeaning",s.extra->>'method' AS method,s.extra->>'cohortId' AS cohort,s.extra->'recordingIds' AS "recordingIds" FROM relationships r JOIN entities s ON s.id=r."sourceId" WHERE r."targetId"=${a.id} AND r.type='ComparesRecording' ORDER BY s.id LIMIT ${take + 1} OFFSET ${skip}`;
    return {
      data: {
        comparisons: rows.slice(0, take),
        hasMore: rows.length > take,
        meaning:
          "Distances are comparable only within the same method, feature family and cohort. No causal or preference inference.",
      },
    };
  }
  throw new Error("Unknown graph action");
}
async function listening(a, ctx) {
  if (
    !["summary", "artist", "recording", "genre", "preferences"].includes(
      a.group,
    )
  )
    throw new Error("Invalid listening aggregate");
  const db = dbFor(ctx),
    take = limit(a.limit, 30, 10),
    account = process.env.MUSICMESH_LISTENING_ACCOUNT || "bobdobbsnyc";
  if (a.group === "preferences")
    return {
      data: {
        signals:
          await db.$queryRaw`SELECT id,extra->>'recordingId' AS "recordingId",extra->>'value' AS value,extra->>'note' AS note FROM entities WHERE "primaryLabel"='PreferenceSignal' AND extra->>'account'=${ctx.actor || "Nick"} ORDER BY id LIMIT ${take}`,
        meaning: "Explicit user statements only, not inferred from plays.",
      },
    };
  const summary =
    await db.$queryRaw`SELECT count(*)::int AS plays,count(DISTINCT extra->>'submittedArtist')::int AS artists,min((extra->>'listenedAt')::bigint)::text AS "firstListenedAt",max((extra->>'listenedAt')::bigint)::text AS "lastListenedAt" FROM entities WHERE "primaryLabel"='ListeningEvent' AND extra->>'sourceAccount'=${account}`;
  if (a.group === "summary")
    return {
      data: {
        ...summary[0],
        meaning: "Nick imported history; plays do not establish liking.",
      },
    };
  if (a.group === "artist")
    return {
      data: {
        ...summary[0],
        groups:
          await db.$queryRaw`SELECT extra->>'submittedArtist' AS artist,count(*)::int AS plays FROM entities WHERE "primaryLabel"='ListeningEvent' AND extra->>'sourceAccount'=${account} GROUP BY extra->>'submittedArtist' ORDER BY count(*) DESC,extra->>'submittedArtist' LIMIT ${take}`,
        meaning:
          "Grouped by original submitted artist text, not fully resolved artist identity.",
      },
    };
  const mappings = Prisma.sql`SELECT DISTINCT m.extra->>'sourceId' AS event_id,m.extra->>'targetId' AS recording_id FROM entities m JOIN entities play ON play.id=m.extra->>'sourceId' AND play."primaryLabel"='ListeningEvent' AND play.extra->>'sourceAccount'=${account} WHERE m."primaryLabel"='IdentityMapping' AND m.extra->>'status' IN ('provider-matched','verified')`;
  if (a.group === "recording")
    return {
      data: {
        ...summary[0],
        groups: await db.$queryRaw(
          Prisma.sql`WITH mapped AS (${mappings}) SELECT rec.id,rec.name,count(DISTINCT mapped.event_id)::int AS plays FROM mapped JOIN entities rec ON rec.id=mapped.recording_id AND rec."primaryLabel"='Recording' GROUP BY rec.id,rec.name ORDER BY count(DISTINCT mapped.event_id) DESC,rec.id LIMIT ${take}`,
        ),
        meaning:
          "Resolved recording mappings only; unresolved plays remain in total.",
      },
    };
  const rows = await db.$queryRaw(
    Prisma.sql`WITH mapped AS (${mappings}) SELECT g.id,g.name,count(DISTINCT mapped.event_id)::int AS plays FROM mapped JOIN entities a ON a."primaryLabel"='EvidenceAssertion' AND a.extra->>'subjectId'=mapped.recording_id AND a.extra->>'role'='genre' AND a.extra->>'mode'='add' AND a.extra->>'scope'='direct' AND coalesce(a.extra->>'releaseId','')='' JOIN entities g ON g.id=a.extra->>'factorId' AND g."primaryLabel"='Genre' GROUP BY g.id,g.name ORDER BY count(DISTINCT mapped.event_id) DESC,g.id LIMIT ${take}`,
  );
  return {
    data: {
      ...summary[0],
      groups: rows,
      coverage:
        "Direct sourced recording genre assertions without edition restrictions only. Edition-restricted claims are excluded because plays do not establish the edition. Imported provider tags are retained in evidence but are not yet normalized genre assignments. Multiple genres can count the same play.",
      conclusion: rows.length
        ? "Partial coverage; cannot claim a complete most-listened genre."
        : "No queryable genre assignments yet; the listening history is present.",
    },
  };
}
async function credits(a, ctx) {
  const db = dbFor(ctx);
  const release = await node(db, identity(a.releaseId));
  if (release.kind !== "Release")
    throw new Error("Credits require an exact Release edition");
  const groupEdges = await db.relationship.findMany({
    where: { sourceId: release.id, type: "EditionOf" },
    select: { targetId: true },
    take: 2,
  });
  const releaseGroupId =
    groupEdges.length === 1 ? groupEdges[0].targetId : null;
  let recordingId = a.recordingId,
    trackId = a.trackId;
  if (a.recordingId || a.trackId) {
    const members =
      await db.$queryRaw`SELECT t.id,r.id AS recording FROM relationships hm JOIN relationships ht ON ht."sourceId"=hm."targetId" AND ht.type='HasTrack' JOIN entities t ON t.id=ht."targetId" JOIN relationships ur ON ur."sourceId"=t.id AND ur.type='UsesRecording' JOIN entities r ON r.id=ur."targetId" WHERE hm."sourceId"=${release.id} AND hm.type='HasMedium' AND (${a.recordingId || ""}='' OR r.id=${a.recordingId || ""}) AND (${a.trackId || ""}='' OR t.id=${a.trackId || ""}) LIMIT 2`;
    if (!members.length)
      throw new Error("Track/recording is not in this release");
    if (members.length > 1)
      throw new Error(
        "Recording has multiple track positions in this edition; choose an exact trackId using the album tracklist",
      );
    recordingId = members[0].recording;
    trackId = members[0].id;
  }
  const ids = [release.id, releaseGroupId, recordingId, trackId].filter(
    Boolean,
  );
  const rows = await db.entity.findMany({
    where: {
      primaryLabel: "EvidenceAssertion",
      OR: ids.map((id) => ({ extra: { path: ["subjectId"], equals: id } })),
    },
    select: { id: true, extra: true },
    take: 201,
  });
  const provider = await providerFactors(db, ids);
  return {
    data: {
      ...resolveCredits({
        ...a,
        recordingId,
        trackId,
        releaseGroupId,
        assertions: [
          ...rows.slice(0, 200).map((r) => ({ id: r.id, ...r.extra })),
          ...provider.factors,
        ],
      }),
      truncated: rows.length > 200 || provider.truncated,
      context: { releaseId: release.id, releaseGroupId, recordingId, trackId },
      coverage:
        "Reviewed assertions and imported MusicBrainz credits. Provider release credits remain album-credit; no automatic all-tracks inference.",
    },
  };
}
async function providerFactors(db, ids) {
  const rows =
    await db.$queryRaw`SELECT r.id,r."sourceId" AS "factorId",r."targetId" AS "subjectId",s.name AS "factorName",t."primaryLabel" AS "subjectType",s."primaryLabel" AS "factorType",r.extra->>'providerTypeName' AS role,r.extra->'attributes' AS attributes FROM relationships r JOIN entities s ON s.id=r."sourceId" JOIN entities t ON t.id=r."targetId" WHERE r."targetId"=ANY(${ids}::text[]) AND r.type='MusicBrainzRelationship' AND s."primaryLabel" IN ('Artist','Place') AND r.extra->>'providerTypeName' IN ('producer','engineer','recording','mix','mastering','instrument','vocal','performer','recorded at','mixed at','mastered at','arranger','programming') ORDER BY r.id LIMIT 401`;
  const factors = [];
  for (const row of rows.slice(0, 400)) {
    const a = {
      ...row,
      scope: row.subjectType === "Recording" ? "direct" : "album-credit",
      mode: "add",
      certainty: "documented",
      source: "musicbrainz",
    };
    factors.push(a);
    if (row.role === "instrument")
      for (const name of Array.isArray(row.attributes) ? row.attributes : [])
        if (typeof name === "string")
          factors.push({
            ...a,
            factorId: "musicbrainz-instrument-attribute:" + name,
            factorName: name,
            factorType: "ProviderAttribute",
            role: "instrument-type",
            meaning:
              "Provider attribute text, not a canonical Instrument identity or equipment model",
          });
  }
  return { factors, truncated: rows.length > 400 };
}
async function executeResearchTool(name, a = {}, ctx = {}) {
  if (!toolDefinitions.some((t) => t.name === name))
    throw new Error("Unknown research tool");
  if (!a || typeof a !== "object" || Array.isArray(a))
    throw new Error("Invalid tool arguments");
  if (name === "graph") return graphTool(a, ctx);
  if (name === "listening") return listening(a, ctx);
  if (name === "semantics")
    return {
      data: a.type
        ? domain.getTypeDefinition(a.type)
        : Object.values(domain.getOntology().entities).map((d) => ({
            type: d.key,
            meaning: d.meaning,
          })),
    };
  if (name === "sources") {
    if (a.action === "list") return { data: sourceCatalog() };
    if (a.action === "search") return { data: await searchSources(a.query) };
    if (a.action === "read") {
      const data = await require("./publicSource").readPublicSource(a.url);
      return { data, evidenceText: { url: data.url, text: data.text } };
    }
    throw new Error("Unknown source action");
  }
  if (name === "evidence") {
    const result = await require("./evidenceService").getPublicEvidence(a, {
      db: dbFor(ctx),
    });
    if (!result) return { data: { found: false } };
    const text = JSON.stringify(result.value),
      start = offset(a.offset) * 6000;
    const excerpt = text.slice(start, start + 6000);
    return {
      data: {
        id: a.id,
        field: a.field,
        text: excerpt,
        truncated: start + 6000 < text.length,
        nextOffset: offset(a.offset) + 1,
        meaning:
          "Original untrusted provider evidence; preserve source and scope.",
      },
      evidenceText: {
        url: a.id.startsWith("musicbrainz:")
          ? "https://musicbrainz.org/" + a.id.split(":").slice(1).join("/")
          : "",
        text: excerpt,
      },
    };
  }
  if (name === "credits") return credits(a, ctx);
  if (name === "compare_factors") {
    if (
      !Array.isArray(a.recordingIds) ||
      a.recordingIds.length < 2 ||
      a.recordingIds.length > 10
    )
      throw new Error("Supply 2–10 recording identities");
    const ids = [...new Set(a.recordingIds.map(identity))],
      db = dbFor(ctx);
    const rows = await db.entity.findMany({
      where: {
        primaryLabel: "EvidenceAssertion",
        OR: ids.map((id) => ({ extra: { path: ["subjectId"], equals: id } })),
      },
      select: { id: true, extra: true },
      take: 201,
    });
    const provider = await providerFactors(db, ids);
    return {
      data: {
        ...compareFactors(
          ids.map((id) => ({
            id,
            factors: [
              ...rows
                .filter(
                  (r) =>
                    r.extra.subjectId === id &&
                    r.extra.mode === "add" &&
                    r.extra.scope === "direct" &&
                    !r.extra.releaseId,
                )
                .map((r) => ({ id: r.id, ...r.extra })),
              ...provider.factors.filter((a) => a.subjectId === id),
            ],
          })),
        ),
        truncated: rows.length > 200 || provider.truncated,
        editionRestrictedClaims: rows.filter((r) => r.extra.releaseId).length,
        coverage:
          "Direct reviewed and imported provider recording credits without edition restrictions. Edition-restricted reviewed claims are excluded; use credits with an exact edition to inspect those and inherited album defaults. Provider instrument attributes are descriptors, not equipment-model identities.",
      },
    };
  }
  if (name === "ask_user") {
    if (
      typeof a.question !== "string" ||
      !a.question.trim() ||
      a.question.length > 1200
    )
      throw new Error("A concise question is required");
    return {
      data: { needsInput: true },
      decision: {
        kind: "clarification",
        question: a.question,
        choices: (a.choices || [])
          .filter((c) => typeof c === "string" && c.length < 300)
          .slice(0, 6),
        action: {},
      },
    };
  }
  if (name === "prepare_enrichment") {
    a = structuredClone(a);
    const db = dbFor(ctx);
    let factor;
    if (a.newFactor) {
      if (
        !domain.AssertionFactor.definition.targetTypes.includes(
          a.newFactor.type,
        ) ||
        typeof a.newFactor.name !== "string" ||
        !a.newFactor.name.trim() ||
        a.newFactor.name.length > 200
      )
        throw new Error(
          "New factor requires an allowed concrete class and name",
        );
      if (a.factorId && !a.factorId.startsWith("research-factor:"))
        throw new Error("Choose a stored factor OR a new factor");
      a.factorId =
        a.factorId || "research-factor:" + require("crypto").randomUUID();
      factor = {
        id: a.factorId,
        kind: a.newFactor.type,
        name: a.newFactor.name.trim(),
      };
    } else factor = await node(db, a.factorId);
    validateAssertion(a);
    const subject = await node(db, a.subjectId);
    const roles = {
      producer: ["Artist"],
      engineer: ["Artist"],
      "mixing-engineer": ["Artist"],
      "mastering-engineer": ["Artist"],
      performer: ["Artist"],
      instrument: ["Instrument"],
      equipment: [
        "Equipment",
        "Guitar",
        "Synthesizer",
        "Console",
        "Amplifier",
        "EffectsPedal",
      ],
      studio: ["Place"],
      genre: ["Genre", "Style"],
      technique: ["Technique"],
    };
    if (!roles[a.role]?.includes(factor.kind))
      throw new Error("Factor class is incompatible with credit role");
    if (subject.kind !== a.subjectType)
      throw new Error("Subject class does not match stored identity");
    if (!domain.AssertionFactor.definition.targetTypes.includes(factor.kind))
      throw new Error("Unsupported factor identity");
    if (
      !(ctx.evidenceTexts || []).some(
        (t) => t.url === a.sourceUrl && t.text.includes(a.excerpt),
      ) &&
      ![ctx.userPrompt, ...(ctx.userStatements || [])].some(
        (statement) =>
          typeof statement === "string" &&
          statement.includes(a.excerpt) &&
          statement.includes(a.sourceUrl),
      )
    )
      throw new Error(
        "The exact excerpt must be supplied by the user or retrieved from stored evidence first. Search snippets and model memory cannot establish credits.",
      );
    let editionContext;
    if (a.releaseId)
      editionContext = (
        await credits(
          {
            releaseId: a.releaseId,
            recordingId:
              a.subjectType === "Recording" ? a.subjectId : undefined,
            trackId: a.subjectType === "Track" ? a.subjectId : undefined,
          },
          ctx,
        )
      ).data.context;
    let prior;
    if (
      a.releaseId &&
      ((a.subjectType === "Release" && a.subjectId !== a.releaseId) ||
        (a.subjectType === "ReleaseGroup" &&
          a.subjectId !== editionContext?.releaseGroupId))
    )
      throw new Error(
        "Album assertion is not applicable to this verified edition",
      );
    if (a.overridesAssertionId) {
      prior = await db.entity.findFirst({
        where: {
          id: a.overridesAssertionId,
          primaryLabel: "EvidenceAssertion",
        },
        select: { id: true, extra: true },
      });
      if (
        !prior ||
        ![a.releaseId, editionContext?.releaseGroupId]
          .filter(Boolean)
          .includes(prior.extra.subjectId) ||
        prior.extra.role !== a.role ||
        (prior.extra.releaseId && prior.extra.releaseId !== a.releaseId) ||
        prior.extra.scope !== "all-tracks" ||
        prior.extra.mode !== "add"
      )
        throw new Error(
          "Exception must reference an applicable all-tracks default on this release or its verified release group",
        );
    }
    const edition = a.releaseId ? await node(db, a.releaseId) : null;
    return {
      data: { needsInput: true },
      decision: {
        kind: "enrichment",
        question: `Save this ${a.scope} ${a.role} claim for ${subject.name}? Review the exact source, scope and quoted evidence.`,
        choices: [],
        action: { ...a, certainty: "user-stated" },
        display: {
          subject: subject.name,
          subjectIdentity: `${subject.kind}: ${subject.id}`,
          factor: factor.name,
          factorIdentity: `${factor.kind}: ${factor.id}`,
          ...(edition
            ? {
                edition: `${edition.name} — ${edition.id}${edition.properties?.date ? " — " + edition.properties.date : ""}${edition.properties?.country ? " — " + edition.properties.country : ""}`,
              }
            : {}),
          ...(prior
            ? {
                overrides: `${prior.id}: ${prior.extra.role} / ${prior.extra.factorId}; ${prior.extra.scope} on ${prior.extra.subjectType} ${prior.extra.subjectId}; ${prior.extra.sourceUrl}; ${prior.extra.excerpt}`,
              }
            : {}),
          ...(a.newFactor ? { creates: `New ${factor.kind} identity` } : {}),
          sourceUrl: a.sourceUrl,
          excerpt: a.excerpt,
          scope: a.scope,
          mode: a.mode,
        },
      },
    };
  }
  if (name === "prepare_preference") {
    if (
      !["like", "dislike", "observation"].includes(a.value) ||
      typeof a.note !== "string" ||
      !a.note ||
      a.note.length > 1000 ||
      !String(ctx.userPrompt || "").includes(a.note)
    )
      throw new Error(
        "Preference must quote the current user statement, not listening frequency",
      );
    const recording = await node(dbFor(ctx), identity(a.recordingId));
    if (recording.kind !== "Recording")
      throw new Error("Preference requires a recording");
    return {
      data: { needsInput: true },
      decision: {
        kind: "preference",
        question: `Save your ${a.value} for ${recording.name}?`,
        choices: [],
        action: a,
        display: {
          recording: `${recording.name} — Recording ${recording.id}`,
          note: a.note,
        },
      },
    };
  }
}
module.exports = {
  toolDefinitions,
  executeResearchTool,
  mergeGraph,
  nodesByIds,
  visible,
};
