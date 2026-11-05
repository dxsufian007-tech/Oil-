/* Oli - oil-world.js : the world oil balance behind the Brent price (pure model, no DOM, no clock: it is advanced one game day at a time by Market)
 *
 *  OIL (million barrels, mb).  Three stores and a player account - the same oil is never in two of them:
 *    C  commercial stock  : oil that is on offer in the market (tanks of companies and states that can be bought)
 *    H  hoarded stock     : oil that traders / states keep OFF the market (age tracked)
 *    R  strategic reserve : state reserves (released by news, refilled when the price is low)
 *  Daily flows:  C += P - D        (P = world production, D = world consumption, mb/day)
 *                C <-> H           (hoarding / releasing - moves oil, creates none)
 *                R -> C            (strategic release by news; refill C -> R when cheap)
 *                player buys q     C -= q (oil leaves the market, the player holds it);  player sells q:  C += q (bought oil returns; own produced oil is new supply)
 *  The check  C + H + R = C0 + H0 + R0 + sum(P - D) + ownSold + soldBought - bought  holds exactly (check()).
 *
 *  PRICE.  The game price is  Brent(official close of the market day) x exp(x).  x (log deviation) is not a fixed effect per factor: it chases a target
 *      x* = -beta ln(C / Cnormal)  +  risk premium of the live news  +  premium of the economic phase           (low market stock = dearer, full = cheaper)
 *      x <- x + kappa (x* - x) + sigma e                  e = standard normal from the market's own seeded stream (calculated randomness, not white noise)
 *  and the physical flows react to x:  P = P0 (1 + eps_p x) + news supply,   D = D0 (1 - eps_d x) + phase + season + news demand,
 *  hoarding target = share0 - h x + news hoard push  (traders hoard when cheap, sell when dear).  So a supply shock, a stock draw and hoarding all end in ONE x.
 *  The news (news-data.js): chance per day = p/365 x season x state (needs / boosts), cooldown per item, exceptional items 8 years apart, at most
 *  maxActive together; each acts with a ramp up (20% of its length) and a decay; opposite items net out because they enter the same sums.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./news-data.js'));
  else root.OliOilWorld = factory(root.OliNews);
})(typeof self !== 'undefined' ? self : this, function (NEWS) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r3 = v => Math.round(v * 1000) / 1000;
  const PHASES = { EXPANSION: { ar: 'توسّع', days: [300, 800], dem: 1.2, sent: 0.015, next: [['PLATEAU', 0.7], ['CONTRACTION', 0.3]] }, PLATEAU: { ar: 'استقرار', days: [150, 400], dem: 0, sent: 0, next: [['CONTRACTION', 0.5], ['EXPANSION', 0.5]] },
    CONTRACTION: { ar: 'انكماش', days: [120, 380], dem: -2.2, sent: -0.025, next: [['RECOVERY', 1]] }, RECOVERY: { ar: 'تعافٍ', days: [200, 480], dem: 0.5, sent: 0.008, next: [['EXPANSION', 0.8], ['PLATEAU', 0.2]] } };
  const DEF = { C0: 2800, H0: 140, R0: 1200, P0: 100, D0: 100, beta: 3.5, kappa: 0.15, sigma: 0.006, epsP: 0.05, epsD: 0.03, hoardK: 0.15, hoardNews: 2, hoardMaxShare: 0.2, hoardRate: 0.08, hoardDayMax: 0.005, refillBelow: -0.15, refillPerDay: 0.3,
    xMax: 0.45, demSmooth: 0.03, seasonAmp: 0.7, maxActive: 5, rareGapDays: 2922, minCdDays: 20, intraSigma: 0.0012, intraRevert: 0.25, intraMax: 0.01, floorC: 100, logMax: 300, avgDays: 365 };
  class OilWorld {
    constructor(P, rng, st) {
      this.P = Object.assign({}, DEF, P || {}); this.rng = rng;
      const p = this.P; Object.assign(this, { C: p.C0, H: p.H0, R: p.R0, Hage: 0, x: 0, intra: 0, demShift: 0, phase: 'EXPANSION', phaseLeft: 500, lastDay: -1, avgC: p.C0, active: [], last: {}, rareLast: -1e9, log: [], acct: { prod: 0, cons: 0, ownSold: 0, soldBought: 0, bought: 0 }, cum: { hoarded: 0, released: 0 }, drivers: { inv: 0, news: 0, phase: 0 }, flow: { P: p.P0, D: p.D0, net: 0, hoardFlow: 0 }, newsSum: { sup: 0, dem: 0, sent: 0, hoard: 0, rel: 0 }, cost: { freight: 1, energy: 1 } });
      this.h0 = p.H0 / (p.C0 + p.H0); if (st) this.load(st);
    }
    /* market state the news can need / be boosted by */
    state() { const cover = this.C / this.P.C0, s = { LOW_STOCK: cover < 0.96, HIGH_STOCK: cover > 1.04, HIGH_PRICE: this.x > 0.1, LOW_PRICE: this.x < -0.1 }; s[this.phase] = true; return s; }
    cover() { return this.C / this.P.C0; }
    /* the live news of today: the net of everything acting now */
    _net(day) {
      const s = { sup: 0, dem: 0, sent: 0, hoard: 0, rel: 0 }, c = { freight: 1, energy: 1 };
      for (const a of this.active) { const e = NEWS.EVENTS[a.i], age = day - a.start, ramp = Math.max(1, 0.2 * a.days), f = age < ramp ? (age + 1) / ramp : Math.exp(-2.3 * (age - ramp) / Math.max(1, a.days - ramp)); a.f = f;
        s.sup += e.sup * f; s.dem += e.dem * f; s.sent += e.sent * f; s.hoard += e.hoard * f; if (e.rel) s.rel += e.rel / a.days; if (e.cost) { c.freight *= 1 + (((e.cost.freight || 1) - 1) * f); c.energy *= 1 + (((e.cost.energy || 1) - 1) * f); } }
      this.newsSum = s; this.cost = c; return s;
    }
    _spawn(day, month, date) {
      const p = this.P, st = this.state(); if (this.active.length >= p.maxActive) return null; let pick = null;
      for (let i = 0; i < NEWS.EVENTS.length; i++) { const e = NEWS.EVENTS[i];
        if (this.active.some(a => a.i === i)) continue; if (e.m && !e.m.includes(month)) continue; if (e.rq && !st[e.rq]) continue;
        const lastAt = this.last[i]; if (lastAt != null && day - lastAt < Math.max(p.minCdDays, e.days * 1.5)) continue; if (e.rare && (day - this.rareLast < p.rareGapDays || this.active.some(a => NEWS.EVENTS[a.i].rare))) continue;
        let pr = e.p / 365; if (e.b && st[e.b]) pr *= 3; if (this.rng.next() < pr) { pick = i; break; } }
      if (pick == null) return null; const e = NEWS.EVENTS[pick]; const rec = { i: pick, start: day, days: e.days, f: 0 }; this.active.push(rec); this.last[pick] = day; if (e.rare) this.rareLast = day;
      this.log.push({ id: e.id, day, date, cat: e.cat, text: e.text, days: e.days, x: r3(this.x), cover: r3(this.cover()) }); if (this.log.length > p.logMax) this.log.shift(); return e;
    }
    /* force an item (tests / scenario tools) */
    force(id, day, date) { const i = NEWS.EVENTS.findIndex(e => e.id === id); if (i < 0) return false; const e = NEWS.EVENTS[i]; this.active = this.active.filter(a => a.i !== i); this.active.push({ i, start: day, days: e.days, f: 0 }); this.last[i] = day; this.log.push({ id: e.id, day, date: date || null, cat: e.cat, text: e.text, days: e.days, x: r3(this.x), cover: r3(this.cover()) }); return true; }
    /* one game day.  day = days since the game began, month 1..12 */
    dayStep(day, month, date) {
      const p = this.P, rng = this.rng; this.lastDay = day;
      // 1. economic cycle
      if (--this.phaseLeft <= 0) { const u = rng.next(); let acc = 0, nx = PHASES[this.phase].next[0][0]; for (const [n, w] of PHASES[this.phase].next) { acc += w; if (u <= acc) { nx = n; break; } } this.phase = nx; const d = PHASES[nx].days; this.phaseLeft = Math.round(d[0] + rng.next() * (d[1] - d[0])); }
      // 2. news: age, retire, and maybe one new item
      this.active = this.active.filter(a => day - a.start < a.days); this._spawn(day, month, date); const n = this._net(day);
      // 3. physical flows of the day (production / consumption react to the price deviation x)
      const ph = PHASES[this.phase]; this.demShift += p.demSmooth * (ph.dem - this.demShift);
      const season = p.seasonAmp * Math.cos(2 * Math.PI * (month - 7) / 12);
      const P = p.P0 * (1 + p.epsP * this.x) + n.sup; let D = p.D0 * (1 - p.epsD * this.x) + this.demShift + season + n.dem;
      let net = P - D; if (this.C + net < p.floorC) { const cut = p.floorC - (this.C + net); D -= cut; net += cut; }                                   // empty market: consumption is rationed, never negative stock
      this.C += net; this.acct.prod += P; this.acct.cons += D; this.flow.P = P; this.flow.D = D; this.flow.net = net;
      // 4. strategic reserve: news release R -> C; refill C -> R when the price is low
      if (n.rel > 0 && this.R > 0) { const q = Math.min(n.rel, this.R); this.R -= q; this.C += q; this.cum.released += q; }
      if (this.x < p.refillBelow && this.C > p.floorC + 10) { const q = Math.min(p.refillPerDay, this.C - p.floorC); this.C -= q; this.R += q; }
      // 5. hoarding: the traders' target share of the stock they keep off the market
      const T = this.C + this.H, share = clamp(this.h0 - p.hoardK * this.x + p.hoardNews * n.hoard, 0, p.hoardMaxShare), target = T * share;
      let flow = clamp(p.hoardRate * (target - this.H), -p.hoardDayMax * T, p.hoardDayMax * T); if (flow > this.C - p.floorC) flow = Math.max(0, this.C - p.floorC); if (-flow > this.H) flow = -this.H;
      const H1 = this.H + flow; this.Hage = flow > 0 && H1 > 0 ? ((this.Hage + 1) * this.H) / H1 : this.Hage + 1; if (H1 <= 1e-9) this.Hage = 0; this.H = H1; this.C -= flow; this.flow.hoardFlow = flow; if (flow > 0) this.cum.hoarded += flow; else this.cum.released -= flow;
      // 6. price deviation chases its target
      const cover = this.C / p.C0, inv = -p.beta * Math.log(Math.max(0.2, cover)), sent = n.sent + ph.sent, xs = inv + sent;
      this.drivers = { inv, news: n.sent, phase: ph.sent, target: xs };
      this.x = clamp(this.x + p.kappa * (xs - this.x) + p.sigma * rng.gauss(), -p.xMax, p.xMax);
      this.avgC += (this.C - this.avgC) / p.avgDays;
    }
    /* one game hour: a small mean-reverting intraday wobble (the candle's Open / High / Low) */
    hourStep() { const p = this.P; this.intra = clamp(this.intra * (1 - p.intraRevert) + p.intraSigma * this.rng.gauss(), -p.intraMax, p.intraMax); return this.x + this.intra; }
    /* the player's trades, in barrels.  Bought oil leaves the market; sold oil comes back; own produced oil is new supply. */
    playerBuy(bbl) { const mb = bbl / 1e6; this.C -= mb; this.acct.bought += mb; }
    playerSell(ownBbl, boughtBbl) { const a = ownBbl / 1e6, b = boughtBbl / 1e6; this.C += a + b; this.acct.ownSold += a; this.acct.soldBought += b; }
    /* conservation of oil: returns the difference (0 when no oil was counted twice or lost) */
    check() { const p = this.P, a = this.acct, want = p.C0 + p.H0 + p.R0 + a.prod - a.cons + a.ownSold + a.soldBought - a.bought; return (this.C + this.H + this.R) - want; }
    view() { const p = this.P; return { C: this.C, H: this.H, R: this.R, total: this.C + this.H + this.R, cover: this.C / p.C0, normal: p.C0, avg: this.avgC, coverDays: this.C / Math.max(1, this.flow.D), hoardShare: this.H / Math.max(1, this.C + this.H), hoardAge: this.Hage, x: this.x, phase: this.phase, phaseAr: PHASES[this.phase].ar, drivers: this.drivers, flow: this.flow, news: this.newsSum, cost: this.cost, active: this.active.map(a => ({ id: NEWS.EVENTS[a.i].id, text: NEWS.EVENTS[a.i].text, cat: NEWS.EVENTS[a.i].cat, left: Math.max(0, a.days - (this.lastDay - a.start)), days: a.days, f: a.f })) }; }
    toJSON() { return { v: 1, C: this.C, H: this.H, R: this.R, Hage: this.Hage, x: this.x, intra: this.intra, demShift: this.demShift, phase: this.phase, phaseLeft: this.phaseLeft, lastDay: this.lastDay, avgC: this.avgC, active: this.active, last: this.last, rareLast: this.rareLast, log: this.log, acct: this.acct, cum: this.cum, drivers: this.drivers, flow: this.flow, newsSum: this.newsSum, cost: this.cost }; }
    load(st) { for (const k of Object.keys(st)) if (k !== 'v') this[k] = st[k]; }
  }
  return { OilWorld, PHASES, DEF };
});
