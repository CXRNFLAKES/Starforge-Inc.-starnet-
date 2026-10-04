import test from "node:test";
import assert from "node:assert/strict";
import { makeIntegrationLab, BOARD_ROUTINE_MAX_AMOUNT } from "../sidecar/governance/integration-lab.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function prepareExpense({ amount = 250, initialRisk = "low", legalOrComplianceConcern = false } = {}) {
  const lab = makeIntegrationLab();
  const expense = lab.requestExpense(ROLES.CEO, {
    id: `d6-expense-${amount}-${initialRisk}`,
    amount,
    currency: "EUR",
    purpose: "TEST: governed company expense",
    initialRisk,
    legalOrComplianceConcern,
  });
  lab.assessRisk(ROLES.RISK, expense.id, {
    availableCash: 10000,
    taxReserve: 1000,
  });
  lab.paReview(ROLES.PA, expense.id, {
    claim: "TEST: expense has been independently reviewed",
    evidence: [{ source: "d6-test", supports: true }],
    recommendation: "board-routine-if-eligible",
  });
  return { lab, expense };
}

test("D6 allows the Board to approve only a low-risk routine expense after PA review", () => {
  const { lab, expense } = prepareExpense({ amount: 250 });
  const board = lab.boardDecision(ROLES.BOARD, expense.id, {
    decision: "approve-routine",
    rationale: "TEST: low-risk bounded expense",
  });

  assert.equal(board.riskRating, "low");
  assert.equal(board.routineEligible, true);
  assert.equal(lab.snapshot().lab.requests[0].status, "approved");
});

test("D6 routes medium/high exposure to CHO instead of allowing routine Board approval", () => {
  const { lab, expense } = prepareExpense({
    amount: BOARD_ROUTINE_MAX_AMOUNT,
    initialRisk: "high",
    legalOrComplianceConcern: true,
  });

  assert.throws(
    () => lab.boardDecision(ROLES.BOARD, expense.id, { decision: "approve-routine" }),
    /requires CHO decision/,
  );
  assert.equal(lab.snapshot().lab.requests[0].status, "cho-decision");

  const decision = lab.choDecision(ROLES.CHO, expense.id, {
    decision: "approve",
    rationale: "TEST: CHO explicitly approves after escalation",
  });
  assert.equal(decision.decision, "approve");

  const executed = lab.executeApproved(ROLES.CHO, expense.id);
  assert.equal(executed.status, "simulated-executed");
});

test("D6 requires PA review before the Board can approve a routine expense", () => {
  const lab = makeIntegrationLab();
  const expense = lab.requestExpense(ROLES.CEO, {
    id: "d6-no-pa-review",
    amount: 250,
    currency: "EUR",
    purpose: "TEST: routine expense without PA review",
  });
  lab.assessRisk(ROLES.RISK, expense.id, { availableCash: 10000, taxReserve: 1000 });

  assert.throws(
    () => lab.boardDecision(ROLES.BOARD, expense.id, { decision: "approve-routine" }),
    /requires PA review/,
  );
  assert.equal(lab.snapshot().lab.requests[0].status, "pa-review");
});

test("D6 keeps approval execution CHO-reserved and fail-closed", () => {
  const { lab, expense } = prepareExpense({ amount: 250 });
  lab.boardDecision(ROLES.BOARD, expense.id, { decision: "approve-routine" });

  assert.throws(
    () => lab.executeApproved(ROLES.CEO, expense.id),
    /Unauthorized action/,
  );
  assert.throws(
    () => lab.executeApproved(ROLES.PA, expense.id),
    /Unauthorized action/,
  );
  assert.throws(
    () => lab.executeApproved(ROLES.ACCOUNTANT, expense.id),
    /Unauthorized action/,
  );
});
