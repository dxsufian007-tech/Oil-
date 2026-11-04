/* Oli - test-assets.js  (Economy Phase 14: assets - straight line over the useful life, start of use, residual value, separate purchase / depreciation / maintenance / repair / sale)
 * Run: NODE_PATH=/opt/npm-tools/node_modules node test-assets.js
 */
const { B, I, E, EC, game, put, pipe, chain } = require('./test-economy-helpers.js');
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const quietCfg = () => { const c = JSON.parse(JSON.stringify(EC)); c.FIXED = { insurancePerMonth: 0, adminBase: 0, adminPerAsset: 0, infraPerYear: 0 }; c.POWER.tiers[0].monthly = 0; c.STORAGE_COST = { CRUDE: 0, GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 }; return c; };
const monthly = (cost, life) => cost * (1 - EC.ASSET.residualShare) / (life * EC.TIME.monthsPerYear);

/* A1. straight line: monthly depreciation = (cost - residual) / (life x 12) once in use */
{ const g = game(500e6, quietCfg()), co = g.co; const b = put(g, 'pump_station_s', 40, 40, 0, true); co.sync(); co.advanceHours(24 * 30);
  const a = co.assets.get(b.id), want = monthly(a.cost, EC.ASSET.life.pump); T('A1 first month of depreciation = (cost - residual) / (10 years x 12)', near(a.dep, want, 1e-6), [a.dep, want]); }

/* A2. the useful life depends on the category: a well (15 years) and a tank (25 years) depreciate at different rates */
{ const g = game(500e6, quietCfg()), co = g.co; co.sync(); const w = put(g, 'oil_well', 20, 36, 0, true), t = put(g, 'crude_tank_m', 68, 38, 0, true); co.sync(); co.advanceHours(24 * 30);
  const aw = co.assets.get(w.id), at = co.assets.get(t.id); T('A2 a well and a tank have different useful lives (15 vs 25 years)', near(aw.dep / (aw.cost * 0.9), 1 / (15 * 12), 1e-6) && near(at.dep / (at.cost * 0.9), 1 / (25 * 12), 1e-6), [aw.dep / (aw.cost * 0.9), at.dep / (at.cost * 0.9)]); }

/* A3. residual value: after the whole life the book value equals the residual (10% of cost), not a 30% floor */
{ const g = game(500e6, quietCfg()), co = g.co; const b = put(g, 'pump_station_s', 40, 40, 0, true); co.sync(); co.advanceHours(24 * 30 * 121 + 1);
  const a = co.assets.get(b.id), book = co.bookValue(b); T('A3 after 10 years the book value is the residual value (10%)', near(book, a.cost * EC.ASSET.residualShare, 1e-6), [book, a.cost * EC.ASSET.residualShare]);
  T('A3a and it is not floored at 30%', book < a.cost * 0.3, book / a.cost); }

/* A4. the start of use: depreciation begins only when the building is in service */
{ const g = game(500e6, quietCfg()), co = g.co; const b = put(g, 'pump_station_s', 40, 40, 0, false); co.sync(); const a0 = co.assetRec(b);
  T('A4 a building under construction has no start of use', a0.useStart === null, a0); co.advanceHours(24 * 30); const a1 = co.assetRec(b);
  T('A4a once in service the start of use is set and depreciation starts', a1.useStart !== null && a1.dep > 0 || b.st !== 'OPERATIONAL', [a1.useStart, a1.dep, b.st]); }

/* A5. each kind of asset movement has its own account */
{ const g = game(500e6, quietCfg()), co = g.co; co.sync(); const t0 = co.journal.log.length; const fx0 = co.journal.bal.FIXED;
  const b = put(g, 'pump_station_s', 40, 40, 0, true); co.sync(); const buy = co.journal.log.find(e => e.type === 'BUILD'); T('A5 purchase goes to fixed assets (not an expense)', buy && buy.lines.some(l => l[0] === 'FIXED' && l[1] > 0) && !buy.lines.some(l => l[0] === 'EXP_MAINT' || l[0] === 'EXP_DEP'), buy && buy.lines);
  co.advanceHours(24 * 30); const dep = co.journal.log.filter(e => e.type === 'DEPRECIATION'); T('A5a depreciation is an expense account (EXP_DEP) with accumulated depreciation', dep.length > 0 && dep[0].lines.some(l => l[0] === 'EXP_DEP'), dep[0] && dep[0].lines);
  const rb = co.assetRec(b); co.assets.get(b.id).cost; b.c = 0.5; const rc = co.repairCost(b); co.repair(b.id); const rep = co.journal.log.filter(e => e.desc && e.desc.startsWith('Repair')); T('A5b repairs are an expense (maintenance), not an asset', rep.length > 0 && rep[rep.length - 1].lines.some(l => l[0] === 'EXP_MAINT'), rep.length);
  const s = co.sellAsset(b.id); const disp = co.journal.log.filter(e => e.type === 'DISPOSAL'); T('A5c sale goes to disposal (cash, accumulated depreciation, gain or loss)', s.ok && disp.length && disp[disp.length - 1].lines.some(l => l[0] === 'ACC_DEP'), disp.length); }

/* A6. book value = cost - accumulated depreciation */
{ const g = game(500e6, quietCfg()), co = g.co; const b = put(g, 'pump_station_s', 40, 40, 0, true); co.sync(); co.advanceHours(24 * 60); const a = co.assets.get(b.id);
  T('A6 book value = cost - accumulated depreciation', near(co.bookValue(b), a.cost - a.dep, 1e-9), [co.bookValue(b), a.cost - a.dep]); }

/* A7. ten years with purchases and sales: the audit passes */
{ const g = game(500e6, quietCfg()), co = g.co; co.injectEquity(5e6, 'test'); let bad = null; const made = [];
  for (let m = 0; m < 120 && !bad; m++) { if (m % 20 === 0) { const b = put(g, 'pump_station_s', 10 + 6 * made.length, 60, 0, true); made.push(b.id); } if (m === 60 && made.length) co.sellAsset(made[0]); co.advanceHours(24 * 30); const a = co.audit(); if (!a.ok) bad = { m, e: a.errors }; }
  T('A7 audit passes for ten years of purchases and a sale', !bad, bad); }

/* A8. save and load keep the start of use and the depreciation */
{ const g = game(500e6, quietCfg()), co = g.co; const b = put(g, 'pump_station_s', 40, 40, 0, true); co.sync(); co.advanceHours(24 * 45); const sd = JSON.parse(JSON.stringify(co.toJSON())), co2 = game(1).co; co2.fromJSON(sd);
  T('A8 start of use and depreciation survive save and load', co2.assets.get(b.id).dep > 0 && co2.assets.get(b.id).useStart !== null && near(co2.assets.get(b.id).dep, co.assets.get(b.id).dep, 1e-9)); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
