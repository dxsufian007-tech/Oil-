/* Oli - bonds.js  (Banking Phase 5: the bond market)
 * Government, corporate and high-yield bonds of other issuers that the company can BUY and SELL, and the company's OWN bonds that it can ISSUE.
 * Price = present value of the coupons and the face at  y = base rate + term premium + credit spread(issuer score)  (the yield curve plus the rating), clean price + accrued interest = the full price paid.
 * Issuers' scores drift every month (reversion to their own level, the Base Rate and a deterministic noise); an issuer can DEFAULT (probability from its score, from a saved deterministic generator):
 * its bonds stop paying, the holder's position is written down to the recovery value at once and the recovery is paid some months later.
 * Independent accounting: its own permanent record (tx), positions, issued bonds and totals; the company books are posted through an io object (BOND_INV, BOND_DEBT, REV_OTHER, EXP_INTEREST, EXP_DISPOSAL, ACCRUED_INT, CASH).
 * No DOM, no Math.random, no real clock: everything comes from the saved state.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./economy-config.js'), require('./game-calendar.js'));
  else root.OliBonds = factory(root.OliEconomyConfig, root.OliCalendar);
})(typeof self !== 'undefined' ? self : this, function (EC, CAL) {
  'use strict';
  const r2 = x => Math.round(x * 100) / 100, r6 = x => Math.round(x * 1e6) / 1e6, clamp = (v, a, b) => v < a ? a : v > b ? b : v, EPS = 1e-6;
  const TX = { ISSUE: 1, COUPON_OUT: 2, COUPON_ARREARS: 3, ARREARS_PAID: 4, MATURE_OUT: 5, BUY: 6, SELL: 7, COUPON_IN: 8, MATURE_IN: 9, ISSUER_DEFAULT: 10, IMPAIR: 11, RECOVERY: 12, RELIST: 13 };
  const miOf = day => { const d = CAL.dateOfDay(day | 0); return d.year * 12 + d.month - 1; };
  const nowM = day => { const d = CAL.dateOfDay(day | 0); return d.year * 12 + d.month - 1 + (d.day - 1) / d.daysInMonth; };
  const roundCoupon = (y, step) => Math.max(step, Math.round(y / step) * step);

  /* ---- pure pricing ---- */
  function termPremium(years, C) { return C.termMax * (1 - Math.exp(-Math.max(0, years) / C.termTau)); }
  function spreadOf(score, C) { const q = clamp((1000 - score) / 1000, 0, 1); return C.spreadBase + C.spreadK * q * q; }
  /* the yield an issuer of this score pays for a bond with this many years left (gov = no credit spread) */
  function yieldOf(base, years, score, gov, C) { return base + termPremium(years, C) + (gov ? 0 : spreadOf(score, C)); }
  /* b = { coupon, startMi, term } ; t = now in months (fractional).  Returns { clean, dirty, accrued, ytm, left } per 1 unit of face (= 1.0) */
  function price(b, t, y) {
    const left = b.startMi + b.term - t; if (left <= 0) return { clean: 1, dirty: 1, accrued: 0, ytm: y, left: 0 };
    const c = b.coupon / 2, per = 6, el = (t - b.startMi) % per, toNext = el === 0 && t > b.startMi ? per : per - el, accrued = c * (per - toNext) / per, m = 1 + y / 2; let pv = 0;
    for (let k = toNext; k < left - 1e-9; k += per) pv += c * Math.pow(m, -k / per);
    pv += (1 + c) * Math.pow(m, -left / per);                                                   // the last coupon falls with the face
    const dirty = pv; return { clean: dirty - accrued, dirty, accrued, ytm: y, left };
  }

  class Rng { constructor(s) { this.s = (s | 0) || 1; } next() { let x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.s = x | 0; return (x >>> 0) / 4294967296; } }

  class BondMarket {
    constructor(cfg, day) {
      this.cfg = cfg || EC; const C = this.cfg.BONDS; this.rng = new Rng(C.seed); this.tx = []; this.nextTx = 1; this.nextBond = 1; this.nextIssued = 1; this.lastMi = miOf(day | 0) - 1;
      this.issuers = {}; this.bonds = []; this.pos = []; this.issued = []; this.acct = { bought: 0, sold: 0, couponsIn: 0, couponsOut: 0, issuedFace: 0, repaid: 0, impaired: 0, recovered: 0, gain: 0 };
      let k = 0; for (const s of C.issuers) { this.issuers[s.id] = { id: s.id, name: s.name, cls: s.cls, base: s.score, score: s.score, status: 'ACTIVE', defMi: null, rec: s.cls === 'GOV' ? 1 : C.recovery[s.cls] }; for (const term of s.terms) this._list(s.id, term, miOf(day | 0) - (k++ % 6), 0.04); }
    }
    get C() { return this.cfg.BONDS; }
    _tx(code, ref, a, b, day) { this.tx.push([this.nextTx++, day | 0, TX[code], ref | 0, a == null ? 0 : a, b == null ? 0 : b]); }
    /* a new listed bond of an issuer; the coupon is the par yield for its term and rating at this base rate */
    _list(issuer, term, startMi, base) {
      const I = this.issuers[issuer], y = yieldOf(base, term / 12, I.score, I.cls === 'GOV', this.C), b = { id: this.nextBond++, issuer, coupon: roundCoupon(y, this.C.couponStep), startMi, term, status: 'LISTED', def: false }; this.bonds.push(b); return b;
    }
    bond(id) { return this.bonds.find(b => b.id === id) || null; }
    listed() { return this.bonds.filter(b => b.status === 'LISTED' && this.issuers[b.issuer].status === 'ACTIVE'); }
    /* quote of a listed bond now: mid price per unit of face and the bid / ask the company trades at */
    quote(b, day, base) {
      const I = this.issuers[b.issuer], t = nowM(day), y = yieldOf(base, (b.startMi + b.term - t) / 12, I.score, I.cls === 'GOV', this.C), p = price(b, t, y), sp = this.C.bidAsk[I.cls];
      return { bond: b.id, issuer: b.issuer, cls: I.cls, score: I.score, coupon: b.coupon, years: p.left / 12, ytm: y, clean: p.clean, accrued: p.accrued, mid: p.dirty, bid: p.dirty * (1 - sp), ask: p.dirty * (1 + sp) };
    }
    holding(id) { return this.pos.find(p => p.bond === id) || null; }
    invested() { let v = 0; for (const p of this.pos) v += p.carry; return r2(v); }
    debt() { let v = 0; for (const b of this.issued) if (b.status !== 'CLOSED') v += b.face - (b.repaidFace || 0); return r2(v); }
    dueWithinYear() { let v = 0; for (const b of this.issued) { if (b.status === 'CLOSED') continue; if (b.status === 'ACTIVE') { v += b.face * b.coupon; const left = b.startMi + b.term - this.lastMi; if (left <= 12) v += b.face; } for (const a of b.arrears) v += a.amt; } return r2(v); }
    arrearsTotal() { let v = 0; for (const b of this.issued) for (const a of b.arrears) v += a.amt; return r2(v); }
    lateCount(from) { let n = 0; for (let i = this.tx.length - 1; i >= 0; i--) { const t = this.tx[i]; if (t[1] < from) break; if (t[2] === TX.COUPON_ARREARS) n++; } return n; }
    onTimeCount(from) { let n = 0; for (let i = this.tx.length - 1; i >= 0; i--) { const t = this.tx[i]; if (t[1] < from) break; if (t[2] === TX.COUPON_OUT) n++; } return n; }

    /* ---- buy / sell (the market is the counterparty; it always trades at the bid / ask) ---- */
    buy(id, units, day, base, io) {
      const b = this.bond(id), C = this.C; if (!b || b.status !== 'LISTED') return { ok: false, reason: 'noBond' }; if (this.issuers[b.issuer].status !== 'ACTIVE') return { ok: false, reason: 'DEFAULTED' };
      units = Math.floor(units); if (!(units >= 1)) return { ok: false, reason: 'units' }; const q = this.quote(b, day, base), cost = r2(units * C.unitFace * q.ask);
      if (cost < C.minTrade) return { ok: false, reason: 'MIN_TRADE' }; if (io.cash() < cost - 1e-6) return { ok: false, reason: 'cash', need: cost };
      io.invest(cost, 'Bond ' + b.issuer + ' #' + b.id); let p = this.holding(id); if (!p) { p = { bond: id, units: 0, carry: 0, acc0: 0, rec: null }; this.pos.push(p); }
      p.units += units; p.carry = r2(p.carry + cost); p.acc0 = r2(p.acc0 + units * C.unitFace * q.accrued); this.acct.bought = r2(this.acct.bought + cost); this._tx('BUY', id, units, cost, day);
      return { ok: true, units, cost, price: q.ask, accrued: q.accrued };
    }
    sell(id, units, day, base, io) {
      const p = this.holding(id), b = this.bond(id), C = this.C; if (!p || !b) return { ok: false, reason: 'noHolding' }; if (p.rec != null) return { ok: false, reason: 'DEFAULTED' };
      units = units == null ? p.units : Math.floor(units); if (!(units >= 1) || units > p.units) return { ok: false, reason: 'units' };
      const q = this.quote(b, day, base), proceeds = r2(units * C.unitFace * q.bid), share = units / p.units, carry = r2(p.carry * share), a0 = r2(p.acc0 * share), gain = r2(proceeds - carry);
      io.divest(proceeds, carry, 'Bond ' + b.issuer + ' #' + b.id); p.units -= units; p.carry = r2(p.carry - carry); p.acc0 = r2(p.acc0 - a0); if (p.units === 0) { this.pos.splice(this.pos.indexOf(p), 1); }
      this.acct.sold = r2(this.acct.sold + proceeds); this.acct.gain = r2(this.acct.gain + gain); this._tx('SELL', id, units, proceeds, day); return { ok: true, units, proceeds, gain, price: q.bid };
    }

    /* ---- the company's own bonds ---- */
    issueQuote(term, amount, score, base, ctx) {
      const C = this.C; if (!(term >= C.minTerm && term <= C.maxTerm) || term % 6 !== 0) return { ok: false, reason: 'TERM' };
      if (!(amount >= C.minIssue)) return { ok: false, reason: 'AMOUNT_MIN' }; if (amount > C.maxIssue) return { ok: false, reason: 'AMOUNT_MAX' };
      if (score == null || score < C.minScore) return { ok: false, reason: 'RATING' }; if (ctx && ctx.restricted) return { ok: false, reason: 'RESTRICTED' };
      if (ctx && (ctx.riskDebt + amount) > this.cfg.BANK_LOANS.maxDebtRatio * Math.max(0, ctx.riskBase) + 1e-6) return { ok: false, reason: 'RISK' };
      const y = yieldOf(base, term / 12, score, false, C) + C.issuePremium, coupon = roundCoupon(y, C.couponStep), fee = r2(amount * C.issueFee); return { ok: true, coupon, fee, net: r2(amount - fee) };
    }
    issue(term, amount, score, base, day, ctx, io, purpose) {
      const q = this.issueQuote(term, amount, score, base, ctx); if (!q.ok) return q;
      const b = { id: this.nextIssued++, face: r2(amount), coupon: q.coupon, startMi: miOf(day), term, status: 'ACTIVE', arrears: [], repaidFace: 0, paidCoupons: 0, day: day | 0, purpose: purpose || '' };
      this.issued.push(b); io.issue(b.face, q.fee, 'Own bond #' + b.id); this.acct.issuedFace = r2(this.acct.issuedFace + b.face); this._tx('ISSUE', b.id, b.face, b.coupon, day); return { ok: true, bond: b, coupon: b.coupon, fee: q.fee };
    }

    /* ---- the monthly cycle (Company, after the loans; a month already done is ignored) ---- */
    monthly(day, base, io) {
      const mi = miOf(day), C = this.C; if (mi <= this.lastMi) return 0; this.lastMi = mi; let n = 0;
      // 1. issuers: the score drifts, a default may happen, a defaulted issuer may be relisted
      for (const id of Object.keys(this.issuers)) {
        const I = this.issuers[id]; if (I.cls === 'GOV') continue;
        if (I.status === 'DEFAULTED') { if (mi - I.defMi >= C.relistMonths) { I.status = 'ACTIVE'; I.score = Math.round(I.base * C.relistScore); I.defMi = null; this._tx('RELIST', 0, I.score, 0, day); for (const s of this.cfg.BONDS.issuers) if (s.id === id) for (const term of s.terms) this._list(id, term, mi, base); } continue; }
        const u = this.rng.next() + this.rng.next() + this.rng.next() - 1.5, tgt = I.base - C.rateSens * (base - 0.04), d = C.revert * (tgt - I.score) + C.noise * u * 2;
        I.score = Math.round(clamp(I.score + d, C.scoreMin, 1000)); const pd = C.pdK * Math.exp((1000 - I.score) / C.pdScale), x = this.rng.next();
        if (x < pd) this._default(id, mi, day, io);
      }
      // 2. holdings: coupons, maturity, recovery
      for (const p of this.pos.slice()) {
        const b = this.bond(p.bond), I = this.issuers[b.issuer]; n++;
        if (p.rec != null) { if (mi >= p.rec.mi) { const cash = p.rec.cash; io.recover(cash, p.carry, 'Recovery · ' + b.issuer); this.acct.recovered = r2(this.acct.recovered + cash); this._tx('RECOVERY', b.id, p.units, cash, day); this.pos.splice(this.pos.indexOf(p), 1); } continue; }
        const k = mi - b.startMi; if (k > 0 && k % 6 === 0 && k <= b.term) {
          const cpn = r2(p.units * C.unitFace * b.coupon / 2), a0 = Math.min(r2(p.acc0), cpn); io.couponIn(cpn, r2(cpn - a0), a0, 'Coupon · ' + b.issuer + ' #' + b.id); p.carry = r2(p.carry - a0); p.acc0 = 0; this.acct.couponsIn = r2(this.acct.couponsIn + cpn); this._tx('COUPON_IN', b.id, p.units, cpn, day);
        }
        if (k >= b.term) { const face = r2(p.units * C.unitFace), carry = p.carry; io.divest(face, carry, 'Maturity · ' + b.issuer + ' #' + b.id); this.acct.gain = r2(this.acct.gain + (face - carry)); this._tx('MATURE_IN', b.id, p.units, face, day); this.pos.splice(this.pos.indexOf(p), 1); }
      }
      // 3. the market's own bonds mature and are replaced by a new one of the same term (the market stays populated)
      for (const b of this.bonds.slice()) if (b.status === 'LISTED' && mi - b.startMi >= b.term) { b.status = 'MATURED'; const I = this.issuers[b.issuer]; if (I.status === 'ACTIVE') this._list(b.issuer, b.term, mi, base); }
      // 4. the company's own bonds: coupons, maturity, arrears
      for (const b of this.issued) {
        if (b.status === 'CLOSED') continue; const k = mi - b.startMi; n++;
        while (b.arrears.length && io.cash() >= b.arrears[0].amt - 1e-9) { const a = b.arrears.shift(); this._payArrear(b, a, io, day); }
        if (b.status === 'ACTIVE' && k > 0 && k % 6 === 0 && k <= b.term) {
          const cpn = r2(b.face * b.coupon / 2); if (!b.arrears.length && io.cash() >= cpn - 1e-9) { io.couponOut(cpn, 'Bond coupon #' + b.id); b.paidCoupons++; this.acct.couponsOut = r2(this.acct.couponsOut + cpn); this._tx('COUPON_OUT', b.id, cpn, 0, day); }
          else { b.arrears.push({ mi, amt: cpn, kind: 'C' }); io.accrueCoupon(cpn, 'Bond coupon #' + b.id); this._tx('COUPON_ARREARS', b.id, cpn, 0, day); }
        }
        if (b.status === 'ACTIVE' && k >= b.term) { b.status = 'MATURED'; const pr = r2(b.face - b.repaidFace); if (!b.arrears.length && io.cash() >= pr - 1e-9) this._repay(b, pr, io, day); else { b.arrears.push({ mi, amt: pr, kind: 'P' }); this._tx('COUPON_ARREARS', b.id, pr, 1, day); } }
        if (b.status === 'MATURED' && !b.arrears.length && b.face - b.repaidFace < 0.005) b.status = 'CLOSED';
      }
      return n;
    }
    _repay(b, amt, io, day) { io.repay(amt, 'Bond principal #' + b.id); b.repaidFace = r2(b.repaidFace + amt); this.acct.repaid = r2(this.acct.repaid + amt); this._tx('MATURE_OUT', b.id, amt, 0, day); if (b.status === 'MATURED' && b.face - b.repaidFace < 0.005) b.status = 'CLOSED'; }
    _payArrear(b, a, io, day) { if (a.kind === 'C') { io.payAccrued(a.amt, 'Bond coupon (late) #' + b.id); b.paidCoupons++; this.acct.couponsOut = r2(this.acct.couponsOut + a.amt); this._tx('ARREARS_PAID', b.id, a.amt, 0, day); } else this._repay(b, a.amt, io, day); }
    /* an issuer defaults: its bonds stop, every position in them is written down to the recovery value now, the recovery is paid later */
    _default(id, mi, day, io) {
      const I = this.issuers[id], C = this.C; if (I.status !== 'ACTIVE' || I.cls === 'GOV') return false; I.status = 'DEFAULTED'; I.defMi = mi; this._tx('ISSUER_DEFAULT', 0, I.score, Math.round(I.rec * 100), day);
      for (const b of this.bonds) if (b.issuer === id && b.status === 'LISTED') { b.status = 'DEFAULTED'; b.def = true; }
      for (const p of this.pos) { const b = this.bond(p.bond); if (b.issuer !== id || p.rec != null) continue; const cash = r2(p.units * C.unitFace * I.rec), loss = r2(p.carry - cash); if (loss > 0.005) { io.impair(loss, 'Issuer default · ' + id); this.acct.impaired = r2(this.acct.impaired + loss); this._tx('IMPAIR', b.id, p.units, loss, day); } p.carry = cash; p.acc0 = 0; p.rec = { mi: mi + C.recoveryDelay, cash }; }
      return true;
    }
    forceDefault(id, day, io) { return this._default(id, miOf(day), day, io); }
    /* the accounting proof: what the books must hold, from the positions and the issued bonds */
    audit(bal) { const inv = this.invested(), debt = this.debt(), acc = this.arrearsTotalCoupons(); const ok = !bal || (Math.abs(bal.BOND_INV - inv) < 0.01 && Math.abs(-bal.BOND_DEBT - debt) < 0.01); return { ok, invested: inv, debt, arrears: this.arrearsTotal() }; }
    arrearsTotalCoupons() { let v = 0; for (const b of this.issued) for (const a of b.arrears) if (a.kind === 'C') v += a.amt; return r2(v); }
    toJSON() { return { v: 1, rng: this.rng.s, tx: this.tx, nextTx: this.nextTx, nextBond: this.nextBond, nextIssued: this.nextIssued, lastMi: this.lastMi, issuers: this.issuers, bonds: this.bonds, pos: this.pos, issued: this.issued, acct: this.acct }; }
    static fromJSON(d, cfg, day) {
      const m = new BondMarket(cfg, day); if (!d || d.v !== 1) return m;
      m.rng = new Rng(d.rng); for (const k of ['tx', 'nextTx', 'nextBond', 'nextIssued', 'lastMi', 'issuers', 'bonds', 'pos', 'issued', 'acct']) if (d[k] !== undefined) m[k] = d[k]; return m;
    }
  }
  return { BondMarket, price, yieldOf, spreadOf, termPremium, Rng, miOf, nowM, TX };
});
