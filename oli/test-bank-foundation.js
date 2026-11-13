/* Banking Phase 1 "Banking Foundation": three independent banks, own books, reserve vs lendable, monthly deposit growth, save/load, old-save compatibility, no effect on the company */
const H = require('./test-economy-helpers.js'), { E, EC, game, nextMonth } = H, BK = require('./bank.js'), { Bank, IDS } = BK; let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++, console.log('  ok ', n); else fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e) * Math.max(1, Math.abs(a), Math.abs(b));
const B = EC.BANKS;

console.log('A. three independent banks with the approved opening numbers');
{ const bk = new Bank(EC, 0), want = { COMMERCIAL: [1e9, 4e9, 1.6e9, 250e6, 8], INDUSTRIAL: [2.5e9, 2e9, 1.8e9, 1.5e9, 6], STRATEGIC: [5e9, 1e9, 3e9, 3e9, 4] };
  ok(IDS.length === 3 && IDS.join() === 'COMMERCIAL,INDUSTRIAL,STRATEGIC', 'A1 exactly three banks');
  for (const id of IDS) { const k = bk.books[id], w = want[id], p = B.banks[id];
    ok(k.capital === w[0] && k.deposits === w[1] && k.bal.CASH === w[2] && p.singleLoanCap === w[3] && p.maxLeverage === w[4], 'A2 ' + id + ' capital / deposits / liquidity / single-loan cap / leverage as approved');
    ok(near(k.assets, k.deposits + k.equity, 1e-12) && bk.audit().banks[id].ok, 'A3 ' + id + ' books balance: assets = deposits + equity'); }
  ok(bk.books.COMMERCIAL !== bk.books.INDUSTRIAL && (bk.books.COMMERCIAL.bal.CASH += 5, bk.books.INDUSTRIAL.bal.CASH === 1.8e9 && (bk.books.COMMERCIAL.bal.CASH -= 5, true)), 'A4 the banks have separate books (changing one leaves the others alone)');
  ok(bk.loansOut('COMMERCIAL') === 0 && bk.report().STRATEGIC.loans === 0, 'A5 no loans yet in Phase 1'); }

console.log('B. reserve and lendable money: shown separately, never counted twice');
{ const bk = new Bank(EC, 0), want = { COMMERCIAL: [6e8, 1e9], INDUSTRIAL: [3e8, 1.5e9], STRATEGIC: [1.5e8, 2.85e9] };
  for (const id of IDS) { const liq = bk.liquidity(id), res = bk.reserveRequired(id), len = bk.lendable(id);
    ok(near(res, want[id][0], 1e-12) && near(len, want[id][1], 1e-12), 'B1 ' + id + ' reserve 15% of deposits = ' + res / 1e6 + 'M, lendable = ' + len / 1e6 + 'M');
    ok(near(res + len, liq, 1e-12), 'B2 ' + id + ' reserve + lendable = the liquidity itself (the same money, not added twice)'); }
  ok(bk.maxLoan('COMMERCIAL') === 250e6 && bk.maxLoan('INDUSTRIAL') === 1.5e9 && near(bk.maxLoan('STRATEGIC'), 2.85e9, 1e-12), 'B3 max loan = min(single-loan cap, lendable, leverage room): the strategic bank is held to 2.85B by its reserve, not 3B');
  ok(bk.canLend('COMMERCIAL', 250e6).ok && bk.canLend('COMMERCIAL', 250e6 + 1).reason === 'SINGLE_CAP' && bk.canLend('STRATEGIC', 2.9e9).reason === 'LIQUIDITY' && bk.canLend('INDUSTRIAL', 0).reason === 'AMOUNT', 'B4 canLend says why a loan is refused');
  const c = bk.books.COMMERCIAL; c.post([['CASH', -c.bal.CASH + 6e8 + 1e6], ['OTHER', c.bal.CASH - 6e8 - 1e6]]); ok(near(bk.lendable('COMMERCIAL'), 1e6, 1e-9), 'B5 cash close to the reserve: only the excess is lendable');
  c.post([['CASH', -2e6], ['OTHER', 2e6]]); ok(bk.lendable('COMMERCIAL') === 0 && bk.maxLoan('COMMERCIAL') === 0, 'B6 cash below the reserve: nothing lendable (never negative)'); }

console.log('C. the monthly cycle');
{ const bk = new Bank(EC, 0), d0 = bk.books.COMMERCIAL.deposits;
  ok(bk.monthly(31, 744) === true && near(bk.books.COMMERCIAL.deposits, d0 * 1.003, 1e-12) && near(bk.books.COMMERCIAL.bal.CASH, 1.6e9 + d0 * 0.003, 1e-12), 'C1 a month: deposits +0.3% and the new deposits arrive as cash');
  const snap = JSON.stringify(bk.toJSON()); ok(bk.monthly(31, 744) === false && bk.monthly(20, 480) === false && JSON.stringify(bk.toJSON()) === snap, 'C2 the same or an older day is ignored: no duplicated growth');
  for (let m = 2; m <= 12; m++) bk.monthly(31 * m, 0); ok(near(bk.books.COMMERCIAL.deposits, d0 * Math.pow(1.003, 12), 1e-6) && IDS.every(id => bk.audit().banks[id].ok), 'C3 12 months compound at 0.3% and the books still balance');
  ok(bk.hist.length === 36 && bk.hist.every(h => h.reserve + h.lendable <= h.liquidity + 0.011), 'C4 a permanent monthly history is kept for every bank (3 x 12 rows) and never shows reserve + lendable above the liquidity'); }

