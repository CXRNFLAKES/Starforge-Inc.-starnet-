import test from "node:test";
import assert from "node:assert/strict";
import { makeMissionLoop } from "../sidecar/governance/mission-loop.mjs";
import { makeMissionPlanner } from "../sidecar/governance/mission-planner.mjs";
import { makeMissionExecutor } from "../sidecar/governance/mission-executor.mjs";
import { makeOutcomeEvaluator } from "../sidecar/governance/outcome-evaluator.mjs";
import { makeWorkforceAllocator } from "../sidecar/governance/workforce-allocator.mjs";
import { makeStarNetAdapter } from "../sidecar/governance/starnet-adapter.mjs";
import { makeComputeEconomy } from "../sidecar/governance/compute-economy.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

test("governed multi-agent business mission dispatches specialist phases and completes only with verified revenue evidence", async () => {
  const dispatches = [];
  const workers = [
    { id: "research-1", name: "Research Specialist", capabilities: ["research"] },
    { id: "strategy-1", name: "Strategy Specialist", capabilities: ["strategy"] },
    { id: "execution-1", name: "Sales Specialist", capabilities: ["execution", "sales", "finance"] },
    { id: "verification-1", name: "Verification Specialist", capabilities: ["verification"] },
    { id: "overseer-1", name: "Overseer", capabilities: ["coordination"] },
  ];
  const starnet = makeStarNetAdapter({
    roster: () => workers,
    dispatch: async request => {
      const target = request.workers[0];
      dispatches.push(target);
      const results = {
        "research-1": { content: "Research evidence: demand and margin reviewed", success: true, verified: true },
        "strategy-1": { content: "Strategy evidence: viable offer and channel selected", success: true, verified: true },
        "execution-1": { content: "Sales evidence: orders completed; revenue reconciled", success: true, verified: true, revenueUsd: 250, usage: { inputTokens: 100, outputTokens: 40 } },
        "verification-1": { content: "Verification evidence: sales result and revenue receipt cross-checked", success: true, verified: true },
      };
      return results[target.agentId] ?? { content: "Unexpected worker", success: false, verified: false };
    },
  });
  const allocator = makeWorkforceAllocator({ starnet, protectedWorkerNames: ["Overseer"] });
  const planner = makeMissionPlanner({ workforceAllocator: allocator });
  const computeEconomy = makeComputeEconomy({
    budgets: { missionCents: 100, workerCents: 100, taskCents: 100 },
    providerStatuses: { apinex: "available" },
    router: { resolve: async request => ({ allowed: true, provider: request.provider, model: request.model, source: "starforge-governed-model-router" }) },
  });
  const executor = makeMissionExecutor({
    planner, allocator, starnet, computeEconomy,
    computeCandidates: [{ provider: "apinex", model: "free/integration-test", estimatedCost: 0, quality: 1 }],
  });
  const loop = makeMissionLoop({ planner, executor, evaluator: makeOutcomeEvaluator(), maxIterations: 2 });

  const result = await loop.run({
    objective: "research and sell products to generate 200 revenue",
    actor: ROLES.CHO,
    maxWorkers: 6,
    createMissing: false,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.decision.verified, true);
  assert.equal(result.decision.evidence.revenueVerified, true);
  assert.equal(result.execution.tasks.length, 4);
  assert.equal(dispatches.length, 4);
  assert.deepEqual(new Set(dispatches.map(item => item.agentId)), new Set(["research-1", "strategy-1", "execution-1", "verification-1"]));
  assert.equal(dispatches.some(item => item.agentId === "overseer-1"), false);
  assert.equal(result.execution.revenue, 250);
  assert.equal(result.execution.compute.length, 4);
  assert.equal(result.execution.compute.every(entry => entry.entry.actualCost === 0), true);
  assert.equal(result.history.length, 1);
});
