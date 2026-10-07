import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { makeStarForgeGovernanceHandler } from "../sidecar/governance/http.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function capture() {
  return {
    status: null,
    body: "",
    writeHead(status) { this.status = status; },
    end(body = "") { this.body += body; },
  };
}

test("M6.1 mobile reality contract preserves the full governed work-to-earn lifecycle", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "starforge-m6-reality-"));
  const statePath = join(workspace, "state.json");

  try {
    const company = makeCompany({ storagePath: statePath });
    company.setMission(ROLES.CHO, {
      mission: "Build a profitable StarForge operation",
      objective: "Research and complete a governed revenue task",
    });
    const objective = company.createObjective(ROLES.CHO, {
      title: "First governed revenue",
      description: "Complete one verified StarNet task and record its earnings.",
    });

    const starnet = {
      listWorkersAsync: async () => [{
        id: "worker-1",
        name: "Researcher",
        role: ROLES.WORKER,
        model: "test-model",
        provider: "test-provider",
      }],
      inspectWorkforce: async ({ activeRuns = [] }) => ({
        source: "live-runtime-contract",
        workers: [{
          id: "worker-1",
          name: "Researcher",
          role: ROLES.WORKER,
          model: "test-model",
          provider: "test-provider",
          status: activeRuns.some((run) => run.agentId === "worker-1") ? "working" : "idle",
          activeRun: activeRuns.find((run) => run.agentId === "worker-1") ?? null,
        }],
      }),
      delegateTask: async (_role, payload) => ({
        worker: { id: payload.assigneeId },
        result: { content: "M6_1_GOVERNED_WORK_COMPLETE" },
      }),
    };

    const operations = makeOperations({ company, starnet });
    const project = operations.createProject(ROLES.CEO, {
      title: "M6.1 Revenue Mission",
      objective: "Complete a verified StarNet revenue task",
      objectiveId: objective.id,
    });
    operations.setProjectStatus(ROLES.CEO, project.id, "active");

    const execution = await operations.delegateToStarNet(ROLES.CEO, {
      projectId: project.id,
      title: "Research revenue opportunity",
      assigneeId: "worker-1",
      successCriteria: "Return the governed completion marker",
    });

    assert.equal(execution.task.status, "completed");
    assert.equal(execution.result.content, "M6_1_GOVERNED_WORK_COMPLETE");
    assert.equal(execution.task.assigneeSource, "starnet");

    const verification = operations.verifyBusinessOutcome(ROLES.PA, {
      taskId: execution.task.id,
      claim: "The StarNet worker completed the governed revenue task.",
      evidence: [{ source: "starnet-execution", supports: true }],
    });
    assert.equal(verification.verified, true);
    assert.equal(verification.label, "VERIFIED FACT");

    const revenue = company.recordFinanceEntry(ROLES.CHO, {
      id: "m6-1-revenue",
      kind: "revenue",
      amount: 200,
      currency: "EUR",
      taskId: execution.task.id,
      businessOutcomeId: verification.outcomeId,
      source: "verified-business-outcome",
    });
    assert.equal(revenue.amount, 200);

    const runtime = {
      inspectWorkforce: async () => ({
        source: "live-runtime-contract",
        workers: [{
          id: "worker-1",
          name: "Researcher",
          role: ROLES.WORKER,
          model: "test-model",
          provider: "test-provider",
          status: "idle",
        }],
      }),
    };
    const handler = makeStarForgeGovernanceHandler({
      workspace,
      company,
      roster: new Map(),
      runsMeta: new Map(),
      runtime,
    });
    const response = capture();
    await handler({ method: "GET", url: "/api/starforge/governance" }, response);
    assert.equal(response.status, 200);
    const feed = JSON.parse(response.body);
    assert.equal(feed.connection.runtimeMode, "live-starnet");
    assert.equal(feed.workforce.workers.length, 1);
    assert.equal(feed.execution.completed, 1);
    assert.equal(feed.finance.revenue, 200);
    assert.equal(feed.capital.netOperatingCapital, 200);
    assert.equal(feed.gameplay.activity[0].outcome, "completed");
    assert.equal(feed.gameplay.activity[0].xpDelta, 100);

    const reloaded = makeCompany({ storagePath: statePath });
    const persisted = reloaded.snapshot();
    assert.equal(persisted.tasks.length, 1);
    assert.equal(persisted.tasks[0].status, "completed");
    assert.equal(persisted.tasks[0].businessOutcome.verified, true);
    assert.equal(persisted.finance.entries.length, 1);
    assert.equal(persisted.finance.entries[0].amount, 200);

    const frontend = await readFile(new URL("../frontend/index.html", import.meta.url), "utf8");
    assert.match(frontend, /data-term="starforge-hq"/);
    assert.match(frontend, /data-term="starforge-worker-room"/);
    assert.match(frontend, /data-term="starforge-mission-control"/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
