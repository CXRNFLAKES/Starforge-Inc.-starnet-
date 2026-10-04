import test from "node:test";
import assert from "node:assert/strict";
import providerFactory from "../sidecar/providers/factory.js";
import { makeStarForgeModelRouter } from "../sidecar/governance/model-router.mjs";
import { makeStarNetRuntimeBridge } from "../sidecar/governance/starnet-runtime.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

test("D1 production APInex path uses the existing StarNet adapter seam", async () => {
  const profile = providerFactory.getProviderProfile("apinex");
  assert.equal(profile.id, "apinex");
  assert.equal(profile.live, true);
  assert.equal(profile.adapter, "openai-compatible");
  assert.equal(profile.baseUrl, "https://api.apinex.bond/v1");
  assert.deepEqual(profile.keyEnv, ["APINEX_API_KEY"]);
  assert.equal(profile.modelsPath, "/models");

  const key = String(process.env.APINEX_API_KEY || "").trim();
  if (!key) {
    assert.ok(true, "live APInex execution is deferred to the existing conditional C2 gate when no CI credential is present");
    return;
  }

  const router = makeStarForgeModelRouter({ allowedProviders: ["apinex"] });
  const catalog = await router.discover({
    provider: "apinex",
    key,
    baseUrl: profile.baseUrl,
  });
  assert.ok(catalog.models.length > 0, "production APInex catalog must expose at least one governed free model");

  const route = await router.resolve({
    provider: "apinex",
    model: catalog.models[0].id,
    key,
    baseUrl: profile.baseUrl,
  });
  assert.equal(route.allowed, true);
  assert.equal(route.source, "starforge-governed-model-router");

  const provider = providerFactory.selectProvider({
    provider: route.provider,
    key,
    baseUrl: profile.baseUrl,
  });
  assert.equal(typeof provider.stream, "function");

  console.log(JSON.stringify({
    phase: "D1",
    provider: route.provider,
    model: route.model,
    catalogCount: catalog.modelCount,
    source: "starforge-production-apinex-provider-seam",
  }, null, 2));
});

test("D1 live StarNet runtime bridge remains the governed execution boundary", async () => {
  const calls = [];
  const bridge = makeStarNetRuntimeBridge({
    baseUrl: "http://starnet-production-contract.test",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, method: options.method || "GET", body: options.body || null });
      if (url.endsWith("/api/roster")) {
        return new Response(JSON.stringify({
          agents: [{ id: "production-worker", name: "Production Worker", model: "free/gpt-5.6-luna" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.endsWith("/api/team/dispatch")) {
        const payload = JSON.parse(options.body);
        assert.equal(payload.assigneeId, "production-worker");
        assert.equal(payload.context.modelRoute.provider, "apinex");
        assert.equal(payload.context.modelRoute.source, "starforge-governed-model-router");
        return new Response(JSON.stringify({
          worker: { id: "production-worker", name: "Production Worker" },
          result: { content: "production execution contract verified" },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    },
  });

  const route = await bridge.routeModel({
    provider: "apinex",
    model: "free/gpt-5.6-luna",
  }).catch(() => null);
  assert.equal(route, null);

  const guardedBridge = makeStarNetRuntimeBridge({
    baseUrl: "http://starnet-production-contract.test",
    fetchImpl: async (url, options = {}) => {
      if (url.endsWith("/api/roster")) {
        return new Response(JSON.stringify({
          agents: [{ id: "production-worker", name: "Production Worker", model: "free/gpt-5.6-luna" }],
        }), { status: 200 });
      }
      if (url.endsWith("/api/team/dispatch")) {
        const payload = JSON.parse(options.body);
        assert.equal(payload.context.modelRoute.provider, "apinex");
        assert.equal(payload.context.modelRoute.source, "starforge-governed-model-router");
        return new Response(JSON.stringify({
          worker: { id: "production-worker", name: "Production Worker" },
          result: { content: "production execution contract verified" },
        }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    },
    router: {
      resolve: async request => ({
        allowed: true,
        provider: request.provider,
        model: request.model,
        source: "starforge-governed-model-router",
      }),
    },
  });

  const resolved = await guardedBridge.routeModel({
    provider: "apinex",
    model: "free/gpt-5.6-luna",
  });
  assert.equal(resolved.allowed, true);

  const result = await guardedBridge.delegateTask(ROLES.VICE_CEO, {
    id: "d1-task",
    projectId: "d1-project",
    assigneeId: "production-worker",
    title: "D1 production contract",
    successCriteria: "Verify governed production dispatch",
    context: { modelRoute: resolved },
  });
  assert.equal(result.result.content, "production execution contract verified");
});
