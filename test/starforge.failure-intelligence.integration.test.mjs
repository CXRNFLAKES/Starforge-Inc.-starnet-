import test from "node:test";
import assert from "node:assert/strict";
import { makeMissionLoop } from "../sidecar/governance/mission-loop.mjs";
import { makeFailureIntelligence } from "../sidecar/governance/failure-intelligence.mjs";

function planner() {
  return {
    intake(input){ return { id:"m1", objective:input.objective, constraints:[], requiredCapabilities:["research"], risk:"low", complexity:"low" }; },
    plan(){ return { phases:[{title:"Research",requiredCapabilities:["research"]}] }; },
  };
}
test("mission loop replaces failed worker on worker recovery", async () => {
  let calls=0, seenRecovery=null, seenCreate=[];
  const executor={
    async execute(args){ calls++; seenRecovery=args.recovery; seenCreate.push(args.createMissing); return {status:"executed",tasks:[{id:"t1",success:false,workerFailure:true,reason:"worker timeout"}]}; },
    async verifyAndReplan(args){ seenRecovery=args.recovery; return {nextPlan:{phases:[{title:"Research",requiredCapabilities:["research"]}]}}; },
  };
  const evaluator={async evaluate(){return {status:"replan",verified:false,reason:"worker failed"};}};
  const result=await makeMissionLoop({planner:planner(),executor,evaluator,failureIntelligence:makeFailureIntelligence(),maxIterations:2})
    .run({objective:"research opportunity"});
  assert.equal(result.status,"replan-exhausted");
  assert.equal(calls,2);
  assert.equal(seenCreate[0],true);
  assert.equal(seenCreate[1],true);
  assert.equal(seenRecovery.type,"worker");
});
test("mission loop escalates external failures instead of retrying", async () => {
  let calls=0;
  const executor={
    async execute(){ calls++; return {status:"executed",tasks:[{success:false,externalBlock:true,reason:"marketplace access denied"}]}; },
    async verifyAndReplan(){ throw new Error("must not retry external blocker"); },
  };
  const evaluator={async evaluate(){return {status:"replan",verified:false,reason:"external blocker"};}};
  const result=await makeMissionLoop({planner:planner(),executor,evaluator,failureIntelligence:makeFailureIntelligence(),maxIterations:3})
    .run({objective:"research opportunity"});
  assert.equal(result.status,"blocked");
  assert.equal(calls,1);
  assert.equal(result.recovery.type,"external");
});
test("mission loop persists recovery lesson when memory is enabled", async () => {
  const records=[];
  const memory={recall(){return[]},record(entry){records.push(entry)}};
  const executor={
    async execute(){return {status:"executed",tasks:[{success:false,reason:"approach did not work"}]};},
    async verifyAndReplan(){return {nextPlan:{phases:[{title:"Research",requiredCapabilities:["research"]}]}};},
  };
  const evaluator={async evaluate(){return {status:"replan",verified:false,reason:"strategy failed"};}};
  await makeMissionLoop({planner:planner(),executor,evaluator,memory,failureIntelligence:makeFailureIntelligence(),maxIterations:1})
    .run({objective:"research opportunity"});
  assert.equal(records.length,1);
  assert.match(records[0].lesson,/Failure strategy/);
  assert.equal(records[0].recovery.type,"strategy");
});
