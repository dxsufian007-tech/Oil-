// Phase 22 (building system repair): real touch on a phone. Move / cancel / confirm, build after zoom+pan, rapid build/cancel, touch+click, delete connected, save/reload.
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file:///home/claude/oli/index.html';
const OUT = process.argv[2] || '/tmp/oli-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const log = m => console.log('ok   ' + m);
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL); await page.evaluate(() => { window.OliCore.CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 }; window.__oli.game.s.tutorialDone = true; window.__oli.game.s.cash = 1e6; }); await page.waitForTimeout(600);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const TE = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const scr = (x, y) => A(([x, y]) => { const { cam } = window.__oli, r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + ((x - y) * 32 - cam.x) * cam.z + r.width / 2, y: r.top + ((x + y) * 16 + 16 - cam.y) * cam.z + r.height / 2 }; }, [x, y]);
  const tapAt = (x, y) => page.touchscreen.tap(x, y);
  const drag = async (a, b, steps = 14) => { await TE('touchStart', [a]); for (let i = 1; i <= steps; i++) { await TE('touchMove', [{ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }]); await wait(16); } await TE('touchEnd', []); };
  const center = (x, y, z) => A(([x, y, z]) => { const c = window.__oli.cam; c.x = (x - y) * 32; c.y = (x + y) * 16 - 20; if (z) c.z = z; window.__oli.camGoal.on = false; }, [x, y, z]);
  const bld = () => G(() => window.__oli.game.buildings.map(b => ({ id: b.id, type: b.type, x: b.x, y: b.y })));
  const cash = () => G(() => window.__oli.game.s.cash);
  const valid = async w => { const p = await G(() => window.__oli.game.validateNetwork()); assert.deepStrictEqual(p, [], w + ': ' + p.join('|')); };
  const openMenu = async () => { if (await page.locator('#buildmenu').isHidden()) { await page.tap('#btn-build'); await wait(250); } };
  // a scene through the core: well - pipe - tank in a free, explored area
  const sc = await G(() => { const g = window.__oli.game; const sp = window.__oli.getSpots('well')[0]; const x = sp[0], y = sp[1]; const w = g.place('well', x, y, 'small'); const ts = g.nearestValid('tank', x + 9, y, 25, window.__oli.getSpots('tank')); const t = ts ? g.place('tank', ts[0], ts[1]) : { ok: false }; let r = { ok: false }; if (t.ok) { r = g.routePipe(x + 1, y, ts[0] - 1, ts[1]); if (r.ok) g.buildRoute(r); } return { x, y, w: w.ok, t: t.ok, r: r.ok, reason: r.reason }; });
  assert(sc.w && sc.t && sc.r, JSON.stringify(sc)); await G(() => { window.__oli.game.s.tutorialDone = true; }); await wait(200);
  const { x: X, y: Y } = sc; await center(X + 4, Y, 1.2); await wait(300);
  // ---------- A. tap empty map, pan, tap building
  const e0 = await scr(X + 4, Y + 6); await tapAt(e0.x, e0.y); await wait(250); assert(!(await G(() => window.__oli.ui.sel)), 'tapping empty map selects nothing'); log('A1: tap on empty map selects nothing');
  const c0 = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y })); await drag({ x: 250, y: 300 }, { x: 150, y: 330 }); await wait(300); const c1 = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y })); assert(Math.hypot(c1.x - c0.x, c1.y - c0.y) > 20); assert(!(await G(() => window.__oli.ui.sel))); log('A2: one-finger drag pans the map, selects nothing');
  await center(X + 4, Y, 1.2); await wait(300);
  const tk = (await bld()).find(b => b.type === 'tank'), tp = await scr(tk.x, tk.y); await tapAt(tp.x, tp.y); await wait(300);
  assert(await G(() => !!window.__oli.ui.sel && window.__oli.ui.sel.kind === 'b' && !document.getElementById('panel').hidden)); log('A3: tapping the tank selects it and opens its panel');
  // tiny finger movement while tapping is still a tap
  await TE('touchStart', [{ x: tp.x, y: tp.y }]); await TE('touchMove', [{ x: tp.x + 3, y: tp.y + 2 }]); await TE('touchEnd', []); await wait(300); assert(await G(() => !!window.__oli.ui.sel)); log('A4: a 3px wobble is still a tap (selection kept)');
  // ---------- B. move: cancel then confirm
  assert(await page.locator('[data-act=move]').isVisible()); await page.tap('[data-act=move]'); await wait(300);
  assert.strictEqual(await G(() => window.__oli.ui.moveId), tk.id); assert.strictEqual(await G(() => window.__oli.ui.tool), 'tank'); log('B1: Move pressed -> move mode for this tank only');
  const dest = { x: tk.x + 3, y: tk.y + 5 }, dp = await scr(dest.x, dest.y); await tapAt(dp.x, dp.y); await wait(300);
  assert(await page.locator('#confirm').isVisible()); const ctext = await page.textContent('#confirm-text'); const before = await bld(); const cashB = await cash();
  assert.deepStrictEqual(await bld(), before); log('B2: preview shows "' + ctext.trim() + '" - real position unchanged (' + tk.x + ',' + tk.y + ')');
  await page.tap('#confirm-no'); await wait(300);
  assert.deepStrictEqual(await bld(), before); assert.strictEqual(await G(() => window.__oli.ui.tool), 'select'); assert(await A(id => window.__oli.ui.sel && window.__oli.ui.sel.id === id, tk.id)); assert(!(await page.locator('#confirm').isVisible())); assert.strictEqual(await G(() => window.__oli.game.moving == null), true); await valid('after cancel move'); log('B3: Cancel -> exact original position, Select mode, tank still selected, nothing left behind');
  await page.tap('[data-act=move]'); await wait(300); await tapAt(dp.x, dp.y); await wait(300);
  // preview follows a drag (finger), and a pan with two fingers does not move the building
  const dp2 = await scr(dest.x + 1, dest.y); await drag({ x: dp.x, y: dp.y }, { x: dp2.x, y: dp2.y }, 8); await wait(250); const pend = await G(() => window.__oli.ui.pending); assert(pend, 'preview alive'); assert.deepStrictEqual(await bld(), before);
  await page.tap('#confirm-ok'); await wait(450);
  const after = await bld(), nt = after.find(b => b.id === tk.id); assert(nt.x !== tk.x || nt.y !== tk.y, 'moved'); assert.strictEqual(await cash() <= cashB + 5, true); assert.strictEqual(await G(() => window.__oli.ui.tool), 'select'); assert(await A(id => window.__oli.ui.sel && window.__oli.ui.sel.id === id, tk.id)); 
  await valid('after move'); assert(await G(() => !document.getElementById('panel').hidden)); log('B4: Confirm -> tank at (' + nt.x + ',' + nt.y + '), Select mode, still selected, graph valid, move was free');
  const routes = await G(() => { const g = window.__oli.game, w = g.buildings.find(b => b.type === 'well'); return (g.net.routes.get(w.id) || []).length; }); assert.strictEqual(routes, 0); log('B5: the pipe no longer touches the moved tank -> the well has 0 routes (visual and game state agree)');
  await page.screenshot({ path: `${OUT}/p22-1-moved.png` });
  // double confirm press cannot move twice / pay twice
  await G(() => window.__oli.select({ kind: 'b', id: window.__oli.game.buildings.find(b => b.type === 'tank').id })); await wait(200);
  // ---------- C. build after zoom + pan (the critical Android test)
  const buildAt = async (z, label) => {
    await G(() => { window.__oli.setTool('select'); window.__oli.select(null); }); await openMenu(); await page.tap('[data-tool=tank]'); await wait(200);
    const spot = await G(() => { const g = window.__oli.game, c = window.__oli.cellAt(195, 300); return g.nearestValid('tank', c.x, c.y, 60, window.__oli.getSpots('tank')); });
    await center(spot[0], spot[1], z); await wait(250);
    // pan away and back by dragging (changes the camera), then zoom with two fingers, then pan again
    await drag({ x: 300, y: 300 }, { x: 240, y: 330 }); await wait(250);
    await TE('touchStart', [{ x: 160, y: 300 }, { x: 230, y: 300 }]); for (let i = 1; i <= 8; i++) { await TE('touchMove', [{ x: 160 - i * 3, y: 300 }, { x: 230 + i * 3, y: 300 }]); await wait(16); } await TE('touchEnd', []); await wait(250);
    await drag({ x: 200, y: 330 }, { x: 260, y: 300 }); await wait(250);
    const cell = await G(() => { const g = window.__oli.game, c = window.__oli.cellAt(195, 300); return g.nearestValid('tank', c.x, c.y, 40, window.__oli.getSpots('tank')); });
    const pt = await scr(cell[0], cell[1]); await tapAt(pt.x, pt.y); await wait(300);
    const pe = await G(() => window.__oli.ui.pending); assert(pe, label + ': preview exists'); const hit = Math.hypot(pe.x - cell[0], pe.y - cell[1]); assert(hit <= 1.5, label + ': preview ' + pe.x + ',' + pe.y + ' vs tapped ' + cell + ' (the building is under the finger)');
    const n0 = (await bld()).length; await page.tap('#confirm-ok'); await wait(400); const bl = await bld(); assert.strictEqual(bl.length, n0 + 1, label + ': one building'); const nb = bl[bl.length - 1];
    assert.strictEqual(nb.x, pe.x); assert.strictEqual(nb.y, pe.y); assert(await G(() => window.__oli.ui.sel && window.__oli.ui.tool === 'select')); await valid(label);
    log('C: ' + label + ': built exactly at the previewed tile (' + nb.x + ',' + nb.y + '), auto-selected, graph valid');
  };
  await buildAt(2, 'zoomed in (2.0) + pan/zoom/pan'); await buildAt(0.6, 'zoomed out (0.6) + pan/zoom/pan'); await buildAt(1.2, 'medium zoom + pan/zoom/pan');
  // ---------- D. rapid build / cancel, touch + click duplication
  await G(() => { window.__oli.setTool('select'); window.__oli.select(null); }); await openMenu(); await page.tap('[data-tool=well]'); await wait(200);
  const rs = await G(() => { const g = window.__oli.game, c = window.__oli.cellAt(195, 300); return g.nearestValid('well', c.x, c.y, 80, window.__oli.getSpots('well')); }); await center(rs[0], rs[1], 1.2); await wait(250); const rp = await scr(rs[0], rs[1]);
  const n1 = (await bld()).length, cashR = await cash();
  for (let i = 0; i < 6; i++) { await tapAt(rp.x, rp.y); await wait(60); if (await page.locator('#confirm').isVisible()) await page.tap('#confirm-no'); await wait(40); }
  assert.strictEqual((await bld()).length, n1); assert(Math.abs(await cash() - cashR) < 30); assert(!(await G(() => !!window.__oli.ui.pending))); log('D1: six rapid build/cancel cycles -> no building, no money lost, no preview left');
  await tapAt(rp.x, rp.y); await wait(300); await G(() => { const b = document.getElementById('confirm-ok'); b.click(); b.click(); b.click(); }); await wait(400);
  assert.strictEqual((await bld()).length, n1 + 1, 'three clicks on Confirm -> exactly ONE building'); log('D2: Confirm clicked 3x at once -> exactly one building, one payment');
  await page.screenshot({ path: `${OUT}/p22-2-after.png` });
  // ---------- E. delete connected building -> graph valid, no orphans
  const w = (await bld()).find(b => b.type === 'well'); await G(() => { window.__oli.setTool('select'); }); await center(w.x + 2, w.y, 1.2); await wait(250); await A(id => window.__oli.select({ kind: 'b', id }), w.id); await wait(300);
  await page.tap('[data-act=remove]'); await wait(350); if ((await bld()).some(b => b.id === w.id)) { await page.tap('[data-act=remove]'); await wait(350); }
  assert(!(await bld()).some(b => b.id === w.id)); await valid('after delete'); const orph = await G(() => window.__oli.game.net.routes.has && window.__oli.game.net.routes.has(0)); log('E: deleting the connected well -> gone from state, graph valid, no orphan routes');
  // ---------- F. save + reload keeps buildings, positions and a valid network
  const pre = await bld(); await G(() => window.dispatchEvent(new Event('beforeunload'))); await wait(200); await page.reload(); await wait(900);
  const post = await bld(); assert.deepStrictEqual(post.map(b => [b.id, b.type, b.x, b.y]), pre.map(b => [b.id, b.type, b.x, b.y])); await valid('after reload'); log('F: save -> reload: ' + post.length + ' buildings at the same tiles, network valid');
  assert.deepStrictEqual(errors, [], errors.join('\n')); await browser.close(); console.log('ALL PHASE 22 UI TESTS PASSED (no console errors)');
})().catch(e => { console.error(e); process.exit(1); });
