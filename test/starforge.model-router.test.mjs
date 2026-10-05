import test from "node:test";
import assert from "node:assert/strict";
import { makeStarForgeModelRouter } from "../sidecar/governance/model-router.mjs";

function apinexFetch(url, options = {}) {
  assert.equal(options.headers?.Authorization, "Bearer test-apinex-key");
  if (url === "https://api.apinex.bond/v1/models") {
    return Promise.resolve(new Response(JSON.stringify({
      data: [
        { id: "free/gpt-5.6-luna", name: "Free GPT 5.6 Luna", pricing: { prompt: 0, completion: 0 } },
        { id: "free/claude-sonnet-4.6", name: "Free Claude Sonnet 4.6", pricing: { prompt: 0, completion: 0 } },
        { id: "gpt-5.6-luna", name: "Paid GPT 5.6 Luna", pricing: { prompt: 0.01, completion: 0.02 } },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } }));
  }
  throw new Error("unexpected APInex URL: " + url);
}

test("StarForge model router discovers APInex free models through StarNet's provider factory", async () => {
  const router = makeStarForgeModelRouter();
  const catalog = await router.discover({
    provider: "apinex",
    key: "test-apinex-key",
    fetchImpl: apinexFetch,
  });
  assert.equal(catalog.provider, "apinex");
  assert.equal(catalog.source, "live-provider-catalog");
  assert.equal(catalog.freeOnly, true);
  assert.deepEqual(catalog.models.map(model => model.id), [
    "free/gpt-5.6-luna",
    "free/claude-sonnet-4.6",
  ]);
});

test("StarForge model router resolves an available APInex free model", async () => {
  const router = makeStarForgeModelRouter();
  const route = await router.resolve({
    provider: "apinex",
    model: "free/gpt-5.6-luna",
    key: "test-apinex-key",
    fetchImpl: apinexFetch,
  });
  assert.deepEqual(route, {
    allowed: true,
    provider: "apinex",
    model: "free/gpt-5.6-luna",
    source: "starforge-governed-model-router",
    catalogSource: "live-provider-catalog",
    free: true,
  });
});

test("StarForge model router fails closed for unavailable or paid APInex models", async () => {
  const router = makeStarForgeModelRouter();
  await assert.rejects(
    router.resolve({
      provider: "apinex",
      model: "gpt-5.6-luna",
      key: "test-apinex-key",
      fetchImpl: apinexFetch,
    }),
    /model router rejected unavailable model/,
  );
  await assert.rejects(
    router.resolve({
      provider: "apinex",
      model: "free/not-in-catalog",
      key: "test-apinex-key",
      fetchImpl: apinexFetch,
    }),
    /model router rejected unavailable model/,
  );
});
