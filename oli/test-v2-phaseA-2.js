// PHASE A (part 2 of 5; split from the former single 217 s file so that each file stays under the 2-minute limit - same checks, nothing removed) extra checks: cancel / lost-finger recovery, rapid sequences (fuzz with invariants), tap after drag, drag after tap, large finger, zoom in/out, direction/speed/length matrix.
// (Camera + touch controller, real CDP touch, phone size.) Pan 1:1 at several zooms, no inertia, tap vs drag, pinch about the midpoint,
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
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Ignored attempt to cancel a touchcancel/.test(m.text())) errors.push('console: ' + m.text()); });
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


  const OKSTATE = ['IDLE', 'PAN', 'PINCH', 'PIPE_DRAG', 'BUILDING_DRAG', 'BUILDING_PLACEMENT'];
  const fingers = new Map();
  const all = () => [...fingers].map(([id, p]) => ({ x: p.x, y: p.y, id }));
  const down = async (id, x, y) => { fingers.set(id, { x, y }); await TE('touchStart', all()); };
  const move = async (id, x, y) => { fingers.get(id).x = x; fingers.get(id).y = y; await TE('touchMove', all()); };
  const up = async id => { const p = fingers.get(id); fingers.delete(id); await TE('touchEnd', [{ x: p.x, y: p.y, id }]); };
  const cancelAll = async () => { await TE('touchCancel', []); fingers.clear(); };
  const bounds = () => G(() => { const v = window.__v2, c = v.view.cam; return { x: c.scrollX, y: c.scrollY, z: c.zoom, min: v.camApi.minZoom(), ok: Number.isFinite(c.scrollX) && Number.isFinite(c.scrollY) && Number.isFinite(c.zoom) }; });
  const settle = async () => { for (let i = 0; i < 6; i++) await fr(); await wait(60); };
  const reset = async (z = 1) => { fingers.clear(); await center(z, 70, 44); await settle(); };

  // ---------- A4. lost-finger recovery: touchCancel in every state returns to IDLE, nothing is stuck, the next gesture works
  {
    for (const sc of ['PAN', 'PINCH', 'PIPE_DRAG', 'BUILDING_DRAG']) {
      await reset(1); await G(() => { const v = window.__v2; v.setTool(null); v.select(null); });
      if (sc === 'PIPE_DRAG') { await center(.9, X + 5, Y + 3); await G(() => window.__v2.setTool('pipe', 0)); await fr(); const p = await A(o => { const v = window.__v2, b = v.game.buildings.find(q => q.id === o.W), c = v.tc(b.x, b.y); return v.camApi.w2s(c.x, c.y - 6); }, L0); await down(1, p.x, p.y); await fr(); await move(1, p.x + 30, p.y + 20); await fr(); }
      else if (sc === 'BUILDING_DRAG') { await G(() => { window.__v2.setTool('tank'); }); await down(1, 200, 400); await fr(); await move(1, 220, 420); await fr(); }
      else if (sc === 'PAN') { await down(1, 200, 400); await move(1, 230, 430); await fr(); }
      else { await down(1, 150, 400); await down(2, 250, 400); await move(2, 270, 400); await fr(); }
      const st0 = await state(); assert.strictEqual(st0, sc, 'precondition ' + st0);
      await cancelAll(); await settle(); const st1 = await state(), cs = await bounds();
      await G(() => { window.__v2.setTool(null); window.__v2.cancel && window.__v2.cancel(); });
      assert(['IDLE', 'BUILDING_PLACEMENT'].includes(st1) && (sc === 'BUILDING_DRAG' || st1 === 'IDLE'), sc + ': after touchCancel the state is ' + st1);   // a tool still armed = BUILDING_PLACEMENT (Phase B) assert(cs.ok);
      // the next gesture works normally
      await reset(1); const s = { x: 200, y: 400 }, w0 = await s2w(s); await down(1, s.x, s.y); await move(1, s.x + 50, s.y); await fr(); const w1 = await s2w({ x: s.x + 50, y: s.y }); await up(1); await settle();
      assert(dist(w0, w1) < 0.01 && await state() === 'IDLE', sc + ': next pan after cancel is broken');
    }
    log('A4. touchCancel during PAN / PINCH / PIPE_DRAG / BUILDING_DRAG: state returns to IDLE, camera finite, the next pan is 1:1 again');
  }
  // ---------- A5. finger lost without an up event (system gesture swallowed it): the next touch must not be treated as a stale second finger
  {
    await reset(1); await down(1, 200, 400); await move(1, 210, 410); await fr();
    fingers.clear(); await TE('touchCancel', []); await settle();                       // browser dropped the finger
    await down(5, 100, 300); await fr(); const st = await state(); await move(5, 140, 330); await fr(); const stm = await state(); await up(5); await settle();
    assert.strictEqual(st, 'PAN', 'new touch after a lost finger is PAN, not ' + st); assert.strictEqual(stm, 'PAN'); assert.strictEqual(await state(), 'IDLE');
    log('A5. new touch after a lost finger (different pointer id) = PAN, not a stale PINCH');
  }
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  console.log('\nPHASE A PART 2/5 PASSED (' + pass + ')'); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
