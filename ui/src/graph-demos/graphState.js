export const NODE_FILTER_GROUPS = [
  { id: "artist-band", label: "Artist / Band", kinds: ["Artist", "Band"] },
  { id: "album-release", label: "Album / Release", kinds: ["Album", "Release"] },
  { id: "track-song", label: "Track / Song", kinds: ["Track", "Song"] },
  { id: "person-member", label: "Person / Member", kinds: ["Person", "Member"] },
  { id: "record-label", label: "Record Label", kinds: ["RecordLabel", "Label"] },
  { id: "scene", label: "Scene", kinds: ["Scene", "MusicScene"] },
  { id: "venue", label: "Venue", kinds: ["Venue"] },
  { id: "genre-style", label: "Genre / Style", kinds: ["Genre", "Style"] },
  { id: "place", label: "Place", kinds: ["Place", "City", "State", "Country"] },
  { id: "other", label: "Other", kinds: [] }
];

export const RELATIONSHIP_FILTER_GROUPS = [
  {
    id: "membership",
    label: "Membership",
    types: ["MEMBER_OF", "HAS_MEMBER"]
  },
  {
    id: "releases",
    label: "Releases",
    types: ["RELEASED_ALBUM", "RELEASED_TRACK", "IS_A_TRACK_ON", "CONTAINS_TRACK"]
  },
  {
    id: "recording-label",
    label: "Recording / Label",
    types: ["SIGNED_TO", "RECORDED_FOR", "RELEASED_ON", "DISTRIBUTED_BY"]
  },
  {
    id: "production-collaboration",
    label: "Production / Collaboration",
    types: ["PRODUCED_BY", "COLLABORATED_WITH", "PERFORMED_ON", "CREDITED_TO"]
  },
  {
    id: "scene-place",
    label: "Scene / Place",
    types: ["ASSOCIATED_WITH_SCENE", "LOCATED_IN", "FORMED_IN", "ORIGINATED_IN"]
  },
  {
    id: "influence-related",
    label: "Influence / Related",
    types: ["INFLUENCED", "RELATED_TO", "SIMILAR_TO"]
  },
  { id: "other", label: "Other", types: [] }
];

export function createEmptyGraph() {
  return {
    seedNode: null,
    nodes: [],
    edges: [],
    meta: {
      availableNodeKinds: [],
      availableRelationshipTypes: [],
      nodeCount: 0,
      edgeCount: 0,
      diagnostics: {}
    }
  };
}

export function getNodeFilterGroupId(kind) {
  const normalized = String(kind || "");
  const exactGroup = NODE_FILTER_GROUPS.find(
    (group) => group.id !== "other" && group.kinds.includes(normalized)
  );

  return exactGroup?.id || "other";
}

export function getRelationshipFilterGroupId(type) {
  const normalized = String(type || "").toUpperCase();
  const exactGroup = RELATIONSHIP_FILTER_GROUPS.find(
    (group) => group.id !== "other" && group.types.includes(normalized)
  );

  if (exactGroup) {
    return exactGroup.id;
  }

  if (normalized.includes("MEMBER")) {
    return "membership";
  }

  if (normalized.includes("RELEASE") || normalized.includes("TRACK")) {
    return "releases";
  }

  if (normalized.includes("LABEL") || normalized.includes("RECORD")) {
    return "recording-label";
  }

  if (
    normalized.includes("PRODUC") ||
    normalized.includes("COLLAB") ||
    normalized.includes("PERFORM") ||
    normalized.includes("CREDIT")
  ) {
    return "production-collaboration";
  }

  if (
    normalized.includes("SCENE") ||
    normalized.includes("PLACE") ||
    normalized.includes("LOCATED") ||
    normalized.includes("FORMED") ||
    normalized.includes("ORIGIN")
  ) {
    return "scene-place";
  }

  if (
    normalized.includes("INFLUENCE") ||
    normalized.includes("RELATED") ||
    normalized.includes("SIMILAR")
  ) {
    return "influence-related";
  }

  return "other";
}

export function buildNodeFilterCatalog(graph) {
  const counts = new Map(NODE_FILTER_GROUPS.map((group) => [group.id, 0]));

  for (const node of graph.nodes || []) {
    const groupId = getNodeFilterGroupId(node.kind);
    counts.set(groupId, (counts.get(groupId) || 0) + 1);
  }

  return NODE_FILTER_GROUPS.map((group) => ({
    ...group,
    count: counts.get(group.id) || 0
  }));
}

