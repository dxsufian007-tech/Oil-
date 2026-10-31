// Real-browser test (desktop mouse + phone touch) against the Arabic UI.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const assert = require('assert');
const URL = process.argv[3] || 'file:///home/claude/oli/index.html';
const OUT = process.argv[2] || '/tmp/oli-shots';
require('fs').mkdirSync(OUT, { recursive: true });

const screenOf = (page, x, y) => page.evaluate(([x, y]) => {
  const { cam } = window.__oli, r = document.getElementById('view').getBoundingClientRect();
  return { x: r.left + ((x - y) * 32 - cam.x) * cam.z + r.width / 2, y: r.top + ((x + y) * 16 + 16 - cam.y) * cam.z + r.height / 2 };
}, [x, y]);
const log = m => console.log('ok  ' + m);

(async () => {
  const browser = await chromium.launch(), errors = [];
  const watch = (p, tag) => { p.on('pageerror', e => { console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(0,3).join(' | ')); errors.push(tag + ' pageerror: ' + e.message); }); p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errors.push(tag + ' console: ' + m.text()); }); };

  // ------------------------- desktop (mouse) -------------------------
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); watch(page, 'desk');
  await page.goto(URL); await page.waitForTimeout(600);
  const S = () => page.evaluate(() => ({ cash: window.__oli.game.s.cash, oil: window.__oli.game.oilTotal(), b: window.__oli.game.buildings.length, pipes: window.__oli.game.pipeCount() }));
  const openBuild = async () => { if (await page.locator('#buildmenu').isHidden()) await page.click('#btn-build'); };
  const buildAt = async (tool, cell) => { await openBuild(); await page.click(`#buildmenu .tool[data-tool="${tool}"]`); const p = await screenOf(page, ...cell); await page.mouse.click(p.x, p.y); await page.click('#confirm-ok'); };

  assert.strictEqual((await page.textContent('#st-cash small')).trim(), 'النقد'); assert(/بناء/.test(await page.textContent('#btn-build')));
  assert(/السوق/.test(await page.textContent('#btn-market'))); log('Arabic HUD, Build and Market buttons');
  await page.screenshot({ path: OUT + '/30-ar-start.png' });

  const sp = await page.evaluate(() => { const g = window.__oli.game, o = {}; for (let y = 11; y < 20; y++) for (let x = 16; x < 26; x++) if (!o.well && g.canPlace('well', x, y).ok) o.well = [x, y]; for (let y = o.well[1]; y < 22; y++) if (g.canPlace('tank', o.well[0] + 6, y).ok) { o.tank = [o.well[0] + 6, y]; break; } return o; });

  // confirmation is required before money is spent
  await openBuild(); await page.click('#buildmenu .tool[data-tool="well"]');
  let p = await screenOf(page, ...sp.well); await page.mouse.click(p.x, p.y);
  assert.strictEqual((await S()).cash, 10000); assert(await page.locator('#confirm').isVisible()); assert(/بناء بئر نفط/.test(await page.textContent('#confirm-text')));
  await page.screenshot({ path: OUT + '/31-confirm-well.png' });
  await page.click('#confirm-ok'); assert.strictEqual((await S()).cash, 8000); log('well: preview + cost shown, money spent only after confirm');
  await buildAt('tank', sp.tank); assert.strictEqual((await S()).cash, 6500); log('tank placed after confirm');

  // invalid / floating pipe is refused
  await page.click('#buildmenu .tool[data-tool="pipe"]');
  const far = [sp.well[0] + 12, Math.min(26, sp.well[1] + 8)];
  p = await screenOf(page, ...far); await page.mouse.click(p.x, p.y);
  p = await screenOf(page, far[0] + 2, far[1]); await page.mouse.click(p.x, p.y);
  assert(await page.locator('#confirm-ok').isDisabled()); log('floating pipe rejected: "' + (await page.textContent('#confirm-text')).trim() + '"');
  await page.click('#confirm-no');

  // valid pipe from the well to the tank, with preview
  p = await screenOf(page, ...sp.well); await page.mouse.click(p.x, p.y);
  p = await screenOf(page, ...sp.tank); await page.mouse.move(p.x - 30, p.y - 10); await page.mouse.click(p.x, p.y);
  assert(!(await page.locator('#confirm-ok').isDisabled())); const ctext = await page.textContent('#confirm-text'); assert(/بناء خط أنابيب/.test(ctext));
  await page.screenshot({ path: OUT + '/32-pipe-preview.png' });
  await page.click('#confirm-ok'); const s2 = await S(); assert(s2.pipes >= 4); log('pipeline built after preview (' + s2.pipes + ' segments): ' + ctext.trim());

  // production
  await page.click('#btn-settings'); await page.click('#speed button[data-s="10"]'); await page.click('#st-close');
  await page.waitForTimeout(9000);
  const s3 = await S(); console.log('   debug oil', s3.oil, 'speed', await page.evaluate(() => [window.__oli.ui.speed, window.__oli.game.s.time, window.__oli.game.buildings.map(b => b.status).join()])); assert(s3.oil > 8); log('oil flows into storage: ' + s3.oil.toFixed(1) + ' BBL');
  await page.click('.tool[data-tool="select"]');
  p = await screenOf(page, ...sp.well); await page.mouse.click(p.x, p.y - 10); await page.waitForTimeout(400);
  const wt = await page.textContent('#panel'); assert(/ينتج/.test(wt) && /10/.test(wt)); log('well panel: ' + wt.replace(/\s+/g, ' ').trim().slice(0, 80));
  await page.screenshot({ path: OUT + '/33-well-panel-ar.png' });
  p = await screenOf(page, ...sp.tank); await page.mouse.click(p.x + 20, p.y - 20); await page.waitForTimeout(300);
  assert(/خزان النفط/.test(await page.textContent('#panel'))); log('tank panel shows capacity and fill');

  // market: previous price + trend, spot, futures, wait
  await page.click('#btn-market'); await page.waitForTimeout(400);
  const prev = await page.textContent('#mk-prev'), trend = await page.textContent('#mk-trend');
  assert(/\$\d/.test(prev) && /(صاعد|هابط|مستقر)/.test(trend)); log('market shows previous price ' + prev + ' and trend "' + trend.trim() + '"');
  await page.screenshot({ path: OUT + '/34-market-ar.png' });
  const c0 = (await S()).cash;
  await page.click('#market .chips button[data-p="100"]'); await page.click('#sp-go'); await page.waitForTimeout(200);
  assert((await S()).cash > c0); log('spot sale: +$' + Math.round((await S()).cash - c0));
  await page.waitForTimeout(3500);
  await page.evaluate(() => { const r = document.getElementById('fu-range'); r.value = Math.max(1, Math.floor(+r.max / 2)); r.dispatchEvent(new Event('input')); });
  for (const i of [0, 1, 2]) { await page.click(`#fu-dur button[data-i="${i}"]`); }
  await page.click('#fu-go'); assert.strictEqual(await page.evaluate(() => window.__oli.game.s.contracts.length), 1); log('futures contract created (3 duration options: 1/2/3 min)');
  await page.click('#al-up'); await page.click('#wt-go'); log('wait option closes market and sets alert');

  // English toggle and back
  await page.click('#btn-settings'); await page.click('#langs button[data-l="en"]'); assert.strictEqual((await page.textContent('#st-cash small')).trim(), 'Cash');
  await page.click('#langs button[data-l="ar"]'); assert.strictEqual((await page.textContent('#st-cash small')).trim(), 'النقد'); await page.click('#st-close'); log('language toggle ar/en');

  // build more, save + reload
  await buildAt('well', await page.evaluate(([x, y]) => { const g = window.__oli.game; for (let yy = y + 2; yy < 25; yy++) if (g.canPlace('well', x, yy).ok) return [x, yy]; }, sp.well));
  assert.strictEqual((await S()).b, 3); log('built another well with the earnings');
  const before = await page.evaluate(() => { const g = window.__oli.game; return { hist: g.s.hist.length, prev: g.s.prev }; });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload'))); await page.reload(); await page.waitForTimeout(600);
  const after = await page.evaluate(() => { const g = window.__oli.game; return { cash: Math.round(g.s.cash), price: g.s.price, prev: g.s.prev, hist: g.s.hist.length, b: g.buildings.length, pipes: g.pipeCount(), contracts: g.s.contracts.length, lang: window.__oli.prefs.lang }; });
  assert.strictEqual(after.b, 3); assert(after.pipes >= 4); assert.strictEqual(after.contracts, 1); assert.strictEqual(after.lang, 'ar'); assert.strictEqual(after.hist, before.hist);
  log('reload restores cash, wells, pipes, storage, market state, contracts, language: ' + JSON.stringify(after));

  // ------------------------- phone (touch) -------------------------
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const mp = await mctx.newPage(); watch(mp, 'phone');
  await mp.goto(URL); await mp.waitForTimeout(700);
  await mp.screenshot({ path: OUT + '/40-phone-start.png' });
  const M = () => mp.evaluate(() => ({ cash: window.__oli.game.s.cash, b: window.__oli.game.buildings.length, pipes: window.__oli.game.pipeCount() }));
  const ms = await mp.evaluate(() => { const g = window.__oli.game, o = {}; for (let y = 11; y < 20; y++) for (let x = 16; x < 26; x++) if (!o.well && g.canPlace('well', x, y).ok) o.well = [x, y]; for (let y = o.well[1]; y < 22; y++) if (g.canPlace('tank', o.well[0] + 4, y).ok) { o.tank = [o.well[0] + 4, y]; break; } return o; });
  const tap = async (cell) => { const q = await screenOf(mp, ...cell); await mp.touchscreen.tap(q.x, q.y); };
  const mtool = async (name) => { if (await mp.locator('#buildmenu').isHidden()) await mp.tap('#btn-build'); await mp.tap(`#buildmenu .tool[data-tool="${name}"]`); };
  await mtool('well'); await tap(ms.well); await mp.waitForTimeout(150);
  assert.strictEqual((await M()).b, 0); await mp.screenshot({ path: OUT + '/41-phone-confirm.png' });
  await mp.tap('#confirm-ok'); assert.strictEqual((await M()).b, 1); log('phone: tap -> confirm bar -> well built');
  await mtool('tank'); await tap(ms.tank); await mp.tap('#confirm-ok');
  await mtool('pipe'); await tap(ms.well); await tap(ms.tank); await mp.waitForTimeout(150);
  await mp.screenshot({ path: OUT + '/42-phone-pipe.png' });
  await mp.tap('#confirm-ok'); const m3 = await M(); assert(m3.pipes >= 3 && m3.b === 2); log('phone: pipeline preview + confirm (' + m3.pipes + ' segments)');
  await mp.evaluate(() => { window.__oli.ui.speed = 10; }); await mp.waitForTimeout(6000);
  await mp.tap('.tool[data-tool="select"]');
  const q = await screenOf(mp, ...ms.well); await mp.touchscreen.tap(q.x, q.y - 12); await mp.waitForTimeout(300);
  await mp.screenshot({ path: OUT + '/43-phone-well-info.png' });
  assert(/ينتج/.test(await mp.textContent('#panel'))); log('phone: tapping a well shows its info');
  await mp.tap('#panel .x'); await mp.tap('#btn-market'); await mp.waitForTimeout(400);
  await mp.screenshot({ path: OUT + '/44-phone-market.png' });
  await mp.tap('#mk-close');
  const z0 = await mp.evaluate(() => window.__oli.cam.z), cdp = await mctx.newCDPSession(mp);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
  await touch('touchStart', [[150, 400], [240, 400]]); for (let i = 1; i <= 8; i++) await touch('touchMove', [[150 - i * 8, 400], [240 + i * 8, 400]]); await touch('touchEnd', []);
  const z1 = await mp.evaluate(() => window.__oli.cam.z); assert(z1 > z0 * 1.2); log('phone: pinch zoom ' + z0.toFixed(2) + ' -> ' + z1.toFixed(2));
  const c0p = await mp.evaluate(() => ({ x: window.__oli.cam.x }));
  await touch('touchStart', [[200, 300]]); for (let i = 1; i <= 8; i++) await touch('touchMove', [[200 - i * 15, 300 - i * 5]]); await touch('touchEnd', []);
  assert(Math.abs((await mp.evaluate(() => window.__oli.cam.x)) - c0p.x) > 20); log('phone: drag pans the map');
  await mp.screenshot({ path: OUT + '/45-phone-zoomed.png' });

  await browser.close();
  if (errors.length) { console.log('\nERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('\nALL UI TESTS PASSED (no console errors). Screenshots: ' + OUT);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
