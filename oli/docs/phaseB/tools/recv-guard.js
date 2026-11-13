/* B3b-1 invalidation test for CentralNet.receivers(): ROOT=<oli dir> SAVE=<realsave.json> node recv-guard.js
 * After every kind of change that can influence the list of receivers, the new receivers() must return EXACTLY what the old full scan
 * (_receiversScan, same state, same moment) returns: same stations, the same building OBJECTS, same ports, same order.
 * Mutations: building state, new station, station -> other building (with and without a rev bump), pipe removal (with and without a rebuild of the sim),
 * building demolition, a second Sim over the same network, repeated / interleaved calls, returned arrays being modified by the caller. */
const path = require('path'), ROOT = process.env.ROOT, { build } = require('./realload.js');
const { g, co } = build(), I = require(path.join(ROOT, 'industry.js')), cn = g.net.central, sim = g.sim, store = g.store, net = g.net;
const CH = ['CRUDE', 'WATER', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']; let checks = 0, fails = 0;
let seed = +(process.env.SEED || 7); const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, pick = a => a[Math.floor(rnd() * a.length)];
const same = (a, b) => a.length === b.length && a.every((x, i) => x.s === b[i].s && x.b === b[i].b && x.port === b[i].port);
function cmp(what, S = sim) {
  const ports = ['_PORT', '_PORT2']; const sts = [...cn.st.keys()]; let bad = 0;
  for (const ch of CH) { const ex = [[undefined, undefined], [pick(sts), ch + pick(ports)], [pick(sts), ch + pick(ports)], [pick(sts), 'NOPE']];
    for (const [id, port] of ex) { checks++; const a = cn.receivers(S, ch, id, port), b = cn._receiversScan(S, ch, id, port); if (!same(a, b)) { bad++; fails++; if (bad <= 2) console.log('DIFF after', what, ch, id, port, a.length, b.length); } } }
  return bad === 0;
}
co.advanceHours(1); cmp('baseline'); cmp('baseline again (cached)');
// 1. building state (live ok): damage / maintenance / under construction and back
const withSt = [...cn.st.values()].filter(s => s.b != null && store.get(s.b)); const states = ['DAMAGED', 'MAINTENANCE', 'UNDER_CONSTRUCTION', 'OPERATIONAL'];
for (let i = 0; i < 40; i++) { const s = pick(withSt), b = store.get(s.b), old = b.st; b.st = pick(states); cmp('state ' + b.st); if (rnd() < .5) { b.st = old; cmp('state back'); } }
for (const s of withSt) store.get(s.b).st = 'OPERATIONAL'; cmp('all operational');
for (let i = 0; i < 15; i++) { const s = pick(withSt), b = store.get(s.b); b.st = 'DAMAGED'; cn.rev++; cmp('rev bump (lists rebuilt) while a building is damaged'); b.st = 'OPERATIONAL'; cmp('the building is operational again, lists NOT rebuilt'); }
// 2. repeated / interleaved calls and a caller that modifies the returned array
for (let i = 0; i < 30; i++) { const ch = pick(CH), r = cn.receivers(sim, ch, undefined, undefined); r.push({ junk: 1 }); r.length = 0; cmp('after the caller modified a returned array'); }
// 3. a new station (with and without a building), with the rev bump of addStation
{ const s0 = pick(withSt); cn.addStation({ x: 1, y: 1, b: null }); cmp('station without building'); const n = cn.addStation({ x: 2, y: 2, b: s0.b }); cmp('new station on an existing building'); n.b = null; cn.rev++; cmp('station building removed (rev bump)'); }
// 4. station -> another building, with the rev bump of applyPlan ...
for (let i = 0; i < 20; i++) { const s = pick(withSt), t = pick(withSt); const old = s.b; s.b = t.b; cn.rev++; cmp('s.b changed (rev bump)'); s.b = old; cn.rev++; cmp('s.b restored (rev bump)'); }
// ... and WITHOUT a rev bump (not done by the game; the per-station guard must catch it)
for (let i = 0; i < 20; i++) { const s = pick(withSt), t = pick(withSt); const old = s.b; s.b = t.b; cmp('s.b changed WITHOUT rev bump'); s.b = old; cmp('s.b restored without bump'); }
// 5. topology: remove pipes and put them back (edges disappear, then appear), with the sim rebuilt or left stale; a second Sim over the same network is built FIRST and then left with the old topology
const sim2 = new I.Sim(store, net); sim2.build(); cmp('second sim, same topology', sim2);
const total = S => CH.reduce((q, c) => q + cn._receiversScan(S, c).length, 0), relevant = [];
for (const id of [...net.lines.keys()]) { const L = net.lines.get(id), keep = Object.assign({}, L, { path: L.path.map(p => p.slice()) }), n0 = total(sim); net.remove(id); if (sim.dirty()) sim.build(); if (total(sim) !== n0) relevant.push(keep); net.lay(keep); if (sim.dirty()) sim.build(); }
console.log('lines whose removal changes the set of receivers:', relevant.length);
for (const keep of relevant) { const id = keep.id;
  cmp('before removing ' + id); net.remove(id); if (rnd() < .3) cmp('pipe removed, sim NOT rebuilt'); if (sim.dirty()) sim.build(); cmp('pipe ' + id + ' removed, sim rebuilt'); cmp('second sim (stale topology) after the removal', sim2);
  cn.rev++; cmp('lists rebuilt while the pipe is missing (first sim)'); cmp('second sim (more edges) after lists were built for the first', sim2); cn.rev++; cmp('lists rebuilt (second sim, more edges)', sim2);
  net.lay(Object.assign({}, keep, { path: keep.path.map(p => p.slice()) })); cmp('pipe put back, sim NOT rebuilt'); if (sim.dirty()) sim.build(); cmp('pipe ' + id + ' put back, sim rebuilt'); cmp('second sim again', sim2); cmp('first sim again', sim); }
if (sim2.dirty()) sim2.build(); cmp('second sim rebuilt', sim2); cmp('first sim again', sim); cmp('second sim again', sim2);
// 6. a building demolished (its station stays)
{ const s = pick(withSt.filter(x => store.get(x.b))); store.demolish(s.b, { building: true, pipes: true, force: true }); cmp('building demolished, sim stale'); if (sim.dirty()) sim.build(); cmp('building demolished, sim rebuilt'); }
for (let i = 0; i < 20; i++) cmp('final repeated calls');
console.log('recv-guard: checks', checks, 'failures', fails); process.exit(fails ? 1 : 0);
