import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  expandGraphNode,
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

export function GraphDemoApp({
  GraphCanvas,
  library,
  embedded = false,
  threadId = "",
  focusKey = ""
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
  const canvasRef = useRef(null);
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
    let ignore = false;

    async function loadInitialSeed() {
      setIsSearchLoading(true);
      setSearchStatus("");

      try {
        if (threadId) {
          if (!focusKey) {
            autoLoadedRef.current = false;
            setSearchQuery("");
            setSearchStatus("No seed loaded.");
            setGraph(createEmptyGraph());
            setFilters({
              nodeKinds: {},
              relationshipTypes: {}
            });
            setSelectedElement(null);
            setHoveredElement(null);
            return;
          }

          let focusPayload = null;

          try {
            focusPayload = await fetchThreadFocusedGraph(threadId);
          } catch (error) {
            if (!ignore) {
              setSearchStatus("Thread focus unavailable; loading an available graph seed.");
            }
          }

          if (!ignore && focusPayload?.hasFocus && focusPayload.graph) {
            autoLoadedRef.current = true;
            setSearchQuery(focusPayload.focusSeed?.label || focusPayload.graphAnchorId || "");
            setSearchStatus(`Loaded ${focusPayload.focusSeed?.label || "active graph anchor"}`);
            setGraph(focusPayload.graph);
            setFilters((currentFilters) => syncFilterState(currentFilters, focusPayload.graph));
            suppressInspectOpenRef.current = true;
            setSelectedElement(
              focusPayload.graph.seedNode
                ? {
                    type: "node",
                    id: focusPayload.graph.seedNode.id
                  }
                : null
            );
            setHoveredElement(null);
            return;
          }
        }

        const payload = await searchGraphSeeds("", 1);

        if (ignore) {
          return;
        }

        if (!autoLoadedRef.current && (payload.results || []).length > 0) {
          autoLoadedRef.current = true;
          const topMatch = payload.results[0];
          setSearchQuery(topMatch.label);
          setSearchStatus(`Loaded ${topMatch.label}`);
          await loadSeed(topMatch.id);
        } else if ((payload.results || []).length === 0) {
          setSearchStatus("No seed available.");
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
  }, [focusKey, threadId]);

  useEffect(() => {
    if (!selectedElement || selectedElement.type !== "node") {
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
  }, [nodeDetails, selectedElement]);

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

  async function loadSeed(seedId) {
    setIsGraphLoading(true);
    setErrorMessage("");

    try {
      const payload = await fetchGraphSubgraph(seedId);

      setGraph(payload);
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

    setIsExpandLoading(true);
    setErrorMessage("");

    try {
      const payload = await expandGraphNode(
        nodeId,
        graph.nodes.map((node) => node.id),
        graph.edges.map((edge) => edge.id)
      );
      const nextGraph = mergeGraphPayload(graph, payload);

      setGraph(nextGraph);
      setFilters((currentFilters) => syncFilterState(currentFilters, nextGraph));
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsExpandLoading(false);
    }
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
    setGraph((currentGraph) => applyNodePositions(currentGraph, nextPositions));
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
                  {graph.seedNode?.label || "No seed loaded"}
                </span>
                <span>
                  {graph.meta.nodeCount || 0}n / {graph.meta.edgeCount || 0}e
                </span>
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
