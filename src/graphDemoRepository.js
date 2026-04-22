const neo4j = require("neo4j-driver");
const { validateEnv } = require("./env");

const DEFAULT_SEARCH_LIMIT = 8;
const DEFAULT_SUBGRAPH_DEPTH = 2;
const DEFAULT_EXPAND_DEPTH = 1;
const DEFAULT_MAX_NODES = 60;
const DEFAULT_MAX_EDGES = 90;
const DEFAULT_PATH_LIMIT = 120;
const DEFAULT_DETAIL_RELATIONSHIP_TYPE_LIMIT = 8;

let driver = null;

function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function toCypherInteger(value) {
  return neo4j.int(value);
}

function ensureDriver() {
  const envResult = validateEnv();

  if (!envResult.isValid) {
    throw new Error(
      "Graph demo API is missing required Neo4j environment variables (see src/env.js)."
    );
  }

  if (driver) {
    return driver;
  }

  driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
  );

  return driver;
}

function createSession() {
  return ensureDriver().session({
    database: process.env.NEO4J_DATABASE,
    defaultAccessMode: neo4j.session.READ
  });
}

function toNativeValue(value) {
  if (neo4j.isInt(value)) {
    return value.inSafeRange() ? value.toNumber() : value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toNativeValue(item));
  }

  if (value && typeof value === "object") {
    if (value instanceof Date) {
      return value.toISOString();
    }

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

function pickNodeLabel(properties, id) {
  const keys = [
    "name",
    "title",
    "displayName",
    "label",
    "fullName",
    "stageName",
    "canonicalName",
    "id"
  ];

  for (const key of keys) {
    const candidate = stableString(properties[key]);

    if (candidate) {
      return candidate;
    }
  }

  return id;
}

function pickNodeKind(labels) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return "Node";
  }

  return [...labels].sort((left, right) => left.localeCompare(right))[0];
}

function pickColorKey(kind) {
  const normalized = String(kind || "node").toLowerCase();

  if (normalized.includes("artist") || normalized.includes("band")) {
    return "artist";
  }

  if (normalized.includes("album") || normalized.includes("release")) {
    return "album";
  }

  if (normalized.includes("track") || normalized.includes("song")) {
    return "track";
  }

  if (normalized.includes("person") || normalized.includes("member")) {
    return "person";
  }

  if (normalized.includes("genre")) {
    return "genre";
  }

  if (normalized.includes("label")) {
    return "label";
  }

  return "node";
}

function pickShapeKey(kind) {
  const normalized = String(kind || "node").toLowerCase();

  if (normalized.includes("artist") || normalized.includes("band")) {
    return "ellipse";
  }

  if (normalized.includes("album") || normalized.includes("release")) {
    return "round-rectangle";
  }

  if (normalized.includes("track") || normalized.includes("song")) {
    return "diamond";
  }

  if (normalized.includes("person") || normalized.includes("member")) {
    return "hexagon";
  }

  return "ellipse";
}

function pickRelationshipStyle(type) {
  const normalized = String(type || "").toUpperCase();

  if (
    normalized.includes("INFLUENCE") ||
    normalized.includes("SIMILAR") ||
    normalized.includes("RELATED") ||
    normalized.includes("REFERENCE") ||
    normalized.includes("MENTION")
  ) {
    return "dotted";
  }

  if (
    normalized.includes("MEMBER") ||
    normalized.includes("PART") ||
    normalized.includes("CONTRIB") ||
    normalized.includes("COLLAB") ||
    normalized.includes("PRODUC") ||
    normalized.includes("PERFORM")
  ) {
    return "dashed";
  }

  return "solid";
}

function pickNodeSubtitle(kind, labels, properties) {
  const candidates = [
    properties.role,
    properties.type,
    properties.category,
    properties.release_year,
    properties.year
  ];

  for (const candidate of candidates) {
    const normalized = stableString(candidate);

    if (normalized) {
      return normalized;
    }
  }

  if (Array.isArray(labels) && labels.length > 1) {
    return labels.filter((label) => label !== kind).join(" · ");
  }

  return kind;
}

