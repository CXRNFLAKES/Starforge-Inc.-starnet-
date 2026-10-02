import { randomUUID } from "node:crypto";
import { ROLES } from "./roles.mjs";
import { ACTIONS, assertCan } from "./authority.mjs";

const PROJECT_STATUSES = Object.freeze(["planned", "active", "paused", "completed", "cancelled"]);
const TASK_STATUSES = Object.freeze(["queued", "assigned", "in-progress", "blocked", "completed", "failed"]);

function clone(value) {
  return structuredClone(value);
}

export function makeOperations({ company, starnet = null } = {}) {
  if (!company || typeof company.snapshot !== "function") {
    throw new Error("makeOperations requires a company");
  }

  function person(id) {
    return company.snapshot().people.find((item) => item.id === id) ?? null;
  }

  function requireRole(actorRole, action) {
    assertCan(actorRole, action);
  }

  function createProject(actorRole, { title, objective = "", ownerId = null } = {}) {
    requireRole(actorRole, ACTIONS.CEO_OPERATE);
    if (actorRole !== ROLES.CEO) throw new Error("Only the CEO may create operational projects");
    if (!title) throw new Error("Project title is required");

    if (ownerId && !person(ownerId)) throw new Error("Unknown project owner");

    const now = new Date().toISOString();
    const project = {
      id: randomUUID(),
      title: String(title),
      objective: String(objective),
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

  async function delegateToStarNet(actorRole, { projectId, title, assigneeId, priority = "normal", successCriteria = "", context = "" } = {}) {
    requireRole(actorRole, ACTIONS.CEO_DELEGATE);
    requireRole(actorRole, ACTIONS.STARNET_DELEGATE);
    if (actorRole !== ROLES.CEO) throw new Error("Only the CEO may delegate StarNet work");
    if (!starnet || typeof starnet.listWorkers !== "function" || typeof starnet.delegateTask !== "function") {
      throw new Error("StarNet adapter is required for StarNet delegation");
    }
    if (!projectId || !title || !assigneeId) throw new Error("Project, task title, and assignee are required");

    const project = company.snapshot().projects.find((item) => item.id === projectId);
    if (!project) throw new Error("Unknown project");
    if (project.status === "cancelled" || project.status === "completed") {
      throw new Error("Cannot delegate into a closed project");
    }
    const worker = starnet.listWorkers().find((item) => item.id === String(assigneeId).trim());
    if (!worker) throw new Error("StarNet worker is not present in the live roster");

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
      status: "in-progress",
      delegatedBy: actorRole,
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
        context,
      });
      const result = adapterResult.result;
      task.status = "completed";
      task.note = "StarNet execution completed";
      task.execution = { provider: "starnet", result };
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

  function inspect({ projectId = null, assigneeId = null } = {}) {
    return clone({
      projects: company.snapshot().projects.filter((item) => !projectId || item.id === projectId),
      tasks: company.snapshot().tasks.filter((item) => !projectId || item.projectId === projectId)
        .filter((item) => !assigneeId || item.assigneeId === assigneeId),
    });
  }

  function reviewExecution(actorRole, { projectId = null } = {}) {
    requireRole(actorRole, ACTIONS.CEO_OPERATE);
    if (actorRole !== ROLES.CEO) throw new Error("Only the CEO may review operational execution");

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
    });
  }

  return Object.freeze({
    createProject,
    setProjectStatus,
    delegateTask,
    delegateToStarNet,
    updateTask,
    inspect,
    reviewExecution,
  });
}

export { PROJECT_STATUSES, TASK_STATUSES };
