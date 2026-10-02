import { makeStarNetAdapter } from "./starnet-adapter.mjs";

export function makeStarNetRuntimeBridge({ baseUrl = "", token = "", fetchImpl = globalThis.fetch } = {}) {
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

  const adapter = makeStarNetAdapter({
    roster: async () => {
      const body = await request("/api/roster");
      return Array.isArray(body?.agents) ? body.agents : [];
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

  return Object.freeze({ baseUrl: root, listWorkers: () => adapter.listWorkers(), delegateTask: (...args) => adapter.delegateTask(...args), inspectWorkforce: async ({ activeRuns = [] } = {}) => {
    const workers = adapter.listWorkers();
    const working = new Set(activeRuns.map((run) => String(run.agentId ?? "")));
    const enriched = workers.map((worker) => ({ ...worker, status: working.has(worker.id) ? "working" : "idle" }));
    return {
      source: "live-runtime",
      workerCount: enriched.length,
      counts: {
        working: enriched.filter((w) => w.status === "working").length,
        idle: enriched.filter((w) => w.status === "idle").length,
      },
      workers: enriched,
      statusSource: activeRuns.length ? "runtime-active-runs" : "roster-plus-active-runs",
    };
  }});
}
