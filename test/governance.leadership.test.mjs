import test from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { ACTIONS } from "../sidecar/governance/authority.mjs";
import { makeCompany } from "../sidecar/governance/company.mjs";
import {
  leadershipProfile,
  hasCapability,
  assertLeadershipCapability,
  makeLeadership,
} from "../sidecar/governance/leadership.mjs";

test("PA and CEO share the coordination capability surface but have different reserved authority", () => {
  const pa = leadershipProfile(ROLES.PA);
  const ceo = leadershipProfile(ROLES.CEO);

  for (const capability of ["coordinate", "research", "review_work", "inspect_company", "communicate"]) {
    assert.equal(hasCapability(ROLES.PA, capability), true);
    assert.equal(hasCapability(ROLES.CEO, capability), true);
  }

  assert.equal(pa.reservedCapabilities.includes("brief_cho"), true);
  assert.equal(ceo.reservedCapabilities.includes("manage_operations"), true);
  assert.equal(hasCapability(ROLES.PA, "manage_operations"), false);
  assert.equal(hasCapability(ROLES.CEO, "brief_cho"), false);
});

test("leadership actions remain behind governance authority", () => {
  const company = makeCompany();
  const leadership = makeLeadership({ company });

  assert.equal(leadership.operate(ROLES.CEO, "launch project").role, ROLES.CEO);
  assert.equal(leadership.requestApproval(ROLES.CEO, { title: "Hosting budget" }).action,
    ACTIONS.CEO_REQUEST_APPROVAL);
  assert.equal(leadership.briefCho(ROLES.PA, "Daily company brief").role, ROLES.PA);

  assert.throws(() => leadership.operate(ROLES.PA, "launch project"), /Unauthorized capability/);
  assert.throws(() => leadership.requestApproval(ROLES.PA, { title: "x" }), /Unauthorized capability/);
  assert.throws(() => leadership.briefCho(ROLES.CEO, "x"), /Unauthorized capability/);
});

test("PA can communicate with CEO while CEO cannot use the PA-only CHO channel", () => {
  const company = makeCompany();
  const leadership = makeLeadership({ company });

  const message = leadership.communicate(ROLES.PA, ROLES.CEO, "Risk review is ready.");
  assert.equal(message.details.targetRole, ROLES.CEO);

  assert.throws(() => leadership.briefCho(ROLES.CEO, "I am the PA"), /Unauthorized capability/);
});

test("unknown leadership capability fails closed", () => {
  assert.equal(hasCapability(ROLES.PA, "execute_money"), false);
  assert.throws(() => assertLeadershipCapability(ROLES.PA, "execute_money"), /Unauthorized capability/);
});
