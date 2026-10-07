import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const index=fs.readFileSync(new URL("../frontend/index.html",import.meta.url),"utf8");
const manifest=JSON.parse(fs.readFileSync(new URL("../frontend/manifest.starforge.json",import.meta.url),"utf8"));
test("StarForge mobile surface is installable through the existing StarNet UI",()=>{
  assert.match(index,/rel="manifest" href="manifest\.starforge\.json"/);
  assert.match(index,/name="theme-color" content="#050505"/);
  assert.match(index,/mobile-web-app-capable/);
  assert.equal(manifest.short_name,"StarForge HQ");
  assert.equal(manifest.display,"standalone");
  assert.equal(manifest.orientation,"portrait-primary");
  assert.match(manifest.start_url,/starforge=hq/);
});
