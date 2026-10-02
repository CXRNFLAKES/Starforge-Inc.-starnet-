import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const server=fs.readFileSync(new URL("../scripts/starforge-mobile-test.mjs",import.meta.url),"utf8");
const hq=fs.readFileSync(new URL("../frontend/app/windows/starforge-hq.js",import.meta.url),"utf8");

test("Android 9 mobile server exposes the governed StarForge feed",()=>{
  assert.match(server,/makeStarForgeGovernanceHandler/);
  assert.match(server,/req\.url === "\/api\/starforge\/governance"/);
  assert.match(server,/roster: new Map\(\)/);
  assert.match(server,/runsMeta: new Map\(\)/);
});

test("StarForge HQ consumes the governed feed without fabricating values",()=>{
  assert.match(hq,/fetch\('\/api\/starforge\/governance'/);
  assert.match(hq,/netOperatingCapital/);
  assert.match(hq,/Finance bridge unavailable — no balance is invented/);
});