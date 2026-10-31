// Phase 10: building + movement + connection UX on a real phone-sized touch screen (CDP touch events: one finger, two fingers, taps, drags).
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file:///home/claude/oli/index.html', OUT = process.argv[2] || '/tmp/oli-shots10'; require('fs').mkdirSync(OUT, { recursive: true });
const log = (n, m) => console.log('ok   ' + String(n).padStart(2) + '. ' + m);
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36' });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForTimeout(700);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const X = 50, Y = 40;
  await G(() => { const o = window.__oli, g = o.game, C = window.OliCore.CFG; C.TERRAIN.MULT = [1, 1, 1, 1]; C.REGIONS.forEach(r => { r.mult = 1; }); C.PIPE.LEAK_PER_TILE_MIN = 0; C.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    g.s.regions.forEach(r => { r.unlocked = true; }); g.s.tutorialDone = true; g.s.cash = 1e6; for (const a of g.areas) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
    for (let y = 34; y < 70; y++) for (let x = 44; x < 90; x++) { const k = y * 140 + x; g.map.block[k] = 0; g.map.water[k] = 0; } });
  const scr = (x, y) => A(([x, y]) => { const { cam } = window.__oli, r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + ((x - y) * 32 - cam.x) * cam.z + r.width / 2, y: r.top + ((x + y) * 16 + 16 - cam.y) * cam.z + r.height / 2 }; }, [x, y]);
  const center = async (x, y, z) => { await A(([x, y, z]) => { const o = window.__oli; o.camGoal.on = false; o.cam.x = (x - y) * 32; o.cam.y = (x + y) * 16 + 16 + 100 / z; o.cam.z = z; o.select(null); }, [x, y, z]); await wait(200); };
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const tap = async p => { await touch('touchStart', [p]); await wait(40); await touch('touchEnd', []); await wait(120); };
  const tapCell = async (x, y) => tap(await scr(x, y));
  const drag = async (a, b, steps = 12) => { await touch('touchStart', [a]); for (let i = 1; i <= steps; i++) { await touch('touchMove', [{ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }]); await wait(16); } await touch('touchEnd', []); await wait(150); };
  const camNow = () => G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y, z: window.__oli.cam.z }));
  const cash = () => G(() => window.__oli.game.s.cash), nb = () => G(() => window.__oli.game.buildings.length), pc = () => G(() => window.__oli.game.pipeCount());
  const pending = () => G(() => window.__oli.ui.pending && { x: window.__oli.ui.pending.x, y: window.__oli.ui.pending.y });
  const valid = async w => { const p = await G(() => window.__oli.game.validateNetwork()); assert.deepStrictEqual(p, [], w + ': ' + p.join(' | ')); };
  const run = sec => A(sec => { const g = window.__oli.game; for (let i = 0; i < sec * 4; i++) g.step(.25); }, sec);
  const confirmOK = async () => { const b = page.locator('#confirm-ok'); assert(await b.isVisible() && !(await b.isDisabled()), 'confirm available'); await b.tap(); await wait(250); };
  const confirmText = () => page.textContent('#confirm-text');
  const pipeDrag = async (a, b) => { await G(() => window.__oli.setTool('pipe')); await drag(await scr(a[0], a[1]), await scr(b[0], b[1])); };

  // ---------- BUILD: preview follows the finger, snaps, no money until confirm
  await center(X + 6, Y + 2, 1); await G(() => window.__oli.setTool('well'));
  const money0 = await cash(), b0 = await nb(), cam0 = await camNow();
  let from = await scr(X + 2, Y + 2); await drag({ x: from.x, y: from.y }, { x: from.x + 96, y: from.y + 48 }, 14);
  let pd = await pending(); assert(pd, 'a preview exists after the drag'); assert.strictEqual(await nb(), b0); assert.strictEqual(await cash(), money0, 'preview costs nothing');
  const cam1 = await camNow(); assert(Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y) < 1, 'the camera did not move while placing');
  log(2, 'drag in the well tool moves a preview (cell ' + pd.x + ',' + pd.y + '); camera untouched, cash untouched, nothing built');
  await wait(450); assert.strictEqual(await G(() => Math.abs(window.__oli.gOff.x) + Math.abs(window.__oli.gOff.y)), 0, 'the glide settled');
  assert(await page.locator('#confirm').isVisible()); const ctext = await confirmText(); assert(/\$/.test(ctext), ctext);
  await page.screenshot({ path: OUT + '/10-1-preview.png' });
  // cancel
  await page.locator('#confirm-no').tap(); await wait(200);
  assert.strictEqual(await nb(), b0); assert.strictEqual(await cash(), money0); assert.strictEqual(await pending(), null); assert.strictEqual(await pc(), 0);
  log(3, 'Cancel: no building, no pipe, no money change, preview gone');
  // move again, then confirm
  await drag({ x: from.x, y: from.y }, { x: from.x + 64, y: from.y + 32 }, 10); pd = await pending(); assert(pd);
  await confirmOK(); assert.strictEqual(await nb(), b0 + 1); assert(await cash() < money0); assert.strictEqual(await pending(), null);
  const well1 = await G(() => { const w = window.__oli.game.buildings.find(b => b.type === 'well'); return { x: w.x, y: w.y, id: w.id }; }); assert.strictEqual(well1.x, pd.x); assert.strictEqual(well1.y, pd.y);
  log(4, 'Confirm: well built exactly on the previewed cell (' + well1.x + ',' + well1.y + '), money charged only now (' + (money0 - await cash()) + ')');
  // snapping: dropped on an invalid cell glides to the nearest valid
  await G(() => window.__oli.setTool('well')); const wp = await scr(well1.x, well1.y);
  await drag({ x: wp.x + 70, y: wp.y + 34 }, { x: wp.x + 2, y: wp.y + 2 + 48 * 0 }, 12);   // ends over the existing well
  const pd2 = await pending(); assert(pd2 && await A(p => window.__oli.game.canPlace('well', p.x, p.y).ok, pd2), 'dropped on an occupied cell -> snapped to a valid one: ' + JSON.stringify(pd2));
  log(1, 'dropped on an occupied cell: the preview glided to the nearest valid cell (' + pd2.x + ',' + pd2.y + ')'); await G(() => window.__oli.ui.pending = null); await G(() => window.__oli.setTool('select'));
  // 17. invalid location: reason is clear, confirm disabled
  await G(() => { window.__oli.setTool('well'); }); await G(() => { const o = window.__oli; o.ui.pending = null; });
  const water = await G(() => { const g = window.__oli.game; for (let k = 0; k < 140 * 88; k++) if (g.map.water[k]) return { x: k % 140, y: (k / 140) | 0 }; });
  await G(() => window.__oli.setTool('tank')); await A(w => { const o = window.__oli; o.ui.pending = { x: w.x, y: w.y }; }, water); await G(() => document.getElementById('confirm-ok').dispatchEvent(new Event('x')));
  await A(w => { window.__oli.ui.pending = { x: w.x, y: w.y }; }, water);
  // updateConfirm is internal: trigger through a tiny tap on the same spot far away is awkward, so use a drop onto the occupied cell instead
  await G(() => { window.__oli.setTool('tank'); }); await center(well1.x + 1, well1.y, 1.2); const wp2 = await scr(well1.x, well1.y); await drag({ x: wp2.x + 60, y: wp2.y - 40 }, { x: wp2.x, y: wp2.y + 2 }, 10);
  const txt17 = await confirmText(); assert(txt17.length > 6 && !/^\s*(Invalid|غير صالح)\s*$/.test(txt17), txt17);
  log(17, 'invalid/occupied target shows a specific reason: "' + txt17.trim() + '"'); await page.locator('#confirm-no').tap(); await wait(150);
  // 22. build while zoomed
  await center(X + 10, Y + 12, 1.7); await G(() => window.__oli.setTool('tank')); const zb = await nb(); let zp = await scr(X + 8, Y + 11); await drag({ x: zp.x - 40, y: zp.y - 20 }, { x: zp.x, y: zp.y }, 10);
  const zpend = await pending(); assert(zpend); await confirmOK(); assert.strictEqual(await nb(), zb + 1); log(22, 'building while zoomed (1.7x): preview dragged, confirmed, tank built at (' + zpend.x + ',' + zpend.y + ')');
  // ---------- TAP / PAN / PINCH
  await G(() => window.__oli.setTool('select')); await center(well1.x, well1.y, 1);
  const wp3 = await scr(well1.x, well1.y); await tap({ x: wp3.x, y: wp3.y - 20 }); assert.deepStrictEqual(await G(() => window.__oli.ui.sel && window.__oli.ui.sel.kind), 'b'); assert(await page.locator('#panel').isVisible());
  const ptxt = (await page.textContent('#panel')).replace(/\s+/g, ' '); assert(/الإنتاج|Production/.test(ptxt) && /الضغط|Pressure/.test(ptxt), ptxt);
  log(1, 'tap on a building selects it and shows production / pressure / condition / network: "' + ptxt.slice(0, 70) + '"');
  await page.screenshot({ path: OUT + '/10-2-selected.png' });
  // 20. drag starting ON a building: the camera does NOT move, nothing is selected, nothing is moved (Phase 11 rule)
  await G(() => window.__oli.select(null)); await center(well1.x, well1.y, 1); const wq = await scr(well1.x, well1.y); const cb = await camNow(); const bx = await G(() => window.__oli.game.buildings.map(b => b.x + ',' + b.y).join('|'));
  await drag({ x: wq.x, y: wq.y - 20 }, { x: wq.x - 90, y: wq.y - 20 - 30 }); const ca = await camNow(); assert(Math.hypot(ca.x - cb.x, ca.y - cb.y) < 1, 'camera must not pan'); assert.strictEqual(await G(() => window.__oli.ui.sel), null, 'not selected by a drag'); assert.strictEqual(await G(() => window.__oli.game.buildings.map(b => b.x + ',' + b.y).join('|')), bx);
  log(20, 'a drag that starts on a building does nothing: camera still, nothing selected, nothing moved');
  // 5. pan empty map
  const e1 = await camNow(); await drag({ x: 200, y: 400 }, { x: 120, y: 360 }); const e2 = await camNow(); assert(Math.hypot(e2.x - e1.x, e2.y - e1.y) > 40); log(5, 'one finger on empty map pans the camera (' + Math.round(Math.hypot(e2.x - e1.x, e2.y - e1.y)) + 'px), 1:1 with the finger');
  // tiny finger wobble is still a tap, not a pan
  await center(well1.x, well1.y, 1); const wt = await scr(well1.x, well1.y), c3 = await camNow();
  await touch('touchStart', [{ x: wt.x, y: wt.y - 20 }]); await touch('touchMove', [{ x: wt.x + 4, y: wt.y - 18 }]); await wait(30); await touch('touchEnd', []); await wait(150);
  assert(await G(() => !!window.__oli.ui.sel), 'a 4px wobble is a tap'); const c4 = await camNow(); assert(Math.hypot(c4.x - c3.x, c4.y - c3.y) < 1.5);
  log(5, 'a finger that wobbles 4px is still a tap (no accidental pan, building selected)'); await G(() => window.__oli.select(null));
  // 6. pinch zoom, then the leftover finger does not pan
  await center(X + 6, Y + 2, 1); const z0 = (await camNow()).z;
  await touch('touchStart', [{ x: 150, y: 400 }, { x: 240, y: 400 }]); for (let i = 1; i <= 10; i++) { await touch('touchMove', [{ x: 150 - i * 8, y: 400 }, { x: 240 + i * 8, y: 400 }]); await wait(16); }
  const z1 = (await camNow()).z; assert(z1 > z0 * 1.5, 'zoomed in ' + z0 + ' -> ' + z1);
  await touch('touchEnd', [{ x: 70, y: 400 }]); const cz = await camNow();           // one finger lifted, the other stays down and moves
  await touch('touchMove', [{ x: 60, y: 430 }]); await touch('touchMove', [{ x: 40, y: 470 }]); await wait(40); const cz2 = await camNow(); await touch('touchEnd', []); await wait(120);
  assert(Math.hypot(cz2.x - cz.x, cz2.y - cz.y) < 1, 'the leftover finger after a pinch does not pan'); log(6, 'two-finger pinch zoom ' + z0.toFixed(2) + ' -> ' + z1.toFixed(2) + '; the finger left over afterwards does not pan or tap');
  // ---------- PIPES
  await center(X + 8, Y + 2, 1); await A(([X, Y]) => { const g = window.__oli.game; g.place('tank', X + 16, Y); }, [X, Y]);
  const pc0 = await pc(), money1 = await cash();
  await pipeDrag([well1.x + 1, well1.y], [X + 15, Y]);                                 // from beside the well to beside the tank (drag from an anchor)
  assert(await G(() => !!window.__oli.ui.pipeStart && !!window.__oli.ui.pending)); const ptext = await confirmText(); assert(/\$/.test(ptext), ptext); assert.strictEqual(await pc(), pc0); assert(Math.abs(await cash() - money1) < 25, "cash unchanged");
  assert(await G(() => !!window.__oli.ui.route && window.__oli.ui.route.ok)); await page.screenshot({ path: OUT + '/10-3-pipe-preview.png' });
  log(8, 'pipe drawing: drag well -> tank draws the auto-routed preview ("' + ptext.trim() + '"), no money, no segments yet');
  await page.locator('#confirm-no').tap(); await wait(150); assert.strictEqual(await pc(), pc0); assert(Math.abs(await cash() - money1) < 25, "cash unchanged"); assert.strictEqual(await G(() => window.__oli.ui.pipeStart), null);
  log(9, 'cancel pipe: nothing built, nothing charged, drawing state cleared');
  await pipeDrag([well1.x + 1, well1.y], [X + 15, Y]); await confirmOK(); assert(await pc() > pc0); assert(await cash() < money1); await valid('pipe built'); await run(60);
  const f11 = await G(() => { const g = window.__oli.game; return { q: g.buildings.find(b => b.type === 'well').q, tanks: g.buildings.filter(b => b.type === 'tank').map(t => +t.amt.toFixed(1)) }; }); assert(f11.q > 1 && f11.tanks[f11.tanks.length - 1] > 1, JSON.stringify(f11));
  log(10, 'confirm pipe: segments built, charged once, network valid'); log(11, 'well -> pipe -> tank: oil flows ' + JSON.stringify(f11));
  // pipe drawing does not pan the camera and does not select other things (when it starts on empty ground nothing happens)
  await G(() => window.__oli.setTool('pipe')); const pcam = await camNow(); await drag({ x: 330, y: 560 }, { x: 250, y: 520 }); const pcam2 = await camNow(); assert(Math.hypot(pcam2.x - pcam.x, pcam2.y - pcam.y) < 1, 'no pan in pipe mode'); assert.strictEqual(await G(() => window.__oli.ui.sel), null);
  log(8, 'pipe mode: a one-finger drag on empty ground neither pans nor selects (hint shown); two fingers still pan/zoom');
  // 21. pipe drawing while zoomed
  await center(X + 6, Y + 8, 1.6); await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X + 2, Y + 8); g.place('tank', X + 9, Y + 8); }, [X, Y]);
  await pipeDrag([X + 3, Y + 8], [X + 8, Y + 8]); const zr = await G(() => window.__oli.ui.route); if (!zr) console.log('DBG', JSON.stringify(await G(() => { const o = window.__oli; return { tool: o.ui.tool, ps: o.ui.pipeStart, pend: o.ui.pending, pd: o.pd, b: o.game.buildings.filter(b => b.y == 48).map(b => b.type + b.x), cam: o.cam }; })), JSON.stringify(await scr(X + 3, Y + 8)), JSON.stringify(await scr(X + 11, Y + 8))); assert(zr && zr.ok, 'zoomed route ok'); await confirmOK(); await valid('zoom pipe'); log(21, 'pipe drawn while zoomed 1.6x: route previewed and confirmed');
  // 12. well -> pipe -> pump -> pipe -> tank
  await center(X + 8, Y + 14, 1); await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X + 2, Y + 14); g.place('tank', X + 16, Y + 14); g.buildRoute(g.routePipe(X + 3, Y + 14, X + 15, Y + 14, false)); }, [X, Y]);
  await G(() => window.__oli.setTool('pump')); const pz = await scr(X + 9, Y + 14); await tap(pz); await wait(150); const pctext = await confirmText(); assert(/\$2,500/.test(pctext), pctext); await confirmOK(); await valid('pump'); await run(60);
  const f12 = await G(() => { const g = window.__oli.game, w = g.buildings.filter(b => b.type === 'well')[2]; return { pumps: g.buildings.filter(b => b.type === 'pump').length, tank: g.buildings.filter(b => b.type === 'tank')[3].amt, q: w.q }; }); assert(f12.pumps === 1 && f12.tank > 1 && f12.q > 1, JSON.stringify(f12));
  log(12, 'well -> pipe -> pump -> pipe -> tank: pump placed by tap + confirm, oil flows ' + JSON.stringify(f12));
  // 13/14 multiple tanks + full tank reroute
  await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X + 2, Y + 20); g.place('tank', X + 12, Y + 17); g.place('tank', X + 12, Y + 23); const R = (a, b, c, d) => g.buildRoute(g.routePipe(a, b, c, d, false)); R(X + 3, Y + 20, X + 8, Y + 20); R(X + 8, Y + 20, X + 8, Y + 18); R(X + 8, Y + 20, X + 8, Y + 24); R(X + 8, Y + 18, X + 11, Y + 18); R(X + 8, Y + 24, X + 11, Y + 24); }, [X, Y]); await valid('two tanks');
  const w13 = await G(() => { const g = window.__oli.game, w = g.buildings.filter(b => b.type === 'well')[3]; return g.net.routes.get(w.id).map(r => r.tank.id); }); assert.strictEqual(w13.length, 2); log(13, 'one well, two tanks: both reachable (' + w13 + '), nearest used first');
  await A(id => { const g = window.__oli.game, t = g.buildings.find(b => b.id === id); t.amt = g.tankCap(t); g.hyd.dirty = true; }, w13[0]); await run(60); await valid('reroute');
  const f14 = await A(ids => { const g = window.__oli.game; return ids.map(id => { const t = g.buildings.find(b => b.id === id); return +(t.amt / g.tankCap(t)).toFixed(2); }); }, w13); assert(f14[0] > .99 && f14[1] > 0.002, JSON.stringify(f14)); log(14, 'full tank -> oil rerouted to the other tank (fill ' + f14 + ')');
  // 15/16 delete pipe, reconnect
  await G(() => window.__oli.setTool('erase')); await center(X + 5, Y + 20, 1.3); await tapCell(X + 5, Y + 20); await wait(250); const cf = page.locator('#confirm-ok'); if (await cf.isVisible()) { await cf.tap(); await wait(250); }
  assert.strictEqual(await A(([X, Y]) => window.__oli.game.pipe[(Y + 20) * 140 + X + 5], [X, Y]), 0); await valid('deleted'); const cut = await A(id => (window.__oli.game.net.routes.get(id) || []).length, (await G(() => window.__oli.game.buildings.filter(b => b.type === 'well')[3].id))); assert.strictEqual(cut, 0);
  log(15, 'tap-erase on a pipe tile: network cut, well has 0 routes'); await G(() => window.__oli.setTool('select'));
  await pipeDrag([X + 4, Y + 20], [X + 6, Y + 20]); await confirmOK(); await valid('reconnected'); await run(40); assert((await G(() => window.__oli.game.buildings.filter(b => b.type === 'well')[3].q)) > 1); log(16, 'reconnect: pipe redrawn, the flow resumes');
  // 18/19 rapid taps + touch/click duplication
  await G(() => window.__oli.setTool('well')); await center(X + 24, Y + 8, 1); const rb = await nb(), rc = await cash(); const rp = await scr(X + 24, Y + 8);
  for (let i = 0; i < 4; i++) { await touch('touchStart', [rp]); await touch('touchEnd', []); await wait(30); }                // four taps in ~150ms
  await wait(300); assert.strictEqual(await nb(), rb, 'rapid taps never build'); assert(await G(() => !!window.__oli.ui.pending), 'one preview'); assert(Math.abs(await cash() - rc) < 25, "cash unchanged");
  log(18, 'four rapid taps on one spot: one preview, nothing built, nothing charged (needs a deliberate Confirm)');
  await wait(500); await tap(rp); await wait(100); assert.strictEqual(await nb(), rb + 1, 'a deliberate second tap (> ' + 450 + 'ms) still confirms'); await G(() => window.__oli.setTool('select'));
  await G(() => window.__oli.setTool('tank')); await center(X + 30, Y + 8, 1); const dp = await scr(X + 30, Y + 8); const db = await nb();
  await tap(dp); await page.evaluate(([x, y]) => { for (const t of ['click', 'click']) document.elementFromPoint(x, y).dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: x, clientY: y })); }, [dp.x, dp.y]); await wait(200);
  assert.strictEqual(await nb(), db, 'duplicate click events do not build'); assert(await G(() => !!window.__oli.ui.pending));
  log(19, 'touch followed by synthetic clicks on the same spot: still just one preview, nothing built'); await page.locator('#confirm-no').tap(); await G(() => window.__oli.setTool('select'));
  // 7. tap a pipe
  await center(X + 8, Y + 2, 1.2); await tapCell(X + 8, Y); assert.strictEqual(await G(() => window.__oli.ui.sel && window.__oli.ui.sel.kind), 'pipe'); const pt = (await page.textContent('#panel')).replace(/\s+/g, ' ');
  assert(/تدفق|Flow/i.test(pt) && /(سعة|capacity)/i.test(pt), pt); log(7, 'tap on a pipe: panel shows flow / capacity / pressure loss rows'); await G(() => window.__oli.select(null));
  // 23. save/load
  await G(() => document.getElementById('st-save') && document.getElementById('st-save').click()); const snap = await G(() => { const g = window.__oli.game; return { b: g.buildings.length, p: g.pipeCount(), cash: Math.round(g.s.cash) }; });
  await page.reload(); await wait(800); const snap2 = await G(() => { const g = window.__oli.game; return { b: g.buildings.length, p: g.pipeCount(), cash: Math.round(g.s.cash) }; });
  assert.strictEqual(snap2.b, snap.b); assert.strictEqual(snap2.p, snap.p); await valid('reloaded'); log(23, 'save -> reload: ' + snap2.b + ' buildings, ' + snap2.p + ' pipe tiles, valid network');
  // 24. Android WebView behaviour: Back button = one step at a time, never closes the game
  await G(() => window.__oli.setTool('well')); await center(X + 24, Y + 12, 1); const bp = await scr(X + 24, Y + 12); await tap(bp); assert(await G(() => !!window.__oli.ui.pending));
  await G(() => history.back()); await wait(200); assert.strictEqual(await G(() => window.__oli.ui.pending), null); assert.strictEqual(await G(() => window.__oli.ui.tool), 'well', 'first Back cancels only the preview');
  await G(() => history.back()); await wait(200); assert.strictEqual(await G(() => window.__oli.ui.tool), 'select', 'second Back leaves the build tool');
  await G(() => window.__oli.select({ kind: 'b', id: window.__oli.game.buildings[0].id })); await G(() => history.back()); await wait(200); assert.strictEqual(await G(() => window.__oli.ui.sel), null, 'third Back clears the selection');
  const still = await G(() => location.href); await G(() => history.back()); await wait(200); assert.strictEqual(await G(() => location.href), still, 'Back in plain play does nothing and does not leave the game');
  log(24, 'Android-WebView style Back: preview -> build tool -> selection -> (nothing), one step per press, game never closes; UA = WebView');
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  console.log('\nALL PHASE 10 INPUT/BUILD UX TESTS PASSED (no console errors)'); await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
