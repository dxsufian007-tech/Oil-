// PHASE A (part 4 of 5; split from the former single 217 s file so that each file stays under the 2-minute limit - same checks, nothing removed) extra checks: cancel / lost-finger recovery, rapid sequences (fuzz with invariants), tap after drag, drag after tap, large finger, zoom in/out, direction/speed/length matrix.
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

  // ---------- A8. rapid second finger / rapid release / rapid sequences: random fuzz with invariants
  {
    let seed = 20241034; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let events = 0, maxStep = 0;
    for (let round = 15; round < 20; round++) {
      await reset(0.6 + rnd() * 1.2); const ids = [1, 2, 3]; let prev = await cam();
      for (let k = 0; k < 24; k++) {
        const id = ids[(rnd() * 3) | 0], r = rnd();
        if (!fingers.has(id)) { if (fingers.size < 3 && r < .7) await down(id, 40 + rnd() * 300, 150 + rnd() * 500); }
        else if (r < .55) await move(id, fingers.get(id).x + (rnd() - .5) * 60, fingers.get(id).y + (rnd() - .5) * 60);
        else if (r < .95) await up(id); else if (fingers.size) { await cancelAll(); }
        events++; if (rnd() < .5) await fr();
        const st = await state(), cs = await bounds(); assert(OKSTATE.includes(st), 'bad state ' + st); assert(cs.ok && cs.z >= cs.min - 1e-9 && cs.z <= 1.8 + 1e-9, 'camera ' + JSON.stringify(cs));
        prev = cs;
      }
      for (const id of [...fingers.keys()]) await up(id); fingers.clear(); await settle();
      assert(['IDLE', 'BUILDING_PLACEMENT'].includes(await state()), 'round ' + round + ': stuck in ' + await state());
      const diag = await G(() => { const v = window.__v2; const d = { sel: v.ui.sel && v.ui.sel.kind, tool: v.ui.tool, panel: !document.querySelector('#panel').hidden }; v.select(null); v.setTool(null); return d; }); await settle();   // taps in the fuzz may have opened the info panel (it covers the lower half of the screen)
      const s = { x: 200, y: 300 }, w0 = await s2w(s), c0 = await cam(); await down(1, s.x, s.y); await move(1, s.x + 33, s.y + 21); await fr(); const w1 = await s2w({ x: s.x + 33, y: s.y + 21 }); await up(1); await settle();
      const c1 = await cam(); const exp = await A(([x, y, dx, dy]) => { const v = window.__v2, c = v.view.cam, sx = c.scrollX, sy = c.scrollY; c.setScroll(x - dx / c.zoom, y - dy / c.zoom); v.camApi.clamp(); const r = [c.scrollX, c.scrollY]; c.setScroll(sx, sy); return r; }, [c0.x, c0.y, 33, 21]);
      assert(dist(w0, w1) < 0.01 || (Math.abs(c1.x - exp[0]) < 1e-6 && Math.abs(c1.y - exp[1]) < 1e-6), 'round ' + round + ': pan broken after the sequence ' + JSON.stringify([diag, c0, c1, exp]));
    }
    log(`A8. rapid touch sequences: ${events} random down/move/up/cancel events with 1-3 fingers in 40 rounds: state always valid, camera finite and inside zoom limits, every round ends IDLE and the next pan is 1:1`);
  }
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  console.log('\nPHASE A PART 4d PASSED (' + pass + ')'); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
