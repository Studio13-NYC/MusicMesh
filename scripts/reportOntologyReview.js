const { getDatabase, closeDatabase } = require("../src/postgres");
const { fromColumns } = require("../src/graphProperties");
const { validateEnv } = require("../src/env");
const filterCatalog = require("../ui/src/graph-demos/graphFilterCatalog.json");

const HIDDEN_GRAPH_NODE_LABELS = new Set([
  "GraphProposal",
  "ProposalItem",
  "ProposedEntity",
  "ProposedRelationship",
]);
const HIDDEN_GRAPH_RELATIONSHIP_TYPES = new Set([
  "HAS_ITEM",
  "PROPOSED_SOURCE",
  "PROPOSED_TARGET",
  "PROPOSED_RELATIONSHIP",
  "PROPOSES_CANON_MATCH",
]);
const HOUSEKEEPING_PROPERTY_KEYS = new Set([
  "canonicalStatus",
  "isProposed",
  "source",
  "threadId",
  "turnId",
  "lastChatThreadId",
  "lastChatTurnId",
  "lastChatSource",
  "proposalId",
  "candidateTempId",
  "reviewStatus",
  "matchedCanonId",
  "proposedLabelsJson",
  "propertiesJson",
  "relationshipType",
  "updatedAt",
  "confidenceScore",
  "evidenceBasis",
]);
const IDENTITY_PROPERTY_KEYS = new Set([
  "id",
  "name",
  "label",
  "title",
  "displayName",
  "fullName",
  "stageName",
  "canonicalName",
  "aliasesJson",
]);

