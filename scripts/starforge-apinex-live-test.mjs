import providerFactory from "../sidecar/providers/factory.js";
import { makeStarForgeModelRouter } from "../sidecar/governance/model-router.mjs";

const key = String(process.env.APINEX_API_KEY || "").trim();
if (!key) throw new Error("APINEX_API_KEY is required for the live APInex execution gate");

const router = makeStarForgeModelRouter();
const catalog = await router.discover({ provider: "apinex", key });
if (!catalog.models.length) throw new Error("APInex live catalog returned no free models");

const selected = catalog.models[0];
const route = await router.resolve({ provider: "apinex", model: selected.id, key });

const provider = providerFactory.selectProvider({
  provider: route.provider,
  key,
  baseUrl: "https://api.apinex.bond/v1",
});

let output = "";
let finishReason = null;
for await (const event of provider.stream({
  model: route.model,
  messages: [{ role: "user", content: "Reply with exactly APINEX_OK" }],
  reasoningEffort: "none",
  max_tokens: 16,
  isTask: false,
})) {
  if (event?.type === "text") output += String(event.delta || "");
  if (event?.type === "done") finishReason = event.finishReason ?? null;
}

const normalized = output.trim();
if (!/\bAPINEX_OK\b/.test(normalized)) {
  throw new Error("APInex live execution returned an unexpected response: " + normalized.slice(0, 120));
}

console.log(JSON.stringify({
  provider: route.provider,
  model: route.model,
  free: route.free,
  modelCount: catalog.modelCount,
  responseVerified: true,
  finishReason,
  source: "starforge-governed-starnet-provider",
}, null, 2));

// Keep the live execution gate observable as a normal branch push workflow check.
