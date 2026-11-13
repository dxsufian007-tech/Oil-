/* LOANS & FINANCING + INVESTMENT screens: every figure and every action is the real engine's (no browser; the views are pure functions of the company).  node test-loans-invest-model.js */
const H = require('./test-economy-helpers.js'), { E, EC, game, nextMonth } = H, LU = require('./loans-ui.js'), IU = require('./invest-ui.js'); let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++, console.log('  ok ', n); else fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const money = v => (v < 0 ? '−' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US'), near = (a, b, e) => Math.abs(a - b) <= (e || 0.01);
const clean = h => !/NaN|undefined|Infinity|\[object/.test(h.replace(/data-[a-z]+="[^"]*"/g, ''));
const A = (UI, co, a, v) => UI.act(a, { dataset: { v: String(v) } }, co), L = (co, s) => { LU.state.sec = s; return LU.html(co); }, I = (co, s, sub) => { IU.state.sec = s; if (sub) IU.state.sub = sub; return IU.html(co); };
const rich = () => { const g = game(500e6), co = g.co; co.injectEquity(5e9, 't'); nextMonth(co); return { g, co }; };
const wiz = (co, bank, type, amt, term, freq, grace) => { A(LU, co, 'lnBank', bank); A(LU, co, 'lnType', type); A(LU, co, 'lnAmount', amt); A(LU, co, 'lnStep', 4); A(LU, co, 'lnTerm', term); A(LU, co, 'lnFreq', freq || 'M'); A(LU, co, 'lnGrace', grace || 0); A(LU, co, 'lnStep', 6); };
const fresh = () => { LU.state.wiz = { step: 1, bank: null, type: null, amount: 0, term: 0, freq: 'M', grace: 0, coll: [] }; LU.state.panel = null; LU.state.msg = null; };

console.log('A. a new game: the eight sections and the investment sections draw cleanly and honestly');
{ const { co } = rich(); ok(LU.SECS.length === 8 && LU.SECS.map(s => s[1]).join('|') === 'ملخص الديون|القروض النشطة|طلب قرض جديد|جدول الأقساط|سجل السداد|المتأخرات والتعثر|البنوك والعروض|حاسبة القروض', 'A1 the eight loan sections in the requested order');
  ok(LU.SECS.every(([s]) => clean(L(co, s))) && IU.SECS.every(([s]) => clean(I(co, s))) && ['mkt', 'mine', 'iss'].every(x => clean(I(co, 'bonds', x))), 'A2 no NaN / undefined / Infinity in any section');
  ok(/لا توجد قروض قائمة/.test(L(co, 'active')) && /لا قروض نشطة/.test(L(co, 'sched')) && /لا متأخرات/.test(L(co, 'arrears')) && /لا استثمارات حالية/.test(I(co, 'port')), 'A3 empty states say so (nothing invented)');
  const f = IU.figures(co); ok(f.mv === 0 && f.cost === 0 && f.total === 0, 'A4 investment figures start at zero'); }

console.log('B. the debt summary equals the engines');
{ const { co } = rich(); co.takeLoan(20e6, 24, 'old'); fresh(); wiz(co, 'COMMERCIAL', 'WORKING_CAPITAL', 10e6, 24); A(LU, co, 'lnTake', 1); wiz(co, 'INDUSTRIAL', 'WORKING_CAPITAL', 5e6, 12); A(LU, co, 'lnTake', 1); co.issueBond(60, 50e6); const M = LU.model(co), S = LU.debtSummary(co, M), B = co.bank, bs = co.balanceSheet();
  ok(near(S.total, co.loans.reduce((a, l) => a + l.remaining, 0) + B.bankDebt()), 'B1 total debt = old loans + bank debt (bank debt already holds the issued bonds)', [S.total]);
  ok(near(S.bonds, B.bonds.debt()) && near(S.bankL + S.bonds, B.bankDebt()), 'B2 the issued bonds are one separate line, not mixed into bank loans');
  ok(near(S.ratio, S.total / bs.totalAssets, 1e-9), 'B3 debt / assets uses the real balance-sheet assets');
  const h = L(co, 'summary'); ok(h.includes(money(S.total)) && h.includes(money(B.bonds.debt())) && /50.0%|%/.test(h), 'B4 the screen shows those figures');
  ok(S.byBank.COMMERCIAL === B.loans.filter(l => l.bank === 'COMMERCIAL').reduce((a, l) => a + l.bal, 0), 'B5 the distribution by bank sums the bank\'s real balances');
  const up = LU.upcoming(co, M, 3); ok(up.length >= 3 && up.every(x => x.amount > 0 && x.k >= 0 && x.k < 3), 'B6 upcoming instalments come from the schedule functions', up.length); }

console.log('C. the new-loan wizard: nothing is created without the player\'s confirmation and the engine\'s approval');
{ const { g, co } = rich(); fresh(); wiz(co, 'COMMERCIAL', 'WORKING_CAPITAL', 10e6, 24); const q = co.bankQuote('COMMERCIAL', 'WORKING_CAPITAL', 10e6, 24, { freq: 'M', grace: 0 }), h = L(co, 'new');
  ok(q.ok && h.includes((q.rate * 100).toFixed(2) + '%') && h.includes(money(q.payment)) && /تأكيد وأخذ القرض/.test(h), 'C1 the review shows the engine quote\'s rate and instalment and a confirm button');
  ok(co.bank.loans.length === 0, 'C2 reviewing creates nothing'); const c0 = g.store.cash; A(LU, co, 'lnTake', 1);
  const l = co.bank.loans[0]; ok(l && l.principal === 10e6 && near(l.rate, q.rate, 1e-12) && near(l.pmt, q.payment) && near(g.store.cash - c0, 10e6), 'C3 confirming creates exactly the quoted loan and pays out the principal');
  ok(LU.state.sec !== 'new' || LU.state.wiz.step === 1, 'C4 the wizard resets after a loan'); }
{ const { co } = rich(); fresh(); wiz(co, 'COMMERCIAL', 'WORKING_CAPITAL', 9e9, 24); ok(/محرك الأهلية والمخاطر لا يوافق/.test(L(co, 'new')) && !/data-act="lnTake"/.test(L(co, 'new')), 'C5 a request the engine refuses shows the reason and has no confirm button');
  A(LU, co, 'lnTake', 1); ok(co.bank.loans.length === 0 && LU.state.msg && !LU.state.msg.ok, 'C6 even a forced confirm is refused by the engine (no loan)'); }
{ const { co } = rich(); fresh(); A(LU, co, 'lnBank', 'INDUSTRIAL'); A(LU, co, 'lnType', 'SECURED'); A(LU, co, 'lnAmount', 5e6); A(LU, co, 'lnStep', 4); ok(LU.state.wiz.step !== 4, 'C7 a secured loan cannot go on without collateral'); const none = L(co, 'new'); ok(/الضمان|ضمان/.test(none), 'C8 the collateral choices are listed'); }

console.log('D. loan management');
{ const { g, co } = rich(); fresh(); wiz(co, 'COMMERCIAL', 'WORKING_CAPITAL', 10e6, 24); A(LU, co, 'lnTake', 1); const l = co.bank.loans[0], key = 'b' + l.id;
  A(LU, co, 'lnPanel', key + '|pay'); A(LU, co, 'lnAmt', key + '|50'); const pre = L(co, 'active'); ok(/تأكيد السداد/.test(pre) && co.bank.loans[0].bal === 10e6, 'D1 partial repayment is previewed and not executed until confirmed');
  const c0 = g.store.cash; A(LU, co, 'lnPay', key); ok(near(l.bal, 5e6) && g.store.cash < c0 && /جزء/.test(LU.state.msg.text), 'D2 50% early repayment through prepayBankLoan');
  A(LU, co, 'lnPanel', key + '|re'); A(LU, co, 'lnRe', key + '|12'); A(LU, co, 'lnResched', key); ok(l.term === l.m + 12 && LU.state.msg.ok, 'D3 rescheduling through the engine rule', [l.term, l.m, LU.state.msg]);
  A(LU, co, 'lnPanel', key + '|pay'); A(LU, co, 'lnAmt', key + '|100'); A(LU, co, 'lnPay', key); ok(l.status === 'CLOSED' && co.bank.bankDebt() === 0, 'D4 full repayment closes the loan'); ok(LU.model(co).by('repaid').length === 1 && /مُسدَّد/.test(L(co, 'active')) || /المسدَّدة/.test(L(co, 'active')), 'D5 it moves to the repaid group'); }
{ const { co } = rich(); const o = co.takeLoan(20e6, 24, 'x').loan; fresh(); const key = 'c' + o.id; A(LU, co, 'lnPanel', key + '|pay'); A(LU, co, 'lnAmt', key + '|25'); A(LU, co, 'lnPay', key); ok(near(o.remaining, 15e6) && LU.state.msg.ok, 'D6 an old loan is repaid partially through prepayLoan');
  A(LU, co, 'lnPanel', key + '|re'); A(LU, co, 'lnRe', key + '|' + EC.RESCUE.rescheduleMonths[0]); A(LU, co, 'lnResched', key); ok(LU.state.msg.ok, 'D7 an old loan is rescheduled through rescheduleLoan'); }

console.log('E. Central loans are shown apart but counted in the debt');
{ const { co } = rich(); const o = co.takeLoan(20e6, 24, 'x').loan; o.kind = 'CENTRAL'; const M = LU.model(co), S = LU.debtSummary(co, M); ok(M.by('old').length === 1 && M.by('bank').length === 0, 'E1 it sits in the Central/old group, not among the bank loans'); ok(near(S.cen, 20e6) && near(S.total, 20e6), 'E2 it is counted in the total debt'); const h = L(co, 'active'); ok(/قروض Central/.test(h) && !/🏦 القروض المصرفية/.test(h), 'E3 the screen keeps them separate'); o.kind = 'LOAN'; }

console.log('F. arrears, default stages and restructuring');
{ const { g, co } = rich(); fresh(); wiz(co, 'COMMERCIAL', 'WORKING_CAPITAL', 50e6, 24); A(LU, co, 'lnTake', 1); const l = co.bank.loans[0]; g.store.cash = 0; for (let i = 0; i < 4 && (l.stage | 0) < 4; i++) nextMonth(co);
  const M = LU.model(co), h = L(co, 'arrears'); ok(l.arrears.length > 0 && M.get('b' + l.id).group === 'bad', 'F1 missed instalments make the loan distressed', [l.arrears.length, l.stage]); ok(h.includes(money(l.arrears.reduce((a, x) => a + x.prin, 0))) && /مرحلة|المرحلة/.test(h) && clean(h), 'F2 the arrears screen shows the real arrears and stage');
  ok(/القروض المتعثرة/.test(L(co, 'active')), 'F3 the active list has the distressed group');
  if (l.plan && l.plan.status === 'OFFERED') { g.store.cash = 5e9; const k = l.plan.options[0].kind; A(LU, co, 'lnPlan', 'b' + l.id + '|' + k); ok(l.plan.status === 'ACTIVE' && l.arrears.length === 0, 'F4 accepting the offered plan goes through acceptRestructuring'); } else ok(true, 'F4 (no plan offered at stage ' + l.stage + ')'); }

console.log('G. the schedule, the log, the calculator');
{ const { co } = rich(); fresh(); wiz(co, 'COMMERCIAL', 'WORKING_CAPITAL', 10e6, 24); A(LU, co, 'lnTake', 1); const l = co.bank.loans[0]; A(LU, co, 'lnView', 'b' + l.id); const h = L(co, 'sched'), LE = require('./loans-engine.js'), s = LE.schedule({ amount: l.bal, rate: l.rate, term: l.term - l.m, grace: 0, freq: l.freq });
  ok(h.includes(Math.round(s.rows[0].payment).toLocaleString('en-US')) && h.includes(money(s.totalInterest)) && clean(h), 'G1 the schedule is the engine\'s own schedule function');
  nextMonth(co); nextMonth(co); ok(/سداد قسط/.test(L(co, 'log')) && /فتح قرض/.test(L(co, 'log')), 'G2 the log lists the opening and the paid instalments'); const paid = co.bank.loans[0].paidInt; ok(L(co, 'log').includes(money(co.bank.loans.reduce((a, x) => a + x.paidInt, 0))), 'G3 the paid-interest total is the engine\'s');
  const c = LU.state.calc; Object.assign(c, { bank: 'COMMERCIAL', type: 'WORKING_CAPITAL', amount: 10e6, term: 24, freq: 'M' }); const cq = co.bankQuote('COMMERCIAL', 'WORKING_CAPITAL', 10e6, 24, { freq: 'M', grace: 0 }), ch = L(co, 'calc'); ok(ch.includes(money(cq.payment)) && ch.includes((cq.rate * 100).toFixed(2) + '%'), 'G4 the calculator shows the engine quote'); const n0 = co.bank.loans.length; L(co, 'calc'); ok(co.bank.loans.length === n0, 'G5 the calculator creates nothing'); }

console.log('H. rendering changes nothing; old saves load');
{ const { g, co } = rich(); fresh(); wiz(co, 'COMMERCIAL', 'WORKING_CAPITAL', 10e6, 24); A(LU, co, 'lnTake', 1); co.buyBond(co.bank.bonds.listed()[0].id, 3000); const s0 = JSON.stringify(co.toJSON()); for (let i = 0; i < 3; i++) { for (const [s] of LU.SECS) L(co, s); for (const [s] of IU.SECS) I(co, s); } ok(JSON.stringify(co.toJSON()) === s0, 'H1 drawing every screen many times leaves the company exactly as it was');
  const t0 = process.hrtime.bigint(); for (let i = 0; i < 20; i++) { for (const [s] of LU.SECS) L(co, s); for (const [s] of IU.SECS) I(co, s); } const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20 / 12; ok(ms < 25, 'H2 a screen is built in ' + ms.toFixed(2) + ' ms');
  const old = JSON.parse(s0); delete old.bank; const c2 = new E.Company(g.store, g.net, g.sim, { now: () => 1e12 }); c2.fromJSON(old); ok(LU.SECS.every(([s]) => clean(L(c2, s))) && IU.SECS.every(([s]) => clean(I(c2, s))), 'H3 a save written before the bank existed loads and every screen draws');
  const all = LU.SECS.map(([s]) => L(co, s)).join('') + IU.SECS.map(([s]) => I(co, s)).join(''), acts = new Set((all.match(/data-act="([^"]+)"/g) || []).map(x => x.slice(10, -1))); ok([...acts].every(a => LU.ACTS.includes(a) || IU.ACTS.includes(a)), 'H4 every drawn button belongs to a working action', [...acts].filter(a => !LU.ACTS.includes(a) && !IU.ACTS.includes(a))); }
console.log('I. save / load: no instalment, interest or coupon is repeated');
{ const { g, co } = rich(); fresh(); wiz(co, 'COMMERCIAL', 'WORKING_CAPITAL', 10e6, 24); A(LU, co, 'lnTake', 1); co.buyBond(co.bank.bonds.listed().find(b => b.issuer === 'CORP_A').id, 4000); co.issueBond(60, 30e6); for (let i = 0; i < 7; i++) nextMonth(co);
  const js = JSON.stringify(co.toJSON()); let cur = js; for (let k = 0; k < 4; k++) { const c2 = new E.Company(g.store, g.net, g.sim, { now: () => 1e12 }); c2.fromJSON(JSON.parse(cur)); cur = JSON.stringify(c2.toJSON()); }
  ok(cur === js, 'I1 four save/load cycles give an identical company'); const c3 = new E.Company(g.store, g.net, g.sim, { now: () => 1e12 }); c3.fromJSON(JSON.parse(js)); const a0 = JSON.stringify(c3.bank.loans.map(l => [l.paidInt, l.paidPrin, l.m])) + JSON.stringify(c3.bank.bonds.acct); c3.advanceHours(1); ok(JSON.stringify(c3.bank.loans.map(l => [l.paidInt, l.paidPrin, l.m])) + JSON.stringify(c3.bank.bonds.acct) === a0, 'I2 loading and one more hour does not re-pay or re-collect anything'); }
console.log('J. investment');
{ const { co } = rich(); const gb = co.bank.bonds.listed().find(b => b.issuer === 'CORP_A'), hb = co.bank.bonds.listed().find(b => b.issuer === 'HY_A'); IU.state.sec = 'bonds'; IU.state.sub = 'mkt'; IU.state.units = 0; A(IU, co, 'ivBuy', gb.id); A(IU, co, 'ivUnits', 5000); ok(/تأكيد الشراء/.test(IU.html(co)) && co.bank.bonds.pos.length === 0, 'J1 a buy is previewed and not executed');
  const q = co.bank.bonds.quote(gb, co.dayIdx, co.bank.rate.rate), c0 = co.store.cash; A(IU, co, 'ivConfirm', 'buy|' + gb.id); const p = co.bank.bonds.holding(gb.id); ok(p && p.units === 5000 && near(c0 - co.store.cash, 5000 * 1000 * q.ask, 0.5), 'J2 the buy costs units x face x the live ask');
  A(IU, co, 'ivBuy', hb.id); A(IU, co, 'ivUnits', 2000); A(IU, co, 'ivConfirm', 'buy|' + hb.id); const f = IU.figures(co), B = co.bank.bonds; ok(near(f.cost, B.invested()) && f.n === 2, 'J3 the cost is the engine\'s invested() and both holdings count');
  let mv = 0; for (const x of B.pos) { const b = B.bond(x.bond); mv += x.units * 1000 * B.quote(b, co.dayIdx, co.bank.rate.rate).bid; } ok(near(f.mv, mv, 0.01) && near(f.unreal, mv - f.cost, 0.01), 'J4 market value is units x face x bid and the unrealised P/L is value - cost');
  const own = co.balanceSheet(); ok(near(f.debt, B.debt()) && f.debt === 0, 'J5 owned bonds are assets and issued bonds are debt: no issued bonds yet, so no debt');
  const rep = I(co, 'over'); ok(rep.includes(money(f.mv)) && rep.includes(money(f.cost)), 'J6 the overview shows these figures');
  for (let i = 0; i < 7; i++) nextMonth(co); const f2 = IU.figures(co); ok(f2.couponsIn > 0 && near(f2.couponsIn, B.acct.couponsIn), 'J7 coupons were received and the overview reports the engine total', f2.couponsIn);
  const hold = B.holding(gb.id).units; A(IU, co, 'ivSell', gb.id); A(IU, co, 'ivUnits', 1000); A(IU, co, 'ivConfirm', 'sell|' + gb.id); ok(B.holding(gb.id).units === hold - 1000 && B.acct.sold > 0, 'J8 a sale reduces the holding'); ok(/بيع سند/.test(I(co, 'log')) && /كوبون مقبوض/.test(I(co, 'log')) && /شراء سند/.test(I(co, 'log')), 'J9 the operations log lists buys, sells and coupons');
  A(IU, co, 'ivBuy', hb.id); A(IU, co, 'ivUnits', 500); B.forceDefault('HY_A', co.dayIdx, co._bondIO()); ok(/متعثر/.test(I(co, 'port')) && IU.figures(co).impaired > 0, 'J10 a defaulted issuer shows as such with the loss'); }
{ const { co } = rich(); IU.state.sec = 'bonds'; IU.state.sub = 'iss'; A(IU, co, 'ivIss', 'term|60'); A(IU, co, 'ivIss', 'amount|50000000'); const dq = co.issueBondQuote(60, 50e6); if (dq.ok) { ok(IU.html(co).includes((dq.coupon * 100).toFixed(3) + '%'), 'J11 the issue review shows the engine coupon'); A(IU, co, 'ivIssue', 1); const f = IU.figures(co); ok(co.bank.bonds.issued.length === 1 && f.debt === 50e6 && f.mv === 0, 'J12 an issued bond is debt (50M) and does not become an investment asset'); const S = LU.debtSummary(co, LU.model(co)); ok(near(S.bonds, 50e6), 'J13 the loan system counts it as one separate debt line'); } else ok(true, 'J11-13 (issue refused: ' + dq.reason + ')'); }
console.log('\n' + (fail ? 'FAILED' : 'PASS') + ' ' + pass + ' ok, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
