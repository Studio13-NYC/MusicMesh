const neo4j = require("neo4j-driver");
const { validateEnv } = require("./env");

const ALLOWED_NODE_LABELS = new Set([
  "Artist",
  "Band",
  "Album",
  "Release",
  "Track",
  "Song",
  "Person",
  "Member",
  "Contributor",
  "Credit",
  "Contribution",
  "Producer",
  "Engineer",
  "RecordLabel",
  "Label",
  "Scene",
  "MusicScene",
  "Venue",
  "Genre",
  "Style",
  "Place",
  "City",
  "State",
  "Country",
  "Recording",
  "RecordingSession",
  "Session",
  "StudioEvent",
  "Work",
  "Composition",
  "Project",
  "ArtistProject",
  "Mix",
  "Master",
  "Stem",
  "Studio",
  "StudioRoom",
  "Room",
  "Instrument",
  "Equipment",
  "Amplifier",
  "Effect",
  "EffectsPedal",
  "Guitar",
  "Synthesizer",
  "Console",
  "SignalChain",
  "Manufacturer",
  "Company",
  "Technique",
  "Process",
  "Format",
  "Medium",
  "Technology",
  "Source",
  "Evidence",
  "Reference",
  "Entity"
]);

let driver = null;

function ensureDriver() {
  const envResult = validateEnv();

  if (!envResult.isValid) {
    throw new Error("Graph domain writer is missing required Neo4j environment variables.");
  }

  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI,
      neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
    );
  }

  return driver;
}

function createWriteSession() {
  return ensureDriver().session({
    database: process.env.NEO4J_DATABASE,
    defaultAccessMode: neo4j.session.WRITE
  });
}

function stableString(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function sanitizeIdentifier(value, fallback) {
  const normalized = stableString(value)
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^([^A-Za-z_])/, "_$1");

  return normalized || fallback;
}

function normalizeNodeLabels(labels, type) {
  const candidates = [
    ...(Array.isArray(labels) ? labels : []),
    type
  ]
    .map((label) => sanitizeIdentifier(label, "Entity"))
    .filter((label) => ALLOWED_NODE_LABELS.has(label));

  return candidates.length > 0 ? [...new Set(candidates)] : ["Entity"];
}

function slugify(value) {
  const slug = stableString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "entity";
}

function proposedProperties(baseProperties, context) {
  return {
    ...baseProperties,
    canonicalStatus: "proposed",
    isProposed: true,
    source: "chat",
    threadId: context.threadId || "",
    turnId: context.turnId || "",
    updatedAt: context.now
  };
}

function relationshipUpdateProperties(baseProperties, context) {
  const {
    canonicalStatus,
    isProposed,
    source,
    threadId,
    turnId,
    ...rest
  } = proposedProperties(baseProperties, context);

  return {
    ...rest,
    lastChatThreadId: threadId,
    lastChatTurnId: turnId,
    lastChatSource: source
  };
}

function nodeUpdateProperties(baseProperties, context) {
  const {
    canonicalStatus,
    isProposed,
    source,
    threadId,
    turnId,
    ...rest
  } = proposedProperties(baseProperties, context);

  return {
    ...rest,
    lastChatThreadId: threadId,
    lastChatTurnId: turnId,
    lastChatSource: source
  };
}

