/* S1 world market engine: indicators from the engine's own accounts, multi-seed, 30/90/365 days and years.  node test-market-s1.js */
const NEWS = require('./news-data.js'), OE = require('./oil-engine.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
function Rng(s) { this.s = s >>> 0 || 1; this.next = () => { let t = this.s += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; this.gauss = () => { let u = 0, v = 0; while (!u) u = this.next(); while (!v) v = this.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }; }
const month = d => Math.floor(((d % 365) + 365) % 365 / 30.42) + 1;
const mk = (seed, P) => new OE.OilEngine(Object.assign({}, P || {}), new Rng(seed));
const SEEDS = [1, 7, 13, 21, 42, 99, 123, 2024];
console.log('1. identities on every day, 8 seeds x 3 years (random news and market states ON)');
{ let bad = [], n = 0, minP = 1e9, maxP = 0, sumP = 0;
  for (const sd of SEEDS) { const e = mk(sd); let prevR = e.R; for (let d = 0; d < 1095; d++) { e.dayStep(d, month(d), 'x'); const I = e.indicators(), pr = e.price(); n++;
      const chk = Math.abs(I.balance - (I.production - I.demand)) < 1e-9 && I.production <= I.capacity + 1e-6 && I.utilisation >= 0 && I.utilisation <= 1.0001 && Math.abs(I.idle - Math.max(0, I.capacity - I.production)) < 1e-9 && [I.production, I.demand, I.commercial, I.reserve, pr].every(Number.isFinite) && I.commercial >= 0 && I.reserve >= 0;
      if (!chk) bad.push([sd, d]); minP = Math.min(minP, pr); maxP = Math.max(maxP, pr); sumP += pr; }
    if (Math.abs(e.check()) > 1e-6) bad.push(['books', sd, e.check()]); }
  T('1a balance = production - demand, production <= capacity, utilisation in [0,1], idle = capacity - production, no NaN, no negative stock (' + n + ' days)', !bad.length, bad.slice(0, 4));
  T('1b the books close (check() = 0) for every seed after 3 years', !bad.some(b => b[0] === 'books'));
  T('1c the price stays inside a sane band over all seeds: ' + minP.toFixed(1) + ' .. ' + maxP.toFixed(1) + ', mean ' + (sumP / n).toFixed(1), minP > 12 && maxP < 400 && sumP / n > 40 && sumP / n < 130); }

console.log('2. surplus builds the commercial stock, deficit draws it (30, 90, 365 days; 8 seeds)');
for (const days of [30, 90, 365]) { let ok = 0, tot = 0, corr = 0, cn = 0; for (const sd of SEEDS) { const e = mk(sd); let sBal = 0, sDC = 0; for (let d = 0; d < days; d++) { e.dayStep(d, month(d), 'x'); const I = e.indicators(); sBal += I.balance; sDC += I.stockChange; tot++; if ((I.stockChange - I.balance) * 0 === 0) ok++; }
    corr += (sBal > 0) === (sDC > 0) || Math.abs(sBal) < 50 ? 1 : 0; cn++; }
  T('2 ' + days + ' days: for ' + corr + '/' + cn + ' seeds the sign of the stock change equals the sign of the cumulative surplus / deficit', corr >= cn - 1, [corr, cn]); }

console.log('3. the strategic reserve is a separate account: it never feeds supply by itself');
{ let moved = 0, news = 0; for (const sd of SEEDS) { const e = mk(sd, { maxActive: 0 }); e.regLeft = 1e9; const R0 = e.R; for (let d = 0; d < 400; d++) e.dayStep(d, month(d), 'x'); if (Math.abs(e.R - R0) > 1e-9 && e.x >= e.P.refillBelow) moved++; }
  T('3a with no news and no refill condition the reserve R does not change (it is not available supply)', moved === 0, moved);
  const e = mk(5, { maxActive: 0 }); e.regLeft = 1e9; for (let d = 0; d < 40; d++) e.dayStep(d, month(d), 'x'); const I0 = e.indicators(); T('3b the indicators report commercial and reserve separately', I0.reserve === e.R && I0.commercial === e.C && I0.reserve !== I0.commercial); }

console.log('4. a real supply cut is a deficit and a dearer price (paired, same seed)');
{ const id = NEWS.EVENTS.find(x => x.sup < -1.5).id; let up = 0, n = 0; for (const sd of SEEDS) { const c = mk(sd, { maxActive: 0 }), s = mk(sd, { maxActive: 0 }); c.regLeft = s.regLeft = 1e9; for (let d = 0; d < 30; d++) { c.dayStep(d, month(d), 'x'); s.dayStep(d, month(d), 'x'); } s.force(id, s.lastDay, 'x'); let dm = 1e9, pm = 0; for (let d = 30; d < 60; d++) { c.dayStep(d, month(d), 'x'); s.dayStep(d, month(d), 'x'); dm = Math.min(dm, s.indicators().balance - c.indicators().balance); pm = Math.max(pm, s.price() - c.price()); } n++; if (dm < -0.5 && pm > 0) up++; }
  T('4 for every seed the cut lowers the balance versus the control and raises the price at some point (' + up + '/' + n + ')', up === n); }

console.log('5. state is saved and restored: the indicators continue the same');
{ const a = mk(3); for (let d = 0; d < 100; d++) a.dayStep(d, month(d), 'x'); const b = mk(3); b.load(JSON.parse(JSON.stringify(a.toJSON()))); const ia = a.indicators(), ib = b.indicators(); T('5a production / demand / reserve identical after save-load', ia.production === ib.production && ia.demand === ib.demand && ia.reserve === ib.reserve && ia.capacity === ib.capacity);
  T('5b an old save (no dC) still gives numbers', (() => { delete b.dC; return Number.isFinite(b.indicators().stockChange); })()); }
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
