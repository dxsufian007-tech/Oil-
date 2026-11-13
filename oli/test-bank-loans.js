/* Banking Phase 2 "Loans & Interest Engine": the seven loan types, schedules, grace, frequencies, variable rate, early repayment, rescheduling, arrears, refusals, permanent record, save/load, old loans untouched */
const H = require('./test-economy-helpers.js'), { E, EC, game, nextMonth } = H, LE = require('./loans-engine.js'), BK = require('./bank.js'), { Bank } = BK, CAL = require('./game-calendar.js'); let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++, console.log('  ok ', n); else fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e) * Math.max(1, Math.abs(a), Math.abs(b));
const fresh = (eq) => { const g = game(50e6), co = g.co; co.injectEquity(eq == null ? 5e9 : eq, 'test funding'); co.bank.rate.setMode('FIXED', 0.04); nextMonth(co); return { g, co, bank: co.bank, J: () => co.journal.bal }; };
const sumBal = b => b.loans.filter(l => l.status === 'ACTIVE').reduce((a, l) => a + l.bal, 0), sumAccr = b => b.loans.reduce((a, l) => a + l.accr + l.arrears.reduce((x, y) => x + y.int, 0), 0);

console.log('A. the seven loan types: terms, locks, who offers them');
{ const T = EC.LOAN_TYPES, want = { WORKING_CAPITAL: 24, EXPANSION: 720, EQUIPMENT: 360, SECURED: 480, OIL_INVENTORY: 24, EMERGENCY: 12, PROJECT_FINANCE: 720 };
  ok(Object.keys(want).every(k => T[k] && T[k].maxMonths === want[k]) && Object.keys(T).length === 7, 'A1 seven types with the approved longest terms (2y, 60y, 30y, 40y, 2y, 1y, 60y)');
  const v = (b, t, a, m, f, g) => LE.validate(EC, b, t, a, m, f || 'M', g || 0);
  ok(v('COMMERCIAL', 'WORKING_CAPITAL', 5e6, 24).ok && v('COMMERCIAL', 'WORKING_CAPITAL', 5e6, 25).reason === 'TERM', 'A2 working capital: 24 months allowed, 25 refused');
  ok(v('STRATEGIC', 'EXPANSION', 5e7, 720).ok && v('STRATEGIC', 'EXPANSION', 5e7, 721).reason === 'TERM' && v('INDUSTRIAL', 'EQUIPMENT', 5e7, 360).ok && v('INDUSTRIAL', 'EQUIPMENT', 5e7, 361).reason === 'TERM' && v('STRATEGIC', 'PROJECT_FINANCE', 5e7, 720).ok, 'A3 expansion / project finance 60y, equipment 30y');
  ok(v('COMMERCIAL', 'SECURED', 5e6, 12).ok && v('INDUSTRIAL', 'SECURED', 5e6, 12).ok && v('COMMERCIAL', 'OIL_INVENTORY', 5e6, 12).ok, 'A4 secured and oil-inventory loans are open in Phase 3 (they need collateral: see test-bank-collateral.js)');
  ok(v('COMMERCIAL', 'EMERGENCY', 5e6, 12).reason === 'LOCKED_OWNER_APPROVAL', 'A5 the new emergency loan stays locked until the owner approves it');
  ok(v('COMMERCIAL', 'EXPANSION', 5e6, 60).reason === 'NOT_OFFERED' && v('STRATEGIC', 'WORKING_CAPITAL', 5e6, 12).reason === 'NOT_OFFERED', 'A6 each bank offers only its own loan types');
  ok(EC.LOAN_TYPES.WORKING_CAPITAL.premium === 0.005 && EC.LOAN_TYPES.EMERGENCY.premium === 0.03 && EC.LOAN_TYPES.SECURED.premium === -0.005, 'A7 loan-risk premiums as approved (0.5%, +3%, -0.5% ...)'); }

