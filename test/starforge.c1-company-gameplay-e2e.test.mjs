import test from "node:test";
import assert from "node:assert/strict";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { makeStarForgeGovernanceHandler } from "../sidecar/governance/http.mjs";
import { companyLevelTelemetry } from "../sidecar/governance/capital-level.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

async function readGovernance(handler) {
  let body = "";
  let status = 0;
  const res = { writeHead(code) { status = code; }, end(value) { body = value; } };
  await handler({ method: "GET", url: "/api/starforge/governance" }, res);
  return { status, payload: JSON.parse(body) };
}

function makeStarNet() {
  const calls = [];
  return {
    calls,
    listWorkersAsync: async () => [{ id: "worker-1", name: "Mission Worker", model: "live-model" }],
    delegateTask: async (_role, payload) => {
      calls.push(payload);
      return { worker: { id: "worker-1", name: "Mission Worker" }, result: { content: "APINEX_OK" } };
    },
  };
}

test("C1 wires the existing company, StarNet, APInex governance, finance, progression, and HQ feed", async () => {
  const company = makeCompany();
  const starnet = makeStarNet();
  const modelCalls = [];
  const modelRouter = {
    resolve: async request => {
      modelCalls.push(request);
      return { allowed: true, provider: "apinex", model: "free/gpt-5.6-luna", free: true, source: "starforge-governed-model-router" };
    },
  };

  company.setMission(ROLES.CHO, { mission: "Build the company", objective: "Ship the first governed product" });
  const objective = company.createObjective(ROLES.CHO, { title: "Ship the first governed product" });
  const operations = makeOperations({ company, starnet, modelRouter });
  const project = operations.createProject(ROLES.CEO, { title: "Launch governed product", objectiveId: objective.id });

  const execution = await operations.delegateToStarNet(ROLES.CEO, {
    projectId: project.id,
    title: "Execute governed APInex mission",
    assigneeId: "worker-1",
    successCriteria: "Return APINEX_OK",
    provider: "apinex",
    model: "free/gpt-5.6-luna",
  });

  assert.equal(execution.result.content, "APINEX_OK");
  assert.equal(execution.task.status, "completed");
  assert.equal(execution.task.execution.modelRoute.provider, "apinex");
  assert.equal(execution.task.execution.modelRoute.model, "free/gpt-5.6-luna");
  assert.deepEqual(modelCalls, [{ provider: "apinex", model: "free/gpt-5.6-luna" }]);
  assert.equal(starnet.calls.length, 1);
  assert.equal(starnet.calls[0].context.modelRoute.model, "free/gpt-5.6-luna");

  // Finance remains governed state; C1 proves the existing execution result can feed it
  // without inventing a hidden financial side effect inside the execution adapter.
  company.recordFinanceEntry(ROLES.CHO, {
    id: "c1-revenue-001", kind: "revenue", amount: 5000, currency: "EUR",
    source: "governed-mission-result", taskId: execution.task.id,
  });

  const handler = makeStarForgeGovernanceHandler({
    workspace: ".starforge-c1-test",
    company,
    roster: new Map([["worker-1", { name: "Mission Worker", model: "live-model" }]]),
    runsMeta: new Map(),
  });
  const { status, payload } = await readGovernance(handler);

  assert.equal(status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.connection.executionSource, "starforge-governed-task-ledger");
  assert.equal(payload.workforce.source, "starnet-live-roster");
  assert.equal(payload.execution.completed, 1);

  const objectiveProgress = payload.gameplay.objectiveProgress.find(item => item.id === objective.id);
  assert.ok(objectiveProgress);
  assert.equal(objectiveProgress.projectCount, 1);
  assert.equal(objectiveProgress.taskCount, 1);
  assert.equal(objectiveProgress.completed, 1);
  assert.equal(objectiveProgress.progressPercent, 100);
  assert.equal(objectiveProgress.companyXp, 100);

  const projectProgress = payload.gameplay.projects.find(item => item.id === project.id);
  assert.ok(projectProgress);
  assert.equal(projectProgress.taskCount, 1);
  assert.equal(projectProgress.completed, 1);
  assert.equal(projectProgress.outcome, "completed");

  assert.equal(payload.gameplay.companyXp, 100);
  assert.equal(payload.gameplay.activity[0].taskId, execution.task.id);
  assert.equal(payload.gameplay.activity[0].xpDelta, 100);
  assert.equal(payload.finance.revenue, 5000);
  assert.equal(payload.finance.netOperatingCapital, 5000);
  assert.equal(payload.capital.netOperatingCapital, 5000);
  assert.equal(payload.level.level, companyLevelTelemetry(5000).level);
  assert.equal(payload.level.source, "starforge-governed-company-ledger");
});

test("C1 fails closed before StarNet execution when APInex model governance rejects the model", async () => {
  const company = makeCompany();
  const starnet = makeStarNet();
  let dispatchCount = 0;
  starnet.delegateTask = async () => { dispatchCount += 1; return { result: { content: "SHOULD_NOT_RUN" } }; };
  const operations = makeOperations({
    company, starnet,
    modelRouter: { resolve: async () => { throw new Error("model router rejected unavailable model: free/not-available"); } },
  });
  const project = operations.createProject(ROLES.CEO, { title: "Rejected APInex mission" });

  await assert.rejects(
    () => operations.delegateToStarNet(ROLES.CEO, {
      projectId: project.id, title: "Reject before dispatch", assigneeId: "worker-1",
      provider: "apinex", model: "free/not-available",
    }),
    /rejected unavailable model/,
  );
  assert.equal(dispatchCount, 0);
  assert.equal(company.snapshot().tasks.length, 0);
});

test("C1 keeps the Vice CEO StarNet authority boundary intact", async () => {
  const company = makeCompany();
  const starnet = makeStarNet();
  const operations = makeOperations({
    company, starnet,
    modelRouter: { resolve: async () => ({ allowed: true, provider: "apinex", model: "free/gpt-5.6-luna", source: "starforge-governed-model-router" }) },
  });
  const project = operations.createProject(ROLES.CEO, { title: "Vice CEO governed mission" });
  const result = await operations.delegateToStarNet(ROLES.VICE_CEO, {
    projectId: project.id, title: "Coordinate StarNet worker", assigneeId: "worker-1",
    provider: "apinex", model: "free/gpt-5.6-luna",
  });
  assert.equal(result.task.status, "completed");
  assert.equal(result.task.delegatedBy, ROLES.VICE_CEO);
  assert.equal(result.task.assigneeSource, "starnet");
});
