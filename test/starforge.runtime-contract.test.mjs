import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeStarForgeGovernanceHandler } from '../sidecar/governance/http.mjs';
import { makeCompany } from '../sidecar/governance/company.mjs';
import { ROLES } from '../sidecar/governance/roles.mjs';

function responseCapture(){return {status:null,headers:null,body:'',writeHead(status,headers){this.status=status;this.headers=headers;},end(body=''){this.body+=body;}};}

test('live StarNet runtime is authoritative for the StarForge mobile workforce feed',async()=>{
  const workspace=await mkdtemp(join(tmpdir(),'starforge-runtime-'));
  try{
    await writeFile(join(workspace,'state.json'),JSON.stringify({}));
    const roster=new Map([['worker-1',{name:'Researcher',model:'test-model',provider:'test-provider'}]]);
    const runsMeta=new Map([['run-1',{agentId:'worker-1',title:'Research live market',startedAt:'2026-10-07T00:00:00.000Z'}]]);
    const company=makeCompany();
    const runtime={async inspectWorkforce({activeRuns=[]}){assert.equal(activeRuns.length,1);return {source:'live-runtime-contract-test',workerCount:1,counts:{total:1,working:1,idle:0},workers:[{id:'worker-1',name:'Researcher',model:'test-model',provider:'test-provider',status:'working',activeRun:activeRuns[0]}]};}};
    const handler=makeStarForgeGovernanceHandler({workspace,roster,runsMeta,runtime,company});
    const res=responseCapture();
    await handler({method:'GET',url:'/api/starforge/governance'},res);
    assert.equal(res.status,200);
    const payload=JSON.parse(res.body);
    assert.equal(payload.connection.runtimeMode,'live-starnet');
    assert.equal(payload.connection.workforceSource,'live-runtime-contract-test');
    assert.equal(payload.workforce.workers[0].status,'working');
    assert.equal(payload.workforce.workers[0].activeRun.id,'run-1');
  } finally { await rm(workspace,{recursive:true,force:true}); }
});

test('StarForge mobile feed remains read-only',async()=>{
  const company=makeCompany();
  const handler=makeStarForgeGovernanceHandler({workspace:'/tmp/starforge-test',company});
  const res=responseCapture();
  await handler({method:'POST',url:'/api/starforge/governance'},res);
  assert.equal(res.status,405);
  assert.match(res.body,/read-only/);
  assert.equal(company.snapshot().tasks.length,0);
});