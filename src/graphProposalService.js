const crypto = require("crypto");
const { validateEnv } = require("./env");
const {
  inspectSchema,
  lookupCanonEntities,
  stableString,
  traverseCanonNeighborhood
} = require("./graphCanonRepository");
const { createProposal, getProposal, listProposals, updateProposal } = require("./graphProposalStore");
const { applyApprovedProposal, persistProposalWorkspace } = require("./graphProposalWriter");

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
const DEFAULT_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT || "medium";

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function normalizeEntityInputs(entities) {
  return (Array.isArray(entities) ? entities : [])
    .map((entity) => {
      if (typeof entity === "string") {
        return {
          name: entity.trim(),
          type: "",
          note: ""
        };
      }

      return {
        name: stableString(entity.name || entity.label || entity.title),
        type: stableString(entity.type || entity.kind || entity.labelType),
        note: stableString(entity.note || entity.description || entity.context)
      };
    })
    .filter((entity) => entity.name);
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

async function callStructuredProposalModel({ entities, context, schema, canonLookups, traversal, evidence }) {
  const envResult = validateEnv();

  if (!envResult.isValid) {
    throw new Error("Graph proposal generation is missing required environment variables.");
  }

  const instructions = [
    "You are MusicMesh, an LLM-native music graph operator.",
    "Create a reviewable graph proposal, not canonical writes.",
    "Prefer existing labels, relationship types, and properties from the supplied schema.",
    "Use relationship properties for nuance such as role, capacity, confidence, degree, evidenceBasis, and sourceUrl.",
    "Return only valid JSON with keys candidateNodes, candidateRelationships, relationshipCompletionNotes, evidenceNotes.",
    "Each candidate node needs: tempId, name, labels, properties, rationale, confidenceScore.",
    "Each candidate relationship needs: tempId, sourceName, targetName, type, properties, rationale, confidenceScore, evidenceBasis."
  ].join("\n");
  const input = [
    {
      role: "user",
      content: JSON.stringify(
        {
          task: "Draft graph entities and relationships from the submitted entity list.",
          entities,
          context,
          schema,
          canonLookups,
          traversalSummary: {
            depth: traversal.depth,
            seedCount: traversal.seeds.length,
            bridgeNodes: traversal.bridgeNodes.slice(0, 20),
            relationshipTypeCounts: traversal.relationshipTypeCounts.slice(0, 20)
          },
          evidence
        },
        null,
        2
      )
    }
  ];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      instructions,
      input,
      reasoning: {
        effort: DEFAULT_REASONING_EFFORT
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `OpenAI graph proposal request failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ""}`
    );
  }

  const payload = await response.json();
  const text = getOutputText(payload);
  const parsed = parseJsonObject(text);

  if (!parsed) {
    throw new Error("OpenAI graph proposal response did not contain valid JSON.");
  }

  return {
    responseId: payload.id || null,
    draft: parsed
  };
}

