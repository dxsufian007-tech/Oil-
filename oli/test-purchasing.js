/* Oli - test-purchasing.js  (Economy Phase 8: purchasing - crude, products, chemicals, spare parts, operating materials; cash or credit; weighted-average cost; gross margin)
 * Run: NODE_PATH=/opt/npm-tools/node_modules node test-purchasing.js
 */
const { B, I, E, EC, game, put, pipe, chain } = require('./test-economy-helpers.js'), assert = require('assert');
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const quietCfg = () => { const c = JSON.parse(JSON.stringify(EC)); c.FIXED = { insurancePerMonth: 0, adminBase: 0, adminPerAsset: 0, infraPerYear: 0 }; c.POWER.tiers[0].monthly = 0; c.STORAGE_COST = { CRUDE: 0, GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 }; return c; };
const cashOf = g => g.store.cash;
// a crude tank of 50,000 bbl and nothing else
const tankGame = (cash, cfg) => { const g = game(cash == null ? 10e6 : cash, cfg || quietCfg()); const t = put(g, 'crude_tank_m', 68, 38); return { g, co: g.co, t }; };

/* P1. buying crude for cash: cash down by the total, inventory up by the total, stock and tank up by the quantity */
{ const { g, co, t } = tankGame(); const c0 = cashOf(g), inv0 = co.journal.bal.INV_CRUDE_BUY, v0 = co.sim.ensure(t).vol;
  const r = co.buy('CRUDE', 1000, 'A', 'CASH'); T('P1 buy crude accepted', r.ok, r);
  T('P1a cash down by the purchase total', near(c0 - cashOf(g), r.cost, 1e-9), [c0 - cashOf(g), r.cost]);
  T('P1b inventory up by the purchase total (bought crude has its own account)', near(co.journal.bal.INV_CRUDE_BUY - inv0, r.cost, 1e-9));
  T('P1c stock quantity up by 1,000 bbl', near(co.bq, 1000, 1e-9) && co.qty.CRUDE === 0, co.bq);
  T('P1d the tank holds the bought crude', near(co.sim.ensure(t).vol - v0, 1000, 1e-6), co.sim.ensure(t).vol);
  T('P1e the audit passes after the purchase', co.audit().ok, co.audit()); }

/* P2. purchase total = qty x unit price + freight + fees (from the supplier terms) */
{ const { co } = tankGame(); const q = co.buyQuote('CRUDE', 2000, 'B'), s = EC.SUPPLIERS.find(x => x.id === 'B'), ref = co.market.price.CRUDE, unit = ref * (1 + s.premium);
  const want = 2000 * unit + 2000 * s.freightPerUnit.crude + 2000 * unit * s.feeRate;
  T('P2 total = qty x price + freight + fees', near(q.total, want, 1e-9), [q.total, want]);
  T('P2a the unit price follows the market and the supplier premium', near(q.unitPrice, unit, 1e-9)); }

/* P3. credit purchase: no cash now, a payable until the due date, then cash goes out */
{ const { g, co } = tankGame(); const c0 = cashOf(g), r0 = null, r = co.buy('CRUDE', 1000, 'A', 'CREDIT'); T('P3 credit purchase accepted', r.ok && r.terms === 'CREDIT', r);
  T('P3a no cash moves at purchase', cashOf(g) === c0);
  T('P3b the payable equals the purchase total', near(-co.journal.bal.PAY_SUPPLIERS, r.cost, 1e-9), co.journal.bal.PAY_SUPPLIERS);
  T('P3c the inventory holds the cost', near(co.journal.bal.INV_CRUDE_BUY, r.cost, 1e-9));
  co.advanceHours(24 * (EC.SUPPLIERS[0].creditDays) + 1);
  const pay = co.journal.log.filter(e => e.type === 'SUPPLIER_PAID'), paid = pay.reduce((a, e) => a + (e.lines.find(l => l[0] === 'CASH') || [0, 0])[1] * -1, 0);
  T('P3d after the credit days the payable is paid in cash (one SUPPLIER_PAID entry for the purchase)', near(co.journal.bal.PAY_SUPPLIERS, 0, 1e-9) && pay.length === 1 && near(paid, r.cost, 0.01), [co.journal.bal.PAY_SUPPLIERS, paid, r.cost]);
  T('P3e the audit passes after the payment', co.audit().ok, co.audit()); }

/* P4. weighted-average cost: two purchases at different prices */
{ const { co } = tankGame(); const a = co.buy('CRUDE', 1000, 'A', 'CASH'), c = co.buy('CRUDE', 1000, 'C', 'CASH');
  const avg = (a.cost + c.cost) / 2000;
  T('P4 unit cost after two purchases = weighted average', near(co.unitCostBuy(), avg, 1e-9), [co.unitCostBuy(), avg]); }

