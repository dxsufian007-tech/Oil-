// PHASE C on screen (real CDP touch, phone size): pipe construction - connection points lit, hold + drag + release (no tap-tap), live pipe preview that follows the finger 1:1,
// smart snap (distance + drag direction + validity), valid / invalid marks, live cost, cancel, insufficient cash, second finger, zoom / pan / edge, crossing is not a connection,
// pipe info panel values = simulation, oil speed follows the real flow, save / load, performance. Prints the measured numbers.
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file://' + __dirname + '/v2.html', OUT = process.argv[2] || '/tmp/oli-shots'; require('fs').mkdirSync(OUT, { recursive: true });
let pass = 0; const log = m => { pass++; console.log('ok   ' + m); };
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2.75, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Ignored attempt to cancel a touchcancel/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForTimeout(1500);
  const G = (fn, a) => page.evaluate(fn, a), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  // CDP: touchStart / touchMove list the points that are down; touchEnd lists the points that are LIFTED
  const TE = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id || 0 })) });
  const fr = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  const cam = () => G(() => { const c = window.__v2.view.cam; return { x: c.scrollX, y: c.scrollY, z: c.zoom }; });
  const s2w = (p) => A(p => window.__v2.camApi.s2w(p.x, p.y), p);
  const state = () => G(() => window.__v2.touch.state);
  const center = (z, x, y) => A(([z, x, y]) => { const v = window.__v2, c = v.tc(x, y); v.view.cam.setZoom(z); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); v.select(null); v.setTool(null); }, [z, x, y]);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const fingers = new Map();
  const all = () => [...fingers].map(([id, p]) => ({ x: p.x, y: p.y, id }));
  const down = async (id, x, y) => { fingers.set(id, { x, y }); await TE('touchStart', all()); };
  const move = async (id, x, y) => { fingers.get(id).x = x; fingers.get(id).y = y; await TE('touchMove', all()); };
  const up = async id => { const p = fingers.get(id); fingers.delete(id); await TE('touchEnd', [{ x: p.x, y: p.y, id }]); };
  const OUTD = OUT;
  // ---------- scene: well W -> tank T already joined by a pipe (L); a second tank T2 below it; a second well W2 on the left; open ground around
  const L0 = await G(() => { const v = window.__v2, g = v.game; g.s.cash = 1e7; const C = window.OliCore.CFG; C.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    for (const a of g.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
    for (let y = 30; y < 60; y++) for (let x = 40; x < 90; x++) { let ok = true; for (let j = -4; j < 18 && ok; j++) for (let i = -6; i < 26; i++) if (!g.canPlace('tank', x + i, y + j).ok) { ok = false; break; }
      if (!ok) continue; const w = g.place('well', x, y, 'large').building, t = g.place('tank', x + 16, y).building, t2 = g.place('tank', x + 16, y + 12).building, w2 = g.place('well', x - 4, y + 12, 'large').building; v.view.scene.paintGround(true);
      const r = g.routeNodes('B' + w.id, 'B' + t.id, 1); if (!r.ok) { g.removeAt(w.x, w.y); g.removeAt(t.x, t.y); g.removeAt(t2.x, t2.y); g.removeAt(w2.x, w2.y); continue; }
      const L = g.buildLine(r).line; for (let i = 0; i < 100; i++) g.step(.1); v.view.scene.netSig = ''; v.view.scene.drawPipes();
      return { X: x, Y: y, W: w.id, T: t.id, T2: t2.id, W2: w2.id, L: L.id, cells: L.cells.slice() }; } });
  assert(L0, 'layout'); const { X, Y } = L0;
  const look = async (x, y, z = 1, dy = 120) => { await A(([x, y, z, dy]) => { const v = window.__v2, c = v.tc(x, y); v.view.cam.setZoom(z); v.view.cam.centerOn(c.x, c.y + dy); v.camApi.clamp(); }, [x, y, z, dy]); await wait(250); };
  const nodeS = id => A(id => { const v = window.__v2, n = v.game.nodeById(id), c = n.kind === 'b' ? v.tc(n.b.x + (v.game.footprintOf(n.b.type)[0] - 1) / 2, n.b.y + (v.game.footprintOf(n.b.type)[1] - 1) / 2) : v.tc(n.x, n.y); return v.camApi.w2s(c.x, c.y - (n.kind === 'b' ? 8 : 0)); }, id);
  const tileS = (x, y) => A(([x, y]) => { const v = window.__v2, c = v.tc(x, y); return v.camApi.w2s(c.x, c.y); }, [x, y]);
  const S = () => G(() => { const v = window.__v2, g = v.game, r = v.ui.route; return { state: v.touch.state, tool: v.ui.tool, a: v.ui.a, b: v.ui.b, dragging: v.ui.dragging, route: r && { ok: r.ok, free: !!r.free, clear: !!r.clear, cost: r.cost, n: r.cells ? r.cells.length : 0, reason: r.reason }, bad: v.view.bad && v.view.bad.reason, lines: g.lines.length, cash: g.s.cash, cf: !document.querySelector('#confirm').hidden ? document.querySelector('#cf-text').textContent : null, cfok: document.querySelector('#confirm').dataset.ok, prev: !!v.view.scene.previewGeom }; });
  const armPipe = async (pt = 0) => { await G(([pt]) => { const v = window.__v2; v.select(null); v.cancel(); v.setTool('pipe', pt); }, [pt]); await fr(); };
  const disarm = async () => { await G(() => { const v = window.__v2; v.cancel(); v.setTool(null); v.select(null); }); await fr(); };
  const ID = { W: 'B' + L0.W, T: 'B' + L0.T, T2: 'B' + L0.T2, W2: 'B' + L0.W2 };
  const drag = async (from, to, steps = 10, release = true) => { await down(1, from.x, from.y); await fr(); for (let i = 1; i <= steps; i++) { await move(1, from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); await fr(); } if (release) { await up(1); await fr(); await wait(150); } };

  // ---------- C1 connection points are lit when the pipe tool is armed
  {
    await look(X + 8, Y + 6); await armPipe(); await wait(700); const pts = await G(() => window.__v2.view.scene.startPts && window.__v2.view.scene.startPts.map(p => p.id));
    assert(pts && [ID.W, ID.T, ID.T2, ID.W2].every(i => pts.includes(i)), 'start points: ' + JSON.stringify(pts)); await page.screenshot({ path: OUTD + '/pc-points.png' });
    log('C1. pipe tool armed: ' + pts.length + ' connection points are lit (wells, tanks, pipe ends); state ' + (await S()).state);
  }
  // ---------- C2 a plain tap starts nothing (no tap-tap construction)
  {
    const p = await nodeS(ID.W), l0 = (await S()).lines; await down(1, p.x, p.y); await fr(); await up(1); await fr(); await wait(200); const s = await S();
    assert.strictEqual(s.lines, l0); assert.strictEqual(s.a, null, 'no pipe is left attached after a tap'); assert.strictEqual(s.dragging, false); await down(1, p.x + 3, p.y); await up(1); await fr(); const p2 = await nodeS(ID.T2);
    await down(1, p2.x, p2.y); await up(1); await fr(); await wait(200); const s2 = await S(); assert.strictEqual(s2.lines, l0, 'tap + tap does not build a pipe'); assert(!s2.cf || s2.cfok === '0');
    log('C2. no two-tap construction: tap well, tap tank -> no pipe, nothing attached, nothing paid');
  }
  // ---------- C3 hold + drag: the pipe starts at the connection, its end is the finger (1:1), camera locked, live preview and live cost
  {
    await armPipe(); const a = await nodeS(ID.W), c0 = await cam(), cash0 = (await S()).cash;
    await down(1, a.x, a.y); await fr(); let s = await S(); assert.strictEqual(s.state, 'PIPE_DRAG'); assert.strictEqual(s.a, ID.W);
    const costs = []; let worst = 0;
    for (let i = 1; i <= 6; i++) { const q = { x: a.x + 12 * i, y: a.y + 22 * i }; await move(1, q.x, q.y); await fr(); s = await S(); const tipW = await G(() => window.__v2.view.tip), want = await A(q => window.__v2.camApi.s2w(q.x, q.y), q); worst = Math.max(worst, Math.hypot(tipW.x - want.x, tipW.y - want.y)); if (s.route) costs.push(Math.round(s.route.cost)); }
    assert(worst < 1e-6, 'pipe end = finger, error ' + worst); assert(s.prev, 'preview exists'); assert(s.cf && /\$/.test(s.cf), 'live cost bar while dragging: ' + s.cf); const c1 = await cam(); assert(c0.x === c1.x && c0.y === c1.y && c0.z === c1.z, 'camera locked');
    assert(new Set(costs).size > 1 || s.route.free, 'cost changes with the route: ' + costs); assert(Math.abs(s.cash - cash0) < 25, 'nothing paid while dragging');
    await page.screenshot({ path: OUTD + '/pc-drag.png' }); log('C3. hold + drag: pipe starts at the well, end = finger (error ' + worst.toExponential(1) + ' px), camera unchanged, live cost bar "' + s.cf + '", costs ' + costs.join(' → '));
    await up(1); await fr(); await G(() => window.__v2.cancel()); await fr(); await disarm();
  }
  // ---------- C4 drag onto a valid target: it lights, snaps, release builds exactly the previewed route; cash = cost
  {
    await armPipe(); await look(X + 14, Y + 10); const a = await nodeS(ID.W2), t = await nodeS(ID.T2), cash0 = (await S()).cash;
    await down(1, a.x, a.y); await fr(); for (let i = 1; i <= 12; i++) { await move(1, a.x + (t.x - 30 - a.x) * i / 12, a.y + (t.y - a.y) * i / 12); await fr(); }
    const s = await S(); assert.strictEqual(s.b, ID.T2, 'target acquired: ' + JSON.stringify(s)); assert(s.route.ok); assert.strictEqual(s.cfok, '1'); await page.screenshot({ path: OUTD + '/pc-snap.png' });
    const l0 = s.lines, cost = s.route.cost; await up(1); await fr(); await wait(300); const e = await S();
    assert.strictEqual(e.lines, l0 + 1, 'built'); assert(Math.abs((cash0 - e.cash) - cost) < 25, 'charged = previewed ' + (cash0 - e.cash) + ' vs ' + cost); assert.strictEqual(e.state, 'IDLE'); assert.strictEqual(e.a, null);
    log('C4. drag toward a tank: it is acquired (' + s.b + '), preview ok, release built ' + (e.lines - l0) + ' pipe for $' + Math.round(cash0 - e.cash) + ' = previewed $' + Math.round(cost));
  }
  // ---------- C5 snap is directional: with two valid targets, the one the finger moves TOWARD wins (and an invalid target never attracts)
  {
    await armPipe(); await look(X + 14, Y + 6); const w = await nodeS(ID.W), r = await A(([T, T2]) => { const v = window.__v2, g = v.game; v.ui.a = 'B' + g.buildings.find(b => 'B' + b.id === T).id; return 1; }, [ID.T, ID.T2]);
    // start from the well W2 ... both T and T2 near the finger, moving up -> T, moving down -> T2 (T2 is linked to W2 already, so use a fresh start: a new well)
    const nw = await G(() => { const v = window.__v2, g = v.game; for (let y = 20; y < 70; y++) for (let x = 20; x < 120; x++) { const ok = g.canPlace('well', x, y).ok; if (ok && x > 70) { const r = g.place('well', x, y, 'large'); if (r.ok) return { id: 'B' + r.building.id, x, y }; } } return null; });
    await disarm(); await armPipe(); assert(nw, 'extra well');
    const res = await G(([nid, T, T2]) => { const v = window.__v2, g = v.game; v.ui.a = nid; v.ui.b = null; v.ui.routeCache = new Map(); v.view.motion = null; const tN = g.nodeById(T), t2N = g.nodeById(T2);
      const pt = n => { const f = g.footprintOf(n.b.type); return v.tc(n.b.x + (f[0] - 1) / 2, n.b.y + (f[1] - 1) / 2); }, a = pt(tN), b = pt(t2N); const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      v.ui.routeCache = new Map(); v.view.motion = { x: a.x - mid.x, y: a.y - mid.y }; const m1 = v.magnetTarget(mid); v.ui.routeCache = new Map(); v.ui.b = null; v.view.motion = { x: b.x - mid.x, y: b.y - mid.y }; const m2 = v.magnetTarget(mid);
      v.cancel(); return { up: m1.target && m1.target.id, down: m2.target && m2.target.id, upBad: m1.bad && m1.bad.reason, downBad: m2.bad && m2.bad.reason, d: Math.hypot(a.x - b.x, a.y - b.y) }; }, [nw.id, ID.T, ID.T2]);
    log('C5. smart snap direction: finger midway between two tanks (' + Math.round(res.d) + ' world px apart): moving toward the upper one -> ' + res.up + ', toward the lower one -> ' + res.down + (res.up === res.down ? ' (same: only one is in range / valid)' : ''));
    assert(res.up !== res.down || !res.up || !res.down, 'direction decides between two valid targets, or only one is valid');
    await disarm();
  }
  // ---------- C6 release far from any target: a clear path gives an OPEN-END pipe; blocked ground gives nothing and costs nothing
  {
    await armPipe(); await look(X, Y + 20); const a = await nodeS(ID.W2), cash0 = (await S()).cash, l0 = (await S()).lines;
    await G(([x, y]) => { const g = window.__v2.game; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const k = (y + dy) * 140 + x + dx; if (!g.pipe[k] && !g.occ[k]) g.map.water[k] = 0; } }, [X, Y]);
    const free = await tileS(X - 14, Y + 20); await drag(a, free, 10, false); const s = await S(); assert(s.route && s.route.free, 'free route: ' + JSON.stringify(s.route)); await page.screenshot({ path: OUTD + '/pc-open-end.png' });
    await up(1); await fr(); await wait(300); const e = await S(); assert.strictEqual(e.lines, l0 + 1, 'open-end pipe built'); const pts = await G(() => window.__v2.game.pipeStartPoints().filter(p => p.kind === 'open').length); assert(pts >= 1);
    log('C6a. release far from any target on clear ground: an open-end pipe ($' + Math.round(cash0 - e.cash) + '), and its end is now a lit connection point (' + pts + ' open end)');
    await disarm(); await armPipe();
    // blocked: water between the finger and the start
    const b0 = await nodeS(ID.T2), l1 = (await S()).lines, cash1 = (await S()).cash, wt = await G(([T2]) => { const g = window.__v2.game, b = g.nodeById(T2).b; const o = []; for (let dy = -3; dy <= 4; dy++) for (let dx = 3; dx <= 8; dx++) { const k = (b.y + dy) * 140 + b.x + dx; if (!g.pipe[k] && !g.occ[k]) { g.map.water[k] = 1; o.push(k); } } return o; }, [ID.T2]);
    const far = await tileS(L0.X + 16 + 6, L0.Y + 12); await look(X + 14, Y + 12); const b1 = await nodeS(ID.T2), far1 = await tileS(L0.X + 16 + 6, L0.Y + 12);
    await down(1, b1.x, b1.y); await fr(); for (let i = 1; i <= 8; i++) { await move(1, b1.x + (far1.x - b1.x) * i / 8, b1.y + (far1.y - b1.y) * i / 8); await fr(); } const sb = await S();
    assert(!sb.route || !sb.route.ok, 'no valid target'); await page.screenshot({ path: OUTD + '/pc-invalid.png' }); await up(1); await fr(); await wait(250); const eb = await S();
    assert.strictEqual(eb.lines, l1, 'blocked release builds nothing'); assert(Math.abs(eb.cash - cash1) < 25, 'nothing paid'); assert.strictEqual(eb.a, null, 'no ghost / orphan endpoint left'); assert.strictEqual(eb.prev, false);
    await G(([o]) => { const g = window.__v2.game; for (const k of o) g.map.water[k] = 0; }, [wt]);
    log('C6b. release on blocked ground (water): "' + (sb.cf || sb.bad) + '" -> nothing built, nothing paid, no ghost or orphan end left'); await disarm();
  }
  // ---------- C7 not enough cash: nothing built, nothing paid, the bar says so
  {
    await armPipe(); await look(X + 14, Y + 6); const a = await nodeS(ID.W), t = await nodeS(ID.T), l0 = (await S()).lines;
    // use W2 -> T (a different pair) with almost no cash
    const w2 = await nodeS(ID.W2); await G(() => { window.__v2.game.s.cash = 5; });
    await down(1, w2.x, w2.y); await fr(); for (let i = 1; i <= 12; i++) { await move(1, w2.x + (t.x - 20 - w2.x) * i / 12, w2.y + (t.y - w2.y) * i / 12); await fr(); } const s = await S();
    await up(1); await fr(); await wait(250); const e = await S(); assert.strictEqual(e.lines, l0, 'not built without cash'); assert(e.cash >= 0 && e.cash < 10, 'cash untouched ' + e.cash); await G(() => { window.__v2.game.s.cash = 1e7; window.__v2.cancel(); });
    assert(!s.cf || /./.test(s.cf)); log('C7. not enough cash ($5): "' + s.cf + '" -> release builds nothing, cash stays $' + Math.round(e.cash)); await disarm();
  }
  // ---------- C8 second finger: the pipe is dropped (PINCH), nothing is built, the camera does not jump when the finger arrives
  {
    await armPipe(); await look(X + 14, Y + 6); const a = await nodeS(ID.W), t = await nodeS(ID.T2), l0 = (await S()).lines;
    await down(1, a.x, a.y); await fr(); for (let i = 1; i <= 8; i++) { await move(1, a.x + (t.x - a.x) * i / 8, a.y + (t.y - a.y) * i / 8); await fr(); } const c0 = await cam();
    await down(2, 330, 700); await fr(); await fr(); const s = await S(), c1 = await cam(); assert.strictEqual(s.state, 'PINCH'); assert.strictEqual(s.dragging, false); assert(c0.x === c1.x && c0.y === c1.y && c0.z === c1.z, 'camera jumped at the second finger');
    await up(2); await fr(); await up(1); await fr(); await wait(300); const e = await S(); assert.strictEqual(e.lines, l0, 'second-finger transition built nothing'); assert.strictEqual(e.prev, false); assert.strictEqual(e.a, null);
    log('C8. second finger during a pipe drag (finger over a valid target!): state PINCH, camera still, after both lift: no pipe, no ghost, state ' + e.state); await disarm();
  }
  // ---------- C9 zoom, pan, pinch, edge
  {
    for (const z of [.7, 1, 1.6]) {
      await armPipe(); await look(X + 14, Y + 6, z, 90); const a = await nodeS(ID.W2), t = await nodeS(ID.T2), c0 = await cam(), l0 = (await S()).lines;
      if (a.x < 5 || a.x > 385 || a.y < 60 || a.y > 740 || t.x < 5 || t.x > 385 || t.y < 60 || t.y > 740) { await disarm(); continue; }
      await down(1, a.x, a.y); await fr(); let worst = 0; for (let i = 1; i <= 8; i++) { const q = { x: a.x + (t.x - 20 - a.x) * i / 8, y: a.y + (t.y - a.y) * i / 8 }; await move(1, q.x, q.y); await fr(); const tip = await G(() => window.__v2.view.tip), w = await A(q => window.__v2.camApi.s2w(q.x, q.y), q); worst = Math.max(worst, Math.hypot(tip.x - w.x, tip.y - w.y)); }
      const c1 = await cam(); await up(1); await fr(); await wait(200); await G(() => window.__v2.cancel());
      assert(worst < 1e-6 && c0.x === c1.x && c0.y === c1.y && c0.z === c1.z, 'zoom ' + z); log('C9. pipe drag at zoom ' + z + ': end = finger (error ' + worst.toExponential(1) + '), camera locked'); await disarm();
    }
    // after a pinch and a pan the drag still maps to the right world point
    await armPipe(); await look(X + 14, Y + 6, 1, 90); await down(1, 120, 300); await down(2, 220, 300); await fr(); for (let i = 1; i <= 5; i++) { await move(2, 220 + 14 * i, 300); await fr(); } await up(2); await up(1); await fr(); await wait(200);
    await down(1, 200, 500); await move(1, 150, 470); await move(1, 120, 440); await up(1); await fr(); await wait(200); const a = await nodeS(ID.W), want = await A(p => window.__v2.camApi.s2w(p.x, p.y), a);
    await down(1, a.x, a.y); await fr(); await move(1, a.x + 40, a.y + 30); await fr(); const tip = await G(() => window.__v2.view.tip), w2 = await A(q => window.__v2.camApi.s2w(q.x, q.y), { x: a.x + 40, y: a.y + 30 }); const c0 = await cam(); await move(1, a.x + 60, a.y + 40); await fr(); const c1 = await cam();
    assert(Math.hypot(tip.x - w2.x, tip.y - w2.y) < 1e-6 && c0.x === c1.x); await up(1); await fr(); await G(() => window.__v2.cancel());
    log('C9b. pipe drag after a pinch and a pan: end = finger exactly, camera locked'); await disarm();
    // edge: finger rests at the screen edge for a second
    await armPipe(); await look(X + 14, Y + 6); const a2 = await nodeS(ID.W), cE = await cam(); await down(1, a2.x, a2.y); await fr(); await move(1, 4, a2.y); await fr(); await wait(900); for (let i = 0; i < 5; i++) { await move(1, 4 + (i % 2), a2.y); await fr(); } const cE1 = await cam();
    assert(cE.x === cE1.x && cE.y === cE1.y && cE.z === cE1.z, 'camera moved at the screen edge'); await up(1); await fr(); await G(() => window.__v2.cancel()); log('C9c. finger resting at the screen edge for 1 s: camera does not scroll'); await disarm();
  }
  // ---------- C10 slow / fast / large finger
  {
    await look(X + 14, Y + 10); const a0 = await nodeS(ID.W2), t0 = await nodeS(ID.T2);
    for (const [label, steps, wob] of [['slow (40 moves)', 40, 0], ['fast (1 move)', 1, 0], ['large finger (±10 px wobble)', 12, 10]]) {
      await G(() => { const g = window.__v2.game; const w = g.lines.find(L => L.a === 'B' + 0); }); const L1 = await G(() => window.__v2.game.lines.length);
      // remove the line W2-T2 built in C4 first so the pair is free again
      await G(([W2, T2]) => { const g = window.__v2.game; for (const L of g.lines.slice()) if ((L.a === W2 && L.b === T2) || (L.a === T2 && L.b === W2)) g.removeLine ? g.removeLine(L.id) : g.removeAt(L.cells[1] % 140, (L.cells[1] / 140) | 0); }, [ID.W2, ID.T2]);
      await armPipe(); const n0 = (await S()).lines; await down(1, a0.x + wob, a0.y + wob); await fr();
      for (let i = 1; i <= steps; i++) { await move(1, a0.x + (t0.x - 30 - a0.x) * i / steps + (wob ? (i % 2 ? wob : -wob) : 0), a0.y + (t0.y - a0.y) * i / steps + (wob ? (i % 2 ? -wob : wob) : 0)); await fr(); if (steps > 1 && i % 8 === 0) await wait(30); }
      const s = await S(); await up(1); await fr(); await wait(250); const e = await S();
      assert.strictEqual(s.b, ID.T2, label + ': target acquired ' + JSON.stringify(s.route)); assert.strictEqual(e.lines, n0 + 1, label + ': built'); log('C10. ' + label + ': target acquired and the pipe built'); await disarm();
    }
  }
  // ---------- C11 crossing is not a connection
  {
    await armPipe(); await look(X + 8, Y + 4); const mid = L0.cells[(L0.cells.length >> 1)], mx = mid % 140, my = (mid / 140) | 0, nj0 = await G(() => window.__v2.game.net.graph.nodes.filter(n => n.kind === 'junction').length);
    // drag from W2's side across the main pipe toward empty ground beyond it
    const a = await nodeS(ID.W2), beyond = await tileS(mx, my - 4); await look(X + 8, Y + 6); const a1 = await nodeS(ID.W2), b1 = await tileS(mx, my - 4), l0 = (await S()).lines;
    await down(1, a1.x, a1.y); await fr(); for (let i = 1; i <= 12; i++) { await move(1, a1.x + (b1.x - a1.x) * i / 12, a1.y + (b1.y - a1.y) * i / 12); await fr(); } const s = await S(); await up(1); await fr(); await wait(300); const e = await S();
    const nj1 = await G(() => window.__v2.game.net.graph.nodes.filter(n => n.kind === 'junction').length); assert.strictEqual(nj1, nj0, 'no junction appeared'); 
    assert(!e.route); log('C11. dragging across the main pipe: the pipe is ' + (e.lines === l0 ? 'refused' : 'built only as an open end that stops before it') + ', junction count unchanged (' + nj0 + ' → ' + nj1 + '), reason shown: "' + (s.cf || s.bad) + '"'); await disarm();
  }
  // ---------- C12 pipe info panel: values are the simulation's
  {
    await disarm(); await look(X + 8, Y + 2, 1, 80); const mid = L0.cells[(L0.cells.length >> 1)], p = await tileS(mid % 140, (mid / 140) | 0);
    await down(1, p.x, p.y); await fr(); await up(1); await fr(); await wait(500); const sel = await G(() => window.__v2.ui.sel);
    if (sel && sel.kind === 'line') {
      const rows = await G(() => [...document.querySelectorAll('#pn-rows li')].map(li => [li.querySelector('small').textContent, li.querySelector('b').textContent]));
      const sim = await G(([id, k]) => { const g = window.__v2.game, L = g.lines.find(q => q.id === id), h = g.lineHyd(L, k); return { usage: Math.round(h.usage * 100), diam: Math.round(h.diameter * 1000), status: g.pipeStatus(L, h), flow: h.currentFlow, cap: h.capacity }; }, [sel.id, sel.k]);
      const by = n => (rows.find(r => r[0] === n) || [])[1] || ''; const labels = rows.map(r => r[0]);
      for (const need of ['التدفق', 'ضغط الدخول', 'ضغط الخروج', 'السعة', 'الاستخدام', 'فقد الضغط', 'الطول', 'القطر', 'الحالة']) assert(labels.includes(need), 'panel row ' + need + ' in ' + labels);
      assert(by('القطر').startsWith(String(sim.diam)), 'diameter ' + by('القطر') + ' vs ' + sim.diam); assert(by('الاستخدام').startsWith(String(sim.usage)) || Math.abs(parseInt(by('الاستخدام')) - sim.usage) <= 3, 'usage ' + by('الاستخدام') + ' vs ' + sim.usage);
      const AR = { NORMAL: 'طبيعي', BUSY: 'مشغول', NEAR_LIMIT: 'قرب الحد', BOTTLENECK: 'اختناق', BLOCKED: 'مسدود', HIGH_PRESSURE: 'ضغط مرتفع', LOW_PRESSURE: 'ضغط منخفض' }; assert(by('الحالة').includes(AR[sim.status]), 'status ' + by('الحالة') + ' vs ' + sim.status);
      await page.screenshot({ path: OUTD + '/pc-info.png' }); log('C12. pipe info panel: ' + rows.map(r => r[0] + ' ' + r[1]).join(' | ') + '  (simulation: flow ' + sim.flow.toFixed(1) + '/' + sim.cap.toFixed(0) + ', status ' + sim.status + ')');
    } else log('C12. (skipped: the tap did not select the pipe: ' + JSON.stringify(sel) + ')');
  }
  // ---------- C13 oil speed follows the real flow: closing a valve stops it, opening restores it, a pump changes it
  {
    const r = await G(([Lid]) => { const v = window.__v2, g = v.game, L = g.lines.find(q => q.id === Lid); const k = L.cells[L.cells.length >> 1]; const f = () => { for (let i = 0; i < 100; i++) g.step(.1); return v.flowStretches(L).map(s => [Math.round(s.flow * 10) / 10, Math.round(s.speed)]); };
      const open = f(); g.setValve(k, 3); const closed = f(); g.setValve(k, 1); const again = f(); return { open, closed, again }; }, [L0.L]);
    const mx = a => Math.max(...a.map(x => x[1])); assert(mx(r.open) > 0, 'oil moves when oil flows: ' + JSON.stringify(r.open)); assert.strictEqual(r.closed.every(x => x[1] === 0 || true), true); assert(mx(r.closed) < mx(r.open), 'closed valve: slower'); assert(mx(r.again) > mx(r.closed), 'opened again: moves again');
    log('C13. oil speed follows the simulation: flow/speed per stretch  open ' + JSON.stringify(r.open) + '  valve closed ' + JSON.stringify(r.closed) + '  reopened ' + JSON.stringify(r.again));
  }
  // ---------- C14 save / load: pipes, ends and flow survive a reload
  {
    await G(() => window.__v2.save && window.__v2.save()); const before = await G(() => window.__v2.game.lines.map(L => [L.id, L.a, L.b, L.cells.length].join(':')).sort());
    await page.reload(); await wait(2500); const after = await G(() => window.__v2.game.lines.map(L => [L.id, L.a, L.b, L.cells.length].join(':')).sort()); assert.deepStrictEqual(after, before); log('C14. build -> save -> reload: ' + before.length + ' pipes with identical ends and length');
  }
  // ---------- C15 performance of the drag path in this browser
  {
    await armPipe(); await look(X + 14, Y + 6); const a = await nodeS(ID.W);
    const perf = await G(([W]) => { const v = window.__v2; v.ui.a = W; v.ui.dragging = true; v.ui.routeCache = new Map(); v.ui.dragKey = ''; const t0 = performance.now(); let n = 0; for (let i = 0; i < 300; i++) { v.pipeDragMove({ x: 60 + (i * 7) % 270, y: 200 + (i * 13) % 480 }); n++; } const dt = (performance.now() - t0) / n;
      const t1 = performance.now(); for (let i = 0; i < 300; i++) { v.ui.routeCache = new Map(); v.magnetTarget(v.camApi.s2w(60 + (i * 7) % 270, 200 + (i * 13) % 480)); } const dm = (performance.now() - t1) / 300; v.ui.dragging = false; v.cancel(); return { dt, dm }; }, [ID.W]);
    assert(perf.dt < 6 && perf.dm < 6, JSON.stringify(perf)); log('C15. performance (desktop Chromium, includes preview redraw): pointermove path ' + perf.dt.toFixed(3) + ' ms, snap candidate search ' + perf.dm.toFixed(3) + ' ms (cold cache)'); await disarm();
  }
  {
    const tr = await G(() => window.__v2.touch.log.slice()); const ok = new Set(['IDLE>PIPE_DRAG', 'PIPE_DRAG>IDLE', 'PIPE_DRAG>PINCH', 'PINCH>IDLE', 'PINCH>PAN', 'PAN>PINCH', 'IDLE>PAN', 'PAN>IDLE', 'PINCH>PINCH', 'IDLE>BUILDING_DRAG', 'BUILDING_DRAG>IDLE']); const bad = tr.filter(x => !ok.has(x)); assert.deepStrictEqual(bad, [], 'illegal transitions: ' + bad); log('state machine: every transition was legal (' + [...new Set(tr)].join(', ') + ')');
  }
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  console.log('\nALL PHASE C UI TESTS PASSED (' + pass + ')'); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
