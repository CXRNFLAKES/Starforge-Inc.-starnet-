#!/usr/bin/env node
/* Live Windows input-isolation proof.

   Usage:
     node scripts/qa/input-isolation-smoke.mjs --url http://127.0.0.1:5173/?smoke

   The target server must already be running. This drives a pointer-lock FPS through StarNet's
   browser.test_* substrate only. A separate read-only Win32 observer samples GetClipCursor,
   GetCursorPos, and GetLastInputInfo throughout. The observer never moves or releases input. */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const browserModule = await import('../../sidecar/tools/builtin/browser.js');
const makeBrowserTools = browserModule.makeBrowserTools || (browserModule.default && browserModule.default.makeBrowserTools);

const argv = process.argv.slice(2);
const arg = (name, fallback = '') => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const url = arg('--url');
if (!url) {
  console.error('usage: node scripts/qa/input-isolation-smoke.mjs --url http://127.0.0.1:<port>/?smoke');
  process.exit(2);
}
const cdpPort = Number(arg('--cdp-port', '0'));
const monitorMs = Math.max(3000, Number(arg('--monitor-ms', '8000')) || 8000);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const PS_MONITOR = String.raw`
$MaxDurationMs=[int]$env:STARNET_INPUT_MAX_MS
Add-Type @"
using System;
using System.Runtime.InteropServices;
public struct SNPoint { public int X; public int Y; }
public struct SNRect { public int Left; public int Top; public int Right; public int Bottom; }
public struct SNLastInput { public uint cbSize; public uint dwTime; }
public static class SNInputObserve {
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out SNPoint p);
  [DllImport("user32.dll")] public static extern bool GetClipCursor(out SNRect r);
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref SNLastInput i);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
}
"@
function Sample {
  $p=New-Object SNPoint; $r=New-Object SNRect; $li=New-Object SNLastInput
  $li.cbSize=[Runtime.InteropServices.Marshal]::SizeOf($li)
  [SNInputObserve]::GetCursorPos([ref]$p)|Out-Null
  [SNInputObserve]::GetClipCursor([ref]$r)|Out-Null
  [SNInputObserve]::GetLastInputInfo([ref]$li)|Out-Null
  return @{x=$p.X;y=$p.Y;clip=@($r.Left,$r.Top,$r.Right,$r.Bottom);last=[uint32]$li.dwTime}
}
$vx=[SNInputObserve]::GetSystemMetrics(76);$vy=[SNInputObserve]::GetSystemMetrics(77)
$vw=[SNInputObserve]::GetSystemMetrics(78);$vh=[SNInputObserve]::GetSystemMetrics(79)
$base=Sample;$clock=[Diagnostics.Stopwatch]::StartNew();$samples=0;$confined=0;$moved=0;$lastChanged=$false
$confinedRects=New-Object System.Collections.ArrayList
$bc=$base.clip
$baselineConfined=(($bc[0]-gt$vx)-or($bc[1]-gt$vy)-or($bc[2]-lt($vx+$vw))-or($bc[3]-lt($vy+$vh)))
[Console]::Out.WriteLine('READY '+(@{confined=$baselineConfined;clip=$base.clip;position=@($base.x,$base.y);last=$base.last;screen=@($vx,$vy,$vw,$vh)}|ConvertTo-Json -Compress));[Console]::Out.Flush()
while(($clock.ElapsedMilliseconds -lt $MaxDurationMs) -and -not (Test-Path -LiteralPath $env:STARNET_INPUT_STOP_FILE)){
  $s=Sample;$samples++;$c=$s.clip
  if(($c[0]-gt$vx)-or($c[1]-gt$vy)-or($c[2]-lt($vx+$vw))-or($c[3]-lt($vy+$vh))){$confined++;if($confinedRects.Count-lt 12){[void]$confinedRects.Add(@($clock.ElapsedMilliseconds,$c[0],$c[1],$c[2],$c[3]))}}
  if(($s.x-ne$base.x)-or($s.y-ne$base.y)){$moved++}
  if($s.last-ne$base.last){$lastChanged=$true}
  Start-Sleep -Milliseconds 5
}
$final=Sample;$fc=$final.clip
if(($fc[0]-gt$vx)-or($fc[1]-gt$vy)-or($fc[2]-lt($vx+$vw))-or($fc[3]-lt($vy+$vh))){$confined++;if($confinedRects.Count-lt 12){[void]$confinedRects.Add(@($clock.ElapsedMilliseconds,$fc[0],$fc[1],$fc[2],$fc[3]))}}
if((($final.x-ne$base.x)-or($final.y-ne$base.y))-and($moved-eq 0)){$moved++}
if($final.last-ne$base.last){$lastChanged=$true}
[Console]::Out.Write((@{samples=$samples;elapsedMs=$clock.ElapsedMilliseconds;confinedSamples=$confined;confinedRects=@($confinedRects);baseline=@($base.x,$base.y);baselineClip=$base.clip;final=@($final.x,$final.y);positionChangedSamples=$moved;lastInputChanged=$lastChanged;screen=@($vx,$vy,$vw,$vh);finalClip=$final.clip}|ConvertTo-Json -Compress))
`;

