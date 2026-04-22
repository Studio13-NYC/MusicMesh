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

  for (const kind of graph.meta.availableNodeKinds || []) {
    nextNodeKinds[kind] =
      currentFilters.nodeKinds[kind] === undefined ? true : currentFilters.nodeKinds[kind];
  }

  for (const type of graph.meta.availableRelationshipTypes || []) {
    nextRelationshipTypes[type] =
      currentFilters.relationshipTypes[type] === undefined
        ? true
        : currentFilters.relationshipTypes[type];
  }

  return {
    nodeKinds: nextNodeKinds,
    relationshipTypes: nextRelationshipTypes
  };
}

export function applyFilters(graph, filters) {
  const visibleNodes = graph.nodes.filter((node) => filters.nodeKinds[node.kind] !== false);
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter(
    (edge) =>
      filters.relationshipTypes[edge.type] !== false &&
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
