/* Oli - test-phase8.js  (Economy Phase 8: purchasing and the material stock)
 * Each material has its own stock, unit, price and weighted-average cost; crude and products go into tanks, materials into warehouses;
 * the refinery and repairs take what they really consume from stock (once, and never more than there is); purchases are cash or credit
 * with supplier, quantity, price, receipt and due date; every movement is a journal entry.
 * Run: NODE_PATH=/opt/npm-tools/node_modules node test-phase8.js
 */
const { B, I, E, EC, game, put, pipe, chain } = require('./test-economy-helpers.js'), assert = require('assert');
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
const days = (g, d) => g.co.advanceHours(24 * d);
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
// a quiet company: no monthly running costs and no storage charge, so each test sees only the entries it makes
const quietCfg = () => { const c = JSON.parse(JSON.stringify(EC)); c.FIXED = { insurancePerMonth: 0, adminBase: 0, adminPerAsset: 0, infraPerYear: 0 }; c.POWER.tiers[0].monthly = 0; c.STORAGE_COST = { CRUDE: 0, GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 }; return c; };
const cashOf = g => g.store.cash, bal = (co, k) => co.journal.bal[k];
const tanksVol = co => co.store.list().filter(b => b.s && (B.DEFS[b.d].type === 'tank')).reduce((a, b) => a + co.sim.ensure(b).vol, 0);
const audit = (co, tag) => { const a = co.audit(); T(tag + ': the audit passes (journal balances, balance sheet balances, cash = journal, stock matches)', a.ok, a.errors); };
const mat = (co, m) => co.materialStatus().find(x => x.item === m);
const lastTypes = (co, from) => co.journal.log.filter(e => e.id > from).map(e => e.type);

/* A. each material is its own stock: quantity, unit, price, average cost */
{ const g = game(500e6, quietCfg()), co = g.co;
  const st = co.materialStatus();
  T('A1 three materials, each with its own row (chemicals, spare parts, operating materials)', st.map(x => x.item).join() === 'CHEM,PARTS,OPS', st.map(x => x.item));
  T('A1a each row has unit, price, warehouse capacity and zero stock at the start', st.every(x => x.qty === 0 && x.avgCost === 0 && x.unit === EC.MATERIAL_UNIT[x.item] && x.price === EC.MATERIAL_PRICE[x.item] && x.capacity === EC.MATERIAL_STORE[x.item]), st);
  const r = co.buy('CHEM', 1000, 'A', 'CASH'); T('A2 buy 1,000 chemicals for cash', r.ok, r);
  T('A2a chemicals: quantity 1,000, average cost = purchase total / quantity', mat(co, 'CHEM').qty === 1000 && near(mat(co, 'CHEM').avgCost, r.cost / 1000, 1e-9), mat(co, 'CHEM'));
  T('A2b the other materials are untouched (separate stocks)', mat(co, 'PARTS').qty === 0 && mat(co, 'OPS').qty === 0 && bal(co, 'INV_PARTS') === 0);
  T('A2c the stock value is the inventory account for chemicals', near(mat(co, 'CHEM').value, bal(co, 'INV_CHEM'), 1e-9));
  audit(co, 'A2'); }

/* B. where things go: crude and products into tanks, materials into warehouses; a purchase is not production */
{ const g = game(500e6, quietCfg()), co = g.co; chain(g, true, false); put(g, 'crude_tank_m', 60, 70);   /* a commercial tank: bought crude is never put into the tank the wells feed */ for (const p of EC.PRODUCTS) co.setMode(p, 'WAIT');
  const prod0 = { ...co.led.life.produced }, v0 = tanksVol(co), c0 = cashOf(g), inv0 = bal(co, 'INV_CRUDE_BUY');
  const r = co.buy('CRUDE', 1000, 'A', 'CASH'); T('B1 crude bought', r.ok, r);
  T('B1a the crude enters the crude tanks (tank volume +1,000 bbl)', near(tanksVol(co) - v0, 1000, 1e-6), tanksVol(co) - v0);
  T('B1b the purchase is not production (produced crude unchanged)', co.led.life.produced.CRUDE === prod0.CRUDE, co.led.life.produced);
  T('B1c the cash goes down by the purchase total and the inventory goes up by the same', near(c0 - cashOf(g), r.cost, 1e-9) && near(bal(co, 'INV_CRUDE_BUY') - inv0, r.cost, 1e-9));
  const pg = co.buy('GASOLINE', 500, 'A', 'CASH'); T('B2 gasoline bought', pg.ok, pg);
  T('B2a the gasoline enters the gasoline tank, not a warehouse (quantity +500, produced gasoline unchanged)', co.qty.GASOLINE === 500 && co.led.life.produced.GASOLINE === prod0.GASOLINE, [co.qty.GASOLINE, co.led.life.produced.GASOLINE]);
  const v1 = tanksVol(co), cm = co.buy('CHEM', 300, 'A', 'CASH'); T('B3 chemicals bought', cm.ok, cm);
  T('B3a chemicals go to the warehouse: no tank volume changes', near(tanksVol(co), v1, 1e-9));
  const pr = co.purchases.find(x => x.id === co.purchases.length); T('B4 the receipt records supplier, quantity, unit price, total, terms, receipt and due dates', pr && pr.supplier === 'مورد أ' && pr.qty === 300 && near(pr.unitPrice, cm.cost / 300, 1e-9) && pr.terms === 'CASH' && pr.receivedAt === co.hours && pr.dueAt === co.hours && pr.paidAt === co.hours, pr);
  const nRefused = co.journal.n, cRefused = cashOf(g), refused = co.buy('PARTS', 300, 'A', 'CASH');
  T('B5 more spare parts than the warehouse holds (200 pcs) is refused, with nothing posted', !refused.ok && refused.reason === 'noRoom' && co.journal.n === nRefused && cashOf(g) === cRefused, refused.reason);
  T('B5a the room shown for each material is its capacity minus what is held', mat(co, 'CHEM').room === EC.MATERIAL_STORE.CHEM - 300, mat(co, 'CHEM').room);
  audit(co, 'B'); }

