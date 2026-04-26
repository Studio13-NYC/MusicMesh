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
  { id: "proposals", label: "Proposals" },
  { id: "workflow", label: "Workflow" }
];

const seedMessages = [];
const OPERATOR_THREAD_ID = "operator-graph-demo";

function findLatestThreadProposalId(entries, threadId) {
  if (!Array.isArray(entries)) {
    return "";
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry?.threadId !== threadId || entry?.type !== "assistant_message") {
      continue;
    }

    const proposalId = entry?.payload?.graphProposalId;

    if (typeof proposalId === "string" && proposalId.trim()) {
      return proposalId.trim();
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
  const [proposalDraft, setProposalDraft] = useState("R.E.M.\nTalking Heads\nBrian Eno");
  const [proposalContext, setProposalContext] = useState(
    "Create graph-worthy music relationships and run multi-hop traversal for missing connections."
  );
  const [proposalStatus, setProposalStatus] = useState("");
  const [proposalError, setProposalError] = useState("");
  const [proposal, setProposal] = useState(null);
  const [isCreatingProposal, setIsCreatingProposal] = useState(false);
  const [graphFocusProposalId, setGraphFocusProposalId] = useState("");
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
      setGraphFocusProposalId(findLatestThreadProposalId(entries, OPERATOR_THREAD_ID));
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

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Chat request failed: ${response.status}`);
      }

      if (typeof payload.graphProposalId === "string" && payload.graphProposalId.trim()) {
        setGraphFocusProposalId(payload.graphProposalId.trim());
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

  async function handleCreateProposal(event) {
    event.preventDefault();

    const entities = proposalDraft
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (entities.length === 0 || isCreatingProposal) {
      return;
    }

    setIsCreatingProposal(true);
    setProposalError("");
    setProposalStatus("Creating proposal with canon lookup and multi-hop traversal...");

    try {
      const response = await fetch(`${API_BASE_URL}/api/graph/proposals/from-entities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          entities,
          context: {
            title: `Graph proposal for ${entities.slice(0, 3).join(", ")}`,
            note: proposalContext
          },
          evidenceMode: "model_knowledge",
          traversalDepth: 2
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `Proposal request failed: ${response.status}`);
      }

      setProposal(payload);
      setProposalStatus(`Created ${payload.title}`);
      if (typeof payload.id === "string" && payload.id.trim()) {
        setGraphFocusProposalId(payload.id.trim());
      }
      await loadTape();
    } catch (error) {
      setProposalError(error.message);
      setProposalStatus("");
    } finally {
      setIsCreatingProposal(false);
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
                      : workspaceMode === "proposals"
                        ? "Proposal builder"
                        : "Workflow stream"}
                  </h2>
                  <p className="operator-workbench-summary">
                    {workspaceMode === "graph"
                      ? "Use the graph as a live sidecar, not a separate destination."
                      : workspaceMode === "proposals"
                        ? "Submit entities, let MusicMesh draft graph data, and inspect missing relationship findings before review."
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
                    focusKey={graphFocusProposalId}
                    threadId={OPERATOR_THREAD_ID}
                  />
                ) : workspaceMode === "proposals" ? (
                  <ProposalWorkbench
                    apiBaseUrl={API_BASE_URL}
                    context={proposalContext}
                    draft={proposalDraft}
                    errorMessage={proposalError}
                    isCreating={isCreatingProposal}
                    onContextChange={setProposalContext}
                    onDraftChange={setProposalDraft}
                    onProposalUpdated={setProposal}
                    onSubmit={handleCreateProposal}
                    proposal={proposal}
                    status={proposalStatus}
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

function ProposalWorkbench({
  apiBaseUrl,
  draft,
  context,
  isCreating,
  status,
  errorMessage,
  proposal,
  onDraftChange,
  onContextChange,
  onProposalUpdated,
  onSubmit
}) {
  return (
    <ScrollArea.Root className="operator-workflow-scroll-root">
      <ScrollArea.Viewport className="worksurface-scroll-viewport">
        <div className="operator-workflow-grid">
          <form className="workspace-block operator-workflow-card" onSubmit={onSubmit}>
            <p className="workspace-block-title">Entity list</p>
            <textarea
              className="composer-input operator-composer-input"
              onChange={(event) => onDraftChange(event.target.value)}
              rows={6}
              value={draft}
            />
            <p className="workspace-block-title">Ingestion context</p>
            <textarea
              className="composer-input operator-composer-input"
              onChange={(event) => onContextChange(event.target.value)}
              rows={3}
              value={context}
            />
            <button className="composer-submit operator-composer-submit" disabled={isCreating} type="submit">
              {isCreating ? "Creating..." : "Create Proposal"}
            </button>
            {status ? <p className="demo-muted">{status}</p> : null}
            {errorMessage ? <p className="composer-error">{errorMessage}</p> : null}
          </form>

          {proposal ? (
            <ProposalSummary
              apiBaseUrl={apiBaseUrl}
              onProposalUpdated={onProposalUpdated}
              proposal={proposal}
            />
          ) : null}
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
        <ScrollArea.Thumb className="scrollbar-thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}

function ProposalSummary({ apiBaseUrl, proposal, onProposalUpdated }) {
  const traversal = proposal.canon?.traversal || {};
  const apiRoot = apiBaseUrl || "";

  return (
    <section className="workspace-block operator-workflow-card">
      <p className="workspace-block-title">Latest proposal</p>
      <h3>{proposal.title}</h3>
      <div className="demo-property-list demo-property-list-tight">
        <div className="demo-property-row">
          <span>Proposal id</span>
          <strong>{proposal.id}</strong>
        </div>
        <div className="demo-property-row">
          <span>Status</span>
          <strong>{proposal.status || "unknown"}</strong>
        </div>
        <div className="demo-property-row">
          <span>Candidate nodes</span>
          <strong>{proposal.candidateNodes?.length || 0}</strong>
        </div>
        <div className="demo-property-row">
          <span>Candidate relationships</span>
          <strong>{proposal.candidateRelationships?.length || 0}</strong>
        </div>
        <div className="demo-property-row">
          <span>Traversal depth</span>
          <strong>{traversal.depth || 0}</strong>
        </div>
        <div className="demo-property-row">
          <span>Bridge nodes</span>
          <strong>{traversal.bridgeNodes?.length || 0}</strong>
        </div>
      </div>

      {proposal.id ? (
        <p className="demo-muted">
          Raw JSON:{" "}
          <a href={`${apiRoot}/api/graph/proposals/${encodeURIComponent(proposal.id)}`} rel="noreferrer" target="_blank">
            GET /api/graph/proposals/{proposal.id}
          </a>
        </p>
      ) : null}

      <ProposalReviewActions apiBaseUrl={apiBaseUrl} onProposalUpdated={onProposalUpdated} proposal={proposal} />

      <p className="demo-subheading">Completion findings</p>
      {(proposal.completionFindings || []).length > 0 ? (
        <div className="tape-list">
          {proposal.completionFindings.slice(0, 6).map((finding, index) => (
            <article className="tape-entry" key={`${finding.type}-${index}`}>
              <div className="tape-entry-header">
                <strong>{finding.type}</strong>
                <span>{finding.severity}</span>
              </div>
              <pre>{finding.message}</pre>
            </article>
          ))}
        </div>
      ) : (
        <p className="demo-muted">No completion findings returned.</p>
      )}

      <p className="demo-subheading">Candidate relationships</p>
      {(proposal.candidateRelationships || []).length > 0 ? (
        <div className="demo-property-list demo-property-list-tight">
          {proposal.candidateRelationships.slice(0, 8).map((relationship) => (
            <div className="demo-property-row" key={relationship.tempId}>
              <span>
                {relationship.sourceName} → {relationship.targetName}
              </span>
              <strong>{relationship.type}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="demo-muted">No relationship candidates returned yet.</p>
      )}
    </section>
  );
}

function ProposalReviewActions({ apiBaseUrl, proposal, onProposalUpdated }) {
  const [isWorking, setIsWorking] = useState(false);
  const [note, setNote] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const apiRoot = apiBaseUrl || "";

  const pendingNodeCount = (proposal.candidateNodes || []).filter((node) => node.reviewStatus === "pending").length;
  const pendingRelationshipCount = (proposal.candidateRelationships || []).filter(
    (relationship) => relationship.reviewStatus === "pending"
  ).length;

  const approvedNodeCount = (proposal.candidateNodes || []).filter((node) => node.reviewStatus === "approved").length;
  const approvedRelationshipCount = (proposal.candidateRelationships || []).filter(
    (relationship) => relationship.reviewStatus === "approved"
  ).length;

  async function refreshProposal() {
    if (!proposal.id) {
      return;
    }

    const response = await fetch(`${apiRoot}/api/graph/proposals/${encodeURIComponent(proposal.id)}`);

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Failed to reload proposal: ${response.status}`);
    }

    const payload = await response.json();
    onProposalUpdated(payload);
  }

  function buildApprovePendingDecisions() {
    const nodes = (proposal.candidateNodes || [])
      .filter((node) => node.tempId && node.reviewStatus === "pending")
      .map((node) => ({
        tempId: node.tempId,
        status: "approved",
        note: "Approved via operator graph demo workbench."
      }));

    const relationships = (proposal.candidateRelationships || [])
      .filter((relationship) => relationship.tempId && relationship.reviewStatus === "pending")
      .map((relationship) => ({
        tempId: relationship.tempId,
        status: "approved",
        note: "Approved via operator graph demo workbench."
      }));

    return { nodes, relationships };
  }

  async function approvePending() {
    if (!proposal.id) {
      throw new Error("Missing proposal id.");
    }

    const { nodes, relationships } = buildApprovePendingDecisions();

    if (nodes.length === 0 && relationships.length === 0) {
      throw new Error("No pending nodes or relationships to approve.");
    }

    const response = await fetch(`${apiRoot}/api/graph/proposals/${encodeURIComponent(proposal.id)}/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ nodes, relationships })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || `Review request failed: ${response.status}`);
    }

    onProposalUpdated(payload);
  }

  async function applyApproved() {
    if (!proposal.id) {
      throw new Error("Missing proposal id.");
    }

    const response = await fetch(`${apiRoot}/api/graph/proposals/${encodeURIComponent(proposal.id)}/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || `Apply request failed: ${response.status}`);
    }

    onProposalUpdated(payload);
  }

  async function handleApprovePending() {
    setErrorMessage("");
    setNote("");
    setIsWorking(true);

    try {
      await approvePending();
      setNote(`Approved ${pendingNodeCount} pending nodes and ${pendingRelationshipCount} pending relationships.`);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleApplyApproved() {
    setErrorMessage("");
    setNote("");
    setIsWorking(true);

    try {
      await applyApproved();
      setNote("Apply completed. Proposal status should now be applied if the server accepted the write.");
      await refreshProposal();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsWorking(false);
    }
  }

  const canAct = Boolean(proposal.id);
  const isApplied = proposal.status === "applied";

  return (
    <div className="workspace-block">
      <p className="demo-subheading">Review / apply</p>
      <p className="demo-muted">
        Pending approvals: <strong>{pendingNodeCount}</strong> nodes, <strong>{pendingRelationshipCount}</strong> relationships.
        Already approved: <strong>{approvedNodeCount}</strong> nodes, <strong>{approvedRelationshipCount}</strong> relationships.
      </p>

      <div className="operator-composer-row operator-proposal-actions">
        <button
          className="composer-submit operator-composer-submit"
          disabled={!canAct || isWorking || isApplied || (pendingNodeCount === 0 && pendingRelationshipCount === 0)}
          onClick={handleApprovePending}
          type="button"
        >
          {isWorking ? "Working..." : "Approve all pending"}
        </button>
        <button
          className="composer-submit operator-composer-submit"
          disabled={!canAct || isWorking || isApplied || approvedNodeCount === 0}
          onClick={handleApplyApproved}
          type="button"
        >
          {isWorking ? "Working..." : "Apply approved"}
        </button>
      </div>

      {note ? <p className="demo-muted">{note}</p> : null}
      {errorMessage ? <p className="composer-error">{errorMessage}</p> : null}

      {proposal.applyResult ? (
        <div className="tape-entry operator-proposal-apply-result">
          <div className="tape-entry-header">
            <strong>Last apply result</strong>
            <span>{proposal.applyResult.appliedAt || ""}</span>
          </div>
          <pre>{JSON.stringify(proposal.applyResult, null, 2)}</pre>
        </div>
      ) : null}
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
