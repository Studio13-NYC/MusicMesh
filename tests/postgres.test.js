const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { getDatabase, closeDatabase } = require("../src/postgres");
const { persistChatGraph } = require("../src/graphDomainWriter");
const { toColumns, fromColumns } = require("../src/graphProperties");
const store = require("../src/graphStore");
const demo = require("../src/graphDemoRepository");

const configured = process.env.MUSICMESH_TEST_DATABASE === "isolated";
after(closeDatabase);
test(
  "PostgreSQL graph persistence, isolation and traversal",
  { skip: !configured },
  async () => {
    const url = new URL(process.env.DATABASE_URL);
    assert.equal(
      url.hostname,
      "127.0.0.1",
      "Integration tests require the isolated local restoration database",
    );
    assert.equal(url.pathname, "/musicmesh_restore");
    const db = getDatabase();
    const marker = randomUUID();
    const ids = [];
    try {
      const groundedGraph = {
        nodes: [
          { tempId: "a", name: marker + " A", type: "Band" },
          { tempId: "b", name: marker + " B", type: "Person" },
        ],
        relationships: [
          {
            sourceRef: "b",
            targetRef: "a",
            type: "MEMBER_OF",
            properties: { year: 1980, role: "vocals" },
          },
        ],
      };
      const runs = await Promise.all(
        Array.from({ length: 3 }, () =>
          persistChatGraph({ groundedGraph, threadId: marker, turnId: "test" }),
        ),
      );
      ids.push(...runs[0].persistedNodes.map((n) => n.elementId));
      assert.equal(
        new Set(runs.flatMap((r) => r.persistedNodes.map((n) => n.elementId)))
          .size,
        2,
        "Concurrent merges must not duplicate entities",
      );
      assert.equal(
        new Set(
          runs.flatMap((r) => r.persistedRelationships.map((n) => n.elementId)),
        ).size,
        1,
        "Concurrent merges must not duplicate relationships",
      );
      const edge = await db.relationship.findUnique({
        where: { id: runs[0].persistedRelationships[0].elementId },
      });
      assert.equal(edge.sourceId, ids[1]);
      assert.equal(edge.targetId, ids[0]);
      assert.equal(edge.year, 1980);
      await db.entity.update({
        where: { id: ids[0] },
        data: {
          canonicalStatus: "canonical",
          isProposed: false,
          description: "Keep this description",
        },
      });
      await persistChatGraph({
        groundedGraph,
        threadId: marker,
        turnId: "second",
      });
      const kept = await db.entity.findUnique({ where: { id: ids[0] } });
      assert.equal(kept.canonicalStatus, "canonical");
      assert.equal(kept.isProposed, false);
      assert.equal(kept.description, "Keep this description");
      const matched = await persistChatGraph({
        groundedGraph: {
          nodes: [
            {
              tempId: "canon",
              name: "Do not rename canon",
              type: "Band",
              matchedCanonId: ids[0],
            },
          ],
        },
        threadId: marker,
        turnId: "matched",
      });
      assert.equal(matched.persistedNodeCount, 1);
      assert.equal(
        (await db.entity.findUnique({ where: { id: ids[0] } })).name,
        marker + " A",
      );
      const before = await db.entity.count();
      await assert.rejects(
        persistChatGraph({
          groundedGraph: {
            nodes: [
              { tempId: "ok", name: marker + " rollback", type: "Band" },
              {
                tempId: "bad",
                name: marker + " bad",
                type: "Band",
                properties: { description: { invalid: "typed text" } },
              },
            ],
          },
          threadId: marker,
        }),
      );
      assert.equal(
        await db.entity.count(),
        before,
        "A failed write rolls back the whole graph",
      );
      assert.equal(
        (
          await store.neighborhood([ids[0]], {
            depth: 3,
            pathLimit: 100,
            nodeLimit: 100,
            edgeLimit: 100,
          })
        ).relationships.length,
        1,
        "An edge cannot be reused to bounce through a path",
      );
      const third = randomUUID();
      ids.push(third);
      await db.entity.create({
        data: {
          id: third,
          labels: ["Band"],
          primaryLabel: "Band",
          searchText: marker + " C",
          ...toColumns({ name: marker + " C" }),
        },
      });
      await db.relationship.createMany({
        data: [
          { id: randomUUID(), sourceId: ids[0], targetId: third, type: "LINK" },
          { id: randomUUID(), sourceId: third, targetId: ids[1], type: "LINK" },
        ],
      });
      const cycle = await store.neighborhood([ids[0]], {
        depth: 3,
        pathLimit: 100,
        nodeLimit: 100,
        edgeLimit: 100,
      });
      assert.equal(cycle.nodes.length, 3);
      assert.deepEqual(cycle.nodes.map(n => n.id), [ids[0], ...[ids[1], third].sort()],
        "Neighbors at the same distance use stable ID order");
      const capped = await store.neighborhood([ids[0]], {depth:3,pathLimit:100,nodeLimit:2,edgeLimit:100});
      assert.deepEqual(capped.nodes.map(n=>n.id),cycle.nodes.slice(0,2).map(n=>n.id));
      assert.deepEqual(await store.neighborhood([ids[0]], {depth:3,pathLimit:100,nodeLimit:2,edgeLimit:100}), capped,
        "Repeated capped requests must choose the same nodes and edges");
      assert.equal(
        cycle.relationships.length,
        3,
        "Cycles retain each relationship once",
      );
      const one = await store.neighborhood([ids[0]], {
        depth: 1,
        pathLimit: 1,
        nodeLimit: 1,
        edgeLimit: 1,
      });
      assert.equal(one.nodes.length, 1);
      assert.equal(
        one.relationships.length,
        0,
        "Caps must not leave dangling edges",
      );
      assert.equal((await demo.searchGraphSeeds(marker)).length, 3);
      const hidden = randomUUID();
      ids.push(hidden);
      await db.entity.create({
        data: {
          id: hidden,
          labels: ["GraphProposal"],
          primaryLabel: "GraphProposal",
          searchText: marker + " Hidden",
          ...toColumns({ name: marker + " Hidden" }),
        },
      });
      assert.equal(
        (await demo.searchGraphSeeds(marker)).length,
        3,
        "Maintenance nodes remain hidden",
      );
      await assert.rejects(demo.getNodeDetail(hidden));
      assert.deepEqual(
        fromColumns(await db.entity.findUnique({ where: { id: ids[0] } }))
          .canonicalStatus,
        "canonical",
      );
    } finally {
      // Only fixtures created by this test; never clear the restored corpus.
      await db.relationship.deleteMany({
        where: { OR: [{ sourceId: { in: ids } }, { targetId: { in: ids } }] },
      });
      await db.entity.deleteMany({ where: { id: { in: ids } } });
    }
  },
);
