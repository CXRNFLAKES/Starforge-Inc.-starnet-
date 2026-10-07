import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeComputeEconomy } from "../sidecar/governance/compute-economy.mjs";
import { makeMissionMemory } from "../sidecar/governance/mission-memory.mjs";
import { makeStarNetAdapter } from "../sidecar/governance/starnet-adapter.mjs";
import { makeStarForgeGovernanceHandler } from "../sidecar/governance/http.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function sessionDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "starforge-m3-"));
}

function liveStarNetRoster() {
  return [
    { id: "worker-m3", name: "M3 Worker", model: "test-model", provider: "test", capabilities: ["research"] },
  ];
}

function makeLiveStarNet() {
  return makeStarNetAdapter({
    roster: () => liveStarNetRoster(),
    dispatch: async () => ({ content: "completed", usage: { prompt_tokens: 1, completion_tokens: 1 } }),
  });
}

test("M3 runtime restart restores company, mission, memory, compute, and StarNet workforce", async () => {
  const root = sessionDir();
  const companyPath = path.join(root, "company.json");
  const memoryPath = path.join(root, "mission-memory.json");
  const computePath = path.join(root, "compute-economy.json");

  const firstCompany = makeCompany({ storagePath: companyPath });
  firstCompany.setMission(ROLES.CHO, {
    mission: "Build a persistent StarForge company",
    objective: "Prove runtime recovery",
  });
  firstCompany.recordFinanceEntry(ROLES.CHO, {
    id: "m3-capital",
    kind: "capital-injection",
    amount: 5000,
    currency: "EUR",
  });
  const objective = firstCompany.createObjective(ROLES.CHO, { title: "Persistent Operations" });
  const operations = makeOperations({ company: firstCompany });
  const project = operations.createProject(ROLES.CEO, {
    title: "M3 Recovery Mission",
    objectiveId: objective.id,
  });
  firstCompany.recordTask(ROLES.CEO, {
    id: "m3-task",
    projectId: project.id,
    title: "Recover after restart",
    assigneeId: "worker-m3",
    assigneeSource: "starnet",
    status: "completed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const memory1 = makeMissionMemory({ storagePath: memoryPath });
  memory1.record({
    mission: {
      id: "m3-mission",
      objective: "Recover after restart",
      requiredCapabilities: ["research"],
      complexity: "normal",
      risk: "low",
    },
    outcome: "completed",
    workers: liveStarNetRoster(),
    compute: { cents: 2, model: "test-model" },
    revenue: 125,
    lesson: "Verified completion survives runtime restart.",
  });

  const compute1 = makeComputeEconomy({ storagePath: computePath });
  const authorization = compute1.authorize({
    missionId: "m3-mission",
    workerId: "worker-m3",
    taskId: "m3-task",
    provider: "test",
    model: "test-model",
    estimatedCost: 0.02,
  });
  compute1.recordUsage({
    authorization,
    actualCost: 0.02,
    revenueUsd: 1.25,
    inputTokens: 1,
    outputTokens: 1,
  });

  const companyBefore = firstCompany.snapshot();
  const memoryBefore = memory1.snapshot();
  const computeBefore = compute1.snapshot();
  const workersBefore = await makeLiveStarNet().listWorkersAsync();

  assert.equal(firstCompany.persistence().enabled, true);
  assert.equal(memory1.persistence().enabled, true);
  assert.equal(compute1.persistence().enabled, true);
  assert.equal(fs.existsSync(companyPath), true);
  assert.equal(fs.existsSync(memoryPath), true);
  assert.equal(fs.existsSync(computePath), true);

  // Destroy the runtime objects. No in-memory objects from the first session are reused below.
  const secondCompany = makeCompany({ storagePath: companyPath });
  const memory2 = makeMissionMemory({ storagePath: memoryPath });
  const compute2 = makeComputeEconomy({ storagePath: computePath });
  const starNet2 = makeLiveStarNet();
  const workersAfter = await starNet2.listWorkersAsync();

  assert.deepEqual(secondCompany.snapshot(), companyBefore);
  assert.deepEqual(memory2.snapshot(), memoryBefore);
  assert.deepEqual(compute2.snapshot().ledger, computeBefore.ledger);
  assert.deepEqual(workersAfter.map(({ id, name, capabilities }) => ({ id, name, capabilities })),
    workersBefore.map(({ id, name, capabilities }) => ({ id, name, capabilities })));

  const restoredTask = secondCompany.snapshot().tasks.find((task) => task.id === "m3-task");
  assert.equal(restoredTask.status, "completed");
  assert.equal(restoredTask.assigneeSource, "starnet");
  assert.equal(secondCompany.capitalSnapshot(ROLES.CHO).netOperatingCapital, 5000);
  assert.equal(memory2.recall({ objective: "Recover after restart", capabilities: ["research"] })[0].lesson,
    "Verified completion survives runtime restart.");
  assert.equal(compute2.report({ missionId: "m3-mission" }).revenueUsd, 1.25);

  const handler = makeStarForgeGovernanceHandler({
    workspace: root,
    company: secondCompany,
    runtime: starNet2,
    roster: new Map(workersAfter.map((worker) => [worker.id, worker])),
  });
  let body = "";
  const res = { writeHead() {}, end(value) { body = value; } };
  await handler({ method: "GET", url: "/api/starforge/governance" }, res);
  const payload = JSON.parse(body);

  assert.equal(payload.capital.netOperatingCapital, 5000);
  assert.equal(payload.workforce.count, 1);
  assert.equal(payload.workforce.workers[0].id, "worker-m3");
  assert.equal(payload.workforce.workers[0].status, "idle");
  // The live StarNet adapter owns the worker runtime; restored governed company state owns
  // the persisted task ledger exposed by the HQ feed.
  assert.equal(payload.execution.completed, 1);
  assert.equal(payload.gameplay.projects[0].outcome, "completed");
  assert.equal(payload.gameplay.activity[0].taskId, "m3-task");

  fs.rmSync(root, { recursive: true, force: true });
});
