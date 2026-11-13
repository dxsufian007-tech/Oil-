/* Oli - bank.js  (Banking Phase 1 "Banking Foundation": three independent banks, each with its own double-entry books)
 *
 * An independent layer ABOVE the company: it never touches store.cash, the company journal, the market or the hot simulation.
 * Each bank keeps its own books (BankBook): assets = cash (liquidity) + other earning assets (the opening portfolio) + loans; liabilities = deposits; equity = capital + retained result.
 * Liquidity and the compulsory reserve are NOT two pots: the reserve is the part of the cash that may not be lent; lendable = cash - reserve; the two never add up to more than the cash.
 * No Math.random, no real clock, no DOM.  Loans, interest, ratings, collateral, default and bonds come in the next phases and will post into these same books.
 * Save: toJSON() / fromJSON() (an optional `bank` key of the company save; an old save without it simply opens fresh banks).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./economy-config.js'), require('./game-calendar.js'), require('./baserate.js'), require('./loans-engine.js'), require('./credit.js'));
  else root.OliBank = factory(root.OliEconomyConfig, root.OliCalendar, root.OliBaseRate, root.OliLoans, root.OliCredit);
})(typeof self !== 'undefined' ? self : this, function (EC, CAL, BR, LE, CR) {
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
  const TX = { OPEN: 1, DUE_PAID: 2, ARREARS: 3, ARREARS_PAID: 4, REPRICE: 5, PREPAY: 6, RESCHEDULE: 7, CLOSE: 8, LIEN: 9, RELEASE: 10, MARGIN_CALL: 11, MARGIN_CLEAR: 12, MARGIN_EXPIRED: 13, RATING: 14, FEE: 15, STAGE: 16, PLAN_OFFER: 17, PLAN_ACCEPT: 18, PLAN_EXPIRE: 19, PLAN_DONE: 20, ENFORCE: 21, CHARGEOFF: 22, CRISIS: 23 };
  const tot = it => LE.r2(it.int + it.prin + (it.fee || 0));

  class Bank {
    /* cfg = the economy config (BANKS); day = the company day the banks open on (the first deposit growth comes one month later) */
    constructor(cfg, day) {
      this.cfg = cfg || EC; this.lastDay = day | 0; this.books = {}; this.log = []; this.hist = [];
      for (const id of IDS) this._open(id);
      this.rate = new BR.BaseRate(this.cfg, qKey(day | 0)); this.loans = []; this.tx = []; this.nextLoan = 1; this.nextTx = 1; this.svcDay = day | 0; this.liens = []; this.nextLien = 1; this.crisis = { at: -1, n: 0 }; this.credit = { score: null, grade: null, parts: null, day: -1, hist: [], prod: [], cf: [] };      // Phase 3: liens (every lien ever made) and the credit rating.  Phase 2: Phase 2: the Base Rate, the loan book (every loan ever made, open or closed) and the permanent transaction record
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
    arrearsTotal() { let t = 0; for (const l of this.loans) if (l.status === 'ACTIVE') for (const a of l.arrears) t += a.int + a.prin + (a.fee || 0); return LE.r2(t); }
    /* may this loan be made?  spec = { bank, type, amount, term, freq, grace }; ctx = { riskDebt, riskBase } (the company's debt without the Central loan, and its assets + stock + cash without the Central network) */
    assess(spec, ctx) {
      const freq = spec.freq || 'M', grace = spec.grace | 0, v = LE.validate(this.cfg, spec.bank, spec.type, spec.amount, spec.term, freq, grace); if (!v.ok) return v;
      const c = this.canLend(spec.bank, spec.amount); if (!c.ok) return c;
      if (ctx && ctx.restricted) return { ok: false, reason: 'RESTRICTED' };
      const L = this.cfg.BANK_LOANS; if (ctx && (ctx.riskDebt + spec.amount) > L.maxDebtRatio * Math.max(0, ctx.riskBase) + 1e-6) return { ok: false, reason: 'RISK' };
      const T = this.cfg.LOAN_TYPES[spec.type], CL = this.cfg.COLLATERAL; let cap = null;
      if (T.lock === 'COLLATERAL' && CL && CL.enabled) {
        if (!spec.collateral || !spec.collateral.length) return { ok: false, reason: 'COLLATERAL_REQUIRED' };
        const k = this._check(spec.collateral, CL.kinds[spec.type] || [], ctx && ctx.val, null); if (!k.ok) return k; cap = k.cap; if (spec.amount > cap + 1e-6) return { ok: false, reason: 'LTV', cap };
      }
      const rate = this.quote(spec.bank, spec.type, this.creditPremium()), l = LE.newLoan({ amount: spec.amount, rate, term: spec.term, grace, freq });
      return { ok: true, reason: '', rate, payment: l.pmt, cap };
    }
    /* make the loan: the bank pays out of its liquidity, the loan joins the book.  The company side (cash in, BANK_LOANS) is booked by Company.takeBankLoan. */
    originate(spec, ctx, day, frac) {
      const a = this.assess(spec, ctx); if (!a.ok) return a;
      const lo = LE.newLoan({ amount: spec.amount, rate: a.rate, term: spec.term, grace: spec.grace | 0, freq: spec.freq || 'M', frac });
      Object.assign(lo, { id: this.nextLoan++, bank: spec.bank, type: spec.type, purpose: spec.purpose || '', start: day | 0, status: 'ACTIVE', arrears: [], paidInt: 0, paidPrin: 0, closedDay: null });
      this.books[spec.bank].post([['LOANS', lo.bal], ['CASH', -lo.bal]]); this.loans.push(lo); this._tx('OPEN', lo, lo.bal, lo.rate, day); this._rec(spec.bank, 'LOAN_OPEN', 'Loan ' + lo.id + ' ' + spec.type, lo.bal);
      if (spec.collateral && spec.collateral.length) this._lien(lo, spec.collateral, ctx && ctx.val, day);
      return { ok: true, loan: lo, rate: a.rate, payment: lo.pmt };
    }
    _settle(l, item, io, code) {                                   // the company pays an instalment item: cash out for it, the bank receives it
      const k = this.books[l.bank], fee = item.fee || 0, all = LE.r2(item.int + item.prin + fee);
      if (item.int > 0) io.payInt(item.int, l); if (fee > 0) io.payInt(fee, l); if (item.prin > 0) io.payPrin(item.prin, l);
      k.post([['CASH', all], ['LOANS', -item.prin], ['RETAINED', -(item.int + fee)]]);
      l.bal = LE.r2(l.bal - item.prin); l.paidInt = LE.r2(l.paidInt + item.int); if (fee > 0) l.paidFee = LE.r2((l.paidFee || 0) + fee); l.paidPrin = LE.r2(l.paidPrin + item.prin); this._tx(code, l, item.int, item.prin);
    }
    /* an instalment the cash cannot cover: it becomes arrears (no cash is taken).  The late fee is charged ONCE on this instalment (2% of it); it is not compounded and never repeated for it. */
    _late(l, item, io, day) {
      const D = this.cfg.DEFAULT; item.fee = LE.r2(D.feeRate * (item.int + item.prin)); if (item.fee > 0) io.accrue(item.fee, l);
      l.arrears.push(item); this._tx('ARREARS', l, item.int, item.prin); if (item.fee > 0) this._tx('FEE', l, item.fee, 0, day);
      if (l.plan && l.plan.status === 'ACTIVE') { l.plan.status = 'BREACHED'; this._tx('STAGE', l, l.stage | 0, 5, day); l.stage = 5; l.stageDay = day; l.enforce = true; this._rec(l.bank, 'PLAN_BREACH', 'Restructuring plan breached · loan ' + l.id, 0); }
    }
    _afterPay(l) {
      if (l.bal < 0.005 && l.accr < 0.005 && !l.arrears.length) { l.bal = 0; l.status = 'CLOSED'; l.closedDay = this.svcDay; this._unlienAll(l); l.call = null; l.stage = 0; l.enforce = false; this._tx('CLOSE', l, l.paidInt, l.paidPrin); this._rec(l.bank, 'LOAN_CLOSE', 'Loan ' + l.id + ' closed', 0); }
    }
    /* the month end of every open loan (called once a month by Company._monthEnd; a day already done is ignored).  io = the company side: { cash(), accrue(amt, loan), payInt(amt, loan), payPrin(amt, loan) } */
    serviceMonth(day, io) {
      day |= 0; if (day <= this.svcDay) return 0; this.svcDay = day; let n = 0;
      for (const l of this.loans) {
        if (l.status !== 'ACTIVE') continue; n++;
        l.m++; const intr = LE.monthInterest(l); l.af = 0; if (intr > 0) { io.accrue(intr, l); l.accr = LE.r2(l.accr + intr); }
        while (l.arrears.length && io.cash() >= tot(l.arrears[0]) - 1e-9) { const it = l.arrears.shift(); this._settle(l, it, io, 'ARREARS_PAID'); }      // overdue items first, oldest first, whole items only
        if (LE.isDueMonth(l)) {
          const ap = l.arrears.reduce((a, x) => a + x.prin, 0), d = LE.dueOf(l, ap), item = { day, int: d.interest, prin: d.prin }; l.accr = 0;
          if (item.int > 0 || item.prin > 0) { if (!l.arrears.length && io.cash() >= item.int + item.prin - 1e-9) this._settle(l, item, io, 'DUE_PAID'); else this._late(l, item, io, day); }
        }
        this._afterPay(l);
      }
      return n;
    }
    /* once a quarter (Company._monthEnd after the loans were serviced): the Base Rate review, then every open loan is repriced from this date on (never backwards) */
    quarterly(day, indus) {
      const d = CAL.dateOfDay(day | 0); if (d.day !== 1 || !this.cfg.BASE_RATE.reviewMonths.includes(d.month)) return null;
      const row = this.rate.review(qKey(day | 0), day | 0, { lam: this.lam(), indus: indus || 0, ratios: this.ratios() }); if (!row) return null;
      for (const l of this.loans) { if (l.status !== 'ACTIVE') continue; const q = this.quote(l.bank, l.type, this.creditPremium()); if (Math.abs(q - l.rate) > 1e-12) { this._tx('REPRICE', l, l.rate, q, day); l.rate = q; l.pmt = LE.pmtFor(l); } }
      return row;
    }
    /* early repayment: amount = null repays everything.  Needs cash for the principal, the interest accrued to date, the overdue items and the fee.  io adds { fee(amt, loan), partInt(amt, loan) } */
    prepay(id, amount, io, frac) {
      const l = this.loans.find(x => x.id === id); if (!l || l.status !== 'ACTIVE') return { ok: false, reason: 'noLoan' };
      const arrearsTot = l.arrears.reduce((a, x) => a + tot(x), 0), arrPrin = l.arrears.reduce((a, x) => a + x.prin, 0), free = LE.r2(l.bal - arrPrin);
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
    /* ======== Phase 3: credit rating ======== */
    creditPremium() { const C = this.cfg.CREDIT; return C && C.premiumOn && this.credit.score != null ? CR.premiumOf(this.credit.score, C) : 0; }
    /* once a month (Company, after the month is closed): in = { opNet, opOut, crude, netMargin, currentRatio, debtToAssets }.  A day already rated is ignored (no double count on load). */
    rateMonth(day, inp) {
      day |= 0; const C = this.cfg.CREDIT, c = this.credit; if (!C || day <= c.day) return null;
      c.cf.push([inp.opNet || 0, inp.opOut || 0]); while (c.cf.length > C.cfMonths) c.cf.shift(); c.prod.push(inp.crude || 0); while (c.prod.length > C.keepMonths) c.prod.shift();
      let on = 0, late = 0, arrNow = 0; const from = day - C.historyMonths * 30;
      for (let i = this.tx.length - 1; i >= 0; i--) { const t = this.tx[i]; if (t[1] < from) break; if (t[2] === TX.DUE_PAID) on++; else if (t[2] === TX.ARREARS) late++; }
      for (const l of this.loans) if (l.status === 'ACTIVE') arrNow += l.arrears.length;
      let on0 = 0, out0 = 0; for (const r of c.cf) { on0 += r[0]; out0 += r[1]; }
      const r = CR.score({ onTime: on, late, arrearsNow: arrNow, opMargin: c.cf.length && out0 > 0 ? on0 / out0 : null, debtToAssets: inp.debtToAssets == null ? null : inp.debtToAssets, netMargin: inp.netMargin == null ? null : inp.netMargin, currentRatio: inp.currentRatio == null ? null : inp.currentRatio, prodCV: CR.cv(c.prod) }, C);
      const pen = (C.stagePenalty || {})[this.worstStage()] || 0; if (pen) r.score = Math.max(0, r.score - pen);
      const g = CR.gradeOf(r.score, C), prev = c.score; c.score = r.score; c.parts = r.parts; c.day = day;
      if (g !== c.grade) { this._tx('RATING', null, prev == null ? 0 : prev, r.score, day); c.grade = g; }
      c.hist.push([day, r.score]); while (c.hist.length > 240) c.hist.shift(); return r;
    }
    /* ======== Phase 3: collateral and liens ======== */
    activeLiens(loanId) { return this.liens.filter(x => x.status === 'ACTIVE' && (loanId == null || x.loan === loanId)); }
    hasLiens() { for (const x of this.liens) if (x.status === 'ACTIVE') return true; return false; }
    assetPledged(id) { for (const x of this.liens) if (x.status === 'ACTIVE' && x.kind === 'ASSET' && x.ref === id) return true; return false; }
    oilPledged(p) { let q = 0; for (const x of this.liens) if (x.status === 'ACTIVE' && x.kind === 'OIL' && x.ref === p) q += x.qty; return q; }
    /* the current value one lien gives (an oil lien never counts more barrels than are really in the tanks); val = { asset(id) -> value | null, oil(p) -> { avail, price } | null } */
    _value(x, val) {
      if (!val) return 0;
      if (x.kind === 'ASSET') return Math.max(0, val.asset(x.ref) || 0);
      const o = val.oil(x.ref); if (!o) return 0; const others = this.oilPledgedBefore(x); return Math.max(0, Math.min(x.qty, o.avail - others)) * o.price;      // barrels already pledged by older liens come first
    }
    oilPledgedBefore(x) { let q = 0; for (const y of this.liens) { if (y === x) break; if (y.status === 'ACTIVE' && y.kind === 'OIL' && y.ref === x.ref) q += y.qty; } return q; }
    /* items = [{ kind: 'ASSET', ref: buildingId } | { kind: 'OIL', ref: product, qty }]; the check never pledges the same asset (or the same barrels) twice.  Returns the borrowing capacity at the origination LTV. */
    _check(items, kinds, val, loan) {
      const CL = this.cfg.COLLATERAL; let cap = 0; const seen = new Set(), addOil = {};
      if (!val) return { ok: false, reason: 'NO_VALUER' };
      for (const it of items) {
        if (!it || !kinds.includes(it.kind)) return { ok: false, reason: 'KIND' };
        if (it.kind === 'ASSET') {
          const key = 'A' + it.ref; if (seen.has(key) || this.assetPledged(it.ref)) return { ok: false, reason: 'DOUBLE_PLEDGE' }; seen.add(key);
          const v = val.asset(it.ref); if (v == null) return { ok: false, reason: 'NOT_FOUND' }; cap += v * CL.ltv.ASSET.max;
        } else {
          const o = val.oil(it.ref); if (!o) return { ok: false, reason: 'PRODUCT' }; const q = +it.qty; if (!(q > 0)) return { ok: false, reason: 'QTY' };
          addOil[it.ref] = (addOil[it.ref] || 0) + q; if (addOil[it.ref] + this.oilPledged(it.ref) > o.avail + 1e-6) return { ok: false, reason: 'DOUBLE_PLEDGE' }; cap += q * o.price * CL.ltv.OIL.max;
        }
      }
      if (loan) for (const x of this.activeLiens(loan.id)) cap += this._value(x, val) * CL.ltv[x.kind].max;       // what the loan already has counts too
      return { ok: true, cap };
    }
    _lien(l, items, val, day) {
      for (const it of items) { const x = { id: this.nextLien++, loan: l.id, kind: it.kind, ref: it.ref, qty: it.kind === 'OIL' ? +it.qty : 0, v0: 0, day: day | 0, status: 'ACTIVE', relDay: null }; this.liens.push(x); x.v0 = LE.r2(this._value(x, val)); this._tx('LIEN', l, x.id, x.v0, day); }
    }
    _unlienAll(l) { for (const x of this.liens) if (x.loan === l.id && x.status === 'ACTIVE') { x.status = 'RELEASED'; x.relDay = this.svcDay; this._tx('RELEASE', l, x.id, 0); } }
    /* collateral value of a loan, and the limits it allows: at origination (max) and before a Margin Call (call) */
    collateralOf(l, val) { let v = 0, mx = 0, cl = 0; const CL = this.cfg.COLLATERAL; for (const x of this.activeLiens(l.id)) { const w = this._value(x, val); v += w; mx += w * CL.ltv[x.kind].max; cl += w * CL.ltv[x.kind].call; } return { value: v, max: mx, call: cl, ltv: v > 0 ? l.bal / v : (l.bal > 0 ? Infinity : 0) }; }
    /* add collateral to a running loan (the owner's way to meet a Margin Call without repaying) */
    addCollateral(loanId, items, val, day) {
      const l = this.loan(loanId); if (!l || l.status !== 'ACTIVE') return { ok: false, reason: 'noLoan' }; const CL = this.cfg.COLLATERAL, kinds = CL.kinds[l.type]; if (!kinds) return { ok: false, reason: 'KIND' };
      const k = this._check(items, kinds, val, null); if (!k.ok) return k; this._lien(l, items, val, day); this.margin(day, val); return { ok: true };
    }
    /* release one lien: allowed when the loan stays within its origination LTV without it; else the gap must be repaid first (opts.repayGap does that from cash) */
    release(lienId, val, io, frac, opts) {
      const x = this.liens.find(y => y.id === lienId && y.status === 'ACTIVE'); if (!x) return { ok: false, reason: 'noLien' }; const l = this.loan(x.loan); if (!l || l.status !== 'ACTIVE') return { ok: false, reason: 'noLoan' };
      const CL = this.cfg.COLLATERAL; let rest = 0; for (const y of this.activeLiens(l.id)) if (y !== x) rest += this._value(y, val) * CL.ltv[y.kind].max;
      const gap = Math.max(0, LE.r2(l.bal - rest)); if (gap > 0.005) {
        if (!(opts && opts.repayGap)) return { ok: false, reason: 'GAP', gap };
        const free = LE.r2(l.bal - l.arrears.reduce((a, z) => a + z.prin, 0)); const r = this.prepay(l.id, Math.min(gap, free), io, frac); if (!r.ok) return { ok: false, reason: r.reason, gap };
        if (l.status !== 'ACTIVE') return { ok: true, repaid: gap, closed: true };
      }
      x.status = 'RELEASED'; x.relDay = this.svcDay; this._tx('RELEASE', l, x.id, gap); this.margin(this.svcDay, val); return { ok: true, repaid: gap };
    }
    /* once a day while any lien exists (Company._newDay): Margin Call when the loan balance passes the call limit of its collateral; cleared when it is back inside; expires after the cure days (Phase 4 enforces) */
    margin(day, val) {
      day |= 0; const CL = this.cfg.COLLATERAL; let n = 0;
      for (const l of this.loans) {
        if (l.status !== 'ACTIVE') continue; const has = this.liens.some(x => x.status === 'ACTIVE' && x.loan === l.id); if (!has) continue; n++;
        const c = this.collateralOf(l, val), over = l.bal > c.call + 0.005;
        if (over) {
          const need = LE.r2(Math.max(0, l.bal - c.max));
          if (!l.call) { l.call = { day, need, expired: false }; this._tx('MARGIN_CALL', l, LE.r2(l.bal), LE.r2(c.value), day); this._rec(l.bank, 'MARGIN_CALL', 'Margin Call · loan ' + l.id, need); }
          else { l.call.need = need; if (!l.call.expired && day - l.call.day >= CL.cureDays) { l.call.expired = true; this._tx('MARGIN_EXPIRED', l, need, 0, day); } }
        } else if (l.call) { this._tx('MARGIN_CLEAR', l, LE.r2(l.bal), LE.r2(c.value), day); l.call = null; }
      }
      return n;
    }
    /* ======== Phase 4: default stages, restructuring, asset recovery ======== */
    activeCount() { let n = 0; for (const l of this.loans) if (l.status === 'ACTIVE') n++; return n; }
    worstStage() { let w = 0; for (const l of this.loans) if (l.status === 'ACTIVE' && (l.stage | 0) > w) w = l.stage | 0; return w; }
    lateCount(l, day, win) { let n = 0; for (let i = this.tx.length - 1; i >= 0; i--) { const t = this.tx[i]; if (t[1] < day - win) break; if (t[2] === TX.ARREARS && t[3] === l.id) n++; } return n; }
    /* once a day (Company._newDay): the five stages from the delay of the oldest unpaid instalment.  Stages only rise while the arrears last; paid up = back to 0.  Returns the loans whose collateral must now be enforced. */
    defaults(day) {
      day |= 0; const D = this.cfg.DEFAULT, out = []; if (day <= (this.defDay == null ? -1 : this.defDay)) return out; this.defDay = day; this.chg = [];
      for (const l of this.loans) {
        if (l.status !== 'ACTIVE') continue; const old = l.stage | 0;
        if (!l.arrears.length) { if (old) { this._tx('STAGE', l, old, 0, day); l.stage = 0; l.stageDay = day; l.enforce = false; } this._plan(l, day); continue; }
        const d = day - l.arrears[0].day; let st = d > D.stage5Days ? 5 : d > D.stage4Days ? 4 : d > D.stage3Days ? 3 : (d > D.stage2Days || this.lateCount(l, day, D.lateWindowDays) >= D.lateCount) ? 2 : 1;
        if (l.plan && l.plan.status === 'BREACHED') st = 5; if (this.crisis.at >= 0 && st < 4) st = 4; if (st < old) st = old;
        if (st !== old) {
          this._tx('STAGE', l, old, st, day); this.chg.push([l.id, old, st]); l.stage = st; l.stageDay = day; this._rec(l.bank, 'STAGE', 'Loan ' + l.id + ' stage ' + st, 0);
          if (st === 4) this._offer(l, day); if (st === 5) l.enforce = true;
        }
        this._plan(l, day); if (l.enforce) out.push(l);
      }
      return out;
    }
    /* the company has been in negative cash for 40 days: every open loan moves to stage 4 and gets the restructuring offer (60 days to accept) */
    crisisStart(day) { for (const l of this.loans) { if (l.status !== 'ACTIVE') continue; const old = l.stage | 0; if (old < 4) { this._tx('STAGE', l, old, 4, day); l.stage = 4; l.stageDay = day; } if (!l.plan || l.plan.status !== 'OFFERED') this._offer(l, day); } this._tx('CRISIS', null, this.crisis.n, 0, day); }
    /* the plan clock: an unaccepted offer lapses after the window; an accepted plan is done after its period without a breach */
    _plan(l, day) {
      const p = l.plan; if (!p) return;
      if (p.status === 'OFFERED' && day > p.expires) { p.status = 'EXPIRED'; this._tx('PLAN_EXPIRE', l, p.expires, 0, day); }
      else if (p.status === 'ACTIVE' && day >= p.until) { p.status = 'DONE'; this._tx('PLAN_DONE', l, 0, 0, day); }
    }
    /* the bank's offer at stage 4: (a) a longer term, (b) a lower instalment (interest only for a time).  The owner has 60 days to accept. */
    _offer(l, day) {
      const D = this.cfg.DEFAULT, T = this.cfg.LOAN_TYPES[l.type], R = l.term - l.m, ext = Math.min(R * D.extendFactor, T.maxMonths - l.m), opts = [];
      const ex = Math.floor(ext / l.fm) * l.fm; if (ex > R) opts.push({ kind: 'EXTEND', months: ex });
      opts.push({ kind: 'LOWER', graceMonths: D.lowerGraceMonths });
      l.plan = { day, expires: day + D.planWindowDays, status: 'OFFERED', options: opts, until: null, kind: null }; this._tx('PLAN_OFFER', l, D.planWindowDays, opts.length, day);
    }
    /* accept the offer: the unpaid interest and fees are capitalised (company: ACCRUED_INT -> BANK_LOANS, io.capitalize), the arrears are cleared, the schedule is re-based.  The new payments are watched for a period; a miss is a breach (stage 5). */
    acceptPlan(id, kind, io, day) {
      const l = this.loans.find(x => x.id === id); if (!l || l.status !== 'ACTIVE') return { ok: false, reason: 'noLoan' }; const p = l.plan, D = this.cfg.DEFAULT;
      if (!p || p.status !== 'OFFERED') return { ok: false, reason: 'noOffer' }; if (day > p.expires) return { ok: false, reason: 'expired' };
      const o = p.options.find(x => x.kind === kind); if (!o) return { ok: false, reason: 'option' };
      let cap = 0; for (const it of l.arrears) cap += it.int + (it.fee || 0); cap = LE.r2(cap);
      if (cap > 0) { io.capitalize(cap, l); this.books[l.bank].post([['LOANS', cap], ['RETAINED', -cap]]); l.bal = LE.r2(l.bal + cap); }
      l.arrears = []; l.accr = 0;
      if (o.kind === 'EXTEND') l.term = l.m + o.months; else l.grace = l.m + o.graceMonths;
      l.pmt = LE.pmtFor(l); p.status = 'ACTIVE'; p.kind = kind; p.accepted = day; p.until = day + D.planActiveDays; l.stage = 0; l.stageDay = day; l.enforce = false; l.restr = (l.restr | 0) + 1;
      this._tx('PLAN_ACCEPT', l, cap, o.kind === 'EXTEND' ? o.months : o.graceMonths, day); this._rec(l.bank, 'PLAN_ACCEPT', 'Loan ' + l.id + ' restructured (' + kind + ')', cap); return { ok: true, kind, capitalised: cap, payment: l.pmt, term: l.term };
    }
    /* collateral enforcement, step 1: the bank takes the lien (forced release, recorded).  The company then sells the asset and calls forceRepay with the proceeds. */
    forceRelease(lienId) { const x = this.liens.find(y => y.id === lienId && y.status === 'ACTIVE'); if (!x) return null; const l = this.loan(x.loan); x.status = 'RELEASED'; x.relDay = this.svcDay; x.forced = true; this._tx('ENFORCE', l, x.id, 1, this.svcDay); return x; }
    /* step 2: the proceeds repay the loan: overdue items first (oldest first, whole items), then principal.  Never more than `budget`.  Returns the amount used. */
    forceRepay(l, io, budget) {
      let used = 0;
      while (l.arrears.length && budget - used >= tot(l.arrears[0]) - 1e-9) { const it = l.arrears.shift(); used += tot(it); this._settle(l, it, io, 'ARREARS_PAID'); }
      if (!l.arrears.length) { const prin = LE.r2(Math.min(budget - used, l.bal)); if (prin > 0.005) { used += prin; this._settle(l, { int: 0, prin }, io, 'PREPAY'); if (l.bal > 0.005) l.pmt = LE.pmtFor(l); } }
      this._afterPay(l); return LE.r2(used);
    }
    /* the company is bankrupt: what the banks cannot recover is a credit loss, deducted from their capital */
    chargeOffAll(day) { let n = 0; for (const l of this.loans) { if (l.status !== 'ACTIVE') continue; const loss = LE.r2(l.bal); this.books[l.bank].post([['RETAINED', loss], ['LOANS', -loss]]); l.status = 'LOSS'; l.lossDay = day | 0; this._tx('CHARGEOFF', l, loss, 0, day); this._rec(l.bank, 'CREDIT_LOSS', 'Loan ' + l.id + ' written off', loss); n++; } return n; }
    /* the loan register: every loan ever made (open and closed), with its permanent history in tx */
    loan(id) { return this.loans.find(x => x.id === id) || null; }
    toJSON() {
      const b = {}; for (const id of IDS) b[id] = { bal: Object.assign({}, this.books[id].bal), n: this.books[id].n };
      return { v: 4, crisis: this.crisis, defDay: this.defDay == null ? -1 : this.defDay, liens: this.liens, nextLien: this.nextLien, credit: this.credit, lastDay: this.lastDay, banks: b, log: this.log, hist: this.hist, rate: this.rate.toJSON(), loans: this.loans, tx: this.tx, nextLoan: this.nextLoan, nextTx: this.nextTx, svcDay: this.svcDay };
    }
    static fromJSON(d, cfg, day) {
      if (!d || (d.v < 1 || d.v > 4) || !d.banks) return new Bank(cfg, day);
      const bk = new Bank(cfg, d.lastDay | 0);
      for (const id of IDS) { const s = d.banks[id], k = new BankBook(); if (s && s.bal) { for (const a of KEYS) k.bal[a] = +s.bal[a] || 0; k.n = s.n | 0; bk.books[id] = k; } else { bk.books[id] = null; } }
      bk.log = Array.isArray(d.log) ? d.log : []; bk.hist = Array.isArray(d.hist) ? d.hist : [];
      if (d.v >= 2) { bk.rate = BR.BaseRate.fromJSON(d.rate, bk.cfg, qKey(d.svcDay | 0)); bk.loans = Array.isArray(d.loans) ? d.loans : []; bk.tx = Array.isArray(d.tx) ? d.tx : []; bk.nextLoan = d.nextLoan || 1; bk.nextTx = d.nextTx || 1; bk.svcDay = d.svcDay | 0; }
      if (d.v >= 4) { bk.crisis = Object.assign({ at: -1, n: 0 }, d.crisis || {}); bk.defDay = d.defDay == null ? -1 : d.defDay; }
      if (d.v >= 3) { bk.liens = Array.isArray(d.liens) ? d.liens : []; bk.nextLien = d.nextLien || 1; if (d.credit) bk.credit = Object.assign(bk.credit, d.credit); }
      if (d.v === 1) { bk.rate = new BR.BaseRate(bk.cfg, qKey(day | 0)); bk.svcDay = day | 0; bk.rate.emaDay = (day | 0) - 1; }                       // a Phase 1 save: no loans yet, the Base Rate starts from today
      for (const id of IDS) if (!bk.books[id]) bk._open(id);                      // a bank missing from the save opens fresh (never an error)
      return bk;
    }
  }
  return { Bank, BankBook, IDS, ACC };
});
