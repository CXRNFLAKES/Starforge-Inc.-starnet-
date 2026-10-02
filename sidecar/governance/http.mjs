import { readFile } from "node:fs/promises";
import { join } from "node:path";

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function safeMethod(req) {
  return String(req.method || "GET").toUpperCase();
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

    return send(res, 200, {
      ok: true,
      mode: "android-9-test",
      safe: true,
      readOnly: true,
      workspace,
      company: persisted,
      workforce: { workers: list(), count: list().length },
      activeRuns: runs(),
    });
  };
}
