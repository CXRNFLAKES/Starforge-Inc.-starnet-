import test from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, can } from "../sidecar/governance/authority.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";

test("M8.2 Overseer has independent read/review authority without operational control", async () => {
  const company = makeCompany();
  const operations = makeOperations({
    company,
    starnet: {
      listWorkers: () => [{ id: "worker-m8-2", name: "M8.2 Worker" }],
      delegateTask: async () => ({ result: { content: "M8.2 GOVERNANCE REVIEW RESULT" } }),
    },
  });

  const project = operations.createProject(ROLES.CEO, {
    title: "M8.2 governed oversight lane",
  });

  const execution = await operations.delegateToStarNet(ROLES.CEO, {
    projectId: project.id,
    title: "Complete governed work",
    assigneeId: "worker-m8-2",
    successCriteria: "Return the M8.2 completion marker",
  });

  const review = operations.reviewStarNetExecution(ROLES.PA, { projectId: project.id });
  assert.equal(review.reviewScope, "independent-oversight");
  assert.equal(review.taskCount, 1);
  assert.equal(review.counts.completed, 1);
  assert.equal(review.tasks[0].id, execution.task.id);

  assert.equal(can(ROLES.PA, ACTIONS.PA_REVIEW), true);
  assert.equal(can(ROLES.PA, ACTIONS.CEO_OPERATE), false);
  assert.equal(can(ROLES.PA, ACTIONS.STARNET_DELEGATE), false);

  assert.throws(
    () => operations.createProject(ROLES.PA, { title: "PA must not operate" }),
    /Unauthorized action|Only the CEO/,
  );
  assert.throws(
    () => operations.setProjectStatus(ROLES.PA, project.id, "completed"),
    /Unauthorized action|Only the CEO/,
  );
  assert.throws(
    () => operations.delegateToStarNet(ROLES.PA, {
      projectId: project.id,
      title: "PA must not dispatch",
      assigneeId: "worker-m8-2",
    }),
    /Unauthorized action|Only the CEO or StarNet Vice CEO/,
  );
  assert.throws(
    () => operations.updateTask(ROLES.PA, execution.task.id, {
      status: "completed",
      note: "PA must not mutate execution state",
    }),
    /Unauthorized task update|Unauthorized action/,
  );
});

test("M8.2 Vice CEO keeps StarNet operational review while remaining outside CEO project control", async () => {
  const company = makeCompany();
  const operations = makeOperations({
    company,
    starnet: {
      listWorkers: () => [{ id: "worker-m8-2b", name: "M8.2 Worker B" }],
      delegateTask: async () => ({ result: { content: "M8.2 VICE CEO RESULT" } }),
    },
  });

  const project = operations.createProject(ROLES.CEO, { title: "M8.2 Vice CEO lane" });
  await operations.delegateToStarNet(ROLES.VICE_CEO, {
    projectId: project.id,
    title: "Vice CEO StarNet task",
    assigneeId: "worker-m8-2b",
    successCriteria: "Return the M8.2 Vice CEO marker",
  });

  const review = operations.reviewStarNetExecution(ROLES.VICE_CEO, { projectId: project.id });
  assert.equal(review.reviewScope, "starnet-operational-review");
  assert.equal(review.counts.completed, 1);

  assert.throws(
    () => operations.reviewExecution(ROLES.VICE_CEO, { projectId: project.id }),
    /Only the CEO or PA/,
  );
  assert.throws(
    () => operations.createProject(ROLES.VICE_CEO, { title: "Vice CEO cannot create company project" }),
    /Unauthorized action|Only the CEO/,
  );
});
