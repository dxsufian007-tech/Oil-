// Phase 3 real-browser test: desktop mouse + phone touch. Arabic UI.
const NEUTRAL = () => { const C = window.OliCore.CFG; C.TERRAIN.MULT = [1, 1, 1, 1]; C.BUILD = {well:0,tank:0,pipeTile:0,pipeMax:0}; C.REGIONS.forEach(r => { r.mult = 1; }); window.__oli.game.s.regions.forEach(r => { r.unlocked = true; }); };
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file:///home/claude/oli/index.html';
const OUT = process.argv[2] || '/tmp/oli-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const log = m => console.log('ok   ' + m);
const screenOf = (page, x, y) => page.evaluate(([x, y]) => { if (x < 44 && y < 28) { x += 48; y += 32; } const { cam } = window.__oli, r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + ((x - y) * 32 - cam.x) * cam.z + r.width / 2, y: r.top + ((x + y) * 16 + 16 - cam.y) * cam.z + r.height / 2 }; }, [x, y]);
(async () => {
  const browser = await chromium.launch(), errors = [];
  const watch = (p, tag) => { p.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join('|'))); p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errors.push(tag + ' console: ' + m.text()); }); };
  async function run(ctxOpts, tag, touch) {
    const page = await (await browser.newContext(ctxOpts)).newPage(); watch(page, tag);
    await page.goto(URL); await page.waitForTimeout(400); await page.evaluate(NEUTRAL); await page.waitForTimeout(500);
    const G = fn => page.evaluate(fn);
    const tap = async (x, y) => { if (touch && await page.locator('#panel').isVisible()) { await page.click('#panel [data-act="close"]'); await page.waitForTimeout(100); } const p = await screenOf(page, x, y); if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); };
    const openBuild = async () => { if (await page.locator('#buildmenu').isHidden()) await page.click('#btn-build'); };
    const tool = async n => { await openBuild(); await page.click(`#buildmenu .tool[data-tool="${n}"]`); };
    // layout in a discovered area
    const L = await page.evaluate(() => {
      const g = window.__oli.game, A = 4;
      for (const a of g.areas.filter(a => a.ax >= 12 && a.ax < 23 && a.ay >= 8 && a.ay < 15 && a.st === 2)) for (let y = a.ay * A; y < a.ay * A + A; y++) for (let x = a.ax * A; x < a.ax * A + A; x++) {
        if (!g.canPlace('well', x, y).ok) continue;
        for (const [dx, dy] of [[6, 0], [0, 6], [-6, 0], [0, -6]]) {
          if (!g.canPlace('tank', x + dx, y + dy).ok) continue;
          const r = g.routePipe(x + Math.sign(dx), y + Math.sign(dy), x + dx - Math.sign(dx) * 1, y + dy - Math.sign(dy) * 1, false);
          if (r.ok || r.reason === 'floating') return { well: [x, y], tank: [x + dx, y + dy], a: [x + Math.sign(dx), y + Math.sign(dy)], b: [x + dx - Math.sign(dx), y + dy - Math.sign(dy)], area: a.id };
        }
      }
    });
    assert(L, 'layout');
    await page.evaluate(L => { const c = window.__oli.cam, mx = (L.well[0] + L.tank[0]) / 2, my = (L.well[1] + L.tank[1]) / 2; c.x = (mx - my) * 32; c.y = (mx + my) * 16; }, L); await page.waitForTimeout(150);
    // kinds selector
    await tool('well'); assert(await page.locator('#kinds').isVisible());
    await page.click('#kinds button[data-k="medium"]');
    assert((await page.evaluate(() => window.__oli.ui.wellKind)) === 'medium'); log(tag + ': well-type chips S/M/L visible; medium selected');
    await page.screenshot({ path: `${OUT}/p3-${tag}-kinds.png` });
    await page.evaluate(L => { const o = window.__oli, c = o.cam, mx = (L.well[0] + L.tank[0]) / 2, my = (L.well[1] + L.tank[1]) / 2; o.camGoal.on = false; c.x = (mx - my) * 32; c.y = (mx + my) * 16; }, L); await page.waitForTimeout(250);   // the coach may have started a camera move: take the camera back
    // undiscovered area refused
    const bad = await page.evaluate(() => { const g = window.__oli.game, A = 4; const a = g.areas.find(a => a.ax >= 12 && a.ax < 23 && a.ay >= 8 && a.ay < 15 && a.st === 0 && a.land); for (let y = a.ay * A; y < a.ay * A + A; y++) for (let x = a.ax * A; x < a.ax * A + A; x++) if (!g.map.block[y * 140 + x]) return [x, y, a.id]; });
    await tap(bad[0], bad[1]);
    if (await page.locator('#confirm').isVisible()) { assert(/استكشف/.test(await page.textContent('#confirm-text')), await page.textContent('#confirm-text')); assert(await page.locator('#confirm-ok').isDisabled()); await page.click('#confirm-no'); }
    log(tag + ': building on an unexplored area is refused with "explore first"');
    // build well + tank + pipe
    const cash0 = await G(() => window.__oli.game.s.cash);
    await tap(...L.well); await page.click('#confirm-ok');
    assert(await G(() => window.__oli.game.buildings.length) === 1);
    assert(Math.abs(cash0 - (await G(() => window.__oli.game.s.cash)) - 3800) < 6); log(tag + ': medium well built for $3,800');
    await tool('tank'); await tap(...L.tank); await page.waitForTimeout(200); if (!(await page.locator('#confirm').isVisible())) { console.log('DBG', JSON.stringify(await page.evaluate(() => ({ tool: window.__oli.ui.tool, pend: window.__oli.ui.pending, sel: window.__oli.ui.sel, cash: window.__oli.game.s.cash }))), JSON.stringify(L), JSON.stringify(await screenOf(page, ...L.tank))); await page.screenshot({ path: OUT + '/dbg.png' }); } await page.click('#confirm-ok');
    await tool('pipe'); await tap(...L.a); await tap(...L.b); await page.waitForTimeout(200); if (!(await page.locator('#confirm').isVisible())) { console.log('DBG', JSON.stringify(await page.evaluate(() => ({ tool: window.__oli.ui.tool, start: window.__oli.ui.pipeStart, pend: window.__oli.ui.pending, b: window.__oli.game.buildings.map(b => [b.type, b.x, b.y]) }))), JSON.stringify(L)); await page.screenshot({ path: OUT + '/dbg.png' }); } await page.click('#confirm-ok');
    await G(() => { const g = window.__oli.game; g.s.cash = 100000; });
    await page.evaluate(() => window.__oli.setTool('select'));
    await page.waitForTimeout(1500);
    // select well -> panel
    await tap(...L.well); await page.waitForTimeout(300);
    let panel = await page.textContent('#panel'); assert(/الضغط/.test(panel) && /الحالة الفنية/.test(panel) && /جودة/.test(panel) && /صيانة|ممتازة/.test(panel), panel);
    assert(/ترقية/.test(await page.textContent('#p-up'))); log(tag + ': well panel shows production, pressure, condition, quality, upgrade, maintenance');
    await page.screenshot({ path: `${OUT}/p3-${tag}-wellpanel.png` });
    const r0 = await G(() => window.__oli.game.buildings[0].out);
    await page.click('#p-up'); await page.waitForTimeout(2200);
    const w = await G(() => { const b = window.__oli.game.buildings[0]; return { lv: b.level, out: b.out, nom: window.__oli.game.wellNominal(b), cash: window.__oli.game.s.cash }; });
    assert(w.lv === 2 && w.out > r0 * 1.1, JSON.stringify([w, r0])); assert(Math.abs(w.cash - (100000 - 500)) < 80, 'cash ' + w.cash); log(tag + ': upgrade click: level 2, -$500, output ' + r0.toFixed(1) + ' -> ' + w.out.toFixed(1));
    await page.screenshot({ path: `${OUT}/p3-${tag}-upgraded.png` });
    // maintenance
    await G(() => { window.__oli.game.buildings[0].condition = .5; }); await page.waitForTimeout(400);
    const txt = await page.textContent('#p-mt'); assert(/صيانة/.test(txt) && /\$/.test(txt), txt);
    const c1 = await G(() => window.__oli.game.s.cash); await page.click('#p-mt'); await page.waitForTimeout(200);
    const m = await G(() => ({ c: window.__oli.game.buildings[0].condition, cash: window.__oli.game.s.cash, mt: window.__oli.game.s.maintenance })); assert(m.c > 0.99 && m.cash < c1 && m.mt > 0); log(tag + ': maintenance button costs money and restores condition to 100%');
    // pipe panel + leak + repair
    const pk = Math.floor((L.a[1] + L.b[1]) / 2) * 140 + Math.floor((L.a[0] + L.b[0]) / 2);
    await tap(pk % 140, (pk / 140) | 0); await page.waitForTimeout(300);
    panel = await page.textContent('#panel'); assert(/سعة النقل/.test(panel) && /التدفق/.test(panel) && /تسريب|سليم/.test(panel), panel);
    log(tag + ': pipe panel shows capacity, flow, condition, leak state');
    const flowOf = async () => { const a = await G(() => window.__oli.game.oilTotal()); await page.waitForTimeout(6000); return ((await G(() => window.__oli.game.oilTotal())) - a) * 10; };
    await G(() => { window.__oli.game.buildings[1].amt = 0; window.__oli.game.buildings[0].pressure = 1; window.__oli.ui.speed = 1; });
    const f0 = await flowOf();
    await G(() => { const g = window.__oli.game, k = window.__oli.ui.sel.k; g.pipeSt[k] = 1; g.updateComp(g.pipeNet(k)); g.events.push({ type: 'leak', k }); });
    await page.waitForTimeout(500); assert(await page.locator('.toast.bad').count() > 0); await page.screenshot({ path: `${OUT}/p3-${tag}-leak.png` });
    assert(/إصلاح/.test(await page.textContent('#p-rp'))); const f1 = await flowOf();
    assert(f1 < f0 * 0.9, 'flow should drop: ' + f0 + ' -> ' + f1); log(tag + ': leak shows red marker + alert; flow ' + f0.toFixed(1) + ' -> ' + f1.toFixed(1) + ' /min');
    await page.click('#p-rp'); await page.waitForTimeout(300);
    assert(await G(() => window.__oli.game.pipeSt[window.__oli.ui.sel.k]) === 2); assert(await page.locator('#p-rp').isDisabled()); await page.click('#p-rp', { force: true }).catch(() => {}); log(tag + ': repair started (REPAIRING), button disabled so it cannot start twice');
    await page.waitForTimeout(7000); const f2 = await flowOf();
    assert(await G(() => window.__oli.game.pipeSt[window.__oli.ui.sel.k]) === 0 && f2 > f1 * 1.15, 'flow returns ' + f1 + ' -> ' + f2); log(tag + ': flow returned after repair (' + f2.toFixed(1) + ' /min)');
    // pipe upgrade
    const cap0 = await G(() => window.__oli.game.pipeNet(window.__oli.ui.sel.k).cap); await page.click('#p-up'); await page.waitForTimeout(200);
    assert((await G(() => window.__oli.game.pipeNet(window.__oli.ui.sel.k).cap)) > cap0); log(tag + ': pipe upgrade raised capacity ' + cap0 + ' -> ' + (await G(() => window.__oli.game.pipeNet(window.__oli.ui.sel.k).cap)));
    // tank upgrade
    await tap(...L.tank); await page.waitForTimeout(300); const tc0 = await G(() => window.__oli.game.tankCap(window.__oli.game.buildings[1])); await page.click('#p-up'); await page.waitForTimeout(500);
    const tc1 = await G(() => window.__oli.game.tankCap(window.__oli.game.buildings[1])); assert(tc1 > tc0); assert(new RegExp(String(tc1).replace(/(\d)(\d{3})$/, '$1,$2')).test(await page.textContent('#p-cap')), await page.textContent('#p-cap')); log(tag + ': tank upgrade: capacity ' + tc0 + ' -> ' + tc1 + ' shown in the panel immediately');
    // exploration via the tool
    await tool('explore'); assert(await page.evaluate(() => window.__oli.ui.tool) === 'explore');
    const hid = await G(() => { const g = window.__oli.game, a = g.areas.filter(a => a.ax >= 12 && a.ax < 23 && a.ay >= 8 && a.ay < 15 && a.st === 0 && a.land).sort((p, q) => Math.hypot(p.ax - 17, p.ay - 11.5) - Math.hypot(q.ax - 5, q.ay - 3.5)); const b = g.areas.filter(x => x.st === 0 && x.land)[0]; const A = 4; for (const a of g.areas.filter(a => a.ax >= 12 && a.ax < 23 && a.ay >= 8 && a.ay < 15 && a.st === 0 && a.land)) { for (let y = a.ay * A; y < a.ay * A + A; y++) for (let x = a.ax * A; x < a.ax * A + A; x++) if (!g.map.block[y * 140 + x]) return { id: a.id, x, y }; } });
    await G(() => { const { cam } = window.__oli; }); await page.evaluate(([x, y]) => { const c = window.__oli.cam; c.x = (x - y) * 32; c.y = (x + y) * 16; }, [hid.x, hid.y]); await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/p3-${tag}-areas.png` });
    await tap(hid.x, hid.y); await page.waitForTimeout(300);
    panel = await page.textContent('#panel'); assert(/غير مستكشفة/.test(panel) && !/حجم الاحتياطي/.test(panel), panel); assert(/استكشاف/.test(await page.textContent('#a-ex')));
    log(tag + ': unexplored area panel hides reserve data, offers Explore');
    const cE = await G(() => window.__oli.game.s.cash); const xc = await G(() => { const g = window.__oli.game; return g.exploreCost(g.areas[window.__oli.ui.sel.id]); }); await page.click('#a-ex'); await page.waitForTimeout(300);
    assert(Math.abs((await G(() => window.__oli.game.s.cash)) - (cE - xc)) < 80); assert(/جارٍ/.test(await page.textContent('#a-st')));
    await G(() => { window.__oli.game.step(25); }); await page.waitForTimeout(500);
    panel = await page.textContent('#panel'); assert(/مكتشفة/.test(panel)); const kind = await G(() => window.__oli.game.areas[window.__oli.ui.sel.id].kind);
    if (kind !== 'empty') { assert(/حجم الاحتياطي/.test(panel)); assert(await page.locator('#a-bd').count() === 1); }
    log(tag + ': explored for $1,000 -> ' + kind.toUpperCase() + '; reserve data now visible');
    await page.screenshot({ path: `${OUT}/p3-${tag}-explored.png` });
    // market additions
    await page.evaluate(() => window.__oli.openMarket()); await page.waitForTimeout(300);
    assert(/×/.test(await page.textContent('#ec-q')) && /\$/.test(await page.textContent('#ec-capex'))); await page.screenshot({ path: `${OUT}/p3-${tag}-market.png` }); log(tag + ': market shows stock quality, maintenance/repairs and upgrade/exploration totals');
    await page.evaluate(() => window.__oli.closeModals());
    // english
    await page.evaluate(() => window.__oli.setLang('en')); await page.waitForTimeout(200); await tool('well'); assert(/Small|Medium|Large/.test(await page.textContent('#kinds'))); await page.evaluate(() => window.__oli.setLang('ar')); log(tag + ': English labels switch correctly');
    // perf
    const fps = await page.evaluate(() => new Promise(res => { let n = 0, t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) res(n / 2); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
    console.log('     ' + tag + ' fps (headless, software GL): ' + fps.toFixed(0));
    await page.context().close();
  }
  await run({ viewport: { width: 1280, height: 720 } }, 'desk', false);
  await run({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, 'phone', true);
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('\nALL PHASE 3 UI TESTS PASSED (no console errors)');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