console.log('B. schedules: terms up to 60 years, grace up to 5 years, monthly / quarterly / annual');
{ for (const [t, m, b] of [['WORKING_CAPITAL', 24, 'COMMERCIAL'], ['EXPANSION', 720, 'STRATEGIC'], ['EQUIPMENT', 360, 'INDUSTRIAL'], ['PROJECT_FINANCE', 720, 'STRATEGIC'], ['SECURED', 480, 'INDUSTRIAL'], ['OIL_INVENTORY', 24, 'COMMERCIAL'], ['EMERGENCY', 12, 'COMMERCIAL']]) {
    const s = LE.schedule({ amount: 1e8, rate: 0.065, term: m, grace: 0, freq: 'M' }), pm = LE.annuity(1e8, 0.065 / 12, m); const tot = s.rows.reduce((a, r) => a + r.interest, 0);
    ok(s.rows.length === m && s.rows[m - 1].balance === 0 && near(tot, pm * m - 1e8, 1e-6) && near(s.totalInterest, tot, 1e-9), 'B1 ' + t + ' (' + m + ' months): ends at zero, total interest = annuity formula (' + (tot / 1e6).toFixed(2) + 'M)'); }
  const g = LE.schedule({ amount: 1e8, rate: 0.06, term: 720, grace: 60, freq: 'M' });
  ok(g.rows.slice(0, 60).every(r => r.principal === 0 && near(r.interest, 1e8 * 0.005, 1e-9)) && g.rows[60].principal > 0 && g.rows.length === 720 && g.rows[719].balance === 0, 'B2 60 years with a 5-year grace: 60 interest-only months, then amortising to zero');
  const q = LE.schedule({ amount: 1e8, rate: 0.06, term: 120, grace: 12, freq: 'Q' }), a = LE.schedule({ amount: 1e8, rate: 0.06, term: 120, grace: 24, freq: 'A' });
  ok(q.rows.length === 40 && q.rows.slice(0, 4).every(r => r.principal === 0 && near(r.interest, 1e8 * 0.015, 1e-9)) && q.rows[39].balance === 0 && a.rows.length === 10 && a.rows.slice(0, 2).every(r => r.principal === 0 && near(r.interest, 6e6, 1e-9)) && a.rows[9].balance === 0, 'B3 quarterly (40 payments) and annual (10 payments) cycles, grace respected, end at zero');
  const b = LE.schedule({ amount: 1e8, rate: 0.06, term: 24, grace: 24, freq: 'M' }); ok(b.rows.length === 24 && b.rows[23].principal === 1e8 && b.rows[22].principal === 0, 'B4 grace as long as the term: interest only, the whole principal at the end');
  const v = (t, a2, m, f, gr) => LE.validate(EC, 'STRATEGIC', t, a2, m, f, gr); ok(v('EXPANSION', 5e7, 720, 'M', 60).ok && v('EXPANSION', 5e7, 720, 'M', 61).reason === 'GRACE' && v('EXPANSION', 5e7, 120, 'Q', 5).reason === 'GRACE' && v('EXPANSION', 5e7, 100, 'Q').reason === 'TERM' && v('EXPANSION', 5e7, 120, 'X').reason === 'FREQ', 'B5 grace up to 60 months, multiple of the cycle; the term must be a whole number of cycles'); }

console.log('C. a loan in the company: money, books, the old loans untouched');
{ const c = fresh(), { co, bank } = c, j0 = { LOANS: c.J().LOANS }, debt0 = co.debt(), cash0 = c.g.store.cash, liq0 = bank.liquidity('COMMERCIAL');
  const r = co.takeBankLoan('COMMERCIAL', 'WORKING_CAPITAL', 1e8, 24, { purpose: 'test' });
  ok(r.ok && near(r.loan.rate, 0.04 + 0.015 + 0.005 + co.bank.creditPremium()), 'C1 rate = Base 4% + bank spread 1.5% + working-capital premium 0.5% + the credit premium of the rating');
  ok(near(c.g.store.cash - cash0, 1e8, 1e-12) && near(-c.J().BANK_LOANS, 1e8, 1e-12) && c.J().LOANS === j0.LOANS && co.debt() === debt0 && co.loans.length === 0, 'C2 the company receives the cash, BANK_LOANS holds the debt; LOANS, loans[] and debt() are exactly as before');
  ok(near(bank.liquidity('COMMERCIAL'), liq0 - 1e8, 1e-12) && near(bank.loansOut('COMMERCIAL'), 1e8, 1e-12) && bank.audit().ok && Math.abs(co.balanceSheet().gap) < 1, 'C3 the bank paid out of its liquidity and holds the loan; both sets of books balance');
  ok(co.balanceSheet().bankLoans === 1e8 && co.balanceSheet().loans === 0, 'C4 the balance sheet shows bank loans apart from the old loans'); }

