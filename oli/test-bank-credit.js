/* Banking Phase 3: the credit rating 0..1000 (weights 30 / 25 / 15 / 15 / 10 / 5), grades, premium, payment history, save / load */
const H = require('./test-economy-helpers.js'), { EC, game, nextMonth } = H, CR = require('./credit.js'), { Bank } = require('./bank.js'); let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++, console.log('  ok ', n); else fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const C = EC.CREDIT, best = { onTime: 24, late: 0, arrearsNow: 0, opMargin: 0.3, debtToAssets: 0.1, netMargin: 20, currentRatio: 2, prodCV: 0.1 }, worst = { onTime: 0, late: 24, arrearsNow: 4, opMargin: -0.2, debtToAssets: 0.8, netMargin: -20, currentRatio: 0.5, prodCV: 0.6 };

console.log('A. the score: range and the approved weights');
{ const W = C.weights; ok(Math.abs(Object.values(W).reduce((a, b) => a + b, 0) - 1) < 1e-12 && W.pay === 0.30 && W.cf === 0.25 && W.debt === 0.15 && W.prof === 0.15 && W.liq === 0.10 && W.stab === 0.05, 'A1 weights 30 / 25 / 15 / 15 / 10 / 5 (sum 100%)');
  ok(CR.score(best, C).score === 1000 && CR.score(worst, C).score === 0, 'A2 the best company scores 1000 and the worst 0');
  let seed = 7, rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff, bad = 0;
  for (let i = 0; i < 5000; i++) { const s = CR.score({ onTime: (rnd() * 30) | 0, late: (rnd() * 30) | 0, arrearsNow: (rnd() * 6) | 0, opMargin: rnd() < .1 ? null : rnd() * 3 - 1.5, debtToAssets: rnd() < .1 ? null : rnd() * 3, netMargin: rnd() < .1 ? null : rnd() * 400 - 200, currentRatio: rnd() < .1 ? null : rnd() * 10 - 2, prodCV: rnd() < .1 ? null : rnd() * 4 }, C).score; if (!(s >= 0 && s <= 1000 && Number.isInteger(s))) bad++; }
  ok(bad === 0, 'A3 5000 random inputs (including missing and extreme values): always an integer in 0..1000');
  const f = (k, v) => CR.score(Object.assign({}, best, { [k]: v }), C).score;
  ok(1000 - CR.score(Object.assign({}, best, { onTime: 0, late: 24 }), C).score === 300 && 1000 - f('opMargin', -0.2) === 250 && 1000 - f('debtToAssets', 0.8) === 150 && 1000 - f('netMargin', -20) === 150 && 1000 - f('currentRatio', 0.5) === 100 && 1000 - f('prodCV', 0.6) === 50, 'A4 each indicator moves the score by exactly its weight: 300 / 250 / 150 / 150 / 100 / 50');
  ok(CR.score(Object.assign({}, best, { late: 6 }), C).score < CR.score(best, C).score, 'A5 late payments lower the score'); }

console.log('B. indicators');
{ ok(CR.cv([5, 5, 5, 5, 5, 5]) === 0 && CR.cv([5, 5]) === null && CR.cv([0, 0, 0]) === 1 && Math.abs(CR.cv([2, 4, 6]) - Math.sqrt(8 / 3) / 4) < 1e-12, 'B1 operational stability = coefficient of variation of production over up to 6 months (needs 3)');
  const n = CR.parts({}, C); ok(Object.keys(n).every(k => n[k] === C.neutral[k]), 'B2 a new company with no history gets neutral values (no punishment for being new)');
  const p = CR.parts({ onTime: 10, late: 0, arrearsNow: 0, opMargin: 0.05, debtToAssets: 0.45, netMargin: 0, currentRatio: 1.25, prodCV: 0.35 }, C); ok(Math.abs(p.cf - 0.5) < 1e-12 && Math.abs(p.debt - 0.5) < 1e-12 && Math.abs(p.prof - 0.5) < 1e-12 && Math.abs(p.liq - 0.5) < 1e-12 && Math.abs(p.stab - 0.5) < 1e-12 && p.pay === 1, 'B3 linear mid-points give 0.5');
  ok(CR.gradeOf(700, C) === 'A' && CR.gradeOf(699, C) === 'B' && CR.gradeOf(550, C) === 'B' && CR.gradeOf(400, C) === 'C' && CR.gradeOf(250, C) === 'D' && CR.gradeOf(249, C) === 'E' && CR.gradeOf(0, C) === 'E', 'B4 grade limits');
  const pr = [1000, 700, 699, 550, 400, 250, 0].map(s => CR.premiumOf(s, C)); ok(pr.every((x, i) => !i || x >= pr[i - 1]) && pr[0] === 0 && pr[6] === 0.03, 'B5 a worse score never gets a cheaper credit premium (0 .. +3%)', pr); }

