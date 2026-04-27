export const panelModes = ["Logs", "Trace", "Database", "Artifacts"];

export const initialThreads = [
  {
    id: "rem-canon-pass",
    name: "R.E.M. discography canon pass",
    scope: "Discography review",
    status: "Streaming answer",
    unread: false,
    updatedAt: "Just now",
    summary: "Answer-first conversation with graph readback for album canon reuse.",
    messages: [
      {
        id: "rem-user-1",
        type: "user",
        author: "Nick",
        timestamp: "2:11 PM",
        content: "Walk me through the core R.E.M. studio albums and show me anything that looks structurally risky before we persist it."
      },
      {
        id: "rem-status-1",
        type: "status",
        author: "MusicMesh",
        timestamp: "2:11 PM",
        content: "Inspecting canon first, then assembling a direct answer with graph-ready notes."
      },
      {
        id: "rem-tool-1",
        type: "tool",
        author: "MusicMesh",
        timestamp: "2:12 PM",
        content: "Canon lookup completed for Album nodes, release dates, and duplicate candidates.",
        actionLabel: "Open trace"
      },
      {
        id: "rem-assistant-1",
        type: "assistant",
        author: "MusicMesh",
        timestamp: "2:12 PM",
        content:
          "R.E.M.'s core studio run starts with Murmur and Reckoning, sharpens through Fables of the Reconstruction and Lifes Rich Pageant, then moves into the bigger crossover arc of Document, Green, Out of Time, Automatic for the People, Monster, New Adventures in Hi-Fi, Up, Reveal, Around the Sun, Accelerate, and Collapse into Now. The main canon risk is duplicate handling around alternate punctuation and regional release variants, so the safe path is to reuse the existing Album entities and carry release nuance on attached release data instead of multiplying album nodes."
      },
      {
        id: "rem-artifact-1",
        type: "artifact",
        author: "MusicMesh",
        timestamp: "2:13 PM",
        content: "Prepared an album-normalization artifact with candidate merges and evidence links.",
        artifactId: "artifact-rem-review"
      }
    ],
    panelData: {
      Logs: [
        { level: "info", time: "2:11:07 PM", text: "Intent classified as answer-now-then-persist." },
        { level: "info", time: "2:11:08 PM", text: "Album canon lookup returned 15 primary matches and 2 duplicate candidates." },
        { level: "warn", time: "2:11:10 PM", text: "Release-title punctuation mismatch detected for Lifes Rich Pageant." }
      ],
      Trace: [
        { step: "Intent", status: "done", duration: "120ms", detail: "Operator request recognized as direct answer plus cautious persistence prep." },
        { step: "Canon lookup", status: "done", duration: "420ms", detail: "Queried Album entities and linked release variants." },
        { step: "Risk shaping", status: "done", duration: "180ms", detail: "Moved regional nuance to release scope instead of album identity." },
        { step: "Answer stream", status: "active", duration: "live", detail: "Assistant response remains the primary user-facing surface." }
      ],
      Database: {
        kind: "table",
        columns: ["Album", "Year", "Canon status", "Risk"],
        rows: [
          ["Murmur", "1983", "Canonical match", "Low"],
          ["Lifes Rich Pageant", "1986", "Canonical match", "Medium"],
          ["Out of Time", "1991", "Canonical match", "Low"],
          ["Automatic for the People", "1992", "Canonical match", "Low"]
        ]
      },
      Artifacts: [
        {
          id: "artifact-rem-review",
          name: "REM album normalization draft",
          kind: "Graph payload",
          preview:
            "{\n  \"graphPatch\": \"reuse existing Album canon\",\n  \"duplicateCandidates\": [\"Life's Rich Pageant\", \"Lifes Rich Pageant\"],\n  \"status\": \"chat-persisted\"\n}"
        }
      ]
    }
  },
  {
    id: "weller-influence",
    name: "Paul Weller influence map",
    scope: "Influence review",
    status: "Ready for follow-up",
    unread: true,
    updatedAt: "18m ago",
    summary: "Soft-fact influence analysis with relationship confidence cues.",
    messages: [
      {
        id: "weller-user-1",
        type: "user",
        author: "Nick",
        timestamp: "1:54 PM",
        content: "Who seems most central to Paul Weller's influence profile, and what would you persist versus leave soft?"
      },
      {
        id: "weller-assistant-1",
        type: "assistant",
        author: "MusicMesh",
        timestamp: "1:55 PM",
        content:
          "The Who, Small Faces, soul records from Motown and Stax, and post-war British mod culture all belong near the center of the picture, but they should not be persisted with equal certainty. Direct artist-to-artist influence claims can be proposed with confidence notes, while broader scene and taste-shaping context should stay explicitly soft unless we have stronger source support."
      },
      {
        id: "weller-tool-1",
        type: "tool",
        author: "MusicMesh",
        timestamp: "1:56 PM",
        content: "Influence confidence rubric applied to six candidate relationships.",
        actionLabel: "Inspect trace"
      }
    ],
    panelData: {
      Logs: [
        { level: "info", time: "1:55:21 PM", text: "Influence request treated as soft-fact-heavy graph work." },
        { level: "info", time: "1:55:24 PM", text: "Relationship-property strategy selected over edge-type expansion." }
      ],
      Trace: [
        { step: "Intent", status: "done", duration: "95ms", detail: "Influence question recognized as evidence-sensitive." },
        { step: "Evidence pass", status: "done", duration: "510ms", detail: "Collected source-backed artist and scene references." },
        { step: "Confidence scoring", status: "done", duration: "140ms", detail: "Prepared relationship properties for nuance." }
      ],
      Database: {
        kind: "json",
        preview:
          "{\n  \"candidateRelationships\": [\n    { \"target\": \"The Who\", \"confidence\": 0.81, \"persist\": true },\n    { \"target\": \"British mod culture\", \"confidence\": 0.54, \"persist\": false }\n  ]\n}"
      },
      Artifacts: [
        {
          id: "artifact-weller-1",
          name: "Influence scoring notes",
          kind: "Evidence summary",
          preview:
            "Persist artist-level influence edges with confidence notes.\nLeave scene-level context soft until we have source-backed wording suitable for review."
        }
      ]
    }
  },
  {
    id: "belew-connections",
    name: "Adrian Belew connection trace",
    scope: "Connection typing",
    status: "Awaiting review",
    unread: false,
    updatedAt: "Yesterday",
    summary: "Typed connection review with roles attached on relationships.",
    messages: [
      {
        id: "belew-user-1",
        type: "user",
        author: "Nick",
        timestamp: "Yesterday",
        content: "Map Adrian Belew's strongest collaborations without turning everything into a vague connection edge."
      },
      {
        id: "belew-assistant-1",
        type: "assistant",
        author: "MusicMesh",
        timestamp: "Yesterday",
        content:
          "The strongest path is to model the collaborations through typed relationships like performer, producer, band member, or touring collaborator, then carry role nuance on the edge. That keeps the graph explainable without flattening every relationship into a generic connection."
      }
    ],
    panelData: {
      Logs: [
        { level: "info", time: "Yesterday", text: "Typed-relationship strategy selected for collaboration mapping." }
      ],
      Trace: [
        { step: "Canon reuse", status: "done", duration: "210ms", detail: "Existing Artist and Person entities reused." }
      ],
      Database: {
        kind: "table",
        columns: ["Counterparty", "Relationship", "Role detail"],
        rows: [
          ["King Crimson", "MEMBER_OF", "Guitar, vocals"],
          ["Talking Heads", "COLLABORATED_WITH", "Session and touring work"],
          ["David Bowie", "PERFORMED_WITH", "Lead guitar on tour"]
        ]
      },
      Artifacts: [
        {
          id: "artifact-belew-1",
          name: "Connection typing draft",
          kind: "Schema-safe graph patch",
          preview: "All graph edges reuse existing relationship vocabulary and attach role nuance at the relationship level."
        }
      ]
    }
  }
];

