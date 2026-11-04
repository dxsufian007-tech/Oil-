/* Oli - economy.js  (Phase 3: Economy + Market + Selling + Company finance + Inventory + Contracts + Loans + Tax + Offline simulation)
 *
 * A READ-ONLY layer over Phase 2.  It never changes how pipes, pressure or flow behave: it reads the Sim / BuildingStore state, owns the money, and writes only
 * `b.s.ecoEff` (power / condition / crude quality efficiency, default 1 -> identical Phase 2 behaviour) and `b.c` (condition) and `b.st` (DAMAGED when worn out).
 * Time is Game Time in hours.  One simulation tick = 1 game hour (offline: 3 h) and does not depend on FPS: same inputs -> same results.
 *   Revenue only comes from selling a product (spot sale or contract delivery).  Every expense has a cause (operating, maintenance, energy, storage, labor, insurance, admin, infrastructure, fees, interest, tax).
 * No DOM here (economy-ui.js is the screen).  Everything the player can tune is in economy-config.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./buildings.js'), require('./building-config.js'), require('./industry.js'), require('./economy-config.js'), require('./ledger.js'));
  else root.OliEconomy = factory(root.OliBuildings, root.OliBuildingConfig, root.OliIndustry, root.OliEconomyConfig, root.OliLedger);
})(typeof self !== 'undefined' ? self : this, function (B, BC, I, EC, LG) {
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
  const EXPNAMES = ['operating', 'labor', 'maintenance', 'energy', 'storage', 'insurance', 'admin', 'infra', 'fees', 'penalty', 'interest', 'tax', 'depreciation', 'disposal', 'cogs'];
  const ledger = cash0 => { const L = { cash0: cash0 || 0, revenue: 0, spot: 0, contract: 0, other: 0, lifting: 0, chem: 0, operating: 0, capex: 0, principal: 0, loansIn: 0, equityIn: 0, assetSales: 0, produced: PZERO(), sold: SZERO(), soldRev: 0, pl: {}, cf: {} };
    for (const k of EXPNAMES) { L[k] = 0; L.pl[k] = 0; }                             // L[k] = expense booked (or the incurred cost of that kind); pl[k] = the same expense in the profit
    for (const f of ['OP', 'INV', 'FIN']) L.cf[f] = { in: 0, out: 0 };
    return L; };
  const VARK = ['fees', 'cogs'], OPEXK = ['operating', 'labor', 'maintenance', 'energy', 'storage', 'insurance', 'admin', 'infra', 'penalty', 'depreciation', 'disposal'];
  const sumPL = (L, ks) => ks.reduce((a, k) => a + (L.pl[k] || 0), 0);
  function calc(L, cashNow) {                                                       // the formulas of the spec, in one place (profit from the P&L accounts, cash from the cash-flow tags)
    const variable = sumPL(L, VARK), opex = sumPL(L, OPEXK), interest = L.pl.interest, tax = L.pl.tax, gross = L.revenue - variable, net = gross - opex - interest - tax;
    const flows = {}; let cashIn = 0, cashOut = 0; for (const f of ['OP', 'INV', 'FIN']) { const x = L.cf[f]; flows[f] = { in: x.in, out: x.out, net: x.in - x.out }; cashIn += x.in; cashOut += x.out; }
    return { revenue: L.revenue, variable, opex, expenses: variable + opex + interest + tax, grossProfit: gross, netProfit: net, interest, tax, cogs: L.pl.cogs, depreciation: L.pl.depreciation,
      cash: { start: L.cash0, in: cashIn, out: cashOut, end: L.cash0 + cashIn - cashOut, actualEnd: cashNow, flows }, L };
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ------------------------------------------------------------ market */
  class Market {
    constructor(cfg, st) {
      this.cfg = cfg; const M = cfg.MARKET;
      if (st) { Object.assign(this, { hour: st.hour, shared: st.shared, dem: st.dem, regime: st.regime, impact: st.impact, price: st.price, hist: st.hist }); this.rng = new Rng(st.rng); return; }
      this.rng = new Rng(M.seed); this.hour = 0; this.shared = 0; this.dem = {}; this.regime = {}; this.impact = {}; this.price = {}; this.hist = {};
      for (const p of SELL) { this.dem[p] = 0; this.regime[p] = { dir: 0, left: 0 }; this.impact[p] = 0; this.price[p] = cfg.PRICE.base[p]; this.hist[p] = []; }
      for (let i = 0; i < M.warmupHours; i++) this.tick();                          // the graphs have a past on day one (generated by the same model, not stored data)
    }
    /* MarketPrice = BasePrice x DemandFactor x SupplyFactor x Volatility, smoothed, limited to +-dailyChangeLimit against 24 h ago */
    tick() {
      const M = this.cfg.MARKET, rng = this.rng, decay = Math.exp(-Math.LN2 / (M.impactHalfLifeDays * 24)); this.shared += -M.meanRevert * this.shared + M.sharedSigma * rng.gauss();
      for (const p of SELL) {
        const R = this.regime[p]; if (--R.left <= 0) { const u = rng.next(); R.dir = u < 0.33 ? -1 : u < 0.66 ? 0 : 1; R.left = M.regimeHours[0] + Math.floor(rng.next() * (M.regimeHours[1] - M.regimeHours[0])); }
        this.dem[p] += -M.meanRevert * this.dem[p] + M.sigma[p] * rng.gauss() + R.dir * M.regimeDrift; this.impact[p] *= decay;
        const demandF = Math.exp(M.sharedWeight * this.shared + this.dem[p]), supplyF = Math.exp(-M.impact * this.impact[p] / M.depth[p]), volF = 1 + M.noise * rng.gauss(), base = this.cfg.PRICE.base[p];
        let pr = this.price[p] + (base * demandF * supplyF * volF - this.price[p]) * M.smooth; const h = this.hist[p], ref = h.length >= 24 ? h[h.length - 24] : base;
        pr = clamp(pr, ref * (1 - M.dailyChangeLimit), ref * (1 + M.dailyChangeLimit)); const rg = this.cfg.PRICE.range[p]; pr = clamp(pr, rg[0] * M.floorMult, rg[1] * M.ceilMult); pr = r2(pr);
        this.price[p] = pr; h.push(pr); if (h.length > M.historyHours) h.shift();
      }
      this.hour++;
    }
    sold(p, qty) { this.impact[p] += qty; }                                         // the Supply factor: what the player dumps on the market lowers the price for a few days
    change24(p) { const h = this.hist[p], now = this.price[p], ref = h.length > 24 ? h[h.length - 25] : this.cfg.PRICE.base[p]; return now / ref - 1; }
    trend(p) { const c = this.change24(p); return c > this.cfg.MARKET.trendEps ? 'UP' : c < -this.cfg.MARKET.trendEps ? 'DOWN' : 'STABLE'; }
    series(p, hours, points) { const h = this.hist[p], n = Math.min(hours, h.length), a = h.slice(h.length - n); if (!points || a.length <= points) return a; const step = a.length / points, out = []; for (let i = 0; i < points; i++) out.push(a[Math.min(a.length - 1, Math.floor(i * step))]); out.push(a[a.length - 1]); return out; }
    toJSON() { return { rng: this.rng.s, hour: this.hour, shared: this.shared, dem: this.dem, regime: this.regime, impact: this.impact, price: this.price, hist: this.hist }; }
  }

  /* ------------------------------------------------------------ the company (every money / stock movement is a journal entry) */
  const EXPACC = { operating: 'EXP_OPERATING', labor: 'EXP_LABOR', maintenance: 'EXP_MAINT', energy: 'EXP_ENERGY', storage: 'EXP_STORAGE', insurance: 'EXP_INSURANCE', admin: 'EXP_ADMIN', infra: 'EXP_INFRA', fees: 'EXP_FEES', penalty: 'EXP_PENALTY', interest: 'EXP_INTEREST', tax: 'EXP_TAX', depreciation: 'EXP_DEP', disposal: 'EXP_DISPOSAL', cogs: 'COGS' };
  const EXPKEY = {}; for (const k of Object.keys(EXPACC)) EXPKEY[EXPACC[k]] = k;
  const REVKEY = { REV_SPOT: 'spot', REV_CONTRACT: 'contract', REV_OTHER: 'other' };
  const INVACC = { CRUDE: 'INV_CRUDE', GASOLINE: 'INV_GASOLINE', DIESEL: 'INV_DIESEL', JET_FUEL: 'INV_JET_FUEL', GAS: 'INV_GAS' };
  const PRODS = ['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'], CHAIN = { well: 1, pump: 1, separator: 1, valve: 1, junction: 1 }, FLOWS = ['OP', 'INV', 'FIN'], EPS2 = 1e-6;

  class Company {
    constructor(store, net, sim, opts) {
      opts = opts || {}; this.cfg = opts.config || EC; this.store = store; this.net = net; this.sim = sim; this.now = opts.now || (() => Date.now()); this._init(); this._wrap();
    }
    _init() {
      const c = this.cfg; this.hours = 0; this.dayIdx = 0; this.acc = 0; this.market = new Market(c); this.assets = new Map(); this.loans = []; this.nextLoan = 1; this.closed = []; this.contracts = []; this.history = []; this.offers = []; this.nextContract = 1;
      this.recv = []; this.nextRecv = 1; this.months = []; this.qty = PZERO();                                                            // qty = book quantity of each stock pool (its cost is in the journal)
      this.crng = new Rng(c.MARKET.seed ^ 0x5bd1e995); this.modes = {}; for (const p of SELL) this.modes[p] = c.AUTOSELL && c.AUTOSELL.defaultMode || 'SPOT'; this.tier = c.POWER.startTier; this.autoRepair = c.MAINTENANCE.autoRepair;
      const cash = isFinite(this.store.cash) ? this.store.cash : 0;
      this.journal = new Journal(); this.led = { day: ledger(cash), month: ledger(cash), year: ledger(cash), life: ledger(cash) }; this.lastMonth = null; this.days = []; this.prodHist = []; this.crudeQ = 1;
      this.fin = { state: 'OK', stage: 'NORMAL', negHours: 0, emergencyAt: -1, missed: 0, lateSalary: false, score: 0, indicators: [] }; this.taxCarry = 0; this.bankrupt = false; this.pw = { demand: 0, cap: c.POWER.tiers[this.tier].kw, factor: 1, limited: false }; this.staff = { operators: 0, engineers: 0, maintenance: 0, managers: 0, total: 0, payroll: 0 };
      this.speed = 1; this.mirror = this.store.cash; this.lastSim = null; this.away = null; this.events = []; this.seen = new Set(); this.badClock = false;
      this._post({ type: 'OPENING', flow: 'NONE', desc: 'Opening balance', noProj: true }, [['CASH', cash], ['EQUITY', -cash]], { cashApplied: true });
      this._refreshOffers();
    }
    reset() { this._init(); }
    _wrap() {                                                                       // every purchase / demolition goes through the journal (the store and its validation are not changed)
      const st = this.store; if (st.__eco) { st.__eco = this; return; } st.__eco = this; const place = st.place.bind(st), dem = st.demolish.bind(st);
      st.place = (...a) => { const me = st.__eco; me.sync(); const r = place(...a); if (r.ok) { me.assets.set(r.building.id, { cost: r.cost, t: me.hours, dep: 0 }); me._post({ type: 'BUILD', flow: 'INV', desc: DEFS[r.building.d].name }, [['FIXED', r.cost], ['CASH', -r.cost]], { cashApplied: true }); } return r; };
      st.demolish = (...a) => { const me = st.__eco; me.sync(); const rec = me.assets.get(a[0]), r = dem(...a); if (r.ok) { me._dispose(rec, r.refund || 0); me.assets.delete(a[0]); } return r; };
    }

    /* ---- the one door to the journal ---- */
    _post(meta, lines, opts) {
      opts = opts || {}; meta = Object.assign({ t: this.hours, flow: 'NONE' }, meta);
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
      return { cash: b.CASH, receivables: b.AR, inventory: inv, inventoryByProduct: Object.fromEntries(SELL.map(p => [p, b[INVACC[p]]])), wip: b.INV_WIP, fixedCost: b.FIXED, accumulatedDepreciation: b.ACC_DEP, fixedNet,
        totalAssets: bs.assets, payroll: -b.PAY_PAYROLL, tax: -b.PAY_TAX, loans: -b.LOANS, totalLiabilities: bs.liabilities, paidIn: bs.paidIn, result: bs.result, totalEquity: bs.equity, gap: bs.gap };
    }
    inventoryBook() { let v = 0; for (const p of SELL) v += this.journal.bal[INVACC[p]]; return v; }
    unitCost(p) { const q = this.qty[p]; return q > EPS2 ? Math.max(0, this.journal.bal[INVACC[p]]) / q : 0; }

    /* ---- assets: cost in FIXED, depreciation in ACC_DEP; a building is recorded when bought and removed when demolished ---- */
    assetRec(b) { let a = this.assets.get(b.id); if (!a) { const d = DEFS[b.d]; a = { cost: d.type === 'well' ? I.wellProfile(b.x, b.y).cost : d.cost, t: this.hours, dep: 0 }; this.assets.set(b.id, a); } if (a.dep == null) a.dep = 0; return a; }
    bookValue(b) { const a = this.assetRec(b); return Math.max(this.cfg.ASSET.floor * a.cost, a.cost - a.dep); }
    assetValue(b) { const A = this.cfg.ASSET; return this.bookValue(b) * (1 - A.conditionWeight * (1 - b.c)); }     // market / condition value (the book value is in the balance sheet)
    _dispose(rec, refund) {
      const cost = rec ? rec.cost : 0, dep = rec ? rec.dep || 0 : 0, disp = cost - dep - refund, lines = [['CASH', refund], ['ACC_DEP', dep], ['FIXED', -cost]];
      if (disp > 0) lines.push(['EXP_DISPOSAL', disp]); else if (disp < 0) lines.push(['REV_OTHER', disp]);
      this._post({ type: 'DISPOSAL', flow: 'INV', desc: 'Building demolished', inc: { assetSales: refund } }, lines);
    }
    _depreciate() {
      const A = this.cfg.ASSET; for (const b of this.store.list()) { const a = this.assetRec(b), room = a.cost * (1 - A.floor) - a.dep, d = Math.min(room, a.cost * A.depreciationPerYear / this.cfg.TIME.monthsPerYear);
        if (d > 0.005) { a.dep += d; this._post({ type: 'DEPRECIATION', desc: DEFS[b.d].name }, [['EXP_DEP', d], ['ACC_DEP', -d]]); } }
    }
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
    staffKey(def) { const t = def.type; return t === 'well' || t === 'valve' || t === 'junction' || t === 'separator' ? t : t + '_' + def.size; }
    opDay(b, load) { const O = this.cfg.OPERATING; return DEFS[b.d].operatingCost * (O.fixedShare + (1 - O.fixedShare) * load) * (1 + O.conditionPenalty * (1 - b.c)); }     // DailyOperatingCost = Base x Load x Condition
    maintDay(b, load) { const M = this.cfg.MAINTENANCE; return DEFS[b.d].maintenanceCost * (1 + M.damage * Math.pow(1 - b.c, 1.5)) * (M.utilBase + M.utilSlope * load); }   // MaintenanceCost = Base x Damage x Utilization
    wellQuality(b) { const q = this.cfg.QUALITY, u = hash(b.x, b.y, 11); return u < q.share.HIGH ? 'HIGH' : u > 1 - q.share.LOW ? 'LOW' : 'NORMAL'; }
    crudeLabel() { const q = this.cfg.QUALITY; return this.crudeQ >= q.highAt ? 'HIGH' : this.crudeQ <= q.lowAt ? 'LOW' : 'NORMAL'; }
    effOf(b) {                                                                      // written to b.s.ecoEff before every Sim step: power shortage, wear and crude quality
      const t = DEFS[b.d].type, P = this.cfg.POWER; if (t === 'well' && b.s && b.s.started === false) return 0;      // a new well waits for the player's "start production"
      const elec = this.pw.factor >= 1 ? 1 : P.efficiencyFloor + (1 - P.efficiencyFloor) * this.pw.factor;
      const q = t === 'refinery' ? this.cfg.QUALITY.refinery[this.crudeLabel()] : 1, cond = (t === 'refinery' || t === 'separator') ? 1 : 0.8 + 0.2 * b.c;     // refinery / separator already read b.c inside the Sim
      return clamp(elec * q * cond, 0.05, 1.05);
    }

    /* ---- inventory (read from the tanks; the cost is in the journal) ---- */
    tanksOf(p) { return this.store.list().filter(b => b.st !== 'UNDER_CONSTRUCTION' && (DEFS[b.d].type === 'tank' || DEFS[b.d].type === 'gas') && DEFS[b.d].product === p); }   // a DAMAGED tank still holds its oil and its capacity: it is counted too (it only stops accepting)
    physicalVol(p) { let v = 0; for (const b of this.tanksOf(p)) v += this.sim.ensure(b).vol; return v; }                                                                           // everything in the tanks, water included
    available(p) { let v = 0; for (const b of this.tanksOf(p)) { const s = this.sim.ensure(b); v += p === 'CRUDE' ? Math.max(0, s.vol - (s.wat || 0)) : s.vol; } return v; }
    capacity(p) { let v = 0; for (const b of this.tanksOf(p)) v += DEFS[b.d].capacity.value; return v; }
    crudeOnHand() { let v = 0; for (const b of this.tanksOf('CRUDE')) v += this.sim.ensure(b).vol; return v; }
    unitPrice(p) { return this.market.price[p] * (p === 'CRUDE' ? this.crudeQ : 1); }
    inventory() {
      return SELL.map(p => { const vol = this.available(p), cap = this.capacity(p), phys = this.physicalVol(p), price = this.unitPrice(p), book = this.journal.bal[INVACC[p]];
        return { product: p, label: this.cfg.LABEL[p], unit: this.cfg.UNIT[p], volume: vol, water: phys - vol, capacity: cap, fill: cap ? phys / cap : 0, marketPrice: this.market.price[p], unitPrice: price, value: vol * price,
          book, bookQty: this.qty[p], unitCost: this.unitCost(p), storageCostDay: vol * this.cfg.STORAGE_COST[p], mode: this.modes[p], change24: this.market.change24(p), trend: this.market.trend(p), potential: vol * price * (1 - this.cfg.FEES.spot) }; });
    }
    inventoryValue() { let v = 0; for (const p of SELL) v += this.available(p) * this.unitPrice(p); return v; }      // market value
    removeFrom(p, qty) {                                                            // fullest tank first; crude leaves with its water share (the BS&W is not paid for)
      let left = qty; const tanks = this.tanksOf(p).sort((x, y) => this.sim.ensure(y).vol - this.sim.ensure(x).vol);
      for (const b of tanks) { if (left <= 1e-9) break; const s = this.sim.ensure(b), wf = p === 'CRUDE' && s.vol > 0 ? Math.min(0.95, (s.wat || 0) / s.vol) : 0, net = s.vol * (1 - wf), take = Math.min(left, net); if (take <= 0) continue; const tot = take / (1 - wf); s.vol = Math.max(0, s.vol - tot); if (p === 'CRUDE') s.wat = Math.max(0, (s.wat || 0) - tot * wf); left -= take; }
      return qty - left;
    }
    /* the cost of the barrels that leave the stock: cost of goods sold (matching the revenue of the same barrels) */
    _cogs(p, qty) {
      const acc = INVACC[p]; if (!(qty > 0)) return; const unit = this.unitCost(p), cost = Math.min(Math.max(0, this.journal.bal[acc]), qty * unit);
      this.qty[p] = Math.max(0, this.qty[p] - qty); if (cost > 0) this._post({ type: 'COGS', desc: 'Cost of ' + p + ' sold' }, [['COGS', cost], [acc, -cost]]); this._clearPool(p);
    }
    _clearPool(p) { const acc = INVACC[p], left = this.journal.bal[acc]; if (this.qty[p] <= EPS2 && left > 0.01) this._post({ type: 'COGS', desc: 'Stock ' + p + ' empty: remaining cost written off' }, [['COGS', left], [acc, -left]]); }

    /* ---- selling ---- */
    quote(p, qty) {
      const avail = this.available(p), q = clamp(+qty || 0, 0, avail), mp = this.market.price[p], qm = p === 'CRUDE' ? this.crudeQ : 1, unit = mp * qm, gross = q * unit, fee = gross * this.cfg.FEES.spot;
      return { product: p, available: avail, qty: q, marketPrice: mp, quality: qm, unitPrice: unit, gross, fee, net: gross - fee };      // GrossRevenue = Qty x Price ; NetRevenue = Gross - Fees
    }
    sell(p, qty, kind) {
      if (this.bankrupt) return { ok: false, reason: 'bankrupt' }; if (!SELL.includes(p)) return { ok: false, reason: 'product' }; this.sync(); const qt = this.quote(p, qty); if (!(qty > 0) || qt.qty <= 1e-6) return { ok: false, reason: 'nothingToSell' }; if (qty > qt.available + 1e-6) return { ok: false, reason: 'notEnough', quote: qt };
      const got = this.removeFrom(p, qt.qty), gross = got * qt.unitPrice, fee = gross * this.cfg.FEES.spot;
      this._post({ type: 'SALE_SPOT', flow: 'OP', desc: 'Spot sale · ' + p, src: kind || 'SPOT' }, [['CASH', gross], ['REV_SPOT', -gross]]);   // revenue exists only when the product is sold
      this._expense('fees', fee, 'Spot sale fee');
      this._cogs(p, got); this.market.sold(p, got); this._L(L => { L.sold[p] += got; L.soldRev += gross; });
      return { ok: true, product: p, qty: got, gross, fee, net: gross - fee, price: qt.unitPrice, kind: kind || 'SPOT' };
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
      this._cogs(c.product, got); c.delivered += got; this._L(L => { L.sold[c.product] += got; L.soldRev += rev; });
      this.recv.push({ id: this.nextRecv++, amount: rev - fee, due, contract: c.id });
      let reward = 0; if (c.delivered >= c.qty - 1e-6) { c.status = 'DONE'; c.done = this.hours; reward = c.reward; this._post({ type: 'BONUS', flow: 'OP', desc: 'Contract bonus' }, [['CASH', reward], ['REV_CONTRACT', -reward]]); this._finish(c); this._event('info', 'Contract completed: ' + c.product + ' · bonus ' + Math.round(reward)); }
      return { ok: true, qty: got, revenue: rev, fee, reward, done: c.status === 'DONE' };
    }
    _collect() {                                                                    // receivables that fell due are paid
      if (!this.recv.length) return; const due = this.recv.filter(r => r.due <= this.hours); if (!due.length) return; this.recv = this.recv.filter(r => r.due > this.hours);
      for (const r of due) if (r.amount > 0) this._post({ type: 'COLLECT', flow: 'OP', desc: 'Contract #' + r.contract + ' paid' }, [['CASH', r.amount], ['AR', -r.amount]]);
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
    nextPaymentInDays() { const m = this.cfg.TIME.daysPerMonth; return m - (this.hours / 24) % m; }

    /* ---- staff (a headcount per category, never individual workers) ---- */
    computeStaff() {
      const need = { operators: 0, engineers: 0, maintenance: 0, managers: 0 }, c = this.cfg.LABOR;
      for (const b of this.store.list()) { if (b.st !== 'OPERATIONAL') continue; const sk = c.staff[this.staffKey(DEFS[b.d])]; if (sk) for (const k of Object.keys(sk)) need[k] += sk[k]; }
      const crew = Math.ceil(need.operators) + Math.ceil(need.engineers) + Math.ceil(need.maintenance), s = { operators: Math.ceil(need.operators), engineers: Math.ceil(need.engineers), maintenance: Math.ceil(need.maintenance), managers: Math.ceil(need.managers + (crew ? crew / c.perManager : 0)) };
      s.total = s.operators + s.engineers + s.maintenance + s.managers; s.payroll = s.operators * c.salary.operators + s.engineers * c.salary.engineers + s.maintenance * c.salary.maintenance + s.managers * c.salary.managers; this.staff = s; return s;
    }

    /* ---- maintenance / repair: a repair is a period expense when it is paid ---- */
    repairCost(b) { return this.assetRec(b).cost * this.cfg.MAINTENANCE.repairFraction * (1 - b.c); }
    repair(id) { const b = this.store.get(id); if (!b) return { ok: false, reason: 'nothing' }; if (b.st === 'UNDER_CONSTRUCTION') return { ok: false, reason: 'building' }; const cost = this.repairCost(b); if (cost <= 0) return { ok: true, cost: 0 }; this.sync(); if (this.store.cash < cost) return { ok: false, reason: 'cash', need: cost };
      this._expense('maintenance', cost, 'Repair · ' + DEFS[b.d].name); b.c = 1; if (b.st === 'DAMAGED') b.st = 'OPERATIONAL'; return { ok: true, cost }; }
    repairAll(threshold) { let n = 0, tot = 0; for (const b of this.store.list().sort((x, y) => x.c - y.c)) { if (b.st === 'UNDER_CONSTRUCTION' || b.c >= (threshold == null ? 0.999 : threshold)) continue; const cost = this.repairCost(b); if (this.store.cash - cost < 0) break; const r = this.repair(b.id); if (r.ok) { n++; tot += r.cost; } } return { ok: true, n, cost: tot }; }

    /* ---- power ---- */
    gridUpgrade() { const P = this.cfg.POWER; if (this.tier + 1 >= P.tiers.length) return { ok: false, reason: 'max' }; const t = P.tiers[this.tier + 1]; this.sync(); if (this.store.cash < t.connect) return { ok: false, reason: 'cash', need: t.connect }; this._post({ type: 'GRID_CONNECT', flow: 'INV', desc: 'Grid upgrade · ' + t.name }, [['FIXED', t.connect], ['CASH', -t.connect]]); this.tier++; this.pw.cap = t.kw; return { ok: true, tier: t }; }

    /* ---- one simulation tick of h game hours ---- */
    _tick(h) {
      const S = this.sim, st = this.store, C = this.cfg, dt = h / 24, price = C.ENERGY.pricePerKWh; this.sync(); this._collect(); st.tick(h); const items = st.list();
      for (const b of items) { const s = S.ensure(b); s.ecoEff = this.effOf(b); }
      S.step(dt);
      const prod = PZERO(), refOut = { GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 }, crude = { operating: 0, maintenance: 0, energy: 0, lifting: 0 }, refin = { operating: 0, maintenance: 0, energy: 0, chem: 0 };
      let kw = 0, storageCost = 0, tankOpex = 0, tankMaint = 0, powerCost = 0, sepGas = 0;
      for (const b of items) {
        if (b.st !== 'OPERATIONAL') continue; const def = DEFS[b.d], s = b.s, t = def.type, load = this.loadOf(b);
        const k = this.kwOf(b, load), en = k * h * price, op = this.opDay(b, load) * dt, mt = this.maintDay(b, load) * dt; kw += k;
        b.c = clamp(b.c - C.MAINTENANCE.decayPerDay[t] * (C.MAINTENANCE.utilWear + load) * dt, 0, 1); if (b.c <= 0) { b.st = 'DAMAGED'; this._event('crit', def.name + ' #' + b.id + ' broke down'); }
        if (CHAIN[t]) { crude.operating += op; crude.maintenance += mt; crude.energy += en; }                    // wells, pumps, separators: capitalised into crude
        else if (t === 'refinery') { refin.operating += op; refin.maintenance += mt; refin.energy += en; }        // refinery: capitalised into products
        else { tankOpex += op; tankMaint += mt; powerCost += en; }                                                 // tanks / gas storage: period expenses
        if (t === 'well') { const oil = (s._out || 0) * Math.max(0, 1 - (s._wc || 0) - (s._gas || 0)) * dt; prod.CRUDE += oil; crude.lifting += oil * C.VARIABLE.liftingPerBbl; }
        else if (t === 'refinery') { const thr = (s._in || 0) * dt, p = s._p || {}; prod.THRU += thr; refin.chem += thr * C.VARIABLE.chemicalsPerBbl; for (const q of PRODS) { const v = (p[q] || 0) * dt; prod[q] += v; refOut[q] += v; } }
        else if (t === 'separator' && S.edgeOf(b, 'GAS_OUT')) { const g = (s._g || 0) * dt; prod.GAS += g; sepGas += g; }
      }
      for (const b of items) { const def = DEFS[b.d]; if ((def.type === 'tank' || def.type === 'gas') && b.s && b.s.vol > 0) storageCost += b.s.vol * C.STORAGE_COST[def.product] * dt; }
      const tier = C.POWER.tiers[this.tier], target = kw > 0 ? Math.min(1, tier.kw / kw) : 1; this.pw.factor = target >= 1 && this.pw.factor > 0.98 ? 1 : this.pw.factor + (target - this.pw.factor) * 0.5; this.pw.demand = kw; this.pw.cap = tier.kw; this.pw.limited = this.pw.factor < 0.995;

      // ---- production costs: incurred now, carried in inventory, expensed when the barrel is sold
      const crudeCost = crude.operating + crude.maintenance + crude.energy + crude.lifting;
      if (crudeCost > 0) this._post({ type: 'PROD_CRUDE', flow: 'OP', desc: 'Wells · pumps · separators', inc: { operating: crude.operating, maintenance: crude.maintenance, energy: crude.energy, lifting: crude.lifting } }, [['INV_CRUDE', crudeCost], ['CASH', -crudeCost]]);
      const refCost = refin.operating + refin.maintenance + refin.energy + refin.chem;
      if (refCost > 0) this._post({ type: 'PROD_REFINERY', flow: 'OP', desc: 'Refinery operation', inc: { operating: refin.operating, maintenance: refin.maintenance, energy: refin.energy, chem: refin.chem } }, [['INV_WIP', refCost], ['CASH', -refCost]]);
      this._expense('operating', tankOpex, 'Tanks · operation'); this._expense('maintenance', tankMaint, 'Tanks · maintenance'); this._expense('storage', storageCost, 'Oil kept in tanks (per barrel per day)');
      this._expense('energy', powerCost, 'Gas storage · power');
      this.qty.CRUDE += prod.CRUDE;
      // the refinery takes crude out of stock at its average cost
      const consumed = Math.min(prod.THRU, this.qty.CRUDE), crudeBal = Math.max(0, this.journal.bal.INV_CRUDE), uc = this.unitCost('CRUDE');
      if (consumed > 0 && uc > 0) { const amt = Math.min(consumed * uc, crudeBal); if (amt > 0) this._post({ type: 'REFINE_IN', desc: 'Crude to refinery' }, [['INV_WIP', amt], ['INV_CRUDE', -amt]]); }
      this.qty.CRUDE = Math.max(0, this.qty.CRUDE - consumed); this._clearPool('CRUDE');
      // products take the refinery's cost, shared by barrels
      const outQ = PRODS.reduce((a, q) => a + refOut[q], 0), wip = Math.max(0, this.journal.bal.INV_WIP);
      if (outQ > 0) { for (const q of PRODS) { if (refOut[q] <= 0) continue; const amt = wip * refOut[q] / outQ; if (amt > 0.005) this._post({ type: 'REFINE_OUT', desc: 'Products · ' + q }, [[INVACC[q], amt], ['INV_WIP', -amt]]); this.qty[q] += refOut[q]; } }
      if (sepGas > 0) { const amt = Math.min(sepGas * this.unitCost('CRUDE'), Math.max(0, this.journal.bal.INV_CRUDE)); if (amt > 0.005) this._post({ type: 'SEP_GAS', desc: 'Gas from separators' }, [['INV_GAS', amt], ['INV_CRUDE', -amt]]); this.qty.GAS += sepGas; }
      this._L(L => { for (const k of Object.keys(prod)) L.produced[k] += prod[k]; });

      const qNow = this._qNow(items), onHand = this.crudeOnHand(); if (onHand > 0 && prod.CRUDE > 0) { const sh = Math.min(1, prod.CRUDE / onHand); this.crudeQ = this.crudeQ * (1 - sh) + qNow * sh; } else if (onHand <= 0) this.crudeQ = qNow;
      const row = [prod.CRUDE / h, prod.THRU / h, prod.GASOLINE / h, prod.DIESEL / h, prod.JET_FUEL / h, prod.GAS / h].map(v => Math.round(v * 100) / 100); for (let i = 0; i < h; i++) this.prodHist.push(row); while (this.prodHist.length > C.MARKET.historyHours) this.prodHist.shift();
      this.computeStaff();
      const pay = this.staff.payroll * h / (C.TIME.daysPerMonth * C.TIME.hoursPerDay);                             // salaries are earned every hour and paid every 30 days
      if (pay > 0) this._post({ type: 'PAYROLL_EARNED', desc: 'Salaries earned' }, [['EXP_LABOR', pay], ['PAY_PAYROLL', -pay]]);
      for (let i = 0; i < h; i++) this.market.tick();
      this._auto(); this._contractClock(); this._finance(h);
      this.hours += h; while (Math.floor(this.hours / 24) > this.dayIdx) { this.dayIdx++; this._newDay(); }
      this._notify();
    }
    _qNow(items) { let qSum = 0, qW = 0; for (const b of items) if (b.st === 'OPERATIONAL' && DEFS[b.d].type === 'well' && b.s) { const oil = (b.s._out || 0) * Math.max(0, 1 - (b.s._wc || 0) - (b.s._gas || 0)); qSum += oil; qW += oil * this.cfg.QUALITY.mult[this.wellQuality(b)]; } return qSum > 0 ? qW / qSum : this.crudeQ; }
    _auto() {
      const A = this.cfg.AUTOSELL;
      for (const p of SELL) {
        const m = this.modes[p]; if (m === 'SPOT') { const cap = this.capacity(p); if (cap <= 0) continue; const av = this.available(p), phys = this.physicalVol(p), water = phys - av, fill = phys / cap, price = this.market.price[p];
          if (fill >= A.trigger && (price >= this.cfg.PRICE.base[p] * A.minPriceRatio || fill >= A.force)) this.sell(p, av - (A.target * cap - water), 'AUTO'); }
        else if (m === 'CONTRACT') for (const c of this.activeContracts().filter(x => x.product === p).sort((a, b) => a.deadline - b.deadline)) this.deliver(c.id);
      }
    }
    _newDay() {
      // Month-end charges (salaries, running costs, depreciation, loans, tax) belong to the day that ENDS the month: they are booked before that day is closed.
      if (this.dayIdx % this.cfg.TIME.daysPerMonth === 0) this._monthEnd();
      const cash = this.store.cash; this.days.push(Object.assign({ d: this.dayIdx - 1 }, (() => { const c = calc(this.led.day, cash); return { revenue: c.revenue, expenses: c.expenses, profit: c.netProfit, cashIn: c.cash.in, cashOut: c.cash.out, storage: this.led.day.storage, opex: c.opex + c.variable }; })()));
      while (this.days.length > 60) this.days.shift(); this.led.day = ledger(cash);
      if (this.autoRepair) { const M = this.cfg.MAINTENANCE; for (const b of this.store.list()) if (b.st !== 'UNDER_CONSTRUCTION' && b.c < M.autoRepairBelow && this.store.cash - this.repairCost(b) >= M.cashReserve) this.repair(b.id); }
      this._refreshOffers();                                                          // expired offers leave, new ones take their place: there are always 3 to choose from
    }
    _monthEnd() {
      this.fin.lateSalary = false; this.fin.missed = 0;                              // these flags describe the month that is closing
      const C = this.cfg, F = C.FIXED, assets = this.assetsTotal(), pipes = this.pipeValue(), tier = C.POWER.tiers[this.tier];
      // 1. salaries: the expense was booked every hour, the cash leaves now
      const owed = -this.journal.bal.PAY_PAYROLL; if (owed > 0.005) { const before = this.store.cash; this._post({ type: 'PAYROLL_PAID', flow: 'OP', desc: 'Salaries paid' }, [['PAY_PAYROLL', owed], ['CASH', -owed]]); if (before < owed) this.fin.lateSalary = true; }
      // 2. running costs (paid this month)
      this._expense('insurance', assets * F.insurancePerMonth, 'Insurance on assets');
      this._expense('admin', F.adminBase + assets * F.adminPerAsset, 'Administration');
      this._expense('infra', pipes * F.infraPerYear / C.TIME.monthsPerYear, 'Pipeline upkeep');
      this._expense('energy', tier.monthly, 'Power network · ' + tier.name);
      // 3. depreciation (straight line on cost, not below the floor)
      this._depreciate();
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
      const cash = this.store.cash, closed = calc(this.led.month, cash); this.lastMonth = closed; delete this.lastMonth.L.produced; this.led.month = ledger(cash);
      this.months.push({ n: this.months.length + 1, dayIdx: this.dayIdx, revenue: closed.revenue, expenses: closed.expenses, profit: closed.netProfit, cashIn: closed.cash.in, cashOut: closed.cash.out, cashEnd: cash }); while (this.months.length > 24) this.months.shift();
      if (this.dayIdx % (C.TIME.daysPerMonth * C.TIME.monthsPerYear) === 0) this.led.year = ledger(cash);
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
    clock() { const T = this.cfg.TIME, d = Math.floor(this.hours / 24), m = Math.floor(d / T.daysPerMonth), y = Math.floor(m / T.monthsPerYear); return { hours: this.hours, day: d, hour: Math.floor(this.hours % 24), dayOfMonth: d % T.daysPerMonth + 1, month: m % T.monthsPerYear + 1, year: y + 1, text: 'Y' + (y + 1) + ' M' + (m % T.monthsPerYear + 1) + ' D' + (d % T.daysPerMonth + 1) + ' ' + String(Math.floor(this.hours % 24)).padStart(2, '0') + ':00' }; }
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
      for (const c of this.activeContracts()) { const left = (c.deadline - this.hours) / 24; if (left <= A.contractDays) add('contract' + c.id, 'warn', 'CONTRACT DEADLINE', c.product + ' · ' + Math.ceil(left) + ' days · ' + Math.round(c.qty - c.delivered) + ' left'); }
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
      return { cash, assets, debt, inventoryValue: inv, inventoryBook: bs.inventory, value: assets + cash + inv - debt, today: calc(this.led.day, cash), month: calc(this.led.month, cash), year: calc(this.led.year, cash), life: calc(this.led.life, cash), lastMonth: this.lastMonth, months: this.months.slice(), balance: bs, staff: this.staff, power: Object.assign({}, this.pw, { tier: this.tier, tierName: this.cfg.POWER.tiers[this.tier].name }),
        fin: Object.assign({}, this.fin), taxCarry: this.taxCarry, clock: this.clock(), dayNet: this.netPerDay() };
    }
    /* the audit: the journal balances, the balance sheet balances, the cash account is the company's cash, the stock pools agree with the journal */
    audit() {
      this.sync(); const errs = [], j = this.journal.check(); if (!j.ok) errs.push('journal not balanced: ' + j.sum);
      const bs = this.journal.balanceSheet(); if (Math.abs(bs.gap) > 1e-3) errs.push('balance sheet gap: ' + bs.gap);
      if (isFinite(this.store.cash) && Math.abs(this.journal.bal.CASH - this.store.cash) > 1e-3) errs.push('cash differs from the journal: ' + (this.journal.bal.CASH - this.store.cash));
      for (const p of SELL) { if (this.qty[p] <= EPS2 && this.journal.bal[INVACC[p]] > 0.01) errs.push('stock cost without quantity: ' + p); }
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
      if (t === 'well') { const oil = (s._out || 0) * Math.max(0, 1 - (s._wc || 0) - (s._gas || 0)), px = this.market.price.CRUDE * C.QUALITY.mult[this.wellQuality(b)]; o.quality = this.wellQuality(b); o.oilDay = oil; o.revenuePotentialDay = oil * px; o.liftingDay = oil * C.VARIABLE.liftingPerBbl; o.marginDay = o.revenuePotentialDay - o.liftingDay - op - mt - energy - labor; }
      else if (t === 'pump') { o.production = 'Moves ' + Math.round(s._in || 0) + ' bbl/day · +' + Math.round(s.boost * s.eff) + ' psi'; o.productionImpact = s._in || 0; }
      else if (t === 'tank' || t === 'gas') { const p = def.product, vol = s.vol || 0, px = this.unitPrice(p); o.product = p; o.stored = vol; o.storageCostDay = vol * C.STORAGE_COST[p]; o.storedValue = vol * px; }
      else if (t === 'refinery') { const pr = s._p || {}, px = this.market.price, thr = s._in || 0; o.throughputDay = thr; o.productRevenueDay = (pr.GASOLINE || 0) * px.GASOLINE + (pr.DIESEL || 0) * px.DIESEL + (pr.JET_FUEL || 0) * px.JET_FUEL + (pr.GAS || 0) * px.GAS;
        o.crudeOpportunityDay = thr * this.unitPrice('CRUDE'); o.chemicalsDay = thr * C.VARIABLE.chemicalsPerBbl; o.refiningMarginDay = active ? o.productRevenueDay - o.crudeOpportunityDay - energy - labor - mt - op - o.chemicalsDay : 0; }   // RefiningProfit = ProductRevenue - CrudeOpportunityCost - Energy - Labor - Maintenance - Operating
      else if (t === 'separator') { o.feedDay = s._in || 0; }
      o.totalCostDay = op + mt + energy + labor + (o.liftingDay || 0) + (o.storageCostDay || 0) + (o.chemicalsDay || 0);
      return o;
    }
    refiningMargin() { let m = 0, n = 0; for (const b of this.store.list()) if (DEFS[b.d].type === 'refinery' && b.st === 'OPERATIONAL') { m += this.economics(b.id).refiningMarginDay; n++; } return { margin: m, refineries: n }; }

    /* ---- running time ---- */
    advanceHours(n, step) { step = step || 1; let left = n; while (left > 1e-9 && !this.bankrupt) { const h = Math.min(step, left); this._tick(h); left -= h; } }
    run(hours) {                                                                   // the lab calls this with real time x speed; whole hours only, the remainder waits for the next call
      if (this.bankrupt || !(hours > 0)) return 0; this.acc = Math.min(this.acc + hours, this.cfg.TIME.maxCatchUpHours); let n = 0; while (this.acc >= 1 && n < this.cfg.TIME.maxStepsPerTick && !this.bankrupt) { this._tick(1); this.acc -= 1; n++; } return n;
    }

    /* ---- offline simulation ---- */
    stamp(ms) { this.lastSim = ms == null ? this.now() : ms; }
    catchUp(nowMs) {
      const O = this.cfg.OFFLINE; nowMs = nowMs == null ? this.now() : nowMs; this.badClock = false;
      if (this.lastSim == null || !isFinite(this.lastSim)) { this.lastSim = nowMs; return null; }
      const elapsedS = (nowMs - this.lastSim) / 1000;
      if (!isFinite(elapsedS) || elapsedS < 0) { this.badClock = true; this.lastSim = nowMs; return { ok: false, reason: 'clock', elapsedSeconds: elapsedS }; }        // the clock went backwards (or is not a number): no time is granted
      if (elapsedS < O.minSeconds) { return null; }
      const realH = Math.min(elapsedS / 3600, O.capHours), capped = elapsedS / 3600 > O.capHours, gameH = Math.floor(realH * O.gameDaysPerRealHour * 24 / O.stepHours) * O.stepHours;
      const before = clone(this.led.life), cash0 = this.store.cash, day0 = this.dayIdx, alerts0 = new Set(this.alerts().map(a => a.key)); this.advanceHours(gameH, O.stepHours); this.lastSim = nowMs;
      const L = this.led.life, d = (k) => L[k] - before[k], prodD = {}; for (const k of Object.keys(L.produced)) prodD[k] = L.produced[k] - before.produced[k]; const soldD = {}; let soldQ = 0; for (const k of Object.keys(L.sold)) { soldD[k] = L.sold[k] - before.sold[k]; soldQ += soldD[k]; }
      const cost = calc(L, 0).expenses - calc(before, 0).expenses, invs = this.inventory(), cap = invs.reduce((a, v) => a + v.capacity, 0), vol = invs.reduce((a, v) => a + v.volume + (v.water || 0), 0);
      const warn = new Set(this.alerts().filter(a => a.level !== 'info').map(a => a.key)); const profit = calc(L, 0).netProfit - calc(before, 0).netProfit;
      this.away = { ok: true, realHours: realH, capped, gameHours: gameH, gameDays: gameH / 24, produced: prodD, producedCrude: prodD.CRUDE, producedProducts: prodD.GASOLINE + prodD.DIESEL + prodD.JET_FUEL + prodD.GAS, throughput: prodD.THRU, sold: soldQ, soldBy: soldD, soldRevenue: d('revenue'), operatingCost: cost, profit, cashBefore: cash0, cashAfter: this.store.cash, storagePct: cap ? vol / cap * 100 : 0, warnings: warn.size, newDays: this.dayIdx - day0, bankrupt: this.bankrupt };
      return this.away;
    }
    clearAway() { this.away = null; }

    /* ---- save / load (the store and the pipes are saved by the lab as before; this is the company) ---- */
    toJSON() {
      return { v: 2, hours: this.hours, dayIdx: this.dayIdx, acc: this.acc, market: this.market.toJSON(), assets: [...this.assets].map(([id, a]) => [id, a.cost, a.t, a.dep || 0]), loans: this.loans, nextLoan: this.nextLoan, closed: this.closed.slice(0, 10), contracts: this.contracts, history: this.history, offers: this.offers, nextContract: this.nextContract,
        recv: this.recv, nextRecv: this.nextRecv, months: this.months, qty: this.qty, journal: this.journal.toJSON(), crng: this.crng.s, modes: this.modes, tier: this.tier, autoRepair: this.autoRepair, led: this.led, lastMonth: this.lastMonth, days: this.days, prodHist: this.prodHist, crudeQ: this.crudeQ, fin: this.fin, taxCarry: this.taxCarry, bankrupt: this.bankrupt, speed: this.speed, savedAt: this.lastSim };
    }
    fromJSON(d) {
      if (!d || (d.v !== 1 && d.v !== 2)) return false; const c = this.cfg;
      this.hours = d.hours || 0; this.dayIdx = d.dayIdx || 0; this.acc = 0; this.market = new Market(c, d.market); this.assets = new Map((d.assets || []).map(a => [a[0], { cost: a[1], t: a[2], dep: a[3] || 0 }])); this.loans = d.loans || []; this.nextLoan = d.nextLoan || 1; this.closed = d.closed || [];
      this.contracts = d.contracts || []; this.history = d.history || []; this.offers = d.offers || []; this.nextContract = d.nextContract || 1; this.crng = new Rng(d.crng || 1); this.modes = Object.assign(this.modes, d.modes || {}); this.tier = d.tier || 0; this.autoRepair = d.autoRepair !== false;
      this.led = d.led || this.led; for (const k of ['day', 'month', 'year', 'life']) { const L = Object.assign(ledger(0), this.led[k]); L.produced = Object.assign(PZERO(), L.produced); L.sold = Object.assign(SZERO(), L.sold); L.pl = Object.assign(ledger(0).pl, L.pl || {}); L.cf = Object.assign(ledger(0).cf, L.cf || {}); this.led[k] = L; }
      this.lastMonth = d.lastMonth || null; this.days = d.days || []; this.prodHist = d.prodHist || []; this.crudeQ = d.crudeQ || 1; this.fin = Object.assign({ state: 'OK', stage: 'NORMAL', negHours: 0, emergencyAt: -1, missed: 0, lateSalary: false, score: 0, indicators: [] }, d.fin || {}); this.taxCarry = d.taxCarry || 0; this.bankrupt = !!d.bankrupt; this.speed = d.speed == null ? 1 : d.speed; this.lastSim = d.savedAt == null ? null : d.savedAt;
      this.recv = d.recv || []; this.nextRecv = d.nextRecv || 1; this.months = d.months || [];
      if (d.journal) { this.journal = Journal.fromJSON(d.journal); this.qty = Object.assign(PZERO(), d.qty || {}); }
      else this._migrate();                                                         // a save from before the journal: the company starts from an opening balance sheet of what it holds now
      this.pw = { demand: 0, cap: c.POWER.tiers[this.tier].kw, factor: 1, limited: false }; this.mirror = this.store.cash; this.away = null; this.events = []; this.seen = new Set(); this._refreshOffers(); this.computeStaff(); return true;
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
