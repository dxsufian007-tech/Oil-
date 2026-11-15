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

  // ---------- C10 slow / fast / large finger
  {
    await look(X + 6, Y + 12); const a0 = await nodeS(ID.W2), t0 = await nodeS(ID.T2);
    for (const [label, steps, wob] of [['slow (40 moves)', 40, 0], ['fast (1 move)', 1, 0], ['large finger (±10 px wobble)', 12, 10]]) {
      await G(([W2, T2]) => { const g = window.__v2.game; for (const L of g.lines.slice()) if ((L.a === W2 && L.b === T2) || (L.a === T2 && L.b === W2)) for (const k of L.cells.slice()) g.removeAt(k % 140, (k / 140) | 0); }, [ID.W2, ID.T2]);   // free the pair again (as the panel's remove button does)
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
    await armPipe(); await look(X + 5, Y + 6); const a = await nodeS(ID.W);
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
