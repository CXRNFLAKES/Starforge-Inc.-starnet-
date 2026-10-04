import { makeStarForgeModelRouter } from "../sidecar/governance/model-router.mjs";

const key = String(process.env.APINEX_API_KEY || "").trim();
if (!key) throw new Error("APINEX_API_KEY is required for the live APInex discovery gate");

const router = makeStarForgeModelRouter();
const catalog = await router.discover({ provider: "apinex", key });
if (!catalog.models.length) throw new Error("APInex live catalog returned no free models");

const selected = catalog.models[0];
const route = await router.resolve({ provider: "apinex", model: selected.id, key });

console.log(JSON.stringify({
  provider: route.provider,
  model: route.model,
  free: route.free,
  modelCount: catalog.modelCount,
  source: route.source,
}, null, 2));
