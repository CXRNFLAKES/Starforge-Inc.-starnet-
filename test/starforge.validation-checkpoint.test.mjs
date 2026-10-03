import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const script = new URL("../scripts/starforge-validation-checkpoint.mjs", import.meta.url);

function run(env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script.pathname], { cwd, env: { ...process.env, ...env }, stdio: ["ignore","pipe","pipe"] });
    let stdout="", stderr="";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}

test("green validation checkpoint records Actions identity and preserves recent history", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "starforge-checkpoint-"));
  await writeFile(join(cwd, ".keep"), "");
  const first = await run({
    GITHUB_RUN_NUMBER:"177", GITHUB_RUN_ID:"37000000001",
    GITHUB_SHA:"0123456789abcdef0123456789abcdef01234567",
    GITHUB_REF_NAME:"starforge/governance-kernel"
  }, cwd);
  assert.equal(first.code, 0, first.stderr);
  const second = await run({
    GITHUB_RUN_NUMBER:"178", GITHUB_RUN_ID:"37000000002",
    GITHUB_SHA:"fedcba9876543210fedcba9876543210fedcba98",
    GITHUB_REF_NAME:"starforge/governance-kernel"
  }, cwd);
  assert.equal(second.code, 0, second.stderr);
  const state = JSON.parse(await readFile(join(cwd, ".starforge", "validation-state.json"), "utf8"));
  assert.equal(state.product, "StarForge");
  assert.equal(state.validation.status, "green");
  assert.equal(state.validation.runNumber, 178);
  assert.equal(state.validation.runId, 37000000002);
  assert.equal(state.validation.sha, "fedcba9876543210fedcba9876543210fedcba98");
  assert.equal(state.history.length, 2);
});

test("checkpoint rejects missing or malformed Actions identity", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "starforge-checkpoint-invalid-"));
  const result = await run({ GITHUB_RUN_NUMBER:"", GITHUB_RUN_ID:"", GITHUB_SHA:"bad" }, cwd);
  assert.notEqual(result.code, 0);
});