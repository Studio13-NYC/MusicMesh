const { getDatabase } = require("./postgres");
const { entityRecord, relationshipRecord } = require("./graphProperties");
const { getOntology } = require("./domain");
const PRIVATE_LABELS = Object.values(getOntology().entities).filter(d=>d.visibility==="private").map(d=>d.key);
const excludedLabels = labels => [...new Set([...PRIVATE_LABELS, ...(labels || [])])];

async function searchEntities(
  query,
  limit,
  hiddenLabels = [],
  reverse = false,
) {
  hiddenLabels = excludedLabels(hiddenLabels);
  // strpos treats %, _ and backslash literally, like Cypher CONTAINS.
  const rows = await getDatabase().$queryRaw`
    SELECT e.*, (SELECT count(*)::int FROM relationships r JOIN entities s ON s.id=r."sourceId" JOIN entities t ON t.id=r."targetId"
      WHERE (r."sourceId"=e.id OR r."targetId"=e.id) AND NOT s.labels && ${hiddenLabels}::text[] AND NOT t.labels && ${hiddenLabels}::text[]) AS degree,
      CASE WHEN lower(e."searchText")=lower(${query}) THEN 0
           WHEN strpos(lower(e."searchText"),lower(${query}))>0 THEN 1 ELSE 2 END AS "matchRank"
    FROM entities e
    WHERE NOT e.labels && ${hiddenLabels}::text[] AND
      (${query}='' OR strpos(lower(e."searchText"),lower(${query}))>0 OR
       (${reverse} AND strpos(lower(${query}),lower(e."searchText"))>0))
    ORDER BY CASE WHEN ${reverse} THEN
      CASE WHEN lower(e."searchText")=lower(${query}) THEN 0 WHEN strpos(lower(e."searchText"),lower(${query}))>0 THEN 1 ELSE 2 END
      ELSE 0 END,
      degree DESC, lower(e."searchText") COLLATE "C", e.id COLLATE "C"
    LIMIT ${limit}`;
  return rows.map((r) => ({ ...entityRecord(r), matchRank: r.matchRank }));
}

async function neighborhood(
  seedIds,
  {
    depth,
    pathLimit,
    nodeLimit,
    edgeLimit,
    induced = false,
    hiddenLabels = [],
    hiddenTypes = [],
  },
) {
  hiddenLabels = excludedLabels(hiddenLabels);
  return getDatabase().$transaction(
    async (tx) => {
      const seeds = await tx.entity.findMany({
        where: {
          id: { in: seedIds },
          NOT: { labels: { hasSome: hiddenLabels } },
        },
      });
      const compareIds = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
      const foundIds = seeds.map((n) => n.id).sort(compareIds);
      if (!foundIds.length) return { seeds: [], nodes: [], relationships: [] };
      // Cypher variable-length paths never reuse an edge, but may revisit nodes.
      // Retain that distinction (including cycles), both traversal directions,
      // and the original path/node/edge caps. Order capped paths nearest-first,
      // then by stable IDs, rather than depending on storage-engine row order.
      const paths = await tx.$queryRaw`
      WITH RECURSIVE walk AS (
        SELECT e.id AS current, ARRAY[e.id]::text[] AS nodes, ARRAY[]::text[] AS edges, 0 AS depth
        FROM entities e WHERE e.id=ANY(${foundIds}::text[])
        UNION ALL
        SELECT CASE WHEN r."sourceId"=w.current THEN r."targetId" ELSE r."sourceId" END,
          w.nodes || CASE WHEN r."sourceId"=w.current THEN r."targetId" ELSE r."sourceId" END,
          w.edges || r.id, w.depth+1
        FROM walk w JOIN relationships r ON r."sourceId"=w.current OR r."targetId"=w.current
        JOIN entities next ON next.id=CASE WHEN r."sourceId"=w.current THEN r."targetId" ELSE r."sourceId" END
        WHERE w.depth<${depth} AND NOT r.id=ANY(w.edges)
          AND NOT next.labels && ${hiddenLabels}::text[] AND NOT r.type=ANY(${hiddenTypes}::text[])
      ) SELECT nodes, edges FROM walk WHERE depth>0
        ORDER BY depth, current COLLATE "C", nodes, edges LIMIT ${pathLimit}`;
      const distances = new Map(foundIds.map((id) => [id, 0]));
      for (const path of paths) {
        path.nodes.forEach((id, distance) => {
          distances.set(id, Math.min(distances.get(id) ?? Infinity, distance));
        });
      }
      const nodeIds = [...distances.keys()]
        .sort((a, b) => distances.get(a) - distances.get(b) || compareIds(a, b))
        .slice(0, nodeLimit);
      const edgeIds = [...new Set(paths.flatMap((p) => p.edges))];
      const nodes = await tx.$queryRaw`
      SELECT e.*, (SELECT count(*)::int FROM relationships r JOIN entities s ON s.id=r."sourceId" JOIN entities t ON t.id=r."targetId"
        WHERE (r."sourceId"=e.id OR r."targetId"=e.id) AND NOT s.labels && ${hiddenLabels}::text[] AND NOT t.labels && ${hiddenLabels}::text[]) AS degree
      FROM entities e WHERE e.id=ANY(${nodeIds}::text[])`;
      const relationships = await tx.relationship.findMany({
        where: {
          sourceId: { in: nodeIds },
          targetId: { in: nodeIds },
          type: { notIn: hiddenTypes },
          OR: [
            { id: { in: edgeIds } },
            ...(induced ? [{ type: { notIn: hiddenTypes } }] : []),
          ],
        },
      });
      relationships.sort(
        (a, b) =>
          Math.max(distances.get(a.sourceId), distances.get(a.targetId)) -
            Math.max(distances.get(b.sourceId), distances.get(b.targetId)) ||
          compareIds(a.id, b.id),
      );
      const map = new Map(nodes.map((n) => [n.id, entityRecord(n)]));
      return {
        seeds: foundIds,
        nodes: nodeIds.map((id) => map.get(id)).filter(Boolean),
        relationships: relationships
          .slice(0, edgeLimit)
          .map(relationshipRecord),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}

async function detail(nodeId, hiddenLabels, hiddenTypes, limit) {
  hiddenLabels = excludedLabels(hiddenLabels);
  hiddenTypes = hiddenTypes || [];
  return getDatabase().$transaction(
    async (tx) => {
      const node = await tx.entity.findFirst({
        where: { id: nodeId, NOT: { labels: { hasSome: hiddenLabels } } },
      });
      if (!node) return null;
      const rows = await tx.$queryRaw`
      SELECT r.type, count(*)::int AS count FROM relationships r
      JOIN entities s ON s.id=r."sourceId" JOIN entities t ON t.id=r."targetId"
      WHERE (r."sourceId"=${nodeId} OR r."targetId"=${nodeId}) AND NOT r.type=ANY(${hiddenTypes}::text[])
        AND NOT s.labels && ${hiddenLabels}::text[] AND NOT t.labels && ${hiddenLabels}::text[]
      GROUP BY r.type ORDER BY count DESC, r.type COLLATE "C"`;
      return {
        node: entityRecord(node),
        relationshipCount: rows.reduce((n, r) => n + r.count, 0),
        relationshipTypes: rows.slice(0, limit),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
module.exports = { searchEntities, neighborhood, detail };
