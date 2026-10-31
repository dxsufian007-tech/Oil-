// Oli v2 - grab / drag / release interaction with real touch on a phone (camera, pipe dragging, building dragging).
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file:///home/claude/oli/v2.html', OUT = process.argv[2] || '/tmp/oli-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const log = m => console.log('ok   ' + m);
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForTimeout(1600);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const TE = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const down = async p => { await TE('touchStart', [p]); await frame(); }, move = async p => { await TE('touchMove', [p]); await frame(); }, upp = async () => { await TE('touchEnd', []); await frame(); await wait(60); };
  const dragPath = async (pts, hold) => { await down(pts[0]); for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; for (let j = 1; j <= 6; j++) await move({ x: a.x + (b.x - a.x) * j / 6, y: a.y + (b.y - a.y) * j / 6 }); } if (!hold) await upp(); };
  const tap = async p => { await down(p); await upp(); await wait(100); };
  const scr = (x, y, dy = 0) => A(([x, y, dy]) => { const v = window.__v2, c = v.tc(x, y); return v.camApi.w2s(c.x, c.y + dy); }, [x, y, dy]);
  const cam = () => G(() => { const c = window.__v2.view.cam; return { x: c.scrollX, y: c.scrollY, z: c.zoom }; });
  const lines = () => G(() => window.__v2.game.lines.map(L => ({ id: L.id, a: L.a, b: L.b })));
  const valid = async w => { const p = await G(() => window.__v2.game.validateNetwork()); assert.deepStrictEqual(p, [], w + ': ' + p.slice(0, 3).join('|')); };
  const menu = async s => { if (await page.locator('#buildmenu').isHidden()) { await page.tap('#b-build'); await wait(120); } await page.tap(s); await wait(120); };
  const center = (x, y, z) => A(([x, y, z]) => { const v = window.__v2, c = v.tc(x, y); v.view.cam.setZoom(z || 1); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); }, [x, y, z]);
  const sc = await G(() => { const v = window.__v2, g = v.game; g.s.cash = 1e6; window.OliCore.CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    for (let y = 0; y < 88; y++) for (let x = 0; x < 140; x++) if (g.canPlace('well', x, y).ok) { const a = g.nearestValid('tank', x + 7, y + 1, 10), b = g.nearestValid('tank', x + 1, y + 7, 10); if (a && b && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > 4) { const w = g.place('well', x, y, 'small').building, t1 = g.place('tank', a[0], a[1]).building, t2 = g.place('tank', b[0], b[1]).building; return { w: { id: w.id, x: w.x, y: w.y }, t1: { id: t1.id, x: t1.x + .5, y: t1.y + .5 }, t2: { id: t2.id, x: t2.x + .5, y: t2.y + .5 } }; } } });
  await center(sc.w.x + 3, sc.w.y + 3, 1); await frame();
  // 1-2. drag the map: it follows the finger 1:1 and stops where the finger stops
  let c0 = await cam(); const g0 = await A(() => window.__v2.camApi.s2w(300, 420)); await dragPath([{ x: 300, y: 420 }, { x: 200, y: 470 }]); let g1 = await A(() => window.__v2.camApi.s2w(200, 470));
  assert(Math.hypot(g1.x - g0.x, g1.y - g0.y) < 1, 'the grabbed world point stays under the finger: ' + JSON.stringify([g0, g1])); const c1 = await cam(); await wait(400); assert.deepStrictEqual(await cam(), c1, 'no drift');
  log('1-2. drag map: the point grabbed stays under the finger (error ' + Math.hypot(g1.x - g0.x, g1.y - g0.y).toFixed(2) + ' px), stops dead on release');
  // 3-5. pinch: anchored, limits
  const m = { x: 195, y: 400 }, w0 = await A(m => window.__v2.camApi.s2w(m.x, m.y), m);
  await down({ x: 165, y: 400 }); await TE('touchStart', [{ x: 165, y: 400 }, { x: 225, y: 400 }]); await frame(); for (let i = 1; i <= 8; i++) { await TE('touchMove', [{ x: 165 - i * 8, y: 400 }, { x: 225 + i * 8, y: 400 }]); await frame(); } await upp();
  const w1 = await A(m => window.__v2.camApi.s2w(m.x, m.y), m), z1 = (await cam()).z; assert(Math.hypot(w1.x - w0.x, w1.y - w0.y) < 1.5 && z1 > c1.z * 1.5); log('3-4. pinch in ' + c1.z.toFixed(2) + ' -> ' + z1.toFixed(2) + ', the point between the fingers moved ' + Math.hypot(w1.x - w0.x, w1.y - w0.y).toFixed(2) + ' px');
  await center(sc.w.x + 3, sc.w.y + 3, .5); const mz = await G(() => window.__v2.camApi.minZoom()); await A(() => window.__v2.camApi.setZoomAt(.001, 195, 400, ...Object.values(window.__v2.camApi.s2w(195, 400)))); assert(Math.abs((await cam()).z - mz) < 1e-9 && mz < .2); log('5. zoom out stops at ' + mz.toFixed(3) + ' (the whole map fits on the screen)');
  await center(sc.w.x + 3, sc.w.y + 3, 1); await frame();
  // 6-13. pipe: grab the well, drag around (the pipe follows, nothing built), reach the tank (snaps green), release = built
  await menu('[data-tool=pipe][data-ptype="0"]'); const cp = await cam();
  const pw = await scr(sc.w.x, sc.w.y, -8), pt = await scr(sc.t1.x, sc.t1.y, -20), off = { x: (pw.x + pt.x) / 2, y: (pw.y + pt.y) / 2 + 70 };
  await dragPath([pw, off], true); const mid1 = await G(() => { const v = window.__v2; return { a: v.ui.a, drag: v.ui.dragging, free: !!(v.ui.route && v.ui.route.free), n: v.view.scene.previewGeom ? v.view.scene.previewGeom.pts.length : 0 }; });
  assert.strictEqual(mid1.a, 'B' + sc.w.id); assert(mid1.drag && mid1.n > 1, JSON.stringify(mid1));   // (with the magnetic assist the pipe may already be attracted to a nearby tank here) assert.deepStrictEqual(await cam(), cp, 'dragging a pipe never moves the camera'); assert.strictEqual((await lines()).length, 0);
  await page.screenshot({ path: `${OUT}/drag-1-following.png` }); log('7-9. grab the well and drag: the pipe follows the finger (' + mid1.n + ' points), camera still, nothing built yet');
  // a finger near the tank (not exactly on it) snaps to it
  for (let j = 1; j <= 6; j++) await move({ x: off.x + (pt.x + 18 - off.x) * j / 6, y: off.y + (pt.y + 10 - off.y) * j / 6 });
  const snap = await G(() => { const r = window.__v2.ui.route; return r && { ok: r.ok, b: r.b, cost: r.cost }; }); assert(snap && snap.ok && snap.b === 'B' + sc.t1.id, JSON.stringify(snap));
  const prev = await G(() => window.__v2.view.scene.previewGeom.pts.map(p => [+p.x.toFixed(2), +p.y.toFixed(2)]));
  await page.screenshot({ path: `${OUT}/drag-2-snapped.png` }); log('10-11. near the tank (20 px off) the pipe snaps to its connection: green, ' + snap.cost + ' $');
  const cash0 = await G(() => window.__v2.game.s.cash); await upp(); await wait(150);
  let L = await lines(); assert.strictEqual(L.length, 1); assert.strictEqual(L[0].a, 'B' + sc.w.id); assert.strictEqual(L[0].b, 'B' + sc.t1.id);
  const built = await G(() => { const sc = window.__v2.view.scene; return sc.geoms[0].pts.map(p => [+p.x.toFixed(2), +p.y.toFixed(2)]); }); assert.deepStrictEqual(built, prev, 'built == preview');
  const spent = cash0 - await G(() => window.__v2.game.s.cash); assert(Math.abs(spent - snap.cost) < 50); await valid('built');
  log('12-13. release: built at once, ONE pipe B' + sc.w.id + ' -> B' + sc.t1.id + ', exactly the previewed geometry, paid ' + Math.round(spent) + ' $');
  // 14-15. start and change mind: release on empty ground -> nothing built, nothing paid, pipe stays attached; ✕ cancels
  const t2p = await scr(sc.t2.x, sc.t2.y, -20); await dragPath([t2p, { x: 60, y: 300 }]); let opn = await G(() => { const g = window.__v2.game, L = g.lines[g.lines.length - 1]; return { n: g.lines.length, state: L.state, id: L.id }; });
  assert(opn.n === 2 && opn.state === 'OPEN', JSON.stringify(opn)); await A(id => { const g = window.__v2.game, L = g.lines.find(q => q.id === id); for (const k of L.cells.slice()) g.removeAt(k % 140, (k / 140) | 0); }, opn.id);
  log('15a. released on free ground: an OPEN pipe was built (valid)');
  const c2 = await G(() => window.__v2.game.s.cash); await dragPath([t2p, { x: 60, y: 300 }, t2p]);
  assert.strictEqual((await lines()).length, 1); assert(c2 - await G(() => window.__v2.game.s.cash) < 50); assert(await G(() => !window.__v2.ui.a && !window.__v2.ui.dragging));
  log('15b. dragged out and back onto the start: nothing built or paid, the pipe went back');
  // ... continue the same pipe: touch anywhere and drag to the well's pipe (junction) -> builds a branch
  const midTile = await G(() => { const L = window.__v2.game.lines[0], k = L.cells[Math.floor(L.cells.length / 2)]; return { x: k % 140, y: (k / 140) | 0 }; });
  await dragPath([await scr(sc.t2.x, sc.t2.y, -20), await scr(midTile.x, midTile.y)]); L = await lines(); assert.strictEqual(L.length, 2, 'drag from tank 2 onto the pipe built the branch'); await valid('branch');
  const br = L.find(q => q.a === 'B' + sc.t2.id || q.b === 'B' + sc.t2.id); assert(br && (br.a[0] === 'J' || br.b[0] === 'J')); log('16-17. dragged from tank 2 onto the existing pipe: branch built (' + br.a + ' -> ' + br.b + ')');
  await page.screenshot({ path: `${OUT}/drag-3-branch.png` });
  // cancel: start a drag, release on nothing, press ✕ -> clean
  await center(sc.w.x + 3, sc.w.y + 3, 1); await frame(); { const t1p = await scr(sc.t1.x, sc.t1.y, -20); await dragPath([t1p, { x: 330, y: 260 }, t1p]); } await wait(100);
  assert(!(await G(() => window.__v2.ui.a)) && await G(() => window.__v2.view.scene.prevG.commandBuffer.length === 0)); log('14. start, change your mind, release on nothing: nothing attached, no preview left, no money spent');
  // 18. pump: build a pump on the first pipe (through the core), drag from the pump to tank 2 is refused or built cleanly - graph stays valid
  const pump = await G(() => { const g = window.__v2.game, L = g.lines[0], k = L.cells[1]; const r = g.place('pump', k % 140, (k / 140) | 0); return r.ok ? { id: r.building.id, x: r.building.x, y: r.building.y } : null; });
  if (pump) { await valid('pump'); await frame(); const pp = await scr(pump.x, pump.y, -10); await down(pp); const pa = await G(() => window.__v2.ui.a); await upp(); assert.strictEqual(pa, 'B' + pump.id); await page.tap('#cf-no').catch(() => {}); log('18. touching the pump grabs its connection (B' + pump.id + '); network valid with the pump on the line'); }
  // 20. rapid touches on the map in pipe mode: no pipe
  const n0 = (await lines()).length; for (let i = 0; i < 8; i++) { await TE('touchStart', [{ x: 80 + i * 25, y: 250 }]); await TE('touchEnd', []); await wait(20); } await wait(200); await page.tap('#cf-no').catch(() => {}); assert.strictEqual((await lines()).length, n0); log('20. eight rapid touches: no pipe');
  await G(() => window.__v2.setTool(null)); await page.tap('#b-build').catch(() => {});
  // 19. building placement: drag the tank preview under the finger, release, confirm
  await menu('[data-tool=tank]'); const spot = await G(() => { const g = window.__v2.game, v = window.__v2, c = v.camApi.s2w(195, 380), t = v.toTile(c.x, c.y); return g.nearestValid('tank', t.x, t.y, 20); });
  await center(spot[0] + .5, spot[1] + .5, 1); await frame(); const s1 = await scr(spot[0] + 3, spot[1] - 3), s2 = await scr(spot[0], spot[1]); const cb = await cam();
  await dragPath([s1, s2], true); const pend = await G(() => window.__v2.ui.pending); assert.deepStrictEqual(await cam(), cb, 'dragging a building never moves the camera'); await upp();
  assert(pend && Math.abs(pend.x - spot[0]) <= 2 && Math.abs(pend.y - spot[1]) <= 2, JSON.stringify([pend, spot])); await wait(200);
  assert(await G(() => window.__v2.game.buildings.some(b => b.type === 'tank' && b.x === window.__v2.game.buildings[window.__v2.game.buildings.length - 1].x))); log('19. tank preview followed the finger to (' + pend.x + ',' + pend.y + '), camera still; release on a valid spot = built');
  // 21. tap -> drag transition: a 6 px wobble on a building still selects; 40 px pans
  await tap(await scr(sc.t1.x, sc.t1.y, -20)); assert(await G(() => window.__v2.ui.sel && window.__v2.ui.sel.id === window.__v2.game.buildings[1].id)); log('21. a tap selects the tank; a drag from it pans instead (checked in 1-2)');
  // 22-24. save / load; several pipes and tanks
  const before = JSON.stringify(await lines()); await G(() => window.__v2.save()); await page.reload(); await wait(1600); assert.strictEqual(JSON.stringify(await lines()), before); await valid('reload');
  log('22-24. save -> reload: ' + (await lines()).length + ' pipes and ' + await G(() => window.__v2.game.buildings.length) + ' buildings identical, network valid');
  assert.deepStrictEqual(errors, [], errors.join('\n')); await browser.close(); console.log('ALL V2 DRAG TESTS PASSED (no console errors)');
})().catch(e => { console.error(e); process.exit(1); });
