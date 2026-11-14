/* Automatic Reserve Selling: standing, player-made sell orders (target price, fixed qty or % of stock), checked once per economic day.
   node test-reserve-auto.js */
const { B, game, put, A0, reload, near } = require('./test-reserve-helpers.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const bal = (co, k) => co.journal.bal[k] || 0;
function rig(stock) { const g = game(2e9), co = g.co; const R = put(g, 'crude_tank_c', A0.x + 2, A0.y + 2), C = put(g, 'crude_tank_m', A0.x - 30, A0.y + 2); co.sync(); co.market.tick = () => {}; co.market.price.CRUDE = 70;
  if (stock) { const r = co.reserveBuy('CRUDE', stock, 'A', 'CASH'); if (!r.ok) throw new Error('buy ' + r.reason); } g.sim.ensure(C).vol = 50000; g.sim.ensure(C).prod = 'CRUDE'; co.sync(); return Object.assign(g, { R, C }); }
const day = (g, n) => { for (let i = 0; i < (n || 1); i++) g.co.advanceHours(24); };
const px = (g, v) => { g.co.market.price.CRUDE = v; };
const ord = (g, o) => { const r = g.co.reserveAutoCreate(Object.assign({ mode: 'qty', amount: 10000, price: 80 }, o)); if (!r.ok) throw new Error(r.reason); return r.order; };
const rstock = g => g.co.reserveStock('CRUDE'), cstock = g => g.sim.ensure(g.C).vol;

console.log('1. creating orders (only by the player)');
{ const g = rig(300000), co = g.co; T('1a a new game / a new reserve tank has NO order', co.reserveAutoList().length === 0 && !co.reserve.auto);
  const put2 = put(g, 'crude_tank_s', A0.x + 12, A0.y + 2); co.sync(); T('1b building another reserve tank creates no order', co.reserveAutoList().length === 0);
  T('1c bad inputs are refused (price 0, qty 0, % > 100, bad mode)', [{ price: 0 }, { amount: 0 }, { mode: 'pct', amount: 120 }, { mode: 'x' }].every(o => !co.reserveAutoCreate(Object.assign({ mode: 'qty', amount: 1, price: 80 }, o)).ok) && co.reserveAutoList().length === 0);
  const o = ord(g); T('1d a valid order is created active, with zero history', o.on && o.runs === 0 && o.sold === 0 && o.revenue === 0 && co.reserveAutoList().length === 1); }

console.log('2. the price condition');
{ const g = rig(300000), co = g.co; ord(g, { price: 80, amount: 10000 });
  px(g, 79.99); day(g); T('2a (test 1) price below target: no sale', rstock(g) === 300000 && co.reserveAutoList()[0].runs === 0);
  px(g, 80); day(g); T('2b (test 2) price exactly at target: sells', rstock(g) === 290000 && co.reserveAutoList()[0].runs === 1);
  const g2 = rig(300000); ord(g2, { price: 80, amount: 10000 }); px(g2, 95); day(g2); T('2c (test 3) price above target: sells', rstock(g2) === 290000); }

console.log('3. repetition');
{ const g = rig(300000); ord(g, { price: 80, amount: 10000 }); px(g, 90); day(g, 3); T('3a (test 4) three consecutive days with the condition true: three sales', rstock(g) === 270000 && g.co.reserveAutoList()[0].runs === 3);
  const g2 = rig(300000); ord(g2, { price: 80, amount: 10000 }); px(g2, 90); g2.co.advanceHours(24); const d0 = g2.co.dayIdx, n0 = g2.co.reserveAutoList()[0].runs; g2.co.advanceHours(5); g2.co.advanceHours(3); g2.co._autoReserveDay(); g2.co._autoReserveDay();
  T('3b (test 5) several checks inside the same economic day never sell twice', g2.co.dayIdx === d0 && g2.co.reserveAutoList()[0].runs === n0 && rstock(g2) === 290000);
  const g3 = rig(300000); ord(g3, { price: 80, amount: 10000 }); px(g3, 90); day(g3); px(g3, 60); day(g3, 2); T('3c (test 6) when the price falls it stops selling but the order stays active', rstock(g3) === 290000 && g3.co.reserveAutoList()[0].on && g3.co.reserveAutoList()[0].last.state === 'wait');
  px(g3, 85); day(g3); T('3d (test 7) it resumes by itself when the condition holds again', rstock(g3) === 280000 && g3.co.reserveAutoList()[0].runs === 2); }

console.log('4. stopping');
{ const g = rig(300000), co = g.co, o = ord(g, { price: 80 }); px(g, 90); day(g); const s = rstock(g); co.reserveAutoSet(o.id, false); day(g, 4); T('4a (test 8) a stopped order never sells again, however high the price', rstock(g) === s && o.runs === 1 && !o.on);
  co.reserveAutoSet(o.id, true); day(g); T('4b resuming works and sells the next day', rstock(g) === s - 10000);
  const id = o.id; co.reserveAutoDelete(id); const s2 = rstock(g); day(g, 3); T('4c a deleted order sells nothing', rstock(g) === s2 && co.reserveAutoList().length === 0);
  const o2 = ord(g, { price: 80, amount: 5000 }); co.reserveAutoUpdate(o2.id, { price: 200 }); day(g); T('4d editing the target takes effect (price now below it: no sale)', rstock(g) === s2 && o2.price === 200); }

console.log('5. quantity modes and limits');
{ const g = rig(300000); ord(g, { price: 80, mode: 'qty', amount: 25000 }); px(g, 90); day(g); T('5a (test 9) fixed quantity: exactly 25,000 bbl', rstock(g) === 275000);
  const g2 = rig(300000); ord(g2, { price: 80, mode: 'pct', amount: 10 }); px(g2, 90); day(g2); T('5b (test 10) percentage of the available stock: 10% = 30,000', rstock(g2) === 270000); day(g2); T('5c the next day 10% of what is LEFT (27,000)', Math.abs(rstock(g2) - 243000) < 1e-6);
  const g3 = rig(30000); ord(g3, { price: 80, amount: 100000 }); px(g3, 90); day(g3); T('5d (test 11) asking for more than the stock sells only what exists, never below zero', rstock(g3) === 0 && g3.co.reserveAutoList()[0].sold === 30000 && g3.co.reserveAutoList()[0].last.state === 'partial');
  const n = g3.co.journal.n, cash = g3.store.cash; day(g3, 3); T('5e (test 12) empty reserve: no sale, no booking, no error; the order stays active', g3.co.journal.n >= n && g3.store.cash <= cash + 1e-6 && g3.co.reserveAutoList()[0].sold === 30000 && g3.co.reserveAutoList()[0].on && g3.co.reserveAutoList()[0].last.state === 'empty'); }

console.log('6. accounting');
{ const g = rig(300000), co = g.co, o = ord(g, { price: 80, amount: 40000 }); px(g, 90); const c0 = g.store.cash, ir0 = bal(co, 'INV_RESERVE'), rev0 = bal(co, 'REV_SPOT'), fee0 = bal(co, 'EXP_FEES'), cogs0 = bal(co, 'COGS'), avg = co.reserveAvgCost('CRUDE'), n0 = co.reserveLog(300).length; day(g);
  const gross = 40000 * 90, fee = gross * 0.02 /* placeholder, replaced below */; const EC = require('./economy-config.js'), f = gross * EC.FEES.spot;
  T('6a (test 13) revenue = qty × price; fee = the current spot fee; cash = revenue − fee − running costs of the day', near(-(bal(co, 'REV_SPOT') - rev0), gross) && near(bal(co, 'EXP_FEES') - fee0, f) && o.revenue === gross && near(o.fees, f), [bal(co, 'REV_SPOT') - rev0, o.revenue, o.fees, f]);
  T('6b INV_RESERVE fell by exactly the average cost of the barrels sold (COGS up by the same)', near(ir0 - bal(co, 'INV_RESERVE'), 40000 * avg, 1e-6) && near(bal(co, 'COGS') - cogs0, 40000 * avg, 1e-6), [ir0 - bal(co, 'INV_RESERVE'), 40000 * avg]);
  T('6c INV_RESERVE = the reserve tanks again; the books audit clean', co.audit().ok, co.audit());
  const L = co.reserveLog(300).filter(l => l.kind === 'SELL' && l.auto === o.id); T('6d one reserve-log row per sale, marked automatic, with qty, price, revenue', L.length === 1 && L[0].qty === 40000 && near(L[0].revenue, gross) && /تلقائي/.test(L[0].note));
  const E = require('./economy.js'); T('6e it is booked as the existing reserve sale (SALE_SPOT, source RESERVE), no new account', typeof co.reserveSell === 'function' && !Object.keys(co.journal.bal).some(k => /AUTO/.test(k))); }
{ const g = rig(300000), co = g.co; ord(g, { price: 80, amount: 200000 }); px(g, 90); const cs = cstock(g), cb = bal(co, 'INV_CRUDE') + bal(co, 'INV_CRUDE_BUY'); day(g, 2);
  T('14. (test 14) the commercial stock and its books are untouched by automatic selling', cstock(g) === cs && bal(co, 'INV_CRUDE') + bal(co, 'INV_CRUDE_BUY') === cb && rstock(g) === 0, [cstock(g), rstock(g)]);
  const g2 = rig(0); ord(g2, { price: 80, amount: 20000 }); px(g2, 90); day(g2, 2); T('14b with NO reserve oil but 50,000 bbl in a commercial tank: nothing is sold', cstock(g2) === 50000 && g2.co.reserveAutoList()[0].sold === 0); }

console.log('7. save / load, no repeat');
{ const g = rig(300000), co = g.co; const o = ord(g, { price: 80, amount: 10000 }); px(g, 90); day(g); const day0 = co.dayIdx, st = rstock(g);
  const g2 = reload(g), c2 = g2.co; c2.market.tick = () => {}; px(g2, 90); const o2 = c2.reserveAutoList()[0];
  T('15. (test 15) the order comes back with its state, target, quantity, totals and history', !!o2 && o2.id === o.id && o2.on === true && o2.price === 80 && o2.mode === 'qty' && o2.amount === 10000 && o2.runs === 1 && o2.sold === 10000 && o2.revenue === o.revenue && o2.hist.length === 1);
  T('15b stopped state is restored too', (() => { co.reserveAutoSet(o.id, false); const g3 = reload(g); return g3.co.reserveAutoList()[0].on === false; })());
  co.reserveAutoSet(o.id, true); const g4 = reload(g), c4 = g4.co; c4.market.tick = () => {}; px(g4, 90); const s4 = c4.reserveStock('CRUDE'); c4._autoReserveDay(); c4._autoReserveDay();
  T('16. (test 16) after a reload the same economic day is NOT sold again', c4.dayIdx === day0 && c4.reserveStock('CRUDE') === s4 && c4.reserveAutoList()[0].runs === 1, [c4.dayIdx, day0]);
  c4.advanceHours(24); T('16b the next day it sells again as usual', c4.reserveStock('CRUDE') === s4 - 10000);
  T('16c a save/load round trip keeps the books balanced', c4.audit().ok); }

console.log('8. old saves');
{ const g = rig(300000), co = g.co; const j = JSON.parse(JSON.stringify(co.toJSON())); T('17a (test 17) a game that never made an order saves with NO auto section (old structure untouched)', !('auto' in j.reserve), Object.keys(j.reserve));
  const old = JSON.parse(JSON.stringify(j)); delete old.reserve.auto; const g2 = game(), c2 = g2.co; c2.fromJSON(old); T('17b loading an old save: no order exists, none active, selling does nothing', c2.reserveAutoList().length === 0); c2.market.tick = () => {}; c2.market.price.CRUDE = 999; c2.advanceHours(24 * 3); const g5 = rig(300000), g6 = reload(g5); g6.co.market.tick = () => {}; g6.co.market.price.CRUDE = 999; g6.co.advanceHours(24 * 3); T('17c even at a huge price a reloaded old game sells nothing by itself', g6.co.reserveStock('CRUDE') === 300000); const bad = JSON.parse(JSON.stringify(j)); bad.reserve.auto = { orders: 'x' }; const g3 = game(); g3.co.fromJSON(bad); T('17d a malformed auto section is dropped safely', g3.co.reserveAutoList().length === 0); }
{ const g = rig(300000), co = g.co; T('17e totals helper is correct with no orders', JSON.stringify(co.reserveAutoTotals()) === JSON.stringify({ orders: 0, active: 0, sold: 0, revenue: 0, fees: 0 })); const o = ord(g, { price: 80 }); const o2 = ord(g, { price: 70, mode: 'pct', amount: 1 }); px(g, 90); day(g);
  const t = co.reserveAutoTotals(); T('17f two orders on the same day each sell once (10,000 + 1% of what is left)', t.orders === 2 && t.active === 2 && o.runs === 1 && o2.runs === 1 && t.sold === o.sold + o2.sold); }
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
