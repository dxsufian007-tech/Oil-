/* Oli - bank.js  (Banking Phase 1 "Banking Foundation": three independent banks, each with its own double-entry books)
 *
 * An independent layer ABOVE the company: it never touches store.cash, the company journal, the market or the hot simulation.
 * Each bank keeps its own books (BankBook): assets = cash (liquidity) + other earning assets (the opening portfolio) + loans; liabilities = deposits; equity = capital + retained result.
 * Liquidity and the compulsory reserve are NOT two pots: the reserve is the part of the cash that may not be lent; lendable = cash - reserve; the two never add up to more than the cash.
 * No Math.random, no real clock, no DOM.  Loans, interest, ratings, collateral, default and bonds come in the next phases and will post into these same books.
 * Save: toJSON() / fromJSON() (an optional `bank` key of the company save; an old save without it simply opens fresh banks).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./economy-config.js'));
  else root.OliBank = factory(root.OliEconomyConfig);
})(typeof self !== 'undefined' ? self : this, function (EC) {
  'use strict';
  const IDS = ['COMMERCIAL', 'INDUSTRIAL', 'STRATEGIC'];
  // account -> [kind, label].  asset | liab | equity.  A debit is positive, a credit is negative.
  const ACC = { CASH: ['asset', 'Liquidity (cash)'], OTHER: ['asset', 'Other earning assets (opening portfolio)'], LOANS: ['asset', 'Loan book'],
    DEPOSITS: ['liab', 'Deposits'], CAPITAL: ['equity', 'Capital'], RETAINED: ['equity', 'Retained result'] };
  const KEYS = Object.keys(ACC), r2 = x => Math.round(x * 100) / 100, EPS = 1e-6;

  class BankBook {
    constructor() { this.bal = {}; for (const k of KEYS) this.bal[k] = 0; this.n = 0; }
    /* lines: [[account, amount], ...] debit +, credit -; an entry that does not add up to zero is refused */
    post(lines) {
      let sum = 0, scale = 1; for (const [a, v] of lines) { if (!(a in ACC)) throw new Error('bank: unknown account ' + a); if (!isFinite(v)) throw new Error('bank: bad amount on ' + a); sum += v; scale = Math.max(scale, Math.abs(v)); }
      if (Math.abs(sum) > EPS * scale) throw new Error('bank: unbalanced entry (' + sum + ')');
      for (const [a, v] of lines) this.bal[a] += v; this.n++; return this.n;
    }
    check() { let s = 0, g = 0; for (const k of KEYS) { s += this.bal[k]; g += Math.abs(this.bal[k]); } const tol = Math.max(1e-3, 1e-12 * g); return { ok: Math.abs(s) < tol, sum: s, tol }; }
    get assets() { return this.bal.CASH + this.bal.OTHER + this.bal.LOANS; }
    get deposits() { return -this.bal.DEPOSITS; }
    get capital() { return -this.bal.CAPITAL; }
    get retained() { return -this.bal.RETAINED; }
    get equity() { return this.capital + this.retained; }
  }

  class Bank {
    /* cfg = the economy config (BANKS); day = the company day the banks open on (the first deposit growth comes one month later) */
    constructor(cfg, day) {
      this.cfg = cfg || EC; this.lastDay = day | 0; this.books = {}; this.log = []; this.hist = [];
      for (const id of IDS) this._open(id);
    }
    get B() { return this.cfg.BANKS; }
    _open(id) {
      const p = this.B.banks[id], k = new BankBook(), other = p.capital + p.deposits - p.liquidity;
      if (!(p.liquidity >= 0) || other < -EPS) throw new Error('bank: ' + id + ' liquidity cannot exceed capital + deposits');
      k.post([['CASH', p.liquidity], ['OTHER', other], ['DEPOSITS', -p.deposits], ['CAPITAL', -p.capital]]);      // Dr cash + other assets = Cr deposits + capital
      this.books[id] = k; this._rec(id, 'OPEN', 'Opening balance sheet', p.liquidity);
    }
    _rec(id, type, desc, amount) { this.log.push({ bank: id, type, desc, amount: r2(amount), day: this.lastDay, n: this.books[id].n }); }
    ids() { return IDS.slice(); }
    label(id) { return this.B.banks[id].label; }
    /* ---- the three figures that must never be mixed: liquidity, compulsory reserve, lendable ---- */
    liquidity(id) { return this.books[id].bal.CASH; }
    reserveRequired(id) { return this.B.reserveRatio * this.books[id].deposits; }
    lendable(id) { return Math.max(0, this.liquidity(id) - this.reserveRequired(id)); }
    loansOut(id) { return this.books[id].bal.LOANS; }
    leverage(id) { const c = this.books[id].equity; return c > 0 ? this.loansOut(id) / c : Infinity; }
    /* the most one new loan can be: the bank's single-loan cap, what it can lend without touching the reserve, and what the leverage limit still allows */
    maxLoan(id) {
      const p = this.B.banks[id], k = this.books[id], room = p.maxLeverage * Math.max(0, k.equity) - k.bal.LOANS;
      return Math.max(0, Math.min(p.singleLoanCap, this.lendable(id), room));
    }
    canLend(id, amount) {
      if (!(amount > 0)) return { ok: false, reason: 'AMOUNT' };
      const p = this.B.banks[id], k = this.books[id];
      if (amount > p.singleLoanCap + EPS) return { ok: false, reason: 'SINGLE_CAP' };
      if (amount > this.lendable(id) + EPS) return { ok: false, reason: 'LIQUIDITY' };
      if (k.bal.LOANS + amount > p.maxLeverage * Math.max(0, k.equity) + EPS) return { ok: false, reason: 'LEVERAGE' };
      return { ok: true, reason: '' };
    }
    /* ---- the monthly cycle: deposits grow, the new deposits arrive as cash.  Called once a month by Company._monthEnd(); a day already done is ignored (no double growth) ---- */
    monthly(day, hours) {
      day |= 0; if (day <= this.lastDay) return false; this.lastDay = day;
      for (const id of IDS) {
        const k = this.books[id], g = r2(k.deposits * this.B.depositGrowthPerMonth);
        if (g > 0) { k.post([['CASH', g], ['DEPOSITS', -g]]); this._rec(id, 'DEPOSIT_GROWTH', 'Deposits grew', g); }
        this.hist.push(this.snapshot(id, day));
      }
      return true;
    }
    /* capital injection (or withdrawal, only from lendable money): the owner changes a bank's capital from the economy settings */
    recapitalize(id, amount) {
      const k = this.books[id]; if (!k || !isFinite(amount) || amount === 0) return { ok: false, reason: 'AMOUNT' };
      if (amount < 0 && (-amount > this.lendable(id) + EPS || -amount > k.capital + EPS)) return { ok: false, reason: 'LIQUIDITY' };
      k.post([['CASH', amount], ['CAPITAL', -amount]]); this._rec(id, 'RECAPITALIZE', 'Capital changed', amount); return { ok: true };
    }
    snapshot(id, day) {
      const k = this.books[id];
      return { bank: id, day: day == null ? this.lastDay : day, capital: r2(k.capital), retained: r2(k.retained) || 0, deposits: r2(k.deposits), liquidity: r2(k.bal.CASH), reserve: r2(this.reserveRequired(id)), lendable: r2(this.lendable(id)), loans: r2(k.bal.LOANS), other: r2(k.bal.OTHER), assets: r2(k.assets), maxLoan: r2(this.maxLoan(id)) };
    }
    report() { const o = {}; for (const id of IDS) o[id] = this.snapshot(id); return o; }
    audit() { const r = { ok: true, banks: {} }; for (const id of IDS) { const k = this.books[id], c = k.check(), gap = k.assets - k.deposits - k.equity, ok = c.ok && Math.abs(gap) < Math.max(1e-3, 1e-12 * k.assets); r.banks[id] = { ok, gap }; if (!ok) r.ok = false; } return r; }
    toJSON() {
      const b = {}; for (const id of IDS) b[id] = { bal: Object.assign({}, this.books[id].bal), n: this.books[id].n };
      return { v: 1, lastDay: this.lastDay, banks: b, log: this.log, hist: this.hist };
    }
    static fromJSON(d, cfg, day) {
      if (!d || d.v !== 1 || !d.banks) return new Bank(cfg, day);
      const bk = new Bank(cfg, d.lastDay | 0);
      for (const id of IDS) { const s = d.banks[id], k = new BankBook(); if (s && s.bal) { for (const a of KEYS) k.bal[a] = +s.bal[a] || 0; k.n = s.n | 0; bk.books[id] = k; } else { bk.books[id] = null; } }
      bk.log = Array.isArray(d.log) ? d.log : []; bk.hist = Array.isArray(d.hist) ? d.hist : [];
      for (const id of IDS) if (!bk.books[id]) bk._open(id);                      // a bank missing from the save opens fresh (never an error)
      return bk;
    }
  }
  return { Bank, BankBook, IDS, ACC };
});
