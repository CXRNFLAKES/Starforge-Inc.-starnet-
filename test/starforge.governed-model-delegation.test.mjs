import test from "node:test";
import assert from "node:assert/strict";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function makeCompany() {
  const state = {
    people: [{ id: "worker-1", role: ROLES.WORKER }],
    projects: [{
      id: "project-1",
      title: "APInex mission",
      status: "active",
    }],
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

test("StarForge governs the model before StarNet delegation", async () => {
  const calls = [];
  const company = makeCompany();
  const starnet = {
    listWorkersAsync: async () => [{ id: "worker-1", name: "Worker One", model: "live-model" }],
    delegateTask: async (_role, payload) => {
      calls.push(payload);
      return {
        worker: { id: "worker-1" },
        result: { content: "APINEX_OK" },
      };
    },
  };
  const modelRouter = {
    resolve: async (request) => {
      assert.deepEqual(request, {
        provider: "apinex",
        model: "free/gpt-5.6-luna",
      });
      return {
        allowed: true,
        provider: "apinex",
        model: "free/gpt-5.6-luna",
        free: true,
        source: "starforge-governed-model-router",
      };
    },
  };

  const operations = makeOperations({ company, starnet, modelRouter });
  const result = await operations.delegateToStarNet(ROLES.CEO, {
    projectId: "project-1",
    title: "Run governed APInex task",
    assigneeId: "worker-1",
    successCriteria: "Return APINEX_OK",
    provider: "apinex",
    model: "free/gpt-5.6-luna",
  });

  assert.equal(result.task.status, "completed");
  assert.deepEqual(result.task.execution.modelRoute, {
    allowed: true,
    provider: "apinex",
    model: "free/gpt-5.6-luna",
    free: true,
    source: "starforge-governed-model-router",
  });
  assert.equal(calls[0].context.modelRoute.model, "free/gpt-5.6-luna");
});

test("StarNet delegation fails closed when a model is requested without the governed router", async () => {
  const company = makeCompany();
  const starnet = {
    listWorkersAsync: async () => [{ id: "worker-1" }],
    delegateTask: async () => ({ result: { content: "should not run" } }),
  };
  const operations = makeOperations({ company, starnet });

  await assert.rejects(
    () => operations.delegateToStarNet(ROLES.CEO, {
      projectId: "project-1",
      title: "Unauthorized model task",
      assigneeId: "worker-1",
      provider: "apinex",
      model: "free/gpt-5.6-luna",
    }),
    /model router is required/,
  );
});
