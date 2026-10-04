import { makeStarNetRuntimeBridge } from "./starnet-runtime.mjs";

export async function connectStarNetRuntime({
  baseUrl = "",
  token = "",
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
} = {}) {
  if (!baseUrl) {
    return Object.freeze({ connected: false, source: "unconfigured", reason: "StarNet runtime URL is not configured", bridge: null });
  }

  const bridge = makeStarNetRuntimeBridge({ baseUrl, token, fetchImpl });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || 5000));
  try {
    const probe = await bridge.probeRuntime({ signal: controller.signal });
    if (!probe?.connected || probe.source !== "live-runtime") {
      return Object.freeze({ connected: false, source: "runtime-rejected", reason: "StarNet runtime did not report a live-runtime connection", bridge: null });
    }
    return Object.freeze({ connected: true, source: "live-runtime", workerCount: probe.workerCount, bridge });
  } catch (error) {
    return Object.freeze({
      connected: false,
      source: "runtime-unreachable",
      reason: error?.name === "AbortError" ? "StarNet runtime probe timed out" : String(error?.message || error),
      bridge: null,
    });
  } finally {
    clearTimeout(timer);
  }
}
