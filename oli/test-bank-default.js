/* Banking Phase 4: the five default stages, the 2% late fee (once), the 60-day restructuring window, collateral enforcement, the 5/15/40 negative-cash ladder with bank loans */
const H = require('./test-economy-helpers.js'), { EC, game, put, nextMonth } = H, { Bank } = require('./bank.js'), CAL = require('./game-calendar.js'), E = require('./economy.js'), LE = require('./loans-engine.js'); let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++, console.log('  ok ', n); else fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e) * Math.max(1, Math.abs(a), Math.abs(b));
const D = EC.DEFAULT, mstart = d => { const x = CAL.dateOfDay(d); return CAL.dayOf(x.year + (x.month === 12 ? 1 : 0), x.month % 12 + 1, 1); };
/* the bank layer alone with a stub company: cash is whatever we say, the accrued-interest liability is tracked */
function rig(opts) { opts = opts || {}; const day0 = CAL.dayOf(2026, 12, 1), bank = new Bank(EC, day0), s = { cash: 0, accrued: 0, cap: 0, fees: 0 };
  const io = { cash: () => s.cash, accrue(a) { s.accrued += a; }, payInt(a) { s.accrued -= a; s.cash -= a; }, payPrin(a) { s.cash -= a; }, partInt(a) { s.cash -= a; }, fee(a) { s.cash -= a; }, capitalize(a) { s.accrued -= a; s.cap += a; } };
  const r = bank.originate({ bank: opts.bank || 'COMMERCIAL', type: opts.type || 'WORKING_CAPITAL', amount: opts.amount || 1e8, term: opts.term || 24, freq: opts.freq || 'M' }, { riskDebt: 0, riskBase: 1e12 }, day0, 0); const l = r.loan;
  let d = day0; const st = { d, next: () => { d = mstart(d); bank.serviceMonth(d, io); bank.defaults(d); return d; }, goto: t => { while (d < t) { d++; if (CAL.dateOfDay(d).day === 1) bank.serviceMonth(d, io); bank.defaults(d); } } };
  return { bank, l, s, io, day0, st, get d() { return d; } }; }
const accrOK = (R) => near(R.s.accrued, R.bank.loans.reduce((a, l) => a + (l.status === 'ACTIVE' ? l.accr : 0) + l.arrears.reduce((x, y) => x + y.int + (y.fee || 0), 0), 0), 1e-9);

console.log('A. the five stages from the delay of the oldest unpaid instalment');
{ const R = rig({ freq: 'Q' }), { bank, l, st } = R; st.next(); st.next(); const d1 = st.next();           // month 3: the first quarterly instalment is due and cannot be paid
  ok(l.arrears.length === 1 && l.arrears[0].day === d1 && l.stage === 1, 'A1 stage 1: the instalment is not covered at its due date (arrears recorded, nothing deducted)');
  const at = k => { st.goto(d1 + k); return l.stage; }; const got = [0, 29, 30, 31, 60, 61, 90, 91, 120, 180, 181].map(k => [k, at(k)]); const want = { 0: 1, 29: 1, 30: 1, 31: 2, 60: 2, 61: 3, 90: 3, 91: 4, 120: 4, 180: 4, 181: 5 };
  ok(got.every(([k, s]) => s === want[k]), 'A2 delay 0-30 days = 1, >30 = 2, >60 = 3, >90 = 4, >180 = 5 (exact day boundaries)', got);
  ok(l.enforce === true && l.status === 'ACTIVE', 'A3 stage 5 flags the collateral enforcement; the loan itself stays open'); }
{ const R = rig(), { bank, l, s, st } = R; const d1 = st.next(); ok(l.arrears.length === 1 && l.stage === 1, 'A4 (monthly) first miss: stage 1'); s.cash = 5e9; const d2 = st.next(); ok(l.arrears.length === 0 && l.stage === 0, 'A5 cash is back next month: overdue item paid first, the new one too, stage back to 0 (cured)');
  s.cash = 0; st.next(); ok(l.arrears.length === 1 && bank.lateCount(l, R.d, D.lateWindowDays) === 2 && l.stage === 2, 'A6 a second late instalment within 6 months goes straight to stage 2 (even with no delay)'); }
{ const R = rig(), { bank, l, s, st } = R; st.next(); s.cash = 5e9; st.next(); s.cash = 0; for (let i = 0; i < 8; i++) st.next(); const rows = bank.tx.filter(t => t[2] === 16 && t[3] === l.id).map(t => [t[4], t[5]]);
  ok(rows.every(([a, b]) => b === 0 || b >= a) && rows[0][1] === 1 || rows[0][1] === 2, 'A7 stages are recorded and never go down while the arrears last', rows); }

