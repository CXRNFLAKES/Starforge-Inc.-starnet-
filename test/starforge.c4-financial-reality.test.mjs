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

function makeCompletedMission() {
  const company = makeCompany();
  const starnet = {
    listWorkersAsync: async () => [{ id: "worker-c4", name: "C4 Revenue Worker", model: "free/gpt-5.6-luna" }],
    delegateTask: async (_role, payload) => ({
      worker: { id: payload.assigneeId, name: "C4 Revenue Worker" },
      result: { content: "VERIFIED_BUSINESS_RESULT" },
    }),
  };
  const modelRouter = {
    resolve: async ({ provider, model }) => ({ allowed: true, provider, model, source: "starforge-governed-model-router" }),
  };
  return { company, operations: makeOperations({ company, starnet, modelRouter }) };
}

test("C4 turns a completed governed mission into explicit ledger-backed financial reality", async () => {
  const { company, operations } = makeCompletedMission();
  const project = operations.createProject(ROLES.CEO, { title: "C4 revenue mission" });
  const execution = await operations.delegateToStarNet(ROLES.CEO, {
    projectId: project.id, title: "Complete revenue-generating mission", assigneeId: "worker-c4",
    provider: "apinex", model: "free/gpt-5.6-luna", successCriteria: "Return VERIFIED_BUSINESS_RESULT",
  });

  assert.equal(execution.task.status, "completed");
  assert.equal(execution.result.content, "VERIFIED_BUSINESS_RESULT");
  assert.throws(() => company.recordFinanceEntry(ROLES.CEO, {
    id: "c4-unauthorized", kind: "revenue", amount: 5000, currency: "EUR", taskId: execution.task.id,
  }), /Unauthorized action/);

  company.recordFinanceEntry(ROLES.ACCOUNTANT, {
    id: "c4-revenue-001", kind: "revenue", amount: 5000, currency: "EUR",
    source: "verified-governed-mission-result", taskId: execution.task.id, result: execution.result.content,
  });
  company.recordFinanceEntry(ROLES.ACCOUNTANT, {
    id: "c4-tax-001", kind: "tax-reserve", amount: 500, currency: "EUR",
    source: "governed-tax-reserve", taskId: execution.task.id,
  });
  company.recordFinanceEntry(ROLES.ACCOUNTANT, {
    id: "c4-liability-001", kind: "liability", amount: 2000, currency: "EUR",
    source: "governed-operating-liability",
  });
  company.recordFinanceEntry(ROLES.ACCOUNTANT, {
    id: "c4-liability-payment-001", kind: "liability-payment", amount: 500, currency: "EUR",
    source: "governed-liability-payment",
  });

  const finance = company.financeSnapshot(ROLES.ACCOUNTANT);
  assert.deepEqual(
    { cash: finance.cash, availableCash: finance.availableCash, taxReserve: finance.taxReserve,
      liabilities: finance.liabilities, netOperatingCapital: finance.netOperatingCapital, entryCount: finance.entryCount },
    { cash: 4000, availableCash: 4000, taxReserve: 500, liabilities: 1500, netOperatingCapital: 2500, entryCount: 4 },
  );

  const telemetry = company.financeTelemetrySnapshot(ROLES.PA, { limit: 10 });
  assert.deepEqual(
    { revenue: telemetry.revenue, expenses: telemetry.expenses, capitalInjections: telemetry.capitalInjections,
      liabilityPayments: telemetry.liabilityPayments, totalInflow: telemetry.totalInflow,
      totalOutflow: telemetry.totalOutflow, netCashflow: telemetry.netCashflow,
      operatingResult: telemetry.operatingResult, netOperatingCapital: telemetry.netOperatingCapital },
    { revenue: 5000, expenses: 0, capitalInjections: 0, liabilityPayments: 500,
      totalInflow: 5000, totalOutflow: 1000, netCashflow: 4000, operatingResult: 4500, netOperatingCapital: 2500 },
  );
  assert.equal(telemetry.recentEntries[0].id, "c4-liability-payment-001");

  const level = companyLevelTelemetry(finance.netOperatingCapital);
  assert.equal(level.level, 5);
  assert.equal(level.rank, "BOOTSTRAPPED");
  assert.equal(level.currentCapital, 2500);
  assert.equal(level.nextLevel, 10);
  assert.equal(level.nextThreshold, 5000);
  assert.equal(level.source, "starforge-governed-company-ledger");

  const handler = makeStarForgeGovernanceHandler({
    workspace: ".starforge-c4-test", company,
    roster: new Map([["worker-c4", { name: "C4 Revenue Worker", model: "free/gpt-5.6-luna" }]]),
    runsMeta: new Map(),
  });
  const { status, payload } = await readGovernance(handler);
  assert.equal(status, 200);
  assert.equal(payload.finance.revenue, 5000);
  assert.equal(payload.finance.taxReserve, 500);
  assert.equal(payload.finance.liabilities, 1500);
  assert.equal(payload.finance.netOperatingCapital, 2500);
  assert.equal(payload.capital.netOperatingCapital, 2500);
  assert.equal(payload.level.level, 5);
  assert.equal(payload.level.rank, "BOOTSTRAPPED");
  assert.equal(payload.level.source, "starforge-governed-company-ledger");
  assert.equal(payload.connection.financeSource, "starforge-governed-company-ledger");
});

test("C4 preserves the financial boundary: failed execution creates no revenue event", async () => {
  const company = makeCompany();
  const operations = makeOperations({
    company,
    starnet: {
      listWorkersAsync: async () => [{ id: "worker-c4-fail", name: "C4 Failure Worker" }],
      delegateTask: async () => { throw new Error("APInex business timeout"); },
    },
    modelRouter: { resolve: async () => ({ allowed: true, provider: "apinex", model: "free/gpt-5.6-luna" }) },
  });
  const project = operations.createProject(ROLES.CEO, { title: "C4 failed revenue mission" });

  await assert.rejects(() => operations.delegateToStarNet(ROLES.CEO, {
    projectId: project.id, title: "Failed revenue mission", assigneeId: "worker-c4-fail",
    provider: "apinex", model: "free/gpt-5.6-luna",
  }), /APInex business timeout/);

  const stored = operations.inspect({ projectId: project.id });
  assert.equal(stored.tasks[0].status, "failed");
  assert.equal(company.snapshot().finance.entries.length, 0);
  assert.equal(company.financeSnapshot(ROLES.ACCOUNTANT).netOperatingCapital, 0);
});

test("C4 keeps finance recording restricted to finance-authorized roles", () => {
  const company = makeCompany();
  const entry = { id: "c4-boundary-001", kind: "revenue", amount: 100, currency: "EUR" };
  assert.throws(() => company.recordFinanceEntry(ROLES.CEO, entry), /Unauthorized action/);
  assert.throws(() => company.recordFinanceEntry(ROLES.PA, entry), /Unauthorized action/);
  assert.doesNotThrow(() => company.recordFinanceEntry(ROLES.ACCOUNTANT, entry));
  assert.equal(company.financeSnapshot(ROLES.ACCOUNTANT).netOperatingCapital, 100);
});
