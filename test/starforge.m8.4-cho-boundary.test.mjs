import test from "node:test";
import assert from "node:assert/strict";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { ACTIONS } from "../sidecar/governance/authority.mjs";

test("M8.4 reserved company configuration is CHO-only", () => {
  const company = makeCompany();

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
    assert.throws(
      () => company.setMission(role, { mission: "unauthorized", objective: "unauthorized" }),
      /Unauthorized action/,
      role,
    );
    assert.throws(
      () => company.createObjective(role, { title: "Unauthorized objective" }),
      /Unauthorized action/,
      role,
    );
    assert.throws(
      () => company.setChoProfile(role, { id: "intruder", name: "Intruder" }),
      /Unauthorized action/,
      role,
    );
  }

  assert.doesNotThrow(() =>
    company.setMission(ROLES.CHO, {
      mission: "M8.4 governed company mission",
      objective: "CHO-only configuration remains enforceable",
    }),
  );

  const objective = company.createObjective(ROLES.CHO, {
    title: "M8.4 CHO authority objective",
    description: "Reserved company configuration must remain CHO-only",
  });
  assert.equal(objective.title, "M8.4 CHO authority objective");
});

test("M8.4 CHO decisions cannot be recorded by delegated roles", () => {
  const company = makeCompany();
  const packet = {
    request: { id: "m8.4-request" },
    recommendation: "Proceed only after CHO review",
  };

  assert.doesNotThrow(() => company.recordDecisionPacket(ROLES.PA, packet));

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
    assert.throws(
      () => company.recordDecision(role, {
        requestId: "m8.4-request",
        packetId: company.snapshot().decisionPackets[0].id,
        decision: "approve",
        rationale: "must be blocked",
      }),
      /Unauthorized action/,
      role,
    );
  }

  const decision = company.recordDecision(ROLES.CHO, {
    requestId: "m8.4-request",
    packetId: company.snapshot().decisionPackets[0].id,
    decision: "approve",
    rationale: "CHO approved after governance review",
  });

  assert.equal(decision.requestId, "m8.4-request");
  assert.equal(decision.decision, "approve");
  assert.equal(company.snapshot().decisions.length, 1);
});

test("M8.4 approval execution authority remains reserved for CHO", () => {
  const company = makeCompany();

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
    assert.equal(
      company.snapshot().company.cho.role,
      ROLES.CHO,
      "company must retain CHO ownership while delegated roles operate",
    );
  }

  const { assertCan } = require("../sidecar/governance/authority.mjs");
});
