import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeStarForgeGovernanceHandler } from "../sidecar/governance/http.mjs";

async function request(handler, method="GET") {
  const chunks=[];
  const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};
  await handler({method,url:"/api/starforge/governance"},res);
  return {status:res.status,body:JSON.parse(res.body)};
}

test("mobile governance feed derives capital from the governed company ledger",async()=>{
  const workspace=await mkdtemp(join(tmpdir(),"starforge-http-"));
  await writeFile(join(workspace,"state.json"),JSON.stringify({
    finance:{currency:"EUR",openingCapital:1000,entries:[
      {kind:"revenue",amount:500,currency:"EUR"},
      {kind:"tax-reserve",amount:100,currency:"EUR"},
      {kind:"expense",amount:200,currency:"EUR"},
      {kind:"liability",amount:300,currency:"EUR"},
      {kind:"liability-payment",amount:50,currency:"EUR"}
    ]}
  }));
  const handler=makeStarForgeGovernanceHandler({workspace});
  const result=await request(handler);
  assert.equal(result.status,200);
  assert.equal(result.body.capital.cash,1150);
  assert.equal(result.body.capital.taxReserve,100);
  assert.equal(result.body.capital.liabilities,250);
  assert.equal(result.body.capital.netOperatingCapital,900);
  assert.equal(result.body.capital.source,"starforge-governed-company-ledger");
});

test("mobile governance bridge remains read-only",async()=>{
  const workspace=await mkdtemp(join(tmpdir(),"starforge-http-"));
  const handler=makeStarForgeGovernanceHandler({workspace});
  const result=await request(handler,"POST");
  assert.equal(result.status,405);
});
