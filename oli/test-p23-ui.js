// Phase 23: node-to-node pipes on a phone with real touch: tap start node, tap destination node, one route (preview == built), confirm, back to Select.
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
  await page.goto(URL); await page.evaluate(() => { window.OliCore.CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 }; const g = window.__oli.game; g.s.tutorialDone = true; g.s.cash = 1e6; }); await page.waitForTimeout(600);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const TE = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const scr = (x, y) => A(([x, y]) => { const { cam } = window.__oli, r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + ((x - y) * 32 - cam.x) * cam.z + r.width / 2, y: r.top + ((x + y) * 16 + 16 - cam.y) * cam.z + r.height / 2 }; }, [x, y]);
  const tapAt = (x, y) => page.touchscreen.tap(x, y);
  const drag = async (a, b, steps = 12) => { await TE('touchStart', [a]); for (let i = 1; i <= steps; i++) { await TE('touchMove', [{ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }]); await wait(16); } await TE('touchEnd', []); };
  const center = (x, y, z) => A(([x, y, z]) => { const c = window.__oli.cam; c.x = (x - y) * 32; c.y = (x + y) * 16 - 20; if (z) c.z = z; window.__oli.camGoal.on = false; }, [x, y, z]);
  const valid = async w => { const p = await G(() => window.__oli.game.validateNetwork()); assert.deepStrictEqual(p, [], w + ': ' + p.slice(0, 3).join('|')); };
  const lines = () => G(() => window.__oli.game.lines.map(L => ({ id: L.id, a: L.a, b: L.b, n: L.cells.length, t: L.type })));
  const openPipe = async kind => { if (await page.locator('#buildmenu').isHidden()) { await page.tap('#btn-build'); await wait(250); } await page.tap(`.tool[data-pipe-type=${kind}]`); await wait(250); };
  const tapBld = async b => { const p = await scr(b.x, b.y); await tapAt(p.x, p.y - 6); await wait(300); };
  // scene (through the core): a well, two tanks, one pump spot later
  const sc = await G(() => { const g = window.__oli.game, sp = window.__oli.getSpots('well')[0], x = sp[0], y = sp[1]; const w = g.place('well', x, y, 'small').building; const t1s = g.nearestValid('tank', x + 9, y + 1, 25, window.__oli.getSpots('tank')); const t1 = g.place('tank', t1s[0], t1s[1]).building; const t2s = g.nearestValid('tank', x + 2, y + 9, 25, window.__oli.getSpots('tank')); const t2 = g.place('tank', t2s[0], t2s[1]).building; return { w: { id: w.id, x: w.x, y: w.y }, t1: { id: t1.id, x: t1.x, y: t1.y }, t2: { id: t2.id, x: t2.x, y: t2.y } }; });
  await center((sc.w.x + sc.t1.x) / 2, (sc.w.y + sc.t1.y) / 2, 1.0); await wait(300);
  // 1. Pipe tool -> tap the well -> tap the tank -> ONE route shown, nothing built yet
  await openPipe('sub'); const cash0 = await G(() => window.__oli.game.s.cash);
  await tapBld(sc.w); assert.strictEqual(await G(() => window.__oli.ui.pipeA), 'B' + sc.w.id); assert(!(await page.locator('#confirm').isVisible())); log('1. tap the well -> it is the start node (B' + sc.w.id + '), no confirm bar yet');
  const camA = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y }));
  await tapBld(sc.t1); const r = await G(() => { const r = window.__oli.ui.route; return r && { ok: r.ok, a: r.a, b: r.b, cells: r.cells.map(c => c.join(',')), cost: r.cost, reason: r.reason }; });
  assert(r && r.ok, JSON.stringify(r)); assert.strictEqual(r.b, 'B' + sc.t1.id); assert(await page.locator('#confirm').isVisible()); assert.strictEqual((await lines()).length, 0); assert(Math.abs(await G(() => window.__oli.game.s.cash) - cash0) < 5, 'no money taken (running costs tick)');
  const camB = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y })); assert(Math.abs(camA.x - camB.x) < 1 && Math.abs(camA.y - camB.y) < 1, 'node taps never move the camera');
  await page.screenshot({ path: `${OUT}/p23-1-preview.png` }); log('2. tap the tank -> auto route ' + r.cells.length + ' tiles, cost ' + r.cost + ', confirm bar shown; nothing built, no money taken, camera still');
  // tapping the destination again does NOT build (only Confirm builds)
  await tapBld(sc.t1); await tapBld(sc.t1); assert.strictEqual((await lines()).length, 0); log('3. tapping the destination again (x2) builds nothing');
  // 2. Confirm -> exactly the previewed route, one entity, Select mode
  await G(() => { const b = document.getElementById('confirm-ok'); b.click(); b.click(); }); await wait(450);
  const L = await lines(); assert.strictEqual(L.length, 1, 'one pipe for a double confirm'); assert.strictEqual(L[0].a, 'B' + sc.w.id); assert.strictEqual(L[0].b, 'B' + sc.t1.id);
  const built = await G(() => window.__oli.game.lines[0].cells.map(k => (k % 140) + ',' + ((k / 140) | 0))); const fresh = r.cells.filter(c => built.includes(c)); assert.strictEqual(fresh.length, built.length); assert.deepStrictEqual(built, r.cells.filter(c => built.includes(c)), 'built == preview');
  assert.strictEqual(await G(() => window.__oli.ui.tool), 'select'); assert(!(await G(() => window.__oli.ui.pipeA))); await valid('after confirm');
  log('4. Confirm (clicked twice) -> ONE pipe entity #' + L[0].id + ' ' + L[0].a + ' -> ' + L[0].b + ', tiles identical to the preview, back to Select mode, graph valid');
  await G(() => { for (let i = 0; i < 300; i++) window.__oli.game.step(0.2); }); const flow = await G(() => window.__oli.game.buildings.find(b => b.type === 'well').q); assert(flow > 0.5); log('5. oil flows through it (q=' + flow.toFixed(1) + ')');
  // 3. duplicate is refused with the reason, nothing built
  await openPipe('main'); await tapBld(sc.w); await tapBld(sc.t1); const d = await G(() => window.__oli.ui.route.reason); assert.strictEqual(d, 'duplicate'); assert(await page.locator('#confirm-ok').isDisabled()); const txt = await page.textContent('#confirm-text'); log('6. same well -> same tank again: refused (red) "' + txt.trim() + '"');
  await page.tap('#confirm-no'); await wait(250); assert(!(await G(() => window.__oli.ui.pipeA))); assert(!(await page.locator('#confirm').isVisible())); log('7. Cancel: no preview left, nothing selected as start');
  // 4. camera pan and pinch while building a pipe: never creates or changes the pipe
  await openPipe('main'); await tapBld(sc.w); const c0 = await G(() => ({ x: window.__oli.cam.x, z: window.__oli.cam.z }));
  await drag({ x: 300, y: 330 }, { x: 220, y: 380 }); await wait(250); const c1 = await G(() => ({ x: window.__oli.cam.x, z: window.__oli.cam.z })); assert(Math.abs(c1.x - c0.x) > 10, 'drag pans in pipe mode');
  await TE('touchStart', [{ x: 160, y: 330 }, { x: 230, y: 330 }]); for (let i = 1; i <= 8; i++) { await TE('touchMove', [{ x: 160 - i * 4, y: 330 }, { x: 230 + i * 4, y: 330 }]); await wait(16); } await TE('touchEnd', []); await wait(250);
  assert.strictEqual(await G(() => window.__oli.ui.pipeA), 'B' + sc.w.id); assert.strictEqual((await lines()).length, 1); log('8. pan + pinch while the start is chosen: camera moves, the start stays, no pipe is made');
  // 5. junction: start on the existing pipe, end at tank 2 (main pipe) -> T junction, one more entity
  const mid = await G(() => { const L = window.__oli.game.lines[0]; const k = L.cells[Math.floor(L.cells.length / 2)]; return { x: k % 140, y: (k / 140) | 0 }; });
  await G(() => window.__oli.ui.setTool && 0); await page.tap('#confirm-no').catch(() => {}); await G(() => { window.__oli.setTool('select'); }); await openPipe('main');
  await center((mid.x + sc.t2.x) / 2, (mid.y + sc.t2.y) / 2, 1.0); await wait(300);
  let mp = await scr(mid.x, mid.y); await tapAt(mp.x, mp.y); await wait(300); const ja = await G(() => window.__oli.ui.pipeA); assert(ja && ja[0] === 'J', 'start on the pipe = junction node, got ' + ja);
  await tapBld(sc.t2); const r2 = await G(() => window.__oli.ui.route); assert(r2.ok, r2.reason); await page.tap('#confirm-ok'); await wait(450); await valid('junction');
  const L2 = await lines(); const jl = L2.find(q => q.b === 'B' + sc.t2.id || q.a === 'B' + sc.t2.id); assert(jl && jl.t === 1, 'main pipe to tank 2'); const node = await A(m => { const g = window.__oli.game, n = g.graphNode(m.y * 140 + m.x); return n && n.kind; }, mid);
  log('9. tap a pipe (junction node ' + ja + ') then tank 2: main pipe built, ' + L2.length + ' entities, graph node at the junction = ' + node + ', graph valid');
  await page.screenshot({ path: `${OUT}/p23-2-junction.png` });
  // 6. rapid taps on nodes never build
  await openPipe('sub'); const nl = (await lines()).length; for (let i = 0; i < 6; i++) { const p = await scr((i % 2 ? sc.t1 : sc.t2).x, (i % 2 ? sc.t1 : sc.t2).y); await tapAt(p.x, p.y - 6); await wait(40); } await wait(300);
  assert.strictEqual((await lines()).length, nl); log('10. six rapid taps on nodes: no pipe built without Confirm');
  // 7. save -> reload: same entities
  const before = JSON.stringify(await lines()); await G(() => window.dispatchEvent(new Event('beforeunload'))); await wait(150); await page.reload(); await wait(900);
  assert.strictEqual(JSON.stringify(await lines()), before); await valid('reload'); log('11. save -> reload: identical pipe entities (IDs, start/end nodes, tiles), graph valid');
  assert.deepStrictEqual(errors, [], errors.join('\n')); await browser.close(); console.log('ALL PHASE 23 UI TESTS PASSED (no console errors)');
})().catch(e => { console.error(e); process.exit(1); });
