import test from "node:test";
import assert from "node:assert/strict";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function makeProjectCompany() {
  const company = makeCompany();
  company.setMission(ROLES.CHO, {
    mission: "Execute governed production work",
    objective: "D2 governed model execution",
  });
  const objective = company.createObjective(ROLES.CHO, {
    title: "D2 governed model execution",
  });
  return { company, objective };
}

test("D2 persists the approved governed model route on the task and execution record", async () => {
  const { company, objective } = makeProjectCompany();
  const calls = [];
  const starnet = {
    listWorkersAsync: async () => [{ id: "worker-d2", name: "D2 Worker" }],
    delegateTask: async (_role, payload) => {
      calls.push(payload);
      return {
        result: { content: "D2_OK" },
      };
    },
  };
  const modelRoute = {
    allowed: true,
    provider: "apinex",
    model: "free/d2-model",
    source: "starforge-governed-model-router",
    free: true,
  };
  const operations = makeOperations({
    company,
    starnet,
    modelRouter: {
      resolve: async request => {
        assert.deepEqual(request, { provider: "apinex", model: "free/d2-model" });
        return modelRoute;
      },
    },
  });
  const project = operations.createProject(ROLES.CEO, {
    title: "D2 production project",
    objectiveId: objective.id,
  });

  const execution = await operations.delegateToStarNet(ROLES.CEO, {
    projectId: project.id,
    title: "D2 governed execution",
    assigneeId: "worker-d2",
    successCriteria: "Return D2_OK",
    provider: "apinex",
    model: "free/d2-model",
  });

  assert.equal(execution.task.status, "completed");
  assert.deepEqual(execution.task.modelRoute, modelRoute);
  assert.deepEqual(execution.task.execution.modelRoute, modelRoute);
  assert.deepEqual(calls[0].context.modelRoute, modelRoute);
  assert.equal(company.snapshot().tasks[0].modelRoute.model, "free/d2-model");
});

test("D2 fails closed when the governed router returns an unapproved route", async () => {
  const { company, objective } = makeProjectCompany();
  let dispatches = 0;
  const starnet = {
    listWorkersAsync: async () => [{ id: "worker-d2", name: "D2 Worker" }],
    delegateTask: async () => {
      dispatches += 1;
      return { result: { content: "must-not-run" } };
    },
  };
  const operations = makeOperations({
    company,
    starnet,
    modelRouter: {
      resolve: async () => ({
        allowed: false,
        provider: "apinex",
        model: "free/d2-model",
        source: "starforge-governed-model-router",
      }),
    },
  });
  const project = operations.createProject(ROLES.CEO, {
    title: "D2 blocked project",
    objectiveId: objective.id,
  });

  await assert.rejects(
    () => operations.delegateToStarNet(ROLES.CEO, {
      projectId: project.id,
      title: "Blocked D2 execution",
      assigneeId: "worker-d2",
      provider: "apinex",
      model: "free/d2-model",
    }),
    /did not approve the requested model/,
  );
  assert.equal(dispatches, 0);
  assert.equal(company.snapshot().tasks.length, 0);
});

test("D2 preserves the existing CEO and Vice CEO StarNet authority boundary", async () => {
  const { company, objective } = makeProjectCompany();
  const operations = makeOperations({
    company,
    starnet: {
      listWorkersAsync: async () => [{ id: "worker-d2" }],
      delegateTask: async () => ({ result: { content: "D2_OK" } }),
    },
    modelRouter: {
      resolve: async () => ({
        allowed: true,
        provider: "apinex",
        model: "free/d2-model",
        source: "starforge-governed-model-router",
        free: true,
      }),
    },
  });
  const project = operations.createProject(ROLES.CEO, {
    title: "D2 authority project",
    objectiveId: objective.id,
  });

  await assert.rejects(
    () => operations.delegateToStarNet(ROLES.PA, {
      projectId: project.id,
      title: "PA must not execute",
      assigneeId: "worker-d2",
      provider: "apinex",
      model: "free/d2-model",
    }),
    /cannot perform|Only the CEO or StarNet Vice CEO/,
  );

  const result = await operations.delegateToStarNet(ROLES.VICE_CEO, {
    projectId: project.id,
    title: "Vice CEO governed execution",
    assigneeId: "worker-d2",
    provider: "apinex",
    model: "free/d2-model",
  });
  assert.equal(result.task.status, "completed");
});