function startObserver() {
  if (process.platform !== 'win32') return { ready: Promise.resolve(), stop() {}, done: Promise.resolve({ skipped: true, platform: process.platform }) };
  const stopFile = join(tmpdir(), 'starnet-input-observer-stop-' + process.pid + '-' + Date.now());
  try { rmSync(stopFile, { force: true }); } catch {}
  const exe = process.env.SystemRoot ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
  const child = spawn(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_MONITOR], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { STARNET_INPUT_MAX_MS: String(Math.max(60000, monitorMs * 12)), STARNET_INPUT_STOP_FILE: stopFile }) });
  let out = '', err = '', readyResolve, readyReject, readySeen = false;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const readyTimer = setTimeout(() => readyReject(new Error('cursor observer did not become ready: ' + err.slice(-500))), 30000);
  child.stdout.on('data', b => { out += b.toString(); const m = /^READY (\{[^\r\n]*\})\r?\n/.exec(out); if (m && !readySeen) { readySeen = true; clearTimeout(readyTimer); try { readyResolve(JSON.parse(m[1])); } catch (e) { readyReject(new Error('cursor observer returned invalid baseline: ' + m[1])); } } });
  child.stderr.on('data', b => { err += b.toString(); });
  child.on('error', readyReject);
  const done = new Promise((resolve, reject) => child.on('close', code => {
    clearTimeout(readyTimer);
    try { rmSync(stopFile, { force: true }); } catch {}
    if (!/^READY \{[^\r\n]*\}\r?\n/.test(out)) readyReject(new Error('cursor observer exited before ready: ' + (err || ('exit ' + code))));
    if (code !== 0) return reject(new Error('cursor observer failed: ' + (err || ('exit ' + code))));
    try { resolve(JSON.parse(out.replace(/^READY \{[^\r\n]*\}\r?\n/, '').trim())); } catch (e) { reject(new Error('cursor observer returned invalid JSON: ' + out.slice(-500))); }
  }));
  return { ready, stop() { try { writeFileSync(stopFile, 'stop\n', { flag: 'wx' }); } catch {} }, done };
}

async function until(fn, label, tries = 50) {
  for (let i = 0; i < tries; i++) { const v = await fn(); if (v) return v; await sleep(100); }
  throw new Error('timed out waiting for ' + label);
}

async function launchDedicatedCdpBrowser(port) {
  const configured = process.env.STARNET_CHROME;
  const candidates = [
    configured,
    process.platform === 'win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : null,
    process.platform === 'win32' ? 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' : null,
    'chromium',
    'google-chrome'
  ].filter(Boolean);
  const profileDir = join(tmpdir(), 'starnet-input-cdp-' + process.pid + '-' + Date.now());
  const browserPath = candidates.find(p => {
    if (p.includes('\\') || p.includes('/')) {
      try { return existsSync(p); } catch (_) { return false; }
    }
    return true;
  });
  if (!browserPath) throw new Error('No Chromium runtime found for the dedicated input-isolation CDP harness');
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-blink-features=AutomationControlled',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=' + port,
    '--remote-allow-origins=*',
    '--user-data-dir=' + profileDir,
    'about:blank'
  ];
  const proc = spawn(browserPath, args, { windowsHide: true, stdio: 'ignore' });
  try {
    await until(async () => {
      try {
        const r = await fetch('http://127.0.0.1:' + port + '/json/version');
        return r.ok;
      } catch (_) { return false; }
    }, 'dedicated CDP endpoint on port ' + port, 80);
    return { proc, profileDir, browserPath };
  } catch (e) {
    try { if (proc && !proc.killed) proc.kill('SIGKILL'); } catch (_) {}
    try { rmSync(profileDir, { recursive: true, force: true }); } catch (_) {}
    throw e;
  }
}

