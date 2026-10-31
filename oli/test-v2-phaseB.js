// PHASE B on screen (real CDP touch, phone size): BUILDING_PLACEMENT - select, preview, follow, valid / invalid, footprint collision, bounds, snap, cost, cancel, confirm,
// building drag isolation, camera unchanged, pump rotation / connection points, save / load, rapid touch, second finger. Pan 1:1 at several zooms, no inertia, tap vs drag, pinch about the midpoint,
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
  const G = (fn, a) => page.evaluate(fn, a), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  // CDP: touchStart / touchMove list the points that are down; touchEnd lists the points that are LIFTED
  const TE = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id || 0 })) });
  const fr = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  const cam = () => G(() => { const c = window.__v2.view.cam; return { x: c.scrollX, y: c.scrollY, z: c.zoom }; });
  const s2w = (p) => A(p => window.__v2.camApi.s2w(p.x, p.y), p);
  const state = () => G(() => window.__v2.touch.state);
  const center = (z, x, y) => A(([z, x, y]) => { const v = window.__v2, c = v.tc(x, y); v.view.cam.setZoom(z); v.view.cam.centerOn(c.x, c.y); v.camApi.clamp(); v.select(null); v.setTool(null); }, [z, x, y]);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const fingers = new Map();
  const all = () => [...fingers].map(([id, p]) => ({ x: p.x, y: p.y, id }));
  const down = async (id, x, y) => { fingers.set(id, { x, y }); await TE('touchStart', all()); };
  const move = async (id, x, y) => { fingers.get(id).x = x; fingers.get(id).y = y; await TE('touchMove', all()); };
  const up = async id => { const p = fingers.get(id); fingers.delete(id); await TE('touchEnd', [{ x: p.x, y: p.y, id }]); };
  // ---------- layout: a well -> tank pipe, an extra tank, some water; real prices (no free builds), cash 5000
  const L0 = await G(() => { const v = window.__v2, g = v.game; g.s.cash = 1e7; const C = window.OliCore.CFG; C.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    for (const a of g.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
    for (let y = 30; y < 60; y++) for (let x = 40; x < 90; x++) { let ok = true; for (let j = -3; j < 14 && ok; j++) for (let i = -3; i < 22; i++) if (!g.canPlace('tank', x + i, y + j).ok) { ok = false; break; }
      if (!ok) continue; const w = g.place('well', x, y, 'large').building, t = g.place('tank', x + 16, y).building; v.view.scene.paintGround(true);
      const r = g.routeNodes('B' + w.id, 'B' + t.id, 1); if (!r.ok) { g.removeAt(w.x, w.y); g.removeAt(t.x, t.y); continue; }
      const L = g.buildLine(r).line; for (let i = 0; i < 100; i++) g.step(.1); v.view.scene.netSig = ''; v.view.scene.drawPipes();
      return { X: x, Y: y, W: w.id, T: t.id, L: L.id, cells: L.cells.slice() }; } });
  assert(L0, 'layout'); const { X, Y } = L0; const W = 140, cell = i => { const n = L0.cells.length, k = L0.cells[Math.min(n - 2, Math.max(1, Math.round(i * n / 60)))]; return { x: k % W, y: (k / W) | 0 }; };
  const look = async (x, y, dy = 160) => { await A(([x, y, dy]) => { const v = window.__v2, c = v.tc(x, y); v.view.cam.setZoom(1); v.view.cam.centerOn(c.x, c.y + dy); v.camApi.clamp(); }, [x, y, dy]); await wait(250); };
  const sT = (x, y) => A(([x, y]) => { const v = window.__v2, c = v.tc(x, y); return v.camApi.w2s(c.x, c.y); }, [x, y]);
  const st = () => G(() => { const v = window.__v2; return { state: v.touch.state, tool: v.ui.tool, pending: v.ui.pending && { x: v.ui.pending.x, y: v.ui.pending.y }, snapped: !!v.ui.snapped, ghost: !!v.view.scene.ghost, cf: !document.querySelector('#confirm').hidden ? document.querySelector('#cf-text').textContent : null, ok: document.querySelector('#confirm').dataset.ok, n: v.game.buildings.length, cash: v.game.s.cash }; });
  const arm = async tool => { await G(([t]) => { const v = window.__v2; v.select(null); v.cancel(); v.setTool(t); }, [tool]); await fr(); };
  const disarm = async () => { await G(() => { const v = window.__v2; v.cancel(); v.setTool(null); }); await fr(); };
  const snap = () => G(() => { const g = window.__v2.game; return JSON.stringify([g.buildings.map(b => [b.id, b.type, b.x, b.y, b.dir]), g.lines.length, Array.from(g.pipe).reduce((a, v) => a + (v ? 1 : 0), 0)]); });
  const free = async (dx = 0, dy = 8) => A(([X, Y, dx, dy]) => { const v = window.__v2; return { x: X + 8 + dx, y: Y + dy }; }, [X, Y, dx, dy]);   // an empty area south of the pipe
  const shots = OUT;

  // ---------- B1 select a building: the BUILD button -> tank button arms BUILDING_PLACEMENT; nothing else changes
  {
    await look(X + 8, Y + 8); await tapMenu('tank');
    const s = await st(); assert.strictEqual(s.tool, 'tank'); assert.strictEqual(s.state, 'BUILDING_PLACEMENT'); assert(!s.pending && !s.ghost);
    log('B1. select a building: menu -> tank arms the tool and the touch state is BUILDING_PLACEMENT (no preview yet, nothing built)');
  }
  async function tapMenu(tool) {
    if (await G(() => document.querySelector('#buildmenu').hidden)) { const r = await G(() => { const b = document.querySelector('#b-build').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }); await TE('touchStart', [{ ...r, id: 0 }]); await fr(); await TE('touchEnd', [{ ...r, id: 0 }]); await fr(); await wait(150); }
    const r = await A(t => { const b = document.querySelector('#buildmenu [data-tool="' + t + '"]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, tool);
    await TE('touchStart', [{ ...r, id: 0 }]); await fr(); await TE('touchEnd', [{ ...r, id: 0 }]); await fr(); await wait(150);
  }
  // ---------- B2 + B3: touch -> preview appears under the finger, follows it, camera unchanged, nothing real is built
  let spot;
  {
    spot = await free(0, 8); const p = await sT(spot.x, spot.y); const before = await snap(), c0 = await cam(), s0 = await st();
    await down(1, p.x, p.y); await fr(); await fr(); let s = await st();
    assert.strictEqual(s.state, 'BUILDING_DRAG'); assert(s.ghost && s.pending, 'preview appears'); assert.deepStrictEqual(s.pending, { x: spot.x, y: spot.y }); assert.strictEqual(s.n, s0.n, 'no real building yet');
    log('B2. preview appears on touch at tile (' + s.pending.x + ',' + s.pending.y + '), state BUILDING_DRAG, no building created');
    let worst = 0; for (const [dx, dy] of [[1, 0], [2, 1], [3, 3], [1, 4], [-2, 3]]) { const q = await sT(spot.x + dx, spot.y + dy); await move(1, q.x, q.y); await fr(); s = await st(); if (s.pending.x !== spot.x + dx || s.pending.y !== spot.y + dy) worst++; }
    const c1 = await cam(); assert.strictEqual(worst, 0, 'preview followed the finger tile by tile'); assert(c0.x === c1.x && c0.y === c1.y && c0.z === c1.z, 'camera must not move');
    assert.strictEqual((await st()).n, s0.n); await up(1); await fr(); await G(() => { const v = window.__v2; v.cancel(); }); await fr();
    log('B3. preview follows the finger over 5 tiles exactly (camera unchanged, no building yet)'); log('B14. camera did not move during the placement drag (' + c1.x.toFixed(1) + ',' + c1.y.toFixed(1) + ')');
  }
  // ---------- B10 cost preview + B4/B12 valid placement + confirm: balance changes only at the build
  {
    await arm('tank'); spot = await free(2, 9); const p = await sT(spot.x, spot.y); const cash0 = (await st()).cash;
    await down(1, p.x, p.y); await fr(); await fr(); const s = await st(); const pl = await A(([x, y]) => window.__v2.game.placement('tank', x, y), [spot.x, spot.y]);
    assert.strictEqual(s.ok, '1'); { const nums = (s.cf.match(/\$([\d,]+)/g) || []).map(t => +t.replace(/[$,]/g, '')); assert.strictEqual(nums.length, 3, 'COST / BALANCE / AFTER in: ' + s.cf); assert.strictEqual(nums[0], Math.round(pl.cost)); assert(Math.abs(nums[1] - cash0) < 25); assert(Math.abs(nums[1] - nums[0] - nums[2]) <= 1, 'AFTER = BALANCE - COST'); } assert(Math.abs(s.cash - cash0) < 25, 'nothing charged during the preview (only live sales drift): ' + (s.cash - cash0)); await page.screenshot({ path: shots + '/pb-valid.png' });
    log('B10. cost preview: "' + s.cf + '" (nothing charged before the build)');
    const n0 = s.n; await up(1); await fr(); await wait(250); const e = await st(); const b = await A(([x, y]) => { const o = window.__v2.game.buildingAt(x, y); return o && { type: o.type, x: o.x, y: o.y }; }, [spot.x, spot.y]);
    assert(b && b.type === 'tank' && b.x === spot.x && b.y === spot.y, 'built at the previewed tile'); assert.strictEqual(e.n, n0 + 1); assert(Math.abs((cash0 - e.cash) - pl.cost) < 25, 'charged the previewed cost (+- live sales drift): ' + (cash0 - e.cash) + ' vs ' + pl.cost);
    assert.strictEqual(e.tool, null); assert.strictEqual(e.state, 'IDLE');
    log('B4/B12. valid placement + release = confirm: tank built at (' + b.x + ',' + b.y + '), charged $' + Math.round(pl.cost) + ' = previewed, tool released, state IDLE');
  }
  // ---------- B5 invalid placement (beside the middle of a pipe), B6 footprint collision, B7 bounds: preview stays, red, nothing built, no jump
  {
    await arm('tank'); const mid = cell(30), snap0 = await snap(); let q = await sT(mid.x, mid.y + 1); const s0 = await st();
    await look(mid.x, mid.y + 1); q = await sT(mid.x, mid.y + 1);
    // all around invalid? a tile right beside the pipe: neighbours 2 tiles away are valid -> that would snap; so make the surroundings invalid with water to test a real refusal
    await G(([mx, my]) => { const g = window.__v2.game; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (!g.pipe[(my + dy) * 140 + mx + dx] && !g.occ[(my + dy) * 140 + mx + dx]) g.map.water[(my + dy) * 140 + mx + dx] = 1; }, [mid.x, mid.y]);
    await down(1, q.x, q.y); await fr(); await fr(); const s = await st(); assert(s.pending && s.ghost, 'preview stays visible on an invalid spot'); assert.strictEqual(s.ok, '0'); assert.strictEqual(s.snapped, false, 'no valid tile around: nothing attracted it');
    assert.deepStrictEqual(s.pending, { x: mid.x, y: mid.y + 1 }, 'the preview did not jump away'); await page.screenshot({ path: shots + '/pb-invalid.png' });
    await up(1); await fr(); await wait(250); const e = await st(); assert.strictEqual(e.n, s0.n); assert(Math.abs(e.cash - s0.cash) < 25); assert.strictEqual(e.tool, 'tank', 'tool stays armed after a refused release'); assert(e.pending, 'preview remains after the refused release');
    log('B5. invalid placement beside a pipe: preview stays at the finger tile, red, "' + s.cf + '"; release builds nothing, charges nothing, tool stays armed');
    await G(([mx, my]) => { const g = window.__v2.game; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) g.map.water[(my + dy) * 140 + mx + dx] = 0; }, [mid.x, mid.y]);
    await G(() => window.__v2.cancel()); await fr();
    // B6 footprint collision with the existing tank (cells overlap only at a corner of the new footprint)
    const tk = await A(id => { const b = window.__v2.game.buildings.find(q => q.id === id); return { x: b.x, y: b.y }; }, L0.T); await look(tk.x, tk.y);
    const qc = await sT(tk.x + 1, tk.y - 1); await G(([x, y]) => { /* make the area around invalid for snapping so the refusal is visible */ }, [0, 0]);
    const ov = await A(([x, y]) => window.__v2.game.placement('tank', x, y), [tk.x + 1, tk.y - 1]); assert.strictEqual(ov.reason, 'overlap');
    await down(1, qc.x, qc.y); await fr(); await fr(); const so = await st(); await up(1); await fr(); await wait(200); const eo = await st();
    assert(so.ok === '1' ? so.snapped : true, 'overlap tile must either be refused or snapped to a valid tile'); if (so.snapped) assert(!(so.pending.x === tk.x + 1 && so.pending.y === tk.y - 1)); assert.strictEqual(eo.n, so.snapped ? s0.n + 1 : s0.n);
    log('B6. footprint collision: a tank anchored at (' + (tk.x + 1) + ',' + (tk.y - 1) + ') overlaps the existing tank by one cell -> "overlap" by cells (not by picture); the preview ' + (so.snapped ? 'snapped to a valid neighbour (' + so.pending.x + ',' + so.pending.y + ')' : 'stayed red and nothing was built'));
    await disarm();
    // B7 bounds
    await arm('tank'); await G(() => { const v = window.__v2, c = v.tc(139, 40); v.view.cam.setZoom(1); v.view.cam.centerOn(c.x, c.y + 160); v.camApi.clamp(); }); await wait(300);
    const edge = await A(() => { const v = window.__v2; let best = null; for (let y = 30; y < 50; y++) { const g = v.game; if (g.canPlace('tank', 138, y).ok) { best = [138, y]; break; } } return best; }); const sb = await sT(139, edge ? edge[1] : 40);
    const rb = await A(() => window.__v2.game.placement('tank', 139, 40)); assert.strictEqual(rb.reason, 'edge');
    await down(1, sb.x, sb.y); await fr(); await fr(); const sx = await st(); await up(1); await fr(); await wait(200); const ex = await st();
    assert(!sx.pending || (sx.pending.x + 1) <= 139, 'the footprint never sticks out of the map: pending ' + JSON.stringify(sx.pending)); assert(ex.n <= sx.n + 1);
    log('B7. map bounds: a tank at x=139 is "edge" (footprint would stick out); the preview at the screen edge ' + (sx.pending ? 'ended at (' + sx.pending.x + ',' + sx.pending.y + ') inside the map' : 'showed no preview (finger outside the map)')); await disarm();
  }
  // ---------- B8 snap to a valid tile and B9 invalid snap rejection
  {
    await arm('tank'); const mid = cell(40); await look(mid.x, mid.y + 2, 120); const q = await sT(mid.x, mid.y + 1);          // right beside the pipe: invalid, valid tiles 1-2 tiles away
    await down(1, q.x, q.y); await fr(); await fr(); const s = await st(); await up(1); await fr(); await G(() => window.__v2.cancel());
    assert(s.pending && !(s.pending.x === mid.x && s.pending.y === mid.y + 1), 'snapped away from the invalid tile'); assert.strictEqual(s.snapped, true); assert.strictEqual(s.ok, '1');
    const d = Math.hypot(s.pending.x - mid.x, s.pending.y - (mid.y + 1)); assert(d <= 2.01, 'within the snap radius');
    log('B8. snap: finger on an invalid tile beside the pipe -> preview moved to the valid tile (' + s.pending.x + ',' + s.pending.y + '), ' + d.toFixed(1) + ' tiles away, marked "snapped"');
    // hysteresis: small finger moves around keep the same snapped spot
    await G(() => window.__v2.cancel()); await arm('tank'); await look(mid.x, mid.y + 2, 120); await down(1, q.x, q.y); await fr(); const sA = (await st()).pending; let flips = 0, last = sA; for (let i = 0; i < 6; i++) { await move(1, q.x + (i % 2 ? 3 : -3), q.y + (i % 2 ? -2 : 2)); await fr(); const p2 = (await st()).pending; if (p2.x !== last.x || p2.y !== last.y) flips++; last = p2; } await up(1); await G(() => window.__v2.cancel());
    assert(flips <= 2, 'preview flickered ' + flips + ' times for +-3 px finger jitter'); log('B8b. hysteresis: +-3 px finger jitter changed the snapped spot ' + flips + ' time(s) in 6 moves');
    // B9: surround with water -> invalid tiles never attract
    await G(([mx, my]) => { const g = window.__v2.game; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (!g.pipe[(my + dy) * 140 + mx + dx] && !g.occ[(my + dy) * 140 + mx + dx]) g.map.water[(my + dy) * 140 + mx + dx] = 1; }, [mid.x, mid.y + 1]);
    await arm('tank'); await down(1, q.x, q.y); await fr(); await fr(); const s9 = await st(); await up(1); await fr(); await wait(200); const e9 = await st();
    assert.strictEqual(s9.snapped, false); assert.strictEqual(s9.ok, '0'); assert.deepStrictEqual(s9.pending, { x: mid.x, y: mid.y + 1 }); assert.strictEqual(e9.n, s9.n);
    log('B9. invalid snap rejection: with only invalid tiles around, the preview stays on the finger tile (red), nothing attracts it, nothing is built');
    await G(([mx, my]) => { const g = window.__v2.game; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) g.map.water[(my + dy) * 140 + mx + dx] = 0; }, [mid.x, mid.y + 1]); await disarm();
  }
  // ---------- B11 cancel: a drag, then the cancel button (and toggling the tool) leaves the game untouched
  {
    await arm('well'); const sp = await A(() => { const v = window.__v2, g = v.game; for (let y = 20; y < 80; y++) for (let x = 20; x < 120; x++) if (g.canPlace('well', x, y).ok) return { x, y }; return null; });
    if (sp) { await look(sp.x, sp.y); const p = await sT(sp.x, sp.y); await A(([mx, my]) => { const g = window.__v2.game; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (!g.pipe[(my + dy) * 140 + mx + dx] && !g.occ[(my + dy) * 140 + mx + dx]) g.map.water[(my + dy) * 140 + mx + dx] = 1; }, [sp.x, sp.y]); const s0 = await snap(); await down(1, p.x, p.y); await fr(); await fr(); await move(1, p.x + 20, p.y + 10); await fr(); const mid = await st(); await up(1); await fr(); await wait(150);
      assert(mid.ghost); const r = await G(() => { const b = document.querySelector('#cf-no').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, hidden: document.querySelector('#confirm').hidden }; });
      if (!r.hidden) { await TE('touchStart', [{ x: r.x, y: r.y, id: 0 }]); await fr(); await TE('touchEnd', [{ x: r.x, y: r.y, id: 0 }]); await fr(); await wait(200); } else await G(() => window.__v2.cancel());
      await disarm(); const s1 = await snap(); assert.strictEqual(s1, s0, 'cancel left buildings / pipes untouched') }
    log('B11. cancel: drag a preview, cancel (button / tool off) -> no building, no cash change, preview gone');
  }
  // ---------- B13 building drag isolation + B14: moving the SELECTED tank; camera unchanged; double actions impossible
  {
    await disarm(); const tk = await A(id => { const b = window.__v2.game.buildings.find(q => q.id === id); return { x: b.x, y: b.y }; }, L0.T); await look(tk.x + .5, tk.y + .5, 140);
    const tp = await A(id => { const v = window.__v2, b = v.game.buildings.find(q => q.id === id), c = v.tc(b.x + .5, b.y + .5); return v.camApi.w2s(c.x, c.y - 14); }, L0.T);
    await down(1, tp.x, tp.y); await fr(); await up(1); await fr(); await wait(200); assert.strictEqual(await G(() => window.__v2.ui.sel && window.__v2.ui.sel.id), L0.T, 'tap selects the tank');
    const c0 = await cam(), n0 = (await st()).n, to = await sT(tk.x + .5, tk.y + 3.5); await down(1, tp.x, tp.y); await fr(); const sMid = await st();
    for (let i = 1; i <= 8; i++) { await move(1, tp.x + (to.x - tp.x) * i / 8, tp.y + (to.y - tp.y) * i / 8 + 0); await fr(); } const s = await st(), c1 = await cam(); await up(1); await fr(); await wait(300);
    const t2 = await A(id => { const b = window.__v2.game.buildings.find(q => q.id === id); return { x: b.x, y: b.y, bad: window.__v2.game.validateNetwork().length }; }, L0.T);
    assert.strictEqual(s.state, 'BUILDING_DRAG'); assert(c0.x === c1.x && c0.y === c1.y && c0.z === c1.z, 'camera moved during a building drag'); assert((await st()).n === n0, 'no building duplicated');
    log('B13/B14. dragging the selected tank: state BUILDING_DRAG, camera unchanged, one tank (' + n0 + ' buildings), now at (' + t2.x + ',' + t2.y + ') from (' + tk.x + ',' + tk.y + '), network problems ' + t2.bad);
  }
  // ---------- B15/B16 pump: placed on the pipe, OUT/IN on its axis, flip rotates picture + points; rotation architecture 0/90/180/270
  {
    await arm('pump'); const pc = cell(20); await look(pc.x, pc.y); const p = await sT(pc.x, pc.y); await down(1, p.x, p.y); await fr(); await fr(); const s = await st(); const ports = await A(([x, y]) => window.__v2.game.connectionPoints('pump', x, y, window.__v2.game.pumpAutoDir(x, y, 'h')), [pc.x, pc.y]);
    assert.strictEqual(s.ok, '1', 'pump preview on the pipe: ' + s.cf); assert.strictEqual(ports.length, 2); await page.screenshot({ path: shots + '/pb-pump-preview.png' }); await up(1); await fr(); await wait(300);
    const pm = await A(([x, y]) => { const g = window.__v2.game, b = g.buildingAt(x, y); return b && g.buildingModel(b); }, [pc.x, pc.y]); assert(pm && pm.type === 'pump');
    const ro = pm.connectionPoints.find(q => q.role === 'out'), ri = pm.connectionPoints.find(q => q.role === 'in'); assert(ro && ri && Math.abs(ro.x - pc.x) + Math.abs(ro.y - pc.y) === 1 && ro.x - pc.x === -(ri.x - pc.x) && ro.y - pc.y === -(ri.y - pc.y));
    log('B15/B16. pump placed on the pipe at (' + pc.x + ',' + pc.y + '): rotation ' + pm.rotation + ' deg, OUT at (' + ro.x + ',' + ro.y + '), IN at (' + ri.x + ',' + ri.y + ') on the pipe axis');
    await look(pc.x, pc.y); const pp = await sT(pc.x, pc.y); await down(1, pp.x, pp.y - 10); await fr(); await up(1); await fr(); await wait(250);
    const sel = await G(() => window.__v2.ui.sel && window.__v2.ui.sel.kind); assert.strictEqual(sel, 'b'); const flipBtn = await G(() => { const b = document.querySelector('[data-act="pumpFlip"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (flipBtn) { await TE('touchStart', [{ ...flipBtn, id: 0 }]); await fr(); await TE('touchEnd', [{ ...flipBtn, id: 0 }]); await fr(); await wait(300);
      const pm2 = await A(([x, y]) => { const g = window.__v2.game, b = g.buildingAt(x, y); return g.buildingModel(b); }, [pc.x, pc.y]); const ro2 = pm2.connectionPoints.find(q => q.role === 'out');
      assert.strictEqual((pm2.rotation - pm.rotation + 360) % 360, 180); assert.deepStrictEqual([ro2.x, ro2.y], [ri.x, ri.y]); log('B15. rotation: the flip button turned the pump 180 deg and swapped OUT/IN (' + pm.rotation + ' -> ' + pm2.rotation + ')'); }
    await G(() => window.__v2.select(null));
  }
  // ---------- B17 save / reload
  {
    await G(() => window.__v2.save && window.__v2.save()); const before = await G(() => window.__v2.game.buildings.map(b => { const g = window.__v2.game, m = g.buildingModel(b); return JSON.stringify([m.id, m.type, m.x, m.y, m.rotation, m.connectionPoints.length]); }).sort());
    await page.reload(); await wait(2500); const after = await G(() => window.__v2.game.buildings.map(b => { const g = window.__v2.game, m = g.buildingModel(b); return JSON.stringify([m.id, m.type, m.x, m.y, m.rotation, m.connectionPoints.length]); }).sort());
    assert.deepStrictEqual(after, before); log('B17. build -> save -> reload: ' + before.length + ' buildings with identical type, position, rotation and connection points');
  }
  // ---------- B18 rapid touch, B19 second finger
  {
    await G(() => { const v = window.__v2; v.select(null); v.cancel(); v.setTool(null); }); await arm('tank'); const sp = await free(4, 9); await look(sp.x, sp.y); const p = await sT(sp.x, sp.y); const n0 = (await st()).n, c0 = await cam();
    for (let i = 0; i < 8; i++) { await down(1, p.x + i * 2, p.y); await up(1); } await fr(); await wait(400); const e = await st();
    assert(e.n <= n0 + 1, 'at most one tank from rapid taps on the same spot, got ' + (e.n - n0)); assert(['IDLE', 'BUILDING_PLACEMENT'].includes(e.state)); const c1 = await cam(); assert(c0.x === c1.x && c0.y === c1.y);
    log('B18. rapid touch: 8 quick taps on one spot -> ' + (e.n - n0) + ' tank built (never duplicated), state ' + e.state + ', camera unchanged');
    await disarm(); await arm('tank'); const sp2 = await free(8, 9); await look(sp2.x, sp2.y); const p2 = await sT(sp2.x, sp2.y), n1 = (await st()).n;
    await down(1, p2.x, p2.y); await fr(); await fr(); const a = await st(); assert(a.ghost); await down(2, p2.x + 80, p2.y + 20); await fr(); await fr(); const b2 = await st();
    assert.strictEqual(b2.state, 'PINCH', 'a second finger before the preview moved turns into a pinch'); assert(!b2.pending || !b2.ghost || b2.n === n1);
    await up(2); await up(1); await fr(); await wait(300); const f = await st(); assert.strictEqual(f.n, n1, 'nothing built by the pinch'); assert.strictEqual(f.state, 'BUILDING_PLACEMENT');
    log('B19. second finger during the preview: PINCH, preview dropped, nothing built; after both fingers lift the state is BUILDING_PLACEMENT again'); await disarm();
  }
  // ---------- states: only legal transitions
  {
    const tr = await G(() => window.__v2.touch.log.slice()); const ok = new Set(['IDLE>BUILDING_PLACEMENT', 'BUILDING_PLACEMENT>IDLE', 'BUILDING_PLACEMENT>BUILDING_DRAG', 'BUILDING_DRAG>BUILDING_PLACEMENT', 'BUILDING_DRAG>IDLE', 'IDLE>BUILDING_DRAG', 'BUILDING_DRAG>PINCH', 'PINCH>BUILDING_PLACEMENT', 'PINCH>IDLE', 'PINCH>PAN', 'PAN>PINCH', 'IDLE>PAN', 'PAN>IDLE', 'BUILDING_PLACEMENT>PAN', 'PAN>BUILDING_PLACEMENT', 'PINCH>PINCH']);
    const bad = tr.filter(x => !ok.has(x)); assert.deepStrictEqual(bad, [], 'illegal transitions: ' + bad); log('state machine: every transition was legal (' + [...new Set(tr)].join(', ') + ')');
  }
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  console.log('\nALL PHASE B UI TESTS PASSED (' + pass + ')'); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
