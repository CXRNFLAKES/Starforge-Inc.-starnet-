import test from "node:test";
import assert from "node:assert/strict";
import providerFactory from "../sidecar/providers/factory.js";
import { makeStarForgeModelRouter } from "../sidecar/governance/model-router.mjs";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

test("C2 executes and independently verifies a real StarForge mission through the governed APInex path", async () => {
  const key = String(process.env.APINEX_API_KEY || "").trim();
  assert.ok(key, "APINEX_API_KEY is required for the C2 live business execution gate");

  const baseUrl = "https://api.apinex.bond/v1";
  const router = makeStarForgeModelRouter();
  const catalog = await router.discover({ provider: "apinex", key, baseUrl });
  assert.ok(catalog.models.length > 0, "APInex must expose at least one governed free model");

  // A catalog's "free/" label is not proof that the account can actually use a model.
  // Probe candidates in catalog order and fall through only for explicit subscription/billing
  // denials; other provider errors remain hard failures so outages are not hidden.
  let route = null;
  let provider = null;
  let output = "";
  const billingDenied = [];
  for (const candidate of catalog.models) {
    const candidateRoute = await router.resolve({
      provider: "apinex", model: candidate.id, key, baseUrl,
    });
    assert.equal(candidateRoute.allowed, true);
    assert.equal(candidateRoute.provider, "apinex");
    assert.ok(candidateRoute.model.startsWith("free/"));

    const candidateProvider = providerFactory.selectProvider({
      provider: candidateRoute.provider, key, baseUrl,
    });
    let candidateOutput = "";
    try {
      for await (const event of candidateProvider.stream({
        model: candidateRoute.model,
        messages: [{ role: "user", content: "You are executing a StarForge business mission. Reply with exactly APINEX_OK." }],
        reasoningEffort: "none",
        max_tokens: 16,
        isTask: true,
      })) {
        if (event?.type === "text") candidateOutput += String(event.delta || "");
      }
    } catch (error) {
      const detail = String(error?.message || error);
      if (/\b(?:402|billing_error|subscription required|only with a subscription)\b/i.test(detail)) {
        billingDenied.push(candidateRoute.model);
        continue;
      }
      throw error;
    }
    route = candidateRoute;
    provider = candidateProvider;
    output = candidateOutput;
    break;
  }

  assert.ok(
    route,
    "No APInex free-catalog model is usable by this account; subscription/billing denied: " +
      (billingDenied.join(", ") || "no candidate completed"),
  );
  assert.match(output.trim(), /\bAPINEX_OK\b/);

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
      ...request, key, baseUrl,
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
    executionKey: "c2-real-apinex-business-mission",
  });

  assert.equal(execution.task.status, "completed");
  assert.equal(execution.task.assigneeSource, "starnet");
  assert.equal(execution.task.execution.modelRoute.provider, "apinex");
  assert.equal(execution.task.execution.modelRoute.model, route.model);
  assert.equal(execution.result.content, output.trim());

  // The PA/Overseer independently verifies the completed StarNet outcome before
  // it can be treated as a verified business result.
  const verification = operations.verifyBusinessOutcome(ROLES.PA, {
    taskId: execution.task.id,
    claim: "The governed APInex mission returned the requested APINEX_OK result.",
    evidence: [{
      source: "live-apinex-execution",
      provider: route.provider,
      model: route.model,
      supports: true,
      response: output.trim(),
    }],
  });

  assert.equal(verification.verified, true);
  assert.equal(verification.label, "VERIFIED FACT");
  assert.equal(company.snapshot().tasks[0].businessOutcome.outcomeId, verification.outcomeId);

  console.log(JSON.stringify({
    phase: "C2",
    provider: route.provider,
    model: route.model,
    free: route.free,
    catalogCount: catalog.modelCount,
    billingDeniedCount: billingDenied.length,
    responseVerified: true,
    starForgeTaskCompleted: true,
    overseerBusinessOutcomeVerified: true,
    source: "starforge-governed-real-apinex-mission",
  }, null, 2));
});
