/* Oli - test-accounting.js  (Economy Phases 2-7: the mandatory accounting tests of the spec + invariants of the double-entry journal)
 * Run: NODE_PATH=/opt/npm-tools/node_modules node test-accounting.js
 */
const { B, I, E, EC, game, put, pipe, chain, nextMonth } = require('./test-economy-helpers.js'), assert = require('assert');
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
const days = (g, d) => g.co.advanceHours(24 * d);
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
// a quiet company: no monthly running costs, no storage charge, so each test sees only the entries it makes
const quietCfg = () => { const c = JSON.parse(JSON.stringify(EC)); c.FIXED = { insurancePerMonth: 0, adminBase: 0, adminPerAsset: 0, infraPerYear: 0 }; c.POWER.tiers[0].monthly = 0; c.STORAGE_COST = { CRUDE: 0, GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 }; return c; };
const cashOf = g => g.store.cash;

/* 1. opening 1,000,000 + sales collected 200,000 - salaries 50,000 - maintenance 20,000 = 1,130,000 */
{ const g = game(1e6, quietCfg()), co = g.co;
  co._post({ type: 'SALE_SPOT', flow: 'OP', desc: 'sales collected' }, [['CASH', 200000], ['REV_SPOT', -200000]]);
  co._post({ type: 'PAYROLL_PAID', flow: 'OP', desc: 'salaries' }, [['EXP_LABOR', 50000], ['CASH', -50000]]);
  co._expense('maintenance', 20000, 'maintenance');
  T('M1 closing cash = 1,130,000', near(cashOf(g), 1130000, 1e-9), cashOf(g));
  T('M1b the journal cash account agrees with the company cash', near(co.journal.bal.CASH, 1130000, 1e-9));
  T('M1c the audit passes', co.audit().ok, co.audit()); }

/* 2. sales 100,000 - cost of goods 60,000 - operating 20,000 = 20,000 before tax; tax 20% = 4,000; net 16,000 */
{ const g = game(1e6, quietCfg()), co = g.co;
  co._post({ type: 'PROD_CRUDE', flow: 'OP', desc: 'production cost' }, [['INV_CRUDE', 60000], ['CASH', -60000]]);   // the barrels cost 60,000 when produced
  co._post({ type: 'SALE_SPOT', flow: 'OP', desc: 'sales' }, [['CASH', 100000], ['REV_SPOT', -100000]]);
  co._post({ type: 'COGS', desc: 'cost of goods sold' }, [['COGS', 60000], ['INV_CRUDE', -60000]]);
  co._expense('operating', 20000, 'operating');
  co._monthEnd();
  const tax = co.lastMonth.L.pl.tax;
  T('M2 profit before tax = 20,000', near(co.lastMonth.grossProfit - co.lastMonth.L.pl.operating, 20000, 1e-9), co.lastMonth.grossProfit);
  T('M2b tax = 4,000 (20%)', near(tax, 4000, 1e-9), tax);
  T('M2c net profit = 16,000', near(co.lastMonth.netProfit, 16000, 1e-9), co.lastMonth.netProfit);
  T('M2d the tax is accrued, then paid from the tax payable (payable back to zero)', near(co.journal.bal.PAY_TAX, 0, 1e-9) && near(co.journal.bal.EXP_TAX, 4000, 1e-9), [co.journal.bal.PAY_TAX, co.journal.bal.EXP_TAX]); }

/* 3. a loan of 500,000: cash +500,000, debt +500,000, profit unchanged */
{ const g = game(1e6, quietCfg()), co = g.co; const before = co.summary().life.netProfit, c0 = cashOf(g), d0 = co.debt();
  const q = co.takeLoan(500000, 12, 'test'); T('M3 loan accepted', q.ok, q);
  T('M3a cash +500,000', near(cashOf(g) - c0, 500000, 1e-9));
  T('M3b debt +500,000', near(co.debt() - d0, 500000, 1e-9));
  T('M3c profit unchanged', near(co.summary().life.netProfit, before, 1e-9)); T('M3d loans are not revenue', co.led.life.revenue === 0); }

/* 4. a machine bought for cash: cash -cost, fixed assets +cost, no operating expense at purchase, and (no useful life) no depreciation ever */
{ const g = game(500e6, quietCfg()), co = g.co; const c0 = cashOf(g), fx0 = co.journal.bal.FIXED, pl0 = co.summary().life.expenses;
  const b = put(g, 'pump_station_s', 40, 40, 0, true); const cost = co.assets.get(b.id).cost;
  T('M4 cash decreases by the purchase price', near(c0 - cashOf(g), cost, 1e-9), [c0 - cashOf(g), cost]);
  T('M4a fixed assets increase by the purchase price', near(co.journal.bal.FIXED - fx0, cost, 1e-9));
  T('M4b no expense is recorded at purchase', near(co.summary().life.expenses, pl0, 1e-9));
  co.sync(); nextMonth(co);
  T('M4c no depreciation starts: the equipment has no useful life (accumulated depreciation stays 0)', co.journal.bal.ACC_DEP === 0 && co.assets.get(b.id).dep === 0, co.assets.get(b.id)); }

