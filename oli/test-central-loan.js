/* Central bank loan: interest only on the REMAINING principal, grace period, instalments, early partial / full repayment, no penalty, schedule, books */
const H = require('./test-economy-helpers.js'), { E, EC, game, nextMonth } = H; let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++, console.log('  ok ', n); else fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); }; const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e) * Math.max(1, Math.abs(b));
const COST = { shell: 5247360000, stationsValue: 29 * 720000, pump: 810000000 }, V = Math.round(COST.shell + COST.stationsValue + COST.pump), R = EC.CENTRAL, r = R.rate / 12;
const fresh = () => { const g = game(R.startCash), co = g.co; co.acquireCentral(COST); co.injectEquity(3e11, 'test funding: stands in for sales'); return { g, co, J: () => co.journal.bal, int: () => co.journal.bal.EXP_INTEREST, L: () => co.centralLoan() }; };
const month = (c, n) => { const out = []; for (let i = 0; i < (n || 1); i++) { const i0 = c.int(), b0 = c.L() ? c.L().remaining : 0, cash0 = c.g.store.cash; nextMonth(c.co); out.push({ int: c.int() - i0, bal0: b0, bal1: c.L() && c.co.loans.includes(c.L()) ? c.L().remaining : 0 }); } return out; };

console.log('A. normal instalments: interest on the balance that is still owed');
{ const c = fresh(), rows = month(c, 27), bs = c.co.balanceSheet();
  ok(near(c.L().principal, V) && c.L().remaining < V, 'A1 the whole $' + (V / 1e6).toFixed(2) + 'M is a liability from day 1 and only falls after the grace');
  ok(rows.slice(0, 24).every(x => near(x.int, x.bal0 * r, 1e-9) && near(x.bal1, V, 1e-12)), 'A2 grace (24 months): interest only, on the unchanged balance; the balance does not move');
  ok(rows.slice(24).every(x => near(x.int, x.bal0 * r, 1e-9)) && rows[24].bal1 < rows[24].bal0, 'A3 after the grace every month\'s interest = (balance before the payment) × 6%/12, never on the original amount', rows.slice(24).map(x => [Math.round(x.int), Math.round(x.bal0 * r)]));
  ok(near(rows[25].bal0, rows[24].bal1, 1e-12) && rows[25].int < rows[24].int, 'A4 next period interest is computed on the NEW (reduced) balance');
  const tab = E.Company.loanTable(V, R.rate, R.months, R.grace); ok(near(rows[26].bal1, tab.rows[26].balance, 1e-9), 'A5 the balance follows the published schedule exactly');
  ok(Math.abs(bs.gap) < 1 && near(c.L().principal - c.L().remaining, c.L().prinPaid, 1e-9), 'A6 the books balance; principal paid = liability reduction (separate from interest expense)'); }

console.log('B. extra payment on the principal (during grace and after)');
{ const c = fresh(), co = c.co; month(c, 5); const l = c.L(), pre = co.centralReport(), cash0 = c.g.store.cash, i0 = c.int(); const e = co.prepayLoan(l.id, 1e9); const post = co.centralReport();
  ok(e.ok && near(l.remaining, V - 1e9, 1e-12) && l.months === 720 && l.rate === 0.06, 'B1 $1B extra: balance falls by exactly that; term (720) and rate (6%) unchanged');
  ok(near(cash0 - c.g.store.cash, 1e9 + e.accrued, 1e-12) && near(c.int() - i0, e.accrued, 1e-9) && e.fee === 0, 'B2 cash falls by the principal + the interest accrued to date, NO penalty; the principal is not an expense', [cash0 - c.g.store.cash, e.accrued]);
  ok(post.interestSaved > 0 && near(post.interestSaved, pre.futureInterest - post.futureInterest, 1e-9) && post.extraRepaid === 1e9, 'B3 the future interest saved = ' + (post.interestSaved / 1e6).toFixed(1) + 'M (before − after), shown with the extra repaid');
  ok(post.instalment < pre.instalment && post.table.rows.length === pre.table.rows.length, 'B4 the instalment is re-based on the smaller balance over the same months left: ' + Math.round(pre.instalment) + ' → ' + Math.round(post.instalment));
  const m = month(c, 1)[0]; ok(near(m.int + e.accrued, (V - 1e9) * r, 1e-9), 'B5 the month after the payment charges interest on (V − $1B) only', [m.int, e.accrued, (V - 1e9) * r]); }
{ const c = fresh(), co = c.co; month(c, 40); const l = c.L(), before = l.remaining, intBefore = l.intPaid, rep0 = co.centralReport(); const half = Math.round(before / 2); const e = co.prepayLoan(l.id, half);
  ok(e.ok && near(l.remaining, before - half, 1e-12), 'B6 half of the remaining loan repaid early: balance ' + (before / 1e6).toFixed(1) + 'M → ' + (l.remaining / 1e6).toFixed(1) + 'M');
  const m = month(c, 1)[0]; ok(near(m.bal0 * r, m.int + 0, 0.5) || m.int <= m.bal0 * r + 1, 'B7 the next month\'s interest runs only on the balance left', [m.int, m.bal0 * r]);
  const rep = co.centralReport(); ok(rep.interestSaved > 0.3 * rep0.futureInterest && rep.principalRepaid > half, 'B8 half repaid -> a large part of the future interest is saved: ' + (rep.interestSaved / 1e9).toFixed(2) + 'B of ' + (rep0.futureInterest / 1e9).toFixed(2) + 'B', [rep.interestSaved, rep0.futureInterest]);
  const tab = rep.table; ok(tab.rows[0].m === l.paid + 1 && near(tab.rows[tab.rows.length - 1].balance, 0, 1e-6) && tab.rows.length === 720 - l.paid, 'B9 the displayed schedule is the new one: from the current month to month 720, ends at 0'); }