export function buildRelationshipFilterCatalog(graph) {
  const counts = new Map(RELATIONSHIP_FILTER_GROUPS.map((group) => [group.id, 0]));

  for (const edge of graph.edges || []) {
    const groupId = getRelationshipFilterGroupId(edge.type);
    counts.set(groupId, (counts.get(groupId) || 0) + 1);
  }

  return RELATIONSHIP_FILTER_GROUPS.map((group) => ({
    ...group,
    count: counts.get(group.id) || 0
  }));
}

export function mergeGraphPayload(currentGraph, nextPayload) {
  const nodeMap = new Map(currentGraph.nodes.map((node) => [node.id, node]));
  const edgeMap = new Map(currentGraph.edges.map((edge) => [edge.id, edge]));

  for (const node of nextPayload.nodes || []) {
    const currentNode = nodeMap.get(node.id) || null;
    nodeMap.set(node.id, {
      ...currentNode,
      ...node,
      x: Number.isFinite(currentNode?.x) ? currentNode.x : node.x,
      y: Number.isFinite(currentNode?.y) ? currentNode.y : node.y
    });
  }

  for (const edge of nextPayload.edges || []) {
    edgeMap.set(edge.id, {
      ...(edgeMap.get(edge.id) || {}),
      ...edge
    });
  }

  const mergedGraph = {
    seedNode: nextPayload.seedNode || currentGraph.seedNode,
    nodes: [...nodeMap.values()].sort((left, right) =>
      `${left.kind}:${left.label}:${left.id}`.localeCompare(
        `${right.kind}:${right.label}:${right.id}`
      )
    ),
    edges: [...edgeMap.values()].sort((left, right) =>
      `${left.type}:${left.source}:${left.target}:${left.id}`.localeCompare(
        `${right.type}:${right.source}:${right.target}:${right.id}`
      )
    ),
    meta: {
      ...(currentGraph.meta || {}),
      ...(nextPayload.meta || {})
    }
  };

  mergedGraph.meta.availableNodeKinds = [
    ...new Set(mergedGraph.nodes.map((node) => node.kind))
  ].sort((left, right) => left.localeCompare(right));
  mergedGraph.meta.availableRelationshipTypes = [
    ...new Set(mergedGraph.edges.map((edge) => edge.type))
  ].sort((left, right) => left.localeCompare(right));
  mergedGraph.meta.nodeCount = mergedGraph.nodes.length;
  mergedGraph.meta.edgeCount = mergedGraph.edges.length;

  return mergedGraph;
}

export function applyNodePositions(graph, nextPositions) {
  const positionsById = new Map(
    (nextPositions || [])
      .filter(
        (position) =>
          position &&
          typeof position.id === "string" &&
          Number.isFinite(position.x) &&
          Number.isFinite(position.y)
      )
      .map((position) => [
        position.id,
        {
          x: position.x,
          y: position.y
        }
      ])
  );

  if (positionsById.size === 0) {
    return graph;
  }

  const nextNodes = graph.nodes.map((node) => {
    const position = positionsById.get(node.id);

    if (!position) {
      return node;
    }

    return {
      ...node,
      x: position.x,
      y: position.y
    };
  });
  const seedPosition = graph.seedNode ? positionsById.get(graph.seedNode.id) : null;

  return {
    ...graph,
    seedNode: seedPosition
      ? {
          ...graph.seedNode,
          x: seedPosition.x,
          y: seedPosition.y
        }
      : graph.seedNode,
    nodes: nextNodes
  };
}

export function syncFilterState(currentFilters, graph) {
  const nextNodeKinds = {};
  const nextRelationshipTypes = {};

  for (const group of buildNodeFilterCatalog(graph)) {
    nextNodeKinds[group.id] =
      currentFilters.nodeKinds[group.id] === undefined ? true : currentFilters.nodeKinds[group.id];
  }

  for (const group of buildRelationshipFilterCatalog(graph)) {
    nextRelationshipTypes[group.id] =
      currentFilters.relationshipTypes[group.id] === undefined
        ? true
        : currentFilters.relationshipTypes[group.id];
  }

  return {
    nodeKinds: nextNodeKinds,
    relationshipTypes: nextRelationshipTypes
  };
}

export function applyFilters(graph, filters) {
  const visibleNodes = graph.nodes.filter(
    (node) => filters.nodeKinds[getNodeFilterGroupId(node.kind)] !== false
  );
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter(
    (edge) =>
      filters.relationshipTypes[getRelationshipFilterGroupId(edge.type)] !== false &&
      visibleNodeIds.has(edge.source) &&
      visibleNodeIds.has(edge.target)
  );

  return {
    ...graph,
    nodes: visibleNodes,
    edges: visibleEdges,
    meta: {
      ...graph.meta,
      visibleNodeCount: visibleNodes.length,
      visibleEdgeCount: visibleEdges.length
    }
  };
}
