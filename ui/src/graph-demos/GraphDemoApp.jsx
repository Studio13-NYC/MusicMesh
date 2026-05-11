import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchGraphSubgraph,
  fetchThreadFocusedGraph,
  fetchNodeDetail,
  searchGraphSeeds
} from "./api";
import {
  applyNodePositions,
  applyFilters,
  buildNodeFilterCatalog,
  buildRelationshipFilterCatalog,
  createEmptyGraph,
  mergeGraphPayload,
  syncFilterState
} from "./graphState";

const LIBRARY_COPY = {
  cytoscape: {
    heading: "Cytoscape graph demo",
    accent: "Cytoscape.js",
    notes:
      "This is the active MusicMesh graph path. Server-shaped graph data, app-style drawers, and Cytoscape interaction behavior define the current visualization direction."
  }
};

const GRAPH_HISTORY_LIMIT = 24;
const DEFAULT_SEED_MAX_NODES = 160;
const DEFAULT_SEED_MAX_EDGES = 240;

function cloneGraphPayload(graph) {
  return JSON.parse(JSON.stringify(graph || createEmptyGraph()));
}

function graphTopologyKey(graph) {
  const nodeIds = (graph?.nodes || []).map((node) => node.id).sort();
  const edgeIds = (graph?.edges || []).map((edge) => edge.id).sort();

  return JSON.stringify({
    seed: graph?.seedNode?.id || "",
    preview: Boolean(graph?.meta?.preview),
    nodes: nodeIds,
    edges: edgeIds
  });
}

function makeGraphHistoryEntry(graph, label, source) {
  const clonedGraph = cloneGraphPayload(graph);

  return {
    graph: clonedGraph,
    key: graphTopologyKey(clonedGraph),
    label: label || clonedGraph.seedNode?.label || "Graph view",
    source,
    createdAt: new Date().toISOString()
  };
}

function addGraphHistoryEntry(currentHistory, entry) {
  if ((entry.graph.nodes || []).length === 0) {
    return currentHistory;
  }

  const activeEntry = currentHistory.entries[currentHistory.index];

  if (activeEntry?.key === entry.key) {
    const nextEntries = currentHistory.entries.map((currentEntry, index) =>
      index === currentHistory.index ? entry : currentEntry
    );

    return {
      entries: nextEntries,
      index: currentHistory.index
    };
  }

  const retainedEntries =
    currentHistory.index >= 0
      ? currentHistory.entries.slice(0, currentHistory.index + 1)
      : currentHistory.entries;
  const nextEntries = [...retainedEntries, entry].slice(-GRAPH_HISTORY_LIMIT);

  return {
    entries: nextEntries,
    index: nextEntries.length - 1
  };
}

function replaceActiveGraphHistoryEntry(currentHistory, graph) {
  if (currentHistory.index < 0) {
    return currentHistory;
  }

  const activeEntry = currentHistory.entries[currentHistory.index];

  if (!activeEntry) {
    return currentHistory;
  }

  const nextEntry = {
    ...activeEntry,
    graph: cloneGraphPayload(graph),
    key: graphTopologyKey(graph)
  };

  return {
    entries: currentHistory.entries.map((entry, index) =>
      index === currentHistory.index ? nextEntry : entry
    ),
    index: currentHistory.index
  };
}

function shouldPreserveGraphView(currentGraph, nextGraph) {
  const currentNodes = currentGraph?.nodes || [];
  const nextNodes = nextGraph?.nodes || [];

  if (currentNodes.length === 0 || nextNodes.length === 0) {
    return false;
  }

  const currentSeedId = currentGraph?.seedNode?.id || "";
  const nextSeedId = nextGraph?.seedNode?.id || "";

  if (currentSeedId && nextSeedId && currentSeedId === nextSeedId) {
    return true;
  }

  const currentNodeIds = new Set(currentNodes.map((node) => node.id));
  const overlapCount = nextNodes.filter((node) => currentNodeIds.has(node.id)).length;
  const overlapFloor = Math.min(3, nextNodes.length);

  return overlapCount >= overlapFloor && currentNodes.length >= nextNodes.length;
}

