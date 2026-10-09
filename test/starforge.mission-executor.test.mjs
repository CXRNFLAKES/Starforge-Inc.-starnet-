import test from "node:test";
import assert from "node:assert/strict";
import { makeMissionExecutor } from "../sidecar/governance/mission-executor.mjs";
import { makeMissionPlanner } from "../sidecar/governance/mission-planner.mjs";

function harness({ allocationStatus = "allocated" } = {}) {
  const planner = makeMissionPlanner();
  const allocations = [];
  const delegated = [];
  const allocator = {
    async allocate(request) {
      allocations.push(request);
      if (allocationStatus === "blocked") {
        return { status: "blocked", selected: [], created: [], missingCapabilities: ["research"] };
      }
      return {
        status: "allocated",
        selected: [
          { id: "research-1", name: "Researcher", capabilities: ["research"] },
          { id: "strategy-1", name: "Strategist", capabilities: ["strategy"] },
          { id: "sales-1", name: "Sales Executor", capabilities: ["sales", "execution"] },
          { id: "verify-1", name: "Verifier", capabilities: ["verification"] },
        ],
        created: [],
        protectedWorkers: [{ id: "ov", name: "Overseer", capabilities: ["coordination"] }],
      };
    },
  };
  const starnet = {
    async delegateTask(actor, task) {
      delegated.push({ actor, task });
      return {
        worker: { id: task.assigneeId, name: task.assigneeId, capabilities: [] },
        delegatedBy: actor,
        dispatchRequest: { workers: [{ agentId: task.assigneeId, prompt: task.prompt }], parallel: false },
        result: { content: "completed" },
      };
    },
  };
  return { planner, allocator, starnet, allocations, delegated };
}

test("mission executor turns an objective into governed StarNet tasks", async () => {
  const h = harness();
  const executor = makeMissionExecutor(h);
  const result = await executor.execute({
    objective: "research and sell products to make revenue",
    actor: "cho",
    maxWorkers: 5,
    createMissing: false,
  });

  assert.equal(result.status, "executed");
  assert.ok(result.mission.id);
  assert.equal(result.tasks.length, result.plan.phases.length);
  assert.equal(h.allocations[0].objective, result.mission.objective);
  assert.equal(h.allocations[0].maxWorkers, 5);
  assert.equal(h.delegated.length, result.tasks.length);
  assert.ok(h.delegated.every((call) => call.actor === "cho"));
  assert.ok(result.tasks.every((task) => task.missionId === result.mission.id));
});

test("mission executor fail-closes before dispatch when workforce allocation is blocked", async () => {
  const h = harness({ allocationStatus: "blocked" });
  const executor = makeMissionExecutor(h);
  const result = await executor.execute({ objective: "research resale opportunities" });

  assert.equal(result.status, "blocked");
  assert.equal(result.tasks.length, 0);
  assert.equal(h.delegated.length, 0);
});

test("mission executor routes phases to workers with matching capabilities", async () => {
  const h = harness();
  const executor = makeMissionExecutor(h);
  const result = await executor.execute({ objective: "research and sell products to make revenue" });

  const byPhase = new Map(result.tasks.map((task) => [task.title, task.assigneeId]));
  assert.equal(byPhase.get("Research and feasibility"), "research-1");
  assert.equal(byPhase.get("Strategy and plan"), "strategy-1");
  assert.equal(byPhase.get("Verification and outcome check"), "verify-1");
});

test("mission executor can request a governed verification re-plan", async () => {
  const h = harness();
  const executor = makeMissionExecutor(h);
  const mission = h.planner.intake({ objective: "research resale opportunities" });
  const plan = h.planner.plan(mission, { availableWorkers: [] });

  const result = await executor.verifyAndReplan({
    mission,
    plan,
    results: [{ success: false, verified: false }],
    availableWorkers: [],
  });

  assert.equal(result.status, "replan-required");
  assert.equal(result.unresolvedCount, 1);
  assert.equal(result.previousPlan.missionId, mission.id);
});
