import test from "node:test";
import assert from "node:assert/strict";
import { makeStarNetRuntimeBridge } from "../sidecar/governance/starnet-runtime.mjs";

test("runtime bridge reads the live StarNet roster", async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    return { ok: true, async json() { return { agents: [
      { agentId: "nova", name: "NOVA", model: "test/model", provider: "openrouter", capabilities: ["research"] },
      { agentId: "builder", name: "BUILDER", model: "test/model", capabilities: ["code"] },
    ]}; } };
  };
  const bridge = makeStarNetRuntimeBridge({ baseUrl: "http://starnet.test/", fetchImpl });
  const snapshot = await bridge.inspectWorkforce({ activeRuns: [{ agentId: "builder" }] });
  assert.equal(snapshot.source, "live-runtime");
  assert.equal(snapshot.workerCount, 2);
  assert.equal(snapshot.counts.working, 1);
  assert.equal(snapshot.counts.idle, 1);
  assert.equal(snapshot.workers.find((w) => w.id === "builder").status, "working");
  assert.equal(requests[0], "http://starnet.test/api/roster");
});

test("runtime bridge fails closed on unavailable runtime", async () => {
  const bridge = makeStarNetRuntimeBridge({
    baseUrl: "http://starnet.test",
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(() => bridge.inspectWorkforce(), /StarNet runtime request failed: 503/);
});

test("runtime bridge can be disabled without a URL", () => {
  assert.equal(makeStarNetRuntimeBridge({}), null);
});
