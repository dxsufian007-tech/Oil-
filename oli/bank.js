/* Oli - bank.js  (Banking Phase 1 "Banking Foundation": three independent banks, each with its own double-entry books)
 *
 * An independent layer ABOVE the company: it never touches store.cash, the company journal, the market or the hot simulation.
 * Each bank keeps its own books (BankBook): assets = cash (liquidity) + other earning assets (the opening portfolio) + loans; liabilities = deposits; equity = capital + retained result.
 * Liquidity and the compulsory reserve are NOT two pots: the reserve is the part of the cash that may not be lent; lendable = cash - reserve; the two never add up to more than the cash.
 * No Math.random, no real clock, no DOM.  Loans, interest, ratings, collateral, default and bonds come in the next phases and will post into these same books.
 * Save: toJSON() / fromJSON() (an optional `bank` key of the company save; an old save without it simply opens fresh banks).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./economy-config.js'), require('./game-calendar.js'), require('./baserate.js'), require('./loans-engine.js'));
  else root.OliBank = factory(root.OliEconomyConfig, root.OliCalendar, root.OliBaseRate, root.OliLoans);
})(typeof self !== 'undefined' ? self : this, function (EC, CAL, BR, LE) {
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

  const qKey = day => { const d = CAL.dateOfDay(day); return d.year * 4 + Math.floor((d.month - 1) / 3); };
  const TX = { OPEN: 1, DUE_PAID: 2, ARREARS: 3, ARREARS_PAID: 4, REPRICE: 5, PREPAY: 6, RESCHEDULE: 7, CLOSE: 8 };

  class Bank {
    /* cfg = the economy config (BANKS); day = the company day the banks open on (the first deposit growth comes one month later) */
    constructor(cfg, day) {
      this.cfg = cfg || EC; this.lastDay = day | 0; this.books = {}; this.log = []; this.hist = [];
      for (const id of IDS) this._open(id);
      this.rate = new BR.BaseRate(this.cfg, qKey(day | 0)); this.loans = []; this.tx = []; this.nextLoan = 1; this.nextTx = 1; this.svcDay = day | 0;      // Phase 2: the Base Rate, the loan book (every loan ever made, open or closed) and the permanent transaction record
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
    /* ======== Phase 2: Base Rate, loans ======== */
    lam() { let l = 0, d = 0; for (const id of IDS) { l += this.lendable(id); d += this.books[id].deposits; } return d > 0 ? l / d : 0; }
    lendable0(id) { const p = this.B.banks[id]; return Math.max(1, p.liquidity - this.B.reserveRatio * p.deposits); }             // the fixed reference: opening lendable money, from the config
    ratios() { const o = {}; for (const id of IDS) o[id] = this.lendable(id) / this.lendable0(id); return o; }
    daily(day, price) { return this.rate.daily(day, price); }
    /* the rate of a new / repriced loan: Base + bank spread + bank liquidity surcharge + loan-risk premium + credit premium (0 until the rating exists), within the loan floor and cap */
    quote(id, type, credit) {
      const R = this.cfg.BASE_RATE, B = this.B.banks[id], T = this.cfg.LOAN_TYPES[type];
      return Math.round(Math.min(R.loanMax, Math.max(R.loanMin, this.rate.rate + B.spread + this.rate.surcharge(id) + T.premium + (credit || 0))) * 1e6) / 1e6;
    }
    _tx(code, loan, a, b, day) { this.tx.push([this.nextTx++, day == null ? this.svcDay : day, TX[code], loan ? loan.id : 0, a == null ? 0 : a, b == null ? 0 : b]); }
    bankDebt() { let d = 0; for (const l of this.loans) if (l.status === 'ACTIVE') d += l.bal; return d; }
    /* the part of the loan book that falls due within a year (for the current-liabilities figure) */
    dueWithinYear() { let d = 0; for (const l of this.loans) if (l.status === 'ACTIVE') d += Math.min(l.bal, (l.pmt || 0) * 12 / l.fm); return d; }
    arrearsTotal() { let t = 0; for (const l of this.loans) if (l.status === 'ACTIVE') for (const a of l.arrears) t += a.int + a.prin; return LE.r2(t); }
    /* may this loan be made?  spec = { bank, type, amount, term, freq, grace }; ctx = { riskDebt, riskBase } (the company's debt without the Central loan, and its assets + stock + cash without the Central network) */
    assess(spec, ctx) {
      const freq = spec.freq || 'M', grace = spec.grace | 0, v = LE.validate(this.cfg, spec.bank, spec.type, spec.amount, spec.term, freq, grace); if (!v.ok) return v;
      const c = this.canLend(spec.bank, spec.amount); if (!c.ok) return c;
      const L = this.cfg.BANK_LOANS; if (ctx && (ctx.riskDebt + spec.amount) > L.maxDebtRatio * Math.max(0, ctx.riskBase) + 1e-6) return { ok: false, reason: 'RISK' };
      const rate = this.quote(spec.bank, spec.type), l = LE.newLoan({ amount: spec.amount, rate, term: spec.term, grace, freq });
      return { ok: true, reason: '', rate, payment: l.pmt };
    }
    /* make the loan: the bank pays out of its liquidity, the loan joins the book.  The company side (cash in, BANK_LOANS) is booked by Company.takeBankLoan. */
    originate(spec, ctx, day, frac) {
      const a = this.assess(spec, ctx); if (!a.ok) return a;
      const lo = LE.newLoan({ amount: spec.amount, rate: a.rate, term: spec.term, grace: spec.grace | 0, freq: spec.freq || 'M', frac });
      Object.assign(lo, { id: this.nextLoan++, bank: spec.bank, type: spec.type, purpose: spec.purpose || '', start: day | 0, status: 'ACTIVE', arrears: [], paidInt: 0, paidPrin: 0, closedDay: null });
      this.books[spec.bank].post([['LOANS', lo.bal], ['CASH', -lo.bal]]); this.loans.push(lo); this._tx('OPEN', lo, lo.bal, lo.rate, day); this._rec(spec.bank, 'LOAN_OPEN', 'Loan ' + lo.id + ' ' + spec.type, lo.bal);
      return { ok: true, loan: lo, rate: a.rate, payment: lo.pmt };
    }
    _settle(l, item, io, code) {                                   // the company pays an instalment item: cash out for it, the bank receives it
      const k = this.books[l.bank], tot = LE.r2(item.int + item.prin);
      if (item.int > 0) io.payInt(item.int, l); if (item.prin > 0) io.payPrin(item.prin, l);
      k.post([['CASH', tot], ['LOANS', -item.prin], ['RETAINED', -item.int]]);
      l.bal = LE.r2(l.bal - item.prin); l.paidInt = LE.r2(l.paidInt + item.int); l.paidPrin = LE.r2(l.paidPrin + item.prin); this._tx(code, l, item.int, item.prin);
    }
    _afterPay(l) {
      if (l.bal < 0.005 && l.accr < 0.005 && !l.arrears.length) { l.bal = 0; l.status = 'CLOSED'; l.closedDay = this.svcDay; this._tx('CLOSE', l, l.paidInt, l.paidPrin); this._rec(l.bank, 'LOAN_CLOSE', 'Loan ' + l.id + ' closed', 0); }
    }
    /* the month end of every open loan (called once a month by Company._monthEnd; a day already done is ignored).  io = the company side: { cash(), accrue(amt, loan), payInt(amt, loan), payPrin(amt, loan) } */
    serviceMonth(day, io) {
      day |= 0; if (day <= this.svcDay) return 0; this.svcDay = day; let n = 0;
      for (const l of this.loans) {
        if (l.status !== 'ACTIVE') continue; n++;
        l.m++; const intr = LE.monthInterest(l); l.af = 0; if (intr > 0) { io.accrue(intr, l); l.accr = LE.r2(l.accr + intr); }
        while (l.arrears.length && io.cash() >= l.arrears[0].int + l.arrears[0].prin - 1e-9) { const it = l.arrears.shift(); this._settle(l, it, io, 'ARREARS_PAID'); }      // overdue items first, oldest first, whole items only
        if (LE.isDueMonth(l)) {
          const ap = l.arrears.reduce((a, x) => a + x.prin, 0), d = LE.dueOf(l, ap), item = { day, int: d.interest, prin: d.prin }; l.accr = 0;
          if (item.int > 0 || item.prin > 0) { if (!l.arrears.length && io.cash() >= item.int + item.prin - 1e-9) this._settle(l, item, io, 'DUE_PAID'); else { l.arrears.push(item); this._tx('ARREARS', l, item.int, item.prin); } }
        }
        this._afterPay(l);
      }
      return n;
    }
    /* once a quarter (Company._monthEnd after the loans were serviced): the Base Rate review, then every open loan is repriced from this date on (never backwards) */
    quarterly(day, indus) {
      const d = CAL.dateOfDay(day | 0); if (d.day !== 1 || !this.cfg.BASE_RATE.reviewMonths.includes(d.month)) return null;
      const row = this.rate.review(qKey(day | 0), day | 0, { lam: this.lam(), indus: indus || 0, ratios: this.ratios() }); if (!row) return null;
      for (const l of this.loans) { if (l.status !== 'ACTIVE') continue; const q = this.quote(l.bank, l.type); if (Math.abs(q - l.rate) > 1e-12) { this._tx('REPRICE', l, l.rate, q, day); l.rate = q; l.pmt = LE.pmtFor(l); } }
      return row;
    }
    /* early repayment: amount = null repays everything.  Needs cash for the principal, the interest accrued to date, the overdue items and the fee.  io adds { fee(amt, loan), partInt(amt, loan) } */
    prepay(id, amount, io, frac) {
      const l = this.loans.find(x => x.id === id); if (!l || l.status !== 'ACTIVE') return { ok: false, reason: 'noLoan' };
      const arrearsTot = l.arrears.reduce((a, x) => a + x.int + x.prin, 0), arrPrin = l.arrears.reduce((a, x) => a + x.prin, 0), free = LE.r2(l.bal - arrPrin);
      const a = amount == null ? free : LE.r2(amount); if (!(a > 0) || a > free + 1e-6) return { ok: false, reason: 'amount' };
      const full = a >= free - 0.005, partInt = LE.r2(l.bal * l.rate / 12 * frac * (1 - l.af)), fee = LE.r2(a * this.cfg.BANK_LOANS.prepayFee);
      const need = a + l.accr + arrearsTot + partInt + fee; if (io.cash() < need - 1e-6) return { ok: false, reason: 'cash', need };
      for (const it of l.arrears.splice(0)) this._settle(l, it, io, 'ARREARS_PAID');
      if (l.accr > 0) { const it = { int: l.accr, prin: 0 }; l.accr = 0; this._settle(l, it, io, 'DUE_PAID'); }
      if (partInt > 0) { io.partInt(partInt, l); this.books[l.bank].post([['CASH', partInt], ['RETAINED', -partInt]]); l.paidInt = LE.r2(l.paidInt + partInt); }
      if (fee > 0) { io.fee(fee, l); this.books[l.bank].post([['CASH', fee], ['RETAINED', -fee]]); }
      this._settle(l, { int: 0, prin: a }, io, 'PREPAY'); l.af = full ? 0 : Math.min(1, l.af + frac * (1 - l.af));
      if (!full) l.pmt = LE.pmtFor(l); this._afterPay(l); return { ok: true, paid: a, full, interestToDate: partInt, fee };
    }
    /* rescheduling: a new number of months from now (never beyond the loan type's longest term); the fee is a share of the balance */
    reschedule(id, months, io) {
      const l = this.loans.find(x => x.id === id); if (!l || l.status !== 'ACTIVE') return { ok: false, reason: 'noLoan' };
      const T = this.cfg.LOAN_TYPES[l.type]; if (!(months >= l.fm) || months % l.fm !== 0 || l.m + months > T.maxMonths) return { ok: false, reason: 'TERM' };
      const fee = LE.r2(l.bal * this.cfg.BANK_LOANS.rescheduleFee); if (io.cash() < fee - 1e-6) return { ok: false, reason: 'cash' };
      if (fee > 0) { io.fee(fee, l); this.books[l.bank].post([['CASH', fee], ['RETAINED', -fee]]); }
      const old = l.term; l.term = l.m + months; l.pmt = LE.pmtFor(l); this._tx('RESCHEDULE', l, old, l.term); return { ok: true, term: l.term, payment: l.pmt, fee };
    }
    /* the loan register: every loan ever made (open and closed), with its permanent history in tx */
    loan(id) { return this.loans.find(x => x.id === id) || null; }
    toJSON() {
      const b = {}; for (const id of IDS) b[id] = { bal: Object.assign({}, this.books[id].bal), n: this.books[id].n };
      return { v: 2, lastDay: this.lastDay, banks: b, log: this.log, hist: this.hist, rate: this.rate.toJSON(), loans: this.loans, tx: this.tx, nextLoan: this.nextLoan, nextTx: this.nextTx, svcDay: this.svcDay };
    }
    static fromJSON(d, cfg, day) {
      if (!d || (d.v !== 1 && d.v !== 2) || !d.banks) return new Bank(cfg, day);
      const bk = new Bank(cfg, d.lastDay | 0);
      for (const id of IDS) { const s = d.banks[id], k = new BankBook(); if (s && s.bal) { for (const a of KEYS) k.bal[a] = +s.bal[a] || 0; k.n = s.n | 0; bk.books[id] = k; } else { bk.books[id] = null; } }
      bk.log = Array.isArray(d.log) ? d.log : []; bk.hist = Array.isArray(d.hist) ? d.hist : [];
      if (d.v === 2) { bk.rate = BR.BaseRate.fromJSON(d.rate, bk.cfg, qKey(d.svcDay | 0)); bk.loans = Array.isArray(d.loans) ? d.loans : []; bk.tx = Array.isArray(d.tx) ? d.tx : []; bk.nextLoan = d.nextLoan || 1; bk.nextTx = d.nextTx || 1; bk.svcDay = d.svcDay | 0; }
      else { bk.rate = new BR.BaseRate(bk.cfg, qKey(day | 0)); bk.svcDay = day | 0; bk.rate.emaDay = (day | 0) - 1; }                       // a Phase 1 save: no loans yet, the Base Rate starts from today
      for (const id of IDS) if (!bk.books[id]) bk._open(id);                      // a bank missing from the save opens fresh (never an error)
      return bk;
    }
  }
  return { Bank, BankBook, IDS, ACC };
});
