import React, { useCallback, useEffect, useRef, useState } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Dialog from "@radix-ui/react-dialog";
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
  const catalogContextRef=useRef(null);
  const handleCatalogContextChange=useCallback(context=>{catalogContextRef.current=context;},[]);
  const activeGraphRequestIdsRef = useRef(new Set());
  const [researchRun,setResearchRun]=useState(null);
  const [researchGraph,setResearchGraph]=useState(null);
  const [actor,setActor]=useState('Nick');
  const [decisionOpen,setDecisionOpen]=useState(false);
  const [decisionSelection,setDecisionSelection]=useState('');
  const [savedRuns,setSavedRuns]=useState(()=>{try{return JSON.parse(localStorage.getItem('musicmesh-pending-research')||'[]');}catch{return [];}});
  const researchBusy=useRef(false);
  const graphRunStatus=researchRun?{label:researchRun.progress||researchRun.status,detail:researchRun.status==='running'?'Following useful evidence paths':researchRun.status==='needs_input'?'Your decision is needed':researchRun.status==='deferred'?'Saved for later':`${researchRun.usage?.total_tokens||0} tokens`,isActive:isSending,variant:researchRun.status==='failed'?'error':'complete'}:null;
  useEffect(()=>{loadTape();},[]);
  function rememberRun(run){
    setResearchRun(run);
    if(run.graph?.nodes?.length)setResearchGraph(run.graph);
    setSavedRuns(current=>{const next=current.filter(r=>r.id!==run.requestId);if(['running','needs_input','deferred'].includes(run.status))next.push({id:run.requestId,label:run.decision?.question||run.progress||'Resume research'});const bounded=next.slice(-12);localStorage.setItem('musicmesh-pending-research',JSON.stringify(bounded));return bounded;});
    if(run.status==='needs_input'){setDecisionSelection('');setDecisionOpen(true);}
    if(['completed','denied','failed','cancelled'].includes(run.status)&&run.message)setMessages(current=>current.some(m=>m.id===`assistant-${run.requestId}`)?current.map(m=>m.id===`assistant-${run.requestId}`?{...m,content:run.message}:m):[...current,{id:`assistant-${run.requestId}`,role:'assistant',content:run.message}]);
  }
  async function postResearch(path,body){const response=await fetch(`${API_BASE_URL}/api/chat${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const payload=await response.json();if(!response.ok)throw Error(payload.error||`Request failed (${response.status})`);return payload;}
  async function continueResearch(initial){
    let run=initial;rememberRun(run);
    for(let step=0;run.status==='running'&&step<16;step++){
      if(run.busy)await sleep(1500);
      run=await postResearch('',{requestId:run.requestId,version:run.version});rememberRun(run);
    }
    if(run.status!=='running')await loadTape();
  }
  async function resumeResearch(id){
    if(researchBusy.current)return;researchBusy.current=true;setIsSending(true);setErrorMessage('');
    try{const response=await fetch(`${API_BASE_URL}/api/chat/run?id=${encodeURIComponent(id)}`);const run=await response.json();if(!response.ok)throw Error(run.error);rememberRun(run);if(run.status==='deferred'){setDecisionSelection('');setDecisionOpen(true);}else await continueResearch(run);}
    catch(error){setErrorMessage(error.message);}finally{researchBusy.current=false;setIsSending(false);}
  }
  async function chooseDecision(choice){
    if(researchBusy.current||!researchRun?.decision)return;researchBusy.current=true;setIsSending(true);setErrorMessage('');
    try{const run=await postResearch('/decision',{requestId:researchRun.requestId,version:researchRun.version,decisionId:researchRun.decision.id,choice,selection:decisionSelection});setDecisionOpen(false);await continueResearch(run);}
    catch(error){setErrorMessage(error.message);}finally{researchBusy.current=false;setIsSending(false);}
  }
  async function cancelResearch(id){
    if(researchBusy.current)return;researchBusy.current=true;setIsSending(true);setErrorMessage('');
    try{const response=await fetch(`${API_BASE_URL}/api/chat/run?id=${encodeURIComponent(id)}`);const run=await response.json();if(!response.ok)throw Error(run.error);rememberRun(await postResearch('',{requestId:id,version:run.version,cancel:true}));await loadTape();}
    catch(error){setErrorMessage(error.message);}finally{researchBusy.current=false;setIsSending(false);}
  }

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

      if (nextFocusKey && !researchRun) {
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

  async function submitPrompt(prompt, { displayPrompt = prompt, graphContext = null } = {}) {
    const normalizedPrompt=prompt.trim();if(!normalizedPrompt||researchBusy.current)return false;
    researchBusy.current=true;setErrorMessage('');setIsSending(true);
    const requestId=createClientRequestId();
    const nextMessages=[...messages,{id:`user-${requestId}`,role:'user',content:displayPrompt.trim()||normalizedPrompt}];
    setMessages(nextMessages);setComposerValue('');
    // Save before dispatch so a lost HTTP response can be resumed by its stable ID.
    rememberRun({requestId,status:'running',version:0,progress:'Reading your question'});
    try{const run=await postResearch('',{clientRequestId:requestId,version:0,threadId:OPERATOR_THREAD_ID,prompt:normalizedPrompt,graphContext:graphContext||catalogContextRef.current,actor,messages:nextMessages.slice(-6).map(({role,content})=>({role,content}))});await continueResearch(run);return true;}
    catch(error){setErrorMessage(`${error.message}. Use Resume research to recover this run.`);return false;}
    finally{researchBusy.current=false;setIsSending(false);}
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
    const prompt = `Explore useful stored connections around "${label}" (${kind}). Inspect available relationship families and choose the paths most relevant to understanding this music. Use exact catalog identities and sourced evidence; stop when useful context is established. Explain gaps without inventing graph records.`;

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

        <div className="research-controls">
          <label>Contributing as <select aria-label="Contribution attribution" value={actor} onChange={event=>setActor(event.target.value)} disabled={isSending}><option>Nick</option><option>Guest</option></select></label>
          {savedRuns.map(run=><span key={run.id}><button disabled={isSending} onClick={()=>resumeResearch(run.id)} title={run.label}>Resume research: {run.label.slice(0,65)}</button><button disabled={isSending} onClick={()=>cancelResearch(run.id)} aria-label={`Cancel research: ${run.label}`}>Cancel</button></span>)}
        </div>
        <Dialog.Root open={decisionOpen} onOpenChange={open=>{if(!open&&!isSending)chooseDecision('defer');}}>
          <Dialog.Portal><Dialog.Overlay className="research-decision-overlay"/><Dialog.Content className="research-decision-modal" onPointerDownOutside={event=>event.preventDefault()}>
            <Dialog.Title>Decision needed</Dialog.Title>
            <Dialog.Description>{researchRun?.decision?.question}</Dialog.Description>
            {researchRun?.decision?.display&&<dl>{Object.entries(researchRun.decision.display).map(([key,value])=><React.Fragment key={key}><dt>{{subjectIdentity:"Subject identity",factorIdentity:"Factor identity",sourceUrl:"Source"}[key]||key}</dt><dd>{String(value)}</dd></React.Fragment>)}</dl>}
            {researchRun?.decision?.choices?.map(choice=><label className="research-choice" key={choice}><input type="radio" name="research-choice" value={choice} checked={decisionSelection===choice} onChange={()=>setDecisionSelection(choice)}/>{choice}</label>)}
            {errorMessage&&<p role="alert">{errorMessage}</p>}
            <div className="research-decision-actions">
              <button disabled={isSending||Boolean(researchRun?.decision?.choices?.length&&!decisionSelection)} onClick={()=>chooseDecision('approve')}>Approve</button>
              <button disabled={isSending} onClick={()=>chooseDecision('deny')}>Deny</button>
              <button disabled={isSending} onClick={()=>chooseDecision('defer')}>Defer</button>
            </div>
          </Dialog.Content></Dialog.Portal>
        </Dialog.Root>
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
                    defaultSeedQuery=""
                    researchGraph={researchGraph}
                    embedded
                    library="cytoscape"
                    focusKey={researchGraph ? "" : graphFocusAnchorId}
                    graphRunStatus={graphRunStatus}
                    onRequestNodeExpansion={handleGraphNodeExpansion}
                    onCatalogContextChange={handleCatalogContextChange}
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
