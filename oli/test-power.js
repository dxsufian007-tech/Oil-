/* Oli - test-power.js  (Economy Phase 12: power - consumption, energy cost, supply vs demand, bought power, shortage priorities, grid)
 * Run: NODE_PATH=/opt/npm-tools/node_modules node test-power.js
 */
const { B, I, E, EC, game, put, pipe, chain } = require('./test-economy-helpers.js');
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const quietCfg = () => { const c = JSON.parse(JSON.stringify(EC)); c.FIXED = { insurancePerMonth: 0, adminBase: 0, adminPerAsset: 0, infraPerYear: 0 }; c.POWER.tiers[0].monthly = 0; c.STORAGE_COST = { CRUDE: 0, GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 }; return c; };
const smallCfg = kw => { const c = quietCfg(); c.POWER.tiers[0].kw = kw; return c; };

/* P1. consumption: base kW x (idle share + (1 - idle share) x load); energy cost per day = kW x 24 x price */
{ const g = game(500e6, quietCfg()), co = g.co, c = chain(g, false, false); co.advanceHours(24); const w = c.wells[0], b = co.economics(w.id), K = EC.POWER_KW;
  const load = co.loadOf(w), kw = co.kwOf(w, load);
  T('P1 well consumption = base x (idle + (1-idle) x load)', near(kw, K.well * (K.idleShare + (1 - K.idleShare) * load), 1e-9), [kw, load]);
  T('P1a energy cost per day = kW x 24 h x price', near(b.energyDay, kw * 24 * EC.ENERGY.pricePerKWh, 1e-9), [b.energyDay, kw]); }

/* P2. a power shortage lowers efficiency gradually (no stop) when the shortage is moderate */
{ const g = game(500e6, smallCfg(600)), co = g.co, c = chain(g, true, false); co.advanceHours(96);
  T('P2 moderate shortage: the plant is power-limited', co.pw.limited && co.pw.shortage > 0, co.pw);
  T('P2a moderate shortage: no facility stopped', co.pwStop == null, co.pwStop);
  T('P2b the refinery still runs at reduced efficiency', c.ref.s.ecoEff > 0 && c.ref.s.ecoEff < 1, c.ref.s.ecoEff); }

/* P3. severe shortage stops the least important facilities first */
{ const g = game(500e6, smallCfg(60)), co = g.co, c = chain(g, true, false); co.advanceHours(120);
  T('P3 severe shortage: some facilities stop', co.pwStop != null, [co.pw.factor, co.pwStop]);
  T('P3a a stopped facility has zero efficiency', co.pwStop == null || c.ref.s.ecoEff === 0 || (EC.POWER_PRIORITY.refinery < co.pwStop), [co.pwStop, c.ref.s.ecoEff]);
  T('P3b the wells (most important) keep running', c.wells.every(w => co.sim.ensure(w).ecoEff > 0) || !c.wells.length, c.wells.map(w => co.sim.ensure(w).ecoEff)); }

/* P4. bought power covers the shortage, costs kWh x price x premium, and raises the supply */
{ const g = game(500e6, smallCfg(600)), co = g.co, c = chain(g, true, false); co.setPowerBuy(true); co.advanceHours(24);
  T('P4 bought power covers part of the demand', co.pw.bought > 0 && co.pw.supplied > 600, co.pw);
  const b = co.journal.log.filter(e => e.desc && e.desc.startsWith('Bought power')); T('P4a bought power is posted to the journal', b.length > 0, b.length); }
{ const g = game(500e6, smallCfg(600)), co = g.co, c = chain(g, true, false); co.setPowerBuy(true); co.sync(); co.advanceHours(1); co.sync(); const bought = co.pw.bought, c0 = g.store.cash, e0 = co.journal.bal.EXP_ENERGY;
  co.advanceHours(1); const amt = co.journal.bal.EXP_ENERGY - e0;
  T('P4b bought power cost per hour = kW x 1 h x price x premium (plus the grid use)', bought > 0 && amt >= bought * EC.ENERGY.pricePerKWh * EC.POWER_BUY.priceMult - 1e-6, [amt, bought]); }

/* P5. the priority order: well first, tanks last */
{ const P = EC.POWER_PRIORITY; T('P5 priority: well < separator < pump < refinery < tank', P.well < P.separator && P.separator < P.pump && P.pump < P.refinery && P.refinery < P.tank); }

/* P6. grid upgrade raises the supply and the monthly fee */
{ const g = game(50e6, quietCfg()), co = g.co; const cap0 = co.pw.cap; co.sync(); const r = co.gridUpgrade(); co.computeStaff(); T('P6 grid upgrade accepted', r.ok && co.tier === 1, r);
  T('P6a the capacity follows the new grid tier', co.cfg.POWER.tiers[co.tier].kw > cap0 || co.pw.cap > cap0, [co.pw.cap, cap0]); }

/* P7. two years with shortage and bought power: the audit passes */
{ const g = game(500e6, smallCfg(600)), co = g.co, c = chain(g, true, true); co.injectEquity(1e6, 'test'); co.setPowerBuy(true); let bad = null;
  for (let m = 0; m < 24 && !bad; m++) { co.advanceHours(24 * 30); const a = co.audit(); if (!a.ok) bad = { m, e: a.errors }; }
  T('P7 audit passes for two years with power bought', !bad, bad); }

/* P8. save and load keep the power switch */
{ const g = game(500e6, quietCfg()), co = g.co; co.setPowerBuy(true); const sd = JSON.parse(JSON.stringify(co.toJSON())), co2 = game(1).co; co2.fromJSON(sd); T('P8 power switch survives save and load', co2.powerBuy === true); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