/* P5. refused cases change nothing */
{ const { g, co } = tankGame(7e6); const n0 = co.journal.n, c0 = cashOf(g);
  const r = co.buy('CRUDE', 100000, 'A', 'CASH'); T('P5 not enough cash refused', !r.ok && r.reason === 'cash', r.reason);
  T('P5a nothing was posted or paid', co.journal.n === n0 && cashOf(g) === c0); }
{ const { co } = tankGame(); const n0 = co.journal.n; const r = co.buy('CRUDE', 1e9, 'A', 'CREDIT'); T('P5b more than the tank room refused', !r.ok && r.reason === 'noRoom', r.reason); T('P5c no entry for a refused purchase', co.journal.n === n0); }
{ const { co } = tankGame(); const r = co.buy('CRUDE', 100, 'C', 'CREDIT'); T('P5d supplier C sells for cash only', !r.ok && r.reason === 'noCredit', r.reason); }
{ const { co } = tankGame(); const r = co.buy('GASOLINE', 100, 'A', 'CASH'); T('P5e no gasoline tank: no room, refused', !r.ok && r.reason === 'noRoom', r.reason); }
{ const { co } = tankGame(); const r = co.buy('NOTHING', 10, 'A', 'CASH'); T('P5f unknown item refused', !r.ok, r.reason); }

/* P6. chemicals bought, then used by the refinery from stock (cost leaves stock, not cash) */
{ const g = game(500e6, quietCfg()), co = g.co, c = chain(g, true, false); for (const p of EC.PRODUCTS) co.setMode(p, 'WAIT');
  for (const m of ['CHEM', 'OPS']) co.setAutoBuy(m, { on: false });   // this checks the hand-bought stock being drawn: automatic purchasing off
  const r = co.buy('CHEM', 5000, 'A', 'CASH'); T('P6 chemicals bought', r.ok, r); co.buy('OPS', 500, 'A', 'CASH');
  T('P6a chemicals: stock up, inventory up', co.mats.CHEM === 5000 && near(co.journal.bal.INV_CHEM, r.cost, 1e-9), [co.mats.CHEM, co.journal.bal.INV_CHEM]);
  const c1 = cashOf(g), inv1 = co.journal.bal.INV_CHEM; co.advanceHours(48);
  T('P6b the refinery draws chemicals from stock', co.mats.CHEM < 5000 && co.journal.bal.INV_CHEM < inv1, [co.mats.CHEM, co.journal.bal.INV_CHEM]);
  T('P6c the audit passes with chemicals in use', co.audit().ok, co.audit()); }

/* P7. (changed) no manual repair: the call is free and takes no spare part; maintenance is an automatic cost */
{ const g = game(500e6, quietCfg()), co = g.co; const w = put(g, 'oil_well', 20, 36); co.sync();
  co.buy('PARTS', 3, 'A', 'CASH'); co.buy('OPS', 10, 'A', 'CASH'); w.c = 0.5; const p0 = co.mats.PARTS, c0 = cashOf(g), e0 = co.journal.bal.EXP_MAINT;
  const r = co.repair(w.id); T('P7 repair call is free', r.ok && r.cost === 0, r);
  T('P7a no spare part leaves stock', co.mats.PARTS === p0, [co.mats.PARTS, p0]);
  T('P7b no maintenance expense and no cash for it', co.journal.bal.EXP_MAINT === e0 && cashOf(g) === c0);
  T('P7c the audit passes', co.audit().ok, co.audit()); }

/* P8. gross margin = (sales revenue - COGS) / sales revenue x 100; not available without sales */
{ const g = game(500e6, quietCfg()), co = g.co; T('P8 no sales: gross margin not available', co.summary().life.grossMargin === null); 
  co._post({ type: 'PROD_CRUDE', flow: 'OP', desc: 'cost' }, [['INV_CRUDE', 60000], ['CASH', -60000]]); co.qty.CRUDE += 1000;
  co._post({ type: 'SALE_SPOT', flow: 'OP', desc: 'sale' }, [['CASH', 100000], ['REV_SPOT', -100000]]);
  co._post({ type: 'COGS', desc: 'cogs' }, [['COGS', 60000], ['INV_CRUDE', -60000]]);
  T('P8a gross margin 40% (100,000 sales, 60,000 COGS)', near(co.summary().life.grossMargin, 40, 1e-9), co.summary().life.grossMargin); }

/* P9. save and load keep stock of materials and the payables */
{ const { g, co } = tankGame(); co.buy('CHEM', 100, 'A', 'CASH'); co.buy('CRUDE', 500, 'A', 'CREDIT');
  const sd = JSON.parse(JSON.stringify(co.toJSON())); const co2 = game(1).co; co2.fromJSON(sd);
  T('P9 materials and payables survive save and load', co2.mats.CHEM === 100 && co2.payables.length === 1 && near(co2.balanceSheet().gap, 0, 1e-6), [co2.mats, co2.payables.length]); }

/* P10. the audit still passes over two years with purchases every month */
{ const g = game(500e6), co = g.co; const c = chain(g, true, true); co.injectEquity(1e6, 'test'); let bad = null;
  for (let m = 0; m < 24 && !bad; m++) { co.buy('CRUDE', 2000, 'A', m % 2 ? 'CREDIT' : 'CASH'); co.buy('CHEM', 200, 'B', 'CASH'); co.buy('PARTS', 1, 'A', 'CASH'); co.advanceHours(24 * 30); const a = co.audit(); if (!a.ok) bad = { month: m, errors: a.errors }; }
  T('P10 audit passes for two years of purchases', !bad, bad); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