async function fetchBraveEvidence(entities) {
  if (!process.env.BRAVE_API_KEY) {
    return {
      mode: "web_search",
      status: "skipped",
      reason: "BRAVE_API_KEY is not configured.",
      results: []
    };
  }

  const query = entities
    .slice(0, 6)
    .map((entity) => entity.name)
    .join(" ");
  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(`${query} music relationships credits`)}`,
    {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": process.env.BRAVE_API_KEY
      }
    }
  );

  if (!response.ok) {
    return {
      mode: "web_search",
      status: "failed",
      reason: `Brave search failed: ${response.status} ${response.statusText}`,
      results: []
    };
  }

  const payload = await response.json();

  return {
    mode: "web_search",
    status: "completed",
    query,
    results: (payload.web?.results || []).slice(0, 8).map((result) => ({
      title: result.title,
      url: result.url,
      description: result.description
    }))
  };
}

function fallbackDraftFromEntities(entities, canonLookups) {
  const candidateNodes = entities.map((entity, index) => {
    const lookup = canonLookups.find((entry) => entry.input.name === entity.name);
    const bestMatch = lookup?.matches?.[0] || null;

    return {
      tempId: `node-${index + 1}`,
      name: entity.name,
      labels: [entity.type || bestMatch?.kind || "Entity"],
      properties: {
        name: entity.name,
        sourceMode: "submitted_entity"
      },
      matchedCanonId: bestMatch?.matchRank === 0 ? bestMatch.id : null,
      duplicateCandidates: lookup?.matches || [],
      rationale: bestMatch
        ? "Created from submitted entity with canon lookup candidates."
        : "Created from submitted entity with no canon match.",
      confidenceScore: bestMatch?.matchRank === 0 ? 0.9 : 0.55
    };
  });

  return {
    responseId: null,
    draft: {
      candidateNodes,
      candidateRelationships: [],
      relationshipCompletionNotes: [
        "Fallback draft used because structured LLM generation was unavailable."
      ],
      evidenceNotes: []
    }
  };
}

function normalizeCandidateNodes(draftNodes, entities, canonLookups) {
  const nodes = Array.isArray(draftNodes) && draftNodes.length > 0 ? draftNodes : [];
  const seenNames = new Set();
  const normalizedNodes = nodes.map((node, index) => {
    const name = stableString(node.name || node.label || node.properties?.name) || `Candidate ${index + 1}`;
    const lookup = canonLookups.find(
      (entry) => entry.input.name.toLowerCase() === name.toLowerCase()
    );
    const exactMatch = lookup?.matches?.find((match) => match.matchRank === 0) || null;

    seenNames.add(name.toLowerCase());

    return {
      tempId: stableString(node.tempId) || `node-${index + 1}`,
      name,
      labels: Array.isArray(node.labels) && node.labels.length > 0 ? node.labels : [node.type || "Entity"],
      properties: {
        ...(node.properties || {}),
        name
      },
      matchedCanonId: stableString(node.matchedCanonId) || exactMatch?.id || null,
      duplicateCandidates: lookup?.matches || [],
      rationale: stableString(node.rationale) || "Generated from entity-list ingestion.",
      confidenceScore: Number.isFinite(Number(node.confidenceScore))
        ? Number(node.confidenceScore)
        : exactMatch
          ? 0.9
          : 0.6,
      reviewStatus: "pending"
    };
  });

  for (const entity of entities) {
    if (seenNames.has(entity.name.toLowerCase())) {
      continue;
    }

    const lookup = canonLookups.find((entry) => entry.input.name === entity.name);
    const exactMatch = lookup?.matches?.find((match) => match.matchRank === 0) || null;

    normalizedNodes.push({
      tempId: `node-${normalizedNodes.length + 1}`,
      name: entity.name,
      labels: [entity.type || exactMatch?.kind || "Entity"],
      properties: {
        name: entity.name,
        sourceMode: "submitted_entity"
      },
      matchedCanonId: exactMatch?.id || null,
      duplicateCandidates: lookup?.matches || [],
      rationale: "Added from submitted entity because it was missing from the LLM draft.",
      confidenceScore: exactMatch ? 0.9 : 0.55,
      reviewStatus: "pending"
    });
  }

  return normalizedNodes;
}

function nodeHasAnyLabel(node, labels) {
  const normalizedLabels = new Set((node.labels || []).map((label) => stableString(label).toLowerCase()));

  return labels.some((label) => normalizedLabels.has(label.toLowerCase()));
}

function chooseRelationshipEndpoint(candidates, relationshipType, endpointRole) {
  if (candidates.length <= 1) {
    return candidates[0] || null;
  }

  const type = stableString(relationshipType).toUpperCase();
  const preferenceMap = {
    MEMBER_OF: {
      source: [["Person"], ["Artist", "Band"]],
      target: [["Artist", "Band"]]
    },
    RELEASED_ALBUM: {
      source: [["Artist", "Band"]],
      target: [["Album"]]
    },
    RELEASED_ON: {
      source: [["Album"], ["Artist", "Band"]],
      target: [["Label", "RecordLabel"]]
    },
    SIGNED_TO: {
      source: [["Artist", "Band"]],
      target: [["Label", "RecordLabel"]]
    },
    PERFORMED_AT: {
      source: [["Artist", "Band"]],
      target: [["Venue"]]
    }
  };
  const preferences = preferenceMap[type]?.[endpointRole] || [];

  for (const labels of preferences) {
    const match = candidates.find((node) => nodeHasAnyLabel(node, labels));

    if (match) {
      return match;
    }
  }

  return candidates[0];
}

function normalizeCandidateRelationships(draftRelationships, candidateNodes) {
  const nodesByName = new Map();
  const nodesByTempId = new Map();

  for (const node of candidateNodes) {
    const nameKey = stableString(node.name).toLowerCase();

    if (nameKey) {
      nodesByName.set(nameKey, [...(nodesByName.get(nameKey) || []), node]);
    }

    if (node.tempId) {
      nodesByTempId.set(node.tempId, node);
    }
  }

  return (Array.isArray(draftRelationships) ? draftRelationships : []).map((relationship, index) => {
    const sourceName = stableString(relationship.sourceName || relationship.source);
    const targetName = stableString(relationship.targetName || relationship.target);
    const relationshipType = stableString(relationship.type).toUpperCase() || "RELATED_TO";
    const sourceNode =
      nodesByTempId.get(stableString(relationship.sourceRef)) ||
      chooseRelationshipEndpoint(nodesByName.get(sourceName.toLowerCase()) || [], relationshipType, "source");
    const targetNode =
      nodesByTempId.get(stableString(relationship.targetRef)) ||
      chooseRelationshipEndpoint(nodesByName.get(targetName.toLowerCase()) || [], relationshipType, "target");

    return {
      tempId: stableString(relationship.tempId) || `rel-${index + 1}`,
      sourceName,
      targetName,
      sourceRef: stableString(relationship.sourceRef) || sourceNode?.tempId || null,
      targetRef: stableString(relationship.targetRef) || targetNode?.tempId || null,
      sourceCanonId: stableString(relationship.sourceCanonId) || sourceNode?.matchedCanonId || null,
      targetCanonId: stableString(relationship.targetCanonId) || targetNode?.matchedCanonId || null,
      type: relationshipType,
      properties: relationship.properties || {},
      rationale: stableString(relationship.rationale) || "Generated from entity-list ingestion.",
      confidenceScore: Number.isFinite(Number(relationship.confidenceScore))
        ? Number(relationship.confidenceScore)
        : 0.55,
      evidenceBasis: stableString(relationship.evidenceBasis) || relationship.properties?.evidenceBasis || "model_knowledge",
      reviewStatus: "pending"
    };
  });
}

function buildCompletionFindings(traversal) {
  const findings = [];

  if (traversal.bridgeNodes.length > 0) {
    findings.push({
      type: "multi_hop_bridge_nodes",
      severity: "info",
      message: "Multi-hop traversal found existing bridge nodes that may deserve relationship proposals.",
      nodes: traversal.bridgeNodes.slice(0, 20)
    });
  }

  if (traversal.relationshipTypeCounts.length > 0) {
    findings.push({
      type: "relationship_type_patterns",
      severity: "info",
      message: "Traversal found nearby relationship types that should bias new proposal vocabulary.",
      relationshipTypeCounts: traversal.relationshipTypeCounts.slice(0, 20)
    });
  }

  return findings;
}

function buildProposalTitle(entities, context) {
  if (context?.title) {
    return stableString(context.title);
  }

  const names = entities.slice(0, 3).map((entity) => entity.name).join(", ");

  if (entities.length > 3) {
    return `Graph proposal for ${names}, and ${entities.length - 3} more`;
  }

  return `Graph proposal for ${names || "submitted entities"}`;
}

async function createGraphProposalFromEntities(requestBody) {
  const entities = normalizeEntityInputs(requestBody.entities);

  if (entities.length === 0) {
    throw new Error("Graph proposal requests require at least one entity.");
  }

  const context = requestBody.context || {};
  const evidenceMode = stableString(requestBody.evidenceMode || "model_knowledge");
  const traversalDepth = Math.min(3, Math.max(1, Number(requestBody.traversalDepth || 2)));
  const [schema, canonLookups, evidence] = await Promise.all([
    inspectSchema(),
    lookupCanonEntities(entities),
    evidenceMode === "web_search" ? fetchBraveEvidence(entities) : Promise.resolve({
      mode: "model_knowledge",
      status: "selected",
      results: []
    })
  ]);
  const matchedSeedIds = canonLookups
    .flatMap((lookup) => lookup.matches || [])
    .filter((match) => match.matchRank === 0)
    .map((match) => match.id);
  const traversal = await traverseCanonNeighborhood(matchedSeedIds, {
    depth: traversalDepth
  });
  let modelResult;

  try {
    modelResult = await callStructuredProposalModel({
      entities,
      context,
      schema,
      canonLookups,
      traversal,
      evidence
    });
  } catch (error) {
    modelResult = fallbackDraftFromEntities(entities, canonLookups);
    modelResult.generationWarning = error.message;
  }

  const candidateNodes = normalizeCandidateNodes(
    modelResult.draft.candidateNodes,
    entities,
    canonLookups
  );
  const candidateRelationships = normalizeCandidateRelationships(
    modelResult.draft.candidateRelationships,
    candidateNodes
  );
  const now = new Date().toISOString();
  const proposal = {
    id: createId("graph-proposal"),
    title: buildProposalTitle(entities, context),
    status: "draft",
    createdAt: now,
    updatedAt: now,
    entities,
    context,
    evidenceMode,
    model: DEFAULT_MODEL,
    responseId: modelResult.responseId,
    generationWarning: modelResult.generationWarning || null,
    canon: {
      schema,
      lookups: canonLookups,
      traversal
    },
    candidateNodes,
    candidateRelationships,
    completionFindings: [
      ...buildCompletionFindings(traversal),
      ...((modelResult.draft.relationshipCompletionNotes || []).map((note) => ({
        type: "llm_completion_note",
        severity: "info",
        message: stableString(note)
      })))
    ],
    evidence: {
      retrieval: evidence,
      notes: modelResult.draft.evidenceNotes || []
    },
    review: {
      approvedNodeCount: 0,
      approvedRelationshipCount: 0,
      rejectedNodeCount: 0,
      rejectedRelationshipCount: 0
    },
    workspacePersistence: null,
    applyResult: null
  };

  const createdProposal = await createProposal(proposal);
  const workspacePersistence = await persistProposalWorkspace(createdProposal);

  return updateProposal(createdProposal.id, (currentProposal) => ({
    ...currentProposal,
    workspacePersistence
  }));
}

function updateReviewStatus(items, decisions) {
  const decisionById = new Map(
    (Array.isArray(decisions) ? decisions : [])
      .filter((decision) => decision && decision.tempId)
      .map((decision) => [decision.tempId, decision])
  );

  return items.map((item) => {
    const decision = decisionById.get(item.tempId);

    if (!decision) {
      return item;
    }

    return {
      ...item,
      reviewStatus: decision.status || item.reviewStatus,
      reviewNote: stableString(decision.note) || item.reviewNote || ""
    };
  });
}

function countStatus(items, status) {
  return items.filter((item) => item.reviewStatus === status).length;
}

async function reviewGraphProposal(proposalId, body) {
  return updateProposal(proposalId, (proposal) => {
    const candidateNodes = updateReviewStatus(proposal.candidateNodes || [], body.nodes);
    const candidateRelationships = updateReviewStatus(
      proposal.candidateRelationships || [],
      body.relationships
    );

    return {
      ...proposal,
      status: "in_review",
      candidateNodes,
      candidateRelationships,
      review: {
        approvedNodeCount: countStatus(candidateNodes, "approved"),
        approvedRelationshipCount: countStatus(candidateRelationships, "approved"),
        rejectedNodeCount: countStatus(candidateNodes, "rejected"),
        rejectedRelationshipCount: countStatus(candidateRelationships, "rejected")
      }
    };
  });
}

async function applyGraphProposal(proposalId) {
  const proposal = await getProposal(proposalId);
  const applyResult = await applyApprovedProposal(proposal);

  return updateProposal(proposalId, (currentProposal) => ({
    ...currentProposal,
    status: "applied",
    applyResult
  }));
}

module.exports = {
  applyGraphProposal,
  createGraphProposalFromEntities,
  getProposal,
  listProposals,
  reviewGraphProposal
};
