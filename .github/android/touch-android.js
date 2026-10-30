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
  // one "frame" of finger changes -> sendevent lines ending in SYN_REPORT. f = [{ slot, x, y } | { slot, up: true }] in DEVICE px
  const frame = f => { const L = [], e = (t, c, v) => L.push('sendevent ' + DEV + ' ' + t + ' ' + c + ' ' + v);
    const wasEmpty = down.size === 0;
    for (const q of f) { e(3, 47, q.slot);
      if (q.up) { e(3, 57, 4294967295); down.delete(q.slot); continue; }
      if (!down.has(q.slot)) { const id = nextId++; down.set(q.slot, id); e(3, 57, id); if (hasP) e(3, 58, 60); }
      e(3, 53, ax(q.x)); e(3, 54, ay(q.y)); }
    if (wasEmpty && down.size) e(1, 330, 1); if (!down.size) e(1, 330, 0);
    e(0, 0, 0); return L; };
  const send = frames => { const L = []; for (const f of frames) L.push(...frame(f)); for (let i = 0; i < L.length; i += 120) sh('adb shell "' + L.slice(i, i + 120).join('; ') + '"'); };

  // ---- the WebView
  const targets = await CDP.List({ port: 9222 }); const t = targets.find(x => x.type === 'page'); if (!t) { console.log('FAIL TOUCH no WebView page'); process.exit(0); }
  const client = await CDP({ port: 9222, target: t, local: true }); const { Runtime } = client; await Runtime.enable();
  const errors = []; Runtime.exceptionThrown(e => errors.push('exception: ' + (e.exceptionDetails.exception && e.exceptionDetails.exception.description || e.exceptionDetails.text)));
  const ev = async expr => { const r = await Runtime.evaluate({ expression: '(async () => { ' + expr + ' })()', awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const dpr = await ev('return devicePixelRatio;');
  // calibration with this very device: where does a touch at a device pixel land in the page (status bar / insets)
  await ev("window.__lt = null; document.addEventListener('pointerdown', e => { window.__lt = { x: e.clientX, y: e.clientY }; }, true); window.__v2.setTool(null); window.__v2.select(null); return 1;");
  const cx = Math.round(SW / 2), cy = Math.round(SH * .5); let lt = null;
  const order = mts.slice().sort((a, b) => (/_1$|multi_touch$/.test(b.name) ? 1 : 0) - (/_1$|multi_touch$/.test(a.name) ? 1 : 0));
  for (const m of order) { useDev(m); down.clear(); try { send([[{ slot: 0, x: cx, y: cy }], [{ slot: 0, up: true }]]); } catch (e) { console.log('TOUCHDEV ' + m.dev + ' not writable: ' + String(e.message).slice(0, 120)); continue; } await sleep(700); lt = await ev('return window.__lt;'); if (lt) break; }
  if (!lt) {   // diagnostics: what the kernel device receives, what Android's input system thinks of the device, who we are
    useDev(order[0]); down.clear();
    try { console.log('DIAG id: ' + sh('adb shell id').trim()); } catch (e) {}
    try { const L = frame([{ slot: 0, x: cx, y: cy }]).concat(frame([{ slot: 0, up: true }])); console.log('DIAG getevent: ' + sh('adb shell "(getevent -lt ' + DEV + ' > /data/local/tmp/ge.txt &) ; sleep 1; ' + L.join('; ') + '; sleep 1; pkill getevent; cat /data/local/tmp/ge.txt"').slice(0, 1200)); } catch (e) { console.log('DIAG getevent failed ' + e.message.slice(0, 200)); }
    try { const d = sh('adb shell dumpsys input'); const i = d.indexOf(order[0].name); console.log('DIAG dumpsys: ' + d.slice(Math.max(0, i - 200), i + 1500).replace(/\n\s*/g, ' | ')); } catch (e) {}
    console.log('FAIL TOUCH none of the multi-touch devices reaches the WebView'); process.exit(0); }
  console.log('TOUCHDEV using ' + DEV + ' (' + mt.name + ') x 0..' + MX + ' y 0..' + MY + ' pressure ' + hasP);
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
  await center(1, 70, 44); await sleep(200);
  const a0 = D({ x: 140, y: 420 }); send([[{ slot: 0, ...a0 }], [{ slot: 0, x: a0.x + 30, y: a0.y }], [{ slot: 0, x: a0.x + 60, y: a0.y }]]); await sleep(200);
  const a1 = { x: a0.x + 60, y: a0.y }, cA = await cam(); const b0 = D({ x: 300, y: 480 }); send([[{ slot: 1, ...b0 }]]); await sleep(250); const cB = await cam(), sp = await state();
  check('PAN -> PINCH: the second finger does not move the camera', cA.x === cB.x && cA.y === cB.y && cA.z === cB.z && sp === 'PINCH', 'state ' + sp);
  const m0 = { x: (a1.x + b0.x) / 2, y: (a1.y + b0.y) / 2 }, wm = await w(C(m0)); let drift = 0; const zs = [];
  for (let i = 1; i <= 6; i++) { const a = { x: a1.x - 25 * i, y: a1.y - 15 * i }, b = { x: b0.x + 25 * i, y: b0.y + 15 * i }; send([[{ slot: 0, ...a }, { slot: 1, ...b }]]); await sleep(150); const c = await cam(); zs.push(c.z.toFixed(2)); drift = Math.max(drift, dist(await w(C({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })), wm) * c.z); }
  check('PINCH zooms about the midpoint of the two fingers', +zs[5] > 1.2 && drift < 1.5, 'zoom ' + zs.join(' ') + ', midpoint drift ' + drift.toFixed(2) + ' css px');
  const aE = { x: a1.x - 150, y: a1.y - 90 }; const cL = await cam(); send([[{ slot: 1, up: true }]]); await sleep(250); const cL2 = await cam(), sp2 = await state();
  check('PINCH -> PAN: lifting the second finger does not move the camera', cL.x === cL2.x && cL.y === cL2.y && sp2 === 'PAN', 'state ' + sp2);
  const wa = await w(C(aE)); let dr2 = 0; for (let i = 1; i <= 4; i++) { const q = { x: aE.x + 40 * i, y: aE.y + 25 * i }; send([[{ slot: 0, ...q }]]); await sleep(120); dr2 = Math.max(dr2, dist(await w(C(q)), wa) * cL2.z); }
  send([[{ slot: 0, up: true }]]); await sleep(400);
  check('PINCH -> PAN: the remaining finger pans 1:1 from where it is', dr2 < 1.0, 'drift ' + dr2.toFixed(3) + ' css px');
  check('PINCH: no tap fired afterwards', (await ev('return window.__v2.ui.sel;')) === null, '');
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
  const tr = await ev('return window.__v2.touch.log.slice();');
  const ok = new Set(['IDLE>PAN', 'IDLE>PIPE_DRAG', 'IDLE>BUILDING_DRAG', 'PAN>PINCH', 'PAN>IDLE', 'PINCH>PAN', 'PINCH>IDLE', 'PINCH>PINCH', 'PIPE_DRAG>IDLE', 'PIPE_DRAG>PINCH', 'BUILDING_DRAG>IDLE', 'BUILDING_DRAG>PINCH']);
  check('every state change was a legal one', tr.every(x => ok.has(x)), [...new Set(tr)].join(', '));
  check('no JavaScript errors during the touch tests', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
  try { fs.writeFileSync('results/touch.png', execSync('adb exec-out screencap -p')); } catch (e) {}
  fs.writeFileSync('results/touch.json', JSON.stringify({ fails, results }, null, 1));
  console.log('TOUCH SUMMARY ' + (results.length - fails) + '/' + results.length + ' PASS');
  await client.close(); process.exit(0);
})().catch(e => { console.log('FAIL TOUCH crashed: ' + e.message); try { fs.writeFileSync('results/touch-crash.txt', String(e.stack)); } catch (x) {} process.exit(0); });