/* C. cash and credit: credit creates a payable with a due date and is paid on the due date */
{ const g = game(500e6, quietCfg()), co = g.co, c0 = cashOf(g);
  const r = co.buy('CHEM', 1000, 'A', 'CREDIT'); T('C1 credit purchase from supplier A accepted', r.ok && r.terms === 'CREDIT', r);
  T('C1a no cash moves at purchase; the payable equals the total; the stock holds the cost', cashOf(g) === c0 && near(-bal(co, 'PAY_SUPPLIERS'), r.cost, 1e-9) && near(bal(co, 'INV_CHEM'), r.cost, 1e-9));
  const pur = co.purchases[co.purchases.length - 1];
  T('C1b the receipt shows the credit terms, due after 30 days, not paid yet', pur.terms === 'CREDIT' && pur.dueAt === pur.receivedAt + EC.SUPPLIERS[0].creditDays * 24 && pur.paidAt === null, pur);
  days(g, EC.SUPPLIERS[0].creditDays + 1);
  T('C2 after the due date the payable is paid in cash: payable zero, cash down by the total', near(bal(co, 'PAY_SUPPLIERS'), 0, 1e-9) && near(c0 - cashOf(g), r.cost, 1e-6), [bal(co, 'PAY_SUPPLIERS'), c0 - cashOf(g)]);
  T('C2a the receipt is marked paid on the day it was paid', co.purchases.find(x => x.id === pur.id).paidAt !== null && co.purchases.find(x => x.id === pur.id).paidAt >= pur.dueAt);
  const rc = co.buy('CHEM', 10, 'C', 'CREDIT'); T('C3 supplier C sells for cash only: credit refused', !rc.ok && rc.reason === 'noCredit', rc.reason);
  audit(co, 'C'); }

/* D. weighted average: two purchases at different prices give one average; consumption leaves stock at that average */
{ const g = game(500e6, quietCfg()), co = g.co;
  const a = co.buy('PARTS', 2, 'A', 'CASH'), b = co.buy('PARTS', 2, 'B', 'CASH');
  const want = (a.cost + b.cost) / 4;
  T('D1 average cost of parts = (all purchase totals) / (all quantity)', near(mat(co, 'PARTS').avgCost, want, 1e-9), [mat(co, 'PARTS').avgCost, want]);
  const d = co._drawMaterial('PARTS', 1); T('D2 one part leaves stock at the average cost (not the price of the last purchase)', near(d.cost, want, 1e-9) && mat(co, 'PARTS').qty === 3, [d.cost, want]);
  audit(co, 'D'); }

/* E. refinery: takes what it consumes from stock, once, and stops when chemicals or operating materials run out */
{ const g = game(500e6, quietCfg()), co = g.co; chain(g, true, true); for (const p of EC.PRODUCTS) co.setMode(p, 'WAIT');
  co.buy('CHEM', 20000, 'A', 'CASH'); co.buy('OPS', 5000, 'A', 'CASH');
  const chem0 = mat(co, 'CHEM').qty, ops0 = mat(co, 'OPS').qty, cashE = cashOf(g), inv0 = bal(co, 'INV_CHEM'), thr0 = co.led.life.produced.THRU, n0 = co.journal.n;
  days(g, 2); const thr = co.led.life.produced.THRU - thr0, used = chem0 - mat(co, 'CHEM').qty, usedOps = ops0 - mat(co, 'OPS').qty;
  T('E1 the refinery runs (throughput > 0)', thr > 0, thr);
  T('E1a chemicals taken from stock = throughput x 0.36 kg per barrel (drawn once, not twice)', near(used, thr * EC.MATERIAL_USE.CHEM.qty, 1e-6), [used, thr * EC.MATERIAL_USE.CHEM.qty]);
  T('E1b operating materials taken from stock = throughput x 0.002 per barrel', near(usedOps, thr * EC.MATERIAL_USE.OPS.qty, 1e-6), [usedOps, thr * EC.MATERIAL_USE.OPS.qty]);
  T('E1c the stock value of chemicals fell by what was used (the cost moved into the refinery)', bal(co, 'INV_CHEM') < inv0 && near(inv0 - bal(co, 'INV_CHEM'), (chem0 - mat(co, 'CHEM').qty) * (inv0 / chem0), 1e-6));
  T('E1d no purchase was made on the refinery\'s behalf (no purchase entries)', !lastTypes(co, n0).some(t => /PURCHASE/.test(t)), lastTypes(co, n0).filter(t => /PURCHASE/.test(t)));
  audit(co, 'E1');
  // run until the chemicals are gone: the refinery must slow down and then stop, never going below zero
  let neg = false, stopped = null; for (let h = 0; h < 24 * 60 && !stopped; h++) { co.advanceHours(1); if (mat(co, 'CHEM').qty < -1e-9 || bal(co, 'INV_CHEM') < -1e-6 || mat(co, 'OPS').qty < -1e-9) neg = true; if (mat(co, 'CHEM').qty <= 1e-9) stopped = h; }
  T('E2 stock never goes below zero while the refinery runs', !neg);
  T('E2a the chemicals run out (the refinery is then limited by stock)', stopped != null, mat(co, 'CHEM').qty);
  const t1 = co.led.life.produced.THRU, n1 = co.journal.n; days(g, 1);
  T('E2b with no chemicals the refinery produces nothing and buys nothing', co.led.life.produced.THRU === t1 && co.matLimit === 0 && !lastTypes(co, n1).some(t => /PURCHASE/.test(t)), [co.matLimit, co.led.life.produced.THRU - t1]);
  audit(co, 'E2'); }

