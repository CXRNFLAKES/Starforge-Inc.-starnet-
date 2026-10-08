import test from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, can, requiresCho } from "../sidecar/governance/authority.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { makeOperations } from "../sidecar/governance/operations.mjs";

test("M8.1 authority matrix keeps CHO-reserved actions exclusive", () => {
  assert.equal(requiresCho(ACTIONS.CHO_DECIDE), true);
  assert.equal(requiresCho(ACTIONS.COMPANY_CONFIGURE), true);
  assert.equal(requiresCho(ACTIONS.APPROVAL_EXECUTE), true);

  for (const role of [ROLES.PA, ROLES.BOARD, ROLES.CEO, ROLES.VICE_CEO, ROLES.ACCOUNTANT, ROLES.WORKER]) {
    assert.equal(can(role, ACTIONS.CHO_DECIDE), false, role);
    assert.equal(can(role, ACTIONS.COMPANY_CONFIGURE), false, role);
    assert.equal(can(role, ACTIONS.APPROVAL_EXECUTE), false, role);
  }

  assert.equal(can(ROLES.CHO, ACTIONS.CHO_DECIDE), true);
  assert.equal(can(ROLES.CHO, ACTIONS.COMPANY_CONFIGURE), true);
  assert.equal(can(ROLES.CHO, ACTIONS.APPROVAL_EXECUTE), true);
});

test("M8.1 operational lanes keep CEO, Vice CEO, and Overseer responsibilities separated", () => {
  assert.equal(can(ROLES.CEO, ACTIONS.CEO_OPERATE), true);
  assert.equal(can(ROLES.CEO, ACTIONS.CEO_DELEGATE), true);
  assert.equal(can(ROLES.CEO, ACTIONS.STARNET_DELEGATE), true);

  assert.equal(can(ROLES.VICE_CEO, ACTIONS.STARNET_DELEGATE), true);
  assert.equal(can(ROLES.VICE_CEO, ACTIONS.STARNET_REPORT), true);
  assert.equal(can(ROLES.VICE_CEO, ACTIONS.CEO_OPERATE), false);

  assert.equal(can(ROLES.PA, ACTIONS.PA_REVIEW), true);
  assert.equal(can(ROLES.PA, ACTIONS.PA_INVESTIGATE), true);
  assert.equal(can(ROLES.PA, ACTIONS.CEO_OPERATE), false);
  assert.equal(can(ROLES.PA, ACTIONS.STARNET_DELEGATE), false);
});

test("M8.1 live operational API fails closed when non-CEO roles attempt CEO controls", () => {
  const company = makeCompany();
  const operations = makeOperations({ company });

  assert.throws(
    () => operations.createProject(ROLES.PA, { title: "Oversight cannot operate" }),
    /Unauthorized action|Only the CEO/,
  );
  assert.throws(
    () => operations.createProject(ROLES.VICE_CEO, { title: "StarNet lead cannot create company project" }),
    /Unauthorized action|Only the CEO/,
  );
  assert.throws(
    () => operations.createProject(ROLES.CHO, { title: "CHO remains governance authority" }),
    /Unauthorized action|Only the CEO/,
  );
});

test("M8.1 StarNet delegation remains restricted to CEO and Vice CEO", async () => {
  const company = makeCompany();
  const operations = makeOperations({
    company,
    starnet: {
      listWorkers: () => [{ id: "worker-a", name: "Worker A" }],
      delegateTask: async () => ({ result: { content: "M8.1 GOVERNED EXECUTION" } }),
    },
  });
  const project = operations.createProject(ROLES.CEO, { title: "M8.1 live lane" });

  await assert.rejects(
    () => operations.delegateToStarNet(ROLES.PA, {
      projectId: project.id,
      title: "PA must review, not dispatch",
      assigneeId: "worker-a",
    }),
    /Unauthorized action|Only the CEO or StarNet Vice CEO/,
  );

  const result = await operations.delegateToStarNet(ROLES.VICE_CEO, {
    projectId: project.id,
    title: "Vice CEO governed StarNet dispatch",
    assigneeId: "worker-a",
    successCriteria: "Return the M8.1 completion marker",
  });
  assert.equal(result.task.status, "completed");
  assert.equal(result.task.delegatedBy, ROLES.VICE_CEO);
  assert.equal(result.task.assigneeSource, "starnet");
  assert.equal(result.result.content, "M8.1 GOVERNED EXECUTION");
});
