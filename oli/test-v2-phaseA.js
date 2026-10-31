// PHASE A extra checks: cancel / lost-finger recovery, rapid sequences (fuzz with invariants), tap after drag, drag after tap, large finger, zoom in/out, direction/speed/length matrix.
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
    const cases = [['left', -1, 0], ['right', 1, 0], ['up', 0, -1], ['down', 0, 1]]; let n = 0, worst = 0;
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
  // ---------- A2. zoom in / zoom out with a pinch: focus world point stays under the midpoint, same pan speed afterwards
  for (const [name, f] of [['zoom in', 1.6], ['zoom out', .6]]) {
    await reset(1); const mx = 195, my = 380, d0 = 80, w0 = await s2w({ x: mx, y: my });
    await down(1, mx - d0 / 2, my); await down(2, mx + d0 / 2, my); await fr(); let worst = 0;
    for (let i = 1; i <= 20; i++) { const d = d0 * (1 + (f - 1) * i / 20); await move(1, mx - d / 2, my); await move(2, mx + d / 2, my); await fr(); worst = Math.max(worst, dist(await s2w({ x: mx, y: my }), w0) * (await cam()).z); }
    const c = await cam(); await up(2); await up(1); await settle();
    assert(worst < 0.02, name + ': the point under the midpoint drifted ' + worst + ' px'); assert(f > 1 ? c.z > 1.3 : c.z < .8, name + ' zoom ' + c.z);
    log(`A2. pinch ${name}: zoom 1 -> ${c.z.toFixed(2)}, point under the midpoint drifted at most ${worst.toFixed(4)} screen px`);
  }
  // ---------- A3. pinch near the screen edge
  {
    await reset(1); const mx = 24, my = 700, w0 = await s2w({ x: mx, y: my }); await down(1, mx - 14, my); await down(2, mx + 40, my); await fr(); let worst = 0;
    for (let i = 1; i <= 15; i++) { await move(1, mx - 14 - i, my); await move(2, mx + 40 + 3 * i, my); await fr(); }
    const c = await bounds(); await up(2); await up(1); await settle(); assert(c.ok && c.z >= c.min - 1e-9 && c.z <= 1.8 + 1e-9, JSON.stringify(c));
    log(`A3. pinch with the midpoint 24 px from the screen edge: zoom ${c.z.toFixed(2)}, camera finite and inside limits`);
  }
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
  // ---------- A6. tap after drag / drag after tap: no double action, no accidental drag
  {
    await reset(1); const tp = await A(o => { const v = window.__v2, b = v.game.buildings.find(q => q.id === o.T), c = v.tc(b.x + .5, b.y + .5); const s = v.camApi.w2s(c.x, c.y - 14); return s; }, L0);
    await center(1, X + 9.5, Y + 1.5); await settle(); const tT = await A(o => { const v = window.__v2, b = v.game.buildings.find(q => q.id === o.T), c = v.tc(b.x + .5, b.y + .5); return v.camApi.w2s(c.x, c.y - 14); }, L0);
    await G(() => window.__v2.select(null));
    // drag that ends on the tank, then an immediate tap elsewhere-free: first stays unselected
    await down(1, tT.x - 90, tT.y); for (let i = 1; i <= 6; i++) { await move(1, tT.x - 90 + 15 * i, tT.y); await fr(); } await up(1); await fr();
    const afterDrag = await G(() => window.__v2.ui.sel && window.__v2.ui.sel.id); assert(!afterDrag, 'a drag ended on a tank must not select it');
    await center(1, X + 9.5, Y + 1.5); await settle(); const t2 = await A(o => { const v = window.__v2, b = v.game.buildings.find(q => q.id === o.T), c = v.tc(b.x + .5, b.y + .5); return v.camApi.w2s(c.x, c.y - 14); }, L0);
    await down(1, t2.x, t2.y); await fr(); await up(1); await fr();                          // tap right after the drag
    assert.strictEqual(await G(() => window.__v2.ui.sel && window.__v2.ui.sel.id), L0.T, 'tap right after a drag selects');
    const cam0 = await cam(); await down(1, 100, 200); await fr(); await move(1, 130, 220); await fr(); const cam1 = await cam(); await up(1); await settle();   // drag right after the tap (the tank is selected, finger is on empty ground)
    assert(Math.abs((cam1.x - cam0.x) * cam1.z + 30) < .05 && Math.abs((cam1.y - cam0.y) * cam1.z + 20) < .05, 'drag after a tap pans 1:1: ' + JSON.stringify([cam0, cam1]));
    const selAfter = await G(() => window.__v2.ui.sel && window.__v2.ui.sel.id); assert.strictEqual(selAfter, L0.T, 'a pan on empty ground keeps the selection');
    log('A6. drag ending on a tank does not select it; a tap right after selects once; a drag right after the tap pans 1:1 and does not deselect or select twice');
  }
  // ---------- A7. large finger: a 10 px wobble is still a tap, 20 px is a drag
  {
    await center(1, X + 9.5, Y + 1.5); await settle(); const t3 = await A(o => { const v = window.__v2, b = v.game.buildings.find(q => q.id === o.T), c = v.tc(b.x + .5, b.y + .5); return v.camApi.w2s(c.x, c.y - 14); }, L0);
    await G(() => window.__v2.select(null)); await down(1, t3.x, t3.y); await move(1, t3.x + 8, t3.y + 6); await fr(); await up(1); await fr();
    assert.strictEqual(await G(() => window.__v2.ui.sel && window.__v2.ui.sel.id), L0.T, '10 px wobble is a tap');
    await G(() => window.__v2.select(null)); const c0 = await cam(); await down(1, t3.x, t3.y); await move(1, t3.x + 20, t3.y); await fr(); await up(1); await fr(); const c1 = await cam();
    assert(!await G(() => window.__v2.ui.sel), '20 px is a drag, not a tap'); assert(Math.abs((c0.x - c1.x) * c1.z - 20) < .05);
    log('A7. large finger: a 10 px wobble on a tank is still a tap; 20 px is a pan (1:1) and selects nothing (TAP_PX = ' + await G(() => window.__v2.TAP_PX || 12) + ')');
  }
  // ---------- A8. rapid second finger / rapid release / rapid sequences: random fuzz with invariants
  {
    let seed = 20241031; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let events = 0, maxStep = 0;
    for (let round = 0; round < 40; round++) {
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
  // ---------- A9. no heavy work per pointer move: a pan move touches only the camera (measured: core step count and rebuild count unchanged, time per move)
  {
    await reset(1); const r0 = await G(() => { const g = window.__v2.game; return { rb: g.hyd ? g.hyd.rebuilds || 0 : 0, t: g.s.t }; });
    await down(1, 200, 400); const t0 = Date.now(); const N = 60; for (let i = 1; i <= N; i++) await move(1, 200 + i, 400 + i / 2); const dt = (Date.now() - t0) / N; await up(1); await settle();
    const r1 = await G(() => { const g = window.__v2.game; return { rb: g.hyd ? g.hyd.rebuilds || 0 : 0, t: g.s.t }; });
    assert.strictEqual(r1.rb, r0.rb, 'a pan must not rebuild the network');
    log(`A9. ${N} pan moves: no network rebuild (${r0.rb} -> ${r1.rb}); round-trip ${dt.toFixed(1)} ms per CDP move incl. test overhead`);
  }
  // ---------- A11. one controller only: a camera glide (focus button) never starts under a finger and is cancelled by a touch
  {
    await reset(1); await down(1, 200, 400); await fr(); const c0 = await cam();
    await G(() => window.__v2.camApi.focus(window.__v2.tc(60, 60).x, window.__v2.tc(60, 60).y, 300)); await wait(450);
    const c1 = await cam(); await up(1); await settle(); assert(c0.x === c1.x && c0.y === c1.y, 'a glide started under a finger');
    await G(() => window.__v2.camApi.focus(window.__v2.tc(60, 60).x, window.__v2.tc(60, 60).y, 600)); await wait(120);
    await down(1, 200, 400); await fr(); await fr(); const c2 = await cam(); await wait(400); const c3 = await cam(); await up(1); await settle();
    assert(c2.x === c3.x && c2.y === c3.y, 'a touch must cancel the glide at once'); log('A11. camera glide: never starts while a finger is on the map; a touch cancels a running glide at once (camera frozen)');
  }
  // ---------- A10. mobile browser behaviour
  {
    const info = await G(() => { const c = document.querySelector('#world canvas'), cs = getComputedStyle(c), b = getComputedStyle(document.body); return { ta: cs.touchAction, us: b.userSelect || b.webkitUserSelect, ob: getComputedStyle(document.documentElement).overscrollBehavior, vp: document.querySelector('meta[name=viewport]').content }; });
    assert.strictEqual(info.ta, 'none'); log('A10. canvas touch-action: none; body user-select: ' + info.us + '; viewport: ' + info.vp);
  }
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  console.log('\nALL PHASE A TOUCH TESTS PASSED (' + pass + ')'); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