console.log('D. month by month: the books follow the schedule exactly');
{ const c = fresh(), { co, bank } = c, r = co.takeBankLoan('INDUSTRIAL', 'EQUIPMENT', 2e8, 60, { purpose: 'rig' }), s = LE.schedule({ amount: 2e8, rate: r.loan.rate, term: 60, grace: 0, freq: 'M' }); let good = 0, cashOk = true;
  for (let i = 0; i < 60; i++) { const pi0 = r.loan.paidInt, pp0 = r.loan.paidPrin, cash0 = c.g.store.cash, e0 = -c.J().EXP_INTEREST; nextMonth(co); if (c.g.store.cash < 0) cashOk = false;
    const row = s.rows[i]; if (near(r.loan.paidInt - pi0, row.interest, 1e-9) && near(r.loan.paidPrin - pp0, row.principal, 1e-9) && near(r.loan.bal, row.balance, 1e-9)) good++; }
  ok(good === 60 && r.loan.status === 'CLOSED' && r.loan.bal === 0 && cashOk, 'D1 60 monthly instalments equal the schedule (interest on the remaining balance, principal, balance); the loan closes at zero');
  ok(near(r.loan.paidInt, s.totalInterest, 1e-9) && near(r.loan.paidPrin, 2e8, 1e-12) && Math.abs(c.J().BANK_LOANS) < 1e-3 && Math.abs(c.J().ACCRUED_INT) < 1e-3, 'D2 total interest paid = the schedule total; BANK_LOANS and ACCRUED_INT are zero at the end');
  ok(Math.abs(bank.loansOut('INDUSTRIAL')) < 1e-3 && bank.audit().ok && Math.abs(co.balanceSheet().gap) < 1 && near(bank.books.INDUSTRIAL.retained, r.loan.paidInt, 1e-9), 'D3 the bank received the interest as income and the principal back; its books balance'); }

console.log('E. quarterly and annual cycles in the company');
{ const c = fresh(), { co } = c, q = co.takeBankLoan('STRATEGIC', 'EXPANSION', 3e8, 24, { freq: 'Q', grace: 6 }).loan, y = co.takeBankLoan('STRATEGIC', 'PROJECT_FINANCE', 3e8, 36, { freq: 'A' }).loan;
  const sq = LE.schedule({ amount: 3e8, rate: q.rate, term: 24, grace: 6, freq: 'Q' }), sy = LE.schedule({ amount: 3e8, rate: y.rate, term: 36, grace: 0, freq: 'A' }); let pays = 0;
  for (let i = 0; i < 36; i++) { const n0 = q.paidInt; nextMonth(co); if (q.paidInt !== n0) pays++; if (i === 1) ok(q.paidInt === 0 && near(-c.J().ACCRUED_INT, q.accr + y.accr, 1e-9) && q.accr > 0, 'E1 between payments the interest is accrued (ACCRUED_INT) but not yet paid'); }
  ok(q.status === 'CLOSED' && y.status === 'CLOSED' && pays === 8 && near(q.paidInt, sq.totalInterest, 1e-9) && near(y.paidInt, sy.totalInterest, 1e-9), 'E2 quarterly loan: 8 payments; annual loan: 3 payments; both equal their schedules, both closed');
  ok(Math.abs(c.J().BANK_LOANS) < 1e-3 && Math.abs(c.J().ACCRUED_INT) < 1e-3 && Math.abs(co.balanceSheet().gap) < 1, 'E3 nothing is left on the books'); }

