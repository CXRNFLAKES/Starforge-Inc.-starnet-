import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../mobile-test/index.html", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../mobile-test/manifest.webmanifest", import.meta.url), "utf8"));
const sw = fs.readFileSync(new URL("../mobile-test/sw.js", import.meta.url), "utf8");

test("Android 9 shell is installable as a standalone web app", () => {
  assert.match(html, /rel=["']manifest\.webmanifest["']/);
  assert.match(html, /serviceWorker/);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
});

test("Android 9 shell keeps governance APIs network-backed", () => {
  assert.match(sw, /url\.pathname\.startsWith\(["']\/api\//);
  assert.match(sw, /if \(request\.method !== ["']GET["']\) return/);
  assert.match(sw, /caches\.match\(["']\/["']\)/);
});

test("Android 9 shell has no provider credentials or live model dependency", () => {
  assert.doesNotMatch(html, /APINEX_API_KEY|OPENAI_API_KEY|Authorization:\s*Bearer/i);
  assert.doesNotMatch(sw, /APINEX_API_KEY|OPENAI_API_KEY|Authorization:\s*Bearer/i);
  assert.match(html, /SAFE MODE/);
});
