import test from "node:test";
import assert from "node:assert/strict";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { companyLevelTelemetry } from "../sidecar/governance/capital-level.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function makeProject(company) {
  const operations = makeOperations({
    company,
    starnet: {
      listWorkersAsync: async () => [{ id: "worker-c3", name: "C3 Worker", model: "free/gpt-5.6-luna" }],
      delegateTask: async () => ({ result: { content: "UNEXPECTED_SUCCESS" } }),
    },
    modelRouter: {
      resolve: async () => ({
        allowed: true,
        provider: "apinex",
        model: "free/gpt-5.6-luna",
        source: "starforge-governed-model-router",
      }),
    },
  });
  const project = operations.createProject(ROLES.CEO, { title: "C3 security gate" });
  return { operations, project };
}

test("C3 blocks unauthorized StarNet delegation before any execution state is created", async () => {
  const company = makeCompany();
  const { operations, project } = makeProject(company);

  await assert.rejects(
    () => operations.delegateToStarNet(ROLES.PA, {
      projectId: project.id,
      title: "Unauthorized execution",
      assigneeId: "worker-c3",
      provider: "apinex",
      model: "free/gpt-5.6-luna",
    }),
    /Unauthorized action/,
  );

  const snapshot = company.snapshot();
  assert.equal(snapshot.tasks.length, 0);
  assert.equal(snapshot.finance.entries.length, 0);
});

test("C3 fails closed on an unavailable governed model before StarNet dispatch", async () => {
  const company = makeCompany();
  let dispatchCount = 0;
  const operations = makeOperations({
    company,
    starnet: {
      listWorkersAsync: async () => [{ id: "worker-c3", name: "C3 Worker" }],
      delegateTask: async () => {
        dispatchCount += 1;
        return { result: { content: "SHOULD_NOT_RUN" } };
      },
    },
    modelRouter: {
      resolve: async () => {
        throw new Error("model router rejected unavailable model: free/not-available");
      },
    },
  });
  const project = operations.createProject(ROLES.CEO, { title: "Unavailable model gate" });

  await assert.rejects(
    () => operations.delegateToStarNet(ROLES.CEO, {
      projectId: project.id,
      title: "Blocked unavailable model",
      assigneeId: "worker-c3",
      provider: "apinex",
      model: "free/not-available",
    }),
    /rejected unavailable model/,
  );

  assert.equal(dispatchCount, 0);
  assert.equal(company.snapshot().tasks.length, 0);
  assert.equal(company.snapshot().finance.entries.length, 0);
});

test("C3 blocks execution when the StarNet worker disappears from the live roster", async () => {
  const company = makeCompany();
  let dispatchCount = 0;
  const operations = makeOperations({
    company,
    starnet: {
      listWorkersAsync: async () => [],
      delegateTask: async () => {
        dispatchCount += 1;
        return { result: { content: "SHOULD_NOT_RUN" } };
      },
    },
    modelRouter: {
      resolve: async () => ({
        allowed: true,
        provider: "apinex",
        model: "free/gpt-5.6-luna",
      }),
    },
  });
  const project = operations.createProject(ROLES.CEO, { title: "Missing worker gate" });

  await assert.rejects(
    () => operations.delegateToStarNet(ROLES.CEO, {
      projectId: project.id,
      title: "Missing live worker",
      assigneeId: "worker-c3",
      provider: "apinex",
      model: "free/gpt-5.6-luna",
    }),
    /not present in the live roster/,
  );

  assert.equal(dispatchCount, 0);
  assert.equal(company.snapshot().tasks.length, 0);
  assert.equal(company.snapshot().finance.entries.length, 0);
});

test("C3 persists a failed StarNet execution without granting completion, XP, or finance", async () => {
  const company = makeCompany();
  const { project } = makeProject(company);
  const operations = makeOperations({
    company,
    starnet: {
      listWorkersAsync: async () => [{ id: "worker-c3", name: "C3 Worker" }],
      delegateTask: async () => {
        throw new Error("APInex timeout");
      },
    },
    modelRouter: {
      resolve: async () => ({
        allowed: true,
        provider: "apinex",
        model: "free/gpt-5.6-luna",
      }),
    },
  });

  await assert.rejects(
    () => operations.delegateToStarNet(ROLES.CEO, {
      projectId: project.id,
      title: "Timed out APInex execution",
      assigneeId: "worker-c3",
      provider: "apinex",
      model: "free/gpt-5.6-luna",
    }),
    /APInex timeout/,
  );

  const stored = operations.inspect({ projectId: project.id });
  assert.equal(stored.tasks.length, 1);
  assert.equal(stored.tasks[0].status, "failed");
  assert.match(stored.tasks[0].note, /APInex timeout/);
  assert.equal(company.snapshot().finance.entries.length, 0);

  const telemetry = companyLevelTelemetry(company.snapshot().finance.openingCapital);
  assert.equal(telemetry.level, 1);
  assert.equal(telemetry.currentCapital, 0);
});

test("C3 rejects malformed StarNet results and keeps the task failed", async () => {
  const company = makeCompany();
  const { project } = makeProject(company);
  const operations = makeOperations({
    company,
    starnet: {
      listWorkersAsync: async () => [{ id: "worker-c3", name: "C3 Worker" }],
      delegateTask: async () => ({ result: null }),
    },
    modelRouter: {
      resolve: async () => ({
        allowed: true,
        provider: "apinex",
        model: "free/gpt-5.6-luna",
      }),
    },
  });

  await assert.rejects(
    () => operations.delegateToStarNet(ROLES.CEO, {
      projectId: project.id,
      title: "Malformed result execution",
      assigneeId: "worker-c3",
      provider: "apinex",
      model: "free/gpt-5.6-luna",
    }),
    /invalid result|result without content/i,
  );

  const stored = operations.inspect({ projectId: project.id });
  assert.equal(stored.tasks.length, 1);
  assert.equal(stored.tasks[0].status, "failed");
  assert.equal(company.snapshot().finance.entries.length, 0);
});
