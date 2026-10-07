import test from "node:test";
import assert from "node:assert/strict";
import { makeComputeEconomy } from "../sidecar/governance/compute-economy.mjs";

test("Compute Economy selects the cheapest capable model through the governed router", async () => {
  const calls=[];
  const economy=makeComputeEconomy({router:{resolve:async r=>{calls.push(r);return {allowed:true,...r,free:r.model.startsWith("free/"),source:"starforge-governed-model-router"};}}});
  economy.setBudget("mission","m1",1);
  economy.setBudget("worker","w1",0.75);
  economy.setBudget("task","t1",0.5);
  const reservation=await economy.requestCompute({missionId:"m1",workerId:"w1",taskId:"t1",complexity:"normal",candidates:[
    {provider:"paid",model:"expensive",estimatedCost:0.4,capability:2},
    {provider:"apinex",model:"free/gpt-5.6-luna",estimatedCost:0,capability:2},
  ]});
  assert.equal(reservation.provider,"apinex");
  assert.equal(reservation.model,"free/gpt-5.6-luna");
  assert.equal(reservation.reservedCost,0);
  assert.equal(calls.length,1);
  economy.settleCompute(reservation.reservationId,{actualCost:0,usage:{requests:1,tokens:120}});
  assert.equal(economy.snapshot().ledger[0].status,"settled");
  assert.equal(economy.snapshot().ledger[0].usage.tokens,120);
});

test("Compute Economy enforces mission, worker, and task hard ceilings", async () => {
  const economy=makeComputeEconomy();
  economy.setBudget("mission","m1",0.10);
  economy.setBudget("worker","w1",0.10);
  economy.setBudget("task","t1",0.10);
  const first=await economy.requestCompute({missionId:"m1",workerId:"w1",taskId:"t1",provider:"openai",model:"paid-model",estimatedCost:0.10});
  economy.settleCompute(first.reservationId,{actualCost:0.10});
  await assert.rejects(()=>economy.requestCompute({missionId:"m1",workerId:"w1",taskId:"t2",provider:"openai",model:"paid-model",estimatedCost:0.01}),/compute budget exceeded for mission/);
});

test("Compute Economy fails closed when every provider/model is rejected", async () => {
  const economy=makeComputeEconomy({router:{resolve:async()=>{throw new Error("provider unavailable");}}});
  await assert.rejects(()=>economy.requestCompute({missionId:"m1",workerId:"w1",taskId:"t1",candidates:[{provider:"apinex",model:"free/a",estimatedCost:0,capability:2},{provider:"openrouter",model:"free/b",estimatedCost:0,capability:2}]}),/compute economy failed closed/);
});

test("Compute Economy refuses a final settlement above the reserved ceiling", async () => {
  const economy=makeComputeEconomy();
  const r=await economy.requestCompute({taskId:"t1",provider:"apinex",model:"free/a",estimatedCost:0.05});
  assert.throws(()=>economy.settleCompute(r.reservationId,{actualCost:0.06}),/settlement exceeds the reserved hard ceiling/);
});
