import filterCatalog from "./graphFilterCatalog.json";

export const NODE_FILTER_GROUPS = filterCatalog.nodeGroups;
export const RELATIONSHIP_FILTER_GROUPS = filterCatalog.relationshipGroups;

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
    normalized.includes("CREDIT") ||
    normalized.includes("CONTRIB") ||
    normalized.includes("HIRED")
  ) {
    return "production-collaboration";
  }

  if (
    normalized.includes("SCENE") ||
    normalized.includes("VENUE") ||
    normalized.includes("PLACE") ||
    normalized.includes("LOCATED") ||
    normalized.includes("FORMED") ||
    normalized.includes("ORIGIN") ||
    normalized.includes("WORKED_AT")
  ) {
    return "scene-place";
  }

  if (normalized.includes("GENRE") || normalized.includes("STYLE")) {
    return "genre-style";
  }

  if (
    normalized.includes("INSTRUMENT") ||
    normalized.includes("AMPLIFIER") ||
    normalized.includes("EQUIPMENT") ||
    normalized.includes("EFFECT") ||
    normalized.includes("CONSOLE") ||
    normalized.includes("MANUFACT")
  ) {
    return "instrument-gear";
  }

  if (
    normalized.includes("COVER") ||
    normalized.includes("VERSION") ||
    normalized.includes("MIX") ||
    normalized.includes("MASTER")
  ) {
    return "songs-versions";
  }

  if (
    normalized.includes("INFLUENCE") ||
    normalized.includes("RELATED") ||
    normalized.includes("SIMILAR") ||
    normalized.includes("PEER")
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