function toNativeValue(value) {
  return value;
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

function shortValue(value) {
  const nativeValue = toNativeValue(value);
  const text =
    typeof nativeValue === "string" ? nativeValue : JSON.stringify(nativeValue);

  if (!text) {
    return "";
  }

  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

function labelsAreVisible(labels) {
  return !labels.some((label) => HIDDEN_GRAPH_NODE_LABELS.has(label));
}

function getNodeGroupId(labels) {
  for (const group of filterCatalog.nodeGroups) {
    if (group.id === "other") {
      continue;
    }

    if ((labels || []).some((label) => group.kinds.includes(label))) {
      return group.id;
    }
  }

  return "other";
}

function getRelationshipGroupId(type) {
  const normalized = stableString(type).toUpperCase();

  for (const group of filterCatalog.relationshipGroups) {
    if (group.id !== "other" && group.types.includes(normalized)) {
      return group.id;
    }
  }

  if (normalized.includes("MEMBER")) {
    return "membership";
  }

  if (normalized.includes("RELEASE") || normalized.includes("TRACK")) {
    return "releases";
  }

  if (normalized.includes("LABEL") || normalized.includes("RECORD")) {
    return "recording-label";
  }

  if (
    normalized.includes("PRODUC") ||
    normalized.includes("COLLAB") ||
    normalized.includes("PERFORM") ||
    normalized.includes("CREDIT") ||
    normalized.includes("CONTRIB") ||
    normalized.includes("HIRED")
  ) {
    return "production-collaboration";
  }

  if (
    normalized.includes("SCENE") ||
    normalized.includes("VENUE") ||
    normalized.includes("PLACE") ||
    normalized.includes("LOCATED") ||
    normalized.includes("FORMED") ||
    normalized.includes("ORIGIN") ||
    normalized.includes("WORKED_AT")
  ) {
    return "scene-place";
  }

  if (normalized.includes("GENRE") || normalized.includes("STYLE")) {
    return "genre-style";
  }

  if (
    normalized.includes("INSTRUMENT") ||
    normalized.includes("AMPLIFIER") ||
    normalized.includes("EQUIPMENT") ||
    normalized.includes("EFFECT") ||
    normalized.includes("CONSOLE") ||
    normalized.includes("MANUFACT")
  ) {
    return "instrument-gear";
  }

  if (
    normalized.includes("COVER") ||
    normalized.includes("VERSION") ||
    normalized.includes("MIX") ||
    normalized.includes("MASTER")
  ) {
    return "songs-versions";
  }

  if (
    normalized.includes("INFLUENCE") ||
    normalized.includes("RELATED") ||
    normalized.includes("SIMILAR") ||
    normalized.includes("PEER")
  ) {
    return "influence-related";
  }

  return "other";
}

function addPropertySample(map, key, sample) {
  if (!map.has(key)) {
    map.set(key, {
      key,
      count: 0,
      samples: [],
    });
  }

  const entry = map.get(key);
  entry.count += 1;

  if (entry.samples.length < 6 && sample.value) {
    entry.samples.push(sample);
  }
}

async function collectReview() {
  validateEnv();
  const { nodeRecords, relationshipPropertyRecords } =
    await getDatabase().$transaction(
      async (tx) => {
        const allNodes = await tx.entity.findMany();
        const names = new Map(
          allNodes.map((n) => [
            n.id,
            n.name ??
              n.label ??
              n.extra.title ??
              n.extra.displayName ??
              n.domainId ??
              n.id,
          ]),
        );
        return {
          nodeRecords: allNodes
            .map((n) => ({
              elementId: n.id,
              labels: n.labels,
              name: names.get(n.id),
              properties: fromColumns(n),
            }))
            .sort((a, b) =>
              a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
            ),
          relationshipPropertyRecords: (await tx.relationship.findMany()).map(
            (r) => ({
              type: r.type,
              source: names.get(r.sourceId),
              target: names.get(r.targetId),
              properties: fromColumns(r, true),
            }),
          ),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  const nodeCountRecord = { nodes: nodeRecords.length },
    relationshipCountRecord = {
      relationships: relationshipPropertyRecords.length,
    };
  const byType = new Map();
  for (const r of relationshipPropertyRecords) {
    if (!byType.has(r.type))
      byType.set(r.type, { type: r.type, count: 0, samples: [] });
    const group = byType.get(r.type);
    group.count++;
    if (group.samples.length < 6) group.samples.push(r);
  }
  const relationshipRecords = [...byType.values()].sort(
    (a, b) => b.count - a.count || a.type.localeCompare(b.type),
  );
  const nodes = nodeRecords
    .map((record) => ({
      elementId: stableString(record.elementId),
      labels: toNativeValue(record.labels) || [],
      name: stableString(record.name),
      properties: toNativeValue(record.properties) || {},
    }))
    .filter((node) => labelsAreVisible(node.labels));
  const otherNodes = nodes
    .map((node) => ({
      ...node,
      groupId: getNodeGroupId(node.labels),
    }))
    .filter((node) => node.groupId === "other");
  const nodeProperties = new Map();

  for (const node of nodes) {
    for (const [key, value] of Object.entries(node.properties)) {
      if (
        HOUSEKEEPING_PROPERTY_KEYS.has(key) ||
        IDENTITY_PROPERTY_KEYS.has(key)
      ) {
        continue;
      }

      addPropertySample(nodeProperties, key, {
        holder: node.name,
        labels: node.labels,
        value: shortValue(value),
      });
    }
  }

  const relationships = relationshipRecords
    .map((record) => ({
      type: stableString(record.type),
      count: Number(toNativeValue(record.count) || 0),
      samples: toNativeValue(record.samples) || [],
    }))
    .filter(
      (relationship) => !HIDDEN_GRAPH_RELATIONSHIP_TYPES.has(relationship.type),
    );
  const otherRelationships = relationships
    .map((relationship) => ({
      ...relationship,
      groupId: getRelationshipGroupId(relationship.type),
    }))
    .filter((relationship) => relationship.groupId === "other");
  const relationshipProperties = new Map();

  for (const record of relationshipPropertyRecords) {
    const type = stableString(record.type);

    if (HIDDEN_GRAPH_RELATIONSHIP_TYPES.has(type)) {
      continue;
    }

    const properties = toNativeValue(record.properties) || {};

    for (const [key, value] of Object.entries(properties)) {
      if (HOUSEKEEPING_PROPERTY_KEYS.has(key)) {
        continue;
      }

      addPropertySample(relationshipProperties, key, {
        relationshipType: type,
        source: stableString(record.source),
        target: stableString(record.target),
        value: shortValue(value),
      });
    }
  }

  return {
    database: new URL(process.env.DATABASE_URL).pathname.slice(1),
    generatedAt: new Date().toISOString(),
    totals: {
      nodes: Number(toNativeValue(nodeCountRecord.nodes) || 0),
      relationships: Number(
        toNativeValue(relationshipCountRecord.relationships) || 0,
      ),
    },
    otherNodes: otherNodes.map((node) => ({
      name: node.name,
      labels: node.labels,
      propertyKeys: Object.keys(node.properties).filter(
        (key) => !HOUSEKEEPING_PROPERTY_KEYS.has(key),
      ),
    })),
    otherRelationships: otherRelationships.map((relationship) => ({
      type: relationship.type,
      count: relationship.count,
      samples: relationship.samples.map((sample) => ({
        source: stableString(sample.source),
        target: stableString(sample.target),
      })),
    })),
    reviewableNodeProperties: [...nodeProperties.values()].sort((left, right) =>
      left.key.localeCompare(right.key),
    ),
    reviewableRelationshipProperties: [...relationshipProperties.values()].sort(
      (left, right) => left.key.localeCompare(right.key),
    ),
  };
}

function printReview(review) {
  console.log("Ontology review");
  console.log(`  generated: ${review.generatedAt}`);
  console.log(`  database: ${review.database}`);
  console.log(
    `  graph: ${review.totals.nodes} nodes / ${review.totals.relationships} relationships`,
  );
  console.log("");
  console.log(`Other node candidates: ${review.otherNodes.length}`);

  if (review.otherNodes.length === 0) {
    console.log("  none");
  } else {
    for (const node of review.otherNodes) {
      console.log(`  - ${node.name} [${node.labels.join(", ")}]`);
    }
  }

  console.log("");
  console.log(
    `Other relationship type candidates: ${review.otherRelationships.length}`,
  );

  if (review.otherRelationships.length === 0) {
    console.log("  none");
  } else {
    for (const relationship of review.otherRelationships) {
      const sample = relationship.samples[0];
      const example = sample
        ? `, e.g. ${sample.source} -> ${sample.target}`
        : "";
      console.log(`  - ${relationship.type}: ${relationship.count}${example}`);
    }
  }

  console.log("");
  console.log(
    `Reviewable node properties: ${review.reviewableNodeProperties.length}`,
  );

  if (review.reviewableNodeProperties.length === 0) {
    console.log("  none");
  } else {
    for (const property of review.reviewableNodeProperties) {
      const sample = property.samples[0];
      const example = sample ? `, e.g. ${sample.holder}=${sample.value}` : "";
      console.log(`  - ${property.key}: ${property.count}${example}`);
    }
  }

  console.log("");
  console.log(
    `Reviewable relationship properties: ${review.reviewableRelationshipProperties.length}`,
  );

  if (review.reviewableRelationshipProperties.length === 0) {
    console.log("  none");
  } else {
    for (const property of review.reviewableRelationshipProperties) {
      const sample = property.samples[0];
      const example = sample
        ? `, e.g. ${sample.source} -[${sample.relationshipType}]-> ${sample.target}: ${sample.value}`
        : "";
      console.log(`  - ${property.key}: ${property.count}${example}`);
    }
  }
}

async function main() {
  const review = await collectReview();

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(review, null, 2));
    return;
  }

  printReview(review);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
