import test from "node:test";
import assert from "node:assert/strict";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function setup(status = "failed") {
  const company = makeCompany();
  const project = company.recordProject(ROLES.CEO, {
    id: "d10-project",
    title: "Recovery project",
    status: "active",
  });
  company.recordTask(ROLES.CEO, {
    id: "d10-task",
    projectId: project.id,
    title: "Failed governed operation",
    assigneeId: "worker-1",
    assigneeRole: ROLES.WORKER,
    assigneeSource: "starnet",
    status,
  });
  return { company, operations: makeOperations({ company }) };
}

test("D10: CEO can assign exactly one governed recovery mission to failed or blocked work", () => {
  const { company, operations } = setup("failed");
  const mission = operations.assignRecoveryMission(ROLES.CEO, {
    taskId: "d10-task",
    assignedAgentId: "worker-1",
    reason: "Execution failed validation",
  });

  assert.equal(mission.taskId, "d10-task");
  assert.equal(mission.status, "assigned");
  assert.equal(company.snapshot().recoveryMissions.length, 1);
  assert.ok(company.snapshot().audit.some((item) => item.event === "recovery.mission.assigned"));
  assert.throws(
    () => operations.assignRecoveryMission(ROLES.CEO, {
      taskId: "d10-task",
      assignedAgentId: "worker-2",
      reason: "Duplicate recovery",
    }),
    /already assigned/,
  );
});

test("D10: recovery is fail-closed for healthy work and unauthorized roles", () => {
  const { operations } = setup("completed");

  assert.throws(
    () => operations.assignRecoveryMission(ROLES.CEO, {
      taskId: "d10-task",
      assignedAgentId: "worker-1",
      reason: "Should not recover completed work",
    }),
    /failed or blocked/,
  );

  assert.throws(
    () => operations.assignRecoveryMission(ROLES.PA, {
      taskId: "d10-task",
      assignedAgentId: "worker-1",
      reason: "PA cannot execute recovery",
    }),
    /Only the CEO/,
  );
});

test("D10: blocked work is recoverable and recovery evidence is defensively copied", () => {
  const { company, operations } = setup("blocked");
  const mission = operations.assignRecoveryMission(ROLES.CEO, {
    taskId: "d10-task",
    assignedAgentId: "worker-1",
    reason: "Worker blocked on dependency",
    mission: "Resolve dependency and re-verify",
  });
  mission.reason = "tampered";
  const persisted = company.snapshot();
  assert.equal(persisted.recoveryMissions[0].reason, "Worker blocked on dependency");
  assert.equal(persisted.recoveryMissions[0].taskId, "d10-task");
});
