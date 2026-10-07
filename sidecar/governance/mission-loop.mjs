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

export function makeMissionLoop({ planner, executor, evaluator, maxIterations = 3 } = {}) {
  if (!planner || typeof planner.intake !== "function" || typeof planner.plan !== "function") {
    throw new Error("makeMissionLoop requires a mission planner");
  }
  if (!executor || typeof executor.execute !== "function" || typeof executor.verifyAndReplan !== "function") {
    throw new Error("makeMissionLoop requires a governed mission executor");
  }
  if (!evaluator || typeof evaluator.evaluate !== "function") {
    throw new Error("makeMissionLoop requires a governed outcome evaluator");
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
    let plan = planner.plan(mission, { availableWorkers, maxWorkers });
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
      });

      if (execution.status === "blocked") {
        return clone({
          status: "blocked",
          mission,
          iteration,
          plan,
          execution,
          history,
          reason: execution.reason ?? execution.allocation?.reason ?? "Mission execution blocked",
        });
      }

      const decision = normalizeDecision(
        await evaluator.evaluate({ mission, plan, execution, iteration, history: clone(history) }),
      );
      history.push({ iteration, execution, decision });

      if (decision.status === "complete") {
        return clone({
          status: "completed",
          mission,
          iteration,
          plan,
          execution,
          decision,
          history,
        });
      }

      if (decision.status === "blocked") {
        return clone({
          status: "blocked",
          mission,
          iteration,
          plan,
          execution,
          decision,
          history,
          reason: decision.reason || "Outcome evaluator blocked further autonomous execution",
        });
      }

      if (iteration >= limit) break;

      const replanned = await executor.verifyAndReplan({
        mission,
        plan,
        results: execution.tasks,
        availableWorkers,
        maxWorkers,
      });
      plan = replanned.nextPlan;

      if (!plan || !Array.isArray(plan.phases) || !plan.phases.length) {
        return clone({
          status: "blocked",
          mission,
          iteration,
          plan,
          execution,
          decision,
          history,
          reason: "Replanner returned no executable phases",
        });
      }
    }

    return clone({
      status: "replan-exhausted",
      mission,
      iteration: limit,
      plan,
      history,
      reason: "Autonomous replanning limit reached without verified completion",
    });
  }

  return Object.freeze({ run });
}
