const { validateEnv } = require("./env");
const { createGraphProposalFromEntities } = require("./graphProposalService");

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";

function stableString(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return "";
}

function buildExtractionInput(prompt, messages) {
  const recentUserMessages = (Array.isArray(messages) ? messages : [])
    .filter((message) => message.role === "user" && typeof message.content === "string")
    .slice(-4)
    .map((message) => message.content.trim())
    .filter(Boolean);
  const combinedMessages = [...recentUserMessages, prompt].filter(Boolean);

  return combinedMessages.join("\n\n");
}

function parseJsonObject(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function getOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (!Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

async function extractGraphRequest(prompt, messages) {
  const envResult = validateEnv();

  if (!envResult.isValid) {
    return {
      intent: "other",
      entities: [],
      contextNote: prompt,
      extractionWarning: "Environment validation failed before LLM extraction; graph entities were not inferred deterministically."
    };
  }

  const inputText = buildExtractionInput(prompt, messages);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      instructions: [
        "Extract graph operation intent and entity names from this MusicMesh chat.",
        "Return only JSON with keys: intent, entities, contextNote.",
        "intent must be one of: graph_proposal, graph_lookup, other.",
        "entities must be an array of objects with name and optional type.",
        "Use reasoning to separate operator intent from graph entities; do not turn task phrases, questions, or search phrases into entities.",
        "Resolve aliases and informal names to the best music-domain entity names.",
        "Preserve canonical punctuation when obvious: I.R.S. Records, The Record Plant, Los Angeles, The Record Plant, New York.",
        "If a user says CBGBs, normalize the name to CBGB and put CBGBs in aliases.",
        "Do not include instructions or prose."
      ].join("\n"),
      input: [
        {
          role: "user",
          content: inputText
        }
      ],
      reasoning: {
        effort: "low"
      }
    })
  });

  if (!response.ok) {
    return {
      intent: "other",
      entities: [],
      contextNote: prompt,
      extractionWarning: `Entity extraction failed: ${response.status} ${response.statusText}; graph entities were not inferred deterministically.`
    };
  }

  const payload = await response.json();
  const parsed = parseJsonObject(getOutputText(payload));

  if (!parsed || !Array.isArray(parsed.entities)) {
    return {
      intent: "other",
      entities: [],
      contextNote: prompt,
      extractionWarning: "Entity extraction returned invalid JSON; graph entities were not inferred deterministically."
    };
  }

  return {
    intent: parsed.intent || "graph_proposal",
    entities: parsed.entities
      .map((entity) => ({
        name: stableString(entity.name),
        type: stableString(entity.type),
        aliases: Array.isArray(entity.aliases) ? entity.aliases.map(stableString).filter(Boolean) : []
      }))
      .filter((entity) => entity.name),
    contextNote: stableString(parsed.contextNote) || prompt,
    extractionWarning: null
  };
}

function formatMatchSummary(proposal) {
  return proposal.candidateNodes
    .map((node) => {
      const matchText = node.matchedCanonId
        ? `matched existing canon (${node.matchedCanonId})`
        : "no exact canon match";
      const duplicateCount = Array.isArray(node.duplicateCandidates)
        ? node.duplicateCandidates.length
        : 0;

      return `- ${node.name}: ${matchText}; ${duplicateCount} lookup candidate(s).`;
    })
    .join("\n");
}

function formatRelationshipSummary(proposal) {
  if (!proposal.candidateRelationships.length) {
    return "- No relationship candidates were generated.";
  }

  return proposal.candidateRelationships
    .slice(0, 8)
    .map(
      (relationship) =>
        `- ${relationship.sourceName} -> ${relationship.type} -> ${relationship.targetName} (${Math.round(
          relationship.confidenceScore * 100
        )}% confidence)`
    )
    .join("\n");
}

function formatGraphProposalSummary(proposal, extraction) {
  const traversal = proposal.canon.traversal;
  const exactMatches = proposal.candidateNodes.filter((node) => node.matchedCanonId).length;
  const missingMatches = proposal.candidateNodes.length - exactMatches;
  const workspacePersistence = proposal.workspacePersistence || {};
  const warningText = extraction.extractionWarning
    ? `\n\nExtraction note: ${extraction.extractionWarning}`
    : "";

  return [
    "I checked canon and created a reviewable graph proposal.",
    "",
    `Proposal: ${proposal.title}`,
    `Proposal ID: ${proposal.id}`,
    `Status: ${proposal.status}`,
    `Graph workspace persistence: ${workspacePersistence.persistedNodeCount || 0} proposed node(s), ${workspacePersistence.persistedRelationshipCount || 0} proposed relationship(s)`,
    "",
    "Canon lookup:",
    `- ${proposal.candidateNodes.length} candidate node(s)`,
    `- ${exactMatches} exact existing canon match(es)`,
    `- ${missingMatches} candidate(s) without exact matches`,
    "",
    formatMatchSummary(proposal),
    "",
    "Multi-hop traversal:",
    `- depth: ${traversal.depth}`,
    `- nodes inspected: ${traversal.nodes.length}`,
    `- relationships inspected: ${traversal.relationships.length}`,
    `- bridge nodes found: ${traversal.bridgeNodes.length}`,
    `- top nearby relationship types: ${traversal.relationshipTypeCounts
      .slice(0, 5)
      .map((entry) => `${entry.type} (${entry.count})`)
      .join(", ") || "none"}`,
    "",
    "Relationship candidates:",
    formatRelationshipSummary(proposal),
    "",
    "I persisted these as proposed graph workspace items so they can be inspected visually. I did not canonize them. The next step is human review/approval, then the approved apply path can promote reviewed items to canon.",
    warningText
  ]
    .filter((part) => part !== "")
    .join("\n");
}

async function maybeHandleGraphChat({ prompt, messages }) {
  const extraction = await extractGraphRequest(prompt, messages);

  if (!extraction.entities.length || extraction.intent === "other") {
    return {
      proposal: null,
      extraction,
      summary: extraction.extractionWarning
        ? `Graph proposal work needs human input before continuing: ${extraction.extractionWarning}`
        : ""
    };
  }

  let proposal;

  try {
    proposal = await createGraphProposalFromEntities({
      entities: extraction.entities,
      context: {
        title: `Chat graph proposal for ${extraction.entities
          .slice(0, 3)
          .map((entity) => entity.name)
          .join(", ")}`,
        note: extraction.contextNote
      },
      evidenceMode: "model_knowledge",
      traversalDepth: 2
    });
  } catch (error) {
    return {
      proposal: null,
      extraction,
      summary: `Graph proposal work needs human input before continuing: ${error.message}`
    };
  }

  return {
    proposal,
    extraction,
    summary: formatGraphProposalSummary(proposal, extraction)
  };
}

module.exports = {
  maybeHandleGraphChat
};
