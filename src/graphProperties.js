// Known domain and provenance fields are columns. Only additional, evolving
// ontology properties live in JSON. The API keeps its existing property shape.
const common = [
  "canonicalStatus",
  "isProposed",
  "source",
  "threadId",
  "turnId",
  "lastChatThreadId",
  "lastChatTurnId",
  "lastChatSource",
  "updatedAt",
  "confidenceScore",
  "evidenceBasis",
];
const entityFields = ["name", "label", "description", "aliasesJson", ...common];
const relationshipFields = [
  "year",
  "basis",
  "role",
  "foundingMember",
  "date",
  "performanceName",
  "format",
  "position",
  ...common,
];

function toColumns(properties, relationship = false) {
  const extra = { ...properties };
  const row = {};
  for (const key of relationship ? relationshipFields : entityFields) {
    row[key] = extra[key] ?? null;
    delete extra[key];
  }
  if (!relationship) {
    row.domainId = extra.id ?? null;
    delete extra.id;
  }
  row.extra = Object.fromEntries(
    Object.entries(extra).filter(([, v]) => v !== null && v !== undefined),
  );
  return row;
}

function fromColumns(row, relationship = false) {
  const properties = { ...(row.extra || {}) };
  for (const key of relationship ? relationshipFields : entityFields)
    if (row[key] !== null && row[key] !== undefined) properties[key] = row[key];
  if (!relationship && row.domainId !== null && row.domainId !== undefined)
    properties.id = row.domainId;
  return properties;
}

function entityRecord(row) {
  return {
    id: row.id,
    labels: row.labels,
    properties: fromColumns(row),
    degree: Number(row.degree || 0),
  };
}
function relationshipRecord(row) {
  return {
    id: row.id,
    source: row.sourceId,
    target: row.targetId,
    type: row.type,
    properties: fromColumns(row, true),
  };
}
function searchText(properties, id) {
  for (const key of [
    "name",
    "title",
    "displayName",
    "label",
    "fullName",
    "stageName",
    "canonicalName",
    "id",
  ])
    if (properties[key] !== null && properties[key] !== undefined)
      return String(properties[key]);
  return id;
}
module.exports = {
  toColumns,
  fromColumns,
  entityRecord,
  relationshipRecord,
  searchText,
};
