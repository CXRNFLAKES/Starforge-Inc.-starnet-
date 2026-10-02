import test from "node:test";
import assert from "node:assert/strict";
import { makeRiskEngine } from "../sidecar/governance/risk-engine.mjs";

test("risk engine rates a bounded reversible request without inventing certainty", () => {
  const result = makeRiskEngine().assess(
    {
      amount: 250,
      currency: "EUR",
      purpose: "TEST: prototype research",
      expectedReturn: 500,
      reversible: true,
      initialRisk: "low",
    },
    { availableCash: 5000, taxReserve: 1000 },
  );

  assert.equal(result.rating, "low");
  assert.equal(result.inputs.amount, 250);
  assert.equal(result.inputs.expectedReturn, 500);
  assert.equal(result.score, 0);
  assert.ok(result.confidence > 0.9);
});

test("risk engine escalates cash and compliance exposure", () => {
  const result = makeRiskEngine().assess(
    {
      amount: 4000,
      currency: "EUR",
      purpose: "TEST: committed purchase",
      longTermCommitment: true,
      legalOrComplianceConcern: true,
      reversible: false,
      initialRisk: "high",
    },
    { availableCash: 5000, taxReserve: 2000 },
  );

  assert.equal(result.rating, "critical");
  assert.ok(result.reasons.some((reason) => reason.includes("tax reserve")));
  assert.ok(result.reasons.some((reason) => reason.includes("compliance")));
});

test("risk engine refuses to treat missing purpose or amount as low risk", () => {
  const result = makeRiskEngine().assess({ currency: "EUR" });
  assert.equal(result.rating, "insufficient-information");
  assert.ok(result.reasons.length >= 2);
});

test("risk engine is deterministic and side-effect free", () => {
  const engine = makeRiskEngine();
  const request = { amount: 100, currency: "EUR", purpose: "TEST" };
  const context = { availableCash: 1000, taxReserve: 100 };
  assert.deepEqual(engine.assess(request, context), engine.assess(request, context));
});
