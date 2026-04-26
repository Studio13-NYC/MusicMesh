const neo4j = require("neo4j-driver");
const { validateEnv } = require("./env");

const DEFAULT_LOOKUP_LIMIT = 5;
const DEFAULT_TRAVERSAL_DEPTH = 2;
const DEFAULT_TRAVERSAL_PATH_LIMIT = 120;
const DEFAULT_TRAVERSAL_NODE_LIMIT = 80;
const DEFAULT_TRAVERSAL_EDGE_LIMIT = 140;

let driver = null;

function ensureDriver() {
  const envResult = validateEnv();

  if (!envResult.isValid) {
    throw new Error("Graph canon API is missing required Neo4j environment variables.");
  }

  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI,
      neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
    );
  }

  return driver;
}

function createReadSession() {
  return ensureDriver().session({
    database: process.env.NEO4J_DATABASE,
    defaultAccessMode: neo4j.session.READ
  });
}

function toCypherInteger(value) {
  return neo4j.int(value);
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function toNativeValue(value) {
  if (neo4j.isInt(value)) {
    return value.inSafeRange() ? value.toNumber() : value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toNativeValue(item));
  }

  if (value && typeof value === "object") {
    if (value.constructor && value.constructor !== Object) {
      return value.toString();
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, toNativeValue(entryValue)])
    );
  }

  return value;
}

function stableString(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function pickNodeLabel(properties, fallbackId) {
  const keys = ["name", "title", "displayName", "label", "fullName", "stageName", "canonicalName", "id"];

  for (const key of keys) {
    const candidate = stableString(properties[key]);

    if (candidate) {
      return candidate;
    }
  }

  return fallbackId;
}

function pickNodeKind(labels) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return "Node";
  }

  return [...labels].sort((left, right) => left.localeCompare(right))[0];
}

async function runRead(cypher, parameters = {}) {
  const session = createReadSession();

  try {
    const result = await session.executeRead((tx) => tx.run(cypher, parameters));
    return result.records.map((record) => record.toObject());
  } finally {
    await session.close();
  }
}

function normalizeCanonNode(record) {
  const properties = toNativeValue(record.properties || {});
  const labels = Array.isArray(record.labels) ? record.labels.map((label) => stableString(label)) : [];
  const id = stableString(record.id);

  return {
    id,
    labels,
    kind: pickNodeKind(labels),
    label: pickNodeLabel(properties, id),
    degree: Number(toNativeValue(record.degree) || 0),
    properties
  };
}

async function lookupCanonEntities(entities, options = {}) {
  const limit = clampInteger(options.limit, 1, 20, DEFAULT_LOOKUP_LIMIT);
  const normalizedEntities = (Array.isArray(entities) ? entities : [])
    .map((entity) => {
      if (typeof entity === "string") {
        return { name: entity.trim(), type: "" };
      }

      return {
        name: stableString(entity.name || entity.label || entity.title),
        type: stableString(entity.type || entity.kind || entity.labelType)
      };
    })
    .filter((entity) => entity.name);

  if (normalizedEntities.length === 0) {
    return [];
  }

  const cypher = `
    UNWIND $entities AS entity
    CALL {
      WITH entity
      MATCH (n)
      WITH
        entity,
        n,
        labels(n) AS labels,
        properties(n) AS properties,
        elementId(n) AS id,
        count { (n)--() } AS degree,
        coalesce(
          toString(n.name),
          toString(n.title),
          toString(n.displayName),
          toString(n.label),
          toString(n.fullName),
          toString(n.stageName),
          toString(n.canonicalName),
          toString(n.id),
          elementId(n)
        ) AS searchText
      WHERE
        toLower(searchText) = toLower(entity.name)
        OR toLower(searchText) CONTAINS toLower(entity.name)
        OR toLower(entity.name) CONTAINS toLower(searchText)
      WITH entity, id, labels, properties, degree, searchText,
        CASE
          WHEN toLower(searchText) = toLower(entity.name) THEN 0
          WHEN toLower(searchText) CONTAINS toLower(entity.name) THEN 1
          ELSE 2
        END AS matchRank
      ORDER BY matchRank ASC, degree DESC, toLower(searchText) ASC, id ASC
      RETURN collect({ id: id, labels: labels, properties: properties, degree: degree, matchRank: matchRank })[..$limit] AS matches
    }
    RETURN entity, matches
  `;
  const records = await runRead(cypher, {
    entities: normalizedEntities,
    limit: toCypherInteger(limit)
  });

  return records.map((record) => ({
    input: record.entity,
    matches: toNativeValue(record.matches || []).map((match) => ({
      ...normalizeCanonNode(match),
      matchRank: Number(toNativeValue(match.matchRank) || 0)
    }))
  }));
}

async function inspectSchema() {
  const cypher = `
    CALL {
      MATCH (n)
      UNWIND labels(n) AS label
      RETURN collect(DISTINCT label) AS nodeLabels
    }
    CALL {
      MATCH ()-[r]-()
      RETURN collect(DISTINCT type(r)) AS relationshipTypes
    }
    CALL {
      MATCH (n)
      UNWIND keys(n) AS propertyKey
      RETURN collect(DISTINCT propertyKey) AS nodePropertyKeys
    }
    CALL {
      MATCH ()-[r]-()
      UNWIND keys(r) AS propertyKey
      RETURN collect(DISTINCT propertyKey) AS relationshipPropertyKeys
    }
    RETURN nodeLabels, relationshipTypes, nodePropertyKeys, relationshipPropertyKeys
  `;
  const records = await runRead(cypher);
  const payload = records[0] || {};

  return {
    nodeLabels: toNativeValue(payload.nodeLabels || []).sort(),
    relationshipTypes: toNativeValue(payload.relationshipTypes || []).sort(),
    nodePropertyKeys: toNativeValue(payload.nodePropertyKeys || []).sort(),
    relationshipPropertyKeys: toNativeValue(payload.relationshipPropertyKeys || []).sort()
  };
}

