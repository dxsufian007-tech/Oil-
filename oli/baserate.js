/* Oli - baserate.js  (Banking Phase 2: the Base Rate engine; owner-approved design, Nov 2026)
 * A daily EMA of the crude price + a quarterly review.  Three indicators, each clamp(-1, +1), positive = pressure to raise the rate:
 *   zp = (EMA360 price / 72 - 1) / 0.20     (inflation proxy; a low stock cover in OilEngine already makes the price dearer, so low cover = pressure up)
 *   zl = (0.75 - lambda) / 0.25             (lambda = lendable money of the three banks / their deposits)
 *   za = engine.indus / 0.03                (industrial activity of the market engine)
 * S0 = .40 zp + .25 zl + .35 za ; S = .5 S_prev + .5 S0 ; R* = clamp(4% + 4% S) ; gap = R* - R ; raw = clamp(4% + 4% S0) - R.
 * The rate moves 0.50% only when: |gap| and |raw| reach the threshold (0.50% same direction as the last real change, 0.75% against it), the raw gap had the same sign (>= 0.50%)
 * in the previous review, and a reversal comes at least 2 reviews after the last change.  Bank liquidity surcharge tiers: see nextTier.
 * Deterministic (no random, no clock): everything comes from the saved state.  No DOM, no company access.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OliBaseRate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, r6 = x => Math.round(x * 1e6) / 1e6, sign = x => x > 0 ? 1 : x < 0 ? -1 : 0;

  /* the liquidity surcharge tier of a bank: tiers = cfg.surcharge (index 0 = tier 1).  Enter a tier when ratio < enterBelow, leave it only when ratio >= exitAt (hysteresis). */
  function nextTier(cur, ratio, tiers) {
    let target = 0; for (let i = 0; i < tiers.length; i++) if (ratio < tiers[i].enterBelow) target = i + 1;
    if (target >= cur) return target;
    let t = cur; while (t > target && ratio >= tiers[t - 1].exitAt) t--; return t;
  }

  class BaseRate {
    constructor(cfg, key) {
      this.cfg = cfg; const R = cfg.BASE_RATE;
      this.rate = R.start; this.mode = R.mode || 'AUTO'; this.fixed = null; this.ema = R.priceRef; this.emaDay = -1; this.S = null; this.prevRaw = null;
      this.lastDir = 0; this.lastN = 0; this.n = 0; this.lastKey = key == null ? -1 : key; this.hist = []; this.tiers = {};
      for (const id of Object.keys(cfg.BANKS.banks)) this.tiers[id] = 0;
    }
    get R() { return this.cfg.BASE_RATE; }
    surcharge(id) { const t = this.tiers[id] | 0; return t ? this.R.surcharge[t - 1].add : 0; }
    /* once a day: the price EMA (a day already done is ignored) */
    daily(day, price) {
      day |= 0; if (day <= this.emaDay || !(price > 0)) return false;
      this.ema += 2 / (this.R.priceEma + 1) * (price - this.ema); this.emaDay = day; return true;
    }
    /* ind = { lam, indus, ratios: { bankId: lendableNow / lendableAtOpening } }.  Returns the review row, or null if this quarter was already reviewed. */
    review(key, day, ind) {
      if (key <= this.lastKey) return null; this.lastKey = key; this.n++;
      const R = this.R, zp = clamp((this.ema / R.priceRef - 1) / R.priceBand, -1, 1), zl = clamp((R.liqTarget - ind.lam) / R.liqBand, -1, 1), za = clamp((ind.indus || 0) / R.actBand, -1, 1);
      const S0 = R.wP * zp + R.wL * zl + R.wA * za, S = this.S == null ? S0 : R.smooth * this.S + (1 - R.smooth) * S0;
      const target = clamp(R.start + R.slope * S, R.min, R.max), gap = target - this.rate, rawT = clamp(R.start + R.slope * S0, R.min, R.max), raw = rawT - this.rate;
      const rev = this.lastDir !== 0 && sign(gap) === -this.lastDir, need = rev ? R.deadRev : R.dead, coolOK = !rev || (this.n - this.lastN) >= R.cool, sg = sign(gap);
      const confirmed = sg !== 0 && sign(raw) === sg && Math.abs(raw) >= need - 1e-12 && this.prevRaw === sg && coolOK;
      let step = 0;
      if (this.mode === 'AUTO' && confirmed && Math.abs(gap) >= need - 1e-12) step = clamp(Math.round(gap / R.tick) * R.tick, -R.step, R.step);
      if (Math.abs(step) < 1e-12) step = 0;
      if (this.mode === 'AUTO') {                                                    // a manual (FIXED) rate leaves the decision state untouched
        this.rate = r6(clamp(this.rate + step, R.min, R.max)); this.S = S; this.prevRaw = Math.abs(raw) >= R.dead - 1e-12 ? sign(raw) : 0;
        if (step) { this.lastDir = sign(step); this.lastN = this.n; }
      }
      for (const id of Object.keys(this.tiers)) if (ind.ratios && ind.ratios[id] != null) this.tiers[id] = nextTier(this.tiers[id], ind.ratios[id], R.surcharge);
      const row = { n: this.n, key, day, mode: this.mode, ema: r6(this.ema), lam: r6(ind.lam), indus: ind.indus || 0, zp: r6(zp), zl: r6(zl), za: r6(za), S0: r6(S0), S: r6(S), target: r6(target), gap: r6(gap), raw: r6(raw),
        rev, confirmed, step: r6(step), rate: this.rate, tiers: Object.assign({}, this.tiers) };
      this.hist.push(row); return row;
    }
    /* manual control: FIXED holds a chosen rate (min..max); AUTO hands the rate back to the reviews, continuing from the present rate */
    setMode(mode, rate) {
      const R = this.R;
      if (mode === 'FIXED') { if (!(rate >= R.min && rate <= R.max)) return { ok: false, reason: 'RATE' }; this.mode = 'FIXED'; this.fixed = rate; this.rate = rate; }
      else if (mode === 'AUTO') { this.mode = 'AUTO'; this.fixed = null; }
      else return { ok: false, reason: 'MODE' };
      this.hist.push({ type: 'MODE', n: this.n, mode: this.mode, rate: this.rate }); return { ok: true };
    }
    toJSON() { return { rate: this.rate, mode: this.mode, fixed: this.fixed, ema: this.ema, emaDay: this.emaDay, S: this.S, prevRaw: this.prevRaw, lastDir: this.lastDir, lastN: this.lastN, n: this.n, lastKey: this.lastKey, hist: this.hist, tiers: this.tiers }; }
    static fromJSON(d, cfg, key) {
      const b = new BaseRate(cfg, key); if (!d) return b;
      for (const k of ['rate', 'mode', 'fixed', 'ema', 'emaDay', 'S', 'prevRaw', 'lastDir', 'lastN', 'n', 'lastKey']) if (d[k] !== undefined) b[k] = d[k];
      b.hist = Array.isArray(d.hist) ? d.hist : []; b.tiers = Object.assign(b.tiers, d.tiers || {}); return b;
    }
  }
  return { BaseRate, nextTier };
});
