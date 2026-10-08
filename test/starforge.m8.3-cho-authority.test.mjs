import test from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, CHO_RESERVED_ACTIONS, can, requiresCho } from "../sidecar/governance/authority.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

test("M8.3 CHO is the only role with reserved executive authority", () => {
  for (const action of CHO_RESERVED_ACTIONS) {
    assert.equal(requiresCho(action), true);
    assert.equal(can(ROLES.CHO, action), true);
    for (const role of [
      ROLES.PA,
      ROLES.BOARD,
      ROLES.CEO,
      ROLES.VICE_CEO,
      ROLES.ACCOUNTANT,
      ROLES.CFO,
      ROLES.RISK,
      ROLES.EXECUTIVE,
      ROLES.WORKER,
    ]) {
      assert.equal(can(role, action), false, `${role} must not hold ${action}`);
    }
  }
});

test("M8.3 CHO retains broad authority while delegated roles remain bounded", () => {
  for (const action of Object.values(ACTIONS)) {
    assert.equal(can(ROLES.CHO, action), true, `CHO must retain ${action}`);
  }

  assert.equal(can(ROLES.PA, ACTIONS.PA_ADVISE_CHO), true);
  assert.equal(can(ROLES.PA, ACTIONS.PA_REVIEW), true);
  assert.equal(can(ROLES.PA, ACTIONS.CHO_DECIDE), false);
  assert.equal(can(ROLES.PA, ACTIONS.APPROVAL_EXECUTE), false);

  assert.equal(can(ROLES.CEO, ACTIONS.CEO_OPERATE), true);
  assert.equal(can(ROLES.CEO, ACTIONS.CHO_DECIDE), false);
  assert.equal(can(ROLES.CEO, ACTIONS.APPROVAL_EXECUTE), false);

  assert.equal(can(ROLES.VICE_CEO, ACTIONS.STARNET_DELEGATE), true);
  assert.equal(can(ROLES.VICE_CEO, ACTIONS.CEO_OPERATE), false);
  assert.equal(can(ROLES.VICE_CEO, ACTIONS.APPROVAL_EXECUTE), false);
});
