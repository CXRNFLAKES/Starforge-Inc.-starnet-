function clone(value) { return value == null ? value : structuredClone(value); }

function normalizeDecision(decision = {}) {
  const status = String(decision.status ?? "").trim().toLowerCase();
  if (!["complete", "replan", "blocked"].includes(status)) throw new Error("Mission outcome evaluator must return complete, replan, or blocked");
  return { status, verified: decision.verified === true, reason: String(decision.reason ?? "").trim(), evidence: decision.evidence ?? null };
}
function workersFromExecution(execution) {
  const tasks = Array.isArray(execution?.tasks) ? execution.tasks : [];
  return tasks.flatMap(task => Array.isArray(task?.workers) ? task.workers : task?.worker ? [task.worker] : []).filter(Boolean)
    .map(worker => ({ id: worker?.id ?? worker?.agentId, name: worker?.name, capabilities: worker?.capabilities ?? worker?.skills ?? [] }));
}
function lessonFromDecision(decision, status, recovery = null) {
  if (recovery?.type) return `Failure ${recovery.type}: ${recovery.recovery?.action ?? "recovery"}.`;
  if (status === "completed") return "Verified completion recorded for future mission planning.";
  if (decision?.reason) return decision.reason;
  if (status === "blocked") return "Mission was blocked; review the recorded evidence before retrying.";
  return "Autonomous replanning was exhausted without verified completion.";
}

export function makeMissionLoop({ planner, executor, evaluator, memory = null, outcomeIntelligence = null, failureIntelligence = null, maxIterations = 3 } = {}) {
  if (!planner || typeof planner.intake !== "function" || typeof planner.plan !== "function") throw new Error("makeMissionLoop requires a mission planner");
  if (!executor || typeof executor.execute !== "function" || typeof executor.verifyAndReplan !== "function") throw new Error("makeMissionLoop requires a governed mission executor");
  if (!evaluator || typeof evaluator.evaluate !== "function") throw new Error("makeMissionLoop requires a governed outcome evaluator");
  if (memory && (typeof memory.recall !== "function" || typeof memory.record !== "function")) throw new Error("Mission memory must expose recall and record");
  if (failureIntelligence && typeof failureIntelligence.analyze !== "function") throw new Error("Failure intelligence must expose analyze");

  function recall(mission) {
    if (!memory) return undefined;
    return clone(memory.recall({ objective: mission.objective, capabilities: mission.requiredCapabilities, limit: 5 }));
  }
  function recordMemory({ mission, outcome, execution, decision = null, history, status, recovery = null }) {
    if (!memory) return;
    memory.record({ mission, outcome, execution, decision, workers: workersFromExecution(execution), compute: execution?.compute ?? null,
      revenue: execution?.revenue ?? null, lesson: lessonFromDecision(decision, status, recovery), recovery: clone(recovery), history: clone(history) });
  }

  async function run({ objective, constraints = [], budget = null, deadline = null, actor = "cho", availableWorkers = [], maxWorkers = 20, createMissing = true, projectId = null } = {}) {
    const mission = planner.intake({ objective, constraints, budget, deadline, actor });
    const priorLearning = recall(mission); mission.memoryContext = priorLearning;
    const outcomeEvidence = outcomeIntelligence ? clone(outcomeIntelligence.analyze({ objective: mission.objective, requiredCapabilities: mission.requiredCapabilities, candidates: availableWorkers })) : null;
    mission.outcomeIntelligence = outcomeEvidence;
    let plan = planner.plan(mission, { availableWorkers, maxWorkers, priorLearning, outcomeEvidence });
    const history = [];
    const limit = Math.max(1, Math.min(10, Number(maxIterations) || 1));
    for (let iteration = 1; iteration <= limit; iteration += 1) {
      const execution = await executor.execute({ mission, plan, actor, availableWorkers, maxWorkers, createMissing, projectId, priorLearning, outcomeEvidence });
      if (execution.status === "blocked") {
        const result = { status:"blocked", mission, iteration, plan, execution, history, reason:execution.reason ?? execution.allocation?.reason ?? "Mission execution blocked" };
        recordMemory({mission,outcome:"blocked",execution,history,status:"blocked"}); return clone(result);
      }
      const decision = normalizeDecision(await evaluator.evaluate({ mission, plan, execution, iteration, history:clone(history), priorLearning, outcomeEvidence }));
      history.push({ iteration, execution, decision });
      if (decision.status === "complete") {
        const result={status:"completed",mission,iteration,plan,execution,decision,history,priorLearning};
        recordMemory({mission,outcome:"completed",execution,decision,history,status:"completed"}); return clone(result);
      }
      if (decision.status === "blocked") {
        const result={status:"blocked",mission,iteration,plan,execution,decision,history,reason:decision.reason||"Outcome evaluator blocked further autonomous execution",priorLearning};
        recordMemory({mission,outcome:"blocked",execution,decision,history,status:"blocked"}); return clone(result);
      }

      const recovery = failureIntelligence ? clone(failureIntelligence.analyze({ mission, plan, execution, decision, history:clone(history) })) : null;
      if (recovery?.escalationRequired && recovery.recovery?.retry === false) {
        const result={status:"blocked",mission,iteration,plan,execution,decision,recovery,history,reason:"Failure intelligence requires escalation before autonomous retry",priorLearning};
        recordMemory({mission,outcome:"blocked",execution,decision,history,status:"blocked",recovery}); return clone(result);
      }
      if (iteration >= limit) {
        recordMemory({mission,outcome:"replan-exhausted",execution,decision,history,status:"replan-exhausted",recovery});
        break;
      }
      const replanned = await executor.verifyAndReplan({ mission, plan, results:execution.tasks, availableWorkers, maxWorkers, priorLearning, outcomeEvidence, recovery,
        createMissing: recovery?.recovery?.createMissingWorkers ?? createMissing });
      plan = replanned.nextPlan;
      if (!plan || !Array.isArray(plan.phases) || !plan.phases.length) {
        const result={status:"blocked",mission,iteration,plan,execution,decision,recovery,history,reason:"Replanner returned no executable phases",priorLearning};
        recordMemory({mission,outcome:"blocked",execution,decision,history,status:"blocked",recovery}); return clone(result);
      }
    }
    return clone({status:"replan-exhausted",mission,iteration:limit,plan,history,reason:"Autonomous replanning limit reached without verified completion",priorLearning});
  }
  return Object.freeze({ run });
}
