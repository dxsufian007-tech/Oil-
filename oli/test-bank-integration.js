/* Banking Phase 7: financed construction + integrated scenarios across banks, loans, collateral, default and bonds, with accounting audits at every step; save/load; large-data performance */
const H = require('./test-economy-helpers.js'), { EC, game, put, nextMonth } = H, E = require('./economy.js'); let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++, console.log('  ok ', n); else fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e) * Math.max(1, Math.abs(a), Math.abs(b));
const sound = co => { const a = co.audit(), bs = co.balanceSheet(); return a.ok && Math.abs(bs.gap) < 1 && co.bank.audit().ok && (!co.bank.bonds.audit || co.bank.bonds.audit().ok !== false); };
const mk = (cash) => { const g = game(cash == null ? 100e6 : cash), co = g.co; co.bank.rate.setMode('FIXED', 0.04); return g; };

console.log('A. financed construction');
{ const g = mk(100e6), co = g.co, c0 = g.store.cash, q = g.store.validate('refinery_s', 40, 40, 0, { ignoreCash: true }), r = co.buildFinanced('refinery_s', 40, 40, 0);
  ok(r.ok && r.cost === q.cost && r.financed === Math.round(q.cost * 0.7) && near(r.own, q.cost - r.financed), 'A1 70% of the cost is financed, the rest is paid from cash', r.reason);
  ok(near(g.store.cash, c0 - r.own, 1e-9), 'A2 cash fell by the own share only');
  ok(near(co.bank.loan(r.loan.id).bal, r.financed) && r.loan.type === 'PROJECT_FINANCE' && r.loan.bank === 'STRATEGIC', 'A3 a PROJECT_FINANCE loan at the development bank');
  const e = co.journal.entries || [], rows = (co.journal.entries || []).map(x => x.type || (x.meta && x.meta.type)); ok(!rows.includes('EXTERNAL'), 'A4 nothing was booked as "Pipeline works": the spend went through the Journal', rows.slice(-6));
  ok(co.assets.has(r.building.id) && near(co.assets.get(r.building.id).cost, q.cost), 'A5 the asset is recorded in FIXED at the full cost');
  ok(sound(co), 'A6 company Journal balances, bank books audit');
  const before = co.balanceSheet(); co.sync(); ok(near(co.balanceSheet().totalAssets, before.totalAssets, 1e-9), 'A7 a later sync() changes nothing (no duplicated balance)'); }
{ const g = mk(1e6), co = g.co, r = co.buildFinanced('refinery_s', 40, 40, 0); ok(!r.ok && r.reason === 'cash' && g.store.items.size === 0 && co.bank.loans.length === 0, 'A8 not enough cash for the own share: refused, no loan, no building'); }
{ const g = mk(100e6), co = g.co; ok(co.buildFinanced('refinery_s', 40, 40, 0, { ltc: 0.9 }).reason === 'ltc' && co.bank.loans.length === 0, 'A9 loan-to-cost above 80% is refused');
  ok(co.buildFinanced('refinery_s', 9999, 40, 0).ok === false && co.bank.loans.length === 0, 'A10 an invalid site: refused before any loan');
  const r = co.buildFinanced('crude_tank_s', 40, 40, 0); ok(r.ok === false && r.reason === 'tooSmall' || r.ok === true, 'A11 a small project is either under the minimum loan (refused) or financed', r.reason); }
{ const g = mk(100e6), co = g.co; co.bank.rate.setMode('FIXED', 0.04); const r = co.buildFinanced('refinery_s', 40, 40, 0); ok(r.ok, 'A12 setup'); const d = g.store.demolish(r.building.id, { building: true, pipes: true }); ok(d.ok && sound(co), 'A14 a financed building (no lien) can be demolished by the normal rules and the books stay sound', d.reason); }

console.log('B. integrated scenario: loans + collateral + bonds + monthly service, audited every month');
{ const g = mk(300e6), co = g.co, a = put(g, 'refinery_s', 40, 80), t = put(g, 'crude_tank_m', 70, 80); let all = true, n = 0;
  const f = co.buildFinanced('refinery_s', 40, 40, 0); const sec = co.takeBankLoan('INDUSTRIAL', 'SECURED', 5e6, 24, { collateral: [{ kind: 'ASSET', ref: a.id }] });
  const wc = co.takeBankLoan('COMMERCIAL', 'WORKING_CAPITAL', 10e6, 12); const bl = co.bondList(); const bb = bl.length ? co.buyBond(bl[0].bond, 20) : { ok: false };
  ok(f.ok && sec.ok && wc.ok && bb.ok, 'B1 financed build, secured loan, working capital loan, bond purchase all succeed', [f.reason, sec.reason, wc.reason, bb.reason]);
  for (let i = 0; i < 24; i++) { nextMonth(co); n++; if (!sound(co)) { all = false; ok(false, 'B2 audit failed in month ' + i, [co.audit(), co.balanceSheet().gap]); break; } }
  ok(all, 'B2 24 months: Journal, balance sheet and bank books sound after every month-end');
  ok(co.bank.loan(wc.loan.id).status === 'CLOSED', 'B3 the 12-month loan is fully repaid and closed');
  ok(near(co.bank.arrearsTotal(), 0, 1e-6) || co.bank.arrearsTotal() >= 0, 'B4 arrears figure is consistent'); }

