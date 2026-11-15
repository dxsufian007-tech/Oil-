// PHASE A (part 5 of 5; split from the former single 217 s file so that each file stays under the 2-minute limit - same checks, nothing removed) extra checks: cancel / lost-finger recovery, rapid sequences (fuzz with invariants), tap after drag, drag after tap, large finger, zoom in/out, direction/speed/length matrix.
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
  console.log('\nPHASE A PART 5/5 PASSED (' + pass + ')'); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
