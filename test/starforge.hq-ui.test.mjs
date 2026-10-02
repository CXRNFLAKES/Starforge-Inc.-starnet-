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