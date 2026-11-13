/* Banking Phase 2: the Base Rate engine (owner-approved design) - the official scenario tests + liquidity surcharge + save/load + a 20-year run on the real market engine */
const EC = require('./economy-config.js'), { BaseRate, nextTier } = require('./baserate.js'); let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++, console.log('  ok ', n); else fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const run = (price, lam, indus, q, br) => { br = br || new BaseRate(EC, 0); const rates = []; for (let k = 1; k <= q; k++) { const p = typeof price === 'function' ? price(k) : price, l = typeof lam === 'function' ? lam(k) : lam, a = typeof indus === 'function' ? indus(k) : indus; br.ema = p; br.review(k, k * 91, { lam: l, indus: a, ratios: {} }); rates.push(br.rate); } return { br, rates }; };
const changes = r => r.reduce((n, x, i) => n + (x !== (i ? r[i - 1] : 0.04) ? 1 : 0), 0), moves = r => r.map((x, i) => x - (i ? r[i - 1] : 0.04)).filter(d => Math.abs(d) > 1e-12);
const R = EC.BASE_RATE;

console.log('A. the official scenarios');
{ const a = run(110, 0.45, 0.035, 16); ok(a.rates.every((x, i) => !i || x >= a.rates[i - 1]) && a.rates[15] >= 0.075 && a.rates[15] <= R.max && moves(a.rates).every(d => Math.abs(Math.abs(d) - 0.005) < 1e-9), 'A1 sustained inflation: the rate only rises, always by exactly 0.50%, up to 7.5%', a.rates);
  const b = run(40, 0.95, -0.05, 16); ok(b.rates.every((x, i) => !i || x <= b.rates[i - 1]) && Math.abs(b.rates[15] - R.min) < 1e-9 && moves(b.rates).every(d => Math.abs(Math.abs(d) - 0.005) < 1e-9), 'A2 sustained recession: the rate only falls by 0.50% steps down to the 1% floor', b.rates);
  const c = run(72, 0.75, 0, 16); ok(c.rates.every(x => x === 0.04), 'A3 stable economy: 16 quarters, the rate never moves from 4%');
  const d = run(k => k === 5 ? 120 : 72, k => k === 5 ? 0.4 : 0.75, k => k === 5 ? 0.035 : 0, 12); ok(d.rates.every(x => x === 0.04), 'A4 a one-quarter pulse does not move the rate (no confirmation)', d.rates);
  const e = run(k => k <= 8 ? 120 : 40, k => k <= 8 ? 0.4 : 0.95, k => k <= 8 ? 0.035 : -0.05, 30); const mv = []; e.rates.forEach((x, i) => { const p = i ? e.rates[i - 1] : 0.04; if (Math.abs(x - p) > 1e-12) mv.push({ i, s: Math.sign(x - p) }); });
  let gapOK = true; for (let i = 1; i < mv.length; i++) if (mv[i].s !== mv[i - 1].s && mv[i].i - mv[i - 1].i < 2) gapOK = false; ok(mv.some(m => m.s > 0) && mv.some(m => m.s < 0) && gapOK, 'A5 direction reversal: possible, but never within 2 reviews of the opposite change', mv);
  ok(e.br.hist.filter(h => h.rev && h.step !== 0).every(h => true) && (() => { let last = -9; for (const h of e.br.hist) { if (h.type) continue; if (h.step) { if (h.rev && h.n - last < 2) return false; last = h.n; } } return true; })(), 'A6 6-month cooling: a reversal step never happens fewer than 2 reviews after the last change');
  const f1 = run(1000, 0.1, 0.1, 40), f2 = run(1, 1, -1, 40); ok(Math.max(...f1.rates) <= R.max && Math.min(...f2.rates) >= R.min && Math.max(...f1.rates) <= 0.08 + 1e-9, 'A7 the rate never leaves the corridor 1%..12% (extreme inputs)'); }

console.log('B. indicators clamp to [-1, +1]');
{ const br = new BaseRate(EC, 0); br.ema = 1e6; const h = br.review(1, 91, { lam: -5, indus: 9, ratios: {} }); ok(h.zp === 1 && h.zl === 1 && h.za === 1 && Math.abs(h.S0 - 1) < 1e-9, 'B1 extreme high inputs give +1 each (S0 = 1)');
  const b2 = new BaseRate(EC, 0); b2.ema = 0.001; const h2 = b2.review(1, 91, { lam: 9, indus: -9, ratios: {} }); ok(h2.zp === -1 && h2.zl === -1 && h2.za === -1 && Math.abs(h2.S0 + 1) < 1e-9, 'B2 extreme low inputs give -1 each (S0 = -1)');
  const b3 = new BaseRate(EC, 0); b3.ema = 72; const h3 = b3.review(1, 91, { lam: 0.75, indus: 0, ratios: {} }); ok(h3.S0 === 0 && h3.target === 0.04, 'B3 neutral inputs: score 0, target 4%'); }

console.log('C. the daily price average');
{ const br = new BaseRate(EC, 0); ok(br.ema === 72, 'C1 starts at the reference price 72'); for (let d = 0; d < 360; d++) br.daily(d, 100); const k = 2 / 361, ex = 100 - 28 * Math.pow(1 - k, 360);
  ok(Math.abs(br.ema - ex) < 1e-9, 'C2 EMA(360) of a constant price follows the closed form'); const e0 = br.ema; br.daily(359, 500); br.daily(10, 500); ok(br.ema === e0, 'C3 a day already counted is ignored (load / replay safe)'); }

