import React, { useMemo, useState } from "react";
import {
  evidenceItems,
  graphEdges,
  graphNodes,
  nextActions,
  nodeDetails,
  qualityFindings,
  runStages,
  starterPrompts,
  transcript
} from "./mockData";
import "./musicmesh-concept.css";

const tabs = [
  { id: "graph", label: "Graph" },
  { id: "run", label: "Run" },
  { id: "evidence", label: "Evidence" }
];

const nodeKindLabels = ["Person", "Band", "Album", "Track", "Genre", "Place"];

function Icon({ name }) {
  const paths = {
    send: "M4 12h14M12 5l7 7-7 7",
    graph: "M6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0-13 8 3M8 17l8-6",
    check: "m5 12 4 4L19 6",
    alert: "M12 4 3 20h18L12 4Zm0 6v4m0 3h.01",
    search: "m15 15 5 5M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z"
  };

  return (
    <svg aria-hidden="true" className="mm-icon" fill="none" viewBox="0 0 24 24">
      <path d={paths[name]} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

export function MusicMeshConcept() {
  const [activeTab, setActiveTab] = useState("graph");
  const [selectedNodeId, setSelectedNodeId] = useState("bryan-ferry");
  const [composerValue, setComposerValue] = useState(starterPrompts[0]);
  const [filter, setFilter] = useState("All");
  const [messages, setMessages] = useState(transcript);
  const [draftState, setDraftState] = useState("Ready");
  const selectedNode = useMemo(
    () => graphNodes.find((node) => node.id === selectedNodeId) || graphNodes[0],
    [selectedNodeId]
  );

  const selectedNodeDetail = nodeDetails[selectedNode.id] || {
    title: selectedNode.label,
    subtitle: `${selectedNode.kind} · generated detail`,
    confidence: selectedNode.status === "canon" ? "Canon match" : "Model inference",
    notes: "Dummy detail shaped like the current node inspection payload.",
    properties: [
      ["node kind", selectedNode.kind],
      ["status", selectedNode.status]
    ]
  };

  const visibleNodes =
    filter === "All" ? graphNodes : graphNodes.filter((node) => node.kind === filter);

  function handleSend(event) {
    event.preventDefault();
    const prompt = composerValue.trim();

    if (!prompt) {
      return;
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: `user-${currentMessages.length + 1}`,
        role: "user",
        content: prompt
      },
      {
        id: `assistant-${currentMessages.length + 2}`,
        role: "assistant",
        content:
          "I would answer first, then stage a graph preview around the strongest anchor. The right rail shows the likely graph shape, persistence status, run-quality flags, and evidence so the operator can decide whether to keep exploring or tighten the graph scope."
      }
    ]);
    setComposerValue("");
    setDraftState("Draft response generated");
  }

  return (
    <main className="mm-concept-shell">
      <header className="mm-topbar">
        <div className="mm-brand">
          <span className="mm-mark">M</span>
          <div>
            <h1>MusicMesh</h1>
            <p>Answer-first music intelligence with graph-aware context.</p>
          </div>
        </div>

        <div className="mm-run-summary" aria-label="Run status summary">
          <StatusPill tone="success" label="Answer returned" value="14.2s" />
          <StatusPill tone="success" label="Graph persisted" value="29n / 36e" />
          <StatusPill tone="attention" label="Operator attention" value="Latency" />
        </div>
      </header>

      <section className="mm-layout">
        <section className="mm-thread-panel" aria-label="Chat thread">
          <div className="mm-panel-heading">
            <div>
              <p className="mm-label">Current thread</p>
              <h2>Bryan Ferry graph pass</h2>
            </div>
            <span className="mm-thread-state">{draftState}</span>
          </div>

          <div className="mm-thread-tools">
            {starterPrompts.map((prompt) => (
              <button key={prompt} onClick={() => setComposerValue(prompt)} type="button">
                {prompt}
              </button>
            ))}
          </div>

          <div className="mm-message-stream">
            {messages.map((message) => (
              <article className={`mm-message mm-message-${message.role}`} key={message.id}>
                <span>{message.role === "user" ? "You" : "MusicMesh"}</span>
                <p>{message.content}</p>
              </article>
            ))}

            <section className="mm-answer-meta" aria-label="Graph implication summary">
              <div>
                <Icon name="graph" />
                <strong>Graph guess</strong>
                <span>Bryan Ferry anchors a Person-centered graph with Roxy Music, albums, songs, genres, and birthplace.</span>
              </div>
              <div>
                <Icon name="check" />
                <strong>Persist posture</strong>
                <span>Canon-first, auto-replace the visible graph when persistence completes.</span>
              </div>
              <div>
                <Icon name="alert" />
                <strong>Watch item</strong>
                <span>Preview and final graph generation duplicated effort on this run.</span>
              </div>
            </section>

            <div className="mm-followup-strip" aria-label="Suggested next actions">
              <button type="button">Tighten graph scope</button>
              <button type="button">Compare preview to persisted graph</button>
              <button type="button">Open run-quality notes</button>
            </div>
          </div>

          <form className="mm-composer" onSubmit={handleSend}>
            <textarea
              aria-label="Ask MusicMesh"
              onChange={(event) => setComposerValue(event.target.value)}
              placeholder="Ask MusicMesh about an artist, scene, release, studio, collaborator, instrument, or relationship."
              rows={3}
              value={composerValue}
            />
            <button type="submit">
              <Icon name="send" />
              Send
            </button>
          </form>
        </section>

        <section className="mm-workbench" aria-label="Context workbench">
          <div className="mm-workbench-header">
            <div>
              <p className="mm-label">Workbench</p>
              <h2>{tabs.find((tab) => tab.id === activeTab)?.label}</h2>
            </div>
            <div className="mm-tablist" role="tablist" aria-label="Workbench view">
              {tabs.map((tab) => (
                <button
                  aria-selected={activeTab === tab.id}
                  className={activeTab === tab.id ? "is-active" : ""}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {activeTab === "graph" ? (
            <GraphPanel
              filter={filter}
              selectedNode={selectedNode}
              selectedNodeDetail={selectedNodeDetail}
              setFilter={setFilter}
              setSelectedNodeId={setSelectedNodeId}
              visibleNodes={visibleNodes}
            />
          ) : null}

          {activeTab === "run" ? <RunPanel /> : null}
          {activeTab === "evidence" ? <EvidencePanel /> : null}
        </section>
      </section>
    </main>
  );
}

function StatusPill({ tone, label, value }) {
  return (
    <div className={`mm-status-pill is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function GraphPanel({
  filter,
  selectedNode,
  selectedNodeDetail,
  setFilter,
  setSelectedNodeId,
  visibleNodes
}) {
  return (
    <div className="mm-graph-grid">
      <section className="mm-graph-stage">
        <div className="mm-graph-toolbar">
          <div className="mm-filter-row" aria-label="Node kind filters">
            {["All", ...nodeKindLabels].map((item) => (
              <button
                className={filter === item ? "is-active" : ""}
                key={item}
                onClick={() => setFilter(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
          <div className="mm-search-control">
            <Icon name="search" />
            <span>Seed: Bryan Ferry</span>
          </div>
        </div>

        <NetworkCanvas
          selectedNodeId={selectedNode.id}
          setSelectedNodeId={setSelectedNodeId}
          visibleNodes={visibleNodes}
        />
      </section>

      <aside className="mm-inspector">
        <p className="mm-label">Selection</p>
        <h3>{selectedNodeDetail.title}</h3>
        <p className="mm-inspector-subtitle">{selectedNodeDetail.subtitle}</p>
        <span className="mm-confidence">{selectedNodeDetail.confidence}</span>
        <p className="mm-inspector-notes">{selectedNodeDetail.notes}</p>
        <div className="mm-property-list">
          {selectedNodeDetail.properties.map(([key, value]) => (
            <div key={key}>
              <span>{key}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function NetworkCanvas({ selectedNodeId, setSelectedNodeId, visibleNodes }) {
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graphEdges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)
  );
  const nodeById = new Map(graphNodes.map((node) => [node.id, node]));

  return (
    <div className="mm-network">
      <svg aria-label="Dummy music graph" role="img" viewBox="0 0 100 100">
        {visibleEdges.map((edge) => {
          const source = nodeById.get(edge.source);
          const target = nodeById.get(edge.target);

          if (!source || !target) {
            return null;
          }

          return (
            <line
              className="mm-network-edge"
              key={edge.id}
              x1={source.x}
              x2={target.x}
              y1={source.y}
              y2={target.y}
            />
          );
        })}
        {visibleNodes.map((node) => (
          <g
            className={`mm-node mm-node-${node.kind.toLowerCase()}${
              selectedNodeId === node.id ? " is-selected" : ""
            }`}
            key={node.id}
            onClick={() => setSelectedNodeId(node.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedNodeId(node.id);
              }
            }}
            role="button"
            tabIndex="0"
          >
            <circle cx={node.x} cy={node.y} r={selectedNodeId === node.id ? 4.2 : 3.3} />
            <text x={node.x} y={node.y - 5.8}>{node.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function RunPanel() {
  return (
    <div className="mm-run-panel">
      <section className="mm-score-panel">
        <div>
          <p className="mm-label">Run quality</p>
          <h3>4/5 · answer returned, graph persisted</h3>
        </div>
        <span>Attention</span>
      </section>

      <div className="mm-stage-list">
        {runStages.map((stage) => (
          <article className={`mm-stage-row is-${stage.state}`} key={stage.id}>
            <div>
              <span />
              <strong>{stage.label}</strong>
              <p>{stage.detail}</p>
            </div>
            <code>{stage.time}</code>
          </article>
        ))}
      </div>

      <section className="mm-two-col">
        <div>
          <p className="mm-label">Top findings</p>
          <ul>
            {qualityFindings.map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mm-label">Next actions</p>
          <ul>
            {nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function EvidencePanel() {
  return (
    <div className="mm-evidence-panel">
      {evidenceItems.map((item) => (
        <article className="mm-evidence-row" key={item.id}>
          <span>{item.type}</span>
          <div>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
