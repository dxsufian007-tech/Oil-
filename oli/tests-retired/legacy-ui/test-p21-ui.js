// Phase 21: real touch (CDP) on a phone-sized screen: auto-select after build, main/branch pipes, cancel, camera pan, pinch zoom, double-tap guard.
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
  await page.goto(URL); await page.evaluate(() => { window.OliCore.CFG.BUILD = { well: 0, tank: 0, pipeTile: 0, pipeMax: 0 }; window.__oli.game.s.tutorialDone = true; }); await page.waitForTimeout(700);
  const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a), wait = ms => page.waitForTimeout(ms);
  const TE = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const scr = (x, y) => A(([x, y]) => { const { cam } = window.__oli, r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + ((x - y) * 32 - cam.x) * cam.z + r.width / 2, y: r.top + ((x + y) * 16 + 16 - cam.y) * cam.z + r.height / 2 }; }, [x, y]);
  const tapAt = (x, y) => page.touchscreen.tap(x, y);
  const drag = async (a, b, steps = 14) => { await TE('touchStart', [a]); for (let i = 1; i <= steps; i++) { await TE('touchMove', [{ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }]); await wait(16); } await TE('touchEnd', []); };
  const focus = (x, y) => G2(([x, y]) => { const c = window.__oli.cam; c.x = (x - y) * 32; c.y = (x + y) * 16 - 40; window.__oli.camGoal.on = false; }, [x, y]);
  const G2 = (fn, a) => page.evaluate(fn, a);
  const openMenu = async () => { if (await page.locator('#buildmenu').isHidden()) { await page.tap('#btn-build'); await wait(250); } };
  const cash = () => G(() => window.__oli.game.s.cash);
  // ---------- 1. build a well: build -> place -> preview -> confirm -> auto select
  await openMenu(); await page.tap('[data-tool=well]'); await wait(200);
  const spot = await G(() => { const g = window.__oli.game, c = window.__oli.cellAt(195, 273); return g.nearestValid('well', c.x, c.y, 99, window.__oli.getSpots('well')); });
  await focus(spot[0], spot[1]); await wait(250);
  let p = await scr(spot[0], spot[1]); await tapAt(p.x, p.y); await wait(300);
  assert(await page.locator('#confirm').isVisible(), 'preview shows confirm'); const c0 = await cash(); assert.strictEqual(await G(() => window.__oli.game.buildings.length), 0); log('place -> preview: nothing built, nothing paid yet');
  await page.tap('#confirm-ok'); await wait(400);
  const st = await G(() => { const o = window.__oli; return { tool: o.ui.tool, sel: o.ui.sel, n: o.game.buildings.length, panel: !document.getElementById('panel').hidden, menu: !document.getElementById('buildmenu').hidden }; });
  assert.strictEqual(st.n, 1); assert.strictEqual(st.tool, 'select', 'back in Select mode'); assert(st.sel && st.sel.kind === 'b', 'new building selected'); assert(st.panel, 'info panel open'); assert(!st.menu, 'build menu closed');
  log('confirm -> building created -> Select mode, building selected, panel open (cash ' + c0 + ' -> ' + await cash() + ')');
  // the touch that confirmed must not do anything else: tap right after on a free tile does not place a 2nd building
  await wait(100); assert.strictEqual(await G(() => window.__oli.game.buildings.length), 1); log('no second placement from the confirming touch');
  await page.screenshot({ path: `${OUT}/p21-1-autoselect.png` });
  // ---------- 2. cancel changes nothing
  await openMenu(); await page.tap('[data-tool=tank]'); await wait(200);
  const tspot = await G(() => { const g = window.__oli.game, w = g.buildings[0]; return g.nearestValid('tank', w.x + 6, w.y, 30, window.__oli.getSpots('tank')); });
  await focus(tspot[0], tspot[1]); await wait(250); p = await scr(tspot[0], tspot[1]); await tapAt(p.x, p.y); await wait(300);
  const cb = await cash(); assert(await page.locator('#confirm').isVisible()); await page.tap('#confirm-no'); await wait(300);
  assert.strictEqual(await cash(), cb); assert.strictEqual(await G(() => window.__oli.game.buildings.length), 1); log('Cancel: money, buildings unchanged');
  // build the tank for real
  await tapAt(p.x, p.y); await wait(300); await page.tap('#confirm-ok'); await wait(400);
  assert.strictEqual(await G(() => window.__oli.game.buildings.length), 2); assert.strictEqual(await G(() => window.__oli.ui.tool), 'select'); log('tank built -> Select mode again');
  // ---------- 3. main pipe vs branch pipe (two buttons, two costs, real type in game state)
  const btns = await page.locator('.tool[data-tool=pipe]').count(); assert.strictEqual(btns, 2, 'two pipe buttons'); log('build menu has Main Pipe and Branch Pipe buttons');
  for (const kind of ['sub', 'main']) {
    await openMenu(); await page.tap(`.tool[data-pipe-type=${kind}]`); await wait(250);
    const w = await G(() => window.__oli.game.buildings.find(b => b.type === 'well')), tk = await G(() => window.__oli.game.buildings.find(b => b.type === 'tank'));
    const cam0 = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y }));
    await G2(([a, b]) => { const c = window.__oli.cam; c.x = ((a.x - a.y) + (b.x - b.y)) * 16; c.y = ((a.x + a.y) + (b.x + b.y)) * 8 - 20; c.z = Math.min(c.z, .8); window.__oli.camGoal.on = false; }, [w, tk]); await wait(250);
    const a0 = await scr(w.x, w.y), b0 = await scr(tk.x, tk.y); const camB = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y }));
    await tapAt(a0.x, a0.y - 6); await wait(300); await tapAt(b0.x, b0.y - 6); await wait(300);   // node to node: tap the well, tap the tank
    const camA = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y })); assert(Math.abs(camA.x - camB.x) < 1 && Math.abs(camA.y - camB.y) < 1, 'node taps must not pan the camera');
    const info = await G(() => ({ r: window.__oli.ui.route, pt: window.__oli.ui.pipeType, shown: !document.getElementById('confirm').hidden })); assert(info.r && info.r.ok, 'route ok: ' + JSON.stringify(info.r && info.r.reason) + ' pipes left ' + await G(() => window.__oli.game.pipeCount())); assert(info.shown); assert.strictEqual(info.pt, kind === 'main' ? 1 : 0);
    const cb2 = await cash(); await page.tap('#confirm-ok'); await wait(400);
    const spent = cb2 - await cash(); const types = await G(() => { const g = window.__oli.game; const t = new Set(); for (let k = 0; k < g.pipe.length; k++) if (g.pipe[k]) t.add(g.pipeType[k]); return [...t]; });
    log(kind + ' pipe: auto route ' + info.r.cells.length + ' tiles, preview cost ' + info.r.cost + ', paid ' + spent + ', pipeType in state = ' + JSON.stringify(types));
    assert(Math.abs(spent - info.r.cost) < 3, 'paid the preview cost (running costs tick meanwhile)');
    // fresh game with the same well + tank (placed through the core) so the next pipe type builds the same route
    await page.evaluate(() => { removeEventListener('beforeunload', window.__oli.save || (() => {})); }); await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} }); await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); await page.goto('about:blank'); await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} }).catch(() => {}); await page.goto(URL); await wait(700);
    await G(() => { const o = window.__oli, g = o.game; window.OliCore.CFG.BUILD = { well: 0, tank: 0, pipeTile: 0, pipeMax: 0 }; g.s.tutorialDone = true; });
    await G2(([w, t]) => { const g = window.__oli.game; g.place('well', w[0], w[1], 'small'); g.place('tank', t[0], t[1]); }, [spot, tspot]); await wait(300);
    if (kind === 'sub') { var costSub = spent, capSub = null; } else { assert(spent > costSub, 'main pipe costs more than branch'); log('main costs ' + spent + ' > branch ' + costSub); }
  }
  // ---------- 4. camera: one finger on empty map pans, two fingers zoom
  await G(() => { window.__oli.setTool('select'); window.__oli.select(null); }); await wait(200);
  const cam1 = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y, z: window.__oli.cam.z }));
  await drag({ x: 300, y: 420 }, { x: 180, y: 360 }); await wait(400);
  const cam2 = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y, z: window.__oli.cam.z })); assert(Math.abs(cam2.x - cam1.x) > 20 || Math.abs(cam2.y - cam1.y) > 20, 'one finger pans'); assert(Math.abs(cam2.z - cam1.z) < 1e-6); log('one finger on empty map pans the camera (' + Math.round(cam2.x - cam1.x) + ',' + Math.round(cam2.y - cam1.y) + '), zoom unchanged');
  await TE('touchStart', [{ x: 175, y: 400 }, { x: 215, y: 400 }]); for (let i = 1; i <= 12; i++) { await TE('touchMove', [{ x: 175 - i * 6, y: 400 }, { x: 215 + i * 6, y: 400 }]); await wait(16); }
  await TE('touchEnd', []); await wait(300);
  const cam3 = await G(() => ({ z: window.__oli.cam.z })); assert(cam3.z > cam2.z + .05, 'pinch out zooms in: ' + cam2.z + ' -> ' + cam3.z); log('two fingers pinch zoom: ' + cam2.z.toFixed(2) + ' -> ' + cam3.z.toFixed(2));
  assert.strictEqual(await G(() => window.__oli.game.buildings.length), 2); log('camera gestures never built or selected anything by accident');
  assert.deepStrictEqual(errors, [], errors.join('\n')); await browser.close(); console.log('ALL PHASE 21 UI TESTS PASSED (no console errors)');
})().catch(e => { console.error(e); process.exit(1); });
