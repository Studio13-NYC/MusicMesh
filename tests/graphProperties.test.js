const { test } = require("node:test");
const assert = require("node:assert/strict");
const { toColumns, fromColumns } = require("../src/graphProperties");
test("Entity import preserves provenance, identifiers and evolving property values", () => {
  const source = {
    id: "chat-band-rem",
    name: "R.E.M.",
    description: "Band",
    aliasesJson: '["REM"]',
    isProposed: false,
    confidenceScore: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    threadId: "original",
    newProperty: ["a", "b"],
  };
  const row = toColumns(source);
  assert.equal(row.domainId, source.id);
  assert.equal(row.name, source.name);
  assert.deepEqual(row.extra, { newProperty: ["a", "b"] });
  assert.deepEqual(fromColumns(row), source);
});
test("Relationship properties retain false, zero, empty strings and exact dates", () => {
  const source = {
    year: 1980,
    foundingMember: false,
    position: 0,
    role: "",
    date: "1980-04-05",
    canonicalStatus: "canonical",
    evidenceBasis: "source",
    since: "1980–2011",
  };
  assert.deepEqual(fromColumns(toColumns(source, true), true), source);
});
