import test from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeBoard } from "../sidecar/governance/board.mjs";

test("board roster is anchored to CHO, PA, and CEO", () => {
  const board = makeBoard({ company: makeCompany() });
  const roster = board.roster();

  assert.equal(roster.chair.role, ROLES.CHO);
  assert.equal(roster.pa.role, ROLES.PA);
  assert.equal(roster.ceo.role, ROLES.CEO);
  assert.deepEqual(roster.committees, ["strategy", "finance", "risk", "operations", "ai", "revenue"]);
});

test("PA can convene a board meeting and Board can record a decision", () => {
  const company = makeCompany();
  const board = makeBoard({ company });

  const meeting = board.convene(ROLES.PA, {
    objective: "Review the monthly company objective",
    agenda: ["revenue", "cash", "risks"],
  });

  assert.equal(meeting.status, "open");
  assert.equal(company.snapshot().boardMeetings.length, 1);

  const decided = board.decide(ROLES.BOARD, meeting.id, {
    decision: "Request a revised revenue plan",
    rationale: "Current plan lacks evidence for the target.",
    actionItems: ["CEO prepares revised plan"],
  });

  assert.equal(decided.status, "decided");
  assert.equal(decided.decisions.length, 1);
  assert.deepEqual(decided.actionItems, ["CEO prepares revised plan"]);
});

test("CEO cannot convene or decide as the Board", () => {
  const board = makeBoard({ company: makeCompany() });

  assert.throws(
    () => board.convene(ROLES.CEO, { objective: "Bypass governance" }),
    /Unauthorized action/
  );

  assert.throws(
    () => board.decide(ROLES.CEO, "missing", { decision: "Bypass" }),
    /Unauthorized action/
  );
});

test("Board decisions fail closed for unknown meetings", () => {
  const board = makeBoard({ company: makeCompany() });

  assert.throws(
    () => board.decide(ROLES.BOARD, "missing", { decision: "Approve" }),
    /Unknown board meeting/
  );
});
