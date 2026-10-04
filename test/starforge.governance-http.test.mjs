import test from "node:test";
import assert from "node:assert/strict";
import { makeStarForgeGovernanceHandler } from "../sidecar/governance/http.mjs";

test("mobile governance bridge exposes read-only state", async () => {
  const handler = makeStarForgeGovernanceHandler({ workspace: ".starforge-test", roster: new Map([["worker-1", { name: "Worker 1" }]]), runsMeta: new Map([["run-1", { status: "working" }]]) });
  let status, body = "";
  const res = { writeHead(code) { status = code; }, end(value) { body = value; } };
  await handler({ method: "GET", url: "/api/starforge/governance" }, res);
  assert.equal(status, 200);
  const payload = JSON.parse(body);
  assert.equal(payload.ok, true);
  assert.equal(payload.readOnly, true);
  assert.equal(payload.workforce.count, 1);
  assert.equal(payload.activeRuns.length, 1);
  assert.equal(payload.execution.taskCount, 0);
  assert.equal(payload.execution.source, "starforge-governed-task-ledger");
});

test("mobile governance bridge rejects write methods", async () => {
  const handler = makeStarForgeGovernanceHandler({ workspace: ".starforge-test" });
  let status, body = "";
  const res = { writeHead(code) { status = code; }, end(value) { body = value; } };
  await handler({ method: "POST", url: "/api/starforge/governance" }, res);
  assert.equal(status, 405);
  assert.match(JSON.parse(body).error, /read-only/);
});


test('governance HTTP feed exposes bounded PA finance telemetry from the governed ledger', async () => {
  const workspace = '.starforge-test-finance';
  const { mkdir, writeFile, rm } = await import('node:fs/promises');
  await mkdir(workspace, { recursive: true });
  await writeFile(workspace + '/starforge.company.json', JSON.stringify({ finance: { currency: 'EUR', openingCapital: 1000, entries: [
    { id: 'rev', kind: 'revenue', amount: 500, currency: 'EUR' },
    { id: 'exp', kind: 'expense', amount: 100, currency: 'EUR' }
  ]}}));
  const handler = (await import('../sidecar/governance/http.js')).makeStarForgeGovernanceHandler({ workspace, roster: new Map(), runsMeta: new Map() });
  let body='';
  const res={writeHead(){},end(value){body=value;}};
  await handler({method:'GET',url:'/api/starforge/governance'},res);
  const payload=JSON.parse(body);
  assert.equal(payload.finance.netOperatingCapital,1400);
  assert.equal(payload.finance.recentEntries.length,2);
  await rm(workspace,{recursive:true,force:true});
});


test("governance feed derives live worker status from StarNet run metadata", async () => {
  const handler = makeStarForgeGovernanceHandler({
    workspace: ".starforge-test",
    roster: new Map([
      ["agent-1", { name: "Nova", model: "test-model" }],
      ["agent-2", { name: "Echo", model: "test-model" }],
    ]),
    runsMeta: new Map([
      ["run-1", { agentId: "agent-1", startedAt: 123, source: "interactive" }],
    ]),
  });
  let body = "";
  const res = { writeHead() {}, end(value) { body = value; } };
  await handler({ method: "GET", url: "/api/starforge/governance" }, res);
  const payload = JSON.parse(body);
  assert.equal(payload.workforce.source, "starnet-live-roster");
  assert.equal(payload.workforce.workers.find((worker) => worker.id === "agent-1").status, "working");
  assert.equal(payload.workforce.workers.find((worker) => worker.id === "agent-1").activeRun.id, "run-1");
  assert.equal(payload.workforce.workers.find((worker) => worker.id === "agent-2").status, "idle");
  assert.equal(payload.workforce.workers.find((worker) => worker.id === "agent-2").activeRun, null);
});


