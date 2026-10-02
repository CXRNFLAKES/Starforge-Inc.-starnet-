import test from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, can } from "../sidecar/governance/authority.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { makeTestingCompany, testScenario } from "../sidecar/governance/testing.mjs";

test("testing variant is isolated and starts with a test mission", () => {
  const company = makeTestingCompany();
  const state = company.snapshot();
  assert.equal(state.company.id, "starforge");
  assert.match(state.company.mission, /^TEST:/);
  assert.match(state.company.objective, /^TEST:/);
});

test("testing variant cannot elevate CEO into CHO authority", () => {
  assert.equal(can(ROLES.CEO, ACTIONS.CHO_DECIDE), false);
  assert.equal(can(ROLES.CEO, ACTIONS.APPROVAL_EXECUTE), false);
});

test("testing scenarios are explicitly side-effect free", () => {
  const scenario = testScenario("approval denial", () => "simulated");
  assert.equal(scenario.mode, "testing");
  assert.equal(scenario.sideEffects, "none");
  assert.equal(scenario.run(), "simulated");
});
