import React from "react";
import { createRoot } from "react-dom/client";
import { GraphDemoApp } from "./GraphDemoApp";
import { CytoscapeCanvas } from "./CytoscapeCanvas";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("MusicMesh Cytoscape graph demo root element was not found.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <GraphDemoApp GraphCanvas={CytoscapeCanvas} library="cytoscape" />
  </React.StrictMode>
);
