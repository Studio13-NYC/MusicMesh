const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  advanceState,
  newState,
  applyDecisionState,
} = require("../src/researchRunner");
const textResponse = (text) => ({
  id: "resp-test",
  output: [
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text }],
    },
  ],
  usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
});
test("simple answer takes one call, caps history and uses high Luna without preview chain", async () => {
  const state = newState({
    prompt: "hello",
    messages: Array.from({ length: 100 }, () => ({
      role: "user",
      content: "x".repeat(4000),
    })),
  });
  let calls = 0;
  const result = await advanceState(state, {
    respond: async (body) => {
      calls++;
      assert.equal(body.model, "gpt-6-luna");
      assert.equal(body.reasoning.effort, "high");
      assert.ok(JSON.stringify(body.input).length < 18000);
      return textResponse("Hello");
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "completed");
  assert.equal(result.message, "Hello");
  assert.equal(result.usage.total_tokens, 120);
  await advanceState(result, {
    respond: () => {
      throw Error("must not run again");
    },
  });
});
test("tool results render saved graph and continue next step; repeated reads are cached", async () => {
  let count = 0;
  const response = {
    id: "r",
    output: [
      {
        type: "function_call",
        call_id: "c",
        name: "graph",
        arguments: JSON.stringify({ action: "node", id: "a" }),
      },
    ],
    usage: { total_tokens: 10 },
  };
  let state = newState({ prompt: "where?" });
  const deps = {
    respond: async () => response,
    execute: async () => {
      count++;
      return {
        data: { country: "KR" },
        graph: { nodes: [{ id: "a" }], edges: [] },
      };
    },
  };
  state = await advanceState(state, deps);
  assert.equal(state.status, "running");
  assert.equal(state.graph.nodes[0].id, "a");
  state = await advanceState(state, deps);
  assert.equal(count, 1);
});
test("saved decision invalidates cached claim assessments", () => {
  const s = newState({ clientRequestId: "req-confidence-cache", prompt: "Review this claim" });
  s.status = "needs_input";
  s.decision = { id: "d", kind: "confidence", question: "Update confidence?", choices: [] };
  s.cache = { oldHistory: { revision: 1 } };
  const next = applyDecisionState(s, { decisionId: "d", choice: "approve" }, { confidenceRevision: 2 });
  assert.deepEqual(next.cache, {});
  assert.equal(s.cache.oldHistory.revision, 1);
});
test("decision supports defer and later approval; deny stops; stale choice fails", () => {
  const s = {
    ...newState({ prompt: "x" }),
    status: "needs_input",
    decision: {
      id: "d",
      kind: "clarification",
      choices: ["a", "b"],
      action: {},
    },
  };
  assert.equal(
    applyDecisionState(s, { decisionId: "d", choice: "defer" }).status,
    "deferred",
  );
  assert.throws(
    () => applyDecisionState(s, { decisionId: "wrong", choice: "approve" }),
    /decision/i,
  );
  assert.throws(
    () => applyDecisionState(s, { decisionId: "d", choice: "approve" }),
    /select/i,
  );
  assert.equal(
    applyDecisionState(s, { decisionId: "d", choice: "deny" }).status,
    "denied",
  );
  assert.equal(
    applyDecisionState(s, {
      decisionId: "d",
      choice: "approve",
      selection: "a",
    }).status,
    "running",
  );
});
test("tool budget terminates instead of endlessly traversing", async () => {
  const s = { ...newState({ prompt: "x" }), steps: 8 };
  const r = await advanceState(s, {
    respond: () => {
      throw Error("no call");
    },
  });
  assert.equal(r.status, "completed");
  assert.match(r.message, /limit/i);
});
test("last research step reserves a final evidence summary instead of another traversal", async () => {
  const s = { ...newState({ prompt: "Research producers" }), steps: 7 };
  const r = await advanceState(s, {
    respond: async (body) => {
      assert.equal(body.tool_choice, "none");
      return textResponse(
        "The retrieved recordings share producer X; coverage is limited.",
      );
    },
  });
  assert.equal(r.status, "completed");
  assert.match(r.message, /coverage/);
});