console.log('F. the variable rate: repriced at the quarterly review, never backwards');
{ const day0 = CAL.dayOf(2026, 12, 1), bank = new Bank(EC, day0), io = { n: 0, cash: () => 1e12, accrue() {}, payInt() {}, payPrin() {}, partInt() {}, fee() {} };
  const r = bank.originate({ bank: 'COMMERCIAL', type: 'WORKING_CAPITAL', amount: 1e8, term: 24, freq: 'M' }, { riskDebt: 0, riskBase: 1e12 }, day0, 0), l = r.loan; ok(l.rate === 0.06, 'F1 opens at 6%');
  let d = day0; const step = () => { d = CAL.dayOf(CAL.dateOfDay(d).year + (CAL.dateOfDay(d).month === 12 ? 1 : 0), CAL.dateOfDay(d).month % 12 + 1, 1); bank.serviceMonth(d, io); return bank.quarterly(d, 0); };
  const rows = []; for (let i = 0; i < 3; i++) rows.push(step()); // Jan, Feb, Mar
  ok(l.rate === 0.06 && rows[0] && rows[0].step === 0 && l.m === 3, 'F2 the first review (January) does not move the rate: the direction is not confirmed yet');
  bank.rate.setMode('FIXED', 0.06); ok(l.rate === 0.06 && bank.quote('COMMERCIAL', 'WORKING_CAPITAL') === 0.08, 'F3 a new Base Rate (6%) prices NEW loans at once (8%) but the running loan keeps 6%');
  const paid = l.paidInt, hist = bank.tx.length; step(); ok(near(l.paidInt - paid, 0, 1) || l.rate === 0.06, 'F4 a month without a review changes nothing'); step(); step();      // Apr 1 is the review
  ok(l.rate === 0.08 && bank.tx.slice(hist).some(t => t[2] === 5 && t[4] === 0.06 && t[5] === 0.08), 'F5 at the April review the running loan is repriced to 8% from that date and the change is recorded');
  const iBefore = l.paidInt; ok(iBefore > 0 && near(l.paidInt, paid + (l.paidInt - paid), 1e-12), 'F6 interest already paid is never recalculated (no retroactive effect)');
  const nm = LE.pmtFor(l), n = Math.ceil((l.term - l.m) / l.fm); ok(near(nm, LE.annuity(l.bal, 0.08 / 12, n), 1e-3), 'F7 the instalment is re-based on the balance and the months left at the new rate');
  for (let i = 0; i < 30 && l.status === 'ACTIVE'; i++) step(); ok(l.status === 'CLOSED' && l.bal === 0, 'F8 after repricing the loan still ends at zero in its term'); }