console.log('D. settings: capital and liquidity are editable from the economy config');
{ const cfg = JSON.parse(JSON.stringify(EC)); cfg.BANKS.banks.COMMERCIAL.capital = 2e9; cfg.BANKS.banks.COMMERCIAL.liquidity = 2.5e9; cfg.BANKS.reserveRatio = 0.2;
  const bk = new Bank(cfg, 0); ok(bk.books.COMMERCIAL.capital === 2e9 && bk.liquidity('COMMERCIAL') === 2.5e9 && near(bk.reserveRequired('COMMERCIAL'), 0.8e9, 1e-12) && near(bk.books.COMMERCIAL.assets, 6e9, 1e-12), 'D1 new numbers in the config -> new opening books (balanced)');
  const bad = JSON.parse(JSON.stringify(EC)); bad.BANKS.banks.STRATEGIC.liquidity = 7e9; let thrown = false; try { new Bank(bad, 0); } catch (e) { thrown = true; } ok(thrown, 'D2 a liquidity above capital + deposits is refused');
  const b2 = new Bank(EC, 0); cfg.BANKS.reserveRatio = 0.1; b2.cfg = cfg; ok(near(b2.reserveRequired('COMMERCIAL'), 4e8, 1e-12), 'D3 the reserve ratio and the caps are read live from the config');
  const r = b2.recapitalize('INDUSTRIAL', 1e8); ok(r.ok && b2.books.INDUSTRIAL.capital === 2.6e9 && b2.liquidity('INDUSTRIAL') === 1.9e9 && b2.audit().ok, 'D4 a capital injection adds capital AND cash, balanced');
  ok(!b2.recapitalize('INDUSTRIAL', -1e12).ok && b2.recapitalize('INDUSTRIAL', -1e8).ok && b2.books.INDUSTRIAL.capital === 2.5e9, 'D5 capital can only be withdrawn from lendable money'); }

console.log('E. save and load');
{ const bk = new Bank(EC, 0); bk.monthly(31, 0); bk.monthly(59, 0); bk.recapitalize('STRATEGIC', 5e7); const js = JSON.stringify(bk.toJSON()), back = Bank.fromJSON(JSON.parse(js), EC, 59);
  ok(JSON.stringify(back.toJSON()) === js, 'E1 save -> load -> save is identical (balances, log, history)');
  back.monthly(59, 0); ok(JSON.stringify(back.toJSON()) === js, 'E2 after loading the same day is not processed again');
  ok(Bank.fromJSON(null, EC, 100).lastDay === 100 && Bank.fromJSON({ v: 9 }, EC, 5).audit().ok, 'E3 no / unknown bank data -> fresh banks, never an error');
  const part = JSON.parse(js); delete part.banks.INDUSTRIAL; const p = Bank.fromJSON(part, EC, 59); ok(p.audit().ok && p.liquidity('INDUSTRIAL') === 1.8e9 && p.liquidity('COMMERCIAL') === bk.liquidity('COMMERCIAL'), 'E4 a bank missing from the save opens fresh and the others keep their books'); }

console.log('F. inside the company: no company money moves, old saves load, the bank is saved');
{ const g = game(50e6), co = g.co; const j0 = JSON.stringify(co.journal.toJSON()), cash0 = g.store.cash;
  ok(co.bank instanceof Bank && co.toJSON().bank && co.toJSON().bank.v === 1, 'F1 every company has a bank layer and saves it under `bank`');
  nextMonth(co); nextMonth(co); nextMonth(co); ok(co.bank.hist.length === 9 && co.bank.books.COMMERCIAL.deposits > 4e9, 'F2 the month end of the company runs the banks once a month (3 months -> 9 snapshots)');
  const co2 = new E.Company(g.store, g.net, g.sim, { now: () => 1e12 }); ok(co2.fromJSON(JSON.parse(JSON.stringify(co.toJSON()))) !== false && JSON.stringify(co2.bank.toJSON()) === JSON.stringify(co.bank.toJSON()), 'F3 a saved company loads its banks back exactly');
  const old = JSON.parse(JSON.stringify(co.toJSON())); delete old.bank; const co3 = new E.Company(g.store, g.net, g.sim, { now: () => 1e12 }); ok(co3.fromJSON(old) !== false && co3.bank.lastDay === old.dayIdx && co3.bank.hist.length === 0 && co3.bank.audit().ok, 'F4 an OLD save (no `bank` key) loads: fresh banks that open on today, no catch-up growth');
  nextMonth(co3); ok(co3.bank.hist.length === 3, 'F5 and the banks run normally afterwards'); }
{ const run = withBank => { const g = game(80e6), co = g.co; if (!withBank) co.bank = { monthly() {}, toJSON() { return null; } }; for (let i = 0; i < 5; i++) nextMonth(co); const j = co.toJSON(); delete j.bank; return JSON.stringify(j); };
  const a = run(true), b = run(false); ok(a === b, 'F6 the whole company save after 5 months is identical with and without the banks (only the `bank` key differs): no cash, journal, loan or market effect'); }

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