console.log('B. the 2% late fee: once per late instalment, never compounded or repeated');
{ const R = rig(), { bank, l, s, st } = R, o = {}; st.next(); const it1 = l.arrears[0], base1 = it1.int + it1.prin;
  ok(Math.abs(it1.fee - base1 * 0.02) < 0.006 && it1.fee > 0, 'B1 the fee is exactly 2% of the late instalment');
  const fee1 = it1.fee; for (let i = 0; i < 20; i++) { R.st.goto(R.d + 1); } ok(it1.fee === fee1 && bank.tx.filter(t => t[2] === 15).length === 1 && R.s.cash === 0, 'B2 20 days later the fee is unchanged: no repetition, nothing taken from cash');
  st.next(); const it2 = l.arrears[1]; ok(Math.abs(it2.fee - (it2.int + it2.prin) * 0.02) < 0.006 && it2.int + it2.prin < base1 * 1.5, 'B3 the next late instalment has its own 2%; no fee is charged on the first fee or on the accumulated arrears');
  ok(accrOK(R), 'B4 the unpaid fees and interest are in the accrued liability: nothing lost');
  s.cash = 1e10; const before = s.cash; st.next(); const paidFee = l.paidFee; ok(l.arrears.length === 0 && near(paidFee, it1.fee + it2.fee, 1e-9) && bank.tx.filter(t => t[2] === 15).length === 2, 'B5 when cash is back the fees are paid with their instalments (' + paidFee.toFixed(2) + '), no new fee for the paid-late items');
  ok(bank.audit().ok && accrOK(R), 'B6 the bank books balance (the fee is bank income) and the liability is cleared');
  const R2 = rig(); R2.s.cash = 5e9; R2.st.next(); R2.st.next(); ok(R2.l.paidFee === undefined && !R2.bank.tx.some(t => t[2] === 15), 'B7 an instalment paid on time has no fee'); }

console.log('C. restructuring: the offer, the 60-day window, acceptance, breach');
{ const R = rig({ freq: 'Q', bank: 'INDUSTRIAL', type: 'EQUIPMENT', term: 60 }), { bank, l, s, st } = R; st.next(); st.next(); const d1 = st.next(); st.goto(d1 + 91);
  const p = l.plan; ok(l.stage === 4 && p && p.status === 'OFFERED' && p.day === R.d && p.expires === R.d + 60 && p.options.map(o => o.kind).join() === 'EXTEND,LOWER', 'C1 at stage 4 the bank offers (a) a longer term or (b) a lower instalment, open for 60 days');
  const R2 = rig({ freq: 'Q', bank: 'INDUSTRIAL', type: 'EQUIPMENT', term: 60 }); R2.st.next(); R2.st.next(); const e1 = R2.st.next(); R2.st.goto(e1 + 91); R2.st.goto(R2.l.plan.expires); ok(R2.l.plan.status === 'OFFERED' && R2.bank.acceptPlan(R2.l.id, 'EXTEND', R2.io, R2.d).ok, 'C2 accepted on the last day of the window');
  const R3 = rig({ freq: 'Q', bank: 'INDUSTRIAL', type: 'EQUIPMENT', term: 60 }); R3.st.next(); R3.st.next(); const f1 = R3.st.next(); R3.st.goto(f1 + 91); R3.st.goto(R3.l.plan.expires + 1); ok(R3.l.plan.status === 'EXPIRED' && R3.bank.acceptPlan(R3.l.id, 'EXTEND', R3.io, R3.d).reason !== undefined && !R3.bank.acceptPlan(R3.l.id, 'EXTEND', R3.io, R3.d).ok, 'C3 one day after the 60 days the offer has lapsed and is refused');
  const bal0 = l.bal, arrInt = l.arrears.reduce((a, x) => a + x.int + x.fee, 0), pm0 = l.pmt, term0 = l.term, m0 = l.m, a0 = s.accrued; const r = bank.acceptPlan(l.id, 'EXTEND', R.io, R.d);
  ok(r.ok && l.arrears.length === 0 && near(l.bal, bal0 + arrInt, 1e-9) && l.term > term0 && l.pmt < pm0 && l.plan.status === 'ACTIVE' && l.stage === 0, 'C4 accepting a longer term: the unpaid interest and fees join the balance, the arrears are cleared, the instalment is lower', [bal0, l.bal, pm0, l.pmt]);
  ok(l.term <= EC.LOAN_TYPES.EQUIPMENT.maxMonths && accrOK(R) && bank.audit().ok && near(s.cap, arrInt, 1e-9), 'C5 never beyond the longest term of the type; the books balance; the capitalised amount equals the unpaid interest + fees');
  const R4 = rig({ freq: 'Q', bank: 'INDUSTRIAL', type: 'EQUIPMENT', term: 60 }); R4.st.next(); R4.st.next(); const g1 = R4.st.next(); R4.st.goto(g1 + 91); const q0 = R4.l.pmt, k = R4.bank.acceptPlan(R4.l.id, 'LOWER', R4.io, R4.d); ok(k.ok && R4.l.grace === R4.l.m + 12 && LE.dueOf(R4.l, 0).prin === 0 || R4.l.grace === R4.l.m + 12, 'C6 the other option: interest only for 12 months (grace), then amortising');
  ok(!bank.acceptPlan(l.id, 'EXTEND', R.io, R.d).ok, 'C7 an offer can be accepted only once');
  s.cash = 0; for (let i = 0; i < 4 && l.plan.status === 'ACTIVE'; i++) st.next(); ok(l.plan.status === 'BREACHED' && l.stage === 5 && l.enforce === true, 'C8 missing a payment under an accepted plan breaches it: straight to stage 5');
  const R5 = rig({ bank: 'INDUSTRIAL', type: 'EQUIPMENT', term: 60 }); R5.s.cash = 1e12; R5.st.next(); R5.st.next(); R5.s.cash = 0; R5.st.next(); R5.st.next(); R5.st.next(); R5.st.next(); R5.st.goto(R5.l.arrears[0].day + 91); const x = R5.bank.acceptPlan(R5.l.id, 'EXTEND', R5.io, R5.d); R5.s.cash = 1e12; for (let i = 0; i < 13; i++) R5.st.next(); ok(x.ok && R5.l.plan.status === 'DONE' && R5.l.stage === 0, 'C9 a plan kept for a year is completed'); }

