import test from "node:test";
import assert from "node:assert/strict";
import { makeOpenAICompatibleProvider } from "../sidecar/providers/openai-compatible.js";

function response(models) {
  return new Response(JSON.stringify({ data: models }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("APInex free-model catalog exposes only explicitly zero-priced models", async () => {
  let calls = 0;
  const provider = makeOpenAICompatibleProvider({
    baseUrl: "https://api.apinex.test/v1",
    key: "test-key",
    freeModelsOnly: true,
    fetch: async (url) => {
      calls++;
      assert.equal(url, "https://api.apinex.test/v1/models");
      return response([
        { id: "free/model-a", pricing: { prompt: "0", completion: "0" } },
        { id: "paid/model-b", pricing: { prompt: "0.000001", completion: "0.000002" } },
        { id: "unknown/model-c" },
        { id: "partial-free/model-d", pricing: { prompt: "0", completion: "0.000001" } },
      ]);
    },
  });

  const models = await provider.listModels();
  assert.deepEqual(models.map(model => model.id), ["free/model-a"]);
  assert.equal(calls, 1);
});

test("free-model filtering does not treat missing or malformed pricing as free", async () => {
  const provider = makeOpenAICompatibleProvider({
    baseUrl: "https://api.apinex.test/v1",
    freeModelsOnly: true,
    fetch: async () => response([
      { id: "missing-price" },
      { id: "string-zero", pricing: { prompt: "0", completion: "0" } },
      { id: "bad-price", pricing: { prompt: "free", completion: "0" } },
    ]),
  });

  const models = await provider.listModels();
  assert.deepEqual(models.map(model => model.id), ["string-zero"]);
});

test("providers without the free-only policy keep their full catalog", async () => {
  const provider = makeOpenAICompatibleProvider({
    baseUrl: "https://provider.test/v1",
    fetch: async () => response([
      { id: "free/model-a", pricing: { prompt: "0", completion: "0" } },
      { id: "paid/model-b", pricing: { prompt: "0.000001", completion: "0.000002" } },
      { id: "unknown/model-c" },
    ]),
  });

  const models = await provider.listModels();
  assert.deepEqual(models.map(model => model.id), ["free/model-a", "paid/model-b", "unknown/model-c"]);
});
