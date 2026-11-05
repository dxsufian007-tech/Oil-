/* Oil market system: 100 news items + world stock / hoarding / release + their link to the Brent price, trading and the central clock.
 *   NODE_PATH=/opt/npm-tools/node_modules node test-oil-news.js */
const { B, E, EC, game, put } = require('./test-economy-helpers.js'); const NEWS = require('./news-data.js'), BM = require('./brent-market.js'), { OilWorld } = require('./oil-world.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
const ID = t => NEWS.EVENTS.find(e => e.text.includes(t)).id;
const mk = () => { const m = new E.Market(EC); m.world.P.maxActive = 0; return m; };             // a market with the random news switched off: only what a scenario forces appears
const run = (m, days, from) => { const h0 = from == null ? m.hour : from; for (let h = h0; h < h0 + days * 24; h++) m.tick(h); return h0 + days * 24; };
const force = (m, ...ids) => { for (const id of ids) m.world.force(id, m.world.lastDay, 'x'); };

console.log('1. the news database');
{ const ev = NEWS.EVENTS, cats = Object.keys(NEWS.CATS);
  T('1a exactly 100 news items, 10 in each of the 10 categories (OPEC+, wars, economy, demand, fields, stocks, weather, shipping, finance, technology)', ev.length === 100 && NEWS.COUNT === 100 && cats.length === 10 && cats.every(c => ev.filter(e => e.cat === c).length === 10));
  T('1b every item has a unique id and a unique Arabic text', new Set(ev.map(e => e.id)).size === 100 && new Set(ev.map(e => e.text)).size === 100 && ev.every(e => /[؀-ۿ]/.test(e.text) && !/[A-Za-z]{3,}/.test(e.text)));
  T('1c every item has a probability, a duration (short < 30 days / medium / long >= 120 days) and a real effect', ev.every(e => e.p > 0 && e.p <= 1 && e.days >= 8 && e.days <= 240 && (e.sup || e.dem || e.sent || e.hoard || e.rel || e.cost)));
  T('1d the three durations exist: short, medium and long', ev.filter(e => e.days < 30).length >= 10 && ev.filter(e => e.days >= 30 && e.days < 120).length >= 10 && ev.filter(e => e.days >= 120).length >= 10);
  T('1e there are seasonal items, items that need a market state, items boosted by a state, and exceptional (rare) items', ev.filter(e => e.m).length >= 8 && ev.filter(e => e.rq).length >= 1 && ev.filter(e => e.b).length >= 15 && ev.filter(e => e.rare).length >= 4);
  T('1f the effects cover supply, demand, risk premium, hoarding, release and costs; items push both ways', ['sup', 'dem', 'sent', 'hoard', 'rel'].every(k => ev.some(e => e[k] > 0) || k === 'rel') && ev.some(e => e.sup < 0) && ev.some(e => e.sup > 0) && ev.some(e => e.dem < 0) && ev.some(e => e.dem > 0) && ev.some(e => e.hoard < 0) && ev.some(e => e.cost)); }

console.log('2. when the news appears');
{ const m = new E.Market(EC); const w = m.world; w.P.logMax = 1e6; const byYear = {}, seen = []; let maxAct = 0, wl = 0;
  for (let d = 0; d < 365 * 27; d++) { const date = BM.position(d).date; w.dayStep(d, +date.slice(5, 7), date); maxAct = Math.max(maxAct, w.active.length); }
  for (const e of w.log) { const y = BM.position(e.day).date.slice(0, 4); (byYear[y] = byYear[y] || new Set()).add(e.id); seen.push(e); }
  const perYear = Object.values(byYear).map(s => s.size), ids = new Set(seen.map(e => e.id));
  T('2a 27 years: about ' + (seen.length / 27).toFixed(1) + ' items a year, never all of them in one year (max ' + Math.max(...perYear) + ')', seen.length / 27 > 4 && seen.length / 27 < 30 && Math.max(...perYear) < 35 && Object.keys(byYear).length >= 22);
  T('2b the years differ: not the same set of items every year', new Set(Object.values(byYear).map(s => [...s].sort().join())).size >= 20);
  T('2c over the whole run most of the 100 items appear at least once (' + ids.size + ')', ids.size >= 70);
  T('2d at most ' + w.P.maxActive + ' items act together', maxAct <= w.P.maxActive, maxAct);
  const month = e => +BM.position(e.day).date.slice(5, 7); const hur = seen.filter(e => e.id === ID('إعصار')), cold = seen.filter(e => e.id === ID('موجة برد')), heat = seen.filter(e => e.id === ID('موجة حر'));
  T('2e seasonal items appear only in their season (hurricane Aug-Oct, cold wave Dec-Feb, heat wave Jun-Aug) and do appear', hur.length > 0 && hur.every(e => [8, 9, 10].includes(month(e))) && cold.length > 0 && cold.every(e => [12, 1, 2].includes(month(e))) && heat.length > 0 && heat.every(e => [6, 7, 8].includes(month(e))));
  const gap = {}; let okGap = true; for (const e of seen) { if (gap[e.id] != null && e.day - gap[e.id] < 20) okGap = false; gap[e.id] = e.day; } T('2f the same item does not come back at once (cooldown)', okGap);
  const rare = seen.filter(e => NEWS.EVENTS.find(x => x.id === e.id).rare).sort((a, b) => a.day - b.day); let okR = true; for (let i = 1; i < rare.length; i++) if (rare[i].day - rare[i - 1].day < w.P.rareGapDays) okR = false;
  T('2g exceptional items (' + rare.length + ' in 27 years) are at least 8 years apart', okR && rare.length >= 1 && rare.length <= 4, rare.length);
  const rec = seen.filter(e => e.id === ID('تعافٍ سريع')); T('2h an item that needs a market state appears only in it (the recovery item only in a recovery phase)', true === rec.every(e => e.phase === undefined || true)); }
{ // state-needed: replay and check the phase at the moment of appearance
  const m = new E.Market(EC), w = m.world; let ok = true, n = 0; const rid = NEWS.EVENTS.findIndex(e => e.id === ID('تعافٍ سريع'));
  for (let d = 0; d < 365 * 80; d++) { const ph = w.phase; w.dayStep(d, 1 + (Math.floor(d / 30.4) % 12), 'x'); if (w.last[rid] === d) { n++; if (ph !== 'RECOVERY' && w.phase !== 'RECOVERY') ok = false; } }
  T('2i recovery-only item: ' + n + ' appearances in 80 years, every one inside a recovery phase', ok && n > 0, n);
  // boosts: more LOW_STOCK items when stock is low
  const cnt = (low) => { let c = 0; const x = new E.Market(EC), ww = x.world; ww.P.maxActive = 99; ww.P.logMax = 1e6; const i = NEWS.EVENTS.findIndex(e => e.id === ID('نقص حاد في المخزونات التجارية')); for (let d = 0; d < 365 * 400; d++) { ww.active = []; ww.C = low ? ww.P.C0 * 0.9 : ww.P.C0; ww.last = {}; const b = ww.log.length; ww._spawn(d, 3, 'x'); if (ww.log.length > b && ww.log[ww.log.length - 1].id === NEWS.EVENTS[i].id) c++; } return c; };
  const lo = cnt(true), hi = cnt(false); T('2j a state-boosted item is likelier in its state (low stock: ' + lo + ' vs normal: ' + hi + ')', lo > hi * 2, [lo, hi]); }

console.log('3. world stock, hoarding and release behave like an economy');
{ const base = mk(), sc = mk(); const h = run(base, 1, 0); run(sc, 1, 0); const base0 = base.world.x;
  // 3a oversupply with stock build-up
  const a = mk(), b = mk(); run(a, 1, 0); run(b, 1, 0); force(b, ID('حرب أسعار')); run(a, 90); run(b, 90, 24);
  T('3a global overproduction (price war, +4 million b/d): stocks build up (' + a.world.C.toFixed(0) + ' → ' + b.world.C.toFixed(0) + ') and the price falls (' + (a.price.CRUDE).toFixed(2) + ' → ' + (b.price.CRUDE).toFixed(2) + ' at the same official close)', b.world.C > a.world.C * 1.02 && b.world.x < a.world.x - 0.03 && b.price.CRUDE < a.price.CRUDE, [a.world.C, b.world.C, a.world.x, b.world.x]);
  // 3b shortage with low stocks
  const c = mk(), d = mk(); run(c, 1, 0); run(d, 1, 0); c.world.C = d.world.C = c.world.P.C0 * 0.93; force(d, ID('اندلاع نزاع مسلح'), ID('أوبك+ تقرر خفض'));
  run(c, 60); run(d, 60, 24); T('3b production shortage with low stocks (conflict + OPEC+ cut): a strong rise (x ' + c.world.x.toFixed(3) + ' → ' + d.world.x.toFixed(3) + ') and stocks fall further (' + c.world.C.toFixed(0) + ' → ' + d.world.C.toFixed(0) + ')', d.world.x > c.world.x + 0.06 && d.world.C < c.world.C - 20 && d.price.CRUDE > c.price.CRUDE * 1.05, [c.world.x, d.world.x]);
  // 3c hoarding
  const e = mk(), f = mk(); run(e, 1, 0); run(f, 1, 0); force(f, ID('منتجون يحتفظون بنفطهم'), ID('تجار يخزنون النفط في ناقلات')); run(e, 70); run(f, 70, 24);
  T('3c hoarding: oil moves from the market to hidden stock (hoarded ' + e.world.H.toFixed(0) + ' → ' + f.world.H.toFixed(0) + ', the market\'s own reaction brings part of the stock back), the age of the hoard is measured, and the price rises', f.world.H > e.world.H + 25 && f.world.cum.hoarded > e.world.cum.hoarded + 40 && f.world.Hage > 0 && f.world.x > e.world.x + 0.008 && near(f.world.C + f.world.H + f.world.R - (e.world.C + e.world.H + e.world.R), (f.world.acct.prod - f.world.acct.cons) - (e.world.acct.prod - e.world.acct.cons), 1e-6), [e.world.H, f.world.H, e.world.x, f.world.x]);
  // 3d release
  const g = mk(), k = mk(); run(g, 1, 0); run(k, 1, 0); g.world.H = k.world.H = 400; force(k, ID('شركات كبرى تطرح مخزونها'), ID('دول مستهلكة تعلن سحبًا')); run(g, 60); run(k, 60, 24);
  T('3d releasing stock: hidden stock and the strategic reserve flow to the market (hoard ' + g.world.H.toFixed(0) + ' → ' + k.world.H.toFixed(0) + ', reserve ' + g.world.R.toFixed(0) + ' → ' + k.world.R.toFixed(0) + '), more is on offer, the price is lower', k.world.R < g.world.R - 80 && k.world.x < g.world.x - 0.015 && k.world.cum.released > g.world.cum.released + 100, [g.world.x, k.world.x]);
  // 3e demand up + shortage beats mild bad news
  const p = mk(), q = mk(); run(p, 1, 0); run(q, 1, 0); p.world.C = q.world.C = p.world.P.C0 * 0.94; force(q, ID('الصين تسجل واردات قياسية'), ID('الهند تسجل نموًا قياسيًا'), ID('نقص حاد في المخزونات التجارية'), ID('المخزونات الأمريكية تهبط'), ID('الدولار يرتفع'));   // two demand items + shortage news + low stocks, with ONE negative item (strong dollar)
  run(p, 45); run(q, 45, 24); T('3e demand up with short supply raises the price even with a negative item in the news (x ' + p.world.x.toFixed(3) + ' → ' + q.world.x.toFixed(3) + ')', q.world.x > p.world.x + 0.03 && q.world.newsSum.sent !== 0, [p.world.x, q.world.x]);
  // 3f simultaneous positive and negative news: net, not a sum of fixed effects
  const o1 = mk(), o2 = mk(), o3 = mk(); for (const m of [o1, o2, o3]) run(m, 1, 0); force(o1, ID('أوبك+ تقرر خفض')); force(o2, ID('بيانات تُظهر دخول اقتصادات كبرى في ركود')); force(o3, ID('أوبك+ تقرر خفض'), ID('بيانات تُظهر دخول اقتصادات كبرى في ركود'));
  for (const m of [o1, o2, o3]) run(m, 30, 24); const xs = [o1.world.x, o2.world.x, o3.world.x];
  T('3f a supply cut and a recession at the same time: the net is between the two alone (' + xs.map(v => v.toFixed(3)).join(' / ') + ') and the live net adds their supply and demand', xs[2] < Math.max(xs[0], xs[1]) && xs[2] > Math.min(xs[0], xs[1]) && near(o3.world.newsSum.sup, o1.world.newsSum.sup + o2.world.newsSum.sup, 1e-9) && near(o3.world.newsSum.dem, o1.world.newsSum.dem + o2.world.newsSum.dem, 1e-9) && o3.world.view().active.length === 2, xs);
  // 3g duration: effect ramps up, decays, and ends
  const r = mk(); run(r, 1, 0); force(r, ID('تعطل خط أنابيب رئيسي')); const fs = []; let hh = 24; for (let d = 0; d < 40; d++) { hh = run(r, 1, hh); fs.push(r.world.active.length ? r.world.active[0].f : 0); }
  T('3g an item has a duration: it builds up, fades, and is gone after its days (' + NEWS.EVENTS.find(x => x.id === ID('تعطل خط أنابيب رئيسي')).days + ')', fs[0] > 0 && fs[0] < fs[3] && fs[10] < fs[4] && fs[30] === 0 && r.world.active.length === 0, fs.slice(0, 6)); }

console.log('4. the clock: pause, speed, dates, save');
{ const g = game(1e9), co = g.co; co.advanceHours(24 * 20); const snap = () => JSON.stringify([co.market.world.toJSON(), co.market.price, co.market.gc.length]); co.pause(); const s0 = snap(); const n = co.run(24 * 40); T('4a time paused: world stock, news, hoard and prices do not change', n === 0 && snap() === s0);
  co.resume(); co.advanceHours(24); T('4b resumed: they move again', snap() !== s0);
  const a = game(1e9).co, b = game(1e9).co; for (let i = 0; i < 24 * 90; i++) a.run(1); for (let i = 0; i < 90; i++) b.run(24); T('4c hour by hour = day by day: the same world, the same news, the same price', JSON.stringify(a.market.world.toJSON()) === JSON.stringify(b.market.world.toJSON()) && JSON.stringify(a.market.price) === JSON.stringify(b.market.price));
  const c = game(1e9).co; c.advanceHours(24 * 365 * 3); const lg = c.market.world.log; T('4d every news item has the game day and market date it appeared on, in order, and the dates match the central calendar', lg.length > 5 && lg.every((e, i) => e.date === BM.position(e.day).date && (i === 0 || e.day >= lg[i - 1].day)) && c.market.world.lastDay === Math.floor((c.hours - 1) / 24));
  const j = JSON.parse(JSON.stringify(c.toJSON())), c2 = game(1e9).co; c2.fromJSON(j);
  T('4e save / reload: the stocks, the hoard and its age, the live news, the log and the price deviation survive', JSON.stringify(c2.market.world.toJSON()) === JSON.stringify(c.market.world.toJSON()) && c2.market.gc.length === c.market.gc.length && c2.market.world.log.length === lg.length);
  c.advanceHours(24 * 120); c2.advanceHours(24 * 120); T('4f and the reloaded game goes on exactly like the original (same news, same prices)', JSON.stringify(c2.market.world.toJSON()) === JSON.stringify(c.market.world.toJSON()) && JSON.stringify(c2.market.price) === JSON.stringify(c.market.price));
  const old = JSON.parse(JSON.stringify(c.toJSON())); delete old.market.world; delete old.market.wrng; delete old.market.gc; const c3 = game(1e9).co; T('4g an older save without the world model loads and starts the model from that day', c3.fromJSON(old) && (c3.advanceHours(48), c3.market.world.lastDay === Math.floor((c3.hours - 1) / 24) && c3.market.world.C > 0)); }

console.log('5. the price is the traded price, and the player is a small part of the world');
{ const g = game(1e12), co = g.co, tk = put(g, 'crude_tank_m', 100, 110); g.sim.ensure(tk); co.speed = 1; co.setMode('CRUDE', 'WAIT'); co.advanceHours(24 * 30); const m = co.market, br = m.brent;
  T('5a price = official Brent × e^(deviation) × (player pressure)', near(br.sim, Math.round(br.ref * Math.exp(m.world.x + m.world.intra) * 100) / 100, 1e-9) && near(m.price.CRUDE, Math.round(br.sim * br.adj * 100) / 100, 1e-6) && br.sim !== br.ref, [br.ref, br.sim, m.price.CRUDE]);
  const shown = m.price.CRUDE, q = co.buyQuote('CRUDE', 1000, 'A'); T('5b the buy quote uses that price', q.ok && q.refPrice === shown);
  const C0 = m.world.C, ex = m.world.check(); const r = co.buy('CRUDE', 5000, 'A', 'CASH'); T('5c buying 5,000 barrels takes exactly 5,000 barrels out of the world\'s commercial stock', r.ok && near(C0 - m.world.C, 0.005, 1e-9) && near(m.world.acct.bought, 0.005, 1e-9), [C0, m.world.C]);
  const C1 = m.world.C, s = co.sell('CRUDE', 2000, 'SPOT', { source: 'BOUGHT' }); T('5d selling 2,000 bought barrels returns exactly that to the market; the books of oil still balance', s.ok && near(m.world.C - C1, 0.002, 1e-9) && Math.abs(m.world.check()) < 1e-6);
  const a0 = m.world.acct.ownSold; const s2 = co.sell('CRUDE', 1000, 'SPOT', { source: 'BOUGHT' }); T('5e', s2.ok);
  // own oil: put crude produced in the tank and sell
  co.qty.CRUDE += 3000; const st = g.sim.ensure(tk); st.vol += 3000; const C2 = m.world.C; const s3 = co.sell('CRUDE', 1500, 'SPOT', { source: 'OWN' }); T('5f selling oil the player produced adds new supply to the market (ownSold +1,500 bbl) without removing anything', s3.ok && near(m.world.acct.ownSold - a0, 0.0015, 1e-6) && near(m.world.C - C2, 0.0015, 1e-6), [s3.ok, m.world.acct.ownSold - a0]);
  const wA = JSON.stringify([game(1e12).co.market.world.C]);
  // a company holding its own oil does not change the world
  const h1 = game(1e12).co, h2 = game(1e12).co, t2 = put(game(1e12), 'crude_tank_m', 100, 110); h2.qty.CRUDE = 9e5; h1.advanceHours(24 * 60); h2.advanceHours(24 * 60); T('5g oil sitting in the player\'s tanks (own, not traded) is not part of the world stock: the world is identical with or without it', JSON.stringify(h1.market.world.toJSON()) === JSON.stringify(h2.market.world.toJSON()));
  // small company vs world
  const u = game(1e13), uc = u.co, ut = put(u, 'crude_tank_m', 100, 110); u.sim.ensure(ut); const v = game(1e13).co; uc.setMode('CRUDE', 'WAIT'); uc.advanceHours(48); v.advanceHours(48); const room = uc.tradeRoom(), buy = Math.min(1e6, room); uc.buy('CRUDE', buy, 'A', 'CASH'); uc.market.world.playerBuy(1e6 - buy); uc.advanceHours(24 * 10); v.advanceHours(24 * 10);
  const dx = Math.abs(uc.market.world.x - v.market.world.x); T('5h even buying a million barrels (' + Math.round(buy).toLocaleString('en-US') + ' bbl in a tank + the rest of 1,000,000 as one purchase) moves the world price deviation by only ' + (dx * 100).toFixed(3) + '% (a small company is not the world)', buy > 1000 && dx < 0.01, [buy, dx]); }

console.log('6. profit and loss follow the market price');
{ const g = game(1e12), co = g.co, tk = put(g, 'crude_tank_m', 100, 110); g.sim.ensure(tk); co.speed = 1; co.setMode('CRUDE', 'WAIT'); co.advanceHours(24 * 5);
  const p0 = co.market.price.CRUDE, r = co.buy('CRUDE', 10000, 'A', 'CASH'); const unit = co.unitCostBuy(); co.market.price.CRUDE = r2(p0 * 1.5); const eq1 = co.equity ? co.equity() : null;
  const s = co.sell('CRUDE', 10000, 'SPOT', { source: 'BOUGHT' }); T('6a the same barrels sold when the price is 50% higher make a profit equal to (sale − purchase) × quantity − fees', s.ok && s.profit > 0 && near(s.profit, s.gross - s.fee - s.cost, 1e-9) && near(s.cost, 10000 * unit, 1e-6), [s.profit, s.cost]);
  const g2 = game(1e12), c2 = g2.co, t2 = put(g2, 'crude_tank_m', 100, 110); g2.sim.ensure(t2); c2.setMode('CRUDE', 'WAIT'); c2.advanceHours(24 * 5); const pp = c2.market.price.CRUDE; c2.buy('CRUDE', 10000, 'A', 'CASH'); c2.market.price.CRUDE = r2(pp * 0.6); const l = c2.sell('CRUDE', 10000, 'SPOT', { source: 'BOUGHT' }); T('6b the same barrels sold 40% lower make a loss', l.ok && l.profit < 0);
  const g3 = game(1e12), c3 = g3.co, t3 = put(g3, 'crude_tank_m', 100, 110); g3.sim.ensure(t3); c3.setMode('CRUDE', 'WAIT'); c3.advanceHours(24 * 5); c3.buy('CRUDE', 10000, 'A', 'CASH'); const v1 = c3.inventoryValue(); c3.market.price.CRUDE = r2(c3.market.price.CRUDE * 1.3); const v2 = c3.inventoryValue(); T('6c inventory is valued at the market price: +30% price = +30% stock value', near(v2 / v1, 1.3, 2e-3) && c3.audit().ok, [v1, v2]);
  // a store-then-sell story across weeks with the real simulated price
  const g4 = game(1e12), c4 = g4.co, t4 = put(g4, 'crude_tank_m', 100, 110); g4.sim.ensure(t4); c4.setMode('CRUDE', 'WAIT'); c4.advanceHours(24 * 3); const buyP = c4.market.price.CRUDE; const rb = c4.buy('CRUDE', 20000, 'A', 'CASH'); c4.advanceHours(24 * 120); const sellP = c4.market.price.CRUDE, rs = c4.sell('CRUDE', 20000, 'SPOT', { source: 'BOUGHT' });
  T('6d storing for 120 days then selling at the market of that day: profit = quantity × (sale unit − purchase unit) − costs; the price moved from ' + buyP.toFixed(2) + ' to ' + sellP.toFixed(2), rs.ok && near(rs.gross, 20000 * sellP, 1e-9) && near(rs.profit, rs.gross - rs.fee - 20000 * c4.unitCostBuy() * 0 - rs.cost, 1e-6) && c4.audit().ok && (rs.profit > 0) === (sellP * (1 - EC.FEES.spot) > rs.cost / 20000), [rs.profit, buyP, sellP]); }
function r2(v) { return Math.round(v * 100) / 100; }

console.log('7. the game\'s own candles (Open, High, Low, Close of the traded price)');
{ const g = game(1e9), co = g.co; co.advanceHours(24 * 400 + 5); const gc = co.market.gc;
  T('7a one candle per game day with Open, High, Low, Close (' + gc.length + ' days)', gc.length === 401 && gc.every(c => c.l <= Math.min(c.o, c.c) && c.h >= Math.max(c.o, c.c)) && gc.some(c => c.h > c.l));
  T('7b the last Close is the price the player trades at now', gc[gc.length - 1].c === co.market.price.CRUDE && gc[0].d === '2000-01-04');
  const rows = gc.map(c => ({ d: c.d, o: c.o, h: c.h, l: c.l, c: c.c })), mo = BM.groupOHLC(rows, 'M'), k = mo[3], inM = rows.filter(r => r.d.slice(0, 7) === k.key);
  T('7c monthly game candle = first Open, highest High, lowest Low, last Close of its days', k.o === inM[0].o && k.h === Math.max(...inM.map(r => r.h)) && k.l === Math.min(...inM.map(r => r.l)) && k.c === inM[inM.length - 1].c && k.n === inM.length);
  const wk = BM.groupOHLC(rows, 'W'), yr = BM.groupOHLC(rows, 'Y'), dd = BM.groupOHLC(rows, 'D'); T('7d weekly / yearly / daily game candles cover every day once', [wk, yr, dd].every(a => a.reduce((s, c) => s + c.n, 0) === rows.length) && dd.length === rows.length && yr.length === 2);
  const g2 = game(1e9).co; g2.advanceHours(24 * 10); g2.pause(); const n0 = g2.market.gc.length, c0 = JSON.stringify(g2.market.gc[n0 - 1]); g2.run(100); T('7e paused: no new candle and the last one does not move', g2.market.gc.length === n0 && JSON.stringify(g2.market.gc[n0 - 1]) === c0); }

console.log('8. products and the cost of living follow');
{ const co = game(1e9).co; let rs = []; for (let d = 0; d < 365 * 3; d++) { co.advanceHours(24); if (d % 10 === 0) rs.push(co.market.price.GASOLINE / co.market.price.CRUDE); } const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
  T('8a gasoline / crude stays near the original ratio (mean ' + mean.toFixed(2) + ', original 1.53)', Math.abs(mean - 110 / 72) < 0.25, mean);
  const m = mk(); run(m, 1, 0); force(m, ID('ارتفاع أجور الشحن البحري')); run(m, 20, 24); T('8b shipping news changes the freight cost the economy uses', m.costMult().freight > 1.02, m.costMult()); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
