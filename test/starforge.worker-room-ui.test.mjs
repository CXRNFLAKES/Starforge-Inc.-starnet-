import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const hq=fs.readFileSync(new URL('../frontend/app/windows/starforge-hq.js',import.meta.url),'utf8');const index=fs.readFileSync(new URL('../frontend/index.html',import.meta.url),'utf8');const css=fs.readFileSync(new URL('../frontend/css/starforge-hq.css',import.meta.url),'utf8');
test('StarForge worker room reuses StarNet UI and real station dossiers',()=>{assert.match(hq,/registerWindow\('starforge-worker-room'/);assert.match(hq,/StationUI\.present/);assert.match(hq,/StationUI\.openAgent/);assert.match(hq,/\/api\/starforge\/governance/);assert.match(index,/data-term="starforge-worker-room"/);});
test('worker room stays mobile safe and does not invent workers',()=>{assert.match(css,/sf-worker-room-win/);assert.match(css,/max-width:720px/);assert.match(hq,/No governed StarNet workers exposed/);});

test("StarForge worker room renders governed worker RPG progression",()=>{
  assert.match(hq,/performance\.xp/);
  assert.match(hq,/performance\.level/);
  assert.match(hq,/performance\.xpProgressPercent/);
  assert.match(hq,/sf-worker-xp/);
});
