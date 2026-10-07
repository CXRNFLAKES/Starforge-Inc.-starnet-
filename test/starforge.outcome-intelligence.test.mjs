import test from "node:test";
import assert from "node:assert/strict";
import { makeMissionMemory } from "../sidecar/governance/mission-memory.mjs";
import { makeOutcomeIntelligence } from "../sidecar/governance/outcome-intelligence.mjs";

test("outcome intelligence ranks verified historical strategies", () => {
  const memory = makeMissionMemory();
  memory.record({
    mission: { id: "m1", objective: "research and resell LEGO products", requiredCapabilities: ["research", "sales"] },
    outcome: "completed", workers: [{ id: "researcher-1", name: "Researcher", capabilities: ["research"] }],
    revenue: 250, lesson: "Research demand before execution.",
  });
  memory.record({
    mission: { id: "m2", objective: "research resale products", requiredCapabilities: ["research"] },
    outcome: "blocked", workers: [{ id: "researcher-2", name: "Researcher 2", capabilities: ["research"] }],
    lesson: "Research demand before execution.",
  });
  const intelligence = makeOutcomeIntelligence({ memory });
  const result = intelligence.analyze({
    objective: "research resale products",
    requiredCapabilities: ["research"],
    candidates: [{ id: "researcher-1", name: "Researcher" }, { id: "researcher-2", name: "Researcher 2" }],
  });
  assert.equal(result.evidenceCount, 2);
  assert.equal(result.strategies[0].strategy, "Research demand before execution.");
  assert.equal(result.strategies[0].verified, 1);
  assert.equal(result.strategies[0].revenue, 250);
  assert.equal(result.workerRankings[0].id, "researcher-1");
  assert.equal(result.rankedCandidates[0].candidate.id, "researcher-1");
});

test("outcome intelligence confidence is bounded by evidence", () => {
  const memory = makeMissionMemory();
  memory.record({
    mission: { id: "m1", objective: "sell products", requiredCapabilities: ["sales"] },
    outcome: "completed", lesson: "Validate demand first.",
  });
  const result = makeOutcomeIntelligence({ memory }).analyze({
    objective: "sell products",
    requiredCapabilities: ["sales"],
  });
  assert.equal(result.confidence, 0.2);
});

test("outcome intelligence fails closed without governed memory", () => {
  assert.throws(() => makeOutcomeIntelligence(), /requires governed mission memory/);
});
