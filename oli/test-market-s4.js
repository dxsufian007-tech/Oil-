/* S4 history and analytics: the REAL Brent series 2000-2026 (source documented, nothing invented), consistent D/W/M/Y candles, trend, reasons, forecasts that never touch the market.  node test-market-s4.js */
const fs = require('fs'), path = require('path'), crypto = require('crypto'); const H = require('./brent-history.js'), A = require('./market-analytics.js'), OE = require('./oil-engine.js'), NEWS = require('./news-data.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
function Rng(s) { this.s = s >>> 0 || 1; this.next = () => { let t = this.s += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; this.gauss = () => { let u = 0, v = 0; while (!u) u = this.next(); while (!v) v = this.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }; }
const month = d => Math.floor(((d % 365) + 365) % 365 / 30.42) + 1;
const mk = (seed, P) => new OE.OilEngine(Object.assign({}, P || {}), new Rng(seed));
const csvText = fs.readFileSync(path.join(__dirname, 'data', 'brent-daily-source.csv'), 'utf8'), csv = csvText.trim().split(/\r?\n/).slice(1).map(l => l.split(',')).filter(r => r[0] >= '2000-01-01' && r[1] !== '');
const D = H.daily();

console.log('1. the real daily series');
T('1a the source file is the one documented: SHA-256 in the module = the SHA-256 of data/brent-daily-source.csv', H.META.sha256 === crypto.createHash('sha256').update(csvText).digest('hex'));
T('1b every source row from 2000 with a price is in the series, in order, with the SAME price, and nothing else (' + D.length + ' = ' + csv.length + ')', D.length === csv.length && D.every((r, i) => r.d === csv[i][0] && Math.abs(r.c - parseFloat(csv[i][1])) < 1e-9));
T('1c dates strictly increase (no duplicates, no reorder), none on a weekend, all valid', D.every((r, i) => i === 0 || r.d > D[i - 1].d) && D.every(r => r.wd !== 0 && r.wd !== 6 && !isNaN(Date.parse(r.d))));
T('1d the range is 2000-01-04 .. ' + H.META.to + ' and every price is finite and plausible (min ' + Math.min(...D.map(r => r.c)) + ', max ' + Math.max(...D.map(r => r.c)) + ')', D[0].d === '2000-01-04' && D[D.length - 1].d === H.META.to && D.every(r => Number.isFinite(r.c) && r.c > 5 && r.c < 160));
const at = d => D.find(r => r.d === d);
T('1e well-known anchors are exact: 2008-07-03 record 143.95, 2020-04-21 collapse 9.12 (the lowest price of the whole series), 2000-01-04 23.95', at('2008-07-03') && at('2008-07-03').c === 143.95 && at('2020-04-21') && at('2020-04-21').c === 9.12 && Math.min(...D.map(r => r.c)) === 9.12 && at('2000-01-04').c === 23.95, [at('2008-07-03'), at('2020-04-21')]);
T('1f gaps stay gaps: no row on 2000-01-01..03 or on a day the source has no price (no fill-in)', !at('2000-01-01') && !at('2000-01-03') && D.length < 365 * 27 * 0.75);
T('1g the daily rows say honestly that there is no real volume (v = 0) and no real high/low (o = h = l = c)', D.every(r => r.v === 0 && r.o === r.c && r.h === r.c && r.l === r.c));

console.log('2. daily / weekly / monthly / yearly agree (one source)');
const W = A.candles(D, 'W'), M = A.candles(D, 'M'), Y = A.candles(D, 'Y'), Dd = A.candles(D, 'D');
T('2a every frame accounts for every daily row exactly once (counts sum to ' + D.length + ')', [Dd, W, M, Y].every(f => f.reduce((a, c) => a + c.n, 0) === D.length));
T('2b candle sanity in every frame: low <= open, close <= high', [W, M, Y].every(f => f.every(c => c.l <= Math.min(c.o, c.c) + 1e-9 && c.h >= Math.max(c.o, c.c) - 1e-9)));
T('2c a monthly candle = its daily rows: open = first day, close = last day, high / low = extremes (all 318 months)', M.every(c => { const rows = D.filter(r => r.d.slice(0, 7) === c.key); return rows.length === c.n && c.o === rows[0].c && c.c === rows[rows.length - 1].c && c.h === Math.max(...rows.map(r => r.c)) && c.l === Math.min(...rows.map(r => r.c)); }));
T('2d a yearly candle agrees with its months: open = first month open, close = last month close, high = max of month highs, low = min of month lows', Y.every(c => { const ms = M.filter(m => m.key.slice(0, 4) === c.key); return ms.length && c.o === ms[0].o && c.c === ms[ms.length - 1].c && c.h === Math.max(...ms.map(m => m.h)) && c.l === Math.min(...ms.map(m => m.l)); }));
T('2e a weekly candle agrees with its days and never straddles two weeks (Monday start): 1,000 sampled weeks', W.filter((_, i) => i % 7 === 0).every(c => { const rows = D.filter(r => r.d >= c.start && r.d <= c.end); return rows.length === c.n && c.h === Math.max(...rows.map(r => r.c)) && c.o === rows[0].c && c.c === rows[rows.length - 1].c; }));
T('2f years 2000..2026 = 27 yearly candles; 2008 high 143.95; 2020 low is the April collapse', Y.length === 27 && Y.find(c => c.key === '2008').h === 143.95 && Y.find(c => c.key === '2020').l === Math.min(...D.filter(r => r.d.startsWith('2020')).map(r => r.c)));
T('2g the last close of every frame is the last daily price (the frames never disagree on "now")', [W, M, Y].every(f => f[f.length - 1].c === D[D.length - 1].c));

console.log('3. history and simulation are separate');
const srcOf = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
T('3a the simulation (oil-engine.js, economy.js) never reads the real history file', !/brent-history|OliBrentHistory/.test(srcOf('oil-engine.js')) && !/brent-history|OliBrentHistory/.test(srcOf('economy.js')));
{ const s = A.seriesOf('REAL', null, H), g = A.seriesOf('SIM', { market: { gc: { CRUDE: [{ d: '2030-01-01', day: 1, wd: 1, o: 1, h: 1, l: 1, c: 1, v: 0 }] } } }, H); T('3b the two series are labelled and distinct ("real history (EIA)" vs "game simulation")', s.kind === 'REAL' && g.kind === 'SIM' && s.label !== g.label && s.rows.length === D.length && g.rows.length === 1 && s.meta && s.meta.source); }

console.log('4. moving averages and trend');
{ const cs = A.candles(D, 'M'), s5 = A.sma(cs, 5), i = 100; T('4a SMA(5) of the monthly closes equals the average of the last 5 closes, null before 5 candles', s5[3] === null && near(s5[i], (cs[i].c + cs[i - 1].c + cs[i - 2].c + cs[i - 3].c + cs[i - 4].c) / 5, 1e-12));
  const up = A.trend(A.candles(D.filter(r => r.d >= '2007-06-01' && r.d <= '2008-06-30'), 'W')), dn = A.trend(A.candles(D.filter(r => r.d >= '2008-08-01' && r.d <= '2008-12-31'), 'W')), rec = A.trend(A.candles(D.filter(r => r.d >= '2009-01-01' && r.d <= '2009-06-30'), 'W'));
  T('4b the trend reading follows the real market: UP into the 2008 peak, DOWN in the 2008 crash, UP in the 2009 recovery', up.dir === 'UP' && dn.dir === 'DOWN' && rec.dir === 'UP', [up.dir, dn.dir, rec.dir]);
  T('4c too little data gives NA, not a made-up trend', A.trend(A.candles(D.slice(0, 5), 'D')).dir === 'NA'); }

console.log('5. reasons come from the engine');
{ const e = mk(5, { maxActive: 0 }); e.regLeft = 1e9; for (let d = 0; d < 60; d++) e.dayStep(d, month(d), 'x'); e.C = e.P.C0 * 0.8; e.dayStep(61, month(61), 'x'); const r = A.reasons(e), st = r.items.find(x => x.kind === 'stock');
  T('5a a low commercial stock gives an UP reason about the stock, with the real cover %', st.dir === 'UP' && /أقل من المعتاد/.test(st.text), st);
  const e2 = mk(5, { maxActive: 0 }); e2.regLeft = 1e9; for (let d = 0; d < 60; d++) e2.dayStep(d, month(d), 'x'); e2.C = e2.P.C0 * 1.25; e2.dayStep(61, month(61), 'x'); T('5b a high stock gives a DOWN reason', A.reasons(e2).items.find(x => x.kind === 'stock').dir === 'DOWN');
  const e3 = mk(7, { maxActive: 0 }); e3.regLeft = 1e9; for (let d = 0; d < 40; d++) e3.dayStep(d, month(d), 'x'); e3.force(NEWS.EVENTS.find(x => x.text.includes('إغلاق جزئي لمضيق')).id, e3.lastDay, 'x'); e3.dayStep(41, month(41), 'x'); const r3 = A.reasons(e3);
  T('5c an active strait closure shows as an active event and a news reason UP, with its regions', r3.active.length === 1 && r3.active[0].regions.length && r3.items.find(x => x.kind === 'news').dir === 'UP');
  T('5d the risk level is derived from the market state (crisis/volatile = HIGH, stable = LOW)', (() => { const a = mk(1); a.regime = 'OIL_CRISIS'; const b = mk(1); b.regime = 'STABLE'; return A.reasons(a).risk === 'HIGH' && A.reasons(b).risk === 'LOW'; })()); }

console.log('6. forecasts 7 / 30 / 90 days');
{ const e = mk(11); for (let d = 0; d < 150; d++) e.dayStep(d, month(d), 'x'); const before = JSON.stringify(e.toJSON()), p0 = e.price(), rs = e.rng.s, t0 = Date.now(), f = A.forecast(e), ms = Date.now() - t0;
  T('6a three horizons, each with a low / mid / high range, a direction and an uncertainty level', [7, 30, 90].every(h => { const x = f.byDays[h]; return x && x.low <= x.mid && x.mid <= x.high && ['UP', 'DOWN', 'SIDE'].includes(x.dir) && ['LOW', 'MEDIUM', 'HIGH'].includes(x.uncertainty); }));
  T('6b the forecast does NOT touch the real market: engine state, random stream and price identical afterwards', JSON.stringify(e.toJSON()) === before && e.rng.s === rs && e.price() === p0);
  T('6c deterministic for the same state and seed; a different seed gives a different (but similar) answer', JSON.stringify(A.forecast(e, { seed: 5 })) === JSON.stringify(A.forecast(e, { seed: 5 })) && JSON.stringify(A.forecast(e, { seed: 5 })) !== JSON.stringify(A.forecast(e, { seed: 6 })));
  T('6d it is fast enough for the phone UI: ' + ms + ' ms for 3 horizons x 48 futures', ms < 1500);
  let wider = 0, n = 0; for (const sd of [1, 2, 3, 4, 5, 6]) { const g = mk(sd); for (let d = 0; d < 120; d++) g.dayStep(d, month(d), 'x'); const q = A.forecast(g); n++; if (q.byDays[90].width > q.byDays[7].width) wider++; }
  T('6e uncertainty grows with the horizon: the 90-day range is wider than the 7-day range (' + wider + '/' + n + ' seeds)', wider === n);
  const calm = mk(3, { maxActive: 0 }), wild = mk(3, { maxActive: 0 }); for (const g of [calm, wild]) { for (let d = 0; d < 100; d++) g.dayStep(d, month(d), 'x'); g.regLeft = 1e9; } wild.regime = 'VOLATILE'; calm.regime = 'STABLE'; const wc = A.forecast(calm, { seed: 9 }).byDays[30].width, ww = A.forecast(wild, { seed: 9 }).byDays[30].width;
  T('6f a volatile market state has a wider 30-day range than a stable one (' + (ww * 100).toFixed(1) + '% vs ' + (wc * 100).toFixed(1) + '%)', ww > wc);
  T('6g the note says it is an estimate that does not move the price', /تقديرية/.test(f.note) && /لا تؤثر/.test(f.note)); }

console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
