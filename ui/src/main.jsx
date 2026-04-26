import React from "react";
import { createRoot } from "react-dom/client";
import { OperatorGraphDemo } from "./operator-graph-demo/OperatorGraphDemo";
import "./styles/app.css";
import "./graph-demos/styles.css";
import "./operator-graph-demo/styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("MusicMesh UI root element was not found.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <OperatorGraphDemo />
  </React.StrictMode>
);