console.log('C. default scenario with a financed building');
{ const g = mk(100e6), co = g.co, f = co.buildFinanced('refinery_s', 40, 40, 0); ok(f.ok, 'C1 setup', f.reason);
  g.store.cash = 0; co.sync(); let late = false; for (let i = 0; i < 6; i++) { nextMonth(co); if (!sound(co)) ok(false, 'C2 audit month ' + i, co.balanceSheet().gap); }
  ok(co.bank.loans.some(l => l.arrears.length > 0 || l.stage > 0) || co.bankrupt || co.bank.crisis, 'C2 an unpayable financed loan goes into arrears / default handling (no silent loss)');
  ok(sound(co) || co.bankrupt, 'C3 books still balance'); }

console.log('D. save / load round trip (no duplicated instalments, interest or balances)');
{ const g = mk(300e6), co = g.co; co.buildFinanced('refinery_s', 40, 40, 0); co.takeBankLoan('COMMERCIAL', 'WORKING_CAPITAL', 10e6, 12); for (let i = 0; i < 3; i++) nextMonth(co);
  const js = JSON.stringify(co.toJSON()), cash0 = g.store.cash, b1 = co.balanceSheet(); nextMonth(co); const ref = { debt: co.bank.bankDebt(), cash: g.store.cash, bs: co.balanceSheet().totalAssets, j: JSON.stringify(co.bank.toJSON()) };
  g.store.cash = cash0; const c2 = new E.Company(g.store, g.net, g.sim, { now: () => 1e12 }); c2.fromJSON(JSON.parse(js));
  ok(JSON.stringify(c2.toJSON()) === js, 'D1 toJSON(fromJSON(x)) is identical'); const b2 = c2.balanceSheet(); ok(near(b1.totalAssets, b2.totalAssets, 1e-9) && near(b1.bankLoans, b2.bankLoans, 1e-9), 'D2 balance sheet identical after loading');
  nextMonth(c2); ok(near(ref.debt, c2.bank.bankDebt(), 1e-9) && near(ref.cash, g.store.cash, 1e-6) && near(ref.bs, c2.balanceSheet().totalAssets, 1e-9) && ref.j === JSON.stringify(c2.bank.toJSON()), 'D3 the next month on the loaded company equals the original (no double instalment or interest)'); ok(sound(c2), 'D4 loaded company is sound'); }

console.log('E. performance with a large book');
{ const g = mk(1e12), co = g.co; co.injectEquity(1e12, 'x'); const t0 = Date.now(); let n = 0; for (let i = 0; i < 400; i++) { const r = co.takeBankLoan(['COMMERCIAL', 'INDUSTRIAL', 'STRATEGIC'][i % 3], ['WORKING_CAPITAL', 'EQUIPMENT', 'EXPANSION'][i % 3], 2e6, 12 + i % 3 * 12); if (r.ok) n++; }
  const bl = co.bondList(); let nb = 0; for (let i = 0; i < bl.length; i++) if (co.buyBond(bl[i].bond, 20).ok) nb++;
  const tm = Date.now(); for (let i = 0; i < 36; i++) nextMonth(co); const per = (Date.now() - tm) / 36;
  ok(n >= 300, 'E1 many loans opened (' + n + ') and ' + nb + ' bond positions', n); ok(per < 250, 'E2 a month-end with ' + n + ' loans costs ' + per.toFixed(1) + ' ms (limit 250)', per); ok(sound(co), 'E3 books sound after 36 months of a large book');
  const ts = Date.now(); const js = JSON.stringify(co.toJSON()); const tl = Date.now(); const c2 = mk(1).co; c2.fromJSON(JSON.parse(js)); ok(Date.now() - ts < 3000 && js.length < 20e6, 'E4 save+load of the large book in ' + (Date.now() - ts) + ' ms, ' + (js.length / 1e6).toFixed(2) + ' MB'); }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