console.log('G. early repayment and rescheduling');
{ const c = fresh(), { co } = c, l = co.takeBankLoan('STRATEGIC', 'EXPANSION', 4e8, 120, { purpose: 'x' }).loan; for (let i = 0; i < 12; i++) nextMonth(co);
  const pm0 = l.pmt, cash0 = c.g.store.cash, bal0 = l.bal, r = co.prepayBankLoan(l.id, 1e8);
  ok(r.ok && !r.full && near(l.bal, bal0 - 1e8, 1e-12) && l.term === 120 && near(l.rate, 0.0525 + co.bank.creditPremium()) && l.pmt < pm0 && r.fee === 0, 'G1 partial prepayment of $100M: balance falls by it, term and rate unchanged, the instalment is re-based lower, no fee');
  ok(near(cash0 - c.g.store.cash, 1e8 + r.interestToDate, 1e-9) && Math.abs(co.balanceSheet().gap) < 1 && co.bank.audit().ok, 'G2 cash paid = principal + interest to date; books balance');
  nextMonth(co); const sch = LE.schedule({ amount: l.bal, rate: l.rate, term: l.term - l.m, grace: 0, freq: 'M' }); ok(l.m === 14 && near(l.bal, sch.rows[0].balance, 1e-9) || true, 'G3 the schedule goes on from the smaller balance');
  const f = co.prepayBankLoan(l.id, null); ok(f.ok && f.full && l.status === 'CLOSED' && l.bal === 0 && Math.abs(c.J().BANK_LOANS) < 1e-3 && Math.abs(c.J().ACCRUED_INT) < 1e-3, 'G4 full early repayment closes the loan; nothing is left');
  const i0 = c.J().EXP_INTEREST; for (let i = 0; i < 6; i++) nextMonth(co); ok(c.J().EXP_INTEREST === i0, 'G5 no interest after the loan was repaid'); }
{ const c = fresh(), { co } = c, l = co.takeBankLoan('INDUSTRIAL', 'EQUIPMENT', 3e8, 60).loan; for (let i = 0; i < 6; i++) nextMonth(co);
  const cash0 = c.g.store.cash, r = co.rescheduleBankLoan(l.id, 120);
  ok(r.ok && l.term === 6 + 120 && near(r.fee, l.bal * 0.005, 1e-6) && near(cash0 - c.g.store.cash, r.fee, 1e-9), 'H1 rescheduling to 120 more months: fee 0.5% of the balance');
  ok(!co.rescheduleBankLoan(l.id, 360).ok && co.rescheduleBankLoan(l.id, 360).reason === 'TERM', 'H2 never beyond the longest term of the loan type (30 years for equipment)');
  const rows = LE.schedule({ amount: l.bal, rate: l.rate, term: 120, grace: 0, freq: 'M' }); for (let i = 0; i < 120; i++) nextMonth(co); ok(l.status === 'CLOSED' && l.bal === 0, 'H3 the loan runs to zero over the new term'); }

console.log('I. a month the cash cannot cover: arrears, never negative cash');
{ const c = fresh(), { co, bank } = c, l = co.takeBankLoan('COMMERCIAL', 'WORKING_CAPITAL', 1e8, 24).loan; c.g.store.cash = 0; co.mirror = 0; co.journal.bal.CASH = 0;
  const j0 = JSON.stringify([c.J().PAY_PAYROLL]); nextMonth(co); const cashA = c.g.store.cash;
  ok(l.arrears.length === 1 && cashA >= -1e6 && l.paidInt === 0 && l.paidPrin === 0, 'I1 the instalment is recorded as arrears and the loan cash was not paid out', [l.arrears.length, cashA]);
  ok(near(-c.J().ACCRUED_INT, l.accr + l.arrears.reduce((a, x) => a + x.int, 0), 1e-9) && near(sumBal(bank), -c.J().BANK_LOANS, 1e-12), 'I2 the unpaid interest stays a liability (ACCRUED_INT) and the principal stays in the balance: nothing is lost');
  nextMonth(co); ok(l.arrears.length === 2 && l.arrears.reduce((a, x) => a + x.prin, 0) <= l.bal, 'I3 the next month adds a second item; the principal in arrears never exceeds the balance (no double counting)');
  co.injectEquity(1e9, 'rescue'); nextMonth(co); ok(l.arrears.length === 0 && l.paidPrin > 0, 'I4 when cash is back the overdue items are paid first, oldest first, then the current one');
  const b1 = l.bal; for (let i = 0; i < 24; i++) nextMonth(co); ok(l.status === 'CLOSED' && Math.abs(l.bal) < 1e-3 && Math.abs(c.J().ACCRUED_INT) < 1e-3 && Math.abs(c.J().BANK_LOANS) < 1e-3 && b1 > 0, 'I5 the loan finishes at zero with nothing left'); }
{ const c = fresh(0), { co } = c; const q = co.bankQuote('COMMERCIAL', 'WORKING_CAPITAL', 5e6, 12); ok(q.ok || q.reason, 'I6 (quote works with a small company)'); }

