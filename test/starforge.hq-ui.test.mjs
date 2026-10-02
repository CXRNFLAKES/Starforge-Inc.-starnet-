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
