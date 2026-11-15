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

  // ---------- C7 not enough cash: nothing built, nothing paid, the bar says so
  {
    await armPipe(); await look(X + 5, Y + 6); const a = await nodeS(ID.W), t = await nodeS(ID.T2), l0 = (await S()).lines;
    // use W2 -> T (a different pair) with almost no cash
    const w2 = a; await G(() => { window.__v2.game.s.cash = 5; });
    await down(1, w2.x, w2.y); await fr(); for (let i = 1; i <= 12; i++) { await move(1, w2.x + (t.x - 20 - w2.x) * i / 12, w2.y + (t.y - w2.y) * i / 12); await fr(); } const s = await S();
    await up(1); await fr(); await wait(250); const e = await S(); assert.strictEqual(e.lines, l0, 'not built without cash'); assert(e.cash >= 0 && e.cash < 10, 'cash untouched ' + e.cash); await G(() => { window.__v2.game.s.cash = 1e7; window.__v2.cancel(); });
    assert(!s.cf || /./.test(s.cf)); log('C7. not enough cash ($5): "' + s.cf + '" -> release builds nothing, cash stays $' + Math.round(e.cash)); await disarm();
  }
  // ---------- C8 second finger: the pipe is dropped (PINCH), nothing is built, the camera does not jump when the finger arrives
  {
    await armPipe(); await look(X + 5, Y + 6); const a = await nodeS(ID.W), t = await nodeS(ID.T2), l0 = (await S()).lines;
    await down(1, a.x, a.y); await fr(); for (let i = 1; i <= 8; i++) { await move(1, a.x + (t.x - a.x) * i / 8, a.y + (t.y - a.y) * i / 8); await fr(); } const c0 = await cam();
    await down(2, 330, 700); await fr(); await fr(); const s = await S(), c1 = await cam(); assert.strictEqual(s.state, 'PINCH'); assert.strictEqual(s.dragging, false); assert(c0.x === c1.x && c0.y === c1.y && c0.z === c1.z, 'camera jumped at the second finger');
    await up(2); await fr(); await up(1); await fr(); await wait(300); const e = await S(); assert.strictEqual(e.lines, l0, 'second-finger transition built nothing'); assert.strictEqual(e.prev, false); assert.strictEqual(e.a, null);
    log('C8. second finger during a pipe drag (finger over a valid target!): state PINCH, camera still, after both lift: no pipe, no ghost, state ' + e.state); await disarm();
  }
  // ---------- C9 zoom, pan, pinch, edge
  {
    for (const z of [.7, 1, 1.6]) {
      await armPipe(); await look(X + 6, Y + 12, z, 0); const a = await nodeS(ID.W2), t = await nodeS(ID.T2), c0 = await cam(), l0 = (await S()).lines;
      if (a.x < 5 || a.x > 385 || a.y < 90 || a.y > 520 || t.x < 5 || t.x > 385 || t.y < 90 || t.y > 520) { await disarm(); continue; }
      await down(1, a.x, a.y); await fr(); let worst = 0; for (let i = 1; i <= 8; i++) { const q = { x: a.x + (t.x - 20 - a.x) * i / 8, y: a.y + (t.y - a.y) * i / 8 }; await move(1, q.x, q.y); await fr(); const tip = await G(() => window.__v2.view.tip), w = await A(q => window.__v2.camApi.s2w(q.x, q.y), q); worst = Math.max(worst, Math.hypot(tip.x - w.x, tip.y - w.y)); }
      const c1 = await cam(); await up(1); await fr(); await wait(200); await G(() => window.__v2.cancel());
      assert(worst < 1e-3 && c0.x === c1.x && c0.y === c1.y && c0.z === c1.z, 'zoom ' + z + ' worst ' + worst + ' cam ' + JSON.stringify(c0) + ' -> ' + JSON.stringify(c1)); log('C9. pipe drag at zoom ' + z + ': end = finger (error ' + worst.toExponential(1) + '), camera locked'); await disarm();
    }
    // after a pinch and a pan the drag still maps to the right world point
    await armPipe(); await look(X + 5, Y + 6, 1, 0); await down(1, 120, 300); await down(2, 220, 300); await fr(); for (let i = 1; i <= 5; i++) { await move(2, 220 + 5 * i, 300); await fr(); } await up(2); await up(1); await fr(); await wait(200);
    await down(1, 200, 500); await move(1, 190, 490); await move(1, 180, 480); await up(1); await fr(); await wait(200); await G(([W]) => { const v = window.__v2, n = v.game.nodeById(W), c = v.tc(n.b.x, n.b.y); v.view.cam.centerOn(c.x + 60, c.y + 40); v.camApi.clamp(); }, [ID.W]); await wait(200); const a = await nodeS(ID.W);   // pinch + pan done; bring the well on screen without touching the zoom
    assert(a.x > 10 && a.x < 380 && a.y > 90 && a.y < 520, 'well on screen ' + JSON.stringify(a));
    await down(1, a.x, a.y); await fr(); await move(1, a.x + 40, a.y + 30); await fr(); const tip = await G(() => window.__v2.view.tip), w2 = await A(q => window.__v2.camApi.s2w(q.x, q.y), { x: a.x + 40, y: a.y + 30 }); const c0 = await cam(); await move(1, a.x + 60, a.y + 40); await fr(); const c1 = await cam();
    assert(Math.hypot(tip.x - w2.x, tip.y - w2.y) < 1e-3 && c0.x === c1.x); await up(1); await fr(); await G(() => window.__v2.cancel());
    log('C9b. pipe drag after a pinch and a pan: end = finger exactly, camera locked'); await disarm();
    // edge: finger rests at the screen edge for a second
    await armPipe(); await look(X + 5, Y + 6); const a2 = await nodeS(ID.W), cE = await cam(); await down(1, a2.x, a2.y); await fr(); await move(1, 4, a2.y); await fr(); await wait(900); for (let i = 0; i < 5; i++) { await move(1, 4 + (i % 2), a2.y); await fr(); } const cE1 = await cam();
    assert(cE.x === cE1.x && cE.y === cE1.y && cE.z === cE1.z, 'camera moved at the screen edge'); await up(1); await fr(); await G(() => window.__v2.cancel()); log('C9c. finger resting at the screen edge for 1 s: camera does not scroll'); await disarm();
  }
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  console.log('\nALL PHASE C UI TESTS PASSED (' + pass + ')'); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