function stripSurroundingQuotes(value) {
  let text = String(value || "").trim();
  const quotePairs = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["‘", "’"]
  ];

  let removedQuotes = true;

  while (removedQuotes && text.length >= 2) {
    removedQuotes = false;

    for (const [leftQuote, rightQuote] of quotePairs) {
      if (text.startsWith(leftQuote) && text.endsWith(rightQuote)) {
        text = text.slice(leftQuote.length, text.length - rightQuote.length).trim();
        removedQuotes = true;
      }
    }
  }

  return text;
}

function normalizeLookupLabel(value) {
  return stripSurroundingQuotes(value).toLocaleLowerCase();
}

function findMatchingNodeByLabel(nodes, focusNode) {
  const targetLabel = normalizeLookupLabel(focusNode?.label);

  if (!targetLabel) {
    return null;
  }

  const exactMatches = (nodes || []).filter(
    (node) => normalizeLookupLabel(node.label) === targetLabel
  );

  if (exactMatches.length === 0) {
    return null;
  }

  return (
    exactMatches.find((node) => node.kind === focusNode?.kind) ||
    exactMatches.find((node) => node.kind === focusNode?.summary?.labels?.[0]) ||
    exactMatches[0]
  );
}

function findMatchingSeedResult(results, focusNode) {
  return findMatchingNodeByLabel(results, focusNode);
}

function isPreviewNodeId(value) {
  return typeof value === "string" && value.startsWith("preview-node-");
}

function parseFocusKey(focusKey) {
  const text = typeof focusKey === "string" ? focusKey.trim() : "";
  const separatorIndex = text.indexOf(":");

  if (separatorIndex <= 0) {
    return {
      kind: "",
      id: ""
    };
  }

  return {
    kind: text.slice(0, separatorIndex),
    id: text.slice(separatorIndex + 1)
  };
}

function findPreferredSeedResult(results, query) {
  const normalizedQuery = normalizeLookupLabel(query);
  const candidates = Array.isArray(results) ? results : [];

  if (!normalizedQuery) {
    return candidates[0] || null;
  }

  return (
    candidates.find((result) => normalizeLookupLabel(result.label) === normalizedQuery) ||
    candidates.find((result) => normalizeLookupLabel(result.label).includes(normalizedQuery)) ||
    candidates[0] ||
    null
  );
}

function buildLocalPreviewFocusGraph(sourceGraph, seedId) {
  const sourceNodes = sourceGraph?.nodes || [];
  const sourceEdges = sourceGraph?.edges || [];
  const seedNode = sourceNodes.find((node) => node.id === seedId);

  if (!seedNode) {
    return null;
  }

  const connectedNodeIds = new Set([seedId]);
  const incidentEdges = sourceEdges.filter((edge) => {
    const isIncident = edge.source === seedId || edge.target === seedId;

    if (isIncident) {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    }

    return isIncident;
  });
  const focusedNodes = sourceNodes.filter((node) => connectedNodeIds.has(node.id));
  const neighborNodes = focusedNodes
    .filter((node) => node.id !== seedId)
    .sort((left, right) => String(left.label || "").localeCompare(String(right.label || "")));
  const radius = Math.min(420, Math.max(150, 110 + neighborNodes.length * 10));
  const positionedSeed = {
    ...seedNode,
    isSeed: true,
    x: 0,
    y: 0
  };
  const positionedNeighbors = neighborNodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, neighborNodes.length);

    return {
      ...node,
      isSeed: false,
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius)
    };
  });
  const nextNodes = [positionedSeed, ...positionedNeighbors];
  const nextNodeIds = new Set(nextNodes.map((node) => node.id));
  const nextEdges = incidentEdges.filter(
    (edge) => nextNodeIds.has(edge.source) && nextNodeIds.has(edge.target)
  );

  return {
    seedNode: positionedSeed,
    nodes: nextNodes,
    edges: nextEdges,
    meta: {
      ...(sourceGraph?.meta || {}),
      preview: true,
      status: `Previewing saved answer context around ${seedNode.label || "the selected node"}.`,
      nodeCount: nextNodes.length,
      edgeCount: nextEdges.length,
      visibleNodeCount: nextNodes.length,
      visibleEdgeCount: nextEdges.length,
      availableNodeKinds: [...new Set(nextNodes.map((node) => node.kind).filter(Boolean))].sort(),
      availableRelationshipTypes: [
        ...new Set(nextEdges.map((edge) => edge.type).filter(Boolean))
      ].sort()
    }
  };
}

