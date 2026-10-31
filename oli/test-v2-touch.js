// Camera + touch controller (real CDP touch, phone size). Pan 1:1 at several zooms, no inertia, tap vs drag, pinch about the midpoint,
// pan -> pinch -> pan without jumps, zoom limits without dead zones, map edges, pipe drag and building drag never move the camera,
// one input pipeline only. Prints the measured numbers.
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file://' + __dirname + '/v2.html', OUT = process.argv[2] || '/tmp/oli-shots'; require('fs').mkdirSync(OUT, { recursive: true });
let pass = 0; const log = m => { pass++; console.log('ok   ' + m); };
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2.75, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForTimeout(1500);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  // CDP: touchStart / touchMove list the points that are down; touchEnd lists the points that are LIFTED
  const TE = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id || 0 })) });
  const fr = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  const cam = () => G(() => { const c = window.__v2.view.cam; return { x: c.scrollX, y: c.scrollY, z: c.zoom }; });
  const s2w = (p) => A(p => window.__v2.camApi.s2w(p.x, p.y), p);
  const state = () => G(() => window.__v2.touch.state);
  const center = (z, x, y) => A(([z, x, y]) => { const v = window.__v2, c = v.tc(x, y); v.view.cam.setZoom(z); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); v.select(null); v.setTool(null); }, [z, x, y]);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // a few buildings + a pipe to work with
  const L0 = await G(() => { const v = window.__v2, g = v.game; g.s.cash = 1e7; window.OliCore.CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    for (const a of g.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
    for (let y = 30; y < 60; y++) for (let x = 40; x < 90; x++) { let ok = true; for (let j = -2; j < 12 && ok; j++) for (let i = -2; i < 14; i++) if (!g.canPlace('tank', x + i, y + j).ok && !(i > 12 || j > 10)) { ok = false; break; }
      if (!ok) continue; const w = g.place('well', x, y, 'small').building, t = g.place('tank', x + 9, y).building, t2 = g.place('tank', x + 4, y + 7).building; v.view.scene.paintGround(true);
      return { X: x, Y: y, W: w.id, T: t.id, T2: t2.id }; } });
  assert(L0, 'layout'); const { X, Y } = L0;

  // ---------- 1. PAN is 1:1 from the first pixel, at every zoom: the world point under the finger never leaves it
  for (const z of [0.5, 1.0, 1.5, 1.8]) {
    await center(z, 70, 44); const s = { x: 200, y: 420 }, w0 = await s2w(s); await TE('touchStart', [s]); await fr();
    let worst = 0; const path = [[2, 0], [4, 1], [7, 3], [15, 10], [40, 25], [80, 60], [60, 120], [-30, 150], [-90, 40]];
    for (const [dx, dy] of path) { const q = { x: s.x + dx, y: s.y + dy }; await TE('touchMove', [q]); await fr(); worst = Math.max(worst, dist(await s2w(q), w0) * z); }
    const c1 = await cam(); await TE('touchEnd', [{ x: s.x - 90, y: s.y + 40 }]); for (let i = 0; i < 10; i++) await fr(); const c2 = await cam();
    assert(worst < 0.01, 'zoom ' + z + ': the map left the finger by ' + worst + ' px'); assert(c1.x === c2.x && c1.y === c2.y, 'no movement after lifting');
    log('PAN at zoom ' + z + ': the point first touched stays under the finger (worst ' + worst.toFixed(4) + ' screen px, from the first 2 px); no movement after lifting (10 frames)');
  }
  // ---------- 2. tap vs drag
  await center(1, X + 9.5, Y + 1.5); const tT = await A(o => { const v = window.__v2, b = v.game.buildings.find(q => q.id === o.T), c = v.tc(b.x + .5, b.y + .5); const s = v.camApi.w2s(c.x, c.y - 14); return s; }, L0);
  await TE('touchStart', [tT]); await fr(); await TE('touchMove', [{ x: tT.x + 3, y: tT.y + 2 }]); await fr(); await TE('touchEnd', [tT]); await fr();
  assert.strictEqual(await G(() => window.__v2.ui.sel && window.__v2.ui.sel.id), L0.T); log('TAP: a touch that wobbles 4 px on a tank selects it');
  await G(() => window.__v2.select(null));
  const far = { x: tT.x - 120, y: tT.y + 80 }; await TE('touchStart', [far]); await fr(); for (let i = 1; i <= 6; i++) { await TE('touchMove', [{ x: far.x + 20 * i, y: far.y - 13 * i }]); await fr(); } await TE('touchEnd', [far]); await fr();
  assert.strictEqual(await G(() => window.__v2.ui.sel), null); log('DRAG -> no click: a pan that ends on top of a tank does not select it');
  await TE('touchStart', [far]); await fr(); await TE('touchMove', [{ x: far.x + 40, y: far.y }]); await fr(); await TE('touchMove', [far]); await fr(); await TE('touchEnd', [far]); await fr();
  assert.strictEqual(await G(() => window.__v2.ui.sel), null); log('DRAG -> no click: dragged 40 px and back to the same spot = still a drag, not a tap');
  // ---------- 3. PINCH: the world point under the midpoint stays there; pan -> pinch and pinch -> pan without a jump
  await center(1, 70, 44);
  const a0 = { x: 150, y: 420, id: 1 }; await TE('touchStart', [a0]); await fr();
  for (let i = 1; i <= 4; i++) { await TE('touchMove', [{ ...a0, x: a0.x + 10 * i }]); await fr(); }
  const a1 = { ...a0, x: a0.x + 40 }, beforeB = await cam(), wa = await s2w(a1);
  const b0 = { x: 290, y: 470, id: 2 }; await TE('touchStart', [a1, b0]); await fr(); const afterB = await cam();
  assert(beforeB.x === afterB.x && beforeB.y === afterB.y && beforeB.z === afterB.z, 'the second finger arriving moved the camera'); assert.strictEqual(await state(), 'PINCH');
  const m0 = { x: (a1.x + b0.x) / 2, y: (a1.y + b0.y) / 2 }, wm = await s2w(m0); let worstM = 0, zs = [];
  for (let i = 1; i <= 8; i++) { const a = { ...a1, x: a1.x - 8 * i, y: a1.y - 5 * i }, b = { ...b0, x: b0.x + 8 * i, y: b0.y + 5 * i }; await TE('touchMove', [a, b]); await fr(); const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; const c = await cam(); zs.push(c.z.toFixed(2)); worstM = Math.max(worstM, dist(await s2w(m), wm) * c.z); }
  assert(worstM < 0.01, 'midpoint drift ' + worstM); log('PAN -> PINCH: the 2nd finger does not move the camera at all; zoom ' + zs[0] + ' -> ' + zs[zs.length - 1] + ' about the midpoint (drift ' + worstM.toFixed(4) + ' px)');
  // two-finger pan: both fingers move the same way -> the world under the midpoint follows
  let worstT = 0; const aE = { ...a1, x: a1.x - 64, y: a1.y - 40 }, bE = { ...b0, x: b0.x + 64, y: b0.y + 40 }, mE = { x: (aE.x + bE.x) / 2, y: (aE.y + bE.y) / 2 }, wE = await s2w(mE);
  for (let i = 1; i <= 5; i++) { const a = { ...aE, y: aE.y + 12 * i }, b = { ...bE, y: bE.y + 12 * i }; await TE('touchMove', [a, b]); await fr(); worstT = Math.max(worstT, dist(await s2w({ x: mE.x, y: mE.y + 12 * i }), wE) * (await cam()).z); }
  assert(worstT < 0.01); log('PINCH: moving both fingers together drags the map with them (drift ' + worstT.toFixed(4) + ' px)');
  // lift finger 2 -> PAN continues from where finger 1 IS, no jump
  const aL = { ...aE, y: aE.y + 60 }, bL = { ...bE, y: bE.y + 60 }, beforeL = await cam(); await TE('touchEnd', [bL]); await fr(); const afterL = await cam();
  assert(beforeL.x === afterL.x && beforeL.y === afterL.y, 'lifting a finger moved the camera'); assert.strictEqual(await state(), 'PAN');
  const wa2 = await s2w(aL); let worstP = 0;
  for (let i = 1; i <= 5; i++) { const q = { ...aL, x: aL.x + 15 * i, y: aL.y - 9 * i }; await TE('touchMove', [q]); await fr(); worstP = Math.max(worstP, dist(await s2w(q), wa2) * afterL.z); }
  await TE('touchEnd', [aL]); await fr(); assert(worstP < 0.01, 'pan after pinch drift ' + worstP);
  assert.strictEqual(await G(() => window.__v2.ui.sel), null, 'no tap after a pinch');
  log('PINCH -> PAN: lifting the 2nd finger does not move the camera; the remaining finger pans 1:1 from where it is (drift ' + worstP.toFixed(4) + ' px); no tap afterwards');
  // zoom limits: no dead zone
  await center(1.6, 70, 44); const P = { x: 150, y: 420, id: 1 }, Q = { x: 250, y: 420, id: 2 }; await TE('touchStart', [P]); await fr(); await TE('touchStart', [P, Q]); await fr(); const zz = [];
  for (const d of [30, 60, 85, 70]) { await TE('touchMove', [{ ...P, x: 150 - d }, { ...Q, x: 250 + d }]); await fr(); zz.push((await cam()).z); }
  await TE('touchEnd', [P, Q]); await fr();
  assert(zz[2] === 1.8 && zz[3] < 1.8, 'pinching in after hitting the max zoom must zoom out at once: ' + zz); log('PINCH at the zoom limit: ' + zz.map(z => z.toFixed(2)).join(' -> ') + ' - pinching back responds at once (no dead zone)');
  // ---------- 4. map edges: clamped, no jump, reversing moves at once
  await center(1, 0, 0); const e = { x: 100, y: 300 }; await TE('touchStart', [e]); await fr(); const ed = [];
  for (let i = 1; i <= 8; i++) { await TE('touchMove', [{ x: e.x + 25 * i, y: e.y + 25 * i }]); await fr(); ed.push(await cam()); }
  const inside = await G(() => { const v = window.__v2, c = v.view.cam, B = v.view.bounds, a = v.camApi.s2w(0, 0), b = v.camApi.s2w(c.width, c.height); return a.x >= B.x - .01 && a.y >= B.y - .01 && b.x <= B.x + B.w + .01 && b.y <= B.y + B.h + .01; });
  let jump = 0; for (let i = 1; i < ed.length; i++) jump = Math.max(jump, Math.hypot(ed[i].x - ed[i - 1].x, ed[i].y - ed[i - 1].y)); assert(inside && jump <= 25 * Math.SQRT2 + .01);
  const top = await cam(); await TE('touchMove', [{ x: e.x + 25 * 7, y: e.y + 25 * 7 }]); await fr(); const back1 = await cam(); await TE('touchEnd', [e]); await fr();
  const rev = Math.hypot(back1.x - top.x, back1.y - top.y); assert(rev > 20, 'reversing at the edge must move the map at once: ' + rev);
  log('EDGE: the view never leaves the map, no step bigger than the finger\'s (max ' + jump.toFixed(1) + ' px), and turning back moves the map at once (' + rev.toFixed(1) + ' px on the first 35 px step)');
  // ---------- 5. PIPE_DRAG: the camera never moves (also with the finger resting at the screen edge); a 2nd finger after moving is ignored
  await center(.9, X + 5, Y + 3); await G(() => window.__v2.setTool('pipe', 0)); await fr();
  const wS = await A(o => { const v = window.__v2, b = v.game.buildings.find(q => q.id === o.W), c = v.tc(b.x, b.y); return v.camApi.w2s(c.x, c.y - 6); }, L0);
  const tS = await A(o => { const v = window.__v2, b = v.game.buildings.find(q => q.id === o.T2), c = v.tc(b.x + .5, b.y + .5); return v.camApi.w2s(c.x, c.y - 14); }, L0);
  const cp0 = await cam(); await TE('touchStart', [{ ...wS, id: 1 }]); await fr(); assert.strictEqual(await state(), 'PIPE_DRAG');
  for (let i = 1; i <= 6; i++) { await TE('touchMove', [{ x: wS.x + (5 - wS.x) * i / 6, y: wS.y, id: 1 }]); await fr(); }
  await wait(900); for (let i = 0; i < 5; i++) { await TE('touchMove', [{ x: 5 + (i % 2), y: wS.y, id: 1 }]); await fr(); }
  await TE('touchMove', [{ x: 5, y: wS.y, id: 1 }, { x: 300, y: 300, id: 2 }]); await fr(); for (let i = 0; i < 3; i++) { await TE('touchMove', [{ x: 5, y: wS.y, id: 1 }, { x: 300 + 30 * i, y: 300 + 20 * i, id: 2 }]); await fr(); }
  await TE('touchEnd', [{ x: 300, y: 300, id: 2 }]); await fr(); assert.strictEqual(await state(), 'PIPE_DRAG', 'a second finger does not break the pipe drag');
  for (let i = 1; i <= 8; i++) { await TE('touchMove', [{ x: 5 + (tS.x - 5) * i / 8, y: wS.y + (tS.y - wS.y) * i / 8, id: 1 }]); await fr(); }
  const cp1 = await cam(); const lines0 = await G(() => window.__v2.game.lines.length); await TE('touchEnd', [{ ...tS, id: 1 }]); await fr(); const lines1 = await G(() => window.__v2.game.lines.length);
  assert(cp0.x === cp1.x && cp0.y === cp1.y && cp0.z === cp1.z, 'the camera moved during a pipe drag'); assert.strictEqual(lines1, lines0 + 1, 'pipe built');
  log('PIPE_DRAG: camera unchanged for the whole drag (finger rested 1 s at the screen edge, a 2nd finger came and went); the pipe was built on release');
  // a 2nd finger right at the start of a pipe drag (nothing moved yet) = the player wants to zoom: drag cancelled, PINCH
  await TE('touchStart', [{ ...wS, id: 1 }]); await fr(); await TE('touchStart', [{ ...wS, id: 1 }, { x: wS.x + 120, y: wS.y + 60, id: 2 }]); await fr();
  assert.strictEqual(await state(), 'PINCH'); assert.strictEqual(await G(() => !!window.__v2.ui.dragging), false); await TE('touchEnd', [{ ...wS, id: 1 }, { x: 0, y: 0, id: 2 }]); await fr();
  assert.strictEqual(await G(() => window.__v2.game.lines.length), lines1); log('PIPE_DRAG + 2nd finger before moving -> the pipe is dropped (nothing built) and the gesture becomes a PINCH');
  await G(() => window.__v2.setTool(null));
  // ---------- 6. BUILDING_DRAG: new building (tool) and moving the selected tank; the camera never moves
  await center(.9, X + 5, Y + 3); await G(() => window.__v2.setTool('tank')); const bs = { x: 120, y: 520 }; const cb0 = await cam();
  await TE('touchStart', [bs]); await fr(); assert.strictEqual(await state(), 'BUILDING_DRAG');
  for (let i = 1; i <= 8; i++) { await TE('touchMove', [{ x: bs.x - 14 * i, y: bs.y + 8 * i }]); await fr(); } await wait(600); await TE('touchMove', [{ x: bs.x - 112, y: bs.y + 64 }]); await fr();
  const pend = await G(() => window.__v2.ui.pending); const cb1 = await cam(); await TE('touchEnd', [bs]); await fr(); await G(() => { window.__v2.cancel(); window.__v2.setTool(null); });
  assert(cb0.x === cb1.x && cb0.y === cb1.y && pend, 'camera moved / no preview'); log('BUILDING_DRAG (new tank): the preview followed the finger to (' + pend.x + ',' + pend.y + ') and rested at the screen edge; camera unchanged');
  // move the selected tank T2 three tiles: tap selects it, then touch + drag moves it
  const t2 = await A(o => { const v = window.__v2, b = v.game.buildings.find(q => q.id === o.T2); return { x: b.x, y: b.y }; }, L0);
  const t2s = await A(o => { const v = window.__v2, b = v.game.buildings.find(q => q.id === o.T2), c = v.tc(b.x + .5, b.y + .5); return v.camApi.w2s(c.x, c.y - 14); }, L0);
  await TE('touchStart', [t2s]); await fr(); await TE('touchEnd', [t2s]); await fr(); assert.strictEqual(await G(() => window.__v2.ui.sel && window.__v2.ui.sel.id), L0.T2);
  const to = await A(([x, y, s]) => { const v = window.__v2, a = v.tc(x, y), b = v.tc(x, y + 3); return { x: s.x + (b.x - a.x) * v.view.cam.zoom, y: s.y + (b.y - a.y) * v.view.cam.zoom }; }, [t2.x, t2.y, t2s]);
  const cm0 = await cam(); await TE('touchStart', [t2s]); await fr(); assert.strictEqual(await state(), 'BUILDING_DRAG');
  for (let i = 1; i <= 8; i++) { await TE('touchMove', [{ x: t2s.x + (to.x - t2s.x) * i / 8, y: t2s.y + (to.y - t2s.y) * i / 8 }]); await fr(); }
  const cm1 = await cam(); await TE('touchEnd', [to]); await fr(); const t2b = await A(o => { const b = window.__v2.game.buildings.find(q => q.id === o.T2); return { x: b.x, y: b.y }; }, L0);
  assert(cm0.x === cm1.x && cm0.y === cm1.y, 'camera moved while moving a building'); assert(Math.abs(t2b.x - t2.x) <= 1 && t2b.y > t2.y && Math.abs(t2b.y - (t2.y + 3)) <= 1, 'moved with the finger (3 tiles, +-1 for where the finger lands in a tile): ' + JSON.stringify([t2, t2b]));
  assert.deepStrictEqual(await G(() => window.__v2.game.validateNetwork()), []);
  log('BUILDING_DRAG (selected tank): it followed the finger and was moved (' + t2.x + ',' + t2.y + ') -> (' + t2b.x + ',' + t2b.y + '); camera unchanged; network valid');
  // a drag that starts on a building that is NOT selected pans the map
  await center(.9, X + 9.5, Y + 1.5); await G(() => window.__v2.select(null)); const ws2 = await A(o => { const v = window.__v2, b = v.game.buildings.find(q => q.id === o.T), c = v.tc(b.x + .5, b.y + .5); return v.camApi.w2s(c.x, c.y - 14); }, L0);
  const cn0 = await cam(); await TE('touchStart', [ws2]); await fr(); for (let i = 1; i <= 4; i++) { await TE('touchMove', [{ x: ws2.x - 15 * i, y: ws2.y }]); await fr(); } const cn1 = await cam(); await TE('touchEnd', [ws2]); await fr();
  assert(Math.abs((cn1.x - cn0.x) * cn0.z - 60) < .01, 'pan from an unselected building'); log('a drag starting on a building that is not selected pans the map (60 px finger -> ' + ((cn1.x - cn0.x) * cn0.z).toFixed(2) + ' px)');
  // ---------- 7. one input pipeline: the only touch listeners on the map are Phaser's own
  const doc = await cdp.send('Runtime.evaluate', { expression: 'document.querySelector("#world canvas")' }), canv = await cdp.send('DOMDebugger.getEventListeners', { objectId: doc.result.objectId });
  const win = await cdp.send('Runtime.evaluate', { expression: 'window' }), wl = await cdp.send('DOMDebugger.getEventListeners', { objectId: win.result.objectId });
  const dd = await cdp.send('Runtime.evaluate', { expression: 'document' }), dl = await cdp.send('DOMDebugger.getEventListeners', { objectId: dd.result.objectId });
  const touchy = l => /touch|pointer|mouse/.test(l.type), list = [...canv.listeners.filter(touchy).map(l => 'canvas:' + l.type), ...wl.listeners.filter(touchy).map(l => 'window:' + l.type), ...dl.listeners.filter(touchy).map(l => 'document:' + l.type)];
  const trans = await G(() => window.__v2.touch.log.slice());
  const allowed = new Set(['IDLE>BUILDING_PLACEMENT', 'BUILDING_PLACEMENT>IDLE', 'BUILDING_PLACEMENT>BUILDING_DRAG', 'BUILDING_DRAG>BUILDING_PLACEMENT', 'BUILDING_PLACEMENT>PAN', 'PAN>BUILDING_PLACEMENT', 'PINCH>BUILDING_PLACEMENT', 'BUILDING_PLACEMENT>PINCH', 'IDLE>PAN', 'IDLE>PIPE_DRAG', 'IDLE>BUILDING_DRAG', 'PAN>PINCH', 'PAN>IDLE', 'PINCH>PAN', 'PINCH>IDLE', 'PINCH>PINCH', 'PIPE_DRAG>IDLE', 'PIPE_DRAG>PINCH', 'BUILDING_DRAG>IDLE', 'BUILDING_DRAG>PINCH']);
  assert(trans.every(t => allowed.has(t)), 'unexpected transition: ' + trans.filter(t => !allowed.has(t)));
  log('ONE pipeline: touch/pointer/mouse listeners on the page = ' + (list.join(', ') || 'none') + ' (Phaser\'s own); every state change was a legal one (' + [...new Set(trans)].join(', ') + ')');
  assert.deepStrictEqual(errors, []);
  await browser.close(); console.log('ALL TOUCH TESTS PASSED (' + pass + ')');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
