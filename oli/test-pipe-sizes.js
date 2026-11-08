// Three pipe sizes (30k / 100k / 300k bbl/day) + smart sizing: size by real flow, merges counted, upgrade advice (upgrade only, player pays the difference).   node test-pipe-sizes.js
const H = require('./test-reserve-helpers.js'), { B, I, game, put, reload } = H, BC = require('./building-config.js'), assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
const caps = Object.keys(BC.PIPES).map(Number).sort((a, b) => a - b).map(d => BC.PIPES[d].capacity);
ok(caps.length === 3 && caps.join() === '30000,100000,300000', 'three sizes: ' + caps.join(' / '));
const costs = Object.keys(BC.PIPES).map(Number).sort((a, b) => a - b).map(d => BC.PIPES[d].cost); ok(costs.every((c, i) => i === 0 || c > costs[i - 1]), 'price per tile rises with the size (' + costs.join(' / ') + ')');
// the flow through a line never exceeds its size
for (const dia of [8, 16, 36]) { const g = game(1e12), a = put(g, 'crude_tank_l', 40, 40), b = put(g, 'crude_tank_l', 60, 40), p = put(g, 'pump_station_l', 50, 50); g.sim.ensure(a).vol = 250000; const r = I.layPipe(g.store, g.net, g.ts, { b: a.id, port: 'OUTPUT_E' }, { b: p.id, port: 'INPUT' }, dia); ok(r.ok !== false, 'pipe ' + dia + ' laid'); const L = [...g.net.lines.values()].pop(); ok(L.dia === dia && g.sim.pipeInfo(L.path[1][0], L.path[1][1]).capacity === BC.PIPES[dia].capacity, 'line ' + dia + ' reports capacity ' + BC.PIPES[dia].capacity); }
// old saves: lines keep their size key and take its new capacity
{ const g = game(1e12), a = put(g, 'crude_tank_l', 40, 40), p = put(g, 'pump_station_l', 50, 50); I.layPipe(g.store, g.net, g.ts, { b: a.id, port: 'OUTPUT_E' }, { b: p.id, port: 'INPUT' }, 16); const j = JSON.parse(JSON.stringify(g.net.toJSON())); j.lines[0].dia = 24; const n2 = I.PipeNet.fromJSON(g.ts.W, j); ok([...n2.lines.values()][0].dia === 36, 'an old saved 24 line loads as 36 (300,000); 8/16/36 lines load unchanged'); }

// ---- smart sizing
const dia = (g, a, b) => { const r = I.layConnect(g.store, g.net, g.ts, a.id, b.id, { allowOneWay: true }); assert(r.made && r.made.length, 'connect ' + a.d + '>' + b.d + ' ' + r.state + ' ' + r.reason + ' ' + JSON.stringify(r.problems)); return r.made[0].dia; };
{ const g = game(1e12), w = put(g, 'oil_well', 40, 40), t = put(g, 'crude_tank_m', 50, 40); ok(dia(g, w, t) === 8, 'one well (2,500/day) -> tank: the 30k pipe, not a bigger one'); }
{ const g = game(1e12), t = put(g, 'crude_tank_c', 40, 40), p = put(g, 'pump_station_c', 60, 44), d = put(g, 'crude_tank_c', 84, 40); const a = dia(g, t, p), b = dia(g, p, d); ok(a === 36 && b === 36, 'central pump (200k) lines: 300k pipes (' + a + ',' + b + ')'); }
{ const g = game(1e12), mf = put(g, 'main_manifold', 60, 36), pc = put(g, 'pump_station_c', 80, 40), sk = put(g, 'crude_tank_c', 100, 40), ch = [];
  for (let i = 0; i < 3; i++) ch.push([put(g, 'crude_tank_m', 20, 36 + i * 12), put(g, 'pump_station_l', 36, 36 + i * 12)]);
  ok(dia(g, ch[0][0], ch[0][1]) === 8, 'tank -> 20k pump: the 30k pipe (the pump is the limit)'); ok(dia(g, ch[0][1], mf) === 8, 'pump -> manifold: 20k flow, 30k pipe');
  ok(dia(g, mf, pc) === 8, 'manifold -> central pump with ONE feeder (20k): 30k pipe'); const adv0 = I.pipeAdvice(g.store, g.net); ok(adv0.list.length === 0, 'no upgrade needed with one feeder');
  ok(dia(g, ch[1][0], ch[1][1]) === 8 && dia(g, ch[1][1], mf) === 8, 'second feeder: its own branch is again a 30k pipe');
  const L = [...g.net.lines.values()].find(l => l.a.b === mf.id && l.b.b === pc.id), m = I.flowModel(g.store, g.net); ok(Math.abs(m.supply(mf.id) - 40000) < 1e-6, 'flow model: the manifold now carries 2 x 20,000 = 40,000 (merge counted)');
  const adv = I.pipeAdvice(g.store, g.net), x = adv.list.find(y => y.id === L.id); ok(x && x.from === 8 && x.to === 16 && x.cost > 0, 'the existing manifold -> pump line (30k) must be upgraded to 100k: advice cost ' + (x && x.cost) + ', branches stay unchanged (' + adv.list.length + ' line advised)');
  const c0 = g.store.cash, up = I.upgradeLines(g.store, g.net); ok(up.ok && Math.abs(c0 - g.store.cash - up.cost) < 1e-6 && L.dia === 16, 'the confirmed upgrade charges exactly the price difference and sets the size to 100k');
  ok(I.pipeAdvice(g.store, g.net).list.length === 0, 'afterwards nothing is advised'); ok(dia(g, pc, sk) === 16, 'new central pump -> store line is sized to the real flow (40k -> 100k)');
  dia(g, ch[2][0], ch[2][1]); dia(g, ch[2][1], mf); const a3 = I.pipeAdvice(g.store, g.net); ok(a3.list.length === 0, 'a third feeder (60k in total) still fits the 100k lines: nothing to upgrade, no oversizing'); }
// upgrade only: a line bigger than needed is never advised to shrink
{ const g = game(1e12), w = put(g, 'oil_well', 40, 40), t = put(g, 'crude_tank_m', 50, 40); I.layPipe(g.store, g.net, g.ts, { b: w.id, port: 'OIL_OUT_E' }, { b: t.id, port: 'INPUT_W' }, 36); ok(I.pipeAdvice(g.store, g.net).list.length === 0, 'an oversized line (300k for one well) is left alone: upgrade only, no downsizing'); }
// explicit size from the player is respected
{ const g = game(1e12), w = put(g, 'oil_well', 40, 40), t = put(g, 'crude_tank_m', 50, 40), r = I.layConnect(g.store, g.net, g.ts, w.id, t.id, { dia: 36 }); ok(r.made[0].dia === 36, 'a size chosen by the player (manual) is not overridden'); }
console.log('PIPE SIZE TESTS PASSED (' + n + ' checks)');