const observer = startObserver();
const baseline = await observer.ready;
if (baseline && baseline.confined) { observer.stop(); await observer.done; throw new Error('refusing to start input-isolation proof: cursor was already confined by another foreground app: ' + JSON.stringify(baseline)); }
let dedicatedBrowser = null;
if (cdpPort > 0) dedicatedBrowser = await launchDedicatedCdpBrowser(cdpPort);
const browser = makeBrowserTools({ allowVisible: false, forceHeadless: true, syntheticInputOnly: true, networkProxy: false, cdpPort, profileDir: join(tmpdir(), 'starnet-input-proof-' + process.pid + '-' + Date.now()), cleanupProfile: true });
const tool = name => browser.tools.find(t => t.name === name);
const evaluate = async expression => browser.session.testEval(expression);
const input = async action => tool('browser.test_input').run(action, {});

async function ensureFpsHarness() {
  return evaluate(`(() => {
    const existing = !!document.querySelector('#deploy') && !!document.querySelector('canvas');
    if (existing) return { existing: true };
    const root = document.createElement('main');
    root.id = 'starforge-input-isolation-fixture';
    root.innerHTML = \`
      <style>
        #starforge-input-isolation-fixture{position:fixed;inset:0;background:#050505;color:#fff;font:16px sans-serif;display:grid;place-items:center;z-index:2147483647}
        #starforge-input-isolation-fixture canvas{width:720px;height:420px;background:#111;display:block}
        #starforge-input-isolation-fixture button{margin-top:12px;padding:10px 18px}
        #starforge-input-isolation-fixture #pause-screen{display:none}
        #starforge-input-isolation-fixture #pause-screen.visible{display:block}
        #starforge-input-isolation-fixture #hud{display:block}
      </style>
      <section>
        <canvas id="starforge-input-canvas" width="720" height="420" tabindex="0"></canvas>
        <button id="deploy" type="button">DEPLOY</button>
        <div id="hud">HUD</div>
        <div id="pause-screen"><button id="resume" type="button">RESUME</button></div>
        <div id="stance">READY</div>
      </section>\`;
    document.body.appendChild(root);
    const canvas = root.querySelector('canvas');
    const deploy = root.querySelector('#deploy');
    const pause = root.querySelector('#pause-screen');
    const hud = root.querySelector('#hud');
    const resume = root.querySelector('#resume');
    deploy.addEventListener('click', () => canvas.requestPointerLock());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      pause.classList.toggle('visible', !locked);
      hud.classList.toggle('hidden', !locked);
    });
    resume.addEventListener('click', () => canvas.requestPointerLock());
    return { existing: false, fixture: true };
  })()`);
}