console.log('C. full early repayment stops interest at once');
{ const c = fresh(), co = c.co; month(c, 30); const l = c.L(), rem = l.remaining, rep0 = co.centralReport(); const cash0 = c.g.store.cash, e = co.prepayLoan(l.id, null); const rep = co.centralReport();
  ok(e.ok && e.full && !co.loans.includes(l) && co.closed.includes(l) && rep.loan === 0 && !rep.open, 'C1 full repayment: the loan closes, balance 0');
  ok(near(cash0 - c.g.store.cash, rem + e.accrued, 1e-12) && e.fee === 0, 'C2 paid exactly the balance + interest accrued to date, no early-repayment fee', [cash0 - c.g.store.cash, rem]);
  ok(near(rep.interestSaved, rep0.futureInterest, 1e-9) && rep.interestSaved > 1e9, 'C3 all the remaining interest is saved: ' + (rep.interestSaved / 1e9).toFixed(2) + 'B');
  const i0 = c.int(); const ms = month(c, 6); ok(ms.every(x => x.int === 0) && c.int() === i0, 'C4 six months later: NO interest booked on money that was repaid', ms);
  ok(Math.abs(co.balanceSheet().gap) < 1 && co.balanceSheet().loans === 0 && co.centralValue() === V, 'C5 the books balance; the liability is gone, the asset stays'); }

console.log('D. loan runs to its end');
{ const c = fresh(), co = c.co; const l = c.L(); let tot = 0; for (let m = 0; m < 720; m++) { const i0 = c.int(); nextMonth(co); tot += c.int() - i0; }
  const tab = E.Company.loanTable(V, R.rate, R.months, R.grace);
  ok(!co.loans.includes(l) && co.closed.includes(l) && l.remaining < 0.5 && co.balanceSheet().loans < 0.5, 'D1 after 720 months the loan is closed and the balance is zero', l.remaining);
  ok(Math.abs(tot - tab.totalInterest) < 10, 'D2 total interest paid over 60 years = the schedule: $' + (tot / 1e9).toFixed(3) + 'B (schedule ' + (tab.totalInterest / 1e9).toFixed(3) + 'B)', [tot, tab.totalInterest]);
  ok(near(l.prinPaid, V, 1e-9) && near(co.centralReport().interestPaid, tot, 1e-9), 'D3 principal repaid = the full loan; interest paid is reported'); }

console.log('E. mid-month repayment: no interest on money already repaid, no double charge');
{ const c = fresh(), co = c.co; month(c, 30); const CAL = require('./game-calendar.js'); const d = CAL.fromHours(co.hours); void d; co.advanceHours(15 * 24 + 6); const l = c.L(), bal = l.remaining, dd = CAL.fromHours(co.hours), frac = ((dd.day - 1) * 24 + dd.hour) / (dd.daysInMonth * 24);
  const a = Math.round(bal / 2), i0 = c.int(), e = co.prepayLoan(l.id, a); ok(near(e.accrued, bal * r * frac, 1e-9) && frac > 0.3 && frac < 0.7, 'E1 the interest accrued so far this month (' + (frac * 100).toFixed(0) + '% of the month) is settled on the balance as it was', [e.accrued, bal * r * frac]);
  nextMonth(co); const total = c.int() - i0; ok(near(total, bal * r * frac + (bal - a) * r * (1 - frac), 1e-9), 'E2 that month\'s total interest = old balance for the days before + the reduced balance for the days after (nothing on the repaid half afterwards)', [total, bal * r * frac + (bal - a) * r * (1 - frac)]); }

console.log('F. guards, panel numbers, save / load');
{ const c = fresh(), co = c.co; const l = c.L(); const cashHi = c.g.store.cash; c.g.store.cash = 1000; const e = co.prepayLoan(l.id, 5e8); ok(!e.ok && e.reason === 'cash' && l.remaining === V, 'F1 not enough cash: refused, nothing changes'); c.g.store.cash = cashHi;
  ok(!co.prepayLoan(l.id, 0).ok && !co.prepayLoan(l.id, -5).ok, 'F2 zero / negative amounts are refused'); const e2 = co.prepayLoan(l.id, V * 5); ok(e2.ok && e2.full && near(e2.paid, V, 1e-12), 'F3 an amount above the balance repays exactly the balance');
  const c2 = fresh(); month(c2, 3); c2.co.prepayLoan(c2.L().id, 7e8); const rep = c2.co.centralReport(); ok(['loan', 'accrued', 'principalRepaid', 'interestPaid', 'interestSaved', 'extraRepaid', 'futureInterest', 'instalment'].every(k => typeof rep[k] === 'number') && near(rep.interestPaid, c2.int(), 1e-9) && rep.interestPaid > 3 * (V - 7e8) * r, 'F4 the panel numbers exist: balance, accrued interest, principal repaid, total interest paid, interest saved, future interest', Object.keys(rep));
  const j = JSON.parse(JSON.stringify(c2.co.toJSON())), co3 = new E.Company(c2.g.store, c2.g.net, c2.g.sim, { now: () => 1e12 }); co3.fromJSON(j); const l3 = co3.centralLoan(); ok(l3 && near(l3.remaining, c2.L().remaining, 1e-12) && l3.extra === 7e8 && near(co3.centralReport().interestSaved, rep.interestSaved, 1e-12), 'F5 the repayment progress, savings and re-based instalment survive save / load'); }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
