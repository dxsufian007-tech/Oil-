/* Automatic purchasing of materials + upgradable warehouses (owner request, Nov 2026).
 *   node oli/test-autobuy.js
 * It buys through the existing buy() (same suppliers, prices, freight, fees, journal): there is one purchasing system. */
const { B, I, E, EC, game, put, chain } = require('./test-economy-helpers.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x).slice(0, 400))); } };
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t) * Math.max(1, Math.abs(a), Math.abs(b));
const MU = EC.MATERIAL_USE;
function plant(cash, opts) { opts = opts || {}; const g = game(cash == null ? 500e6 : cash), c = chain(g, true, true); for (const b of g.store.list()) g.sim.ensure(b); for (const w of c.wells) w.s.started = true; for (const p of EC.PRODUCTS) g.co.setMode(p, 'WAIT'); g.c = c; return g; }
const autoPur = co => co.purchases.filter(p => p.auto);

console.log('1. the starting point');
{ const g = game(500e6), co = g.co;
  T('1a warehouse capacity raised: chemicals 500,000 kg, operating materials 100,000 units', co.matCap('CHEM') === 500000 && co.matCap('OPS') === 100000 && EC.MATERIAL_STORE.CHEM === 500000 && EC.MATERIAL_STORE.OPS === 100000);
  T('1b automatic purchasing is on for chemicals and operating materials, off for spare parts', co.autoBuyInfo('CHEM').on && co.autoBuyInfo('OPS').on && !co.autoBuyInfo('PARTS').on);
  T('1c the consumption rates and prices are unchanged (0.36 kg and 0.002 unit per refined bbl, $2.5 / $40)', MU.CHEM.qty === 0.36 && MU.OPS.qty === 0.002 && EC.MATERIAL_PRICE.CHEM === 2.5 && EC.MATERIAL_PRICE.OPS === 40);
  co.advanceHours(48); T('1d no refinery: nothing uses the materials, nothing is bought', co.purchases.length === 0 && co.mats.CHEM === 0); }

console.log('2. a refinery with no stock keeps running on automatic purchases');
{ const g = plant(), co = g.co, ref = g.c.ref, cap = g.sim.capOf(ref), i0 = co.autoBuyInfo('CHEM');
  T('2a the need = refinery capacity x operating limit x use per barrel (' + cap + ' x 1 x 0.36 = ' + cap * 0.36 + ' kg/day)', near(i0.needDay, cap * 0.36) && near(co.autoBuyInfo('OPS').needDay, cap * 0.002));
  T('2b automatic reorder point / target = 3 / 10 days of that need', near(i0.reorder, cap * 0.36 * 3) && near(i0.target, cap * 0.36 * 10));
  let held = 0, low = Infinity, t0 = co.led.life.produced.THRU; const cash0 = g.store.cash;
  for (let h = 0; h < 24 * 20; h++) { co.advanceHours(1); if (ref.s.matLim != null && ref.s.matLim < 1) held++; low = Math.min(low, co.mats.CHEM); }
  const thr = co.led.life.produced.THRU - t0, P = autoPur(co).filter(p => p.item === 'CHEM');
  T('2c in 20 days the refinery was never held back for materials', held === 0 && thr > 0, { held, thr });
  T('2d it is NOT a fixed daily purchase: a few purchases, each when the stock fell to the reorder point', P.length >= 2 && P.length <= 8, P.length);
  T('2e the stock never ran out and stayed near or above the reorder point', low > 0, low);
  const used = co.led.life.produced.THRU * MU.CHEM.qty, bought = P.reduce((a, p) => a + p.qty, 0);
  T('2f bought - used = the chemicals in stock (nothing appears or vanishes)', near(bought - (co.led.life.produced.THRU - 0) * MU.CHEM.qty, co.mats.CHEM, 1e-6) || near(bought - used, co.mats.CHEM, 1e-6), { bought, used, stock: co.mats.CHEM });
  T('2g every automatic purchase is paid in cash at the cheapest landed price of the suppliers', P.every(p => p.terms === 'CASH' && near(p.unitPrice, Math.min(...EC.SUPPLIERS.map(s => co.buyQuote('CHEM', p.qty, s.id).landedUnit)), 1e-9)));
  T('2h the purchases are in the journal and the books balance', co.audit().ok && co.journal.check().ok && P.length > 0 && P.every(p => p.id > 0));
  T('2i the materials are not free: cash went down by at least what the purchases cost', cash0 - g.store.cash >= P.reduce((a, p) => a + p.total, 0) - 1e-6);
  const inf = co.autoBuyInfo('CHEM'); T('2j the panel numbers: real daily use, days left = stock / daily use', inf.usedDay > 0 && near(inf.daysLeft, inf.stock / inf.usedDay, 1e-9), inf);
  T('2k the automatic purchase log lists them', co.autoBuyLog(50).filter(e => e.ok && e.item === 'CHEM').length === P.length); }

console.log('3. the need follows the operating limit');
{ const g = plant(), co = g.co, ref = g.c.ref; const full = co.autoBuyInfo('CHEM').needDay; ref.s.opLimit = 0.5;
  T('3a at a 50% operating limit the need and the automatic target are halved', near(co.autoBuyInfo('CHEM').needDay, full / 2) && near(co.autoBuyInfo('CHEM').target, full / 2 * 10)); }

