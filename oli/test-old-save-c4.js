'use strict';
/* An OLD game (plant in C3, saved) must load into the NEW world (C3 = reserve land, new games start in C4) unchanged:
   same buildings/pipes/wells, same production afterwards, and a save->load round trip afterwards.   node test-old-save-c4.js */
const H = require('./cycle-helpers.js'), { B, I, E, W } = H, assert = require('assert');
let n = 0; const ok = (c, m, x) => { if (!c) console.log('  FAIL ' + m + (x ? ' ' + JSON.stringify(x) : '')); assert(c, m); n++; console.log('  ok  ' + m); };
const SEED = 20260101;
const saveOf = g => JSON.parse(JSON.stringify({ v: 2, store: g.store.toJSON(), net: g.net.toJSON(), cash: g.store.cash, eco: g.co.toJSON(), wd: { r: g.world.reserveSnapshot(), p: g.world.progressSnapshot(), z: g.world.zoneSnapshot() } }));
/* load a save into a brand-new world with the CURRENT defaults (exactly what the app does on start-up) */
function loadInto(o, save) {
  const world = W.createWorld({ sectors: false, seed: SEED, reserveWholeRegion: o.whole }), ts = B.fromWorld(world);
  world.restoreZones(save.wd.z); world.restoreProgress(save.wd.p); world.restoreReserve(save.wd.r);
  const r = B.BuildingStore.fromJSON(ts, save.store, { cash: save.cash }), store = r.store; store.cash = save.cash;
  const net0 = I.PipeNet.fromJSON(ts.W, save.net), net = new I.PipeNet(ts.W); for (const L of net0.lines.values()) net.lay({ a: L.a, b: L.b, path: L.path, product: L.product, dia: L.dia }); net.nextId = save.net.next || net.nextId;
  const sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 }); co.fromJSON(save.eco); co.setSpeed(0); for (const b of store.list()) sim.ensure(b);
  return { world, ts, store, net, sim, co, report: r.report };
}
const sig = g => g.store.list().map(b => [b.id, b.d, b.x, b.y, b.r, b.st, !!b.rs].join(',')).sort().join('|');
const kv = g => { const f = g.co.fills(); return JSON.stringify({ cash: Math.round(g.store.cash), crude: Math.round(f.commercial ? f.commercial.volume : 0), gas: Math.round(g.co.stockOf ? g.co.stockOf('GASOLINE') : 0) }); };

const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const hrs = (g, k) => { for (let h = 0; h < k; h++) { H.restock(g.co); g.co.advanceHours(1); } };
/* each load runs in its OWN process: worlds in one process share module-level state (site reserves), so two loads side by side would disturb each other */
if (process.argv[2] === 'child') {
  const save = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), g = loadInto({ whole: process.argv[4] === 'legacy' ? false : undefined }, save), rep = { home: g.world.homeRegionOfWorld().name, reserve: g.world.reserveRegionOfWorld() ? g.world.reserveRegionOfWorld().name : null, dropped: g.report.dropped.length, loaded: g.report.loaded, sig0: sig(g), net0: JSON.stringify(g.net.toJSON()), rs0: JSON.stringify(g.world.reserveSnapshot()), noRs: g.store.list().every(b => !b.rs) };
  hrs(g, 72); rep.fills = g.co.fills(); rep.cash = g.store.cash; rep.co = JSON.stringify(g.co.toJSON()); rep.sig1 = sig(g);
  const s2 = saveOf(g); rep.save2 = JSON.stringify(s2).length; fs.writeFileSync(process.argv[3] + '.2', JSON.stringify(s2));
  fs.writeFileSync(process.argv[3] + '.' + process.argv[4] + '.out', JSON.stringify(rep)); process.exit(0);
}
const runChild = (file, mode) => { cp.execFileSync('node', [__filename, 'child', file, mode], { maxBuffer: 1 << 28, stdio: 'pipe' }); return JSON.parse(fs.readFileSync(file + '.' + mode + '.out', 'utf8')); };
// 1. an old game: the full plant is built in C3 (the old home), run for 3 days, then saved
const old = H.cycle({ seed: SEED }); ok(old.sr.name === 'C3' && old.P.fail.length === 0, 'old game: the plant stands in ' + old.sr.name + ' (' + old.store.list().length + ' buildings, ' + old.net.lines.size + ' pipes)');
H.hours(old.co, 72, true); const save = saveOf(old), s0 = sig(old);
ok(old.store.list().some(b => b.d === 'oil_well') && old.store.list().some(b => b.d === 'refinery_m') && old.store.list().some(b => /tank/.test(b.d)), 'it has wells, a refinery and tanks');
const sold = JSON.stringify(save).length; ok(sold > 1000, 'a real save was written (' + sold + ' bytes)');

