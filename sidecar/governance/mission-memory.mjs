function clone(value) {
  return value == null ? value : structuredClone(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function key(value) {
  return text(value).toLowerCase();
}

function capabilitiesOf(worker) {
  return (Array.isArray(worker?.capabilities) ? worker.capabilities : Array.isArray(worker?.skills) ? worker.skills : [])
    .map(key).filter(Boolean);
}

export function makeMissionMemory({ maxEntries = 100 } = {}) {
  const entries = [];
  const limit = Math.max(1, Math.min(1000, Number(maxEntries) || 100));

  function record({
    mission,
    outcome = null,
    execution = null,
    decision = null,
    workers = [],
    compute = null,
    revenue = null,
    lesson = null,
  } = {}) {
    if (!mission?.id) throw new Error("Mission memory requires a mission id");
    const entry = {
      id: text(mission.id),
      objective: text(mission.objective),
      complexity: text(mission.complexity),
      risk: text(mission.risk),
      requiredCapabilities: [...new Set((mission.requiredCapabilities || []).map(key).filter(Boolean))],
      outcome: text(outcome || decision?.status),
      verified: decision?.verified === true || outcome === "completed",
      revenue: revenue ?? null,
      compute: clone(compute),
      workers: workers.map((worker) => ({
        id: text(worker?.id ?? worker?.agentId),
        name: text(worker?.name),
        capabilities: capabilitiesOf(worker),
      })).filter((worker) => worker.id),
      lesson: text(lesson),
      reason: text(decision?.reason),
      recordedAt: new Date().toISOString(),
    };
    const existing = entries.findIndex((item) => item.id === entry.id);
    if (existing >= 0) entries.splice(existing, 1);
    entries.unshift(entry);
    entries.splice(limit);
    return clone(entry);
  }

  function recall({ objective = "", capabilities = [], limit: requestedLimit = 5 } = {}) {
    const words = key(objective).split(/[^a-z0-9]+/).filter((word) => word.length > 2);
    const wanted = capabilities.map(key).filter(Boolean);
    const max = Math.max(1, Math.min(20, Number(requestedLimit) || 5));
    return clone(entries
      .map((entry) => {
        const objectiveScore = words.reduce((score, word) => score + (key(entry.objective).includes(word) ? 1 : 0), 0);
        const capabilityScore = wanted.reduce((score, capability) => score + (entry.requiredCapabilities.includes(capability) ? 2 : 0), 0);
        const successScore = entry.verified ? 1 : 0;
        return { entry, score: objectiveScore + capabilityScore + successScore };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map((item) => item.entry));
  }

  function stats() {
    const completed = entries.filter((entry) => entry.verified).length;
    return clone({
      entries: entries.length,
      completed,
      failedOrUnverified: entries.length - completed,
      successRate: entries.length ? completed / entries.length : 0,
    });
  }

  function snapshot() {
    return clone(entries);
  }

  return Object.freeze({ record, recall, stats, snapshot });
}
