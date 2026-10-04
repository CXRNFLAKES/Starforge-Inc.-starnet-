import test from "node:test";
import assert from "node:assert/strict";
import { makeStarNetRuntimeBridge } from "../sidecar/governance/starnet-runtime.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function fetchMock(url, options = {}) {
  if (url.endsWith("/api/roster")) {
    return Promise.resolve(new Response(JSON.stringify({
      agents: [{ id: "remote-1", name: "Remote One", model: "live-model" }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
  }
  if (url.endsWith("/api/team/dispatch")) {
    assert.equal(options.method, "POST");
    return Promise.resolve(new Response(JSON.stringify({
      content: "remote execution complete",
      summary: "1 worker completed",
    }), { status: 200, headers: { "content-type": "application/json" } }));
  }
  throw new Error("unexpected URL: " + url);
}

test("live StarNet runtime bridge reports a connected runtime readiness state", async () => {
  const bridge = makeStarNetRuntimeBridge({ baseUrl: "http://starnet.test", fetchImpl: fetchMock });
  assert.deepEqual(await bridge.probeRuntime(), {
    connected: true,
    source: "live-runtime",
    workerCount: 1,
  });
});

test("live StarNet runtime bridge asynchronously exposes its roster", async () => {
  const bridge = makeStarNetRuntimeBridge({ baseUrl: "http://starnet.test", fetchImpl: fetchMock });
  const workers = await bridge.listWorkers();
  assert.deepEqual(workers, [{ id: "remote-1", name: "Remote One", model: "live-model" }]);
  const inspected = await bridge.inspectWorkforce({ activeRuns: [{ agentId: "remote-1", runId: "run-1" }] });
  assert.equal(inspected.source, "live-runtime");
  assert.equal(inspected.workers[0].status, "working");
});

test("live StarNet runtime bridge delegates through the existing dispatch endpoint", async () => {
  const bridge = makeStarNetRuntimeBridge({ baseUrl: "http://starnet.test", fetchImpl: fetchMock });
  const result = await bridge.delegateTask(ROLES.CEO, {
    id: "task-remote-1",
    projectId: "project-remote",
    assigneeId: "remote-1",
    title: "Remote research",
    successCriteria: "Return verified findings",
  });
  assert.equal(result.worker.id, "remote-1");
  assert.equal(result.result.content, "remote execution complete");
});


test("StarNet provider registry exposes APInex through the existing OpenAI-compatible adapter", async () => {
  const module = await import("../sidecar/providers/registry.js");
  const registry = module.default || module;
  const profile = registry.getProviderProfile("apinex");
  assert.equal(profile.id, "apinex");
  assert.equal(profile.adapter, "openai-compatible");
  assert.equal(profile.baseUrl, "https://api.apinex.bond/v1");
  assert.deepEqual(profile.keyEnv, ["APINEX_API_KEY"]);
  assert.equal(profile.modelsPath, "/models");
  assert.equal(profile.wireReasoningEffort, true);
});
