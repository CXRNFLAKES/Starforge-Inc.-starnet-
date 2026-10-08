import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const hq=fs.readFileSync(new URL('../frontend/app/windows/starforge-hq.js',import.meta.url),'utf8');

test('M7.2 HQ exposes an explicit operator refresh control',()=>{
  assert.match(hq,/data-refresh-governance/);
  assert.match(hq,/REFRESH FEED/);
  assert.match(hq,/REFRESHING…/);
  assert.match(hq,/FEED UPDATED/);
  assert.match(hq,/await refreshGovernance\(\)/);
  assert.match(hq,/refreshButton\.disabled=true/);
});

test('M7.2 refresh remains read-only and uses the governed no-store feed',()=>{
  assert.match(hq,/fetch\('\/api\/starforge\/governance',\{cache:'no-store'\}\)/);
  assert.doesNotMatch(hq,/method:\s*['"]POST['"]/);
  assert.doesNotMatch(hq,/method:\s*['"]PUT['"]/);
  assert.doesNotMatch(hq,/method:\s*['"]PATCH['"]/);
  assert.doesNotMatch(hq,/method:\s*['"]DELETE['"]/);
});
