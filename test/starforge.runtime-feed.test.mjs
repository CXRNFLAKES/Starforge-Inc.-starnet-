import test from "node:test";
import assert from "node:assert/strict";
import { makeStarForgeGovernanceHandler } from "../sidecar/governance/http.mjs";

test("governance feed can consume the live StarNet runtime bridge", async () => {
  const runtime = {
    async inspectWorkforce({ activeRuns }) {
      assert.equal(activeRuns.length, 1);
      return {
        source: "live-runtime",
        workers: [
          { id: "agent-1", name: "Nova", model: "test-model", status: "working", activeRun: activeRuns[0] },
        ],
      };
    },
  };
  const handler = makeStarForgeGovernanceHandler({
    workspace: ".starforge-runtime-feed-test",
    roster: new Map([["fallback", { name: "Fallback" }]]),
    runsMeta: new Map([["run-1", { agentId: "agent-1", status: "working" }]]),
    runtime,
  });
  let status; let body = "";
  const res = { writeHead(code) { status = code; }, end(value) { body = value; } };
  await handler({ method: "GET", url: "/api/starforge/governance" }, res);
  const payload = JSON.parse(body);
  assert.equal(status, 200);
  assert.equal(payload.workforce.source, "live-runtime");
  assert.equal(payload.workforce.count, 1);
  assert.equal(payload.workforce.workers[0].id, "agent-1");
  assert.equal(payload.workforce.workers[0].status, "working");
});
