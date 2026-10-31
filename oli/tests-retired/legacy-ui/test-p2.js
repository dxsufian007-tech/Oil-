const { chromium } = require('/tmp/legacy-pw.js');
const NEUTRAL = () => { const C = window.OliCore.CFG; C.TERRAIN.MULT = [1, 1, 1, 1]; C.BUILD = {well:0,tank:0,pipeTile:0,pipeMax:0}; C.REGIONS.forEach(r => { r.mult = 1; }); window.__oli.game.s.regions.forEach(r => { r.unlocked = true; }); };
const assert = require('assert');
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'en' });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.addInitScript(() => { try { localStorage.setItem('oli-prefs', JSON.stringify({ lang: 'en', confirm: true })); } catch (e) {} });
  await pg.goto('file:///home/claude/oli/index.html'); await pg.waitForTimeout(400); await pg.evaluate(NEUTRAL); await pg.waitForTimeout(600); await pg.evaluate(() => { for (const a of window.__oli.game.areas) if (a.land && a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 18000; a.potential = 90; } });
  const log = m => console.log('ok  ', m);
  const st = () => pg.evaluate(() => { const g = window.__oli.game, s = g.s; return { cash: s.cash, oil: g.oilTotal(), cap: g.storageCap(), price: s.price, rev: s.revenue, cost: s.operatingCosts, profit: s.profit, owed: s.owed, contracts: s.contracts.length, done: s.done.map(d => d.status), tankAmt: g.buildings.find(b => b.type === 'tank').amt, tankCap: g.tankCap(g.buildings.find(b => b.type === 'tank')) }; });
  const txt = sel => pg.evaluate(s => document.querySelector(s).textContent.replace(/[⁦⁩]/g, '').trim(), sel);
  const num = s => +String(s).replace(/[^0-9.\-]/g, '');
  // 1-4: start, produce, pipe, fill (play through the real UI loop at 10x)
  await pg.evaluate(() => { const o = window.__oli, g = o.game; g.s.cash = 20000; g.place('well', 20, 12); g.place('well', 20, 15); g.place('tank', 25, 12); g.buildRoute(g.routePipe(21, 12, 24, 13, false)); g.buildRoute(g.routePipe(21, 15, 24, 14, false)); o.ui.speed = 10; });
  await pg.waitForTimeout(6000);
  let s0 = await st(); assert(s0.oil > 8, 'oil is produced and stored through the pipe: ' + s0.oil); log('oil produced and moved through the pipe into the tank: ' + s0.oil.toFixed(0) + ' BBL (2 wells, 10x speed)');
  await pg.evaluate(() => { window.__oli.ui.speed = 0; const g = window.__oli.game; const t = g.buildings.find(b => b.type === 'tank'); t.amt = 720; });   // the spec example: 720 stored
  // 5-6: open market, price text equals state
  await pg.click('#btn-market'); await pg.waitForTimeout(500);
  s0 = await st();
  assert.strictEqual(num(await txt('#mk-price')), +s0.price.toFixed(1)); assert.strictEqual(num(await txt('#ec-cash')), Math.round(s0.cash)); assert(/720 \/ 1,000/.test(await txt('#ec-oil')), 'stored oil text ' + await txt('#ec-oil'));
  log('market opened: price ' + await txt('#mk-price') + ', stored ' + await txt('#ec-oil') + ', cash ' + await txt('#ec-cash') + ', revenue ' + await txt('#ec-rev') + ', cost ' + await txt('#ec-cost') + ', profit ' + await txt('#ec-profit'));
  await pg.screenshot({ path: '/tmp/oli-shots/p2-a-open.png' });
  // 7-10: sell 250 with the chip
  await pg.click('#sp-chips button[data-n="250"]'); await pg.waitForTimeout(100);
  const preview = await txt('#sp-rev'); const q0 = await pg.evaluate(() => window.__oli.game.storage().quality); const pBefore = (await st()).price * q0;
  await pg.click('#sp-go'); await pg.waitForTimeout(250);
  let s1 = await st();
  assert.strictEqual(Math.round(s1.oil), 470); assert(Math.abs(s1.rev - 250 * pBefore) < 0.5, 'revenue = 250 x price'); assert(Math.abs(s1.cash - (s0.cash + 250 * pBefore)) < 1);
  assert.strictEqual(num(await txt('#ec-rev')), Math.round(s1.rev)); assert(/470 \/ 1,000/.test(await txt('#ec-oil')));
  log('sold 250: money +' + (s1.cash - s0.cash).toFixed(0) + ' (preview ' + preview + '), inventory 470, revenue on screen = state ' + await txt('#ec-rev'));
  await pg.waitForTimeout(1500);
  const lvl = await pg.evaluate(() => { const o = window.__oli, t = o.game.buildings.find(b => b.type === 'tank'); return { shown: o.anim.tanks.get(t.id).f, real: t.amt / o.game.tankCap(t) }; });
  assert(Math.abs(lvl.shown - lvl.real) < .02 && Math.abs(lvl.real - 470 / 1000) < .001); log('tank level on the map = ' + (lvl.shown * 100).toFixed(1) + '% (inventory 470 / 1000 = 23.5%)');
  // 11-15: wait, price moves, sell again at another price, check costs and profit
  await pg.evaluate(() => { window.__oli.ui.speed = 10; }); await pg.waitForTimeout(4000); await pg.evaluate(() => { window.__oli.ui.speed = 0; });
  const s2 = await st(); assert(s2.price !== s1.price); assert(s2.cost > s1.cost);
  await pg.click('#sp-chips button[data-n="all"]'); await pg.click('#sp-go'); await pg.waitForTimeout(250);
  const s3 = await st(); assert(s3.oil < 0.01 && s3.tankAmt < 0.01, 'sold all: tank empty'); assert(Math.abs(s3.profit - (s3.rev - s3.cost)) < 1e-6);
  assert.strictEqual(num(await txt('#ec-profit')), Math.round(s3.profit)); assert.strictEqual(num(await txt('#ec-cost')), Math.round(s3.cost));
  log('waited (price $' + s1.price.toFixed(1) + ' -> $' + s2.price.toFixed(1) + '), sold the rest: tank empty, revenue $' + s3.rev.toFixed(0) + ' - costs $' + s3.cost.toFixed(0) + ' = profit $' + s3.profit.toFixed(0) + ' (screen: ' + await txt('#ec-profit') + ')');
  assert(await pg.isDisabled('#sp-go'), 'selling with 0 oil is not possible'); log('with 0 oil the sell button is disabled');
  // 16-18: futures contract via the UI, countdown, completion
  await pg.evaluate(() => { const g = window.__oli.game; g.buildings.find(b => b.type === 'tank').amt = 600; window.__oli.ui.speed = 1; }); await pg.waitForTimeout(400);
  await pg.evaluate(() => { const r = document.getElementById('fu-range'); r.value = 400; r.dispatchEvent(new Event('input')); });
  await pg.click('#fu-dur button[data-i="0"]'); const quoted = await txt('#fu-price'); await pg.click('#fu-go'); await pg.waitForTimeout(300);
  let f1 = await st(); assert.strictEqual(f1.contracts, 1); assert(/ACTIVE/.test(await txt('#contracts')), 'ACTIVE badge'); assert(/400 BBL/.test(await txt('#contracts')));
  const left1 = await pg.evaluate(() => { const k = window.__oli.game.s.contracts[0]; return k.end - window.__oli.game.s.time; });
  await pg.screenshot({ path: '/tmp/oli-shots/p2-b-contract.png' });
  await pg.evaluate(() => { window.__oli.ui.speed = 10; }); await pg.waitForTimeout(2500);
  const left2 = await pg.evaluate(() => { const k = window.__oli.game.s.contracts[0]; return k ? k.end - window.__oli.game.s.time : -1; });
  assert(left2 < left1 - 5, 'countdown runs'); log('contract created @ ' + quoted + ' (ACTIVE, oil stays in the tank), countdown ' + left1.toFixed(0) + 's -> ' + (left2 < 0 ? 'done' : left2.toFixed(0) + 's'));
  await pg.waitForFunction(() => window.__oli.game.s.contracts.length === 0, null, { timeout: 15000 });
  await pg.evaluate(() => { window.__oli.ui.speed = 0; }); await pg.waitForTimeout(300);
  let f2 = await st(); assert.deepStrictEqual(f2.done[0], 'completed'); assert(/COMPLETED/.test(await txt('#finished')));
  log('contract COMPLETED: revenue +$' + (f2.rev - s3.rev).toFixed(0) + ', shown in "Finished contracts"');
  // expiry: sign a contract, then sell the oil elsewhere
  await pg.evaluate(() => { const g = window.__oli.game; g.buildings.find(b => b.type === 'tank').amt = 500; }); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const r = document.getElementById('fu-range'); r.value = 500; r.dispatchEvent(new Event('input')); }); await pg.click('#fu-go'); await pg.waitForTimeout(200);
  await pg.click('#sp-chips button[data-n="all"]'); await pg.waitForTimeout(100); const warn = await txt('#sp-warn'); assert(/penalty/i.test(warn), 'warning before selling committed oil: ' + warn); await pg.click('#sp-go'); await pg.waitForTimeout(200);
  await pg.evaluate(() => { window.__oli.ui.speed = 10; }); await pg.waitForFunction(() => window.__oli.game.s.contracts.length === 0, null, { timeout: 15000 }); await pg.evaluate(() => { window.__oli.ui.speed = 0; }); await pg.waitForTimeout(300);
  const f3 = await st(); assert.strictEqual(f3.done[0], 'expired'); assert(/EXPIRED/.test(await txt('#finished')));
  assert(f3.oil >= 0 && f3.cash >= 0); log('contract EXPIRED after selling the oil elsewhere (warned first): "' + (await txt('#finished')).slice(0, 60) + '...", cash $' + f3.cash.toFixed(0) + ' >= 0, inventory ' + f3.oil.toFixed(0));
  await pg.screenshot({ path: '/tmp/oli-shots/p2-c-expired.png' });
  assert(errs.length === 0, 'JS errors: ' + errs.join('|')); log('no JavaScript errors');
  await br.close();
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
