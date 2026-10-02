import { makeCompany } from "./company.mjs";
import { ROLES } from "./roles.mjs";

/**
 * Safe in-memory StarForge testing variant.
 * No network, provider, ledger, or real-money side effects.
 */
export function makeTestingCompany(overrides = {}) {
  const company = makeCompany();
  company.setMission(ROLES.CHO, {
    mission: overrides.mission ?? "TEST: Build and validate StarForge governance",
    objective: overrides.objective ?? "TEST: verify authority, approvals, and auditability",
  });
  return company;
}

export function testScenario(name, run) {
  if (typeof run !== "function") throw new TypeError("Scenario runner must be a function");
  return {
    name,
    run,
    mode: "testing",
    sideEffects: "none",
  };
}
