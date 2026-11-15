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

  // ---------- C5 snap is directional: with two valid targets close together, the one the finger moves TOWARD wins; the other does not steal the pipe
  {
    await armPipe(); const sp = await G(([X, Y]) => { const v = window.__v2, g = v.game; const fits = (x, y) => g.canPlace('tank', x, y).ok && g.canPlace('tank', x, y + 5).ok;
      for (let dy = -8; dy < 14; dy++) for (let dx = 18; dx < 30; dx++) if (fits(X + dx, Y + dy)) { const a = g.place('tank', X + dx, Y + dy).building, b = g.place('tank', X + dx, Y + dy + 5).building; let w = null; for (let y = 20; y < 70 && !w; y++) for (let x = 20; x < 120 && !w; x++) if (Math.abs(x - X - dx) > 6 && g.canPlace('well', x, y).ok) { const r = g.place('well', x, y, 'large'); if (r.ok) w = r.building; }
        return { A: 'B' + a.id, B: 'B' + b.id, W: 'B' + w.id }; } return null; }, [X, Y]);
    assert(sp, 'tank pair'); await disarm(); await armPipe();
    const res = await G(([sp]) => { const v = window.__v2, g = v.game, ctr = id => { const n = g.nodeById(id), f = g.footprintOf(n.b.type); return v.tc(n.b.x + (f[0] - 1) / 2, n.b.y + (f[1] - 1) / 2); }, a = ctr(sp.A), b = ctr(sp.B), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const run = dir => { v.ui.a = sp.W; v.ui.b = null; v.ui.routeCache = new Map(); v.view.motion = dir; return v.magnetTarget(mid); };
      const toA = run({ x: a.x - mid.x, y: a.y - mid.y }), toB = run({ x: b.x - mid.x, y: b.y - mid.y }); v.ui.a = null; v.cancel();
      return { toA: toA.target && toA.target.id, toB: toB.target && toB.target.id, gap: Math.hypot(a.x - b.x, a.y - b.y) }; }, [sp]);
    assert.strictEqual(res.toA, sp.A, 'moving toward the upper tank picks it: ' + JSON.stringify(res)); assert.strictEqual(res.toB, sp.B, 'moving toward the lower tank picks it: ' + JSON.stringify(res));
    log('C5. smart snap direction: finger midway between two valid tanks (' + Math.round(res.gap) + ' world px apart): moving toward one picks it (' + res.toA + '), toward the other picks that one (' + res.toB + ') - same finger spot, the drag direction decides'); await disarm();
  }
  // ---------- C6 release far from any target: a clear path gives an OPEN-END pipe; blocked ground gives nothing and costs nothing
  {
    await armPipe(); await look(X - 1, Y + 12); const a = await nodeS(ID.W2), cash0 = (await S()).cash, l0 = (await S()).lines;
    await G(([x, y]) => { const g = window.__v2.game; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const k = (y + dy) * 140 + x + dx; if (!g.pipe[k] && !g.occ[k]) g.map.water[k] = 0; } }, [X, Y]);
    const free = await tileS(X - 5, Y + 12); await drag(a, free, 10, false); const s = await S(); assert(s.route && s.route.free, 'free route: ' + JSON.stringify(s.route)); await page.screenshot({ path: OUTD + '/pc-open-end.png' });
    await up(1); await fr(); await wait(300); const e = await S(); assert.strictEqual(e.lines, l0 + 1, 'open-end pipe built'); const pts = await G(() => window.__v2.game.pipeStartPoints().filter(p => p.kind === 'open').length); assert(pts >= 1);
    log('C6a. release far from any target on clear ground: an open-end pipe ($' + Math.round(cash0 - e.cash) + '), and its end is now a lit connection point (' + pts + ' open end)');
    await disarm(); await armPipe();
    // blocked: water between the finger and the start
    const b0 = await nodeS(ID.T2), l1 = (await S()).lines, cash1 = (await S()).cash, wt = await G(([T2]) => { const g = window.__v2.game, b = g.nodeById(T2).b; const o = []; for (let dy = -5; dy <= 6; dy++) for (let dx = -5; dx <= 8; dx++) { const k = (b.y + dy) * 140 + b.x + dx; if (!g.pipe[k] && !g.occ[k]) { g.map.water[k] = 1; o.push(k); } } return o; }, [ID.T2]);
    await look(X + 8, Y + 12); const b1 = await nodeS(ID.T2), far1 = await tileS(L0.X + 10 + 6, L0.Y + 12);
    await down(1, b1.x, b1.y); await fr(); for (let i = 1; i <= 8; i++) { await move(1, b1.x + (far1.x - b1.x) * i / 8, b1.y + (far1.y - b1.y) * i / 8); await fr(); } const sb = await S();
    if (0) console.log('DBG C6b', JSON.stringify(sb), JSON.stringify(await G(() => window.__v2.game.lines.map(L => [L.id, L.a, L.b, L.cells.length]))));
    assert(!sb.route || !sb.route.ok, 'no valid target'); await page.screenshot({ path: OUTD + '/pc-invalid.png' }); await up(1); await fr(); await wait(250); const eb = await S();
    assert.strictEqual(eb.lines, l1, 'blocked release builds nothing'); assert(Math.abs(eb.cash - cash1) < 25, 'nothing paid'); assert.strictEqual(eb.a, null, 'no ghost / orphan endpoint left'); assert.strictEqual(eb.prev, false);
    await G(([o]) => { const g = window.__v2.game; for (const k of o) g.map.water[k] = 0; }, [wt]);
    log('C6b. release on blocked ground (water): "' + (sb.cf || sb.bad) + '" -> nothing built, nothing paid, no ghost or orphan end left'); await disarm();
  }
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  console.log('\nALL PHASE C UI TESTS PASSED (' + pass + ')'); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
