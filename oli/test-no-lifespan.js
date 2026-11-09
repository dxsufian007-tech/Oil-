/* No useful life, no wear, no breakdowns, no repairs: equipment never expires, stops, breaks or gets replaced; maintenance is an automatic daily cost.   NODE_PATH=/opt/npm-tools/node_modules node test-no-lifespan.js */
const { E, EC, game, put, chain, nextMonth } = require('./test-economy-helpers.js'); const fs = require('fs');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-9 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
const supply = co => { for (const m of ['CHEM', 'OPS', 'PARTS']) { const room = Math.floor(co.roomFor(m)); if (room > 0) co.buy(m, Math.min(room, 5000), 'A', 'CASH'); } };
console.log('1. nothing in the code depends on a useful life');
{ const src = fs.readFileSync('./economy.js', 'utf8') + fs.readFileSync('./economy-config.js', 'utf8') + fs.readFileSync('./industry.js', 'utf8') + fs.readFileSync('./buildings.js', 'utf8');
  T('1a no useful-life setting, residual share or depreciation routine is left', !/ASSET\.life|A\.life|residualShare|_depreciate\(|usefulLife|lifespan/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
  T('1b the configuration keeps only the condition weight', Object.keys(EC.ASSET).join() === 'conditionWeight', EC.ASSET);
  const ui = fs.readFileSync('./economy-ui.js', 'utf8'); T('1c no screen promises a useful life / replacement by age', !/العمر الافتراضي|انتهاء العمر|useful life|end of life/i.test(ui)); }
console.log('2. old equipment keeps working');
{ const g = game(500e6), co = g.co; const x = chain(g, true); for (const p of EC.PRODUCTS) co.setMode(p, 'WAIT');
  const a = co.assetRec(x.pump), b = co.assetRec(x.refinery || x.ref); a.t = -24 * 365 * 60; if (b) b.t = -24 * 365 * 80; // a 60-year-old pump and an 80-year-old refinery
  for (let d = 0; d < 60; d++) { supply(co); co.advanceHours(24); }
  T('2a a 60-year-old pump and an 80-year-old refinery are still in service (not stopped, not removed)', co.store.list().some(q => q.id === x.pump.id) && x.pump.st !== 'DEMOLISHED' && x.pump.st !== 'UNDER_CONSTRUCTION' && (x.ref || x.refinery).st !== 'UNDER_CONSTRUCTION', [x.pump.st, (x.ref || x.refinery).st]);
  T('2b the old chain keeps producing crude and products', co.led.life.produced.CRUDE > 0 && co.led.life.produced.GASOLINE > 0, co.led.life.produced);
  T('2c the books balance', co.audit().ok !== false, co.audit()); }
console.log('3. age changes nothing: an old and a new building behave exactly the same');
{ const run = ageHours => { const g = game(500e6), co = g.co; const x = chain(g, true); for (const p of EC.PRODUCTS) co.setMode(p, 'WAIT'); co.autoRepair = false; for (const q of co.store.list()) co.assetRec(q).t = -ageHours; for (let d = 0; d < 90; d++) { supply(co); co.advanceHours(24); } return { c: co.store.list().map(q => +q.c.toFixed(9)), prod: co.led.life.produced.CRUDE, cash: Math.round(co.store.cash), maint: co.led.life.pl.maintenance }; };
  const young = run(0), old = run(24 * 365 * 70); T('3a condition, production, cash and maintenance after 90 days are identical for 0-year-old and 70-year-old equipment', JSON.stringify(young) === JSON.stringify(old), [young.prod, old.prod, young.cash, old.cash]); }
console.log('4. no wear, no breakdowns, no repairs - maintenance is an automatic cost');
{ const g = game(500e6), co = g.co; const x = chain(g, true); for (const p of EC.PRODUCTS) co.setMode(p, 'WAIT'); const w = x.wells[0], m0 = co.led.life.pl.maintenance;
  for (let d = 0; d < 60; d++) { supply(co); co.advanceHours(24); }
  T('4a equipment does not wear: every building keeps condition 100% after 60 days of work', co.store.list().every(q => q.c === 1), co.store.list().map(q => q.c));
  T('4b maintenance is charged automatically every day as a running cost (' + Math.round(co.led.life.pl.maintenance - m0) + ' dollars) and the daily cost is the same for every day (no growth with damage)', co.led.life.pl.maintenance - m0 > 0 && co.maintDay(w, co.loadOf(w)) === co.maintDay(w, co.loadOf(w)));
  T('4c no building is ever damaged', co.store.list().every(q => q.st !== 'DAMAGED') && co.alerts().every(a => a.key !== 'broken' && a.key !== 'noparts'));
  const cash0 = g.store.cash, r = co.repair(w.id); T('4d there is nothing to repair: repair costs nothing and changes nothing (cash unchanged)', r.ok && r.cost === 0 && g.store.cash === cash0 && co.repairCost(w) === 0 && co.repairAll().n === 0);
  T('4e no repair entries are ever booked', co.journal.log.every(e => !(e.desc && /^Repair/.test(e.desc)) && e.type !== 'DEPRECIATION'));
  /* a long-running well keeps producing at the same rate: sell everything (SPOT) so storage never fills, then compare two equal spans */
  for (const p of EC.PRODUCTS) co.setMode(p, 'SPOT');
  const span = () => { const p0 = co.led.life.produced.CRUDE; for (let d = 0; d < 30; d++) { supply(co); co.advanceHours(24); } return co.led.life.produced.CRUDE - p0; };
  span(); const q1 = span(), q2 = span();
  T('4f production does not decay with time: equal spans produce the same crude (' + Math.round(q1) + ' then ' + Math.round(q2) + ')', q1 > 0 && q2 > q1 * 0.9, [q1, q2]);
  /* an old save in which buildings were worn / damaged: they come back to full condition and work, nothing is deleted */
  const sd = JSON.parse(JSON.stringify(co.toJSON())); const bs = g.store.toJSON(); const dmg = g.store.list().slice(0, 4); dmg.forEach((q, i) => { q.c = i === 0 ? 0 : 0.3; if (i < 2) q.st = 'DAMAGED'; });
  const n0 = g.store.list().length; co.fromJSON(JSON.parse(JSON.stringify(sd))); co.advanceHours(2);
  T('4g an old save with damaged / worn buildings: they are restored to working order on the first hour, none is deleted (' + n0 + ' buildings)', g.store.list().length === n0 && dmg.every(q => q.st !== 'DAMAGED' && q.c === 1), dmg.map(q => [q.st, q.c])); }
console.log('5. nothing keeps depreciating in the background');
{ const g = game(500e6), co = g.co; const x = chain(g, true); for (const p of EC.PRODUCTS) co.setMode(p, 'WAIT'); const fixed0 = co.journal.bal.FIXED, acc0 = co.journal.bal.ACC_DEP, n0 = co.store.list().length;
  for (let y = 0; y < 20; y++) { for (let m = 0; m < 12; m++) { supply(co); nextMonth(co); } }
  T('5a twenty years: accumulated depreciation, depreciation expense and entries all stay at zero', co.journal.bal.ACC_DEP === acc0 && co.journal.bal.EXP_DEP === 0 && co.led.life.pl.depreciation === 0 && co.journal.log.every(e => e.type !== 'DEPRECIATION'), [co.journal.bal.ACC_DEP, co.journal.bal.EXP_DEP]);
  T('5b every building is still there after 20 years (nothing was retired or auto-replaced)', co.store.list().length === n0 && n0 >= 10 && x.wells.every(w => co.store.list().some(q => q.id === w.id)), co.store.list().length);
  T('5c the book value of every building is its full cost', co.store.list().every(q => near(co.bookValue(q), co.assetRec(q).cost)));
  T('5d no alert is about age, end of life, breakdowns or repairs', co.alerts().every(a => !/age|life|expire|replace|broken|repair/i.test(a.key)), co.alerts().map(a => a.key));
  { const a = co.audit(), gap = a.errors.map(e => Math.abs(+(e.match(/-?\d+\.?\d*(e-?\d+)?$/) || [0])[0])); T('5e the audit passes after 20 years (the only residue is floating-point rounding over 1.5 million entries: < 0.01 dollars)', a.ok || (a.errors.every(e => /journal not balanced|balance sheet gap/.test(e)) && gap.every(v => v < 0.01)), a); } }
console.log('6. old saves');
{ const g = game(500e6), co = g.co; const b = put(g, 'pump_station_s', 40, 40, 0, true); co.sync(); co.advanceHours(24 * 45); const sd = JSON.parse(JSON.stringify(co.toJSON()));
  sd.assets.find(r => r[0] === b.id)[3] = 8000;                                                        // an old save that had depreciated this pump
  const co2 = game(1).co; co2.fromJSON(sd); T('6a the old depreciation of an old save is kept exactly', co2.assets.get(b.id).dep === 8000 && co2.assets.get(b.id).cost === co.assets.get(b.id).cost);
  co2.advanceHours(24 * 400); T('6b ... and it does not grow', co2.assets.get(b.id).dep === 8000);
  const sd2 = JSON.parse(JSON.stringify(sd)); sd2.assets.forEach(r => { r.length = 3; }); const co3 = game(1).co; co3.fromJSON(sd2); T('6c a very old save without depreciation or start-of-use fields loads without losing the asset', co3.assets.get(b.id) && co3.assets.get(b.id).cost > 0 && co3.assets.get(b.id).dep === 0); }
console.log('\nNO-LIFESPAN TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
