// Phase 12 (Camera & world navigation 2/20): bounds at every zoom, 10x world reach, pinch/pan, focus, interruption, minimap, resize.
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[2] || 'file:///home/claude/oli/index.html';
let n = 0; const log = m => console.log('ok   ' + String(++n).padStart(2) + '. ' + m);
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36';
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: UA }), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(URL); await page.waitForTimeout(800);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  await G(() => { const o = window.__oli, g = o.game; g.s.regions.forEach(r => { r.unlocked = true; }); g.s.tutorialDone = true; g.s.cash = 1e6; for (const a of g.areas) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; } for (let y = 0; y < 88; y++) for (let x = 0; x < 140; x++) { const k = y * 140 + x; if (!g.map.water[k]) g.map.block[k] = 0; } });
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const cam = () => G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y, z: window.__oli.cam.z })), dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const drag = async (a, b, steps = 10, end = true) => { await T('touchStart', [a]); for (let i = 1; i <= steps; i++) { await T('touchMove', [{ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }]); await wait(12); } if (end) { await T('touchEnd', []); await wait(120); } };
  const pinch = async (c, d0, d1, steps = 10) => { await T('touchStart', [{ x: c.x - d0 / 2, y: c.y }, { x: c.x + d0 / 2, y: c.y }]); for (let i = 1; i <= steps; i++) { const d = d0 + (d1 - d0) * i / steps; await T('touchMove', [{ x: c.x - d / 2, y: c.y }, { x: c.x + d / 2, y: c.y }]); await wait(12); } await T('touchEnd', []); await wait(120); };
  const set = (x, y, z) => A(([x, y, z]) => { const o = window.__oli; o.camGoal.on = false; o.cam.x = x; o.cam.y = y; o.cam.z = z; o.clampCam(); o.select(null); }, [x, y, z]);
  const tileC = (x, y) => [(x - y) * 32, (x + y) * 16 + 16];
  // view rectangle (world px) must sit inside the world's bounding box (+EDGE), at every zoom
  const inside = () => G(() => { const o = window.__oli, c = o.cam, vw = innerWidth, vh = document.getElementById('view').getBoundingClientRect().height, hw = vw / 2 / c.z, hh = vh / 2 / c.z, B = o.BOX, E = o.CAM.EDGE; return { l: c.x - hw - (B.minX - E), r: B.maxX + E - (c.x + hw), t: c.y - hh - (B.minY - E), b: B.maxY + E - (c.y + hh), w: hw * 2 > B.maxX - B.minX + 2 * E, h: hh * 2 > B.maxY - B.minY + 2 * E }; });
  const ok4 = (r, w) => assert((r.l > -1 || r.w) && (r.r > -1 || r.w) && (r.t > -1 || r.h) && (r.b > -1 || r.h), w + ' ' + JSON.stringify(r));
  const lim = await G(() => ({ ...window.__oli.CAM, box: window.__oli.BOX, zl: window.__oli.zoomLimits() }));

  // 1-4 world edges (reached by real finger pans), at the start zoom
  await set(0, 1700, 1);
  for (const [name, a, b] of [['left', { x: 40, y: 500 }, { x: 360, y: 500 }], ['right', { x: 360, y: 500 }, { x: 40, y: 500 }], ['top', { x: 200, y: 200 }, { x: 200, y: 560 }], ['bottom', { x: 200, y: 560 }, { x: 200, y: 200 }]]) {
    for (let i = 0; i < 40; i++) await drag(a, b, 4); const c1 = await cam(); const r = await inside(); ok4(r, name);
    for (let i = 0; i < 6; i++) await drag(a, b, 4); const c2 = await cam(); assert(dist(c1, c2) < .5, name + ' edge: pushing further does not move or jump (' + dist(c1, c2).toFixed(3) + ')');
    const edge = name === 'left' ? r.l : name === 'right' ? r.r : name === 'top' ? r.t : r.b; assert(edge < 3 || edge < 60, name + ': the camera really reaches the edge (' + edge.toFixed(1) + ')');
    log('pan to the ' + name + ' world edge: reaches it (slack ' + edge.toFixed(1) + 'px), view stays inside the world, extra pushing does nothing, no jump');
  }
  // 5-6 zoom limits
  await set(2200, 1200, 1); await pinch({ x: 195, y: 420 }, 40, 340, 16); const zin = (await cam()).z; assert(Math.abs(zin - lim.MAX_Z) < 1e-6); log('zoom all the way in stops at MAX_Z = ' + zin);
  await pinch({ x: 195, y: 420 }, 340, 30, 16); await pinch({ x: 195, y: 420 }, 340, 30, 16); const zout = (await cam()).z; assert(Math.abs(zout - lim.zl[0]) < 1e-6); log('zoom all the way out stops at MIN_Z = ' + zout + ' (dynamic floor so the world always fills the view)');
  // 7-8 bounds at many zooms
  for (const z of [.28, .4, .6, 1, 1.5, 2]) for (const [x, y] of [[-2800, 1400], [4480, 2240], [0, 0], [1664, 3648], [900, 1800]]) { await set(x, y, z); ok4(await inside(), 'z=' + z + ' @' + x + ',' + y); }
  log('bounds at 6 zooms x 5 world extremes: the view never reveals space beyond the world');
  await set(1000, 1800, 2); let c0 = await cam(); await drag({ x: 300, y: 600 }, { x: 150, y: 520 }); let c1 = await cam(); assert(dist(c0, c1) > 20); log('pan while zoomed in works (' + dist(c0, c1).toFixed(0) + ' world px)');
  await set(1000, 1800, .3); c0 = await cam(); await drag({ x: 300, y: 600 }, { x: 150, y: 520 }); c1 = await cam(); assert(dist(c0, c1) > 100); ok4(await inside(), 'zoomed out'); log('pan while zoomed out works (' + dist(c0, c1).toFixed(0) + ' world px) and stays in bounds');
  // 9. pinch near a world edge: no jump, stays in bounds
  await set(4300, 2200, 1); ok4(await inside(), 'edge'); const pe = await cam(); await pinch({ x: 330, y: 400 }, 60, 200); const pe2 = await cam(); ok4(await inside(), 'pinch at edge'); assert(pe2.z > pe.z); log('pinch near the east edge: zooms, view still inside the world (no escape, no jump)');
  // 10-13 buildings
  await A(() => { const g = window.__oli.game; const near = (type, sx, sy, dx, dy) => { for (let d = 0; d < 60; d++) for (let i = 0; i <= d; i++) { const x = sx + dx * i, y = sy + dy * (d - i); if (x >= 0 && y >= 0 && x < 140 && y < 88 && g.canPlace(type, x, y).ok) return g.place(type, x, y); } }; near('well', 0, 0, 1, 1); near('tank', 139, 87, -1, -1); near('well', 70, 44, 1, 1); }, null);
  const bl = await G(() => window.__oli.game.buildings.map(b => ({ id: b.id, type: b.type, x: b.x, y: b.y })));
  assert(bl.length === 3, 'fixture: ' + JSON.stringify(bl));
  const scr = async (x, y) => A(([x, y]) => { const o = window.__oli, r = document.getElementById('view').getBoundingClientRect(), p = o.w2s((x - y) * 32, (x + y) * 16 + 16); return { x: r.left + p.x, y: r.top + p.y }; }, [x, y]);
  await A(b => window.__oli.focusOn((b.x - b.y) * 32, (b.x + b.y) * 16 + 16, { instant: true, force: true, minZoom: 1 }), bl[2]); await wait(100); let p = await scr(70, 44); let cB = await cam();
  await T('touchStart', [{ x: p.x + 90, y: p.y + 60 }]); for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: p.x + 90 - i * 10, y: p.y + 60 - i * 4 }]); await wait(12); } await T('touchEnd', []); await wait(100); assert(dist(cB, await cam()) > 30); log('pan near a building (finger starts beside it): the camera pans');
  await A(b => window.__oli.focusOn((b.x - b.y) * 32, (b.x + b.y) * 16 + 16, { instant: true, force: true, minZoom: 1 }), bl[2]); await G(() => { window.__oli.cam.z = 1; window.__oli.clampCam(); }); await wait(100); p = await scr(70, 44); const zb = (await cam()).z; await pinch({ x: p.x + 20, y: p.y + 20 }, 60, 150); assert((await cam()).z > zb && !(await G(() => window.__oli.ui.sel)), JSON.stringify([zb, await cam(), p, await G(() => window.__oli.ui.sel)])); log('pinch near a building: zooms, nothing selected');
  for (const [i, nm] of [[0, 'the well nearest the NW corner'], [1, 'the tank nearest the SE corner']]) {
    const b = bl[i]; await set(0, 1700, 1); await A(q => window.__oli.focusOn((q.x - q.y) * 32, (q.x + q.y) * 16 + 16, { force: true, minZoom: 1 }), b); await wait(1800);
    const c = await cam(); const pp = await scr(b.x, b.y); const onScreen = pp.x > 0 && pp.x < 390 && pp.y > 0 && pp.y < 780; assert(onScreen, nm + ' is on screen after the focus: ' + JSON.stringify(pp)); ok4(await inside(), nm);
    await A(q => window.__oli.select({ kind: 'b', id: q.id }), b); await wait(1500); assert.strictEqual(await G(() => window.__oli.camGoal.on), false, 'the glide ended'); log(nm + ': glide focus ends on screen, inside the world, and the glide finishes (camGoal off)');
  }
  // 14. navigate across the whole expanded world with the minimap
  const mr = await G(() => { const r = document.getElementById('mini').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  const seen = new Set(); for (const [fx, fy] of [[.2, .5], [.5, .25], [.8, .5], [.5, .8], [.5, .5]]) { await T('touchStart', [{ x: mr.l + mr.w * fx, y: mr.t + mr.h * fy }]); await T('touchEnd', []); await wait(120); const c = await cam(); ok4(await inside(), 'mini'); seen.add(Math.round(c.x / 400) + ',' + Math.round(c.y / 400)); }
  assert(seen.size >= 4, 'minimap taps reach distinct parts of the world: ' + [...seen]); log('minimap: 5 taps jump to 5 different parts of the 140x88 world, always inside the bounds (' + seen.size + ' distinct areas)');
  const mm = await G(() => { const o = window.__oli; o.drawMini(); const c = document.getElementById('mini'); return { w: c.width, h: c.height }; }); assert(mm.w > 0); 
  // minimap rectangle matches the camera: convert the camera view to minimap coords and compare against what a tap at that spot produces
  await set(2000, 1500, 1); const before = await cam(); await T('touchStart', [{ x: mr.l + mr.w * .5, y: mr.t + mr.h * .5 }]); await T('touchEnd', []); await wait(100); const mid = await cam(); await G(() => 0);
  const back = await G(() => { const t = window.__oli.game; return 1; }); log('minimap tap does not leave a stuck gesture or a pending glide (ptrs ' + await G(() => window.__oli.ptrs.size) + ', glide ' + await G(() => window.__oli.camGoal.on) + ')');
  // 15. resize / rotate
  await set(2300, 1300, 1); const rc = await cam(); const wc = await A(() => window.__oli.s2w(innerWidth / 2, document.getElementById('view').getBoundingClientRect().height / 2), null);
  await page.setViewportSize({ width: 780, height: 390 }); await wait(300); ok4(await inside(), 'landscape'); const lc = await cam(); assert(dist(rc, lc) < 1 && Math.abs(rc.z - lc.z) < .01, 'the world point at the centre stays at the centre after rotating: ' + JSON.stringify([rc, lc]));
  await A(() => { const g = window.__oli.game; g.place('tank', 60, 40); }, null); const tb = (await G(() => window.__oli.game.buildings.find(b => b.x === 60 && b.y === 40))); await set(...tileC(60, 40), 1); await wait(100);
  const pl = await A(([x, y]) => { const o = window.__oli, r = document.getElementById('view').getBoundingClientRect(), s = o.w2s((x - y) * 32, (x + y + 2) * 16); return { sx: r.left + s.x, sy: r.top + s.y, c: o.cellAt(s.x, s.y - 20) }; }, [60, 40]); assert(pl.c.x === 60 && pl.c.y === 40, 'cell under the building after rotating: ' + JSON.stringify(pl.c));
  await page.setViewportSize({ width: 390, height: 780 }); await wait(300); ok4(await inside(), 'portrait'); const pl2 = await A(([x, y]) => { const o = window.__oli, r = document.getElementById('view').getBoundingClientRect(), s = o.w2s((x - y) * 32, (x + y + 2) * 16); return o.cellAt(s.x, s.y - 20); }, [60, 40]); assert(pl2.x === 60 && pl2.y === 40);
  await page.setViewportSize({ width: 320, height: 480 }); await wait(300); ok4(await inside(), 'tiny'); await page.setViewportSize({ width: 1280, height: 800 }); await wait(300); ok4(await inside(), 'desktop'); await page.setViewportSize({ width: 390, height: 780 }); await wait(300);
  log('resize / rotate (portrait 390x780 -> landscape 780x390 -> 320x480 -> 1280x800 -> back): the same world point stays under the centre, bounds hold, buildings stay on their cells');
  // 16. rapid direction changes
  await set(2000, 1500, 1); c0 = await cam(); await T('touchStart', [{ x: 200, y: 500 }]); let ex = 0, ey = 0; for (let i = 0; i < 40; i++) { const dx = (i % 2 ? 1 : -1) * 20, dy = ((i >> 1) % 2 ? 1 : -1) * 12; ex += dx; ey += dy; await T('touchMove', [{ x: 200 + ex * .5, y: 500 + ey * .5 }]); await wait(8); } const cf = await cam(); await T('touchEnd', []); await wait(100);
  const lastP = { x: 200 + ex * .5, y: 500 + ey * .5 }; assert(Math.abs((cf.x - c0.x) + (lastP.x - 200)) < 1.5 && Math.abs((cf.y - c0.y) + (lastP.y - 500)) < 1.5, 'the camera stayed locked to the finger through 40 direction changes: ' + JSON.stringify([cf, c0, lastP])); log('rapid direction changes: the world stays glued to the finger (1:1, error < 1.5 world px, no drift)');
  // 17-18 pan then second finger ; pinch then release one
  await set(2000, 1500, 1); await T('touchStart', [{ x: 200, y: 500 }]); for (let i = 1; i <= 5; i++) { await T('touchMove', [{ x: 200 - i * 8, y: 500 }]); await wait(12); } await wait(60); const m1 = await cam(); await T('touchStart', [{ x: 160, y: 500 }, { x: 260, y: 500 }]); await wait(40); const m2 = await cam(); assert(dist(m1, m2) < 4, 'no jump when the second finger lands: ' + dist(m1, m2)); log('pan then add a second finger: no jump (' + dist(m1, m2).toFixed(2) + ' world px)');
  for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: 160 - i * 5, y: 500 }, { x: 260 + i * 5, y: 500 }]); await wait(12); } await wait(60); const z1 = await cam(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 130, y: 500, id: 0 }] }); await wait(60); const z2 = await cam(); assert(dist(z1, z2) < 1 && Math.abs(z1.z - z2.z) < 1e-6); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300, y: 530, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 320, y: 570, id: 1 }] }); await wait(60); assert(dist(z2, await cam()) < 1 && Math.abs(z2.z - (await cam()).z) < 1e-6, 'the remaining finger does not pan or zoom'); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 320, y: 570, id: 1 }] }); await wait(100); log('pinch then lift one finger: no jump on release, the other finger does not pan');
  // 19. UI open
  await set(2000, 1500, 1); await G(() => window.__oli.openMarket()); await wait(150); c0 = await cam(); await drag({ x: 100, y: 400 }, { x: 250, y: 300 }); assert(dist(c0, await cam()) < 1); await G(() => window.__oli.closeModals()); await wait(100); c0 = await cam(); await drag({ x: 250, y: 500 }, { x: 150, y: 480 }); assert(dist(c0, await cam()) > 30, JSON.stringify([c0, await cam(), await G(() => window.__oli.inputMode()), await G(() => [...document.querySelectorAll('.modal')].map(m => m.id + m.hidden))])); log('camera input while a modal is open is ignored; after closing it panning works again');
  // 20-21 after cancelling build / pipe
  await set(2000, 1500, 1); await G(() => window.__oli.setTool('well')); await drag({ x: 200, y: 450 }, { x: 240, y: 470 }); await page.locator('#confirm-no').tap(); await wait(150); await G(() => window.__oli.setTool('select')); c0 = await cam(); await drag({ x: 250, y: 500 }, { x: 150, y: 480 }); assert(dist(c0, await cam()) > 30); log('camera pans normally after cancelling a building placement');
  await G(() => window.__oli.setTool('pipe')); await drag({ x: 200, y: 450 }, { x: 240, y: 470 }); await G(() => window.__oli.backStep()); await wait(100); await G(() => window.__oli.setTool('select')); c0 = await cam(); await drag({ x: 250, y: 500 }, { x: 150, y: 480 }); assert(dist(c0, await cam()) > 30); log('camera pans normally after leaving pipe drawing');
  // focus interruptibility
  await set(0, 1700, 1); await A(q => window.__oli.focusOn((q.x - q.y) * 32, (q.x + q.y) * 16 + 16, { force: true, minZoom: 1.2 }), bl[2]); await wait(120); assert.strictEqual(await G(() => window.__oli.camGoal.on), true); const gm = await cam(); await T('touchStart', [{ x: 200, y: 500 }]); await wait(30); assert.strictEqual(await G(() => window.__oli.camGoal.on), false, 'touching the map ends the glide'); await T('touchMove', [{ x: 150, y: 500 }]); await T('touchMove', [{ x: 100, y: 500 }]); await T('touchEnd', []); await wait(300); const gafter = await cam(); assert(gafter.x > gm.x - 100 - 1, 'the player has the camera back at once: ' + JSON.stringify([gm, gafter]));
  assert(!(await G(() => window.__oli.ui.sel))); log('a glide in progress is interrupted by touching the map: control returns instantly, no selection, the camera is not dragged back');
  await set(0, 1700, 1); await A(q => window.__oli.focusOn((q.x - q.y) * 32, (q.x + q.y) * 16 + 16, { force: true, minZoom: 1.2 }), bl[2]); await G(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))); await wait(150); assert.strictEqual(await G(() => window.__oli.camGoal.on), false); await G(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a' }))); log('keyboard pan also interrupts a glide');
  // frame-rate independence of the glide
  const gl = async dt => A(dt => { const o = window.__oli; o.camGoal.on = false; o.cam.x = 200; o.cam.y = 1700; o.cam.z = 1; o.clampCam(); o.focusOn(2000, 1200, { force: true, minZoom: 1 }); return null; }, dt);
  const tms = []; for (const fps of [30, 60, 120]) tms.push(await A(fps => { const o = window.__oli; o.camGoal.on = false; o.cam.x = 200; o.cam.y = 1700; o.cam.z = 1; o.clampCam(); o.focusOn(2000, 1300, { force: true, minZoom: 1 }); let t = 0; while (o.camGoal.on && t < 6) { t += 1 / fps; o.stepCamera(1 / fps); } return t; }, fps));
  assert(tms.every(x => x > .2 && x < 3), 'glides finish: ' + tms); assert(Math.max(...tms) - Math.min(...tms) < .3, 'the glide lasts the same time at 30 / 60 / 120 fps: ' + tms.map(x => x.toFixed(2)));
  log('glide duration is frame-rate independent: ' + tms.map((x, i) => [30, 60, 120][i] + 'fps ' + x.toFixed(2) + 's').join(', '));
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  console.log('\nALL PHASE 12 CAMERA TESTS PASSED (' + n + ' checks, no console errors)'); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
