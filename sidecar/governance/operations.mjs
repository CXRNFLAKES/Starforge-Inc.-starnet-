import { randomUUID } from "node:crypto";
import { ROLES } from "./roles.mjs";
import { ACTIONS, assertCan } from "./authority.mjs";

const PROJECT_STATUSES = Object.freeze(["planned", "active", "paused", "completed", "cancelled"]);
const TASK_STATUSES = Object.freeze(["queued", "assigned", "in-progress", "blocked", "completed", "failed"]);

function clone(value) {
  return structuredClone(value);
}

export function makeOperations({ company } = {}) {
  if (!company || typeof company.snapshot !== "function") {
    throw new Error("makeOperations requires a company");
  }

  const state = {
    projects: [],
    tasks: [],
  };

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
    state.projects.push(project);
    company.audit(actorRole, "operations.project.created", { projectId: project.id });
    return clone(project);
  }

  function setProjectStatus(actorRole, projectId, status) {
    requireRole(actorRole, ACTIONS.CEO_OPERATE);
    if (actorRole !== ROLES.CEO) throw new Error("Only the CEO may control project status");
    if (!PROJECT_STATUSES.includes(status)) throw new Error("Invalid project status");

    const project = state.projects.find((item) => item.id === projectId);
    if (!project) throw new Error("Unknown project");
    project.status = status;
    project.updatedAt = new Date().toISOString();
    company.audit(actorRole, "operations.project.status", { projectId, status });
    return clone(project);
  }

  function delegateTask(actorRole, { projectId, title, assigneeId, priority = "normal", successCriteria = "" } = {}) {
    requireRole(actorRole, ACTIONS.CEO_DELEGATE);
    if (actorRole !== ROLES.CEO) throw new Error("Only the CEO may delegate operational tasks");
    if (!projectId || !title || !assigneeId) throw new Error("Project, task title, and assignee are required");

    const project = state.projects.find((item) => item.id === projectId);
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
    state.tasks.push(task);
    company.audit(actorRole, "operations.task.delegated", {
      taskId: task.id,
      projectId,
      assigneeId,
    });
    return clone(task);
  }

  function updateTask(actorRole, taskId, { status, note = "" } = {}) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("Unknown task");
    const assignee = person(task.assigneeId);

    if (actorRole === ROLES.CEO) {
      requireRole(actorRole, ACTIONS.CEO_OPERATE);
    } else if (assignee?.role === actorRole) {
      requireRole(actorRole, ACTIONS.WORKER_EXECUTE);
    } else {
      throw new Error("Unauthorized task update");
    }

    if (!TASK_STATUSES.includes(status)) throw new Error("Invalid task status");
    task.status = status;
    task.note = String(note);
    task.updatedAt = new Date().toISOString();
    company.audit(actorRole, "operations.task.status", { taskId, status });
    return clone(task);
  }

  function inspect({ projectId = null, assigneeId = null } = {}) {
    return clone({
      projects: state.projects.filter((item) => !projectId || item.id === projectId),
      tasks: state.tasks.filter((item) => !projectId || item.projectId === projectId)
        .filter((item) => !assigneeId || item.assigneeId === assigneeId),
    });
  }

  return Object.freeze({
    createProject,
    setProjectStatus,
    delegateTask,
    updateTask,
    inspect,
  });
}

export { PROJECT_STATUSES, TASK_STATUSES };
