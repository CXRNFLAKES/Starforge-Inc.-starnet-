import test from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { ACTIONS } from "../sidecar/governance/authority.mjs";
import { makeCompany } from "../sidecar/governance/company.mjs";
import {
  leadershipProfile, hasCapability, assertLeadershipCapability, makeLeadership,
} from "../sidecar/governance/leadership.mjs";

test("PA, CEO, and Vice CEO have distinct leadership surfaces", () => {
  const pa = leadershipProfile(ROLES.PA);
  const ceo = leadershipProfile(ROLES.CEO);
  const viceCeo = leadershipProfile(ROLES.VICE_CEO);

  for (const capability of ["coordinate", "research", "review_work", "inspect_company", "communicate"]) {
    assert.equal(hasCapability(ROLES.PA, capability), true);
    assert.equal(hasCapability(ROLES.CEO, capability), true);
    assert.equal(hasCapability(ROLES.VICE_CEO, capability), true);
  }

  assert.equal(pa.reservedCapabilities.includes("brief_cho"), true);
  assert.equal(ceo.reservedCapabilities.includes("manage_operations"), true);
  assert.equal(viceCeo.reservedCapabilities.includes("lead_starnet"), true);
  assert.equal(viceCeo.reservedCapabilities.includes("report_to_leadership"), true);
  assert.equal(hasCapability(ROLES.PA, "manage_operations"), false);
  assert.equal(hasCapability(ROLES.CEO, "brief_cho"), false);
  assert.equal(hasCapability(ROLES.VICE_CEO, "manage_operations"), false);
});

test("company registers the StarNet Vice CEO beneath the StarForge CEO", () => {
  const company = makeCompany();
  const people = company.snapshot().people;
  const ceo = people.find(person => person.role === ROLES.CEO);
  const viceCeo = people.find(person => person.role === ROLES.VICE_CEO);
  assert.equal(ceo.name, "StarForge CEO");
  assert.equal(viceCeo.name, "StarNet Vice CEO");
});

test("leadership actions remain behind governance authority", () => {
  const company = makeCompany();
  const leadership = makeLeadership({ company });

  assert.equal(leadership.operate(ROLES.CEO, "launch project").role, ROLES.CEO);
  assert.equal(leadership.requestApproval(ROLES.CEO, { title: "Hosting budget" }).action, ACTIONS.CEO_REQUEST_APPROVAL);
  assert.equal(leadership.briefCho(ROLES.PA, "Daily company brief").role, ROLES.PA);
  const report = leadership.reportToLeadership(ROLES.VICE_CEO, { status: "green", workforce: { active: 3 } });
  assert.deepEqual(report.details.targets.map(target => target.role), [ROLES.CEO, ROLES.PA]);
  assert.equal(report.action, ACTIONS.STARNET_REPORT);

  assert.throws(() => leadership.operate(ROLES.PA, "launch project"), /Unauthorized capability/);
  assert.throws(() => leadership.requestApproval(ROLES.PA, { title: "x" }), /Unauthorized capability/);
  assert.throws(() => leadership.briefCho(ROLES.CEO, "I am the PA"), /Unauthorized capability/);
  assert.throws(() => leadership.reportToLeadership(ROLES.CEO, { status: "x" }), /Unauthorized capability/);
});

test("PA can communicate with CEO and Vice CEO while Vice CEO cannot use the PA-only CHO channel", () => {
  const company = makeCompany();
  const leadership = makeLeadership({ company });

  const message = leadership.communicate(ROLES.PA, ROLES.CEO, "Risk review is ready.");
  assert.equal(message.details.targetRole, ROLES.CEO);
  const viceMessage = leadership.communicate(ROLES.VICE_CEO, ROLES.PA, "StarNet workforce report is ready.");
  assert.equal(viceMessage.details.targetRole, ROLES.PA);

  assert.throws(() => leadership.briefCho(ROLES.VICE_CEO, "I am the PA"), /Unauthorized capability/);
});

test("unknown leadership capability fails closed", () => {
  assert.equal(hasCapability(ROLES.PA, "execute_money"), false);
  assert.throws(() => assertLeadershipCapability(ROLES.PA, "execute_money"), /Unauthorized capability/);
});

test("Vice CEO leadership reports persist for CEO and PA review", () => {
  let stored;
  const company = makeCompany({ save: (snapshot) => { stored = snapshot; } });
  const leadership = makeLeadership({ company });
  const result = leadership.reportToLeadership(ROLES.VICE_CEO, {
    status: "green",
    workforce: { active: 3, blocked: 0 },
  });

  assert.ok(result.details.reportId);
  assert.equal(stored.leadershipReports.length, 1);
  assert.equal(stored.leadershipReports[0].id, result.details.reportId);
  assert.deepEqual(stored.leadershipReports[0].targets.map(item => item.role), [ROLES.CEO, ROLES.PA]);
  assert.equal(stored.leadershipReports[0].report.workforce.active, 3);

  const restored = makeCompany({ load: () => stored });
  assert.equal(restored.snapshot().leadershipReports.length, 1);
});


test("CEO and PA can retrieve persisted Vice CEO reports through the leadership layer", () => {
  const company = makeCompany();
  const leadership = makeLeadership({ company });
  leadership.reportToLeadership(ROLES.VICE_CEO, {
    status: "yellow",
    workforce: { active: 2, blocked: 1 },
  });

  const ceoReports = leadership.listLeadershipReports({ targetRole: ROLES.CEO });
  const paReports = leadership.listLeadershipReports({ targetRole: ROLES.PA });

  assert.equal(ceoReports.length, 1);
  assert.equal(paReports.length, 1);
  assert.equal(ceoReports[0].report.status, "yellow");
  assert.equal(ceoReports[0].report.workforce.blocked, 1);
});
