import test from "node:test";
import assert from "node:assert/strict";
import { makeTestingCompany } from "../sidecar/governance/testing.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { ACTIONS, assertCan } from "../sidecar/governance/authority.mjs";

test("Android 9 test mode uses an isolated in-memory company", () => {
  const company = makeTestingCompany();
  const state = company.snapshot();
  assert.equal(state.company.id, "starforge");
  assert.match(state.company.mission, /^TEST:/);
  assert.deepEqual(state.decisions, []);
});

test("Android 9 governance mode blocks unauthorized executive actions", () => {
  assert.throws(() => assertCan(ROLES.CEO, ACTIONS.CHO_DECIDE), /Unauthorized action/);
  assert.throws(() => assertCan(ROLES.CEO, ACTIONS.APPROVAL_EXECUTE), /Unauthorized action/);
  assert.throws(() => assertCan(ROLES.WORKER, ACTIONS.APPROVAL_EXECUTE), /Unauthorized action/);
  assert.throws(() => assertCan(ROLES.PA, ACTIONS.CHO_DECIDE), /Unauthorized action/);
});

test("Android 9 governance mode permits legitimate roles", () => {
  assert.doesNotThrow(() => assertCan(ROLES.CEO, ACTIONS.CEO_OPERATE));
  assert.doesNotThrow(() => assertCan(ROLES.PA, ACTIONS.PA_INVESTIGATE));
  assert.doesNotThrow(() => assertCan(ROLES.BOARD, ACTIONS.BOARD_DECIDE));
  assert.doesNotThrow(() => assertCan(ROLES.CHO, ACTIONS.CHO_DECIDE));
});

test("CHO decision creates an auditable record", () => {
  const company = makeTestingCompany();
  const decision = company.recordDecision(ROLES.CHO, { type: "ANDROID9_TEST", outcome: "APPROVED" });
  assert.ok(decision.id);
  assert.ok(company.snapshot().audit.some((x) => x.event === "governance.decision.recorded"));
});
