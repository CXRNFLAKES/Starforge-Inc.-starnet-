import test from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, can, requiresCho } from "../sidecar/governance/authority.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

test("M8.5 Overseer and executive authority boundaries", () => {
  // Overseer (PA) is the CHO's independent review/risk layer.
  assert.equal(can(ROLES.PA, ACTIONS.COMPANY_READ), true);
  assert.equal(can(ROLES.PA, ACTIONS.PA_REVIEW), true);
  assert.equal(can(ROLES.PA, ACTIONS.PA_INVESTIGATE), true);
  assert.equal(can(ROLES.PA, ACTIONS.RISK_ASSESS), true);
  assert.equal(can(ROLES.PA, ACTIONS.FINANCE_TELEMETRY), true);

  // The Overseer advises/reviews; it cannot replace the CHO's reserved authority.
  assert.equal(can(ROLES.PA, ACTIONS.CHO_DECIDE), false);
  assert.equal(can(ROLES.PA, ACTIONS.COMPANY_CONFIGURE), false);
  assert.equal(can(ROLES.PA, ACTIONS.APPROVAL_EXECUTE), false);

  // Board can govern within delegation, but cannot execute CHO-reserved actions.
  assert.equal(can(ROLES.BOARD, ACTIONS.BOARD_CONVENE), true);
  assert.equal(can(ROLES.BOARD, ACTIONS.BOARD_DECIDE), true);
  assert.equal(can(ROLES.BOARD, ACTIONS.APPROVAL_EXECUTE), false);

  // CEO operates and delegates, but cannot execute CHO-reserved approvals.
  assert.equal(can(ROLES.CEO, ACTIONS.CEO_OPERATE), true);
  assert.equal(can(ROLES.CEO, ACTIONS.CEO_DELEGATE), true);
  assert.equal(can(ROLES.CEO, ACTIONS.CEO_REQUEST_APPROVAL), true);
  assert.equal(can(ROLES.CEO, ACTIONS.APPROVAL_EXECUTE), false);
  assert.equal(can(ROLES.CEO, ACTIONS.CHO_DECIDE), false);

  // Vice CEO leads StarNet execution, not company-wide CEO/CHO authority.
  assert.equal(can(ROLES.VICE_CEO, ACTIONS.STARNET_DELEGATE), true);
  assert.equal(can(ROLES.VICE_CEO, ACTIONS.STARNET_REPORT), true);
  assert.equal(can(ROLES.VICE_CEO, ACTIONS.CEO_OPERATE), false);
  assert.equal(can(ROLES.VICE_CEO, ACTIONS.APPROVAL_EXECUTE), false);
  assert.equal(can(ROLES.VICE_CEO, ACTIONS.CHO_DECIDE), false);

  // These three actions remain explicitly CHO-reserved.
  for (const action of [
    ACTIONS.CHO_DECIDE,
    ACTIONS.COMPANY_CONFIGURE,
    ACTIONS.APPROVAL_EXECUTE,
  ]) {
    assert.equal(requiresCho(action), true);
    assert.equal(can(ROLES.CHO, action), true);
  }
});
