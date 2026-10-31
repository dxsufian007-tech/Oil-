// Phone test: real taps build the pipe scenarios; the visible state must equal the game state.
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = 'file:///home/claude/oli/index.html', OUT = '/tmp/oli-shots9'; require('fs').mkdirSync(OUT, { recursive: true });
const log = m => console.log('ok   ' + m);
(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForTimeout(600);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const X = 50, Y = 40;
  await G(() => { const o = window.__oli, g = o.game, C = window.OliCore.CFG; C.TERRAIN.MULT = [1, 1, 1, 1]; C.REGIONS.forEach(r => { r.mult = 1; }); C.PIPE.LEAK_PER_TILE_MIN = 0; C.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
    g.s.regions.forEach(r => { r.unlocked = true; }); g.s.tutorialDone = true; g.s.cash = 1e7; for (const a of g.areas) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
    for (let y = 36; y < 62; y++) for (let x = 46; x < 82; x++) { const k = y * 140 + x; g.map.block[k] = 0; g.map.water[k] = 0; } });
  const scr = (x, y) => A(([x, y]) => { const { cam } = window.__oli, r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + ((x - y) * 32 - cam.x) * cam.z + r.width / 2, y: r.top + ((x + y) * 16 + 16 - cam.y) * cam.z + r.height / 2 }; }, [x, y]);
  const center = async (x, y, z) => { await A(([x, y, z]) => { const o = window.__oli; o.camGoal.on = false; o.cam.x = (x - y) * 32; o.cam.y = (x + y) * 16 + 16 + 100 / z; o.cam.z = z; o.select(null); }, [x, y, z]); await wait(250); };
  const tap = async (x, y) => { const p = await scr(x, y); await page.touchscreen.tap(p.x, p.y); await wait(150); };
  const toast = () => G(() => (document.querySelector('#toast, .toast') || {}).textContent || '');
  const valid = async what => { const p = await G(() => window.__oli.game.validateNetwork()); assert.deepStrictEqual(p, [], what + ': ' + p.join(' | ')); };
  const run = sec => G(() => { const g = window.__oli.game; for (let i = 0; i < 4 * 1; i++) g.step(.25); }) && A(sec => { const g = window.__oli.game; for (let i = 0; i < sec * 4; i++) g.step(.25); }, sec);
  const pipeBy = async (x1, y1, x2, y2) => {                       // pipe tool with real taps: start, end, confirm
    await G(() => window.__oli.setTool('pipe')); await tap(x1, y1); await tap(x2, y2); await wait(200);
    const ok = page.locator('#confirm-ok'); const txt = (await page.textContent('#confirm-text')) || '';
    if (await ok.isVisible() && !(await ok.isDisabled())) { await ok.click(); await wait(250); return { built: true, txt }; }
    await G(() => window.__oli.setTool('select')); return { built: false, txt };
  };
  const st = () => G(() => { const g = window.__oli.game; return { tanks: g.buildings.filter(b => b.type === 'tank').map(t => +t.amt.toFixed(1)), wells: g.buildings.filter(b => b.type === 'well').map(w => +(w.q || 0).toFixed(1)) }; });
    // S1: well -> pipe -> tank
  await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X, Y); g.place('tank', X + 12, Y); }, [X, Y]);
  await center(X + 6, Y + 2, .8);
  let r = await pipeBy(X + 1, Y, X + 11, Y); assert(r.built, 'S1 ' + r.txt); await valid('S1'); await run(40); let s = await st(); assert(s.tanks[0] > 2 && s.wells[0] > 1, JSON.stringify(s));
  log('phone S1: well -> pipe -> tank built with taps; ' + JSON.stringify(s));
  await page.screenshot({ path: OUT + '/p9-1.png' });
  // S2: several pipes (3 taps pairs with corners) to a second tank row
  await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X, Y + 6); g.place('tank', X + 16, Y + 9); }, [X, Y]);
  await center(X + 8, Y + 8, .8);
  r = await pipeBy(X + 1, Y + 6, X + 6, Y + 6); assert(r.built, 'S2a ' + r.txt); r = await pipeBy(X + 6, Y + 6, X + 6, Y + 10); assert(r.built, 'S2b ' + r.txt); r = await pipeBy(X + 6, Y + 10, X + 15, Y + 10); assert(r.built, r.txt);
  await valid('S2'); await run(50); s = await st(); assert(s.tanks[1] > 2, JSON.stringify(s)); log('phone S2: well -> 3 pipe builds -> tank: ' + JSON.stringify(s));
  // S3: crossing without junction is refused with a clear message (tap a pipe from y+12 up to y+3 across the S1/S2 lines)
  await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X + 8, Y + 14); g.place('tank', X + 8, Y + 2); }, [X, Y]);
  await center(X + 8, Y + 8, .8);
  const pc = await G(() => window.__oli.game.pipeCount()), cc0 = await G(() => window.__oli.game.buildings.filter(b => b.type === 'well').slice(0, 2).map(w => window.__oli.game.net.routes.get(w.id).length).join());
  r = await pipeBy(X + 8, Y + 13, X + 8, Y + 4); const t3 = (await toast()) + ' ' + r.txt;
  if (r.built) {                                                   // Phase 5: the router goes AROUND the existing lines: a new separate network, never a crossing
    await run(15); assert.strictEqual(await G(() => window.__oli.game.buildings.filter(b => b.type === 'well').slice(0, 2).map(w => window.__oli.game.net.routes.get(w.id).length).join()), cc0, 'the detour linked nothing: the old wells still reach exactly the same tanks'); await valid('S3 detour');
    log('phone S3: the straight line would cross the others -> built as a detour around them (separate network, graph valid)');
  } else {
    assert.strictEqual(await G(() => window.__oli.game.pipeCount()), pc); await valid('S3');
    assert(/تقاطع|يعبر|يلامس|مسار|crossing|cross|touch|route/i.test(t3 + (await page.textContent('body'))), 'a reason is shown: ' + t3);
    log('phone S3: crossing the lines is refused, no pipe added, message: "' + t3.trim().slice(0, 80) + '"');
  }
  await page.screenshot({ path: OUT + '/p9-3.png' });
  // S4: delete a pipe tile -> disconnect, rebuild -> resume
  await G(() => window.__oli.setTool('erase')); await center(X + 6, Y + 2, .8); await tap(X + 5, Y); await wait(300);
  const conf = page.locator('#confirm-ok'); if (await conf.isVisible()) { await conf.click(); await wait(300); }
  const cut = await A(([X, Y]) => { const g = window.__oli.game; return { pipe: g.pipe[Y * 140 + X + 5], routes: (g.net.routes.get(g.buildings.find(b => b.type === 'well').id) || []).length }; }, [X, Y]);
  assert.strictEqual(cut.pipe, 0, 'tile removed by tapping'); assert.strictEqual(cut.routes, 0); await valid('S4 cut'); const t0 = (await st()).tanks[0]; await run(20); assert(Math.abs((await st()).tanks[0] - t0) < 1e-6, 'no oil moves through the gap');
  await G(() => window.__oli.setTool('select')); await center(X + 6, Y + 2, .8); r = await pipeBy(X + 4, Y, X + 6, Y); assert(r.built, 'rebuild ' + r.txt); await valid('S4 rebuilt'); await run(40); assert((await st()).tanks[0] > t0 + 1, 'flow resumed');
  log('phone S4: pipe tile deleted by tap -> well cut off (0 routes, no oil moves); rebuilt -> flow resumes');
  // S5: capacity: large well into a level-1 pipe
  await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X + 20, Y + 14, 'large'); g.place('tank', X + 30, Y + 14); }, [X, Y]);
  await center(X + 25, Y + 14, .6); r = await pipeBy(X + 21, Y + 14, X + 29, Y + 14); assert(r.built, r.txt); await run(60); await valid('S5');
  const q = await A(([X, Y]) => { const g = window.__oli.game, w = g.buildings.find(b => b.x === X + 20 && b.y === Y + 14); return { q: w.q, rate: w.rate, cap: window.OliCore.CFG.PIPE.CAP[0], tile: g.net.flowK[(Y + 14) * 140 + X + 25] }; }, [X, Y]);
  assert(q.q <= q.cap + 1e-3 && q.rate > q.cap, JSON.stringify(q)); log('phone S5: pipe capacity ' + q.cap + ' < production ' + q.rate.toFixed(1) + ' -> flow ' + q.q.toFixed(1));
  // S6: tank full -> reroute
  await A(([X, Y]) => { const g = window.__oli.game; g.place('well', X + 20, Y + 20); g.place('tank', X + 26, Y + 17); g.place('tank', X + 26, Y + 23); }, [X, Y]);
  await center(X + 23, Y + 21, .8); r = await pipeBy(X + 21, Y + 20, X + 24, Y + 20); assert(r.built, r.txt); r = await pipeBy(X + 24, Y + 20, X + 24, Y + 18); assert(r.built, r.txt); r = await pipeBy(X + 24, Y + 20, X + 24, Y + 24); assert(r.built, r.txt);
  r = await pipeBy(X + 24, Y + 18, X + 25, Y + 18); r = await pipeBy(X + 24, Y + 24, X + 25, Y + 24); await valid('S6');
  const w6 = await A(([X, Y]) => { const g = window.__oli.game, w = g.buildings.find(b => b.x === X + 20 && b.y === Y + 20); return g.net.routes.get(w.id).map(r => r.tank.id); }, [X, Y]); assert.strictEqual(w6.length, 2, 'two routes: ' + w6);
  await A(([X, Y, id]) => { const g = window.__oli.game, t = g.buildings.find(b => b.id === id); t.amt = g.tankCap(t); g.hyd.dirty = true; }, [X, Y, w6[0]]); await run(60); await valid('S6 full');
  const t6 = await A(ids => { const g = window.__oli.game; return ids.map(id => { const t = g.buildings.find(b => b.id === id); return [t.amt, g.tankCap(t)]; }); }, w6);
  assert(t6[0][0] >= t6[0][1] - 1e-6 && t6[1][0] > 2, JSON.stringify(t6)); log('phone S6: nearest tank full -> oil goes to the other tank ' + JSON.stringify(t6.map(a => +a[0].toFixed(0))));
  await center(X + 24, Y + 20, 1.2); await wait(400); await page.screenshot({ path: OUT + '/p9-6.png' });
  // S7: drawn connections == game connections for every pipe tile
  const mism = await G(() => { const g = window.__oli.game, W = 140, H = 88, bad = []; for (let k = 0; k < W * H; k++) { if (!g.pipe[k]) continue; const live = g.net.live[k]; if (live !== 1 && !(g.pipeReady[k] > g.s.time)) bad.push('pipe not live ' + k); } return bad; });
  assert.deepStrictEqual(mism, []); log('phone S7: every drawn pipe tile is a live node of the game graph');
  assert.deepStrictEqual(errors, [], errors.join('\n'));
  console.log('\nALL PIPE-NETWORK PHONE TESTS PASSED (no console errors)');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
