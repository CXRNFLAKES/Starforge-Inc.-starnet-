import test from "node:test";
import assert from "node:assert/strict";
import { makeMissionMemory } from "../sidecar/governance/mission-memory.mjs";
import { makeOutcomeIntelligence } from "../sidecar/governance/outcome-intelligence.mjs";
import { makeMissionPlanner } from "../sidecar/governance/mission-planner.mjs";
import { makeMissionLoop } from "../sidecar/governance/mission-loop.mjs";

test("mission planner uses sufficiently confident outcome evidence to rank workers", () => {
  const memory = makeMissionMemory();
  memory.record({
    mission: { id: "m1", objective: "research resale products", requiredCapabilities: ["research"] },
    outcome: "completed",
    workers: [{ id: "proven", name: "Proven Researcher", capabilities: ["research"] }],
    lesson: "Research demand first.",
  });
  const intelligence = makeOutcomeIntelligence({ memory });
  const planner = makeMissionPlanner();
  const mission = planner.intake({ objective: "research resale products" });
  const evidence = intelligence.analyze({
    objective: mission.objective,
    requiredCapabilities: mission.requiredCapabilities,
    candidates: [
      { id: "proven", capabilities: ["research"] },
      { id: "new", capabilities: ["research"] },
    ],
  });
  const plan = planner.plan(mission, {
    availableWorkers: [
      { id: "new", capabilities: ["research"] },
      { id: "proven", capabilities: ["research"] },
    ],
    outcomeEvidence: evidence,
  });
  assert.equal(plan.workerCandidates[0].id, "proven");
  assert.ok(plan.workerCandidates[0].historicalEvidenceScore > 0);
});

test("low-confidence outcome evidence cannot override worker capability or high-risk governance", () => {
  const planner = makeMissionPlanner();
  const mission = planner.intake({ objective: "large financial investment" });
  const plan = planner.plan(mission, {
    availableWorkers: [
      { id: "unproven", capabilities: ["strategy", "finance", "verification"] },
      { id: "capable", capabilities: ["strategy", "finance", "verification", "research"] },
    ],
    outcomeEvidence: {
      confidence: 0.2,
      workerRankings: [{ id: "unproven", score: 999 }],
    },
  });
  assert.equal(plan.requiresEscalation, true);
  assert.equal(plan.workerCandidates[0].historicalEvidenceScore, 0);
});

test("autonomous mission loop carries outcome intelligence into planning and execution", async () => {
  const memory = makeMissionMemory();
  memory.record({
    mission: { id: "m1", objective: "research resale products", requiredCapabilities: ["research"] },
    outcome: "completed",
    workers: [{ id: "proven", name: "Proven", capabilities: ["research"] }],
    lesson: "Research demand first.",
  });
  const intelligence = makeOutcomeIntelligence({ memory });
  let plannedEvidence = null;
  let executedEvidence = null;
  const planner = makeMissionPlanner();
  const originalPlan = planner.plan;
  const wrappedPlanner = {
    intake: planner.intake,
    plan: (mission, options) => {
      plannedEvidence = options.outcomeEvidence;
      return originalPlan(mission, options);
    },
  };
  const executor = {
    async execute(input) {
      executedEvidence = input.outcomeEvidence;
      return { status: "executed", tasks: [{ success: true, worker: { id: "proven", capabilities: ["research"] } }] };
    },
    async verifyAndReplan() {
      return { nextPlan: { phases: [{ id: "verification", title: "Verify", capability: "verification" }] } };
    },
  };
  const evaluator = { async evaluate() { return { status: "complete", verified: true, reason: "verified" }; } };
  const result = await makeMissionLoop({
    planner: wrappedPlanner,
    executor,
    evaluator,
    memory,
    outcomeIntelligence: intelligence,
  }).run({ objective: "research resale products", availableWorkers: [{ id: "proven", capabilities: ["research"] }] });
  assert.equal(result.status, "completed");
  assert.equal(plannedEvidence.confidence, 0.2);
  assert.equal(executedEvidence.confidence, 0.2);
});
