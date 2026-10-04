import test from "node:test";
import assert from "node:assert/strict";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

test("D15: governance audit recording is internal-only and cannot be forged through the company API", () => {
  const company = makeCompany();

  assert.equal(company.audit, undefined);
  assert.equal(typeof company.recordAudit, "undefined");

  const objective = company.createObjective(ROLES.CHO, {
    title: "D15 audit integrity",
  });

  const audit = company.snapshot().audit;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].event, "company.objective.created");
  assert.equal(audit[0].actorRole, ROLES.CHO);
  assert.equal(audit[0].details.objectiveId, objective.id);
});

test("D15: audit snapshots are defensive and cannot rewrite persisted governance evidence", () => {
  const company = makeCompany();

  company.createObjective(ROLES.CHO, {
    title: "D15 defensive audit evidence",
  });

  const snapshot = company.snapshot();
  snapshot.audit[0].event = "forged.event";
  snapshot.audit[0].actorRole = ROLES.PA;
  snapshot.audit[0].details.objectiveId = "tampered";

  const persisted = company.snapshot().audit[0];
  assert.equal(persisted.event, "company.objective.created");
  assert.equal(persisted.actorRole, ROLES.CHO);
  assert.notEqual(persisted.details.objectiveId, "tampered");
});

test("D15: audit details are cloned before persistence", () => {
  const company = makeCompany();
  const project = company.recordProject(ROLES.CEO, {
    id: "d15-project",
    title: "Audit detail clone",
    status: "active",
  });

  const persisted = company.snapshot().audit.find(
    (entry) => entry.event === "operations.project.recorded",
  );

  assert.equal(persisted.details.projectId, project.id);
  assert.equal(Object.prototype.hasOwnProperty.call(persisted.details, "injected"), false);
});
