import test from "node:test";
import assert from "node:assert/strict";
import { makeStarForgeGovernanceHandler } from "../sidecar/governance/http.mjs";
import { makeCompany } from "../sidecar/governance/company.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";

function responseCapture() {
  let status;
  let body = "";
  return {
    res: {
      writeHead(code) { status = code; },
      end(value) { body = value; },
    },
    get status() { return status; },
    get body() { return body; },
  };
}

test("D16 governance feed rejects every write method without mutating governed state", async () => {
  const company = makeCompany();
  company.recordFinanceEntry(ROLES.CHO, {
    id: "d16-capital",
    kind: "capital-injection",
    amount: 5000,
    currency: "EUR",
  });
  const before = company.snapshot();
  const handler = makeStarForgeGovernanceHandler({ workspace: ".starforge-d16-test", company });

  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const capture = responseCapture();
    await handler({
      method,
      url: "/api/starforge/governance?method=POST",
      headers: { "x-http-method-override": "DELETE" },
      body: JSON.stringify({ role: ROLES.CHO, amount: 999999 }),
    }, capture.res);
    assert.equal(capture.status, 405, method);
    assert.match(JSON.parse(capture.body).error, /read-only/);
  }

  assert.deepEqual(company.snapshot(), before);
});

test("D16 governance feed rejects non-feed GET routes without exposing mutation paths", async () => {
  const company = makeCompany();
  const before = company.snapshot();
  const handler = makeStarForgeGovernanceHandler({ workspace: ".starforge-d16-test", company });

  const capture = responseCapture();
  await handler({ method: "GET", url: "/api/starforge/governance/write" }, capture.res);

  assert.equal(capture.status, 404);
  assert.match(JSON.parse(capture.body).error, /Not found/);
  assert.deepEqual(company.snapshot(), before);
});

test("D16 governance feed is explicitly read-only even when a company kernel is connected", async () => {
  const company = makeCompany();
  const before = company.snapshot();
  const handler = makeStarForgeGovernanceHandler({ workspace: ".starforge-d16-test", company });

  const capture = responseCapture();
  await handler({ method: "GET", url: "/api/starforge/governance" }, capture.res);

  assert.equal(capture.status, 200);
  const payload = JSON.parse(capture.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.readOnly, true);
  assert.deepEqual(company.snapshot(), before);
});
