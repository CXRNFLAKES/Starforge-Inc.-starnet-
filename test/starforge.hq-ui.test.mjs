import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const hq=fs.readFileSync(new URL('../frontend/app/windows/starforge-hq.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../frontend/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../frontend/css/starforge-hq.css',import.meta.url),'utf8');

test('StarForge HQ is mounted inside the existing StarNet UI',()=>{
  assert.match(hq,/StationUI\.registerWindow\(\s*['"]starforge-hq['"]/);
  assert.match(index,/css\/starforge-hq\.css/);
  assert.match(index,/app\/windows\/starforge-hq\.js/);
  assert.match(index,/data-term="starforge-hq"/);
  assert.ok(index.indexOf('app/windows/starforge-hq.js')>index.indexOf('app/stationui.js'));
  assert.ok(index.indexOf('app/windows/starforge-hq.js')<index.indexOf('app/app.js'));
  assert.match(css,/@media\(max-width:720px\)/);
});

test('StarForge HQ does not invent capital or worker status',()=>{
  assert.match(hq,/Finance bridge not connected/);
  assert.match(hq,/\[100,10000000\]/);
  assert.match(hq,/StationUI\.present/);
  assert.match(hq,/StationUI\.isAgentRunning/);
});

test('StarForge HQ capital source is the governed company ledger',async()=>{
  const { makeCompany }=await import('../sidecar/governance/company.mjs');
  const { ROLES }=await import('../sidecar/governance/roles.mjs');
  const company=makeCompany();
  company.recordFinanceEntry(ROLES.CHO,{id:'capital',kind:'capital-injection',amount:100000,currency:'EUR'});
  company.recordFinanceEntry(ROLES.CHO,{id:'tax',kind:'tax-reserve',amount:10000,currency:'EUR'});
  const capital = company.capitalSnapshot(ROLES.CHO);
  assert.equal(capital.cash, 90000);
  assert.equal(capital.taxReserve, 10000);
  assert.equal(capital.availableCash, 90000);
  assert.equal(capital.netOperatingCapital, 90000);
});

test('StarForge HQ consumes governed worker activity without replacing StarNet roster ownership',()=>{
  assert.match(hq,/fetch\('\/api\/starforge\/governance'/);
  assert.match(hq,/governance\?\.workforce\?\.workers/);
  assert.match(hq,/activeRun/);
  assert.match(hq,/status==='working'/);
});


test('StarForge HQ HUD is presentation-only and keeps governed feed semantics',()=>{
  const css=fs.readFileSync(new URL('../frontend/css/starforge-hq.css',import.meta.url),'utf8');
  assert.match(css,/Retro-game HQ HUD/);
  assert.match(css,/sf-execution-stats/);
  assert.match(hq,/\/api\/starforge\/governance/);
  assert.match(hq,/netOperatingCapital/);
  assert.match(hq,/recentTasks/);
});


test('StarForge HQ keeps its retro HUD presentation separate from governed values',()=>{
  const css=fs.readFileSync(new URL('../frontend/css/starforge-hq.css',import.meta.url),'utf8');
  assert.match(css,/RETRO HQ HUD/);
  assert.match(css,/sf-execution-stats/);
  assert.match(css,/sf-worker:hover/);
});

test('StarForge HQ renders governed finance telemetry without inventing values',()=>{
  assert.match(hq,/data-fin="cash"/);
  assert.match(hq,/data-fin="tax"/);
  assert.match(hq,/data-fin="liabilities"/);
  assert.match(hq,/data\?\.finance\?\.recentEntries/);
  assert.match(hq,/capital\.availableCash/);
  assert.match(hq,/capital\.taxReserve/);
  assert.match(hq,/capital\.liabilities/);
});

test('StarForge HQ renders only the bounded governed finance telemetry feed',()=>{
  assert.match(hq,/finance\?\.recentEntries/);
  assert.doesNotMatch(hq,/company\?\.finance\?\.entries/);
});


test('StarForge HQ renders governed mission and project state read-only',()=>{
  assert.match(hq,/data-mission="title"/);
  assert.match(hq,/data-mission="objective"/);
  assert.match(hq,/company\?\.projects/);
  assert.match(hq,/projects\.slice\(-5\)/);
  assert.match(hq,/Mission Control/i);
});


test('mobile test endpoint derives company level from governed capital',()=>{
  const script=fs.readFileSync(new URL('../scripts/starforge-mobile-test.mjs',import.meta.url),'utf8');
  assert.match(script,/companyLevelTelemetry\(capital\.netOperatingCapital\)/);
  assert.match(script,/companyLevel: level\?\.level/);
  assert.doesNotMatch(script,/companyLevel:\s*1,/);
});

test('StarForge HQ consumes governed game-rank telemetry',()=>{assert.match(hq,/levelFeed\.rank/);assert.match(hq,/levelFeed\.level/);assert.match(hq,/levelFeed\.source/);assert.match(hq,/governed-company-ledger/);assert.match(hq,/data-tier/);});

test('StarForge HQ exposes explicit runtime connection state',()=>{
  const http=fs.readFileSync(new URL('../sidecar/governance/http.mjs',import.meta.url),'utf8');
  assert.match(http,/connection:\s*\{/);
  assert.match(http,/runtimeConfigured:\s*Boolean\(runtime\)/);
  assert.match(http,/runtimeMode/);
  assert.match(http,/workforceSource/);
  assert.match(hq,/data-connection-label/);
  assert.match(hq,/runtimeMode==='live-starnet'/);
  assert.match(hq,/STARFORGE LINK · LIVE STARNET/);
  assert.match(hq,/STARFORGE LINK · TEST BRIDGE/);
});

test('StarForge HQ worker performance is derived from governed StarNet tasks',()=>{
  const http=fs.readFileSync(new URL('../sidecar/governance/http.mjs',import.meta.url),'utf8');
  assert.match(http,/performanceByAgent/);
  assert.match(http,/reliabilityPercent/);
  assert.match(http,/performance:/);
  assert.match(hq,/performance\?\.reliabilityPercent/);
  assert.match(hq,/DONE/);
  assert.match(hq,/FAILED/);
  assert.match(hq,/NO TASK HISTORY/);
});

test('StarForge HQ exposes real StarNet runtime identity without inventing worker data',()=>{
  assert.match(hq,/a\.model\|\|'model unavailable'/);
  assert.match(hq,/a\.provider/);
  assert.match(hq,/item\.activeRun/);
  assert.match(hq,/StationUI\.openAgent/);
});

test('StarForge HQ uses the governed workforce feed as its roster authority',()=>{
  assert.match(hq,/governance\?\.workforce\?\.workers/);
  assert.match(hq,/governed workforce feed/);
  assert.match(hq,/worker\.status==='working'/);
  assert.match(hq,/worker\.activeRun/);
});
test('StarForge HQ defers live working status to the existing StarNet UI runtime when available',()=>{assert.match(hq,/StationUI\.isAgentRunning/);assert.match(hq,/runtimeStatus=stationRunning\?'working'/);assert.match(hq,/worker\.status==='working'/);});


test('StarForge HQ progression HUD is derived from governed level telemetry',()=>{
  assert.match(hq,/progressPercent/);
  assert.match(hq,/levelEl\.textContent='LVL '\+String\(levelFeed\.level\)/);
  assert.match(hq,/GROWTH OPERATIONS/);
  assert.match(hq,/LEGENDARY STATUS/);
  assert.match(css,/sf-level-detail/);
  assert.match(css,/sf-unlocks/);
});
test('StarForge HQ consumes backend-governed rank and unlock telemetry',()=>{
  assert.match(hq,/levelFeed\.rank/);
  assert.match(hq,/levelFeed\.unlocks/);
  assert.doesNotMatch(hq,/levelFeed\.level>=100\?'LEGENDARY'/);
  assert.doesNotMatch(hq,/const unlockRows=\[/);
});

test('StarForge HQ exposes the dedicated worker room through the existing StarNet window system',()=>{
  assert.match(hq,/data-open-worker-room/);
  assert.match(hq,/openTerm\('starforge-worker-room'\)/);
  assert.match(index,/css\/starforge-worker-room\.css/);
  const room=fs.readFileSync(new URL('../frontend/app/windows/starforge-worker-room.js',import.meta.url),'utf8');
  assert.match(room,/StationUI\.registerWindow\(\s*['"]starforge-worker-room['"]/);
  assert.match(room,/\/api\/starforge\/governance/);
  assert.match(room,/StarNet owns execution/);
});

test('StarForge worker room exposes read-only per-worker drill-down',()=>{const room=fs.readFileSync(new URL('../frontend/app/windows/starforge-worker-room.js',import.meta.url),'utf8');const css=fs.readFileSync(new URL('../frontend/css/starforge-worker-room.css',import.meta.url),'utf8');assert.match(room,/sf-worker-detail/);assert.match(room,/showDetail\(w,recentTasks\)/);assert.match(room,/worker\?\.activeRun/);assert.match(room,/assigneeId/);assert.match(room,/data-detail-close/);assert.match(css,/sf-worker-detail/);assert.match(css,/@media\(max-width:720px\)/);});


test('StarForge HQ renders governed company gameplay progression',()=>{
  assert.match(hq,/data-sf="company-xp"/);
  assert.match(hq,/data\?\.gameplay\?\.companyXp/);
  assert.match(hq,/data\?\.gameplay\?\.projects/);
  assert.match(hq,/progressPercent/);
  assert.match(hq,/companyXpSource/);
});


test('StarForge HQ renders governed objective progression telemetry',()=>{
  assert.match(hq,/data-mission="objective-progress"/);
  assert.match(hq,/gameplay\?\.objectiveProgress/);
  assert.match(hq,/current\.progressPercent/);
  assert.match(hq,/current\.companyXp/);
});


test('StarForge HQ renders governed objective worker assignment telemetry',()=>{assert.match(hq,/assignedWorkerCount/);assert.match(hq,/WORKERS/);assert.match(hq,/current\.assignedWorkerCount/);assert.match(hq,/project\.assignedWorkerCount/);});


test('StarForge HQ renders governed project and objective outcomes',()=>{assert.match(hq,/current\.outcome\|\|'pending'/);assert.match(hq,/project\.outcome\|\|'pending'/);assert.match(hq,/\.toUpperCase\(\)/);});

test('StarForge HQ renders governed mission activity from the task ledger',()=>{
  const http=fs.readFileSync(new URL('../sidecar/governance/http.mjs',import.meta.url),'utf8');
  assert.match(http,/const activity = tasks\.slice\(-10\)\.reverse\(\)/);
  assert.match(http,/source: "starforge-governed-task-ledger"/);
  assert.match(http,/activity,/);
  assert.match(hq,/data-mission="activity"/);
  assert.match(hq,/gameplay\?\.activity/);
  assert.match(hq,/MISSION ACTIVITY/);
  assert.match(hq,/item\.outcome/);
  assert.match(http,/const xpDelta = status === "completed" \? 100/);
  assert.match(http,/xpDelta,/);
  assert.match(hq,/item\.xpDelta/);
  assert.match(hq,/XP '\+\(Number\(item\.xpDelta\)>0\?/);
});

test('StarForge HQ exposes separate governed mission XP progression without replacing capital level',()=>{
  const http=fs.readFileSync(new URL('../sidecar/governance/http.mjs',import.meta.url),'utf8');
  assert.match(http,/companyXpProgress/);
  assert.match(http,/gameplayLevel/);
  assert.match(http,/xpPerLevel/);
  assert.match(http,/remainingToNext/);
  assert.match(http,/source: "starforge-governed-task-ledger"/);
  assert.match(hq,/data-sf="company-xp-level"/);
  assert.match(hq,/data-sf="company-xp-next"/);
  assert.match(hq,/gameplay\?\.companyXpProgress/);
  assert.match(hq,/xpProgress\.gameplayLevel/);
  assert.match(hq,/xpProgress\.remainingToNext/);
});
test('StarForge HQ exposes governed mission XP milestones and unlock telemetry',()=>{
  const http=fs.readFileSync(new URL('../sidecar/governance/http.mjs',import.meta.url),'utf8');
  assert.match(http,/missionMilestones/);
  assert.match(http,/missionRank/);
  assert.match(http,/missionUnlock/);
  assert.match(http,/nextMilestone/);
  assert.match(http,/milestones: missionMilestones\.map/);
  assert.match(hq,/data-sf="mission-rank"/);
  assert.match(hq,/data-sf="mission-unlock"/);
  assert.match(hq,/xpProgress\.missionRank/);
  assert.match(hq,/xpProgress\?\.nextMilestone/);
});
