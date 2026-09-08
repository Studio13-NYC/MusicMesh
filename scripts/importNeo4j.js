const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { getDatabase, closeDatabase } = require("../src/postgres");
const {
  toColumns,
  fromColumns,
  searchText,
} = require("../src/graphProperties");

function decode(value) {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    if (value.$neo4j === "Integer") {
      const n = Number(value.value);
      return Number.isSafeInteger(n) ? n : value.value;
    }
    if (value.$neo4j) return value.value;
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, decode(v)]),
    );
  }
  return value;
}
async function main() {
  if (!process.env.DIRECT_URL)
    throw new Error("Import requires DIRECT_URL (non-pooled).");
  process.env.DATABASE_URL = process.env.DIRECT_URL;
  if (!process.argv[2])
    throw new Error(
      "Usage: node --env-file=.env.migration scripts/importNeo4j.js <export-directory>",
    );
  const directory = path.resolve(process.argv[2]);
  const bytes = fs.readFileSync(path.join(directory, "neo4j-export.json"));
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, "manifest.json"), "utf8"),
  );
  const sourceHash = crypto.createHash("sha256").update(bytes).digest("hex");
  assert.equal(sourceHash, manifest.sha256, "Backup checksum mismatch");
  const source = decode(JSON.parse(bytes));
  assert.equal(source.formatVersion, 1);
  assert.equal(source.nodes.length, manifest.nodes);
  assert.equal(source.relationships.length, manifest.relationships);
  assert.equal(
    new Set(source.nodes.map((n) => n.id)).size,
    source.nodes.length,
  );
  assert.equal(
    new Set(source.relationships.map((r) => r.id)).size,
    source.relationships.length,
  );
  const db = getDatabase();
  // Each batch is atomic and restartable. Existing IDs are never overwritten:
  // full value comparison below rejects drift or conflicts instead.
  for (let i = 0; i < source.nodes.length; i += 100) {
    await db.entity.createMany({
      skipDuplicates: true,
      data: source.nodes
        .slice(i, i + 100)
        .map((n) => ({
          id: n.id,
          labels: n.labels,
          primaryLabel: n.labels[0] || "",
          searchText: searchText(n.properties, n.id),
          ...toColumns(n.properties),
        })),
    });
  }
  for (let i = 0; i < source.relationships.length; i += 100) {
    await db.relationship.createMany({
      skipDuplicates: true,
      data: source.relationships
        .slice(i, i + 100)
        .map((r) => ({
          id: r.id,
          sourceId: r.source,
          targetId: r.target,
          type: r.type,
          ...toColumns(r.properties, true),
        })),
    });
  }
  await db.$transaction(
    async (tx) => {
      const nodes = await tx.entity.findMany();
      const relationships = await tx.relationship.findMany();
      assert.equal(
        nodes.length,
        source.nodes.length,
        "Destination node count differs",
      );
      assert.equal(
        relationships.length,
        source.relationships.length,
        "Destination relationship count differs",
      );
      const nmap = new Map(nodes.map((n) => [n.id, n]));
      const rmap = new Map(relationships.map((r) => [r.id, r]));
      for (const n of source.nodes) {
        assert.deepEqual(
          nmap.get(n.id).labels,
          n.labels,
          `Labels differ: ${n.id}`,
        );
        assert.deepEqual(
          fromColumns(nmap.get(n.id)),
          n.properties,
          `Properties differ: ${n.id}`,
        );
      }
      for (const r of source.relationships) {
        const row = rmap.get(r.id);
        assert.deepEqual(
          {
            source: row.sourceId,
            target: row.targetId,
            type: row.type,
            properties: fromColumns(row, true),
          },
          {
            source: r.source,
            target: r.target,
            type: r.type,
            properties: r.properties,
          },
          `Relationship differs: ${r.id}`,
        );
      }
      await tx.importBatch.upsert({
        where: { sourceHash },
        create: {
          sourceHash,
          nodes: nodes.length,
          relationships: relationships.length,
        },
        update: {},
      });
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
  console.log(
    JSON.stringify({
      verified: true,
      sourceHash,
      nodes: source.nodes.length,
      relationships: source.relationships.length,
      comparison:
        "Every ID, label, endpoint, relationship type and property value",
    }),
  );
}
if (require.main === module)
  main()
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(closeDatabase);
module.exports = { decode };
