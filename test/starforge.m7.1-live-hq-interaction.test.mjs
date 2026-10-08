import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { makeStarForgeGovernanceHandler } from "../sidecar/governance/http.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

async function start(handler) {
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { server, base: `http://127.0.0.1:${address.port}` };
}

test("M7.1 live HQ bridge reflects governed StarNet execution and finance state", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "starforge-m7-1-"));
  const statePath = path.join(workspace, "state.json");
  const company = makeCompany({ storagePath: statePath });
  company.setMission(ROLES.CHO, {
    mission: "Build a profitable AI operating company",
    objective: "Complete governed StarNet work and record the business result",
  });
  company.recordFinanceEntry(ROLES.CHO, {
    id: "m7-1-capital",
    kind: "capital-injection",
    amount: 1000,
    currency: "EUR",
  });
  const project = makeOperations({ company }).createProject(ROLES.CEO, {
    title: "M7.1 Live HQ Mission",
    objective: "Complete governed StarNet work and record the business result",
  });

  const dispatches = [];
  const runtime = {
    async listWorkers() {
      return [{ id: "starnet-vice-ceo", name: "Live StarNet Worker", role: "worker", model: "live-model", provider: "live-provider" }];
    },
    async delegateTask(actorRole, task) {
      dispatches.push({ actorRole, task });
      return { result: { content: "M7.1 LIVE STARFORGE RESULT" } };
    },
  };

  const operations = makeOperations({ company, starnet: runtime });
  const execution = await operations.delegateToStarNet(ROLES.VICE_CEO, {
    projectId: project.id,
    title: "Execute the HQ mission",
    assigneeId: "starnet-vice-ceo",
    successCriteria: "Return the M7.1 completion marker.",
    executionKey: "m7.1-live-hq",
  });
  company.recordFinanceEntry(ROLES.CHO, {
    id: "m7-1-revenue",
    kind: "revenue",
    amount: 200,
    currency: "EUR",
    note: "Governed StarNet mission result",
  });

  const handler = makeStarForgeGovernanceHandler({
    workspace,
    roster: new Map(),
    runsMeta: new Map(),
    runtime,
    company,
  });
  const { server, base } = await start(handler);

  try {
    const response = await fetch(base + "/api/starforge/governance", {
      headers: { "X-StarNet-Token": "test-token", Origin: base },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.ok, true);
    assert.equal(payload.readOnly, true);
    assert.equal(payload.connection.runtimeMode, "live-starnet");
    assert.equal(payload.connection.workforceSource, "live-runtime-roster");
    assert.equal(payload.workforce.count, 1);
    assert.equal(payload.workforce.workers[0].id, "starnet-vice-ceo");
    assert.equal(payload.execution.completed, 1);
    assert.equal(payload.execution.recentTasks[0].execution.provider, "starnet");
    assert.equal(payload.execution.recentTasks[0].execution.result.content, "M7.1 LIVE STARFORGE RESULT");
    assert.equal(payload.gameplay.projects[0].completed, 1);
    assert.equal(payload.gameplay.projects[0].outcome, "completed");
    assert.equal(payload.finance.recentEntries[0].amount, 200);
    assert.equal(payload.capital.cash, 1200);
    assert.equal(dispatches.length, 1);

    const persisted = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.equal(persisted.tasks.length, 1);
    assert.equal(persisted.tasks[0].status, "completed");
    assert.equal(persisted.tasks[0].execution.provider, "starnet");
    assert.equal(persisted.finance.entries.some((entry) => entry.id === "m7-1-revenue"), true);

    const write = await fetch(base + "/api/starforge/governance", {
      method: "POST",
      headers: { "X-StarNet-Token": "test-token", Origin: base, "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(write.status, 405);
  } finally {
    server.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
