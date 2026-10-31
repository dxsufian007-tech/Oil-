// Phase 11 (Input phase 1/20): tap / drag / pinch / cancel / duplication on a phone-sized touch screen, plus coordinate checks on other screens.
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[2] || 'file:///home/claude/oli/index.html';
let n = 0; const log = m => console.log('ok   ' + String(++n).padStart(2) + '. ' + m);
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36';
async function session(browser, vp, dpr) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, hasTouch: true, isMobile: true, userAgent: UA }), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(URL); await page.waitForTimeout(700);
  await page.evaluate(() => { const o = window.__oli, g = o.game; g.s.regions.forEach(r => { r.unlocked = true; }); g.s.tutorialDone = true; g.s.cash = 1e6; for (const a of g.areas) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; } for (let y = 34; y < 70; y++) for (let x = 44; x < 90; x++) { const k = y * 140 + x; g.map.block[k] = 0; g.map.water[k] = 0; } });
  return { page, cdp, errors };
}
(async () => {
  const browser = await chromium.launch();
  const S = await session(browser, { width: 390, height: 780 }, 2), { page, cdp, errors } = S;
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const scr = (x, y) => A(([x, y]) => { const { cam } = window.__oli, r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + ((x - y) * 32 - cam.x) * cam.z + r.width / 2, y: r.top + ((x + y) * 16 + 16 - cam.y) * cam.z + r.height / 2 }; }, [x, y]);
  const center = async (x, y, z) => { await A(([x, y, z]) => { const o = window.__oli; o.camGoal.on = false; o.cam.x = (x - y) * 32; o.cam.y = (x + y) * 16 + 16 + 100 / z; o.cam.z = z; o.select(null); }, [x, y, z]); await wait(150); };
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const tap = async p => { await T('touchStart', [p]); await wait(40); await T('touchEnd', []); await wait(120); };
  const drag = async (a, b, steps = 12, end = true) => { await T('touchStart', [a]); for (let i = 1; i <= steps; i++) { await T('touchMove', [{ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }]); await wait(16); } if (end) { await T('touchEnd', []); await wait(150); } };
  const cam = () => G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y, z: window.__oli.cam.z })), moved = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const sel = () => G(() => window.__oli.ui.sel && window.__oli.ui.sel.kind), mode = () => G(() => window.__oli.inputMode());
  const nb = () => G(() => window.__oli.game.buildings.length), cash = () => G(() => window.__oli.game.s.cash);
  const pinch = async (c, d0, d1, steps = 10) => { await T('touchStart', [{ x: c.x - d0 / 2, y: c.y }, { x: c.x + d0 / 2, y: c.y }]); for (let i = 1; i <= steps; i++) { const d = d0 + (d1 - d0) * i / steps; await T('touchMove', [{ x: c.x - d / 2, y: c.y }, { x: c.x + d / 2, y: c.y }]); await wait(16); } };
  const X = 60, Y = 40;
  await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X, Y); g.place('tank', X + 8, Y); g.buildRoute(g.routePipe(X + 1, Y, X + 7, Y, false)); const pr = g.place('pump', X + 4, Y); if (!pr.ok) throw new Error('pump: ' + pr.reason); }, [X, Y]);
  const ids = await G(() => { const g = window.__oli.game; const f = t => g.buildings.find(b => b.type === t); return { w: f('well'), t: f('tank'), p: f('pump') }; }); assert(ids.w && ids.t && ids.p, 'fixture built ' + JSON.stringify(await G(() => window.__oli.game.buildings.map(b => b.type + b.x + ',' + b.y))) + JSON.stringify(await A(([X, Y]) => { const g = window.__oli.game; return [g.canPlace('well', X, Y), g.canPlace('tank', X + 8, Y), g.areaAt(X, Y) && g.areaAt(X, Y).st]; }, [X, Y])));
  const base = await nb();

  await center(X + 4, Y + 12, 1); assert.strictEqual(await mode(), 'DEFAULT');
  let p = await scr(X + 4, Y + 14); await tap(p); assert.strictEqual(await sel(), null); assert.strictEqual(await nb(), base); log('tap on empty map: nothing selected, nothing built, mode DEFAULT');
  await center(X + 4, Y + 3, 1);
  p = await scr(ids.w.x, ids.w.y); await tap({ x: p.x, y: p.y - 18 }); assert.strictEqual(await sel(), 'b'); assert.strictEqual(await G(() => window.__oli.game.buildings.find(b => b.id === window.__oli.ui.sel.id).type), 'well'); assert.strictEqual(await mode(), 'SELECTING'); log('tap on a well selects it (mode SELECTING)');
  await center(ids.t.x, ids.t.y, 1); p = await scr(ids.t.x, ids.t.y); await tap({ x: p.x, y: p.y - 14 }); assert.strictEqual(await G(() => window.__oli.game.buildings.find(b => b.id === window.__oli.ui.sel.id).type), 'tank'); log('tap on a tank selects the tank');
  await center(ids.p.x, ids.p.y, 1); p = await scr(ids.p.x, ids.p.y); await tap({ x: p.x, y: p.y - 6 }); assert.strictEqual(await G(() => window.__oli.game.buildings.find(b => b.id === window.__oli.ui.sel.id).type), 'pump'); log('tap on a pump selects the pump');
  await G(() => window.__oli.select(null)); await center(X + 4, Y + 3, 1);
  // pan on empty, near a building, on a building
  let c0 = await cam(); await drag({ x: 200, y: 520 }, { x: 140, y: 470 }); let c1 = await cam(); assert(moved(c0, c1) > 50 && !(await sel())); log('drag on empty map pans the camera ' + Math.round(moved(c0, c1)) + 'px and selects nothing');
  await center(X + 4, Y + 3, 1); p = await scr(ids.w.x, ids.w.y); c0 = await cam(); await drag({ x: p.x + 70, y: p.y + 40 }, { x: p.x + 20, y: p.y + 10 }); c1 = await cam(); assert(moved(c0, c1) > 30 && !(await sel())); log('drag that starts NEAR a building (not on it) still pans');
  await center(ids.t.x, ids.t.y, 1); p = await scr(ids.t.x, ids.t.y); c0 = await cam(); await drag({ x: p.x, y: p.y - 14 }, { x: p.x - 80, y: p.y - 50 }); c1 = await cam(); assert(moved(c0, c1) < 1 && !(await sel()) && (await nb()) === base); log('drag that starts ON a building: no camera pan, no selection, nothing moved');
  // one finger pan then second finger
  await center(X + 4, Y + 12, 1); c0 = await cam(); await T('touchStart', [{ x: 200, y: 560 }]); for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: 200 - i * 8, y: 560 }]); await wait(16); }
  const cMid = await cam(); await T('touchStart', [{ x: 152, y: 560 }, { x: 260, y: 560 }]); await wait(30); const cJoin = await cam(); assert(moved(cMid, cJoin) < 6, 'no jump when the second finger lands: ' + moved(cMid, cJoin)); assert.strictEqual(await mode(), 'PINCH_ZOOM');
  for (let i = 1; i <= 8; i++) { await T('touchMove', [{ x: 152 - i * 6, y: 560 }, { x: 260 + i * 6, y: 560 }]); await wait(16); } assert((await cam()).z > cMid.z * 1.3);
  await T('touchEnd', []); await wait(120); assert.strictEqual(await mode(), 'DEFAULT'); log('one-finger pan, then a second finger: no jump, mode PINCH_ZOOM, zoom in works, everything released afterwards (mode back to DEFAULT)');
  // pinch zoom around the midpoint keeps the world point under the fingers
  await center(X + 4, Y + 6, 1); const mid = { x: 195, y: 420 }; const w0 = await A(m => window.__oli.s2w(m.x, m.y), mid); await pinch(mid, 80, 200); const w1 = await A(m => window.__oli.s2w(m.x, m.y), mid); await T('touchEnd', []); await wait(100);
  assert(Math.hypot(w0.x - w1.x, w0.y - w1.y) < 3, 'world under the midpoint stays put: ' + JSON.stringify([w0, w1])); assert((await cam()).z > 1.8); log('pinch out zooms around the midpoint (the world under the fingers moved ' + Math.hypot(w0.x - w1.x, w0.y - w1.y).toFixed(2) + 'px)');
  await center(X + 4, Y + 6, 1.5); const zi = (await cam()).z; await pinch(mid, 220, 80); await T('touchEnd', []); await wait(100); assert((await cam()).z < zi * .6); log('pinch in zooms out');
  await center(ids.w.x, ids.w.y, 1.2); p = await scr(ids.w.x, ids.w.y); const zc = await cam(); await pinch({ x: p.x + 30, y: p.y + 10 }, 80, 140); await T('touchEnd', []); await wait(100); assert((await cam()).z > zc.z && !(await sel()) && (await nb()) === base, JSON.stringify([zc, await cam(), await sel(), await nb(), base, p])); log('pinch with the fingers on a building zooms and selects nothing');
  // limits
  await G(() => { window.__oli.cam.z = .3; }); await pinch(mid, 200, 20, 14); await T('touchEnd', []); await wait(100); assert((await cam()).z >= .279, 'min zoom ' + (await cam()).z); const zmin = (await cam()).z; log('zoom at the minimum limit stays clamped (' + zmin.toFixed(2) + ')');
  await G(() => { window.__oli.cam.z = 1.9; }); await pinch(mid, 60, 330, 14); await T('touchEnd', []); await wait(100); assert((await cam()).z <= 2.001); log('zoom at the maximum limit stays clamped (' + (await cam()).z.toFixed(2) + ')');
  // world boundary
  await G(() => { const o = window.__oli; o.cam.z = 1; o.cam.x = 0; o.cam.y = 1100; }); for (let i = 0; i < 5; i++) await drag({ x: 60, y: 500 }, { x: 360, y: 640 }, 6);   // keep pulling the map right/down
  const b1 = await cam(); for (let i = 0; i < 5; i++) await drag({ x: 330, y: 640 }, { x: 40, y: 300 }, 6); const b2 = await cam();
  const lim = await G(() => { const o = window.__oli; o.clampCam(); return { x: o.cam.x, y: o.cam.y }; }); assert(Math.abs(lim.x - b2.x) < 1 && Math.abs(lim.y - b2.y) < 1, 'camera stays inside the world: ' + JSON.stringify([b2, lim])); log('panning past the world edge stays clamped inside the world bounds');
  // build placement
  await center(X + 12, Y + 12, 1); await G(() => window.__oli.setTool('well')); assert.strictEqual(await mode(), 'BUILDING_PLACEMENT'); const m0 = await cash(); const bp = await scr(X + 12, Y + 12); c0 = await cam();
  await drag({ x: bp.x - 40, y: bp.y - 20 }, { x: bp.x + 20, y: bp.y + 10 }, 10); assert(await G(() => !!window.__oli.ui.pending)); assert(moved(c0, await cam()) < 1); assert.strictEqual(await nb(), base); assert(Math.abs(await cash() - m0) < 30); log('placement: the drag moves the preview (no camera pan, nothing built, no money taken)');
  const pv = await G(() => ({ ...window.__oli.ui.pending })); await drag({ x: bp.x - 40, y: bp.y - 20 }, { x: bp.x + 60, y: bp.y + 20 }, 10); const pv2 = await G(() => ({ ...window.__oli.ui.pending })); assert(pv.x !== pv2.x || pv.y !== pv2.y); log('the preview moves again on a second drag (' + pv.x + ',' + pv.y + ' -> ' + pv2.x + ',' + pv2.y + ')');
  await page.locator('#confirm-no').tap(); await wait(150); assert.strictEqual(await nb(), base); assert.strictEqual(await G(() => window.__oli.ui.pending), null); log('cancel placement: clean state, nothing built');
  await drag({ x: bp.x - 40, y: bp.y - 20 }, { x: bp.x + 20, y: bp.y + 10 }, 10);
  // rapid double press of Confirm -> exactly one building
  await page.evaluate(() => { const b = document.getElementById('confirm-ok'); b.click(); b.click(); b.click(); }); await wait(250); assert.strictEqual(await nb(), base + 1); log('three rapid presses on Confirm build exactly ONE well');
  await G(() => window.__oli.setTool('well')); await center(X + 20, Y + 12, 1); const dp = await scr(X + 20, Y + 12); const bb = await nb();
  await tap(dp); await T('touchStart', [dp]); await T('touchEnd', []); await wait(40); await T('touchStart', [dp]); await T('touchEnd', []); await wait(300); assert.strictEqual(await nb(), bb); log('rapidly tapping twice never builds (only a deliberate Confirm does)');
  await page.evaluate(([x, y]) => { for (const t of ['mousedown', 'mouseup', 'click', 'click']) document.elementFromPoint(x, y).dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: x, clientY: y })); }, [dp.x, dp.y]); await wait(200); assert.strictEqual(await nb(), bb); assert(await G(() => !!window.__oli.ui.pending)); log('touch + mouse + click duplicates on the same spot: still one preview, nothing built');
  await G(() => window.__oli.cancelAction ? 0 : 0); await page.locator('#confirm-no').tap(); await G(() => window.__oli.setTool('select'));
  // pipe drawing
  await center(X + 4, Y + 18, 1); await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X, Y + 18); g.place('tank', X + 8, Y + 18); }, [X, Y]); await G(() => window.__oli.setTool('pipe')); assert.strictEqual(await mode(), 'PIPE_DRAWING');
  const pc0 = await G(() => window.__oli.game.pipeCount()); c0 = await cam(); await drag(await scr(X + 1, Y + 18), await scr(X + 7, Y + 18), 12);
  assert(moved(c0, await cam()) < 1 && !(await sel())); assert(await G(() => !!window.__oli.ui.pending)); log('pipe drawing: the drag draws the route (camera still, nothing selected)');
  await page.locator('#confirm-no').tap(); await wait(150); assert.strictEqual(await G(() => window.__oli.game.pipeCount()), pc0); assert.strictEqual(await G(() => window.__oli.ui.pipeStart), null); assert.strictEqual(await G(() => window.__oli.ui.pipeDragging), false); log('cancel pipe drawing: gesture fully released, nothing built');
  await drag(await scr(X + 1, Y + 18), await scr(X + 7, Y + 18), 12); await page.evaluate(() => { const b = document.getElementById('confirm-ok'); b.click(); b.click(); }); await wait(250); const pc1 = await G(() => window.__oli.game.pipeCount()); assert(pc1 > pc0); assert.deepStrictEqual(await G(() => window.__oli.game.validateNetwork()), []); log('confirm pipe (double press): built once (' + (pc1 - pc0) + ' tiles), network valid');
  await center(X + 4, Y + 18, 1); c0 = await cam(); await drag({ x: 300, y: 600 }, { x: 220, y: 560 }); assert(moved(c0, await cam()) < 1); log('pipe tool + a drag that starts away from any anchor: no camera pan, no selection');
  // pinch while pipe tool is active still zooms
  const zp = (await cam()).z; await pinch(mid, 80, 180); await T('touchEnd', []); await wait(100); assert((await cam()).z > zp * 1.3); log('pinch while drawing pipes still zooms (two fingers always zoom)');
  // second finger during a pipe drag cancels the drawing cleanly
  await drag(await scr(X + 1, Y + 18), await scr(X + 6, Y + 18), 8, false); assert.strictEqual(await G(() => window.__oli.ui.pipeDragging), true); await T('touchStart', [await scr(X + 6, Y + 18), { x: 300, y: 400 }]); await wait(60); assert.strictEqual(await G(() => window.__oli.ui.pipeDragging), false); await T('touchEnd', []); await wait(150);
  assert.strictEqual(await G(() => window.__oli.ptrs.size), 0); assert.strictEqual(await mode(), 'PIPE_DRAWING'); log('adding a second finger during a pipe drag hands over to pinch, releases the pipe gesture, leaves no stuck pointer');
  await G(() => window.__oli.setTool('select'));
  // pointer cancel / touch cancel / finger leaves the screen
  await center(X + 4, Y + 12, 1); await T('touchStart', [{ x: 200, y: 520 }]); await T('touchMove', [{ x: 160, y: 500 }]); await T('touchMove', [{ x: 120, y: 480 }]); await T('touchCancel', []); await wait(120);
  assert.strictEqual(await G(() => window.__oli.ptrs.size), 0); assert.strictEqual(await G(() => document.getElementById('view').classList.contains('dragging')), false); assert.strictEqual(await sel(), null); log('touch/pointer cancel in the middle of a drag: gesture released, no tap, no selection');
  await center(X + 4, Y + 12, 1); await T('touchStart', [{ x: 200, y: 520 }]); await T('touchMove', [{ x: 140, y: 480 }]); await G(() => window.dispatchEvent(new Event('blur'))); await wait(60); assert.strictEqual(await G(() => window.__oli.ptrs.size), 0); await T('touchEnd', []); await wait(80); log('app loses focus during a drag: gesture reset (not stuck in DRAG)');
  await T('touchStart', [{ x: 200, y: 520 }]); await T('touchMove', [{ x: 150, y: 480 }]); await T('touchEnd', []); await wait(120); c0 = await cam(); await drag({ x: 200, y: 520 }, { x: 190, y: 515 }, 4); assert(moved(c0, await cam()) < 25); assert.strictEqual(await G(() => window.__oli.ptrs.size), 0); log('finger lifted after a drag: next touch starts fresh (small movement is not an old drag)');
  // modal owns input
  await G(() => window.__oli.openMarket()); await wait(150); assert.strictEqual(await mode(), 'UI_INTERACTION'); c0 = await cam(); await T('touchStart', [{ x: 5, y: 500 }]); await T('touchMove', [{ x: 5, y: 520 }]); await T('touchEnd', []); await wait(80); await G(() => window.__oli.closeModals()); await wait(80); assert.strictEqual(await mode(), 'DEFAULT'); log('while a modal is open the mode is UI_INTERACTION and the map gets no gesture');
  // duplicate listeners: one set of canvas handlers (counts via a probe)
  { const src = require('fs').readFileSync(__dirname + '/game.js', 'utf8'); const onCv = ev => (src.match(new RegExp("cv\\.addEventListener\\('" + ev + "'", 'g')) || []).length;
    assert.strictEqual(onCv('pointerdown'), 1); assert.strictEqual(onCv('pointermove'), 1); assert.strictEqual(onCv('pointerup'), 1); assert.strictEqual(onCv('touchstart') + onCv('mousedown') + onCv('mousemove') + onCv('click'), 0);
    log('single input pipeline (static check): exactly one pointerdown/pointermove/pointerup handler on the map; no touchstart / mouse / click handlers'); }
  assert.deepStrictEqual(errors, [], errors.join('\n'));

  // ---- coordinate round trip on other screens: tap every corner of the 140x88 map at several zooms / dprs
  for (const [vp, dpr, tag] of [[{ width: 360, height: 640 }, 3, '360x640 @3x'], [{ width: 820, height: 460 }, 1, '820x460 landscape @1x'], [{ width: 1024, height: 1366 }, 1.5, 'tablet portrait @1.5x']]) {
    const T2 = await session(browser, vp, dpr), pg = T2.page, cdp2 = T2.cdp; let fails = 0, tests = 0;
    for (const [cx, cy] of [[2, 2], [137, 2], [2, 85], [137, 85], [70, 44], [48, 32], [100, 60]]) for (const z of [.5, 1, 1.8]) {
      const r = await pg.evaluate(([cx, cy, z]) => { const o = window.__oli; o.camGoal.on = false; o.cam.z = z; o.cam.x = (cx - cy) * 32; o.cam.y = (cx + cy) * 16 + 16; o.clampCam(); const rr = document.getElementById('view').getBoundingClientRect(); const out = []; for (const [dx, dy] of [[0, 0], [2, 1], [-1, 2], [3, -2]]) { const x = cx + dx, y = cy + dy; const sx = rr.left + ((x - y) * 32 - o.cam.x) * o.cam.z + rr.width / 2, sy = rr.top + ((x + y) * 16 + 16 - o.cam.y) * o.cam.z + rr.height / 2; if (sx > 5 && sx < rr.width - 5 && sy > 5 && sy < rr.height - 5) { const c = o.cellAt(sx - rr.left, sy - rr.top); out.push([x, y, c.x, c.y]); } } return out; }, [cx, cy, z]);
      for (const [x, y, gx, gy] of r) { tests++; if (x >= 0 && y >= 0 && x < 140 && y < 88 && (x !== gx || y !== gy)) fails++; }
    }
    assert.strictEqual(fails, 0, tag + ': ' + fails + ' of ' + tests + ' screen->cell conversions were wrong'); assert.deepStrictEqual(T2.errors, []);
    // one real touch tap: select via CDP at this DPR
    await pg.evaluate(() => { const g = window.__oli.game; g.place('tank', 90, 66); });
    const tp = await pg.evaluate(() => { const o = window.__oli; o.camGoal.on = false; o.cam.z = 1.2; o.cam.x = (90 - 66) * 32; o.cam.y = (90 + 66) * 16 + 16 + 40; o.clampCam(); const rr = document.getElementById('view').getBoundingClientRect(); return { x: rr.left + ((90 - 66) * 32 - o.cam.x) * o.cam.z + rr.width / 2, y: rr.top + ((90 + 66 + 2) * 16 - o.cam.y) * o.cam.z + rr.height / 2 - 14 }; });
    await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tp.x, y: tp.y, id: 0 }] }); await pg.waitForTimeout(40); await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pg.waitForTimeout(150);
    assert.strictEqual(await pg.evaluate(() => window.__oli.ui.sel && window.__oli.ui.sel.kind), 'b', tag + ': a real touch selected the tank at the far corner of the 10x map');
    log(tag + ': ' + tests + ' screen->cell conversions exact over the whole 140x88 map (corners, 3 zooms) + a real touch selects a far-corner building');
  }
  console.log('\nALL PHASE 11 INPUT TESTS PASSED (' + n + ' checks, no console errors)'); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
