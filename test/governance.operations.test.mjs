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

test("CEO, PA, and Vice CEO can review StarNet execution within separate scopes", async () => {
  const company = makeCompany();
  const operations = makeOperations({
    company,
    starnet: {
      listWorkers: () => [{ id: "worker-a", name: "Worker A" }],
      delegateTask: async () => ({ result: { content: "done" } }),
    },
  });
  const project = operations.createProject(ROLES.CEO, { title: "StarNet review project" });
  const task = await operations.delegateToStarNet(ROLES.CEO, {
    projectId: project.id, title: "StarNet task", assigneeId: "worker-a",
  });

  const ceo = operations.reviewStarNetExecution(ROLES.CEO, { projectId: project.id });
  const pa = operations.reviewStarNetExecution(ROLES.PA, { projectId: project.id });
  const vice = operations.reviewStarNetExecution(ROLES.VICE_CEO, { projectId: project.id });

  assert.equal(task.task.status, "completed");
  assert.equal(ceo.reviewScope, "operational-review");
  assert.equal(pa.reviewScope, "independent-oversight");
  assert.equal(vice.reviewScope, "starnet-operational-review");
  assert.equal(ceo.counts.completed, 1);
  assert.equal(pa.tasks[0].assigneeSource, "starnet");
  assert.equal(vice.tasks[0].id, task.task.id);

  assert.throws(() => operations.reviewStarNetExecution(ROLES.BOARD), /Only the CEO, PA, or StarNet Vice CEO/);
});

test("StarNet adapter reports working and idle workforce agents", () => {
  const adapter = makeStarNetAdapter({
    roster: () => [
      { id: "worker-a", name: "Worker A" },
      { id: "worker-b", name: "Worker B" },
    ],
    dispatch: async () => ({ content: "unused" }),
  });
  const snapshot = adapter.inspectWorkforce({
    activeRuns: [{ agentId: "worker-b", runId: "run-7" }],
  });
  assert.equal(snapshot.workerCount, 2);
  assert.equal(snapshot.counts.working, 1);
  assert.equal(snapshot.counts.idle, 1);
  assert.equal(snapshot.workers.find((worker) => worker.id === "worker-b").status, "working");
  assert.equal(snapshot.workers.find((worker) => worker.id === "worker-a").status, "idle");
});

test("StarNet adapter awaits async dispatch results and preserves completion payload", async () => {
  let received = null;
  const adapter = makeStarNetAdapter({
    roster: () => [{ id: "worker-a", name: "Worker A" }],
    dispatch: async (request) => {
      received = request;
      return { content: "completed", summary: "1 worker completed" };
    },
  });

  const result = await adapter.delegateTask(ROLES.CEO, {
    id: "task-1",
    projectId: "project-1",
    assigneeId: "worker-a",
    title: "Execute research",
    successCriteria: "Return findings",
    context: "StarForge context",
  });

  assert.equal(received.parallel, false);
  assert.equal(received.workers[0].agentId, "worker-a");
  assert.match(received.workers[0].prompt, /Execute research/);
  assert.match(received.workers[0].prompt, /Return findings/);
  assert.equal(result.result.content, "completed");
  assert.equal(result.result.summary, "1 worker completed");
});

test("StarNet adapter fails closed on invalid dispatch results", async () => {
  const adapter = makeStarNetAdapter({
    roster: () => [{ id: "worker-a", name: "Worker A" }],
    dispatch: async () => null,
  });

  await assert.rejects(
    () => adapter.delegateTask(ROLES.CEO, {
      assigneeId: "worker-a",
      title: "Invalid result test",
    }),
    /StarNet dispatch returned an invalid result/,
  );
});

test("StarNet adapter rejects malformed dispatch payloads without content", async () => {
  const adapter = makeStarNetAdapter({
    roster: () => [{ id: "worker-a", name: "Worker A" }],
    dispatch: async () => ({ summary: "missing content" }),
  });

  await assert.rejects(
    () => adapter.delegateTask(ROLES.CEO, {
      assigneeId: "worker-a",
      title: "Malformed result test",
    }),
    /StarNet dispatch returned a result without content/,
  );
});