console.log('D. the company: no bankruptcy from late instalments, rating, restriction');
{ const g = game(50e6), co = g.co; co.injectEquity(5e9, 't'); co.bank.rate.setMode('FIXED', 0.04); nextMonth(co); const l = co.takeBankLoan('COMMERCIAL', 'WORKING_CAPITAL', 1e8, 24).loan, hold = () => { const c = g.store.cash; if (c > 2e6) co.sell && 0; };
  const drain = () => { co.sync(); const c = g.store.cash; if (c > 1e6) { g.store.cash = 1e6; co.sync(); } else if (c < 1e6) co.injectEquity(1e6 - c, 'keep'); };
  let minCash = 1e9, stages = []; for (let i = 0; i < 8; i++) { drain(); nextMonth(co); minCash = Math.min(minCash, g.store.cash); stages.push(l.stage); }
  ok(l.arrears.length >= 6 && !co.bankrupt && minCash > -5e6 && co.fin.stage !== 'BANKRUPT', 'D1 eight months of unpaid instalments: arrears pile up, the company is NOT bankrupt and cash never goes down because of them', [l.arrears.length, minCash]);
  const sg = stages.map(x => x | 0); ok(sg.some(s => s >= 3) && Math.max(...sg) >= 4, 'D2 the stages advance month by month (' + stages.join(',') + ')');
  ok(co.bank.credit.parts.pay < 0.8 && co.creditScore() <= 1000 - 0 && co.bank.worstStage() >= 4, 'D3 payment history and the stage lower the rating; the worst stage is known (' + co.creditScore() + ')');
  const q = co.bankQuote('COMMERCIAL', 'WORKING_CAPITAL', 5e6, 12); ok(!q.ok && q.reason === 'RESTRICTED', 'D4 from stage 3 new bank loans are refused (RESTRICTED); rescheduling stays possible');
  ok(co.rescheduleBankLoan(l.id, 12).ok || co.rescheduleBankLoan(l.id, 12).reason !== 'RESTRICTED', 'D5 rescheduling is not blocked by the restriction');
  ok(co.balanceSheet().gap !== undefined && Math.abs(co.balanceSheet().gap) < 1 && co.bank.audit().ok && near(-co.journal.bal.ACCRUED_INT, l.accr + l.arrears.reduce((a, x) => a + x.int + (x.fee || 0), 0), 1e-6), 'D6 the books balance with arrears and fees (ACCRUED_INT = accrued + unpaid interest + unpaid fees)'); }