function toJsonProperty(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

async function persistChatGraph({ groundedGraph, threadId, turnId }) {
  const nodes = Array.isArray(groundedGraph?.nodes) ? groundedGraph.nodes : [];
  const relationships = Array.isArray(groundedGraph?.relationships)
    ? groundedGraph.relationships
    : [];
  const now = new Date().toISOString();
  const context = { threadId, turnId, now };
  const session = createWriteSession();
  const nodeWriteByTempId = new Map();
  const persistedNodes = [];
  const persistedRelationships = [];
  const skippedRelationships = [];

  try {
    await session.executeWrite(async (tx) => {
      for (const node of nodes) {
        const tempId = stableString(node.tempId || node.id);
        const name = stableString(node.name || node.label);

        if (!tempId || !name) {
          continue;
        }

        const labels = normalizeNodeLabels(node.labels, node.type);
        const primaryLabel = labels[0];
        const nodeId = stableString(node.properties?.id || node.id) ||
          `chat-${primaryLabel.toLowerCase()}-${slugify(name)}`;
        const properties = proposedProperties(
          {
            ...(node.properties || {}),
            id: nodeId,
            name,
            label: name,
            aliasesJson: toJsonProperty(node.aliases || []),
            confidenceScore: node.confidenceScore ?? null,
            evidenceBasis: node.evidenceBasis || "assistant_answer"
          },
          context
        );
        const updateProperties = nodeUpdateProperties(
          {
            ...(node.properties || {}),
            id: nodeId,
            name,
            label: name,
            aliasesJson: toJsonProperty(node.aliases || []),
            confidenceScore: node.confidenceScore ?? null,
            evidenceBasis: node.evidenceBasis || "assistant_answer"
          },
          context
        );

        let result;

        if (node.matchedCanonId) {
          result = await tx.run(
            `
              MATCH (n)
              WHERE elementId(n) = $matchedCanonId
              SET n.lastChatThreadId = $threadId,
                  n.lastChatTurnId = $turnId,
                  n.updatedAt = $now
              RETURN elementId(n) AS elementId
            `,
            {
              matchedCanonId: node.matchedCanonId,
              threadId: context.threadId || "",
              turnId: context.turnId || "",
              now
            }
          );
        } else {
          result = await tx.run(
            `
              MERGE (n:${primaryLabel} {id: $id})
              ON CREATE SET n += $properties
              ON MATCH SET n += $updateProperties
              RETURN elementId(n) AS elementId
            `,
            {
              id: nodeId,
              properties,
              updateProperties
            }
          );
        }

        const record = result.records[0];
        const elementId = record ? stableString(record.get("elementId")) : "";

        if (!elementId) {
          continue;
        }

        nodeWriteByTempId.set(tempId, {
          tempId,
          elementId,
          id: nodeId,
          label: name,
          labels,
          action: node.matchedCanonId ? "matched" : "merged"
        });
        persistedNodes.push(nodeWriteByTempId.get(tempId));
      }

      for (const relationship of relationships) {
        const sourceRef = stableString(relationship.sourceRef || relationship.sourceId);
        const targetRef = stableString(relationship.targetRef || relationship.targetId);
        const sourceNode = nodeWriteByTempId.get(sourceRef);
        const targetNode = nodeWriteByTempId.get(targetRef);
        const relationshipType = sanitizeIdentifier(relationship.type, "RELATED_TO").toUpperCase();

        if (!sourceNode || !targetNode) {
          skippedRelationships.push({
            sourceRef,
            targetRef,
            type: relationshipType,
            reason: "Missing persisted source or target node."
          });
          continue;
        }

        const properties = proposedProperties(
          {
            ...(relationship.properties || {}),
            confidenceScore: relationship.confidenceScore ?? null,
            evidenceBasis: relationship.evidenceBasis || "assistant_answer"
          },
          context
        );
        const updateProperties = relationshipUpdateProperties(
          {
            ...(relationship.properties || {}),
            confidenceScore: relationship.confidenceScore ?? null,
            evidenceBasis: relationship.evidenceBasis || "assistant_answer"
          },
          context
        );
        const result = await tx.run(
          `
            MATCH (source), (target)
            WHERE elementId(source) = $sourceElementId AND elementId(target) = $targetElementId
            MERGE (source)-[relationship:${relationshipType}]->(target)
            ON CREATE SET relationship += $properties
            ON MATCH SET relationship += $updateProperties
            RETURN elementId(relationship) AS elementId
          `,
          {
            sourceElementId: sourceNode.elementId,
            targetElementId: targetNode.elementId,
            properties,
            updateProperties
          }
        );
        const record = result.records[0];

        persistedRelationships.push({
          elementId: record ? stableString(record.get("elementId")) : "",
          type: relationshipType,
          sourceElementId: sourceNode.elementId,
          targetElementId: targetNode.elementId
        });
      }
    });
  } finally {
    await session.close();
  }

  const anchorRef = stableString(groundedGraph?.anchor?.tempId || groundedGraph?.anchor?.id);
  const anchorNode = nodeWriteByTempId.get(anchorRef) || persistedNodes[0] || null;

  return {
    persistedAt: now,
    anchor: anchorNode,
    persistedNodeCount: persistedNodes.length,
    persistedRelationshipCount: persistedRelationships.length,
    skippedRelationshipCount: skippedRelationships.length,
    persistedNodes,
    persistedRelationships,
    skippedRelationships
  };
}

module.exports = {
  ALLOWED_NODE_LABELS,
  persistChatGraph,
  sanitizeIdentifier,
  stableString
};
