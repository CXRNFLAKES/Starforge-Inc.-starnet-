import test from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";

test("CEO can create projects and delegate tasks without CHO execution authority", () => {
  const company = makeCompany();
  const operations = makeOperations({ company });
  const project = operations.createProject(ROLES.CEO, {
    title: "Revenue sprint",
    objective: "Build a measurable revenue pipeline",
  });
  const task = operations.delegateTask(ROLES.CEO, {
    projectId: project.id,
    title: "Research qualified leads",
    assigneeId: "main-overseer",
    successCriteria: "Produce a sourced lead list",
  });
  assert.equal(project.status, "planned");
  assert.equal(task.status, "assigned");
  assert.equal(task.assigneeId, "main-overseer");
  assert.equal(task.assigneeRole, ROLES.PA);
});

test("operations fail closed across CEO boundaries", () => {
  const company = makeCompany();
  const operations = makeOperations({ company });
  assert.throws(() => operations.createProject(ROLES.PA, { title: "Nope" }), /Unauthorized action|Only the CEO/);
  assert.throws(() => operations.createProject(ROLES.CHO, { title: "Nope" }), /Unauthorized action|Only the CEO/);
});

test("workers can update their assigned tasks but cannot update another worker's task", () => {
  const company = makeCompany();
  company.registerPerson(ROLES.CHO, { id: "worker-a", name: "Worker A", role: ROLES.WORKER });
  company.registerPerson(ROLES.CHO, { id: "worker-b", name: "Worker B", role: ROLES.WORKER });
  const operations = makeOperations({ company });
  const project = operations.createProject(ROLES.CEO, { title: "Test project" });
  const task = operations.delegateTask(ROLES.CEO, {
    projectId: project.id,
    title: "Complete test",
    assigneeId: "worker-a",
  });
  const updated = operations.updateTask(ROLES.WORKER, task.id, { actorId: "worker-a", status: "in-progress", note: "Started" });
  assert.equal(updated.status, "in-progress");
  assert.throws(() => operations.updateTask(ROLES.WORKER, task.id, { actorId: "worker-b", status: "completed" }), /Unauthorized task update/);
});

test("projects and tasks survive company persistence", () => {
  let stored;
  const firstCompany = makeCompany({
    save: (snapshot) => { stored = snapshot; },
  });
  const firstOperations = makeOperations({ company: firstCompany });
  const project = firstOperations.createProject(ROLES.CEO, { title: "Persistent project" });
  const task = firstOperations.delegateTask(ROLES.CEO, {
    projectId: project.id,
    title: "Persistent task",
    assigneeId: "main-overseer",
  });

  assert.equal(stored.projects.length, 1);
  assert.equal(stored.tasks.length, 1);

  const restoredCompany = makeCompany({ load: () => stored });
  const restoredOperations = makeOperations({ company: restoredCompany });
  const snapshot = restoredOperations.inspect({ projectId: project.id });

  assert.equal(snapshot.projects[0].id, project.id);
  assert.equal(snapshot.tasks[0].id, task.id);
});
