import React, { useEffect, useMemo, useRef, useState } from "react";
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

function createClientRequestId() {
  if (window.crypto?.randomUUID) {
    return `req-${window.crypto.randomUUID()}`;
  }

  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function timestampValue(entry) {
  const parsed = Date.parse(entry?.createdAt || "");

  return Number.isFinite(parsed) ? parsed : 0;
}

function newestThreadEntries(entries, threadId) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry?.threadId === threadId)
    .sort((left, right) => {
      const timeDifference = timestampValue(right.entry) - timestampValue(left.entry);

      if (timeDifference !== 0) {
        return timeDifference;
      }

      return right.index - left.index;
    })
    .map(({ entry }) => entry);
}

function findLatestThreadGraphFocusKey(entries, threadId, requestIds = new Set()) {
  if (requestIds.size === 0) {
    return "";
  }

  const threadEntries = newestThreadEntries(entries, threadId);
  const requestedEntries = threadEntries.filter((entry) => {
    const requestId = entry?.payload?.requestId || "";

    return requestId && requestIds.has(requestId);
  });
  const seenRequestIds = new Set();

  function focusKeyFromEntryGroup(entryGroup) {
    const persistedEntry = entryGroup.find((entry) => {
      const anchorId = entry?.payload?.graphAnchorId;

      return typeof anchorId === "string" && anchorId.trim();
    });

    if (persistedEntry) {
      return `graph:${persistedEntry.payload.graphAnchorId.trim()}`;
    }

    const previewEntry = entryGroup.find(
      (entry) => entry?.type === "graph_preview" && entry?.payload?.graph?.nodes?.length > 0
    );

    if (previewEntry) {
      return `preview:${previewEntry.payload?.requestId || previewEntry.id}`;
    }

    return "";
  }

  for (const entry of requestedEntries) {
    const requestId = entry?.payload?.requestId || "";

    if (seenRequestIds.has(requestId)) {
      continue;
    }

    seenRequestIds.add(requestId);

    const focusKey = focusKeyFromEntryGroup(
      requestedEntries.filter((candidate) => candidate?.payload?.requestId === requestId)
    );

    if (focusKey) {
      return focusKey;
    }

    if (entry?.type === "assistant_message" && entry?.payload?.graphPending) {
      return `pending:${requestId || entry.id}`;
    }
  }

  return "";
}

function findLatestThreadAssessment(entries, threadId) {
  if (!Array.isArray(entries)) {
    return null;
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry?.threadId === threadId && entry?.type === "run_quality_assessment") {
      return entry;
    }
  }

  return null;
}

function findAssistantEntryForRequest(entries, requestId) {
  return newestThreadEntries(entries, OPERATOR_THREAD_ID).find(
    (entry) =>
      entry?.type === "assistant_message" &&
      entry?.payload?.requestId === requestId &&
      typeof entry?.payload?.text === "string" &&
      entry.payload.text.trim()
  );
}

function assistantMessageFromTape(entry) {
  return {
    id: entry?.payload?.responseId || `assistant-${entry?.payload?.requestId || Date.now()}`,
    role: "assistant",
    content: entry?.payload?.text || ""
  };
}

function newestMatchingEntry(entries, requestId, predicate) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.payload?.requestId === requestId && predicate(entry))
    .sort((left, right) => timestampValue(right) - timestampValue(left))[0] || null;
}

