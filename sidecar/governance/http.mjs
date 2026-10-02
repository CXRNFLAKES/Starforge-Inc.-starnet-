import { readFile } from "node:fs/promises";
import { join } from "node:path";

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function safeMethod(req) {
  return String(req.method || "GET").toUpperCase();
}

function financeSummary(state) {
  const finance = state?.finance ?? {};
  const currency = String(finance.currency ?? "EUR").toUpperCase();
  let cash = Number(finance.openingCapital) || 0;
  let taxReserve = 0;
  let liabilities = 0;
  const entries = Array.isArray(finance.entries) ? finance.entries : [];

  for (const entry of entries) {
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount) || amount <= 0 || String(entry.currency ?? "").toUpperCase() !== currency) continue;
    switch (entry.kind) {
      case "capital-injection":
      case "revenue":
        cash += amount;
        break;
      case "expense":
        cash -= amount;
        break;
      case "tax-reserve":
        cash -= amount;
        taxReserve += amount;
        break;
      case "liability":
        liabilities += amount;
        break;
      case "liability-payment":
        cash -= amount;
        liabilities = Math.max(0, liabilities - amount);
        break;
      default:
        break;
    }
  }

  return {
    currency,
    openingCapital: Number(finance.openingCapital) || 0,
    cash,
    availableCash: Math.max(0, cash),
    taxReserve,
    liabilities,
    netOperatingCapital: Math.max(0, cash) - liabilities,
    entryCount: entries.length,
    source: "starforge-governed-company-ledger",
  };
}

export function makeStarForgeGovernanceHandler({ workspace, roster = new Map(), runsMeta = new Map() } = {}) {
  if (!workspace) throw new TypeError("StarForge governance workspace is required");
  const list = () => roster instanceof Map
    ? Array.from(roster.entries()).map(([id, value]) => ({ id, ...(value || {}) }))
    : Array.isArray(roster) ? roster : [];
  const runs = () => runsMeta instanceof Map
    ? Array.from(runsMeta.entries()).map(([id, value]) => ({ id, ...(value || {}) }))
    : Array.isArray(runsMeta) ? runsMeta : [];

  return async function handle(req, res) {
    const method = safeMethod(req);
    if (method !== "GET") return send(res, 405, { error: "Governance mobile bridge is read-only in test mode" });

    const url = new URL(req.url || "/", "http://starforge.local");
    if (url.pathname !== "/api/starforge/governance") return send(res, 404, { error: "Not found" });

    let persisted = null;
    try {
      const file = join(workspace, "state.json");
      persisted = JSON.parse(await readFile(file, "utf8"));
    } catch (_) {}

    const workers = list();
    const activeRuns = runs();
    const tasks = Array.isArray(persisted?.tasks) ? persisted.tasks : [];
    const starNetTasks = tasks.filter((task) => task.assigneeSource === "starnet");

    return send(res, 200, {
      ok: true,
      mode: "android-9-test",
      safe: true,
      readOnly: true,
      workspace,
      company: persisted,
      capital: financeSummary(persisted),
      workforce: {
        workers,
        count: workers.length,
        source: "starnet-live-roster",
      },
      activeRuns,
      execution: {
        taskCount: starNetTasks.length,
        inProgress: starNetTasks.filter((task) => task.status === "in-progress").length,
        completed: starNetTasks.filter((task) => task.status === "completed").length,
        failed: starNetTasks.filter((task) => task.status === "failed").length,
        blocked: starNetTasks.filter((task) => task.status === "blocked").length,
        recentTasks: starNetTasks.slice(-10),
        source: "starforge-governed-task-ledger",
      },
    });
  };
}