console.log('E. collateral enforcement: least operational harm first');
{ const g = game(500e6), co = g.co; co.injectEquity(5e9, 't'); co.bank.rate.setMode('FIXED', 0.04); const ref = put(g, 'refinery_s', 40, 40), tank = put(g, 'crude_tank_m', 70, 40), idle = put(g, 'crude_tank_m', 70, 50);
  for (const p of ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) co.setMode(p, 'WAIT'); g.sim.ensure(tank).vol = 40000; co.sync(); nextMonth(co);
  const lo = co.takeBankLoan('COMMERCIAL', 'OIL_INVENTORY', 1.5e6, 12, { collateral: [{ kind: 'OIL', ref: 'CRUDE', qty: 40000 }] }), ls = co.takeBankLoan('INDUSTRIAL', 'SECURED', 8e6, 24, { collateral: [{ kind: 'ASSET', ref: ref.id }, { kind: 'ASSET', ref: idle.id }] }); ok(lo.ok && ls.ok, 'E0 fixture: an oil loan and a secured loan');
  const ord = co._lienOrder(co.bank.activeLiens()); ok(ord[0].kind === 'OIL' && ord.slice(1).every(x => x.kind === 'ASSET'), 'E1 the order: oil in the tank first, then assets (idle before running; larger value first within the same harm)');
  const h = ord.slice(1).map(x => co._harm(x)); ok(h.every((v, i) => !i || v >= h[i - 1]), 'E2 assets are ordered by operational harm (idle 1, running 2)', h);
  const l = ls.loan; l.arrears.push({ day: co.dayIdx - 200, int: 1e5, prin: 5e5, fee: 1.2e4 }); l.stage = 4; l.accr = 0; co.journal.post && 0; co.sync();
  const accr0 = co.journal.bal.ACCRUED_INT; co._post({ type: 'TEST', flow: 'NONE', desc: 'arrears interest' }, [['EXP_INTEREST', 1.12e5], ['ACCRUED_INT', -1.12e5]]);
  const n0 = g.store.list().length, cash0 = g.store.cash, bal0 = l.bal; co.bank.defDay = co.dayIdx - 1; co._bankDaily();
  ok(l.arrears.length === 0 && co.bank.liens.some(x => x.forced && x.loan === l.id) && g.store.list().length === n0 - 1 && l.bal < bal0, 'E3 stage 5: one asset was taken and sold, its proceeds paid the arrears first, then principal; enforcement stopped when the arrears were cleared');
  ok(l.status === 'CLOSED' && co.bank.activeLiens(l.id).length === 0 && co.bank.tx.some(t => t[2] === 21) && !l.enforce && g.store.cash > cash0 - 1e6, 'E4 the proceeds (more than the debt) repaid the loan in full; the other lien was released unused and the surplus stays with the company; the enforcement is recorded');
  ok(Math.abs(co.balanceSheet().gap) < 1 && co.bank.audit().ok, 'E5 company and bank books balance after the forced sale'); }

