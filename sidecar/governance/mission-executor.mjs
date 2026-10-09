import { randomUUID } from "node:crypto";

function clone(value) { return value == null ? value : structuredClone(value); }
function id(value, label) { const result = String(value ?? "").trim(); if (!result) throw new Error(`Mission executor requires ${label}`); return result; }
function phaseCapabilities(phase) {
  const values = Array.isArray(phase?.requiredCapabilities) ? phase.requiredCapabilities : phase?.capability ? [phase.capability] : [];
  return values.map(value => String(value).trim().toLowerCase()).filter(Boolean);
}
function workerCapabilities(worker) {
  return new Set((Array.isArray(worker?.capabilities) ? worker.capabilities : Array.isArray(worker?.skills) ? worker.skills : [])
    .map(value => String(value).trim().toLowerCase()).filter(Boolean));
}
function chooseWorker(workers, phase, used = new Set()) {
  const required = phaseCapabilities(phase);
  return [...workers].filter(worker => !used.has(String(worker?.id ?? worker?.agentId ?? "")))
    .map(worker => {
      const caps = workerCapabilities(worker);
      const matched = required.filter(capability => caps.has(capability)).length;
      return { worker, score: matched * 100 - Number(worker?.activeTaskCount ?? worker?.load ?? 0) };
    }).sort((a,b) => b.score - a.score)[0]?.worker ?? null;
}

function parseWorkerOutcome(result) {
  const direct = result && typeof result === "object" ? result : {};
  let payload = direct;
  if (typeof direct.content === "string") {
    try {
      const parsed = JSON.parse(direct.content);
      if (parsed && typeof parsed === "object") payload = parsed;
    } catch (_) {}
  }
  const revenue = Number(payload.revenueUsd ?? payload.revenue ?? direct.revenueUsd ?? direct.revenue);
  return {
    success: payload.success !== false,
    verified: payload.verified === true || payload.success === true,
    revenueUsd: Number.isFinite(revenue) && revenue >= 0 ? revenue : 0,
    evidence: payload.evidence ?? payload.summary ?? direct.summary ?? direct.content ?? null,
  };
}