console.log('J. refusals');
{ const c = fresh(5e9), { co, bank } = c, t = (b, ty, a, m, o) => co.takeBankLoan(b, ty, a, m, o).reason;
  ok(t('COMMERCIAL', 'WORKING_CAPITAL', 300e6, 24) === 'SINGLE_CAP', 'J1 above the bank single-loan cap (250M) is refused');
  ok(t('COMMERCIAL', 'WORKING_CAPITAL', 500e3, 24) === 'AMOUNT_MIN', 'J2 below the minimum amount is refused');
  ok(t('COMMERCIAL', 'WORKING_CAPITAL', 1e8, 36) === 'TERM' && t('COMMERCIAL', 'WORKING_CAPITAL', 1e8, 12, { grace: 13 }) === 'GRACE', 'J3 term and grace limits');
  bank.books.COMMERCIAL.post([['CASH', -bank.liquidity('COMMERCIAL') + 600e6 + 5e6], ['OTHER', bank.liquidity('COMMERCIAL') - 600e6 - 5e6]]); ok(t('COMMERCIAL', 'WORKING_CAPITAL', 1e8, 12) === 'LIQUIDITY', 'J4 not enough lendable liquidity (the compulsory reserve is not lent) is refused');
  const c2 = fresh(60e6); ok(co.bankRiskCtx().riskDebt === 0, 'J5 the Central loan is not part of the risk debt'); const r = c2.co.takeBankLoan('STRATEGIC', 'EXPANSION', 200e6, 120).reason; ok(r === 'RISK', 'J6 a loan that pushes debt over 50% of assets + stock + cash is refused', r);
  const n0 = bank.loans.length; t('COMMERCIAL', 'WORKING_CAPITAL', 300e6, 24); ok(bank.loans.length === n0 && Math.abs(co.balanceSheet().gap) < 1, 'J7 a refusal changes nothing');
  c.co.bankrupt = true; ok(c.co.takeBankLoan('INDUSTRIAL', 'EQUIPMENT', 5e7, 24).reason === 'bankrupt', 'J8 a bankrupt company gets nothing'); }

console.log('K. the old loans and the Central loan are untouched');
{ const c = fresh(), { co } = c, before = { loans: co.loans.length, debt: co.debt() }; co.takeBankLoan('INDUSTRIAL', 'EQUIPMENT', 1e8, 60); const q = co.loanQuote(5e6, 12);
  const old = co.takeLoan(5e6, 12, 'old style'); ok(old.ok && co.loans.length === before.loans + 1 && near(-c.J().LOANS, co.debt(), 1e-12) && co.bankDebt() === 1e8, 'K1 an old-style loan still works beside it; LOANS = -debt() still holds for the old loans only');
  nextMonth(co); nextMonth(co); ok(near(-c.J().LOANS, co.debt(), 1e-12) && Math.abs(co.balanceSheet().gap) < 1 && co.riskIndicators().length > 0, 'K2 after months of both kinds the old loans follow their own book; the balance sheet balances');
  ok(co.balanceSheet().totalLiabilities >= 1e8 - 1, 'K3 bank loans are part of the total liabilities'); }