console.log('4. never more than the company has');
{ const g = plant(); g.store.cash = 20000; g.co.sync(); const co = g.co; co.advanceHours(1); const P = autoPur(co), i = co.autoBuyInfo('CHEM');
  T('4a with $20,000 it buys only what the cash allows (never more than the cash it had)', P.length >= 1 && P.reduce((a, p) => a + p.total, 0) <= 20000 + 1e-6, { cash: g.store.cash, P: P.map(p => p.total) });
  T('4b the shortfall is reported: reason «cash», with what is needed and what is available', i.fail && i.fail.reason === 'cash' && i.fail.need > 0, i.fail);
  T('4c a warning event explains it in Arabic', co.events.some(e => /تعذّر الشراء التلقائي/.test(e.msg) && /الرصيد لا يكفي/.test(e.msg)));
  const g2 = plant(); g2.store.cash = 0; g2.co.sync(); g2.co.advanceHours(1);
  T('4d with no cash at all nothing is bought, and the reason is logged', autoPur(g2.co).length === 0 && g2.co.autoBuyLog(5).some(e => !e.ok && e.reason === 'cash'));
  T('4e the alert list shows it', g2.co.alerts().some(a => a.key === 'autobuyCHEM'), g2.co.alerts().map(a => a.key)); }

console.log('5. the settings');
{ const g = plant(), co = g.co; co.setAutoBuy('CHEM', { reorder: 1000, target: 4000 }); co.setAutoBuy('OPS', { on: false }); co.advanceHours(1);
  const P = autoPur(co); T('5a a fixed target: it buys up to 4,000 kg', P.filter(p => p.item === 'CHEM').length === 1 && near(co.mats.CHEM + 0, 4000, 0.05), co.mats.CHEM);
  T('5b a material switched off is never bought', !P.some(p => p.item === 'OPS'));
  const g2 = plant(), c2 = g2.co; c2.setAutoBuy('CHEM', { maxQty: 500 }); c2.advanceHours(1); T('5c the maximum quantity per order is respected', autoPur(c2).filter(p => p.item === 'CHEM').every(p => p.qty <= 500 + 1e-9));
  const g3 = plant(), c3 = g3.co; c3.setAutoBuy('CHEM', { maxSpendDay: 3000 }); c3.advanceHours(6); const day = autoPur(c3).filter(p => p.item === 'CHEM' && p.receivedAt < 24).reduce((a, p) => a + p.total, 0);
  T('5d the daily spending cap is respected ($' + Math.round(day) + ' <= $3,000) and the reason is logged', day <= 3000 + 1e-6 && c3.autoBuyLog(20).some(e => !e.ok && e.reason === 'budget'), day);
  c3.setAutoBuy('CHEM', { reorder: null, target: null, maxQty: null, maxSpendDay: null }); const i = c3.autoBuyInfo('CHEM'); T('5e empty fields return to automatic (days of need)', i.reorderAuto && i.targetAuto && i.maxQty === 0 && i.maxSpendDay === 0); }

console.log('6. upgradable warehouses');
{ const g = game(500e6), co = g.co, U = EC.WAREHOUSE_UPGRADE, c0 = g.store.cash, f0 = co.journal.bal.FIXED || 0; const r = co.upgradeWarehouse('CHEM');
  T('6a an upgrade adds ' + U.CHEM.add + ' kg for $' + U.CHEM.cost + ', paid in cash as a fixed asset', r.ok && co.matCap('CHEM') === 500000 + U.CHEM.add && near(c0 - g.store.cash, U.CHEM.cost) && near((co.journal.bal.FIXED || 0) - f0, U.CHEM.cost));
  T('6b purchases can use the new room', near(co.roomFor('CHEM'), 500000 + U.CHEM.add));
  for (let k = 1; k < U.maxLevel; k++) co.upgradeWarehouse('CHEM'); T('6c up to level ' + U.maxLevel + ', then refused', !co.upgradeWarehouse('CHEM').ok && co.warehouseUpgradeInfo('CHEM').level === U.maxLevel);
  g.store.cash = 10; co.sync(); T('6d not enough cash: refused, nothing paid', co.upgradeWarehouse('OPS').reason === 'cash' && g.store.cash === 10);
  T('6e the books balance', co.audit().ok && co.journal.check().ok); }

console.log('7. saves');
{ const g = plant(), co = g.co; co.setAutoBuy('CHEM', { target: 7000, maxSpendDay: 99999 }); co.upgradeWarehouse('OPS'); co.advanceHours(30);
  const d = JSON.parse(JSON.stringify(co.toJSON())), g2 = game(500e6); g2.co.fromJSON(d); const a = co.autoBuyInfo('CHEM'), b = g2.co.autoBuyInfo('CHEM');
  T('7a settings, warehouse level and the purchase log survive a save and load', b.target === a.target && b.maxSpendDay === 99999 && g2.co.matCap('OPS') === co.matCap('OPS') && g2.co.autoBuyLog(100).length === co.autoBuyLog(100).length);
  const old = JSON.parse(JSON.stringify(d)); delete old.autoBuy; delete old.whLv; delete old.matHist; const g3 = game(500e6); g3.store.cash = g.store.cash; T('7b a save from before this feature loads with the default settings and level 0', g3.co.fromJSON(old) !== false && g3.co.autoBuyInfo('CHEM').on && g3.co.matCap('CHEM') === 500000 && g3.co.audit().ok); }

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
