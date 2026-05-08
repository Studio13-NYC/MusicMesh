export const starterPrompts = [
  "Show the music-domain graph around Bryan Ferry and call out what is safe to persist.",
  "Map Brian Eno's strongest collaborators, albums, scenes, studios, and production roles.",
  "Compare R.E.M. canon albums against duplicate release candidates before graph persistence."
];

export const transcript = [
  {
    id: "user-1",
    role: "user",
    content: "tell me more about breyan ferry"
  },
  {
    id: "assistant-1",
    role: "assistant",
    content:
      "Assuming you mean Bryan Ferry: he is the singer, songwriter, and frontman most closely tied to Roxy Music, with a solo catalog that runs through art rock, glam, sophisticated pop, and standards. The graph-worthy core is Bryan Ferry as a Person, Roxy Music as a Band, key albums as Releases, selected tracks, and relationships that distinguish membership, recorded songs, releases, influence, and place."
  }
];

export const graphNodes = [
  { id: "bryan-ferry", label: "Bryan Ferry", kind: "Person", status: "canon", x: 50, y: 49 },
  { id: "roxy-music", label: "Roxy Music", kind: "Band", status: "canon", x: 50, y: 20 },
  { id: "avalon", label: "Avalon", kind: "Album", status: "canon", x: 75, y: 32 },
  { id: "for-your-pleasure", label: "For Your Pleasure", kind: "Album", status: "canon", x: 27, y: 31 },
  { id: "virginia-plain", label: "Virginia Plain", kind: "Track", status: "canon", x: 20, y: 58 },
  { id: "more-than-this", label: "More Than This", kind: "Track", status: "canon", x: 78, y: 58 },
  { id: "art-rock", label: "Art rock", kind: "Genre", status: "inferred", x: 37, y: 77 },
  { id: "glam-rock", label: "Glam rock", kind: "Genre", status: "inferred", x: 63, y: 77 },
  { id: "washington", label: "Washington, County Durham", kind: "Place", status: "canon", x: 50, y: 91 }
];

export const graphEdges = [
  { id: "e1", source: "bryan-ferry", target: "roxy-music", label: "MEMBER_OF" },
  { id: "e2", source: "roxy-music", target: "avalon", label: "RELEASED_ALBUM" },
  { id: "e3", source: "roxy-music", target: "for-your-pleasure", label: "RELEASED_ALBUM" },
  { id: "e4", source: "bryan-ferry", target: "virginia-plain", label: "RECORDED_SONG" },
  { id: "e5", source: "bryan-ferry", target: "more-than-this", label: "RECORDED_SONG" },
  { id: "e6", source: "roxy-music", target: "art-rock", label: "ASSOCIATED_WITH_GENRE" },
  { id: "e7", source: "roxy-music", target: "glam-rock", label: "ASSOCIATED_WITH_GENRE" },
  { id: "e8", source: "bryan-ferry", target: "washington", label: "BORN_IN" }
];

export const nodeDetails = {
  "bryan-ferry": {
    title: "Bryan Ferry",
    subtitle: "Person · 11 connected relationships",
    confidence: "Canon match",
    notes:
      "Best anchor for this turn. The misspelled prompt should resolve here before graph work begins.",
    properties: [
      ["aliases", "Breyan Ferry"],
      ["primary role", "Singer, songwriter"],
      ["graph id", "chat-person-bryan-ferry"]
    ]
  },
  "roxy-music": {
    title: "Roxy Music",
    subtitle: "Band · Ferry membership anchor",
    confidence: "Canon match",
    notes: "Use typed membership and release relationships instead of flattening to RELATED_TO.",
    properties: [
      ["node kind", "Band"],
      ["relationship", "MEMBER_OF"],
      ["risk", "Low"]
    ]
  },
  avalon: {
    title: "Avalon",
    subtitle: "Album · release graph branch",
    confidence: "Canon match",
    notes: "Keep release nuance attached to release records instead of multiplying album nodes.",
    properties: [
      ["node kind", "Album"],
      ["relationship", "RELEASED_ALBUM"],
      ["risk", "Low"]
    ]
  }
};

export const runStages = [
  {
    id: "visible-answer",
    label: "Visible answer",
    state: "done",
    time: "14.2s",
    detail: "Returned a direct answer before waiting on graph persistence."
  },
  {
    id: "preview",
    label: "Graph preview",
    state: "done",
    time: "24.9s",
    detail: "Created a provisional graph for immediate inspection."
  },
  {
    id: "planning",
    label: "Graph plan",
    state: "attention",
    time: "57.4s",
    detail: "Planned 29 entities and 36 relationships. Token cost was high for a short prompt."
  },
  {
    id: "grounding",
    label: "Canon grounding",
    state: "attention",
    time: "66.1s",
    detail: "Resolved planned graph data against canon candidates."
  },
  {
    id: "persisted",
    label: "Graph persisted",
    state: "done",
    time: "127.4s",
    detail: "Persisted 29 nodes and 36 relationships with zero skipped relationships."
  },
  {
    id: "review",
    label: "Run review",
    state: "attention",
    time: "28.0s",
    detail: "Rated the run 4/5 and flagged operational efficiency."
  }
];

export const evidenceItems = [
  {
    id: "ev-1",
    type: "graph_update",
    title: "Persisted graph update",
    body: "Bryan Ferry · 29 nodes · 36 relationships · no skipped relationships"
  },
  {
    id: "ev-2",
    type: "run_quality_assessment",
    title: "Run quality: 4/5",
    body: "Answer quality was strong. Graph planning and grounding were slower and more token-heavy than expected."
  },
  {
    id: "ev-3",
    type: "llm_call_completed",
    title: "Chat answer LLM",
    body: "gpt-5.5 · medium reasoning · 1,264 total tokens · 14.1s"
  },
  {
    id: "ev-4",
    type: "chat_request_received",
    title: "Original request",
    body: "Prompt: tell me more about breyan ferry"
  }
];

export const qualityFindings = [
  "Answered the likely intended question and named the assumption.",
  "Graph pipeline completed successfully with no skipped relationships.",
  "Planning and grounding were expensive for a short informational prompt."
];

export const nextActions = [
  "Add graph-scope controls for simple artist lookups.",
  "Coordinate preview and final graph generation to avoid duplicated work.",
  "Show cost and latency as a first-class run diagnostic."
];
