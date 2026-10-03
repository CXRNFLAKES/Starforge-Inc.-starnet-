import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeStarForgeRoute } from "../sidecar/starforge-http.cjs";

test("StarNet sidecar exposes the StarForge governance feed from its own runtime state", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "starforge-route-"));
  const roster = new Map([
    ["agent-1", { name: "Nova", model: "test-model", provider: "test", role: "Researcher", skills: ["research"] }],
  ]);
  const runsMeta = new Map([
    ["run-1", { agentId: "agent-1", status: "working", title: "Market scan" }],
  ]);
  const route = makeStarForgeRoute({ workspace, roster, runsMeta });
  let status = 0;
  let body = "";
  const res = {
    writeHead(code) { status = code; },
    end(value) { body = String(value ?? ""); },
  };
  await route({ method: "GET", url: "/api/starforge/governance" }, res);
  const payload = JSON.parse(body);
  assert.equal(status, 200);
  assert.equal(payload.connection.runtimeConfigured, true);
  assert.equal(payload.workforce.source, "live-starnet-sidecar");
  assert.equal(payload.workforce.workers[0].id, "agent-1");
  assert.equal(payload.workforce.workers[0].status, "working");
  assert.equal(payload.workforce.workers[0].activeRun.title, "Market scan");
  assert.equal(payload.capital.netOperatingCapital, 0);
  assert.equal(payload.level.level, 1);
});

test("StarNet sidecar governance feed is read-only", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "starforge-route-readonly-"));
  const route = makeStarForgeRoute({ workspace, roster: new Map(), runsMeta: new Map() });
  let status = 0;
  let body = "";
  const res = { writeHead(code) { status = code; }, end(value) { body = String(value ?? ""); } };
  await route({ method: "POST", url: "/api/starforge/governance" }, res);
  assert.equal(status, 405);
  assert.match(body, /read-only/i);
});
