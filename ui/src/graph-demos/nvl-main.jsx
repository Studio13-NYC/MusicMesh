import React from "react";
import { createRoot } from "react-dom/client";
import { GraphDemoApp } from "./GraphDemoApp";
import { NvlCanvas } from "./NvlCanvas";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("MusicMesh NVL graph demo root element was not found.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <GraphDemoApp GraphCanvas={NvlCanvas} library="nvl" />
  </React.StrictMode>
);
