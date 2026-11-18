/* S7 study: how much of an hour is spent where (real save, Node).  Wraps Sim.stepGen (industry) and times the economy-side per-building passes by replaying them. */
const S = require('./gen-scene.js'), I = require('../industry.js'), B = require('../buildings.js');
const CN = require('../central.js').CentralNet; Object.assign(CN, { hopShare: 1, pcSparse: 1, trDefault: 0, rcvSkip: 1, hopFreezeSkip: 1 });
const g = process.argv[2] ? S.load(process.argv[2]) : S.boot(); const { co, sim, store } = g; const DEFS = B.DEFS;
for (let h = 0; h < 10; h++) co.advanceHours(1);
const sg = I.Sim.prototype.stepGen; let tSim = 0; I.Sim.prototype.stepGen = function* (dt, sl) { const t = process.hrtime.bigint(); yield* sg.call(this, dt, sl); tSim += Number(process.hrtime.bigint() - t) / 1e6; };
const N = 100; let tHour = 0; for (let h = 0; h < N; h++) { const t = process.hrtime.bigint(); co.advanceHours(1); tHour += Number(process.hrtime.bigint() - t) / 1e6; }
console.log('hour total', (tHour / N).toFixed(2), 'ms | Sim.stepGen', (tSim / N).toFixed(2), 'ms (' + (100 * tSim / tHour).toFixed(1) + '%) | everything else in the hour', ((tHour - tSim) / N).toFixed(2), 'ms (' + (100 * (tHour - tSim) / tHour).toFixed(1) + '%)');
const items = store.list(), h = 1, dt = 1 / 24, price = 1; const T = (name, fn, R = 300) => { for (let i = 0; i < 20; i++) fn(); const t = process.hrtime.bigint(); for (let i = 0; i < R; i++) fn(); console.log(name.padEnd(46), (Number(process.hrtime.bigint() - t) / 1e6 / R).toFixed(3), 'ms/hour'); };
console.log('buildings', items.length);
T('eco pre-pass: ensure + effOf per building', () => { for (const b of items) { const s = sim.ensure(b); s.ecoEff = co.effOf(b); } });
T('eco cost pass: loadOf/kwOf/opDay/maintDay/assetRec', () => { let kw = 0; for (const b of items) { if (b.st !== 'OPERATIONAL') continue; const load = co.loadOf(b); co.assetRec(b); const k = co.kwOf(b, load); co.opDay(b, load); co.maintDay(b, load); kw += k; } });
T('eco storage pass: vol * STORAGE_COST', () => { let c = 0; for (const b of items) { const def = DEFS[b.d]; if ((def.type === 'tank' || def.type === 'gas') && b.s && b.s.vol > 0) c += b.s.vol; } });
T('eco _qNow (wells quality)', () => co._qNow(items));
T('sim pass0: clear _fields per building', () => { for (const b of items) { const s = sim.ensure(b); for (const k in s) if (k.charCodeAt(0) === 95 && s[k] !== undefined) s[k] = undefined; } }, 100);
T('sim apply-deliveries/derive pass', () => { let n = 0; for (const b of items) { const def = DEFS[b.d], s = b.s; if (def.type === 'tank' || def.type === 'gas') n += s._pend || 0; } });
T('co.computeStaff x2', () => co.computeStaff(), 100); T('co._gateMaterials', () => co._gateMaterials(items, dt), 100); T('co._collect', () => co._collect(), 100); T('co._finance', () => co._finance(1), 100);
T('store.tick', () => store.tick(1), 100);
T('co.sync', () => co.sync(), 100); T('co.centralDaily', () => co.centralDaily(), 100); T('co._autoBuy', () => co._autoBuy(), 100); T('co._paySuppliers', () => co._paySuppliers(), 100); T('co.crudeOnHand', () => co.crudeOnHand(), 100); T('co.market.tick', () => co.market.tick(co.hours), 100); T('co._trainHr', () => co._trainHr(1), 100); T('co._reserveSettle x3', () => { co._reserveSettle('OUT'); co._reserveSettle('IN', true); co._reserveSettle('IN', false); }, 100);
