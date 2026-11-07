/* Oli - economy.js  (Phase 3: Economy + Market + Selling + Company finance + Inventory + Contracts + Loans + Tax + Offline simulation)
 *
 * A READ-ONLY layer over Phase 2.  It never changes how pipes, pressure or flow behave: it reads the Sim / BuildingStore state, owns the money, and writes only
 * `b.s.ecoEff` (power / condition / crude quality efficiency, default 1 -> identical Phase 2 behaviour) and `b.c` (condition, always 1 now: equipment does not wear out or break down; maintenance is an automatic daily cost).
 * Time is Game Time in hours.  One simulation tick = 1 game hour (offline: 3 h) and does not depend on FPS: same inputs -> same results.
 *   Revenue only comes from selling a product (spot sale or contract delivery).  Every expense has a cause (operating, maintenance, energy, storage, labor, insurance, admin, infrastructure, fees, interest, tax).
 * No DOM here (economy-ui.js is the screen).  Everything the player can tune is in economy-config.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./buildings.js'), require('./building-config.js'), require('./industry.js'), require('./economy-config.js'), require('./ledger.js'), require('./game-calendar.js'), require('./oil-engine.js'));
  else root.OliEconomy = factory(root.OliBuildings, root.OliBuildingConfig, root.OliIndustry, root.OliEconomyConfig, root.OliLedger, root.OliCalendar, root.OliOilEngine);
})(typeof self !== 'undefined' ? self : this, function (B, BC, I, EC, LG, CAL, OE) {
  'use strict';
  const DEFS = B.DEFS, SELL = EC.PRODUCTS, clamp = (v, a, b) => v < a ? a : v > b ? b : v, r2 = v => Math.round(v * 100) / 100;
  const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + (c || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  class Rng {                                                                       // mulberry32 with an exposed state, so a saved market continues exactly where it stopped
    constructor(s) { this.s = (s >>> 0) || 1; }
    next() { let t = (this.s = (this.s + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    gauss() { return (this.next() + this.next() + this.next() - 1.5) * 2; }          // sum of 3 uniforms: mean 0, sd 1, bounded (no wild outliers)
  }

  /* ------------------------------------------------------------ ledgers: period views of the journal (every field is a projection of journal entries) */
  const { Journal, ACC: ACCOUNTS } = LG;
  const PZERO = () => ({ CRUDE: 0, THRU: 0, GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 }), SZERO = () => ({ CRUDE: 0, GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 });
  const EXPNAMES = ['operating', 'labor', 'maintenance', 'energy', 'storage', 'rstorage', 'rops', 'insurance', 'admin', 'infra', 'fees', 'penalty', 'interest', 'tax', 'depreciation', 'disposal', 'cogs', 'exploration', 'refFuel', 'refLoss'];
  const ledger = cash0 => { const L = { cash0: cash0 || 0, revenue: 0, spot: 0, contract: 0, other: 0, water: 0, lifting: 0, chem: 0, ops: 0, operating: 0, capex: 0, principal: 0, loansIn: 0, equityIn: 0, assetSales: 0, produced: PZERO(), sold: SZERO(), soldRev: 0, pl: {}, cf: {} };
    for (const k of EXPNAMES) { L[k] = 0; L.pl[k] = 0; }                             // L[k] = expense booked (or the incurred cost of that kind); pl[k] = the same expense in the profit
    for (const f of ['OP', 'INV', 'FIN']) L.cf[f] = { in: 0, out: 0 };
    return L; };
  const VARK = ['fees', 'cogs'], OPEXK = ['operating', 'labor', 'maintenance', 'energy', 'storage', 'rstorage', 'rops', 'insurance', 'admin', 'infra', 'penalty', 'depreciation', 'disposal', 'exploration', 'refFuel', 'refLoss'];
  const sumPL = (L, ks) => ks.reduce((a, k) => a + (L.pl[k] || 0), 0);
  function calc(L, cashNow) {                                                       // the formulas of the spec, in one place (profit from the P&L accounts, cash from the cash-flow tags)
    const variable = sumPL(L, VARK), opex = sumPL(L, OPEXK), interest = L.pl.interest, tax = L.pl.tax, gross = L.revenue - variable, net = gross - opex - interest - tax;
    const flows = {}; let cashIn = 0, cashOut = 0; for (const f of ['OP', 'INV', 'FIN']) { const x = L.cf[f]; flows[f] = { in: x.in, out: x.out, net: x.in - x.out }; cashIn += x.in; cashOut += x.out; }
    return { revenue: L.revenue, variable, opex, expenses: variable + opex + interest + tax, grossProfit: gross, netProfit: net, interest, tax, cogs: L.pl.cogs, depreciation: L.pl.depreciation,
      grossMargin: L.revenue > 0 ? (L.revenue - L.pl.cogs) / L.revenue * 100 : null,     // (sales revenue - COGS) / sales revenue x 100; null = not available (no sales)
      cash: { start: L.cash0, in: cashIn, out: cashOut, end: L.cash0 + cashIn - cashOut, actualEnd: cashNow, flows }, L };
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ------------------------------------------------------------ market */
  class Market {
    constructor(cfg, st, seed) {
      this.cfg = cfg; const M = cfg.MARKET, EG = cfg.ENGINE, sd = (seed || M.seed) >>> 0;
      if (st) { Object.assign(this, { hour: st.hour, shared: st.shared, dem: st.dem, regime: st.regime, impact: st.impact, price: st.price, hist: st.hist, events: st.events || [], stock: st.stock || {} }); this.rng = new Rng(st.rng); this.erng = new Rng(st.erng || (sd ^ 0x9e3779b9)); this.gc = st.gc || {}; this.wrng = new Rng(st.wrng || (sd ^ 0x5bd1e995));
        this.gc = this.gcUnpack(st.gc);
        if (this.useEngine()) {                                                    // an older save (before the engine) goes on with the engine from its saved price; the market never restarts
          this.engine = new OE.OilEngine(EG.params, this.wrng, st.engine || null);
          if (!st.engine) { const E = this.engine; E.lastDay = Math.floor((st.hour || 0) / 24) - 1; const x = Math.log(Math.max(1, (this.price.CRUDE || E.P.PEQ)) / E.P.PEQ); E.x = E.xPrev = Math.max(-0.5, Math.min(0.5, x)); this.gc = {}; }
          if (this.price.BYPRODUCT == null) { this.price.BYPRODUCT = cfg.PRICE.base.CRUDE * cfg.BYPRODUCT.priceRatioToCrude; this.hist.BYPRODUCT = []; }
        } return; }
      this.gc = {}; this.rng = new Rng(sd); this.erng = new Rng(sd ^ 0x9e3779b9); this.wrng = new Rng(sd ^ 0x5bd1e995); this.seed = sd; this.engine = this.useEngine() ? new OE.OilEngine(EG.params, this.wrng, null) : null; if (this.engine) this.engine.ownAtProd = true; this.events = []; this.stock = {}; this.hour = 0; this.shared = 0; this.dem = {}; this.regime = {}; this.impact = {}; this.price = {}; this.hist = {};
      for (const p of SELL) { this.dem[p] = 0; this.regime[p] = { dir: 0, left: 0 }; this.impact[p] = 0; this.price[p] = cfg.PRICE.base[p]; this.hist[p] = []; }
      if (this.engine) {                                                         // the graphs have a past on day one: the engine is run for warmDays of "before the game" days (negative game days) - generated by the same equations, no stored data
        this.price.BYPRODUCT = cfg.PRICE.base.CRUDE * cfg.BYPRODUCT.priceRatioToCrude; this.hist.BYPRODUCT = []; this.engine.lastDay = -EG.warmDays - 1;
        for (let gh = -EG.warmDays * 24; gh < 0; gh++) this.tick(gh); this.hour = 0; return;
      }
      for (let i = 0; i < M.warmupHours; i++) this.tick();
    }
    /* MarketPrice = BasePrice x DemandFactor x SupplyFactor x Volatility, smoothed, limited to +-dailyChangeLimit against 24 h ago */
    useEngine() { return !!(OE && this.cfg.ENGINE && this.cfg.ENGINE.enabled); }                  // the Oil Market Engine (false = the old generic random-walk market, kept for the unit tests of the generic mechanics)
    /* the calendar of a game day (negative = before the game began): ISO date, month, weekday - pure arithmetic from the central calendar */
    cal(day) { const s0 = CAL.dateOfDay(0), t = Date.UTC(s0.year, s0.month - 1, s0.day) / 86400000 + day, d = new Date(t * 86400000), p = n => String(n).padStart(2, '0'); return { day, d: d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()), month: d.getUTCMonth() + 1, wd: d.getUTCDay() }; }
    /* one game hour.  Engine market: the day boundary of the central clock runs the engine's day, the hour glides the price.  gh = the central game hour (negative = the warm-up before the game) */
    tick(gh) {
      if (this.engine) return this._engineTick(gh == null ? this.hour : gh);
      gh = this.hour; const M = this.cfg.MARKET, rng = this.rng, decay = Math.exp(-Math.LN2 / (M.impactHalfLifeDays * 24)); this.shared += -M.meanRevert * this.shared + M.sharedSigma * rng.gauss();
      this._events(); const EV = this.eventMult();
      for (const p of SELL) {
        const R = this.regime[p]; if (--R.left <= 0) { const u = rng.next(); R.dir = u < 0.33 ? -1 : u < 0.66 ? 0 : 1; R.left = M.regimeHours[0] + Math.floor(rng.next() * (M.regimeHours[1] - M.regimeHours[0])); }
        this.dem[p] += -M.meanRevert * this.dem[p] + M.sigma[p] * rng.gauss() + R.dir * M.regimeDrift; this.impact[p] *= decay;
        const noiseN = rng.gauss();
        const demandF = Math.exp(M.sharedWeight * this.shared + this.dem[p]), supplyF = Math.exp(-M.impact * this.impact[p] / M.depth[p]), volF = 1 + M.noise * noiseN, base = this.cfg.PRICE.base[p];
        // target = base x demand x supply x volatility x competition x stock pressure x events;  new price = old x (1 + change), change = (target / old - 1) x smoothing
        const compF = M.competitionMult[M.competition[p]] || 1, stockF = 1 - this.stockPressure(p), target = base * demandF * EV.demand[p] * supplyF * EV.supply[p] * volF * compF * stockF;
        const hl = M.hourlyChangeLimit, dl = M.dailyChangeLimit;
        const chg = clamp((target / this.price[p] - 1) * M.smooth, -hl, hl);
        let pr = this.price[p] * (1 + chg); const h = this.hist[p], ref = h.length >= 24 ? h[h.length - 24] : base;
        pr = clamp(pr, ref * (1 - dl), ref * (1 + dl)); { const rg = this.cfg.PRICE.range[p]; pr = clamp(pr, rg[0] * M.floorMult, rg[1] * M.ceilMult); } pr = r2(Math.max(0.01, pr));
        pr = clamp(pr, this.price[p] * (1 - hl), this.price[p] * (1 + hl));   // the hourly bound holds last, even when the band or range pulls the price back
        this.price[p] = pr; h.push(pr); if (h.length > M.historyHours) h.shift();
      }
      this.hour = gh + 1;
    }
    _engineTick(gh) {
      const E = this.engine, M = this.cfg.MARKET, day = Math.floor(gh / 24), hod = gh - day * 24;
      while (E.lastDay < day) { const d = E.lastDay + 1, c = this.cal(d); E.dayStep(d, c.month, c.d); }
      const o = E.hour(hod), c = this.cal(day);
      for (const p of SELL.concat(['BYPRODUCT'])) { const pr = o[p === 'CRUDE' ? 'CRUDE' : p]; this.price[p] = pr; const h = this.hist[p]; h.push(pr); if (h.length > M.historyHours) h.shift(); this._candle(p, day, c, pr, p === 'CRUDE' ? E.flow.D : E.prod[p].dem); }
      this.hour = gh + 1;
    }
    /* the game's own candle per product (Open / High / Low / Close of the price the player trades at), one per game day, from the hourly prices */
    _candle(p, day, c, pr, vol) { vol = Math.round(vol * 100) / 100; const g = this.gc[p] || (this.gc[p] = []), a = g[g.length - 1]; if (!a || a.day !== day) { g.push({ day, d: c.d, wd: c.wd, o: pr, h: pr, l: pr, c: pr, v: vol }); if (g.length > (this.cfg.ENGINE.candleDays || 1500)) g.shift(); } else { if (pr > a.h) a.h = pr; if (pr < a.l) a.l = pr; a.c = pr; a.v = vol; } }
    /* candles are saved compactly as [day, o, h, l, c] and get their date back from the calendar */
    gcPack() { const o = {}; for (const p in this.gc) o[p] = this.gc[p].map(c => [c.day, c.o, c.h, c.l, c.c, Math.round((c.v || 0) * 100) / 100]); return o; }
    gcUnpack(g) { const o = {}; if (!g || Array.isArray(g)) return o; for (const p in g) o[p] = g[p].map(c => { if (!Array.isArray(c)) return c; const k = this.cal(c[0]); return { day: c[0], d: k.d, wd: k.wd, o: c[1], h: c[2], l: c[3], c: c[4], v: c[5] || 0 }; }); return o; }
    /* the player's trades reach the market once: crude through the engine's commercial stock (buy removes, sell adds), products through each product's own stock */
    engineBuy(p, qty, got) { if (!this.engine) return; if (p === 'CRUDE') this.engine.playerBuy(got); else this.engine.productBuy(p, got); }
    engineSell(p, take, qty) { if (!this.engine) return; if (p === 'CRUDE') this.engine.playerSell(take ? take.own : qty, take ? take.bought : 0); else this.engine.productSell(p, qty); }
    /* the price level 'normal' for a product: the fixed base price, or (engine market, where the level moves) the average of the last 30 days */
    refPrice(p) { if (!this.engine) return this.cfg.PRICE.base[p]; const h = this.hist[p]; return h.length ? h.reduce((a, b) => a + b, 0) / h.length : this.cfg.PRICE.base[p]; }
    sold(p, qty) { if (this.engine) return; this.impact[p] += qty; }
    /* the company's footprint on the world market (Phase 3): flows the engine turns into shares, withheld supply and the answer of the other producers */
    coProduce(q) { if (this.engine && q > 0) this.engine.coProduce(q); } coConsume(q) { if (this.engine && q > 0) this.engine.coConsume(q); } coHold(q, own) { if (this.engine && q > 0) this.engine.coHold(q, own); } coRelease(q, own) { if (this.engine && q > 0) this.engine.coRelease(q, own); }
    engineSellReserve(p, take, qty) { if (!this.engine) return; if (p === 'CRUDE') this.engine.playerSellReserve(take ? take.own : qty, take ? take.bought : 0); else this.engine.productSell(p, qty); }
    footprint(n) { return this.engine ? this.engine.footprint(n) : null; }
    /* economic events: at most maxEvents at once, each for its number of days; they start by chance on their own random stream */
    _events() {
      const M = this.cfg.MARKET; for (const e of this.events) e.left--; this.events = this.events.filter(e => e.left > 0);
      if (this.events.length < M.maxEvents && this.erng.next() < M.eventChancePerDay / 24) { const E = M.events, pick = E[Math.floor(this.erng.next() * E.length)]; if (!this.events.some(e => e.id === pick.id)) this.events.push({ id: pick.id, label: pick.label, left: pick.days * 24 }); }
    }
    eventMult() {
      const d = {}, s = {}; for (const p of SELL) { d[p] = 1; s[p] = 1; }
      for (const ev of this.events) { const def = this.cfg.MARKET.events.find(x => x.id === ev.id); if (!def) continue;
        for (const p of SELL) { d[p] *= (def.demand && (def.demand[p] || def.demand.ALL)) || 1; s[p] *= (def.supply && (def.supply[p] || def.supply.ALL)) || 1; } }
      return { demand: d, supply: s };
    }
    costMult() { if (this.engine) return { freight: this.engine.cost.freight, energy: this.engine.cost.energy }; const m = { freight: 1, energy: 1 }; for (const ev of this.events) { const def = this.cfg.MARKET.events.find(x => x.id === ev.id); if (def && def.cost) { m.freight *= def.cost.freight || 1; m.energy *= def.cost.energy || 1; } } return m; }
    /* stock pressure: a product that is more than stockFrom full pulls its price down (bounded by stockPressure) */
    stockPressure(p) { const f = this.stock[p] || 0, M = this.cfg.MARKET; return f > M.stockFrom ? M.stockPressure * Math.min(1, (f - M.stockFrom) / (1 - M.stockFrom)) : 0; }                                         // the Supply factor: what the player dumps on the market lowers the price for a few days
    change24(p) { const h = this.hist[p], now = this.price[p], ref = h.length > 24 ? h[h.length - 25] : this.cfg.PRICE.base[p]; return now / ref - 1; }
    trend(p) { const c = this.change24(p); return c > this.cfg.MARKET.trendEps ? 'UP' : c < -this.cfg.MARKET.trendEps ? 'DOWN' : 'STABLE'; }
    series(p, hours, points) { const h = this.hist[p], n = Math.min(hours, h.length), a = h.slice(h.length - n); if (!points || a.length <= points) return a; const step = a.length / points, out = []; for (let i = 0; i < points; i++) out.push(a[Math.min(a.length - 1, Math.floor(i * step))]); out.push(a[a.length - 1]); return out; }
    toJSON() { return { rng: this.rng.s, erng: this.erng.s, events: this.events, stock: this.stock, hour: this.hour, shared: this.shared, dem: this.dem, regime: this.regime, impact: this.impact, price: this.price, hist: this.hist, gc: this.gcPack(), wrng: this.wrng.s, engine: this.engine ? this.engine.toJSON() : null }; }
  }

  /* ------------------------------------------------------------ the company (every money / stock movement is a journal entry) */
  const EXPACC = { operating: 'EXP_OPERATING', labor: 'EXP_LABOR', maintenance: 'EXP_MAINT', energy: 'EXP_ENERGY', storage: 'EXP_STORAGE', rstorage: 'EXP_RSTORAGE', rops: 'EXP_ROPS', insurance: 'EXP_INSURANCE', admin: 'EXP_ADMIN', infra: 'EXP_INFRA', fees: 'EXP_FEES', penalty: 'EXP_PENALTY', interest: 'EXP_INTEREST', tax: 'EXP_TAX', depreciation: 'EXP_DEP', disposal: 'EXP_DISPOSAL', cogs: 'COGS', exploration: 'EXP_EXPLORATION', refFuel: 'EXP_FUEL', refLoss: 'EXP_LOSS' };
  const EXPKEY = {}; for (const k of Object.keys(EXPACC)) EXPKEY[EXPACC[k]] = k;
  const REVKEY = { REV_SPOT: 'spot', REV_CONTRACT: 'contract', REV_OTHER: 'other', REV_WATER: 'water' };
  const TKA = { RESERVE: 'احتياطي استراتيجي', COMMERCIAL: 'تخزين تجاري (غير موصول)', PRODUCTION: 'مخزن إنتاج (موصول بالآبار)', TRADE: 'مخزن تجارة ونقل' };
  const INVACC = { CRUDE: 'INV_CRUDE', GASOLINE: 'INV_GASOLINE', DIESEL: 'INV_DIESEL', JET_FUEL: 'INV_JET_FUEL', GAS: 'INV_GAS' };
  const MATACC = { CHEM: 'INV_CHEM', PARTS: 'INV_PARTS', OPS: 'INV_OPS' }, MZERO = () => ({ CHEM: 0, PARTS: 0, OPS: 0 });
  const HRROLES = ['operators', 'engineers', 'maintenance', 'managers'], HRZERO = () => { const o = {}; for (const r of HRROLES) o[r] = { extra: 0, training: 1, hours: 48, exp: 5 }; return o; };
  const PRODS = ['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'], REF_OTHER = ['BYPRODUCT', 'RESIDUE', 'FUEL'], CHAIN = { well: 1, pump: 1, separator: 1, valve: 1, junction: 1 }, FLOWS = ['OP', 'INV', 'FIN'], EPS2 = 1e-6;

  class Company {
    constructor(store, net, sim, opts) {
      opts = opts || {}; this.mseed = opts.marketSeed; this.cfg = opts.config || EC; this.store = store; this.net = net; this.sim = sim; this.now = opts.now || (() => Date.now()); this._init(); this._wrap();
    }
    _init() {
      this.water = { v: 1, produced: 0, sold: 0, revenue: 0, log: [], day: -1, today: 0 }; this.netOil = true; this.reserve = { v: 1, lv: 0, log: [] }; this._hookReserve();                       // the Strategic Reserve: one fixed zone, its open-area level and a small audit log
      const c = this.cfg; this.hours = 0; this.dayIdx = 0; this.acc = 0; this.market = new Market(c, null, this.mseed); this.assets = new Map(); this.loans = []; this.nextLoan = 1; this.closed = []; this.contracts = []; this.history = []; this.offers = []; this.nextContract = 1;
      this.recv = []; this.nextRecv = 1; this.months = []; this.bsStart = null; this.qty = PZERO(); this.qty2 = { BYPRODUCT: 0, RESIDUE: 0 }; this.crudeShort = 0; this.crudeLoss = 0; this.bq = 0; this.explLog = []; this.bprod = {}; this.tradeLog = []; this.nextTrade = 1; this.boughtUsed = 0; this.refLast = null; this.mats = MZERO(); this.payables = []; this.nextPay = 1; this.purchases = []; this.nextPur = 1; this.matLimit = 1; this.hr = HRZERO(); this.staffF = 1; this.engMult = 1; this.teamEff = 1; this.cutUntil = -1; this.powerBuy = false; this.pwStop = null; this.bsStart = null;                                                            // qty = book quantity of each stock pool (its cost is in the journal)
      this.crng = new Rng(c.MARKET.seed ^ 0x5bd1e995); this.modes = {}; for (const p of SELL) this.modes[p] = c.AUTOSELL && c.AUTOSELL.defaultMode || 'SPOT'; this.tier = c.POWER.startTier; this.autoRepair = c.MAINTENANCE.autoRepair;
      const cash = isFinite(this.store.cash) ? this.store.cash : 0;
      this.journal = new Journal(); this.led = { day: ledger(cash), month: ledger(cash), year: ledger(cash), life: ledger(cash) }; this.lastMonth = null; this.days = []; this.dlog = []; this.prodHist = []; this.crudeQ = 1;
      this.fin = { state: 'OK', stage: 'NORMAL', negHours: 0, emergencyAt: -1, missed: 0, lateSalary: false, score: 0, indicators: [] }; this.taxCarry = 0; this.bankrupt = false; this.pw = { demand: 0, cap: c.POWER.tiers[this.tier].kw, factor: 1, limited: false }; this.staff = { operators: 0, engineers: 0, maintenance: 0, managers: 0, total: 0, payroll: 0 };
      this.speed = 1; this.lastSpeed = 1; this.mirror = this.store.cash; this.lastSim = null; this.away = null; this.events = []; this.seen = new Set(); this.badClock = false;
      this._post({ type: 'OPENING', flow: 'NONE', desc: 'Opening balance', noProj: true }, [['CASH', cash], ['EQUITY', -cash]], { cashApplied: true });
      this._refreshOffers(); this.computeStaff(); this.bsStart = this._snap();
    }
    reset() { this._init(); }
    _wrap() {                                                                       // every purchase / demolition goes through the journal (the store and its validation are not changed)
      const st = this.store; if (st.__eco) { st.__eco = this; return; } st.__eco = this; const place = st.place.bind(st), dem = st.demolish.bind(st);
      st.place = (...a) => { const me = st.__eco; me.sync(); const r = place(...a); if (r.ok) { me.assets.set(r.building.id, { cost: r.cost, t: me.hours, dep: 0, useStart: null }); me._post({ type: 'BUILD', flow: 'INV', desc: DEFS[r.building.d].name }, [['FIXED', r.cost], ['CASH', -r.cost]], { cashApplied: true }); } return r; };
      st.demolish = (...a) => { const me = st.__eco; me.sync(); const rec = me.assets.get(a[0]), r = dem(...a);
        if (r.ok) { let refund = r.refund || 0; if (me._saleOverride != null && isFinite(st.cash)) { st.cash += me._saleOverride - refund; refund = me._saleOverride; }   // a sale brings the sale price, not the demolition refund
          me._dispose(rec, refund); me.assets.delete(a[0]); r.refund = refund; } return r; };
    }

    /* ---- the one door to the journal ---- */
    _post(meta, lines, opts) {
      opts = opts || {}; meta = Object.assign({ t: this.hours, flow: 'NONE' }, meta);
      if (!opts.cashApplied && isFinite(this.store.cash)) this.sync();                 // money that moved outside the journal (pipe works) is recorded before the mirror is updated
      let cashNet = 0; for (const [a, v] of lines) if (a === 'CASH') cashNet += v;
      if (cashNet !== 0 && meta.flow === 'NONE' && !meta.noProj) throw new Error('cash movement without a cash-flow tag: ' + meta.type);
      const e = this.journal.post(meta, lines);                                    // refuses an unbalanced entry: nothing is applied then
      if (!opts.cashApplied && cashNet !== 0 && isFinite(this.store.cash)) this.store.cash += cashNet;
      this.mirror = this.store.cash;
      if (!meta.noProj) this._project(lines, meta);
      return e;
    }
    /* the period ledgers (day / month / year / life) are projections of the same entries */
    _project(lines, meta) {
      const flow = meta.flow;
      this._L(L => {
        for (const [a, v] of lines) {
          if (a === 'CASH') { if (flow === 'OP' || flow === 'INV' || flow === 'FIN') { const cf = L.cf[flow]; if (v > 0) cf.in += v; else cf.out -= v; } }
          else if (a in EXPKEY) { const k = EXPKEY[a]; L[k] += v; L.pl[k] += v; }
          else if (a in REVKEY) { L.revenue -= v; L[REVKEY[a]] -= v; }
          else if (a === 'FIXED') L.capex += v;
          else if (a === 'LOANS') { if (v < 0) L.loansIn -= v; else L.principal += v; }
          else if (a === 'EQUITY') { if (v < 0) L.equityIn -= v; }
        }
        if (meta.inc) for (const k of Object.keys(meta.inc)) L[k] += meta.inc[k];   // incurred production costs (capitalised, so not in the profit)
      });
    }
    _L(fn) { for (const k of ['day', 'month', 'year', 'life']) fn(this.led[k]); }
    _expense(key, amt, desc, flow) { if (!(amt > 0)) return; this._post({ type: 'EXP_' + key.toUpperCase(), flow: flow || 'OP', desc: desc || '' }, [[EXPACC[key], amt], ['CASH', -amt]]); }
    _cashIn(type, amt, desc, acc, flow) { if (!(amt > 0)) return; this._post({ type, flow: flow || 'FIN', desc: desc || '' }, [['CASH', amt], [acc, -amt]]); }
    sync() {                                                                       // cash changed outside the economy (pipe works): the journal follows it
      const c = this.store.cash; if (!isFinite(c) || !isFinite(this.mirror) || c === this.mirror) { this.mirror = c; return; } const d = c - this.mirror;
      this._post({ type: 'EXTERNAL', flow: 'INV', desc: 'Pipeline works' }, d < 0 ? [['FIXED', -d], ['CASH', d]] : [['CASH', d], ['FIXED', -d]], { cashApplied: true });
    }
    injectEquity(amount, why) { this.sync(); this._post({ type: 'EQUITY_IN', flow: 'FIN', desc: why || 'Owner capital' }, [['CASH', amount], ['EQUITY', -amount]]); this._event('info', why || 'Owner capital injected'); }
    cash() { return this.store.cash; }
    balanceSheet() {
      const bs = this.journal.balanceSheet(), b = this.journal.bal, inv = this.inventoryBook(), fixedNet = b.FIXED + b.ACC_DEP;
      return { cash: b.CASH, receivables: b.AR, inventory: inv, inventoryByProduct: Object.assign(Object.fromEntries(SELL.map(p => [p, b[INVACC[p]]])), { CRUDE_BOUGHT: b.INV_CRUDE_BUY || 0, RESERVE: b.INV_RESERVE || 0 }), wip: b.INV_WIP, fixedCost: b.FIXED, accumulatedDepreciation: b.ACC_DEP, fixedNet,
        totalAssets: bs.assets, payroll: -b.PAY_PAYROLL, tax: -b.PAY_TAX, loans: -b.LOANS, totalLiabilities: bs.liabilities, paidIn: bs.paidIn, result: bs.result, totalEquity: bs.equity, gap: bs.gap };
    }
    inventoryBook() { let v = 0; for (const p of SELL) v += this.journal.bal[INVACC[p]]; return v + (this.journal.bal.INV_CRUDE_BUY || 0) + (this.journal.bal.INV_RESERVE || 0); }
    /* lifting cost of a well relative to the old flat cost: its field's cost per barrel (deeper = dearer) and the pressure the field has left; 1 for wells without field data */
    liftFactor(b) { const ts = this.store.ts; return b && b.field && ts && ts.liftFactor ? ts.liftFactor(b.field) : 1; }
    unitCost(p) { const q = this.qty[p]; return q > EPS2 ? Math.max(0, this.journal.bal[INVACC[p]]) / q : 0; }

    /* ---- assets: cost in FIXED, depreciation in ACC_DEP; a building is recorded when bought and removed when demolished ---- */
    assetRec(b) { let a = this.assets.get(b.id); if (!a) { const d = DEFS[b.d]; a = { cost: d.type === 'well' ? I.wellProfile(b.x, b.y).cost : d.cost, t: this.hours, dep: 0, useStart: b.st === 'OPERATIONAL' ? this.hours : null }; this.assets.set(b.id, a); } if (a.dep == null) a.dep = 0; if (a.useStart === undefined) a.useStart = null; return a; }
    bookValue(b) { const a = this.assetRec(b); return a.cost - a.dep; }                     // cost - the accumulated depreciation older saves hold (nothing new accrues)
    assetValue(b) { const A = this.cfg.ASSET; return this.bookValue(b) * (1 - A.conditionWeight * (1 - b.c)); }     // market / condition value (the book value is in the balance sheet)
    _dispose(rec, refund) {
      const cost = rec ? rec.cost : 0, dep = rec ? rec.dep || 0 : 0, disp = cost - dep - refund, lines = [['CASH', refund], ['ACC_DEP', dep], ['FIXED', -cost]];
      if (disp > 0) lines.push(['EXP_DISPOSAL', disp]); else if (disp < 0) lines.push(['REV_OTHER', disp]);
      this._post({ type: 'DISPOSAL', flow: 'INV', desc: 'Building demolished', inc: { assetSales: refund } }, lines, { cashApplied: true });   // the store already holds the cash
    }
    /* (no _depreciate: the useful life was removed - equipment keeps its book value; the accumulated depreciation that older saves already hold stays untouched) */
    pipeValue() { let v = 0; for (const L of this.net.lines.values()) v += L.path.length * (BC.PIPES[L.dia] || BC.PIPES[BC.PIPE_DEFAULT]).cost; return v; }
    assetsTotal() { let v = this.pipeValue(); for (const b of this.store.list()) v += this.assetValue(b); return v; }
    assetList() { return this.store.list().map(b => { const a = this.assetRec(b); return { id: b.id, name: DEFS[b.d].name, purchase: a.cost, value: this.assetValue(b), book: this.bookValue(b), depreciated: a.dep, maintenance: this.maintDay(b, this.loadOf(b)), ageDays: Math.floor((this.hours - a.t) / 24), condition: b.c, label: this.conditionLabel(b.c) }; }); }
    conditionLabel(c) { if (c >= 0.9) return 'ممتازة'; for (const [t, l] of this.cfg.MAINTENANCE.labels) if (c >= t) return l; return 'متوقف'; }

    /* ---- per building: load, power, costs ---- */
    loadOf(b) {
      const def = DEFS[b.d], s = b.s || {}, t = def.type, cap = def.capacity.value; let v = 0;
      if (t === 'well') v = s._target ? (s._out || 0) / s._target : 0; else if (t === 'pump' || t === 'valve') v = (s._in || 0) / def.params.maxFlow; else if (t === 'junction') v = (s._in || 0) / def.params.maxTotalFlow;
      else if (t === 'tank' || t === 'gas') v = ((s._in || 0) + (s._out || 0)) / (cap * 0.5); else if (t === 'separator' || t === 'refinery') v = (s._in || 0) / def.params.cap;
      return clamp(v, 0, 1);
    }
    kwOf(b, load) {
      const K = this.cfg.POWER_KW, def = DEFS[b.d], t = def.type; let base = 0;
      if (t === 'well') base = K.well; else if (t === 'pump') base = K.pump[def.size]; else if (t === 'separator') base = K.separator; else if (t === 'refinery') base = K.refinery[def.size]; else if (t === 'gas') base = K.gas;
      return base * (K.idleShare + (1 - K.idleShare) * load);
    }
    staffKey(def) { const t = def.type; if (def.family === 'MANIFOLD') return 'manifold'; return t === 'well' || t === 'valve' || t === 'junction' || t === 'separator' ? t : t + '_' + def.size; }
    opDay(b, load) { const O = this.cfg.OPERATING; return DEFS[b.d].operatingCost * (O.fixedShare + (1 - O.fixedShare) * load) * (1 + O.conditionPenalty * (1 - b.c)); }     // DailyOperatingCost = Base x Load x Condition
    maintDay(b, load) { const M = this.cfg.MAINTENANCE; return DEFS[b.d].maintenanceCost * (1 + M.damage * Math.pow(1 - b.c, 1.5)) * (M.utilBase + M.utilSlope * load); }   // MaintenanceCost = Base x Damage x Utilization
    wellQuality(b) { const q = this.cfg.QUALITY, u = hash(b.x, b.y, 11); return u < q.share.HIGH ? 'HIGH' : u > 1 - q.share.LOW ? 'LOW' : 'NORMAL'; }
    crudeLabel() { const q = this.cfg.QUALITY; return this.crudeQ >= q.highAt ? 'HIGH' : this.crudeQ <= q.lowAt ? 'LOW' : 'NORMAL'; }
    effOf(b) {                                                                      // written to b.s.ecoEff before every Sim step: power shortage, wear and crude quality
      const t = DEFS[b.d].type, P = this.cfg.POWER; if (t === 'well' && b.s && b.s.started === false) return 0;      // a new well waits for the player's "start production"
      const elec = this.pw.factor >= 1 ? 1 : P.efficiencyFloor + (1 - P.efficiencyFloor) * this.pw.factor;
      const q = t === 'refinery' ? this.cfg.QUALITY.refinery[this.crudeLabel()] : 1, cond = (t === 'refinery' || t === 'separator') ? 1 : 0.8 + 0.2 * b.c;     // refinery / separator already read b.c inside the Sim
      if (this.pwStop != null && (this.cfg.POWER_PRIORITY[t] || 9) >= this.pwStop) return 0;                    // power shortage: the least important facilities stop
      return clamp(elec * q * cond * this.staffF, 0.05, 1.05);
    }

    /* ---- inventory (read from the tanks; the cost is in the journal) ---- */
    tanksOf(p) {                                                                   // the tanks of one product, from an index rebuilt only when the building list changes
      const L = this.store.list(); if (this._tkL !== L) { this._tkL = L; this._tk = new Map(); for (const b of L) { const d = DEFS[b.d]; if (d.type === 'tank' || d.type === 'gas') { if (b.rs) { const k = 'R:' + d.product, a = this._tk.get(k); if (a) a.push(b); else this._tk.set(k, [b]); continue; } const a = this._tk.get(d.product); if (a) a.push(b); else this._tk.set(d.product, [b]); } } }
      const arr = this._tk.get(p); return arr ? arr.filter(b => b.st !== 'UNDER_CONSTRUCTION') : [];
    }   // a DAMAGED tank still holds its oil and its capacity: it is counted too (it only stops accepting)
    _hookReserve() { const ts = this.store && this.store.ts; if (ts) ts.reserveLevel = () => this.reserve.lv; }
    /* the zone itself comes from the world (one fixed place); the company only remembers how far it has been opened */
    reserveZone() { const ts = this.store.ts; return ts && ts.reserve ? ts.reserve() : null; }
    reserveArea() { const z = this.reserveZone(); return z ? z.levels[Math.max(0, Math.min(z.levels.length - 1, this.reserve.lv))] : null; }
    reserveExpandCost() { const z = this.reserveZone(), c = this.cfg.RESERVE.expand; return z && this.reserve.lv < z.levels.length - 1 ? c[Math.min(c.length - 1, this.reserve.lv)] : null; }
    reserveExpand() {
      const z = this.reserveZone(); if (!z) return { ok: false, reason: 'noZone' }; if (this.bankrupt) return { ok: false, reason: 'bankrupt' }; const cost = this.reserveExpandCost(); if (cost == null) return { ok: false, reason: 'maxLevel' };
      this.sync(); if (isFinite(this.store.cash) && this.store.cash < cost) return { ok: false, reason: 'cash', cost };
      this._post({ type: 'RESERVE_EXPAND', flow: 'INV', desc: 'Strategic Reserve · open area level ' + (this.reserve.lv + 1) }, [['FIXED', cost], ['CASH', -cost]]);      // land / site works: a fixed asset like the buildings, in the same ledger
      this.reserve.lv++; this.reserve.log.push({ t: this.hours, kind: 'EXPAND', lv: this.reserve.lv, cost }); while (this.reserve.log.length > 200) this.reserve.log.shift(); return { ok: true, cost, level: this.reserve.lv, area: this.reserveArea() };
    }
    /* ================= Strategic Reserve: stock, books, movements =================
     * Every reserve tank keeps its own small ledger in its state: s.cO = book cost of its produced / own oil, s.cB = book cost of its bought oil, s.q = crude quality.
     * The journal account INV_RESERVE is always the sum of the tanks (audit() checks it). Oil crosses between the commercial stores and the reserve ONLY through pipes (physical),
     * and each crossing is booked ONCE as an internal transfer at the average cost: no sale, no purchase, no profit, no loss. Buying into the reserve and selling out of it are the only trades. */
    _rt(b) { return this.sim.ensure(b); }
    reserveStock(p, tankId) { let v = 0; for (const b of this.reserveTanksOf(p)) { if (tankId && b.id !== tankId) continue; const s = this._rt(b); v += p === 'CRUDE' ? Math.max(0, s.vol - (s.wat || 0)) : s.vol; } return v; }
    reserveBook() { let v = 0; for (const b of this.reserveTanks()) { const s = this._rt(b); v += (s.cO || 0) + (s.cB || 0); } return v; }
    reserveAvgCost(p) { const q = this.reserveStock(p); if (!(q > EPS2)) return 0; let c = 0; for (const b of this.reserveTanksOf(p)) { const s = this._rt(b); c += (s.cO || 0) + (s.cB || 0); } return c / q; }
    _rlog(kind, o, merge) {
      const L = this.reserve.log, last = L[L.length - 1];
      if (merge && last && last.kind === kind && last.tank === o.tank && this.hours - last.t < 24 && last.product === o.product) { last.qty += o.qty || 0; last.value = (last.value || 0) + (o.value || 0); last.t = this.hours; last.unit = last.qty > 0 ? last.value / last.qty : 0; return last; }
      const r = Object.assign({ id: (this.reserve.nid = (this.reserve.nid || 0) + 1), t: this.hours, kind }, o); L.push(r); while (L.length > 300) L.shift(); return r;
    }
    reserveLog(n) { return this.reserve.log.slice(-(n || 40)).reverse(); }
    /* take books out of the commercial stock at its average cost, without cost-of-goods-sold: a transfer */
    _bookOut(p, qty, bought) {
      if (!(qty > 0)) return { cost: 0, use: 0 };
      if (bought) { const bal = Math.max(0, this.journal.bal.INV_CRUDE_BUY || 0), use = Math.min(qty, this.bq), unit = this.unitCostBuy(); let cost = Math.min(bal, use * unit); this.bq = Math.max(0, this.bq - use); if (this.bq <= EPS2) { this.bq = 0; cost = bal; } return { cost, use }; }
      const acc = INVACC[p], bal = Math.max(0, this.journal.bal[acc]), use = Math.min(qty, this.qty[p]), unit = this.unitCost(p); let cost = Math.min(bal, use * unit); this.qty[p] = Math.max(0, this.qty[p] - use); if (this.qty[p] <= EPS2) { this.qty[p] = 0; cost = bal; } return { cost, use };
    }
    _reserveSettle(phase, crudeOnly) {
      for (const b of this.reserveTanks()) { const def = DEFS[b.d], s = this._rt(b), crude = def.product === 'CRUDE'; if (phase === 'OUT' && (s.rel || 0) > s.vol) s.rel = s.vol;      // an order never outlives the oil it was for
        if (phase === 'IN' && crudeOnly !== crude) continue;
        if (phase === 'OUT') this._reserveOut(b, s, def, crude); else this._reserveIn(b, s, def, crude); }
      if (phase === 'IN' && crudeOnly) this._reserveReconcile();
    }
    _reserveIn(b, s, def, crude) {                       // oil that arrived through a pipe: commercial books -> reserve books (one internal transfer)
      const p = def.product, arr = s.arr || 0, w = s.arrW || 0, bvIn = s.arrBv || 0; s.arr = 0; s.arrBv = 0; s.arrW = 0; if (arr < 1e-9) return;
      const net = Math.max(0, arr - w); if (net < 1e-9) return; let bIn, oIn, cO = 0, cB = 0, short = 0;
      if (crude) { bIn = Math.min(net, bvIn); oIn = net - bIn; const r1 = this._bookOut('CRUDE', oIn, false), r2 = this._bookOut('CRUDE', bIn, true); cO = r1.cost; cB = r2.cost; short = (oIn - r1.use) + (bIn - r2.use); }
      else { const qb = this.qty[p]; bIn = qb > EPS2 ? Math.min(net, net * Math.min(1, (this.bprod[p] || 0) / qb)) : 0; oIn = net - bIn; const r = this._bookOut(p, net, false); short = net - r.use; cO = net > 0 ? r.cost * oIn / net : 0; cB = r.cost - cO; this.bprod[p] = Math.max(0, (this.bprod[p] || 0) - bIn); s.bv = (s.bv || 0) + bIn; }
      if (short > 1e-6) this.reserve.short = (this.reserve.short || 0) + short;           // oil that reached the reserve with no book stock behind it (counted, never hidden): it enters at zero cost
      const tot = cO + cB, lines = [['INV_RESERVE', tot]]; if (crude) { if (cO > 0) lines.push(['INV_CRUDE', -cO]); if (cB > 0) lines.push(['INV_CRUDE_BUY', -cB]); } else if (tot > 0) lines.push([INVACC[p], -tot]);
      if (tot > 0) this._post({ type: 'RESERVE_IN', desc: 'Strategic Reserve · received by pipe · tank ' + b.id }, lines);
      if (crude) { const old = Math.max(0, s.vol - (s.wat || 0) - net), q0 = s.q == null ? 1 : s.q; s.q = (q0 * old + this.crudeQ * net) / (old + net); }
      s.cO = (s.cO || 0) + cO; s.cB = (s.cB || 0) + cB;
      if (crude) this.market.coHold(net, oIn);
      this._rlog('IN', { tank: b.id, product: p, qty: net, value: tot, unit: net > 0 ? tot / net : 0, note: 'نقل داخلي بالأنابيب إلى الاحتياطي (ليس شراءً)' }, true);
    }
    _reserveOut(b, s, def, crude) {                      // oil that left through the pipe the player opened: reserve books -> commercial books (one internal transfer)
      const p = def.product, dep = s.dep || 0, depW = s.depW || 0, depBv = s.depBv || 0; s.dep = 0; s.depBv = 0; s.depW = 0; if (dep < 1e-9) return;
      const net = crude ? Math.max(0, dep - depW) : dep; if (net < 1e-9) return; const bOut = Math.min(net, depBv), oOut = net - bOut;
      const ownAfter = Math.max(0, s.vol - (s.wat || 0) - (s.bv || 0)), bAfter = s.bv || 0;
      let cO = ownAfter + oOut > 1e-9 ? (s.cO || 0) * oOut / (ownAfter + oOut) : 0, cB = bAfter + bOut > 1e-9 ? (s.cB || 0) * bOut / (bAfter + bOut) : 0; if (ownAfter < 1e-6) cO = s.cO || 0; if (bAfter < 1e-6) cB = s.cB || 0;
      s.cO = Math.max(0, (s.cO || 0) - cO); s.cB = Math.max(0, (s.cB || 0) - cB); const tot = cO + cB, lines = [['INV_RESERVE', -tot]];
      if (crude) { if (cO > 0) lines.push(['INV_CRUDE', cO]); if (cB > 0) lines.push(['INV_CRUDE_BUY', cB]); this.qty.CRUDE += oOut; this.bq += bOut; } else { if (tot > 0) lines.push([INVACC[p], tot]); this.qty[p] += net; this.bprod[p] = (this.bprod[p] || 0) + bOut; }
      if (tot > 0) this._post({ type: 'RESERVE_OUT', desc: 'Strategic Reserve · released by pipe · tank ' + b.id }, lines);
      if (crude) this.market.coRelease(net, oOut);
      this._rlog('OUT', { tank: b.id, product: p, qty: net, value: tot, unit: net > 0 ? tot / net : 0, note: 'سحب بأمرك عبر الأنابيب إلى المخزون التجاري / المصفاة (تحويل داخلي)' }, true);
    }
    _reserveReconcile() {                                // the reserve account is exactly the sum of its tanks; anything else is a lost tank (cannot happen: a full tank cannot be demolished)
      const bal = this.journal.bal.INV_RESERVE || 0, sum = this.reserveBook(), d = bal - sum; if (d > 0.01) this._post({ type: 'RESERVE_LOSS', flow: 'OP', desc: 'Strategic Reserve stock no longer in a tank (written off)' }, [['EXP_LOSS', d], ['INV_RESERVE', -d]]);
    }
    reserveBuyQuote(item, qty, supplierId) {
      const qt = this.buyQuote(item, qty, supplierId); if (!qt.ok) return qt; if (!SELL.includes(item)) return { ok: false, reason: 'item' };
      const room = this.reserveRoom(item), have = this.reserveStock(item), bookNow = (() => { let c = 0; for (const b of this.reserveTanksOf(item)) { const s = this._rt(b); c += (s.cO || 0) + (s.cB || 0); } return c; })();
      qt.room = room; qt.avgBefore = have > EPS2 ? bookNow / have : 0; qt.avgAfter = have + qt.qty > EPS2 ? (bookNow + qt.total) / (have + qt.qty) : 0; qt.holding = have; return qt;
    }
    reserveRoom(p, tankId) { let v = 0; for (const b of this.reserveTanksOf(p)) { if (b.st !== 'OPERATIONAL' || (tankId && b.id !== tankId)) continue; v += Math.max(0, DEFS[b.d].capacity.value - this._rt(b).vol); } return v; }
    /* buy oil / products straight into the reserve (supplier price + freight + fee are the cost of the barrels in the reserve) */
    reserveBuy(item, qty, supplierId, terms, tankId) {
      if (this.bankrupt) return { ok: false, reason: 'bankrupt' }; this.sync();
      const qt = this.reserveBuyQuote(item, qty, supplierId); if (!qt.ok) return qt; if (!(qt.qty > 0)) return { ok: false, reason: 'nothingToBuy', quote: qt };
      const credit = terms === 'CREDIT'; if (credit && !(qt.creditDays > 0)) return { ok: false, reason: 'noCredit', quote: qt }; if (!credit && this.store.cash < qt.total) return { ok: false, reason: 'cash', quote: qt };
      const tanks = this.reserveTanksOf(item).filter(b => b.st === 'OPERATIONAL' && (!tankId || b.id === tankId)); if (!tanks.length) return { ok: false, reason: 'noReserveTank', quote: qt };
      if (qt.qty > qt.room + 1e-6 && !tankId) return { ok: false, reason: 'noRoom', room: qt.room, quote: qt }; if (tankId && qt.qty > this.reserveRoom(item, tankId) + 1e-6) return { ok: false, reason: 'noRoom', room: this.reserveRoom(item, tankId), quote: qt };
      const name = this.cfg.LABEL[item], pur = { id: this.nextPur++, item, supplier: qt.supplierName, qty: qt.qty, unitPrice: qt.landedUnit, total: qt.total, terms: credit ? 'CREDIT' : 'CASH', receivedAt: this.hours, dueAt: credit ? this.hours + qt.creditDays * 24 : this.hours, paidAt: credit ? null : this.hours, reserve: true };
      this.purchases.push(pur); if (this.purchases.length > 200) this.purchases.shift();
      if (credit) { this._post({ type: 'PURCHASE_CREDIT', desc: 'Purchase on credit into the Strategic Reserve · ' + name + ' · ' + qt.supplierName }, [['INV_RESERVE', qt.total], ['PAY_SUPPLIERS', -qt.total]]); this.payables.push({ id: this.nextPay++, amount: qt.total, due: pur.dueAt, item, supplier: qt.supplierName, pid: pur.id }); }
      else this._post({ type: 'PURCHASE_CASH', flow: 'OP', desc: 'Purchase into the Strategic Reserve · ' + name + ' · ' + qt.supplierName }, [['INV_RESERVE', qt.total], ['CASH', -qt.total]]);
      let left = qt.qty; const parts = []; for (const b of tanks.sort((x, y) => this._rt(x).vol - this._rt(y).vol)) { if (left <= 1e-9) break; const s = this._rt(b), room = DEFS[b.d].capacity.value - s.vol; if (room <= 0) continue; const put = Math.min(room, left), share = qt.total * put / qt.qty;
        if (item === 'CRUDE') { const old = Math.max(0, s.vol - (s.wat || 0)), q0 = s.q == null ? 1 : s.q; s.q = (q0 * old + 1 * put) / (old + put); }
        s.vol += put; s.bv = (s.bv || 0) + put; s.total = (s.total || 0) + put; s.cB = (s.cB || 0) + share; left -= put; parts.push({ tank: b.id, qty: put }); }
      this.market.engineBuy(item, null, qt.qty); if (item === 'CRUDE') this.market.coHold(qt.qty, 0);                                       // the oil leaves the market's commercial stock, exactly as for a commercial purchase
      this._rlog('BUY', { tank: parts.length === 1 ? parts[0].id : 0, tanks: parts, product: item, qty: qt.qty, value: qt.total, unit: qt.landedUnit, supplier: qt.supplierName, terms: credit ? 'CREDIT' : 'CASH', note: 'شراء مباشر إلى الاحتياطي' });
      this._event('info', 'Reserve purchase: ' + name + ' ' + Math.round(qt.qty).toLocaleString('en-US') + ' · ' + fmtMoney(qt.total));
      return { ok: true, item, qty: qt.qty, cost: qt.total, unitCost: qt.landedUnit, terms: credit ? 'CREDIT' : 'CASH', supplier: qt.supplierName, tanks: parts, avgCost: this.reserveAvgCost(item) };
    }
    /* take `net` barrels out of ONE reserve tank (the mixture leaves in proportion: oil produced, oil bought, water) */
    _drawReserve(b, net) {
      const s = this._rt(b), def = DEFS[b.d], crude = def.product === 'CRUDE', wat = crude ? Math.min(s.vol, s.wat || 0) : 0, bv = Math.min(s.vol - wat, s.bv || 0), ownVol = Math.max(0, s.vol - wat - bv), avail = crude ? s.vol - wat : s.vol;
      const take = Math.min(net, avail); if (!(take > 0) || s.vol <= 0) return { net: 0, own: 0, bought: 0, costO: 0, costB: 0, q: s.q == null ? 1 : s.q };
      const wf = crude ? wat / s.vol : 0, bf = bv / s.vol, tot = take / (1 - wf), bOut = Math.min(bv, tot * bf), oOut = Math.min(ownVol, take - bOut), q = s.q == null ? 1 : s.q;
      const afterVol = Math.max(0, s.vol - tot), cO = ownVol > 1e-9 ? (s.cO || 0) * oOut / ownVol : 0, cB = bv > 1e-9 ? (s.cB || 0) * bOut / bv : 0;
      s.vol = afterVol; s.wat = Math.max(0, (s.wat || 0) - tot * wf); s.bv = Math.max(0, bv - bOut);
      if (s.vol < 1e-6) { s.vol = 0; s.wat = 0; s.bv = 0; const rest = (s.cO || 0) + (s.cB || 0); const r = { net: take, own: oOut, bought: bOut, costO: (s.cO || 0), costB: (s.cB || 0), q }; s.cO = 0; s.cB = 0; return r; }
      s.cO = Math.max(0, (s.cO || 0) - cO); s.cB = Math.max(0, (s.cB || 0) - cB); return { net: take, own: oOut, bought: bOut, costO: cO, costB: cB, q };
    }
    reserveSellQuote(p, qty, tankId) {
      if (!SELL.includes(p)) return { ok: false, reason: 'product' }; const avail = this.reserveStock(p, tankId), q = clamp(+qty || 0, 0, avail), mp = this.market.price[p];
      let qSum = 0, qW = 0; if (p === 'CRUDE') for (const b of this.reserveTanksOf(p)) { if (tankId && b.id !== tankId) continue; const s = this._rt(b), n = Math.max(0, s.vol - (s.wat || 0)); qSum += n; qW += n * (s.q == null ? 1 : s.q); }
      const qm = p === 'CRUDE' && qSum > 0 ? qW / qSum : 1, unit = mp * qm, gross = q * unit, fee = gross * this.cfg.FEES.spot, avg = this.reserveAvgCost(p);
      return { ok: true, product: p, available: avail, qty: q, marketPrice: mp, quality: qm, unitPrice: unit, gross, fee, net: gross - fee, avgCost: avg, estCost: q * avg, estProfit: gross - fee - q * avg };
    }
    /* sell a quantity YOU decide, by hand, out of the reserve (never automatic). Revenue, fee and cost of goods sold go through the same accounts as any spot sale. */
    reserveSell(p, qty, tankId) {
      if (this.bankrupt) return { ok: false, reason: 'bankrupt' }; if (!SELL.includes(p)) return { ok: false, reason: 'product' }; this.sync();
      const qt = this.reserveSellQuote(p, qty, tankId); if (!(qty > 0) || qt.qty <= 1e-6) return { ok: false, reason: 'nothingToSell' }; if (qty > qt.available + 1e-6) return { ok: false, reason: 'notEnough', quote: qt };
      let left = qt.qty, got = 0, own = 0, bought = 0, cO = 0, cB = 0, qw = 0; const parts = [];
      for (const b of this.reserveTanksOf(p).filter(x => !tankId || x.id === tankId).sort((x, y) => this._rt(y).vol - this._rt(x).vol)) { if (left <= 1e-9) break; const r = this._drawReserve(b, left); if (r.net <= 0) continue; got += r.net; left -= r.net; own += r.own; bought += r.bought; cO += r.costO; cB += r.costB; qw += r.q * r.net; parts.push({ tank: b.id, qty: r.net }); }
      const unit = p === 'CRUDE' && got > 0 ? this.market.price[p] * qw / got : this.market.price[p], gross = got * unit, fee = gross * this.cfg.FEES.spot, cost = cO + cB;
      this._post({ type: 'SALE_SPOT', flow: 'OP', desc: 'Strategic Reserve sale · ' + p, src: 'RESERVE' }, [['CASH', gross], ['REV_SPOT', -gross]]); this._expense('fees', fee, 'Spot sale fee (reserve)');
      if (cost > 0) this._post({ type: 'COGS', desc: 'Cost of reserve oil sold · ' + p }, [['COGS', cost], ['INV_RESERVE', -cost]]);
      this.market.sold(p, got); this._L(L => { L.sold[p] += got; L.soldRev += gross; }); this.market.engineSellReserve(p, p === 'CRUDE' ? { own, bought } : null, got);
      this._rlog('SELL', { tank: parts.length === 1 ? parts[0].tank : 0, tanks: parts, product: p, qty: got, value: gross, revenue: gross, fee, cost, profit: gross - fee - cost, unit, note: 'بيع يدوي من الاحتياطي' });
      return { ok: true, product: p, qty: got, gross, fee, net: gross - fee, price: unit, cost, profit: gross - fee - cost, own, bought };
    }
    /* open the outlet of ONE reserve tank for exactly `qty` barrels: it flows through the pipe that is really connected, no faster than the pipe and the destination allow, then closes again by itself */
    reserveRelease(tankId, qty) {
      const b = this.store.get(tankId); if (!b || !b.rs) return { ok: false, reason: 'tank' }; if (b.st !== 'OPERATIONAL') return { ok: false, reason: 'notReady' }; const def = DEFS[b.d], s = this._rt(b);
      if (!def.connections.some(c => c.role === 'out' && this.sim.edgeOf(b, c.id))) return { ok: false, reason: 'noPipe' };
      const crude = def.product === 'CRUDE', wat = crude ? Math.min(s.vol, s.wat || 0) : 0, avail = s.vol - wat; if (!(+qty > 0) || avail <= 1e-9) return { ok: false, reason: 'nothingToMove', have: avail };
      if (+qty > avail + 1e-6) return { ok: false, reason: 'notEnough', have: avail }; const wf = s.vol > 0 ? wat / s.vol : 0, vol = Math.min(s.vol, +qty / (1 - wf));
      s.rel = Math.min(s.vol, (s.rel || 0) + vol); this._rlog('ORDER', { tank: b.id, product: def.product, qty: +qty, value: 0, note: 'أمر سحب يدوي: فُتح مخرج الخزان لهذه الكمية فقط' }); return { ok: true, qty: +qty, remaining: s.rel };
    }
    reserveStop(tankId) { const b = this.store.get(tankId); if (!b || !b.rs) return { ok: false, reason: 'tank' }; const s = this._rt(b), left = s.rel || 0; s.rel = 0; this._rlog('STOP', { tank: b.id, product: DEFS[b.d].product, qty: left, value: 0, note: 'أُغلق مخرج الخزان' }); return { ok: true, closed: left }; }
    /* what the reserve is worth at today's market prices (not booked: the books keep cost until a real sale) */
    reserveMarketValue() { let v = 0; for (const p of SELL) { const q = this.reserveStock(p); if (q > 0) v += q * (this.market.price[p] || 0); } return v; }
    /* the company on the world market: shares of production and supply, averages (day = last day, month = last 30 days), what it withheld, and the answer of the other producers */
    marketFootprint(n) { const f = this.market.footprint(n || 30); if (!f) return null; const d = this.market.footprint(1); f.dayShare = d ? { prod: d.shareProd, supply: d.shareSupply } : null; f.reserveOil = this.reserveStock('CRUDE'); return f; }
    reserveCostDay() {                                    // what the reserve costs per day, on its own lines (never inside the commercial lines)
      let storage = 0, ops = 0; const C = this.cfg; for (const b of this.reserveTanks()) { const def = DEFS[b.d], s = this._rt(b); storage += s.vol * C.STORAGE_COST[def.product]; if (b.st === 'OPERATIONAL') { const load = this.loadOf(b); ops += this.opDay(b, load) + this.maintDay(b, load) + this.kwOf(b, load) * 24 * C.ENERGY.pricePerKWh; } }
      return { storage, ops, total: storage + ops };
    }
    reserveInfo() {
      const z = this.reserveZone(), f = this.fills(), A = this.reserveArea(); if (!z) return { exists: false, fills: f };
      const tanks = this.reserveTanks().map(b => { const d = DEFS[b.d], s = this._rt(b), crude = d.product === 'CRUDE', wat = crude ? Math.min(s.vol, s.wat || 0) : 0, bought = Math.min(s.vol - wat, s.bv || 0), net = s.vol - wat, cost = (s.cO || 0) + (s.cB || 0);
        return { id: b.id, name: d.name, product: d.product, capacity: d.capacity.value, volume: s.vol, net, water: wat, bought, own: Math.max(0, net - bought), fill: s.vol / d.capacity.value, status: this.sim.status(b), operational: b.st === 'OPERATIONAL', x: b.x, y: b.y,
          cost, avgCost: net > EPS2 ? cost / net : 0, quality: s.q == null ? 1 : s.q, release: s.rel || 0, inRate: s._in || 0, outRate: s._out || 0, hasOutlet: d.connections.some(c => c.role === 'out' && this.sim.edgeOf(b, c.id)), room: Math.max(0, d.capacity.value - s.vol) }; });
      const byProduct = SELL.map(p => ({ product: p, stock: this.reserveStock(p), capacity: this.reserveCapacity(p), avgCost: this.reserveAvgCost(p), tanks: this.reserveTanksOf(p).length })).filter(r => r.tanks > 0);
      const full = z.levels[z.levels.length - 1];
      return { exists: true, zone: { id: z.id, name: z.name, x: z.x, y: z.y, w: z.w, h: z.h }, level: this.reserve.lv, maxLevel: z.levels.length - 1, area: A, areaTiles: A.w * A.h, maxAreaTiles: full.w * full.h, expandCost: this.reserveExpandCost(), tanks, byProduct, book: this.reserveBook(), marketValue: this.reserveMarketValue(), unrealized: this.reserveMarketValue() - this.reserveBook(), cost: this.reserveCostDay(), short: this.reserve.short || 0, fills: f };
    }
    /* ---- the Strategic Reserve: its own tanks (b.rs = 1, built inside the fixed zone), never counted with the commercial ones.
     * tanksOf() is the COMMERCIAL index only, so selling, auto-selling, buying, capacity and the commercial fill % can never see a reserve tank. */
    reserveTanksOf(p) { this.tanksOf(p); const a = this._tk.get('R:' + p); return a ? a.filter(b => b.st !== 'UNDER_CONSTRUCTION') : []; }
    reserveTanks() { const o = []; for (const p of SELL) for (const b of this.reserveTanksOf(p)) o.push(b); return o; }
    reserveCapacity(p) { let v = 0; for (const b of p ? this.reserveTanksOf(p) : this.reserveTanks()) v += DEFS[b.d].capacity.value; return v; }
    reserveVolume(p) { let v = 0; for (const b of p ? this.reserveTanksOf(p) : this.reserveTanks()) v += this.sim.ensure(b).vol; return v; }
    commercialCapacity() { let v = 0; for (const p of SELL) v += this.capacity(p); return v; }
    commercialVolume() { let v = 0; for (const p of SELL) v += this.physicalVol(p); return v; }
    fillOf(vol, cap) { return cap > 0 ? vol / cap : 0; }
    /* two separate gauges, never added together */
    fills() { const cc = this.commercialCapacity(), cv = this.commercialVolume(), rc = this.reserveCapacity(), rv = this.reserveVolume(), cw = this.crudeWater(); let rw = 0; for (const b of this.reserveTanksOf('CRUDE')) { const t = this.sim.ensure(b); rw += Math.min(t.vol, t.wat || 0); }
      return { commercial: { volume: cv, capacity: cc, fill: this.fillOf(cv, cc), tanks: SELL.reduce((n, p) => n + this.tanksOf(p).length, 0), water: cw, oil: cv - cw }, reserve: { volume: rv, capacity: rc, fill: this.fillOf(rv, rc), tanks: this.reserveTanks().length, water: rw, oil: rv - rw } }; }          // the gauge is the physical space used (water takes room); .oil is the net oil stock
    physicalVol(p) { let v = 0; for (const b of this.tanksOf(p)) v += this.sim.ensure(b).vol; return v; }                                                                           // everything in the tanks, water included
    available(p) { let v = 0; for (const b of this.tanksOf(p)) { const s = this.sim.ensure(b); v += p === 'CRUDE' ? Math.max(0, s.vol - (s.wat || 0)) : s.vol; } return v; }
    capacity(p) { let v = 0; for (const b of this.tanksOf(p)) v += DEFS[b.d].capacity.value; return v; }
    crudeOnHand() { let v = 0; for (const b of this.tanksOf('CRUDE')) { const t = this.sim.ensure(b); v += Math.max(0, t.vol - Math.min(t.vol, t.wat || 0)); } return v; }          // NET oil only: the water that rides along in a tank is never oil stock
    crudeWater() { let v = 0; for (const b of this.tanksOf('CRUDE')) { const t = this.sim.ensure(b); v += Math.min(t.vol, t.wat || 0); } return v; }
    /* ---- oil trading and storage (Phase 7). Produced crude and bought crude are two separate stocks with separate books:
     *   INV_CRUDE / qty.CRUDE          crude the company's own wells produced (it enters the books at the wellhead)
     *   INV_CRUDE_BUY / this.bq        crude bought on the market (it enters the books when it is paid for)
     * Each crude tank remembers how much of its oil was bought (s.bv). The rest is produced. A barrel is therefore in exactly one stock. */
    _tr() { return this.cfg.TRADE || { TRANSFER_COST: 0.6, LOG_MAX: 300 }; }
    tankKindOf(b) { return this.sim.tankKind(b); }
    boughtInTanks() { let v = 0; for (const b of this.tanksOf('CRUDE')) v += this.sim.ensure(b).bv || 0; return v; }
    tradeTanks() { return this.tanksOf('CRUDE').filter(b => b.st === 'OPERATIONAL' && this.tankKindOf(b) !== 'PRODUCTION'); }      // where bought oil may be kept: never a tank fed by wells
    tradeRoom() { let v = 0; for (const b of this.tradeTanks()) v += Math.max(0, DEFS[b.d].capacity.value - this.sim.ensure(b).vol); return v; }
    addBought(qty) {                                                                // bought oil goes into non-production tanks only, the emptiest first; returns what fitted and where
      let left = qty; const parts = [], tanks = this.tradeTanks().map(b => ({ b, s: this.sim.ensure(b) })).sort((x, y) => x.s.vol - y.s.vol);
      for (const { b, s } of tanks) { if (left <= 1e-9) break; const room = DEFS[b.d].capacity.value - s.vol; if (room <= 0) continue; const put = Math.min(room, left); s.vol += put; s.bv = (s.bv || 0) + put; s.total = (s.total || 0) + put; left -= put; parts.push({ tank: b.id, qty: put }); }
      return { put: qty - left, parts };
    }
    unitCostBuy() { return this.bq > EPS2 ? Math.max(0, this.journal.bal.INV_CRUDE_BUY || 0) / this.bq : 0; }
    _trade(kind, o) { const r = Object.assign({ id: this.nextTrade++, t: this.hours, kind }, o); this.tradeLog.push(r); while (this.tradeLog.length > this._tr().LOG_MAX) this.tradeLog.shift(); return r; }
    tankReport() {
      return this.tanksOf('CRUDE').map(b => { const s = this.sim.ensure(b), cap = DEFS[b.d].capacity.value, kind = this.tankKindOf(b), bought = Math.min(s.vol, s.bv || 0), water = Math.min(s.vol - bought, s.wat || 0);
        return { id: b.id, name: DEFS[b.d].name, kind, kindAr: TKA[kind] || '', capacity: cap, volume: s.vol, free: Math.max(0, cap - s.vol), fill: cap ? s.vol / cap : 0, bought, own: Math.max(0, s.vol - bought - water), water, operational: b.st === 'OPERATIONAL',
          canBuy: kind !== 'PRODUCTION' && b.st === 'OPERATIONAL', source: bought > 1e-6 && s.vol - bought - water > 1e-6 ? 'MIXED' : bought > 1e-6 ? 'BOUGHT' : s.vol > 1e-6 ? 'PRODUCED' : 'EMPTY' }; });
    }
    /* move bought oil from one non-production tank to another (a transfer): capitalised freight, partial amounts allowed */
    transfer(fromId, toId, qty) {
      if (this.bankrupt) return { ok: false, reason: 'bankrupt' }; this.sync(); const a = this.store.get(fromId), b = this.store.get(toId), T = this._tr();
      if (!a || !b || a === b || DEFS[a.d].product !== 'CRUDE' || DEFS[b.d].product !== 'CRUDE' || DEFS[a.d].type !== 'tank' || DEFS[b.d].type !== 'tank') return { ok: false, reason: 'tank' };
      if (a.st !== 'OPERATIONAL' || b.st !== 'OPERATIONAL') return { ok: false, reason: 'notReady' }; if (this.tankKindOf(a) === 'PRODUCTION' || this.tankKindOf(b) === 'PRODUCTION') return { ok: false, reason: 'productionTank' };
      const sa = this.sim.ensure(a), sb = this.sim.ensure(b), have = Math.min(sa.vol, sa.bv || 0), room = Math.max(0, DEFS[b.d].capacity.value - sb.vol), q = Math.min(+qty || 0, have);
      if (!(+qty > 0) || have <= 1e-9) return { ok: false, reason: 'nothingToMove', have }; if (+qty > have + 1e-6) return { ok: false, reason: 'notEnough', have }; if (q > room + 1e-6) return { ok: false, reason: 'noRoom', room }; const cost = q * T.TRANSFER_COST; if (this.store.cash < cost) return { ok: false, reason: 'cash', need: cost };
      if (cost > 0) this._post({ type: 'TRANSFER_COST', flow: 'OP', desc: 'Freight between tanks (added to the cost of the bought oil)' }, [['INV_CRUDE_BUY', cost], ['CASH', -cost]]);
      sa.vol = Math.max(0, sa.vol - q); sa.bv = Math.max(0, (sa.bv || 0) - q); sb.vol += q; sb.bv = (sb.bv || 0) + q; sb.total = (sb.total || 0) + q;
      this._trade('TRANSFER', { qty: q, cost, from: fromId, to: toId, note: 'نقل نفط مشترى بين خزانين' }); this._event('info', 'Oil moved: ' + Math.round(q).toLocaleString('en-US') + ' bbl'); return { ok: true, qty: q, cost, unitCost: this.unitCostBuy() };
    }
    unitPrice(p) { return this.market.price[p] * (p === 'CRUDE' ? this.crudeQ : 1); }
    inventory() {
      const rows = SELL.map(p => { const vol = this.available(p), cap = this.capacity(p), phys = this.physicalVol(p), price = this.unitPrice(p), book = this.journal.bal[INVACC[p]];
        return { product: p, label: this.cfg.LABEL[p], unit: this.cfg.UNIT[p], volume: vol, water: phys - vol, capacity: cap, fill: cap ? phys / cap : 0, marketPrice: this.market.price[p], unitPrice: price, value: vol * price,
          book, bookQty: this.qty[p], unitCost: this.unitCost(p), storageCostDay: vol * this.cfg.STORAGE_COST[p], mode: this.modes[p], change24: this.market.change24(p), trend: this.market.trend(p), potential: vol * price * (1 - this.cfg.FEES.spot) }; });
      const cr = rows.find(r => r.product === 'CRUDE'); if (cr) { const bought = this.crudeAvailable('BOUGHT'), own = this.crudeAvailable('OWN'); Object.assign(cr, { ownVolume: own, boughtVolume: bought, boughtQty: this.bq, boughtBook: Math.max(0, this.journal.bal.INV_CRUDE_BUY || 0), boughtUnitCost: this.unitCostBuy(), boughtUsed: this.boughtUsed, tradeRoom: this.tradeRoom() }); }
      return rows;
    }
    inventoryValue() { let v = 0; for (const p of SELL) v += this.available(p) * this.unitPrice(p); return v; }      // market value
    /* what can be sold of one kind of crude: 'OWN' (produced), 'BOUGHT', or all of it ('ALL') */
    crudeAvailable(src) { let own = 0, bought = 0; for (const b of this.tanksOf('CRUDE')) { const s = this.sim.ensure(b), bv = Math.min(s.vol, s.bv || 0); bought += bv; own += Math.max(0, s.vol - bv - (s.wat || 0)); } return src === 'OWN' ? own : src === 'BOUGHT' ? bought : own + bought; }
    /* takes `qty` barrels out of the tanks. For crude `src` says which stock: 'OWN' takes only the produced share of each tank, 'BOUGHT' only the bought share, 'ALL' the mixture as it lies in the fullest tank first.
       Returns the barrels taken; this._lastTake says how many came from each stock (so each is costed from its own books). */
    removeFrom(p, qty, src) {
      let left = qty; const tanks = this.tanksOf(p).sort((x, y) => this.sim.ensure(y).vol - this.sim.ensure(x).vol); this._lastTake = { own: 0, bought: 0 };
      for (const b of tanks) { if (left <= 1e-9) break; const s = this.sim.ensure(b);
        if (p === 'CRUDE') {
          const bv = Math.min(s.vol, s.bv || 0), wat = Math.min(s.vol - bv, s.wat || 0), ownVol = Math.max(0, s.vol - bv - wat);
          if (src === 'BOUGHT') { const take = Math.min(left, bv); if (take <= 0) continue; s.vol = Math.max(0, s.vol - take); s.bv = Math.max(0, bv - take); this._lastTake.bought += take; left -= take; continue; }
          if (src === 'OWN') { const wf = s.vol - bv > 0 ? Math.min(0.95, wat / (s.vol - bv)) : 0, net = ownVol, take = Math.min(left, net); if (take <= 0) continue; const tot = take / (1 - wf); s.vol = Math.max(0, s.vol - tot); s.wat = Math.max(0, (s.wat || 0) - tot * wf); this._lastTake.own += take; left -= take; continue; }
          const wf = s.vol > 0 ? Math.min(0.95, (s.wat || 0) / s.vol) : 0, net = s.vol * (1 - wf), take = Math.min(left, net); if (take <= 0) continue; const tot = take / (1 - wf), bf = s.vol > 0 ? bv / s.vol : 0, bTake = tot * bf;     // the mixture leaves in proportion: water is not paid for, the bought share is clean
          s.vol = Math.max(0, s.vol - tot); s.wat = Math.max(0, (s.wat || 0) - tot * wf); s.bv = Math.max(0, bv - bTake); this._lastTake.bought += bTake; this._lastTake.own += take - bTake; left -= take; continue;
        }
        const wf = 0, net = s.vol, take = Math.min(left, net); if (take <= 0) continue; s.vol = Math.max(0, s.vol - take); left -= take; }
      return qty - left;
    }
    /* the cost of the barrels that leave the stock: cost of goods sold (matching the revenue of the same barrels) */
    _cogs(p, qty) {
      const acc = INVACC[p]; if (!(qty > 0)) return 0; const unit = this.unitCost(p), cost = Math.min(Math.max(0, this.journal.bal[acc]), qty * unit);
      this.qty[p] = Math.max(0, this.qty[p] - qty); if (cost > 0) this._post({ type: 'COGS', desc: 'Cost of ' + p + ' sold' }, [['COGS', cost], [acc, -cost]]); this._clearPool(p); return cost;
    }
    _cogsBuy(qty) {                                                                  // the bought stock's own cost of goods sold, at its own average cost
      if (!(qty > 0)) return 0; const unit = this.unitCostBuy(), cost = Math.min(Math.max(0, this.journal.bal.INV_CRUDE_BUY || 0), qty * unit); this.bq = Math.max(0, this.bq - qty);
      if (cost > 0) this._post({ type: 'COGS', desc: 'Cost of bought crude sold' }, [['COGS', cost], ['INV_CRUDE_BUY', -cost]]); this._clearBuy(); return cost;
    }
    _clearBuy() { const left = this.journal.bal.INV_CRUDE_BUY || 0; if (this.bq <= EPS2 && left > 0.01) this._post({ type: 'COGS', desc: 'Bought crude empty: remaining cost written off' }, [['COGS', left], ['INV_CRUDE_BUY', -left]]); }
    _cogsOf(p, got) { if (p !== 'CRUDE') return this._cogs(p, got); const t = this._lastTake || { own: got, bought: 0 }; return this._cogs('CRUDE', t.own) + this._cogsBuy(t.bought); }
    _clearPool(p) { const acc = INVACC[p], left = this.journal.bal[acc]; if (this.qty[p] <= EPS2 && left > 0.01) this._post({ type: 'COGS', desc: 'Stock ' + p + ' empty: remaining cost written off' }, [['COGS', left], [acc, -left]]); }

    /* ---- financial ratios (Phase 13). Averages use the balance at the start and at the end of the period. null = not available (zero denominator) ---- */
    _snap() {
      const bs = this.balanceSheet(), suppliers = -this.journal.bal.PAY_SUPPLIERS, loansDue = this.loans.reduce((a, l) => a + Math.min(l.remaining, l.payment * this.cfg.TIME.monthsPerYear), 0);
      return { assets: bs.totalAssets, equity: bs.totalEquity, liabilities: bs.totalLiabilities, current: bs.cash + bs.receivables + bs.inventory, currentLiab: bs.payroll + bs.tax + suppliers + loansDue };
    }
    _ratios(c, start, end) {
      const div = (a, b) => b > 0 ? a / b : null, pct = v => v == null ? null : v * 100, avg = (a, b) => (a + b) / 2, L = c.L || {};
      const rev = c.revenue, net = c.netProfit, opProfit = c.grossProfit - c.opex, cost = c.variable + c.opex;               // operating profit = before interest and tax
      const barrels = (L.produced ? L.produced.CRUDE + L.produced.GASOLINE + L.produced.DIESEL + L.produced.JET_FUEL + L.produced.GAS : 0);
      const avgA = avg(start.assets, end.assets), avgE = avg(start.equity, end.equity);
      return { netMargin: pct(div(net, rev)), operatingMargin: pct(div(opProfit, rev)), roa: pct(div(net, avgA)), roe: pct(div(net, avgE)),
        currentRatio: div(end.current, end.currentLiab), debtToAssets: div(end.liabilities, end.assets), costPerBarrel: div(cost, barrels),
        inputs: { revenue: rev, netProfit: net, operatingProfit: opProfit, avgAssets: avgA, avgEquity: avgE, currentAssets: end.current, currentLiabilities: end.currentLiab, liabilities: end.liabilities, assets: end.assets, cost, barrels } };
    }
    /* ---- rescue measures (Phase 10): each one is a journal entry or a change to a loan / cost line ---- */
    inTrouble() { return this.store.cash < 0 || ['PRESSURE', 'LIQUIDITY', 'RESCUE', 'DEFAULT'].includes(this.fin.stage); }
    costCutOn() { return this.hours < this.cutUntil; }
    /* 1. sell an asset that is not needed: price = market value x sale ratio; gain or loss = price - book value */
    sellAsset(id) {
      const b = this.store.get(id); if (!b) return { ok: false, reason: 'nothing' }; if (this.bankrupt) return { ok: false, reason: 'bankrupt' }; this.sync();
      const plan = this.store.demolishPlan(id, false); if (!plan) return { ok: false, reason: 'nothing' }; if (plan.needsPipeConfirm) return { ok: false, reason: 'pipes' };
      const price = Math.max(0, this.assetValue(b) * this.cfg.RESCUE.assetSaleRatio), rec = this.assetRec(b), book = rec.cost - (rec.dep || 0);
      this._saleOverride = price; let r; try { r = this.store.demolish(id, { building: true, pipes: true }); } finally { this._saleOverride = null; }
      if (!r.ok) return { ok: false, reason: r.reason };
      return { ok: true, price, book, gainOrLoss: price - book, gain: price >= book };
    }
    /* 2. reschedule a loan: new installments over the chosen months; the balance is kept, a fee is paid */
    rescheduleLoan(id, months) {
      const l = this.loans.find(x => x.id === id); if (!l) return { ok: false, reason: 'noLoan' }; const R = this.cfg.RESCUE; if (!R.rescheduleMonths.includes(+months)) return { ok: false, reason: 'term' };
      if (l.remaining <= 0.5) return { ok: false, reason: 'nothing' }; this.sync(); const fee = l.remaining * R.rescheduleFee; if (this.store.cash < fee) return { ok: false, reason: 'cash', need: fee };
      const before = { payment: l.payment, months: l.months }; this._expense('interest', fee, 'Rescheduling fee · ' + (l.purpose || ''));
      l.months = l.paid + (+months); l.payment = Company.payment(l.remaining, l.rate, +months); l.rescheduled = (l.rescheduled || 0) + 1;
      return { ok: true, fee, before, payment: l.payment, remaining: l.remaining, months: +months };
    }
    /* 3. rescue loan: only in a financial crisis, one at a time, backed by collateral (assets + stock) */
    rescueLoan(amount) {
      const R = this.cfg.RESCUE, amt = Math.min(R.loanMax, Math.max(0, +amount || 0)); if (!this.inTrouble()) return { ok: false, reason: 'notInTrouble' }; if (this.loans.some(l => l.kind === 'RESCUE')) return { ok: false, reason: 'already' };
      if (!(amt > 0)) return { ok: false, reason: 'amount' }; const collateral = this.assetsTotal() + this.inventoryValue(); if (collateral < amt * R.collateral) return { ok: false, reason: 'collateral', collateral };
      this.sync(); const pay = Company.payment(amt, R.loanRate, R.loanTerm); this.loans.push({ id: this.nextLoan++, kind: 'RESCUE', purpose: 'Rescue loan', principal: amt, rate: R.loanRate, months: R.loanTerm, payment: pay, remaining: amt, paid: 0, taken: this.hours });
      this._cashIn('LOAN_IN', amt, 'Rescue loan', 'LOANS', 'FIN'); return { ok: true, amount: amt, payment: pay, term: R.loanTerm };
    }
    /* 4. cost cut: administration and tank operation lower for a few months */
    costCut() { if (this.costCutOn()) return { ok: false, reason: 'on' }; this.cutUntil = CAL.addMonths(this.hours, this.cfg.RESCUE.costCutMonths); return { ok: true, until: this.cutUntil, share: this.cfg.RESCUE.costCutShare }; }
    /* 5. sell stock for cash now (spot), the same sale the market makes */
    liquidate(p) { const a = this.available(p); if (!(a > 0)) return { ok: false, reason: 'nothingToSell' }; return this.sell(p, a, 'RESCUE'); }

    /* ---- purchasing (Phase 8): crude and products go into tanks, materials into stock pools; paid in cash or on credit; cost joins the stock (weighted average) ---- */
    supplierOf(id) { return this.cfg.SUPPLIERS.find(x => x.id === id) || null; }
    buyQuote(item, qty, supplierId) {
      const sup = this.supplierOf(supplierId), isProd = SELL.includes(item);
      if (!sup || !(isProd || this.cfg.MATERIALS.includes(item))) return { ok: false, reason: 'item' };
      const kind = item === 'CRUDE' ? 'crude' : isProd ? 'product' : 'material', q = Math.max(0, +qty || 0), ref = isProd ? this.market.price[item] : this.cfg.MATERIAL_PRICE[item], fm = this.market.costMult().freight;
      const unit = ref * (1 + sup.premium), gross = q * unit, freight = q * sup.freightPerUnit[kind] * fm, fee = gross * sup.feeRate, total = gross + freight + fee;   // Purchase total = qty x unit price + freight + fees
      return { ok: true, item, isProd, supplier: sup.id, supplierName: sup.name, qty: q, refPrice: ref, unitPrice: unit, gross, freight, fee, total, landedUnit: q > 0 ? total / q : unit, creditDays: sup.creditDays };
    }
    /* one row per material: quantity, unit, price, average cost (journal balance / quantity), value, warehouse room */
    materialStatus() { return this.cfg.MATERIALS.map(m => { const q = this.mats[m] || 0, bal = Math.max(0, this.journal.bal[MATACC[m]]); return { item: m, qty: q, unit: this.cfg.MATERIAL_UNIT[m], price: this.cfg.MATERIAL_PRICE[m], avgCost: q > 0 ? bal / q : 0, value: bal, capacity: this.cfg.MATERIAL_STORE[m], room: Math.max(0, this.cfg.MATERIAL_STORE[m] - q) }; }); }
    roomFor(p) { if (!SELL.includes(p)) return Math.max(0, this.cfg.MATERIAL_STORE[p] - (this.mats[p] || 0)); return Math.max(0, this.capacity(p) - this.physicalVol(p)); }
    addTo(p, qty) {                                                                  // fills the emptiest operating tanks first; returns what fitted
      let left = qty; const tanks = this.tanksOf(p).filter(b => b.st === 'OPERATIONAL').map(b => ({ b, s: this.sim.ensure(b) })).sort((x, y) => x.s.vol - y.s.vol);
      for (const { b, s } of tanks) { if (left <= 1e-9) break; const room = DEFS[b.d].capacity.value - s.vol; if (room <= 0) continue; const put = Math.min(room, left); s.vol += put; left -= put; }
      return qty - left;
    }
    /* the refinery's material limit: the share of its capacity that the chemicals and operating materials on hand allow for a step of dt days. Set BEFORE the simulator draws crude (no crude leaves the tanks without being processed) and again when materials arrive, so a purchase lifts the limit at once instead of at the next hourly tick */
    _gateMaterials(items, dt) { const S = this.sim;
      this.matLimit = 1; { const MUg = this.cfg.MATERIAL_USE, rem = { CHEM: this.mats.CHEM || 0, OPS: this.mats.OPS || 0 }; for (const b of items) { if (DEFS[b.d].type !== 'refinery' || b.st !== 'OPERATIONAL') continue; const s = S.ensure(b), cap = S.capOf(b); let lim = 1;
        if (cap > 0) { const need = { CHEM: cap * dt * MUg.CHEM.qty, OPS: cap * dt * MUg.OPS.qty }; const fr = k => (need[k] > 0 ? Math.min(1, rem[k] / need[k]) : 1); lim = Math.min(fr('CHEM'), fr('OPS')); for (const k of ['CHEM', 'OPS']) rem[k] = Math.max(0, rem[k] - lim * need[k]); }
        s.matLim = lim; this.matLimit = Math.min(this.matLimit, lim); } } }
    buy(item, qty, supplierId, terms) {
      if (this.bankrupt) return { ok: false, reason: 'bankrupt' }; this.sync();
      const qt = this.buyQuote(item, qty, supplierId); if (!qt.ok) return qt; if (!(qt.qty > 0)) return { ok: false, reason: 'nothingToBuy', quote: qt };
      const credit = terms === 'CREDIT'; if (credit && !(qt.creditDays > 0)) return { ok: false, reason: 'noCredit', quote: qt };
      if (!credit && this.store.cash < qt.total) return { ok: false, reason: 'cash', quote: qt };
      if (item === 'CRUDE' && !this.tradeTanks().length) return { ok: false, reason: 'noTradeTank', quote: qt };           // bought oil needs a commercial or trade tank: never a tank fed by wells
      const room = item === 'CRUDE' ? this.tradeRoom() : this.roomFor(item); if (qt.qty > room + 1e-6) return { ok: false, reason: 'noRoom', room, quote: qt };
      const acc = item === 'CRUDE' ? 'INV_CRUDE_BUY' : qt.isProd ? INVACC[item] : MATACC[item], name = this.cfg.LABEL[item] || this.cfg.MATERIAL_LABEL[item];
      const pur = { id: this.nextPur++, item, supplier: qt.supplierName, qty: qt.qty, unitPrice: qt.landedUnit, total: qt.total, terms: credit ? 'CREDIT' : 'CASH', receivedAt: this.hours, dueAt: credit ? this.hours + qt.creditDays * 24 : this.hours, paidAt: credit ? null : this.hours };
      this.purchases.push(pur); if (this.purchases.length > 200) this.purchases.shift();
      if (credit) {
        this._post({ type: 'PURCHASE_CREDIT', desc: 'Purchase on credit · ' + name + ' · ' + qt.supplierName }, [[acc, qt.total], ['PAY_SUPPLIERS', -qt.total]]);
        this.payables.push({ id: this.nextPay++, amount: qt.total, due: pur.dueAt, item, supplier: qt.supplierName, pid: pur.id });
      } else this._post({ type: 'PURCHASE_CASH', flow: 'OP', desc: 'Purchase · ' + name + ' · ' + qt.supplierName }, [[acc, qt.total], ['CASH', -qt.total]]);
      let got = qt.qty;
      if (item === 'CRUDE') {
        const onHand = this.crudeOnHand(), r = this.addBought(got); got = r.put; this.bq += got; this.market.engineBuy('CRUDE', null, got);      // the oil leaves the market's commercial stock
        if (got > 0) this.crudeQ = (this.crudeQ * onHand + 1 * got) / (onHand + got);                                                      // bought crude is NORMAL quality: it blends in the tanks
        this._trade('PURCHASE', { qty: got, unitPrice: qt.landedUnit, total: qt.total, supplier: qt.supplierName, terms: credit ? 'CREDIT' : 'CASH', tanks: r.parts, pid: pur.id });
      } else if (qt.isProd) {
        const add = this.addTo(item, got); got = add; this.qty[item] += got; this.bprod[item] = (this.bprod[item] || 0) + got; this.market.engineBuy(item, null, got);      // bought products are remembered: auto-sell never touches them
      } else { this.mats[item] += got; if (item === 'CHEM' || item === 'OPS') this._gateMaterials(this.store.list(), 1 / 24); }
      this._event('info', 'Purchase: ' + name + ' ' + Math.round(got).toLocaleString('en-US') + ' · ' + fmtMoney(qt.total));
      return { ok: true, item, qty: got, cost: qt.total, unitCost: got > 0 ? qt.total / qt.qty : qt.landedUnit, terms: credit ? 'CREDIT' : 'CASH', supplier: qt.supplierName };
    }
    /* materials are used from stock first, at their average cost; the shortfall is bought at the material's price in cash */
    _drawMaterial(item, qty) {
      const want = Math.max(0, qty || 0), have = Math.min(this.mats[item] || 0, want); if (!(have > 0)) return { qty: 0, cost: 0, short: want };
      const acc = MATACC[item], bal = Math.max(0, this.journal.bal[acc]), unit = bal / this.mats[item], cost = Math.min(bal, have * unit);
      this.mats[item] = Math.max(0, this.mats[item] - have); if (this.mats[item] <= EPS2) this.mats[item] = 0;
      return { qty: have, cost, short: want - have };
    }
    _clearMat(item) { const acc = MATACC[item], left = this.journal.bal[acc]; if ((this.mats[item] || 0) <= EPS2 && left > 0.01) this._post({ type: 'MAT_WRITEOFF', desc: 'Material ' + item + ' used up: remaining cost written off' }, [['EXP_OPERATING', left], [acc, -left]]); }
    _paySuppliers() {                                                                 // credit purchases fall due and are paid in cash
      if (!this.payables.length) return; const due = this.payables.filter(p => p.due <= this.hours); if (!due.length) return; this.payables = this.payables.filter(p => p.due > this.hours);
      for (const p of due) { this._post({ type: 'SUPPLIER_PAID', flow: 'OP', desc: 'Paid to ' + p.supplier }, [['PAY_SUPPLIERS', p.amount], ['CASH', -p.amount]]); const pur = this.purchases.find(x => x.id === p.pid); if (pur) pur.paidAt = this.hours; }
    }

    /* ---- selling ---- */
    quote(p, qty, src) {
      const avail = p === 'CRUDE' && src ? this.crudeAvailable(src) : this.available(p), q = clamp(+qty || 0, 0, avail), mp = this.market.price[p], qm = p === 'CRUDE' ? this.crudeQ : 1, unit = mp * qm, gross = q * unit, fee = gross * this.cfg.FEES.spot;
      return { product: p, available: avail, qty: q, marketPrice: mp, quality: qm, unitPrice: unit, gross, fee, net: gross - fee };      // GrossRevenue = Qty x Price ; NetRevenue = Gross - Fees
    }
    sell(p, qty, kind, opts) {                                                       // opts.source (crude only): 'OWN' = produced crude, 'BOUGHT' = bought crude, omitted = the mixture
      const src = p === 'CRUDE' && opts && opts.source ? opts.source : null; if (src && src !== 'OWN' && src !== 'BOUGHT') return { ok: false, reason: 'source' };
      if (this.bankrupt) return { ok: false, reason: 'bankrupt' }; if (!SELL.includes(p)) return { ok: false, reason: 'product' }; this.sync(); const qt = this.quote(p, qty, src); if (!(qty > 0) || qt.qty <= 1e-6) return { ok: false, reason: 'nothingToSell' }; if (qty > qt.available + 1e-6) return { ok: false, reason: 'notEnough', quote: qt };
      const got = this.removeFrom(p, qt.qty, p === 'CRUDE' ? (src || 'ALL') : undefined), take = this._lastTake, gross = got * qt.unitPrice, fee = gross * this.cfg.FEES.spot;
      this._post({ type: 'SALE_SPOT', flow: 'OP', desc: 'Spot sale · ' + p, src: kind || 'SPOT' }, [['CASH', gross], ['REV_SPOT', -gross]]);   // revenue exists only when the product is sold
      this._expense('fees', fee, 'Spot sale fee');
      const cost = this._cogsOf(p, got); if (p !== 'CRUDE' && this.bprod[p] > 0) this.bprod[p] = Math.max(0, this.bprod[p] - got); this.market.sold(p, got); this._L(L => { L.sold[p] += got; L.soldRev += gross; });
      this.market.engineSell(p, p === 'CRUDE' ? take : null, got);      // crude: bought oil returns to the market, own produced oil is new supply; a product goes into that product's stock (counted once)
      if (p === 'CRUDE') this._trade('SALE', { qty: got, own: take.own, bought: take.bought, revenue: gross, fee, cost, profit: gross - fee - cost, price: qt.unitPrice, source: src || 'ALL' });
      return { ok: true, product: p, qty: got, gross, fee, net: gross - fee, price: qt.unitPrice, kind: kind || 'SPOT', cost, profit: gross - fee - cost, own: take ? take.own : got, bought: take ? take.bought : 0 };
    }
    /* ---- WATER: separated water is moved, stored in water tanks and sold. It is never oil: no inventory account, no cost, no revenue until a sale. Revenue = REV_WATER at the moment of the sale only. ---- */
    waterPrice() { const m = this.market && this.market.price && this.market.price.WATER; return m > 0 ? m : BC.WATER.price; }         // one place: the market price when the market ever lists WATER (market.price.WATER), else the configured default (BC.WATER.price)
    waterTanks() { return this.tanksOf('WATER').filter(b => b.st !== 'UNDER_CONSTRUCTION'); }
    waterStock() { let v = 0; for (const b of this.waterTanks()) v += this.sim.ensure(b).vol; return v; }
    waterCapacity() { let v = 0; for (const b of this.waterTanks()) v += DEFS[b.d].capacity.value; return v; }
    /* a LOADING pump = a water pump that takes water from a water tank and has no outlet pipe: it loads the trucks. Its capacity is what can be sold per day; the water it can reach is its tank and the whole Tank Group of that tank. */
    waterLoaders() {
      const out = []; for (const b of this.store.list()) { const d = DEFS[b.d]; if (d.family !== 'WATER_PUMP' || b.st !== 'OPERATIONAL') continue; this.sim.build && this.sim.dirty() && this.sim.build();
        if (this.sim.edgeOf(b, 'OUTPUT')) continue; const e = this.sim.edgeOf(b, 'INPUT'); if (!e) continue; const far = this.sim.other(e, b, 'INPUT'); if (!far.b || DEFS[far.b.d].type !== 'tank' || DEFS[far.b.d].product !== 'WATER') continue;
        const g = this.sim.groupOf(far.b), ids = g ? g.members.slice() : [far.b.id]; out.push({ pump: b.id, cap: d.params.maxFlow, tanks: ids }); }
      return out;
    }
    waterSellable() {                                                       // what can be sold NOW: the water of the tanks the loading pumps reach, and today's remaining loading capacity
      const L = this.waterLoaders(), ids = new Set(); let cap = 0; for (const l of L) { cap += l.cap; for (const id of l.tanks) ids.add(id); }
      const tanks = [...ids].map(id => this.store.get(id)).filter(b => b && b.st !== 'UNDER_CONSTRUCTION'), stock = tanks.reduce((q, b) => q + this.sim.ensure(b).vol, 0), day = Math.floor(this.hours / 24), today = this.water.day === day ? this.water.today : 0;
      return { loaders: L.length, loadCap: cap, soldToday: today, dayLeft: Math.max(0, cap - today), tanks, stock, qty: Math.max(0, Math.min(stock, cap - today)) };
    }
    waterInfo() { const sl = this.waterSellable(), stock = this.waterStock(), cap = this.waterCapacity(); return { stock, capacity: cap, free: Math.max(0, cap - stock), fill: cap ? stock / cap : 0, tanks: this.waterTanks().length, price: this.waterPrice(), sellable: sl.qty, loaders: sl.loaders, loadCap: sl.loadCap, soldToday: sl.soldToday, dayLeft: sl.dayLeft, produced: this.water.produced, sold: this.water.sold, revenue: this.water.revenue, full: cap > 0 && stock >= cap - 1e-6 }; }
    waterQuote(qty) { const sl = this.waterSellable(), price = this.waterPrice(); qty = +qty; if (!(qty > 0)) return { ok: false, reason: 'qty' }; if (!sl.loaders) return { ok: false, reason: 'noLoader' }; if (sl.stock <= 1e-6) return { ok: false, reason: 'nothingToSell', have: 0 }; if (qty > sl.stock + 1e-6) return { ok: false, reason: 'notEnough', have: sl.stock }; if (qty > sl.dayLeft + 1e-6) return { ok: false, reason: 'loadLimit', have: sl.dayLeft }; return { ok: true, qty, price, total: qty * price }; }
    sellWater(qty) {
      if (this.bankrupt) return { ok: false, reason: 'bankrupt' }; this.sync(); const q = this.waterQuote(qty); if (!q.ok) return q; const sl = this.waterSellable(), take = q.qty, parts = [];
      for (const b of sl.tanks) { const s = this.sim.ensure(b), part = take * s.vol / sl.stock; if (part <= 0) continue; s.vol = Math.max(0, s.vol - part); parts.push({ tank: b.id, qty: part }); }   // proportional to each tank's water; each tank's stock is reduced by exactly its share, ONCE
      const got = parts.reduce((a, x) => a + x.qty, 0), gross = got * q.price, day = Math.floor(this.hours / 24); if (this.water.day !== day) { this.water.day = day; this.water.today = 0; } this.water.today += got;
      this._post({ type: 'SALE_WATER', flow: 'OP', desc: 'Water sale', src: 'SPOT' }, [['CASH', gross], ['REV_WATER', -gross]]);   // revenue exists only when the water is sold
      this.water.sold += got; this.water.revenue += gross; this.water.log.push({ t: this.hours, qty: got, price: q.price, total: gross, tanks: parts.length }); if (this.water.log.length > 80) this.water.log.shift(); this._L(L => { L.soldRev += gross; });
      return { ok: true, qty: got, price: q.price, gross, net: gross, parts };
    }
    waterLog(n) { return this.water.log.slice(-(n || 20)).reverse(); }
    /* ---- by-products: sellable; own inventory and revenue accounts; no physical tank yet (book stock only) ---- */
    byproductPrice() { if (this.market.engine) return this.market.price.BYPRODUCT; return Math.max(0, this.unitPrice('CRUDE') || 0) * this.cfg.BYPRODUCT.priceRatioToCrude; }                  // engine market: the by-products have their own market price
    byproductUnitCost() { const q = this.qty2.BYPRODUCT; return q > EPS2 ? Math.max(0, this.journal.bal.INV_BYPRODUCT) / q : 0; }
    byproducts() { return { qty: this.qty2.BYPRODUCT, unitCost: this.byproductUnitCost(), value: Math.max(0, this.journal.bal.INV_BYPRODUCT), price: this.byproductPrice(), residue: this.qty2.RESIDUE, residueValue: Math.max(0, this.journal.bal.INV_RESIDUE), fuelBurned: (this.led.life.produced.FUEL || 0), fuelCost: Math.max(0, this.journal.bal.EXP_FUEL) }; }
    sellByproduct(qty) {
      if (this.bankrupt) return { ok: false, reason: 'bankrupt' }; this.sync(); const have = this.qty2.BYPRODUCT;
      if (!(qty > 0) || have <= 1e-6) return { ok: false, reason: 'nothingToSell' }; if (qty > have + 1e-6) return { ok: false, reason: 'notEnough' };
      const got = Math.min(qty, have), price = this.byproductPrice(), gross = got * price, fee = gross * this.cfg.FEES.spot, unit = this.byproductUnitCost();
      const cost = Math.min(Math.max(0, this.journal.bal.INV_BYPRODUCT), got * unit);
      this.qty2.BYPRODUCT = Math.max(0, have - got); if (this.market.engine) this.market.engine.productSell('BYPRODUCT', got);
      this._post({ type: 'SALE_BYPRODUCT', flow: 'OP', desc: 'By-product sale', src: 'SPOT' }, [['CASH', gross], ['REV_BYPRODUCT', -gross]]);
      if (cost > 0) this._post({ type: 'COGS', desc: 'Cost of by-products sold' }, [['COGS', cost], ['INV_BYPRODUCT', -cost]]);
      if (this.qty2.BYPRODUCT <= EPS2 && this.journal.bal.INV_BYPRODUCT > 0.01) this._post({ type: 'COGS', desc: 'By-product stock empty: remaining cost written off' }, [['COGS', this.journal.bal.INV_BYPRODUCT], ['INV_BYPRODUCT', -this.journal.bal.INV_BYPRODUCT]]);
      this._expense('fees', fee, 'By-product sale fee'); this._L(L => { L.soldRev += gross; });
      return { ok: true, product: 'BYPRODUCT', qty: got, gross, fee, net: gross - fee, price, cost };
    }
    setMode(p, mode) { if (!SELL.includes(p) || !['WAIT', 'SPOT', 'CONTRACT'].includes(mode)) return false; this.modes[p] = mode; return true; }

    /* ---- contracts: revenue on delivery, paid after CONTRACTS.payDays (receivable until then) ---- */
    _genOffer() {
      const C = this.cfg.CONTRACTS, r = this.crng, p = SELL[Math.floor(r.next() * SELL.length)], qs = C.qty[p], qty = qs[Math.floor(r.next() * qs.length)], days = C.deadlineDays[0] + Math.floor(r.next() * (C.deadlineDays[1] - C.deadlineDays[0] + 1)),
        prem = C.premium[0] + r.next() * (C.premium[1] - C.premium[0]), price = r2(this.market.price[p] * (1 + prem)), value = qty * price;
      return { id: this.nextContract++, product: p, qty, price, days, value, penalty: Math.round(value * C.penaltyPct), reward: Math.round(value * C.rewardPct), expires: this.hours + C.offerValidDays * 24 };
    }
    _refreshOffers() { const C = this.cfg.CONTRACTS; this.offers = this.offers.filter(o => o.expires > this.hours); while (this.offers.length < C.offers) this.offers.push(this._genOffer()); }
    activeContracts() { return this.contracts.filter(c => c.status === 'ACTIVE'); }
    acceptContract(id) {
      if (this.bankrupt) return { ok: false, reason: 'bankrupt' }; const o = this.offers.find(x => x.id === id); if (!o) return { ok: false, reason: 'gone' }; if (this.activeContracts().length >= this.cfg.CONTRACTS.maxActive) return { ok: false, reason: 'tooMany' };
      this.offers = this.offers.filter(x => x !== o); const c = Object.assign({}, o, { delivered: 0, accepted: this.hours, deadline: this.hours + o.days * 24, status: 'ACTIVE' }); delete c.expires; this.contracts.push(c); this._refreshOffers(); return { ok: true, contract: c };
    }
    deliver(id, qty) {
      const c = this.contracts.find(x => x.id === id && x.status === 'ACTIVE'); if (!c) return { ok: false, reason: 'noContract' }; this.sync(); const q = Math.min(qty == null ? Infinity : qty, c.qty - c.delivered, this.available(c.product)); if (!(q > 1e-6)) return { ok: false, reason: 'nothingToDeliver' };
      const got = this.removeFrom(c.product, q), rev = got * c.price, fee = rev * this.cfg.FEES.contract, due = this.hours + this.cfg.CONTRACTS.payDays * 24;
      this._post({ type: 'SALE_CONTRACT', desc: 'Contract #' + c.id + ' delivery' }, [['AR', rev], ['REV_CONTRACT', -rev]]);
      this._post({ type: 'FEE_CONTRACT', desc: 'Contract fee' }, [['EXP_FEES', fee], ['AR', -fee]]);
      this._cogsOf(c.product, got); c.delivered += got; this._L(L => { L.sold[c.product] += got; L.soldRev += rev; });
      const C = this.cfg.CONTRACTS, late = hash(c.id, 17, 3) < C.lateShare, lateH = late ? Math.round((C.lateDays[0] + hash(c.id, 23, 5) * (C.lateDays[1] - C.lateDays[0])) * 24) : 0;   // some customers pay late
      this.recv.push({ id: this.nextRecv++, amount: rev - fee, due, payOn: due + lateH, late: lateH > 0, contract: c.id });   // due = the contract's due date; payOn = when the customer pays (later if late)
      let reward = 0; if (c.delivered >= c.qty - 1e-6) { c.status = 'DONE'; c.done = this.hours; reward = c.reward; this._post({ type: 'BONUS', flow: 'OP', desc: 'Contract bonus' }, [['CASH', reward], ['REV_CONTRACT', -reward]]); this._finish(c); this._event('info', 'Contract completed: ' + c.product + ' · bonus ' + Math.round(reward)); }
      return { ok: true, qty: got, revenue: rev, fee, reward, done: c.status === 'DONE' };
    }
    overdue() { let v = 0, n = 0; for (const r of this.recv) if (r.due < this.hours) { v += r.amount; n++; } return { amount: v, count: n }; }   // receivables past their due date
    _collect() {                                                                    // receivables that fell due are paid
      if (!this.recv.length) return; const due = this.recv.filter(r => (r.payOn == null ? r.due : r.payOn) <= this.hours); if (!due.length) return; this.recv = this.recv.filter(r => (r.payOn == null ? r.due : r.payOn) > this.hours);
      for (const r of due) if (r.amount > 0) this._post({ type: 'COLLECT', flow: 'OP', desc: 'Contract #' + r.contract + ' paid' + (r.late ? ' (late)' : '') }, [['CASH', r.amount], ['AR', -r.amount]]);
    }
    _finish(c) { this.contracts = this.contracts.filter(x => x !== c); this.history.unshift(c); if (this.history.length > 12) this.history.pop(); }
    _contractClock() {
      for (const c of this.activeContracts()) if (this.hours >= c.deadline) { c.status = 'FAILED'; const f = (c.qty - c.delivered) / c.qty, pen = Math.round(c.penalty * f); this._expense('penalty', pen, 'Contract #' + c.id + ' failed'); c.paid = pen; this._finish(c); this._event('crit', 'Contract failed: ' + c.product + ' · penalty ' + pen); }
    }

    /* ---- loans: standard amortization  Payment = P r (1+r)^n / ((1+r)^n - 1)  with r = annual/12 ---- */
    static payment(P, annual, n) { const r = annual / 12; return r === 0 ? P / n : P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1); }
    debt() { return this.loans.reduce((a, l) => a + l.remaining, 0); }
    maxDebt() { return this.cfg.LOANS.maxDebtRatio * (this.assetsTotal() + this.inventoryValue() + Math.max(0, this.store.cash)); }
    loanQuote(principal, months) {
      const L = this.cfg.LOANS, debt = this.debt(), maxD = this.maxDebt(), after = debt + principal, ratio = maxD > 0 ? clamp(after / maxD, 0, 1) : 1, rate = L.baseRate + L.riskMax * ratio, pay = Company.payment(principal, rate, months);
      let reason = null; if (this.bankrupt) reason = 'bankrupt'; else if (this.fin.state === 'DEBT_PRESSURE') reason = 'debtPressure'; else if (!(principal > 0)) reason = 'amount'; else if (!L.terms.includes(months)) reason = 'term'; else if (after > maxD + 1e-6) reason = 'limit';
      return { principal, months, rate, payment: pay, totalInterest: pay * months - principal, debt, maxDebt: maxD, room: Math.max(0, maxD - debt), ok: !reason, reason };
    }
    takeLoan(principal, months, purpose) {
      this.sync(); const q = this.loanQuote(principal, months); if (!q.ok) return q; const l = { id: this.nextLoan++, kind: 'LOAN', purpose: purpose || 'Expansion', principal, rate: q.rate, months, payment: q.payment, remaining: principal, paid: 0, taken: this.hours };
      this.loans.push(l); this._cashIn('LOAN_IN', principal, purpose || 'Loan received', 'LOANS', 'FIN'); return { ok: true, loan: l };
    }
    repayLoan(id) {
      const l = this.loans.find(x => x.id === id); if (!l) return { ok: false, reason: 'noLoan' }; this.sync(); const fee = l.remaining * this.cfg.LOANS.prepayFee, tot = l.remaining + fee; if (this.store.cash < tot) return { ok: false, reason: 'cash', need: tot };
      this._post({ type: 'LOAN_REPAY', flow: 'FIN', desc: 'Loan repaid early' }, [['LOANS', l.remaining], ['CASH', -l.remaining]]); this._expense('interest', fee, 'Early repayment fee');
      this.loans = this.loans.filter(x => x !== l); this.closed.unshift(l); return { ok: true, paid: tot };
    }
    nextPaymentInDays() { return CAL.daysToMonthEnd(this.hours); }

    /* ---- staff (a headcount per category, never individual workers) ---- */
    computeStaff() {
      const need = { operators: 0, engineers: 0, maintenance: 0, managers: 0 }, c = this.cfg.LABOR;
      for (const b of this.store.list()) { if (b.st !== 'OPERATIONAL') continue; const sk = c.staff[this.staffKey(DEFS[b.d])]; if (sk) for (const k in sk) need[k] += sk[k]; }
      const crew = Math.ceil(need.operators) + Math.ceil(need.engineers) + Math.ceil(need.maintenance), s = { operators: Math.ceil(need.operators), engineers: Math.ceil(need.engineers), maintenance: Math.ceil(need.maintenance), managers: Math.ceil(need.managers + (crew ? crew / c.perManager : 0)) };
      const H = this.cfg.HR, req = { operators: s.operators, engineers: s.engineers, maintenance: s.maintenance, managers: s.managers };   // what the buildings need
      for (const r of HRROLES) s[r] = Math.max(0, req[r] + (this.hr[r] ? this.hr[r].extra : 0));                                       // what the company employs
      s.required = req; s.total = s.operators + s.engineers + s.maintenance + s.managers; s.payroll = s.operators * c.salary.operators + s.engineers * c.salary.engineers + s.maintenance * c.salary.maintenance + s.managers * c.salary.managers;
      let wsum = 0, esum = 0; for (const r of ['operators', 'engineers', 'maintenance']) { const w = H.weight[r], cov = req[r] > 0 ? Math.min(1, s[r] / req[r]) : 1, eff = (H.base + (1 - H.base) * this.hr[r].training) * this.fatigue(this.hr[r].hours); wsum += w; esum += w * cov * eff; }
      this.teamEff = wsum ? esum / wsum : 1; this.staffF = clamp(this.teamEff, H.shortageFloor, 1);                                     // bounded: extra staff never adds output above the facility's capacity
      const eng = req.engineers > 0 ? Math.min(1, s.engineers / req.engineers) : 1, surp = req.engineers > 0 ? Math.min(1, Math.max(0, (s.engineers - req.engineers) / req.engineers)) : 0;
      this.engMult = clamp(1 + H.engineerDecay * (1 - eng) - H.engineerSurplusCut * surp, H.decayBounds[0], H.decayBounds[1]);
      this.staff = s; return s;
    }
    fatigue(hours) { const H = this.cfg.HR; return hours <= H.hoursStd ? 1 : clamp(1 - H.fatiguePerHour * (hours - H.hoursStd), H.fatigueMin, 1); }
    _trainHr(h) { const H = this.cfg.HR; for (const r of ['operators', 'engineers', 'maintenance']) { const x = this.hr[r], rate = H.trainingPerDay / 24 * (1 + H.expBonus * Math.min(x.exp, 20) / 10); x.training = x.training + (1 - x.training) * Math.min(1, rate * h); } }
    /* ---- employees: hire / dismiss / train / hours (the company decides, the engine applies) ---- */
    hire(role, n) {
      const H = this.cfg.HR, x = this.hr[role]; if (!x) return { ok: false, reason: 'role' }; n = Math.max(1, n | 0);
      const req = this.staff.required ? this.staff.required[role] : 0, cap = Math.max(H.surplusMin, Math.ceil(H.surplusShare * req)); if (x.extra + n > cap) return { ok: false, reason: 'cap', cap };
      const before = this.staff[role], tot = before + n; x.training = tot > 0 ? (x.training * before + H.newHireTraining * n) / tot : x.training; x.extra += n;   // new hires come in less trained
      this.computeStaff(); this._event('info', 'Hired ' + n + ' · ' + role); return { ok: true, count: this.staff[role], payroll: this.staff.payroll };
    }
    dismiss(role, n) { const x = this.hr[role]; if (!x) return { ok: false, reason: 'role' }; const k = Math.min(Math.max(1, n | 0), this.staff[role]); if (k <= 0) return { ok: false, reason: 'none' }; x.extra -= k; this.computeStaff(); this._event('info', 'Dismissed ' + k + ' · ' + role); return { ok: true, count: this.staff[role], payroll: this.staff.payroll }; }
    train(role) {
      const H = this.cfg.HR, x = this.hr[role]; if (!x || role === 'managers') return { ok: false, reason: 'role' }; const cnt = this.staff[role], cost = cnt * H.trainingCost; if (!(cnt > 0)) return { ok: false, reason: 'none' };
      if (this.store.cash < cost) return { ok: false, reason: 'cash', need: cost }; this.sync(); this._expense('admin', cost, 'Training · ' + role, 'OP');
      x.training = Math.min(1, x.training + H.trainingStep); this.computeStaff(); return { ok: true, cost, training: x.training };
    }
    setHours(role, hours) { const H = this.cfg.HR, x = this.hr[role]; if (!x) return { ok: false, reason: 'role' }; x.hours = clamp(+hours || H.hoursStd, H.hoursMin, H.hoursMax); this.computeStaff(); return { ok: true, hours: x.hours }; }

    /* ---- maintenance / repair: a repair is a period expense when it is paid ---- */
    /* maintenance is AUTOMATIC: its cost is charged every day with the running costs (maintDay) and equipment never wears out or breaks down, so there is nothing to repair */
    repairCost(b) { return 0; }
    repair(id) { const b = this.store.get(id); if (!b) return { ok: false, reason: 'nothing' }; if (b.st === 'DAMAGED') b.st = 'OPERATIONAL'; if (b.c < 1) b.c = 1; return { ok: true, cost: 0, automatic: true }; }   // maintenance is an automatic cost: nothing to buy or fix; this only clears a leftover state
    repairAll() { return { ok: true, n: 0, cost: 0 }; }

    /* ---- power ---- */
    setPowerBuy(on) { this.powerBuy = !!on; return { ok: true, on: this.powerBuy }; }
    gridUpgrade() { const P = this.cfg.POWER; if (this.tier + 1 >= P.tiers.length) return { ok: false, reason: 'max' }; const t = P.tiers[this.tier + 1]; this.sync(); if (this.store.cash < t.connect) return { ok: false, reason: 'cash', need: t.connect }; this._post({ type: 'GRID_CONNECT', flow: 'INV', desc: 'Grid upgrade · ' + t.name }, [['FIXED', t.connect], ['CASH', -t.connect]]); this.tier++; this.pw.cap = t.kw; return { ok: true, tier: t }; }

    /* ---- one simulation tick of h game hours ---- */
    /* ONE-TIME, entry-free migration of an older save to the net-oil rule: the old books could count the water that rides in a crude tank as oil.  The book quantity is brought down to the net oil really in the tanks;
     * no journal entry, no loss, no change of any account: the cost simply stays with the real barrels (their unit cost rises by the tiny amount the water had diluted).  Runs once (flag saved), so it can never repeat or double. */
    _netOilMigrate() {
      this.netOil = true; const phys = Math.max(0, this.crudeOnHand() - this.boughtInTanks()), was = this.qty.CRUDE;
      if (was > phys + 1e-6) { this.qty.CRUDE = phys; this.netOilFix = { barrels: was - phys, day: this.dayIdx }; }
    }
    _tick(h) {
      const S = this.sim, st = this.store, C = this.cfg, dt = h / 24, price = C.ENERGY.pricePerKWh * this.market.costMult().energy; this.sync(); this._collect(); st.tick(h); const items = st.list();
      if (this._restoreWear) { this._restoreWear = false; for (const b of items) { if (b.st === 'DAMAGED') b.st = 'OPERATIONAL'; if (b.c < 1) b.c = 1; } }      // no wear and no breakdowns: buildings an older save left worn or damaged are restored once, on the first hour after loading (nothing is deleted)
      if (!this.netOil) this._netOilMigrate();
      for (const b of items) { const s = S.ensure(b); s.ecoEff = this.effOf(b); }
      // refineries may only run on the chemicals and operating materials on hand; the limit is set BEFORE the simulator draws crude, so no crude leaves the tanks without being processed
      this._gateMaterials(items, dt);
      S.step(dt);
      const prod = PZERO(), refOut = { GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 }, crude = { operating: 0, maintenance: 0, energy: 0, lifting: 0 }, refin = { operating: 0, maintenance: 0, energy: 0, chem: 0, ops: 0 }, rf = { BYPRODUCT: 0, RESIDUE: 0, FUEL: 0, FLARED: 0 };
      let kw = 0, storageCost = 0, tankOpex = 0, tankMaint = 0, powerCost = 0, sepGas = 0, thruBuy = 0, rOps = 0, rStor = 0;
      for (const b of items) {
        if (b.st !== 'OPERATIONAL') continue; const def = DEFS[b.d], s = b.s, t = def.type, load = this.loadOf(b); const ar = this.assetRec(b); if (ar.useStart == null) ar.useStart = this.hours;   // the day it goes into service
        const k = this.kwOf(b, load), en = k * h * price, op = this.opDay(b, load) * dt, mt = this.maintDay(b, load) * dt; kw += k;
        if (CHAIN[t] && def.family !== 'WATER_PUMP') { crude.operating += op; crude.maintenance += mt; crude.energy += en; }                    // wells, pumps, separators: capitalised into crude
        else if (t === 'refinery') { refin.operating += op; refin.maintenance += mt; refin.energy += en; }        // refinery: capitalised into products
        else if (b.rs) rOps += op + mt + en;                                                                        // Strategic Reserve tanks: their own operating cost line (never mixed with the commercial stores)
        else { tankOpex += op; tankMaint += mt; powerCost += en; }                                                 // tanks / gas storage: period expenses
        if (t === 'well') { const oil = (s._out || 0) * Math.max(0, 1 - (s._wc || 0) - (s._gas || 0)) * dt; prod.CRUDE += oil; crude.lifting += oil * C.VARIABLE.liftingPerBbl * this.liftFactor(b); }
        else if (t === 'refinery') { const thr = (s._in || 0) * dt, p = s._p || {}; prod.THRU += thr; thruBuy += (s._inBuy || 0) * dt; for (const q of PRODS) { const v = (p[q] || 0) * dt; prod[q] += v; refOut[q] += v; }
          for (const k of REF_OTHER) rf[k] += (p[k] || 0) * dt; const fl = (s.flared || 0) - (s._flSeen || 0); s._flSeen = s.flared || 0; rf.FLARED += Math.max(0, fl); }
        else if (t === 'separator' && S.edgeOf(b, 'GAS_OUT')) { const g = (s._g || 0) * dt; prod.GAS += g; sepGas += g; }
        if (t === 'separator' && S.edgeOf(b, 'WATER_OUT') && (s._w || 0) > 0) this.water.produced += s._w * dt;   // water separated and sent to a water pipe: a QUANTITY only (no revenue, no inventory value)
      }
      for (const b of items) { const def = DEFS[b.d]; if ((def.type === 'tank' || def.type === 'gas') && b.s && b.s.vol > 0) { if (b.rs) rStor += b.s.vol * C.STORAGE_COST[def.product] * dt; else storageCost += b.s.vol * C.STORAGE_COST[def.product] * dt; } }
      // energy balance: available = grid supply + bought power; consumed = demand. Bought power costs kWh x price x premium.
      const tier = C.POWER.tiers[this.tier], gridKW = tier.kw, bought = this.powerBuy && kw > gridKW ? Math.min(C.POWER_BUY.maxKW, kw - gridKW) : 0;
      if (bought > 0) this._expense('energy', bought * h * price * C.POWER_BUY.priceMult, 'Bought power · ' + Math.round(bought) + ' kW');
      const supplied = Math.min(kw, gridKW + bought), target = kw > 0 ? Math.min(1, supplied / kw) : 1;
      this.pw.factor = target >= 1 && this.pw.factor > 0.98 ? 1 : this.pw.factor + (target - this.pw.factor) * 0.5;
      this.pwStop = null; const hit = C.POWER_STOP.filter(r => this.pw.factor < r.below); if (hit.length) this.pwStop = Math.min(...hit.map(r => r.fromPriority));
      this.pw.demand = kw; this.pw.cap = gridKW; this.pw.supplied = supplied; this.pw.bought = bought; this.pw.shortage = Math.max(0, kw - supplied); this.pw.stopFrom = this.pwStop; this.pw.limited = this.pw.factor < 0.995;

      // ---- production costs: incurred now, carried in inventory, expensed when the barrel is sold
      { const ts = this.store.ts; if (ts && ts.injectionCostDay) crude.operating += ts.injectionCostDay() * dt; }                // the running cost of the injection wells
      const crudeCost = crude.operating + crude.maintenance + crude.energy + crude.lifting;
      if (crudeCost > 0) this._post({ type: 'PROD_CRUDE', flow: 'OP', desc: 'Wells · pumps · separators', inc: { operating: crude.operating, maintenance: crude.maintenance, energy: crude.energy, lifting: crude.lifting } }, [[prod.CRUDE <= 0 && this.qty.CRUDE <= EPS2 && this.bq > EPS2 ? 'INV_CRUDE_BUY' : 'INV_CRUDE', crudeCost], ['CASH', -crudeCost]]);   // the handling cost of an hour with no wellhead oil belongs to the bought oil on hand (otherwise it would wait in an empty pool)
      // chemicals and operating materials: used from stock first (at average cost); only the shortfall is paid in cash at the material price
      const MU = C.MATERIAL_USE; let chemStock = 0, opsStock = 0; const chemCash = 0, opsCash = 0;
      // no chemicals or operating materials on hand: the refinery slows down to what the stock allows, and nothing is bought on its behalf
      if (prod.THRU > 0) { const ch = this._drawMaterial('CHEM', prod.THRU * MU.CHEM.qty), op = this._drawMaterial('OPS', prod.THRU * MU.OPS.qty); chemStock = ch.cost; opsStock = op.cost; }
      refin.chem = chemStock + chemCash; refin.ops = opsStock + opsCash;
      const refCash = refin.operating + refin.maintenance + refin.energy + chemCash + opsCash, refCost = refCash + chemStock + opsStock;
      if (refCost > 0 && prod.THRU <= 0) { this._expense('operating', refin.operating, 'Refinery · idle operation'); this._expense('maintenance', refin.maintenance, 'Refinery · idle maintenance'); this._expense('energy', refin.energy, 'Refinery · idle energy'); }   // no crude processed this hour: a period cost, not carried in stock (otherwise it waits in WIP until the next barrel)
      else if (refCost > 0) this._post({ type: 'PROD_REFINERY', flow: 'OP', desc: 'Refinery operation', inc: { operating: refin.operating, maintenance: refin.maintenance, energy: refin.energy, chem: refin.chem, ops: refin.ops } },
        [['INV_WIP', refCost], ['CASH', -refCash], ['INV_CHEM', -chemStock], ['INV_OPS', -opsStock]]);
      this._clearMat('CHEM'); this._clearMat('OPS');
      this._expense('operating', tankOpex * (this.costCutOn() ? 1 - C.RESCUE.costCutShare : 1), 'Tanks · operation'); this._expense('maintenance', tankMaint, 'Tanks · maintenance'); this._expense('storage', storageCost, 'Oil kept in tanks (per barrel per day)');
      this._expense('energy', powerCost, 'Gas storage · power');
      this._expense('rops', rOps * (this.costCutOn() ? 1 - C.RESCUE.costCutShare : 1), 'Strategic Reserve · operation and maintenance'); this._expense('rstorage', rStor, 'Strategic Reserve · oil kept (per barrel per day)');      // separate lines: the reserve costs are never charged twice, never inside the commercial lines
      this._reserveSettle('OUT');                                                       // oil the player released from the reserve through a pipe is back in the commercial books BEFORE the refinery draws its feed
      this.qty.CRUDE += prod.CRUDE; this.market.coProduce(prod.CRUDE);
      // the refinery takes crude out of stock at its average cost
      const consumed = prod.THRU, cBuy = Math.min(thruBuy, consumed, this.bq), cOwn = consumed - cBuy, uc = this.unitCost('CRUDE'), ucB = this.unitCostBuy(); this.market.coConsume(Math.min(cOwn, this.qty.CRUDE));
      if (thruBuy > this.bq + 1e-6) this.crudeShort += thruBuy - this.bq; if (cOwn > this.qty.CRUDE + 1e-6) this.crudeShort += cOwn - this.qty.CRUDE;   // a shortfall is counted, never hidden
      { const oAmt = Math.min(cOwn * uc, Math.max(0, this.journal.bal.INV_CRUDE)); if (cOwn > 0 && oAmt > 0) this._post({ type: 'REFINE_IN', desc: 'Produced crude to refinery' }, [['INV_WIP', oAmt], ['INV_CRUDE', -oAmt]]);
        const bAmt = Math.min(cBuy * ucB, Math.max(0, this.journal.bal.INV_CRUDE_BUY || 0)); if (cBuy > 0 && bAmt > 0) this._post({ type: 'REFINE_IN_BUY', desc: 'Bought crude to refinery' }, [['INV_WIP', bAmt], ['INV_CRUDE_BUY', -bAmt]]);
        if (cBuy > 0) { this.boughtUsed += cBuy; const last = this.tradeLog[this.tradeLog.length - 1]; if (last && last.kind === 'REFINE' && this.hours - last.t < 24) { last.qty += cBuy; last.cost += bAmt; last.own += cOwn; last.t = this.hours; } else this._trade('REFINE', { qty: cBuy, cost: bAmt, own: cOwn, note: 'نفط مشترى دخل المصفاة' }); } }
      this.qty.CRUDE = Math.max(0, this.qty.CRUDE - cOwn); this._clearPool('CRUDE'); this.bq = Math.max(0, this.bq - cBuy); this._clearBuy();
      this._reserveSettle('IN', true);                                                  // crude that reached a reserve tank by pipe leaves the commercial books at its average cost (internal transfer), before the lost-oil check
      /* the books never hold crude that is not in a tank: oil that was booked at the wellhead but never reached a tank (separator slop, shrink) is written off at its average cost as a loss */
      { const physB = this.boughtInTanks(), phys = this.crudeOnHand() - physB, ex = this.qty.CRUDE - phys; if (ex > 1e-6) { const u = this.unitCost('CRUDE'), amt = Math.min(ex * u, Math.max(0, this.journal.bal.INV_CRUDE)); if (amt > 0) this._post({ type: 'CRUDE_LOSS', flow: 'OP', desc: 'Crude lost before the refinery (separator slop, tank shrink)' }, [['EXP_LOSS', amt], ['INV_CRUDE', -amt]]); this.qty.CRUDE = phys; this.crudeLoss = (this.crudeLoss || 0) + ex; this.market.coConsume(ex); this._clearPool('CRUDE'); }
        const exB = this.bq - physB; if (exB > 1e-6) { const amt = Math.min(exB * this.unitCostBuy(), Math.max(0, this.journal.bal.INV_CRUDE_BUY || 0)); if (amt > 0) this._post({ type: 'CRUDE_LOSS', flow: 'OP', desc: 'Bought crude lost in storage' }, [['EXP_LOSS', amt], ['INV_CRUDE_BUY', -amt]]); this.bq = physB; this._clearBuy(); } }
      // products take the refinery's cost, shared by barrels
      // every barrel of feed is accounted for. The cost of a barrel of feed is the same for all outputs; the fuel, the flare and the loss are expensed, the rest is carried in stock
      const T = prod.THRU, wip = Math.max(0, this.journal.bal.INV_WIP), outs = PRODS.reduce((a, q) => a + refOut[q], 0) + rf.BYPRODUCT + rf.RESIDUE + rf.FUEL + rf.FLARED, loss = Math.max(0, T - outs);
      this.refLast = { feed: T, products: Object.assign({}, refOut), byproduct: rf.BYPRODUCT, residue: rf.RESIDUE, fuel: rf.FUEL, flared: rf.FLARED, loss };
      for (const q of PRODS) this.qty[q] += refOut[q] * (q === 'GAS' ? BC.REFINERY.gasBblEqPerUnit : 1); this.qty2.BYPRODUCT += rf.BYPRODUCT; this.qty2.RESIDUE += rf.RESIDUE;
      // cost allocation: every barrel of crude cost lands exactly once. Fuel and losses are expensed at the average cost of a barrel of feed.
      // Residue has no market value, so it carries no cost (net realisable value). The rest is shared by the sellable outputs in proportion to their sales value
      // (relative sales-value method), so every sellable output keeps the same gross margin %: a cheap barrel does not inherit the cost of an expensive one.
      if (T > 0 && wip > 0) {
        const avg = wip / T, fuCost = Math.min(wip, avg * rf.FUEL), lsCost = Math.min(wip - fuCost, avg * (loss + rf.FLARED)), pool = Math.max(0, wip - fuCost - lsCost);
        const sellable = PRODS.map(q => ({ v: refOut[q] * (q === 'GAS' ? BC.REFINERY.gasBblEqPerUnit : 1), price: this.unitPrice(q), acc: INVACC[q], desc: 'Products · ' + q }))
          .concat([{ v: rf.BYPRODUCT, price: this.byproductPrice(), acc: 'INV_BYPRODUCT', desc: 'By-product (sellable)' }]);
        const wsum = sellable.reduce((a, x) => a + Math.max(0, x.v) * Math.max(0, x.price), 0);
        if (wsum > 0) for (const x of sellable) { const amt = pool * Math.max(0, x.v) * Math.max(0, x.price) / wsum; if (amt > 0.005) this._post({ type: 'REFINE_OUT', desc: x.desc }, [[x.acc, amt], ['INV_WIP', -amt]]); }
        else if (pool > 0.005) this._post({ type: 'REFINE_LOSS', desc: 'Refinery output with no sales value (expensed)' }, [['EXP_LOSS', pool], ['INV_WIP', -pool]]);
        if (fuCost > 0.005) this._post({ type: 'REFINE_FUEL', desc: 'Refinery internal fuel (expense)' }, [['EXP_FUEL', fuCost], ['INV_WIP', -fuCost]]);
        if (lsCost > 0.005) this._post({ type: 'REFINE_LOSS', desc: 'Refinery losses (recorded)' }, [['EXP_LOSS', lsCost], ['INV_WIP', -lsCost]]);
      }
      if (sepGas > 0) { const amt = Math.min(sepGas * this.unitCost('CRUDE'), Math.max(0, this.journal.bal.INV_CRUDE)); if (amt > 0.005) this._post({ type: 'SEP_GAS', desc: 'Gas from separators' }, [['INV_GAS', amt], ['INV_CRUDE', -amt]]); this.qty.GAS += sepGas * BC.REFINERY.gasBblEqPerUnit; }
      this._reserveSettle('IN', false);                                                 // products and gas that reached a reserve tank by pipe: same internal transfer
      this._L(L => { for (const k of Object.keys(prod)) L.produced[k] += prod[k]; for (const k of ['BYPRODUCT', 'RESIDUE', 'FUEL', 'FLARED']) L.produced[k] = (L.produced[k] || 0) + rf[k]; });

      const qNow = this._qNow(items), onHand = this.crudeOnHand(); if (onHand > 0 && prod.CRUDE > 0) { const sh = Math.min(1, prod.CRUDE / onHand); this.crudeQ = this.crudeQ * (1 - sh) + qNow * sh; } else if (onHand <= 0) this.crudeQ = qNow;
      const row = [prod.CRUDE / h, prod.THRU / h, prod.GASOLINE / h, prod.DIESEL / h, prod.JET_FUEL / h, prod.GAS / h].map(v => Math.round(v * 100) / 100); for (let i = 0; i < h; i++) this.prodHist.push(row); while (this.prodHist.length > C.MARKET.historyHours) this.prodHist.shift();
      this.computeStaff();
      this._paySuppliers(); this._trainHr(h); this.computeStaff();
      const pay = this.staff.payroll * h / (CAL.fromHours(this.hours).daysInMonth * C.TIME.hoursPerDay);          // salaries are earned every hour of the month, so a month always costs the same salary whatever its length; the cash leaves on the 1st
      if (pay > 0) this._post({ type: 'PAYROLL_EARNED', desc: 'Salaries earned' }, [['EXP_LABOR', pay], ['PAY_PAYROLL', -pay]]);
      for (const p of SELL) { const cap = this.capacity(p); this.market.stock[p] = cap ? this.physicalVol(p) / cap : 0; }
      for (let i = 0; i < h; i++) { this.market.tick(this.hours + i); }
      this._auto(); this._contractClock(); this._finance(h);
      this.hours += h; while (Math.floor(this.hours / 24) > this.dayIdx) { this.dayIdx++; this._newDay(); }
      this._notify();
    }
    _qNow(items) { let qSum = 0, qW = 0; for (const b of items) if (b.st === 'OPERATIONAL' && DEFS[b.d].type === 'well' && b.s) { const oil = (b.s._out || 0) * Math.max(0, 1 - (b.s._wc || 0) - (b.s._gas || 0)); qSum += oil; qW += oil * this.cfg.QUALITY.mult[this.wellQuality(b)]; } return qSum > 0 ? qW / qSum : this.crudeQ; }
    _auto() {
      const A = this.cfg.AUTOSELL;
      for (const p of SELL) {
        const m = this.modes[p]; if (m === 'SPOT') { const cap = this.capacity(p); if (cap <= 0) continue; const av = this.available(p), phys = this.physicalVol(p), water = phys - av, fill = phys / cap, price = this.market.price[p];
          if (fill >= A.trigger && (price >= this.market.refPrice(p) * A.minPriceRatio || fill >= A.force)) {
            // auto-sell is for what the wells and the refinery PRODUCE: bought oil / bought products are the player's own trade and are never sold automatically
            const own = p === 'CRUDE' ? this.crudeAvailable('OWN') : Math.max(0, av - Math.min(av, this.bprod[p] || 0)), want = Math.min(av - (A.target * cap - water), own);
            if (want > 1e-6) this.sell(p, want, 'AUTO', p === 'CRUDE' ? { source: 'OWN' } : undefined); } }
        else if (m === 'CONTRACT') for (const c of this.activeContracts().filter(x => x.product === p).sort((a, b) => a.deadline - b.deadline)) this.deliver(c.id);
      }
    }
    /* the permanent daily financial record (from the real ledger of the day that just closed): [day, revenue, expenses, net, cash in, cash out, opening cash, closing cash, assets, debt].
       Weeks / months / years are only sums of these rows (finSeries) - they are never kept or computed separately. */
    _finLog(cash) {
      const c = calc(this.led.day, cash), r = v => Math.round(v * 100) / 100; this.dlog.push([this.dayIdx - 1, r(c.revenue), r(c.expenses), r(c.netProfit), r(c.cash.in), r(c.cash.out), r(c.cash.start), r(cash), r(this.assetsTotal()), r(this.debt())]);
      while (this.dlog.length > 3650) this.dlog.shift();
    }
    /* the financial history as a list of periods ('D' day, 'M' month, 'Y' year) built from the daily rows of the central calendar */
    finSeries(frame) {
      const out = []; let cur = null;
      for (const r of this.dlog) { const dt = CAL.dateOfDay(r[0]), key = frame === 'D' ? r[0] : frame === 'M' ? dt.year * 100 + dt.month : dt.year;
        if (!cur || cur.key !== key) { cur = { key, year: dt.year, month: dt.month, day: dt.day, from: r[0], to: r[0], rev: 0, exp: 0, pro: 0, cin: 0, cout: 0, cstart: r[6], cend: r[7], assets: r[8], debt: r[9], n: 0 }; out.push(cur); }
        cur.to = r[0]; cur.n++; cur.rev += r[1]; cur.exp += r[2]; cur.pro += r[3]; cur.cin += r[4]; cur.cout += r[5]; cur.cend = r[7]; cur.assets = r[8]; cur.debt = r[9]; }
      return out;
    }
    _newDay() {
      // Month-end charges (salaries, running costs, loans, tax) belong to the day that ENDS the month: they are booked before that day is closed.
      if (CAL.isMonthStart(this.dayIdx)) this._monthEnd();                                 // the real calendar decides: the 1st of a month closes the month before it
      const cash = this.store.cash; this.days.push(Object.assign({ d: this.dayIdx - 1 }, (() => { const c = calc(this.led.day, cash); return { revenue: c.revenue, expenses: c.expenses, profit: c.netProfit, cashIn: c.cash.in, cashOut: c.cash.out, storage: this.led.day.storage, opex: c.opex + c.variable }; })()));
      while (this.days.length > 60) this.days.shift(); this._finLog(cash); this.led.day = ledger(cash);
      this._refreshOffers();                                                          // expired offers leave, new ones take their place: there are always 3 to choose from
    }
    _monthEnd() {
      this.fin.lateSalary = false; this.fin.missed = 0;                              // these flags describe the month that is closing
      const C = this.cfg, F = C.FIXED, assets = this.assetsTotal(), pipes = this.pipeValue(), tier = C.POWER.tiers[this.tier];
      // 1. salaries: the expense was booked every hour, the cash leaves now
      const owed = -this.journal.bal.PAY_PAYROLL; if (owed > 0.005) { const before = this.store.cash; this._post({ type: 'PAYROLL_PAID', flow: 'OP', desc: 'Salaries paid' }, [['PAY_PAYROLL', owed], ['CASH', -owed]]); if (before < owed) this.fin.lateSalary = true; }
      // 2. running costs (paid this month)
      this._expense('insurance', assets * F.insurancePerMonth, 'Insurance on assets');
      const cut = this.costCutOn() ? 1 - C.RESCUE.costCutShare : 1; this._expense('admin', (F.adminBase + assets * F.adminPerAsset) * cut, 'Administration' + (cut < 1 ? ' (cost cut)' : ''));
      this._expense('infra', pipes * F.infraPerYear / C.TIME.monthsPerYear, 'Pipeline upkeep');
      this._expense('energy', tier.monthly, 'Power network · ' + tier.name);
      // 3. (no depreciation: equipment has no useful life; it wears only with use and is repaired / replaced by the player)
      // 4. loans: interest is an expense, the principal is not
      for (const l of this.loans.slice()) {
        const intr = l.remaining * l.rate / 12, last = l.paid + 1 >= l.months, prin = last ? l.remaining : Math.min(l.remaining, l.payment - intr);
        if (this.store.cash < intr + prin) this.fin.missed++;
        this._expense('interest', intr, 'Loan interest · ' + (l.purpose || '')); if (prin > 0) this._post({ type: 'LOAN_PRINCIPAL', flow: 'FIN', desc: 'Loan principal' }, [['LOANS', prin], ['CASH', -prin]]);
        l.remaining -= prin; l.paid++; if (l.remaining < 0.5 || last) { this.loans = this.loans.filter(x => x !== l); this.closed.unshift(l); }
      }
      // 5. income tax: accrued on taxable profit, paid from the tax payable (losses carry forward)
      const M = calc(this.led.month, this.store.cash), taxable = M.revenue - (M.variable + M.opex + M.interest);
      if (taxable < 0) { if (C.TAX.lossCarryForward) this.taxCarry += -taxable; }
      else { const used = C.TAX.lossCarryForward ? Math.min(this.taxCarry, taxable) : 0; this.taxCarry -= used; const tax = (taxable - used) * C.TAX.rate;
        if (tax > 0.005) { this._post({ type: 'TAX_ACCRUED', desc: 'Tax on the month' }, [['EXP_TAX', tax], ['PAY_TAX', -tax]]); this._post({ type: 'TAX_PAID', flow: 'OP', desc: 'Tax paid' }, [['PAY_TAX', tax], ['CASH', -tax]]); } }
      // 6. close the month
      const cash = this.store.cash, closed = calc(this.led.month, cash), endSnap = this._snap(), startSnap = this.bsStart || endSnap;
      closed.ratios = this._ratios(closed, startSnap, endSnap); this.bsStart = endSnap;                                   // ratios use the average of the start and end balances
      this.lastMonth = closed; delete this.lastMonth.L.produced; this.led.month = ledger(cash);
      this.months.push({ n: this.months.length + 1, dayIdx: this.dayIdx, revenue: closed.revenue, expenses: closed.expenses, profit: closed.netProfit, cashIn: closed.cash.in, cashOut: closed.cash.out, cashEnd: cash }); while (this.months.length > 24) this.months.shift();
      if (CAL.isYearStart(this.dayIdx)) this.led.year = ledger(cash);
    }
    _finance(h) {
      const F = this.cfg.FINANCE, f = this.fin, cash = this.store.cash; if (this.bankrupt) return;
      f.indicators = this.riskIndicators(); f.score = f.indicators.filter(i => i.on).length;
      if (cash >= 0 || !isFinite(cash)) { f.negHours = 0; f.state = 'OK'; f.stage = f.score >= 3 ? 'PRESSURE' : f.score >= 1 ? 'WARNING' : 'NORMAL'; return; }
      f.negHours += h; const days = f.negHours / 24;
      if (days >= F.bankruptAfterDays) { this.bankrupt = true; f.state = 'BANKRUPT'; f.stage = 'BANKRUPT'; this._event('crit', 'BANKRUPTCY'); return; }
      if (days >= F.pressureAfterDays) { f.state = 'DEBT_PRESSURE'; f.stage = 'DEFAULT'; return; }
      if (days >= F.emergencyAfterDays) { const E = this.cfg.LOANS.emergency, used = this.loans.filter(l => l.kind === 'EMERGENCY').reduce((a, l) => a + l.remaining, 0), room = E.limit - used;
        if (room >= 1 && (f.emergencyAt < 0 || this.hours - f.emergencyAt > 24 * 10)) { const amt = Math.min(room, Math.max(E.minAmount, -cash * E.cover)), pay = Company.payment(amt, E.rate, E.term);
          this.loans.push({ id: this.nextLoan++, kind: 'EMERGENCY', purpose: 'Emergency credit', principal: amt, rate: E.rate, months: E.term, payment: pay, remaining: amt, paid: 0, taken: this.hours }); this._cashIn('LOAN_IN', amt, 'Emergency credit', 'LOANS', 'FIN'); f.emergencyAt = this.hours; this._event('crit', 'Emergency credit drawn: ' + Math.round(amt)); }
        f.state = f.emergencyAt >= 0 ? 'EMERGENCY_CREDIT' : 'WARNING'; f.stage = f.emergencyAt >= 0 ? 'RESCUE' : 'LIQUIDITY'; return; }
      f.state = 'WARNING'; f.stage = 'LIQUIDITY';
    }
    /* the seven financial stages are driven by these indicators (plus the cash rules in _finance) */
    riskIndicators() {
      const F = this.cfg.FIXED, RK = this.cfg.RISK, r7 = this.recent(7), r30 = this.recent(30), m = this.months, bs = this.balanceSheet(), wells = this.store.list().filter(b => DEFS[b.d].type === 'well' && b.st === 'OPERATIONAL').length;
      const monthlyFixed = this.staff.payroll + F.adminBase, debtBase = bs.fixedNet + bs.inventory, crudeRecent = this.prodHist.slice(-24).reduce((a, r) => a + r[0], 0);
      return [
        { key: 'liquidity', on: this.store.cash < monthlyFixed * RK.liquidityMonths, label: 'Low liquidity' },
        { key: 'debt', on: debtBase > 0 ? this.debt() / debtBase > RK.debtRatio : this.debt() > 0, label: 'Debt build-up' },
        { key: 'salary', on: this.fin.lateSalary, label: 'Late salaries' },
        { key: 'loan', on: this.fin.missed > 0, label: 'Late loan installments' },
        { key: 'losses', on: m.length >= 2 && m.slice(-2).every(x => x.profit < 0), label: 'Repeated losses' },
        { key: 'costs', on: r30.n >= 7 && r30.revenue > 0 && r30.expenses / r30.revenue > RK.costRatio, label: 'High operating costs' },
        { key: 'sales', on: m.length >= 2 && m[m.length - 1].revenue > 0 && m[m.length - 1].revenue < m[m.length - 2].revenue * (1 - RK.salesDrop), label: 'Falling sales' },
        { key: 'halt', on: wells > 0 && this.prodHist.length >= 24 && crudeRecent <= 0, label: 'Production halted' }
      ].map(x => Object.assign(x, { on: !!x.on }));
    }
    netPerDay() {                                                                   // the number in the HUD: the trailing profit per day (a live estimate during the first day)
      const r = this.recent(30), d = this.led.day, hrs = this.hours % 24; if (r.n >= 3) return r.profit / r.n; const c = calc(d, this.store.cash); return hrs >= 2 ? c.netProfit / (hrs / 24) : c.netProfit * 0;
    }
    /* the date of the game: the real calendar read from the one clock (this.hours).  year/month/dayOfMonth are the calendar year, month and day of month */
    clock() { const d = CAL.fromHours(this.hours); return { hours: this.hours, day: d.dayIdx, hour: d.hour, dayOfMonth: d.day, month: d.month, year: d.year, weekday: d.weekday, weekdayName: d.weekdayName, monthName: d.monthName, daysInMonth: d.daysInMonth, text: d.text, textAr: d.textAr, speed: this.speed, paused: this.speed === 0 }; }
    _event(level, msg) { this.events.push({ level, msg, hour: this.hours }); if (this.events.length > 40) this.events.shift(); }
    drainEvents() { const e = this.events; this.events = []; return e; }
    _notify() {                                                                     // a toast only when an alert APPEARS (not every tick), and only for warn / crit
      const now = new Set(); for (const a of this.alerts()) { now.add(a.key); if (!this.seen.has(a.key) && a.level !== 'info') this._event(a.level, a.title + (a.detail ? ' · ' + a.detail : '')); } this.seen = now;
    }
    recent(n) { const arr = this.days.slice(-n); const t = { revenue: 0, expenses: 0, opex: 0, profit: 0, cashIn: 0, cashOut: 0, storage: 0 }; for (const d of arr) { t.revenue += d.revenue; t.expenses += d.expenses; t.opex += d.opex; t.profit += d.profit; t.cashIn += d.cashIn; t.cashOut += d.cashOut; t.storage += d.storage; } t.n = arr.length; return t; }
    alerts() {
      const A = this.cfg.ALERTS, out = [], cash = this.store.cash, add = (key, level, title, detail) => out.push({ key, level, title, detail: detail || '' }), f = this.fin;
      if (f.state === 'BANKRUPT') add('fin', 'crit', 'BANKRUPTCY', 'The company is insolvent'); else if (f.state === 'DEBT_PRESSURE') add('fin', 'crit', 'DEBT PRESSURE', 'No new loans · sell products or assets'); else if (f.state === 'EMERGENCY_CREDIT') add('fin', 'crit', 'EMERGENCY CREDIT', 'Cash is negative'); else if (f.state === 'WARNING') add('fin', 'warn', 'FINANCIAL WARNING', 'Cash is negative · no new purchases');
      const r30 = this.recent(30), r7 = this.recent(7), perDay = r7.n >= 3 ? r7.cashOut / r7.n : (this.staff.payroll + this.cfg.FIXED.adminBase) / this.cfg.TIME.daysPerMonth;
      if (f.state === 'OK' && (cash < 1000000 || (perDay > 0 && cash < perDay * A.lowCashDays))) add('lowcash', 'warn', 'LOW CASH', Math.max(0, Math.floor(perDay ? cash / perDay : 0)) + ' days of expenses');
      if (r30.n >= 7 && r30.revenue > 0 && r30.expenses / r30.revenue > A.highOpexRatio) add('opex', 'warn', 'HIGH OPERATING COST', Math.round(r30.expenses / r30.revenue * 100) + '% of revenue');
      else if (r30.n >= 10 && r30.revenue <= 0 && r30.expenses > 0) add('opex', 'warn', 'HIGH OPERATING COST', 'costs with no sales yet');
      if (r30.n >= 7 && r30.revenue > 0 && r30.profit / r30.revenue < A.lowMarginRatio) add('lowprofit', 'warn', 'LOW PROFIT', 'margin ' + Math.round(r30.profit / r30.revenue * 100) + '%');
      if (r30.n >= 7 && r30.cashOut - r30.cashIn > 0 && r30.profit < 0) add('negflow', 'warn', 'NEGATIVE CASH FLOW', 'out > in over ' + r30.n + ' days');
      if (r30.n >= 7 && r30.revenue > 0 && r30.storage / r30.revenue > A.highStorageRatio) add('storagecost', 'info', 'HIGH STORAGE COST', Math.round(r30.storage / r30.revenue * 100) + '% of revenue');
      if (this.loans.length && this.nextPaymentInDays() <= A.loanDueDays) add('loandue', 'warn', 'LOAN PAYMENT DUE', Math.ceil(this.nextPaymentInDays()) + ' days · ' + Math.round(this.loans.reduce((a, l) => a + l.payment, 0)));
      { const wi = this.waterInfo(); if (wi.full) add('waterfull', 'warn', 'WATER TANKS FULL', 'water intake stopped · ' + Math.round(wi.stock) + ' bbl'); }   // water cannot be stored beyond the tanks: the intake stops and this says so
      for (const c of this.activeContracts()) { const left = (c.deadline - this.hours) / 24; if (left <= A.contractDays) add('contract' + c.id, 'warn', 'CONTRACT DEADLINE', c.product + ' · ' + Math.ceil(left) + ' days · ' + Math.round(c.qty - c.delivered) + ' left'); }
      /* things that silently stop crude from reaching the refinery: a refinery with no chemicals / operating materials, a broken building, repairs that cannot be paid for in spare parts */
      { const list = this.store.list(), refs = list.filter(b => DEFS[b.d].type === 'refinery' && b.st !== 'UNDER_CONSTRUCTION'), MU = this.cfg.MATERIAL_USE;
        if (refs.length && (this.matLimit || 0) <= 0) add('nomat', 'warn', 'REFINERY LACKS MATERIALS', 'buy chemicals and operating materials');
      }
      for (const v of this.inventory()) {
        if (v.capacity > 0 && v.fill >= A.highInventoryFill) add('hiinv' + v.product, 'warn', 'HIGH INVENTORY', v.label + ' ' + Math.round(v.fill * 100) + '%');
        const needs = this.activeContracts().some(c => c.product === v.product); if (needs && v.fill < A.lowInventoryFill) add('loinv' + v.product, 'info', 'LOW INVENTORY', v.label + ' for a contract');
        if ((v.volume > 0 || needs) && Math.abs(v.change24) >= A.priceMove) add('px' + v.product, 'info', v.change24 < 0 ? 'MARKET PRICE DROP' : 'MARKET PRICE RISE', v.label + ' ' + (v.change24 > 0 ? '+' : '') + (v.change24 * 100).toFixed(1) + '%');
      }
      return out;
    }

    /* ---- summaries for the screens ---- */
    summary() {
      const cash = this.store.cash, assets = this.assetsTotal(), inv = this.inventoryValue(), debt = this.debt(), bs = this.balanceSheet();
      return { cash, assets, debt, inventoryValue: inv, inventoryBook: bs.inventory, receivables: bs.receivables, overdue: this.overdue(), value: assets + cash + inv - debt, today: calc(this.led.day, cash), month: calc(this.led.month, cash), year: calc(this.led.year, cash), life: calc(this.led.life, cash), lastMonth: this.lastMonth, months: this.months.slice(), balance: bs, staff: this.staff, power: Object.assign({}, this.pw, { tier: this.tier, tierName: this.cfg.POWER.tiers[this.tier].name }),
        fin: Object.assign({}, this.fin), taxCarry: this.taxCarry, clock: this.clock(), dayNet: this.netPerDay() };
    }
    /* the audit: the journal balances, the balance sheet balances, the cash account is the company's cash, the stock pools agree with the journal */
    audit() {
      this.sync(); const errs = [], j = this.journal.check(); if (!j.ok) errs.push('journal not balanced: ' + j.sum);
      const bs = this.journal.balanceSheet(), tol = this.journal.tol(); if (Math.abs(bs.gap) > tol) errs.push('balance sheet gap: ' + bs.gap);
      if (isFinite(this.store.cash) && Math.abs(this.journal.bal.CASH - this.store.cash) > Math.max(1e-3, 1e-12 * Math.abs(this.store.cash))) errs.push('cash differs from the journal: ' + (this.journal.bal.CASH - this.store.cash));
      for (const p of SELL) { if (this.qty[p] <= EPS2 && this.journal.bal[INVACC[p]] > 0.01) errs.push('stock cost without quantity: ' + p); }
      if (this.bq <= EPS2 && (this.journal.bal.INV_CRUDE_BUY || 0) > 0.01) errs.push('bought crude cost without quantity'); { const pb = this.boughtInTanks(); if (Math.abs(pb - this.bq) > Math.max(1e-3, 1e-9 * Math.abs(this.bq))) errs.push('bought crude: books ' + this.bq + ' differ from the tanks ' + pb); }
      for (const m of this.cfg.MATERIALS) { if ((this.mats[m] || 0) <= EPS2 && this.journal.bal[MATACC[m]] > 0.01) errs.push('material cost without quantity: ' + m); }
      { const rb = this.journal.bal.INV_RESERVE || 0, rs = this.reserveBook(); if (Math.abs(rb - rs) > Math.max(0.01, 1e-9 * Math.abs(rb))) errs.push('reserve account ' + rb + ' differs from the reserve tanks ' + rs); if (this.reserveVolume() <= EPS2 && rb > 0.01) errs.push('reserve cost without oil');
        for (const b of this.reserveTanks()) { const s = this._rt(b); if (s.vol < -1e-6 || (s.bv || 0) > s.vol + 1e-6 || (s.cO || 0) < -1e-6 || (s.cB || 0) < -1e-6) errs.push('reserve tank ' + b.id + ' state is invalid'); } }
      return { ok: !errs.length, errors: errs, entries: this.journal.n };
    }
    production(range) {
      const n = { daily: 24, weekly: 168, monthly: 720 }[range] || 24, a = this.prodHist.slice(-n), t = [0, 0, 0, 0, 0, 0]; for (const r of a) for (let i = 0; i < 6; i++) t[i] += r[i];
      return { range, hours: a.length, crude: t[0], throughput: t[1], gasoline: t[2], diesel: t[3], jet: t[4], gas: t[5] };
    }
    productionRates() { const s = { crude: 0, throughput: 0, gasoline: 0, diesel: 0, jet: 0, gas: 0 }, r = this.prodHist[this.prodHist.length - 1]; if (r) { s.crude = r[0] * 24; s.throughput = r[1] * 24; s.gasoline = r[2] * 24; s.diesel = r[3] * 24; s.jet = r[4] * 24; s.gas = r[5] * 24; } return s; }      // barrels per day

    /* ---- building economics tab: everything per day, from the live Sim state and the live prices ---- */
    economics(id) {
      const b = this.store.get(id); if (!b) return null; const def = DEFS[b.d], t = def.type, s = this.sim.ensure(b), C = this.cfg, active = b.st === 'OPERATIONAL', load = active ? this.loadOf(b) : 0, a = this.assetRec(b);
      const op = active ? this.opDay(b, load) : 0, mt = active ? this.maintDay(b, load) : 0, kw = active ? this.kwOf(b, load) : 0, energy = kw * 24 * C.ENERGY.pricePerKWh, sk = C.LABOR.staff[this.staffKey(def)] || {}, L = C.LABOR.salary;
      const labor = active ? ((sk.operators || 0) * L.operators + (sk.engineers || 0) * L.engineers + (sk.maintenance || 0) * L.maintenance + (sk.managers || 0) * L.managers) / C.TIME.daysPerMonth : 0;
      const o = { id, name: def.name, type: t, status: this.sim.status(b), active, load, condition: b.c, conditionLabel: this.conditionLabel(b.c), purchase: a.cost, value: this.assetValue(b), ageDays: Math.floor((this.hours - a.t) / 24), operatingDay: op, maintenanceDay: mt, energyDay: energy, laborDay: labor, kw };
      if (t === 'well') { const oil = (s._out || 0) * Math.max(0, 1 - (s._wc || 0) - (s._gas || 0)), px = this.market.price.CRUDE * C.QUALITY.mult[this.wellQuality(b)]; o.quality = this.wellQuality(b); o.oilDay = oil; o.revenuePotentialDay = oil * px; o.liftingDay = oil * C.VARIABLE.liftingPerBbl * this.liftFactor(b); o.marginDay = o.revenuePotentialDay - o.liftingDay - op - mt - energy - labor; }
      else if (t === 'pump') { o.production = 'Moves ' + Math.round(s._in || 0) + ' bbl/day · +' + Math.round(s.boost * s.eff) + ' psi'; o.productionImpact = s._in || 0; }
      else if (t === 'tank' || t === 'gas') { const p = def.product, vol = s.vol || 0, px = this.unitPrice(p); o.product = p; o.stored = vol; o.storageCostDay = vol * C.STORAGE_COST[p]; o.storedValue = vol * px; }
      else if (t === 'refinery') { const pr = s._p || {}, px = this.market.price, thr = s._in || 0; o.throughputDay = thr; o.byproductDay = pr.BYPRODUCT || 0; o.residueDay = pr.RESIDUE || 0; o.fuelDay = pr.FUEL || 0; o.productRevenueDay = (pr.GASOLINE || 0) * px.GASOLINE + (pr.DIESEL || 0) * px.DIESEL + (pr.JET_FUEL || 0) * px.JET_FUEL + (pr.GAS || 0) * px.GAS;
        o.crudeOpportunityDay = thr * this.unitPrice('CRUDE'); o.chemicalsDay = thr * C.VARIABLE.chemicalsPerBbl; o.refiningMarginDay = active ? o.productRevenueDay - o.crudeOpportunityDay - energy - labor - mt - op - o.chemicalsDay : 0; }   // RefiningProfit = ProductRevenue - CrudeOpportunityCost - Energy - Labor - Maintenance - Operating
      else if (t === 'separator') { o.feedDay = s._in || 0; }
      o.totalCostDay = op + mt + energy + labor + (o.liftingDay || 0) + (o.storageCostDay || 0) + (o.chemicalsDay || 0);
      return o;
    }
    refiningMargin() { let m = 0, n = 0; for (const b of this.store.list()) if (DEFS[b.d].type === 'refinery' && b.st === 'OPERATIONAL') { m += this.economics(b.id).refiningMarginDay; n++; } return { margin: m, refineries: n }; }

    /* ---- exploration spending (Stage 8): the WORLD decides what a survey or a test well finds, the COMPANY pays for it.  Both are refused (and change nothing) when the cash is not there ---- */
    exploreZone(world, rid) {
      if (this.bankrupt) return { ok: false, reason: 'bankrupt' }; this.sync(); const z = world.zoneInfo(rid); if (!z) return { ok: false, reason: 'unknown' }; if (z.evaluated) return { ok: false, reason: 'done' };
      const cost = z.evaluateCost; if (this.store.cash < cost) return { ok: false, reason: 'cash', cost }; const r = world.evaluateZone(rid); if (!r.ok) return r;
      this._expense('exploration', cost, 'Geological evaluation · zone ' + rid); this._spend('ZONE', cost, { zone: rid }); return { ok: true, cost, zone: world.zoneInfo(rid) };
    }
    drillWell(world, type, siteId) {                                                // exploratory / appraisal / injection wells (a production well is a building: store.place)
      if (this.bankrupt) return { ok: false, reason: 'bankrupt' }; this.sync(); const cost = world.drillCost(type, siteId); if (!(cost > 0)) return world.drillWell(type, siteId, this.hours);
      if (this.store.cash < cost) return { ok: false, reason: 'cash', cost }; const r = world.drillWell(type, siteId, this.hours); if (!r.ok) return r;
      this._expense('exploration', r.cost, type + ' well ' + r.id + ' · site ' + siteId + ' · ' + r.result); this._spend(type, r.cost, { site: siteId, well: r.id, result: r.result }); return Object.assign({}, r, { cost: r.cost });
    }
    _spend(kind, cost, o) { this.explLog.push(Object.assign({ t: this.hours, kind, cost }, o)); while (this.explLog.length > 200) this.explLog.shift(); }

    /* ---- running time ---- */
    advanceHours(n, step) { step = step || 1; let left = n; while (left > 1e-9 && !this.bankrupt) { const h = Math.min(step, left); this._tick(h); left -= h; } }
    /* time control: ONE place sets the speed.  0 = paused: nothing that depends on time moves (run, offline catch-up and the loop in the lab all read this) */
    setSpeed(v) { const sp = this.cfg.TIME.speeds; v = +v; if (!sp.includes(v)) return { ok: false, reason: 'speed' }; if (v > 0) this.lastSpeed = v; else if (this.speed > 0) this.lastSpeed = this.speed; this.speed = v; return { ok: true, speed: v }; }
    pause() { return this.setSpeed(0); }
    resume() { return this.setSpeed(this.lastSpeed > 0 ? this.lastSpeed : 1); }
    togglePause() { return this.speed === 0 ? this.resume() : this.pause(); }
    faster() { const sp = this.cfg.TIME.speeds.filter(x => x > 0), cur = this.speed || this.lastSpeed || 1, i = sp.indexOf(cur); return this.setSpeed(sp[Math.min(sp.length - 1, i < 0 ? 0 : i + 1)]); }
    slower() { const sp = this.cfg.TIME.speeds.filter(x => x > 0), cur = this.speed || this.lastSpeed || 1, i = sp.indexOf(cur); return this.setSpeed(sp[Math.max(0, i < 0 ? 0 : i - 1)]); }
    run(hours) {                                                                   // the lab calls this with real time x speed; whole hours only, the remainder waits for the next call
      if (this.bankrupt || !(hours > 0) || this.speed === 0) return 0; this.acc = Math.min(this.acc + hours, this.cfg.TIME.maxCatchUpHours); let n = 0; while (this.acc >= 1 && n < this.cfg.TIME.maxStepsPerTick && !this.bankrupt) { this._tick(1); this.acc -= 1; n++; } return n;
    }

    /* ---- offline simulation ---- */
    stamp(ms) { this.lastSim = ms == null ? this.now() : ms; }
    /* The offline catch-up can be run in ONE go (catchUp - used by tests and tools) or in short slices between frames (catchUpStart / catchUpStep / catchUpFinish - used by the game so that opening it after a long absence never freezes the screen).
       Both run exactly the same ticks in the same order, so the results are identical. */
    catchUpStart(nowMs) {
      const O = this.cfg.OFFLINE; nowMs = nowMs == null ? this.now() : nowMs; this.badClock = false;
      if (this.lastSim == null || !isFinite(this.lastSim)) { this.lastSim = nowMs; return null; }
      const elapsedS = (nowMs - this.lastSim) / 1000;
      if (!isFinite(elapsedS) || elapsedS < 0) { this.badClock = true; this.lastSim = nowMs; return { ok: false, reason: 'clock', elapsedSeconds: elapsedS }; }        // the clock went backwards (or is not a number): no time is granted
      if (this.speed === 0) { this.lastSim = nowMs; return null; }                                            // paused when the game was closed: no time passes while it is closed
      if (elapsedS < O.minSeconds) { return null; }
      const realH = Math.min(elapsedS / 3600, O.capHours), capped = elapsedS / 3600 > O.capHours, gameH = Math.floor(realH * O.gameDaysPerRealHour * 24 / O.stepHours) * O.stepHours;
      this._cu = { O, nowMs, realH, capped, gameH, left: gameH, before: clone(this.led.life), cash0: this.store.cash, day0: this.dayIdx, alerts0: new Set(this.alerts().map(a => a.key)) };
      return { job: true, total: gameH };
    }
    catchUpStep(budgetMs) {                                                                                 // runs ticks until the time budget is spent; returns the progress 0..1
      const c = this._cu; if (!c) return 1; const t0 = (typeof performance !== 'undefined' ? performance : Date).now(), step = c.O.stepHours;
      while (c.left > 1e-9 && !this.bankrupt) { const h = Math.min(step, c.left); this._tick(h); c.left -= h; if ((typeof performance !== 'undefined' ? performance : Date).now() - t0 >= budgetMs) break; }
      return this.bankrupt || c.left <= 1e-9 ? 1 : 1 - c.left / c.gameH;
    }
    catchUpFinish() {
      const c = this._cu; if (!c) return null; this._cu = null; const { nowMs, realH, capped, gameH, before, cash0, day0 } = c; this.lastSim = nowMs;
      const L = this.led.life, d = (k) => L[k] - before[k], prodD = {}; for (const k of Object.keys(L.produced)) prodD[k] = L.produced[k] - before.produced[k]; const soldD = {}; let soldQ = 0; for (const k of Object.keys(L.sold)) { soldD[k] = L.sold[k] - before.sold[k]; soldQ += soldD[k]; }
      const cost = calc(L, 0).expenses - calc(before, 0).expenses, invs = this.inventory(), cap = invs.reduce((a, v) => a + v.capacity, 0), vol = invs.reduce((a, v) => a + v.volume + (v.water || 0), 0);
      const warn = new Set(this.alerts().filter(a => a.level !== 'info').map(a => a.key)); const profit = calc(L, 0).netProfit - calc(before, 0).netProfit;
      this.away = { ok: true, realHours: realH, capped, gameHours: gameH, gameDays: gameH / 24, produced: prodD, producedCrude: prodD.CRUDE, producedProducts: prodD.GASOLINE + prodD.DIESEL + prodD.JET_FUEL + prodD.GAS, throughput: prodD.THRU, sold: soldQ, soldBy: soldD, soldRevenue: d('revenue'), operatingCost: cost, profit, cashBefore: cash0, cashAfter: this.store.cash, storagePct: cap ? vol / cap * 100 : 0, warnings: warn.size, newDays: this.dayIdx - day0, bankrupt: this.bankrupt };
      return this.away;
    }
    catchUp(nowMs) { const j = this.catchUpStart(nowMs); if (!j) return null; if (!j.job) return j; this.catchUpStep(Infinity); return this.catchUpFinish(); }
    clearAway() { this.away = null; }

    /* ---- save / load (the store and the pipes are saved by the lab as before; this is the company) ---- */
    toJSON() {
      return { v: 2, hours: this.hours, dayIdx: this.dayIdx, acc: this.acc, market: this.market.toJSON(), assets: [...this.assets].map(([id, a]) => [id, a.cost, a.t, a.dep || 0, a.useStart == null ? null : a.useStart]), loans: this.loans, nextLoan: this.nextLoan, closed: this.closed.slice(0, 10), contracts: this.contracts, history: this.history, offers: this.offers, nextContract: this.nextContract,
        recv: this.recv, nextRecv: this.nextRecv, months: this.months, qty: this.qty, qty2: this.qty2, bq: this.bq, explLog: this.explLog, reserve: this.reserve, water: this.water, netOil: this.netOil ? 1 : 0, bprod: this.bprod, tradeLog: this.tradeLog, nextTrade: this.nextTrade, boughtUsed: this.boughtUsed, mats: this.mats, payables: this.payables, nextPay: this.nextPay, purchases: this.purchases, nextPur: this.nextPur, hr: this.hr, cutUntil: this.cutUntil, powerBuy: this.powerBuy, bsStart: this.bsStart, journal: this.journal.toJSON(), crng: this.crng.s, modes: this.modes, tier: this.tier, autoRepair: this.autoRepair, led: this.led, lastMonth: this.lastMonth, days: this.days, dlog: this.dlog, prodHist: this.prodHist, crudeQ: this.crudeQ, fin: this.fin, taxCarry: this.taxCarry, bankrupt: this.bankrupt, speed: this.speed, lastSpeed: this.lastSpeed, calStart: CAL.START, savedAt: this.lastSim };
    }
    fromJSON(d) {
      this._restoreWear = true;
      if (!d || (d.v !== 1 && d.v !== 2)) return false; const c = this.cfg;
      this.hours = d.hours || 0; this.dayIdx = d.dayIdx || 0; this.acc = 0; this.market = new Market(c, d.market); this.assets = new Map((d.assets || []).map(a => [a[0], { cost: a[1], t: a[2], dep: a[3] || 0, useStart: a.length > 4 ? a[4] : a[2] }])); /* saves before Phase 14: in use from the purchase */ this.loans = d.loans || []; this.nextLoan = d.nextLoan || 1; this.closed = d.closed || [];
      this.contracts = d.contracts || []; this.history = d.history || []; this.offers = d.offers || []; this.nextContract = d.nextContract || 1; this.crng = new Rng(d.crng || 1); this.modes = Object.assign(this.modes, d.modes || {}); this.tier = d.tier || 0; this.autoRepair = d.autoRepair !== false;
      this.led = d.led || this.led; for (const k of ['day', 'month', 'year', 'life']) { const L = Object.assign(ledger(0), this.led[k]); L.produced = Object.assign(PZERO(), L.produced); L.sold = Object.assign(SZERO(), L.sold); L.pl = Object.assign(ledger(0).pl, L.pl || {}); L.cf = Object.assign(ledger(0).cf, L.cf || {}); this.led[k] = L; }
      this.lastMonth = d.lastMonth || null; this.days = d.days || []; this.prodHist = d.prodHist || []; this.dlog = d.dlog || []; this.crudeQ = d.crudeQ || 1; this.fin = Object.assign({ state: 'OK', stage: 'NORMAL', negHours: 0, emergencyAt: -1, missed: 0, lateSalary: false, score: 0, indicators: [] }, d.fin || {}); this.taxCarry = d.taxCarry || 0; this.bankrupt = !!d.bankrupt; this.speed = d.speed == null ? 1 : d.speed; this.lastSpeed = d.lastSpeed > 0 ? d.lastSpeed : (this.speed > 0 ? this.speed : 1); this.lastSim = d.savedAt == null ? null : d.savedAt;
      this.recv = (d.recv || []).map(r => Object.assign({ late: false, payOn: r.due }, r)); this.nextRecv = d.nextRecv || 1; this.months = d.months || []; this.mats = Object.assign(MZERO(), d.mats || {}); this.payables = d.payables || []; this.nextPay = d.nextPay || 1; this.purchases = d.purchases || []; this.nextPur = d.nextPur || 1; this.hr = HRZERO(); for (const r of HRROLES) this.hr[r] = Object.assign(this.hr[r], (d.hr || {})[r] || {}); this.cutUntil = d.cutUntil == null ? -1 : d.cutUntil; this.powerBuy = !!d.powerBuy; this.bsStart = d.bsStart || null;
      if (d.journal) { this.journal = Journal.fromJSON(d.journal); this.qty = Object.assign(PZERO(), d.qty || {}); this.qty2 = Object.assign({ BYPRODUCT: 0, RESIDUE: 0 }, d.qty2 || {}); }
      this.water = Object.assign({ v: 1, produced: 0, sold: 0, revenue: 0, log: [], day: -1, today: 0 }, d.water || {}); this.netOil = !!d.netOil; this.reserve = Object.assign({ v: 1, lv: 0, log: [] }, d.reserve || {}); { const z = this.reserveZone(); this.reserve.lv = Math.max(0, Math.min(z ? z.levels.length - 1 : 0, this.reserve.lv | 0)); if (!Array.isArray(this.reserve.log)) this.reserve.log = []; } this._hookReserve();   // an old save has no reserve: it starts closed at level 0, with nothing moved into it
      this.bq = d.bq || 0; this.explLog = d.explLog || []; this.bprod = d.bprod || {}; this.tradeLog = d.tradeLog || []; this.nextTrade = d.nextTrade || 1; this.boughtUsed = d.boughtUsed || 0;
      if (!d.journal) this._migrate();                                                         // a save from before the journal: the company starts from an opening balance sheet of what it holds now
      this.pw = { demand: 0, cap: c.POWER.tiers[this.tier].kw, factor: 1, limited: false }; this.mirror = this.store.cash; if (!this.bsStart) this.bsStart = this._snap(); this.away = null; this.events = []; this.seen = new Set(); this._refreshOffers(); this.computeStaff(); return true;
    }
    _migrate() {
      const j = new Journal(), cash = isFinite(this.store.cash) ? this.store.cash : 0; j.bal.CASH = cash; let fixed = this.pipeValue(), dep = 0;
      for (const b of this.store.list()) { const a = this.assetRec(b); fixed += a.cost; dep -= a.dep; }
      j.bal.FIXED = fixed; j.bal.ACC_DEP = dep; j.bal.LOANS = -this.debt(); let inv = 0;
      for (const p of SELL) { const q = this.available(p), v = q * this.unitPrice(p); j.bal[INVACC[p]] = v; inv += v; this.qty[p] = q; }
      j.bal.EQUITY = -(cash + fixed + dep + inv - this.debt());
      this.journal = j;
    }
  }

  const fmtMoney = n => { if (!isFinite(n)) return '$∞'; const a = Math.abs(n), s = n < 0 ? '-' : '', f = (v, d) => String(+v.toFixed(d)); return a >= 1e9 ? s + '$' + f(a / 1e9, 2) + 'B' : a >= 1e6 ? s + '$' + f(a / 1e6, a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2) + 'M' : a >= 1e3 ? s + '$' + f(a / 1e3, a >= 1e5 ? 0 : 1) + 'K' : s + '$' + Math.round(a); };
  return { Company, Market, Rng, calc, ledger, fmtMoney, payment: Company.payment, SELL, ACC: ACCOUNTS, Journal };
});
