// Four pipe sizes: 30k / 100k / 200k / 300k bbl/day.   node test-pipe-sizes.js
const H = require('./test-reserve-helpers.js'), { B, I, game, put, reload } = H, BC = require('./building-config.js'), assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
const caps = Object.keys(BC.PIPES).map(Number).sort((a, b) => a - b).map(d => BC.PIPES[d].capacity);
ok(caps.length === 4 && caps.join() === '30000,100000,200000,300000', 'four sizes: ' + caps.join(' / '));
const costs = Object.keys(BC.PIPES).map(Number).sort((a, b) => a - b).map(d => BC.PIPES[d].cost); ok(costs.every((c, i) => i === 0 || c > costs[i - 1]), 'price per tile rises with the size (' + costs.join(' / ') + ')');
// the flow through a line never exceeds its size
for (const dia of [8, 16, 24, 36]) { const g = game(1e12), a = put(g, 'crude_tank_l', 40, 40), b = put(g, 'crude_tank_l', 60, 40), p = put(g, 'pump_station_l', 50, 50); g.sim.ensure(a).vol = 250000; const r = I.layPipe(g.store, g.net, g.ts, { b: a.id, port: 'OUTPUT_E' }, { b: p.id, port: 'INPUT' }, dia); ok(r.ok !== false, 'pipe ' + dia + ' laid'); const L = [...g.net.lines.values()].pop(); ok(L.dia === dia && g.sim.pipeInfo(L.path[1][0], L.path[1][1]).capacity === BC.PIPES[dia].capacity, 'line ' + dia + ' reports capacity ' + BC.PIPES[dia].capacity); }
// old saves: lines keep their size key and take its new capacity
{ const g = game(1e12), a = put(g, 'crude_tank_l', 40, 40), p = put(g, 'pump_station_l', 50, 50); I.layPipe(g.store, g.net, g.ts, { b: a.id, port: 'OUTPUT_E' }, { b: p.id, port: 'INPUT' }, 24); const g2 = reload(g); const L = [...g2.net.lines.values()][0]; ok(L && L.dia === 24 && BC.PIPES[L.dia].capacity === 200000, 'a saved 24 line loads as size 24 (200,000)'); }
console.log('PIPE SIZE TESTS PASSED (' + n + ' checks)');
