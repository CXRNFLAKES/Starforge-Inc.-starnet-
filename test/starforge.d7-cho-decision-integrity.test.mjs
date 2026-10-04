import test from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { ACTIONS, assertCan } from "../sidecar/governance/authority.mjs";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeIntegrationLab } from "../sidecar/governance/integration-lab.mjs";

test("D7: CHO decision is bound to the exact recorded decision packet", () => {
  const company = makeCompany();
  const lab = makeIntegrationLab();
  const expense = lab.requestExpense(ROLES.CEO, {
    id: "d7-expense-001",
    amount: 1000,
    currency: "EUR",
    purpose: "D7 governed purchase",
  });

  lab.assessRisk(ROLES.RISK, expense.id, { availableCash: 10000, taxReserve: 1000 });
  lab.paReview(ROLES.PA, expense.id, {
    claim: "D7 purchase has bounded exposure",
    evidence: [{ source: "d7-evidence", supports: true }],
    recommendation: "escalate-to-cho",
    escalateToCho: true,
  });

  const packet = company.snapshot().decisionPackets;
  assert.equal(packet.length, 0);

  const companyPacket = company.recordDecisionPacket(ROLES.PA, {
    request: { id: expense.id, amount: 1000, currency: "EUR", purpose: expense.purpose },
    independentRisk: { rating: "low", confidence: 1, reasons: [] },
    paAssessment: { label: "SUPPORTED CLAIM", confidence: 1, findings: [] },
    paRecommendation: "approve",
  });

  const decision = company.recordDecision(ROLES.CHO, {
    requestId: expense.id,
    packetId: companyPacket.id,
    decision: "approve",
    rationale: "CHO approved after reviewing the recorded evidence.",
  });

  assert.equal(decision.packetId, companyPacket.id);
  assert.equal(company.snapshot().decisions.length, 1);
});

test("D7: non-CHO roles cannot create or mutate final decisions", () => {
  const company = makeCompany();

  assert.throws(
    () => company.recordDecision(ROLES.CEO, {
      requestId: "d7-unauthorized",
      packetId: "missing",
      decision: "approve",
      rationale: "attempted bypass",
    }),
    /Unauthorized action/,
  );

  assert.throws(
    () => company.recordDecision(ROLES.PA, {
      requestId: "d7-unauthorized",
      packetId: "missing",
      decision: "approve",
      rationale: "attempted bypass",
    }),
    /Unauthorized action/,
  );

  assertCan(ROLES.CHO, ACTIONS.CHO_DECIDE);
});

test("D7: final decisions fail closed for invalid vocabulary, missing evidence, and duplicate decisions", () => {
  const company = makeCompany();

  const packet = company.recordDecisionPacket(ROLES.PA, {
    request: { id: "d7-expense-002", amount: 250, currency: "EUR", purpose: "D7 test" },
  });

  assert.throws(
    () => company.recordDecision(ROLES.CHO, {
      requestId: "d7-expense-002",
      packetId: packet.id,
      decision: "execute",
      rationale: "invalid decision",
    }),
    /Invalid CHO decision/,
  );

  assert.throws(
    () => company.recordDecision(ROLES.CHO, {
      requestId: "d7-expense-002",
      packetId: "wrong-packet",
      decision: "approve",
      rationale: "wrong evidence reference",
    }),
    /CHO decision packet reference does not match/,
  );

  const first = company.recordDecision(ROLES.CHO, {
    requestId: "d7-expense-002",
    packetId: packet.id,
    decision: "approve",
    rationale: "approved with recorded packet",
  });

  assert.equal(first.decision, "approve");

  assert.throws(
    () => company.recordDecision(ROLES.CHO, {
      requestId: "d7-expense-002",
      packetId: packet.id,
      decision: "deny",
      rationale: "duplicate final decision",
    }),
    /CHO decision already recorded/,
  );
});

test("D7: decision packet and final decision are defensively copied and audited", () => {
  const company = makeCompany();

  const packet = company.recordDecisionPacket(ROLES.PA, {
    request: { id: "d7-expense-003", amount: 500, currency: "EUR", purpose: "D7 immutable evidence" },
    historicalEvidence: ["recorded fact"],
  });

  const returnedPacket = company.snapshot().decisionPackets.find(item => item.id === packet.id);
  returnedPacket.request.purpose = "tampered";
  returnedPacket.historicalEvidence.push("forged");

  const storedPacket = company.snapshot().decisionPackets.find(item => item.id === packet.id);
  assert.equal(storedPacket.request.purpose, "D7 immutable evidence");
  assert.deepEqual(storedPacket.historicalEvidence, ["recorded fact"]);

  company.recordDecision(ROLES.CHO, {
    requestId: packet.request.id,
    packetId: packet.id,
    decision: "approve",
    rationale: "final human decision",
  });

  const audit = company.snapshot().audit;
  assert.equal(audit.filter(item => item.event === "governance.decision-packet.recorded").length, 1);
  assert.equal(audit.filter(item => item.event === "governance.decision.recorded").length, 1);
  assert.equal(audit.at(-1).actorRole, ROLES.CHO);
});