console.log('C. the rating inside the company');
{ const g = game(50e6), co = g.co; co.injectEquity(5e9, 't'); co.bank.rate.setMode('FIXED', 0.04); ok(co.creditScore() === null && co.bank.creditPremium() === 0, 'C1 before the first month there is no rating and the premium is 0');
  nextMonth(co); const s1 = co.creditScore(); ok(s1 >= 0 && s1 <= 1000 && co.bank.credit.grade && co.bank.credit.parts, 'C2 the first month rates the company (' + s1 + ', grade ' + co.bank.credit.grade + ')');
  const d = co.bank.credit.day, h = co.bank.credit.hist.length; ok(co.bank.rateMonth(d, {}) === null && co.bank.credit.hist.length === h, 'C3 a month already rated is never rated twice');
  const q = co.bankQuote('COMMERCIAL', 'WORKING_CAPITAL', 5e6, 12); ok(q.ok && Math.abs(q.rate - (0.04 + 0.015 + 0.005 + co.bank.creditPremium())) < 1e-9, 'C4 a new loan is priced with the credit premium of the rating');
  const l = co.takeBankLoan('COMMERCIAL', 'WORKING_CAPITAL', 5e7, 24).loan; const r0 = l.rate; co.bank.credit.score = 100; co.bank.credit.grade = 'E'; co.bank.rate.setMode('FIXED', 0.04);
  for (let i = 0; i < 4; i++) nextMonth(co); ok(l.rate !== r0 || co.bank.credit.score !== 100, 'C5 at the next repricing the loan follows the new credit premium (and only from then on)', [r0, l.rate]); }

console.log('D. payment history lowers the score');
{ const mk = cash => { const g = game(50e6), co = g.co; co.injectEquity(5e9, 't'); co.bank.rate.setMode('FIXED', 0.04); nextMonth(co); co.takeBankLoan('INDUSTRIAL', 'EQUIPMENT', 2e8, 60); return { g, co }; };
  const a = mk(), b = mk(); for (let i = 0; i < 6; i++) nextMonth(a.co); b.g.store.cash = 0; b.co.journal.bal.CASH = 0; for (let i = 0; i < 6; i++) { b.g.store.cash = Math.min(b.g.store.cash, 0); nextMonth(b.co); }
  ok(b.co.bank.loans[0].arrears.length > 0 && b.co.bank.credit.parts.pay < a.co.bank.credit.parts.pay && b.co.creditScore() < a.co.creditScore(), 'D1 a company that cannot pay its instalments scores lower than one that pays on time (' + b.co.creditScore() + ' vs ' + a.co.creditScore() + ')');
  ok(a.co.bank.credit.parts.pay === 1 && a.co.bank.tx.filter(t => t[2] === 2).length === 6, 'D2 six instalments paid on time give a full payment-history part'); }

console.log('E. save / load');
{ const g = game(50e6), co = g.co; co.injectEquity(5e9, 't'); nextMonth(co); nextMonth(co); co.takeBankLoan('COMMERCIAL', 'WORKING_CAPITAL', 5e7, 12); nextMonth(co);
  const js = JSON.stringify(co.toJSON()), co2 = new (require('./economy.js').Company)(g.store, g.net, g.sim, { now: () => 1e12 }); co2.fromJSON(JSON.parse(js));
  ok(JSON.stringify(co2.toJSON().bank) === JSON.stringify(co.toJSON().bank) && co2.creditScore() === co.creditScore(), 'E1 save -> load -> save: the rating, its history and the parts are identical');
  const n = co2.bank.credit.hist.length; co2.bank.rateMonth(co2.bank.credit.day, {}); ok(co2.bank.credit.hist.length === n, 'E2 after loading, the same month is not rated again');
  const old = JSON.parse(js); old.bank = { v: 2, lastDay: old.dayIdx, banks: old.bank.banks, log: [], hist: [], rate: old.bank.rate, loans: [], tx: [], nextLoan: 1, nextTx: 1, svcDay: old.dayIdx }; const co3 = new (require('./economy.js').Company)(g.store, g.net, g.sim, { now: () => 1e12 }); ok(co3.fromJSON(old) !== false && co3.creditScore() === null && co3.bank.liens.length === 0, 'E3 a Phase 2 save (bank v2) loads with no rating yet and no liens; it is rated at the next month end'); }

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