function normalizeRelationshipRecord(record) {
  return {
    id: stableString(record.id),
    source: stableString(record.source),
    target: stableString(record.target),
    type: stableString(record.type) || "RELATED_TO",
    properties: toNativeValue(record.properties || {})
  };
}

async function traverseCanonNeighborhood(seedIds, options = {}) {
  const normalizedSeedIds = [...new Set((seedIds || []).map((id) => stableString(id)).filter(Boolean))];

  if (normalizedSeedIds.length === 0) {
    return {
      depth: 0,
      seeds: [],
      nodes: [],
      relationships: [],
      bridgeNodes: [],
      relationshipTypeCounts: []
    };
  }

  const depth = clampInteger(options.depth, 1, 3, DEFAULT_TRAVERSAL_DEPTH);
  const pathLimit = clampInteger(options.pathLimit, 1, 400, DEFAULT_TRAVERSAL_PATH_LIMIT);
  const nodeLimit = clampInteger(options.nodeLimit, 1, 200, DEFAULT_TRAVERSAL_NODE_LIMIT);
  const edgeLimit = clampInteger(options.edgeLimit, 1, 300, DEFAULT_TRAVERSAL_EDGE_LIMIT);
  const cypher = `
    MATCH (seed)
    WHERE elementId(seed) IN $seedIds
    WITH collect(seed) AS seeds
    CALL {
      WITH seeds
      UNWIND seeds AS seed
      OPTIONAL MATCH p = (seed)-[*1..${depth}]-(neighbor)
      WITH p
      LIMIT $pathLimit
      RETURN collect(p) AS paths
    }
    WITH
      seeds,
      reduce(allNodes = seeds, path IN paths | allNodes + nodes(path)) AS rawNodes,
      reduce(allRels = [], path IN paths | allRels + relationships(path)) AS rawRels
    UNWIND rawNodes AS rawNode
    WITH seeds, collect(DISTINCT rawNode)[..$nodeLimit] AS nodes, rawRels
    CALL {
      WITH nodes, rawRels
      WITH nodes, CASE WHEN size(rawRels) = 0 THEN [null] ELSE rawRels END AS relCandidates
      UNWIND relCandidates AS rawRel
      WITH nodes, collect(DISTINCT rawRel) AS distinctRels
      RETURN [rel IN distinctRels WHERE rel IS NOT NULL AND startNode(rel) IN nodes AND endNode(rel) IN nodes][..$edgeLimit] AS rels
    }
    RETURN
      [seed IN seeds | elementId(seed)] AS seeds,
      [node IN nodes | {
        id: elementId(node),
        labels: labels(node),
        properties: properties(node),
        degree: count { (node)--() }
      }] AS nodes,
      [rel IN rels | {
        id: elementId(rel),
        source: elementId(startNode(rel)),
        target: elementId(endNode(rel)),
        type: type(rel),
        properties: properties(rel)
      }] AS relationships
  `;
  const records = await runRead(cypher, {
    seedIds: normalizedSeedIds,
    pathLimit: toCypherInteger(pathLimit),
    nodeLimit: toCypherInteger(nodeLimit),
    edgeLimit: toCypherInteger(edgeLimit)
  });
  const payload = records[0] || {};
  const nodes = toNativeValue(payload.nodes || []).map((node) => normalizeCanonNode(node));
  const relationships = toNativeValue(payload.relationships || []).map((relationship) =>
    normalizeRelationshipRecord(relationship)
  );
  const seedIdSet = new Set(normalizedSeedIds);
  const bridgeNodeIds = new Set();

  for (const node of nodes) {
    if (seedIdSet.has(node.id)) {
      continue;
    }

    const connectedSeedIds = new Set();

    for (const relationship of relationships) {
      if (relationship.source === node.id && seedIdSet.has(relationship.target)) {
        connectedSeedIds.add(relationship.target);
      }

      if (relationship.target === node.id && seedIdSet.has(relationship.source)) {
        connectedSeedIds.add(relationship.source);
      }
    }

    if (connectedSeedIds.size > 1) {
      bridgeNodeIds.add(node.id);
    }
  }
  const relationshipTypeCounts = [
    ...relationships.reduce((counts, relationship) => {
      counts.set(relationship.type, (counts.get(relationship.type) || 0) + 1);
      return counts;
    }, new Map())
  ]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return String(left.type).localeCompare(String(right.type));
    });

  return {
    depth,
    seeds: toNativeValue(payload.seeds || []),
    nodes,
    relationships,
    bridgeNodes: nodes.filter((node) => bridgeNodeIds.has(node.id)),
    relationshipTypeCounts
  };
}

module.exports = {
  inspectSchema,
  lookupCanonEntities,
  runRead,
  stableString,
  toNativeValue,
  traverseCanonNeighborhood
};
