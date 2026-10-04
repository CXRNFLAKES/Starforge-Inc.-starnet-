import providerFactory from "../providers/factory.js";

const FREE_MODEL_PREFIX = "free/";

function normalizeProvider(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeModel(value) {
  return String(value || "").trim();
}

function isFreeModel(id) {
  return normalizeModel(id).startsWith(FREE_MODEL_PREFIX);
}

export function makeStarForgeModelRouter({
  factory = providerFactory,
  freeOnly = true,
  allowedProviders = null,
} = {}) {
  if (!factory || typeof factory.selectProvider !== "function") {
    throw new TypeError("StarForge model router requires the StarNet provider factory");
  }

  const allowed = Array.isArray(allowedProviders)
    ? new Set(allowedProviders.map(normalizeProvider).filter(Boolean))
    : null;

  function assertProvider(provider) {
    const id = normalizeProvider(provider);
    if (!id) throw new Error("model router requires a provider");
    if (allowed && !allowed.has(id)) {
      throw new Error("model router provider is not authorized: " + id);
    }
    const profile = typeof factory.getProviderProfile === "function"
      ? factory.getProviderProfile(id)
      : null;
    if (!profile) throw new Error("model router provider is unknown: " + id);
    return { id, profile };
  }

  async function discover({
    provider = "apinex",
    key = "",
    token = "",
    fetchImpl = globalThis.fetch,
    baseUrl = "",
    headers,
  } = {}) {
    const { id, profile } = assertProvider(provider);
    const selected = factory.selectProvider({
      provider: id,
      key,
      token,
      fetch: fetchImpl,
      baseUrl: baseUrl || profile.baseUrl,
      headers,
    });
    if (!selected || typeof selected.listModels !== "function") {
      throw new Error("model router provider cannot discover models: " + id);
    }
    const models = await selected.listModels();
    const normalized = Array.isArray(models)
      ? models.filter(model => model && normalizeModel(model.id))
      : [];
    const available = freeOnly
      ? normalized.filter(model => isFreeModel(model.id))
      : normalized;
    return Object.freeze({
      provider: id,
      source: "live-provider-catalog",
      freeOnly,
      modelCount: available.length,
      models: available.map(model => Object.freeze({ ...model })),
    });
  }

  async function resolve({
    provider = "apinex",
    model,
    key = "",
    token = "",
    fetchImpl = globalThis.fetch,
    baseUrl = "",
    headers,
  } = {}) {
    const requestedModel = normalizeModel(model);
    if (!requestedModel) throw new Error("model router requires a model");
    const catalog = await discover({
      provider,
      key,
      token,
      fetchImpl,
      baseUrl,
      headers,
    });
    const match = catalog.models.find(candidate => candidate.id === requestedModel);
    if (!match) {
      throw new Error(
        "model router rejected unavailable model: " +
        requestedModel +
        " on provider " +
        catalog.provider,
      );
    }
    return Object.freeze({
      allowed: true,
      provider: catalog.provider,
      model: match.id,
      source: "starforge-governed-model-router",
      catalogSource: catalog.source,
      free: isFreeModel(match.id),
    });
  }

  return Object.freeze({
    discover,
    resolve,
  });
}

export { FREE_MODEL_PREFIX, isFreeModel };
