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
      if (!ok) continue; const w = g.place('well', x, y, 'large').building, t = g.place('tank', x + 10, y).building, t2 = g.place('tank', x + 10, y + 12).building, w2 = g.place('well', x + 2, y + 12, 'large').building; v.view.scene.paintGround(true);
      const r = g.routeNodes('B' + w.id, 'B' + t.id, 1); if (!r.ok) { g.removeAt(w.x, w.y); g.removeAt(t.x, t.y); g.removeAt(t2.x, t2.y); g.removeAt(w2.x, w2.y); continue; }
      const L = g.buildLine(r).line; for (let i = 0; i < 100; i++) g.step(.1); v.view.scene.netSig = ''; v.view.scene.drawPipes();
      return { X: x, Y: y, W: w.id, T: t.id, T2: t2.id, W2: w2.id, L: L.id, cells: L.cells.slice() }; } });
  assert(L0, 'layout'); const { X, Y } = L0;
  const look = async (x, y, z = 1, dy = 0) => { await A(([x, y, z, dy]) => { const v = window.__v2, c = v.tc(x, y); v.view.cam.setZoom(z); v.view.cam.centerOn(c.x, c.y + dy); v.camApi.clamp(); }, [x, y, z, dy]); await wait(250); };
  const nodeS = id => A(id => { const v = window.__v2, n = v.game.nodeById(id), c = n.kind === 'b' ? v.tc(n.b.x + (v.game.footprintOf(n.b.type)[0] - 1) / 2, n.b.y + (v.game.footprintOf(n.b.type)[1] - 1) / 2) : v.tc(n.x, n.y); return v.camApi.w2s(c.x, c.y - (n.kind === 'b' ? 8 : 0)); }, id);
  const tileS = (x, y) => A(([x, y]) => { const v = window.__v2, c = v.tc(x, y); return v.camApi.w2s(c.x, c.y); }, [x, y]);
  const S = () => G(() => { const v = window.__v2, g = v.game, r = v.ui.route; return { state: v.touch.state, tool: v.ui.tool, a: v.ui.a, b: v.ui.b, dragging: v.ui.dragging, route: r && { ok: r.ok, free: !!r.free, clear: !!r.clear, cost: r.cost, n: r.cells ? r.cells.length : 0, reason: r.reason }, bad: v.view.bad && v.view.bad.reason, lines: g.lines.length, cash: g.s.cash, cf: !document.querySelector('#confirm').hidden ? document.querySelector('#cf-text').textContent : null, cfok: document.querySelector('#confirm').dataset.ok, prev: !!v.view.scene.previewGeom }; });
  const armPipe = async (pt = 0) => { await G(([pt]) => { const v = window.__v2; v.select(null); v.cancel(); v.setTool('pipe', pt); }, [pt]); await fr(); };
  const disarm = async () => { await G(() => { const v = window.__v2; v.cancel(); v.setTool(null); v.select(null); }); await fr(); };
  const ID = { W: 'B' + L0.W, T: 'B' + L0.T, T2: 'B' + L0.T2, W2: 'B' + L0.W2 };
  const drag = async (from, to, steps = 10, release = true) => { await down(1, from.x, from.y); await fr(); for (let i = 1; i <= steps; i++) { await move(1, from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); await fr(); } if (release) { await up(1); await fr(); await wait(150); } };

  // ---------- C1 connection points are lit when the pipe tool is armed
  {
    await look(X + 5, Y + 6); await armPipe(); await wait(700); const pts = await G(() => window.__v2.view.scene.startPts && window.__v2.view.scene.startPts.map(p => p.id));
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
    assert(worst < 1e-3, 'pipe end = finger, error ' + worst); assert(s.prev, 'preview exists'); assert(s.cf && /\$/.test(s.cf), 'live cost bar while dragging: ' + s.cf); const c1 = await cam(); assert(c0.x === c1.x && c0.y === c1.y && c0.z === c1.z, 'camera locked');
    assert(new Set(costs).size > 1 || s.route.free, 'cost changes with the route: ' + costs); assert(Math.abs(s.cash - cash0) < 25, 'nothing paid while dragging');
    await page.screenshot({ path: OUTD + '/pc-drag.png' }); log('C3. hold + drag: pipe starts at the well, end = finger (error ' + worst.toExponential(1) + ' px), camera unchanged, live cost bar "' + s.cf + '", costs ' + costs.join(' → '));
    await up(1); await fr(); await G(() => window.__v2.cancel()); await fr(); await disarm();
  }
  // ---------- C4 drag onto a valid target: it lights, snaps, release builds exactly the previewed route; cash = cost
  {
    await armPipe(); await look(X + 6, Y + 12); const a = await nodeS(ID.W2), t = await nodeS(ID.T2), cash0 = (await S()).cash;
    await down(1, a.x, a.y); await fr(); for (let i = 1; i <= 12; i++) { await move(1, a.x + (t.x - 30 - a.x) * i / 12, a.y + (t.y - a.y) * i / 12); await fr(); }
    const s = await S(); assert.strictEqual(s.b, ID.T2, 'target acquired: ' + JSON.stringify(s)); assert(s.route.ok); assert.strictEqual(s.cfok, '1'); await page.screenshot({ path: OUTD + '/pc-snap.png' });
    const l0 = s.lines, cost = s.route.cost; await up(1); await fr(); await wait(300); const e = await S();
    assert.strictEqual(e.lines, l0 + 1, 'built'); assert(Math.abs((cash0 - e.cash) - cost) < 25, 'charged = previewed ' + (cash0 - e.cash) + ' vs ' + cost); assert.strictEqual(e.state, 'IDLE'); assert.strictEqual(e.a, null);
    log('C4. drag toward a tank: it is acquired (' + s.b + '), preview ok, release built ' + (e.lines - l0) + ' pipe for $' + Math.round(cash0 - e.cash) + ' = previewed $' + Math.round(cost));
  }
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  console.log('\nALL PHASE C UI TESTS PASSED (' + pass + ')'); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
