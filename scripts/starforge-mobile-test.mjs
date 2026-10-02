import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeTestingCompany } from "../sidecar/governance/testing.mjs";
import { ROLES } from "../sidecar/governance/roles.mjs";
import { ACTIONS, assertCan } from "../sidecar/governance/authority.mjs";
import { makeStarForgeGovernanceHandler } from "../sidecar/governance/http.mjs";
import { makeStarNetRuntimeBridge } from "../sidecar/governance/starnet-runtime.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const UI = join(ROOT, "../mobile-test/index.html");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8799);
const runtime = process.env.STARNET_RUNTIME_URL
  ? makeStarNetRuntimeBridge({
      baseUrl: process.env.STARNET_RUNTIME_URL,
      token: process.env.STARNET_RUNTIME_TOKEN || "",
    })
  : null;

const governanceHandler = makeStarForgeGovernanceHandler({
  workspace: join(ROOT, "../.starforge-mobile-test"),
  roster: new Map(),
  runsMeta: new Map(),
  runtime,
});

function expectBlocked(fn) {
  try { fn(); return { status: "FAIL", detail: "Unauthorized action was allowed" }; }
  catch (error) { return { status: "PASS", detail: error.message }; }
}

function runTests() {
  const company = makeTestingCompany();
  const results = [];
  const check = (name, fn) => {
    try {
      const detail = fn();
      results.push({ name, status: "PASS", detail: detail ?? "OK" });
    } catch (error) {
      results.push({ name, status: "FAIL", detail: error.message });
    }
  };

  check("CEO cannot make CHO decision", () => {
    const r = expectBlocked(() => assertCan(ROLES.CEO, ACTIONS.CHO_DECIDE));
    if (r.status !== "PASS") throw new Error(r.detail);
    return r.detail;
  });

  check("CEO cannot execute approval", () => {
    const r = expectBlocked(() => assertCan(ROLES.CEO, ACTIONS.APPROVAL_EXECUTE));
    if (r.status !== "PASS") throw new Error(r.detail);
    return r.detail;
  });

  check("Worker cannot authorize spending", () => {
    const r = expectBlocked(() => assertCan(ROLES.WORKER, ACTIONS.APPROVAL_EXECUTE));
    if (r.status !== "PASS") throw new Error(r.detail);
    return r.detail;
  });

  check("PA cannot make final CHO decision", () => {
    const r = expectBlocked(() => assertCan(ROLES.PA, ACTIONS.CHO_DECIDE));
    if (r.status !== "PASS") throw new Error(r.detail);
    return r.detail;
  });

  check("CEO can operate", () => {
    assertCan(ROLES.CEO, ACTIONS.CEO_OPERATE);
    return "CEO operational authority granted";
  });

  check("PA can review and investigate", () => {
    assertCan(ROLES.PA, ACTIONS.PA_REVIEW);
    assertCan(ROLES.PA, ACTIONS.PA_INVESTIGATE);
    return "Independent PA oversight granted";
  });

  check("Board can decide", () => {
    assertCan(ROLES.BOARD, ACTIONS.BOARD_DECIDE);
    return "Board governance authority granted";
  });

  check("CHO can record a decision", () => {
    const decision = company.recordDecision(ROLES.CHO, {
      type: "TEST_APPROVAL",
      outcome: "APPROVED",
      note: "Android 9 mobile test",
    });
    if (!decision.id) throw new Error("Decision ID missing");
    const audit = company.snapshot().audit;
    if (!audit.some((x) => x.event === "governance.decision.recorded")) {
      throw new Error("Audit event missing");
    }
    return "Decision + audit trail recorded";
  });

  const passed = results.filter((x) => x.status === "PASS").length;
  return {
    mode: "android-9-test",
    starforgeHq: true,
    safe: true,
    sideEffects: "none",
    passed,
    failed: results.length - passed,
    total: results.length,
    results,
    company: company.snapshot(),
    capital: company.capitalSnapshot(ROLES.CHO),
    companyLevel: 1,
    maxCompanyLevel: 100,
    maxCompanyCapital: 10000000,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/starforge/governance") {
      return governanceHandler(req, res);
    }
    if (req.url === "/api/test") {
      const body = JSON.stringify(runTests());
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      return res.end(body);
    }
    if (req.url === "/api/health") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      return res.end(JSON.stringify({ ok: true, mode: "android-9-test", node: process.version }));
    }
    if (req.url === "/" || req.url === "/index.html") {
      const html = await readFile(UI, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(html);
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`StarForge Android 9 test mode: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`LAN: http://<computer-ip>:${PORT}`);
});
