import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("MusicMesh NVL graph demo root element was not found.");
}

function NvlDeprecatedPage() {
  return (
    <div className="graph-demo-page">
      <header className="demo-topbar">
        <div className="demo-topbar-copy">
          <p className="demo-kicker">MusicMesh standalone graph demo</p>
          <h1>NVL demo deprecated</h1>
          <p className="demo-notes">
            MusicMesh is standardizing on Cytoscape for the active graph surface.
            The old NVL comparison page is kept only as a retired reference URL.
          </p>
        </div>
        <div className="demo-topbar-actions">
          <span className="demo-pill">Deprecated</span>
          <a className="demo-link" href="/graph-cytoscape.html">
            Open Cytoscape demo
          </a>
          <a className="demo-link" href="/">
            Back to shell
          </a>
        </div>
      </header>

      <div className="demo-layout">
        <main className="demo-canvas-panel">
          <div className="demo-panel demo-panel-scroll demo-deprecated-panel">
            <p className="demo-panel-label">Decision</p>
            <h2 className="demo-deprecated-title">Cytoscape is the chosen path</h2>
            <p className="demo-muted">
              The Cytoscape implementation is now the maintained visualization path
              for MusicMesh. It offers better product-level control over layout,
              styling, interaction behavior, and future ergonomics.
            </p>
            <p className="demo-muted">
              NVL is no longer linked from the main UI and should not be treated as
              the active graph direction.
            </p>
            <div className="demo-deprecated-actions">
              <a className="demo-button demo-button-tight demo-button-accent" href="/graph-cytoscape.html">
                Open Cytoscape demo
              </a>
              <a className="demo-button demo-button-tight" href="/operator-graph-demo.html">
                Open operator + graph demo
              </a>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

createRoot(rootElement).render(
  <React.StrictMode>
    <NvlDeprecatedPage />
  </React.StrictMode>
);
