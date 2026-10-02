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
  assert.deepEqual(state.company.cho, { id: "cho", name: "Human Owner", role: ROLES.CHO });
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


test("company identity establishes the human CHO and Phase 1 state", () => {
  const company = makeCompany();
  const state = company.snapshot();
  assert.equal(state.company.phase, 1);
  assert.equal(state.company.status, "active");
  assert.deepEqual(state.company.cho, { id: "cho", name: "Human Owner", role: ROLES.CHO });
});

test("CHO can update identity and create company objectives", () => {
  const company = makeCompany();
  assert.throws(() => company.setChoProfile(ROLES.CEO, { name: "Not CHO" }), /Unauthorized action/);
  const state = company.setChoProfile(ROLES.CHO, { id: "human-owner", name: "Human Owner" });
  assert.equal(state.company.cho.id, "human-owner");
  const objective = company.createObjective(ROLES.CHO, {
    title: "Build StarForge revenue engine",
    description: "Create the first measurable company revenue objective.",
  });
  assert.equal(objective.status, "active");
  assert.equal(company.snapshot().objectives.length, 1);
});

test("company persistence hook receives the updated state", () => {
  const saves = [];
  const company = makeCompany({ save: (state) => saves.push(state) });
  company.setMission(ROLES.CHO, { mission: "Build StarForge", objective: "Operate safely" });
  company.createObjective(ROLES.CHO, { title: "First objective" });
  assert.equal(saves.length, 2);
  assert.equal(saves.at(-1).company.objective, "Operate safely");
  assert.equal(saves.at(-1).objectives.length, 1);
});

test("PA can persist a structured decision packet but CEO cannot", () => {
  const company = makeCompany();
  assert.throws(() => company.recordDecisionPacket(ROLES.CEO, {
    request: { id: "expense-1" },
  }), /Unauthorized action/);
  const packet = company.recordDecisionPacket(ROLES.PA, {
    request: { id: "expense-1", purpose: "TEST" },
    independentRisk: { rating: "low" },
    paAssessment: { label: "VERIFIED FACT" },
  });
  assert.equal(packet.request.id, "expense-1");
  assert.equal(company.snapshot().decisionPackets.length, 1);
});
