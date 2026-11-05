/* Oli - oil-engine.js : Oil Market Engine (pure model: no DOM, no clock, no historical data).  It is advanced one game DAY at a time by Market (day boundary of the central clock);
 * the hours of the day only glide the price from yesterday's level to today's and add a small intraday wobble (the candle's high / low).
 *
 *  OIL (million barrels, mb) - one account per state of the same oil, never counted twice:
 *    C commercial stock (on offer, can be bought)   H hoarded / held off the market (age tracked)   R strategic reserve (state; separate from C)
 *    produced P (by 4 producer groups) -> C ;  consumed D <- C ;  C<->H hoarding / release ;  R->C release by news, C->R refill when cheap
 *    player buys q: C-=q (the player holds it);  player sells q: C+=q (own oil is NEW supply, bought oil returns).  check() proves the books close.
 *
 *  CRUDE PRICE  (equilibrium level PEQ, no year, no history):   price = PEQ * exp(x)
 *    target   x* = -beta ln(C / Cnormal)            stock cover  (low stock = dear)
 *                + gapSign gapK (P - D) / D0         today's supply-demand gap.  gapSign = +1 is the approved equation (a surplus raises the target); gapSign = -1 is the economically correct sign (a surplus lowers it), kept OFF until approved
 *                + sentiment(live news) + sentiment(regime)
 *    x <- x + kappa (x* - x) + mu dx_prev + sigma * volatility(regime) * e + jump      (momentum = previous change, e from the market's own seeded stream)
 *    jumps: a sharp news item or the start of a crisis / recession moves x at once.
 *  Supply  P = sum over 4 groups [capacity x utilisation x (1 - outage)] ; OPEC+ re-sets its quota by the average price, shale answers with a lag, news cut / add output.
 *  Demand  D = D0 exp(industry) (1 - epsD x) + season + news ; industry follows the regime (surge / recession ...).
 *  8 market states (regimes, Markov with state-dependent transitions) change supply, demand, sentiment and volatility.
 *  PRODUCTS (gasoline, diesel, jet fuel, LPG, by-products): each has its own stock, supply (refinery runs x yield, cut by refinery outages), demand (season, news, price),
 *    price = base x (crude / PEQ)^theta x exp(y), y chases -betaP ln(cover) + product news; a refining + transport + storage cost floor stops a product falling below its cost.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./news-data.js'));
  else root.OliOilEngine = factory(root.OliNews);
})(typeof self !== 'undefined' ? self : this, function (NEWS) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
  const REGIMES = {
    STABLE: { ar: 'استقرار', ind: 0, sent: 0, vol: 1, sup: 0, days: [90, 260], next: { DEMAND_SURGE: .22, OVERSUPPLY: .2, SHORTAGE: .18, OIL_CRISIS: .05, RECESSION: .12, VOLATILE: .13 } },
    DEMAND_SURGE: { ar: 'ارتفاع الطلب', ind: .035, sent: .02, vol: 1.2, sup: 0, days: [60, 180], next: { STABLE: .3, SHORTAGE: .2, RECESSION: .15, VOLATILE: .15, OVERSUPPLY: .2 } },
    OVERSUPPLY: { ar: 'فائض المعروض', ind: -.005, sent: -.02, vol: 1.1, sup: 2, days: [80, 220], next: { STABLE: .35, RECOVERY: .2, VOLATILE: .15, RECESSION: .2, DEMAND_SURGE: .1 } },
    SHORTAGE: { ar: 'نقص المعروض', ind: .005, sent: .025, vol: 1.3, sup: -2, days: [60, 160], next: { STABLE: .25, OIL_CRISIS: .15, DEMAND_SURGE: .15, OVERSUPPLY: .2, VOLATILE: .15, RECESSION: .1 } },
    OIL_CRISIS: { ar: 'أزمة نفطية', ind: -.01, sent: .06, vol: 2.2, sup: -4, days: [30, 90], jump: [.06, .14], next: { RECESSION: .4, VOLATILE: .25, STABLE: .15, OVERSUPPLY: .2 } },
    RECESSION: { ar: 'ركود اقتصادي', ind: -.05, sent: -.04, vol: 1.6, sup: 0, days: [120, 320], jump: [-.12, -.05], next: { RECOVERY: .7, OVERSUPPLY: .15, VOLATILE: .15 } },
    RECOVERY: { ar: 'تعافٍ', ind: .02, sent: .01, vol: 1.2, sup: 0, days: [100, 260], next: { STABLE: .35, DEMAND_SURGE: .35, SHORTAGE: .1, OVERSUPPLY: .1, VOLATILE: .1 } },
    VOLATILE: { ar: 'تقلب حاد', ind: 0, sent: 0, vol: 3, sup: 0, days: [20, 70], next: { STABLE: .35, SHORTAGE: .15, OVERSUPPLY: .15, RECESSION: .15, DEMAND_SURGE: .1, OIL_CRISIS: .1 } }
  };
  const GROUPS = [{ id: 'OPEC', ar: 'أوبك+', base: 40, capX: 1.2, eps: 0.06, w: 0.45 }, { id: 'AMER', ar: 'الأمريكتان', base: 23, capX: 1.15, eps: 0.12, w: 0.1 }, { id: 'RUS', ar: 'روسيا ودول الجوار', base: 11, capX: 1.1, eps: 0.02, w: 0.25 }, { id: 'OTH', ar: 'منتجون آخرون', base: 26, capX: 1.1, eps: 0.04, w: 0.2 }];
  const PRODUCTS = {
    GASOLINE: { ar: 'البنزين', base: 110, dem: 34, theta: 0.85, season: 0.9, peak: 7, beta: 1.6, floor: 1 },
    DIESEL: { ar: 'الديزل', base: 104, dem: 27, theta: 0.95, season: 0.35, peak: 1, beta: 1.7, floor: 1 },
    JET_FUEL: { ar: 'وقود الطائرات', base: 106, dem: 8, theta: 0.9, season: 1.2, peak: 7, beta: 1.9, floor: 1 },
    GAS: { ar: 'الغاز المسال', base: 48, dem: 5, theta: 0.6, season: 1.5, peak: 1, beta: 1.5, floor: 0 },
    BYPRODUCT: { ar: 'المنتجات الثانوية', base: 57.6, dem: 8, theta: 1, season: 0.1, peak: 7, beta: 1.4, floor: 0 }
  };
  const DEF = { PEQ: 72, C0: 2800, H0: 140, R0: 1200, D0: 100, beta: 3.5, kappa: 0.15, mu: 0.25, sigma: 0.006, gapK: 2, gapSign: -1, epsD: 0.03, hoardK: 0.15, hoardNews: 2, hoardMaxShare: 0.2, hoardRate: 0.08, hoardDayMax: 0.005,
    refillBelow: -0.15, refillPerDay: 0.3, xMax: 0.6, dayMax: 0.09, seasonAmp: 0.7, maxActive: 5, rareGapDays: 2922, minCdDays: 20, catGapDays: 5, newsJump: 0.35, intraSigma: 0.0012, intraRevert: 0.25, intraMax: 0.01, floorC: 100, logMax: 300, avgDays: 365,
    sfsRate: 0.2, respShare: 0.55, respRate: 0.1, respSpare: 0.5, respCut: 0.05, coHist: 400, refCap: 82, prodDays: 18, prodKappa: 0.2, prodSigma: 0.004, prodMax: 0.35, prodElast: 0.15, prodFlex: 0.35, costFloor: 8, quotaDays: 30 };
  class OilEngine {
    constructor(P, rng, st) {
      this.P = Object.assign({}, DEF, P || {}); this.rng = rng; const p = this.P;
      Object.assign(this, { C: p.C0, H: p.H0, R: p.R0, Hage: 0, x: 0, xPrev: 0, dx: 0, intra: 0, xlag: 0, quota: 1, quotaLeft: p.quotaDays, indus: 0, regime: 'STABLE', regLeft: 160, lastDay: -1, avgC: p.C0, active: [], last: {}, catLast: {}, rareLast: -1e9, log: [], held: 0,
        acct: { prod: 0, cons: 0, ownSold: 0, soldBought: 0, bought: 0 }, cum: { hoarded: 0, released: 0 }, drivers: { inv: 0, gap: 0, news: 0, regime: 0, target: 0 }, flow: { P: 100, D: 100, net: 0, hoardFlow: 0 }, newsSum: { sup: 0, dem: 0, sent: 0, hoard: 0, rel: 0 }, cost: { freight: 1, energy: 1 }, rcOut: 0, util: GROUPS.map(g => g.base / (g.base * g.capX)), outage: GROUPS.map(() => 0), out: GROUPS.map(g => g.base) });
      this.prod = {}; for (const k of Object.keys(PRODUCTS)) { const d = PRODUCTS[k]; this.prod[k] = { S: d.dem * p.prodDays, y: 0, yPrev: 0, intra: 0, sup: d.dem, dem: d.dem, acct: { sup: 0, dem: 0, ownSold: 0, bought: 0 } }; }
      this.h0 = p.H0 / (p.C0 + p.H0);
      /* the COMPANY'S footprint on the world market (Phase 3).  Every flow is in mb (= mb/d for one day).  dayFlow = what the company did today.  ownAtProd (new games): the company's own crude is world supply the moment it is produced (it joins the commercial stock C);
       * oil it moves into its reserve LEAVES C (K = own oil held off the market) and comes back to C when released or sold; own crude refined or lost leaves C.  Older saves keep the old rule (own oil joins C when SOLD).
       * sfs = the smoothed supply the company withheld (into K + bought - released); resp = how much the other producers added (+) or cut (-) to answer it; coHist = one row per day, for the share and average figures */
      Object.assign(this, { dayFlow: { prod: 0, off: 0, buy: 0, hold: 0, rel: 0, kin: 0, kout: 0, net: 0 }, sfs: 0, resp: 0, K: 0, ownAtProd: false, coHist: [] }); this.acct.coIn = 0; this.acct.coOut = 0;
      if (st) this.load(st);
    }
    /* the market states the news can need / be boosted by */
    state() { const cover = this.C / this.P.C0, s = { LOW_STOCK: cover < 0.96, HIGH_STOCK: cover > 1.04, HIGH_PRICE: this.x > 0.1, LOW_PRICE: this.x < -0.1 }; s[this.regime] = true; return s; }
    cover() { return this.C / this.P.C0; }
    price() { return r2(this.P.PEQ * Math.exp(this.x)); }
    /* the live news of today: the net of everything acting now (opposite items cancel because they enter the same sums) */
    _net(day) {
      const s = { sup: 0, dem: 0, sent: 0, hoard: 0, rel: 0 }, c = { freight: 1, energy: 1 }, pd = {}, ps = {}; let rc = 0; for (const k in PRODUCTS) { pd[k] = 0; ps[k] = 0; }
      for (const a of this.active) { const e = NEWS.EVENTS[a.i], age = day - a.start, ramp = Math.max(1, 0.2 * a.days), f = age < ramp ? (age + 1) / ramp : Math.exp(-2.3 * (age - ramp) / Math.max(1, a.days - ramp)); a.f = f;
        s.sup += e.sup * f; s.dem += e.dem * f; s.sent += e.sent * f; s.hoard += e.hoard * f; if (e.rel) s.rel += e.rel / a.days; if (e.cost) { c.freight *= 1 + (((e.cost.freight || 1) - 1) * f); c.energy *= 1 + (((e.cost.energy || 1) - 1) * f); }
        rc += e.rc * f; for (const k in PRODUCTS) { const share = PRODUCTS[k].dem / 82; pd[k] += e.dem * f * share * (e.pd && e.pd[k] != null ? e.pd[k] : 1); if (e.ps && e.ps[k]) ps[k] += e.ps[k] * f; } }
      this.newsSum = s; this.cost = c; this.rcOut = clamp(rc, -0.1, 0.5); this.pNews = { pd, ps }; return s;
    }
    _spawn(day, month, date) {
      const p = this.P, st = this.state(); if (this.active.length >= p.maxActive) return null; let pick = null;
      for (let i = 0; i < NEWS.EVENTS.length; i++) { const e = NEWS.EVENTS[i];
        if (this.active.some(a => a.i === i)) continue; if (e.m && !e.m.includes(month)) continue; if (e.rq && !st[e.rq]) continue;
        const lastAt = this.last[i]; if (lastAt != null && day - lastAt < Math.max(p.minCdDays, e.days * 1.5)) continue; if (e.rare && (day - this.rareLast < p.rareGapDays || this.active.some(a => NEWS.EVENTS[a.i].rare))) continue;
        const cl = this.catLast[e.cat]; if (cl != null && day - cl < p.catGapDays) continue;
        let pr = e.p / 365; if (e.b && st[e.b]) pr *= 3; if (this.rng.next() < pr) { pick = i; break; } }
      if (pick == null) return null; return this._start(pick, day, date);
    }
    _start(i, day, date) {
      const e = NEWS.EVENTS[i]; this.active.push({ i, start: day, days: e.days, f: 0 }); this.last[i] = day; this.catLast[e.cat] = day; if (e.rare) this.rareLast = day;
      this.x = clamp(this.x + this.P.newsJump * e.sent, -this.P.xMax, this.P.xMax);                                          // a sharp item moves the price at once (its sentiment x newsJump)
      this.log.push({ id: e.id, day, date: date || null, cat: e.cat, text: e.text, desc: e.desc, dir: e.dir, power: e.power, days: e.days, status: 'active', end: day + e.days, x: r3(this.x), cover: r3(this.cover()) }); if (this.log.length > this.P.logMax) this.log.shift(); return e;
    }
    /* force an item (tests / scenario tools) */
    force(id, day, date) { const i = NEWS.EVENTS.findIndex(e => e.id === id); if (i < 0) return false; this.active = this.active.filter(a => a.i !== i); this._start(i, day == null ? this.lastDay : day, date); return true; }
    _retire(day) { const live = []; for (const a of this.active) { if (day - a.start < a.days) live.push(a); else { const L = this.log.find(l => l.id === NEWS.EVENTS[a.i].id && l.day === a.start); if (L) L.status = 'ended'; } } this.active = live; }
    _pick(w) { let tot = 0; for (const k in w) tot += w[k]; let u = this.rng.next() * tot; for (const k in w) { u -= w[k]; if (u <= 0) return k; } return Object.keys(w)[0]; }
    _regime() {
      const p = this.P, cur = REGIMES[this.regime], w = Object.assign({}, cur.next), cov = this.C / p.C0;
      if (w.SHORTAGE != null && cov < 0.95) w.SHORTAGE *= 2.5; if (w.OVERSUPPLY != null && cov > 1.05) w.OVERSUPPLY *= 2.5; if (w.RECESSION != null && this.x > 0.25) w.RECESSION *= 2.5; if (this.x < -0.25) { if (w.RECOVERY != null) w.RECOVERY *= 2; if (w.DEMAND_SURGE != null) w.DEMAND_SURGE *= 2; }
      this.regime = this._pick(w); const R = REGIMES[this.regime]; this.regLeft = Math.round(R.days[0] + this.rng.next() * (R.days[1] - R.days[0]));
      if (R.jump) this.x = clamp(this.x + R.jump[0] + this.rng.next() * (R.jump[1] - R.jump[0]), -p.xMax, p.xMax);
    }
    /* one game day.  day = days since the game began, month 1..12 */
    dayStep(day, month, date) {
      const p = this.P, rng = this.rng, R0 = REGIMES[this.regime]; this.lastDay = day; this.xPrev = this.x; for (const k in this.prod) this.prod[k].yPrev = this.prod[k].y;
      if (--this.regLeft <= 0) this._regime(); const R = REGIMES[this.regime];
      this._retire(day); this._spawn(day, month, date); const n = this._net(day);
      // supply: 4 groups; the OPEC+ quota follows the average price, shale answers the lagged price
      this.xlag += 0.05 * (this.x - this.xlag);
      if (--this.quotaLeft <= 0) { this.quotaLeft = p.quotaDays; if (this.xlag > 0.1) this.quota = Math.min(1.12, this.quota + 0.03); else if (this.xlag < -0.1) this.quota = Math.max(0.85, this.quota - 0.04); else this.quota += 0.1 * (1 - this.quota); }
      // the company's footprint (Phase 3): yesterday's flows -> the withheld supply and the answer of the other producers
      const F = this.dayFlow; this.dayFlow = { prod: 0, off: 0, buy: 0, hold: 0, rel: 0, kin: 0, kout: 0, net: 0 };
      const wh = this.ownAtProd ? -F.net : F.kin + F.buy - F.kout;                                          // mb/d the company took OUT of the commercial stock on balance (purchases + own oil kept in the reserve - what it produced and gave back); a surplus is negative
      this.sfs += p.sfsRate * (wh - this.sfs);
      let spare = 0, outSum = 0; GROUPS.forEach((g, i) => { spare += Math.max(0, g.base * g.capX - this.out[i]); outSum += this.out[i]; });
      const rTgt = clamp(p.respShare * this.sfs, -p.respCut * outSum, p.respSpare * spare); this.resp += p.respRate * (rTgt - this.resp); if (Math.abs(this.resp) < 1e-9) this.resp = 0;
      let Ptot = 0; GROUPS.forEach((g, i) => { const u0 = g.base / (g.base * g.capX), cap = g.base * g.capX, tgt = clamp(u0 * (g.id === 'OPEC' ? this.quota : 1) * (1 + g.eps * (g.id === 'AMER' ? this.xlag : this.x)), 0.5, 1);
        this.util[i] += 0.1 * (tgt - this.util[i]); const gross = cap * this.util[i], cut = Math.max(0, -(n.sup + R.sup)) * g.w, add = Math.max(0, n.sup + R.sup) * g.w; this.outage[i] = gross > 0 ? Math.min(0.9, cut / gross) : 0; this.out[i] = gross - Math.min(cut, gross * 0.9) + add + this.resp * g.w; Ptot += this.out[i]; });
      // demand
      this.indus += 0.02 * (R.ind - this.indus); const season = p.seasonAmp * Math.cos(2 * Math.PI * (month - 7) / 12);
      let P = Ptot, D = p.D0 * Math.exp(this.indus) * (1 - p.epsD * this.x) + season + n.dem; let net = P - D; if (this.C + net < p.floorC) { const cut = p.floorC - (this.C + net); D -= cut; net += cut; }
      this.C += net; this.acct.prod += P; this.acct.cons += D; this.flow.P = P; this.flow.D = D; this.flow.net = net;
      // strategic reserve
      if (n.rel > 0 && this.R > 0) { const q = Math.min(n.rel, this.R); this.R -= q; this.C += q; this.cum.released += q; }
      if (this.x < p.refillBelow && this.C > p.floorC + 10) { const q = Math.min(p.refillPerDay, this.C - p.floorC); this.C -= q; this.R += q; }
      // hoarding (the traders' share kept off the market; held oil has an age)
      const T = this.C + this.H, share = clamp(this.h0 - p.hoardK * this.x + p.hoardNews * n.hoard, 0, p.hoardMaxShare), target = T * share;
      let flow = clamp(p.hoardRate * (target - this.H), -p.hoardDayMax * T, p.hoardDayMax * T); if (flow > this.C - p.floorC) flow = Math.max(0, this.C - p.floorC); if (-flow > this.H) flow = -this.H;
      const H1 = this.H + flow; this.Hage = flow > 0 && H1 > 0 ? ((this.Hage + 1) * this.H) / H1 : this.Hage + 1; if (H1 <= 1e-9) this.Hage = 0; this.H = H1; this.C -= flow; this.flow.hoardFlow = flow; if (flow > 0) this.cum.hoarded += flow; else this.cum.released -= flow;
      if (this.held > 0) this.heldAge = (this.heldAge || 0) + 1; else this.heldAge = 0;
      // price: target from stock cover + today's gap + news + regime; momentum of the previous change; volatility of the regime; calculated randomness
      const cover = this.C / p.C0, inv = -p.beta * Math.log(Math.max(0.2, cover)), gap = p.gapSign * p.gapK * (P - D) / p.D0, xs = inv + gap + n.sent + R.sent;          // the company's own flows reach the price through the commercial stock C (the cover term) and through the answer of the other producers (resp, inside P)
      this.drivers = { inv, gap, news: n.sent, regime: R.sent, target: xs };
      let dx = p.kappa * (xs - this.x) + p.mu * this.dx + p.sigma * R.vol * rng.gauss(); dx = clamp(dx, -p.dayMax, p.dayMax);
      const x0 = this.x; this.x = clamp(this.x + dx, -p.xMax, p.xMax); this.dx = this.x - x0 + 0;                              // jump already included in x before the step is the news / regime jump: it is not a momentum
      this.coHist.push([day, F.prod, F.off, F.buy, F.hold, F.rel, P, D, this.C, this.resp, this.K]); while (this.coHist.length > p.coHist) this.coHist.shift();
      this.avgC += (this.C - this.avgC) / p.avgDays;
      this._products(month, n, R);
    }
    /* product markets of the day */
    _products(month, n, R) {
      const p = this.P, rng = this.rng, crudeScarce = Math.min(1, this.C / (0.4 * p.C0)), runs = p.refCap * (1 - this.rcOut) * crudeScarce, crude = this.price();
      for (const k in PRODUCTS) { const d = PRODUCTS[k], s = this.prod[k], share = d.dem / 82, sup = runs * share * (1 + p.prodFlex * s.y);
        const season = d.season * 0.1 * d.dem * Math.cos(2 * Math.PI * (month - d.peak) / 12) / 1;                       // seasonal swing of the product's demand (mb/d)
        let dem = (d.dem * Math.exp(this.indus) + season + this.pNews.pd[k]) * (1 - p.prodElast * s.y); let net = sup - dem;
        if (s.S + net < 0.5) { dem -= 0.5 - (s.S + net); net = sup - dem; }
        s.S += net; s.sup = sup; s.dem = dem; s.acct.sup += sup; s.acct.dem += dem;
        const cov = s.S / (d.dem * p.prodDays), ys = -d.beta * Math.log(Math.max(0.2, cov)) + this.pNews.ps[k] + 0.4 * (this.x - 0) * 0 + 0.3 * R.sent + 0.5 * this.drivers.news * (this.pNews.ps[k] ? 0 : 1);
        s.y = clamp(s.y + p.prodKappa * (ys - s.y) + p.prodSigma * R.vol * rng.gauss(), -p.prodMax, p.prodMax); }
    }
    /* the price of a product at its own y (cost floor: crude + refining + transport + storage) */
    _pp(k, y) { const d = PRODUCTS[k]; let v = d.base * Math.pow(this.P.PEQ ? this._cx / this.P.PEQ : 1, d.theta) * Math.exp(y); if (d.floor) v = Math.max(v, this._cx + this.P.costFloor * Math.max(0.5, this.cost.energy)); return v; }
    /* hour h (0..23) of the game day: the price glides from yesterday's level to today's, plus a small intraday wobble (so candles have a real range) */
    hour(h) {
      const p = this.P, f = (h + 1) / 24; this.intra = clamp(this.intra * (1 - p.intraRevert) + p.intraSigma * this.rng.gauss(), -p.intraMax, p.intraMax);
      const x = this.xPrev + (this.x - this.xPrev) * f + this.intra, out = { CRUDE: r2(p.PEQ * Math.exp(x)) }; this._cx = out.CRUDE;
      for (const k in PRODUCTS) { const s = this.prod[k]; s.intra = clamp(s.intra * (1 - p.intraRevert) + p.intraSigma * 0.8 * this.rng.gauss(), -p.intraMax, p.intraMax); out[k] = r2(Math.max(0.01, this._pp(k, s.yPrev + (s.y - s.yPrev) * f + s.intra))); }
      return out;
    }
    /* the player's trades, in barrels.  Bought oil leaves the market; sold oil comes back; own produced oil is new supply (counted once) */
    playerBuy(bbl) { const mb = bbl / 1e6; this.C -= mb; this.acct.bought += mb; this.held += mb; this.dayFlow.buy += mb; if (this.ownAtProd) this.dayFlow.net -= mb; }
    playerSell(ownBbl, boughtBbl) {
      const a = ownBbl / 1e6, b = boughtBbl / 1e6; this.acct.soldBought += b; this.held = Math.max(0, this.held - b); this.dayFlow.off += a + b;
      if (this.ownAtProd) { this.C += b; this.dayFlow.net += b; }                       // own oil joined C when it was produced; only bought oil comes back now
      else { this.C += a + b; this.acct.ownSold += a; }
    }
    /* own crude sold OUT OF THE RESERVE: it was held off the market, so it joins the supply now (bought oil comes back as always) */
    playerSellReserve(ownBbl, boughtBbl) {
      const a = ownBbl / 1e6; if (!this.ownAtProd) return this.playerSell(ownBbl, boughtBbl);
      const t = Math.min(a, this.K); this.K -= t; this.C += t; this.dayFlow.kout += t; this.dayFlow.net += t; this.acct.coKSold = (this.acct.coKSold || 0) + t; this.playerSell(0, boughtBbl); this.dayFlow.off += a; if (a > t) this.C += 0;
    }
    coProduce(bbl) { const q = bbl / 1e6; this.dayFlow.prod += q; if (this.ownAtProd) { this.C += q; this.acct.coIn += q; this.dayFlow.net += q; } }
    coConsume(bbl) { const q = bbl / 1e6; if (!this.ownAtProd || !(q > 0)) return; const t = Math.min(q, Math.max(0, this.C - this.P.floorC)); this.C -= t; this.acct.coOut += t; this.dayFlow.net -= t; }       // own crude refined or lost: it leaves the commercial stock
    coHold(totalBbl, ownBbl) { const m = totalBbl / 1e6; this.dayFlow.hold += m; if (!this.ownAtProd) return; const t = Math.min((ownBbl || 0) / 1e6, Math.max(0, this.C - this.P.floorC)); this.C -= t; this.K += t; this.dayFlow.kin += t; this.dayFlow.net -= t; }
    coRelease(totalBbl, ownBbl) { const m = totalBbl / 1e6; this.dayFlow.rel += m; if (!this.ownAtProd) return; const t = Math.min((ownBbl || 0) / 1e6, this.K); this.K -= t; this.C += t; this.dayFlow.kout += t; this.dayFlow.net += t; }
    productBuy(k, bbl) { const s = this.prod[k]; if (!s) return; const mb = bbl / 1e6; s.S = Math.max(0, s.S - mb); s.acct.bought += mb; }
    productSell(k, bbl) { const s = this.prod[k]; if (!s) return; const mb = bbl / 1e6; s.S += mb; s.acct.ownSold += mb; }
    /* conservation of crude: returns the difference (0 when no oil was counted twice or lost) */
    check() { const p = this.P, a = this.acct, want = p.C0 + p.H0 + p.R0 + a.prod - a.cons + a.ownSold + a.soldBought - a.bought + (a.coIn || 0) - (a.coOut || 0); return (this.C + this.H + this.R + (this.K || 0)) - want; }
    checkProduct(k) { const s = this.prod[k], d = PRODUCTS[k]; return s.S - (d.dem * this.P.prodDays + s.acct.sup - s.acct.dem + s.acct.ownSold - s.acct.bought); }
    level(r) { return r > 1.03 ? 'HIGH' : r < 0.97 ? 'LOW' : 'NORMAL'; }
    view() {
      const p = this.P, R = REGIMES[this.regime];
      return { C: this.C, H: this.H, R: this.R, total: this.C + this.H + this.R, cover: this.C / p.C0, normal: p.C0, avg: this.avgC, coverDays: this.C / Math.max(1, this.flow.D), hoardShare: this.H / Math.max(1, this.C + this.H), hoardAge: this.Hage, held: this.held, heldAge: this.heldAge || 0, x: this.x, regime: this.regime, regimeAr: R.ar, drivers: this.drivers, flow: this.flow, news: this.newsSum, cost: this.cost, quota: this.quota, rcOut: this.rcOut,
        groups: GROUPS.map((g, i) => ({ id: g.id, ar: g.ar, out: this.out[i], cap: g.base * g.capX, util: this.util[i], outage: this.outage[i] })),
        levels: { supply: this.level(this.flow.P / p.D0 / (1 + (R.sup * 0))), demand: this.level(this.flow.D / p.D0), stock: this.level(this.C / p.C0) },
        active: this.active.map(a => ({ id: NEWS.EVENTS[a.i].id, text: NEWS.EVENTS[a.i].text, desc: NEWS.EVENTS[a.i].desc, dir: NEWS.EVENTS[a.i].dir, cat: NEWS.EVENTS[a.i].cat, left: Math.max(0, a.days - (this.lastDay - a.start)), days: a.days, f: a.f })) };
    }
    /* the company's real footprint, from the daily rows: averages over the last n days (30 = the month), shares of the world, and what it did to the price / to the other producers.  bbl/day */
    footprint(n) {
      n = n || 30; const H = this.coHist.filter(r => r[0] >= 0).slice(-n), k = H.length || 1, avg = i => H.reduce((a, r) => a + r[i], 0) / k * 1e6, last = this.coHist[this.coHist.length - 1] || [0, 0, 0, 0, 0, 0, this.flow.P, this.flow.D, this.C, 0, 0];
      const prod = avg(1), off = avg(2), buy = avg(3), hold = avg(4), rel = avg(5), wP = avg(6), wD = avg(7), wTotP = wP + prod, wSup = wP + off;
      return { days: H.length, prod, offered: off, bought: buy, held: hold, released: rel, worldProd: wTotP, worldSupply: wSup, worldDemand: wD, shareProd: wTotP > 0 ? prod / wTotP * 100 : 0, shareSupply: wSup > 0 ? off / wSup * 100 : 0,
        withheld: this.sfs * 1e6, response: this.resp * 1e6, kept: this.K * 1e6, sensitivity: this.P.beta / Math.max(1, this.C) * 100, stockCover: this.C / this.P.C0, demandRatio: this.flow.D / this.P.D0,
        day: { prod: last[1] * 1e6, offered: last[2] * 1e6, bought: last[3] * 1e6, held: last[4] * 1e6, released: last[5] * 1e6 } };
    }
    toJSON() { const o = { v: 2 }; for (const k of ['C', 'H', 'R', 'Hage', 'x', 'xPrev', 'dx', 'intra', 'xlag', 'quota', 'quotaLeft', 'indus', 'regime', 'regLeft', 'lastDay', 'avgC', 'active', 'last', 'catLast', 'rareLast', 'log', 'held', 'heldAge', 'acct', 'cum', 'drivers', 'flow', 'newsSum', 'cost', 'rcOut', 'util', 'outage', 'out', 'prod', 'pNews', 'dayFlow', 'sfs', 'resp', 'K', 'ownAtProd', 'coHist']) o[k] = this[k]; return o; }
    load(st) { for (const k of Object.keys(st)) if (k !== 'v') this[k] = st[k]; }
  }
  /* candles of the game's own daily prices (o h l c per game day, d = ISO date, wd = weekday 0..6) grouped into week / month / year */
  function keyOf(c, frame) { if (frame === 'D') return c.d; if (frame === 'M') return c.d.slice(0, 7); if (frame === 'Y') return c.d.slice(0, 4); return 'W' + (c.day - ((c.wd + 6) % 7)); }
  function groupOHLC(rows, frame) {
    if (frame === 'D') return rows.map(r => ({ key: r.d, start: r.d, end: r.d, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v || 0, n: 1 }));
    const out = []; let cur = null; for (const r of rows) { const k = keyOf(r, frame); if (!cur || cur.key !== k) { cur = { key: k, start: r.d, end: r.d, o: r.o, h: r.h, l: r.l, c: r.c, v: 0, n: 0 }; out.push(cur); } cur.end = r.d; cur.n++; cur.v += r.v || 0; cur.c = r.c; if (r.h > cur.h) cur.h = r.h; if (r.l < cur.l) cur.l = r.l; }
    return out;
  }
  return { OilEngine, REGIMES, GROUPS, PRODUCTS, DEF, groupOHLC, keyOf };
});
