import test from "node:test";
import assert from "node:assert/strict";
import { makeOutcomeEvaluator } from "../sidecar/governance/outcome-evaluator.mjs";
const mission = { id: "m1", objective: "make 2000 by next month" };
test("outcome evaluator requires measurable revenue evidence", () => {
 const result = makeOutcomeEvaluator().evaluate({mission,execution:{status:"executed",tasks:[{success:true,result:"sales activity completed"}]}});
 assert.equal(result.status,"replan"); assert.match(result.reason,/Revenue target/); assert.equal(result.evidence.targetRevenue,2000);
});
test("outcome evaluator verifies a measurable revenue target", () => {
 const result = makeOutcomeEvaluator().evaluate({mission,execution:{status:"executed",revenue:2100,tasks:[{success:true,result:"verified resale sales"}]}});
 assert.equal(result.status,"complete"); assert.equal(result.verified,true); assert.equal(result.evidence.revenueVerified,true);
});
test("outcome evaluator replans on partial execution", () => {
 const result = makeOutcomeEvaluator().evaluate({mission:{id:"m2",objective:"research resale products"},execution:{status:"executed",tasks:[{success:true,result:"demand evidence"},{success:false,result:"marketplace failed"}]}});
 assert.equal(result.status,"replan"); assert.match(result.reason,/unresolved task failures/);
});
test("outcome evaluator blocks blocked execution", () => {
 const result = makeOutcomeEvaluator().evaluate({mission:{id:"m3",objective:"research products"},execution:{status:"blocked",reason:"StarNet unavailable"}});
 assert.equal(result.status,"blocked"); assert.equal(result.verified,false);
});
test("outcome evaluator rejects empty evidence", () => {
 const result = makeOutcomeEvaluator().evaluate({mission:{id:"m4",objective:"research products"},execution:{status:"executed",tasks:[]}});
 assert.equal(result.status,"replan"); assert.match(result.reason,/no executable task evidence/);
});
