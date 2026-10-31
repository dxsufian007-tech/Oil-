// Offline production tests: the isolated module offline.js advances the EXISTING simulation (Game.step) for the time the app was closed.
// Proves: 1 min / 1 h / 6 h / 24 h are correct and bounded by the physical limits, deterministic, full tank, blocked pipe, pump limit,
// "app killed by the OS" (process memory lost, only the save survives), save / load, time policy, plug-in point for later systems.
const assert = require('assert');
const { Game: G, CFG, idx } = require('./core.js');
const OFF = require('./offline.js');
CFG.TERRAIN.MULT = [1, 1, 1, 1]; CFG.REGIONS.forEach(r => { r.mult = 1; });
CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
let pass = 0; const ok = m => { pass++; console.log('  ok  ' + m); };
const B = b => 'B' + b.id, seeded = OFF.mulberry32;
function mk(seed = 5) {
  const h = new G({ seed: 7, rng: seeded(seed) }); h.s.cash = 1e8; h.s.regions.forEach(r => { r.unlocked = true; });
  for (const a of h.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
  for (let y = 15; y < 75; y++) for (let x = 10; x < 130; x++) { const k = idx(x, y); h.map.block[k] = 0; h.map.water[k] = 0; }
  return h;
}
function field(extra = {}) {
  const h = mk(), w = h.place('well', 30, 30, 'large').building, t = h.place('tank', 60, 30).building; if (extra.tankLevel) t.level = extra.tankLevel;
  const L = h.buildLine(h.routeNodes(B(w), B(t), extra.main ? 1 : 0)).line; for (let i = 0; i < 20; i++) h.step(.5);
  return { h, w, t, L };
}
const clock = (now, extra = {}) => Object.assign({ now }, extra);
const T0 = 1_700_000_000_000;
const flowRate = (f) => f.h.net.flowK[f.L.cells[5]];               // bbl/min on the pipe right now (solver)

{ // schedule: exact total, depends only on the span
  for (const s of [5, 59, 60, 600, 601, 3600, 21600, 86400, 12345.678]) { const tot = OFF.schedule(s).reduce((a, x) => a + x.dt * x.n, 0); assert(Math.abs(tot - s) < 1e-6, s + ' -> ' + tot); }
  assert.deepStrictEqual(OFF.schedule(3600), OFF.schedule(3600)); const steps24 = OFF.schedule(86400).reduce((a, x) => a + x.n, 0); assert(steps24 < 7000, 'steps for 24 h: ' + steps24);
  ok('schedule: sums to the span exactly for 9 spans; 24 h = ' + steps24 + ' steps (not 86,400)');
}
{ // 1 min / 1 h / 6 h / 24 h : oil only arrives through the network, never more than the physical limits, monotonic, deterministic
  const rows = [];
  for (const [label, sec] of [['1 min', 60], ['1 h', 3600], ['6 h', 21600], ['24 h', 86400]]) {
    const f = field(), rate = flowRate(f), cap = f.h.tankCap(f.t), room0 = cap - f.t.amt, pcap = f.h.pipeCapacity(f.L.cells[5]), t0 = Date.now(); const r = OFF.advance(f.h, sec); const ms = Date.now() - t0;
    const g = field(); const r2 = OFF.advance(g.h, sec); assert.strictEqual(JSON.stringify(g.h.serialize()), JSON.stringify(f.h.serialize()), label + ': same state + same time must give the same result');
    const limit = Math.min(room0 + 1e-6, pcap * sec / 60 * 1.001); assert(r.produced >= 0 && r.produced <= limit + 1e-6, label + ': produced ' + r.produced + ' > limit ' + limit);
    assert(f.t.amt <= cap + 1e-9, label + ': tank above capacity'); assert(f.h.s.cash > -1e-6, 'cash never negative'); rows.push([label, r.produced, r.steps, ms]);
  }
  assert(rows[1][1] > rows[0][1] && rows[2][1] >= rows[1][1], 'more time -> at least as much oil');
  ok('1 min / 1 h / 6 h / 24 h: oil delivered ' + rows.map(r => r[0] + ' ' + r[1].toFixed(0) + ' bbl (' + r[2] + ' steps, ' + r[3] + ' ms)').join('; ') + ' - bounded by pipe capacity and tank room, identical on repeat');
}
{ // 24 h of un-throttled production (tank big enough): delivered = flow x time, within the pipe capacity
  const f = field(); f.h.tankCap = () => 1e6; const rate = flowRate(f), pc = f.h.pipeCapacity(f.L.cells[5]); const r = OFF.advance(f.h, 86400);
  assert(r.produced <= pc * 1440 * 1.001, 'above pipe capacity ' + r.produced); assert(r.produced <= rate * 1440 * 1.02, 'more than the starting flow allows'); assert(r.produced > 100, 'something was produced');
  ok('24 h without a tank limit: ' + r.produced.toFixed(0) + ' bbl delivered (never above the starting flow ' + rate.toFixed(1) + ' bbl/min x 1440 min = ' + (rate * 1440).toFixed(0) + ' nor the pipe capacity ' + (pc * 1440).toFixed(0) + ') in ' + r.steps + ' steps; the well wears out by the existing rules: pressure ' + (f.w.pressure * 100).toFixed(0) + ' %, condition ' + (f.w.condition * 100).toFixed(0) + ' %');
}
{ // equals the normal (online) simulation: one hour at 1 s steps vs the offline schedule, fed the SAME random numbers (the game's random events are the only difference between two runs)
  const a = field(), b = field(); a.h.rng = seeded(OFF.seedFor(a.h, 3600)); for (let i = 0; i < 3600; i++) a.h.step(1); const ref = a.t.amt;
  OFF.advance(b.h, 3600); const got = b.t.amt, rel = Math.abs(got - ref) / ref;
  assert(rel < 0.02, 'offline vs online: ' + got.toFixed(1) + ' vs ' + ref.toFixed(1));
  const spread = []; for (const sd of [1, 2, 3, 4, 5, 6]) { const c = field(); c.h.rng = seeded(sd); for (let i = 0; i < 3600; i++) c.h.step(1); spread.push(c.t.amt); } const mn = Math.min(...spread), mx = Math.max(...spread);
  ok('offline = online within ' + (rel * 100).toFixed(2) + ' % for one hour with the same random numbers (' + got.toFixed(1) + ' vs ' + ref.toFixed(1) + ' bbl); across 6 other random seeds the live game itself gives ' + mn.toFixed(0) + '..' + mx.toFixed(0) + ' bbl, so an offline result is one valid, deterministic sample');
}
{ // full tank: capacity is never exceeded, the well stops delivering (existing rule), no impossible inventory
  const f = field(); f.h.tankCap = () => 600; const r = OFF.advance(f.h, 6 * 3600);
  assert(f.t.amt <= 600 + 1e-9 && f.t.amt > 590, 'tank full ' + f.t.amt); const late = OFF.advance(f.h, 3600); assert(late.produced <= 1e-6, 'a full tank takes nothing more: ' + late.produced); assert(f.w.out < 1e-6, 'upstream well out = ' + f.w.out);
  ok('full tank: filled to ' + f.t.amt.toFixed(1) + ' / 600 and stayed there; the next hour delivered ' + late.produced.toFixed(3) + ' bbl; the well is held back (out ' + f.w.out.toFixed(3) + ')');
}
{ // blocked pipe: a closed valve, nothing arrives however long the app was closed
  const f = field(); const k = f.L.cells[(f.L.cells.length >> 1)]; f.h.setValve(k, 3); for (let i = 0; i < 40; i++) f.h.step(.5); const a0 = f.t.amt; const r = OFF.advance(f.h, 6 * 3600);
  assert(Math.abs(f.t.amt - a0) < 1e-6, 'blocked: ' + (f.t.amt - a0)); ok('blocked pipe (valve closed): 6 h offline delivered ' + (f.t.amt - a0).toFixed(6) + ' bbl');
  f.h.setValve(k, 1); const r2 = OFF.advance(f.h, 3600); assert(r2.produced > 100, 'open again: ' + r2.produced); ok('the same pipe opened again delivers ' + r2.produced.toFixed(0) + ' bbl in the next hour');
}
{ // pump limitation: delivery never beats the pump / pipe limit; a pump on the line is respected
  const f = field({ main: false }); const p = f.h.place('pump', 45, 30, undefined, 0); assert(p.ok, 'pump ' + p.reason); for (let i = 0; i < 100; i++) f.h.step(.5);
  const sp = f.h.pumpHyd(p.building), sec = 3600, r = OFF.advance(f.h, sec);
  assert(r.produced <= sp.maxFlow * sec / 60 * 1.001 + 1e-6, 'pump limit: ' + r.produced + ' > ' + sp.maxFlow * sec / 60); assert(f.h.pumpHyd(p.building).flow <= sp.maxFlow + 1e-6);
  ok('pump limitation: one hour delivered ' + r.produced.toFixed(0) + ' bbl <= pump max ' + (sp.maxFlow * sec / 60).toFixed(0) + ' bbl (' + sp.maxFlow.toFixed(0) + ' bbl/min)');
}
{ // app killed by the OS: only the save survives; load into a brand-new Game; resume after 6 h; same as continuing, and repeatable
  const f = field(); OFF.advance(f.h, 600); const saved = JSON.stringify(OFF.wrapSave(f.h, null, clock(T0, { mono: 5000, bootId: 'boot-A' })));       // what is on disk when Android kills the process
  const restore = nowMs => { const d = JSON.parse(saved), g = new G({ seed: 7, rng: seeded(9) }); g.load(d.game); return { g, ...OFF.resume(g, d.offline, clock(nowMs, { mono: 5000 + (nowMs - T0), bootId: 'boot-A' })) }; };
  const x = restore(T0 + 6 * 3600e3), y = restore(T0 + 6 * 3600e3);
  assert.strictEqual(JSON.stringify(x.g.serialize()), JSON.stringify(y.g.serialize()), 'two restores of the same save + same time are identical'); assert(Math.abs(x.elapsed.sec - 21600) < 1e-6);
  const tk = x.g.buildings.find(b => b.type === 'tank'); const before = JSON.parse(saved).game.buildings.find(b => b.type === 'tank').amt; assert(tk.amt > before + 100, 'oil produced while the app was dead: ' + before.toFixed(0) + ' -> ' + tk.amt.toFixed(0));
  const cont = field(); OFF.advance(cont.h, 600); OFF.advance(cont.h, 6 * 3600); const rel = Math.abs(tk.amt - cont.t.amt) / cont.t.amt; assert(rel < 0.03, 'restored vs never-killed ' + rel);
  ok('app killed by the OS: restored from the save only, +6 h -> tank ' + before.toFixed(0) + ' -> ' + tk.amt.toFixed(0) + ' bbl; two restores identical; within ' + (rel * 100).toFixed(2) + ' % of a process that never died');
}
{ // save / load: the meta round-trips; wrapSave does not alter the game; game state loads exactly
  const f = field(); const w = OFF.wrapSave(f.h, null, clock(T0, { mono: 1, bootId: 'b' })), s1 = JSON.stringify(f.h.serialize()); const back = JSON.parse(JSON.stringify(w));
  assert.deepStrictEqual(back.offline, w.offline); assert.strictEqual(JSON.stringify(f.h.serialize()), s1); const g = new G({ seed: 7 }); g.load(back.game); assert.strictEqual(g.buildings.length, f.h.buildings.length); assert.strictEqual(g.lines.length, 1);
  const z = OFF.advance(f.h, 0); assert.strictEqual(z.steps, 0); assert.strictEqual(JSON.stringify(f.h.serialize()), s1, 'advance(0) changes nothing'); ok('save / load: timestamp meta round-trips, serialize() untouched, advance(0) is a no-op');
}
{ // time policy
  const m = OFF.makeMeta(null, clock(T0)); const P = OFF.POLICY;
  const e1 = OFF.computeElapsed(m, clock(T0 + 90e3)); assert.strictEqual(e1.sec, 90);
  const e0 = OFF.computeElapsed(m, clock(T0 + 2e3)); assert.strictEqual(e0.sec, 0, 'a gap under MIN is left to the normal loop');
  const eb = OFF.computeElapsed(m, clock(T0 - 3600e3)); assert.strictEqual(eb.sec, 0); assert(eb.rewound, 'clock set back: nothing credited');
  const ec = OFF.computeElapsed(m, clock(T0 + 10 * 86400e3)); assert.strictEqual(ec.sec, P.MAX_OFFLINE_SEC); assert(ec.capped, 'ten days away credits only 24 h');
  // set the clock forward 10 days, resume (maxSeen moves), set it back and forward again: nothing is credited twice
  const m2 = OFF.makeMeta(m, clock(T0 + 10 * 86400e3)); const e2 = OFF.computeElapsed(m2, clock(T0 + 1 * 86400e3)); assert.strictEqual(e2.sec, 0); const e3 = OFF.computeElapsed(m2, clock(T0 + 10 * 86400e3 + 60e3)); assert.strictEqual(e3.sec, 60);
  // the same timestamp twice
  const f = field(); const r1 = OFF.resume(f.h, m, clock(T0 + 3600e3)), r2 = OFF.resume(f.h, r1.meta, clock(T0 + 3600e3)); assert(r1.elapsed.sec === 3600 && r2.elapsed.sec === 0, 'a second resume at the same time credits nothing');
  // monotonic clock wins when the boot id matches
  const mm = OFF.makeMeta(null, clock(T0, { mono: 1000, bootId: 'X' })); const em = OFF.computeElapsed(mm, clock(T0 + 86400e3 * 3, { mono: 1000 + 120e3, bootId: 'X' })); assert.strictEqual(em.source, 'monotonic'); assert.strictEqual(em.sec, 120);
  const er = OFF.computeElapsed(mm, clock(T0 + 600e3, { mono: 5, bootId: 'Y' })); assert.strictEqual(er.source, 'wall'); assert.strictEqual(er.sec, 600);
  ok('time policy: 90 s credited; <5 s left to the live loop; clock set back = 0; 10 days away = 24 h cap; back-and-forward is not double counted; same timestamp twice = 0; monotonic clock beats a moved wall clock (same boot), wall clock used after a reboot');
}
{ // plug-in point for later systems (refinery): runs after every step, in order, offline and online, never touches the hydraulics
  const f = field(); const log = []; let n = 0, tot = 0;
  OFF.register('refinery-test', { step(game, dt, ctx) { n++; tot += dt; log.push(ctx.offline); const tank = game.buildings.find(b => b.type === 'tank'); const take = Math.min(tank.amt, 2 * dt / 60); tank.amt -= take; } });
  const g1 = field(), g2 = field(); const r1 = OFF.advance(g1.h, 3600), r2 = OFF.advance(g2.h, 3600); assert.strictEqual(JSON.stringify(g1.h.serialize()), JSON.stringify(g2.h.serialize()), 'deterministic with a system registered');
  assert(Math.abs(tot - 7200) < 1e-6 && log.every(x => x === true), 'registered system saw every offline step: ' + n + ' steps, ' + tot + ' s');
  OFF.tickSystems(f.h, 1, { offline: false }); assert.strictEqual(log[log.length - 1], false, 'the same system can be driven by the live loop'); OFF.unregister('refinery-test'); const nBefore = n; OFF.advance(f.h, 60); assert.strictEqual(n, nBefore, 'unregistered systems stop');
  ok('plug-in point: a registered "refinery" system ran after each of ' + OFF.schedule(3600).reduce((a, x) => a + x.n, 0) + ' offline steps (same registry for the live loop), deterministic');
}
console.log('OFFLINE-ALLPASS (' + pass + ' groups)');