export function makeMissionExecutor({ planner, allocator, starnet, computeEconomy = null, computeCandidates = [] } = {}) {
  if (!planner || typeof planner.intake !== "function" || typeof planner.plan !== "function") throw new Error("makeMissionExecutor requires a mission planner");
  if (!allocator || typeof allocator.allocate !== "function") throw new Error("makeMissionExecutor requires a workforce allocator");
  if (!starnet || typeof starnet.delegateTask !== "function") throw new Error("makeMissionExecutor requires a StarNet delegation adapter");

  async function execute({ objective, constraints = [], budget = null, deadline = null, actor = "cho", availableWorkers = [], maxWorkers = 20,
    createMissing = true, projectId = null, outcomeEvidence = null, recovery = null, mission = null, plan = null } = {}) {
    const activeMission = mission ?? planner.intake({ objective, constraints, budget, deadline, actor });
    const activePlan = plan ?? planner.plan(activeMission, { availableWorkers, maxWorkers, outcomeEvidence });
    const allocation = await allocator.allocate({ requiredCapabilities: activeMission.requiredCapabilities, maxWorkers, objective: activeMission.objective, createMissing });
    if (allocation.status === "blocked") return clone({ status:"blocked", mission:activeMission, plan:activePlan, allocation, tasks:[] });
    const workers = [...(allocation.selected || []), ...(allocation.created || [])];
    const used = new Set(); const tasks = []; const computeRecords = []; let revenueUsd = 0;
    for (const phase of activePlan.phases || []) {
      const worker = chooseWorker(workers, phase, used);
      if (!worker) return clone({ status:"blocked", mission:activeMission, plan:activePlan, allocation, tasks, reason:`No unused worker has the required capability for phase: ${String(phase.title ?? phase.id ?? "unknown")}` });
      const assigneeId = id(worker.id ?? worker.agentId, "worker id"); used.add(assigneeId);
      const recoveryContext = recovery?.type ? `Recovery directive: ${recovery.recovery?.action ?? "replan"} (failure type: ${recovery.type}).` : "";
      const task = {
        id: randomUUID(), projectId: projectId ?? activeMission.id, missionId: activeMission.id, assigneeId,
        title: String(phase.title ?? phase.name ?? "Mission phase"),
        prompt: [
          `Mission objective: ${activeMission.objective}`,
          phase.title ? `Phase: ${phase.title}` : "",
          activeMission.constraints.length ? `Constraints: ${activeMission.constraints.join("; ")}` : "",
          activeMission.deadline ? `Deadline: ${activeMission.deadline}` : "",
          recoveryContext,
          outcomeEvidence?.confidence >= 0.4 && activeMission.risk !== "high" ? `Historical outcome evidence: ${JSON.stringify(outcomeEvidence.strategies?.slice(0, 3) ?? [])}` : "",
          "Report concrete findings, actions taken, blockers, and next recommendation.",
        ].filter(Boolean).join("\n\n"),
        successCriteria: "Return a concrete result that advances the governed mission.",
        context: JSON.stringify({ missionId:activeMission.id, risk:activeMission.risk, complexity:activeMission.complexity, recovery: recovery ? clone(recovery) : null }),
      };
      let reservation = null;
      if (computeEconomy) {
        const workerCandidate = worker.provider && worker.model
          ? [{ provider: worker.provider, model: worker.model, estimatedCost: Number(worker.estimatedCost ?? 0), quality: Number(worker.quality ?? 0) }]
          : [];
        const candidates = Array.isArray(computeCandidates) && computeCandidates.length ? computeCandidates : workerCandidate;
        reservation = await computeEconomy.requestCompute({
          missionId: activeMission.id,
          workerId: assigneeId,
          taskId: task.id,
          complexity: activeMission.complexity,
          candidates,
          reason: `Mission phase: ${task.title}`,
        });
      }
      let delegated;
      try {
        delegated = await starnet.delegateTask(actor, task);
      } catch (error) {
        if (reservation) computeEconomy.releaseCompute(reservation.reservationId, "dispatch-failed");
        throw error;
      }
      const workerOutcome = parseWorkerOutcome(delegated.result);
      let compute = null;
      if (reservation) {
        compute = computeEconomy.settleCompute(reservation.reservationId, {
          actualCost: reservation.reservedCost,
          usage: delegated.result?.usage ?? {},
          revenueUsd: workerOutcome.revenueUsd,
          outcome: workerOutcome.success ? "completed" : "unverified",
        });
        computeRecords.push(compute);
      }
      revenueUsd += workerOutcome.revenueUsd;
      tasks.push(clone({...task, worker:delegated.worker, delegatedBy:delegated.delegatedBy, dispatchRequest:delegated.dispatchRequest, result:delegated.result,
        success: workerOutcome.success, verified: workerOutcome.verified, revenueUsd: workerOutcome.revenueUsd, evidence: workerOutcome.evidence, compute}));
    }
    return clone({ status:"executed", mission:activeMission, plan:activePlan, allocation, tasks, compute:computeRecords, revenue:revenueUsd, outcomeEvidence:clone(outcomeEvidence),
      recovery:clone(recovery), outcome:{completedPhases:tasks.length,phaseCount:(activePlan.phases || []).length,nextStep:"verify-and-replan"} });
  }

  async function verifyAndReplan({ mission, plan, results = [], availableWorkers = [], maxWorkers = 20, outcomeEvidence = null, recovery = null } = {}) {
    if (!mission?.id || !mission.objective) throw new Error("Valid mission is required for replanning");
    const completed = Array.isArray(results) ? results : [];
    const unresolved = completed.filter(result => !result?.success && !result?.verified);
    const nextPlan = planner.plan(mission, { availableWorkers, maxWorkers, outcomeEvidence });
    return clone({ mission, previousPlan:plan ?? null, resultCount:completed.length, unresolvedCount:unresolved.length,
      status:unresolved.length ? "replan-required" : "verification-ready", recovery:clone(recovery), outcomeEvidence:clone(outcomeEvidence), nextPlan });
  }
  return Object.freeze({ execute, verifyAndReplan });
}
