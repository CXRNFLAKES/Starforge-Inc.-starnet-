import test from "node:test";
import assert from "node:assert/strict";
import { makeStarForgeGovernanceHandler } from "../sidecar/governance/http.mjs";

test("mobile governance bridge exposes read-only state", async () => {
  const handler = makeStarForgeGovernanceHandler({ workspace: ".starforge-test", roster: new Map([["worker-1", { name: "Worker 1" }]]), runsMeta: new Map([["run-1", { status: "working" }]]) });
  let status, body = "";
  const res = { writeHead(code) { status = code; }, end(value) { body = value; } };
  await handler({ method: "GET", url: "/api/starforge/governance" }, res);
  assert.equal(status, 200);
  const payload = JSON.parse(body);
  assert.equal(payload.ok, true);
  assert.equal(payload.readOnly, true);
  assert.equal(payload.workforce.count, 1);
  assert.equal(payload.activeRuns.length, 1);
});

test("mobile governance bridge rejects write methods", async () => {
  const handler = makeStarForgeGovernanceHandler({ workspace: ".starforge-test" });
  let status, body = "";
  const res = { writeHead(code) { status = code; }, end(value) { body = value; } };
  await handler({ method: "POST", url: "/api/starforge/governance" }, res);
  assert.equal(status, 405);
  assert.match(JSON.parse(body).error, /read-only/);
});
