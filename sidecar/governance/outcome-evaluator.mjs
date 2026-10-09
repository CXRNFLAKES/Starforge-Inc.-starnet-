function clone(value) { return value == null ? value : structuredClone(value); }
function numberFrom(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}
function targetFromObjective(objective) {
  const match = String(objective ?? "").match(/(?:make|earn|generate|reach|target)\s+(?:€|EUR|USD|\$|£)?\s*([\d,.]+)/i);
  return match ? numberFrom(match[1]) : null;
}
function taskEvidence(task) {
  const result = task?.result ?? task?.output ?? task?.evidence ?? null;
  const hasResult = result != null && (typeof result !== "string" || result.trim().length > 0);
  return { concrete: task?.success === true || task?.verified === true || hasResult, result };
}
export function makeOutcomeEvaluator({ minimumEvidence = 1 } = {}) {
  const evidenceMinimum = Math.max(1, Number(minimumEvidence) || 1);
  function evaluate({ mission, execution, iteration = 1 } = {}) {
    if (!mission?.id || !mission.objective) throw new Error("Outcome evaluator requires a valid mission");
    if (!execution || execution.status === "blocked") {
      return { status: "blocked", verified: false, reason: execution?.reason ?? "Mission execution was blocked",
        evidence: { iteration, executionStatus: execution?.status ?? "missing" } };
    }
    const tasks = Array.isArray(execution.tasks) ? execution.tasks : [];
    if (!tasks.length) return { status: "replan", verified: false, reason: "Mission produced no executable task evidence",
      evidence: { iteration, completedTasks: 0, evidenceCount: 0 } };
    const evidence = tasks.map(taskEvidence);
    const evidenceCount = evidence.filter(item => item.concrete).length;
    const failedTasks = tasks.filter(task => task?.success === false || task?.verified === false).length;
    const revenue = numberFrom(execution?.revenue ?? execution?.outcome?.revenue);
    const targetRevenue = targetFromObjective(mission.objective);
    const revenueVerified = targetRevenue == null ? null : revenue != null && revenue >= targetRevenue;
    if (failedTasks === tasks.length) return { status: "replan", verified: false, reason: "All mission tasks failed or remain unverified",
      evidence: { iteration, evidenceCount, failedTasks, revenue, targetRevenue, revenueVerified } };
    if (evidenceCount < evidenceMinimum) return { status: "replan", verified: false, reason: "Mission result lacks sufficient concrete evidence",
      evidence: { iteration, evidenceCount, failedTasks, revenue, targetRevenue, revenueVerified } };
    if (targetRevenue != null && revenueVerified !== true) return { status: "replan", verified: false,
      reason: revenue == null ? "Revenue target requires measurable revenue evidence" : `Revenue target not met: ${revenue} of ${targetRevenue}`,
      evidence: { iteration, evidenceCount, failedTasks, revenue, targetRevenue, revenueVerified } };
    if (failedTasks > 0) return { status: "replan", verified: false, reason: "Mission has unresolved task failures",
      evidence: { iteration, evidenceCount, failedTasks, revenue, targetRevenue, revenueVerified } };
    return { status: "complete", verified: true, reason: "Mission outcome met the governed verification criteria",
      evidence: { iteration, evidenceCount, failedTasks, revenue, targetRevenue, revenueVerified, completedTasks: tasks.length } };
  }
  return Object.freeze({ evaluate });
}
