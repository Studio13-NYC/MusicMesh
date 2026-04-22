import React, { useEffect, useRef, useState } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Separator from "@radix-ui/react-separator";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE_RAW = import.meta.env.VITE_MUSICMESH_API_BASE ?? "";
const API_BASE_URL =
  typeof API_BASE_RAW === "string" ? API_BASE_RAW.replace(/\/$/, "") : "";
const REPO_URL = "https://github.com/Studio13-NYC/MusicMesh";
const GRAPH_DEMOS = [
  {
    href: "/graph-cytoscape.html",
    label: "Cytoscape demo"
  },
  {
    href: "/graph-nvl.html",
    label: "NVL demo"
  }
];

const seedMessages = [
  {
    id: "seed-assistant-1",
    role: "assistant",
    content:
      "MusicMesh uses same-origin /api (Vite proxy locally, Azure Functions when deployed). Send a message to chat; tape and runtime logs load from local disk in dev or Azure Blob when production persistence is configured."
  }
];

export function AppShell() {
  const [messages, setMessages] = useState(seedMessages);
  const [composerValue, setComposerValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [tapeEntries, setTapeEntries] = useState([]);
  const [tapePath, setTapePath] = useState("");
  const [runtimeEvents, setRuntimeEvents] = useState([]);
  const [runtimeLogPath, setRuntimeLogPath] = useState("");
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
      const response = await fetch(`${API_BASE_URL}/api/chat/tape?limit=80`);

      if (!response.ok) {
        throw new Error(`Tape request failed: ${response.status}`);
      }

      const payload = await response.json();
      setTapeEntries(payload.entries || []);
      setTapePath(payload.tapePath || "");
    } catch {
      setTapeEntries([]);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/runtime?limit=80`);

      if (!response.ok) {
        throw new Error(`Runtime log request failed: ${response.status}`);
      }

      const payload = await response.json();
      setRuntimeEvents(payload.events || []);
      setRuntimeLogPath(payload.runtimeLogPath || "");
    } catch {
      setRuntimeEvents([]);
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
          threadId: "product-chat",
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
    <div className="workspace">
      <div className="app-shell">
        <div className="app-top-actions">
          <nav aria-label="Graph demos" className="app-demo-links">
            {GRAPH_DEMOS.map((demo) => (
              <a className="app-demo-link" href={demo.href} key={demo.href}>
                {demo.label}
              </a>
            ))}
          </nav>
          <a
            className="app-github-link"
            href={REPO_URL}
            rel="noreferrer"
            target="_blank"
          >
            <GitHubMark />
            <span>GitHub</span>
          </a>
        </div>
        <PanelGroup direction="horizontal">
          <Panel className="chat-panel" defaultSize={68} minSize={52}>
            <ChatSurface
              composerValue={composerValue}
              errorMessage={errorMessage}
              isSending={isSending}
              messages={messages}
              onComposerChange={setComposerValue}
              onSubmit={handleSubmit}
              viewportRef={viewportRef}
            />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel className="worksurface-panel" defaultSize={32} minSize={24}>
            <WorksurfacePanel
              runtimeEvents={runtimeEvents}
              runtimeLogPath={runtimeLogPath}
              tapeEntries={tapeEntries}
              tapePath={tapePath}
            />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

function GitHubMark() {
  return (
    <svg aria-hidden="true" className="app-github-icon" viewBox="0 0 16 16">
      <path
        d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 4.06c.68 0 1.37.09 2.01.26 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ChatSurface({
  messages,
  composerValue,
  isSending,
  errorMessage,
  onComposerChange,
  onSubmit,
  viewportRef
}) {
  function handleComposerKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    onSubmit(event);
  }

  return (
    <section className="chat-surface">
      <header className="chat-header">
        <div>
          <p className="section-label">Chat</p>
          <h1>Live operator chat</h1>
        </div>
      </header>

      <Separator.Root className="separator" decorative orientation="horizontal" />

      <ScrollArea.Root className="chat-scroll-root">
        <ScrollArea.Viewport className="chat-scroll-viewport" ref={viewportRef}>
          <div className="stream">
            {messages.map((message) => (
              <TranscriptEntry entry={message} key={message.id} />
            ))}
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
          <ScrollArea.Thumb className="scrollbar-thumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>

      <form className="composer-shell" onSubmit={onSubmit}>
        <label className="composer-label" htmlFor="musicmesh-composer">
          Message
        </label>
        <div className="composer-field">
          <textarea
            className="composer-input"
            id="musicmesh-composer"
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Ask MusicMesh a music question."
            rows={4}
            value={composerValue}
          />
          <button className="composer-submit" disabled={isSending} type="submit">
            {isSending ? "Thinking..." : "Send"}
          </button>
        </div>
        {errorMessage ? <p className="composer-error">{errorMessage}</p> : null}
      </form>
    </section>
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

function WorksurfacePanel({ tapeEntries, tapePath, runtimeEvents, runtimeLogPath }) {
  return (
    <aside className="worksurface">
      <header className="worksurface-header">
        <div>
          <p className="section-label">Workspace</p>
          <h2>Conversation tape</h2>
        </div>
      </header>

      <Separator.Root className="separator" decorative orientation="horizontal" />

      <ScrollArea.Root className="worksurface-scroll-root">
        <ScrollArea.Viewport className="worksurface-scroll-viewport">
          <div className="workspace-content">
            <section className="workspace-block">
              <p className="workspace-block-title">Tape file</p>
              <code className="workspace-path">{tapePath || "Not written yet."}</code>
            </section>

            <section className="workspace-block">
              <p className="workspace-block-title">Runtime log</p>
              <code className="workspace-path">{runtimeLogPath || "Not written yet."}</code>
            </section>

            <section className="workspace-block">
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

            <section className="workspace-block">
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
    </aside>
  );
}
