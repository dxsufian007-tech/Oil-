/* Oli - loans-engine.js  (Banking Phase 2: the pure arithmetic of a bank loan; no company, no money, no clock)
 * A loan record l: { bal, rate (annual, in force now), term (months), grace (months, interest only), fm (months per payment period: 1 / 3 / 12), m (month ends processed), af (share of the current month already charged),
 *   accr (interest accrued, not yet due), pmt (the instalment of an amortising period) }.
 * Every month end: interest of the month = bal x rate / 12 x (1 - af).  A payment falls due when m is a multiple of fm (and every month once the term is over):
 * interest = what accrued; principal = 0 during the grace, the whole balance at the term, otherwise pmt - interest.  pmt is re-based on the balance and the periods left whenever the rate changes (no retroactivity).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OliLoans = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const FM = { M: 1, Q: 3, A: 12 }, r2 = x => Math.round(x * 100) / 100, clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  function annuity(bal, rp, n) { n = Math.max(1, n); return rp > 1e-12 ? bal * rp / (1 - Math.pow(1 + rp, -n)) : bal / n; }
  /* the instalment of one amortising period, from the balance, the rate and the periods that are left */
  function pmtFor(l) {
    const n = Math.ceil((l.term - Math.max(l.m, l.grace)) / l.fm - 1e-9); if (n <= 0) return l.bal;
    return r2(annuity(l.bal, l.rate * l.fm / 12, n));
  }
  function newLoan(o) {            // o: { amount, rate, term, grace, freq, frac }
    const l = { bal: r2(o.amount), principal: r2(o.amount), rate: o.rate, term: o.term, grace: o.grace | 0, freq: o.freq, fm: FM[o.freq], m: 0, af: o.frac || 0, accr: 0, pmt: 0 };
    l.pmt = pmtFor(l); return l;
  }
  /* interest of the month that just closed */
  function monthInterest(l) { return r2(l.bal * l.rate / 12 * (1 - l.af)); }
  function isDueMonth(l) { return l.m > l.term || l.m % l.fm === 0; }
  /* what falls due this month, capped by the principal that is not already in arrears */
  function dueOf(l, arrearsPrin) {
    const interest = r2(l.accr); let prin = l.m >= l.term ? l.bal : l.m <= l.grace ? 0 : clamp(r2(l.pmt - interest), 0, l.bal);
    prin = clamp(r2(prin), 0, Math.max(0, r2(l.bal - (arrearsPrin || 0)))); return { interest, prin };
  }
  /* the whole schedule at a constant rate: rows of the payment periods */
  function schedule(o) {
    const l = newLoan(Object.assign({ frac: 0 }, o)), rows = []; let totalInt = 0, guard = 0;
    while (l.bal > 0.004 && guard++ < o.term + 2) {
      l.m++; const i = monthInterest(l); l.accr = r2(l.accr + i); l.af = 0;
      if (isDueMonth(l)) { const d = dueOf(l, 0); l.bal = r2(l.bal - d.prin); totalInt = r2(totalInt + d.interest); l.accr = 0; rows.push({ m: l.m, interest: d.interest, principal: d.prin, payment: r2(d.interest + d.prin), balance: l.bal }); }
    }
    return { rows, totalInterest: totalInt, payment: newLoan(o).pmt };
  }
  /* the checks every loan request goes through (bank capacity and company risk are added by the Bank) */
  function validate(cfg, bankId, type, amount, term, freq, grace) {
    const T = cfg.LOAN_TYPES[type], B = cfg.BANKS.banks[bankId], L = cfg.BANK_LOANS;
    if (!B) return { ok: false, reason: 'BANK' }; if (!T) return { ok: false, reason: 'TYPE' };
    if (!B.types.includes(type)) return { ok: false, reason: 'NOT_OFFERED' };
    if (T.lock === 'COLLATERAL') { if (!(cfg.COLLATERAL && cfg.COLLATERAL.enabled)) return { ok: false, reason: 'LOCKED_COLLATERAL' }; } else if (T.lock) return { ok: false, reason: 'LOCKED_' + T.lock };
    if (!(amount >= L.minAmount)) return { ok: false, reason: 'AMOUNT_MIN' };
    const fm = FM[freq]; if (!fm) return { ok: false, reason: 'FREQ' };
    if (!(term >= fm) || term > T.maxMonths || term % fm !== 0 || Math.floor(term) !== term) return { ok: false, reason: 'TERM' };
    grace = grace | 0; if (grace < 0 || grace > L.maxGraceMonths || grace > term || grace % fm !== 0) return { ok: false, reason: 'GRACE' };
    return { ok: true, reason: '' };
  }
  return { FM, r2, annuity, pmtFor, newLoan, monthInterest, isDueMonth, dueOf, schedule, validate };
});
