import test from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { makeStarNetAdapter } from "../sidecar/governance/starnet-adapter.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { makeOrchestrationTools } = require("../sidecar/tools/builtin/orchestration.js");

test("CEO can create projects and delegate tasks without CHO execution authority", () => {
  const company = makeCompany();
  const operations = makeOperations({ company });
  const project = operations.createProject(ROLES.CEO, { title: "Revenue sprint", objective: "Build a measurable revenue pipeline" });
  const task = operations.delegateTask(ROLES.CEO, { projectId: project.id, title: "Research qualified leads", assigneeId: "main-overseer", successCriteria: "Produce a sourced lead list" });
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
  const task = operations.delegateTask(ROLES.CEO, { projectId: project.id, title: "Complete test", assigneeId: "worker-a" });
  const updated = operations.updateTask(ROLES.WORKER, task.id, { actorId: "worker-a", status: "in-progress", note: "Started" });
  assert.equal(updated.status, "in-progress");
  assert.throws(() => operations.updateTask(ROLES.WORKER, task.id, { actorId: "worker-b", status: "completed" }), /Unauthorized task update/);
});

test("projects and tasks survive company persistence", () => {
  let stored;
  const firstCompany = makeCompany({ save: (snapshot) => { stored = snapshot; } });
  const firstOperations = makeOperations({ company: firstCompany });
  const project = firstOperations.createProject(ROLES.CEO, { title: "Persistent project" });
  const task = firstOperations.delegateTask(ROLES.CEO, { projectId: project.id, title: "Persistent task", assigneeId: "main-overseer" });
  assert.equal(stored.projects.length, 1);
  assert.equal(stored.tasks.length, 1);
  const restoredCompany = makeCompany({ load: () => stored });
  const restoredOperations = makeOperations({ company: restoredCompany });
  const snapshot = restoredOperations.inspect({ projectId: project.id });
  assert.equal(snapshot.projects[0].id, project.id);
  assert.equal(snapshot.tasks[0].id, task.id);
});

test("CEO execution review summarizes task states and isolates project scope", () => {
  const company = makeCompany();
  company.registerPerson(ROLES.CHO, { id: "worker-a", name: "Worker A", role: ROLES.WORKER });
  const operations = makeOperations({ company });
  const projectA = operations.createProject(ROLES.CEO, { title: "Project A" });
  const projectB = operations.createProject(ROLES.CEO, { title: "Project B" });
  const blocked = operations.delegateTask(ROLES.CEO, { projectId: projectA.id, title: "Blocked work", assigneeId: "worker-a" });
  const failed = operations.delegateTask(ROLES.CEO, { projectId: projectA.id, title: "Failed work", assigneeId: "worker-a" });
  const completed = operations.delegateTask(ROLES.CEO, { projectId: projectA.id, title: "Completed work", assigneeId: "worker-a" });
  operations.delegateTask(ROLES.CEO, { projectId: projectB.id, title: "Other project", assigneeId: "worker-a" });

  operations.updateTask(ROLES.WORKER, blocked.id, { actorId: "worker-a", status: "blocked", note: "Waiting on input" });
  operations.updateTask(ROLES.WORKER, failed.id, { actorId: "worker-a", status: "failed", note: "Acceptance criteria missed" });
  operations.updateTask(ROLES.WORKER, completed.id, { actorId: "worker-a", status: "completed", note: "Verified" });

  const review = operations.reviewExecution(ROLES.CEO, { projectId: projectA.id });
  assert.equal(review.projectId, projectA.id);
  assert.equal(review.taskCount, 3);
  assert.equal(review.counts.assigned, 0);
  assert.equal(review.counts.blocked, 1);
  assert.equal(review.counts.failed, 1);
  assert.equal(review.counts.completed, 1);
  assert.equal(review.attentionNeeded.length, 2);
  assert.deepEqual(review.blocked.map((item) => item.id), [blocked.id]);
  assert.deepEqual(review.failed.map((item) => item.id), [failed.id]);
  assert.deepEqual(review.completed.map((item) => item.id), [completed.id]);

  const all = operations.reviewExecution(ROLES.CEO);
  assert.equal(all.taskCount, 4);
  assert.equal(all.counts.assigned, 1);
});

test("CEO execution review is restricted to the CEO", () => {
  const company = makeCompany();
  const operations = makeOperations({ company });
  assert.throws(() => operations.reviewExecution(ROLES.PA), /Unauthorized action|Only the CEO/);
  assert.throws(() => operations.reviewExecution(ROLES.CHO), /Unauthorized action|Only the CEO/);
});


