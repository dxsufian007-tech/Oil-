/* Oli - test-rescue.js  (Economy Phase 10: rescue measures - sell assets, reschedule debt, rescue loan, cost cut, sell stock; and the demolition refund fix)
 * Run: NODE_PATH=/opt/npm-tools/node_modules node test-rescue.js
 */
const { B, I, E, EC, game, put, pipe, chain } = require('./test-economy-helpers.js');
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const quietCfg = () => { const c = JSON.parse(JSON.stringify(EC)); c.FIXED = { insurancePerMonth: 0, adminBase: 0, adminPerAsset: 0, infraPerYear: 0 }; c.POWER.tiers[0].monthly = 0; c.STORAGE_COST = { CRUDE: 0, GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 }; return c; };

/* R1. sell an asset: cash = price (80% of market value), the asset leaves the books, the difference is a loss or gain */
{ const g = game(500e6, quietCfg()), co = g.co; const b = put(g, 'pump_station_s', 40, 40, 0, true); co.sync();
  const cost = co.assetRec(b).cost, mv = co.assetValue(b), c0 = g.store.cash, fx0 = co.journal.bal.FIXED, r = co.sellAsset(b.id);
  T('R1 sale accepted', r.ok, r);
  T('R1a cash rises by 80% of the market value', near(g.store.cash - c0, 0.8 * mv, 1e-9), [g.store.cash - c0, 0.8 * mv]);
  T('R1b the asset leaves the building list and the fixed assets fall by its cost', !g.store.get(b.id) && near(fx0 - co.journal.bal.FIXED, cost, 1e-9), [fx0 - co.journal.bal.FIXED, cost]);
  T('R1c gain or loss = price - book value', near(r.gainOrLoss, r.price - r.book, 1e-9) && r.gainOrLoss < 0, r);
  T('R1d the audit passes after the sale', co.audit().ok, co.audit()); }

/* R2. reschedule a loan: remaining debt unchanged, installments and term recalculated, fee paid */
{ const g = game(500e6, quietCfg()), co = g.co; const q = co.takeLoan(10e6, 12, 'test'); co.advanceHours(24 * 30 * 3 + 1);
  const l = co.loans[0], rem0 = l.remaining, pay0 = l.payment, c0 = g.store.cash; const r = co.rescheduleLoan(l.id, 48);
  T('R2 reschedule accepted', r.ok, r);
  T('R2a the balance is kept (no principal written off)', near(co.loans[0].remaining, rem0, 1e-9), [co.loans[0].remaining, rem0]);
  T('R2b new installment = annuity over the new term (lower than before)', near(co.loans[0].payment, E.payment(rem0, l.rate, 48), 1e-6) && co.loans[0].payment < pay0, [co.loans[0].payment, pay0]);
  T('R2c the fee is paid (0.5% of the balance)', near(c0 - g.store.cash, rem0 * co.cfg.RESCUE.rescheduleFee, 1e-6), c0 - g.store.cash);
  T('R2d the audit passes after rescheduling', co.audit().ok, co.audit());
  T('R2e a term that is not offered is refused', !co.rescheduleLoan(l.id, 7).ok); }

/* R3. rescue loan: only in a financial crisis, backed by collateral, one at a time */
{ const g = game(500e6, quietCfg()), co = g.co; chain(g, false, false); co.sync();
  T('R3 not allowed in normal times', co.rescueLoan(1e6).reason === 'notInTrouble');
  co.fin.stage = 'RESCUE'; const d0 = co.debt(), c0 = g.store.cash; const r = co.rescueLoan(1e6);
  T('R3a in crisis: cash +amount and debt +amount', r.ok && near(g.store.cash - c0, 1e6, 1e-9) && near(co.debt() - d0, 1e6, 1e-9), r);
  T('R3b only one rescue loan at a time', co.rescueLoan(1e6).reason === 'already');
  T('R3c the rescue loan is not revenue', co.led.life.revenue === 0);
  T('R3d the audit passes', co.audit().ok, co.audit()); }
{ const g = game(500e6, quietCfg()), co = g.co; co.fin.stage = 'RESCUE'; const r = co.rescueLoan(1e12); T('R3e the amount is capped', !r.ok && r.reason === 'collateral' || r.ok && r.amount <= co.cfg.RESCUE.loanMax, r.reason || r.amount); }

