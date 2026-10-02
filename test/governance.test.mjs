import test from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { ACTIONS, assertCan, can, requiresCho } from "../sidecar/governance/authority.mjs";
import { defaultState, makeCompany } from "../sidecar/governance/company.mjs";

test("defines the StarForge constitutional roles", () => {
  assert.deepEqual(Object.values(ROLES), [
    "cho", "pa", "board", "ceo", "accountant", "cfo", "risk", "executive", "worker"
  ]);
});

test("CHO has final authority", () => {
  for (const action of Object.values(ACTIONS)) assert.equal(can(ROLES.CHO, action), true);
  assert.equal(requiresCho(ACTIONS.CHO_DECIDE), true);
  assert.equal(requiresCho(ACTIONS.COMPANY_CONFIGURE), true);
  assert.equal(requiresCho(ACTIONS.APPROVAL_EXECUTE), true);
});

test("CEO is operational, not constitutional authority", () => {
  assert.equal(can(ROLES.CEO, ACTIONS.CEO_OPERATE), true);
  assert.equal(can(ROLES.CEO, ACTIONS.CEO_DELEGATE), true);
  assert.equal(can(ROLES.CEO, ACTIONS.CHO_DECIDE), false);
  assert.equal(can(ROLES.CEO, ACTIONS.COMPANY_CONFIGURE), false);
  assert.equal(can(ROLES.CEO, ACTIONS.APPROVAL_EXECUTE), false);
});

test("PA can review/investigate but cannot make CHO decisions", () => {
  assert.equal(can(ROLES.PA, ACTIONS.PA_REVIEW), true);
  assert.equal(can(ROLES.PA, ACTIONS.PA_INVESTIGATE), true);
  assert.equal(can(ROLES.PA, ACTIONS.CHO_DECIDE), false);
  assert.throws(() => assertCan(ROLES.PA, ACTIONS.CHO_DECIDE), /Unauthorized action/);
});

test("default company contains the executive structure", () => {
  const state = defaultState();
  assert.equal(state.company.id, "starforge");
  assert.equal(state.people.find(p => p.role === ROLES.CHO).name, "CHO");
  assert.equal(state.people.find(p => p.role === ROLES.PA).name, "Main Overseer");
  assert.equal(state.people.find(p => p.role === ROLES.CEO).name, "Sub-Overseer");
});

test("company mutations require CHO authority", () => {
  const company = makeCompany();
  assert.throws(() => company.setMission(ROLES.CEO, { mission: "x" }), /Unauthorized action/);
  const state = company.setMission(ROLES.CHO, { mission: "Build StarForge", objective: "Revenue" });
  assert.equal(state.company.mission, "Build StarForge");
  assert.equal(state.company.objective, "Revenue");
});

test("decision recording is CHO-reserved", () => {
  const company = makeCompany();
  assert.throws(() => company.recordDecision(ROLES.BOARD, { title: "test" }), /Unauthorized action/);
  const decision = company.recordDecision(ROLES.CHO, { title: "test", status: "approved" });
  assert.equal(decision.title, "test");
  assert.equal(company.snapshot().decisions.length, 1);
});
