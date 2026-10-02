import test from "node:test";
import assert from "node:assert/strict";
import { FACT_LABELS, makeFactChecker } from "../sidecar/governance/fact-checker.mjs";

test("fact checker marks explicitly supported evidence as verified", () => {
  const result = makeFactChecker().check("TEST: invoice exists", {
    evidence: [
      { source: "ledger", supports: true },
      { source: "invoice", supports: true },
    ],
  });
  assert.equal(result.label, FACT_LABELS.VERIFIED_FACT);
  assert.equal(result.evidenceCount, 2);
});

test("fact checker distinguishes estimates from verified facts", () => {
  const result = makeFactChecker().check("TEST: project will return 2x", {
    evidence: [{ source: "forecast", supports: true, estimate: true }],
  });
  assert.equal(result.label, FACT_LABELS.SUPPORTED_ESTIMATE);
});

test("fact checker surfaces conflicts instead of resolving them silently", () => {
  const result = makeFactChecker().check("TEST: vendor is approved", {
    evidence: [
      { source: "finance", supports: true },
      { source: "compliance", conflicts: true },
    ],
  });
  assert.equal(result.label, FACT_LABELS.CONFLICTING_INFORMATION);
  assert.equal(result.conflicts, 1);
});

test("fact checker marks claims without evidence as unverified", () => {
  const result = makeFactChecker().check("TEST: revenue will double");
  assert.equal(result.label, FACT_LABELS.UNVERIFIED_CLAIM);
  assert.equal(result.confidence, 0);
});
