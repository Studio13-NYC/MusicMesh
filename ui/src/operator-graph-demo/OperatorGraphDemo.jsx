import React, { useEffect, useRef, useState } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Separator from "@radix-ui/react-separator";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GraphDemoApp } from "../graph-demos/GraphDemoApp";
import { CytoscapeCanvas } from "../graph-demos/CytoscapeCanvas";

const API_BASE_RAW = import.meta.env.VITE_MUSICMESH_API_BASE ?? "";
const API_BASE_URL =
  typeof API_BASE_RAW === "string" ? API_BASE_RAW.replace(/\/$/, "") : "";

const WORKBENCH_MODES = [
  { id: "graph", label: "Graph" },
  { id: "workflow", label: "Workflow" }
];

const seedMessages = [
  {
    id: "seed-assistant-1",
    role: "assistant",
    content:
      "This integrated workbench keeps chat and graph exploration in one SPA. Use the graph mode to inspect the Neo4j subgraph, or switch to workflow mode to review the tape and runtime stream."
  }
];

export function OperatorGraphDemo() {
  const [messages, setMessages] = useState(seedMessages);
  const [composerValue, setComposerValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [tapeEntries, setTapeEntries] = useState([]);
  const [tapePath, setTapePath] = useState("");
  const [runtimeEvents, setRuntimeEvents] = useState([]);
  const [runtimeLogPath, setRuntimeLogPath] = useState("");
  const [workspaceMode, setWorkspaceMode] = useState("graph");
  const viewportRef = useRef(null);

  useEffect(() => {
    loadTape();

    const intervalId = window.setInterval(() => {
      loadTape();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const viewportElement = viewportRef.current;

    if (!viewportElement) {
      return;
    }

    viewportElement.scrollTop = viewportElement.scrollHeight;
  }, [messages]);

  async function loadTape() {
    try {
      const tapeResponse = await fetch(`${API_BASE_URL}/api/chat/tape?limit=40`);

      if (!tapeResponse.ok) {
        throw new Error(`Tape request failed: ${tapeResponse.status}`);
      }

      const tapePayload = await tapeResponse.json();
      setTapeEntries(tapePayload.entries || []);
      setTapePath(tapePayload.tapePath || "");
    } catch {
      setTapeEntries([]);
      setTapePath("");
    }

    try {
      const runtimeResponse = await fetch(`${API_BASE_URL}/api/chat/runtime?limit=40`);

      if (!runtimeResponse.ok) {
        throw new Error(`Runtime request failed: ${runtimeResponse.status}`);
      }

      const runtimePayload = await runtimeResponse.json();
      setRuntimeEvents(runtimePayload.events || []);
      setRuntimeLogPath(runtimePayload.runtimeLogPath || "");
    } catch {
      setRuntimeEvents([]);
      setRuntimeLogPath("");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const prompt = composerValue.trim();

    if (!prompt || isSending) {
      return;
    }

    setErrorMessage("");
    setIsSending(true);

    const nextUserMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: prompt
    };

    const nextMessages = [...messages, nextUserMessage];
    setMessages(nextMessages);
    setComposerValue("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          threadId: "operator-graph-demo",
          prompt,
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content
          }))
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Chat request failed: ${response.status}`);
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: payload.responseId || `assistant-${Date.now()}`,
          role: "assistant",
          content: payload.message
        }
      ]);
      await loadTape();
    } catch (error) {
      setErrorMessage(error.message);
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: `MusicMesh could not answer this request: ${error.message}`
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="operator-demo-page">
      <div className="operator-demo-shell">
        <header className="operator-demo-topbar">
          <div className="operator-demo-brand">
            <p className="section-label">Integrated demo</p>
            <h1>Operator + graph workbench</h1>
          </div>
          <div className="operator-demo-nav">
            <nav aria-label="Operator demo destinations" className="operator-demo-links">
              <a className="operator-demo-link" href="/">
                Back to shell
              </a>
              <a className="operator-demo-link" href="/graph-cytoscape.html">
                Cytoscape only
              </a>
              <a className="operator-demo-link" href="/graph-nvl.html">
                NVL only
              </a>
            </nav>
          </div>
        </header>

        <PanelGroup className="operator-demo-panels" direction="horizontal">
          <Panel className="operator-demo-chat-panel" defaultSize={57} minSize={40}>
            <section className="operator-chat-surface">
              <header className="operator-pane-header">
                <div>
                  <p className="section-label">Chat</p>
                  <h2>Live operator thread</h2>
                </div>
                <p className="operator-pane-meta">
                  {messages.length} messages
                </p>
              </header>

              <ScrollArea.Root className="chat-scroll-root">
                <ScrollArea.Viewport className="chat-scroll-viewport" ref={viewportRef}>
                  <div className="stream operator-stream">
                    {messages.map((message) => (
                      <TranscriptEntry entry={message} key={message.id} />
                    ))}
                  </div>
                </ScrollArea.Viewport>
                <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
                  <ScrollArea.Thumb className="scrollbar-thumb" />
                </ScrollArea.Scrollbar>
              </ScrollArea.Root>

              <form className="operator-composer" onSubmit={handleSubmit}>
                <div className="operator-composer-row">
                  <textarea
                    className="composer-input operator-composer-input"
                    id="operator-demo-composer"
                    onChange={(event) => setComposerValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleSubmit(event);
                      }
                    }}
                    placeholder="Ask MusicMesh, then inspect the graph alongside the conversation."
                    rows={3}
                    value={composerValue}
                  />
                  <button className="composer-submit operator-composer-submit" disabled={isSending} type="submit">
                    {isSending ? "Thinking..." : "Send"}
                  </button>
                </div>
                {errorMessage ? <p className="composer-error">{errorMessage}</p> : null}
              </form>
            </section>
          </Panel>

          <PanelResizeHandle className="resize-handle operator-demo-resize-handle" />

          <Panel className="operator-demo-workbench-panel" defaultSize={43} minSize={28}>
            <section className="operator-workbench">
              <header className="operator-pane-header operator-workbench-header">
                <div>
                  <p className="section-label">Workbench</p>
                  <h2>{workspaceMode === "graph" ? "Graph workspace" : "Workflow stream"}</h2>
                </div>
                <div className="operator-mode-switch" role="tablist" aria-label="Workbench mode">
                  {WORKBENCH_MODES.map((mode) => (
                    <button
                      aria-selected={workspaceMode === mode.id}
                      className={`operator-mode-button${
                        workspaceMode === mode.id ? " is-active" : ""
                      }`}
                      key={mode.id}
                      onClick={() => setWorkspaceMode(mode.id)}
                      role="tab"
                      type="button"
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </header>

              <Separator.Root className="separator operator-demo-separator" decorative orientation="horizontal" />

              <div className="operator-workbench-body">
                {workspaceMode === "graph" ? (
                  <GraphDemoApp GraphCanvas={CytoscapeCanvas} embedded library="cytoscape" />
                ) : (
                  <WorkflowWorkbench
                    runtimeEvents={runtimeEvents}
                    runtimeLogPath={runtimeLogPath}
                    tapeEntries={tapeEntries}
                    tapePath={tapePath}
                  />
                )}
              </div>
            </section>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

function TranscriptEntry({ entry }) {
  if (entry.role === "user") {
    return (
      <div className="user-turn">
        <div className="user-bubble">
          <p>{entry.content}</p>
        </div>
      </div>
    );
  }

  return (
    <article className="assistant-stream">
      <div className="markdown-stream">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
      </div>
    </article>
  );
}

function WorkflowWorkbench({ tapeEntries, tapePath, runtimeEvents, runtimeLogPath }) {
  return (
    <ScrollArea.Root className="operator-workflow-scroll-root">
      <ScrollArea.Viewport className="worksurface-scroll-viewport">
        <div className="operator-workflow-grid">
          <section className="workspace-block operator-workflow-card">
            <p className="workspace-block-title">Tape file</p>
            <code className="workspace-path">{tapePath || "Not written yet."}</code>
          </section>

          <section className="workspace-block operator-workflow-card">
            <p className="workspace-block-title">Runtime log</p>
            <code className="workspace-path">{runtimeLogPath || "Not written yet."}</code>
          </section>

          <section className="workspace-block operator-workflow-card">
            <p className="workspace-block-title">Recent events</p>
            {tapeEntries.length > 0 ? (
              <div className="tape-list">
                {tapeEntries
                  .slice()
                  .reverse()
                  .map((entry) => (
                    <article className="tape-entry" key={entry.id}>
                      <div className="tape-entry-header">
                        <strong>{entry.type}</strong>
                        <span>{new Date(entry.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <pre>{JSON.stringify(entry.payload, null, 2)}</pre>
                    </article>
                  ))}
              </div>
            ) : (
              <span>No tape entries yet.</span>
            )}
          </section>

          <section className="workspace-block operator-workflow-card">
            <p className="workspace-block-title">Recent runtime events</p>
            {runtimeEvents.length > 0 ? (
              <div className="tape-list">
                {runtimeEvents
                  .slice()
                  .reverse()
                  .map((event) => (
                    <article className="tape-entry" key={event.id}>
                      <div className="tape-entry-header">
                        <strong>{event.type}</strong>
                        <span>{new Date(event.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                    </article>
                  ))}
              </div>
            ) : (
              <span>No runtime events yet.</span>
            )}
          </section>
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
        <ScrollArea.Thumb className="scrollbar-thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
