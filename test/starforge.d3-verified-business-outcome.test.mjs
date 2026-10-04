import test from "node:test";
import assert from "node:assert/strict";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { makeFactChecker, FACT_LABELS } from "../sidecar/governance/fact-checker.mjs";
import { companyLevelTelemetry } from "../sidecar/governance/capital-level.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function makeD3Execution() {
  const company = makeCompany();
  const starnet = {
    listWorkersAsync: async () => [{ id: "worker-d3", name: "D3 Business Worker" }],
    delegateTask: async () => ({
      result: {
        content: "CUSTOMER_ORDER_CONFIRMED order=SF-001 value=EUR:5000",
      },
    }),
  };
  const modelRouter = {
    resolve: async ({ provider, model }) => ({
      allowed: true,
      provider,
      model,
      source: "starforge-governed-model-router",
    }),
  };
  const operations = makeOperations({
    company,
    starnet,
    modelRouter,
    factChecker: makeFactChecker(),
  });
  return { company, operations };
}

test("D3 verifies a completed governed business outcome before financial recognition", async () => {
  const { company, operations } = makeD3Execution();
  const project = operations.createProject(ROLES.CEO, {
    title: "D3 verified business outcome",
  });

  const execution = await operations.delegateToStarNet(ROLES.CEO, {
    projectId: project.id,
    title: "Confirm customer order",
    assigneeId: "worker-d3",
    provider: "apinex",
    model: "free/d3-model",
    successCriteria: "Confirm customer order SF-001 for EUR 5000",
  });

  assert.equal(execution.task.status, "completed");
  assert.equal(company.snapshot().finance.entries.length, 0);

  const verification = operations.verifyBusinessOutcome(ROLES.PA, {
    taskId: execution.task.id,
    claim: "Customer order SF-001 is confirmed for EUR 5000",
    evidence: [
      {
        supports: true,
        source: "starnet-execution-result",
        reference: execution.task.id,
        observedValue: execution.result.content,
      },
    ],
  });

  assert.equal(verification.verified, true);
  assert.equal(verification.label, FACT_LABELS.VERIFIED_FACT);
  assert.equal(verification.taskId, execution.task.id);
  const verifiedAudit = company.snapshot().audit.find((item) => item.event === "business.outcome.verified" && item.details.outcomeId === verification.outcomeId);
  assert.equal(verifiedAudit?.details.verified, true);
  assert.equal(company.snapshot().finance.entries.length, 0);

  assert.throws(() => company.recordFinanceEntry(ROLES.ACCOUNTANT, {
    id: "d3-unverified-revenue",
    kind: "revenue",
    amount: 5000,
    currency: "EUR",
    taskId: "missing-task",
  }), /verified business outcome/);

  const revenue = company.recordFinanceEntry(ROLES.ACCOUNTANT, {
    id: "d3-revenue-001",
    kind: "revenue",
    amount: 5000,
    currency: "EUR",
    taskId: execution.task.id,
    businessOutcomeId: verification.outcomeId,
    source: "verified-business-outcome",
  });

  assert.equal(revenue.recordedBy, ROLES.ACCOUNTANT);
  assert.equal(company.financeSnapshot(ROLES.ACCOUNTANT).netOperatingCapital, 5000);
  const level = companyLevelTelemetry(5000);
  assert.equal(level.level, 10);
  assert.equal(level.rank, "EARLY GAME");
});

test("D3 rejects unverified business outcomes and creates no financial value", async () => {
  const { company, operations } = makeD3Execution();
  const project = operations.createProject(ROLES.CEO, {
    title: "D3 unverified outcome",
  });

  const execution = await operations.delegateToStarNet(ROLES.CEO, {
    projectId: project.id,
    title: "Attempt unsupported outcome",
    assigneeId: "worker-d3",
    provider: "apinex",
    model: "free/d3-model",
  });

  const verification = operations.verifyBusinessOutcome(ROLES.PA, {
    taskId: execution.task.id,
    claim: "The execution generated EUR 9000 in verified revenue",
    evidence: [
      {
        supports: false,
        source: "insufficient-evidence",
        reference: execution.task.id,
      },
    ],
  });

  assert.equal(verification.verified, false);
  assert.equal(verification.label, FACT_LABELS.UNVERIFIED_CLAIM);
  assert.equal(company.snapshot().tasks[0].businessOutcome.verified, false);

  assert.throws(() => company.recordFinanceEntry(ROLES.ACCOUNTANT, {
    id: "d3-invalid-revenue",
    kind: "revenue",
    amount: 9000,
    currency: "EUR",
    taskId: execution.task.id,
  }), /verified business outcome/);

  assert.equal(company.snapshot().finance.entries.length, 0);
  assert.equal(company.financeSnapshot(ROLES.ACCOUNTANT).netOperatingCapital, 0);
});

test("D3 preserves the existing execution and finance authority boundaries", async () => {
  const { company, operations } = makeD3Execution();
  const project = operations.createProject(ROLES.CEO, { title: "D3 authority" });
  const execution = await operations.delegateToStarNet(ROLES.CEO, {
    projectId: project.id,
    title: "Authority boundary result",
    assigneeId: "worker-d3",
    provider: "apinex",
    model: "free/d3-model",
  });

  assert.throws(() => operations.verifyBusinessOutcome(ROLES.CEO, {
    taskId: execution.task.id,
    claim: "CEO self-verifies revenue",
    evidence: [{ supports: true, source: "self-asserted" }],
  }), /cannot perform|Only the PA/);

  assert.throws(() => operations.verifyBusinessOutcome(ROLES.VICE_CEO, {
    taskId: execution.task.id,
    claim: "Vice CEO self-verifies revenue",
    evidence: [{ supports: true, source: "self-asserted" }],
  }), /cannot perform|Only the PA/);

  assert.equal(company.snapshot().finance.entries.length, 0);
});
