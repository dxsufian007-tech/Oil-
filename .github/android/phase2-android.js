// Oli Phase 2 on REAL Android (emulator, the actual APK and its WebView): the pump / valve / bottleneck simulation runs inside the app's own
// engine, the panels render, and Android's input system taps the pump. The page is read over DevTools; the layout is built through the core.
const CDP = require('chrome-remote-interface');
const { execSync } = require('child_process');
const fs = require('fs');
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; let fails = 0;
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };
(async () => {
  const targets = await CDP.List({ port: 9222 }); const t = targets.find(x => x.type === 'page'); if (!t) { console.log('FAIL no WebView page'); process.exit(0); }
  const client = await CDP({ port: 9222, target: t, local: true }); const { Runtime } = client; await Runtime.enable();
  const errors = [];
  Runtime.exceptionThrown(e => errors.push('exception: ' + (e.exceptionDetails.exception && e.exceptionDetails.exception.description || e.exceptionDetails.text)));
  Runtime.consoleAPICalled(e => { if (e.type === 'error') errors.push(e.type + ': ' + e.args.map(a => a.value || a.description).join(' ')); });
  const ev = async expr => { const r = await Runtime.evaluate({ expression: '(async () => { ' + expr + ' })()', awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  await sleep(1000);
  const env = await ev("return { dpr: devicePixelRatio, w: innerWidth, h: innerHeight, ua: navigator.userAgent };"); console.log('ENV ' + JSON.stringify(env));
  // scene: well(large) -> main pipe -> tank, straight; pump on the pipe; valve further on
  const L0 = await ev(`const v = window.__v2, g = v.game; g.s.cash = 1e7; g.s.tutorialDone = true; OliCore.CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    g.s.regions.forEach(r => r.unlocked = true); for (const a of g.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
    for (const L of g.lines.slice()) for (const k of L.cells.slice()) g.removeAt(k % 140, (k / 140) | 0); for (const b of g.buildings.slice()) g.removeAt(b.x, b.y);
    for (let y = 22; y < 60; y++) for (let x = 32; x < 90; x++) { if (!g.canPlace('well', x, y).ok || !g.canPlace('tank', x + 40, y).ok) continue;
      const w = g.place('well', x, y, 'large').building, t = g.place('tank', x + 40, y).building; const r = g.routeNodes('B' + w.id, 'B' + t.id, 1); if (!r.ok) { g.removeAt(w.x, w.y); g.removeAt(t.x, t.y); continue; }
      const L = g.buildLine(r).line; for (let i = 0; i < 100; i++) g.step(.1); const c = L.cells, N = c.length;
      const p = g.place('pump', c[12] % 140, (c[12] / 140) | 0, undefined, 0); if (!p.ok) return { err: 'pump ' + p.reason };
      v.view.scene.paintGround(true); return { W: w.id, T: t.id, L: L.id, cells: c, N, pump: p.building.id, px: p.building.x, py: p.building.y }; } return null;`);
  if (!L0 || L0.err) { check('0. scene', false, JSON.stringify(L0)); process.exit(0); }
  const sim = s => ev(`const g = window.__v2.game; for (let i = 0; i < ${s * 10}; i++) g.step(.1); return 1;`);
  const snap = () => ev(`const g = window.__v2.game, o = ${JSON.stringify({ N: L0.N, p: L0.pump, T: L0.T })}, c = g.lines.flatMap(L => L.cells), p = g.buildings.find(b => b.id === o.p), t = g.buildings.find(b => b.id === o.T); const ph = g.pumpHyd(p);
    return { flow: g.net.flowK[${L0.cells[L0.N - 6]}], tank: t.amt, state: ph.state, boost: ph.boost, kw: ph.kw, pin: ph.pressureIn, pout: ph.pressureOut, warn: g.warnings.map(w => w.code) };`);
  await sim(40); const a = await snap();
  check('1. Pump ON: RUNNING, pressure boost > 1 bar, oil flows', a.state === 'RUNNING' && a.boost > 1 && a.flow > 5, JSON.stringify(a));
  await ev(`const g = window.__v2.game; g.setPumpEnabled(g.buildings.find(b => b.id === ${L0.pump}), false); return 1;`); await sim(40); const b = await snap();
  check('2. Pump OFF: state OFF, boost 0, 0 kW, flow falls', b.state === 'OFF' && b.boost === 0 && b.kw === 0 && b.flow < a.flow - 1, 'flow ' + a.flow.toFixed(1) + ' -> ' + b.flow.toFixed(1));
  await ev(`const g = window.__v2.game; g.setPumpEnabled(g.buildings.find(b => b.id === ${L0.pump}), true); g.setValve(${L0.cells[L0.N - 14]}, 1); return 1;`); await sim(40); const c = await snap();
  check('3. Pump ON again + valve OPEN: flow restored', c.state === 'RUNNING' && c.flow > b.flow + 1, 'flow ' + c.flow.toFixed(1));
  await ev(`window.__v2.game.setValve(${L0.cells[L0.N - 14]}, 3); return 1;`); await sim(30); const d = await snap(); const t1 = d.tank; await sim(20); const d2 = await snap();
  check('4. Valve CLOSED: flow after the valve exactly 0, tank frozen, VALVE_CLOSED warning, pump stops', d.flow === 0 && Math.abs(d2.tank - t1) < 1e-9 && d.warn.includes('VALVE_CLOSED') && d.state === 'STOPPED', JSON.stringify(d));
  await ev(`window.__v2.game.setValve(${L0.cells[L0.N - 14]}, 1); const g = window.__v2.game; for (let i = 0; i < 12; i++) g.pipeType[${JSON.stringify(L0.cells)}[i]] = 0; g.rebuildNetwork(); return 1;`); await sim(60); const e = await snap();
  const util = await ev(`const g = window.__v2.game, L = g.lineAt(${L0.cells[3]}); return { util: L.util, status: L.status };`);
  check('5. Small pipe bottleneck: utilisation = flow/capacity = 100%, status BOTTLENECK, warning', util.status === 'bottleneck' && util.util > 0.95 && e.warn.includes('BOTTLENECK'), JSON.stringify(util));
  await ev(`const g = window.__v2.game; g.areas[g.buildings.find(b => b.id === ${L0.W}).area].remaining = 0; g.hyd.dirty = true; return 1;`); await sim(40); const f = await snap();
  check('6. Well depleted: pump STARVED, flow 0, 0 kW, PUMP_STARVED warning', f.state === 'STARVED' && f.flow === 0 && f.kw === 0 && f.warn.includes('PUMP_STARVED'), JSON.stringify(f));
  // numerical safety on the device engine
  const safe = await ev(`const g = window.__v2.game; let bad = 0; for (let i = 0; i < 300; i++) { g.step(.1); for (const b of g.buildings) for (const k of ['amt', 'out', 'flow', 'kw', 'boost']) if (b[k] != null && (!Number.isFinite(b[k]) || b[k] < -1e-9)) bad++; } for (let k = 0; k < g.pipe.length; k++) if (!(g.net.flowK[k] >= 0) || !Number.isFinite(g.net.pressK[k])) bad++; return bad;`);
  check('7. No NaN / Infinity / negative flow or inventory (300 steps, whole network)', safe === 0, 'bad values ' + safe);
  // save / load on the device
  const sl = await ev(`const g = window.__v2.game, p = g.buildings.find(b => b.id === ${L0.pump}); g.setPumpEnabled(p, false); g.setValve(${L0.cells[L0.N - 14]}, 3); const d = JSON.parse(JSON.stringify(g.serialize())); const h = new OliCore.Game({ seed: 7 }); h.load(d); const q = h.buildings.find(b => b.type === 'pump'); return { en: q.enabled, valve: h.valve[${L0.cells[L0.N - 14]}] };`);
  check('8. Save/Load: pump OFF and valve CLOSED restored', sl.en === false && sl.valve === 3, JSON.stringify(sl));
  await ev(`const g = window.__v2.game, p = g.buildings.find(b => b.id === ${L0.pump}); g.setPumpEnabled(p, true); g.setValve(${L0.cells[L0.N - 14]}, 1); g.areas[g.buildings.find(b => b.id === ${L0.W}).area].remaining = 1e9; g.hyd.dirty = true; return 1;`); await sim(30);
  // a REAL Android tap on the pump opens its panel; frame time with the panel open
  await ev("window.__lt = null; document.addEventListener('pointerdown', e => { window.__lt = { x: e.clientX, y: e.clientY }; }, true); return 1;");
  const scr = sh('adb shell wm size').match(/(\d+)x(\d+)/), SW = +scr[1], SH = +scr[2], cx = Math.round(SW / 2), cy = Math.round(SH * .3);
  let lt = null; for (let i = 0; i < 6 && !lt; i++) { sh('adb shell input tap ' + cx + ' ' + cy); await sleep(800); lt = await ev('return window.__lt;'); }
  const dpr = env.dpr, off = lt ? { x: cx / dpr - lt.x, y: cy / dpr - lt.y } : { x: 0, y: 0 };
  const pos = await ev(`const v = window.__v2, c = v.tc(${L0.px}, ${L0.py}); v.view.cam.centerOn(c.x, c.y + 150 / v.view.cam.zoom); v.camApi.clamp(); await new Promise(r => setTimeout(r, 400)); return v.camApi.w2s(c.x, c.y - 10);`);
  sh('adb shell input tap ' + Math.round((pos.x + off.x) * dpr) + ' ' + Math.round((pos.y + off.y) * dpr)); await sleep(1000);
  const pn = await ev("return { hidden: document.querySelector('#panel').hidden, title: document.querySelector('#pn-title').textContent, rows: [...document.querySelectorAll('#pn-rows li small')].map(e => e.textContent), btns: [...document.querySelectorAll('#pn-btns button')].length };");
  check('9. Real Android tap on the pump opens its panel (status, flow, pressure in/out, boost, head, cost + buttons)', !pn.hidden && /^مضخة #/.test(pn.title) && pn.rows.length >= 8 && pn.btns >= 3, JSON.stringify(pn));
  try { fs.writeFileSync('results/p2-pump-panel.png', execSync('adb exec-out screencap -p')); } catch (x) {}
  const ft = await ev(`const t = []; let last = performance.now(); await new Promise(res => { const f = n => { t.push(n - last); last = n; if (t.length < 90) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); t.sort((a, b) => a - b); return { median: t[45], p95: t[85], max: t[89] };`);
  check('10. Frame time with the pump panel open and oil moving (emulator: software GPU, not representative)', ft.median < 200, JSON.stringify(ft));
  await sleep(500); check('11. no JavaScript errors in the WebView', errors.length === 0, errors.slice(0, 4).join(' | ') || 'none');
  fs.writeFileSync('results/phase2.json', JSON.stringify({ env, fails, results }, null, 1)); console.log('SUMMARY ' + (results.length - fails) + '/' + results.length + ' PASS');
  await client.close(); process.exit(0);
})().catch(e => { console.log('FAIL crashed: ' + e.message); try { fs.writeFileSync('results/crash-p2.txt', String(e.stack)); } catch (x) {} process.exit(0); });