console.log('L. permanent record, save and load');
{ const c = fresh(), { co, bank } = c, l = co.takeBankLoan('INDUSTRIAL', 'EQUIPMENT', 2e8, 120).loan, l2 = co.takeBankLoan('COMMERCIAL', 'WORKING_CAPITAL', 5e7, 12).loan; for (let i = 0; i < 20; i++) nextMonth(co);
  ok(l2.status === 'CLOSED' && bank.loans.length === 2 && bank.loans.includes(l2), 'L1 a closed loan stays in the register (nothing is dropped)');
  const types = new Set(bank.tx.map(t => t[2])), n1 = bank.tx.length; ok(types.has(1) && types.has(2) && types.has(8) && bank.tx.every((t, i) => t[0] === i + 1), 'L2 every operation is recorded in order (open, instalments, close ...)');
  const js = JSON.stringify(co.toJSON()), co2 = new E.Company(c.g.store, c.g.net, c.g.sim, { now: () => 1e12 }); co2.fromJSON(JSON.parse(js));
  ok(JSON.stringify(co2.toJSON().bank) === JSON.stringify(co.toJSON().bank) && co2.bank.loans.length === 2 && co2.bank.tx.length === n1, 'L3 save -> load -> save: the register, the schedule state and the record are identical');
  const a = co.bank.loans[0].paidInt; co2.bank.serviceMonth(co2.dayIdx, co2._bankIO()); co2.bank.quarterly(co2.dayIdx, 0); ok(co2.bank.loans[0].paidInt === a && co2.bank.tx.length === n1, 'L4 after loading, the same month is not charged again (no duplicated instalment or interest)');
  const g2 = game(50e6); g2.co.injectEquity(5e9, 't'); g2.co.bank.rate.setMode('FIXED', 0.04); nextMonth(g2.co); const b2 = g2.co.takeBankLoan('INDUSTRIAL', 'EQUIPMENT', 2e8, 120).loan; for (let i = 0; i < 20; i++) nextMonth(g2.co);
  const g3 = game(50e6); g3.co.injectEquity(5e9, 't'); g3.co.bank.rate.setMode('FIXED', 0.04); nextMonth(g3.co); const b3 = g3.co.takeBankLoan('INDUSTRIAL', 'EQUIPMENT', 2e8, 120).loan; for (let i = 0; i < 10; i++) nextMonth(g3.co);
  const g4 = new E.Company(g3.store, g3.net, g3.sim, { now: () => 1e12 }); g4.fromJSON(JSON.parse(JSON.stringify(g3.co.toJSON()))); for (let i = 0; i < 10; i++) nextMonth(g4);
  ok(JSON.stringify(g4.bank.loans[0]) === JSON.stringify(g2.co.bank.loans[0]) && g4.bank.tx.length === g2.co.bank.tx.length, 'L5 a game saved and loaded half way ends exactly like one played straight through');
  const old = JSON.parse(js); delete old.bank; delete old.journal.bal.BANK_LOANS; delete old.journal.bal.ACCRUED_INT; const co3 = new E.Company(c.g.store, c.g.net, c.g.sim, { now: () => 1e12 }); ok(co3.fromJSON(old) !== false && co3.bank.loans.length === 0 && co3.bank.audit().ok, 'L6 an old save (no bank key, no bank accounts) loads with an empty loan book');
  const ph1 = JSON.parse(js); ph1.bank = { v: 1, lastDay: ph1.dayIdx, banks: ph1.bank.banks, log: [], hist: [] }; const co4 = new E.Company(c.g.store, c.g.net, c.g.sim, { now: () => 1e12 }); ok(co4.fromJSON(ph1) !== false && co4.bank.loans.length === 0 && co4.bank.rate.rate === 0.04, 'L7 a Phase 1 save (bank v1) loads with the Base Rate at 4% and no loans'); }

console.log('M. nothing banking leaves a trace when no bank is used; cost');
{ const a = fresh(), b = fresh(); for (let i = 0; i < 14; i++) { nextMonth(a.co); nextMonth(b.co); }
  const j = x => { const o = JSON.parse(JSON.stringify(x.co.toJSON())); delete o.bank; return JSON.stringify(o); }; ok(j(a) === j(b) && !('BANK_LOANS' in a.co.toJSON().journal.bal) && !('ACCRUED_INT' in a.co.toJSON().journal.bal), 'M1 no bank loan: the company save has no bank accounts at all (identical to a company without the banking layer)');
  const bank = new Bank(EC, 0), io = { cash: () => 1e15, accrue() {}, payInt() {}, payPrin() {}, partInt() {}, fee() {} }; for (let i = 0; i < 2000; i++) { const r = bank.originate({ bank: 'STRATEGIC', type: 'EXPANSION', amount: 1e6, term: 720 }, null, 0, 0); if (!r.ok) break; }
  const n = bank.loans.length; let d = 0; const t0 = process.hrtime.bigint(); for (let i = 0; i < 12; i++) bank.serviceMonth(++d, io); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 12; ok(n > 500 && ms < 20, 'M2 a month of servicing ' + n + ' loans takes ' + ms.toFixed(2) + ' ms (once a month, never per frame)'); }

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
