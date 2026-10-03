import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const js=fs.readFileSync(new URL('../frontend/app/windows/starforge-worker-room.js',import.meta.url),'utf8');const index=fs.readFileSync(new URL('../frontend/index.html',import.meta.url),'utf8');const css=fs.readFileSync(new URL('../frontend/css/starforge-worker-room.css',import.meta.url),'utf8');
test('StarForge worker room reuses StarNet UI and live governed telemetry',()=>{assert.match(js,/StationUI\.registerWindow\(\s*['"]starforge-worker-room['"]/);assert.match(js,/fetch\('\/api\/starforge\/governance'/);assert.match(js,/workforce\?\.workers/);assert.match(js,/StationUI\.openAgent/);assert.match(index,/app\/windows\/starforge-worker-room\.js/);assert.match(index,/data-term="starforge-worker-room"/);assert.match(css,/max-width:720px/)});
test('Worker room remains read-only',()=>{assert.doesNotMatch(js,/fetch\([^)]*,\s*\{[^}]*method\s*:\s*['"]POST/);assert.match(js,/Read-only telemetry/)});

test('Worker room derives RPG progression only from governed task history',()=>{assert.match(js,/performance=w\.performance\|\|\{\}/);assert.doesNotMatch(js,/const tasks=Array\.isArray\(data\?\.execution\?\.recentTasks\)/);assert.match(js,/performance\.completed/);assert.match(js,/LVL '\+level/);assert.match(js,/XP '\+xp/);assert.match(js,/failed/);assert.match(js,/blocked/);assert.match(js,/successRate/);assert.match(js,/levelProgress/);assert.match(js,/RECOVERY/);assert.match(css,/sf-xp-track/);});

test('Worker room exposes only reported StarNet run identity and capabilities',()=>{assert.match(js,/runId=run\?\.id\|\|run\?\.runId/);assert.match(js,/startedAt=run\?\.startedAt\|\|run\?\.createdAt/);assert.match(js,/capabilities=Array\.isArray\(w\.capabilities\)/);assert.match(js,/CAPABILITIES NOT REPORTED/);assert.match(js,/NO ACTIVE RUN/);});


test('Worker room exposes a read-only governed activity timeline',()=>{assert.match(js,/sf-room-activity/);assert.match(js,/activeRuns/);assert.match(js,/recentTasks/);assert.match(js,/updatedAt\|\|task\.createdAt/);assert.match(js,/LIVE ACTIVITY/);assert.doesNotMatch(js,/method\s*:\s*['"]POST/);assert.match(css,/sf-activity-row/);});

test('Worker RPG telemetry is derived by the governed feed',()=>{
  const http=fs.readFileSync(new URL('../sidecar/governance/http.mjs',import.meta.url),'utf8');
  assert.match(http,/const xp = Math\.max\(0, \(completed \* 100\) - \(failed \* 50\) - \(blocked \* 25\)\)/);
  assert.match(http,/xpProgressPercent/);
  assert.match(http,/recovery: failed >= 3 \|\| blocked >= 2/);
  assert.match(js,/performance\.xp/);
  assert.match(js,/performance\.level/);
  assert.match(js,/performance\.xpProgressPercent/);
  assert.doesNotMatch(js,/completed\*100.*failed\*50.*blocked\*25/);
});
