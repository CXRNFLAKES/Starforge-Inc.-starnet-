import test from "node:test";
import assert from "node:assert/strict";
import { makeMissionMemory } from "../sidecar/governance/mission-memory.mjs";

test("mission memory records outcomes and recalls relevant prior missions", () => {
  const memory = makeMissionMemory();
  memory.record({
    mission: { id: "m1", objective: "research resale products", requiredCapabilities: ["research"], risk: "low" },
    outcome: "completed",
    workers: [{ id: "r1", name: "Researcher", capabilities: ["research"] }],
    lesson: "Reuse research-first strategy.",
  });
  const recalled = memory.recall({ objective: "find resale products", capabilities: ["research"] });
  assert.equal(recalled.length, 1);
  assert.equal(recalled[0].id, "m1");
  assert.equal(recalled[0].lesson, "Reuse research-first strategy.");
});

test("mission memory bounds retained history", () => {
  const memory = makeMissionMemory({ maxEntries: 2 });
  for (let i = 1; i <= 3; i += 1) {
    memory.record({ mission: { id: "m" + i, objective: "mission " + i }, outcome: "completed" });
  }
  assert.equal(memory.snapshot().length, 2);
  assert.equal(memory.snapshot()[0].id, "m3");
});

test("mission memory exposes governed success statistics", () => {
  const memory = makeMissionMemory();
  memory.record({ mission: { id: "m1", objective: "a" }, outcome: "completed" });
  memory.record({ mission: { id: "m2", objective: "b" }, outcome: "replan-required" });
  const stats = memory.stats();
  assert.equal(stats.entries, 2);
  assert.equal(stats.completed, 1);
  assert.equal(stats.failedOrUnverified, 1);
  assert.equal(stats.successRate, 0.5);
});