console.log('D. fixed mode');
{ const br = new BaseRate(EC, 0); br.setMode('FIXED', 0.06); br.ema = 120; for (let k = 1; k <= 8; k++) br.review(k, k * 91, { lam: 0.3, indus: 0.03, ratios: {} }); ok(br.rate === 0.06 && br.n === 8, 'D1 FIXED holds the manual rate through any signals');
  ok(br.setMode('FIXED', 0.2).reason === 'RATE' && br.setMode('FIXED', 0.001).reason === 'RATE' && br.rate === 0.06, 'D2 a FIXED rate outside 1%..12% is refused'); br.setMode('AUTO'); const s0 = br.rate; for (let k = 9; k <= 20; k++) br.review(k, k * 91, { lam: 0.3, indus: 0.03, ratios: {} }); ok(s0 === 0.06 && br.rate > 0.06, 'D3 back to AUTO it continues from the present rate'); }

console.log('E. bank liquidity surcharge');
{ const T = R.surcharge, seq = [0.62, 0.45, 0.52, 0.57, 0.18, 0.22, 0.26], exp = [0, 1, 1, 0, 2, 2, 1]; let t = 0; const got = seq.map(r => (t = nextTier(t, r, T))); ok(JSON.stringify(got) === JSON.stringify(exp), 'E1 enter tier 1 below 50%, leave at 55%; tier 2 below 20%, back to tier 1 at 25%, to 0 at 55%', got);
  ok(nextTier(0, 0.49999, T) === 1 && nextTier(0, 0.5, T) === 0 && nextTier(0, 0.19999, T) === 2 && nextTier(2, 0.2499, T) === 2 && nextTier(2, 0.25, T) === 1 && nextTier(1, 0.5499, T) === 1 && nextTier(1, 0.55, T) === 0 && nextTier(2, 0.55, T) === 0, 'E2 the exact thresholds');
  const br = new BaseRate(EC, 0); br.review(1, 91, { lam: 0.75, indus: 0, ratios: { COMMERCIAL: 0.4, INDUSTRIAL: 1, STRATEGIC: 0.1 } }); ok(br.surcharge('COMMERCIAL') === 0.0025 && br.surcharge('INDUSTRIAL') === 0 && br.surcharge('STRATEGIC') === 0.005, 'E3 each bank has its own surcharge: +0.25% / 0 / +0.50%');
  br.review(2, 182, { lam: 0.75, indus: 0, ratios: { COMMERCIAL: 0.52, STRATEGIC: 0.3 } }); ok(br.surcharge('COMMERCIAL') === 0.0025 && br.surcharge('STRATEGIC') === 0.0025, 'E4 the surcharge is held between thresholds (hysteresis)'); }

console.log('F. save / load');
{ const a = run(k => 100 + (k % 3) * 5, 0.5, 0.02, 7).br, js = JSON.stringify(a.toJSON()), b = BaseRate.fromJSON(JSON.parse(js), EC, 0); ok(JSON.stringify(b.toJSON()) === js, 'F1 save -> load -> save is identical');
  const go = (br, from, to) => { for (let k = from; k <= to; k++) { br.daily(k * 91, 100); br.ema = 100 + (k % 3) * 5; br.review(k, k * 91, { lam: 0.5, indus: 0.02, ratios: {} }); } return JSON.stringify(br.toJSON()); };
  ok(go(a, 8, 20) === go(b, 8, 20), 'F2 a game loaded half way continues with exactly the same rates, history and state');
  ok(b.review(7, 700, { lam: 0.5, indus: 0, ratios: {} }) === null, 'F3 a quarter already reviewed is never reviewed twice'); }

console.log('G. 20 years on the real market engine (a real Company, rate in AUTO)');
{ const H = require('./test-economy-helpers.js'), g = H.game(50e6), co = g.co, b = co.bank; ok(!!co.market.engine && b.rate.mode === 'AUTO', 'G0 the company runs on the real OilEngine, Base Rate in AUTO');
  const t0 = Date.now(), rates = [], hdr = () => b.rate.hist.filter(h => !h.type); for (let m = 0; m < 240; m++) { H.nextMonth(co); if (m % 3 === 2) rates.push(b.rate.rate); }
  const hs = hdr(); ok(hs.length >= 78 && hs.length <= 82, 'G1 about 80 quarterly reviews in 20 years (' + hs.length + ')');
  ok(hs.every(h => h.rate >= R.min && h.rate <= R.max && Math.abs(h.zp) <= 1 && Math.abs(h.zl) <= 1 && Math.abs(h.za) <= 1), 'G2 rate in the corridor and every indicator in [-1, +1] at every review');
  ok(hs.every(h => h.step === 0 || Math.abs(Math.abs(h.step) - 0.005) < 1e-9) && hs.filter(h => h.step).length <= hs.length / 2, 'G3 every move is exactly 0.50%; moves in ' + hs.filter(h => h.step).length + ' of ' + hs.length + ' reviews');
  let last = -9, ld = 0, rv = true; for (const h of hs) if (h.step) { const d = Math.sign(h.step); if (ld && d !== ld && h.n - last < 2) rv = false; last = h.n; ld = d; } ok(rv, 'G4 no reversal within 2 reviews of the last change');
  ok(b.audit().ok && Math.abs(co.balanceSheet().gap) < 1 && !('BANK_LOANS' in co.toJSON().journal.bal), 'G5 the bank books balance after 20 years; with no loans the company books carry no bank accounts');
  const j = JSON.stringify(b.rate.toJSON()), r2 = BaseRate.fromJSON(JSON.parse(j), EC, 0); ok(JSON.stringify(r2.toJSON()) === j, 'G6 the state saved after 20 years loads unchanged'); console.log('   (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s, rates: ' + [...new Set(rates)].join(' ') + ')'); }

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
