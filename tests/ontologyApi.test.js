const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { startServer } = require("../src/server");
const { getOntology } = require("../src/domain");

test("local HTTP ontology returns the domain definitions without database or model calls", async () => {
  const server = startServer(0);
  try {
    if (!server.listening) await once(server, "listening");
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ontology`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), getOntology());
    const invalid=await fetch(`http://127.0.0.1:${server.address().port}/api/graph/evidence?kind=blob&id=any&field=rawProvider`);
    assert.equal(invalid.status,400);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});