function normalizeNodeRecord(record, { seedId, positionsById }) {
  const id = stableString(record.id);
  const labels = Array.isArray(record.labels) ? record.labels.map((label) => stableString(label)) : [];
  const properties = toNativeValue(record.properties || {});
  const kind = pickNodeKind(labels);
  const label = pickNodeLabel(properties, id);
  const position = positionsById.get(id) || { x: 0, y: 0 };

  return {
    id,
    label,
    kind,
    colorKey: pickColorKey(kind),
    shapeKey: pickShapeKey(kind),
    x: position.x,
    y: position.y,
    summary: {
      subtitle: pickNodeSubtitle(kind, labels, properties),
      labels
    },
    isSeed: id === seedId
  };
}

function normalizeRelationshipRecord(record) {
  const type = stableString(record.type) || "RELATED_TO";

  return {
    id: stableString(record.id),
    source: stableString(record.source),
    target: stableString(record.target),
    type,
    styleKey: pickRelationshipStyle(type),
    summary: {
      propertyCount: Object.keys(toNativeValue(record.properties || {})).length
    }
  };
}

function buildAdjacency(nodes, relationships) {
  const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));

  for (const relationship of relationships) {
    if (!adjacency.has(relationship.source) || !adjacency.has(relationship.target)) {
      continue;
    }

    adjacency.get(relationship.source).add(relationship.target);
    adjacency.get(relationship.target).add(relationship.source);
  }

  return adjacency;
}

function computeAnchoredPositions(seedId, nodes, relationships) {
  const adjacency = buildAdjacency(nodes, relationships);
  const distances = new Map([[seedId, 0]]);
  const queue = [seedId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const nextDistance = distances.get(currentId) + 1;

    for (const neighborId of adjacency.get(currentId) || []) {
      if (distances.has(neighborId)) {
        continue;
      }

      distances.set(neighborId, nextDistance);
      queue.push(neighborId);
    }
  }

  const groupedIds = new Map();

  for (const node of nodes) {
    const distance = distances.has(node.id) ? distances.get(node.id) : 3;

    if (!groupedIds.has(distance)) {
      groupedIds.set(distance, []);
    }

    groupedIds.get(distance).push(node);
  }

  const positionsById = new Map();
  positionsById.set(seedId, { x: 0, y: 0 });

  for (const [distance, groupNodes] of [...groupedIds.entries()].sort(
    (left, right) => left[0] - right[0]
  )) {
    if (distance === 0) {
      continue;
    }

    const sortedNodes = groupNodes
      .slice()
      .sort((left, right) =>
        `${left.kind}:${left.label}:${left.id}`.localeCompare(
          `${right.kind}:${right.label}:${right.id}`
        )
      );
    const radius = 220 + (distance - 1) * 180;
    const total = sortedNodes.length;

    sortedNodes.forEach((node, index) => {
      const angle = total === 1 ? -Math.PI / 2 : -Math.PI / 2 + (index / total) * Math.PI * 2;

      positionsById.set(node.id, {
        x: Math.round(Math.cos(angle) * radius),
        y: Math.round(Math.sin(angle) * radius)
      });
    });
  }

  return positionsById;
}

function sortNodes(nodes, seedId) {
  return nodes.slice().sort((left, right) => {
    if (left.id === seedId) {
      return -1;
    }

    if (right.id === seedId) {
      return 1;
    }

    return `${left.kind}:${left.label}:${left.id}`.localeCompare(
      `${right.kind}:${right.label}:${right.id}`
    );
  });
}

function sortRelationships(relationships) {
  return relationships.slice().sort((left, right) =>
    `${left.type}:${left.source}:${left.target}:${left.id}`.localeCompare(
      `${right.type}:${right.source}:${right.target}:${right.id}`
    )
  );
}

function summarizeGraph(nodes, relationships, diagnostics = {}) {
  return {
    availableNodeKinds: [...new Set(nodes.map((node) => node.kind))].sort((left, right) =>
      left.localeCompare(right)
    ),
    availableRelationshipTypes: [
      ...new Set(relationships.map((relationship) => relationship.type))
    ].sort((left, right) => left.localeCompare(right)),
    nodeCount: nodes.length,
    edgeCount: relationships.length,
    diagnostics
  };
}

