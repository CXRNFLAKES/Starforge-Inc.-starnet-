import test from "node:test";
import assert from "node:assert/strict";
import { makeMissionLoop } from "../sidecar/governance/mission-loop.mjs";

function makeHarness(memory = null, decision = { status: "complete", verified: true, reason: "done" }) {
  const calls = { plan: null, evaluate: null };
  const planner = {
    intake(input) {
      return {
        id: "m1",
        objective: input.objective,
        requiredCapabilities: ["research"],
      };
    },
    plan(mission, options) {
      calls.plan = { mission, options };
      return { phases: [{ name: "research" }] };
    },
  };
  const executor = {
    async execute() {
      return {
        status: "completed",
        tasks: [{
          worker: { id: "w1", name: "Researcher", capabilities: ["research"] },
        }],
        compute: { cents: 4 },
      };
    },
    async verifyAndReplan() {
      return { nextPlan: { phases: [{ name: "retry" }] } };
    },
  };
  const evaluator = {
    async evaluate(input) {
      calls.evaluate = input;
      return decision;
    },
  };
  return {
    loop: makeMissionLoop({ planner, executor, evaluator, memory, maxIterations: 1 }),
    calls,
  };
}

test("mission loop recalls prior learning and exposes it to planning and evaluation", async () => {
  const recalled = [{
    id: "prior",
    objective: "research resale products",
    lesson: "Reuse research-first strategy.",
  }];
  const memory = {
    recall(input) {
      assert.equal(input.objective, "research resale products");
      assert.deepEqual(input.capabilities, ["research"]);
      return recalled;
    },
    record() {},
  };
  const { loop, calls } = makeHarness(memory);
  const result = await loop.run({ objective: "research resale products" });
  assert.deepEqual(calls.plan.options.priorLearning, recalled);
  assert.deepEqual(calls.evaluate.priorLearning, recalled);
  assert.deepEqual(result.priorLearning, recalled);
});

test("mission loop records verified completion in mission memory", async () => {
  const records = [];
  const memory = {
    recall() { return []; },
    record(entry) { records.push(entry); },
  };
  const { loop } = makeHarness(memory);
  await loop.run({ objective: "complete mission" });
  assert.equal(records.length, 1);
  assert.equal(records[0].outcome, "completed");
  assert.equal(records[0].mission.id, "m1");
  assert.equal(records[0].workers[0].id, "w1");
  assert.equal(records[0].compute.cents, 4);
  assert.equal(records[0].lesson.includes("Verified completion"), true);
});

test("mission loop records blocked outcomes as unverified", async () => {
  const records = [];
  const memory = {
    recall() { return []; },
    record(entry) { records.push(entry); },
  };
  const { loop } = makeHarness(memory, { status: "blocked", verified: false, reason: "risk escalation" });
  const result = await loop.run({ objective: "blocked mission" });
  assert.equal(result.status, "blocked");
  assert.equal(records[0].outcome, "blocked");
  assert.equal(records[0].decision.verified, false);
  assert.equal(records[0].lesson, "risk escalation");
});

test("mission loop records replan exhaustion as unverified", async () => {
  const records = [];
  const memory = {
    recall() { return []; },
    record(entry) { records.push(entry); },
  };
  const { loop } = makeHarness(memory, { status: "replan", verified: false, reason: "try another strategy" });
  const result = await makeMissionLoop({
    planner: {
      intake() { return { id: "m2", objective: "replan mission", requiredCapabilities: [] }; },
      plan() { return { phases: [{ name: "research" }] }; },
    },
    executor: {
      async execute() { return { status: "completed", tasks: [] }; },
      async verifyAndReplan() { return { nextPlan: { phases: [{ name: "retry" }] } }; },
    },
    evaluator: {
      async evaluate() { return { status: "replan", verified: false, reason: "try another strategy" }; },
    },
    memory,
    maxIterations: 1,
  }).run({ objective: "replan mission" });
  assert.equal(result.status, "replan-exhausted");
  assert.equal(records[0].outcome, "replan-exhausted");
  assert.equal(records[0].decision.reason, "try another strategy");
});

test("mission loop remains backward compatible without memory", async () => {
  const { loop } = makeHarness();
  const result = await loop.run({ objective: "no memory mission" });
  assert.equal(result.status, "completed");
  assert.equal(result.priorLearning, undefined);
});
