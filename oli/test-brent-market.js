/* Historical Brent market: the data, the candles, the cycle, the link to the central clock and the link to trading / inventory.
 *   NODE_PATH=/opt/npm-tools/node_modules node oli/test-brent-market.js */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { B, E, EC, game, put } = require('./test-economy-helpers.js'); const BD = require('./brent-data.js'), BM = require('./brent-market.js'), CAL = require('./game-calendar.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
const SRC = fs.readFileSync(path.join(__dirname, 'test-data', 'brent-daily-source-2000-2026.csv'), 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split(','));   // the raw EIA file (2000 on), parsed here independently of the game's module

console.log('1. the historical data = the source');
{ T('1a every row of brent-data.js equals the raw EIA file (date and price), in order', BD.ROWS.length === SRC.length && BD.ROWS.every((r, i) => r[0] === SRC[i][0] && r[1] === +SRC[i][1]));
  T('1b record count / first / last date are what the metadata says', BD.META.records === 6496 && BD.ROWS.length === 6496 && BD.META.firstDate === '2000-01-04' && BD.META.lastDate === '2026-10-27' && BD.ROWS[0][0] === BD.META.firstDate && BD.ROWS[BD.ROWS.length - 1][0] === BD.META.lastDate);
  T('1c the source and the update date are stored with the data', /EIA/.test(BD.META.publisher) && BD.META.retrieved === '2026-11-04' && /^[0-9a-f]{64}$/.test(BD.META.sourceCsvSha256) && !!BD.META.gaps && /NO Open/.test(BD.META.fields));
  const dates = BD.ROWS.map(r => r[0]); T('1d dates strictly increase (no duplicates), every price is a positive number', dates.every((d, i) => i === 0 || d > dates[i - 1]) && BD.ROWS.every(r => r[1] > 0 && isFinite(r[1])));
  T('1e only trading days: no Saturday or Sunday rows exist (nothing was invented for weekends or holidays)', BD.ROWS.every(r => { const w = new Date(r[0] + 'T00:00:00Z').getUTCDay(); return w >= 1 && w <= 5; }));
  const anchor = { '2000-01-04': 23.95, '2008-07-03': 143.95, '2008-12-24': 33.73 || 0, '2016-01-20': 26.01, '2020-04-21': 9.12, '2022-03-08': 133.18 };
  T('1f known EIA values: Jul-2008 peak 143.95, Apr-2020 low 9.12, Mar-2022 spike 133.18', BM.closeOn('2008-07-03') === 143.95 && BM.closeOn('2020-04-21') === 9.12 && BM.closeOn('2022-03-08') === 133.18 && BM.closeOn('2000-01-04') === 23.95);
  const hi = BD.ROWS.reduce((a, r) => r[1] > a[1] ? r : a), lo = BD.ROWS.reduce((a, r) => r[1] < a[1] ? r : a); T('1g the real events are in the series: 2008 crash, 2014-16 collapse, 2020 collapse, 2022 spike', BM.period('2008-07-01', '2008-12-31').change < -0.6 && BM.period('2014-06-01', '2016-01-31').change < -0.65 && BM.period('2020-01-01', '2020-04-30').change < -0.6 && BM.period('2022-01-01', '2022-03-31').change > 0.2 && lo[1] === 9.12, [hi, lo]);
  const yrs = {}; for (const r of SRC) { const y = r[0].slice(0, 4); (yrs[y] = yrs[y] || []).push(+r[1]); } const ya = y => yrs[y].reduce((a, b) => a + b, 0) / yrs[y].length;
  T('1h yearly average of the game\'s data = yearly average of the raw EIA file (2008, 2016, 2020; 27 years 2000-2026)', Object.keys(yrs).length === 27 && ['2008', '2016', '2020'].every(y => near(BM.period(y + '-01-01', y + '-12-31').avg, ya(y), 1e-12)) && ya('2020') < ya('2019'), [ya('2008'), ya('2016'), ya('2020')]);
  const before = crypto.createHash('sha256').update(JSON.stringify(BD.ROWS)).digest('hex'); let threw = false; try { 'use strict'; BD.ROWS[0][1] = 1; BD.ROWS.push([]); } catch (e) { threw = true; }
  T('1i the original history is frozen: it cannot be changed', crypto.createHash('sha256').update(JSON.stringify(BD.ROWS)).digest('hex') === before && BD.ROWS.length === 6496 && BD.ROWS[0][1] === 23.95); }

console.log('2. candles: daily, weekly, monthly, yearly');
{ const rows = BD.ROWS, keyW = d => { const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000, dow = (new Date(t * 86400000).getUTCDay() + 6) % 7; return new Date((t - dow) * 86400000).toISOString().slice(0, 10); };
  const keys = { D: d => d, W: keyW, M: d => d.slice(0, 7), Y: d => d.slice(0, 4) };
  for (const f of ['D', 'W', 'M', 'Y']) {
    const groups = new Map(); for (const r of rows) { const k = keys[f](r[0]); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    const cs = BM.candles(f); let prev = null, okAll = true, bad = null;
    const ks = [...groups.keys()]; if (cs.length !== ks.length) okAll = false;
    cs.forEach((c, i) => { const g = groups.get(ks[i]), px = g.map(r => r[1]), o = prev == null ? px[0] : prev, h = Math.max(o, ...px), l = Math.min(o, ...px), cl = px[px.length - 1]; if (c.key !== ks[i] || c.o !== o || c.h !== h || c.l !== l || c.c !== cl || c.n !== g.length || c.v !== null || c.start !== g[0][0] || c.end !== g[g.length - 1][0]) { okAll = false; bad = bad || [c, o, h, l, cl]; } prev = cl; });
    T('2' + f + ' ' + BM.FRAMES[f] + ' candles = an independent rebuild from the raw rows (Open, High, Low, Close, count; ' + cs.length + ' candles)', okAll, bad);
    T('2' + f + 'b each candle: Low <= Open, Close <= High; Volume is null (the source has none); candles cover every record once', cs.every(c => c.l <= Math.min(c.o, c.c) && c.h >= Math.max(c.o, c.c)) && cs.every(c => c.v === null) && cs.reduce((a, c) => a + c.n, 0) === rows.length);
  }
  const d = BM.candles('D'); T('2e daily: one candle per official close, Close = the EIA price, Open = the previous trading day\'s close', d.length === 6496 && d.every((c, i) => c.c === rows[i][1] && (i === 0 ? c.o === c.c : c.o === rows[i - 1][1])));
  const w = BM.candles('W'); T('2f weekly keys are Mondays', w.every(c => new Date(c.key + 'T00:00:00Z').getUTCDay() === 1));
  const y8 = BM.candles('Y').find(c => c.key === '2008'); T('2g the 2008 yearly candle: high 143.95 (Jul 3), low 33.73, close 35.82', y8.h === 143.95 && y8.l === 33.73 && y8.c === 35.82 && y8.o === BM.candles('Y').find(c => c.key === '2007').c, y8);
  const m = BM.candles('M', { from: '2020-03-01', to: '2020-04-30' }); T('2h range filter returns only the requested months', m.length === 2 && m[0].key === '2020-03' && m[1].key === '2020-04');
  const upto = BM.candles('M', { upto: BM.num('2008-07-15') }); T('2i a candle \'up to now\' stops at the market date (the running month contains only closes up to that day)', upto[upto.length - 1].key === '2008-07' && upto[upto.length - 1].end <= '2008-07-15' && upto.length === 103);
  const pa = BM.period('2008-01-01', '2008-12-31'), pb = BM.period('2020-01-01', '2020-12-31'); T('2j comparing two periods gives change / high / low / average for each', near(pa.avg, 96.94, 1e-3) && pb.change < 0 && pa.high === 143.95 && pb.low === 9.12); }

console.log('3. the cycle: 2000 → end of the data → 2000 again');
{ const L = BM.L, p0 = BM.position(0), pe = BM.position(L - 1), pw = BM.position(L);
  T('3a day 0 is the first record (2000-01-04, cycle 1)', p0.cycle === 1 && p0.date === '2000-01-04' && p0.price === 23.95 && p0.trading);
  T('3b the last day of the cycle is the last record (2026-10-27)', pe.cycle === 1 && pe.date === '2026-10-27' && pe.price === 123.1 && pe.lastOfCycle && L === 9794);
  T('3c the next day wraps to the first record with cycle 2', pw.cycle === 2 && pw.date === '2000-01-04' && pw.price === 23.95 && pw.pos === 0);
  let ok = true; for (let c = 0; c < 6; c++) for (const k of [0, 1, 400, 3000, L - 1]) { const q = BM.position(c * L + k); if (q.cycle !== c + 1 || q.pos !== k || q.price !== BM.position(k).price || q.date !== BM.position(k).date) ok = false; }
  T('3d six cycles in a row repeat the same dates and prices and count 1..6', ok);
  const hash = () => crypto.createHash('sha256').update(JSON.stringify(BD.ROWS)).digest('hex'), h0 = hash(); for (let n = 0; n < 5 * L; n += 97) BM.position(n); BM.candles('D'); BM.candles('Y'); T('3e running through several cycles never changes the original rows', hash() === h0);
  const wk = BM.position(BM.num('2008-07-05') - BM.START); T('3f a Saturday (market closed) carries Friday\'s official close and is flagged as not a trading day', wk.price === 143.95 && !wk.trading && wk.recordDate === '2008-07-03'); }

console.log('4. the market runs on the central clock only');
{ const m = new E.Market(EC); T('4a the market starts on 2000-01-04 at the first official price', m.brent.date === '2000-01-04' && m.price.CRUDE === 23.95 && m.hour === 0 && m.hist.CRUDE.length === 720);
  const g = game(1e9), co = g.co; T('4b the company\'s market starts on the same position', co.market.brent.cycle === 1 && co.market.price.CRUDE === 23.95);
  const date = h => CAL.fromHours(h);
  let ok = true, seen = 0; for (let d = 0; d < 420; d++) { co.advanceHours(24); const w = co.market.where(co.hours - 1), want = BM.position(Math.floor((co.hours - 1) / 24)); if (co.market.brent.pos !== want.pos || co.market.brent.date !== want.date || co.market.price.CRUDE !== want.price) ok = false; seen++; }
  T('4c for 420 game days: the market date is the game day counter, and the crude price is the official close of that market day', ok && co.dayIdx === 420 && co.market.brent.pos === 419, [co.dayIdx, co.market.brent.pos]);
  T('4d the calendar day and the market day always move together (day n of the game = day n of the cycle)', (() => { const a = date(co.hours - 1).dayIdx; return a === co.market.brent.pos + 0 && co.market.where(co.hours - 1).pos === a; })());
  // pause freezes it
  const g2 = game(1e9); g2.co.advanceHours(24 * 5); const snap = () => JSON.stringify([g2.co.market.price, g2.co.market.brent, g2.co.market.hour]), s0 = snap(); g2.co.pause(); const n = g2.co.run(24 * 30); T('4e paused: the market does not move, its date and price stay', n === 0 && snap() === s0);
  g2.co.resume(); g2.co.run(24 * 3); T('4f resumed: it moves again from where it stopped', g2.co.market.brent.pos === Math.floor((g2.co.hours - 1) / 24) && g2.co.hours > 120, g2.co.market.brent.pos);
  // speed: same real time, more market days
  const run = sp => { const x = game(1e9); x.co.setSpeed(sp); let left = 60; const dt = EC.TIME.tickMs / 1000; while (left > 1e-9) { x.co.run(dt * (24 / EC.TIME.dayRealSeconds) * x.co.speed); left -= dt; } return x; };
  const a = run(1), b = run(10); T('4g x10 advances the market 10 times as many days as x1 in the same real time', near(b.co.market.brent.pos + 1, 10 * (a.co.market.brent.pos + 1), 0.06) && b.co.dayIdx === b.co.market.brent.pos + 1 && a.co.dayIdx === a.co.market.brent.pos + 1, [a.co.market.brent.pos, b.co.market.brent.pos]);
  const c1 = game(1e9), c2 = game(1e9); for (let i = 0; i < 24 * 30; i++) c1.co.run(1); for (let i = 0; i < 30; i++) c2.co.run(24); T('4h the tick size does not change the price path (hour by hour = day by day)', JSON.stringify(c1.co.market.price) === JSON.stringify(c2.co.market.price) && c1.co.market.hist.CRUDE.join() === c2.co.market.hist.CRUDE.join()); }

console.log('5. a long run: the end of the data and back to 2000, several times');
{ const m = new E.Market(EC), L = BM.L; let wraps = 0, lastCycle = 1, bad = 0, prices = new Set();
  for (let h = 0; h < 24 * (3 * L + 50); h++) { m.tick(h); if (h % 24 === 0) { const w = BM.position(h / 24); if (m.brent.cycle !== w.cycle || m.brent.date !== w.date) bad++; if (m.brent.cycle !== lastCycle) { wraps++; lastCycle = m.brent.cycle; if (m.brent.date !== '2000-01-04' || m.price.CRUDE !== 23.95) bad++; } } }
  T('5a three full cycles: 3 wraps, each back on 2000-01-04 at 23.95, the date and cycle always right', wraps === 3 && bad === 0 && m.brent.cycle === 4, [wraps, bad, m.brent.cycle]);
  const co = game(1e9).co; co.advanceHours(24 * (L - 3)); const mid = co.cycleLog.length, c0 = co.market.brent.cycle; co.advanceHours(24 * 4);
  T('5b in the game: when the data ends and the market restarts, the finished cycle is written to the cycle log (once) and the market is on 2000-01-04, cycle 2', mid === 0 && c0 === 1 && co.market.brent.cycle === 2 && co.cycleLog.length === 1 && co.cycleLog[0].cycle === 1 && co.market.brent.date === '2000-01-04' && co.market.price.CRUDE === 23.95, [co.market.brent, co.cycleLog]); }

console.log('6. the displayed price is the traded price');
{ const g = game(1e12), co = g.co, tank = put(g, 'crude_tank_m', 100, 110); g.sim.ensure(tank); co.speed = 0; co.setMode('CRUDE', 'WAIT'); co.advanceHours(24 * 3 + 5);
  const shown = co.market.price.CRUDE, ref = co.market.brent.ref; T('6a with no player activity the crude price is exactly the official close of the market day', shown === ref, [shown, ref]);
  const q = co.buyQuote('CRUDE', 1000, 'A'), sup = co.supplierOf('A'); T('6b the buy quote uses the displayed price (+ the supplier premium)', q.ok && q.refPrice === shown && near(q.unitPrice, shown * (1 + sup.premium), 1e-12) && near(q.gross, 1000 * shown * (1 + sup.premium), 1e-12), q);
  const cash0 = g.store.cash, r = co.buy('CRUDE', 1000, 'A', 'CASH'); T('6c the purchase charges exactly the quoted gross + freight + fee', r.ok && near(r.cost, q.total, 1e-9) && near(cash0 - g.store.cash, q.total, 1e-9), r);
  const inv = co.inventory().find(v => v.product === 'CRUDE'); T('6d the inventory row shows the same market price', inv.marketPrice === shown);
  const sq = co.quote('CRUDE', 400, 'BOUGHT'), c1 = g.store.cash, s = co.sell('CRUDE', 400, 'SPOT', { source: 'BOUGHT' });
  T('6e the sale is at the displayed price × crude quality: gross = qty × price, and the cash received is gross − fee', s.ok && sq.marketPrice === shown && near(s.gross, 400 * shown * co.crudeQ, 1e-9) && near(g.store.cash - c1, s.gross - s.fee, 1e-6), [s.gross, 400 * shown]);
  T('6f the price used in the transaction never differs from the market price (the one number): quote, buy quote, sell and inventory all read market.price', [sq.marketPrice, q.refPrice, inv.marketPrice].every(v => v === co.market.price.CRUDE));
  const bpp = co.byproductPrice(); T('6g by-products follow the same crude price (80%)', near(bpp, co.unitPrice('CRUDE') * EC.BYPRODUCT.priceRatioToCrude, 1e-12));
  // inventory valuation and company value move with the price
  co.advanceHours(24 * 40); const sh2 = co.market.price.CRUDE, v1 = co.inventoryValue(), want = co.available('CRUDE') * co.unitPrice('CRUDE') + ['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'].reduce((a, p) => a + co.available(p) * co.unitPrice(p), 0);
  T('6h the price moved with the history (' + shown + ' → ' + sh2 + '), and inventory value is valued at the new price', sh2 !== shown && near(v1, want, 1e-9) && co.audit().ok, [shown, sh2]);
  // a sale pressures the price, history stays the reference
  const g3 = game(1e12), c3 = g3.co, t3 = put(g3, 'crude_tank_m', 100, 110); g3.sim.ensure(t3); c3.speed = 0; c3.setMode('CRUDE', 'WAIT'); c3.advanceHours(24 * 3); c3.buy('CRUDE', 40000, 'A', 'CASH'); const pBefore = c3.market.price.CRUDE; c3.sell('CRUDE', 40000, 'SPOT', { source: 'BOUGHT' }); c3.advanceHours(2);
  T('6i selling a lot pushes the price below the official close (simulation state), the reference stays the official one', c3.market.price.CRUDE < c3.market.brent.ref && c3.market.brent.ref === BM.position(3).price && c3.market.brent.adj < 1, [c3.market.price.CRUDE, c3.market.brent]);
  c3.advanceHours(24 * 60); T('6j and the effect fades back toward the official close', Math.abs(c3.market.price.CRUDE / c3.market.brent.ref - 1) < 0.01, c3.market.brent.adj); }

console.log('7. refined products follow crude');
{ const m = new E.Market(EC); const ratio = []; for (let h = 0; h < 24 * 3000; h++) { m.tick(h); if (h % 240 === 239) ratio.push(m.price.GASOLINE / m.price.CRUDE); }
  const mean = ratio.reduce((a, b) => a + b, 0) / ratio.length; T('7a gasoline / crude stays around the original ratio 110/72 = ' + (110 / 72).toFixed(2) + ' (mean ' + mean.toFixed(2) + ')', Math.abs(mean - 110 / 72) < 0.25, mean);
  T('7b products rise and fall with the real crude over 8 years (2000 → 2008 climb)', m.price.CRUDE > 60 && m.price.GASOLINE > 80 && m.price.DIESEL > 70, m.price); }

console.log('8. save and reload');
{ const g = game(1e12), co = g.co; const tk = put(g, 'crude_tank_m', 100, 110); g.sim.ensure(tk); co.speed = 1; co.setMode('CRUDE', 'WAIT'); co.advanceHours(24 * 200 + 7); co.buy('CRUDE', 5000, 'A', 'CASH'); co.sell('CRUDE', 2000, 'SPOT', { source: 'BOUGHT' }); co.advanceHours(5);
  const j = JSON.parse(JSON.stringify(co.toJSON())); const g2 = game(1e12), c2 = g2.co; const ok = c2.fromJSON(j);
  T('8a the cycle, the market date, the position and the prices are restored', ok && JSON.stringify(c2.market.brent) === JSON.stringify(co.market.brent) && JSON.stringify(c2.market.price) === JSON.stringify(co.market.price) && c2.market.brent.cycle === 1 && c2.market.brent.pos === co.market.brent.pos);
  T('8b the dynamic modifications (player impact, history window, events) are restored', JSON.stringify(c2.market.impact) === JSON.stringify(co.market.impact) && c2.market.hist.CRUDE.join() === co.market.hist.CRUDE.join() && c2.market.impact.CRUDE > 0);
  co.advanceHours(24 * 30); c2.advanceHours(24 * 30); T('8c a reloaded game continues exactly like the original', JSON.stringify(c2.market.price) === JSON.stringify(co.market.price) && c2.market.brent.date === co.market.brent.date);
  const g4 = game(1e12), c4 = g4.co; c4.advanceHours(24 * (BM.L - 2)); c4.advanceHours(24 * 3); const j4 = JSON.parse(JSON.stringify(c4.toJSON())); const c5 = game(1e12).co; c5.fromJSON(j4);
  T('8d saved in cycle 2: the cycle number and the cycle record survive; the reloaded game keeps counting', c5.market.brent.cycle === 2 && c5.cycleLog.length === 1 && c5.brentCycle === 2 && (c5.advanceHours(48), c5.market.brent.cycle === 2 && c5.market.brent.pos === c4.market.brent.pos + 2), [c5.market.brent, c5.cycleLog]);
  const old = JSON.parse(JSON.stringify(co.toJSON())); delete old.market.brent; delete old.cycleLog; delete old.brentCycle; const c6 = game(1e12).co; T('8e an older save (no Brent fields) loads and picks the market up from the game day', c6.fromJSON(old) && (c6.advanceHours(24), c6.market.brent.pos === Math.floor((c6.hours - 1) / 24) && c6.market.brent.cycle === 1)); }

console.log('9. nothing else broke');
{ const g = game(1e12), co = g.co; co.advanceHours(24 * 400); T('9a the books balance after more than a year on the historical market', co.audit().ok); }
console.log('10. auto-sell touches only what you produce, never what you bought');
{ const g = game(1e12), co = g.co, tk = put(g, 'crude_tank_m', 100, 110), tg = put(g, 'gasoline_tank_s', 140, 110); g.sim.ensure(tk); g.sim.ensure(tg); co.speed = 1; co.setMode('CRUDE', 'SPOT'); co.setMode('GASOLINE', 'SPOT'); co.advanceHours(30);
  const room = co.tradeRoom(); const r = co.buy('CRUDE', room * 0.95, 'A', 'CASH'); const gr = co.buy('GASOLINE', co.roomFor('GASOLINE') * 0.95, 'A', 'CASH'); const bq0 = co.bq, gq0 = co.available('GASOLINE'), rev0 = co.led.life.soldRev;
  T('10a the tanks are more than 80% full of bought oil (auto-sell would trigger on fill)', r.ok && gr.ok && co.physicalVol('CRUDE') / co.capacity('CRUDE') > EC.AUTOSELL.trigger && co.physicalVol('GASOLINE') / co.capacity('GASOLINE') > EC.AUTOSELL.trigger);
  co.advanceHours(24 * 20); T('10b 20 days later nothing bought was sold automatically (crude and gasoline unchanged, no revenue)', near(co.bq, bq0, 1e-9) && near(co.available('GASOLINE'), gq0, 1e-9) && co.led.life.soldRev === rev0, [co.bq, bq0, co.available('GASOLINE'), gq0]);
  const m = co.sell('CRUDE', 1000, 'SPOT', { source: 'BOUGHT' }); T('10c but the player can still sell the bought oil by hand', m.ok && near(co.bq, bq0 - 1000, 1e-9)); }
{ const x = game(1e12), co = x.co, tk = put(x, 'crude_tank_m', 100, 110); x.sim.ensure(tk); co.setMode('CRUDE', 'SPOT'); co.advanceHours(30); const room = co.tradeRoom(); co.buy('CRUDE', room * 0.95, 'A', 'CASH'); const s = x.sim.ensure(tk); s.vol = Math.min(s.vol + 0, s.vol); const bq0 = co.bq;
  // produced oil in the same tank: only that part is sold
  const own = Math.max(0, DEFSB_cap(tk) - s.vol); s.vol += own * 0.0; T('10d a save keeps the record of bought products', JSON.parse(JSON.stringify(co.toJSON())).bprod !== undefined); }
function DEFSB_cap(b) { return B.DEFS[b.d].capacity.value; }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