function transformGraphRecords(seedRecord, rawNodes, rawRelationships, diagnostics = {}) {
  const seedId = stableString(seedRecord.id);
  const normalizedBaseNodes = rawNodes.map((record) => ({
    id: stableString(record.id),
    label: pickNodeLabel(toNativeValue(record.properties || {}), stableString(record.id)),
    kind: pickNodeKind(record.labels),
    raw: record
  }));
  const normalizedRelationships = sortRelationships(
    rawRelationships.map((relationship) => normalizeRelationshipRecord(relationship))
  );
  const positionsById = computeAnchoredPositions(seedId, normalizedBaseNodes, normalizedRelationships);
  const nodes = sortNodes(
    rawNodes.map((record) =>
      normalizeNodeRecord(record, {
        seedId,
        positionsById
      })
    ),
    seedId
  );
  const seedNode =
    nodes.find((node) => node.id === seedId) ||
    normalizeNodeRecord(seedRecord, { seedId, positionsById });

  return {
    seedNode,
    nodes,
    edges: normalizedRelationships,
    meta: {
      seedNodeId: seedId,
      ...summarizeGraph(nodes, normalizedRelationships, diagnostics)
    }
  };
}

async function runRead(cypher, parameters) {
  const session = createSession();

  try {
    const result = await session.executeRead((tx) => tx.run(cypher, parameters));
    return result.records.map((record) => record.toObject());
  } finally {
    await session.close();
  }
}

async function searchGraphSeeds(query, limit = DEFAULT_SEARCH_LIMIT) {
  const normalizedQuery = typeof query === "string" ? query.trim() : "";
  const boundedLimit = clampInteger(limit, 1, 25, DEFAULT_SEARCH_LIMIT);
  const cypher = `
    MATCH (n)
    WITH
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
    WHERE $query = "" OR toLower(searchText) CONTAINS toLower($query)
    RETURN id, labels, properties, degree, searchText
    ORDER BY degree DESC, toLower(searchText) ASC, id ASC
    LIMIT $limit
  `;
  const records = await runRead(cypher, {
    query: normalizedQuery,
    limit: toCypherInteger(boundedLimit)
  });

  return records.map((record) => {
    const properties = toNativeValue(record.properties || {});
    const labels = Array.isArray(record.labels) ? record.labels.map((label) => stableString(label)) : [];
    const kind = pickNodeKind(labels);
    const label = pickNodeLabel(properties, stableString(record.id));

    return {
      id: stableString(record.id),
      label,
      kind,
      colorKey: pickColorKey(kind),
      subtitle: pickNodeSubtitle(kind, labels, properties),
      degree: Number(toNativeValue(record.degree) || 0)
    };
  });
}

async function fetchSeededGraph(seedId, options = {}) {
  const normalizedSeedId = stableString(seedId);

  if (!normalizedSeedId) {
    throw new Error("Graph demo subgraph requests require a seedId.");
  }

  const depth = clampInteger(
    options.depth,
    1,
    2,
    options.defaultDepth || DEFAULT_SUBGRAPH_DEPTH
  );
  const maxNodes = clampInteger(options.maxNodes, 1, 200, DEFAULT_MAX_NODES);
  const maxEdges = clampInteger(options.maxEdges, 1, 300, DEFAULT_MAX_EDGES);
  const pathLimit = clampInteger(options.pathLimit, 1, 400, DEFAULT_PATH_LIMIT);
  const cypher = `
    MATCH (seed)
    WHERE elementId(seed) = $seedId
    CALL {
      WITH seed
      OPTIONAL MATCH p = (seed)-[*1..${depth}]-(neighbor)
      WITH p
      LIMIT $pathLimit
      RETURN collect(p) AS paths
    }
    WITH
      seed,
      reduce(allNodes = [seed], path IN paths | allNodes + nodes(path)) AS rawNodes,
      reduce(allRels = [], path IN paths | allRels + relationships(path)) AS rawRels
    UNWIND rawNodes AS rawNode
    WITH seed, collect(DISTINCT rawNode) AS distinctNodes, rawRels
    WITH seed, distinctNodes[..$maxNodes] AS nodes, rawRels
    CALL {
      WITH nodes, rawRels
      WITH nodes, CASE WHEN size(rawRels) = 0 THEN [null] ELSE rawRels END AS relCandidates
      UNWIND relCandidates AS rawRel
      WITH nodes, collect(DISTINCT rawRel) AS distinctRels
      RETURN [rel IN distinctRels WHERE rel IS NOT NULL AND startNode(rel) IN nodes AND endNode(rel) IN nodes][..$maxEdges] AS rels
    }
    RETURN
      {
        id: elementId(seed),
        labels: labels(seed),
        properties: properties(seed)
      } AS seed,
      [node IN nodes | {
        id: elementId(node),
        labels: labels(node),
        properties: properties(node)
      }] AS nodes,
      [rel IN rels | {
        id: elementId(rel),
        source: elementId(startNode(rel)),
        target: elementId(endNode(rel)),
        type: type(rel),
        properties: properties(rel)
      }] AS rels
  `;
  const records = await runRead(cypher, {
    seedId: normalizedSeedId,
    maxNodes: toCypherInteger(maxNodes),
    maxEdges: toCypherInteger(maxEdges),
    pathLimit: toCypherInteger(pathLimit)
  });
  const payload = records[0];

  if (!payload) {
    throw new Error(`No graph node exists for seed ${normalizedSeedId}.`);
  }

  return transformGraphRecords(payload.seed, payload.nodes || [], payload.rels || [], {
    depth,
    maxNodes,
    maxEdges,
    pathLimit
  });
}

