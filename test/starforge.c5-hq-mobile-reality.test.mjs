import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const PORT = 18799 + (process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) % 1000 : 0);

async function request(path) {
  const response = await fetch(`http://127.0.0.1:${PORT}${path}`);
  const text = await response.text();
  return { response, text, data: (() => { try { return JSON.parse(text); } catch (_) { return null; } })() };
}

test("C5 mobile HQ serves a real read-only governance surface", async (t) => {
  const child = spawn(process.execPath, ["scripts/starforge-mobile-test.mjs"], {
    cwd: ROOT,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));

  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const health = await request("/api/health");
      if (health.response.ok && health.data?.ok === true) {
        ready = true;
        break;
      }
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, "Android 9 mobile test server did not become ready");

  const page = await request("/");
  assert.equal(page.response.status, 200);
  assert.match(page.text, /StarForge HQ/);
  assert.match(page.text, /Net operating capital/);
  assert.match(page.text, /StarNet Workforce/);
  assert.match(page.text, /api\/starforge\/governance/);

  const governance = await request("/api/starforge/governance");
  assert.equal(governance.response.status, 200);
  assert.equal(governance.data?.ok, true);
  assert.equal(governance.data?.readOnly, true);
  assert.equal(governance.data?.connection?.executionSource, "starforge-governed-task-ledger");
  assert.ok(governance.data?.level);
  assert.ok(governance.data?.finance);
  assert.ok(governance.data?.workforce);

  const write = await fetch(`http://127.0.0.1:${PORT}/api/starforge/governance`, { method: "POST" });
  assert.equal(write.status, 405);
  const writeBody = await write.json();
  assert.match(writeBody.error, /read-only/);
});

test("C5 mobile HQ remains Android-9-era static-compatible", async () => {
  const html = await readFile(join(ROOT, "mobile-test/index.html"), "utf8");
  assert.match(html, /maximum-scale=1/);
  assert.doesNotMatch(html, /type="module"/);
  assert.doesNotMatch(html, /import\s+.*from/);
  assert.match(html, /Intl\.NumberFormat/);
});
