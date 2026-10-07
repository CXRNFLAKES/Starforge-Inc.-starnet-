import { randomUUID } from "node:crypto";

const PROTECTED_NAMES = new Set(["overseer"]);

function clone(value) { return structuredClone(value); }

function capabilitySet(worker = {}) {
  return new Set(
    (Array.isArray(worker.capabilities) ? worker.capabilities : Array.isArray(worker.skills) ? worker.skills : [])
      .map((value) => String(value).trim().toLowerCase()).filter(Boolean),
  );
}

function scoreWorker(worker, required) {
  const caps = capabilitySet(worker);
  const matched = required.filter((capability) => caps.has(capability)).length;
  const load = Number(worker.activeTaskCount ?? worker.taskCount ?? worker.load ?? 0);
  return matched * 100 - Math.max(0, load);
}

export function makeWorkforceAllocator({ starnet, protectedWorkerIds = [], protectedWorkerNames = ["Overseer"] } = {}) {
  if (!starnet || (typeof starnet.listWorkers !== "function" && typeof starnet.listWorkersAsync !== "function")) {
    throw new Error("makeWorkforceAllocator requires a StarNet roster adapter");
  }

  const protectedIds = new Set(protectedWorkerIds.map((id) => String(id).trim()).filter(Boolean));
  const protectedNames = new Set([...PROTECTED_NAMES, ...protectedWorkerNames.map((name) => String(name).trim().toLowerCase()).filter(Boolean)]);

  async function roster() {
    const workers = typeof starnet.listWorkersAsync === "function" ? await starnet.listWorkersAsync() : await starnet.listWorkers();
    return Array.isArray(workers) ? workers : [];
  }

  function isProtected(worker) {
    const id = String(worker?.id ?? worker?.agentId ?? "").trim();
    const name = String(worker?.name ?? "").trim().toLowerCase();
    return protectedIds.has(id) || protectedNames.has(name) || worker?.protected === true;
  }

  async function allocate({ requiredCapabilities = [], maxWorkers = 6, objective = "", createMissing = true } = {}) {
    const required = [...new Set(requiredCapabilities.map((value) => String(value).trim().toLowerCase()).filter(Boolean))];
    const workers = await roster();
    const ranked = workers.filter((worker) => !isProtected(worker))
      .map((worker) => ({ worker, score: scoreWorker(worker, required) }))
      .sort((a, b) => b.score - a.score);

    const selected = [];
    const covered = new Set();
    for (const entry of ranked) {
      const caps = capabilitySet(entry.worker);
      const addsCoverage = required.some((capability) => !covered.has(capability) && caps.has(capability));
      if (addsCoverage || selected.length === 0) {
        selected.push(entry.worker);
        for (const capability of required) if (caps.has(capability)) covered.add(capability);
      }
      if (selected.length >= Math.max(1, Number(maxWorkers) || 1) || covered.size === required.length) break;
    }

    const missingCapabilities = required.filter((capability) => !covered.has(capability));
    const created = [];
    if (missingCapabilities.length && createMissing) {
      if (typeof starnet.createWorker !== "function") {
        return clone({ status: "blocked", selected, created, missingCapabilities, protectedWorkers: workers.filter(isProtected), objective: String(objective), reason: "StarNet worker creation adapter is unavailable; fail closed" });
      }
      for (const capability of missingCapabilities) {
        if (selected.length + created.length >= Math.max(1, Number(maxWorkers) || 1)) break;
        const result = await starnet.createWorker({
          id: randomUUID(),
          name: "StarForge " + capability + " worker",
          capabilities: [capability],
          objective: String(objective),
          source: "starforge-dynamic-allocation",
        });
        if (!result || typeof result !== "object" || !String(result.id ?? result.agentId ?? "").trim()) {
          throw new Error("StarNet worker creation returned an invalid worker");
        }
        created.push(result);
        covered.add(capability);
      }
    }

    return clone({
      status: required.every((capability) => covered.has(capability)) ? "allocated" : "partial",
      selected, created,
      missingCapabilities: required.filter((capability) => !covered.has(capability)),
      protectedWorkers: workers.filter(isProtected),
      objective: String(objective),
    });
  }

  async function retireNonProtected({ excludeIds = [] } = {}) {
    if (typeof starnet.removeWorker !== "function") {
      return { status: "blocked", removed: [], remaining: await roster(), reason: "StarNet worker removal adapter is unavailable" };
    }
    const excluded = new Set(excludeIds.map((id) => String(id).trim()));
    const workers = await roster();
    const removed = [];
    for (const worker of workers) {
      const id = String(worker.id ?? worker.agentId ?? "").trim();
      if (!id || isProtected(worker) || excluded.has(id)) continue;
      await starnet.removeWorker(id);
      removed.push(id);
    }
    return { status: "completed", removed, remaining: await roster() };
  }

  return Object.freeze({ roster, allocate, retireNonProtected, isProtected });
}
