import test from "node:test";
import assert from "node:assert/strict";
import { makeCompany, SCHEMA_VERSION } from "../sidecar/governance/company.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

test("D9: governed company state survives persistence round-trip without losing governance evidence", () => {
  let stored = null;
  const writer = makeCompany({ save: (state) => { stored = state; } });

  writer.setMission(ROLES.CHO, {
    mission: "Build a profitable autonomous company",
    objective: "Execute governed business missions",
  });
  const packet = writer.recordDecisionPacket(ROLES.PA, {
    request: {
      id: "d9-request-001",
      amount: 1500,
      currency: "EUR",
      purpose: "Persistence integrity",
    },
    independentRisk: { rating: "low", confidence: 1, reasons: ["bounded"] },
    paAssessment: { label: "VERIFIED FACT", confidence: 1, findings: ["reviewed"] },
    paRecommendation: "approve",
  });
  writer.recordDecision(ROLES.CHO, {
    requestId: packet.request.id,
    packetId: packet.id,
    decision: "approve",
    rationale: "Approved against the persisted evidence packet.",
  });
  writer.recordFinanceEntry(ROLES.ACCOUNTANT, {
    id: "d9-revenue-001",
    kind: "revenue",
    amount: 1500,
    currency: "EUR",
  });

  assert.ok(stored);
  assert.equal(stored.schemaVersion, SCHEMA_VERSION);

  const restored = makeCompany({ load: () => stored });
  const snapshot = restored.snapshot();
  assert.equal(snapshot.company.mission, "Build a profitable autonomous company");
  assert.equal(snapshot.company.objective, "Execute governed business missions");
  assert.equal(snapshot.decisionPackets.length, 1);
  assert.equal(snapshot.decisions.length, 1);
  assert.equal(snapshot.decisions[0].packetId, snapshot.decisionPackets[0].id);
  assert.equal(snapshot.finance.entries.length, 1);
  assert.ok(snapshot.audit.some((item) => item.event === "governance.decision-packet.recorded"));
  assert.ok(snapshot.audit.some((item) => item.event === "governance.decision.recorded"));
});

test("D9: corrupted optional state is normalized fail-safe without manufacturing governance evidence", () => {
  const company = makeCompany({
    load: () => ({
      schemaVersion: 999,
      company: { name: "Recovered StarForge" },
      people: "corrupted",
      objectives: null,
      projects: {},
      tasks: "corrupted",
      leadershipReports: null,
      decisions: {},
      boardMeetings: "corrupted",
      decisionPackets: null,
      audit: "corrupted",
      finance: { entries: "corrupted", currency: "EUR" },
    }),
  });

  const snapshot = company.snapshot();
  assert.equal(snapshot.company.name, "Recovered StarForge");
  assert.deepEqual(snapshot.people.map((person) => person.role), [
    ROLES.CHO,
    ROLES.PA,
    ROLES.BOARD,
    ROLES.CEO,
    ROLES.VICE_CEO,
  ]);
  assert.deepEqual(snapshot.objectives, []);
  assert.deepEqual(snapshot.projects, []);
  assert.deepEqual(snapshot.tasks, []);
  assert.deepEqual(snapshot.leadershipReports, []);
  assert.deepEqual(snapshot.decisions, []);
  assert.deepEqual(snapshot.boardMeetings, []);
  assert.deepEqual(snapshot.decisionPackets, []);
  assert.deepEqual(snapshot.audit, []);
  assert.deepEqual(snapshot.finance.entries, []);
  assert.equal(snapshot.finance.currency, "EUR");
});

test("D9: persistence callbacks receive defensive copies and cannot mutate live company state", () => {
  let stored = null;
  const company = makeCompany({
    save: (state) => {
      stored = state;
      state.company.name = "tampered";
      state.people.push({ id: "forged", name: "Forged", role: ROLES.CEO });
    },
  });

  company.setMission(ROLES.CHO, { mission: "Persistence isolation" });

  const snapshot = company.snapshot();
  assert.equal(snapshot.company.name, "StarForge");
  assert.equal(snapshot.people.some((person) => person.id === "forged"), false);
  assert.equal(stored.company.name, "tampered");
});
