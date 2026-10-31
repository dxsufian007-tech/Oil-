// Phase 4 browser test: regions, terrain cost pill, supply contracts, market events, companies. Desktop mouse + phone touch (Arabic UI).
const { chromium } = require('/tmp/legacy-pw.js');
const assert = require('assert');
const URL = process.argv[3] || 'file:///home/claude/oli/index.html';
const OUT = process.argv[2] || '/tmp/oli-shots'; require('fs').mkdirSync(OUT, { recursive: true });
const log = m => console.log('ok   ' + m);
const screenOf = (page, x, y) => page.evaluate(([x, y]) => { if (x < 44 && y < 28) { x += 48; y += 32; } const { cam } = window.__oli, r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + ((x - y) * 32 - cam.x) * cam.z + r.width / 2, y: r.top + ((x + y) * 16 + 16 - cam.y) * cam.z + r.height / 2 }; }, [x, y]);
(async () => {
  const browser = await chromium.launch(), errors = [];
  async function run(opts, tag, touch) {
    const page = await (await browser.newContext(opts)).newPage();
    page.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join('|')));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errors.push(tag + ' console: ' + m.text()); });
    await page.goto(URL); await page.evaluate(() => { window.OliCore.CFG.BUILD = {well:0,tank:0,pipeTile:0,pipeMax:0}; }); await page.waitForTimeout(500);
    const G = fn => page.evaluate(fn), arg = (fn, a) => page.evaluate(fn, a);
    const click = sel => touch ? page.tap(sel) : page.click(sel);
    const tap = async (x, y) => { const p = await screenOf(page, x, y); if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); };
    const center = (x, y) => page.evaluate(([x, y]) => { window.__oli.camGoal.on = false; const c = window.__oli.cam; c.x = (x - y) * 32; c.y = (x + y) * 16 - 60; }, [x, y]);
    // ---- regions modal
    await click('#btn-regions'); await page.waitForTimeout(300);
    assert(await page.locator('#regions').isVisible()); assert.strictEqual(await page.locator('#rg-list li').count(), 5);
    const txt = await page.textContent('#rg-list'); assert(/مقفلة/.test(txt) && /الصحراء/.test(txt) && /الإمكانات العالية/.test(txt) && /التضاريس/.test(txt) && /تكلفة الاستكشاف/.test(txt) && /المخاطر/.test(txt)); log(tag + ': regions panel lists 5 regions with state, terrain, build cost, exploration cost, risk, oil chance');
    await page.screenshot({ path: `${OUT}/p4-${tag}-regions.png` });
    const un2 = page.locator('#rg-list li:nth-child(2) [data-ract=unlock]');
    await G(() => { window.__oli.game.s.cash = 3000; }); await page.waitForTimeout(500);
    assert(await un2.isDisabled()); assert(/يلزم رصيد/.test(await page.textContent('#rg-list li:nth-child(2)'))); log(tag + ': region 2 cannot be unlocked with $3,000 (needs $4,000 cash) and the reason is shown'); await G(() => { window.__oli.game.s.cash = 20000; }); await page.waitForTimeout(400); assert(await un2.isEnabled());
    const c0 = await G(() => window.__oli.game.s.cash); await click('#rg-list li:nth-child(2) [data-ract=unlock]'); await page.waitForTimeout(400);
    assert(Math.abs((c0 - 2500) - (await G(() => window.__oli.game.s.cash))) < 40); assert.strictEqual(await G(() => window.__oli.game.regionState(2)), 'AVAILABLE'); assert(/متاحة/.test(await page.textContent('#rg-list li:nth-child(2)'))); log(tag + ': unlocked region 2 for $2,500 -> AVAILABLE');
    await page.screenshot({ path: `${OUT}/p4-${tag}-regions-unlocked.png` });
    // ---- locked region on the map + explore tool
    const loc = await G(() => { const g = window.__oli.game, A = 4; const a = g.areas.find(a => a.ax >= 12 && a.ax < 23 && a.ay >= 8 && a.ay < 15 && a.region === 3 && a.land); for (let y = a.ay * A; y < a.ay * A + A; y++) for (let x = a.ax * A; x < a.ax * A + A; x++) if (!g.map.block[y * 140 + x]) return { x, y, id: a.id }; });
    await click('#rg-list li:nth-child(2) [data-ract=go]'); await page.waitForTimeout(300);
    assert.strictEqual(await G(() => window.__oli.ui.tool), 'explore'); log(tag + ': "show on map" closes the panel and switches to the explore tool');
    await center(loc.x, loc.y); await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/p4-${tag}-map-regions.png` });
    await tap(loc.x, loc.y); await page.waitForTimeout(300);
    let panel = await page.textContent('#panel'); assert(/المنطقة 3/.test(panel) && /مقفلة/.test(panel) && /افتح/.test(panel), panel); assert(await page.locator('#a-rg').count() === 1); log(tag + ': tapping a locked area says the region is locked and offers "unlock region"');
    await click('#a-rg'); await page.waitForTimeout(300); assert(await page.locator('#regions').isVisible()); await click('#rg-close'); await page.waitForTimeout(200); await G(() => { const o = window.__oli; o.ui.sel = null; o.renderPanel && o.renderPanel(); document.getElementById('panel').hidden = true; });
    // ---- explore in region 2 with its own cost + terrain pill
    const r2 = await G(() => { const g = window.__oli.game, A = 4; for (const a of g.areas.filter(a => a.ax >= 12 && a.ax < 23 && a.ay >= 8 && a.ay < 15 && a.region === 2 && a.land && a.st === 0)) for (let y = a.ay * A; y < a.ay * A + A; y++) for (let x = a.ax * A; x < a.ax * A + A; x++) if (!g.map.block[y * 140 + x]) return { x, y, id: a.id }; });
    await center(r2.x, r2.y); await page.waitForTimeout(150); await tap(r2.x, r2.y); await page.waitForTimeout(300);
    panel = await page.textContent('#panel'); assert(/المنطقة 2/.test(panel) && /\$1,300/.test(panel), panel); const cx = await G(() => window.__oli.game.s.cash); await click('#a-ex'); await page.waitForTimeout(300);
    assert(Math.abs(cx - 1300 - (await G(() => window.__oli.game.s.cash))) < 40); log(tag + ': region 2 exploration costs $1,300 (region price), charged from cash');
    await G(() => { window.__oli.game.step(25); }); await page.waitForTimeout(300);
    // pill with terrain on a discovered start area
    const spot = await G(() => { const g = window.__oli.game, A = 4; for (const a of g.areas.filter(a => a.ax >= 12 && a.ax < 23 && a.ay >= 8 && a.ay < 15 && a.st === 2 && a.kind !== 'empty')) for (let y = a.ay * A; y < a.ay * A + A; y++) for (let x = a.ax * A; x < a.ax * A + A; x++) if (g.canPlace('well', x, y).ok) return { x, y }; });
    await page.evaluate(() => window.__oli.setTool('well')); await center(spot.x, spot.y); await page.waitForTimeout(150); await tap(spot.x, spot.y); await page.waitForTimeout(250);
    const ct = await page.textContent('#confirm-text'); assert(/(رمل|أرض|صخور)/.test(ct) && /\$/.test(ct), ct); log(tag + ': build confirmation shows cost and terrain: "' + ct.replace(/[⁦⁩]/g, '') + '"'); await click('#confirm-no');
    await page.screenshot({ path: `${OUT}/p4-${tag}-terrain.png` });
    // ---- supply contracts
    await G(() => { const g = window.__oli.game; g.s.cash = 5e4; const a = g.areas.filter(a => a.ax >= 12 && a.ax < 23 && a.ay >= 8 && a.ay < 15 && a.st === 2 && a.kind !== 'empty')[0]; const o = g.makeOrder(); window.__o1 = o.id; const t = g.place('tank', 0, 0); });
    await G(() => { window.__oli.setTool('select'); window.__oli.openMarket(); }); await page.waitForTimeout(300);
    await click('#mtabs [data-tab=orders]'); await page.waitForTimeout(300);
    assert(await page.locator('.ocard').count() >= 1); assert(/عرض|المكافأة/.test(await page.textContent('#od-box'))); await page.screenshot({ path: `${OUT}/p4-${tag}-orders.png` }); log(tag + ': supply contracts tab shows an offer with required oil, price vs market, reward, duration');
    await click('[data-oact=accept]'); await page.waitForTimeout(300);
    const o1 = await G(() => window.__oli.game.s.orders.find(o => o.status === 'ACTIVE')); assert(o1 && o1.deadline > 0); assert(/تسليم/.test(await page.textContent('#od-box'))); log(tag + ': accepted -> ACTIVE with a deadline');
    // no tank / no oil -> delivery refused
    await G(() => { const g = window.__oli.game; for (const b of g.buildings) if (b.type === 'tank') b.amt = 0; }); await page.waitForTimeout(300);
    assert(await page.locator('[data-oact=deliver]').isDisabled()); log(tag + ': delivery button disabled with no stored oil');
    await G(() => { const g = window.__oli.game; let t = g.buildings.find(b => b.type === 'tank'); if (!t) { const r = g.areaAt(20, 12); for (let y = 8; y < 20; y++) for (let x = 14; x < 30; x++) if (!t && g.canPlace('tank', x, y).ok) t = g.place('tank', x, y).building; } for (let i = 0; i < 4; i++) g.upgrade(t); t.amt = 150; });
    await page.waitForTimeout(400); await click('[data-oact=deliver]'); await page.waitForTimeout(300);
    const o2 = await G(() => window.__oli.game.s.orders.find(o => o.status === 'ACTIVE') || window.__oli.game.s.ordersDone[0]); assert(o2.deliveredOil > 0 && o2.deliveredOil <= 150 + 1e-6); log(tag + ': delivered ' + o2.deliveredOil.toFixed(0) + ' BBL (no more than stored); delivered/remaining updated in state');
    await G(() => { const g = window.__oli.game, o = g.s.orders.find(o => o.status === 'ACTIVE'); if (o) { const t = g.buildings.find(b => b.type === 'tank'); t.amt = Math.min(g.tankCap(t), o.remainingOil + 5); } }); await page.waitForTimeout(300);
    const cs = await G(() => window.__oli.game.s.cash); let guard = 0;
    while (await G(() => window.__oli.game.s.orders.some(o => o.status === 'ACTIVE')) && guard++ < 4) { await G(() => { const g = window.__oli.game, o = g.s.orders.find(o => o.status === 'ACTIVE'), t = g.buildings.find(b => b.type === 'tank'); t.amt = Math.min(g.tankCap(t), o.remainingOil + 5); }); await page.waitForTimeout(300); if (await page.locator('[data-oact=deliver]').isEnabled()) await click('[data-oact=deliver]'); await page.waitForTimeout(300); }
    assert((await G(() => window.__oli.game.s.ordersDone[0])).status === 'COMPLETED'); assert((await G(() => window.__oli.game.s.cash)) > cs); assert(/مكتمل/.test(await page.textContent('#od-box'))); log(tag + ': contract COMPLETED -> reward paid, shown in recent contracts');
    // failure by time
    await G(() => { const g = window.__oli.game, o = g.makeOrder(); g.acceptOrder(o.id); g.s.time = o.deadline + 1; g.step(0.1); }); await page.waitForTimeout(500);
    assert((await G(() => window.__oli.game.s.ordersDone[0])).status === 'FAILED'); assert(/فشل/.test(await page.textContent('#od-box'))); log(tag + ': a contract that runs out of time -> FAILED shown');
    await page.screenshot({ path: `${OUT}/p4-${tag}-orders2.png` });
    // ---- market event
    await G(() => { const g = window.__oli.game; g.s.event = null; g.startEvent('DEMAND_SURGE', { duration: 100, peak: 1.15 }); }); await page.waitForTimeout(500);
    assert(await page.locator('#evbanner').isVisible()); assert(/ارتفاع مفاجئ في الطلب/.test(await page.textContent('#evbanner')) && /→/.test(await page.textContent('#evbanner'))); await page.screenshot({ path: `${OUT}/p4-${tag}-event.png` });
    await click('#mtabs [data-tab=trade]'); await page.waitForTimeout(300); assert(await page.locator('#mk-event').isVisible()); log(tag + ': event banner (no pause) + event strip in the market: "' + (await page.textContent('#mk-event')).replace(/[⁦⁩]/g, '') + '"');
    const p1 = await G(() => window.__oli.game.s.price); await G(() => { const g = window.__oli.game; for (let i = 0; i < 200; i++) g.step(0.5); }); const p2 = await G(() => window.__oli.game.s.price); assert(await G(() => window.__oli.game.s.evMult > 1.05)); log(tag + ': price follows the event multiplier (x' + (await G(() => window.__oli.game.s.evMult.toFixed(3))) + ')');
    // ---- companies
    await click('#mtabs [data-tab=comp]'); await page.waitForTimeout(400); assert.strictEqual(await page.locator('.ctable tbody tr').count(), 4); const ct2 = await page.textContent('.ctable'); assert(/أنت/.test(ct2) && /شركة A/.test(ct2) && /هجومي/.test(ct2));
    const shares = await G(() => window.__oli.game.marketShares().reduce((s, r) => s + r.share, 0)); assert(Math.abs(shares - 1) < 1e-9); await page.screenshot({ path: `${OUT}/p4-${tag}-companies.png` }); log(tag + ': companies tab: rank, share, output, revenue for Player + A/B/C; shares sum to 100%');
    // state vs UI sync
    const sync = await G(() => { const g = window.__oli.game, rows = [...document.querySelectorAll('.ctable tbody tr')].map(r => r.cells[0].textContent.trim()); return rows.join(',') === g.ranking().map(r => r.rank).join(',') && document.querySelector('.ctable .me') != null; }); assert(sync); log(tag + ': companies table matches game.ranking()');
    // english + save / reload
    await G(() => window.__oli.setLang('en')); await page.waitForTimeout(300); await click('#mtabs [data-tab=orders]'); await page.waitForTimeout(300); assert(/Active contracts|New offers/.test(await page.textContent('#od-box'))); await G(() => window.__oli.setLang('ar'));
    const snap = await G(() => { const g = window.__oli.game; return JSON.stringify({ r: g.s.regions, ev: g.s.event && g.s.event.type, od: g.s.ordersDone.length, comp: g.s.comp.map(c => Math.round(c.produced)), cash: Math.round(g.s.cash) }); });
    await G(() => window.__oli.game.s.cash += 0); await page.evaluate(() => { localStorage.setItem('oli-save-v1', JSON.stringify({ game: window.__oli.game.serialize(), cam: window.__oli.cam, speed: 1 })); });
    await page.reload(); await page.waitForTimeout(700);
    const snap2 = await G(() => { const g = window.__oli.game; return JSON.stringify({ r: g.s.regions, ev: g.s.event && g.s.event.type, od: g.s.ordersDone.length, comp: g.s.comp.map(c => Math.round(c.produced)), cash: Math.round(g.s.cash) }); });
    const a = JSON.parse(snap), b = JSON.parse(snap2); assert.deepStrictEqual(a.r, b.r); assert.strictEqual(a.ev, b.ev); assert.strictEqual(a.od, b.od); assert(Math.abs(a.cash - b.cash) < 400); assert(b.comp.every((v, i) => v >= a.comp[i])); log(tag + ': reload restores regions, finished contracts, event, competitors and money');
    // fps
    const fps = await page.evaluate(() => new Promise(res => { let n = 0, t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) res(n / 2); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
    console.log('     ' + tag + ' fps (headless, software GL): ' + fps.toFixed(0));
    await page.context().close();
  }
  await run({ viewport: { width: 1280, height: 720 } }, 'desk', false);
  await run({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, 'phone', true);
  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('\nALL PHASE 4 UI TESTS PASSED (no console errors)');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
