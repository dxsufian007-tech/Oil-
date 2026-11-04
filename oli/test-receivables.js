/* Oli - test-receivables.js  (Economy Phase 15: contracts and receivables - revenue and cost at sale, collection without double revenue, due dates, late payment and its liquidity effect)
 * Run: NODE_PATH=/opt/npm-tools/node_modules node test-receivables.js
 */
const { B, I, E, EC, game, put, pipe, chain } = require('./test-economy-helpers.js');
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const quietCfg = () => { const c = JSON.parse(JSON.stringify(EC)); c.FIXED = { insurancePerMonth: 0, adminBase: 0, adminPerAsset: 0, infraPerYear: 0 }; c.POWER.tiers[0].monthly = 0; c.STORAGE_COST = { CRUDE: 0, GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 }; return c; };
// a contract of 1,000 bbl crude at 80 with the crude already in stock; `id` picks whether it is paid late (hash rule)
function setup(id, cfg) { const g = game(500e6, cfg || quietCfg()), co = g.co, c = chain(g, false, false); const sC = g.sim.ensure(c.ct); sC.vol = 60000; sC.wat = 0;
  co.offers.push({ id, product: 'CRUDE', qty: 1000, price: 80, days: 30, value: 80000, penalty: 1, reward: 0, expires: co.hours + 240 }); co.acceptContract(id);
  co._post({ type: 'PROD_CRUDE', flow: 'OP', desc: 'crude in stock' }, [['INV_CRUDE', 50000], ['CASH', -50000]]); co.qty.CRUDE += 1000; co.sim.ensure(c.ct).vol += 1000; co.sync(); return { g, co }; }
// find a contract id whose payment is late, and one that is on time, by the same rule the engine uses

/* R1. delivery: revenue and the cost of the goods are recorded, the receivable is open, no cash yet */
{ const { g, co } = setup(201); const c0 = g.store.cash, rev0 = co.led.life.revenue, cogs0 = co.led.life.pl.cogs, ar0 = co.journal.bal.AR, r = co.deliver(201, 1000);
  T('R1 delivery accepted', r.ok, r);
  T('R1a revenue recorded at delivery', near(co.led.life.revenue - rev0, 80000, 1e-6), co.led.life.revenue - rev0);
  T('R1b receivable = revenue - contract fee', near(co.journal.bal.AR - ar0, 80000 * (1 - EC.FEES.contract), 1e-6), co.journal.bal.AR - ar0);
  T('R1c no cash comes in at delivery', g.store.cash === c0, g.store.cash - c0);
  T('R1d cost of the goods sold is recorded at delivery', co.led.life.pl.cogs > cogs0, co.led.life.pl.cogs - cogs0); }

/* R2. collection after the due days: receivable down, cash up, revenue not recorded again */
{ const { g, co } = setup(202); co.deliver(202, 1000); const rev1 = co.led.life.revenue, c1 = g.store.cash, due = co.recv[0].due;
  co.advanceHours(due - co.hours + 1); const rec = co.recv.length === 0 || co.recv[0].due > co.hours;
  T('R2 the receivable is collected on its due date (on-time payer)', co.recv.length === 0 && near(co.journal.bal.AR, 0, 1e-6), [co.recv, co.journal.bal.AR]);
  const coll = co.journal.log.filter(e => e.type === 'COLLECT'); T('R2a collection: cash in = receivable (net of the fee); contract revenue is not recorded again', coll.length === 1 && near(coll[0].lines.find(l => l[0] === 'CASH')[1], 80000 * (1 - EC.FEES.contract), 1e-2) && near(co.led.life.contract, 80000, 1e-6), [coll.length, co.led.life.contract]);
  T('R2b the audit passes', co.audit().ok, co.audit()); }

/* R3. a contract whose payment is late stays a receivable past its due date, and is overdue */
{ let late = null; for (let id = 300; id < 400 && late == null; id++) { const { co } = setup(id); co.deliver(id, 1000); if (co.recv.length && co.recv[0].late) late = id; }
  T('R3 found a late-paying contract (1 in 5 by rule)', late != null, late);
  if (late != null) { const { g, co } = setup(late); co.deliver(late, 1000); const r = co.recv[0];
    co.advanceHours(r.due - co.hours + 1); T('R3a past the original due date, the late receivable is still open and overdue', co.recv.length === 1 && co.overdue().amount > 0 && co.summary().overdue.count === 1, [co.recv.length, co.overdue()]);
    const c1 = g.store.cash; co.advanceHours(r.payOn - co.hours + 1); T('R3b it is collected on the later date', co.recv.length === 0 && g.store.cash > c1, [g.store.cash - c1]);
    T('R3c late payment does not change contract revenue', near(co.led.life.contract, 80000, 1e-6), co.led.life.contract);
    T('R3d the audit passes', co.audit().ok, co.audit()); } }

/* R4. the liquidity effect: on the original due date the cash of a late payer is lower than an on-time payer's */
{ let late = null; for (let id = 400; id < 500 && late == null; id++) { const { co } = setup(id); co.deliver(id, 1000); if (co.recv.length && co.recv[0].late) late = id; }
  if (late != null) { const A = setup(late), B2 = setup(late + 1000); A.co.deliver(late, 1000); B2.co.deliver(late + 1000, 1000); const due = A.co.recv[0].due;
    A.co.advanceHours(due - A.co.hours + 1); B2.co.advanceHours(due - B2.co.hours + 1);
    T('R4 on the due day the late payer has not paid: lower cash than the on-time payer', A.g.store.cash < B2.g.store.cash, [A.g.store.cash, B2.g.store.cash]); } }

/* R5. two years of contracts: the audit passes and revenue is recorded once per delivery */
{ const g = game(500e6, quietCfg()), co = g.co; chain(g, true, true); co.injectEquity(1e6, 'test'); let bad = null, deliveredRev = 0;
  for (let m = 0; m < 24 && !bad; m++) { for (const c of co.activeContracts()) { const r = co.deliver(c.id, 500); if (r.ok) deliveredRev += r.revenue; } co.advanceHours(24 * 30); const a = co.audit(); if (!a.ok) bad = { m, e: a.errors }; }
  T('R5 audit passes for two years of contracts', !bad, bad); T('R5a contract revenue equals the sum of the deliveries (no double count)', near(co.led.life.contract, deliveredRev, 1e-6), [co.led.life.contract, deliveredRev]); }

/* R6. regression: money spent on pipes (outside the journal) is recorded before the next posting, not absorbed into it */
{ const g = game(500e6, quietCfg()), co = g.co; const c = chain(g, false, false); const mism = () => co.journal.bal.CASH - g.store.cash;
  co._post({ type: 'PROD_CRUDE', flow: 'OP', desc: 'crude' }, [['INV_CRUDE', 1000], ['CASH', -1000]]);
  T('R6 the journal cash equals the store cash right after the chain and a posting', Math.abs(mism()) < 1e-6, mism()); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
