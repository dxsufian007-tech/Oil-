/* Oli - market-analytics.js : S4 analytics. Pure functions: no DOM, no clock, never writes to the market.
 *  - candles(rows, frame)   D / W / M / Y candles from ONE daily source (the same function the game chart uses), so the periods always agree
 *  - sma / trend            moving averages and a trend reading from the candles
 *  - reasons(engine)        why the price is where it is: stock, balance, news, market state, risk  (read from the engine's own drivers)
 *  - forecast(engine, ...)  7 / 30 / 90-day price RANGE + direction + uncertainty, from N simulated futures of a COPY of the engine (a different random stream). It is an estimate:
 *                           the copy is thrown away, so a forecast never changes the real market or the price.
 *  - history: the real Brent series lives in brent-history.js and is kept apart from the simulation (see seriesOf). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./oil-engine.js'), require('./news-data.js'));
  else root.OliMarketAnalytics = factory(root.OliOilEngine, root.OliNews);
})(typeof self !== 'undefined' ? self : this, function (OE, NEWS) {
  'use strict';
  const candles = (rows, frame) => OE.groupOHLC(rows || [], frame || 'D');
  const sma = (cs, n) => cs.map((_, i) => i + 1 < n ? null : cs.slice(i + 1 - n, i + 1).reduce((a, c) => a + c.c, 0) / n);
  function trend(cs) {
    if (!cs || cs.length < 12) return { dir: 'NA', strength: 0, fast: null, slow: null, slope: 0 };
    const nf = Math.min(10, Math.max(3, cs.length >> 2)), ns = Math.min(30, Math.max(nf + 2, cs.length >> 1)), f = sma(cs, nf), s = sma(cs, ns), fl = f[f.length - 1], sl = s[s.length - 1], k = Math.min(10, cs.length - 1), slope = (cs[cs.length - 1].c / cs[cs.length - 1 - k].c - 1) / k;
    const gap = sl ? fl / sl - 1 : 0, dir = gap > 0.01 && slope > 0 ? 'UP' : gap < -0.01 && slope < 0 ? 'DOWN' : 'SIDE'; return { dir, strength: Math.min(1, Math.abs(gap) * 10), fast: fl, slow: sl, nFast: nf, nSlow: ns, slope };
  }
  /* reasons: each item { kind, dir: UP|DOWN|FLAT, text } built from engine.view() - nothing typed in */
  function reasons(e) {
    const v = e.view(), d = v.drivers || {}, out = [], th = 0.004, I = v.ind || e.indicators();
    const add = (kind, val, up, down, flat) => out.push({ kind, dir: val > th ? 'UP' : val < -th ? 'DOWN' : 'FLAT', value: val, text: val > th ? up : val < -th ? down : flat });
    add('stock', d.inv, 'المخزون التجاري أقل من المعتاد (' + (v.cover * 100).toFixed(0) + '% من المعتاد) فيرفع السعر', 'المخزون التجاري أعلى من المعتاد (' + (v.cover * 100).toFixed(0) + '% من المعتاد) فيضغط على السعر', 'المخزون التجاري قريب من المعتاد');
    add('balance', -d.gap, 'عجز في ميزان العرض والطلب (' + Math.abs(I.balance).toFixed(1) + ' مليون برميل/يوم)', 'فائض في ميزان العرض والطلب (' + Math.abs(I.balance).toFixed(1) + ' مليون برميل/يوم)', 'ميزان العرض والطلب متوازن تقريباً');
    add('news', d.news, 'أخبار وأحداث ترفع علاوة المخاطر', 'أخبار وأحداث تخفض علاوة المخاطر', 'لا أحداث مؤثرة الآن');
    add('regime', d.regime, 'حالة السوق (' + v.regimeAr + ') تدفع الأسعار للأعلى', 'حالة السوق (' + v.regimeAr + ') تدفع الأسعار للأدنى', 'حالة السوق: ' + v.regimeAr);
    const risk = e.P ? (v.regime === 'OIL_CRISIS' || v.regime === 'VOLATILE' ? 'HIGH' : v.regime === 'STABLE' ? 'LOW' : 'MEDIUM') : 'MEDIUM';
    return { items: out, risk, riskAr: { HIGH: 'مرتفع', MEDIUM: 'متوسط', LOW: 'منخفض' }[risk], supply: v.levels.supply, demand: v.levels.demand, stock: v.levels.stock, active: v.active.map(a => ({ id: a.id, text: a.text, dir: a.dir, left: a.left, regions: a.regions })), target: d.target, price: e.price() };
  }
  const month = d => Math.floor(((d % 365) + 365) % 365 / 30.42) + 1;
  function Rng(s) { this.s = s >>> 0 || 1; this.next = () => { let t = this.s += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; this.gauss = () => { let u = 0, v = 0; while (!u) u = this.next(); while (!v) v = this.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }; }
  /* forecast: copies the engine's saved state, plays it forward `paths` times with its own random streams, and reports for each horizon the price range (p10 / p50 / p90), the direction and the uncertainty */
  function forecast(e, opts) {
    opts = opts || {}; const H = opts.horizons || [7, 30, 90], N = opts.paths || 48, seed = opts.seed == null ? (e.lastDay * 2654435761 >>> 0) : opts.seed, snap = JSON.parse(JSON.stringify(e.toJSON())), maxH = Math.max.apply(null, H), now = e.price(), res = {};
    const cols = H.map(() => []); for (let k = 0; k < N; k++) { const c = new OE.OilEngine(Object.assign({}, e.P), new Rng(seed + k * 7919), null); c.load(JSON.parse(JSON.stringify(snap))); c.rng = new Rng(seed + k * 7919); c.ownAtProd = false;
      for (let d = 1; d <= maxH; d++) { const day = e.lastDay + d; c.dayStep(day, month(day), 'forecast'); const i = H.indexOf(d); if (i >= 0) cols[i].push(c.price()); } }
    H.forEach((h, i) => { const a = cols[i].sort((x, y) => x - y), q = p => a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))], lo = q(0.1), mid = q(0.5), hi = q(0.9), w = (hi - lo) / now, ch = mid / now - 1;
      res[h] = { days: h, low: lo, mid, high: hi, change: ch, dir: ch > 0.015 ? 'UP' : ch < -0.015 ? 'DOWN' : 'SIDE', width: w, uncertainty: w > 0.4 ? 'HIGH' : w > 0.15 ? 'MEDIUM' : 'LOW', paths: N }; });
    return { now, horizons: H, byDays: res, note: 'توقعات تقديرية من محاكاة نسخة من السوق، ولا تؤثر في السعر الفعلي' };
  }
  /* the two kinds of series are never mixed: 'REAL' = brent-history.js, 'SIM' = the game's own daily candles */
  function seriesOf(kind, co, H) { if (kind === 'REAL') return { kind, label: 'تاريخ فعلي (EIA)', rows: H ? H.daily() : [], meta: H ? H.META : null }; return { kind: 'SIM', label: 'محاكاة اللعبة', rows: co && co.market && co.market.gc ? co.market.gc.CRUDE || [] : [], meta: null }; }
  return { candles, sma, trend, reasons, forecast, seriesOf };
});
