#!/usr/bin/env node
/**
 * StarForge preflight gate.
 *
 * This is intentionally isolated from the production StarNet runtime.
 * It must remain safe to run before governance is integrated into StarNet.
 *
 * Checks:
 *  1. Required governance modules import cleanly.
 *  2. Constitutional/unit tests pass.
 *  3. Android 9 compatibility tests pass.
 *  4. Mobile test server starts on localhost and exposes healthy/test endpoints.
 *  5. Mobile endpoint reports zero failures and test-only side effects.
 *  6. Ambiguous CommonJS governance files/imports are absent.
 *
 * Exit 0 = safe test gate passed.
 * Exit 1 = do not integrate yet.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = process.cwd();
const NODE = process.execPath;
const TEST_FILES = [
  "test/governance.test.mjs",
  "test/governance.testing.test.mjs",
  "test/governance.leadership.test.mjs",
  "test/governance.board.test.mjs",
  "test/governance.risk.test.mjs",
  "test/governance.fact-checker.test.mjs",
  "test/starforge.android9.test.mjs",
];
const REQUIRED_MODULES = [
  "sidecar/governance/roles.mjs",
  "sidecar/governance/authority.mjs",
  "sidecar/governance/company.mjs",
  "sidecar/governance/index.mjs",
  "sidecar/governance/testing.mjs",
  "sidecar/governance/board.mjs",
  "sidecar/governance/risk-engine.mjs",
  "sidecar/governance/fact-checker.mjs",
  "test/governance.risk.test.mjs",
  "test/governance.fact-checker.test.mjs",
  "scripts/starforge-mobile-test.mjs",
  "mobile-test/index.html",
];
const FORBIDDEN_FILES = [
  "sidecar/governance/roles.js",
  "sidecar/governance/authority.js",
  "sidecar/governance/company.js",
  "sidecar/governance/index.js",
  "sidecar/governance/testing.js",
  "sidecar/governance/package.json",
  "test/governance.test.js",
  "test/governance.testing.test.js",
  "test/starforge.android9.test.js",
];

const results = [];

function record(name, passed, detail) {
  results.push({ name, status: passed ? "PASS" : "FAIL", detail });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function run(command, args, options = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, STARFORGE_TEST_MODE: "1", ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
    child.on("error", (error) => resolve({ code: 1, signal: null, stdout, stderr: error.message }));
  });
}

async function waitFor(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      return response;
    } catch (error) {
      lastError = error.message;
      await sleep(150);
    }
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

console.log("==============================================");
console.log(" STARFORGE PRE-INTEGRATION PREFLIGHT");
console.log(" Safe mode: NO production StarNet runtime");
console.log("==============================================");

for (const file of REQUIRED_MODULES) {
  record(`required: ${file}`, existsSync(join(ROOT, file)), existsSync(join(ROOT, file)) ? "present" : "missing");
}

for (const file of FORBIDDEN_FILES) {
  const present = existsSync(join(ROOT, file));
  record(`no ambiguous file: ${file}`, !present, present ? "OLD FILE STILL EXISTS" : "absent");
}

const sourceFiles = [
  "sidecar/governance/roles.mjs",
  "sidecar/governance/authority.mjs",
  "sidecar/governance/company.mjs",
  "sidecar/governance/index.mjs",
  "sidecar/governance/testing.mjs",
  "sidecar/governance/board.mjs",
  "sidecar/governance/risk-engine.mjs",
  "sidecar/governance/fact-checker.mjs",
  "scripts/starforge-mobile-test.mjs",
];

for (const file of sourceFiles) {
  if (!existsSync(join(ROOT, file))) continue;
  const source = readFileSync(join(ROOT, file), "utf8");
  const hasOldImport = /(?:from|import\s*\()\s*["'][^"']*governance\/[^"']+\.js["']/.test(source);
  record(`no .js governance imports: ${file}`, !hasOldImport, hasOldImport ? "OLD .js IMPORT FOUND" : "clean");
}

for (const file of TEST_FILES) {
  if (!existsSync(join(ROOT, file))) continue;
  const result = await run(NODE, ["--test", file]);
  record(
    `node test: ${file}`,
    result.code === 0,
    result.code === 0 ? "passed" : (result.stderr.trim().split("\n").slice(-3).join(" ") || `exit ${result.code}`)
  );
}

const port = 18799 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const server = spawn(NODE, ["scripts/starforge-mobile-test.mjs"], {
  cwd: ROOT,
  env: { ...process.env, STARFORGE_TEST_MODE: "1", HOST: "127.0.0.1", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
let serverError = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverError += chunk; });

try {
  const health = await waitFor(`${base}/api/health`);
  const healthData = await health.json();
  record(
    "mobile test server health",
    health.ok === true && healthData.mode === "android-9-test",
    JSON.stringify(healthData)
  );

  const testResponse = await waitFor(`${base}/api/test`);
  const testData = await testResponse.json();
  record(
    "mobile governance endpoint",
    testData.failed === 0 && testData.safe === true && testData.sideEffects === "none",
    `${testData.passed}/${testData.total} passed; mode=${testData.mode}; sideEffects=${testData.sideEffects}`
  );

  const ui = await (await fetch(base, { cache: "no-store" })).text();
  record(
    "mobile test UI",
    ui.includes("StarForge Test Lab") && ui.includes("SAFE MODE") && ui.includes("/api/test"),
    "mobile UI loaded"
  );
} catch (error) {
  record("mobile test server", false, error.message + (serverError.trim() ? ` | ${serverError.trim()}` : ""));
} finally {
  server.kill("SIGTERM");
  await sleep(100);
}

const failures = results.filter((item) => item.status === "FAIL");
console.log("----------------------------------------------");
console.log(`RESULT: ${failures.length === 0 ? "SAFE TO PROCEED TO INTEGRATION" : "DO NOT INTEGRATE YET"}`);
console.log(`${results.length - failures.length}/${results.length} checks passed`);
if (failures.length) {
  for (const failure of failures) console.log(` - ${failure.name}: ${failure.detail}`);
  process.exitCode = 1;
}
