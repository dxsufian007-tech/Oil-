/* Oli - test-market.js  (Economy Phase 11: market - change-based prices, bounded moves, supply / demand / stock / competition, economic events, profit effect)
 * Run: NODE_PATH=/opt/npm-tools/node_modules node test-market.js
 */
const { B, I, E, EC, game, put, pipe, chain } = require('./test-economy-helpers.js');
EC.BRENT.enabled = false;   // this file tests the synthetic random-walk market model (fixed base prices, bounded moves); the historical Brent market is tested in test-brent-market.js: it runs on the legacy market (BRENT off). The historical market has its own tests.
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const quietCfg = () => { const c = JSON.parse(JSON.stringify(EC)); c.FIXED = { insurancePerMonth: 0, adminBase: 0, adminPerAsset: 0, infraPerYear: 0 }; c.POWER.tiers[0].monthly = 0; c.STORAGE_COST = { CRUDE: 0, GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 }; return c; };
const { Market, Rng } = require('./economy.js');

/* M1. each hour the price moves by at most the bound, for every product (bounded change) */
{ const m = new Market(EC); let worst = 0; for (let i = 0; i < 3000; i++) { const before = Object.assign({}, m.price); m.tick(); for (const p of EC.PRODUCTS) worst = Math.max(worst, Math.abs(m.price[p] / before[p] - 1)); }
  T('M1 hourly move never exceeds the bound (1%)', worst <= EC.MARKET.hourlyChangeLimit + 1e-9, worst); }

/* M2. supply up lowers the price; shortage raises it (events on the same seed, compared with no event) */
function avgPrice(event, p, hours) { const m = new Market(EC); if (event) m.events.push({ id: event, label: event, left: hours + 10 }); let s = 0; for (let i = 0; i < hours; i++) { m.tick(); s += m.price[p]; } return s / hours; }
{ const base = avgPrice(null, 'GASOLINE', 480), up = avgPrice('PRODUCTION_UP', 'GASOLINE', 480); T('M2 more production lowers the price', up < base, [up, base]); }
{ const base = avgPrice(null, 'GASOLINE', 480), sh = avgPrice('SHORTAGE', 'GASOLINE', 480); T('M2a a shortage raises the price', sh > base, [sh, base]); }
{ const base = avgPrice(null, 'CRUDE', 480), dem = avgPrice('DEMAND_UP', 'CRUDE', 480), dn = avgPrice('DEMAND_DOWN', 'CRUDE', 480); T('M3 demand up raises, demand down lowers the price', dem > base && dn < base, [dn, base, dem]); }
{ const base = avgPrice(null, 'CRUDE', 480), oc = avgPrice('OIL_CRISIS', 'CRUDE', 480); T('M3a an oil crisis raises the crude price', oc > base, [oc, base]); }

/* M4. stock pressure: a product that is more than 80% full is pushed down */
{ const a = new Market(EC), b = new Market(EC); b.stock.DIESEL = 1; let sa = 0, sb = 0; for (let i = 0; i < 480; i++) { a.tick(); b.tick(); sa += a.price.DIESEL; sb += b.price.DIESEL; }
  T('M4 a full stock tank lowers the price', sb < sa, [sb / 480, sa / 480]); }

/* M5. competition level changes the target price (HIGH < MEDIUM < LOW) */
{ const M = EC.MARKET.competitionMult; T('M5 competition: high < medium < low', M.HIGH < M.MEDIUM && M.MEDIUM < M.LOW); }

/* M6. events expire after their days */
{ const m = new Market(EC); m.events.push({ id: 'SHORTAGE', label: 'x', left: 5 }); for (let i = 0; i < 6; i++) m.tick(); T('M6 an event ends after its days', !m.events.some(e => e.id === 'SHORTAGE'), m.events); }

/* M7. transport and energy cost event: purchases carry more freight, power costs more */
{ const g = game(500e6, quietCfg()), co = g.co; co.market.events.push({ id: 'TRANSPORT_UP', label: 'x', left: 1000 });
  const q = co.buyQuote('CRUDE', 1000, 'A'), s = EC.SUPPLIERS.find(x => x.id === 'A'); T('M7 freight rises by the event factor', near(q.freight, 1000 * s.freightPerUnit.crude * 1.30, 1e-9), [q.freight, 1000 * s.freightPerUnit.crude * 1.30]);
  T('M7a the power cost factor follows the event', near(co.market.costMult().energy, 1.20, 1e-9), co.market.costMult()); }

/* M8. the price affects profit: the same barrels sell for more when the price is higher */
{ const g = game(500e6, quietCfg()), co = g.co; co._post({ type: 'PROD_CRUDE', flow: 'OP', desc: 'crude' }, [['INV_CRUDE', 1e6], ['CASH', -1e6]]); co.qty.CRUDE = 10000; const tank = put(g, 'crude_tank_m', 68, 38); co.sim.ensure(tank).vol = 10000; co.sync();
  const q1 = co.quote('CRUDE', 1000); co.market.price.CRUDE *= 1.2; const q2 = co.quote('CRUDE', 1000);
  T('M8 the same barrels earn 20% more when the price is 20% higher', near(q2.gross / q1.gross, 1.2, 1e-6), q2.gross / q1.gross); }

/* M9. the price path is deterministic (same seed, same prices) */
{ const a = new Market(EC), b = new Market(EC); for (let i = 0; i < 200; i++) { a.tick(); b.tick(); } T('M9 same seed, same prices', a.price.CRUDE === b.price.CRUDE && a.price.GAS === b.price.GAS, [a.price.CRUDE, b.price.CRUDE]); }

/* M10. save and load keep the events and their random stream */
{ const g = game(500e6, quietCfg()), co = g.co; chain(g, false, false); co.market.events.push({ id: 'OIL_CRISIS', label: 'x', left: 100 }); co.advanceHours(50);
  const sd = JSON.parse(JSON.stringify(co.toJSON())), co2 = game(1).co; co2.fromJSON(sd); co.advanceHours(60); co2.advanceHours(60);
  T('M10 events and random stream survive save and load (same prices afterwards)', co2.market.price.CRUDE === co.market.price.CRUDE && co2.market.events.length === co.market.events.length, [co2.market.price.CRUDE, co.market.price.CRUDE]); }

/* M11. two years with events happening by chance: the audit still passes */
{ const g = game(500e6, quietCfg()), co = g.co; chain(g, true, true); co.injectEquity(1e6, 'test'); for (const p of EC.PRODUCTS) co.setMode(p, 'SPOT'); let bad = null, n = 0;
  for (let m = 0; m < 24 && !bad; m++) { co.advanceHours(24 * 30); n += co.market.events.length; const a = co.audit(); if (!a.ok) bad = { m, e: a.errors }; }
  T('M11 audit passes for two years with market events', !bad, bad); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
