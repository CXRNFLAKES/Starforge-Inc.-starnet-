import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStarForgeGovernanceHandler } from '../sidecar/governance/http.js';

function responseProbe(){
  return { status:null, headers:null, body:null, writeHead(code,headers){this.status=code;this.headers=headers;}, end(body){this.body=body;} };
}

test('StarForge governance HTTP feed exposes governed capital and live StarNet workforce',async()=>{
  const root=await import('node:fs/promises').then(fs=>fs.mkdtemp('/tmp/starforge-http-'));
  const roster=new Map([
    ['alpha',{name:'Alpha',model:'test-model',provider:'test',role:'worker'}],
    ['beta',{name:'Beta',model:'test-model',provider:'test',role:'worker'}],
  ]);
  const runsMeta=new Map([['run-1',{agentId:'alpha'}]]);
  const handle=makeStarForgeGovernanceHandler({workspace:root,roster,runsMeta});
  const res=responseProbe();
  await handle({method:'GET',url:'/api/starforge/governance'},res);
  assert.equal(res.status,200);
  const body=JSON.parse(res.body);
  assert.equal(body.ok,true);
  assert.equal(body.source,'starforge-governance');
  assert.equal(body.capital.netOperatingCapital,0);
  assert.equal(body.workforce.source,'live-starnet-runtime');
  assert.equal(body.workforce.workerCount,2);
  assert.equal(body.workforce.counts.working,1);
  assert.equal(body.workforce.counts.idle,1);
  assert.equal(body.workforce.workers[0].status,'working');
});
