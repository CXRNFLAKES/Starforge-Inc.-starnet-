/**
 * Builds a neutral CHO decision packet from independently produced evidence.
 * This module formats facts; it does not approve, deny, or rank political-like
 * choices and it has no external side effects.
 */

const DECISIONS = Object.freeze([
  "approve",
  "deny",
  "request-changes",
  "discuss",
  "ask-accountant",
  "request-analysis",
]);

export function makeDecisionPacket(input = {}) {
  const request = input.request ?? {};
  const risk = input.risk ?? {};
  const evidence = input.evidence ?? {};

  const packet = {
    request: {
      id: request.id ?? null,
      amount: request.amount ?? null,
      currency: request.currency ?? null,
      purpose: request.purpose ?? "",
    },
    requestedBy: request.requestedBy ?? null,
    initialRisk: request.initialRisk ?? null,
    independentRisk: {
      rating: risk.rating ?? "insufficient-information",
      confidence: Number.isFinite(Number(risk.confidence)) ? Number(risk.confidence) : 0,
      reasons: Array.isArray(risk.reasons) ? [...risk.reasons] : [],
    },
    paAssessment: {
      label: evidence.label ?? "UNVERIFIED CLAIM",
      confidence: Number.isFinite(Number(evidence.confidence)) ? Number(evidence.confidence) : 0,
      findings: Array.isArray(evidence.findings) ? [...evidence.findings] : [],
    },
    financialExposure: input.financialExposure ?? null,
    evidenceProblems: Array.isArray(input.evidenceProblems) ? [...input.evidenceProblems] : [],
    historicalEvidence: Array.isArray(input.historicalEvidence) ? [...input.historicalEvidence] : [],
    counterEvidence: Array.isArray(input.counterEvidence) ? [...input.counterEvidence] : [],
    worstRealisticOutcome: input.worstRealisticOutcome ?? null,
    paRecommendation: input.paRecommendation ?? "request-more-information",
    saferAlternative: input.saferAlternative ?? null,
    informationStatus: input.informationStatus ?? "available",
  };

  if (packet.informationStatus === "insufficient") {
    packet.informationStatus = "insufficient";
  }

  return Object.freeze(packet);
}

export function isValidDecision(decision) {
  return DECISIONS.includes(decision);
}

export { DECISIONS };