function buildGraphRunStatus({ requestIds, runtimeEvents, tapeEntries, isSending }) {
  const latestRequestId = Array.isArray(requestIds) && requestIds.length > 0
    ? requestIds[requestIds.length - 1]
    : "";

  if (!latestRequestId) {
    return null;
  }

  const pipelineComplete = newestMatchingEntry(
    runtimeEvents,
    latestRequestId,
    (entry) =>
      entry.type === "chat_graph_pipeline_deferred_completed" ||
      entry.type === "chat_graph_pipeline_completed"
  );
  const pipelineFailed = newestMatchingEntry(
    runtimeEvents,
    latestRequestId,
    (entry) =>
      entry.type === "chat_graph_pipeline_deferred_failed" ||
      entry.type === "chat_graph_pipeline_failed"
  );
  const previewCompleted = newestMatchingEntry(
    runtimeEvents,
    latestRequestId,
    (entry) => entry.type === "graph_preview_completed"
  );
  const previewFailed = newestMatchingEntry(
    runtimeEvents,
    latestRequestId,
    (entry) => entry.type === "graph_preview_failed"
  );
  const previewStarted = newestMatchingEntry(
    runtimeEvents,
    latestRequestId,
    (entry) => entry.type === "graph_preview_started"
  );
  const graphPlanCompleted = newestMatchingEntry(
    runtimeEvents,
    latestRequestId,
    (entry) => entry.type === "llm_call_completed" && entry.payload?.purpose === "graph_plan"
  );
  const graphGroundingCompleted = newestMatchingEntry(
    runtimeEvents,
    latestRequestId,
    (entry) => entry.type === "llm_call_completed" && entry.payload?.purpose === "graph_grounding"
  );
  const answerReturned = newestMatchingEntry(
    runtimeEvents,
    latestRequestId,
    (entry) => entry.type === "chat_answer_returned"
  );
  const requestReceived = newestMatchingEntry(
    runtimeEvents,
    latestRequestId,
    (entry) => entry.type === "chat_request_received"
  );
  const graphPreviewTapeEntry = newestMatchingEntry(
    tapeEntries,
    latestRequestId,
    (entry) => entry.type === "graph_preview"
  );

  if (pipelineFailed) {
    return {
      requestId: latestRequestId,
      stage: "failed",
      label: "Graph pipeline failed before saving",
      detail: pipelineFailed.payload?.message || "The Complete Graph was not changed.",
      variant: "error",
      isActive: false
    };
  }

  if (pipelineComplete) {
    const mode = pipelineComplete.payload?.mode || "";

    if (mode === "persist_graph") {
      return {
        requestId: latestRequestId,
        stage: "saved",
        label: "Graph saved to Complete Graph",
        detail: `${pipelineComplete.payload?.graphNodeCount || 0} nodes / ${pipelineComplete.payload?.graphRelationshipCount || 0} relationships persisted${pipelineComplete.payload?.graphAnchorName ? ` around ${pipelineComplete.payload.graphAnchorName}` : ""}.`,
        variant: "saved",
        isActive: false
      };
    }

    if (mode === "needs_human_input" || pipelineComplete.payload?.humanInputNeeded) {
      return {
        requestId: latestRequestId,
        stage: "needs_human_input",
        label: "Needs human input before saving",
        detail: "The preview was not written to the Complete Graph.",
        variant: "warning",
        isActive: false
      };
    }

    return {
      requestId: latestRequestId,
      stage: "answer_only",
      label: "Answer complete",
      detail: "No graph save was needed for this turn.",
      variant: "quiet",
      isActive: false
    };
  }

  if (graphGroundingCompleted) {
    return {
      requestId: latestRequestId,
      stage: "saving",
      label: "Saving graph...",
      detail: "Grounding is complete; MusicMesh is writing the connected graph patch.",
      variant: "active",
      isActive: true
    };
  }

  if (graphPlanCompleted) {
    return {
      requestId: latestRequestId,
      stage: "grounding",
      label: "Grounding against existing graph...",
      detail: "MusicMesh is matching the answer to Complete Graph nodes.",
      variant: "active",
      isActive: true
    };
  }

  if (previewCompleted || graphPreviewTapeEntry) {
    return {
      requestId: latestRequestId,
      stage: "preview",
      label: "Preview rendered; saving to Complete Graph...",
      detail: "The canvas is provisional until persistence finishes.",
      variant: "active",
      isActive: true
    };
  }

  if (previewFailed) {
    return {
      requestId: latestRequestId,
      stage: "preview_failed",
      label: "Checking Complete Graph...",
      detail: "Preview failed, but the persistence pipeline is still running.",
      variant: "active",
      isActive: true
    };
  }

  if (previewStarted) {
    return {
      requestId: latestRequestId,
      stage: "previewing",
      label: "Drafting graph preview...",
      detail: "MusicMesh is creating the first visible graph slice.",
      variant: "active",
      isActive: true
    };
  }

  if (answerReturned) {
    return {
      requestId: latestRequestId,
      stage: "complete_graph",
      label: "Checking Complete Graph...",
      detail: "The answer is visible; graph planning is still running.",
      variant: "active",
      isActive: true
    };
  }

  if (requestReceived || isSending) {
    return {
      requestId: latestRequestId,
      stage: "answering",
      label: "Answering...",
      detail: "MusicMesh is preparing the direct response.",
      variant: "active",
      isActive: true
    };
  }

  return null;
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
  const [activeGraphRequestIds, setActiveGraphRequestIds] = useState([]);
  const viewportRef = useRef(null);
  const composerRef = useRef(null);
  const activeGraphRequestIdsRef = useRef(new Set());
  const graphRunStatus = useMemo(
    () =>
      buildGraphRunStatus({
        requestIds: activeGraphRequestIds,
        runtimeEvents,
        tapeEntries,
        isSending
      }),
    [activeGraphRequestIds, isSending, runtimeEvents, tapeEntries]
  );

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
    let entries = [];

    try {
      const tapeResponse = await fetch(`${API_BASE_URL}/api/chat/tape?limit=40`);

      if (!tapeResponse.ok) {
        throw new Error(`Tape request failed: ${tapeResponse.status}`);
      }

      const tapePayload = await tapeResponse.json();
      entries = tapePayload.entries || [];
      setTapeEntries(entries);
      setTapePath(tapePayload.tapePath || "");
      const nextFocusKey = findLatestThreadGraphFocusKey(
        entries,
        OPERATOR_THREAD_ID,
        activeGraphRequestIdsRef.current
      );

      if (nextFocusKey) {
        setGraphFocusAnchorId(nextFocusKey);
      }
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

    return entries;
  }

  async function recoverAssistantFromTape(requestId, errorMessageId, originalErrorMessage) {
    for (let attempt = 0; attempt < 45; attempt += 1) {
      await sleep(attempt === 0 ? 3000 : 2500);

      const entries = await loadTape();
      const assistantEntry = findAssistantEntryForRequest(entries, requestId);

      if (!assistantEntry) {
        continue;
      }

      const recoveredMessage = assistantMessageFromTape(assistantEntry);
      setMessages((currentMessages) => {
        const hasRecoveredMessage = currentMessages.some(
          (message) => message.id === recoveredMessage.id
        );

        if (hasRecoveredMessage) {
          return currentMessages.filter((message) => message.id !== errorMessageId);
        }

        return currentMessages.map((message) =>
          message.id === errorMessageId ? recoveredMessage : message
        );
      });
      setErrorMessage("");
      return;
    }

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === errorMessageId
          ? {
              ...message,
              content: `MusicMesh could not answer this request: ${originalErrorMessage}`
            }
          : message
      )
    );
  }

  async function submitPrompt(prompt, { displayPrompt = prompt, graphContext = null } = {}) {
    const normalizedPrompt = prompt.trim();
    const visiblePrompt = displayPrompt.trim() || normalizedPrompt;

    if (!normalizedPrompt || isSending) {
      return false;
    }

    setErrorMessage("");
    setIsSending(true);

    const requestId = createClientRequestId();
    activeGraphRequestIdsRef.current.add(requestId);
    setActiveGraphRequestIds((currentRequestIds) => [
      ...currentRequestIds.filter((currentRequestId) => currentRequestId !== requestId),
      requestId
    ].slice(-12));
    setGraphFocusAnchorId(`pending:${requestId}`);

    const nextUserMessage = {
      id: `user-${requestId}`,
      role: "user",
      content: visiblePrompt
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
          clientRequestId: requestId,
          threadId: OPERATOR_THREAD_ID,
          prompt: normalizedPrompt,
          graphContext,
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
      return true;
    } catch (error) {
      setErrorMessage(error.message);
      const errorMessageId = `assistant-error-${requestId}`;
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: errorMessageId,
          role: "assistant",
          content:
            "MusicMesh lost the live backend connection for this request. I am checking the run tape for the completed answer."
        }
      ]);
      recoverAssistantFromTape(requestId, errorMessageId, error.message);
      return false;
    } finally {
      setIsSending(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await submitPrompt(composerValue);
  }

  async function handleGraphNodeExpansion(node, graphContext = null) {
    const label = typeof node?.label === "string" ? node.label.trim() : "";

    if (!label) {
      return false;
    }

    const kind =
      typeof node?.kind === "string" && node.kind.trim() ? node.kind.trim() : "music entity";
    const prompt = [
      `Expand the graph around "${label}" (${kind}).`,
      "First answer from your own music knowledge with the most useful direct connections.",
      "Keep the immediate answer compact: 8 to 12 direct one-hop connections are enough.",
      "Include the best relevant people, bands/artists, recordings, instruments/equipment, studios/places, scenes/genres, and the relationship types when they are known.",
      "When mapping the graph, connect the expansion into the Complete Graph in Neo4j and reuse existing nodes when they already exist.",
      "Do not leave labels, albums, tracks, people, or scenes as disconnected local islands.",
      "Then map the useful direct relationships for the graph."
    ].join(" ");

    return submitPrompt(prompt, {
      displayPrompt: `Expand ${label}`,
      graphContext: {
        ...(graphContext || {}),
        intent: "expand_node",
        selectedNode: graphContext?.selectedNode || {
          id: node?.id || "",
          label,
          kind
        }
      }
    });
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
                    {graphRunStatus ? <GraphRunStatusCard status={graphRunStatus} /> : null}
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
                    defaultSeedQuery="rock music"
                    embedded
                    library="cytoscape"
                    focusKey={graphFocusAnchorId}
                    graphRunStatus={graphRunStatus}
                    onRequestNodeExpansion={handleGraphNodeExpansion}
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

function GraphRunStatusCard({ status }) {
  if (!status) {
    return null;
  }

  return (
    <article className={`graph-run-card graph-run-card-${status.variant || "active"}`}>
      <span className={`graph-run-spinner${status.isActive ? " is-active" : ""}`} aria-hidden="true" />
      <div>
        <strong>{status.label}</strong>
        <span>{status.detail}</span>
      </div>
    </article>
  );
}

function WorkflowWorkbench({ tapeEntries, tapePath, runtimeEvents, runtimeLogPath }) {
  const latestAssessmentEntry = findLatestThreadAssessment(tapeEntries, OPERATOR_THREAD_ID);

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

          <RunQualityAssessmentCard entry={latestAssessmentEntry} />

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

function RunQualityAssessmentCard({ entry }) {
  const assessment = entry?.payload?.assessment || null;

  return (
    <section className="workspace-block operator-workflow-card run-quality-card">
      <div className="run-quality-header">
        <div>
          <p className="workspace-block-title">Run quality</p>
          <p className="run-quality-meta">
            {entry?.createdAt ? new Date(entry.createdAt).toLocaleTimeString() : "Pending"}
          </p>
        </div>
        <span className="run-quality-score">
          {assessment?.overallScore ? `${assessment.overallScore}/5` : "-"}
        </span>
      </div>

      {assessment ? (
        <div className="run-quality-body">
          <div className="run-quality-tags">
            <span>{assessment.outcome || "unknown"}</span>
            <span>{assessment.needsOperatorAttention ? "attention" : "ok"}</span>
          </div>
          <p className="run-quality-summary">{assessment.summary || "No summary returned."}</p>
          <StageTimingList timings={assessment.stageTimings} />
          <AssessmentList title="Top findings" items={assessment.topFindings} />
          <AssessmentList title="Next actions" items={assessment.nextActions} />
        </div>
      ) : (
        <span>No run assessment yet.</span>
      )}
    </section>
  );
}

function StageTimingList({ timings }) {
  const rows = Array.isArray(timings) ? timings.slice(0, 8) : [];

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="run-quality-section">
      <p className="run-quality-section-title">Stage timings</p>
      <div className="run-quality-stage-list">
        {rows.map((timing) => (
          <div className="run-quality-stage-row" key={timing.stage || timing.label}>
            <div>
              <strong>{timing.label || timing.stage}</strong>
              <span>{timing.explanation || timing.status}</span>
            </div>
            <code>{formatDuration(timing.elapsedMs)}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssessmentList({ title, items }) {
  const rows = Array.isArray(items) ? items.slice(0, 3) : [];

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="run-quality-section">
      <p className="run-quality-section-title">{title}</p>
      <ul className="run-quality-list">
        {rows.map((item, index) => (
          <li key={`${title}-${index}`}>
            <span>{item.description || item.evidence || String(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDuration(value) {
  const duration = Number(value);

  if (!Number.isFinite(duration)) {
    return "-";
  }

  if (duration >= 1000) {
    return `${(duration / 1000).toFixed(1)}s`;
  }

  return `${Math.round(duration)}ms`;
}
