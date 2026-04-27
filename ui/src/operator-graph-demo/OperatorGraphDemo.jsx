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

const seedMessages = [];
const OPERATOR_THREAD_ID = "operator-graph-demo";

function findLatestThreadGraphFocusKey(entries, threadId) {
  if (!Array.isArray(entries)) {
    return "";
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry?.threadId !== threadId) {
      continue;
    }

    if (entry?.type === "graph_preview" && entry?.payload?.graph?.nodes?.length > 0) {
      return `preview:${entry.payload.requestId || entry.id}`;
    }

    const anchorId = entry?.payload?.graphAnchorId;

    if (typeof anchorId === "string" && anchorId.trim()) {
      return `graph:${anchorId.trim()}`;
    }

    if (entry?.type === "assistant_message" && entry?.payload?.graphPending) {
      return `pending:${entry.payload.requestId || entry.id}`;
    }
  }

  return "";
}

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
  const [graphFocusAnchorId, setGraphFocusAnchorId] = useState("");
  const viewportRef = useRef(null);
  const composerRef = useRef(null);

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
      const entries = tapePayload.entries || [];
      setTapeEntries(entries);
      setTapePath(tapePayload.tapePath || "");
      setGraphFocusAnchorId(findLatestThreadGraphFocusKey(entries, OPERATOR_THREAD_ID));
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
          threadId: OPERATOR_THREAD_ID,
          prompt,
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content
          }))
        })
      });

      const responseText = await response.text();
      let payload = {};

      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(responseText || `Chat request failed: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(payload.error || `Chat request failed: ${response.status}`);
      }

      if (typeof payload.graphAnchorId === "string" && payload.graphAnchorId.trim()) {
        setGraphFocusAnchorId(`graph:${payload.graphAnchorId.trim()}`);
      } else if (typeof payload.requestId === "string" && payload.requestId.trim()) {
        setGraphFocusAnchorId(`pending:${payload.requestId.trim()}`);
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
            <p className="section-label">MusicMesh operator</p>
            <h1>Operator + graph workbench</h1>
            <p className="operator-demo-summary">
              Keep the answer stream live while switching the right rail between graph inspection and workflow detail.
            </p>
          </div>
        </header>

        <PanelGroup className="operator-demo-panels" direction="horizontal">
          <Panel className="operator-demo-chat-panel" defaultSize={52} minSize={36}>
            <section className="operator-chat-surface">
              <header className="operator-pane-header">
                <div>
                  <p className="section-label">Chat</p>
                  <h2>Live operator thread</h2>
                  <p className="operator-pane-subtitle">
                    Ask directly, then keep graph or workflow context visible without leaving the conversation.
                  </p>
                </div>
                <p className="operator-pane-meta">
                  {messages.length > 0 ? `${messages.length} messages` : "Ready"}
                </p>
              </header>

              <ScrollArea.Root className="chat-scroll-root">
                <ScrollArea.Viewport className="chat-scroll-viewport" ref={viewportRef}>
                  <div className="stream operator-stream">
                    {messages.map((message) => (
                      <TranscriptEntry entry={message} key={message.id} />
                    ))}
                    {isSending ? <PendingAssistantEntry /> : null}
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
                    ref={composerRef}
                    id="operator-demo-composer"
                    onChange={(event) => setComposerValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleSubmit(event);
                      }
                    }}
                    placeholder="Ask MusicMesh, then inspect the graph alongside the conversation."
                    rows={2}
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

          <Panel className="operator-demo-workbench-panel" defaultSize={48} minSize={32}>
            <section className="operator-workbench">
              <header className="operator-pane-header operator-workbench-header">
                <div>
                  <p className="section-label">Workbench</p>
                  <h2>
                    {workspaceMode === "graph"
                      ? "Graph workspace"
                        : "Workflow stream"}
                  </h2>
                  <p className="operator-workbench-summary">
                    {workspaceMode === "graph"
                      ? "Use the graph as a live sidecar, not a separate destination."
                        : "Trace recent tape and runtime events without losing the active thread."}
                  </p>
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
                  <GraphDemoApp
                    GraphCanvas={CytoscapeCanvas}
                    embedded
                    library="cytoscape"
                    focusKey={graphFocusAnchorId}
                    threadId={OPERATOR_THREAD_ID}
                  />
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

function PendingAssistantEntry() {
  return (
    <article className="assistant-stream assistant-stream-pending">
      <div className="markdown-stream">
        <p>MusicMesh is working through that request...</p>
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
