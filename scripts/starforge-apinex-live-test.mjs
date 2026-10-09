import providerFactory from "../sidecar/providers/factory.js";
import { makeStarForgeModelRouter } from "../sidecar/governance/model-router.mjs";

const key = String(process.env.APINEX_API_KEY || "").trim();
if (!key) throw new Error("APINEX_API_KEY is required for the live APInex execution gate");

const router = makeStarForgeModelRouter();
const catalog = await router.discover({ provider: "apinex", key });
if (!catalog.models.length) throw new Error("APInex live catalog returned no free models");

const billingDenied = [];
const unusableResponses = [];
let verified = null;

for (const candidate of catalog.models) {
  const route = await router.resolve({ provider: "apinex", model: candidate.id, key });
  const provider = providerFactory.selectProvider({
    provider: route.provider,
    key,
    baseUrl: "https://api.apinex.bond/v1",
  });

  let output = "";
  let finishReason = null;
  try {
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
  } catch (error) {
    const detail = String(error?.message || error);
    if (/\\b402\\b|billing_error|only available with a subscription|subscription required/i.test(detail)) {
      billingDenied.push({ model: route.model, reason: detail.slice(0, 180) });
      console.warn("APInex free-catalog model requires subscription; trying next candidate:", route.model);
      continue;
    }
    throw error;
  }

  const normalized = output.trim();
  if (!/\\bAPINEX_OK\\b/.test(normalized)) {
    unusableResponses.push({ model: route.model, response: normalized.slice(0, 100) });
    console.warn("APInex free-catalog model returned no usable confirmation; trying next candidate:", route.model);
    continue;
  }

  verified = { route, finishReason };
  break;
}

if (!verified) {
  throw new Error(
    "No APInex free-catalog model completed live execution. " +
    "Subscription-denied models: " + JSON.stringify(billingDenied) +
    "; unusable responses: " + JSON.stringify(unusableResponses),
  );
}

console.log(JSON.stringify({
  provider: verified.route.provider,
  model: verified.route.model,
  free: verified.route.free,
  modelCount: catalog.modelCount,
  candidatesTried: billingDenied.length + unusableResponses.length + 1,
  subscriptionDeniedCount: billingDenied.length,
  unusableResponseCount: unusableResponses.length,
  responseVerified: true,
  finishReason: verified.finishReason,
  source: "starforge-governed-starnet-provider",
}, null, 2));

// Keep the live execution gate observable as a normal branch push workflow check.
