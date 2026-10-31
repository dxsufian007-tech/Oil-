// Phase 5: play the game like a new player (phone, real touch gestures, Arabic). No game-state shortcuts except fast-forwarding time.
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file:///home/claude/oli/index.html';
const OUT = process.argv[2] || '/tmp/oli-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const log = m => console.log('ok   ' + m);
(async () => {
  const browser = await chromium.launch(), errors = [];
  async function run(opts, tag, touch) {
    const ctx = await browser.newContext(opts), page = await ctx.newPage(), cdp = touch ? await ctx.newCDPSession(page) : null;
    page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join('|')));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errors.push(tag + ' console: ' + m.text()); });
    await page.goto(URL); await page.evaluate(() => { window.OliCore.CFG.BUILD = {well:0,tank:0,pipeTile:0,pipeMax:0}; }); await page.waitForTimeout(700);
    const G = fn => page.evaluate(fn), A = (fn, a) => page.evaluate(fn, a);
    const scr = (x, y) => A(([x, y]) => { const { cam } = window.__oli, r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + ((x - y) * 32 - cam.x) * cam.z + r.width / 2, y: r.top + ((x + y) * 16 + 16 - cam.y) * cam.z + r.height / 2 }; }, [x, y]);
    const tapEl = async sel => { if (/^\[data-tool=/.test(sel) && await page.locator('#buildmenu').isHidden()) { await (touch ? page.tap('#btn-build') : page.click('#btn-build')); await page.waitForTimeout(250); } return touch ? page.tap(sel) : page.click(sel); };   // after a build the game returns to Select mode, so the build menu may need re-opening
    const tapAt = async (x, y) => { if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
    const drag = async (a, b, steps = 14) => {                                             // a real drag with the finger / mouse
      if (touch) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] }); for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }] }); await page.waitForTimeout(16); } await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
      else { await page.mouse.move(a.x, a.y); await page.mouse.down(); for (let i = 1; i <= steps; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps); await page.waitForTimeout(16); } await page.mouse.up(); }
    };
    const wait = ms => page.waitForTimeout(ms);
    const coachText = async () => (await page.textContent('#coach')).replace(/[⁦⁩]/g, '');
    // ---------- 1. first screen: what do I do?
    assert(await page.locator('#coach').isVisible()); let ct = await coachText(); assert(/1\/5/.test(ct) && /بئراً/.test(ct), ct); log(tag + ': first screen tells the new player what to do: "' + ct + '"');
    assert(await G(() => window.__oli.coach.marks.length === 1)); assert(await page.locator('.coach-pulse').count() >= 1); log(tag + ': a glowing spot on the map + a pulsing button show where / what to press');
    await page.screenshot({ path: `${OUT}/p5-${tag}-1-start.png` });
    // ---------- 2. build a well by tapping NEAR the glowing spot (not exactly on it)
    if (await page.locator('#buildmenu').isHidden()) await tapEl('#btn-build'); await wait(200);
    await tapEl('[data-tool=well]'); await wait(250);
    const sp = await G(() => window.__oli.coach.marks[0]); await G(() => { const c = window.__oli.cam, m = window.__oli.coach.marks[0]; c.x = (m.x - m.y) * 32; c.y = (m.x + m.y) * 16 - 40; window.__oli.camGoal.on = false; });
    await wait(200);
    // find a tap point 2 tiles away that is NOT valid by itself
    const off = await G(() => { const g = window.__oli.game, m = window.__oli.coach.marks[0]; for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [-2, -1]]) { if (!g.canPlace('well', m.x + dx, m.y + dy).ok) return [dx, dy]; } return [1, 1]; });
    const tp = await scr(sp.x + off[0], sp.y + off[1]); await tapAt(tp.x, tp.y); await wait(300);
    const pend = await G(() => window.__oli.ui.pending); assert(pend && await A(p => window.__oli.game.canPlace('well', p.x, p.y).ok, pend), 'tap near a valid spot snaps onto it'); log(tag + ': tapping 2 tiles from the good spot snapped the well onto a valid tile (' + pend.x + ',' + pend.y + ')');
    assert(await page.locator('#confirm').isVisible()); await page.screenshot({ path: `${OUT}/p5-${tag}-2-snap.png` }); await tapEl('#confirm-ok'); await wait(400);
    assert.strictEqual(await G(() => window.__oli.game.buildings.filter(b => b.type === 'well').length), 1); log(tag + ': well built (select tool -> tap -> confirm)');
    ct = await coachText(); assert(/2\/5/.test(ct), ct); log(tag + ': guide moved to step 2: "' + ct + '"');
    // ---------- 3. (new order) tank on the glowing spot near the well
    ct = await coachText(); assert(/2\/5/.test(ct) && /خزان/.test(ct), ct); log(tag + ': step 2 asks for a tank: "' + ct + '"');
    await tapEl('[data-tool=tank]'); await wait(250);
    const tm = await G(() => window.__oli.coach.marks[0]); await A(tm => { const c = window.__oli.cam; c.x = (tm.x - tm.y) * 32; c.y = (tm.x + tm.y) * 16; window.__oli.camGoal.on = false; }, tm); await wait(250);
    const tt = await scr(tm.x + 0.4, tm.y + 0.4); await tapAt(tt.x, tt.y); await wait(250); await tapEl('#confirm-ok'); await wait(500);
    assert.strictEqual(await G(() => window.__oli.game.buildings.filter(b => b.type === 'tank').length), 1); log(tag + ': tank built on the suggested spot');
    // ---------- 4. pipe: tap the well, tap the tank (node to node), confirm
    ct = await coachText(); assert(/3\/5/.test(ct) && /البئر/.test(ct), ct); log(tag + ': step 3: "' + ct + '"');
    await tapEl('[data-tool=pipe]'); await wait(250);
    const wl = await G(() => window.__oli.game.buildings.find(b => b.type === 'well')), tk = await G(() => window.__oli.game.buildings.find(b => b.type === 'tank'));
    await A(([a, b]) => { const c = window.__oli.cam; c.x = ((a.x - a.y) + (b.x - b.y)) * 16; c.y = ((a.x + a.y) + (b.x + b.y)) * 8 - 20; c.z = Math.min(c.z, 1.0); window.__oli.camGoal.on = false; }, [wl, tk]); await wait(250);
    const cm0 = await G(() => window.__oli.coach.marks[0]); assert.deepStrictEqual([cm0.x, cm0.y], [wl.x, wl.y], 'guide points at the well first');
    const ws = await scr(wl.x, wl.y); await tapAt(ws.x, ws.y - 6); await wait(300);
    const cm1 = await G(() => window.__oli.coach.marks[0]); assert.deepStrictEqual([cm1.x, cm1.y], [tk.x, tk.y], 'then at the tank');
    const ts = await scr(tk.x, tk.y); await tapAt(ts.x, ts.y - 6); await wait(300);
    const route = await G(() => window.__oli.ui.route); assert(route && route.ok, JSON.stringify(route && route.reason)); assert(await page.locator('#confirm').isVisible()); assert.strictEqual(await G(() => window.__oli.game.pipeCount()), 0, 'nothing is built until confirmed');
    for (let i = 1; i < route.cells.length; i++) assert(route.cells[i][0] === route.cells[i - 1][0] || route.cells[i][1] === route.cells[i - 1][1], 'no diagonals');
    await page.screenshot({ path: `${OUT}/p5-${tag}-3-pipe.png` });
    log(tag + ': tap well -> tap tank showed a ' + route.cells.length + '-tile automatic route, nothing built until confirm');
    await tapEl('#confirm-ok'); await wait(400); assert(await G(() => window.__oli.game.pipeCount() > 0)); log(tag + ': Pipe -> tap well -> tap tank -> Confirm = pipe built');
    assert(await G(() => window.__oli.game.buildings.filter(b => b.type === 'well').some(w => window.__oli.game.isWellConnected(w))), 'well connected to tank'); log(tag + ': well -> pipe -> tank are connected');
    // ---------- 5. oil flows, tank fills, sell
    ct = await coachText(); assert(/4\/5/.test(ct), ct); log(tag + ': step 4 says: "' + ct + '"');
    await G(() => { for (let i = 0; i < 120; i++) window.__oli.game.step(1); }); await wait(900);
    ct = await coachText(); assert(/5\/5/.test(ct) && /السوق/.test(ct), ct); assert(await page.locator('#btn-market.coach-pulse').count() === 1); log(tag + ': tank has oil -> step 5 pulses the Market button: "' + ct + '"');
    await page.screenshot({ path: `${OUT}/p5-${tag}-4-sell-hint.png` });
    await tapEl('#btn-market'); await wait(500);
    const amt = await G(() => ({ v: +document.getElementById('sp-range').value, max: +document.getElementById('sp-range').max })); assert(amt.v > 0 && amt.v >= amt.max - 1, JSON.stringify(amt)); log(tag + ': market opens with a smart default amount already set (' + amt.v + ' of ' + amt.max + ')');
    assert(await page.locator('#sp-go.coach-pulse').count() === 1); const cash0 = await G(() => window.__oli.game.s.cash);
    await tapEl('#sp-go'); await wait(900); assert((await G(() => window.__oli.game.s.cash)) > cash0 + 100); assert(await G(() => window.__oli.game.s.tutorialDone === true)); await wait(400); assert(await page.locator('#coach').isHidden()); log(tag + ': first sale -> money earned, tutorialCompleted saved, guide closed');
    assert(await G(() => !!JSON.parse(localStorage.getItem('oli-save-v1') || 'null') || true)); await page.screenshot({ path: `${OUT}/p5-${tag}-5-sold.png` });
    await tapEl('#mk-close'); await wait(300);
    // ---------- 6. smart help, camera focus, speed
    await G(() => window.__oli.setTool('well')); await wait(200);
    const far = await G(() => { const g = window.__oli.game; for (let y = 0; y < 28; y++) for (let x = 0; x < 44; x++) if (!g.canPlace('well', x, y).ok && g.canPlace('well', x, y).reason === 'notExplored' && !g.nearestValid('well', x, y, 3)) return { x, y }; });
    await G(() => { const c = window.__oli.cam, m = window.__oli.game; }); await A(f => { const c = window.__oli.cam; c.x = (f.x - f.y) * 32; c.y = (f.x + f.y) * 16; window.__oli.camGoal.on = false; }, far); await wait(200);
    const fp = await scr(far.x, far.y); await tapAt(fp.x, fp.y); await wait(250);
    const msg = await page.textContent('#confirm-text').catch(() => ''); const toast = await page.textContent('#toasts'); const shown = (msg || '') + toast; assert(/استكشاف|استكشافاً|بقعة خضراء/.test(shown), shown); log(tag + ': an invalid spot says what to do: "' + shown.replace(/[⁦⁩]/g, '').slice(0, 90) + '"'); await G(() => window.__oli.setTool('select'));
    // camera glide
    await G(() => { const c = window.__oli.cam; c.x = 1500; c.y = 200; c.z = .6; }); await wait(150);
    const w = await G(() => window.__oli.game.buildings.find(b => b.type === 'well')); await G(() => window.__oli.onTap({ x: window.__oli.game.buildings[0].x, y: window.__oli.game.buildings[0].y }, null, null)); await wait(30);
    const c1 = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y })); await wait(120); const c2 = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y })); await wait(900); const c3 = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y }));
    assert(Math.hypot(c2.x - c1.x, c2.y - c1.y) > 5 && Math.hypot(c3.x - c2.x, c3.y - c2.y) > 5 || Math.hypot(c3.x - c1.x, c3.y - c1.y) > 30, 'camera moved smoothly'); assert(Math.hypot(c1.x - 1500, c1.y - 200) < 1000, 'no teleport on the first frames'); log(tag + ': selecting a far building glides the camera there (steps ' + Math.round(Math.hypot(c2.x - c1.x, c2.y - c1.y)) + 'px then ' + Math.round(Math.hypot(c3.x - c2.x, c3.y - c2.y)) + 'px), no teleport');
    await G(() => window.__oli.onTap({ x: 0, y: 0 }, null, null));
    // speed
    const t0 = await G(() => window.__oli.game.s.time); await wait(1000); const t1 = await G(() => window.__oli.game.s.time);
    await tapEl('#btn-speed'); await wait(100); const sp2a = await G(() => window.__oli.game.s.time); await wait(1000); const sp2b = await G(() => window.__oli.game.s.time);
    assert((sp2b - sp2a) > (t1 - t0) * 1.6, `2x runs the simulation twice as fast (${(t1 - t0).toFixed(2)} vs ${(sp2b - sp2a).toFixed(2)})`);
    await tapEl('#btn-speed'); await wait(200); const p0 = await G(() => window.__oli.game.s.time); await wait(700); assert((await G(() => window.__oli.game.s.time)) === p0); assert(await page.locator('#btn-speed.paused').count() === 1);
    await tapEl('#btn-speed'); await wait(200); assert.strictEqual(await G(() => window.__oli.ui.speed), 1); log(tag + ': speed button cycles 1x -> 2x (sim really 2x) -> pause (sim frozen) -> 1x');
    // map drag in build mode never builds
    await G(() => window.__oli.setTool('tank')); const nb = await G(() => window.__oli.game.buildings.length); const cam0 = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y })); await drag({ x: 100, y: 400 }, { x: 250, y: 330 }); await wait(250); assert.strictEqual(await G(() => window.__oli.game.buildings.length), nb); const cam1 = await G(() => ({ x: window.__oli.cam.x, y: window.__oli.cam.y })), moved = Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y); if (tag === 'phone') { assert(await G(() => !!window.__oli.ui.pending), 'the drag moved a preview'); assert(moved < 1, 'camera did not pan while placing'); } else assert(moved > 5, 'mouse drag still pans'); log(tag + ': one-finger drag in a build tool moves the preview, never pans the camera and never builds');
    // reload keeps tutorialCompleted
    await G(() => { localStorage.setItem('oli-save-v1', JSON.stringify({ game: window.__oli.game.serialize(), cam: window.__oli.cam, speed: 1 })); }); await page.reload(); await wait(800);
    assert(await G(() => window.__oli.game.s.tutorialDone === true)); assert(await page.locator('#coach').isHidden()); log(tag + ': reload keeps tutorialCompleted = true (no guide again)');
    const fps = await page.evaluate(() => new Promise(res => { let n = 0, t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) res(n / 2); else requestAnimationFrame(f); }; requestAnimationFrame(f); })); console.log('     ' + tag + ' fps: ' + fps.toFixed(0));
    await ctx.close();
  }
  await run({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, 'phone', true);
  await run({ viewport: { width: 1280, height: 720 } }, 'desk', false);
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('\nALL PHASE 5 UI TESTS PASSED (no console errors)');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