let proof, ownedCdpPort = null;
const runStarted = Date.now();
try {
  if (dedicatedBrowser) await browser.session.attach(cdpPort);
  await tool('browser.test_navigate').run({ url, local: true }, {});
  ownedCdpPort = browser.session.attachedPort();
  await ensureFpsHarness();
  await until(() => evaluate(`!!document.querySelector('#deploy') && !!document.querySelector('canvas')`), 'FPS runtime readiness', 100);
  const initialState = await browser.session.testState('#deploy');
  const initialElement = initialState && initialState.element;
  const initial = {
    synthetic: !!(initialState && initialState.syntheticReady),
    tamperResistant: !!(initialState && initialState.isolation && initialState.isolation.tamperResistant),
    fullscreenResistant: !!(initialState && initialState.isolation && initialState.isolation.fullscreenResistant),
    wakeNeutralized: !!(initialState && initialState.isolation && initialState.isolation.wakeNeutralized),
    deploy: !!(initialElement && initialElement.exists),
    rect: initialElement && initialElement.visible ? await evaluate(`(() => { const b=document.querySelector('#deploy'); const r=b&&b.getBoundingClientRect(); return r&&{x:r.x+r.width/2,y:r.y+r.height/2}; })()`) : null
  };
  await evaluate(`(() => {
    window.__STARNET_PROOF_MOVES__=[];
    document.addEventListener('mousemove',e=>window.__STARNET_PROOF_MOVES__.push([e.movementX,e.movementY]),{capture:true});
    return true;
  })()`);
  if (!initial.synthetic || !initial.tamperResistant || !initial.fullscreenResistant || !initial.wakeNeutralized || !initial.deploy || !initial.rect) throw new Error('FPS deploy/isolation state unavailable: ' + JSON.stringify(initial));
  await evaluate(`document.documentElement.requestFullscreen()`);
  await until(() => evaluate(`document.fullscreenElement===document.documentElement`), 'logical fullscreen');
  await evaluate(`document.exitFullscreen()`);
  await until(() => evaluate(`document.fullscreenElement===null`), 'logical fullscreen exit');
  await input({ action: 'click', x: initial.rect.x, y: initial.rect.y });
  await until(() => evaluate(`document.pointerLockElement?.tagName === 'CANVAS'`), 'synthetic pointer lock');
  await input({ action: 'key_down', key: 'KeyW' }); await input({ action: 'key_down', key: 'ShiftLeft' }); await sleep(350);
  await input({ action: 'mouse_move', dx: 220, dy: -35 }); await input({ action: 'mouse_down', x: 720, y: 450, button: 'right' }); await sleep(150);
  await input({ action: 'mouse_up', x: 720, y: 450, button: 'right' }); await input({ action: 'click', x: 720, y: 450, button: 'left' }); await input({ action: 'key_press', key: 'KeyR' });
  await input({ action: 'key_up', key: 'ShiftLeft' }); await input({ action: 'key_up', key: 'KeyW' });
  const activePage = await evaluate(`({locked:document.pointerLockElement?.tagName==='CANVAS',stance:document.querySelector('#stance')?.textContent||'',hud:!document.querySelector('#hud')?.classList.contains('hidden'),moves:window.__STARNET_PROOF_MOVES__||[]})`);
  const activeState = await browser.session.testState(null);
  const active = { ...activePage, synthetic: !!(activeState && activeState.syntheticReady) };
  if (!active.locked || !active.synthetic || !active.hud) throw new Error('FPS active state was not proven: ' + JSON.stringify(active));
  if (!active.moves.some(m => m[0] === 220 && m[1] === -35)) throw new Error('relative synthetic mouse event was not observed: ' + JSON.stringify(active.moves));
  await input({ action: 'key_press', key: 'Escape' }); await until(() => evaluate(`document.pointerLockElement === null`), 'synthetic unlock');
  const paused = await evaluate(`document.querySelector('#pause-screen')?.classList.contains('visible') === true`);
  if (!paused) throw new Error('FPS pause state was not proven after logical pointer unlock');
  const resume = await evaluate(`(() => { const b=document.querySelector('#resume'); const r=b&&b.getBoundingClientRect(); return r&&{x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  if (!resume) throw new Error('FPS resume control was not found');
  await input({ action: 'click', x: resume.x, y: resume.y }); await until(() => evaluate(`document.pointerLockElement?.tagName === 'CANVAS'`), 'synthetic resume lock');
  proof = { initial, active, paused, resumed: true };
} finally {
  await browser.session.close();
  if (dedicatedBrowser) {
    try { if (dedicatedBrowser.proc && !dedicatedBrowser.proc.killed) dedicatedBrowser.proc.kill('SIGKILL'); } catch (_) {}
    try { rmSync(dedicatedBrowser.profileDir, { recursive: true, force: true }); } catch (_) {}
  }
  await sleep(250);
  observer.stop();
}
const runElapsedMs = Date.now() - runStarted;
const cursor = await observer.done;
if (!cursor.skipped && cursor.elapsedMs + 250 < runElapsedMs) throw new Error('cursor observer did not cover the full FPS sequence: ' + JSON.stringify({ runElapsedMs, observerElapsedMs: cursor.elapsedMs, monitorMs }));
if (!cursor.skipped && cursor.confinedSamples !== 0) throw new Error('GetClipCursor changed during synthetic FPS run: ' + JSON.stringify(cursor));
if (!cursor.skipped && JSON.stringify(cursor.finalClip) !== JSON.stringify([cursor.screen[0], cursor.screen[1], cursor.screen[0] + cursor.screen[2], cursor.screen[1] + cursor.screen[3]])) throw new Error('GetClipCursor was not fully released after browser exit: ' + JSON.stringify(cursor));
if (!cursor.skipped && cursor.lastInputChanged) throw new Error('hands-off cursor proof is inconclusive because Windows reported real input during the run: ' + JSON.stringify(cursor));
if (!cursor.skipped && cursor.positionChangedSamples !== 0) throw new Error('GetCursorPos changed during the hands-off synthetic FPS run: ' + JSON.stringify(cursor));
console.log('INPUT_ISOLATION_OK');
console.log(JSON.stringify({ url, ownedCdpPort, proof, cursor, runElapsedMs, monitorMs, positionStable: cursor.skipped ? null : true }, null, 2));
