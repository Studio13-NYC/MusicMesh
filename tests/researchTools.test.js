const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  executeResearchTool,
  mergeGraph,
  toolDefinitions,
} = require("../src/researchTools");
test("tool contracts reject unknown tools and invalid arguments before database access", async () => {
  await assert.rejects(
    executeResearchTool("sql", { query: "delete from entities" }),
    /Unknown/,
  );
  await assert.rejects(
    executeResearchTool("graph", { action: "node", id: "" }),
    /identity/,
  );
  await assert.rejects(
    executeResearchTool("graph", { action: "search", query: "" }),
    /query/,
  );
  assert.ok(toolDefinitions.length < 12);
});
test("graph merge uses exact IDs and caps payloads without dangling edges", () => {
  const g = mergeGraph(null, {
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      { id: "ab", source: "a", target: "b" },
      { id: "bad", source: "a", target: "c" },
    ],
  });
  assert.equal(g.nodes.length, 2);
  assert.equal(g.edges.length, 1);
  assert.equal(g.meta.preview, false);
  assert.equal(mergeGraph(g, g).nodes.length, 2);
});
test("source availability reports setup requirements without pretending a connection", async () => {
  const r = await executeResearchTool("sources", { action: "list" });
  assert.match(r.data.find((s) => s.id === "roon").status, /requires/);
  assert.match(r.data.find((s) => s.id === "qobuz").status, /requires/);
});
test("research can prepare a missing typed factor and retrieve explicit preferences", () => {
  assert.ok(
    toolDefinitions.find((t) => t.name === "prepare_enrichment").parameters
      .properties.newFactor,
  );
  assert.ok(
    toolDefinitions
      .find((t) => t.name === "listening")
      .parameters.properties.group.enum.includes("preferences"),
  );
});
