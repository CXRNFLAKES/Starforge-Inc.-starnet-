import test from "node:test";
import assert from "node:assert/strict";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function setup(status = "failed") {
  const company = makeCompany();
  const project = company.recordProject(ROLES.CEO, {
    id: "d11-project",
    title: "Recovery lifecycle project",
    status: "active",
  });
  company.recordTask(ROLES.CEO, {
    id: "d11-task",
    projectId: project.id,
    title: "Failed governed operation",
    assigneeId: "worker-1",
    assigneeRole: ROLES.WORKER,
    assigneeSource: "starnet",
    status,
  });
  return { company, operations: makeOperations({ company }) };
}

function assign(company, operations) {
  return operations.assignRecoveryMission(ROLES.CEO, {
    taskId: "d11-task",
    assignedAgentId: "worker-1",
    reason: "Repair failed governed work",
    mission: "Repair, execute, and verify recovery",
  });
}

test("D11: recovery completes assigned -> in-progress -> verified -> closed", () => {
  const { company, operations } = setup("failed");
  const mission = assign(company, operations);

  const started = operations.startRecoveryMission(ROLES.CEO, mission.id);
  assert.equal(started.status, "in-progress");

  operations.updateTask(ROLES.CEO, "d11-task", {
    status: "completed",
    note: "Recovery work completed",
  });

  const evidence = [{ type: "execution-result", reference: "d11-recovery-result" }];
  const verified = operations.verifyRecoveryMission(ROLES.PA, mission.id, { evidence });
  assert.equal(verified.status, "verified");
  assert.equal(verified.verifiedBy, ROLES.PA);
  assert.equal(verified.evidence.length, 1);

  const closed = operations.closeRecoveryMission(ROLES.CEO, mission.id);
  assert.equal(closed.status, "closed");
  assert.ok(closed.closedAt);

  const persisted = company.snapshot().recoveryMissions[0];
  assert.equal(persisted.status, "closed");
  assert.equal(persisted.verifiedBy, ROLES.PA);
  assert.ok(company.snapshot().audit.some((item) => item.event === "recovery.mission.verified"));
  assert.ok(company.snapshot().audit.some((item) => item.event === "recovery.mission.closed"));
});

test("D11: lifecycle is fail-closed before recovery is actually complete", () => {
  const { operations } = setup("blocked");
  const mission = assign(...Object.values({ company: setup("blocked").company, operations }));
  assert.throws(
    () => operations.verifyRecoveryMission(ROLES.PA, mission.id, { evidence: ["premature"] }),
    /in-progress/,
  );
  assert.throws(
    () => operations.closeRecoveryMission(ROLES.CEO, mission.id),
    /verified/,
  );
});

test("D11: only CEO controls recovery execution state and only PA verifies", () => {
  const { company, operations } = setup("failed");
  const mission = assign(company, operations);

  assert.throws(
    () => operations.startRecoveryMission(ROLES.PA, mission.id),
    /Only the CEO/,
  );
  operations.startRecoveryMission(ROLES.CEO, mission.id);
  operations.updateTask(ROLES.CEO, "d11-task", { status: "completed", note: "Recovered" });

  assert.throws(
    () => operations.verifyRecoveryMission(ROLES.CEO, mission.id, { evidence: ["result"] }),
    /Only the PA/,
  );
  assert.throws(
    () => operations.closeRecoveryMission(ROLES.PA, mission.id),
    /Only the CEO/,
  );
});

test("D11: recovery verification evidence is persisted and defensively copied", () => {
  const { company, operations } = setup("failed");
  const mission = assign(company, operations);
  operations.startRecoveryMission(ROLES.CEO, mission.id);
  operations.updateTask(ROLES.CEO, "d11-task", { status: "completed", note: "Recovered" });

  const evidence = [{ type: "audit-reference", value: "verified-output" }];
  const verified = operations.verifyRecoveryMission(ROLES.PA, mission.id, { evidence });
  verified.evidence[0].value = "tampered";
  evidence[0].value = "tampered-again";

  const persisted = company.snapshot().recoveryMissions[0];
  assert.equal(persisted.status, "verified");
  assert.equal(persisted.evidence[0].value, "verified-output");
  assert.equal(persisted.verifiedBy, ROLES.PA);
});
