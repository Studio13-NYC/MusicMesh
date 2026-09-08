// Read-only source capture. Never mutates Neo4j; output is private and gitignored.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const neo4j = require("neo4j-driver");
require("../src/env").validateEnv();

function encode(value) {
  if (neo4j.isInt(value)) return { $neo4j: "Integer", value: value.toString() };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") {
    if (value.constructor !== Object) {
      return {
        $neo4j: value.constructor.name,
        value: value.toString(),
        fields: Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, encode(v)]),
        ),
      };
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, encode(v)]),
    );
  }
  return value;
}

async function main() {
  const destination = path.resolve(
    process.argv[2] ||
      path.join(
        __dirname,
        "../output/migration",
        new Date().toISOString().replace(/[:.]/g, "-"),
      ),
  );
  fs.mkdirSync(destination, { recursive: true });
  const file = path.join(destination, "neo4j-export.json");
  if (fs.existsSync(file))
    throw new Error("Export already exists; choose a fresh directory.");
  const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD),
  );
  const session = driver.session({
    database: process.env.NEO4J_DATABASE,
    defaultAccessMode: neo4j.session.READ,
  });
  try {
    const capturedAt = new Date().toISOString();
    const data = await session.executeRead(async (tx) => {
      const read = async (q) =>
        encode((await tx.run(q)).records.map((r) => r.toObject()));
      return {
        nodes: await read(
          "MATCH (n) RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS properties ORDER BY id",
        ),
        relationships: await read(
          "MATCH (s)-[r]->(t) RETURN elementId(r) AS id, elementId(s) AS source, elementId(t) AS target, type(r) AS type, properties(r) AS properties ORDER BY id",
        ),
        indexes: await read("SHOW INDEXES"),
        constraints: await read("SHOW CONSTRAINTS"),
        components: await read("CALL dbms.components()"),
      };
    });
    const ids = new Set(data.nodes.map((n) => n.id));
    if (
      data.relationships.some((r) => !ids.has(r.source) || !ids.has(r.target))
    )
      throw new Error("Dangling export endpoints; retry capture.");
    const payload = JSON.stringify(
      {
        formatVersion: 1,
        capturedAt,
        database: process.env.NEO4J_DATABASE,
        consistency:
          "Single read transaction; final cutover still requires a write freeze and fresh comparison.",
        ...data,
      },
      null,
      2,
    );
    fs.writeFileSync(file, payload, { flag: "wx" });
    const hash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(file))
      .digest("hex");
    fs.writeFileSync(
      path.join(destination, "manifest.json"),
      JSON.stringify(
        {
          file: "neo4j-export.json",
          sha256: hash,
          nodes: data.nodes.length,
          relationships: data.relationships.length,
          capturedAt,
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
    console.log(
      JSON.stringify({
        destination,
        sha256: hash,
        nodes: data.nodes.length,
        relationships: data.relationships.length,
        labels: [...new Set(data.nodes.flatMap((n) => n.labels))],
        relationshipTypes: [...new Set(data.relationships.map((r) => r.type))],
        propertyKeys: [
          ...new Set(data.nodes.flatMap((n) => Object.keys(n.properties))),
        ],
        indexes: data.indexes,
        constraints: data.constraints,
      }),
    );
  } finally {
    await session.close();
    await driver.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
