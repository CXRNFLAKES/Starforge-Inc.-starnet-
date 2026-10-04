import test from "node:test";
import assert from "node:assert/strict";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { makeStarNetAdapter } from "../sidecar/governance/starnet-adapter.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function setup({ workerPresent = true, dispatchResult = { content: "RECOVERY_OK" }, router = null } = {}) {
  const company = makeCompany();
  const project = company.recordProject(ROLES.CEO, {
    id: "d12-project",
    title: "Governed recovery execution",
    status: "active",
  });
  company.recordTask(ROLES.CEO, {
    id: "d12-task",
    projectId: project.id,
    title: "Failed governed operation",
    assigneeId: "worker-1",
    assigneeRole: ROLES.WORKER,
    assigneeSource: "starnet",
    status: "failed",
  });
  const roster = workerPresent ? [{ id: "worker-1", name: "Recovery Worker" }] : [];
  const starnet = makeStarNetAdapter({
    roster: () => roster,
    dispatch: async (payload) => dispatchResult,
  });
  const operations = makeOperations({ company, starnet, modelRouter: router });
  return { company, operations };
}

function assignAndStart(operations) {
  const mission = operations.assignRecoveryMission(ROLES.CEO, {
    taskId: "d12-task",
    assignedAgentId: "worker-1",
    reason: "Repair failed governed work",
    mission: "Execute governed recovery",
  });
  operations.startRecoveryMission(ROLES.CEO, mission.id);
  return mission;
}

test("D12: recovery executes through the existing StarNet dispatch seam", async () => {
  const { company, operations } = setup();
  const mission = assignAndStart(operations);
  const result = await operations.executeRecoveryMission(ROLES.CEO, mission.id);

  assert.equal(result.result.content, "RECOVERY_OK");
  assert.equal(result.task.status, "completed");
  assert.equal(result.task.execution.recoveryMissionId, mission.id);
  assert.equal(company.snapshot().tasks[0].status, "completed");
});

test("D12: unauthorized or unstarted recovery fails before dispatch", async () => {
  const { operations } = setup();
  const mission = operations.assignRecoveryMission(ROLES.CEO, {
    taskId: "d12-task",
    assignedAgentId: "worker-1",
    reason: "Repair",
    mission: "Recover",
  });
  await assert.rejects(
    operations.executeRecoveryMission(ROLES.PA, mission.id),
    /Only the CEO/,
  );
  await assert.rejects(
    operations.executeRecoveryMission(ROLES.CEO, mission.id),
    /in-progress/,
  );
});

test("D12: missing live recovery worker fails closed", async () => {
  const { operations } = setup({ workerPresent: false });
  const mission = assignAndStart(operations);
  await assert.rejects(
    operations.executeRecoveryMission(ROLES.CEO, mission.id),
    /not present in the live roster/,
  );
});

test("D12: malformed StarNet recovery output fails closed", async () => {
  const { company, operations } = setup({ dispatchResult: { nope: true } });
  const mission = assignAndStart(operations);
  await assert.rejects(
    operations.executeRecoveryMission(ROLES.CEO, mission.id),
    /invalid result|result without content/,
  );
  assert.equal(company.snapshot().tasks[0].status, "failed");
});

test("D12: approved governed model route is carried into StarNet recovery context", async () => {
  let captured;
  const router = {
    async resolve() {
      return {
        allowed: true,
        provider: "apinex",
        model: "free/gpt-5.6-luna",
        source: "starforge-governed-model-router",
      };
    },
  };
  const company = makeCompany();
  const project = company.recordProject(ROLES.CEO, { id: "d12-model-project", title: "Model recovery", status: "active" });
  company.recordTask(ROLES.CEO, {
    id: "d12-model-task",
    projectId: project.id,
    title: "Failed model task",
    assigneeId: "worker-1",
    assigneeRole: ROLES.WORKER,
    assigneeSource: "starnet",
    status: "failed",
  });
  const starnet = makeStarNetAdapter({
    roster: () => [{ id: "worker-1", name: "Recovery Worker" }],
    dispatch: async (payload) => {
      captured = payload;
      return { content: "MODEL_RECOVERY_OK" };
    },
  });
  const operations = makeOperations({ company, starnet, modelRouter: router });
  const mission = operations.assignRecoveryMission(ROLES.CEO, {
    taskId: "d12-model-task",
    assignedAgentId: "worker-1",
    reason: "Repair",
    mission: "Recover with governed model",
  });
  operations.startRecoveryMission(ROLES.CEO, mission.id);
  await operations.executeRecoveryMission(ROLES.CEO, mission.id, {
    provider: "apinex",
    model: "free/gpt-5.6-luna",
  });

  assert.equal(captured.workers[0].agentId, "worker-1");
  assert.equal(captured.workers[0].context.modelRoute.provider, "apinex");
  assert.equal(captured.workers[0].context.modelRoute.source, "starforge-governed-model-router");
});
