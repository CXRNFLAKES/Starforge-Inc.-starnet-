import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const BASE = "http://127.0.0.1:8787";

async function waitForServer(child) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE + "/");
      if (res.ok) return;
    } catch {}
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("StarNet sidecar did not become ready on port 8787");
}

test("M7 live HQ proves the actual StarForge frontend and governed feed are served together", async () => {
  const child = spawn(process.execPath, ["sidecar/index.js"], {
    env: { ...process.env, PORT: "8787", HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(child);

    const page = await fetch(BASE + "/");
    assert.equal(page.status, 200);
    const html = await page.text();

    assert.match(html, /StarNet/);
    assert.match(html, /data-term="starforge-hq"/);
    assert.match(html, /data-term="starforge-mission-control"/);
    assert.match(html, /data-term="starforge-worker-room"/);

    const tokenMatch = html.match(/window\.__STARNET_API_TOKEN__=([^;]+);/);
    assert.ok(tokenMatch, "live frontend must receive its API token");

    const token = JSON.parse(tokenMatch[1]);
    assert.equal(typeof token, "string");
    assert.ok(token.length > 10);

    const feed = await fetch(BASE + "/api/starforge/governance", {
      headers: {
        "X-StarNet-Token": token,
        "Origin": BASE,
      },
    });
    assert.equal(feed.status, 200);
    const payload = await feed.json();

    assert.equal(payload.ok, true);
    assert.equal(payload.readOnly, true);
    assert.ok(payload.workforce);
    assert.ok(payload.execution);
    assert.ok(payload.finance);
    assert.ok(payload.gameplay);

    const write = await fetch(BASE + "/api/starforge/governance", {
      method: "POST",
      headers: {
        "X-StarNet-Token": token,
        "Origin": BASE,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(write.status, 405);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(resolve, 2000);
    });
  }
});
