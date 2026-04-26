const neo4j = require("neo4j-driver");
const { validateEnv } = require("./env");

let driver = null;

function ensureDriver() {
  const envResult = validateEnv();

  if (!envResult.isValid) {
    throw new Error("Graph proposal writer is missing required Neo4j environment variables.");
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

function normalizeNodeId(candidateNode) {
  const explicitId = stableString(candidateNode.properties?.id || candidateNode.id || candidateNode.tempId);

  if (explicitId) {
    return explicitId;
  }

  return `proposal-node-${stableString(candidateNode.name || candidateNode.label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function approvedItems(items) {
  return (items || []).filter((item) => item.reviewStatus === "approved");
}

function proposalItemId(proposalId, tempId) {
  return `${proposalId}:${tempId}`;
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

async function persistProposalWorkspace(proposal) {
  const session = createWriteSession();
  const persistedNodes = [];
  const persistedRelationships = [];
  const skippedRelationships = [];
  const now = new Date().toISOString();

  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `
          MERGE (proposal:GraphProposal {id: $proposalId})
          SET proposal += {
            name: $title,
            title: $title,
            status: $status,
            canonicalStatus: "proposed",
            source: "MusicMesh graph proposal",
            updatedAt: $now
          }
        `,
        {
          proposalId: proposal.id,
          title: proposal.title,
          status: proposal.status,
          now
        }
      );

      for (const node of proposal.candidateNodes || []) {
        const itemId = proposalItemId(proposal.id, node.tempId);
        const properties = {
          id: itemId,
          name: stableString(node.name) || itemId,
          proposalId: proposal.id,
          candidateTempId: node.tempId,
          canonicalStatus: "proposed",
          reviewStatus: node.reviewStatus || "pending",
          matchedCanonId: node.matchedCanonId || "",
          proposedLabelsJson: toJsonProperty(node.labels || []),
          propertiesJson: toJsonProperty(node.properties || {}),
          rationale: node.rationale || "",
          confidenceScore: node.confidenceScore ?? null,
          updatedAt: now
        };

        await tx.run(
          `
            MATCH (proposal:GraphProposal {id: $proposalId})
            MERGE (item:ProposalItem:ProposedEntity {id: $itemId})
            SET item += $properties
            MERGE (proposal)-[:HAS_ITEM]->(item)
          `,
          {
            proposalId: proposal.id,
            itemId,
            properties
          }
        );

        if (node.matchedCanonId) {
          await tx.run(
            `
              MATCH (item:ProposalItem:ProposedEntity {id: $itemId})
              MATCH (canon)
              WHERE elementId(canon) = $canonElementId
              MERGE (item)-[:PROPOSES_CANON_MATCH]->(canon)
            `,
            {
              itemId,
              canonElementId: node.matchedCanonId
            }
          );
        }

        persistedNodes.push({
          tempId: node.tempId,
          id: itemId,
          matchedCanonId: node.matchedCanonId || null
        });
      }

      const proposedEntityIds = new Set(
        (proposal.candidateNodes || []).map((node) => node.tempId).filter(Boolean)
      );

      for (const relationship of proposal.candidateRelationships || []) {
        if (
          !relationship.sourceRef ||
          !relationship.targetRef ||
          !proposedEntityIds.has(relationship.sourceRef) ||
          !proposedEntityIds.has(relationship.targetRef)
        ) {
          skippedRelationships.push({
            tempId: relationship.tempId,
            reason: "Missing source or target proposed entity item."
          });
          continue;
        }

        const relationshipItemId = proposalItemId(proposal.id, relationship.tempId);
        const sourceItemId = proposalItemId(proposal.id, relationship.sourceRef);
        const targetItemId = proposalItemId(proposal.id, relationship.targetRef);
        const proposedType = sanitizeIdentifier(relationship.type, "RELATED_TO").toUpperCase();
        const relationshipName = `${relationship.sourceName || relationship.sourceRef} ${proposedType} ${relationship.targetName || relationship.targetRef}`;
        const properties = {
          id: relationshipItemId,
          name: relationshipName,
          proposalId: proposal.id,
          candidateTempId: relationship.tempId,
          canonicalStatus: "proposed",
          reviewStatus: relationship.reviewStatus || "pending",
          proposedType,
          sourceName: relationship.sourceName || "",
          targetName: relationship.targetName || "",
          propertiesJson: toJsonProperty(relationship.properties || {}),
          rationale: relationship.rationale || "",
          confidenceScore: relationship.confidenceScore ?? null,
          evidenceBasis: relationship.evidenceBasis || "",
          updatedAt: now
        };

        await tx.run(
          `
            MATCH (proposal:GraphProposal {id: $proposalId})
            MATCH (source:ProposalItem:ProposedEntity {id: $sourceItemId})
            MATCH (target:ProposalItem:ProposedEntity {id: $targetItemId})
            MERGE (item:ProposalItem:ProposedRelationship {id: $relationshipItemId})
            SET item += $properties
            MERGE (proposal)-[:HAS_ITEM]->(item)
            MERGE (item)-[:PROPOSED_SOURCE]->(source)
            MERGE (item)-[:PROPOSED_TARGET]->(target)
            MERGE (source)-[edge:PROPOSED_RELATIONSHIP]->(target)
            SET edge += {
              proposalId: $proposalId,
              candidateTempId: $relationshipTempId,
              proposedType: $proposedType,
              canonicalStatus: "proposed",
              reviewStatus: $reviewStatus,
              confidenceScore: $confidenceScore,
              evidenceBasis: $evidenceBasis,
              updatedAt: $now
            }
          `,
          {
            proposalId: proposal.id,
            sourceItemId,
            targetItemId,
            relationshipItemId,
            relationshipTempId: relationship.tempId,
            proposedType,
            reviewStatus: relationship.reviewStatus || "pending",
            confidenceScore: relationship.confidenceScore ?? null,
            evidenceBasis: relationship.evidenceBasis || "",
            now,
            properties
          }
        );

        persistedRelationships.push({
          tempId: relationship.tempId,
          id: relationshipItemId,
          proposedType,
          sourceItemId,
          targetItemId
        });
      }
    });
  } finally {
    await session.close();
  }

  return {
    persistedAt: now,
    proposalNodeId: proposal.id,
    persistedNodeCount: persistedNodes.length,
    persistedRelationshipCount: persistedRelationships.length,
    skippedRelationshipCount: skippedRelationships.length,
    persistedNodes,
    persistedRelationships,
    skippedRelationships
  };
}

async function applyApprovedProposal(proposal) {
  const approvedNodes = approvedItems(proposal.candidateNodes);
  const approvedRelationships = approvedItems(proposal.candidateRelationships);
  const approvedNodeTempIds = new Set(approvedNodes.map((node) => node.tempId).filter(Boolean));
  const session = createWriteSession();
  const appliedNodes = [];
  const skippedRelationships = [];
  const appliedRelationships = [];

  try {
    await session.executeWrite(async (tx) => {
      for (const node of approvedNodes) {
        if (node.matchedCanonId) {
          appliedNodes.push({
            tempId: node.tempId,
            elementId: node.matchedCanonId,
            action: "reused"
          });
          continue;
        }

        const labels = Array.isArray(node.labels) && node.labels.length > 0 ? node.labels : [node.type || "Entity"];
        const safeLabels = labels.map((label) => sanitizeIdentifier(label, "Entity"));
        const primaryLabel = safeLabels[0] || "Entity";
        const nodeId = normalizeNodeId(node);
        const properties = {
          ...(node.properties || {}),
          id: nodeId,
          name: stableString(node.name || node.label || node.properties?.name) || nodeId,
          proposalSourceId: proposal.id
        };
        const cypher = `
          MERGE (n:${primaryLabel} {id: $id})
          SET n += $properties
          RETURN elementId(n) AS elementId
        `;
        const result = await tx.run(cypher, {
          id: nodeId,
          properties
        });
        const record = result.records[0];

        appliedNodes.push({
          tempId: node.tempId,
          id: nodeId,
          elementId: record ? record.get("elementId") : null,
          action: "merged"
        });
      }

      const nodeElementIdByTempId = new Map(
        appliedNodes
          .filter((node) => node.tempId && node.elementId)
          .map((node) => [node.tempId, node.elementId])
      );

      for (const relationship of approvedRelationships) {
        if (
          (relationship.sourceRef && !approvedNodeTempIds.has(relationship.sourceRef)) ||
          (relationship.targetRef && !approvedNodeTempIds.has(relationship.targetRef))
        ) {
          skippedRelationships.push({
            tempId: relationship.tempId,
            reason: "Source or target candidate node was not approved."
          });
          continue;
        }

        const sourceElementId =
          relationship.sourceCanonId || nodeElementIdByTempId.get(relationship.sourceRef);
        const targetElementId =
          relationship.targetCanonId || nodeElementIdByTempId.get(relationship.targetRef);

        if (!sourceElementId || !targetElementId) {
          skippedRelationships.push({
            tempId: relationship.tempId,
            reason: "Missing approved source or target node."
          });
          continue;
        }

        const relationshipType = sanitizeIdentifier(relationship.type, "RELATED_TO").toUpperCase();
        const properties = {
          ...(relationship.properties || {}),
          proposalSourceId: proposal.id,
          confidenceScore: relationship.confidenceScore ?? relationship.properties?.confidenceScore ?? null,
          evidenceBasis: relationship.evidenceBasis || relationship.properties?.evidenceBasis || "proposal_review"
        };
        const cypher = `
          MATCH (source), (target)
          WHERE elementId(source) = $sourceElementId AND elementId(target) = $targetElementId
          MERGE (source)-[relationship:${relationshipType}]->(target)
          SET relationship += $properties
          RETURN elementId(relationship) AS elementId
        `;
        const result = await tx.run(cypher, {
          sourceElementId,
          targetElementId,
          properties
        });
        const record = result.records[0];

        appliedRelationships.push({
          tempId: relationship.tempId,
          elementId: record ? record.get("elementId") : null,
          type: relationshipType
        });
      }
    });
  } finally {
    await session.close();
  }

  return {
    appliedAt: new Date().toISOString(),
    appliedNodes,
    appliedRelationships,
    skippedRelationships
  };
}

module.exports = {
  applyApprovedProposal,
  persistProposalWorkspace
};
