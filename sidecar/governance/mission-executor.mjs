import { randomUUID } from "node:crypto";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function id(value, label) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`Mission executor requires ${label}`);
  return result;
}

function phaseCapabilities(phase) {
  return Array.isArray(phase?.requiredCapabilities)
    ? phase.requiredCapabilities.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : [];
}

function workerCapabilities(worker) {
  return new Set(
    (Array.isArray(worker?.capabilities) ? worker.capabilities : Array.isArray(worker?.skills) ? worker.skills : [])
      .map((value) => String(value).trim().toLowerCase()).filter(Boolean),
  );
}

function chooseWorker(workers, phase, used = new Set()) {
  const required = phaseCapabilities(phase);
  return [...workers]
    .filter((worker) => !used.has(String(worker?.id ?? worker?.agentId ?? "")))
    .map((worker) => {
      const caps = workerCapabilities(worker);
      const matched = required.filter((capability) => caps.has(capability)).length;
      return { worker, score: matched * 100 - Number(worker?.activeTaskCount ?? worker?.load ?? 0) };
    })
    .sort((a, b) => b.score - a.score)[0]?.worker ?? null;
}

export function makeMissionExecutor({ planner, allocator, starnet } = {}) {
  if (!planner || typeof planner.intake !== "function" || typeof planner.plan !== "function") {
    throw new Error("makeMissionExecutor requires a mission planner");
  }
  if (!allocator || typeof allocator.allocate !== "function") {
    throw new Error("makeMissionExecutor requires a workforce allocator");
  }
  if (!starnet || typeof starnet.delegateTask !== "function") {
    throw new Error("makeMissionExecutor requires a StarNet delegation adapter");
  }

  async function execute({
    objective,
    constraints = [],
    budget = null,
    deadline = null,
    actor = "cho",
    availableWorkers = [],
    maxWorkers = 20,
    createMissing = true,
    projectId = null,
  } = {}) {
    const mission = planner.intake({ objective, constraints, budget, deadline, actor });
    const plan = planner.plan(mission, { availableWorkers, maxWorkers });

    const allocation = await allocator.allocate({
      requiredCapabilities: mission.requiredCapabilities,
      maxWorkers,
      objective: mission.objective,
      createMissing,
    });

    if (allocation.status === "blocked") {
      return clone({
        status: "blocked",
        mission,
        plan,
        allocation,
        tasks: [],
      });
    }

    const workers = [...(allocation.selected || []), ...(allocation.created || [])];
    const used = new Set();
    const tasks = [];

    for (const phase of plan.phases || []) {
      const worker = chooseWorker(workers, phase, used) || workers[0] || null;
      if (!worker) {
        return clone({
          status: "blocked",
          mission,
          plan,
          allocation,
          tasks,
          reason: "StarNet returned no worker for an executable mission phase",
        });
      }

      const assigneeId = id(worker.id ?? worker.agentId, "worker id");
      used.add(assigneeId);
      const task = {
        id: randomUUID(),
        projectId: projectId ?? mission.id,
        missionId: mission.id,
        assigneeId,
        title: String(phase.name ?? "Mission phase"),
        prompt: [
          `Mission objective: ${mission.objective}`,
          phase.description ? `Phase: ${phase.description}` : "",
          mission.constraints.length ? `Constraints: ${mission.constraints.join("; ")}` : "",
          mission.deadline ? `Deadline: ${mission.deadline}` : "",
          "Report concrete findings, actions taken, blockers, and next recommendation.",
        ].filter(Boolean).join("\n\n"),
        successCriteria: "Return a concrete result that advances the governed mission.",
        context: JSON.stringify({ missionId: mission.id, risk: mission.risk, complexity: mission.complexity }),
      };

      const delegated = await starnet.delegateTask(actor, task);
      tasks.push(clone({
        ...task,
        worker: delegated.worker,
        delegatedBy: delegated.delegatedBy,
        dispatchRequest: delegated.dispatchRequest,
        result: delegated.result,
      }));
    }

    return clone({
      status: "executed",
      mission,
      plan,
      allocation,
      tasks,
      outcome: {
        completedPhases: tasks.length,
        phaseCount: (plan.phases || []).length,
        nextStep: "verify-and-replan",
      },
    });
  }

  async function verifyAndReplan({ mission, plan, results = [], availableWorkers = [], maxWorkers = 20 } = {}) {
    if (!mission?.id || !mission.objective) throw new Error("Valid mission is required for replanning");
    const completed = Array.isArray(results) ? results : [];
    const unresolved = completed.filter((result) => !result?.success && !result?.verified);
    const nextPlan = planner.plan(mission, {
      availableWorkers,
      maxWorkers,
    });
    return clone({
      mission,
      previousPlan: plan ?? null,
      resultCount: completed.length,
      unresolvedCount: unresolved.length,
      status: unresolved.length ? "replan-required" : "verification-ready",
      nextPlan,
    });
  }

  return Object.freeze({ execute, verifyAndReplan });
}
