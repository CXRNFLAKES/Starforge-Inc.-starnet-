/**
 * Pure, deterministic risk assessment for StarForge governance.
 * No network, provider, payment, or ledger side effects.
 */

const RATINGS = Object.freeze(["low", "medium", "high", "critical", "insufficient-information"]);

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function makeRiskEngine() {
  return {
    assess(request = {}, context = {}) {
      const amount = numberOrNull(request.amount);
      const availableCash = numberOrNull(context.availableCash);
      const taxReserve = numberOrNull(context.taxReserve);
      const expectedReturn = numberOrNull(request.expectedReturn);

      const reasons = [];
      let score = 0;

      if (amount === null || amount <= 0) {
        reasons.push("Amount is missing or invalid");
        score += 3;
      }
      if (!request.purpose) {
        reasons.push("Purpose is missing");
        score += 2;
      }
      if (expectedReturn === null) {
        reasons.push("Expected return is not quantified");
        score += 1;
      }
      if (availableCash !== null && amount !== null && amount > availableCash) {
        reasons.push("Request exceeds available cash");
        score += 4;
      }
      if (taxReserve !== null && amount !== null && amount > Math.max(0, availableCash ?? amount) - taxReserve) {
        reasons.push("Request may encroach on the tax reserve");
        score += 3;
      }
      if (request.longTermCommitment === true) {
        reasons.push("Creates a long-term commitment");
        score += 2;
      }
      if (request.legalOrComplianceConcern === true) {
        reasons.push("Legal or compliance concern requires review");
        score += 4;
      }
      if (request.reversible === false) {
        reasons.push("Decision is not readily reversible");
        score += 2;
      }
      if (request.initialRisk === "high") score += 2;
      if (request.initialRisk === "critical") score += 4;

      let rating = "low";
      if (score >= 8) rating = "critical";
      else if (score >= 5) rating = "high";
      else if (score >= 2) rating = "medium";

      if (amount === null || !request.purpose) rating = "insufficient-information";

      const confidence = Math.max(0, Math.min(1, 1 - (reasons.length * 0.1)));

      return Object.freeze({
        rating,
        confidence,
        score,
        reasons: [...new Set(reasons)],
        inputs: {
          amount,
          currency: request.currency ?? null,
          expectedReturn,
          availableCash,
          taxReserve,
        },
      });
    },
  };
}

export { RATINGS };
