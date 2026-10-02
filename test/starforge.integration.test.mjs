import test from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, can } from "../sidecar/governance/authority.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { makeIntegrationLab, runIntegrationScenario } from "../sidecar/governance/integration-lab.mjs";

test("integration lab runs the governed expense path without side effects", () => {
  const snapshot = runIntegrationScenario();
  assert.equal(snapshot.lab.mode, "testing");
  assert.equal(snapshot.lab.sideEffects, "none");
  assert.equal(snapshot.lab.requests[0].status, "simulated-executed");
  assert.equal(snapshot.lab.riskAssessments.length, 2);
  assert.equal(snapshot.lab.approvals[0].decision, "approve");
  assert.equal(snapshot.lab.recoveries.length, 1);
  assert.equal(snapshot.lab.decisionPackets.length, 1);
  assert.equal(snapshot.company.decisionPackets.length, 1);
  assert.equal(snapshot.company.decisionPackets[0].independentRisk.rating, "low");
  assert.equal(snapshot.company.decisionPackets[0].paAssessment.label, "SUPPORTED ESTIMATE");
  assert.equal(snapshot.company.decisions[0].packetId, snapshot.company.decisionPackets[0].id);
});

test("integration lab preserves CHO-only execution authority", () => {
  assert.equal(can(ROLES.CEO, ACTIONS.APPROVAL_EXECUTE), false);
  assert.equal(can(ROLES.PA, ACTIONS.APPROVAL_EXECUTE), false);
  assert.equal(can(ROLES.BOARD, ACTIONS.APPROVAL_EXECUTE), false);
  assert.equal(can(ROLES.CHO, ACTIONS.APPROVAL_EXECUTE), true);
});

test("integration lab rejects execution before approval", () => {
  const lab = makeIntegrationLab();
  const request = lab.requestExpense(ROLES.CEO, {
    id: "expense-denied-001",
    amount: 500,
    currency: "EUR",
    purpose: "TEST: must not execute",
  });
  assert.throws(
    () => lab.executeApproved(ROLES.CHO, request.id),
    /Only approved requests may execute/,
  );
});

test("integration lab requires a decision packet before CHO approval", () => {
  const lab = makeIntegrationLab();
  const request = lab.requestExpense(ROLES.CEO, {
    id: "expense-packet-required-001",
    amount: 100,
    currency: "EUR",
    purpose: "TEST: packet gate",
  });
  assert.throws(
    () => lab.choDecision(ROLES.CHO, request.id, { decision: "approve" }),
    /requires a recorded decision packet/,
  );
});

test("integration lab blocks CEO from making CHO decisions", () => {
  const lab = makeIntegrationLab();
  const request = lab.requestExpense(ROLES.CEO, {
    id: "expense-auth-001",
    amount: 100,
    currency: "EUR",
    purpose: "TEST: authority check",
  });
  assert.throws(
    () => lab.choDecision(ROLES.CEO, request.id, { decision: "approve" }),
    /Unauthorized action/,
  );
});

test("integration lab produces an auditable event trail", () => {
  const snapshot = runIntegrationScenario();
  const events = snapshot.lab.events.map((event) => event.event);
  assert.ok(events.includes("governance.request.created"));
  assert.ok(events.includes("risk.assessment.completed"));
  assert.ok(events.includes("pa.review.completed"));
  assert.ok(events.includes("governance.decision-packet.recorded"));
  assert.ok(events.includes("board.meeting.started"));
  assert.ok(events.includes("board.decision"));
  assert.ok(events.includes("approval.cho-decision"));
  assert.ok(events.includes("expense.execution.simulated"));
  assert.ok(events.includes("recovery.mission.assigned"));
});
