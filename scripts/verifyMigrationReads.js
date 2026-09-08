const fs = require("node:fs");
const assert = require("node:assert/strict");
const demo = require("../src/graphDemoRepository");
const canon = require("../src/graphCanonRepository");
const { closeDatabase } = require("../src/postgres");
async function main() {
  if (!process.argv[2])
    throw new Error("Supply the saved source queries.json file");
  const baseline = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const timings = [];
  for (const [q, expected] of Object.entries(baseline.search)) {
    const start = performance.now();
    assert.deepEqual(
      await demo.searchGraphSeeds(q),
      expected,
      `Search differs: ${q}`,
    );
    timings.push({
      query: q,
      durationMs: Math.round(performance.now() - start),
    });
  }
  for (const [id, expected] of Object.entries(baseline.details))
    assert.deepEqual(
      await demo.getNodeDetail(id),
      expected,
      `Detail differs: ${id}`,
    );
  assert.deepEqual(
    await canon.lookupCanonEntities(baseline.lookup.map((r) => r.input)),
    baseline.lookup,
    "Canonical lookup differs",
  );
  console.log(
    JSON.stringify({
      verified: true,
      searchCases: timings.length,
      detailCases: Object.keys(baseline.details).length,
      lookupCases: baseline.lookup.length,
      timings,
    }),
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
