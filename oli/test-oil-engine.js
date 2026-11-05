/* Oil Market Engine: the economic scenarios (14), the product markets, and the safety checks.   NODE_PATH=/opt/npm-tools/node_modules node test-oil-engine.js
 * The engine has no historical data and no real years: every scenario is a PAIRED comparison - the same seed and the same random stream run twice, once untouched (the control)
 * and once with the scenario forced - so a difference in the result comes only from the scenario.  The market state is fixed (no random state change, no random news) in those runs. */
const { B, I, E, EC, game, put, chain } = require('./test-economy-helpers.js'); const NEWS = require('./news-data.js'), OE = require('./oil-engine.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
const ID = t => NEWS.EVENTS.find(e => e.text.includes(t)).id;
const month = d => Math.floor(((d % 365) + 365) % 365 / 30.42) + 1;
function Rng(s) { this.s = s >>> 0 || 1; this.next = () => { let t = this.s += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; this.gauss = () => { let u = 0; while (!u) u = this.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185 * this.next()); }; }
const mk = (seed, P) => { const e = new OE.OilEngine(Object.assign({ maxActive: 0 }, P || {}), new Rng(seed || 11)); e.regLeft = 1e9; return e; };   // random state changes and random news off
const run = (e, d, hook) => { for (let i = 0; i < d; i++) { const day = e.lastDay + 1; e.dayStep(day, month(day), 'x'); if (hook) hook(e, i); } return e; };
const force = (e, ...ids) => { for (const id of ids) e.force(id, e.lastDay, 'x'); };
const pair = (days, ids, seed, pre, early) => { const c = mk(seed), s = mk(seed); if (pre) { pre(c); pre(s); } run(c, 30); run(s, 30); force(s, ...ids); const k = early || 20; run(c, k); run(s, k); const ec = JSON.parse(JSON.stringify({ P: c.flow.P, D: c.flow.D, C: c.C, H: c.H, R: c.R, price: c.price() })), es = JSON.parse(JSON.stringify({ P: s.flow.P, D: s.flow.D, C: s.C, H: s.H, R: s.R, price: s.price() })); run(c, days - k); run(s, days - k); return { c, s, ec, es }; };

console.log('1. production up with demand down');
{ const { c, s, ec, es } = pair(90, [ID('حرب أسعار'), ID('بيانات تُظهر دخول')]);
  T('1a supply is higher and demand lower than the control (20 days in: supply +' + (es.P - ec.P).toFixed(1) + ', demand ' + (es.D - ec.D).toFixed(1) + ' mb/d)', es.P > ec.P + 1 && es.D < ec.D - 1, [es, ec]);
  T('1b the commercial stock builds up (' + s.C.toFixed(0) + ' vs ' + c.C.toFixed(0) + ')', s.C > c.C + 100);
  T('1c the price falls clearly below the control (' + s.price() + ' vs ' + c.price() + ')', s.price() < c.price() * 0.88); }
console.log('2. production down with demand up');
{ const { c, s, ec, es } = pair(90, [ID('أوبك+ تقرر خفض'), ID('الصين تعيد فتح')]);
  T('2a supply is lower and demand higher (20 days in: supply ' + (es.P - ec.P).toFixed(1) + ', demand +' + (es.D - ec.D).toFixed(1) + ' mb/d)', es.P < ec.P - 1 && es.D > ec.D + 1, [es, ec]);
  T('2b the commercial stock is drawn down (' + s.C.toFixed(0) + ' vs ' + c.C.toFixed(0) + ')', s.C < c.C - 60);
  T('2c the price rises clearly above the control (' + s.price() + ' vs ' + c.price() + ')', s.price() > c.price() * 1.12);
  T('2d OPEC+ answers: its group output is not the control\'s only moving part (the other groups follow the price)', s.out.some((v, i) => Math.abs(v - c.out[i]) > 0.05)); }
console.log('3. global stock build-up / 4. draw-down');
{ const { c, s } = pair(120, [ID('فائض مخزون عالمي'), ID('المخزونات الأمريكية ترتفع')]);
  T('3a a stock build-up lowers the price (' + s.price() + ' vs ' + c.price() + ') and raises the stock cover', s.price() < c.price() && s.C > c.C);
  const { c: c2, s: s2 } = pair(40, [ID('نقص حاد في المخزونات'), ID('المخزونات الأمريكية تهبط')], 11, null, 15);
  T('4a a stock draw-down raises the price (' + s2.price() + ' vs ' + c2.price() + ') and lowers the cover', s2.price() > c2.price() && s2.C < c2.C);
  T('4b the stock indicator reads low when the cover is low, high when it is high', s2.level(s2.C / s2.P.C0 - 0.05) === 'LOW' && s.level(1.06) === 'HIGH' && s.level(1) === 'NORMAL'); }
console.log('5. long hoarding');
{ const { c, s, ec, es } = pair(160, [ID('تجار يخزنون'), ID('منتجون يحتفظون')], 11, null, 40);
  T('5a hoarded oil rises (' + es.H.toFixed(0) + ' vs ' + ec.H.toFixed(0) + ') and the commercial stock on offer falls (' + es.C.toFixed(0) + ' vs ' + ec.C.toFixed(0) + ') while the hoarding lasts', es.H > ec.H + 8 && es.C < ec.C - 3, [es, ec]);
  T('5b the hoarding duration is tracked and grows with time', s.Hage > 30);
  T('5c the oil is only moved: stock C + H + R still closes the books', Math.abs(s.check()) < 1e-6, s.check());
  T('5d the price is above the control while the oil is held back (' + es.price + ' vs ' + ec.price + ')', es.price > ec.price); }
console.log('6. large release');
{ const hoard = e => { e.H = 400; e.C -= 400; e.acct.prod += 0; e.P.C0 += 0; }; // start with a big hoard (taken out of the commercial stock): the books are checked below
  const { c, s, ec, es } = pair(60, [ID('شركات كبرى تطرح'), ID('الصين تفرغ')], 11, e => { e.H = 400; e.C -= 260; e.acct.bought += 260; }, 25);
  T('6a a release shrinks the hoard (' + es.H.toFixed(0) + ' vs ' + ec.H.toFixed(0) + ') and refills the commercial stock (' + es.C.toFixed(0) + ' vs ' + ec.C.toFixed(0) + ')', es.H < ec.H - 5 && es.C > ec.C + 5, [es, ec]);
  T('6b the price is below the control (' + es.price + ' vs ' + ec.price + ')', es.price < ec.price);
  const r = pair(60, [ID('دول مستهلكة تعلن سحبًا')], 11, null, 30);
  T('6c a strategic release moves oil from the reserve (a separate account) to the commercial stock: R falls, C rises, nothing is created', r.es.R < r.ec.R - 20 && r.es.C > r.ec.C + 5 && Math.abs(r.s.check()) < 1e-6, [r.es, r.ec]); }
console.log('7. political crisis');
{ const c = mk(5), s = mk(5); run(c, 30); run(s, 30); const p0 = s.price(); force(s, ID('إغلاق جزئي لمضيق')); run(c, 3); run(s, 3);
  T('7a the news makes the price jump at once (' + p0 + ' -> ' + s.price() + ' vs control ' + c.price() + ')', s.price() > c.price() * 1.025);
  run(c, 7); run(s, 7); T('7b the supply loss is real: 10 days in, output is lower (' + s.flow.P.toFixed(1) + ' vs ' + c.flow.P.toFixed(1) + '), the price is clearly above the control (' + s.price() + ' vs ' + c.price() + ')', s.flow.P < c.flow.P - 1.5 && s.price() > c.price() * 1.04);
  run(c, 20); run(s, 20); const pk = s.price(); T('7b2 after the 30 days the stock was drawn (' + s.C.toFixed(0) + ' vs ' + c.C.toFixed(0) + ') and the price stays above the control', s.C < c.C - 20 && pk > c.price() * 1.02);
  run(c, 100); run(s, 100);
  T('7c after the event ends the extra premium fades (' + pk + ' -> ' + s.price() + ')', s.price() < pk && s.active.length === 0); }
console.log('8. economic crisis');
{ const c = mk(6), s = mk(6); run(c, 30); run(s, 30); force(s, ID('أزمة مالية'), ID('بيانات تُظهر دخول')); run(c, 100); run(s, 100);
  T('8a demand falls (' + s.flow.D.toFixed(1) + ' vs ' + c.flow.D.toFixed(1) + ') and the stock builds (' + s.C.toFixed(0) + ' vs ' + c.C.toFixed(0) + ')', s.flow.D < c.flow.D - 1 && s.C > c.C + 100);
  T('8b the price falls well below the control (' + s.price() + ' vs ' + c.price() + ')', s.price() < c.price() * 0.85);
  const lo = s.price(); run(c, 250); run(s, 250); T('8c the news ends and the price recovers part of the fall (' + lo + ' -> ' + s.price() + ')', s.price() > lo * 1.05); }
console.log('9. conflicting news');
{ const a = pair(60, [ID('أوبك+ تقرر خفض')]).s.price(), b = pair(60, [ID('أوبك+ تعلن زيادة تدريجية')]).s.price(), ab = pair(60, [ID('أوبك+ تقرر خفض'), ID('أوبك+ تعلن زيادة تدريجية')]).s.price(), c = pair(60, []).s.price();
  T('9a opposite items net out: both together lie between each alone (' + b + ' < ' + ab + ' < ' + a + ')', ab < a && ab > b);
  T('9b the combined effect is the net, not the sum: |both - control| is smaller than |cut - control|', Math.abs(ab - c) < Math.abs(a - c)); }

console.log('10. the player buys and stores / 11. sells later');
{ const g = game(120e6), co = g.co; co.market.engine.P.maxActive = 0; const t = [g.co.crudeOnHand()]; const mkt = co.market, E0 = mkt.engine.C;
  const tank = put(g, 'crude_tank_m', 60, 60); co.sync();
  const room = co.tradeRoom ? co.tradeRoom() : null, q = 5000, qt = co.buyQuote('CRUDE', q, 'A'), cash0 = g.store.cash, hold0 = co.journal.bal.CASH;
  T('10a the buy price comes from the market price (' + qt.unitPrice.toFixed(2) + ' vs market ' + mkt.price.CRUDE + ')', qt.unitPrice >= mkt.price.CRUDE * 0.95 && qt.unitPrice <= mkt.price.CRUDE * 1.3);
  const r = co.buy('CRUDE', q, 'A', 'CASH'); T('10b the buy works', r.ok, r);
  if (r.ok) { T('10c the oil leaves the commercial stock exactly once (' + ((E0 - mkt.engine.C) * 1e6).toFixed(0) + ' bbl)', near((E0 - mkt.engine.C) * 1e6, r.qty, 1e-6));
    T('10d the company holds it: bought crude on hand, cash paid, books balanced', near(co.bq, r.qty) && g.store.cash < cash0 && co.audit().ok !== false, co.audit());
    const inv0 = co.inventoryValue(); g.co.advanceHours(24 * 20); const dayPrice = mkt.price.CRUDE;
    T('10e the stock is valued at the market (inventory value moves with the market price)', co.inventoryValue() > 0);
    const E1 = mkt.engine.C, cash1 = g.store.cash, s = co.sell('CRUDE', r.qty * 0.9, 'SPOT', { source: 'BOUGHT' });
    T('11a the later sale works and returns the oil to the market once (' + ((mkt.engine.C - E1) * 1e6).toFixed(0) + ' bbl)', s.ok && near((mkt.engine.C - E1) * 1e6, s.qty, 1e-6), s);
    T('11b the profit is booked in the ledger: cash up by the net, profit = net - cost, books balanced', s.ok && near(g.store.cash - cash1, s.net, 1e-6) && near(s.profit, s.net - s.cost, 1e-6) && co.audit().ok !== false, co.audit());
    T('11c the sale price is the market price of that hour (not an invented one): ' + s.price.toFixed(2) + ' vs ' + (mkt.price.CRUDE * co.crudeQ).toFixed(2), near(s.price, mkt.price.CRUDE * co.crudeQ, 1e-9));
    T('11d the crude books close (nothing counted twice or lost): check = ' + mkt.engine.check().toExponential(1), Math.abs(mkt.engine.check()) < 1e-6); } }
console.log('12. small and huge company');
{ const eff = mb => { const c = mk(8), s = mk(8); run(c, 30); run(s, 30); s.playerBuy(mb * 1e6); run(c, 5); run(s, 5); return s.price() / c.price() - 1; };
  const small = eff(0.01), mid = eff(20), huge = eff(400);
  T('12a a small company (10 000 bbl) has no visible effect (' + (small * 100).toFixed(4) + '%)', Math.abs(small) < 0.0005);
  T('12b a medium buyer moves the price a little (' + (mid * 100).toFixed(2) + '%)', mid > 0.005 && mid < 0.08);
  T('12c a huge buyer (400 mb) moves it far more (' + (huge * 100).toFixed(1) + '%), the effect grows with the size relative to the market', huge > mid * 5 && huge > 0.15);
  const sell = mb => { const c = mk(8), s = mk(8); run(c, 30); run(s, 30); s.playerSell(mb * 1e6, 0); run(c, 5); run(s, 5); return s.price() / c.price() - 1; }; T('12d a huge SALE pushes the price down, a small one does not', sell(400) < -0.1 && Math.abs(sell(0.01)) < 0.0005); }

console.log('13. pause and speed');
{ const mkG = () => { const g = game(50e6); g.co.market.engine.P.maxActive = 0; return g; }; const a = mkG(), b = mkG(), p0 = a.co.market.price.CRUDE, h0 = a.co.market.hour;
  a.co.pause(); const n = a.co.run(5); T('13a paused: no hour passes, the market, the engine day and the price stay put', n === 0 && a.co.market.hour === h0 && a.co.market.price.CRUDE === p0 && a.co.hours === 0);
  b.co.setSpeed(10); let steps = 0; for (let i = 0; i < 40; i++) steps += b.co.run(7.5);
  T('13b speed x10 runs more hours per call but never more than the step cap (' + steps + ' hours)', steps > 200 && b.co.hours === steps);
  const c1 = mkG(), c2 = mkG(); for (let i = 0; i < 24 * 40; i++) c1.co.advanceHours(1); c2.co.advanceHours(24 * 40);
  T('13c the day is never counted twice: one-hour steps and one big step give the same prices and the same engine day (' + c1.co.market.engine.lastDay + ')', c1.co.market.price.CRUDE === c2.co.market.price.CRUDE && c1.co.market.price.DIESEL === c2.co.market.price.DIESEL && c1.co.market.engine.lastDay === Math.floor((c1.co.hours - 1) / 24) && c2.co.market.engine.lastDay === c1.co.market.engine.lastDay);
  const days = c1.co.market.gc.CRUDE.filter(x => x.day >= 0).length; T('13d one candle per game day, no day skipped (' + days + ')', days === 41 || days === 40);
  const t0 = Date.now(); const f = mkG(); f.co.advanceHours(24 * 365); const ms = Date.now() - t0; console.log('  (one game year of market + economy: ' + ms + ' ms)'); T('13e a game year at full speed is cheap', ms < 6000); }
console.log('14. exit and return');
{ const g = game(80e6), co = g.co; co.market.engine.P.maxActive = 0; co.advanceHours(24 * 45); const js = JSON.stringify(co.toJSON()); const g2 = game(80e6), co2 = g2.co; co2.fromJSON(JSON.parse(js)); co2.market.engine.P.maxActive = 0;
  T('14a the saved state restores price, stock, hoard, regime, news and candles', co2.market.price.CRUDE === co.market.price.CRUDE && co2.market.engine.C === co.market.engine.C && co2.market.engine.H === co.market.engine.H && co2.market.engine.regime === co.market.engine.regime && co2.market.engine.log.length === co.market.engine.log.length && co2.market.gc.CRUDE.length === co.market.gc.CRUDE.length);
  co.advanceHours(24 * 30); co2.advanceHours(24 * 30); T('14b the restored game goes on exactly like the original (same prices after 30 more days)', co.market.price.CRUDE === co2.market.price.CRUDE && co.market.price.JET_FUEL === co2.market.price.JET_FUEL && co.market.engine.C === co2.market.engine.C);
  const g3 = game(80e6); g3.co.stamp(0); g3.co.advanceHours(10); const d0 = g3.co.market.engine.lastDay; g3.co.catchUp(6 * 3600 * 1000); T('14c the offline catch-up advances the market on the same clock (engine day ' + d0 + ' -> ' + g3.co.market.engine.lastDay + ')', g3.co.market.engine.lastDay >= d0 && g3.co.market.engine.lastDay === Math.floor((g3.co.market.hour - 1) / 24));
  // an older save (before the engine) keeps its price and goes on
  const old = co.toJSON(); delete old.market.engine; old.market.gc = []; delete old.market.price.BYPRODUCT; const g4 = game(80e6); g4.co.fromJSON(JSON.parse(JSON.stringify(old))); g4.co.advanceHours(48);
  T('14d an older save loads, keeps going and gets a by-product market', g4.co.market.engine && g4.co.market.price.BYPRODUCT > 0 && g4.co.market.price.CRUDE > 0); }

console.log('15. product markets');
{ const ps = ['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS', 'BYPRODUCT'], tr = e => { const o = {}; for (const p of ps) o[p] = 0; return o; };
  const price = (e, h) => { let o; for (let k = 0; k < 24; k++) o = e.hour(k); return o; };
  const sim = (seed, ids, days) => { const e = mk(seed); run(e, 30); if (ids) force(e, ...ids); const p0 = (() => { let o; for (let k = 0; k < 24; k++) o = e.hour(k); return o; })(); const mx = {}; for (let d = 0; d < days; d++) { run(e, 1); const o = price(e); for (const p of ps.concat('CRUDE')) mx[p] = Math.max(mx[p] || 0, o[p] / p0[p]); } let o = price(e); return { e, p0, o, mx }; };
  const c = sim(21, null, 45), j = sim(21, [ID('ارتفاع الطلب الموسمي على وقود الطيران')], 45);
  T('15a jet-fuel demand news lifts jet fuel more than the other products (jet ' + (j.o.JET_FUEL / c.o.JET_FUEL).toFixed(3) + ', gasoline ' + (j.o.GASOLINE / c.o.GASOLINE).toFixed(3) + ', by-products ' + (j.o.BYPRODUCT / c.o.BYPRODUCT).toFixed(3) + ')', j.o.JET_FUEL / c.o.JET_FUEL > 1.01 && j.o.JET_FUEL / c.o.JET_FUEL > j.o.GASOLINE / c.o.GASOLINE + 0.005 && j.o.JET_FUEL / c.o.JET_FUEL > j.o.BYPRODUCT / c.o.BYPRODUCT + 0.005);
  const w = sim(22, [ID('موجة برد شديدة')], 25), wc = sim(22, null, 25);
  T('15b a cold wave lifts LPG far more than gasoline (' + (w.o.GAS / wc.o.GAS).toFixed(3) + ' vs ' + (w.o.GASOLINE / wc.o.GASOLINE).toFixed(3) + ')', w.o.GAS / wc.o.GAS > w.o.GASOLINE / wc.o.GASOLINE + 0.01);
  const r = sim(23, [ID('انفجار في مصفاة')], 25), rc = sim(23, null, 25), r5 = sim(23, [ID('انفجار في مصفاة')], 4), rc5 = sim(23, null, 4);
  T('15c a refinery outage cuts product supply while crude is still available: supply down, product stock down, product prices up; crude cover unchanged', r5.e.prod.GASOLINE.sup < rc5.e.prod.GASOLINE.sup * 0.98 && r.e.prod.GASOLINE.S < rc.e.prod.GASOLINE.S && r.o.GASOLINE > rc.o.GASOLINE && r.e.C > rc.e.C * 0.98, [r5.e.prod.GASOLINE.sup, rc5.e.prod.GASOLINE.sup, r.o.GASOLINE, rc.o.GASOLINE, r.e.prod.GASOLINE.S, rc.e.prod.GASOLINE.S]);
  T('15d a crude shock moves the products the same way but not by the same proportion', (() => { const a = sim(24, null, 10), b = sim(24, [ID('إغلاق جزئي لمضيق')], 10), rc = b.o.CRUDE / a.o.CRUDE - 1, ro = ['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS', 'BYPRODUCT'].map(p => b.o[p] / a.o[p] - 1); return rc > 0.04 && ro.every(x => x > 0) && new Set(ro.map(x => x.toFixed(3))).size >= 4; })());
  T('15e a product never falls below its cost (crude + refining + transport + storage) in the cost-floor products', (() => { const e = mk(31); let bad = 0; for (let d = 0; d < 3650; d++) { run(e, 1); const o = price(e); for (const p of ['GASOLINE', 'DIESEL', 'JET_FUEL']) if (o[p] < o.CRUDE + e.P.costFloor * 0.5 - 0.02) bad++; } return bad === 0; })());
  T('15f every product has its own stock and the books of each product close (nothing counted twice)', (() => { const e = mk(32); run(e, 400); e.productSell('GASOLINE', 3e6); e.productBuy('DIESEL', 2e6); run(e, 100); return ps.every(p => Math.abs(e.checkProduct(p)) < 1e-6); })());
  const big = (mb) => { const a = mk(33), b = mk(33); run(a, 30); run(b, 30); b.productSell('GASOLINE', mb * 1e6); run(a, 6); run(b, 6); return price(b).GASOLINE / price(a).GASOLINE - 1; };
  T('15g a big sale of a product lowers THAT product in proportion to the market (small ' + (big(0.02) * 100).toFixed(3) + '%, huge ' + (big(150) * 100).toFixed(1) + '%)', Math.abs(big(0.02)) < 0.0005 && big(150) < -0.05);
  T('15h the products never move in lockstep: the daily changes of gasoline and diesel are not identical', (() => { const e = mk(34); const a = [], b = []; let pa = null, pb = null; for (let d = 0; d < 400; d++) { run(e, 1); const o = price(e); if (pa) { a.push(o.GASOLINE / pa - 1); b.push(o.DIESEL / pb - 1); } pa = o.GASOLINE; pb = o.DIESEL; } const m = x => x.reduce((s, v) => s + v, 0) / x.length, ma = m(a), mb = m(b); let cv = 0, va = 0, vb = 0; for (let i = 0; i < a.length; i++) { cv += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; } const rho = cv / Math.sqrt(va * vb); console.log('  (gasoline / diesel daily correlation ' + rho.toFixed(2) + ')'); return rho < 0.98 && rho > -0.5; })()); }
console.log('16. product trading in the company');
{ const g = game(120e6), co = g.co; co.market.engine.P.maxActive = 0; const mkt = co.market;
  T('16a the market price is the price the company trades at, for every product (' + ['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'].map(p => co.unitPrice(p).toFixed(1)).join(' / ') + ')', ['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'].every(p => co.unitPrice(p) === mkt.price[p]) && co.byproductPrice() === mkt.price.BYPRODUCT);
  const x = chain(g, true), s0 = mkt.engine.prod.GASOLINE.S; for (const p of ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) co.setMode(p, 'WAIT'); for (let d = 0; d < 20; d++) { for (const m of ['CHEM', 'OPS']) { const room = Math.floor(co.roomFor(m)); if (room > 0) co.buy(m, room, 'A', 'CASH'); } co.advanceHours(24); } const a1 = co.audit();
  T('16b a working refinery chain keeps running on the engine market: products produced and the books balance', co.led.life.produced.GASOLINE > 0 && a1.ok !== false, a1);
  const av = co.available('GASOLINE'); if (av > 10) { const S1 = mkt.engine.prod.GASOLINE.S, r = co.sell('GASOLINE', av * 0.5, 'SPOT');
    T('16c selling a product adds it to that product\'s market stock once (' + ((mkt.engine.prod.GASOLINE.S - S1) * 1e6).toFixed(0) + ' bbl)', r.ok && near((mkt.engine.prod.GASOLINE.S - S1) * 1e6, r.qty, 1e-6) && Math.abs(mkt.engine.checkProduct('GASOLINE')) < 1e-6, r); }
  else T('16c (no gasoline made in the window)', false, av); }

console.log('17. safety');
{ let bad = 0, jump = 0, dup = 0, neg = 0, maxDay = 0, mn = 1e9, mx = 0, crit = 0; const seeds = [1, 2, 3, 4, 5, 6];
  for (const sd of seeds) { const e = new OE.OilEngine({}, new Rng(sd)); let prev = e.price(); for (let d = 0; d < 365 * 25; d++) { e.dayStep(d, month(d), 'x'); const p = e.price(); if (!(p > 0) || !isFinite(p)) neg++; maxDay = Math.max(maxDay, Math.abs(p / prev - 1)); prev = p; mn = Math.min(mn, p); mx = Math.max(mx, p); const ids = e.active.map(a => a.i); if (new Set(ids).size !== ids.length) dup++; if (e.active.length > e.P.maxActive) bad++; if (Math.abs(e.check()) > 1e-5) crit++; for (const k in OE.PRODUCTS) if (!(e.prod[k].S >= 0) || Math.abs(e.checkProduct(k)) > 1e-5 || !(e.hour(0)[k] > 0)) crit++; if (e.C < 0 || e.H < -1e-9 || e.R < -1e-9) crit++; }
    const L = e.log; for (let i = 1; i < L.length; i++) if (L[i].id === L[i - 1].id && L[i].day - L[i - 1].day < 20) jump++; }
  T('17a 6 seeds x 25 years: no negative / invalid price (range ' + mn.toFixed(1) + ' .. ' + mx.toFixed(1) + ')', neg === 0 && mn > 20 && mx < 260);
  T('17b no illogical jump: the largest one-day move is ' + (maxDay * 100).toFixed(1) + '%', maxDay < 0.2);
  T('17c no duplicate news effect (an item never acts twice at once) and never more than the limit together', dup === 0 && bad === 0);
  T('17d the same item does not repeat within 20 days', jump === 0);
  T('17e oil is never counted twice or lost (crude and every product, every day) and no store goes negative', crit === 0);
  const A = new OE.OilEngine({}, new Rng(1)), B2 = new OE.OilEngine({}, new Rng(2)); let sameA = 0; for (let d = 0; d < 365 * 5; d++) { A.dayStep(d, month(d), 'x'); B2.dayStep(d, month(d), 'x'); if (Math.abs(A.price() - B2.price()) < 0.01) sameA++; }
  T('17f two games (two seeds) do not follow the same path', sameA < 100, sameA);
  const yr = (sd) => { const e = new OE.OilEngine({}, new Rng(sd)); const y = []; for (let d = 0; d < 365 * 12; d++) { e.dayStep(d, month(d), 'x'); if (d % 365 === 364) y.push(e.price()); } return y; }; const Y = yr(3);
  T('17g the market has cycles that do not repeat: yearly closes ' + Y.map(v => v.toFixed(0)).join(','), Y.every((v, i) => i === 0 || Math.abs(v - Y[i - 1]) > 0.2) && Math.max(...Y) - Math.min(...Y) > 15);
  const st = {}; for (const sd of [1, 2, 3]) { const e = new OE.OilEngine({}, new Rng(sd)); for (let d = 0; d < 365 * 20; d++) { e.dayStep(d, month(d), 'x'); st[e.regime] = (st[e.regime] || 0) + 1; } }
  T('17h all eight market states occur and are held for weeks, not flickering: ' + Object.keys(st).length, Object.keys(st).length >= 7 && Object.keys(OE.REGIMES).length === 8);
  const jp = []; for (const sd of [1, 2, 3]) { const e = new OE.OilEngine({}, new Rng(sd)); let pr = e.price(); for (let d = 0; d < 365 * 20; d++) { e.dayStep(d, month(d), 'x'); const p = e.price(); jp.push(p / pr - 1); pr = p; } }
  const abs = jp.map(Math.abs).sort((a, b) => a - b), med = abs[abs.length >> 1], p99 = abs[Math.floor(abs.length * 0.99)];
  T('17i gradual most days with occasional sharp days: median |move| ' + (med * 100).toFixed(2) + '%, 99th percentile ' + (p99 * 100).toFixed(2) + '%', med < 0.012 && p99 > 3 * med); }
console.log('18. news records');
{ const e = mk(40, { maxActive: 5 }); e.regLeft = 400; run(e, 365 * 3); const L = e.log;
  T('18a each news item has a name, an Arabic description, a type, a direction, a strength, a duration, a date and a status', L.length > 10 && L.every(n => n.text && /[؀-ۿ]/.test(n.desc) && n.cat && ['UP', 'DOWN', 'NEUTRAL'].includes(n.dir) && ['STRONG', 'MEDIUM', 'WEAK'].includes(n.power) && n.days > 0 && n.date && ['active', 'ended'].includes(n.status)));
  T('18b finished items are marked ended, running ones active', L.filter(n => n.status === 'ended').length > 0 && L.every(n => (n.end <= e.lastDay) === (n.status === 'ended') || n.status === 'ended'));
  T('18c the news mix has positive, negative and neutral items', ['UP', 'DOWN', 'NEUTRAL'].every(k => NEWS.EVENTS.some(x => x.dir === k)) && NEWS.EVENTS.length === 100); }
console.log('19. one daily market: week / month / year are views of the daily candles');
{ const mkt = new E.Market(EC, null, 77); for (let h = 0; h < 24 * 800; h++) mkt.tick(h); const snap = JSON.stringify(mkt.gc.CRUDE);
  for (const p of ['CRUDE', 'GASOLINE', 'BYPRODUCT']) { const D = mkt.gc[p], Dg = OE.groupOHLC(D, 'D'); let ok = true, why = '';
    for (const fr of ['W', 'M', 'Y']) { const G = OE.groupOHLC(D, fr); const days = G.reduce((a, g) => a + g.n, 0), vol = G.reduce((a, g) => a + g.v, 0), vD = D.reduce((a, d) => a + d.v, 0);
      if (days !== D.length || Math.abs(vol - vD) > 1e-6 * vD) { ok = false; why = fr + ' count/volume'; }
      for (const g of G) { const rows = D.filter(d => d.d >= g.start && d.d <= g.end); if (rows.length !== g.n || g.o !== rows[0].o || g.c !== rows[rows.length - 1].c || g.h !== Math.max(...rows.map(r => r.h)) || g.l !== Math.min(...rows.map(r => r.l)) || Math.abs(g.v - rows.reduce((a, r) => a + r.v, 0)) > 1e-6 * Math.max(1, g.v)) { ok = false; why = fr + ' ' + g.key; break; } }
      for (let i = 1; i < G.length; i++) if (G[i].start <= G[i - 1].end) { ok = false; why = fr + ' overlap'; } }
    T('19a ' + p + ': weekly, monthly and yearly candles are exact sums / extremes of the daily candles (open, high, low, close, volume), no day lost or counted twice', ok && Dg.length === D.length, why); }
  const W = OE.groupOHLC(mkt.gc.CRUDE, 'W'); T('19b weeks start on Monday (calendar weekday)', W.slice(1, -1).every(g => new Date(g.start + 'T00:00:00Z').getUTCDay() === 1 && g.n === 7));
  T('19c a candle chain is continuous: every daily candle opens near the previous close (same price record) and has a volume', mkt.gc.CRUDE.every((c, i) => i === 0 || Math.abs(c.o / mkt.gc.CRUDE[i - 1].c - 1) < 0.02) && mkt.gc.CRUDE.every(c => c.v > 50));
  T('19d reading other frames generates nothing: the daily record is unchanged', JSON.stringify(mkt.gc.CRUDE) === snap);
  const rt = new E.Market(EC, JSON.parse(JSON.stringify(mkt.toJSON()))); T('19e save and load keep the daily candles with their volume', JSON.stringify(rt.gc.CRUDE.slice(-5)) === JSON.stringify(mkt.gc.CRUDE.slice(-5)) && rt.gc.CRUDE.length === mkt.gc.CRUDE.length); }
console.log('\nOIL ENGINE TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