export function getThreadById(threads, threadId) {
  return threads.find((thread) => thread.id === threadId) ?? threads[0];
}

export function getDefaultMessageId(thread) {
  const preferredMessage =
    [...thread.messages].reverse().find((message) => message.type === "assistant" || message.type === "artifact") ??
    thread.messages[thread.messages.length - 1];

  return preferredMessage?.id;
}

export function getMessageById(thread, messageId) {
  return thread.messages.find((message) => message.id === messageId) ?? null;
}

export function buildAssistantReply(prompt, thread) {
  const trimmed = prompt.trim();

  if (!trimmed) {
    return "I’m ready when you are.";
  }

  return `Working from the ${thread.scope.toLowerCase()} context, the safest answer-first move is to respond directly, keep the graph implications explicit, and only promote what looks canon-safe. For this request, I would answer the user in plain language, highlight any uncertainty rather than hiding it, and keep proposed persistence attached to evidence or existing canon matches instead of inventing new structure.`;
}

export function buildGeneratedPanelData(prompt) {
  const clippedPrompt = prompt.trim().slice(0, 96) || "Untitled prompt";

  return {
    log: {
      level: "info",
      time: "Now",
      text: `Generated a fresh operator response for: "${clippedPrompt}".`
    },
    trace: {
      step: "Answer stream",
      status: "active",
      duration: "live",
      detail: "Streaming a direct answer while keeping follow-up persistence available."
    },
    artifact: {
      id: `artifact-${Date.now()}`,
      name: "New response snapshot",
      kind: "Draft artifact",
      preview: `Prompt:\n${clippedPrompt}\n\nStatus:\nAnswer-first response prepared with optional persist follow-up.`
    },
    databaseRow: ["Draft context", "Live", "Answer-first", "Review before canon"]
  };
}
