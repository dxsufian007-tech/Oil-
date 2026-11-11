// Full playthrough in a real browser (phone viewport): a new game, the full oil chain, chemicals bought, 30 days of production, sales of every product
// and the by-product, profit, books balanced, save and reload, and a check that no background timer or step loop keeps growing.
//   NODE_PATH=/opt/npm-tools/node_modules node test-playthrough.js [shots-dir]
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const shots = process.argv[2] && path.resolve(process.argv[2]); if (shots) fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0], f = path.join(__dirname, u === '/' ? 'world-preview.html' : u); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(d); }); }).listen(0);
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 412, height: 866 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true }), p = await ctx.newPage(), errs = [];
  /* count live timers: every setInterval that is created and not cleared */
  await p.addInitScript(() => { const si = window.setInterval.bind(window), ci = window.clearInterval.bind(window); window.__intervals = new Set(); window.setInterval = (f, t, ...a) => { const id = si(f, t, ...a); window.__intervals.add(id); return id; }; window.clearInterval = id => { window.__intervals.delete(id); ci(id); }; });
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(m.text()); });
  const url = 'http://localhost:' + srv.address().port + '/?lab=1&lang=en', co = f => p.evaluate(f), shot = async nm => { if (shots) await p.screenshot({ path: path.join(shots, nm + '.png') }); };
  await p.goto(url); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 });

  console.log('NEW GAME'); await co(() => { localStorage.clear(); window.OliEconomyConfig.ENGINE.enabled = false; __lab.reset(); });   // this playthrough checks the plant's profit at the nominal prices (the 2000 prices of the Brent market are a third of them, see test-brent-market.js) await co(() => { __lab.company.speed = 0; });
  ok(await co(() => __lab.store.cash) === 10e6, 'a new game starts with $10,000,000');

  console.log('BUILD THE FULL CHAIN'); const r = await co(() => __lab.buildDemo());
  ok(r.ok && r.total === 12 && !r.failed.length, 'the oil chain is built (' + r.total + ' buildings, ' + r.pipelines + ' pipelines)'); await shot('play-built');

  console.log('PRODUCE'); const restock = () => co(() => { const c = __lab.company; for (const m of ['CHEM', 'OPS']) { const room = Math.floor(c.roomFor(m)); if (room > 0) { const x = c.buy(m, room, 'A', 'CASH'); if (!x.ok) return x.reason; } } return null; });
  await co(() => { for (const x of ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) __lab.company.setMode(x, 'WAIT'); });
  const cash0 = await co(() => __lab.store.cash);
  const refSt = () => co(() => { const l = __lab, r = l.store.list().find(b => /refinery/.test(b.d)); return { st: l.sim.status(r), mat: l.company.matLimit }; });
  await co(() => { for (const m of ['CHEM', 'OPS']) __lab.company.setAutoBuy(m, { on: false }); });   // automatic purchasing off: this part checks the hand-managed path
  await co(() => __lab.company.advanceHours(24)); const noMat = await refSt();
  ok(noMat.st === 'NO_MATERIALS' && noMat.mat === 0, 'with no chemicals the refinery says it lacks materials, not "no oil reaches it" (' + noMat.st + ')');
  ok(await restock() === null, 'chemicals and operating materials are bought'); await co(() => __lab.company.advanceHours(24)); ok((await refSt()).st === 'RUNNING', 'after buying them the same refinery runs'); for (let d = 0; d < 10; d++) { const why = await restock(); if (why) { ok(false, 'restock failed: ' + why); } await co(() => __lab.company.advanceHours(24)); }
  const inv = await co(() => __lab.company.inventory().map(v => [v.product, Math.round(v.volume)])), prod = Object.fromEntries(inv);
  ok(prod.CRUDE > 0 && prod.GASOLINE > 0 && prod.DIESEL > 0 && prod.JET_FUEL > 0 && prod.GAS > 0, 'after 10 days every product is in stock ' + JSON.stringify(prod));
  const bp = await co(() => __lab.company.byproducts()); ok(bp.qty > 0 && bp.residue > 0 && bp.fuelBurned > 0, 'by-product ' + Math.round(bp.qty) + ' bbl, residue ' + Math.round(bp.residue) + ' bbl, internal fuel ' + Math.round(bp.fuelBurned) + ' bbl are recorded');
  ok(await co(() => __lab.company.audit().ok), 'books balanced after 10 days of production'); await shot('play-produced');

  console.log('SELL EVERYTHING'); await co(() => { for (const x of ['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) __lab.company.setMode(x, 'SPOT'); });
  for (let d = 0; d < 60; d++) { await restock(); await co(() => __lab.company.advanceHours(24)); if (d >= 19 && await co(() => __lab.company.led.life.sold.DIESEL > 0)) break; }      // the volume depends on the field the demo chain picked: run until diesel has sold (at least 20 days)
  const sold = await co(() => { const c = __lab.company, L = c.led.life; return { rev: L.soldRev, sold: Object.assign({}, L.sold) }; });
  ok(sold.rev > 0 && sold.sold.GASOLINE > 0 && sold.sold.DIESEL > 0, 'automatic sales (a store 80% full) brought revenue ' + Math.round(sold.rev).toLocaleString('en-US') + ' (gasoline ' + Math.round(sold.sold.GASOLINE) + ', diesel ' + Math.round(sold.sold.DIESEL) + ', jet ' + Math.round(sold.sold.JET_FUEL) + ' bbl sold)');
  for (const x of ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) await co(x => __lab.company.setMode(x, 'WAIT'), x);
  const rest = await co(() => { const c = __lab.company, out = {}; for (const x of ['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) { const q = c.available(x); out[x] = q > 0 ? c.sell(x, q).ok : true; } const bpq = c.qty2.BYPRODUCT, s = bpq > 0 ? c.sellByproduct(bpq) : { ok: true }; out.BP = s.ok; return out; });
  ok(Object.values(rest).every(Boolean), 'every product and the by-product can be sold by hand ' + JSON.stringify(rest));
  const fin = await co(() => { const c = __lab.company, J = c.journal.bal, sum = pre => Object.entries(J).filter(([k]) => k.startsWith(pre)).reduce((a, [, v]) => a + v, 0); const rev = -sum('REV_'), cogs = sum('COGS'), exp = sum('EXP_'); return { rev, cogs, exp, profit: rev - cogs - exp, cash: __lab.store.cash, audit: c.audit().ok, wip: J.INV_WIP, residueQty: c.qty2.RESIDUE, residueValue: J.INV_RESIDUE, short: c.crudeShort }; });
  console.log('  revenue', Math.round(fin.rev), 'cost of goods', Math.round(fin.cogs), 'expenses', Math.round(fin.exp), 'PROFIT', Math.round(fin.profit), 'cash', Math.round(fin.cash));
  ok(fin.rev > 0 && fin.cogs > 0, 'revenue and cost of goods sold are both recorded'); ok(fin.profit > 0, 'the plant makes a profit over 30 days (' + Math.round(fin.profit).toLocaleString('en-US') + ')');
  ok(fin.audit && Math.abs(fin.wip || 0) < 1, 'books balanced and WIP empty after selling'); ok(fin.residueQty > 0 && Math.abs(fin.residueValue || 0) < 1e-3, 'residue stays recorded at zero value'); ok(fin.short === 0, 'the refinery never took more crude than the company had');
  await shot('play-sold');

  console.log('SAVE AND RELOAD'); await co(() => __lab.save());
  /* 1) exact round trip: what is saved and loaded back gives the very same state (no clock involved) */
  const rt = await co(() => { /* `acc` is the part of an hour not yet simulated; by design it restarts at 0 on load (under one game hour) */ const c = __lab.company, strip = o => { const x = JSON.parse(JSON.stringify(o)); delete x.acc; return JSON.stringify(x); }, a = strip(c.toJSON()); c.fromJSON(JSON.parse(JSON.stringify(c.toJSON()))); return { same: a === strip(c.toJSON()), len: a.length }; });
  ok(rt.same, 'saving then loading the company returns exactly the same state, apart from the unsimulated fraction of an hour (' + rt.len + ' bytes)');
  await co(() => __lab.save()); const snap = await co(() => { const c = __lab.company; return { cash: __lab.store.cash, h: c.hours, b: __lab.store.list().length, qty2: c.qty2.BYPRODUCT, res: c.qty2.RESIDUE }; });
  /* 2) after a real page reload the player's absence is replayed as game time, so only the clock may have moved */
  await p.reload(); await p.waitForFunction(() => window.__lab && __lab.restored, null, { timeout: 90000 }); await co(() => { __lab.company.speed = 0; });
  const snap2 = await co(() => { const c = __lab.company; return { cash: __lab.store.cash, h: c.hours, b: __lab.store.list().length, qty2: c.qty2.BYPRODUCT, res: c.qty2.RESIDUE }; });
  ok(snap2.b === snap.b && snap2.h >= snap.h && snap2.h - snap.h <= 6, 'after reload all ' + snap.b + ' buildings are back and the clock moved only ' + (snap2.h - snap.h) + ' h (the time away)');
  ok(snap2.qty2 >= snap.qty2 && snap2.res >= snap.res && snap2.cash > 0.5 * snap.cash, 'by-product, residue and cash carried over (no reset to zero)');
  ok(await co(() => __lab.company.audit().ok), 'books still balance after reload');
  await co(() => { __lab.company.speed = 0; }); await restock(); await co(() => __lab.company.advanceHours(48)); ok(await co(() => __lab.company.audit().ok && __lab.company.refLast.feed > 0), 'production continues after reload (2 more days, books balanced)');

  console.log('BACKGROUND WORK'); const t0 = await co(() => window.__intervals.size);
  for (let i = 0; i < 15; i++) { await co(() => __lab.EU.open('inventory')); await p.waitForTimeout(40); await co(() => __lab.EU.open('market')); await co(() => __lab.EU.close()); }
  const t1 = await co(() => window.__intervals.size); ok(t1 === t0, 'opening and closing the economy screens 15 times creates no new timers (' + t0 + ' -> ' + t1 + ')');
  const cnt = await co(() => new Promise(res => { const c = __lab.company, orig = c.advanceHours.bind(c); let calls = 0; c.advanceHours = h => { calls++; return orig(h); }; c.speed = 1; setTimeout(() => { c.advanceHours = orig; c.speed = 0; res(calls); }, 4000); }));
  ok(cnt <= 80, 'at normal speed the economy steps at a bounded rate (' + cnt + ' calls in 4 s)');
  const lt = await co(() => new Promise(res => { let long = 0; try { new PerformanceObserver(l => { long += l.getEntries().length; }).observe({ entryTypes: ['longtask'] }); } catch (e) { return res(-1); } setTimeout(() => res(long), 3000); }));
  ok(lt <= 3, 'few long tasks while the game runs (' + lt + ' in 3 s)');
  ok(errs.length === 0, 'no console / page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log('\nPLAYTHROUGH TESTS PASSED (' + n + ' checks)'); await b.close(); srv.close();
})().catch(e => { console.error('FAILED: ' + (e && e.message)); process.exit(1); });
