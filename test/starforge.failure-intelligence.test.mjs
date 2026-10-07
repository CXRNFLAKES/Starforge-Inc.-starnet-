import test from "node:test";
import assert from "node:assert/strict";
import { makeFailureIntelligence } from "../sidecar/governance/failure-intelligence.mjs";

test("failure intelligence classifies worker failures for replacement", () => {
 const result=makeFailureIntelligence().analyze({execution:{tasks:[{id:"w1",success:false,workerFailure:true,reason:"worker timeout"}]}});
 assert.equal(result.type,"worker"); assert.equal(result.recovery.action,"replace-worker"); assert.equal(result.recovery.createMissingWorkers,true);
});
test("failure intelligence classifies compute failures", () => {
 const result=makeFailureIntelligence().analyze({execution:{tasks:[{success:false,reason:"provider rate limit"}]}});
 assert.equal(result.type,"compute"); assert.equal(result.recovery.action,"change-compute-route");
});
test("failure intelligence treats external blockers as non-retryable", () => {
 const result=makeFailureIntelligence().analyze({execution:{tasks:[{success:false,externalBlock:true,reason:"marketplace access denied"}]}});
 assert.equal(result.type,"external"); assert.equal(result.recovery.retry,false); assert.equal(result.escalationRequired,true);
});
test("failure intelligence classifies missing evidence", () => {
 const result=makeFailureIntelligence().analyze({execution:{tasks:[{success:false,evidenceMissing:true,reason:"verification proof missing"}]}});
 assert.equal(result.type,"evidence"); assert.equal(result.recovery.action,"collect-verification-evidence");
});
test("failure intelligence defaults safely to strategy recovery", () => {
 const result=makeFailureIntelligence({maxRecoveries:2}).analyze({execution:{tasks:[{success:false,reason:"approach did not work"}]}});
 assert.equal(result.type,"strategy"); assert.equal(result.recovery.action,"change-strategy"); assert.equal(result.maxRecoveries,2);
});