export function GraphDemoApp({
  GraphCanvas,
  defaultSeedQuery = "",
  library,
  embedded = false,
  threadId = "",
  focusKey = "",
  onRequestNodeExpansion = null
}) {
  const [graph, setGraph] = useState(createEmptyGraph());
  const [filters, setFilters] = useState({
    nodeKinds: {},
    relationshipTypes: {}
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState("");
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isGraphLoading, setIsGraphLoading] = useState(false);
  const [isExpandLoading, setIsExpandLoading] = useState(false);
  const [selectedElement, setSelectedElement] = useState(null);
  const [hoveredElement, setHoveredElement] = useState(null);
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false);
  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(false);
  const [nodeDetails, setNodeDetails] = useState({});
  const [detailError, setDetailError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [graphHistory, setGraphHistory] = useState({
    entries: [],
    index: -1
  });
  const canvasRef = useRef(null);
  const graphRef = useRef(graph);
  const autoLoadedRef = useRef(false);
  const suppressInspectOpenRef = useRef(false);
  const filteredGraph = useMemo(() => applyFilters(graph, filters), [graph, filters]);
  const nodeFilterCatalog = useMemo(() => buildNodeFilterCatalog(graph), [graph]);
  const relationshipFilterCatalog = useMemo(
    () => buildRelationshipFilterCatalog(graph),
    [graph]
  );
  const libraryCopy = LIBRARY_COPY[library] || LIBRARY_COPY.cytoscape;

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useEffect(() => {
    let ignore = false;

    async function loadInitialSeed() {
      setIsSearchLoading(true);
      setSearchStatus("");

      try {
        if (threadId) {
          const parsedFocusKey = parseFocusKey(focusKey);

          if (parsedFocusKey.kind === "graph" && parsedFocusKey.id) {
            setSearchStatus("Loading graph anchor...");
            await loadSeed(parsedFocusKey.id);
            return;
          }

          if (parsedFocusKey.id) {
            let focusPayload = null;

            try {
              focusPayload = await fetchThreadFocusedGraph(threadId, 200, parsedFocusKey.id);
            } catch (error) {
              if (!ignore) {
                setSearchStatus("Thread focus unavailable; keeping the current graph visible.");
              }
            }

            if (!ignore && focusPayload?.hasFocus && focusPayload.graph) {
              const isPreview = Boolean(focusPayload.graph.meta?.preview);
              const currentGraph = graphRef.current;
              const nextGraph = shouldPreserveGraphView(currentGraph, focusPayload.graph)
                ? mergeGraphPayload(currentGraph, focusPayload.graph)
                : focusPayload.graph;

              autoLoadedRef.current = true;
              setSearchQuery(focusPayload.focusSeed?.label || focusPayload.graphAnchorId || "");
              setSearchStatus(
                isPreview
                  ? `Previewing ${focusPayload.focusSeed?.label || "answer graph"}`
                  : `Loaded ${focusPayload.focusSeed?.label || "active graph anchor"}`
              );
              rememberGraph(nextGraph, {
                label: focusPayload.focusSeed?.label || nextGraph.seedNode?.label || "Thread graph",
                source: isPreview ? "thread-preview" : "thread-focus"
              });
              setFilters((currentFilters) => syncFilterState(currentFilters, nextGraph));
              suppressInspectOpenRef.current = true;
              setSelectedElement(
                !isPreview && nextGraph.seedNode
                  ? {
                      type: "node",
                      id: nextGraph.seedNode.id
                    }
                  : null
              );
              setHoveredElement(null);
              return;
            }

            if (!ignore) {
              setSearchStatus("Building graph from the current answer...");
              return;
            }
          }

          if (!defaultSeedQuery && !autoLoadedRef.current) {
            setSearchStatus("No seed loaded.");
            return;
          }
        }

        const seedQuery = defaultSeedQuery || "";
        const payload = await searchGraphSeeds(seedQuery, defaultSeedQuery ? 8 : 1);

        if (ignore) {
          return;
        }

        if (!autoLoadedRef.current && (payload.results || []).length > 0) {
          autoLoadedRef.current = true;
          const topMatch = findPreferredSeedResult(payload.results, seedQuery);
          setSearchQuery(topMatch.label);
          setSearchStatus(`Loaded ${topMatch.label}`);
          await loadSeed(
            topMatch.id,
            defaultSeedQuery
              ? {
                  depth: 1,
                  maxNodes: DEFAULT_SEED_MAX_NODES,
                  maxEdges: DEFAULT_SEED_MAX_EDGES,
                  pathLimit: DEFAULT_SEED_MAX_EDGES
                }
              : {}
          );
        } else if ((payload.results || []).length === 0) {
          setSearchStatus(defaultSeedQuery ? `No ${defaultSeedQuery} seed available.` : "No seed available.");
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error.message);
          setSearchStatus("Search unavailable.");
        }
      } finally {
        if (!ignore) {
          setIsSearchLoading(false);
        }
      }
    }

    loadInitialSeed();

    return () => {
      ignore = true;
    };
  }, [defaultSeedQuery, focusKey, threadId]);

  useEffect(() => {
    if (!selectedElement || selectedElement.type !== "node" || graph.meta?.preview) {
      return;
    }

    if (nodeDetails[selectedElement.id]) {
      return;
    }

    let ignore = false;
    setDetailError("");

    fetchNodeDetail(selectedElement.id)
      .then((detail) => {
        if (ignore) {
          return;
        }

        setNodeDetails((currentDetails) => ({
          ...currentDetails,
          [selectedElement.id]: detail
        }));
      })
      .catch((error) => {
        if (!ignore) {
          setDetailError(error.message);
        }
      });

    return () => {
      ignore = true;
    };
  }, [graph.meta?.preview, nodeDetails, selectedElement]);

  useEffect(() => {
    if (!selectedElement) {
      return;
    }

    const hasSelectedNode =
      selectedElement.type === "node" &&
      filteredGraph.nodes.some((node) => node.id === selectedElement.id);
    const hasSelectedEdge =
      selectedElement.type === "edge" &&
      filteredGraph.edges.some((edge) => edge.id === selectedElement.id);

    if (!hasSelectedNode && !hasSelectedEdge) {
      setSelectedElement(null);
    }
  }, [filteredGraph.edges, filteredGraph.nodes, selectedElement]);

  useEffect(() => {
    if (selectedElement) {
      if (suppressInspectOpenRef.current) {
        suppressInspectOpenRef.current = false;
        return;
      }
      if (!embedded) {
        setIsRightDrawerOpen(true);
      }
    }
  }, [embedded, selectedElement]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsLeftDrawerOpen(false);
        setIsRightDrawerOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function rememberGraph(nextGraph, { label = "", source = "graph" } = {}) {
    setGraph(nextGraph);
    setGraphHistory((currentHistory) =>
      addGraphHistoryEntry(currentHistory, makeGraphHistoryEntry(nextGraph, label, source))
    );
  }

  function handleHistoryStep(offset) {
    const nextIndex = graphHistory.index + offset;
    const nextEntry = graphHistory.entries[nextIndex];

    if (!nextEntry) {
      return;
    }

    const nextGraph = cloneGraphPayload(nextEntry.graph);

    setGraphHistory((currentHistory) => ({
      ...currentHistory,
      index: nextIndex
    }));
    setGraph(nextGraph);
    setFilters((currentFilters) => syncFilterState(currentFilters, nextGraph));
    setSelectedElement(null);
    setHoveredElement(null);
    setSearchStatus(`Redisplayed ${nextEntry.label}`);
  }

  async function loadSeed(seedId, options = {}) {
    setIsGraphLoading(true);
    setErrorMessage("");

    try {
      const payload = await fetchGraphSubgraph(seedId, options);

      rememberGraph(payload, {
        label: payload.seedNode?.label || "Loaded graph",
        source: "seed"
      });
      setFilters((currentFilters) => syncFilterState(currentFilters, payload));
      suppressInspectOpenRef.current = true;
      setSelectedElement(
        payload.seedNode
          ? {
              type: "node",
              id: payload.seedNode.id
            }
          : null
      );
      setHoveredElement(null);
    } catch (error) {
      setErrorMessage(error.message);
      setGraph(createEmptyGraph());
    } finally {
      setIsGraphLoading(false);
    }
  }

  async function handleExpand(nodeId) {
    if (!nodeId) {
      return;
    }

    const focusNode = graph.nodes.find((node) => node.id === nodeId) || selectedNode;

    setIsExpandLoading(true);
    setErrorMessage("");

    try {
      if (typeof onRequestNodeExpansion === "function") {
        const handled = await onRequestNodeExpansion(
          focusNode || {
            id: nodeId,
            label: nodeId,
            kind: "Node"
          }
        );

        if (handled !== false) {
          setSearchQuery(focusNode?.label || nodeId);
          setSearchStatus(`Asked MusicMesh to expand ${focusNode?.label || "the selected node"}.`);
          return;
        }
      }

      const resolvedNode = await resolveExpandableNodeId(nodeId, focusNode);
      const payload = resolvedNode.localGraph
        ? resolvedNode.localGraph
        : await fetchGraphSubgraph(resolvedNode.seedId);

      rememberGraph(payload, {
        label: payload.seedNode?.label || resolvedNode.label || focusNode?.label || "Focused graph",
        source: resolvedNode.localGraph ? "preview-focus" : "focus"
      });
      setFilters((currentFilters) => syncFilterState(currentFilters, payload));
      suppressInspectOpenRef.current = true;
      setSelectedElement(
        payload.seedNode
          ? {
              type: "node",
              id: payload.seedNode.id
            }
          : null
      );
      setHoveredElement(null);
      setSearchQuery(payload.seedNode?.label || resolvedNode.label || focusNode?.label || "");
      setSearchStatus(
        resolvedNode.localGraph
          ? `Previewing connections for ${payload.seedNode?.label || resolvedNode.label || "selected node"}`
          : resolvedNode.fromPreview
          ? `Centered persisted ${payload.seedNode?.label || resolvedNode.label || "selected node"}`
          : `Centered ${payload.seedNode?.label || resolvedNode.label || focusNode?.label || "selected node"}`
      );
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsExpandLoading(false);
    }
  }

  async function resolveExpandableNodeId(nodeId, focusNode) {
    const isPreviewNode = Boolean(
      focusNode?.isPreview ||
        graph.meta?.preview ||
        isPreviewNodeId(nodeId)
    );

    if (!isPreviewNode) {
      return {
        seedId: nodeId,
        label: focusNode?.label || "",
        fromPreview: false
      };
    }

    const previewLabel = focusNode?.label || "";

    if (threadId) {
      try {
        const focusPayload = await fetchThreadFocusedGraph(threadId);
        const focusGraph = focusPayload?.graph;

        if (focusPayload?.hasFocus && focusGraph && !focusGraph.meta?.preview) {
          const matchedNode = findMatchingNodeByLabel(focusGraph.nodes || [], focusNode);

          if (matchedNode?.id) {
            return {
              seedId: matchedNode.id,
              label: matchedNode.label || previewLabel,
              fromPreview: true
            };
          }
        }
      } catch {
        // Fall through to seed search; preview expansion should fail softly.
      }
    }

    if (previewLabel) {
      const searchPayload = await searchGraphSeeds(previewLabel, 8);
      const matchedSeed = findMatchingSeedResult(searchPayload.results || [], focusNode);

      if (matchedSeed?.id && !isPreviewNodeId(matchedSeed.id)) {
        return {
          seedId: matchedSeed.id,
          label: matchedSeed.label || previewLabel,
          fromPreview: true
        };
      }
    }

    const localGraph = buildLocalPreviewFocusGraph(graph, nodeId);

    if (localGraph) {
      return {
        seedId: nodeId,
        label: localGraph.seedNode?.label || previewLabel,
        fromPreview: true,
        localGraph
      };
    }

    throw new Error(
      previewLabel
        ? `"${previewLabel}" is still preview-only and has no saved graph node yet.`
        : "This preview node has no saved graph node yet."
    );
  }

  async function handleSearchSubmit(event) {
    event.preventDefault();
    setIsSearchLoading(true);
    setSearchStatus("");
    setErrorMessage("");

    try {
      const payload = await searchGraphSeeds(searchQuery, 1);
      const topMatch = payload.results?.[0];

      if (!topMatch) {
        setSearchStatus("No match found.");
        return;
      }

      setSearchQuery(topMatch.label);
      setSearchStatus(`Loaded ${topMatch.label}`);
      await loadSeed(topMatch.id);
    } catch (error) {
      setErrorMessage(error.message);
      setSearchStatus("Search unavailable.");
    } finally {
      setIsSearchLoading(false);
    }
  }

  function handleFilterToggle(group, key) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [group]: {
        ...currentFilters[group],
        [key]: !currentFilters[group][key]
      }
    }));
  }

  function handleNodePositionChange(nextPositions) {
    const nextGraph = applyNodePositions(graph, nextPositions);

    setGraph(nextGraph);
    setGraphHistory((currentHistory) => replaceActiveGraphHistoryEntry(currentHistory, nextGraph));
  }

  const selectedNode =
    selectedElement?.type === "node"
      ? graph.nodes.find((node) => node.id === selectedElement.id) || null
      : null;
  const selectedEdge =
    selectedElement?.type === "edge"
      ? graph.edges.find((edge) => edge.id === selectedElement.id) || null
      : null;
  const selectedNodeDetail = selectedNode ? nodeDetails[selectedNode.id] || null : null;

  return (
    <div className={`graph-demo-page${embedded ? " graph-demo-page-embedded" : ""}`}>
      {!embedded ? (
        <header className="demo-topbar">
          <div className="demo-topbar-copy">
            <p className="demo-kicker">MusicMesh standalone graph demo</p>
            <h1>{libraryCopy.heading}</h1>
            <p className="demo-notes">{libraryCopy.notes}</p>
          </div>
          <div className="demo-topbar-actions">
            <span className="demo-pill">{libraryCopy.accent}</span>
            <span className="demo-pill">
              {graph.meta.visibleNodeCount || 0} visible nodes / {graph.meta.visibleEdgeCount || 0} visible edges
            </span>
          </div>
        </header>
      ) : null}

      <div className="demo-layout">
        <aside
          className={`demo-sidebar demo-drawer demo-drawer-left${
            isLeftDrawerOpen ? " is-open" : ""
          }`}
        >
          <div className="demo-panel demo-panel-scroll demo-drawer-panel">
            <div className="demo-drawer-header">
              <p className="demo-panel-label">Browse</p>
              <button
                aria-label="Close browse drawer"
                className="demo-button demo-button-tight demo-button-icon"
                onClick={() => setIsLeftDrawerOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>

            <section className="demo-drawer-section">
              <p className="demo-panel-label">Seed search</p>
              <form className="demo-search-form" onSubmit={handleSearchSubmit}>
                <div className="demo-search-row">
                  <input
                    className="demo-search-input"
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search graph seeds"
                    value={searchQuery}
                  />
                  <button className="demo-button demo-button-inline" type="submit">
                    {isSearchLoading ? "Loading..." : "Load"}
                  </button>
                </div>
              </form>
              {searchStatus ? <p className="demo-search-status">{searchStatus}</p> : null}
            </section>

            <section className="demo-drawer-section">
              <p className="demo-panel-label">Filters</p>
              <div className="demo-filter-group">
                <p className="demo-filter-title">Node kinds</p>
                {nodeFilterCatalog.map((group) => (
                  <label className="demo-checkbox" key={group.id}>
                    <input
                      checked={filters.nodeKinds[group.id] !== false}
                      disabled={group.count === 0}
                      onChange={() => handleFilterToggle("nodeKinds", group.id)}
                      type="checkbox"
                    />
                    <span>{group.label}</span>
                    <strong>{group.count}</strong>
                  </label>
                ))}
              </div>
              <div className="demo-filter-group">
                <p className="demo-filter-title">Relationship types</p>
                {relationshipFilterCatalog.map((group) => (
                  <label className="demo-checkbox" key={group.id}>
                    <input
                      checked={filters.relationshipTypes[group.id] !== false}
                      disabled={group.count === 0}
                      onChange={() => handleFilterToggle("relationshipTypes", group.id)}
                      type="checkbox"
                    />
                    <span>{group.label}</span>
                    <strong>{group.count}</strong>
                  </label>
                ))}
              </div>
            </section>

            <section className="demo-drawer-section">
              <p className="demo-panel-label">Legend</p>
              <div className="demo-legend">
                <LegendRow colorClass="artist" label="Artist / Band" />
                <LegendRow colorClass="album" label="Album / Release" />
                <LegendRow colorClass="track" label="Track / Song" />
                <LegendRow colorClass="person" label="Person / Member" />
                <LegendRow colorClass="label" label="Record label" />
                <LegendRow colorClass="scene" label="Scene" />
                <LegendRow colorClass="venue" label="Venue" />
                <LegendRow colorClass="genre" label="Genre / Other typed node" />
              </div>
              <div className="demo-legend demo-legend-edges">
                <LegendEdgeRow styleKey="solid" label="Strong structural relationship" />
                <LegendEdgeRow styleKey="dashed" label="Contributed / member / collaborator style" />
                <LegendEdgeRow styleKey="dotted" label="Influence / soft relationship style" />
              </div>
            </section>
          </div>
        </aside>

        <main className="demo-canvas-panel">
          <div className="demo-toolbar-shell">
            <div className="demo-toolbar">
              <div className="demo-toolbar-group">
                <button
                  className="demo-button demo-button-tight"
                  disabled={graphHistory.index <= 0}
                  onClick={() => handleHistoryStep(-1)}
                  title="Redisplay the previous graph view without research"
                  type="button"
                >
                  Back
                </button>
                <button
                  className="demo-button demo-button-tight"
                  disabled={
                    graphHistory.index < 0 ||
                    graphHistory.index >= graphHistory.entries.length - 1
                  }
                  onClick={() => handleHistoryStep(1)}
                  title="Redisplay the next graph view without research"
                  type="button"
                >
                  Forward
                </button>
                <button
                  aria-expanded={isLeftDrawerOpen}
                  className="demo-button demo-button-tight"
                  onClick={() => setIsLeftDrawerOpen((currentValue) => !currentValue)}
                  type="button"
                >
                  Browse
                </button>
                <button
                  className="demo-button demo-button-tight"
                  disabled={isGraphLoading || graph.nodes.length === 0}
                  onClick={() => canvasRef.current?.fitToGraph()}
                  type="button"
                >
                  Fit
                </button>
                <button
                  className="demo-button demo-button-tight"
                  disabled={isGraphLoading || graph.nodes.length === 0}
                  onClick={() => canvasRef.current?.resetView()}
                  type="button"
                >
                  Reset
                </button>
              </div>
              <div className="demo-toolbar-meta">
                <span className="demo-toolbar-seed">
                  {graph.meta?.preview
                    ? `${graph.seedNode?.label || "Answer graph"} preview`
                    : graph.seedNode?.label || "No seed loaded"}
                </span>
                <span>
                  {graph.meta.nodeCount || 0}n / {graph.meta.edgeCount || 0}e
                </span>
                {graphHistory.entries.length > 0 ? (
                  <span>
                    View {graphHistory.index + 1}/{graphHistory.entries.length}
                  </span>
                ) : null}
              </div>
              <div className="demo-toolbar-group">
                <button
                  className="demo-button demo-button-tight demo-button-accent"
                  disabled={isExpandLoading || !selectedNode || isGraphLoading}
                  onClick={() => handleExpand(selectedNode?.id)}
                  type="button"
                >
                  {isExpandLoading ? "Expanding..." : "Expand"}
                </button>
                <button
                  aria-expanded={isRightDrawerOpen}
                  className="demo-button demo-button-tight"
                  onClick={() => setIsRightDrawerOpen((currentValue) => !currentValue)}
                  type="button"
                >
                  Inspect
                </button>
              </div>
            </div>
          </div>

          <div className="demo-canvas-shell">
            {isGraphLoading ? (
              <div className="demo-empty-state">Loading graph from Neo4j...</div>
            ) : filteredGraph.nodes.length > 0 ? (
              <GraphCanvas
                ref={canvasRef}
                graph={filteredGraph}
                hoveredElement={hoveredElement}
                onBackgroundSelect={() => setSelectedElement(null)}
                onExpandNode={handleExpand}
                onHoverChange={setHoveredElement}
                onNodePositionChange={handleNodePositionChange}
                onSelectElement={setSelectedElement}
                selectedElement={selectedElement}
              />
            ) : (
              <div className="demo-empty-state">
                Load a seed node to inspect the graph.
              </div>
            )}
          </div>

          {errorMessage ? <p className="demo-error">{errorMessage}</p> : null}
        </main>

        <aside
          className={`demo-detail-panel demo-drawer demo-drawer-right${
            isRightDrawerOpen ? " is-open" : ""
          }`}
        >
          <section className="demo-panel demo-panel-scroll demo-drawer-panel">
            <div className="demo-drawer-header">
              <p className="demo-panel-label">Inspect</p>
              <button
                aria-label="Close inspect drawer"
                className="demo-button demo-button-tight demo-button-icon"
                onClick={() => setIsRightDrawerOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <p className="demo-panel-label">Selection</p>
            {selectedNode ? (
              <NodeDetailCard
                detail={selectedNodeDetail}
                fallbackNode={selectedNode}
                errorMessage={detailError}
              />
            ) : null}
            {selectedEdge ? (
              <EdgeDetailCard edge={selectedEdge} graph={graph} />
            ) : null}
            {!selectedNode && !selectedEdge ? (
              <p className="demo-muted">
                Click a node or relationship to inspect it here. Double-clicking a node expands its neighborhood.
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

function LegendRow({ colorClass, label }) {
  return (
    <div className="demo-legend-row">
      <span className={`demo-node-chip ${colorClass}`} />
      <span>{label}</span>
    </div>
  );
}

function LegendEdgeRow({ styleKey, label }) {
  return (
    <div className="demo-legend-row">
      <span className={`demo-edge-chip ${styleKey}`} />
      <span>{label}</span>
    </div>
  );
}

function NodeDetailCard({ detail, fallbackNode, errorMessage }) {
  if (errorMessage) {
    return <p className="demo-error">{errorMessage}</p>;
  }

  if (!detail && fallbackNode?.isPreview) {
    return (
      <div className="demo-detail-card">
        <h2>{fallbackNode.label}</h2>
        <p className="demo-detail-subtitle">
          {fallbackNode.summary?.subtitle || fallbackNode.kind}
        </p>
        <div className="demo-tag-list demo-tag-list-tight">
          {(fallbackNode.summary?.labels || [fallbackNode.kind]).map((label) => (
            <span className="demo-tag" key={label}>
              {label}
            </span>
          ))}
          <span className="demo-tag">Preview</span>
        </div>
      </div>
    );
  }

  if (!detail) {
    return <p className="demo-muted">Loading node detail...</p>;
  }

  return (
    <div className="demo-detail-card">
      <h2>{detail.label}</h2>
      <p className="demo-detail-subtitle">
        {detail.kind} · {detail.relationshipCount} connected relationships
      </p>
      <div className="demo-tag-list demo-tag-list-tight">
        {detail.labels.map((label) => (
          <span className="demo-tag" key={label}>
            {label}
          </span>
        ))}
      </div>
      <p className="demo-subheading">Top relationship types</p>
      {detail.relationshipTypes.length > 0 ? (
        <div className="demo-property-list demo-property-list-tight">
          {detail.relationshipTypes.map((relationshipType) => (
            <div className="demo-property-row" key={relationshipType.type}>
              <span>{relationshipType.type}</span>
              <strong>{relationshipType.count}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="demo-muted">No relationship type summary available.</p>
      )}
      <p className="demo-subheading">Properties</p>
      <PropertyList properties={detail.properties} />
      {!detail && fallbackNode ? (
        <p className="demo-muted">{fallbackNode.summary.subtitle}</p>
      ) : null}
    </div>
  );
}

function EdgeDetailCard({ edge, graph }) {
  const source = graph.nodes.find((node) => node.id === edge.source);
  const target = graph.nodes.find((node) => node.id === edge.target);

  return (
    <div className="demo-detail-card">
      <h2>{edge.type}</h2>
      <p className="demo-detail-subtitle">
        {source?.label || edge.source} → {target?.label || edge.target}
      </p>
      <div className="demo-property-list demo-property-list-tight">
        <div className="demo-property-row">
          <span>Style</span>
          <strong>{edge.styleKey}</strong>
        </div>
        <div className="demo-property-row">
          <span>Source</span>
          <strong>{source?.kind || "Node"}</strong>
        </div>
        <div className="demo-property-row">
          <span>Target</span>
          <strong>{target?.kind || "Node"}</strong>
        </div>
      </div>
    </div>
  );
}

function PropertyList({ properties }) {
  const entries = Object.entries(properties || {});

  if (entries.length === 0) {
    return <p className="demo-muted">No properties recorded.</p>;
  }

  return (
    <div className="demo-property-list">
      {entries.map(([key, value]) => (
        <div className="demo-property-row" key={key}>
          <span>{key}</span>
          <strong>{formatValue(value)}</strong>
        </div>
      ))}
    </div>
  );
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}