/* R4. cost cut: administration is lower while the cut lasts */
{ const cfg = quietCfg(); cfg.FIXED.adminBase = 12000; const g = game(500e6, cfg), co = g.co; co.sync(); const cut = co.costCut(); T('R4 cost cut accepted', cut.ok, cut);
  T('R4a a second cut while one is running is refused', !co.costCut().ok);
  const a0 = co.led.life.admin; co.advanceHours(24 * 30 + 1); const withCut = co.led.life.admin - a0;
  const h = game(500e6, cfg).co; h.sync(); const b0 = h.led.life.admin; h.advanceHours(24 * 30 + 1); const noCut = h.led.life.admin - b0;
  T('R4b administration costs 20% less during the cut', near(withCut, noCut * (1 - cfg.RESCUE.costCutShare), 0.02), [withCut, noCut]); }

/* R5. liquidate stock: sold for cash now, revenue and cost of goods recorded once */
{ const g = game(500e6, quietCfg()), co = g.co; co._post({ type: 'PROD_CRUDE', flow: 'OP', desc: 'crude' }, [['INV_CRUDE', 50000], ['CASH', -50000]]); co.qty.CRUDE = 1000; co.sync();
  const tank = put(g, 'crude_tank_m', 68, 38); co.sim.ensure(tank).vol = 1000; co.sync(); const c0 = g.store.cash, rev0 = co.led.life.revenue, r = co.liquidate('CRUDE');
  T('R5 liquidation sold the stock', r.ok && r.qty > 0, r);
  T('R5a revenue recorded once (cash = revenue - fee)', near(co.led.life.revenue - rev0, r.gross, 1e-6), [co.led.life.revenue - rev0, r.gross]);
  T('R5b the audit passes', co.audit().ok, co.audit()); }

/* R6. regression: demolition refund is counted once (the store and the journal agree) */
{ const g = game(500e6, quietCfg()), co = g.co; const b = put(g, 'pump_station_s', 40, 40, 0, true); co.sync(); const c0 = g.store.cash, r = g.store.demolish(b.id, { building: true, pipes: true }); co.sync();
  T('R6 demolition: store cash changes by the refund only', near(g.store.cash - c0, r.refund, 1e-9), [g.store.cash - c0, r.refund]);
  T('R6a the audit passes after demolition', co.audit().ok, co.audit()); }

/* R7. two years with rescue measures in use */
{ const g = game(500e6, quietCfg()), co = g.co; const c = chain(g, true, true); co.injectEquity(1e6, 'test'); let bad = null;
  for (let m = 0; m < 24 && !bad; m++) { if (m === 2) co.rescheduleLoan(co.loans[0] ? co.loans[0].id : -1, 24); if (m === 5) co.costCut(); if (m === 8) co.hire('operators', 1);
    if (m === 10) { co.fin.stage = 'RESCUE'; co.rescueLoan(2e6); } if (m === 14) { const tank = co.store.list().find(b => b.d === 'crude_tank_m'); if (tank) co.sellAsset(tank.id); }
    co.advanceHours(24 * 30); const a = co.audit(); if (!a.ok) bad = { m, e: a.errors }; }
  T('R7 audit passes for two years with rescue measures', !bad, bad); }

/* R8. save and load keep the cost cut and the loans */
{ const g = game(500e6, quietCfg()), co = g.co; co.costCut(); co.takeLoan(1e6, 12, 'x'); const sd = JSON.parse(JSON.stringify(co.toJSON())), co2 = game(1).co; co2.fromJSON(sd);
  T('R8 cost cut and loans survive save and load', co2.costCutOn() && co2.loans.length === 1, [co2.cutUntil, co2.loans.length]); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
