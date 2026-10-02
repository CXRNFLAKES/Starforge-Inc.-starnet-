import test from "node:test";
import assert from "node:assert/strict";
import { DECISIONS, isValidDecision, makeDecisionPacket } from "../sidecar/governance/decision-packet.mjs";

test("decision packet preserves the independent risk and PA evidence labels", () => {
  const packet = makeDecisionPacket({
    request: { id: "expense-001", amount: 250, currency: "EUR", purpose: "TEST research", requestedBy: "ceo" },
    risk: { rating: "medium", confidence: 0.9, reasons: ["limited exposure"] },
    evidence: { label: "SUPPORTED ESTIMATE", confidence: 0.65, findings: ["forecast only"] },
    paRecommendation: "escalate-to-board",
  });
  assert.equal(packet.independentRisk.rating, "medium");
  assert.equal(packet.paAssessment.label, "SUPPORTED ESTIMATE");
  assert.equal(packet.request.amount, 250);
});

test("decision packet represents insufficient information explicitly", () => {
  const packet = makeDecisionPacket({
    request: { id: "expense-002", purpose: "TEST incomplete request" },
    informationStatus: "insufficient",
  });
  assert.equal(packet.informationStatus, "insufficient");
  assert.equal(packet.independentRisk.rating, "insufficient-information");
  assert.equal(packet.paAssessment.label, "UNVERIFIED CLAIM");
});

test("decision packet does not silently invent evidence", () => {
  const packet = makeDecisionPacket({ request: { id: "expense-003" } });
  assert.deepEqual(packet.historicalEvidence, []);
  assert.deepEqual(packet.counterEvidence, []);
  assert.equal(packet.financialExposure, null);
});

test("decision vocabulary is explicit", () => {
  for (const decision of DECISIONS) assert.equal(isValidDecision(decision), true);
  assert.equal(isValidDecision("execute"), false);
});