test("governance HTTP feed reads capital from the Company kernel when connected", async () => {
  const { makeCompany } = await import("../sidecar/governance/company.mjs");
  const { ROLES } = await import("../sidecar/governance/roles.mjs");
  const company = makeCompany();
  company.recordFinanceEntry(ROLES.CHO, {
    id: "capital-http-kernel-001",
    kind: "capital-injection",
    amount: 5000,
    currency: "EUR",
  });
  const handler = makeStarForgeGovernanceHandler({ workspace: ".starforge-http-kernel-test", company });
  let body = "";
  const res = { writeHead() {}, end(value) { body = value; } };
  await handler({ method: "GET", url: "/api/starforge/governance" }, res);
  const payload = JSON.parse(body);
  assert.equal(payload.capital.netOperatingCapital, 5000);
  assert.equal(payload.capital.source, "starforge-governed-company-ledger");
  assert.equal(payload.level.level, 10);
  assert.equal(payload.level.currentCapital, 5000);
  assert.equal(payload.finance.recentEntries[0].amount, 5000);
});



test("governance feed exposes objective progression separately from capital level", async () => {
  const { makeCompany } = await import("../sidecar/governance/company.mjs");
  const { makeOperations } = await import("../sidecar/governance/operations.mjs");
  const { ROLES } = await import("../sidecar/governance/roles.mjs");
  const company = makeCompany();
  const objective = company.createObjective(ROLES.CHO, { title: "Ship Product" });
  const project = makeOperations({ company }).createProject(ROLES.CEO, { title: "Launch", objectiveId: objective.id });
  company.recordTask(ROLES.CEO, { id: "objective-task-1", projectId: project.id, title: "Build", assigneeId: "starforge-ceo", status: "completed" });
  company.recordTask(ROLES.CEO, { id: "objective-task-2", projectId: project.id, title: "Fix", assigneeId: "starforge-ceo", status: "blocked" });
  company.recordFinanceEntry(ROLES.CHO, { id: "objective-capital-1", kind: "capital-injection", amount: 5000, currency: "EUR" });
  const handler = makeStarForgeGovernanceHandler({ workspace: ".starforge-objective-progress-test", company });
  let body = ""; const res = { writeHead() {}, end(value) { body = value; } };
  await handler({ method: "GET", url: "/api/starforge/governance" }, res);
  const payload = JSON.parse(body);
  const progress = payload.gameplay.objectiveProgress[0];
  assert.equal(progress.projectCount, 1);
  assert.equal(progress.taskCount, 2);
  assert.equal(progress.completed, 1);
  assert.equal(progress.blocked, 1);
  assert.equal(progress.progressPercent, 50);
  assert.equal(progress.companyXp, 75);
  assert.equal(progress.progressionSource, "starforge-governed-task-ledger");
  assert.equal(payload.level.level, 10);
  assert.equal(payload.level.currentCapital, 5000);
});

test("governance feed exposes company gameplay telemetry derived from governed tasks", async () => {
  const { makeCompany } = await import("../sidecar/governance/company.mjs");
  const { makeOperations } = await import("../sidecar/governance/operations.mjs");
  const { ROLES } = await import("../sidecar/governance/roles.mjs");
  const company = makeCompany();
  company.setMission(ROLES.CHO, { mission: "Build the company", objective: "Ship the first governed product" });
  const project = makeOperations({ company }).createProject(ROLES.CEO, { title: "Launch Product" });
  company.recordTask(ROLES.CEO, { id: "game-task-1", projectId: project.id, title: "Build", assigneeId: "starforge-ceo", status: "completed", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  company.recordTask(ROLES.CEO, { id: "game-task-2", projectId: project.id, title: "Fix", assigneeId: "starforge-ceo", status: "in-progress", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const handler = makeStarForgeGovernanceHandler({ workspace: ".starforge-gameplay-test", company });
  let body = ""; const res = { writeHead() {}, end(value) { body = value; } };
  await handler({ method: "GET", url: "/api/starforge/governance" }, res);
  const payload = JSON.parse(body);
  assert.equal(payload.gameplay.mission, "Build the company");
  assert.equal(payload.gameplay.objective, "Ship the first governed product");
  assert.equal(payload.gameplay.companyXp, 100);
  assert.equal(payload.gameplay.companyXpSource, "starforge-governed-task-ledger");
  assert.equal(payload.gameplay.projects[0].taskCount, 2);
  assert.equal(payload.gameplay.projects[0].completed, 1);
  assert.equal(payload.gameplay.projects[0].progressPercent, 50);
});
