import test from "node:test";
import assert from "node:assert/strict";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { makeComputeEconomy } from "../sidecar/governance/compute-economy.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function makeCompletedMission() {
  const company = makeCompany();
  const starnet = {
    listWorkersAsync: async () => [{ id: "worker-c3", name: "Business Worker" }],
    delegateTask: async (_role, payload) => ({
      result: {
        content: "Business outcome completed",
        provider: "apinex",
        model: "free/gpt-5.6-luna",
      },
      worker: { id: payload.assigneeId, name: "Business Worker" },
    }),
  };
  const modelRouter = {
    resolve: async ({ provider, model }) => ({
      allowed: true,
      provider,
      model,
      free: String(model).startsWith("free/"),
      source: "starforge-governed-model-router",
    }),
  };
  return { company, operations: makeOperations({ company, starnet, modelRouter }) };
}

test("C3 links a verified StarForge business outcome to revenue and compute ROI", async () => {
  const { company, operations } = makeCompletedMission();

  company.setMission(ROLES.CHO, {
    mission: "Generate real business value with governed AI execution",
    objective: "Convert verified work into governed economic value",
  });
  const objective = company.createObjective(ROLES.CHO, {
    title: "Convert verified work into governed economic value",
  });
  const project = operations.createProject(ROLES.CEO, {
    title: "Verified business mission",
    objectiveId: objective.id,
  });

  const execution = await operations.delegateToStarNet(ROLES.CEO, {
    projectId: project.id,
    title: "Complete verified business mission",
    assigneeId: "worker-c3",
    successCriteria: "Return a completed business result",
    provider: "apinex",
    model: "free/gpt-5.6-luna",
    executionKey: "c3-economic-business-mission",
  });

  const verification = operations.verifyBusinessOutcome(ROLES.PA, {
    taskId: execution.task.id,
    claim: "The governed StarForge mission completed its business objective.",
    evidence: [{
      source: "completed-business-task",
      provider: "apinex",
      model: "free/gpt-5.6-luna",
      supports: true,
      response: execution.result.content,
    }],
  });

  assert.equal(verification.verified, true);

  const economy = makeComputeEconomy({
    budgets: { missionCents: 100, workerCents: 100, taskCents: 100 },
    providerStatuses: { apinex: "available" },
    router: { resolve: async ({ provider, model }) => ({ allowed: true, provider, model }) },
  });

  const reservation = await economy.requestCompute({
    missionId: execution.task.id,
    workerId: execution.task.assigneeId,
    taskId: execution.task.id,
    provider: "apinex",
    model: "free/gpt-5.6-luna",
    estimatedCost: 0,
    reason: "verified business mission",
  });
  const settlement = economy.settleCompute(reservation.reservationId, {
    actualCost: 0,
    usage: { inputTokens: 120, outputTokens: 40 },
    revenueUsd: 25,
    outcome: "verified-business-outcome",
  });

  assert.equal(settlement.entry.revenueUsd, 25);
  assert.equal(economy.report({ missionId: execution.task.id }).computeRoiUsd, 25);

  const accountantEntry = company.recordFinanceEntry(ROLES.ACCOUNTANT, {
    id: "revenue-c3-1",
    kind: "revenue",
    amount: 25,
    currency: "EUR",
    taskId: execution.task.id,
    businessOutcomeId: verification.outcomeId,
    source: "verified-business-outcome",
    description: "Revenue attributable to verified StarForge business outcome",
  });

  assert.equal(accountantEntry.kind, "revenue");
  assert.equal(accountantEntry.businessOutcomeId, verification.outcomeId);
  assert.equal(company.financeSnapshot(ROLES.CHO).entries.length, 1);

  const finance = company.financeSnapshot(ROLES.CHO);
  assert.equal(finance.cash, 25);
  assert.equal(finance.entries[0].taskId, execution.task.id);

  console.log(JSON.stringify({
    phase: "C3",
    taskId: execution.task.id,
    outcomeId: verification.outcomeId,
    provider: settlement.entry.provider,
    model: settlement.entry.model,
    computeCostUsd: settlement.entry.actualCost,
    attributedRevenue: settlement.entry.revenueUsd,
    financeRevenue: accountantEntry.amount,
    businessOutcomeVerified: true,
    revenueLinkedToOutcome: true,
    source: "starforge-verified-business-outcome",
  }, null, 2));
});

test("C3 refuses revenue that is not linked to a verified business outcome", () => {
  const company = makeCompany();
  const task = {
    id: "task-unverified",
    projectId: "project-unverified",
    title: "Unverified task",
    assigneeId: "worker",
    assigneeRole: ROLES.WORKER,
    assigneeSource: "starnet",
    status: "completed",
  };

  company.recordTask(ROLES.CEO, task);

  assert.throws(() => company.recordFinanceEntry(ROLES.ACCOUNTANT, {
    id: "revenue-unverified",
    kind: "revenue",
    amount: 25,
    currency: "EUR",
    taskId: task.id,
    source: "verified-business-outcome",
    businessOutcomeId: "missing-outcome",
  }), /verified business outcome/);
});
