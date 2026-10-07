import test from "node:test";
import assert from "node:assert/strict";
import { makeMissionLoop } from "../sidecar/governance/mission-loop.mjs";

function makeHarness() {
  const mission = {
    id: "mission-1",
    objective: "make 2000 by next month with no starting capital",
    constraints: ["no starting capital"],
    deadline: "next month",
    requiredCapabilities: ["research"],
    risk: "medium",
    complexity: "moderate",
  };
  let plans = 0;
  let executions = 0;
  let replans = 0;
  const planner = {
    intake() { return structuredClone(mission); },
    plan(current) {
      plans += 1;
      return { id: `plan-${plans}`, missionId: current.id, phases: [{ title: "Research", requiredCapabilities: ["research"] }] };
    },
  };
  const executor = {
    async execute(input) {
      executions += 1;
      assert.equal(input.mission.id, mission.id);
      return {
        status: "executed",
        mission: input.mission,
        plan: input.plan,
        tasks: [{ id: `task-${executions}`, success: executions >= 2 }],
      };
    },
    async verifyAndReplan(input) {
      replans += 1;
      assert.equal(input.mission.id, mission.id);
      return {
        mission: input.mission,
        previousPlan: input.plan,
        status: "replan-required",
        nextPlan: planner.plan(input.mission),
      };
    },
  };
  return { mission, planner, executor, counters: () => ({ plans, executions, replans }) };
}

test("mission loop reuses one governed mission and completes after verified progress", async () => {
  const h = makeHarness();
  const loop = makeMissionLoop({
    planner: h.planner,
    executor: h.executor,
    evaluator: { evaluate: async ({ execution }) => execution.tasks[0].success
      ? { status: "complete", verified: true, evidence: { source: "task-result" } }
      : { status: "replan", reason: "initial result did not satisfy verification" } },
    maxIterations: 3,
  });

  const result = await loop.run({ objective: h.mission.objective });
  assert.equal(result.status, "completed");
  assert.equal(result.mission.id, "mission-1");
  assert.equal(result.iteration, 2);
  assert.equal(result.history.length, 2);
  assert.equal(h.counters().replans, 1);
});

test("mission loop fails closed when replanning limit is exhausted", async () => {
  const h = makeHarness();
  const loop = makeMissionLoop({
    planner: h.planner,
    executor: h.executor,
    evaluator: { evaluate: async () => ({ status: "replan", reason: "no verified progress" }) },
    maxIterations: 2,
  });

  const result = await loop.run({ objective: h.mission.objective });
  assert.equal(result.status, "replan-exhausted");
  assert.equal(result.iteration, 2);
  assert.equal(result.history.length, 2);
  assert.equal(h.counters().replans, 1);
});

test("mission loop rejects an invalid evaluator decision", async () => {
  const h = makeHarness();
  const loop = makeMissionLoop({
    planner: h.planner,
    executor: h.executor,
    evaluator: { evaluate: async () => ({ status: "maybe" }) },
  });

  await assert.rejects(() => loop.run({ objective: h.mission.objective }), /complete, replan, or blocked/);
});

test("mission loop returns blocked without autonomous retry", async () => {
  const h = makeHarness();
  const loop = makeMissionLoop({
    planner: h.planner,
    executor: {
      ...h.executor,
      async execute(input) {
        return { status: "blocked", mission: input.mission, plan: input.plan, reason: "worker lifecycle unavailable" };
      },
    },
    evaluator: { evaluate: async () => ({ status: "complete", verified: true }) },
  });

  const result = await loop.run({ objective: h.mission.objective });
  assert.equal(result.status, "blocked");
  assert.equal(result.iteration, 1);
  assert.equal(result.history.length, 0);
});