/* 5. 10,000 barrels produced and not sold: stock up at cost, no sales revenue, no sales profit */
{ const g = game(500e6, quietCfg()), co = g.co; const c = chain(g, false, false); for (const p of EC.PRODUCTS) co.setMode(p, 'WAIT');
  const inv0 = co.inventoryBook(); let guard = 0; while (co.led.life.produced.CRUDE < 10000 && guard++ < 2000) days(g, 1);
  T('M5 at least 10,000 barrels produced', co.led.life.produced.CRUDE >= 10000, co.led.life.produced.CRUDE);
  T('M5a stock value rises (cost of production is kept in inventory)', co.inventoryBook() > inv0 + 1);
  T('M5b no sales revenue', co.led.life.revenue === 0 && co.led.life.spot === 0);
  T('M5c no cost of sales and no sales profit', co.led.life.pl.cogs === 0 && co.summary().life.grossProfit === 0);
  T('M5d stock quantity = what was produced - what the refinery took - the crude lost before it reached a tank (separator slop, written off), and it equals the oil in the tanks', near(co.qty.CRUDE, co.led.life.produced.CRUDE - co.led.life.produced.THRU - (co.crudeLoss || 0), 1e-3) && near(co.qty.CRUDE, co.crudeOnHand(), 1e-3), [co.qty.CRUDE, co.crudeOnHand(), co.crudeLoss, co.led.life.produced]); }

/* 6. salaries: earned every hour, paid on the 1st of the next month, cash moves only when paid */
{ const g = game(500e6), co = g.co; chain(g, false, false); const c0 = cashOf(g);
  co.advanceHours(24 * 30 + 23); const owedBefore = -co.journal.bal.PAY_PAYROLL; T('S1 salaries accrue during the month (payable > 0 before payday)', owedBefore > 0, owedBefore);
  const c1 = cashOf(g); co.advanceHours(1); T('S2 the payday (hour 744, the 1st of February) pays the payable: payable goes to zero and cash falls by it', near(co.journal.bal.PAY_PAYROLL, 0, 1e-6) && cashOf(g) < c1 - owedBefore * 0.9, [co.journal.bal.PAY_PAYROLL, c1 - cashOf(g), owedBefore]);
  T('S3 the expense is the salaries earned (not the cash paid twice)', co.led.life.labor > 0 && near(co.led.life.labor, co.led.life.pl.labor, 1e-9)); }

/* 7. contract revenue is a receivable until it is paid */
{ const g = game(500e6, quietCfg()), co = g.co, c = chain(g, false, false); const sC = g.sim.ensure(c.ct); sC.vol = 60000; sC.wat = 0; co.offers.push({ id: 99, product: 'CRUDE', qty: 1000, price: 80, days: 30, value: 80000, penalty: 1, reward: 0, expires: co.hours + 240 }); co.acceptContract(99);
  co._post({ type: 'PROD_CRUDE', flow: 'OP', desc: 'crude already in stock' }, [['INV_CRUDE', 50000], ['CASH', -50000]]); co.qty.CRUDE += 1000; co.sync(); const ar0 = co.journal.bal.AR; co.deliver(99, 1000);
  T('C1 delivery books revenue and a receivable (no cash yet)', near(co.journal.bal.AR - ar0, 80000 * (1 - EC.FEES.contract), 1e-6), co.journal.bal.AR);
  co.advanceHours(24 * EC.CONTRACTS.payDays + 1); T('C2 after payDays the receivable is collected', near(co.journal.bal.AR, 0, 1e-6) && co.recv.length === 0, co.journal.bal.AR); }

/* invariants on a long, busy run (two game years, production, sales, loans, contracts, repairs, demolition) */
{ const g = game(500e6), co = g.co; const c = chain(g, true, true); co.injectEquity(1e6, 'test');
  for (const p of EC.PRODUCTS) co.setMode(p, 'SPOT');
  co.takeLoan(5e6, 12, 'run'); co.repairAll(1.01); let bad = null; let prevSum = null;
  for (let m = 0; m < 24 && !bad; m++) { nextMonth(co);
    const a = co.audit(); if (!a.ok) bad = { month: m, errors: a.errors };
    if (co.lastMonth) { const cf = co.lastMonth.cash; if (!near(cf.flows.OP.net + cf.flows.INV.net + cf.flows.FIN.net, cf.in - cf.out, 1e-6)) bad = { month: m, cf }; } }
  T('I1 the audit passes every month for two years (journal balances, balance sheet balances, cash = journal)', !bad, bad);
  T('I2 cash-flow sections add up to the change in cash', co.months.length >= 20);
  T('I3 the balance sheet: assets = liabilities + equity', near(co.balanceSheet().gap, 0, 1e-3), co.balanceSheet().gap);
  T('I4 every journal entry is balanced (checked by the journal on every post)', co.journal.check().ok, co.journal.check());
  T('I5 the company produced, sold and held stock', co.led.life.produced.CRUDE > 0 && co.led.life.revenue > 0 && co.inventoryBook() >= 0, co.led.life.revenue);
  const sd = JSON.parse(JSON.stringify(co.toJSON())); const co2 = game(500e6).co; co2.fromJSON(sd); T('I6 save and load keeps the journal (balance sheet gap 0 after load)', near(co2.balanceSheet().gap, 0, 1e-3) && co2.journal.n === co.journal.n); }

/* the period rule: month-end charges are booked on the day that ends the month, not on the next one */
{ const g = game(500e6), co = g.co; chain(g, false, false); days(g, 30.5); co.advanceHours(12);
  const rec = co.days.slice(-1)[0]; T('P1 the day that ends the month carries the month-end costs (not the next day)', co.lastMonth && co.lastMonth.L.labor > 0 && co.led.day.pl.depreciation === 0 && co.led.day.pl.labor < co.lastMonth.L.labor); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
