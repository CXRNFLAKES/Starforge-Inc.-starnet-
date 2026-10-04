import test from "node:test";
import assert from "node:assert/strict";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

test("D8: governance evidence is persisted and visible as read-only company telemetry", () => {
  const company = makeCompany();

  const packet = company.recordDecisionPacket(ROLES.PA, {
    request: {
      id: "d8-expense-001",
      amount: 1200,
      currency: "EUR",
      purpose: "D8 observability test",
    },
    independentRisk: {
      rating: "low",
      confidence: 1,
      reasons: ["bounded exposure"],
    },
    paAssessment: {
      label: "VERIFIED FACT",
      confidence: 1,
      findings: ["PA reviewed the evidence"],
    },
    paRecommendation: "approve",
  });

  company.recordDecision(ROLES.CHO, {
    requestId: packet.request.id,
    packetId: packet.id,
    decision: "approve",
    rationale: "Human decision recorded against the evidence packet.",
  });

  const snapshot = company.snapshot();
  assert.equal(snapshot.decisionPackets.length, 1);
  assert.equal(snapshot.decisionPackets[0].id, packet.id);
  assert.equal(snapshot.decisions.length, 1);
  assert.equal(snapshot.decisions[0].packetId, packet.id);

  const events = snapshot.audit.map((item) => item.event);
  assert.ok(events.includes("governance.decision-packet.recorded"));
  assert.ok(events.includes("governance.decision.recorded"));
});

test("D8: telemetry consumers cannot mutate persisted governance evidence", () => {
  const company = makeCompany();

  const packet = company.recordDecisionPacket(ROLES.PA, {
    request: {
      id: "d8-expense-002",
      amount: 900,
      currency: "EUR",
      purpose: "immutable telemetry evidence",
    },
    historicalEvidence: ["original"],
  });

  const consumerView = company.snapshot();
  consumerView.decisionPackets[0].request.purpose = "tampered";
  consumerView.decisionPackets[0].historicalEvidence.push("forged");
  consumerView.audit.push({
    actorRole: ROLES.CHO,
    event: "forged.audit.event",
    details: {},
  });

  const persisted = company.snapshot();
  assert.equal(persisted.decisionPackets[0].request.purpose, "immutable telemetry evidence");
  assert.deepEqual(persisted.decisionPackets[0].historicalEvidence, ["original"]);
  assert.doesNotMatch(
    JSON.stringify(persisted.audit),
    /forged\.audit\.event/,
  );

  assert.equal(persisted.decisionPackets[0].id, packet.id);
});

test("D8: governance telemetry does not grant write authority", () => {
  const company = makeCompany();

  assert.throws(
    () => company.recordDecisionPacket(ROLES.CEO, {
      request: { id: "d8-unauthorized", amount: 1, currency: "EUR", purpose: "bypass" },
    }),
    /Unauthorized action/,
  );

  assert.throws(
    () => company.recordDecisionPacket(ROLES.ACCOUNTANT, {
      request: { id: "d8-unauthorized-2", amount: 1, currency: "EUR", purpose: "bypass" },
    }),
    /Unauthorized action/,
  );

  assert.throws(
    () => company.recordDecision(ROLES.PA, {
      requestId: "d8-unauthorized",
      packetId: "missing",
      decision: "approve",
      rationale: "bypass",
    }),
    /Unauthorized action/,
  );
});
