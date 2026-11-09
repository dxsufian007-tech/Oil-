'use strict';
/* OLD save with Strategic Reserve tanks and stock -> loaded into the NEW sector world (C1 geographic land removed, reserve SYSTEM kept):
   the tanks stay where they are, the stock/book value stay identical, withdraw/sell/expand still work, a second save->load is identical.
   node test-old-save-reserve.js */
const W = require('./worldmap.js'), B = require('./buildings.js'), I = require('./industry.js'), E = require('./economy.js'), EC = require('./economy-config.js'), assert = require('assert');
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
let n = 0; const ok = (c, m, x) => { if (!c) console.log('  FAIL ' + m + (x ? ' ' + JSON.stringify(x) : '')); assert(c, m); n++; console.log('  ok  ' + m); };
const SEED = 20260101;
const mk = (world) => { const ts = B.fromWorld(world), store = new B.BuildingStore(ts, { cash: 900e6 }), net = new I.PipeNet(ts.W), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 }); store.cash = 900e6; for (const p of EC.PRODUCTS) co.setMode(p, 'WAIT'); return { world, ts, store, net, sim, co }; };
const saveOf = g => JSON.parse(JSON.stringify({ v: 2, store: g.store.toJSON(), net: g.net.toJSON(), cash: g.store.cash, eco: g.co.toJSON(), wd: { r: g.world.reserveSnapshot(), p: g.world.progressSnapshot(), z: g.world.zoneSnapshot() } }));
function loadInto(world, save) {
  const g = mk(world); world.restoreZones(save.wd.z); world.restoreProgress(save.wd.p); world.restoreReserve(save.wd.r);
  const r = B.BuildingStore.fromJSON(g.ts, save.store, { cash: save.cash }); g.store = r.store; g.store.cash = save.cash;
  const n0 = I.PipeNet.fromJSON(g.ts.W, save.net), net = new I.PipeNet(g.ts.W); for (const L of n0.lines.values()) net.lay({ a: L.a, b: L.b, path: L.path, product: L.product, dia: L.dia });
  g.net = net; g.sim = new I.Sim(g.store, net); g.co = new E.Company(g.store, net, g.sim, { now: () => 1e12 }); g.co.fromJSON(save.eco); g.co.setSpeed(0); for (const b of g.store.list()) g.sim.ensure(b); g.report = r.report; return g;
}
const view = g => { const f = g.co.fills(), ri = g.co.reserveInfo(); return { lv: g.co.reserve.lv, tanks: g.store.list().filter(b => b.rs).map(b => [b.id, b.d, b.x, b.y, b.r].join(',')).sort(), crude: g.co.reserveStock('CRUDE'), gas: g.co.reserveStock('GASOLINE'), avgC: g.co.reserveAvgCost('CRUDE'), cap: f.reserve.capacity, vol: f.reserve.volume, tanksN: f.reserve.tanks, book: g.co.journal.bal.INV_RESERVE || 0, log: g.co.reserve.log.length, info: ri.tanks.length }; };
if (process.argv[2] === 'child') {                                          /* each load in its OWN process (site reserves are module-level state) */
  const save = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), world = W.createWorld({ seed: SEED }), g = loadInto(world, save), out = { v0: view(g), dropped: g.report.dropped.length, loaded: g.report.loaded, start: world.homeRegionOfWorld().name, c1: !!world.sector('C1'), zone: world.reserveZoneOfWorld() && { x: world.reserveZoneOfWorld().x, y: world.reserveZoneOfWorld().y } };
  const q = g.co.reserveSellQuote('CRUDE', 5000); out.sellQ = !!q.ok; const w = g.co.reserveSell('CRUDE', 5000); out.sell = !!w.ok; out.afterSell = g.co.reserveStock('CRUDE');
  out.expand = g.co.reserveExpand().ok; out.buy = g.co.reserveBuy('CRUDE', 1000, 'A', 'CASH').ok; out.audit = g.co.audit().ok;
  if (process.argv[4] !== 'again') { const g1 = loadInto(W.createWorld({ seed: SEED }), JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))); fs.writeFileSync(process.argv[3] + '.2', JSON.stringify(saveOf(g1))); }
  fs.writeFileSync(process.argv[3] + (process.argv[4] === 'again' ? '.again' : '.out'), JSON.stringify(out)); process.exit(0);
}
// 1. the OLD game: legacy world, reserve zone open to level 2, 3 tanks (2 crude + 1 gasoline), stock bought, a pipe, saved
const old = mk(W.createWorld({ sectors: false, seed: SEED })), z = old.world.reserveZoneOfWorld(); ok(!!z, 'old game: the reserve zone exists at ' + z.x + ',' + z.y);
old.co.injectEquity && old.co.injectEquity(1e9, 't'); ok(old.co.reserveExpand().ok && old.co.reserveExpand().ok && old.co.reserve.lv === 2, 'old game: reserve expanded to level 2');
const L = z.levels[2], put = (d, x, y) => { const v = old.store.place(d, x, y, 0, { instant: true }); if (!v.ok) throw new Error(d + ' ' + v.reason); return v.building; };
const t1 = put('crude_tank_m', L.x + 2, L.y + 2), t2 = put('crude_tank_s', L.x + 2, L.y + 14), t3 = put('gasoline_tank_s', L.x + 20, L.y + 2); old.co.sync();
ok([t1, t2, t3].every(t => t.rs === 1), 'all three tanks are reserve tanks (inside the open ring)');
const b1 = old.co.reserveBuy('CRUDE', 30000, 'A', 'CASH'); ok(b1.ok, 'stock bought: 30,000 crude', b1); const b2 = old.co.reserveBuy('GASOLINE', 4000, 'A', 'CASH'); ok(b2.ok, 'stock bought: 4,000 gasoline', b2);
for (let h = 0; h < 48; h++) old.co.advanceHours(1);
const save = saveOf(old), v0 = view(old); ok(v0.tanks.length === 3 && v0.crude > 0 && v0.gas > 0 && v0.book > 0, 'old save holds: ' + v0.tanks.length + ' tanks, crude ' + Math.round(v0.crude) + ', gasoline ' + Math.round(v0.gas) + ', book ' + Math.round(v0.book));
// 2. load it into the NEW sector world
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oldres-')), file = path.join(tmp, 'save.json'); fs.writeFileSync(file, JSON.stringify(save));
cp.execFileSync('node', [__filename, 'child', file], { maxBuffer: 1 << 28, stdio: 'pipe' }); const o = JSON.parse(fs.readFileSync(file + '.out', 'utf8'));
cp.execFileSync('node', [__filename, 'child', file + '.2', 'again'], { maxBuffer: 1 << 28, stdio: 'pipe' }); const o2 = JSON.parse(fs.readFileSync(file + '.2.again', 'utf8'));
ok(o.c1 === true, 'the new world is the sector world (C1 exists)'); ok(o.dropped === 0 && o.loaded === old.store.list().length, 'nothing dropped on load: ' + o.loaded + ' of ' + old.store.list().length);
ok(JSON.stringify(o.v0.tanks) === JSON.stringify(v0.tanks), 'every reserve tank is back at the same place, type and rotation');
ok(o.v0.lv === v0.lv, 'the reserve level is unchanged (' + o.v0.lv + ')');
ok(Math.abs(o.v0.crude - v0.crude) < 1e-6 && Math.abs(o.v0.gas - v0.gas) < 1e-6, 'crude and gasoline stock are identical after loading');
ok(Math.abs(o.v0.book - v0.book) < 1e-6 && Math.abs(o.v0.avgC - v0.avgC) < 1e-6, 'book value and average cost are identical');
ok(o.v0.cap === v0.cap && o.v0.tanksN === v0.tanksN && o.v0.log === v0.log, 'capacity, tank count and the reserve log are identical');
ok(o.zone && o.zone.x === z.x && o.zone.y === z.y, 'the reserve zone itself did not move (' + o.zone.x + ',' + o.zone.y + ')');
ok(o.sellQ && o.sell && Math.abs(o.afterSell - (v0.crude - 5000)) < 1e-6, 'withdraw/sell still works on the loaded stock');
ok(o.expand && o.buy && o.audit, 'expanding, buying into the reserve and the books audit still work');
ok(JSON.stringify(o2.v0) === JSON.stringify(o.v0), 'save -> load -> save -> load again gives exactly the same reserve state', [o2.v0, o.v0]);
console.log('OLD-SAVE RESERVE TESTS PASSED (' + n + ' checks)');
