// Camera + touch on REAL Android (emulator, Android 14, the actual APK and its WebView).
// One- AND two-finger touches are written to Android's multi-touch input device (sendevent, MT protocol B), so they travel through
// the Android input system exactly like a finger: kernel event -> InputDispatcher -> WebView -> Phaser. The page is only READ over DevTools.
const CDP = require('chrome-remote-interface');
const { execSync } = require('child_process');
const fs = require('fs');
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 24 }).toString();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; let fails = 0;
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + 'TOUCH ' + name + (info ? '  — ' + info : '')); };

(async () => {
  // ---- the multi-touch input device and its coordinate range
  const gp = sh('adb shell getevent -lp');
  const blocks = gp.split(/add device \d+: /).slice(1).map(b => ({ dev: b.split('\n')[0].trim(), body: b }));
  // every multi-touch device (the emulator has one per possible display); the one that reaches the app is found by a calibration tap below
  const mts = blocks.filter(b => /ABS_MT_POSITION_X/.test(b.body) && /ABS_MT_SLOT/.test(b.body)).map(b => ({ dev: b.dev, name: ((b.body.match(/name:\s*"([^"]*)"/) || [])[1] || ''), body: b.body }));
  if (!mts.length) { console.log('FAIL TOUCH no multi-touch input device found\n' + gp.slice(0, 1500)); process.exit(0); }
  const scr = sh('adb shell wm size').match(/(\d+)x(\d+)/), SW = +scr[1], SH = +scr[2];
  console.log('TOUCHDEVS ' + mts.map(m => m.dev + ' ' + m.name).join(' | ') + ' · screen ' + SW + 'x' + SH);
  let mt = null, MX = 0, MY = 0, hasP = false, DEV = '';
  const useDev = m => { mt = m; const max = n => +((m.body.match(new RegExp(n + '\\s*:.*?max (\\d+)')) || [])[1] || 0); MX = max('ABS_MT_POSITION_X'); MY = max('ABS_MT_POSITION_Y'); hasP = /ABS_MT_PRESSURE/.test(m.body); DEV = m.dev; };
  const ax = x => Math.round(x * (MX + 1) / SW), ay = y => Math.round(y * (MY + 1) / SH);
  let nextId = 100; const down = new Map();       // slot -> tracking id
  // one "frame" of finger changes -> [type, code, value] events ending in SYN_REPORT. f = [{ slot, x, y } | { slot, up: true }] in DEVICE px
  const frameEv = f => { const L = [], e = (t, c, v) => L.push([t, c, v]); const wasEmpty = down.size === 0;
    for (const q of f) { e(3, 47, q.slot);
      if (q.up) { e(3, 57, -1); down.delete(q.slot); continue; }
      if (!down.has(q.slot)) { const id = nextId++; down.set(q.slot, id); e(3, 57, id); if (hasP) e(3, 58, 50 + (id % 7)); }
      e(3, 53, ax(q.x)); e(3, 54, ay(q.y)); }
    if (wasEmpty && down.size) e(1, 330, 1); if (!down.size) e(1, 330, 0);
    e(0, 0, 0); return L; };
  // two ways to put several fingers on Android: the emulator's own touch injection (console "event send", the emulated device itself)
  // or writing the kernel input device (sendevent). Whichever reaches the app is used for the two-finger tests.
  let multi = null;
  const sendM = frames => {
    if (multi === 'emu') { for (const f of frames) sh('adb emu event send ' + frameEv(f).map(([t, c, v]) => t + ':' + c + ':' + v).join(' ')); return; }
    const L = []; for (const f of frames) for (const [t, c, v] of frameEv(f)) L.push('sendevent ' + DEV + ' ' + t + ' ' + c + ' ' + (v < 0 ? 4294967295 : v));
    for (let i = 0; i < L.length; i += 120) sh('adb shell "' + L.slice(i, i + 120).join('; ') + '"'); };
  // one finger: Android's input command (input motionevent DOWN / MOVE / UP), the same path the pipe tests use
  let s0down = false;
  const sendS = frames => { const L = []; for (const f of frames) for (const q of f) { if (q.slot !== 0) throw new Error('sendS is one finger only');
    if (q.up) { L.push('input motionevent UP ' + (sendS.last ? sendS.last.x + ' ' + sendS.last.y : '0 0')); s0down = false; continue; }
    L.push('input motionevent ' + (s0down ? 'MOVE ' : 'DOWN ') + q.x + ' ' + q.y); s0down = true; sendS.last = q; }
    for (let i = 0; i < L.length; i += 40) sh('adb shell "' + L.slice(i, i + 40).join('; ') + '"'); };
  const send = sendS;

  // ---- the WebView
  const targets = await CDP.List({ port: 9222 }); const t = targets.find(x => x.type === 'page'); if (!t) { console.log('FAIL TOUCH no WebView page'); process.exit(0); }
  const client = await CDP({ port: 9222, target: t, local: true }); const { Runtime } = client; await Runtime.enable();
  const errors = []; Runtime.exceptionThrown(e => errors.push('exception: ' + (e.exceptionDetails.exception && e.exceptionDetails.exception.description || e.exceptionDetails.text)));
  const ev = async expr => { const r = await Runtime.evaluate({ expression: '(async () => { ' + expr + ' })()', awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const dpr = await ev('return devicePixelRatio;');
  // calibration with this very device: where does a touch at a device pixel land in the page (status bar / insets)
  await ev("window.__lt = null; document.addEventListener('pointerdown', e => { window.__lt = { x: e.clientX, y: e.clientY }; }, true); window.__v2.setTool(null); window.__v2.select(null); return 1;");
  const cx = Math.round(SW / 2), cy = Math.round(SH * .5); let lt = null;
  try { sh('adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS'); } catch (e) {}
  for (let i = 0; i < 8 && !lt; i++) { sendS([[{ slot: 0, x: cx, y: cy }], [{ slot: 0, up: true }]]); await sleep(900); lt = await ev('return window.__lt;'); }
  if (!lt) { try { fs.writeFileSync('results/touch-nocal.png', execSync('adb exec-out screencap -p')); console.log('DIAG focus: ' + sh('adb shell dumpsys window | grep -E "mCurrentFocus|mFocusedApp"').replace(/\n/g, ' | ')); } catch (e) {} console.log('FAIL TOUCH no Android touch reached the WebView (screenshot touch-nocal.png)'); process.exit(0); }
  // which multi-touch path reaches the app: probe with a fresh point each time (identical values would be filtered as "no change")
  const probe = async (i) => { await ev('window.__lt = null; return 1;'); try { sendM([[{ slot: 0, x: cx + 7 * i, y: cy + 5 * i }], [{ slot: 0, up: true }]]); } catch (e) { return 'error ' + String(e.message).split('\n')[0].slice(0, 100); } await sleep(800); return await ev('return window.__lt;'); };
  const order = mts.slice().sort((a, b) => (/_1$/.test(b.name) ? 1 : 0) - (/_1$/.test(a.name) ? 1 : 0));
  useDev(order[0]); multi = 'emu'; let r = await probe(1); console.log('TOUCHPROBE emu (' + DEV + ' range): ' + JSON.stringify(r));
  if (!(r && r.x != null)) { multi = 'sendevent'; for (let i = 0; i < order.length; i++) { useDev(order[i]); down.clear(); r = await probe(i + 2); console.log('TOUCHPROBE sendevent ' + DEV + ' ' + order[i].name + ': ' + JSON.stringify(r)); if (r && r.x != null) break; } }
  if (!(r && r.x != null)) { multi = null; console.log('TOUCH two-finger input could not be injected on this emulator: pinch tests are NOT run here'); }
  else console.log('TOUCH two-finger input via ' + multi + ' (' + DEV + ')');
  await ev("window.__lt = null; return 1;"); for (let i = 0; i < 3 && !(await ev('return window.__lt;')); i++) { sendS([[{ slot: 0, x: cx, y: cy }], [{ slot: 0, up: true }]]); await sleep(700); }
  lt = await ev('return window.__lt;') || lt;
  const off = { x: cx / dpr - lt.x, y: cy / dpr - lt.y }; console.log('TOUCHCAL dpr ' + dpr + ' offset css ' + JSON.stringify(off));
  const D = p => ({ x: Math.round((p.x + off.x) * dpr), y: Math.round((p.y + off.y) * dpr) });     // page css px -> device px
  const C = d => ({ x: d.x / dpr - off.x, y: d.y / dpr - off.y });                                // device px -> page css px (where the finger really is)
  const cam = () => ev('const c = window.__v2.view.cam; return { x: c.scrollX, y: c.scrollY, z: c.zoom };');
  const w = p => ev(`return window.__v2.camApi.s2w(${p.x}, ${p.y});`);
  const state = () => ev('return window.__v2.touch.state;');
  const center = (z, x, y) => ev(`const v = window.__v2, c = v.tc(${x}, ${y}); v.view.cam.setZoom(${z}); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); v.select(null); v.setTool(null); return 1;`);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const L0 = await ev(`const v = window.__v2, g = v.game; g.s.cash = 1e7; OliCore.CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    for (const L of g.lines.slice()) for (const k of L.cells.slice()) g.removeAt(k % 140, (k / 140) | 0); for (const b of g.buildings.slice()) g.removeAt(b.x, b.y);
    for (const a of g.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
    for (let y = 30; y < 60; y++) for (let x = 40; x < 90; x++) { if (!(g.canPlace('well', x, y).ok && g.canPlace('tank', x + 9, y).ok && g.canPlace('tank', x + 4, y + 7).ok)) continue;
      const W = g.place('well', x, y, 'small').building, T = g.place('tank', x + 9, y).building, T2 = g.place('tank', x + 4, y + 7).building; v.view.scene.paintGround(true); return { X: x, Y: y, W: W.id, T: T.id, T2: T2.id }; }`);
  const { X, Y } = L0;

  // 1. PAN 1:1 at several zooms (one finger, moved in steps; after every step the world point first touched must be under the finger)
  for (const z of [0.5, 1.0, 1.5]) {
    await center(z, 70, 44); await sleep(200);
    const s0 = D({ x: 200, y: 420 }); send([[{ slot: 0, ...s0 }]]); await sleep(150); const w0 = await w(C(s0)); let worst = 0;
    for (const [dx, dy] of [[6, 0], [20, 8], [60, 40], [140, 90], [100, 260], [-60, 300]]) { const d = { x: s0.x + dx, y: s0.y + dy }; send([[{ slot: 0, ...d }]]); await sleep(120); worst = Math.max(worst, dist(await w(C(d)), w0) * z); }
    const c1 = await cam(); send([[{ slot: 0, up: true }]]); await sleep(600); const c2 = await cam();
    check('PAN at zoom ' + z + ' follows the finger 1:1', worst < 1.0, 'worst ' + worst.toFixed(3) + ' css px (1 device px = ' + (1 / dpr).toFixed(2) + ')');
    check('PAN at zoom ' + z + ': nothing moves after lifting', c1.x === c2.x && c1.y === c2.y, JSON.stringify([c1, c2]));
  }
  // 2. PAN -> PINCH -> PAN with two real fingers
  if (!multi) check('PINCH on Android (two fingers)', false, 'two-finger input could not be injected on the emulator; checked in the browser only');
  else {
  await center(1, 70, 44); await sleep(200);
  const a0 = D({ x: 140, y: 420 }); sendM([[{ slot: 0, ...a0 }], [{ slot: 0, x: a0.x + 30, y: a0.y }], [{ slot: 0, x: a0.x + 60, y: a0.y }]]); await sleep(200);
  const a1 = { x: a0.x + 60, y: a0.y }, cA = await cam(); const b0 = D({ x: 300, y: 480 }); sendM([[{ slot: 1, ...b0 }]]); await sleep(250); const cB = await cam(), sp = await state();
  check('PAN -> PINCH: the second finger does not move the camera', cA.x === cB.x && cA.y === cB.y && cA.z === cB.z && sp === 'PINCH', 'state ' + sp);
  const m0 = { x: (a1.x + b0.x) / 2, y: (a1.y + b0.y) / 2 }, wm = await w(C(m0)); let drift = 0; const zs = [], rows = [];
  // what the APP saw: the two active Phaser pointers (their midpoint is what the controller zooms about)
  const seen = () => ev('const ps = window.__v2.view.scene.input.manager.pointers.filter(p => p.isDown); return ps.map(p => ({ x: p.x, y: p.y }));');
  const wm2 = await (async () => { const s2 = await seen(); return s2.length === 2 ? await w({ x: (s2[0].x + s2[1].x) / 2, y: (s2[0].y + s2[1].y) / 2 }) : null; })(); let driftApp = 0, offs = 0;
  for (let i = 1; i <= 6; i++) { const a = { x: a1.x - 25 * i, y: a1.y - 15 * i }, b = { x: b0.x + 25 * i, y: b0.y + 15 * i }; sendM([[{ slot: 0, ...a }, { slot: 1, ...b }]]); await sleep(200); const c = await cam(); zs.push(c.z.toFixed(2));
    const d1 = dist(await w(C({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })), wm) * c.z; drift = Math.max(drift, d1);
    const s2 = await seen(); if (s2.length === 2 && wm2) { const mid = { x: (s2[0].x + s2[1].x) / 2, y: (s2[0].y + s2[1].y) / 2 }; driftApp = Math.max(driftApp, dist(await w(mid), wm2) * c.z); const ia = C(a), ib = C(b); offs = Math.max(offs, Math.min(dist(s2[0], ia) + dist(s2[1], ib), dist(s2[0], ib) + dist(s2[1], ia)) / 2); }
    rows.push(d1.toFixed(2)); }
  console.log('PINCHDIAG drift per step (vs the points sent) ' + rows.join(' ') + ' | vs the points the app received: ' + driftApp.toFixed(3) + ' | largest gap between a sent and a received finger position: ' + offs.toFixed(2) + ' css px');
  check('PINCH: the world point under the two fingers (as the app receives them) stays under them', driftApp < 1.0, 'drift ' + driftApp.toFixed(3) + ' css px; zoom ' + zs.join(' '));
  check('PINCH zooms in as the fingers spread', +zs[5] > 1.2, 'zoom ' + zs.join(' ') + ', drift vs the points sent ' + drift.toFixed(2) + ' css px (see PINCHDIAG)');
  const aE = { x: a1.x - 150, y: a1.y - 90 }; const cL = await cam(); sendM([[{ slot: 1, up: true }]]); await sleep(250); const cL2 = await cam(), sp2 = await state();
  check('PINCH -> PAN: lifting the second finger does not move the camera', cL.x === cL2.x && cL.y === cL2.y && sp2 === 'PAN', 'state ' + sp2);
  const seenOne = () => ev('const ps = window.__v2.view.scene.input.manager.pointers.filter(p => p.isDown); return ps.length ? { x: ps[0].x, y: ps[0].y } : null;');
  const pr0 = await seenOne(), wa = pr0 ? await w(pr0) : await w(C(aE)); let dr2 = 0, lag = 0;       // drift is measured against the finger position the APP received (the camera must keep that world point under it); sent-vs-received is reported separately
  for (let i = 1; i <= 4; i++) { const q = { x: aE.x + 40 * i, y: aE.y + 25 * i }; sendM([[{ slot: 0, ...q }]]); await sleep(150); const rp = await seenOne(); if (rp) { dr2 = Math.max(dr2, dist(await w(rp), wa) * cL2.z); const cq = C(q); lag = Math.max(lag, dist(rp, cq)); } }
  sendM([[{ slot: 0, up: true }]]); await sleep(400);
  check('PINCH -> PAN: the remaining finger pans 1:1 from where it is (against the positions the app received)', dr2 < 1.0, 'drift ' + dr2.toFixed(3) + ' css px; input lag sent-vs-received at most ' + lag.toFixed(1) + ' css px (emulator input path)');
  check('PINCH: no tap fired afterwards', (await ev('return window.__v2.ui.sel;')) === null, '');
  }
  // 3. map edge
  await center(1, 0, 0); await sleep(200); const e0 = D({ x: 100, y: 300 }); send([[{ slot: 0, ...e0 }]]); const eds = [];
  for (let i = 1; i <= 8; i++) { send([[{ slot: 0, x: e0.x + 60 * i, y: e0.y + 60 * i }]]); await sleep(100); eds.push(await cam()); }
  const inside = await ev('const v = window.__v2, c = v.view.cam, B = v.view.bounds, a = v.camApi.s2w(0, 0), b = v.camApi.s2w(c.width, c.height); return a.x >= B.x - .01 && a.y >= B.y - .01 && b.x <= B.x + B.w + .01 && b.y <= B.y + B.h + .01;');
  let jmp = 0; for (let i = 1; i < eds.length; i++) jmp = Math.max(jmp, Math.hypot(eds[i].x - eds[i - 1].x, eds[i].y - eds[i - 1].y));
  const top = await cam(); send([[{ slot: 0, x: e0.x + 60 * 7, y: e0.y + 60 * 7 }]]); await sleep(150); const bk = await cam(); send([[{ slot: 0, up: true }]]); await sleep(300);
  check('EDGE: the view stays on the map, no jump, turning back moves at once', inside && jmp <= 60 * Math.SQRT2 / dpr + 1 && Math.hypot(bk.x - top.x, bk.y - top.y) > 10, 'max step ' + jmp.toFixed(1) + ', back ' + Math.hypot(bk.x - top.x, bk.y - top.y).toFixed(1));
  // 4. PIPE_DRAG: the camera never moves; the pipe is built
  await center(.9, X + 5, Y + 3); await ev("window.__v2.setTool('pipe', 0); return 1;"); await sleep(300);
  const wS = await ev(`const v = window.__v2, b = v.game.buildings.find(q => q.id === ${L0.W}), c = v.tc(b.x, b.y); return v.camApi.w2s(c.x, c.y - 6);`);
  const tS = await ev(`const v = window.__v2, b = v.game.buildings.find(q => q.id === ${L0.T2}), c = v.tc(b.x + .5, b.y + .5); return v.camApi.w2s(c.x, c.y - 14);`);
  const p0 = await cam(), n0 = await ev('return window.__v2.game.lines.length;'); const fr = [[{ slot: 0, ...D(wS) }]];
  for (let i = 1; i <= 10; i++) fr.push([{ slot: 0, ...D({ x: wS.x + (tS.x - wS.x) * i / 10, y: wS.y + (tS.y - wS.y) * i / 10 }) }]);
  send(fr); await sleep(300); const sP = await state(), p1 = await cam(); send([[{ slot: 0, up: true }]]); await sleep(600); const n1 = await ev('return window.__v2.game.lines.length;');
  check('PIPE_DRAG: camera unchanged, pipe built on release', sP === 'PIPE_DRAG' && p0.x === p1.x && p0.y === p1.y && p0.z === p1.z && n1 === n0 + 1, 'state ' + sP + ', pipes ' + n0 + ' -> ' + n1);
  await ev('window.__v2.setTool(null); return 1;');
  // 5. BUILDING_DRAG: new tank preview, and moving the selected tank
  await center(.9, X + 5, Y + 3); await ev("window.__v2.setTool('tank'); return 1;"); await sleep(200);
  const bs = D({ x: 120, y: 520 }), q0 = await cam(); const bf = [[{ slot: 0, ...bs }]]; for (let i = 1; i <= 6; i++) bf.push([{ slot: 0, x: bs.x - 30 * i, y: bs.y + 20 * i }]); send(bf); await sleep(300);
  const sB = await state(), pend = await ev('return window.__v2.ui.pending;'), q1 = await cam(); send([[{ slot: 0, up: true }]]); await sleep(400); await ev('window.__v2.cancel(); window.__v2.setTool(null); return 1;');
  check('BUILDING_DRAG (new tank): only the preview follows the finger, camera unchanged', sB === 'BUILDING_DRAG' && !!pend && q0.x === q1.x && q0.y === q1.y, 'state ' + sB + ' preview ' + JSON.stringify(pend));
  const t2 = await ev(`const b = window.__v2.game.buildings.find(q => q.id === ${L0.T2}); return { x: b.x, y: b.y };`);
  const t2s = await ev(`const v = window.__v2, b = v.game.buildings.find(q => q.id === ${L0.T2}), c = v.tc(b.x + .5, b.y + .5); return v.camApi.w2s(c.x, c.y - 14);`);
  send([[{ slot: 0, ...D(t2s) }], [{ slot: 0, up: true }]]); await sleep(400); const selOk = (await ev('return window.__v2.ui.sel && window.__v2.ui.sel.id;')) === L0.T2;
  const to = await ev(`const v = window.__v2, a = v.tc(${t2.x}, ${t2.y}), b = v.tc(${t2.x}, ${t2.y + 3}); return { x: ${t2s.x} + (b.x - a.x) * v.view.cam.zoom, y: ${t2s.y} + (b.y - a.y) * v.view.cam.zoom };`);
  const r0 = await cam(); const mf = [[{ slot: 0, ...D(t2s) }]]; for (let i = 1; i <= 8; i++) mf.push([{ slot: 0, ...D({ x: t2s.x + (to.x - t2s.x) * i / 8, y: t2s.y + (to.y - t2s.y) * i / 8 }) }]); send(mf); await sleep(300);
  const sM = await state(), r1 = await cam(); send([[{ slot: 0, up: true }]]); await sleep(500);
  const t2b = await ev(`const b = window.__v2.game.buildings.find(q => q.id === ${L0.T2}); return { x: b.x, y: b.y, problems: window.__v2.game.validateNetwork().length };`);
  check('BUILDING_DRAG (selected tank): tap selects it, dragging moves it, camera unchanged', selOk && sM === 'BUILDING_DRAG' && r0.x === r1.x && r0.y === r1.y && t2b.y > t2.y && t2b.problems === 0, JSON.stringify({ selOk, sM, from: t2, to: t2b }));
  // 6. tap vs drag
  await ev('window.__v2.select(null); return 1;'); const tp = await ev(`const v = window.__v2, b = v.game.buildings.find(q => q.id === ${L0.T}), c = v.tc(b.x + .5, b.y + .5); return v.camApi.w2s(c.x, c.y - 14);`);
  const far = D({ x: tp.x - 120, y: tp.y + 80 }), tpD = D(tp); const df = [[{ slot: 0, ...far }]]; for (let i = 1; i <= 6; i++) df.push([{ slot: 0, x: far.x + (tpD.x - far.x) * i / 6, y: far.y + (tpD.y - far.y) * i / 6 }]); df.push([{ slot: 0, up: true }]); send(df); await sleep(400);
  check('DRAG ending on a tank does not select it (no click after a drag)', (await ev('return window.__v2.ui.sel;')) === null, '');
  // 7. Phase A extras on the real Android input path: tap after drag, drag after tap, large finger, rapid taps, rapid second finger, everything ends IDLE
  {
    await center(1, X + 9.5, Y + 1.5); await sleep(300);
    const tkP = async () => { const r = await ev(`const v = window.__v2, b = v.game.buildings.find(q => q.id === ${L0.T}), c = v.tc(b.x + .5, b.y + .5); return v.camApi.w2s(c.x, c.y - 14);`); return r; };
    let tk = await tkP();
    // large finger: an 8 px wobble is still a tap
    await ev('window.__v2.select(null); return 1;'); const a = D(tk); send([[{ slot: 0, ...a }], [{ slot: 0, x: a.x + Math.round(5 * dpr), y: a.y + Math.round(4 * dpr) }], [{ slot: 0, up: true }]]); await sleep(500);
    check('LARGE FINGER: an 8 px wobble on a tank is still a tap (selects it)', (await ev('return window.__v2.ui.sel && window.__v2.ui.sel.id;')) === L0.T, '');
    // a 24 px move is a drag: the map follows, nothing is selected
    await ev('window.__v2.select(null); return 1;'); const k0 = await cam(); send([[{ slot: 0, ...a }], [{ slot: 0, x: a.x + Math.round(12 * dpr), y: a.y }], [{ slot: 0, x: a.x + Math.round(24 * dpr), y: a.y }], [{ slot: 0, up: true }]]); await sleep(500);
    const k1 = await cam(); check('A 24 px move is a drag: the map moved exactly 24 px, nothing selected', Math.abs((k0.x - k1.x) * k1.z - 24) < 1.0 && (await ev('return window.__v2.ui.sel;')) === null, 'moved ' + ((k0.x - k1.x) * k1.z).toFixed(2));
    // tap right after a drag selects once; a drag right after the tap pans 1:1
    await center(1, X + 9.5, Y + 1.5); await sleep(300); tk = await tkP(); const f0 = D({ x: tk.x - 90, y: tk.y }), f1 = D(tk);
    send([[{ slot: 0, ...f0 }], [{ slot: 0, x: (f0.x + f1.x) / 2, y: f0.y }], [{ slot: 0, ...f1 }], [{ slot: 0, up: true }]]); await sleep(200);
    const afterDrag = await ev('return window.__v2.ui.sel;'); await center(1, X + 9.5, Y + 1.5); await sleep(300); tk = await tkP();
    send([[{ slot: 0, ...D(tk) }], [{ slot: 0, up: true }]]); await sleep(400);
    check('TAP AFTER DRAG: the drag selected nothing; the tap right after selects the tank once', afterDrag === null && (await ev('return window.__v2.ui.sel && window.__v2.ui.sel.id;')) === L0.T, '');
    const d0 = await cam(), e1 = D({ x: 100, y: 200 }); send([[{ slot: 0, ...e1 }], [{ slot: 0, x: e1.x + Math.round(30 * dpr), y: e1.y + Math.round(20 * dpr) }], [{ slot: 0, up: true }]]); await sleep(500); const d1 = await cam();
    check('DRAG AFTER TAP: pans 1:1 (30,20 px), keeps the selection', Math.abs((d1.x - d0.x) * d1.z + 30) < 1.0 && Math.abs((d1.y - d0.y) * d1.z + 20) < 1.0 && (await ev('return window.__v2.ui.sel && window.__v2.ui.sel.id;')) === L0.T, JSON.stringify([d0, d1]));
    // rapid touch sequence: 6 quick taps on empty ground, then everything is IDLE and a pan is 1:1
    await ev('window.__v2.select(null); return 1;'); const rq = D({ x: 60, y: 200 }); const fr = []; for (let i = 0; i < 6; i++) { fr.push([{ slot: 0, x: rq.x + 4 * i, y: rq.y }]); fr.push([{ slot: 0, up: true }]); } send(fr); await sleep(500);
    const stR = await state(), g0 = await cam(), g1p = D({ x: 150, y: 300 }); send([[{ slot: 0, ...g1p }], [{ slot: 0, x: g1p.x + Math.round(40 * dpr), y: g1p.y }], [{ slot: 0, up: true }]]); await sleep(500); const g1 = await cam();
    check('RAPID TOUCH SEQUENCE: 6 quick taps end IDLE and the next pan is 1:1', stR === 'IDLE' && Math.abs((g1.x - g0.x) * g1.z + 40) < 1.0 && (await state()) === 'IDLE', 'state ' + stR);
    if (multi) {
      // rapid second finger: down, second down and up within two frames, the first keeps panning from where it is, no jump
      await ev('window.__v2.select(null); return 1;'); await center(1, 70, 44); await sleep(200); const r0 = D({ x: 140, y: 300 }), r1 = D({ x: 260, y: 360 });
      sendM([[{ slot: 0, ...r0 }], [{ slot: 0, x: r0.x + 20, y: r0.y }]]); await sleep(150); const h0 = await cam(); sendM([[{ slot: 1, ...r1 }], [{ slot: 1, up: true }]]); await sleep(300);
      const h1 = await cam(), stH = await state(); const seenP = () => ev('const ps = window.__v2.view.scene.input.manager.pointers.filter(p => p.isDown); return ps.length ? { x: ps[0].x, y: ps[0].y } : null;');
      const pr0 = await seenP(); sendM([[{ slot: 0, x: r0.x + 20 + Math.round(30 * dpr), y: r0.y }]]); await sleep(300); const pr1 = await seenP(), h2 = await cam(); sendM([[{ slot: 0, up: true }]]); await sleep(400);
      const recv = pr0 && pr1 ? pr1.x - pr0.x : NaN, camMoved = (h1.x - h2.x) * h2.z;
      check('RAPID SECOND FINGER: touching and lifting a 2nd finger quickly does not move the camera or zoom; the first finger then pans exactly as far as the app received it', h0.z === h1.z && h0.x === h1.x && h0.y === h1.y && stH === 'PAN' && Math.abs(camMoved - recv) < 0.5, 'state ' + stH + ', sent 30.0, app received ' + recv.toFixed(2) + ', camera moved ' + camMoved.toFixed(2) + ' css px');
      // rapid finger release: two fingers lifted in consecutive frames -> IDLE, nothing stuck
      sendM([[{ slot: 0, ...r0 }, { slot: 1, ...r1 }]]); await sleep(120); sendM([[{ slot: 0, up: true }], [{ slot: 1, up: true }]]); await sleep(400);
      check('RAPID FINGER RELEASE: both fingers lifted in consecutive frames -> IDLE', (await state()) === 'IDLE', 'state ' + await state());
    }
    await ev('window.__v2.select(null); return 1;');
  }
  const tr = await ev('return window.__v2.touch.log.slice();');
  const ok = new Set(['IDLE>PAN', 'IDLE>PIPE_DRAG', 'IDLE>BUILDING_DRAG', 'PAN>PINCH', 'PAN>IDLE', 'PINCH>PAN', 'PINCH>IDLE', 'PINCH>PINCH', 'PIPE_DRAG>IDLE', 'PIPE_DRAG>PINCH', 'BUILDING_DRAG>IDLE', 'BUILDING_DRAG>PINCH']);
  check('every state change was a legal one', tr.every(x => ok.has(x)), [...new Set(tr)].join(', '));
  check('no JavaScript errors during the touch tests', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
  try { fs.writeFileSync('results/touch.png', execSync('adb exec-out screencap -p')); } catch (e) {}
  fs.writeFileSync('results/touch.json', JSON.stringify({ fails, results }, null, 1));
  console.log('TOUCH SUMMARY ' + (results.length - fails) + '/' + results.length + ' PASS');
  await client.close(); process.exit(0);
})().catch(e => { console.log('FAIL TOUCH crashed: ' + e.message); try { fs.writeFileSync('results/touch-crash.txt', String(e.stack)); } catch (x) {} process.exit(0); });