async function expandGraphNode(nodeId, options = {}) {
  const currentNodeIds = Array.isArray(options.currentNodeIds)
    ? options.currentNodeIds.map((value) => stableString(value)).filter(Boolean)
    : [];
  const currentEdgeIds = Array.isArray(options.currentEdgeIds)
    ? options.currentEdgeIds.map((value) => stableString(value)).filter(Boolean)
    : [];
  const payload = await fetchSeededGraph(nodeId, {
    depth: clampInteger(options.depth, 1, 1, DEFAULT_EXPAND_DEPTH),
    maxNodes: clampInteger(options.maxNodes, 1, 120, 40),
    maxEdges: clampInteger(options.maxEdges, 1, 200, 60),
    pathLimit: clampInteger(options.pathLimit, 1, 240, 80),
    defaultDepth: DEFAULT_EXPAND_DEPTH
  });

  const existingNodeIds = new Set(currentNodeIds);
  const existingEdgeIds = new Set(currentEdgeIds);
  const nextNodes = payload.nodes.filter((node) => !existingNodeIds.has(node.id));
  const nextEdges = payload.edges.filter((edge) => !existingEdgeIds.has(edge.id));

  return {
    seedNode: payload.seedNode,
    nodes: nextNodes,
    edges: nextEdges,
    meta: {
      ...payload.meta,
      addedNodeCount: nextNodes.length,
      addedEdgeCount: nextEdges.length
    }
  };
}

async function getNodeDetail(nodeId) {
  const normalizedNodeId = stableString(nodeId);

  if (!normalizedNodeId) {
    throw new Error("Graph demo node detail requests require a node id.");
  }

  const cypher = `
    MATCH (n)
    WHERE elementId(n) = $nodeId
    CALL {
      WITH n
      OPTIONAL MATCH (n)-[r]-()
      RETURN count(r) AS relationshipCount
    }
    CALL {
      WITH n
      OPTIONAL MATCH (n)-[r]-()
      WITH type(r) AS relationshipType, count(*) AS count
      WHERE relationshipType IS NOT NULL
      ORDER BY count DESC, relationshipType ASC
      RETURN collect({ type: relationshipType, count: count })[..$relationshipTypeLimit] AS relationshipTypes
    }
    RETURN
      {
        id: elementId(n),
        labels: labels(n),
        properties: properties(n)
      } AS node,
      relationshipCount,
      relationshipTypes
  `;
  const records = await runRead(cypher, {
    nodeId: normalizedNodeId,
    relationshipTypeLimit: toCypherInteger(DEFAULT_DETAIL_RELATIONSHIP_TYPE_LIMIT)
  });
  const payload = records[0];

  if (!payload) {
    throw new Error(`No graph node exists for id ${normalizedNodeId}.`);
  }

  const properties = toNativeValue(payload.node.properties || {});
  const labels = Array.isArray(payload.node.labels)
    ? payload.node.labels.map((label) => stableString(label))
    : [];
  const kind = pickNodeKind(labels);

  return {
    id: stableString(payload.node.id),
    label: pickNodeLabel(properties, normalizedNodeId),
    kind,
    labels,
    properties,
    relationshipCount: Number(toNativeValue(payload.relationshipCount) || 0),
    relationshipTypes: toNativeValue(payload.relationshipTypes || [])
  };
}

module.exports = {
  expandGraphNode,
  fetchSeededGraph,
  getNodeDetail,
  searchGraphSeeds
};
