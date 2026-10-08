import { randomUUID } from "node:crypto";
import { ROLES } from "./roles.mjs";
import { ACTIONS, assertCan } from "./authority.mjs";
import { makeFactChecker } from "./fact-checker.mjs";

const PROJECT_STATUSES = Object.freeze(["planned", "active", "paused", "completed", "cancelled"]);
const TASK_STATUSES = Object.freeze(["queued", "assigned", "in-progress", "blocked", "completed", "failed"]);

function clone(value) {
  return structuredClone(value);
}

export function makeOperations({ company, starnet = null, modelRouter = null, factChecker = makeFactChecker() } = {}) {
  if (!company || typeof company.snapshot !== "function") {
    throw new Error("makeOperations requires a company");
  }

  function person(id) {
    return company.snapshot().people.find((item) => item.id === id) ?? null;
  }

  function requireRole(actorRole, action) {
    assertCan(actorRole, action);
  }

  function createProject(actorRole, { title, objective = "", objectiveId = null, ownerId = null } = {}) {
    requireRole(actorRole, ACTIONS.CEO_OPERATE);
    if (actorRole !== ROLES.CEO) throw new Error("Only the CEO may create operational projects");
    if (!title) throw new Error("Project title is required");

    if (ownerId && !person(ownerId)) throw new Error("Unknown project owner");
    if (objectiveId) {
      const objectiveRecord = company.snapshot().objectives.find((item) => item.id === objectiveId);
      if (!objectiveRecord) throw new Error("Unknown company objective");
    }

    const now = new Date().toISOString();
    const project = {
      id: randomUUID(),
      title: String(title),
      objective: String(objective),
      objectiveId: objectiveId ? String(objectiveId) : null,
      ownerId,
      status: "planned",
      createdBy: actorRole,
      createdAt: now,
      updatedAt: now,
    };
    company.recordProject(actorRole, project);
    return clone(project);
  }

  function setProjectStatus(actorRole, projectId, status) {
    requireRole(actorRole, ACTIONS.CEO_OPERATE);
    if (actorRole !== ROLES.CEO) throw new Error("Only the CEO may control project status");
    if (!PROJECT_STATUSES.includes(status)) throw new Error("Invalid project status");

    const project = company.snapshot().projects.find((item) => item.id === projectId);
    if (!project) throw new Error("Unknown project");

    const normalizedExecutionKey = String(executionKey ?? "").trim();
    if (normalizedExecutionKey) {
      const prior = company.snapshot().tasks.find((item) =>
        item.executionKey === normalizedExecutionKey && item.projectId === projectId
      );
      if (prior) {
        if (prior.status === "completed" && prior.execution?.provider === "starnet" && prior.execution?.result) {
          const worker = person(prior.assigneeId) ?? { id: prior.assigneeId, role: prior.assigneeRole, source: prior.assigneeSource };
          return clone({ task: prior, worker, result: prior.execution.result, reused: true });
        }
        if (["assigned", "in-progress"].includes(prior.status)) {
          throw new Error("StarNet execution with this key is already in progress");
        }
        if (prior.status === "failed") {
          throw new Error("StarNet execution with this key already failed; create a new execution key for recovery");
        }
      }
    }
    project.status = status;
    project.updatedAt = new Date().toISOString();
    company.updateProject(actorRole, project);
    return clone(project);
  }

  function delegateTask(actorRole, { projectId, title, assigneeId, priority = "normal", successCriteria = "" } = {}) {
    requireRole(actorRole, ACTIONS.CEO_DELEGATE);
    if (actorRole !== ROLES.CEO) throw new Error("Only the CEO may delegate operational tasks");
    if (!projectId || !title || !assigneeId) throw new Error("Project, task title, and assignee are required");

    const project = company.snapshot().projects.find((item) => item.id === projectId);
    if (!project) throw new Error("Unknown project");
    if (project.status === "cancelled" || project.status === "completed") {
      throw new Error("Cannot delegate into a closed project");
    }
    const assignee = person(assigneeId);
    if (!assignee) throw new Error("Unknown assignee");
    if (assignee.role === ROLES.CHO) throw new Error("CHO is not an operational worker target");

    const now = new Date().toISOString();
    const task = {
      id: randomUUID(),
      projectId,
      title: String(title),
      assigneeId,
      assigneeRole: assignee.role,
      priority: String(priority),
      successCriteria: String(successCriteria),
      status: "assigned",
      delegatedBy: actorRole,
      createdAt: now,
      updatedAt: now,
    };
    company.recordTask(actorRole, task);
    return clone(task);
  }

  async function delegateToStarNet(actorRole, { projectId, title, assigneeId, priority = "normal", successCriteria = "", context = "", provider = "", model = "", executionKey = "" } = {}) {
    requireRole(actorRole, ACTIONS.CEO_DELEGATE);
    requireRole(actorRole, ACTIONS.STARNET_DELEGATE);
    if (![ROLES.CEO, ROLES.VICE_CEO].includes(actorRole)) {
      throw new Error("Only the CEO or StarNet Vice CEO may delegate StarNet work");
    }
    if (!starnet || (typeof starnet.listWorkers !== "function" && typeof starnet.listWorkersAsync !== "function") || typeof starnet.delegateTask !== "function") {
      throw new Error("StarNet adapter is required for StarNet delegation");
    }
    if (!projectId || !title || !assigneeId) throw new Error("Project, task title, and assignee are required");

    const project = company.snapshot().projects.find((item) => item.id === projectId);
    if (!project) throw new Error("Unknown project");
    if (project.status === "cancelled" || project.status === "completed") {
      throw new Error("Cannot delegate into a closed project");
    }
    const roster = typeof starnet.listWorkersAsync === "function"
      ? await starnet.listWorkersAsync()
      : await starnet.listWorkers();
    const worker = roster.find((item) => item.id === String(assigneeId).trim());
    if (!worker) throw new Error("StarNet worker is not present in the live roster");

    let modelRoute = null;
    if (model) {
      if (!modelRouter || typeof modelRouter.resolve !== "function") {
        throw new Error("StarForge model router is required for governed model selection");
      }
      modelRoute = await modelRouter.resolve({
        provider: provider || "apinex",
        model,
      });
      if (!modelRoute || modelRoute.allowed !== true) {
        throw new Error("StarForge model router did not approve the requested model");
      }
    }

    const now = new Date().toISOString();
    const task = {
      id: randomUUID(),
      projectId,
      title: String(title),
      assigneeId: String(assigneeId).trim(),
      assigneeRole: ROLES.WORKER,
      assigneeSource: "starnet",
      priority: String(priority),
      successCriteria: String(successCriteria),
      ...(normalizedExecutionKey ? { executionKey: normalizedExecutionKey } : {}),
      status: "in-progress",
      delegatedBy: actorRole,
      ...(modelRoute ? { modelRoute } : {}),
      createdAt: now,
      updatedAt: now,
    };
    company.recordTask(actorRole, task);

    try {
      const adapterResult = await starnet.delegateTask(actorRole, {
        id: task.id,
        projectId: task.projectId,
        assigneeId: task.assigneeId,
        title: task.title,
        successCriteria: task.successCriteria,
        context: modelRoute ? { base: context, modelRoute } : context,
      });
      if (!adapterResult || !adapterResult.result || typeof adapterResult.result !== "object" || typeof adapterResult.result.content !== "string" || !adapterResult.result.content.trim()) {
        throw new Error("StarNet adapter returned an invalid result");
      }
      const result = adapterResult.result;
      task.status = "completed";
      task.note = "StarNet execution completed";
      task.execution = { provider: "starnet", result, ...(modelRoute ? { modelRoute } : {}) };
      task.updatedAt = new Date().toISOString();
      company.updateTask(actorRole, task);
      return clone({ task, worker, result });
    } catch (error) {
      task.status = "failed";
      task.note = error instanceof Error ? error.message : String(error);
      task.updatedAt = new Date().toISOString();
      company.updateTask(actorRole, task);
      throw error;
    }
  }

  function assignRecoveryMission(actorRole, { taskId, assignedAgentId, reason, mission = "repair and verify failed work" } = {}) {
    if (actorRole !== ROLES.CEO) throw new Error("Only the CEO may assign recovery missions");
    requireRole(actorRole, ACTIONS.CEO_OPERATE);
    if (!taskId || !assignedAgentId || !reason) throw new Error("Recovery mission requires task id, assigned agent, and reason");
    const task = company.snapshot().tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("Unknown task");
    if (!["failed", "blocked"].includes(task.status)) {
      throw new Error("Recovery mission requires a failed or blocked task");
    }
    const entry = company.recordRecoveryMission(actorRole, {
      id: randomUUID(),
      taskId: task.id,
      projectId: task.projectId,
      assignedAgentId: String(assignedAgentId),
      reason: String(reason),
      mission: String(mission),
    });
    return clone(entry);
  }

  function startRecoveryMission(actorRole, missionId) {
    if (actorRole !== ROLES.CEO) throw new Error("Only the CEO may start recovery missions");
    requireRole(actorRole, ACTIONS.CEO_OPERATE);
    const mission = company.snapshot().recoveryMissions.find((item) => item.id === missionId);
    if (!mission) throw new Error("Unknown recovery mission");
    if (mission.status !== "assigned") throw new Error("Recovery mission must be assigned before it can start");
    const task = company.snapshot().tasks.find((item) => item.id === mission.taskId);
    if (!task || !["failed", "blocked"].includes(task.status)) {
      throw new Error("Recovery mission requires failed or blocked work");
    }
    return clone(company.updateRecoveryMission(actorRole, {
      ...mission,
      status: "in-progress",
      startedAt: new Date().toISOString(),
    }));
  }

  async function executeRecoveryMission(actorRole, missionId, { context = "", provider = "", model = "" } = {}) {
    if (actorRole !== ROLES.CEO) throw new Error("Only the CEO may execute recovery missions");
    requireRole(actorRole, ACTIONS.CEO_OPERATE);
    requireRole(actorRole, ACTIONS.STARNET_DELEGATE);
    if (!starnet || typeof starnet.delegateTask !== "function") {
      throw new Error("StarNet adapter is required for recovery execution");
    }

    const mission = company.snapshot().recoveryMissions.find((item) => item.id === missionId);
    if (!mission) throw new Error("Unknown recovery mission");
    if (mission.status !== "in-progress") throw new Error("Recovery mission must be in-progress before execution");

    const task = company.snapshot().tasks.find((item) => item.id === mission.taskId);
    if (!task) throw new Error("Recovery mission requires an existing task");
    if (!["failed", "blocked"].includes(task.status)) {
      throw new Error("Recovery execution requires failed or blocked work");
    }

    const roster = typeof starnet.listWorkersAsync === "function"
      ? await starnet.listWorkersAsync()
      : typeof starnet.listWorkers === "function"
        ? await starnet.listWorkers()
        : [];
    const worker = roster.find((item) => item.id === String(mission.assignedAgentId).trim());
    if (!worker) throw new Error("Recovery worker is not present in the live roster");

    let modelRoute = null;
    if (model) {
      if (!modelRouter || typeof modelRouter.resolve !== "function") {
        throw new Error("StarForge model router is required for governed recovery model selection");
      }
      modelRoute = await modelRouter.resolve({ provider: provider || "apinex", model });
      if (!modelRoute || modelRoute.allowed !== true) {
        throw new Error("StarForge model router did not approve the recovery model");
      }
    }

    const recoveryTask = {
      ...task,
      status: "in-progress",
      note: "StarNet recovery execution in progress",
      updatedAt: new Date().toISOString(),
      ...(modelRoute ? { modelRoute } : {}),
    };
    company.updateTask(actorRole, recoveryTask);

    try {
      const adapterResult = await starnet.delegateTask(actorRole, {
        id: task.id,
        projectId: task.projectId,
        assigneeId: worker.id,
        title: mission.mission,
        successCriteria: task.successCriteria || "Complete and repair the failed or blocked work.",
        context: modelRoute
          ? { base: context, recoveryMissionId: mission.id, modelRoute }
          : { base: context, recoveryMissionId: mission.id },
      });
      if (!adapterResult || !adapterResult.result || typeof adapterResult.result !== "object" ||
          typeof adapterResult.result.content !== "string" || !adapterResult.result.content.trim()) {
        throw new Error("StarNet recovery returned an invalid result");
      }

      const result = adapterResult.result;
      const completedTask = {
        ...recoveryTask,
        status: "completed",
        note: "StarNet recovery execution completed",
        execution: {
          provider: "starnet",
          recoveryMissionId: mission.id,
          result,
          ...(modelRoute ? { modelRoute } : {}),
        },
        updatedAt: new Date().toISOString(),
      };
      company.updateTask(actorRole, completedTask);
      return clone({ mission, task: completedTask, worker, result });
    } catch (error) {
      const failedTask = {
        ...recoveryTask,
        status: "failed",
        note: error instanceof Error ? error.message : String(error),
        updatedAt: new Date().toISOString(),
      };
      company.updateTask(actorRole, failedTask);
      throw error;
    }
  }

  function verifyRecoveryMission(actorRole, missionId, { evidence = [] } = {}) {
    if (actorRole !== ROLES.PA) throw new Error("Only the PA may verify recovery missions");
    requireRole(actorRole, ACTIONS.PA_REVIEW);
    return clone(company.verifyRecoveryMission(actorRole, missionId, evidence));
  }

  function closeRecoveryMission(actorRole, missionId) {
    if (actorRole !== ROLES.CEO) throw new Error("Only the CEO may close recovery missions");
    requireRole(actorRole, ACTIONS.CEO_OPERATE);
    const mission = company.snapshot().recoveryMissions.find((item) => item.id === missionId);
    if (!mission) throw new Error("Unknown recovery mission");
    if (mission.status !== "verified") throw new Error("Recovery mission must be verified before closure");
    return clone(company.updateRecoveryMission(actorRole, {
      ...mission,
      status: "closed",
      closedAt: new Date().toISOString(),
    }));
  }

  function verifyBusinessOutcome(actorRole, { taskId, claim, evidence = [] } = {}) {
    if (actorRole !== ROLES.PA) {
      throw new Error("Only the PA may verify a business outcome");
    }
    requireRole(actorRole, ACTIONS.PA_REVIEW);
    if (!taskId) throw new Error("Business outcome verification requires a task id");

    const task = company.snapshot().tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("Unknown task");
    if (task.status !== "completed") {
      throw new Error("Business outcome requires a completed task");
    }
    if (task.assigneeSource !== "starnet") {
      throw new Error("Business outcome verification requires StarNet execution");
    }

    const checked = factChecker.check(claim, { evidence });
    const outcomeId = randomUUID();
    const verification = {
      outcomeId,
      taskId: task.id,
      claim: checked.claim,
      label: checked.label,
      confidence: checked.confidence,
      findings: checked.findings,
      evidenceCount: checked.evidenceCount,
      conflicts: checked.conflicts,
      verified: checked.label === "VERIFIED FACT",
      verifiedBy: actorRole,
      verifiedAt: new Date().toISOString(),
    };
    company.recordBusinessOutcome(actorRole, { taskId: task.id, outcome: verification });
    return clone(verification);
  }

  function updateTask(actorRole, taskId, { actorId = null, status, note = "" } = {}) {
    const task = company.snapshot().tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("Unknown task");
    const assignee = person(task.assigneeId);

    if (actorRole === ROLES.CEO) {
      requireRole(actorRole, ACTIONS.CEO_OPERATE);
    } else if (actorId === task.assigneeId && assignee?.role === actorRole) {
      requireRole(actorRole, ACTIONS.WORKER_EXECUTE);
    } else {
      throw new Error("Unauthorized task update");
    }

    if (!TASK_STATUSES.includes(status)) throw new Error("Invalid task status");
    task.status = status;
    task.note = String(note);
    task.updatedAt = new Date().toISOString();
    company.updateTask(actorRole, task);
    return clone(task);
  }

  function reviewStarNetExecution(actorRole, { projectId = null } = {}) {
    if (actorRole === ROLES.CEO) requireRole(actorRole, ACTIONS.CEO_OPERATE);
    else if (actorRole === ROLES.PA) requireRole(actorRole, ACTIONS.COMPANY_READ);
    else if (actorRole === ROLES.VICE_CEO) requireRole(actorRole, ACTIONS.STARNET_DELEGATE);
    else throw new Error("Only the CEO, PA, or StarNet Vice CEO may review StarNet execution");

    const tasks = company.snapshot().tasks
      .filter((item) => item.assigneeSource === "starnet")
      .filter((item) => !projectId || item.projectId === projectId);

    return clone({
      projectId,
      reviewScope: actorRole === ROLES.PA ? "independent-oversight"
        : actorRole === ROLES.VICE_CEO ? "starnet-operational-review" : "operational-review",
      taskCount: tasks.length,
      counts: {
        assigned: tasks.filter((item) => item.status === "assigned").length,
        inProgress: tasks.filter((item) => item.status === "in-progress").length,
        completed: tasks.filter((item) => item.status === "completed").length,
        failed: tasks.filter((item) => item.status === "failed").length,
        blocked: tasks.filter((item) => item.status === "blocked").length,
      },
      attentionNeeded: tasks.filter((item) => item.status === "blocked" || item.status === "failed"),
      tasks,
    });
  }

  async function inspectStarNetWorkforce(actorRole, { activeRuns = [] } = {}) {
    if (![ROLES.CEO, ROLES.PA, ROLES.VICE_CEO].includes(actorRole)) {
      throw new Error("Only the CEO, PA, or StarNet Vice CEO may inspect the StarNet workforce");
    }
    requireRole(actorRole, ACTIONS.COMPANY_READ);
    if (!starnet || typeof starnet.inspectWorkforce !== "function") {
      throw new Error("StarNet adapter workforce inspection is required");
    }

    const snapshot = await starnet.inspectWorkforce({ activeRuns });
    return clone({
      ...snapshot,
      reviewScope: actorRole === ROLES.PA ? "independent-oversight"
        : actorRole === ROLES.VICE_CEO ? "starnet-operational-review" : "operational-review",
    });
  }

  function inspect({ projectId = null, assigneeId = null } = {}) {
    return clone({
      projects: company.snapshot().projects.filter((item) => !projectId || item.id === projectId),
      tasks: company.snapshot().tasks.filter((item) => !projectId || item.projectId === projectId)
        .filter((item) => !assigneeId || item.assigneeId === assigneeId),
    });
  }

  function reviewExecution(actorRole, { projectId = null } = {}) {
    if (actorRole === ROLES.CEO) {
      requireRole(actorRole, ACTIONS.CEO_OPERATE);
    } else if (actorRole === ROLES.PA) {
      requireRole(actorRole, ACTIONS.COMPANY_READ);
    } else {
      throw new Error("Only the CEO or PA may review operational execution");
    }

    const snapshot = company.snapshot();
    const tasks = snapshot.tasks.filter((item) => !projectId || item.projectId === projectId);
    const counts = Object.fromEntries(TASK_STATUSES.map((status) => [
      status,
      tasks.filter((item) => item.status === status).length,
    ]));

    return clone({
      projectId,
      taskCount: tasks.length,
      counts,
      blocked: tasks.filter((item) => item.status === "blocked"),
      failed: tasks.filter((item) => item.status === "failed"),
      completed: tasks.filter((item) => item.status === "completed"),
      attentionNeeded: tasks.filter((item) => item.status === "blocked" || item.status === "failed"),
      reviewScope: actorRole === ROLES.PA ? "independent-oversight" : "operational-review",
    });
  }

  return Object.freeze({
    createProject,
    setProjectStatus,
    delegateTask,
    delegateToStarNet,
    verifyBusinessOutcome,
    assignRecoveryMission,
    startRecoveryMission,
    executeRecoveryMission,
    verifyRecoveryMission,
    closeRecoveryMission,
    updateTask,
    inspect,
    reviewExecution,
    reviewStarNetExecution,
    inspectStarNetWorkforce,
  });
}

export { PROJECT_STATUSES, TASK_STATUSES };
