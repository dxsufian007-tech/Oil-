/* Banking Phase 6: the BANKING & CAPITAL MARKETS screens read the real engines (no browser needed: the view is a pure function of the company) */
const H = require('./test-economy-helpers.js'), { EC, game, put, nextMonth } = H, UI = require('./banking-ui.js'); let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++, console.log('  ok ', n); else fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const money = v => (v < 0 ? '−' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US'), render = (co, tab) => { UI.state.tab = tab; return UI.html(co); };
const clean = h => !/NaN|undefined|Infinity|null\b|\[object/.test(h.replace(/data-[a-z]+="[^"]*"/g, ''));

console.log('A. a new game: honest empty screens');
{ const g = game(50e6), co = g.co; for (const [t] of UI.TABS) { const h = render(co, t); if (!clean(h)) { ok(false, 'A0 clean ' + t); } }
  ok(/BANKING &amp; CAPITAL MARKETS/.test(render(co, 'overview')) && /سعر الأساس/.test(render(co, 'overview')) && /4\.00%/.test(render(co, 'overview')), 'A1 the title and the Base Rate (4.00% at the start) are there');
  ok(/لا توجد قروض مصرفية/.test(render(co, 'loans')) && /لا تصنيف بعد/.test(render(co, 'credit')) && /السجل الدائم فارغ/.test(render(co, 'log')), 'A2 no loans, no rating, no records: the screens say so (nothing invented)');
  ok(['overview', 'loans', 'credit', 'bonds', 'log'].every(t => clean(render(co, t))), 'A3 no NaN / undefined / Infinity anywhere in the five screens');
  const b = render(co, 'bonds'); ok(/سوق السندات/.test(b) && (b.match(/<tr style="border-top/g) || []).length === 18, 'A4 the bond screen lists the 18 real market bonds'); }

console.log('B. the screens show exactly what the engines hold');
{ const g = game(500e6), co = g.co; co.injectEquity(5e9, 't'); co.bank.rate.setMode('FIXED', 0.04); const ref = put(g, 'refinery_s', 40, 40), tk = put(g, 'crude_tank_m', 70, 40); for (const p of ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) co.setMode(p, 'WAIT'); g.sim.ensure(tk).vol = 40000; co.sync(); nextMonth(co); nextMonth(co);
  const l1 = co.takeBankLoan('COMMERCIAL', 'WORKING_CAPITAL', 1e8, 24).loan, l2 = co.takeBankLoan('INDUSTRIAL', 'SECURED', 8e6, 24, { collateral: [{ kind: 'ASSET', ref: ref.id }] }).loan, l3 = co.takeBankLoan('COMMERCIAL', 'OIL_INVENTORY', 1.5e6, 12, { collateral: [{ kind: 'OIL', ref: 'CRUDE', qty: 40000 }] }).loan;
  const gb = co.bank.bonds.listed().find(b => b.issuer === 'CORP_A'), hb = co.bank.bonds.listed().find(b => b.issuer === 'HY_A'); co.buyBond(gb.id, 20000); co.buyBond(hb.id, 10000); co.issueBond(60, 30e6); nextMonth(co); nextMonth(co);
  const ov = render(co, 'overview'), B = co.bank;
  ok(ov.includes(money(B.snapshot('COMMERCIAL').liquidity)) && ov.includes(money(B.snapshot('STRATEGIC').capital)) && ov.includes(money(B.snapshot('INDUSTRIAL').lendable)) && ov.includes(money(B.snapshot('COMMERCIAL').loans)), 'B1 the overview shows each bank\'s real liquidity, capital, lendable money and loan book');
  ok(ov.includes(String(B.credit.score) + ' / 1000') && ov.includes(money(B.bonds.debt())) && ov.includes(money(B.bonds.invested())) && ov.includes(money(B.bankDebt())), 'B2 rating, bond debt, bond investments and bank debt are the engine figures');
  const lh = render(co, 'loans'); ok([l1, l2, l3].every(l => lh.includes('#' + l.id) && lh.includes(money(l.bal)) && lh.includes((l.rate * 100).toFixed(2) + '%')) && /رأس|سماح|شهرية/.test(lh), 'B3 every loan with its real balance and rate');
  ok(lh.includes(money(l1.pmt)) && /بعد 1 شهر/.test(lh), 'B4 the next instalment amount and its date are the loan\'s own');
  const ch = render(co, 'credit'); ok(ch.includes(String(B.credit.score)) && /رهن #1/.test(ch) && /رهن #2/.test(ch) && ch.includes(money(B.liens[0].v0)) && /المخزون الاستراتيجي ليس ضماناً/.test(ch), 'B5 rating, parts and the liens with their real values; the reserve is stated as not collateral');
  ok(['pay', 'cf', 'debt', 'prof', 'liq', 'stab'].every(k => ch.includes('>' + Math.round(B.credit.parts[k] * 100) + '%<')), 'B6 the six rating parts (30/25/15/15/10/5 weights) show the real percentages');
  const bh = render(co, 'bonds'); ok(/حيازة/.test(bh) && bh.includes('20,000') && bh.includes(money(B.bonds.holding(gb.id).carry)) && /سندي #1/.test(bh) && bh.includes(money(30e6)), 'B7 holdings, own issued bond and totals are the real ones');
  const q = B.bonds.quote(gb, co.dayIdx, B.rate.rate); ok(bh.includes((q.ask * 100).toFixed(2)) && bh.includes((q.bid * 100).toFixed(2)), 'B8 the market table shows the live ask and bid');
  const lg = render(co, 'log'); ok(lg.includes('(' + (B.tx.length + B.bonds.tx.length) + ' عملية)') && /فتح قرض/.test(lg) && /شراء سند/.test(lg), 'B9 the permanent record counts every loan and bond operation');
  co.market.price.CRUDE *= 0.5; B.margin(co.dayIdx, co._valuer()); ok(/Margin Call/.test(render(co, 'credit')) && /Margin Call/.test(render(co, 'loans')), 'B10 an open Margin Call appears on both screens (real call state)');
  const dead = pick => co.bank.bonds.forceDefault('HY_A', co.dayIdx, co._bondIO()); dead(); ok(/متعثر/.test(render(co, 'bonds')) && /مصدّرون متعثرون/.test(render(co, 'bonds')), 'B11 a defaulted issuer is shown as such'); }

console.log('C. the view changes nothing');
{ const g = game(500e6), co = g.co; co.injectEquity(5e9, 't'); nextMonth(co); co.takeBankLoan('COMMERCIAL', 'WORKING_CAPITAL', 5e7, 12); const snap = () => JSON.stringify(co.toJSON()), s0 = snap(), c0 = g.store.cash;
  for (let i = 0; i < 3; i++) for (const [t] of UI.TABS) render(co, t); UI.act('bkMore', { dataset: { v: 'log' } }); UI.act('bkMore', { dataset: { v: 'loans' } }); render(co, 'log'); render(co, 'loans');
  ok(snap() === s0 && g.store.cash === c0, 'C1 rendering every screen many times leaves the company (money, books, banks, bonds, records) exactly as it was');
  ok(UI.ACTS.length === 2 && UI.act('bkTab', { dataset: { v: 'bonds' } }) && UI.state.tab === 'bonds' && !UI.act('buy', { dataset: {} }), 'C2 the only actions are the tabs and "show more": no trading buttons');
  const all = ['overview', 'loans', 'credit', 'bonds', 'log'].map(t => render(co, t)).join(''); const acts = new Set((all.match(/data-act="([^"]+)"/g) || []).map(x => x.slice(10, -1))); ok([...acts].every(a => UI.ACTS.includes(a)), 'C3 every button drawn belongs to a working action', [...acts]);
  const t0 = process.hrtime.bigint(); for (let i = 0; i < 50; i++) for (const [t] of UI.TABS) render(co, t); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 250; ok(ms < 20, 'C4 a screen is built in ' + ms.toFixed(2) + ' ms (only when opened or tapped)'); }
{ const g = game(500e6), co = g.co; co.injectEquity(5e9, 't'); nextMonth(co); for (let i = 0; i < 30; i++) co.takeBankLoan('COMMERCIAL', 'WORKING_CAPITAL', 2e6, 12); for (let i = 0; i < 20; i++) nextMonth(co); UI.state.more.loans = false; const h = render(co, 'loans');
  ok(/عرض كل القروض المسدّدة/.test(h) && (h.match(/<h5>#/g) || []).length < 30, 'C5 with many closed loans only the latest five are listed until "show all" is tapped'); UI.act('bkMore', { dataset: { v: 'loans' } }); ok((render(co, 'loans').match(/<h5>#/g) || []).length === 30, 'C6 "show all" lists every loan (nothing is hidden for good)'); }

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
