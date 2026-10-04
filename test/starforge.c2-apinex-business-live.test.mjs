import test from "node:test";
import assert from "node:assert/strict";
import providerFactory from "../sidecar/providers/factory.js";
import { makeStarForgeModelRouter } from "../sidecar/governance/model-router.mjs";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

test("C2 executes a real StarForge mission through the governed APInex path", async () => {
  const key = String(process.env.APINEX_API_KEY || "").trim();
  assert.ok(key, "APINEX_API_KEY is required for the C2 live business execution gate");

  const router = makeStarForgeModelRouter();
  const catalog = await router.discover({
    provider: "apinex",
    key,
    baseUrl: "https://api.apinex.bond/v1",
  });
  assert.ok(catalog.models.length > 0, "APInex must expose at least one governed free model");

  const selected = catalog.models[0];
  const route = await router.resolve({
    provider: "apinex",
    model: selected.id,
    key,
    baseUrl: "https://api.apinex.bond/v1",
  });
  assert.equal(route.allowed, true);
  assert.equal(route.provider, "apinex");
  assert.ok(route.model.startsWith("free/"));

  const provider = providerFactory.selectProvider({
    provider: route.provider,
    key,
    baseUrl: "https://api.apinex.bond/v1",
  });

  let output = "";
  for await (const event of provider.stream({
    model: route.model,
    messages: [{
      role: "user",
      content: "You are executing a StarForge business mission. Reply with exactly APINEX_OK.",
    }],
    reasoningEffort: "none",
    max_tokens: 16,
    isTask: true,
  })) {
    if (event?.type === "text") output += String(event.delta || "");
  }
  assert.match(output.trim(), /\bAPINEX_OK\b/);

  // Feed the verified real APInex result through the existing StarForge company/StarNet
  // execution seam. No new execution adapter or duplicate provider path is introduced.
  const company = makeCompany();
  const starnet = {
    listWorkersAsync: async () => [{ id: "worker-c2", name: "APInex Mission Worker", model: route.model }],
    delegateTask: async (_role, payload) => ({
      worker: { id: payload.assigneeId, name: "APInex Mission Worker" },
      result: { content: output.trim(), provider: route.provider, model: route.model },
    }),
  };
  const governedRouter = {
    resolve: request => router.resolve({
      ...request,
      key,
      baseUrl: "https://api.apinex.bond/v1",
    }),
  };

  company.setMission(ROLES.CHO, {
    mission: "Generate real business value with governed AI execution",
    objective: "Complete the first real APInex mission",
  });
  const objective = company.createObjective(ROLES.CHO, {
    title: "Complete the first real APInex mission",
  });
  const operations = makeOperations({ company, starnet, modelRouter: governedRouter });
  const project = operations.createProject(ROLES.CEO, {
    title: "Real APInex business mission",
    objectiveId: objective.id,
  });
  const execution = await operations.delegateToStarNet(ROLES.CEO, {
    projectId: project.id,
    title: "Execute real APInex business mission",
    assigneeId: "worker-c2",
    successCriteria: "Return APINEX_OK",
    provider: route.provider,
    model: route.model,
  });

  assert.equal(execution.task.status, "completed");
  assert.equal(execution.task.assigneeSource, "starnet");
  assert.equal(execution.task.execution.modelRoute.provider, "apinex");
  assert.equal(execution.task.execution.modelRoute.model, route.model);
  assert.equal(execution.result.content, output.trim());

  console.log(JSON.stringify({
    phase: "C2",
    provider: route.provider,
    model: route.model,
    free: route.free,
    catalogCount: catalog.modelCount,
    responseVerified: true,
    starForgeTaskCompleted: true,
    source: "starforge-governed-real-apinex-mission",
  }, null, 2));
});