test("StarNet adapter normalizes provider dispatch failures", async () => {
  const adapter = makeStarNetAdapter({
    roster: () => [{ id: "worker-a", name: "Worker A" }],
    dispatch: async () => { throw new Error("provider unavailable"); },
  });

  await assert.rejects(
    () => adapter.delegateTask(ROLES.CEO, {
      assigneeId: "worker-a",
      title: "Failure normalization",
    }),
    /StarNet dispatch failed: provider unavailable/,
  );
});



test("StarNet delegation preserves the dispatch request at the governance boundary", async () => {
  const company = makeCompany();
  let captured = null;
  const operations = makeOperations({
    company,
    starnet: {
      listWorkers: () => [{ id: "worker-a", name: "Worker A" }],
      delegateTask: async (_role, task) => {
        captured = task;
        return { result: { content: "done" } };
      },
    },
  });

  const project = operations.createProject(ROLES.CEO, { title: "Boundary test" });
  await operations.delegateToStarNet(ROLES.CEO, {
    projectId: project.id,
    title: "Research",
    assigneeId: "worker-a",
    successCriteria: "Return verified findings",
    context: "Company context",
  });

  assert.deepEqual(captured, {
    id: company.snapshot().tasks[0].id,
    projectId: project.id,
    assigneeId: "worker-a",
    title: "Research",
    successCriteria: "Return verified findings",
    context: "Company context",
  });
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

test("PA can review operational execution as independent oversight without mutation authority", () => {
  const company = makeCompany();
  company.registerPerson(ROLES.CHO, { id: "worker-a", name: "Worker A", role: ROLES.WORKER });
  const operations = makeOperations({ company });
  const project = operations.createProject(ROLES.CEO, { title: "PA oversight project" });
  const task = operations.delegateTask(ROLES.CEO, {
    projectId: project.id, title: "Oversight task", assigneeId: "worker-a",
  });
  operations.updateTask(ROLES.WORKER, task.id, {
    actorId: "worker-a", status: "blocked", note: "Waiting on input",
  });

  const review = operations.reviewExecution(ROLES.PA, { projectId: project.id });
  assert.equal(review.reviewScope, "independent-oversight");
  assert.equal(review.taskCount, 1);
  assert.equal(review.counts.blocked, 1);
  assert.equal(review.attentionNeeded[0].id, task.id);

  assert.throws(
    () => operations.updateTask(ROLES.PA, task.id, { status: "completed" }),
    /Unauthorized task update/,
  );
  assert.equal(operations.inspect({ projectId: project.id }).tasks[0].status, "blocked");
});

test("CEO execution review is restricted to CEO or PA oversight", () => {
  const company = makeCompany();
  const operations = makeOperations({ company });
  const paReview = operations.reviewExecution(ROLES.PA);
  assert.equal(paReview.reviewScope, "independent-oversight");
  assert.equal(paReview.taskCount, 0);
  assert.throws(() => operations.reviewExecution(ROLES.CHO), /Only the CEO or PA/);
});


test("StarForge leadership can inspect the live StarNet workforce without mutating it", () => {
  const company = makeCompany();
  const starnet = makeStarNetAdapter({
    roster: () => new Map([
      ["researcher-1", { name: "Researcher", model: "model-a", capabilities: ["research"] }],
      ["builder-1", { name: "Builder", model: "model-b", capabilities: ["code"] }],
      ["analyst-1", { name: "Analyst", model: "model-c", capabilities: ["analysis"] }],
    ]),
    dispatch: () => ({ content: "unused" }),
  });
  const operations = makeOperations({ company, starnet });

  const ceo = operations.inspectStarNetWorkforce(ROLES.CEO);
  const pa = operations.inspectStarNetWorkforce(ROLES.PA);
  const vice = operations.inspectStarNetWorkforce(ROLES.VICE_CEO);

  assert.equal(ceo.source, "live-roster");
  assert.equal(ceo.workerCount, 3);
  assert.equal(ceo.workers[0].id, "researcher-1");
  assert.equal(pa.reviewScope, "independent-oversight");
  assert.equal(vice.reviewScope, "starnet-operational-review");
  assert.throws(
    () => operations.inspectStarNetWorkforce(ROLES.BOARD),
    /Only the CEO, PA, or StarNet Vice CEO/,
  );
});


test("StarForge leadership workforce inspection preserves live working and idle status", () => {
  const company = makeCompany();
  const starnet = makeStarNetAdapter({
    roster: () => [
      { id: "worker-a", name: "Worker A" },
      { id: "worker-b", name: "Worker B" },
    ],
    dispatch: async () => ({ content: "unused" }),
  });
  const operations = makeOperations({ company, starnet });

  const snapshot = operations.inspectStarNetWorkforce(ROLES.CEO, {
    activeRuns: [{ agentId: "worker-b", runId: "run-9" }],
  });

  assert.equal(snapshot.workerCount, 2);
  assert.equal(snapshot.counts.working, 1);
  assert.equal(snapshot.counts.idle, 1);
  assert.equal(snapshot.workers.find((worker) => worker.id === "worker-b").status, "working");
  assert.equal(snapshot.workers.find((worker) => worker.id === "worker-a").status, "idle");
  assert.equal(snapshot.reviewScope, "operational-review");
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


test("CEO operations can execute a StarNet task and persist the completed execution", async () => {
  const company = makeCompany();
  const starnet = makeStarNetAdapter({
    roster: () => new Map([["researcher-1", { name: "Researcher", model: "model-a", capabilities: ["research"] }]]),
    dispatch: async (request) => ({
      content: JSON.stringify([{ agentId: request.workers[0].agentId, reason: "done" }]),
      summary: "dispatched 1 worker",
    }),
  });
  const operations = makeOperations({ company, starnet });
  const project = operations.createProject(ROLES.CEO, { title: "StarNet project" });

  const result = await operations.delegateToStarNet(ROLES.CEO, {
    projectId: project.id,
    title: "Research qualified leads",
    assigneeId: "researcher-1",
    successCriteria: "Return a concise sourced lead list",
    context: "StarForge revenue objective",
  });

  assert.equal(result.worker.id, "researcher-1");
  assert.equal(result.task.status, "completed");
  assert.equal(result.task.assigneeSource, "starnet");
  assert.equal(result.task.execution.provider, "starnet");
  assert.equal(result.result.summary, "dispatched 1 worker");

  const stored = operations.inspect({ projectId: project.id });
  assert.equal(stored.tasks.length, 1);
  assert.equal(stored.tasks[0].status, "completed");
  assert.equal(stored.tasks[0].execution.provider, "starnet");
});

test("CEO operations persist a failed StarNet execution and rethrow the engine error", async () => {
  const company = makeCompany();
  const starnet = makeStarNetAdapter({
    roster: () => new Map([["researcher-1", { name: "Researcher" }]]),
    dispatch: async () => {
      throw new Error("StarNet execution failed");
    },
  });
  const operations = makeOperations({ company, starnet });
  const project = operations.createProject(ROLES.CEO, { title: "Failure test" });

  await assert.rejects(
    () => operations.delegateToStarNet(ROLES.CEO, {
      projectId: project.id,
      title: "Failing research",
      assigneeId: "researcher-1",
    }),
    /StarNet execution failed/,
  );

  const stored = operations.inspect({ projectId: project.id });
  assert.equal(stored.tasks.length, 1);
  assert.equal(stored.tasks[0].status, "failed");
  assert.equal(stored.tasks[0].note, "StarNet dispatch failed: StarNet execution failed");
});
test("StarNet Vice CEO can delegate through the StarNet execution bridge", async () => {
  const company = makeCompany();
  const starnet = makeStarNetAdapter({
    roster: () => new Map([["researcher-1", { name: "Researcher", model: "model-a" }]]),
    dispatch: async (request) => ({
      content: JSON.stringify([{ agentId: request.workers[0].agentId, reason: "done" }]),
      summary: "dispatched 1 worker",
    }),
  });
  const operations = makeOperations({ company, starnet });
  const project = operations.createProject(ROLES.CEO, { title: "Vice CEO StarNet project" });

  const result = await operations.delegateToStarNet(ROLES.VICE_CEO, {
    projectId: project.id,
    title: "Execute StarNet research",
    assigneeId: "researcher-1",
    successCriteria: "Return the requested research",
  });

  assert.equal(result.task.delegatedBy, ROLES.VICE_CEO);
  assert.equal(result.task.assigneeSource, "starnet");
  assert.equal(result.task.status, "completed");
  assert.equal(result.worker.id, "researcher-1");
  assert.equal(result.result.summary, "dispatched 1 worker");
});