test("StarForge can discover the live StarNet worker roster through the adapter", () => {
  const adapter = makeStarNetAdapter({
    roster: () => new Map([
      ["researcher-1", { name: "Researcher", model: "model-a", capabilities: ["web"] }],
      ["builder-1", { name: "Builder", model: "model-b", reasoningEffort: "high" }],
    ]),
    dispatch: () => ({ content: "unused" }),
  });

  assert.deepEqual(adapter.listWorkers(), [
    { id: "researcher-1", name: "Researcher", model: "model-a", provider: null, reasoningEffort: null, capabilities: ["web"] },
    { id: "builder-1", name: "Builder", model: "model-b", provider: null, reasoningEffort: "high", capabilities: [] },
  ]);
});

test("StarForge delegates a governed task through the existing StarNet dispatch seam", async () => {
  let request;
  const adapter = makeStarNetAdapter({
    roster: () => new Map([["researcher-1", { name: "Researcher", model: "model-a" }]]),
    dispatch: (value) => {
      request = value;
      return { content: '[{"agentId":"researcher-1","reason":"done"}]', summary: "dispatched 1 worker" };
    },
  });

  const result = await adapter.delegateTask(ROLES.CEO, {
    id: "task-1",
    projectId: "project-1",
    assigneeId: "researcher-1",
    title: "Research qualified leads",
    successCriteria: "Produce a sourced lead list",
    context: "Use the company's current revenue objective.",
  });

  assert.equal(result.taskId, "task-1");
  assert.equal(result.projectId, "project-1");
  assert.equal(result.assigneeId, "researcher-1");
  assert.equal(request.workers[0].agentId, "researcher-1");
  assert.match(request.workers[0].prompt, /Research qualified leads/);
  assert.match(request.workers[0].prompt, /Success criteria/);
  assert.equal(request.workers[0].context, "Use the company's current revenue objective.");
});

test("StarNet adapter fails closed for unauthorized or unknown worker delegation", async () => {
  const adapter = makeStarNetAdapter({
    roster: () => new Map([["researcher-1", { name: "Researcher" }]]),
    dispatch: () => ({ content: "should not run" }),
  });

  await assert.rejects(
    () => adapter.delegateTask(ROLES.PA, { assigneeId: "researcher-1", title: "Research" }),
    /Unauthorized action/,
  );
  await assert.rejects(
    () => adapter.delegateTask(ROLES.CEO, { assigneeId: "missing-worker", title: "Research" }),
    /not present in the live roster/,
  );
});


test("StarForge adapter can drive the real StarNet team.dispatch engine", async () => {
  const runCalls = [];
  const orchestration = makeOrchestrationTools({
    runOnce: async (options) => {
      runCalls.push(options);
      return { reason: "done", messages: [{ role: "assistant", content: "worker completed the governed research task" }], usd: 0.1 };
    },
    roster: () => new Map([["researcher-1", { name: "Researcher", model: "model-a", system: "RESEARCH SYSTEM" }]]),
    key: "test-key", model: "lead-model",
    newId: (() => { let n = 0; return () => "bridge-run-" + (++n); })(),
  });
  const dispatchTool = orchestration.dispatchTool;
  const dispatch = dispatchTool && typeof dispatchTool.run === "function"
    ? dispatchTool.run.bind(dispatchTool)
    : null;
  assert.equal(typeof dispatch, "function");

  const adapter = makeStarNetAdapter({
    roster: () => new Map([["researcher-1", { name: "Researcher", model: "model-a", capabilities: ["research"] }]]),
    dispatch: (request) => dispatch(request, { agentId: "starforge-ceo", emit: () => {}, signal: new AbortController().signal }),
  });
  const result = await adapter.delegateTask(ROLES.CEO, {
    id: "task-real-engine-1", projectId: "project-bridge", assigneeId: "researcher-1",
    title: "Research qualified leads", successCriteria: "Return a concise sourced lead list",
    context: "This request came through StarForge governance.",
  });
  assert.equal(runCalls.length, 1);
  assert.equal(runCalls[0].agentId, "researcher-1");
  assert.match(runCalls[0].messages.at(-1).content, /Research qualified leads/);
  assert.match(runCalls[0].messages.at(-1).content, /Success criteria/);
  assert.equal(result.result.content.includes("worker completed the governed research task"), true);
});