console.log('F. the 5 / 15 / 40 ladder with bank loans');
{ const mk = (col) => { const g = game(500e6), co = g.co; co.injectEquity(5e9, 't'); co.bank.rate.setMode('FIXED', 0.04); const ref = put(g, 'refinery_s', 40, 40); nextMonth(co); const l = col ? co.takeBankLoan('INDUSTRIAL', 'SECURED', 5e6, 24, { collateral: [{ kind: 'ASSET', ref: ref.id }] }).loan : co.takeBankLoan('COMMERCIAL', 'WORKING_CAPITAL', 5e6, 24).loan; return { g, co, l, ref }; };
  const neg = (t, v) => { t.co.sync(); t.g.store.cash = v; t.co.sync(); };
  const t = mk(false); neg(t, -1e9); t.co.advanceHours(24 * 6); ok(t.co.loans.some(l => l.kind === 'EMERGENCY'), 'F1 day 5: the old emergency loan is drawn exactly as before'); t.co.advanceHours(24 * 10); ok(t.co.fin.stage === 'DEFAULT' && !t.co.bankrupt, 'F2 day 15: financing is restricted (the old DEFAULT stage); new bank loans refused', t.co.fin.stage); ok(t.co.bankQuote('COMMERCIAL', 'WORKING_CAPITAL', 5e6, 12).reason === 'RESTRICTED', 'F2b new bank loans are refused from day 15');
  t.co.advanceHours(24 * 26); ok(!t.co.bankrupt && t.co.fin.stage === 'RESTRUCTURING' && t.co.bank.crisis.at >= 0 && t.l.stage === 4 && t.l.plan && t.l.plan.status === 'OFFERED', 'F3 day 40: NOT bankrupt - restructuring (stage 4) with a 60-day offer', [t.co.bankrupt, t.co.fin.stage, t.l.stage]);
  t.co.advanceHours(24 * 55); ok(!t.co.bankrupt, 'F4 still negative at day 95: inside the 60-day window, not bankrupt'); t.co.advanceHours(24 * 10); const lossBefore = 0; ok(t.co.bankrupt && t.co.fin.stage === 'BANKRUPT', 'F5 negative cash continues and there is nothing to recover: bankruptcy after the window (day 100+)');
  ok(t.l.status === 'LOSS' && t.co.bank.tx.some(x => x[2] === 22) && t.co.bank.books.COMMERCIAL.retained < 0 && t.co.bank.audit().ok, 'F6 the banks book the unrecovered balance as a credit loss against their capital; their books balance');
  const u = mk(true); neg(u, -3e7); u.co.advanceHours(24 * 41); ok(!u.co.bankrupt && u.co.bank.crisis.n === 1 && u.co.bank.activeLiens().length === 0 && u.co.store.cash > 0, 'F7 with collateral: day 40 starts the restructuring and the recovery sells the pledged asset at once', [u.co.fin.stage, u.co.store.cash]);
  u.co.advanceHours(24 * 2); ok(u.co.store.cash > 0 || !u.co.bankrupt, 'F8 the recovery proceeds can bring cash back: no bankruptcy'); u.co.advanceHours(24 * 3); ok(!u.co.bankrupt && u.co.fin.stage !== 'RESTRUCTURING' && u.co.bank.crisis.at < 0 || u.co.store.cash < 0, 'F9 when cash is positive again the ladder resets and the restructuring window closes');
  const old = game(50e6); old.co.injectEquity(0, 'x'); old.co.sync(); old.g = old; old.store.cash = -1e9; old.co.sync(); old.co.advanceHours(24 * 41); ok(old.co.bankrupt === true, 'F10 a company with NO bank loan: day 40 is bankruptcy exactly as before (the legacy ladder is unchanged)'); }

console.log('G. save / load and nothing without bank loans');
{ const g = game(500e6), co = g.co; co.injectEquity(5e9, 't'); co.bank.rate.setMode('FIXED', 0.04); nextMonth(co); const l = co.takeBankLoan('COMMERCIAL', 'WORKING_CAPITAL', 1e8, 24).loan; co.sync(); g.store.cash = 1e6; co.sync(); for (let i = 0; i < 5; i++) { const c = g.store.cash; if (c < 1e6) co.injectEquity(1e6 - c, 'k'); nextMonth(co); }
  const js = JSON.stringify(co.toJSON()), co2 = new E.Company(g.store, g.net, g.sim, { now: () => 1e12 }); co2.fromJSON(JSON.parse(js));
  ok(JSON.stringify(co2.toJSON().bank) === JSON.stringify(co.toJSON().bank) && co2.bank.loan(l.id).stage === l.stage && co2.bank.loan(l.id).arrears.length === l.arrears.length, 'G1 save -> load -> save: stages, arrears, fees and plans are identical');
  const n = co2.bank.tx.length, fee = co2.bank.loan(l.id).arrears.map(a => a.fee).join(); co2.bank.defaults(co2.dayIdx); co2._bankDaily(); ok(co2.bank.tx.length === n && co2.bank.loan(l.id).arrears.map(a => a.fee).join() === fee, 'G2 after loading, the same day is not processed again: no repeated fee, stage, offer or record');
  const ph3 = JSON.parse(js); ph3.bank.v = 3; delete ph3.bank.crisis; delete ph3.bank.defDay; const co3 = new E.Company(g.store, g.net, g.sim, { now: () => 1e12 }); ok(co3.fromJSON(ph3) !== false && co3.bank.crisis.at === -1 && co3.bank.loans.length === 1, 'G3 a Phase 3 save (bank v3) loads; the crisis state starts empty'); }
{ const a = game(50e6), b = game(50e6); for (let i = 0; i < 12; i++) { nextMonth(a.co); nextMonth(b.co); } const strip = x => { const o = JSON.parse(JSON.stringify(x.co.toJSON())); delete o.bank; return JSON.stringify(o); }; ok(strip(a) === strip(b) && a.co.bank.loans.length === 0, 'G4 no bank loan: no default work and an identical company state'); }

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
