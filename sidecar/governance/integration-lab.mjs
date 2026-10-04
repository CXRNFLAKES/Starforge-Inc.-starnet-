import { ACTIONS, assertCan } from "./authority.mjs";
import { ROLES } from "./roles.mjs";
import { makeTestingCompany } from "./testing.mjs";
import { makeRiskEngine } from "./risk-engine.mjs";
import { makeFactChecker } from "./fact-checker.mjs";
import { makeDecisionPacket } from "./decision-packet.mjs";

export const INTEGRATION_MODE = "testing";
export const SIDE_EFFECTS = "none";
export const BOARD_ROUTINE_MAX_AMOUNT = 5000;

function clone(value) {
  return structuredClone(value);
}

export function makeIntegrationLab(overrides = {}) {
  const company = makeTestingCompany({
    mission: overrides.mission ?? "TEST: Operate StarForge as a governed AI company",
    objective: overrides.objective ?? "TEST: validate PA, Board, CEO, Risk, CHO, approval, and recovery flows",
  });

  const riskEngine = makeRiskEngine();
  const factChecker = makeFactChecker();

  const state = {
    mode: INTEGRATION_MODE,
    sideEffects: SIDE_EFFECTS,
    requests: [],
    riskAssessments: [],
    meetings: [],
    approvals: [],
    recoveries: [],
    decisionPackets: [],
    events: [],
  };

  const emit = (actorRole, event, details = {}) => {
    company.audit(actorRole, event, details);
    state.events.push({ actorRole, event, details: clone(details) });
  };

  return {
    snapshot() {
      return {
        company: company.snapshot(),
        lab: clone(state),
      };
    },

    requestExpense(actorRole, request) {
      assertCan(actorRole, ACTIONS.CEO_REQUEST_APPROVAL);
      if (!request?.id || !request?.amount || !request?.currency || !request?.purpose) {
        throw new Error("Expense request requires id, amount, currency, and purpose");
      }
      const entry = {
        ...request,
        requestedBy: actorRole,
        status: "pending-risk",
      };
      state.requests.push(entry);
      emit(actorRole, "governance.request.created", { requestId: entry.id, amount: entry.amount });
      return clone(entry);
    },

    assessRisk(actorRole, requestId, assessment = {}) {
      assertCan(actorRole, ACTIONS.RISK_ASSESS);
      const request = state.requests.find((item) => item.id === requestId);
      if (!request) throw new Error(`Unknown request: ${requestId}`);
      const calculated = riskEngine.assess(request, {
      availableCash: assessment.availableCash ?? 5000,
      taxReserve: assessment.taxReserve ?? 1000,
    });
    const entry = {
      requestId,
      assessorRole: actorRole,
      rating: calculated.rating,
      confidence: calculated.confidence,
      reasons: [...calculated.reasons],
      inputs: calculated.inputs,
    };
      state.riskAssessments.push(entry);
      request.status = "pa-review";
      emit(actorRole, "risk.assessment.completed", entry);
      return clone(entry);
    },

    paReview(actorRole, requestId, review = {}) {
      assertCan(actorRole, ACTIONS.PA_REVIEW);
      const request = state.requests.find((item) => item.id === requestId);
      if (!request) throw new Error(`Unknown request: ${requestId}`);
      const checked = factChecker.check(
      review.claim ?? request.purpose,
      { evidence: Array.isArray(review.evidence) ? review.evidence : [] },
    );
    const entry = {
      requestId,
      reviewerRole: actorRole,
      label: checked.label,
      confidence: checked.confidence,
      findings: [...checked.findings, ...(Array.isArray(review.findings) ? review.findings : [])],
      recommendation: review.recommendation ?? "request-more-information",
      evidenceCount: checked.evidenceCount,
    };
      request.status = review.escalateToCho ? "cho-decision" : "board-review";
      state.riskAssessments.push({ type: "pa-review", ...entry });
      const risk = state.riskAssessments.find((item) => item.requestId === requestId && item.type !== "pa-review");
      const packet = makeDecisionPacket({
        request,
        risk,
        evidence: checked,
        financialExposure: { amount: request.amount, currency: request.currency },
        evidenceProblems: checked.label === "UNVERIFIED CLAIM" ? checked.findings : [],
        paRecommendation: entry.recommendation,
      });
      const recordedPacket = company.recordDecisionPacket(actorRole, packet);
      state.decisionPackets.push(recordedPacket);
      emit(actorRole, "governance.decision-packet.recorded", { requestId, informationStatus: packet.informationStatus });
      emit(actorRole, "pa.review.completed", entry);
      return clone(entry);
    },

    conveneBoard(actorRole, requestId) {
      assertCan(actorRole, ACTIONS.BOARD_CONVENE);
      const meeting = {
        id: `meeting-${state.meetings.length + 1}`,
        requestId,
        chair: actorRole,
        status: "open",
      };
      state.meetings.push(meeting);
      emit(actorRole, "board.meeting.started", { meetingId: meeting.id, requestId });
      return clone(meeting);
    },

    boardDecision(actorRole, requestId, decision = {}) {
      assertCan(actorRole, ACTIONS.BOARD_DECIDE);
      const request = state.requests.find((item) => item.id === requestId);
      if (!request) throw new Error(`Unknown request: ${requestId}`);
      const risk = state.riskAssessments.find((item) => item.requestId === requestId && !item.type);
      const paReview = state.riskAssessments.find((item) => item.requestId === requestId && item.type === "pa-review");
      if (!risk) throw new Error("Board decision requires an independent risk assessment");
      if (!paReview) throw new Error("Board decision requires PA review");
      const amount = Number(request.amount);
      const routineEligible = risk.rating === "low" && Number.isFinite(amount) && amount < BOARD_ROUTINE_MAX_AMOUNT;
      const requestedDecision = decision.decision ?? "escalate";
      if (requestedDecision === "approve-routine" && !routineEligible) {
        request.status = "cho-decision";
        throw new Error("Non-routine or high-exposure expense requires CHO decision");
      }
      const entry = {
        requestId,
        actorRole,
        decision: requestedDecision,
        rationale: decision.rationale ?? "",
        riskRating: risk.rating,
        routineEligible,
      };
      request.status = entry.decision === "approve-routine" ? "approved" : "cho-decision";
      emit(actorRole, "board.decision", entry);
      return clone(entry);
    },

    choDecision(actorRole, requestId, decision = {}) {
      assertCan(actorRole, ACTIONS.CHO_DECIDE);
      const request = state.requests.find((item) => item.id === requestId);
      if (!request) throw new Error(`Unknown request: ${requestId}`);
      const allowed = new Set(["approve", "deny", "request-changes", "discuss"]);
      if (!allowed.has(decision.decision)) throw new Error("Invalid CHO decision");
      const packet = state.decisionPackets.find((item) => item.request?.id === requestId);
      if (!packet) throw new Error("CHO decision requires a recorded decision packet");
      if (state.approvals.some((item) => item.requestId === requestId)) {
        throw new Error("CHO decision already recorded for this request");
      }
      if (request.status !== "cho-decision") {
        throw new Error("CHO decision requires a request awaiting CHO decision");
      }
      request.status = decision.decision === "approve" ? "approved" :
        decision.decision === "deny" ? "denied" : "needs-changes";
      const entry = {
        requestId,
        packetId: packet.id,
        actorRole,
        decision: decision.decision,
        rationale: decision.rationale ?? "",
      };
      state.approvals.push(entry);
      company.recordDecision(actorRole, entry);
      emit(actorRole, "approval.cho-decision", entry);
      return clone(entry);
    },

    executeApproved(actorRole, requestId) {
      assertCan(actorRole, ACTIONS.APPROVAL_EXECUTE);
      const request = state.requests.find((item) => item.id === requestId);
      if (!request) throw new Error(`Unknown request: ${requestId}`);
      if (request.status !== "approved") throw new Error("Only approved requests may execute");
      const approval = state.approvals.find(
        (item) => item.requestId === requestId && item.decision === "approve",
      );
      if (!approval) throw new Error("Execution requires a recorded CHO approval");
      const decision = company.snapshot().decisions.find(
        (item) =>
          item.requestId === requestId &&
          item.packetId === approval.packetId &&
          item.decision === "approve",
      );
      if (!decision) throw new Error("Execution requires a valid recorded CHO decision");
      request.status = "simulated-executed";
      emit(actorRole, "expense.execution.simulated", { requestId });
      return clone(request);
    },

    recover(actorRole, recovery) {
      assertCan(actorRole, ACTIONS.CEO_OPERATE);
      const entry = {
        agentId: recovery.agentId,
        reason: recovery.reason ?? "failed task",
        mission: recovery.mission ?? "repair and verify failed work",
        status: "assigned",
      };
      state.recoveries.push(entry);
      emit(actorRole, "recovery.mission.assigned", entry);
      return clone(entry);
    },

    assertSafe() {
      const snapshot = this.snapshot();
      if (snapshot.lab.mode !== INTEGRATION_MODE || snapshot.lab.sideEffects !== SIDE_EFFECTS) {
        throw new Error("Integration lab is not in safe testing mode");
      }
      return true;
    },
  };
}