/* F. repairs: take the spare part and operating materials they really use, once; refused when there is none */
{ const g = game(500e6, quietCfg()), co = g.co; const w = put(g, 'oil_well', 20, 36); co.sync();
  co.buy('PARTS', 5, 'A', 'CASH'); co.buy('OPS', 50, 'A', 'CASH'); w.c = 0.5;
  const cost = co.repairCost(w), p0 = mat(co, 'PARTS').qty, o0 = mat(co, 'OPS').qty, ip0 = bal(co, 'INV_PARTS'), io0 = bal(co, 'INV_OPS'), em0 = bal(co, 'EXP_MAINT'), c0 = cashOf(g);
  const r = co.repair(w.id); T('F1 repair done', r.ok && w.c === 1, r);
  T('F1a one spare part and two operating units leave stock', mat(co, 'PARTS').qty === p0 - 1 && mat(co, 'OPS').qty === o0 - 2, [mat(co, 'PARTS').qty, mat(co, 'OPS').qty]);
  const partOut = ip0 - bal(co, 'INV_PARTS'), opsOut = io0 - bal(co, 'INV_OPS');
  T('F1b the materials used are inside the repair cost (maintenance rises by the full repair cost)', near(bal(co, 'EXP_MAINT') - em0, cost, 1e-6), [bal(co, 'EXP_MAINT') - em0, cost]);
  T('F1c cash pays only the part of the repair that was not taken from stock', near(c0 - cashOf(g), cost - partOut - opsOut, 1e-6), [c0 - cashOf(g), cost - partOut - opsOut]);
  const again = co.repair(w.id); T('F2 a second repair of the same building takes nothing more from stock', again.ok && again.cost === 0 && mat(co, 'PARTS').qty === p0 - 1 && mat(co, 'OPS').qty === o0 - 2);
  audit(co, 'F1');
  const g2 = game(500e6, quietCfg()), co2 = g2.co; const w2 = put(g2, 'oil_well', 20, 36); co2.sync(); co2.buy('OPS', 50, 'A', 'CASH'); w2.c = 0.5;
  const n2 = co2.journal.n, c2 = cashOf(g2), rn = co2.repair(w2.id);
  T('F3 no spare part in stock: the repair is refused, nothing is posted, the building stays damaged', !rn.ok && rn.reason === 'noPart' && co2.journal.n === n2 && cashOf(g2) === c2 && w2.c === 0.5, rn.reason);
  co2.buy('PARTS', 2, 'A', 'CASH'); const n3 = co2.journal.n, ro = (co2.materialStatus(), co2.mats.OPS); co2._drawMaterial('OPS', ro); const rnn = co2.repair(w2.id);
  T('F4 no operating materials in stock: the repair is refused', !rnn.ok && rnn.reason === 'noOps', rnn.reason); }

/* G. save and load keep the stock, the receipts and the payables; the books still balance */
{ const g = game(500e6, quietCfg()), co = g.co; co.buy('CHEM', 1000, 'A', 'CREDIT'); co.buy('PARTS', 3, 'B', 'CASH');
  const sd = JSON.parse(JSON.stringify(co.toJSON())); const co2 = game(500e6, quietCfg()).co; co2.fromJSON(sd);
  T('G1 after load: stock, receipts and payables are the same, and the balance sheet balances', mat(co2, 'CHEM').qty === 1000 && mat(co2, 'PARTS').qty === 3 && co2.purchases.length === 2 && co2.payables.length === 1 && near(co2.balanceSheet().gap, 0, 1e-6) && near(mat(co2, 'CHEM').avgCost, mat(co, 'CHEM').avgCost, 1e-9), [co2.purchases.length, co2.payables.length]); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
