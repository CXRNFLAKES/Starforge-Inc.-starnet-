import test from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeLeadership } from "../sidecar/governance/leadership.mjs";

test("D4 CEO and PA review only addressed Vice CEO reports", () => {
  const company = makeCompany();
  const leadership = makeLeadership({ company });
  const first = leadership.reportToLeadership(ROLES.VICE_CEO, {
    status: "green",
    workforce: { active: 4, blocked: 0 },
  });
  const second = leadership.reportToLeadership(ROLES.VICE_CEO, {
    status: "yellow",
    workforce: { active: 2, blocked: 1 },
  });

  assert.equal(leadership.getLeadershipReport(ROLES.CEO, first.details.reportId).id, first.details.reportId);
  assert.equal(leadership.getLeadershipReport(ROLES.PA, second.details.reportId).id, second.details.reportId);

  assert.throws(
    () => leadership.getLeadershipReport(ROLES.VICE_CEO, first.details.reportId),
    /Leadership report is not addressed to vice-ceo/,
  );
  assert.throws(
    () => leadership.getLeadershipReport(ROLES.BOARD, first.details.reportId),
    /Unauthorized capability/,
  );
});

test("D4 CEO and PA review is read-only against persisted Vice CEO report content", () => {
  const company = makeCompany();
  const leadership = makeLeadership({ company });
  const result = leadership.reportToLeadership(ROLES.VICE_CEO, {
    status: "green",
    workforce: { active: 5, blocked: 0 },
    finance: { revenue: 1200 },
  });

  const before = structuredClone(company.snapshot().leadershipReports[0]);

  const ceoReview = leadership.reviewLeadershipReport(ROLES.CEO, result.details.reportId);
  const paReview = leadership.reviewLeadershipReport(ROLES.PA, result.details.reportId);

  ceoReview.report.report.status = "red";
  ceoReview.report.report.workforce.active = 999;
  paReview.report.report.finance.revenue = 0;
  paReview.report.targets[0].role = ROLES.CHO;

  const after = company.snapshot().leadershipReports[0];
  assert.deepEqual(after, before);
  assert.equal(after.report.status, "green");
  assert.equal(after.report.workforce.active, 5);
  assert.equal(after.report.finance.revenue, 1200);
  assert.equal(after.targets[0].role, ROLES.CEO);
});

test("D4 CEO and PA cannot create a Vice CEO report through the reporting channel", () => {
  const company = makeCompany();
  const leadership = makeLeadership({ company });

  assert.throws(
    () => leadership.reportToLeadership(ROLES.CEO, { status: "spoofed" }),
    /Unauthorized capability/,
  );
  assert.throws(
    () => leadership.reportToLeadership(ROLES.PA, { status: "spoofed" }),
    /Unauthorized capability/,
  );
  assert.equal(company.snapshot().leadershipReports.length, 0);
});

test("D4 reviewing a report records review activity without changing the report", () => {
  const company = makeCompany();
  const leadership = makeLeadership({ company });
  const result = leadership.reportToLeadership(ROLES.VICE_CEO, {
    status: "green",
    workforce: { active: 3, blocked: 0 },
  });
  const before = structuredClone(company.snapshot().leadershipReports[0]);

  const ceoReview = leadership.reviewLeadershipReport(ROLES.CEO, result.details.reportId);
  const paReview = leadership.reviewLeadershipReport(ROLES.PA, result.details.reportId);

  assert.equal(ceoReview.reviewScope, "operational-review");
  assert.equal(paReview.reviewScope, "independent-oversight");

  const after = company.snapshot().leadershipReports[0];
  assert.deepEqual(after, before);

  const reviewEvents = company.snapshot().audit.filter(
    item => item.event === "leadership.review_report" && item.details?.reportId === result.details.reportId,
  );
  assert.equal(reviewEvents.length, 2);
  assert.deepEqual(reviewEvents.map(item => item.actorRole), [ROLES.CEO, ROLES.PA]);
});
