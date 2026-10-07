function clone(value) {
  return value == null ? value : structuredClone(value);
}

const TYPES = Object.freeze(["strategy","worker","compute","external","evidence"]);

function text(value) {
  return String(value ?? "").trim().toLowerCase();
}

function classifyTask(task = {}) {
  const reason = text(task.reason ?? task.error ?? task.message ?? task.result);
  if (task.computeError === true || /compute|provider|model|quota|rate.?limit/.test(reason)) return "compute";
  if (task.externalBlock === true || /external|marketplace|api unavailable|access denied|permission/.test(reason)) return "external";
  if (task.evidenceMissing === true || /evidence|verification|unverified|proof/.test(reason)) return "evidence";
  if (task.workerFailure === true || /worker|agent|execution failed|timeout/.test(reason)) return "worker";
  return "strategy";
}

function classify({ execution = null, decision = null } = {}) {
  const tasks = Array.isArray(execution?.tasks) ? execution.tasks : [];
  const failures = tasks.filter(task => task?.success === false || task?.verified === false || task?.failed === true);
  if (!failures.length && decision?.status === "replan") {
    return { type: "strategy", confidence: 0.5, failures: [], reason: String(decision.reason ?? "Mission requires replanning") };
  }
  const counts = new Map();
  for (const task of failures) {
    const type = classifyTask(task);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a,b) => b[1] - a[1]);
  const type = ranked[0]?.[0] ?? "strategy";
  return {
    type,
    confidence: failures.length ? ranked[0][1] / failures.length : 0,
    failures: failures.map(task => ({ id: task?.id ?? null, type: classifyTask(task), reason: task?.reason ?? task?.error ?? task?.message ?? null })),
    reason: String(decision?.reason ?? "Mission failure classified for recovery"),
  };
}

function recoveryFor(type) {
  return {
    strategy: { action: "change-strategy", createMissingWorkers: false, retry: true },
    worker: { action: "replace-worker", createMissingWorkers: true, retry: true },
    compute: { action: "change-compute-route", createMissingWorkers: false, retry: true },
    external: { action: "wait-or-change-external-path", createMissingWorkers: false, retry: false },
    evidence: { action: "collect-verification-evidence", createMissingWorkers: false, retry: true },
  }[type] ?? { action: "change-strategy", createMissingWorkers: false, retry: true };
}

export function makeFailureIntelligence({ maxRecoveries = 3 } = {}) {
  const limit = Math.max(1, Math.min(10, Number(maxRecoveries) || 3));

  function analyze(input = {}) {
    const classification = classify(input);
    const recovery = recoveryFor(classification.type);
    return clone({
      ...classification,
      recovery,
      autonomousRecoveryAllowed: recovery.retry === true,
      escalationRequired: classification.type === "external" || classification.confidence < 0.5,
      maxRecoveries: limit,
    });
  }

  return Object.freeze({ analyze, classify });
}
