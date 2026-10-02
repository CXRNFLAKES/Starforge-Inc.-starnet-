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

  async function inspectWorkforce({ activeRuns = [] } = {}) {
    // Remote StarNet rosters are asynchronous; do not route them through the synchronous
    // adapter roster accessor. The adapter remains the governed dispatch boundary.
    const body = await request("/api/roster");
    const workers = Array.isArray(body?.agents) ? body.agents : [];
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

  return Object.freeze({
    baseUrl: root,
    listWorkers: () => adapter.listWorkers(),
    delegateTask: (...args) => adapter.delegateTask(...args),
    inspectWorkforce,
  });
}
