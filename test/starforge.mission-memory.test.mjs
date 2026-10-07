import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { makeMissionMemory } from "../sidecar/governance/mission-memory.mjs";

function tempPath(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "starforge-memory-")), name);
}

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

test("persistent mission memory survives a new process instance", () => {
  const storagePath = tempPath("mission-memory.json");
  const first = makeMissionMemory({ storagePath });
  first.record({
    mission: { id: "persisted-1", objective: "resale research", requiredCapabilities: ["research"] },
    outcome: "completed",
    workers: [{ id: "worker-1", name: "Researcher", capabilities: ["research"] }],
    compute: { cents: 7, model: "free-model" },
    revenue: 125,
    lesson: "Research demand before execution.",
  });

  const second = makeMissionMemory({ storagePath });
  const recalled = second.recall({ objective: "resale research", capabilities: ["research"] });
  assert.equal(recalled.length, 1);
  assert.equal(recalled[0].id, "persisted-1");
  assert.equal(recalled[0].revenue, 125);
  assert.deepEqual(recalled[0].compute, { cents: 7, model: "free-model" });
  assert.deepEqual(recalled[0].workers, [{
    id: "worker-1",
    name: "Researcher",
    capabilities: ["research"],
  }]);
  assert.equal(second.persistence().enabled, true);
  assert.equal(second.persistence().path, path.resolve(storagePath));
});

test("persistent mission memory remains bounded on disk", () => {
  const storagePath = tempPath("bounded.json");
  const memory = makeMissionMemory({ maxEntries: 2, storagePath });
  for (let i = 1; i <= 4; i += 1) {
    memory.record({ mission: { id: "persist-" + i, objective: "mission " + i }, outcome: "completed" });
  }
  const persisted = JSON.parse(fs.readFileSync(storagePath, "utf8"));
  assert.equal(persisted.version, 1);
  assert.deepEqual(persisted.entries.map((entry) => entry.id), ["persist-4", "persist-3"]);
});

test("missing persistent mission memory starts clean", () => {
  const storagePath = tempPath("missing.json");
  const memory = makeMissionMemory({ storagePath });
  assert.deepEqual(memory.snapshot(), []);
  assert.equal(memory.persistence().enabled, true);
});

test("corrupt persistent mission memory fails closed", () => {
  const storagePath = tempPath("corrupt.json");
  fs.writeFileSync(storagePath, "{not-json", "utf8");
  assert.throws(() => makeMissionMemory({ storagePath }), /could not be read/);
});

test("non-persistent mission memory remains backward compatible", () => {
  const memory = makeMissionMemory();
  memory.record({ mission: { id: "memory-only", objective: "test" }, outcome: "completed" });
  assert.equal(memory.persistence().enabled, false);
  assert.equal(memory.snapshot()[0].id, "memory-only");
});
