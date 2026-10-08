import test from "node:test";
import assert from "node:assert/strict";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function makeCompany() {
  const state = {
    people: [{ id: "worker-m9-2", role: ROLES.WORKER }],
    projects: [{ id: "project-m9-2", title: "M9.2 model-governed mission", status: "active" }],
    tasks: [],
  };
  return {
    snapshot: () => structuredClone(state),
    recordTask: (_role, task) => state.tasks.push(structuredClone(task)),
    updateTask: (_role, task) => {
      const index = state.tasks.findIndex((item) => item.id === task.id);
      state.tasks[index] = structuredClone(task);
    },
  };
}

test("M9.2 persists the governed model route on the executed StarNet task", async () => {
  const company = makeCompany();
  const calls = [];
  const operations = makeOperations({
    company,
    starnet: {
      listWorkersAsync: async () => [{ id: "worker-m9-2", name: "Model Worker" }],
      delegateTask: async (_role, payload) => {
        calls.push(payload);
        return { worker: { id: "worker-m9-2" }, result: { content: "M9.2 MODEL ROUTE RECEIPT" } };
      },
    },
    modelRouter: {
      resolve: async (request) => {
        assert.deepEqual(request, { provider: "apinex", model: "free/gpt-5.6-luna" });
        return {
          allowed: true,
          provider: "apinex",
          model: "free/gpt-5.6-luna",
          free: true,
          source: "starforge-governed-model-router",
        };
      },
    },
  });

  const result = await operations.delegateToStarNet(ROLES.CEO, {
    projectId: "project-m9-2",
    title: "Execute with governed model",
    assigneeId: "worker-m9-2",
    successCriteria: "Return the M9.2 model route receipt",
    provider: "apinex",
    model: "free/gpt-5.6-luna",
    executionKey: "m9.2-model-route-receipt",
  });

  assert.equal(result.task.status, "completed");
  assert.deepEqual(result.task.execution.modelRoute, {
    allowed: true,
    provider: "apinex",
    model: "free/gpt-5.6-luna",
    free: true,
    source: "starforge-governed-model-router",
  });
  assert.equal(result.task.execution.provider, "starnet");
  assert.equal(result.task.execution.result.content, "M9.2 MODEL ROUTE RECEIPT");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].context.modelRoute, result.task.execution.modelRoute);

  const persisted = company.snapshot().tasks[0];
  assert.deepEqual(persisted.execution.modelRoute, result.task.execution.modelRoute);
  assert.equal(persisted.executionKey, "m9.2-model-route-receipt");
});

test("M9.2 fails closed before StarNet dispatch when the governed model router rejects", async () => {
  const company = makeCompany();
  let dispatches = 0;
  const operations = makeOperations({
    company,
    starnet: {
      listWorkersAsync: async () => [{ id: "worker-m9-2", name: "Model Worker" }],
      delegateTask: async () => {
        dispatches += 1;
        return { result: { content: "SHOULD NOT RUN" } };
      },
    },
    modelRouter: {
      resolve: async () => {
        throw new Error("model router rejected unavailable model");
      },
    },
  });

  await assert.rejects(
    () => operations.delegateToStarNet(ROLES.CEO, {
      projectId: "project-m9-2",
      title: "Rejected model task",
      assigneeId: "worker-m9-2",
      provider: "apinex",
      model: "free/not-authorized",
      executionKey: "m9.2-rejected-model",
    }),
    /model router rejected unavailable model/,
  );
  assert.equal(dispatches, 0);
  assert.equal(company.snapshot().tasks.length, 0);
});
