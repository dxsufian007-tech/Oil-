// PHASE A (part 3 of 5; split from the former single 217 s file so that each file stays under the 2-minute limit - same checks, nothing removed) extra checks: cancel / lost-finger recovery, rapid sequences (fuzz with invariants), tap after drag, drag after tap, large finger, zoom in/out, direction/speed/length matrix.
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
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  console.log('\nPHASE A PART 3/5 PASSED (' + pass + ')'); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
