import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";
import { connectStarNetRuntime } from "../sidecar/governance/starnet-runtime-connection.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

async function withRuntime(fn) {
  const calls = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    calls.push({ method: req.method, url: req.url, body });
    res.setHeader("content-type", "application/json");
    if (req.method === "GET" && req.url === "/api/runtime/agent") {
      res.end(JSON.stringify({ agents: [{ id: "worker-live-1", name: "Live Researcher", model: "runtime-model" }] }));
      return;
    }
    if (req.method === "POST" && req.url === "/api/team/dispatch") {
      assert.equal(body.workers[0].agentId, "worker-live-1");
      assert.match(body.workers[0].prompt, /M6\.2 LIVE STARNet EXECUTION/);
      res.end(JSON.stringify({ content: "M6_2_LIVE_STARNET_EXECUTION_COMPLETE", workerId: "worker-live-1" }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try { await fn(`http://127.0.0.1:${port}`, calls); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("M6.2 live StarNet bridge executes governed work through the real runtime HTTP seam", async () => {
  await withRuntime(async (baseUrl, calls) => {
    const workspace = await mkdtemp(join(tmpdir(), "starforge-m6-live-"));
    try {
      const company = makeCompany({ storagePath: join(workspace, "state.json") });
      const objective = company.createObjective(ROLES.CHO, {
        title: "M6.2 live StarNet objective",
        description: "Execute one governed task through the live runtime bridge.",
      });
      const connection = await connectStarNetRuntime({ baseUrl });
      assert.equal(connection.connected, true);
      assert.equal(connection.source, "live-runtime");
      assert.equal(connection.workerCount, 1);

      const operations = makeOperations({ company, starnet: connection.bridge });
      const project = operations.createProject(ROLES.CEO, {
        title: "M6.2 Live StarNet Mission",
        objective: "Execute through StarNet runtime",
        objectiveId: objective.id,
      });
      operations.setProjectStatus(ROLES.CEO, project.id, "active");

      const execution = await operations.delegateToStarNet(ROLES.CEO, {
        projectId: project.id,
        title: "M6.2 LIVE STARNet EXECUTION",
        assigneeId: "worker-live-1",
        successCriteria: "Return the M6.2 completion marker.",
      });

      assert.equal(execution.task.status, "completed");
      assert.equal(execution.task.assigneeSource, "starnet");
      assert.equal(execution.result.content, "M6_2_LIVE_STARNET_EXECUTION_COMPLETE");
      assert.equal(calls.filter((call) => call.url === "/api/runtime/agent").length >= 2, true);
      assert.equal(calls.filter((call) => call.url === "/api/team/dispatch").length, 1);

      const persisted = makeCompany({ storagePath: join(workspace, "state.json") }).snapshot();
      assert.equal(persisted.tasks[0].status, "completed");
      assert.equal(persisted.tasks[0].execution.provider, "starnet");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
