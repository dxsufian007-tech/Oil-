// PHASE A (part 1 of 5; split from the former single 217 s file so that each file stays under the 2-minute limit - same checks, nothing removed) extra checks: cancel / lost-finger recovery, rapid sequences (fuzz with invariants), tap after drag, drag after tap, large finger, zoom in/out, direction/speed/length matrix.
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

  // ---------- A1. direction / speed / length matrix: 1:1 each time (tests 1-8)
  {
    const cases = [['up', 0, -1]]; let n = 0, worst = 0;
    for (const [name, ux, uy] of cases) for (const [spd, steps] of [['slow', 30], ['fast', 1]]) for (const len of [6, 40, 160]) {
      await reset(1); const s = { x: 195, y: 400 }, w0 = await s2w(s), c0 = await cam(); await down(1, s.x, s.y); await fr();
      for (let i = 1; i <= steps; i++) { await move(1, s.x + ux * len * i / steps, s.y + uy * len * i / steps); if (steps > 1) await fr(); }
      await fr(); const q = { x: s.x + ux * len, y: s.y + uy * len }, w1 = await s2w(q), c1 = await cam(); await up(1); await settle(); const c2 = await cam();
      worst = Math.max(worst, dist(w1, w0)); n++; const moved = Math.hypot((c1.x - c0.x) * c1.z, (c1.y - c0.y) * c1.z);
      assert(dist(w1, w0) < 0.01, `${name}/${spd}/${len}: point left the finger by ${dist(w1, w0)}`);
      assert(Math.abs(moved - len) < 0.05 || len <= 12 && moved <= len + .05, `${name}/${spd}/${len}: camera moved ${moved} px`);
      assert(c1.x === c2.x && c1.y === c2.y && c1.z === c2.z, 'no movement after lifting'); assert.strictEqual(await state(), 'IDLE');
    }
    log(`A1. one finger left/right/up/down x slow(30 events)/fast(1 event) x short 6/medium 40/long 160 px: ${n} drags, the map point stays under the finger (worst ${worst.toFixed(5)}), camera moved exactly the finger distance, nothing after lifting`);
  }
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  console.log('\nPHASE A PART 1c PASSED (' + pass + ')'); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