// 2. load it into the NEW world (C3 = reserve, home C4) and into a legacy world (control), each in a clean process
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oldsave-')), file = path.join(tmp, 'save.json'); fs.writeFileSync(file, JSON.stringify(save));
const neu = runChild(file, 'new'), ctl = runChild(file, 'legacy');
ok(neu.reserve === 'C3' && neu.home !== 'C3' && ctl.reserve === null && ctl.home === 'C3', 'the new world: C3 is reserve land, new games start in ' + neu.home + ' (legacy control: no reserve rule, home C3)');
ok(neu.dropped === 0 && neu.loaded === old.store.list().length, 'nothing dropped on load: ' + neu.loaded + ' of ' + old.store.list().length + ' buildings');
ok(neu.sig0 === s0 && ctl.sig0 === s0, 'same buildings: ids, types, coordinates, rotation, status (nothing moved, nothing deleted)');
ok(neu.net0 === JSON.stringify(save.net) && JSON.parse(neu.net0).l ? true : neu.net0 === JSON.stringify(save.net), 'same pipes (' + old.net.lines.size + ')');
ok(neu.noRs, 'old commercial tanks stay commercial (no reserve flag was added)');
ok(neu.rs0 === JSON.stringify(old.world.reserveSnapshot()), 'wells and field reserves restored identically');

// 3. the loaded plant keeps working: 72 more hours, new world vs legacy world from the same save: byte-identical
ok(JSON.stringify([neu.fills.commercial, neu.fills.reserve]) === JSON.stringify([ctl.fills.commercial, ctl.fills.reserve]) && neu.fills.commercial.volume > 0, 'after 72 more hours the tank stocks are identical in the new world and the legacy world (' + Math.round(neu.fills.commercial.volume) + ')');
ok(neu.cash === ctl.cash, 'cash is identical (' + Math.round(neu.cash) + ')');
ok(neu.co === ctl.co, 'the whole company state (stock, journal, production counters) is byte-identical');
ok(neu.sig1 === s0, 'still the same buildings after running');

// 4. save -> load again in the new world, then run on: nothing lost (a second clean process)
const again = runChild(file + '.2', 'new'); ok(again.dropped === 0 && again.sig0 === s0 && again.loaded === neu.loaded, 'save -> load round trip in the new world: nothing lost (' + again.loaded + ' buildings)');

// 5. new rules apply to NEW building only; and a brand new game is not affected by any old save
const nw = loadInto({}, save), lg = loadInto({ whole: false }, save), c3 = nw.world.regions.find(r => r.name === 'C3'); let refused = 0, tried = 0;
for (let y = c3.y0 + 8; y < c3.y0 + 312 && tried < 20; y += 20) for (let x = c3.x0 + 8; x < c3.x0 + 312 && tried < 20; x += 20) { if (lg.store.validate('crude_tank_m', x, y, 0, {}).ok) { tried++; const v = nw.store.validate('crude_tank_m', x, y, 0, {}); if (!v.ok && v.kind === 'ZONE') refused++; } }
ok(tried > 0 && refused === tried, 'NEW commercial buildings in C3 are refused (' + refused + '/' + tried + '), the old ones still stand');
const fresh = W.createWorld({ sectors: false, seed: SEED }), fts = B.fromWorld(fresh), fst = new B.BuildingStore(fts, { cash: 1e9 }); ok(fst.list().length === 0 && fresh.homeRegionOfWorld().name === neu.home, 'a new game starts empty in ' + fresh.homeRegionOfWorld().name);
console.log(n + ' checks passed');
