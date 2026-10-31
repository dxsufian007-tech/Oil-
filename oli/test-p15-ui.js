// Phase 15 (5/20) on a phone-sized touch screen: pipe building with REAL touch events (CDP): start, drag-to-route, auto-route preview, cost, confirm / cancel,
// duplicate taps, pinch and drag while drawing. The visible state must equal the game state. (Also exercises the Phase 6 junction preview / branch removal that sits on top.)
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[2] || 'file:///home/claude/oli/index.html', OUT = '/tmp/oli-shots15'; require('fs').mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36';
let n = 0; const log = m => console.log('ok   ' + String(++n).padStart(2) + '. ' + m);
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: UA }), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForTimeout(700);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const X = 50, Y = 40;
  await G(() => { const o = window.__oli, g = o.game, C = window.OliCore.CFG; C.TERRAIN.MULT = [1, 1, 1, 1]; C.REGIONS.forEach(r => { r.mult = 1; }); C.PIPE.LEAK_PER_TILE_MIN = 0; C.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    g.s.regions.forEach(r => { r.unlocked = true; }); g.s.tutorialDone = true; g.s.cash = 1e7; for (const a of g.areas) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
    for (let y = 30; y < 70; y++) for (let x = 44; x < 90; x++) { const k = y * 140 + x; g.map.block[k] = 0; g.map.water[k] = 0; } });
  const scr = (x, y) => A(([x, y]) => { const { cam } = window.__oli, r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + ((x - y) * 32 - cam.x) * cam.z + r.width / 2, y: r.top + ((x + y) * 16 + 16 - cam.y) * cam.z + r.height / 2 }; }, [x, y]);
  const center = async (x, y, z) => { await A(([x, y, z]) => { const o = window.__oli; o.camGoal.on = false; o.cam.x = (x - y) * 32; o.cam.y = (x + y) * 16 + 16 + 100 / z; o.cam.z = z; o.select(null); }, [x, y, z]); await wait(200); };
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const tapP = async p => { await T('touchStart', [p]); await wait(40); await T('touchEnd', []); await wait(180); };
  const tap = async (x, y) => tapP(await scr(x, y));
  const drag = async (a, b, steps = 14, end = true) => { await T('touchStart', [a]); for (let i = 1; i <= steps; i++) { await T('touchMove', [{ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }]); await wait(16); } if (end) { await T('touchEnd', []); await wait(200); } };
  const pinch = async (c, d0, d1, steps = 10) => { await T('touchStart', [{ x: c.x - d0 / 2, y: c.y }, { x: c.x + d0 / 2, y: c.y }]); for (let i = 1; i <= steps; i++) { const d = d0 + (d1 - d0) * i / steps; await T('touchMove', [{ x: c.x - d / 2, y: c.y }, { x: c.x + d / 2, y: c.y }]); await wait(16); } await T('touchEnd', []); await wait(200); };
  const confirmTap = async () => { const b = await page.locator('#confirm-ok').boundingBox(); await tapP({ x: b.x + b.width / 2, y: b.y + b.height / 2 }); await wait(250); };
  const st = () => G(() => { const g = window.__oli.game; return { cash: g.s.cash, pipes: g.pipeCount(), ver: g.netVersion, pend: !!window.__oli.ui.pending, start: window.__oli.ui.pipeStart ? [window.__oli.ui.pipeStart.x, window.__oli.ui.pipeStart.y] : null, route: window.__oli.ui.route ? { ok: window.__oli.ui.route.ok, reason: window.__oli.ui.route.reason, cost: window.__oli.ui.route.cost, fresh: window.__oli.ui.route.fresh.length, auto: !!window.__oli.ui.route.auto, n: window.__oli.ui.route.cells.length } : null }; });
  const pill = () => G(() => window.__oli.pill());
  const valid = async w => { const p = await G(() => window.__oli.game.validateNetwork()); assert.deepStrictEqual(p, [], w + ': ' + p.slice(0, 3).join(' | ')); };
  const run = sec => A(sec => { const g = window.__oli.game; for (let i = 0; i < sec * 4; i++) g.step(.25); }, sec);
  const setPipe = () => G(() => window.__oli.setTool('pipe'));

  // ---- S1: start, route, preview (cost / tiles / corners), confirm by touch ----
  await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X, Y, 'large'); g.place('tank', X + 9, Y + 5); }, [X, Y]);
  await center(X + 5, Y + 3, .9); await setPipe(); await tap(X + 1, Y); let s = await st(); assert(s.start && s.start[1] === Y && (s.start[0] === X || s.start[0] === X + 1), 'the start is marked (snapped to the well or its pipe tile): ' + JSON.stringify(s)); assert.strictEqual(s.pipes, 0);
  await tap(X + 9, Y + 5); await wait(150); s = await st(); assert(s.pend && s.route && s.route.ok, 'preview: ' + JSON.stringify(s)); assert.strictEqual(s.pipes, 0, 'previewing builds nothing'); assert.strictEqual(s.ver, (await st()).ver);
  let pl = await pill(); assert(pl && /\d/.test(pl.text) && /قطعة|segments/.test(pl.text), 'pill shows cost and length: ' + JSON.stringify(pl)); assert(/زاوية|corner/.test(pl.text), 'pill shows the corners: ' + pl.text);
  const cash0 = (await st()).cash; await page.screenshot({ path: OUT + '/s1-preview.png' }); await confirmTap(); s = await st(); assert.strictEqual(s.pipes, s.route ? s.route.fresh : s.pipes); assert.strictEqual(cash0 - s.cash > 0, true);
  const built = s.pipes, spent = cash0 - s.cash; assert(Math.abs(spent - built * 100) < 5, 'exact price (+- passive income): ' + [spent, built]); await valid('S1'); await run(40); const q = await G(() => window.__oli.game.buildings.find(b => b.type === 'tank').amt); assert(q > 2, 'oil arrives ' + q);
  log('S1: tap start, tap destination -> preview "' + pl.text + '"; confirm by touch built ' + built + ' tiles for ' + Math.round(spent) + '; oil in the tank ' + q.toFixed(1));

  // ---- S2: a building in the way -> automatic detour, shown in the preview ----
  await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X, Y + 12, 'large'); g.place('tank', X + 5, Y + 12); g.place('tank', X + 12, Y + 12); }, [X, Y]);
  await center(X + 7, Y + 12, .9); await setPipe(); await tap(X + 1, Y + 12); await tap(X + 12, Y + 12); await wait(150); s = await st();
  assert(s.route && s.route.ok && s.route.auto, 'detour route: ' + JSON.stringify(s.route)); pl = await pill(); assert(/بديل|detour/.test(pl.text2 || ''), 'the preview says it goes around: ' + JSON.stringify(pl));
  const info = await G(() => window.__oli.game.routeInfo(window.__oli.ui.route)); assert(info.corners >= 2); await page.screenshot({ path: OUT + '/s2-detour.png' });
  const p0 = (await st()).pipes; await confirmTap(); s = await st(); assert.strictEqual(s.pipes - p0, info.fresh); await valid('S2'); await run(40);
  const t12 = await A(([X, Y]) => { const g = window.__oli.game; return g.buildings.find(b => b.type === 'tank' && b.x === X + 12 && b.y === Y + 12).amt; }, [X, Y]); assert(t12 > 2, 'oil reaches the far tank through the detour ' + t12);
  log('S2: a tank in the way: the preview is an automatic detour (' + info.fresh + ' tiles, ' + info.corners + ' corners, pill: "' + pl.text2 + '"), built, oil ' + t12.toFixed(1));

  // ---- S3: no valid route -> specific reason, confirm disabled, nothing built ----
  await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X, Y + 22, 'large'); g.place('tank', X + 10, Y + 22); for (let y = Y + 21; y <= Y + 24; y++) for (let x = X + 9; x <= X + 12; x++) if (!g.occ[y * 140 + x]) { g.map.block[y * 140 + x] = 1; g.map.water[y * 140 + x] = 1; } }, [X, Y]);
  await center(X + 5, Y + 22, .9); await setPipe(); await tap(X + 1, Y + 22); await tap(X + 10, Y + 22); await wait(150); s = await st(); pl = await pill();
  assert(s.route && !s.route.ok && s.route.reason === 'noRoute', JSON.stringify(s.route)); assert(/لا يوجد مسار|No valid route/.test(pl.text), 'the pill says why: ' + pl.text); assert(await page.locator('#confirm-ok').isDisabled(), 'confirm is disabled');
  const p3 = (await st()).pipes; await page.screenshot({ path: OUT + '/s3-noroute.png' }); await G(() => window.__oli.setTool('select')); assert.strictEqual((await st()).pipes, p3); assert.strictEqual((await st()).pend, false);
  log('S3: destination walled in -> "' + pl.text + '", confirm disabled, nothing built; leaving the tool clears the preview');

  // ---- S4: touch + click duplication, rapid confirm ----
  await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X + 20, Y, 'large'); g.place('tank', X + 28, Y + 3); }, [X, Y]);
  await center(X + 24, Y + 2, .9); await setPipe(); await tap(X + 21, Y); await tap(X + 28, Y + 3); await wait(150); s = await st(); assert(s.route.ok); const c4 = s.cash, p4 = s.pipes, cost4 = s.route.cost, f4 = s.route.fresh;
  const b4 = await page.locator('#confirm-ok').boundingBox(), pt = { x: b4.x + b4.width / 2, y: b4.y + b4.height / 2 };
  await T('touchStart', [pt]); await wait(30); await T('touchEnd', []); await G(() => document.getElementById('confirm-ok').click()); await G(() => document.getElementById('confirm-ok').click()); await T('touchStart', [pt]); await wait(30); await T('touchEnd', []); await wait(400);
  s = await st(); assert.strictEqual(s.pipes - p4, f4, 'one build only'); assert(Math.abs(c4 - s.cash - cost4) < 5, 'money taken once: ' + (c4 - s.cash) + ' vs ' + cost4); await valid('S4');
  log('S4: touch + 2 synthetic clicks + a second touch on Confirm -> ONE pipe of ' + f4 + ' tiles, ' + cost4 + ' taken once');

  // ---- S5: cancel and restart at once ----
  await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X + 20, Y + 10, 'large'); g.place('tank', X + 28, Y + 12); }, [X, Y]);
  await center(X + 24, Y + 11, .9); await setPipe(); await tap(X + 21, Y + 10); await tap(X + 28, Y + 12); await wait(150); s = await st(); assert(s.pend && s.route.ok); const c5 = s.cash, p5 = s.pipes;
  const nb = await page.locator('#confirm-no').boundingBox(); await tapP({ x: nb.x + nb.width / 2, y: nb.y + nb.height / 2 }); await wait(250); s = await st(); assert.strictEqual(s.pend, false); assert.strictEqual(s.start, null); assert.strictEqual(s.pipes, p5); assert(Math.abs(s.cash - c5) < 5, 'no money spent');
  await tap(X + 21, Y + 10); await tap(X + 28, Y + 12); await wait(150); s = await st(); assert(s.pend && s.route.ok, 'a new route right after cancel works'); await confirmTap(); s = await st(); assert(s.pipes > p5); await valid('S5');
  log('S5: cancel -> preview, start and cost gone, cash and pipes unchanged; a new pipe started immediately works and builds');

  // ---- S6: pinch zoom while drawing keeps the start and builds nothing; one-finger drag on the ground does not pan or build ----
  await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X + 20, Y + 20, 'large'); g.place('tank', X + 30, Y + 20); }, [X, Y]);
  await center(X + 25, Y + 20, .9); await setPipe(); await tap(X + 21, Y + 20); s = await st(); const start6 = s.start; assert(start6 && start6[1] === Y + 20, 'start set'); const z0 = await G(() => window.__oli.cam.z), pc0 = s.pipes;
  await pinch({ x: 195, y: 330 }, 80, 200); s = await st(); const z1 = await G(() => window.__oli.cam.z); assert(z1 > z0 * 1.2, 'the pinch zoomed: ' + [z0, z1]); assert.deepStrictEqual(s.start, start6, 'start kept'); assert.strictEqual(s.pipes, pc0);
  const cm0 = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y })); await drag({ x: 60, y: 220 }, { x: 180, y: 260 }); const cm1 = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y })); s = await st();
  assert(Math.hypot(cm1.x - cm0.x, cm1.y - cm0.y) < 2, 'the camera did not pan: ' + JSON.stringify([cm0, cm1])); assert.strictEqual(s.pipes, pc0, 'nothing built by the drag'); assert.deepStrictEqual(s.start, start6, 'start kept after the drag');
  await center(X + 25, Y + 20, .9); await tap(X + 30, Y + 20); await wait(150); s = await st(); assert(s.route && s.route.ok); await confirmTap(); s = await st(); assert(s.pipes > pc0); await valid('S6'); await run(30);
  const t6 = await A(([X, Y]) => window.__oli.game.buildings.find(b => b.type === 'tank' && b.x === X + 30 && b.y === Y + 20).amt, [X, Y]); assert(t6 > 2);
  log('S6: pinch while drawing zoomed ' + z0.toFixed(2) + ' -> ' + z1.toFixed(2) + ' and kept the start; a one-finger drag did not pan and built nothing; then the pipe was finished and built (oil ' + t6.toFixed(1) + ')');

  // ---- S7: drag-to-route from the well with a finger: live preview, nothing built while dragging ----
  await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X + 20, Y + 30, 'large'); g.place('tank', X + 30, Y + 33); }, [X, Y]);
  await center(X + 25, Y + 31, .9); await setPipe(); const a7 = await scr(X + 20, Y + 30), b7 = await scr(X + 30, Y + 33); const pc7 = (await st()).pipes;
  await T('touchStart', [a7]); for (let i = 1; i <= 16; i++) { await T('touchMove', [{ x: a7.x + (b7.x - a7.x) * i / 16, y: a7.y + (b7.y - a7.y) * i / 16 }]); await wait(20); if (i === 8) { s = await st(); assert(s.route, 'live preview while dragging'); assert.strictEqual(s.pipes, pc7, 'nothing built while dragging'); } }
  await T('touchEnd', []); await wait(250); s = await st(); assert(s.pend && s.route && s.route.ok, 'after releasing: ' + JSON.stringify(s)); assert.strictEqual(s.pipes, pc7, 'releasing does not build either'); await confirmTap(); s = await st(); assert(s.pipes > pc7); await valid('S7');
  log('S7: finger dragged from the well toward the tank: the route follows the finger, releasing leaves a preview (no accidental build), Confirm builds ' + (s.pipes - pc7) + ' tiles');

  // ---- S8: join to the middle of an existing pipe -> junction preview, real junction, removal of the branch ----
  await A(([X, Y]) => { const g = window.__oli.game; g.place('tank', X + 5, Y + 7); }, [X, Y]);
  await center(X + 5, Y + 3, .9); await setPipe(); const main = await A(([X, Y]) => { const g = window.__oli.game; return [...Array(40).keys()].map(i => i + X + 1).filter(x => g.pipe[Y * 140 + x]).slice(0, 12); }, [X, Y]);
  const jx = main[Math.floor(main.length / 2)]; await tap(jx, Y); await tap(X + 5, Y + 7); await wait(200); s = await st(); pl = await pill();
  const inf = await G(() => window.__oli.game.routeInfo(window.__oli.ui.route)); assert(inf && inf.junctions.length >= 1, 'the preview knows a junction will be made: ' + JSON.stringify(inf && inf.junctions)); assert(/وصلة|junction|branch|فرع/i.test(pl.text2 || ''), 'the pill names it: ' + JSON.stringify(pl));
  await page.screenshot({ path: OUT + '/s8-junction-preview.png' }); const cj = (await st()).pipes; await confirmTap(); s = await st(); assert(s.pipes > cj); await valid('S8'); await run(5);
  const jn = await A(([k]) => { const g = window.__oli.game, nd = g.graphNode(k); return nd ? { id: nd.id, kind: nd.kind, deg: nd.edges.length } : null; }, [Y * 140 + inf.junctions[0].x + 0 * 0 + (inf.junctions[0].y - Y) * 140]);
  assert(jn && jn.kind === 'junction' && jn.deg === 3, 'a real junction node: ' + JSON.stringify(jn)); await center(X + 5, Y + 3, 1.3); await page.screenshot({ path: OUT + '/s8-junction.png' });
  await G(() => window.__oli.setTool('select')); const bt = await A(([X, Y]) => { const g = window.__oli.game, k0 = g.buildings.find(b => b.type === 'tank' && b.x === X + 5 && b.y === Y + 7); return [k0.x, k0.y]; }, [X, Y]);
  await tap(inf.junctions[0].x, inf.junctions[0].y + 3); await wait(250); assert(await page.locator('#p-rb').isVisible(), 'the pipe panel offers Remove branch'); const before = (await st()).pipes; await page.screenshot({ path: OUT + '/s8-panel.png' });
  await page.locator('#p-rb').click(); await wait(300); s = await st(); assert(s.pipes < before, 'the whole branch is gone: ' + [before, s.pipes]); await valid('S8 removed'); const gone = await A(([k]) => window.__oli.game.graphNode(k), [Y * 140 + inf.junctions[0].x]); assert.strictEqual(gone, null, 'the junction simplified itself');
  log('S8: pipe tapped onto the middle of the main line: the preview announced "' + pl.text2 + '", a real junction node ' + jn.id + ' (3 branches) was made; "Remove branch" in the panel removed ' + (before - s.pipes) + ' tiles at once and the junction vanished');

  // ---- S9: debug overlay shows the graph ----
  await G(() => { window.__oli.setDebug(true); window.__oli.updateDebug(); }); const dbg = await G(() => (document.getElementById('dbg') || {}).textContent || ''); assert(/GRAPH\s+nodes/.test(dbg), 'debug shows the graph: ' + dbg.slice(0, 200)); assert(/graph valid/.test(dbg)); await G(() => window.__oli.setDebug(false));
  log('S9: debug overlay: "' + dbg.split('\n').find(l => /^GRAPH/.test(l)) + '"');

  assert.deepStrictEqual(errors, [], 'no console errors: ' + errors.join(' | '));
  console.log('\nALL PHASE 15 PIPE UI TESTS PASSED (' + n + ' scenarios, no console errors). Screenshots: ' + OUT);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
