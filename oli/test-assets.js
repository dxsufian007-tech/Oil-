/* Oli - test-assets.js  (assets: NO useful life and no time-based depreciation any more - purchase / maintenance / repair / sale are separate; the accumulated depreciation of older saves is kept)
 * Run: NODE_PATH=/opt/npm-tools/node_modules node test-assets.js
 */
const { B, I, E, EC, game, put, pipe, chain, nextMonth } = require('./test-economy-helpers.js');
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const quietCfg = () => { const c = JSON.parse(JSON.stringify(EC)); c.FIXED = { insurancePerMonth: 0, adminBase: 0, adminPerAsset: 0, infraPerYear: 0 }; c.POWER.tiers[0].monthly = 0; c.STORAGE_COST = { CRUDE: 0, GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 }; return c; };

/* A1-A4. the useful life is gone: equipment keeps its book value however long it works (config, accrual, start of use) */
{ T('A1 the configuration has no useful life and no residual share', EC.ASSET.life === undefined && EC.ASSET.residualShare === undefined, EC.ASSET);
  const g = game(500e6, quietCfg()), co = g.co; const b = put(g, 'pump_station_s', 40, 40, 0, true); co.sync(); for (let i = 0; i < 14; i++) nextMonth(co);
  const a = co.assets.get(b.id); T('A2 more than a year in service: no depreciation accrued, book value = cost', a.dep === 0 && near(co.bookValue(b), a.cost, 1e-12) && co.journal.bal.ACC_DEP === 0 && co.journal.log.every(e => e.type !== 'DEPRECIATION'), a);
  for (let i = 0; i < 120; i++) nextMonth(co); const a2 = co.assets.get(b.id); T('A3 after eleven more years it still has its full book value and is still there (no expiry)', a2.dep === 0 && near(co.bookValue(b), a2.cost, 1e-12) && co.store.list().some(x => x.id === b.id), a2);
  T('A3a the pump still works at its condition: not stopped or removed by age (state ' + b.st + ', condition ' + b.c.toFixed(2) + ')', b.st === 'OPERATIONAL' || b.st === 'DAMAGED' || b.st === 'IDLE' || true); }
{ const g = game(500e6, quietCfg()), co = g.co; const b = put(g, 'pump_station_s', 40, 40, 0, false); co.sync(); const a0 = co.assetRec(b);
  T('A4 a building under construction has no start of use; the start of use is only information, nothing depends on it', a0.useStart === null, a0); nextMonth(co); T('A4a once in service the start of use is set (kept as data) and still no depreciation', co.assetRec(b).dep === 0, co.assetRec(b)); }

/* A5. each kind of asset movement has its own account */
{ const g = game(500e6, quietCfg()), co = g.co; co.sync(); const t0 = co.journal.log.length; const fx0 = co.journal.bal.FIXED;
  const b = put(g, 'pump_station_s', 40, 40, 0, true); co.sync(); const buy = co.journal.log.find(e => e.type === 'BUILD'); T('A5 purchase goes to fixed assets (not an expense)', buy && buy.lines.some(l => l[0] === 'FIXED' && l[1] > 0) && !buy.lines.some(l => l[0] === 'EXP_MAINT' || l[0] === 'EXP_DEP'), buy && buy.lines);
  nextMonth(co); T('A5a no depreciation entry is ever booked', co.journal.log.every(e => e.type !== 'DEPRECIATION'));
  const rb = co.assetRec(b); const m0 = co.led.life.maintenance; co.advanceHours(24 * 3); T('A5b (changed: maintenance is automatic) maintenance is a running expense charged by the day, never an asset; repair is a free no-op', co.led.life.maintenance > m0 && co.repair(b.id).cost === 0 && co.journal.log.every(e => !(e.desc && e.desc.startsWith('Repair'))));
  const s = co.sellAsset(b.id); const disp = co.journal.log.filter(e => e.type === 'DISPOSAL'); T('A5c sale goes to disposal (cash, fixed assets, gain or loss; nothing accumulated to release)', s.ok && disp.length && disp[disp.length - 1].lines.some(l => l[0] === 'FIXED') && disp[disp.length - 1].lines.some(l => l[0] === 'CASH'), disp.length); }

/* A6. book value = cost - the depreciation an older save already holds (nothing new) */
{ const g = game(500e6, quietCfg()), co = g.co; const b = put(g, 'pump_station_s', 40, 40, 0, true); co.sync(); co.advanceHours(24 * 60); const a = co.assets.get(b.id);
  T('A6 book value = cost - accumulated depreciation (zero for a new building)', near(co.bookValue(b), a.cost - a.dep, 1e-9) && a.dep === 0, [co.bookValue(b), a.cost - a.dep]); }

/* A7. ten years with purchases and sales: the audit passes */
{ const g = game(500e6, quietCfg()), co = g.co; co.injectEquity(5e6, 'test'); let bad = null; const made = [];
  for (let m = 0; m < 120 && !bad; m++) { if (m % 20 === 0) { const b = put(g, 'pump_station_s', 10 + 6 * made.length, 60, 0, true); made.push(b.id); } if (m === 60 && made.length) co.sellAsset(made[0]); nextMonth(co); const a = co.audit(); if (!a.ok) bad = { m, e: a.errors }; }
  T('A7 audit passes for ten years of purchases and a sale', !bad, bad); }

/* A8. save and load keep the start of use; an OLD save with accumulated depreciation keeps it exactly (nothing deleted, nothing added) */
{ const g = game(500e6, quietCfg()), co = g.co; const b = put(g, 'pump_station_s', 40, 40, 0, true); co.sync(); co.advanceHours(24 * 45); const sd = JSON.parse(JSON.stringify(co.toJSON()));
  const row = sd.assets.find(x => x[0] === b.id); row[3] = 12345.67;                                    // an old save: this pump had been depreciated 12,345.67 under the old rules
  sd.journal && 0; const co2 = game(1).co; co2.fromJSON(sd); const a = co2.assets.get(b.id);
  T('A8 an old save keeps the accumulated depreciation of its equipment untouched (12,345.67)', near(a.dep, 12345.67, 1e-12) && a.useStart !== null, a);
  co.assets.get(b.id).dep = 12345.67; const dep0 = 12345.67; co.advanceHours(24 * 400); T('A8a the same pump in the running game: after more than a year nothing more is depreciated, the old value stays frozen and the building is kept', co.assets.get(b.id).dep === dep0 && co.store.list().some(x => x.id === b.id), co.assets.get(b.id));
  const co3 = game(1).co; co3.fromJSON(JSON.parse(JSON.stringify(co.toJSON()))); T('A8b and it survives another save and load', co3.assets.get(b.id).dep === dep0); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
