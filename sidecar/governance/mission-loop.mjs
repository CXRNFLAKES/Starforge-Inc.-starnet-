function clone(value) {
  return value == null ? value : structuredClone(value);
}

function normalizeDecision(decision = {}) {
  const status = String(decision.status ?? "").trim().toLowerCase();
  if (!["complete", "replan", "blocked"].includes(status)) {
    throw new Error("Mission outcome evaluator must return complete, replan, or blocked");
  }
  return {
    status,
    verified: decision.verified === true,
    reason: String(decision.reason ?? "").trim(),
    evidence: decision.evidence ?? null,
  };
}

function workersFromExecution(execution) {
  const tasks = Array.isArray(execution?.tasks) ? execution.tasks : [];
  return tasks
    .flatMap((task) => {
      const workers = Array.isArray(task?.workers)
        ? task.workers
        : task?.worker
          ? [task.worker]
          : [];
      return workers;
    })
    .filter(Boolean)
    .map((worker) => ({
      id: worker?.id ?? worker?.agentId,
      name: worker?.name,
      capabilities: worker?.capabilities ?? worker?.skills ?? [],
    }));
}

function lessonFromDecision(decision, status) {
  if (decision?.reason) return decision.reason;
  if (status === "completed") return "Verified completion recorded for future mission planning.";
  if (status === "blocked") return "Mission was blocked; review the recorded evidence before retrying.";
  return "Autonomous replanning was exhausted without verified completion.";
}

export function makeMissionLoop({ planner, executor, evaluator, memory = null, maxIterations = 3 } = {}) {
  if (!planner || typeof planner.intake !== "function" || typeof planner.plan !== "function") {
    throw new Error("makeMissionLoop requires a mission planner");
  }
  if (!executor || typeof executor.execute !== "function" || typeof executor.verifyAndReplan !== "function") {
    throw new Error("makeMissionLoop requires a governed mission executor");
  }
  if (!evaluator || typeof evaluator.evaluate !== "function") {
    throw new Error("makeMissionLoop requires a governed outcome evaluator");
  }
  if (memory && (typeof memory.recall !== "function" || typeof memory.record !== "function")) {
    throw new Error("Mission memory must expose recall and record");
  }

  function recall(mission) {
    if (!memory) return [];
    return clone(memory.recall({
      objective: mission.objective,
      capabilities: mission.requiredCapabilities,
      limit: 5,
    }));
  }

  function recordMemory({ mission, outcome, execution, decision = null, history, status }) {
    if (!memory) return;
    memory.record({
      mission,
      outcome,
      execution,
      decision,
      workers: workersFromExecution(execution),
      compute: execution?.compute ?? null,
      revenue: execution?.revenue ?? null,
      lesson: lessonFromDecision(decision, status),
      history: clone(history),
    });
  }

  async function run({
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
    const priorLearning = recall(mission);
    mission.memoryContext = priorLearning;
    let plan = planner.plan(mission, { availableWorkers, maxWorkers, priorLearning });
    const history = [];

    const limit = Math.max(1, Math.min(10, Number(maxIterations) || 1));
    for (let iteration = 1; iteration <= limit; iteration += 1) {
      const execution = await executor.execute({
        mission,
        plan,
        actor,
        availableWorkers,
        maxWorkers,
        createMissing,
        projectId,
        priorLearning,
      });

      if (execution.status === "blocked") {
        const result = {
          status: "blocked",
          mission,
          iteration,
          plan,
          execution,
          history,
          reason: execution.reason ?? execution.allocation?.reason ?? "Mission execution blocked",
        };
        recordMemory({ mission, outcome: "blocked", execution, history, status: "blocked" });
        return clone(result);
      }

      const decision = normalizeDecision(
        await evaluator.evaluate({
          mission,
          plan,
          execution,
          iteration,
          history: clone(history),
          priorLearning,
        }),
      );
      history.push({ iteration, execution, decision });

      if (decision.status === "complete") {
        const result = {
          status: "completed",
          mission,
          iteration,
          plan,
          execution,
          decision,
          history,
          priorLearning,
        };
        recordMemory({ mission, outcome: "completed", execution, decision, history, status: "completed" });
        return clone(result);
      }

      if (decision.status === "blocked") {
        const result = {
          status: "blocked",
          mission,
          iteration,
          plan,
          execution,
          decision,
          history,
          reason: decision.reason || "Outcome evaluator blocked further autonomous execution",
          priorLearning,
        };
        recordMemory({ mission, outcome: "blocked", execution, decision, history, status: "blocked" });
        return clone(result);
      }

      if (iteration >= limit) break;

      const replanned = await executor.verifyAndReplan({
        mission,
        plan,
        results: execution.tasks,
        availableWorkers,
        maxWorkers,
        priorLearning,
      });
      plan = replanned.nextPlan;

      if (!plan || !Array.isArray(plan.phases) || !plan.phases.length) {
        const result = {
          status: "blocked",
          mission,
          iteration,
          plan,
          execution,
          decision,
          history,
          reason: "Replanner returned no executable phases",
          priorLearning,
        };
        recordMemory({ mission, outcome: "blocked", execution, decision, history, status: "blocked" });
        return clone(result);
      }
    }

    const result = {
      status: "replan-exhausted",
      mission,
      iteration: limit,
      plan,
      history,
      reason: "Autonomous replanning limit reached without verified completion",
      priorLearning,
    };
    recordMemory({
      mission,
      outcome: "replan-exhausted",
      execution: history.at(-1)?.execution ?? null,
      decision: history.at(-1)?.decision ?? null,
      history,
      status: "replan-exhausted",
    });
    return clone(result);
  }

  return Object.freeze({ run });
}
