const { randomUUID } = require("node:crypto");
const { getDatabase } = require("./postgres");
const { toColumns, fromColumns, searchText } = require("./graphProperties");

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
  "Entity",
]);

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
  const candidates = [...(Array.isArray(labels) ? labels : []), type]
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
    updatedAt: context.now,
  };
}

function relationshipUpdateProperties(baseProperties, context) {
  const { canonicalStatus, isProposed, source, threadId, turnId, ...rest } =
    proposedProperties(baseProperties, context);

  return {
    ...rest,
    lastChatThreadId: threadId,
    lastChatTurnId: turnId,
    lastChatSource: source,
  };
}

function nodeUpdateProperties(baseProperties, context) {
  const { canonicalStatus, isProposed, source, threadId, turnId, ...rest } =
    proposedProperties(baseProperties, context);

  return {
    ...rest,
    lastChatThreadId: threadId,
    lastChatTurnId: turnId,
    lastChatSource: source,
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
  const database = getDatabase();
  const nodeWriteByTempId = new Map();
  const persistedNodes = [];
  const persistedRelationships = [];
  const skippedRelationships = [];

  await database.$transaction(
    async (tx) => {
      // Serialize graph merges across app instances without forbidding parallel imported edges.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(73130908)::text`;
      for (const node of nodes) {
        const tempId = stableString(node.tempId || node.id);
        const name = stableString(node.name || node.label);

        if (!tempId || !name) {
          continue;
        }

        const labels = normalizeNodeLabels(node.labels, node.type);
        const primaryLabel = labels[0];
        const nodeId =
          stableString(node.properties?.id || node.id) ||
          `chat-${primaryLabel.toLowerCase()}-${slugify(name)}`;
        const properties = proposedProperties(
          {
            ...(node.properties || {}),
            id: nodeId,
            name,
            label: name,
            aliasesJson: toJsonProperty(node.aliases || []),
            confidenceScore: node.confidenceScore ?? null,
            evidenceBasis: node.evidenceBasis || "assistant_answer",
          },
          context,
        );
        const updateProperties = nodeUpdateProperties(
          {
            ...(node.properties || {}),
            id: nodeId,
            name,
            label: name,
            aliasesJson: toJsonProperty(node.aliases || []),
            confidenceScore: node.confidenceScore ?? null,
            evidenceBasis: node.evidenceBasis || "assistant_answer",
          },
          context,
        );

        let row;
        if (node.matchedCanonId) {
          row = await tx.entity.findUnique({
            where: { id: node.matchedCanonId },
          });
          if (row)
            row = await tx.entity.update({
              where: { id: row.id },
              data: {
                lastChatThreadId: context.threadId || "",
                lastChatTurnId: context.turnId || "",
                updatedAt: now,
              },
            });
        } else {
          const matches = await tx.entity.findMany({
            where: { labels: { has: primaryLabel }, domainId: nodeId },
            orderBy: { id: "asc" },
          });
          for (const match of matches) {
            const merged = { ...fromColumns(match), ...updateProperties };
            const updated = await tx.entity.update({
              where: { id: match.id },
              data: {
                ...toColumns(merged),
                searchText: searchText(merged, match.id),
              },
            });
            row ||= updated;
          }
          if (!row) {
            const id = randomUUID();
            row = await tx.entity.create({
              data: {
                id,
                labels: [primaryLabel],
                primaryLabel,
                searchText: searchText(properties, id),
                ...toColumns(properties),
              },
            });
          }
        }
        const elementId = row?.id || "";

        if (!elementId) {
          continue;
        }

        nodeWriteByTempId.set(tempId, {
          tempId,
          elementId,
          id: nodeId,
          label: name,
          labels,
          action: node.matchedCanonId ? "matched" : "merged",
        });
        persistedNodes.push(nodeWriteByTempId.get(tempId));
      }

      for (const relationship of relationships) {
        const sourceRef = stableString(
          relationship.sourceRef || relationship.sourceId,
        );
        const targetRef = stableString(
          relationship.targetRef || relationship.targetId,
        );
        const sourceNode = nodeWriteByTempId.get(sourceRef);
        const targetNode = nodeWriteByTempId.get(targetRef);
        const relationshipType = sanitizeIdentifier(
          relationship.type,
          "RELATED_TO",
        ).toUpperCase();

        if (!sourceNode || !targetNode) {
          skippedRelationships.push({
            sourceRef,
            targetRef,
            type: relationshipType,
            reason: "Missing persisted source or target node.",
          });
          continue;
        }

        const properties = proposedProperties(
          {
            ...(relationship.properties || {}),
            confidenceScore: relationship.confidenceScore ?? null,
            evidenceBasis: relationship.evidenceBasis || "assistant_answer",
          },
          context,
        );
        const updateProperties = relationshipUpdateProperties(
          {
            ...(relationship.properties || {}),
            confidenceScore: relationship.confidenceScore ?? null,
            evidenceBasis: relationship.evidenceBasis || "assistant_answer",
          },
          context,
        );
        const matches = await tx.relationship.findMany({
          where: {
            sourceId: sourceNode.elementId,
            targetId: targetNode.elementId,
            type: relationshipType,
          },
          orderBy: { id: "asc" },
        });
        let persisted;
        for (const match of matches) {
          const updated = await tx.relationship.update({
            where: { id: match.id },
            data: toColumns(
              { ...fromColumns(match, true), ...updateProperties },
              true,
            ),
          });
          persisted ||= updated;
        }
        if (!persisted)
          persisted = await tx.relationship.create({
            data: {
              id: randomUUID(),
              sourceId: sourceNode.elementId,
              targetId: targetNode.elementId,
              type: relationshipType,
              ...toColumns(properties, true),
            },
          });
        persistedRelationships.push({
          elementId: persisted.id,
          type: relationshipType,
          sourceElementId: sourceNode.elementId,
          targetElementId: targetNode.elementId,
        });
      }
    },
    { timeout: 60000, maxWait: 15000 },
  );

  const anchorRef = stableString(
    groundedGraph?.anchor?.tempId || groundedGraph?.anchor?.id,
  );
  const anchorNode =
    nodeWriteByTempId.get(anchorRef) || persistedNodes[0] || null;

  return {
    persistedAt: now,
    anchor: anchorNode,
    persistedNodeCount: persistedNodes.length,
    persistedRelationshipCount: persistedRelationships.length,
    skippedRelationshipCount: skippedRelationships.length,
    persistedNodes,
    persistedRelationships,
    skippedRelationships,
  };
}

module.exports = {
  ALLOWED_NODE_LABELS,
  persistChatGraph,
  sanitizeIdentifier,
  stableString,
};
