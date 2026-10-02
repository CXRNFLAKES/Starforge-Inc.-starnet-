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
  assert.equal(payload.execution.taskCount, 0);
  assert.equal(payload.execution.source, "starforge-governed-task-ledger");
});

test("mobile governance bridge rejects write methods", async () => {
  const handler = makeStarForgeGovernanceHandler({ workspace: ".starforge-test" });
  let status, body = "";
  const res = { writeHead(code) { status = code; }, end(value) { body = value; } };
  await handler({ method: "POST", url: "/api/starforge/governance" }, res);
  assert.equal(status, 405);
  assert.match(JSON.parse(body).error, /read-only/);
});


test('governance HTTP feed exposes bounded PA finance telemetry from the governed ledger', async () => {
  const workspace = '.starforge-test-finance';
  const { mkdir, writeFile, rm } = await import('node:fs/promises');
  await mkdir(workspace, { recursive: true });
  await writeFile(workspace + '/starforge.company.json', JSON.stringify({ finance: { currency: 'EUR', openingCapital: 1000, entries: [
    { id: 'rev', kind: 'revenue', amount: 500, currency: 'EUR' },
    { id: 'exp', kind: 'expense', amount: 100, currency: 'EUR' }
  ]}}));
  const handler = (await import('../sidecar/governance/http.js')).makeStarForgeGovernanceHandler({ workspace, roster: new Map(), runsMeta: new Map() });
  let body='';
  const res={writeHead(){},end(value){body=value;}};
  await handler({method:'GET',url:'/api/starforge/governance'},res);
  const payload=JSON.parse(body);
  assert.equal(payload.finance.netOperatingCapital,1400);
  assert.equal(payload.finance.recentEntries.length,2);
  await rm(workspace,{recursive:true,force:true});
});
