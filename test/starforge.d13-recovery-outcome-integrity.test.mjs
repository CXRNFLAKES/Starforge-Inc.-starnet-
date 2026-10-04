import test from "node:test";
import assert from "node:assert/strict";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { makeFactChecker } from "../sidecar/governance/fact-checker.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function setup() {
  const company = makeCompany();
  const starnet = {
    listWorkersAsync: async () => [{ id: "worker-d13", name: "Recovery Worker" }],
    delegateTask: async () => ({
      result: { content: "RECOVERY_BUSINESS_RESULT value=EUR:5000" },
    }),
  };
  const operations = makeOperations({
    company,
    starnet,
    factChecker: makeFactChecker(),
  });
  const project = operations.createProject(ROLES.CEO, {
    title: "D13 recovery outcome integrity",
  });
  const task = company.recordTask(ROLES.CEO, {
    id: "d13-task",
    projectId: project.id,
    title: "Failed revenue operation",
    assigneeId: "worker-d13",
    assigneeRole: ROLES.WORKER,
    assigneeSource: "starnet",
    status: "failed",
  });
  return { company, operations, task };
}

async function executeRecovery(operations) {
  const mission = operations.assignRecoveryMission(ROLES.CEO, {
    taskId: "d13-task",
    assignedAgentId: "worker-d13",
    reason: "Repair failed revenue operation",
    mission: "Recover and verify the customer order",
  });
  operations.startRecoveryMission(ROLES.CEO, mission.id);
  const execution = await operations.executeRecoveryMission(ROLES.CEO, mission.id);
  return { mission, execution };
}

test("D13: recovery execution cannot create a business outcome before PA verification", async () => {
  const { company, operations } = setup();
  const { mission, execution } = await executeRecovery(operations);

  assert.equal(execution.task.status, "completed");
  assert.throws(() => operations.verifyBusinessOutcome(ROLES.PA, {
    taskId: execution.task.id,
    claim: "Recovered customer order is confirmed for EUR 5000",
    evidence: [{ supports: true, source: "recovery-execution", reference: mission.id }],
  }), /verified recovery work/);

  assert.throws(() => company.recordFinanceEntry(ROLES.ACCOUNTANT, {
    id: "d13-premature-revenue",
    kind: "revenue",
    amount: 5000,
    currency: "EUR",
    taskId: execution.task.id,
  }), /verified recovery work/);

  assert.equal(company.snapshot().tasks[0].businessOutcome, undefined);
  assert.equal(company.snapshot().finance.entries.length, 0);
});

test("D13: PA recovery verification unlocks governed outcome and finance recognition", async () => {
  const { company, operations } = setup();
  const { mission, execution } = await executeRecovery(operations);

  const verifiedMission = operations.verifyRecoveryMission(ROLES.PA, mission.id, {
    evidence: [{
      source: "recovery-execution-result",
      reference: execution.task.id,
      observedValue: execution.result.content,
    }],
  });

  assert.equal(verifiedMission.status, "verified");

  const outcome = operations.verifyBusinessOutcome(ROLES.PA, {
    taskId: execution.task.id,
    claim: "Recovered customer order is confirmed for EUR 5000",
    evidence: [{
      supports: true,
      source: "verified-recovery-mission",
      reference: mission.id,
      observedValue: execution.result.content,
    }],
  });

  assert.equal(outcome.verified, true);

  const revenue = company.recordFinanceEntry(ROLES.ACCOUNTANT, {
    id: "d13-revenue-001",
    kind: "revenue",
    amount: 5000,
    currency: "EUR",
    taskId: execution.task.id,
    businessOutcomeId: outcome.outcomeId,
    source: "verified-business-outcome",
  });

  assert.equal(revenue.recordedBy, ROLES.ACCOUNTANT);
  assert.equal(company.financeSnapshot(ROLES.ACCOUNTANT).netOperatingCapital, 5000);
});

test("D13: recovery verification remains PA-only and cannot be bypassed by operational roles", async () => {
  const { operations } = setup();
  const { mission } = await executeRecovery(operations);

  assert.throws(() => operations.verifyRecoveryMission(ROLES.CEO, mission.id, {
    evidence: ["CEO self-verification"],
  }), /Only the PA/);

  assert.throws(() => operations.verifyRecoveryMission(ROLES.VICE_CEO, mission.id, {
    evidence: ["Vice CEO self-verification"],
  }), /Only the PA/);
});
