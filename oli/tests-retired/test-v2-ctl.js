// Oli v2 control / camera / pipe-UX pass: real touch on a phone (scenarios A-P of the request).
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file:///home/claude/oli/v2.html';
const log = m => console.log('ok   ' + m);
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForTimeout(1600);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const TE = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const tap = async (p, wob = 0) => { await TE('touchStart', [p]); if (wob) await TE('touchMove', [{ x: p.x + wob, y: p.y + wob / 2 }]); await wait(40); await TE('touchEnd', []); await wait(200); };
  const drag = async (a, b, n = 12) => { await TE('touchStart', [a]); for (let i = 1; i <= n; i++) { await TE('touchMove', [{ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }]); await wait(16); } await TE('touchEnd', []); await wait(150); };
  const pinchG = async (c, d0, d1, n = 10) => { await TE('touchStart', [{ x: c.x - d0 / 2, y: c.y }, { x: c.x + d0 / 2, y: c.y }]); for (let i = 1; i <= n; i++) { const d = d0 + (d1 - d0) * i / n; await TE('touchMove', [{ x: c.x - d / 2, y: c.y }, { x: c.x + d / 2, y: c.y }]); await wait(16); } await TE('touchEnd', []); await wait(150); };
  const scr = (x, y, dy = 0) => A(([x, y, dy]) => { const v = window.__v2, c = v.tc(x, y); return v.camApi.w2s(c.x, c.y + dy); }, [x, y, dy]);
  const cam = () => G(() => { const c = window.__v2.view.cam; return { x: c.scrollX, y: c.scrollY, z: c.zoom }; });
  const inBounds = () => G(() => { const v = window.__v2, c = v.view.cam, B = v.view.bounds, a = v.camApi.s2w(0, 0), b = v.camApi.s2w(c.width, c.height); return a.x >= B.x - .5 && a.y >= B.y - .5 && b.x <= B.x + B.w + .5 && b.y <= B.y + B.h + .5; });
  const sel = () => G(() => window.__v2.ui.sel);
  const lines = () => G(() => window.__v2.game.lines.length);
  const menu = async s => { if (await page.locator('#buildmenu').isHidden()) { await page.tap('#b-build'); await wait(150); } await page.tap(s); await wait(150); };
  // scene: well + two tanks (core), camera on them
  const sc = await G(() => { const v = window.__v2, g = v.game; g.s.cash = 1e6; window.OliCore.CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    for (let y = 0; y < 88; y++) for (let x = 0; x < 140; x++) if (g.canPlace('well', x, y).ok) { const a = g.nearestValid('tank', x + 7, y + 1, 12), b = g.nearestValid('tank', x + 1, y + 7, 12); if (a && b && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > 3) { const w = g.place('well', x, y, 'small').building, t1 = g.place('tank', a[0], a[1]).building, t2 = g.place('tank', b[0], b[1]).building; const c = v.tc(x + 3, y + 3); v.view.cam.setZoom(1); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); return { w: { id: w.id, x: w.x, y: w.y }, t1: { id: t1.id, x: t1.x + .5, y: t1.y + .5 }, t2: { id: t2.id, x: t2.x + .5, y: t2.y + .5 } }; } } });
  await wait(300);
  // A. tap a building; a 6px wobble is still a tap
  await tap(await scr(sc.w.x, sc.w.y, -10), 6); assert.deepStrictEqual(await sel(), { kind: 'b', id: sc.w.id }); log('A. tap (with a 6 px wobble) on the well selects it');
  // B. one-finger pan: moves the map, keeps the selection, no drift after release, stays in bounds
  const c0 = await cam(); await drag({ x: 300, y: 420 }, { x: 200, y: 470 }); const c1 = await cam(); await wait(500); const c2 = await cam();
  const follow = Math.hypot(c1.x - c0.x, c1.y - c0.y) / Math.hypot(100, 50) * c0.z; assert(Math.abs(follow - 1) < .02, 'the map must follow the finger 1:1, got ' + follow.toFixed(3)); assert.deepStrictEqual(c2, c1, 'no drift after release'); assert.deepStrictEqual(await sel(), { kind: 'b', id: sc.w.id }, 'pan never changes the selection');
  log('B. pan: the map followed the finger 1:1 (' + Math.round(c1.x - c0.x) + ',' + Math.round(c1.y - c0.y) + ' for a -100,50 px drag at zoom ' + c0.z + '); no drift after release; selection untouched');
  // a pan that starts ON a building selects nothing (L)
  await G(() => window.__v2.select(null)); const tp = await scr(sc.t1.x, sc.t1.y, -20); await drag(tp, { x: tp.x - 90, y: tp.y + 30 }); assert.strictEqual(await sel(), null); log('L/J. a drag that starts on a tank pans the map and selects nothing');
  // C. pinch: the world point under the fingers stays under them; limits; bounds
  const mid = { x: 195, y: 400 }, w0 = await A(m => window.__v2.camApi.s2w(m.x, m.y), mid);
  await pinchG(mid, 60, 160); const z1 = (await cam()).z, w1 = await A(m => window.__v2.camApi.s2w(m.x, m.y), mid);
  assert(Math.hypot(w1.x - w0.x, w1.y - w0.y) < 1.5, 'anchor moved ' + JSON.stringify([w0, w1])); log('C. pinch zoom ' + c2.z.toFixed(2) + ' -> ' + z1.toFixed(2) + ': the point under the fingers moved ' + Math.hypot(w1.x - w0.x, w1.y - w0.y).toFixed(2) + ' world px (no jump)');
  await pinchG(mid, 40, 300); await pinchG(mid, 40, 300); const zmax = (await cam()).z; await pinchG(mid, 300, 30); await pinchG(mid, 300, 30); await pinchG(mid, 300, 30); const zmin = (await cam()).z, mz = await G(() => window.__v2.camApi.minZoom());
  assert(zmax <= 1.8 + 1e-9 && Math.abs(zmin - mz) < 1e-6 && zmin >= .45 && await inBounds()); log('C. zoom limits: max ' + zmax.toFixed(2) + ', min ' + zmin.toFixed(2) + ' (never smaller than 0.45, the view never leaves the world)');
  await drag({ x: 100, y: 300 }, { x: 390, y: 700 }); await drag({ x: 100, y: 300 }, { x: 390, y: 700 }); await drag({ x: 100, y: 300 }, { x: 390, y: 700 }); assert(await inBounds()); log('B. three hard pans toward a corner: the view stays inside the world');
  await A(s => { const v = window.__v2, c = v.tc(s.w.x + 3, s.w.y + 3); v.view.cam.setZoom(1); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); }, sc); await wait(200);
  // D. opening Build does not move the camera
  const d0 = await cam(); await page.tap('#b-build'); await wait(200); assert.deepStrictEqual(await cam(), d0); log('D. opening Build: camera unchanged');
  // E/F. nodes: start + destination; camera never moves; preview immediately
  await menu('[data-tool=pipe][data-ptype="0"]'); const e0 = await cam();
  // a tap NEAR the well (not on it) still picks it: big touch target
  const wp = await scr(sc.w.x, sc.w.y); await tap({ x: wp.x + 22, y: wp.y + 14 }); assert.strictEqual(await G(() => window.__v2.ui.a), 'B' + sc.w.id, 'near tap picks the well'); log('E. a tap 26 px beside the well still picks it (start node B' + sc.w.id + ')');
  const t0 = Date.now(); await TE('touchStart', [await scr(sc.t1.x, sc.t1.y, -20)]); await TE('touchEnd', []); const routed = await G(() => !!window.__v2.ui.route); const dt = Date.now() - t0;
  assert(routed, 'preview right after the second tap'); await wait(150); assert(await page.locator('#confirm').isVisible()); assert.deepStrictEqual(await cam(), e0, 'node taps never move the camera'); log('F. second node -> route preview ready ' + dt + ' ms after the finger lifts; camera did not move');
  // K/M. pinch + pan while building keeps the nodes and builds nothing
  await pinchG(mid, 80, 140); await drag({ x: 300, y: 300 }, { x: 260, y: 330 }); assert.strictEqual(await G(() => window.__v2.ui.a), 'B' + sc.w.id); assert(await G(() => !!window.__v2.ui.route)); assert.strictEqual(await lines(), 0); log('K/M. pinch + pan while building: start, destination and preview kept, nothing built');
  // G. cancel
  await page.tap('#cf-no'); await wait(150); assert(!(await G(() => window.__v2.ui.a)) && !(await page.locator('#confirm').isVisible()) && await G(() => window.__v2.view.scene.prevG.commandBuffer.length === 0)); log('G. cancel: preview and nodes cleared');
  // H. confirm (pressed 3x)
  await A(s => { const v = window.__v2, c = v.tc(s.w.x + 3, s.w.y + 3); v.view.cam.setZoom(1); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); }, sc); await wait(200);
  await menu('[data-tool=pipe][data-ptype="0"]'); await tap(await scr(sc.w.x, sc.w.y, -10)); await tap(await scr(sc.t1.x, sc.t1.y, -20)); await G(() => { const b = document.getElementById('cf-ok'); b.click(); b.click(); b.click(); }); await wait(300);
  assert.strictEqual(await lines(), 1); log('H. confirm pressed 3x: exactly one pipe');
  // N. invalid choices give the reason immediately
  await menu('[data-tool=pipe][data-ptype="0"]'); await tap({ x: 40, y: 250 }); let tt = (await page.textContent('#toast')).trim(); assert(/اضغط على بئر/.test(tt) && !(await G(() => window.__v2.ui.a)), tt); log('N. tap on empty ground: "' + tt + '"');
  await tap(await scr(sc.w.x, sc.w.y, -10)); await tap(await scr(sc.t1.x, sc.t1.y, -20)); tt = (await page.textContent('#toast')).trim(); assert(/متصلتان/.test(tt), tt); log('N. same pair again: "' + tt + '" (shown at once)');
  await page.tap('#cf-no'); await wait(100);
  // I. rapid taps never build
  for (let i = 0; i < 8; i++) { await TE('touchStart', [{ x: 120 + i * 18, y: 360 }]); await TE('touchEnd', []); await wait(25); } await wait(250); assert.strictEqual(await lines(), 1); log('I. eight rapid taps: no pipe without confirm');
  await G(() => window.__v2.setTool(null));
  // P. focus: select the tank, pan away, press Focus -> a smooth glide (several in-between positions), ends centred
  await G(() => window.__v2.select(null)); await tap(await scr(sc.t2.x, sc.t2.y, -20)); assert.strictEqual((await sel()).id, sc.t2.id);
  await drag({ x: 300, y: 300 }, { x: 60, y: 520 }); const pos = []; await page.tap('#b-focus'); for (let i = 0; i < 6; i++) { pos.push(await cam()); await wait(90); } await wait(300);
  const fin = await G(() => { const v = window.__v2, c = v.view.cam, m = v.camApi.s2w(c.width / 2, c.height / 2); return m; }), tgt = await A(t => window.__v2.tc(t.x, t.y), sc.t2);
  const distinct = new Set(pos.map(p => Math.round(p.x) + ',' + Math.round(p.y))).size; assert(distinct >= 3, 'glide, not teleport: ' + distinct); assert(Math.hypot(fin.x - tgt.x, fin.y - (tgt.y - 30)) < 2);
  log('P. Focus: the camera glided through ' + distinct + ' positions to the selected tank (no teleport)');
  // O. save / reload: camera restored inside bounds, pipes identical
  const ln = await lines(); await G(() => window.__v2.save()); await page.reload(); await wait(1600); assert.strictEqual(await lines(), ln); assert(await inBounds()); log('O. save -> reload: pipes kept, camera restored inside the world');
  assert.deepStrictEqual(errors, [], errors.join('\n')); await browser.close(); console.log('ALL V2 CONTROL TESTS PASSED (no console errors)');
})().catch(e => { console.error(e); process.exit(1); });
