import test from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";

function setup() {
  const company = makeCompany();
  const operations = makeOperations({ company });
  const project = operations.createProject(ROLES.CEO, {
    title: "D5 oversight project",
    objective: "Independent operational oversight",
  });
  const tasks = [];
  for (const [index, [title, status]] of [
    ["Blocked mission", "blocked"],
    ["Failed mission", "failed"],
    ["Completed mission", "completed"],
  ].entries()) {
    const taskId = "d5-task-" + (index + 1);
    company.recordTask(ROLES.CEO, {
      id: taskId,
      projectId: project.id,
      title,
      assigneeId: "operations-worker",
      assigneeRole: ROLES.WORKER,
      priority: "normal",
      successCriteria: "Complete safely",
      status: "assigned",
      delegatedBy: ROLES.CEO,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    tasks.push(operations.updateTask(ROLES.CEO, taskId, {
      status,
      note: "D5 " + status,
    }));
  }
  return { company, operations, project, tasks };
}

test("PA independently reviews blocked and failed operational work", () => {
  const { operations, project } = setup();
  const review = operations.reviewExecution(ROLES.PA, { projectId: project.id });

  assert.equal(review.reviewScope, "independent-oversight");
  assert.equal(review.taskCount, 3);
  assert.equal(review.counts.blocked, 1);
  assert.equal(review.counts.failed, 1);
  assert.equal(review.counts.completed, 1);
  assert.deepEqual(
    review.attentionNeeded.map(task => task.status).sort(),
    ["blocked", "failed"],
  );
});

test("PA execution review is read-only and returned data cannot mutate company state", () => {
  const { company, operations, project } = setup();
  const review = operations.reviewExecution(ROLES.PA, { projectId: project.id });

  review.blocked[0].status = "completed";
  review.failed[0].note = "tampered";
  review.attentionNeeded[0].status = "completed";
  review.counts.blocked = 0;

  const persisted = company.snapshot().tasks.filter(task => task.projectId === project.id);
  assert.equal(persisted.find(task => task.status === "blocked")?.status, "blocked");
  assert.equal(persisted.find(task => task.status === "failed")?.note, "D5 failed");
  assert.equal(persisted.filter(task => task.status === "blocked").length, 1);
  assert.equal(persisted.filter(task => task.status === "failed").length, 1);
});

test("PA cannot modify projects or operational task state through CEO execution channels", () => {
  const { company, operations, project, tasks } = setup();

  assert.throws(
    () => operations.createProject(ROLES.PA, { title: "Unauthorized project" }),
    /Unauthorized action|Only the CEO/,
  );
  assert.throws(
    () => operations.setProjectStatus(ROLES.PA, project.id, "paused"),
    /Unauthorized action|Only the CEO/,
  );
  assert.throws(
    () => operations.updateTask(ROLES.PA, tasks[0].id, { status: "completed" }),
    /Unauthorized task update|Unauthorized action/,
  );

  const persistedProject = company.snapshot().projects.find(item => item.id === project.id);
  const persistedTask = company.snapshot().tasks.find(item => item.id === tasks[0].id);
  assert.equal(persistedProject.status, "planned");
  assert.equal(persistedTask.status, "blocked");
});

test("CEO retains operational control while PA remains an independent reviewer", () => {
  const { company, operations, project, tasks } = setup();
  const before = operations.reviewExecution(ROLES.PA, { projectId: project.id });
  assert.equal(before.reviewScope, "independent-oversight");

  const updated = operations.updateTask(ROLES.CEO, tasks[0].id, {
    status: "completed",
    note: "CEO resolved blocked work",
  });
  assert.equal(updated.status, "completed");

  const after = operations.reviewExecution(ROLES.PA, { projectId: project.id });
  assert.equal(after.counts.blocked, 0);
  assert.equal(after.counts.completed, 2);
  assert.equal(company.snapshot().tasks.find(task => task.id === tasks[0].id).status, "completed");
});
