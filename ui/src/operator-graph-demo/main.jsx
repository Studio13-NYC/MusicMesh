import React from "react";
import { createRoot } from "react-dom/client";
import { OperatorGraphDemo } from "./OperatorGraphDemo";
import "../styles/app.css";
import "../graph-demos/styles.css";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("MusicMesh operator graph demo root element was not found.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <OperatorGraphDemo />
  </React.StrictMode>
);
