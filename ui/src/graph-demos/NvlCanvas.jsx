import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { InteractiveNvlWrapper } from "@neo4j-nvl/react";
import { FreeLayoutType } from "@neo4j-nvl/base";

const COLOR_MAP = {
  artist: "#ff8a5b",
  album: "#62c4ff",
  track: "#7fe0a3",
  person: "#ffd166",
  genre: "#c49bff",
  label: "#ff6fae",
  node: "#8ba3c7"
};

export const NvlCanvas = forwardRef(function NvlCanvas(
  {
    graph,
    selectedElement,
    hoveredElement,
    onBackgroundSelect,
    onExpandNode,
    onHoverChange,
    onSelectElement
  },
  ref
) {
    const nvlRef = useRef(null);
    const nodeIds = graph.nodes.map((node) => node.id);
    const positions = graph.nodes.map((node) => ({
      id: node.id,
      x: node.x || 0,
      y: node.y || 0
    }));
    const nodes = graph.nodes.map((node) => ({
      id: node.id,
      caption: node.label,
      color: COLOR_MAP[node.colorKey] || COLOR_MAP.node,
      size: node.isSeed ? 46 : 32,
      selected: selectedElement?.type === "node" && selectedElement.id === node.id,
      hovered: hoveredElement?.type === "node" && hoveredElement.id === node.id,
      pinned: true
    }));
    const rels = graph.edges.map((edge) => ({
      id: edge.id,
      from: edge.source,
      to: edge.target,
      type: edge.type,
      color:
        selectedElement?.type === "edge" && selectedElement.id === edge.id
          ? "#7ec8ff"
          : "#6e86a3",
      width: edge.styleKey === "solid" ? 2 : 2.5,
      selected: selectedElement?.type === "edge" && selectedElement.id === edge.id,
      hovered: hoveredElement?.type === "edge" && hoveredElement.id === edge.id
    }));

    useImperativeHandle(
      ref,
      () => ({
        fitToGraph() {
          if (nodeIds.length > 0) {
            nvlRef.current?.fit(nodeIds);
          }
        },
        resetView() {
          nvlRef.current?.resetZoom();
        }
      }),
      [nodeIds]
    );

    if (graph.nodes.length === 0) {
      return <div className="graph-canvas graph-canvas-empty" />;
    }

    return (
      <div className="graph-canvas graph-canvas-nvl">
        <InteractiveNvlWrapper
          ref={nvlRef}
          className="graph-canvas-inner"
          nodes={nodes}
          rels={rels}
          positions={positions}
          layout={FreeLayoutType}
          nvlOptions={{
            disableTelemetry: true,
            renderer: "canvas",
            initialZoom: 0.86,
            maxZoom: 4,
            minZoom: 0.08,
            allowDynamicMinZoom: true
          }}
          interactionOptions={{
            selectOnClick: false
          }}
          mouseEventCallbacks={{
            onCanvasClick: () => {
              onBackgroundSelect();
              onHoverChange(null);
            },
            onHover: (element) => {
              if (!element?.id) {
                onHoverChange(null);
                return;
              }

              onHoverChange({
                type: "from" in element && "to" in element ? "edge" : "node",
                id: element.id
              });
            },
            onNodeClick: (node) => {
              onSelectElement({
                type: "node",
                id: node.id
              });
            },
            onNodeDoubleClick: (node) => {
              onExpandNode(node.id);
            },
            onRelationshipClick: (relationship) => {
              onSelectElement({
                type: "edge",
                id: relationship.id
              });
            }
          }}
        />
      </div>
    );
});
