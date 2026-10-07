import { makeStarNetAdapter } from "./starnet-adapter.mjs";

export function makeStarNetRuntimeBridge({
  baseUrl = "",
  token = "",
  fetchImpl = globalThis.fetch,
  router = null,
} = {}) {
  if (!baseUrl) return null;
  if (typeof fetchImpl !== "function") throw new TypeError("StarNet runtime bridge requires fetch");
  const root = String(baseUrl).replace(/\/+$/, "");

  async function request(path) {
    const headers = { accept: "application/json" };
    if (token) headers["X-StarNet-Token"] = String(token);
    const response = await fetchImpl(root + path, { headers });
    if (!response.ok) throw new Error(`StarNet runtime request failed: ${response.status}`);
    return response.json();
  }

  async function mutate(path, body) {
    const response = await fetchImpl(root + path, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...(token ? { "X-StarNet-Token": String(token) } : {}) },
      body: JSON.stringify(body ?? {}),
    });
    if (!response.ok) throw new Error(`StarNet runtime mutation failed: ${response.status}`);
    return response.json();
  }

  const adapter = makeStarNetAdapter({
    roster: async () => {
      const body = await request("/api/runtime/agent");
      return Array.isArray(body?.agents)
        ? body.agents.map((agent) => ({
            ...agent,
            id: String(agent?.id ?? agent?.agentId ?? "").trim(),
          })).filter((agent) => agent.id)
        : [];
    },
    dispatch: async (payload) => {
      const response = await fetchImpl(root + "/api/team/dispatch", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", ...(token ? { "X-StarNet-Token": String(token) } : {}) },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`StarNet dispatch request failed: ${response.status}`);
      return response.json();
    },
  });

  async function probeRuntime() {
    const body = await request("/api/runtime/agent");
    if (!body || !Array.isArray(body.agents)) {
      throw new Error("StarNet runtime returned an invalid roster payload");
    }
    return Object.freeze({
      connected: true,
      source: "live-runtime",
      workerCount: body.agents.length,
    });
  }

  async function inspectWorkforce({ activeRuns = [] } = {}) {
    // Remote StarNet rosters are asynchronous; do not route them through the synchronous
    // adapter roster accessor. The adapter remains the governed dispatch boundary.
    const body = await request("/api/runtime/agent");
    const workers = Array.isArray(body?.agents)
      ? body.agents.map((worker) => ({
          ...worker,
          id: String(worker?.id ?? worker?.agentId ?? "").trim(),
        })).filter((worker) => worker.id)
      : [];
    const working = new Map(
      (Array.isArray(activeRuns) ? activeRuns : [])
        .filter((run) => run && run.agentId != null)
        .map((run) => [String(run.agentId), run]),
    );
    const enriched = workers
      .map((worker) => ({
        ...worker,
        id: String(worker.id ?? worker.agentId ?? "").trim(),
        status: working.has(String(worker.id ?? worker.agentId ?? "")) ? "working" : "idle",
        activeRun: working.get(String(worker.id ?? worker.agentId ?? "")) ?? null,
      }))
      .filter((worker) => worker.id);
    return {
      source: "live-runtime",
      workerCount: enriched.length,
      counts: {
        total: enriched.length,
        working: enriched.filter((w) => w.status === "working").length,
        idle: enriched.filter((w) => w.status === "idle").length,
      },
      workers: enriched,
      statusSource: activeRuns.length ? "runtime-active-runs" : "runtime-roster",
    };
  }

  async function routeModel(request = {}) {
    if (!router || typeof router.resolve !== "function") {
      throw new Error("StarNet model router is not configured");
    }
    return router.resolve(request);
  }

  async function removeWorker(agentId) {
    const result = await mutate("/api/agent/delete", { agentId: String(agentId) });
    if (!result || result.error || result.ok === false) {
      throw new Error(String(result?.error || "StarNet worker removal was refused"));
    }
    return { id: String(agentId), removed: true, result };
  }

  return Object.freeze({
    baseUrl: root,
    probeRuntime,
    listWorkers: async () => {
      const body = await request("/api/runtime/agent");
      return Array.isArray(body?.agents)
        ? body.agents.map((agent) => ({
            ...agent,
            id: String(agent?.id ?? agent?.agentId ?? "").trim(),
          })).filter((agent) => agent.id)
        : [];
    },
    listWorkersAsync: () => adapter.listWorkersAsync(),
    delegateTask: (...args) => adapter.delegateTask(...args),
    summonWorker: (...args) => adapter.summonWorker(...args),
    removeWorker,
    inspectWorkforce,
    routeModel,
  });
}
