'use strict';
/* S6: a PROBE of a full tank that is not in a tank group answers 0 without the route search (Sim.probeDead).  The saved `_off` of such a tank is no longer raised by the skipped probe (approved); the answer 0 and every other value stay the same.   node test-full-tank-skip.js */
const H = require('./test-reserve-helpers.js'), { B, I, game, put } = H;
let f = 0; const ok = (c, m) => { if (!c) { f++; console.log('FAIL', m); } else console.log('ok  ', m); };
const cap = B.DEFS.crude_tank_c.capacity.value, F = { prod: 'CRUDE', r: 100, p: 100 };
const mk = () => { const g = game(1e12), pu = put(g, 'pump_station_l', 20, 80), t = put(g, 'crude_tank_c', 60, 80); I.layConnect(g.store, g.net, g.ts, pu.id, t.id, {}); g.sim.build(); return { g, pu, t, S: x => g.sim.ensure(x) }; };
const dead = (g, pu, want, f2) => g.sim.probeDead(pu, 'OUTPUT', f2 || F, want == null ? 100 : want);
{ const { g, pu, t, S } = mk(); ok(I.Sim.fullTankSkip === 1, 'the switch is on by default');
  S(t).vol = 0; ok(!dead(g, pu), 'an empty tank is probed (probeDead false)');
  S(t).vol = cap; ok(dead(g, pu), 'a full tank is dead (probeDead true)');
  const e = g.sim.edgeOf(pu, 'OUTPUT'); ok(g.sim.offer(pu, 'OUTPUT', { ...F }, false) === 0, 'offer() into the full tank returns 0 (the answer the skip stands for)');
  S(t).vol = cap - 1; S(t)._pend = 0; ok(!dead(g, pu), 'one barrel of room: probed'); S(t).vol = cap - 50; S(t)._pend = 50; ok(dead(g, pu), 'stock + pending = capacity: dead');
  S(t).vol = cap; ok(!dead(g, pu, 1e9), 'a rate above what the pipe can still take is NOT skipped (e.over must be set by the full code)');
  ok(!dead(g, pu, 100, { prod: 'CRUDE', r: 100, p: 100, gas: 1 }), 'keep = 0 (all gas) is not skipped (0/0 case)');
  I.Sim.fullTankSkip = 0; ok(!dead(g, pu), 'switch off: a full tank is probed again (old behaviour)'); I.Sim.fullTankSkip = 1;
  S(t).vol = 0; ok(!dead(g, pu), 'emptied again: probed and accepted'); ok(g.sim.offer(pu, 'OUTPUT', { ...F }, false) > 0, 'an emptied tank takes oil'); }
{ const g = game(1e12), pu = put(g, 'pump_station_l', 20, 80), a = put(g, 'crude_tank_c', 60, 80), b = put(g, 'crude_tank_c', 70, 80); I.layConnect(g.store, g.net, g.ts, pu.id, a.id, {}); I.autoLinkTank(g.store, g.net, g.ts, b.id); g.sim.build(); const S = x => g.sim.ensure(x);
  ok(!!g.sim.groupOf(a), 'two tanks form a group'); S(a).vol = cap; S(b).vol = 0; ok(!g.sim.probeDead(pu, 'OUTPUT', F, 100), 'full tank in a group whose sibling has room: NOT skipped'); ok(g.sim.offer(pu, 'OUTPUT', { ...F }, false) > 0, 'and the group takes the oil'); S(b).vol = cap; ok(!g.sim.probeDead(pu, 'OUTPUT', F, 100), 'a full tank inside a group is never skipped (only single tanks)'); }
console.log(f ? 'FULL TANK SKIP TESTS FAILED: ' + f : 'FULL TANK SKIP TESTS PASSED'); process.exit(f ? 1 : 0);
