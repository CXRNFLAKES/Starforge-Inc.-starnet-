/**
 * Evidence-labeling fact checker for StarForge.
 * It classifies supplied evidence; it does not browse, contact providers, or
 * decide whether an unsupported claim is true.
 */

export const FACT_LABELS = Object.freeze({
  VERIFIED_FACT: "VERIFIED FACT",
  SUPPORTED_ESTIMATE: "SUPPORTED ESTIMATE",
  UNVERIFIED_CLAIM: "UNVERIFIED CLAIM",
  CONFLICTING_INFORMATION: "CONFLICTING INFORMATION",
});

export function makeFactChecker() {
  return {
    check(claim, { evidence = [] } = {}) {
      if (!claim || typeof claim !== "string") {
        throw new TypeError("Claim must be a non-empty string");
      }
      if (!Array.isArray(evidence)) {
        throw new TypeError("Evidence must be an array");
      }

      const usable = evidence.filter((item) => item && typeof item === "object");
      const conflicts = usable.filter((item) => item.conflicts === true);
      const explicitEstimates = usable.filter((item) => item.estimate === true);

      let label = FACT_LABELS.UNVERIFIED_CLAIM;
      let confidence = 0;
      const findings = [];

      if (conflicts.length > 0) {
        label = FACT_LABELS.CONFLICTING_INFORMATION;
        confidence = 0.5;
        findings.push("Supplied evidence contains an explicit conflict");
      } else if (usable.length === 0) {
        findings.push("No evidence was supplied");
      } else if (explicitEstimates.length > 0) {
        label = FACT_LABELS.SUPPORTED_ESTIMATE;
        confidence = Math.min(0.85, 0.55 + (usable.length * 0.1));
        findings.push("Evidence supports the claim as an estimate, not a verified fact");
      } else if (usable.every((item) => item.supports === true)) {
        label = FACT_LABELS.VERIFIED_FACT;
        confidence = Math.min(0.98, 0.7 + (usable.length * 0.1));
        findings.push("All supplied evidence items explicitly support the claim");
      } else {
        label = FACT_LABELS.UNVERIFIED_CLAIM;
        confidence = 0.25;
        findings.push("Evidence does not establish the claim");
      }

      return Object.freeze({
        claim,
        label,
        confidence,
        findings,
        evidenceCount: usable.length,
        conflicts: conflicts.length,
      });
    },
  };
}
