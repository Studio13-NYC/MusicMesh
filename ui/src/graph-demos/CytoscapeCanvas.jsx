import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef
} from "react";
import cytoscape from "cytoscape";

const COLOR_MAP = {
  artist: "#ff8a5b",
  album: "#62c4ff",
  track: "#7fe0a3",
  person: "#ffd166",
  genre: "#c49bff",
  label: "#ff6fae",
  node: "#8ba3c7"
};

const EDGE_STYLE_MAP = {
  solid: "solid",
  dashed: "dashed",
  dotted: "dotted"
};

const FIT_PADDING = 148;

function fitViewport(cy) {
  const target = cy.nodes();

  if (!target || target.length === 0) {
    return;
  }

  cy.fit(target, FIT_PADDING);
  cy.center(target);
}

export const CytoscapeCanvas = forwardRef(function CytoscapeCanvas(
  {
    graph,
    selectedElement,
    hoveredElement,
    onBackgroundSelect,
    onExpandNode,
    onHoverChange,
    onNodePositionChange,
    onSelectElement
  },
  ref
) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const lastTapRef = useRef({
    id: null,
    timestamp: 0
  });
  const lastTopologySignatureRef = useRef("");
  const lastPositionSignatureRef = useRef("");
  const pendingFitRef = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      fitToGraph() {
        const cy = cyRef.current;

        if (!cy) {
          return;
        }

        fitViewport(cy);
        pendingFitRef.current = false;
      },
      resetView() {
        const cy = cyRef.current;

        if (!cy) {
          return;
        }

        fitViewport(cy);
        pendingFitRef.current = false;
      }
    }),
    []
  );

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const cy = cytoscape({
      container: containerRef.current,
      wheelSensitivity: 0.16,
      elements: [],
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            label: "data(label)",
            shape: "data(shape)",
            color: "#f7fbff",
            "font-size": 11,
            "font-weight": 600,
            "text-wrap": "wrap",
            "text-max-width": 90,
            "text-valign": "center",
            "text-halign": "center",
            width: "data(size)",
            height: "data(size)",
            "border-width": 1.5,
            "border-color": "#dce9ff",
            "overlay-opacity": 0
          }
        },
        {
          selector: "edge",
          style: {
            width: "data(width)",
            "line-color": "data(color)",
            "target-arrow-color": "data(color)",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "line-style": "data(lineStyle)",
            "arrow-scale": 0.85,
            opacity: 0.88,
            label: "data(type)",
            color: "#8fa0b7",
            "font-size": 10,
            "text-background-color": "#07131f",
            "text-background-opacity": 0.82,
            "text-background-padding": 3,
            "text-rotation": "autorotate"
          }
        },
        {
          selector: ".is-selected",
          style: {
            "border-width": 3,
            "border-color": "#ffffff",
            "shadow-blur": 26,
            "shadow-color": "#7ec8ff",
            "shadow-opacity": 0.6
          }
        },
        {
          selector: "edge.is-selected",
          style: {
            width: 4,
            "line-color": "#7ec8ff",
            "target-arrow-color": "#7ec8ff"
          }
        },
        {
          selector: ".is-hovered",
          style: {
            "shadow-blur": 18,
            "shadow-color": "#ffffff",
            "shadow-opacity": 0.44
          }
        }
      ]
    });

    cy.on("mouseover", "node,edge", (event) => {
      const element = event.target;
      const nextType = element.isNode() ? "node" : "edge";

      onHoverChange({
        type: nextType,
        id: element.id()
      });
    });

    cy.on("mouseout", "node,edge", () => {
      onHoverChange(null);
    });

    cy.on("tap", (event) => {
      if (event.target === cy) {
        onBackgroundSelect();
      }
    });

    cy.on("tap", "node", (event) => {
      const node = event.target;
      const timestamp = Date.now();

      onSelectElement({
        type: "node",
        id: node.id()
      });

      if (
        lastTapRef.current.id === node.id() &&
        timestamp - lastTapRef.current.timestamp < 340
      ) {
        onExpandNode(node.id());
      }

      lastTapRef.current = {
        id: node.id(),
        timestamp
      };
    });

    cy.on("tap", "edge", (event) => {
      onSelectElement({
        type: "edge",
        id: event.target.id()
      });
    });

    cy.on("dragfree", "node", (event) => {
      const node = event.target;
      const position = node.position();

      onNodePositionChange([
        {
          id: node.id(),
          x: Math.round(position.x),
          y: Math.round(position.y)
        }
      ]);
    });

    cyRef.current = cy;

    const resizeObserver = new ResizeObserver(() => {
      const liveCy = cyRef.current;

      if (!liveCy) {
        return;
      }

      liveCy.resize();

      if (pendingFitRef.current && liveCy.elements().length > 0) {
        fitViewport(liveCy);
        pendingFitRef.current = false;
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, [onBackgroundSelect, onExpandNode, onHoverChange, onNodePositionChange, onSelectElement]);

  useEffect(() => {
    const cy = cyRef.current;

    if (!cy) {
      return;
    }

    const topologySignature = JSON.stringify({
      nodeIds: graph.nodes.map((node) => node.id),
      edgeIds: graph.edges.map((edge) => edge.id)
    });
    const positionSignature = JSON.stringify(
      graph.nodes.map((node) => [
        node.id,
        Number.isFinite(node.x) ? Math.round(node.x) : 0,
        Number.isFinite(node.y) ? Math.round(node.y) : 0
      ])
    );
    const hasTopologyChanged = lastTopologySignatureRef.current !== topologySignature;
    const havePositionsChanged = lastPositionSignatureRef.current !== positionSignature;
    const elements = [
      ...graph.nodes.map((node) => ({
        data: {
          id: node.id,
          label: node.label,
          shape: node.shapeKey || "ellipse",
          color: COLOR_MAP[node.colorKey] || COLOR_MAP.node,
          size: node.isSeed ? 58 : 42
        },
        position: {
          x: node.x || 0,
          y: node.y || 0
        }
      })),
      ...graph.edges.map((edge) => ({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          color: "#6e86a3",
          width: edge.styleKey === "solid" ? 2 : 2.5,
          lineStyle: EDGE_STYLE_MAP[edge.styleKey] || "solid"
        }
      }))
    ];

    if (hasTopologyChanged) {
      cy.batch(() => {
        cy.elements().remove();

        if (elements.length > 0) {
          cy.add(elements);
        }
      });
    } else if (havePositionsChanged) {
      cy.batch(() => {
        for (const node of graph.nodes) {
          const element = cy.getElementById(node.id);

          if (element.empty()) {
            continue;
          }

          element.position({
            x: Number.isFinite(node.x) ? node.x : 0,
            y: Number.isFinite(node.y) ? node.y : 0
          });
        }
      });
    }

    if (graph.nodes.length > 0) {
      if (hasTopologyChanged) {
        cy.layout({
          name: "preset",
          animate: false,
          fit: false,
          padding: 80
        }).run();

        cy.resize();
        pendingFitRef.current = true;

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const liveCy = cyRef.current;

            if (!liveCy) {
              return;
            }

            liveCy.resize();

            if (pendingFitRef.current) {
              fitViewport(liveCy);
              pendingFitRef.current = false;
            }
          });
        });
      }
    } else if (hasTopologyChanged) {
      pendingFitRef.current = false;
    }

    lastTopologySignatureRef.current = topologySignature;
    lastPositionSignatureRef.current = positionSignature;
  }, [graph]);

  useEffect(() => {
    const cy = cyRef.current;

    if (!cy) {
      return;
    }

    cy.elements().removeClass("is-selected");
    cy.elements().removeClass("is-hovered");

    if (selectedElement?.id) {
      cy.getElementById(selectedElement.id).addClass("is-selected");
    }

    if (hoveredElement?.id) {
      cy.getElementById(hoveredElement.id).addClass("is-hovered");
    }
  }, [hoveredElement, selectedElement]);

  return <div className="graph-canvas" ref={containerRef} />;
});