export function runIntegrationScenario() {
  const lab = makeIntegrationLab();
  const expense = lab.requestExpense(ROLES.CEO, {
    id: "expense-demo-001",
    amount: 250,
    currency: "EUR",
    purpose: "TEST: prototype research budget",
  });

  lab.assessRisk(ROLES.RISK, expense.id, {
    availableCash: 5000,
    taxReserve: 1000,
  });

  lab.paReview(ROLES.PA, expense.id, {
    claim: "TEST: prototype research budget has a bounded expected return",
    evidence: [{ source: "test-forecast", supports: true, estimate: true }],
    findings: ["No provider or payment system is connected in this test"],
    recommendation: "escalate-to-board",
  });

  lab.conveneBoard(ROLES.BOARD, expense.id);
  lab.boardDecision(ROLES.BOARD, expense.id, {
    decision: "escalate",
    rationale: "Simulation requires CHO decision for non-routine risk",
  });
  lab.choDecision(ROLES.CHO, expense.id, {
    decision: "approve",
    rationale: "TEST: explicitly approved by human authority",
  });
  lab.executeApproved(ROLES.CHO, expense.id);
  lab.recover(ROLES.CEO, {
    agentId: "worker-demo-001",
    reason: "simulated failed research task",
  });

  lab.assertSafe();
  return lab.snapshot();
}
