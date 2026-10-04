import test from "node:test";
import assert from "node:assert/strict";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function setup() {
  const company = makeCompany();
  company.recordTask(ROLES.CEO, {
    id: "d14-task",
    projectId: "d14-project",
    title: "Recovery lifecycle persistence boundary",
    assigneeId: "worker-d14",
    assigneeRole: ROLES.WORKER,
    assigneeSource: "starnet",
    status: "failed",
  });
  return company;
}

function mission(company) {
  return company.recordRecoveryMission(ROLES.CEO, {
    id: "d14-mission",
    taskId: "d14-task",
    reason: "D14 lifecycle integrity",
    assignedAgentId: "worker-d14",
    mission: "Repair failed work",
  });
}

test("D14: persistence boundary enforces the recovery state machine", () => {
  const company = setup();
  const m = mission(company);

  assert.throws(() => company.updateRecoveryMission(ROLES.CEO, {
    ...m, status: "verified",
  }), /cannot perform|in-progress before verification/);

  const started = company.updateRecoveryMission(ROLES.CEO, {
    ...m, status: "in-progress",
  });
  assert.equal(started.status, "in-progress");

  assert.throws(() => company.updateRecoveryMission(ROLES.CEO, {
    ...started, status: "closed",
  }), /verified before closure/);

  const verified = company.updateRecoveryMission(ROLES.PA, {
    ...started,
    status: "verified",
    evidence: [{ source: "d14-test" }],
    verifiedBy: ROLES.PA,
  });
  assert.equal(verified.status, "verified");

  assert.throws(() => company.updateRecoveryMission(ROLES.VICE_CEO, {
    ...verified, status: "closed",
  }), /cannot perform|Unauthorized/);

  const closed = company.updateRecoveryMission(ROLES.CEO, {
    ...verified, status: "closed",
  });
  assert.equal(closed.status, "closed");
});

test("D14: invalid recovery transitions fail closed and cannot manufacture verification", () => {
  const company = setup();
  const m = mission(company);

  assert.throws(() => company.updateRecoveryMission(ROLES.CEO, {
    ...m, status: "closed",
  }), /Invalid recovery mission transition|verified before closure/);

  assert.equal(company.snapshot().recoveryMissions[0].status, "assigned");
  assert.equal(company.snapshot().recoveryMissions[0].verifiedBy, undefined);

  assert.throws(() => company.updateRecoveryMission(ROLES.PA, {
    ...m, status: "in-progress",
  }), /cannot perform|Unauthorized/);
});

test("D14: defensive snapshots remain read-only after lifecycle transitions", () => {
  const company = setup();
  const m = mission(company);
  const started = company.updateRecoveryMission(ROLES.CEO, { ...m, status: "in-progress" });
  const verified = company.updateRecoveryMission(ROLES.PA, {
    ...started, status: "verified", evidence: [{ source: "d14-test" }], verifiedBy: ROLES.PA,
  });

  verified.evidence.push({ source: "tamper" });
  verified.status = "closed";

  const persisted = company.snapshot().recoveryMissions[0];
  assert.equal(persisted.status, "verified");
  assert.equal(persisted.evidence.length, 1);
});
