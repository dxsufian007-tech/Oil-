// Stage 5 / part 1: every tank side has an INPUT and an OUTPUT (8 ports); the four original ports keep their ids and cells.   node test-tank-ports.js
const B = require('./buildings.js'), I = require('./industry.js'), assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
const OLD = { INPUT_W: [-1, 0], INPUT_N: [0, -1] };      // (kept for the record) the old ports are checked against fixed expectations below
const tanks = Object.keys(B.DEFS).filter(i => /_tank_|gas_sphere/.test(i) && !/^water_/.test(i));
ok(tanks.length === 16, 'sixteen storage types (crude, gasoline, diesel, jet, gas x S/M/L + the central store)');
for (const id of tanks) {
  const w = B.worldPoints({ id: 1, d: id, x: 10, y: 10, r: 0, rot: 0, st: 'OPERATIONAL' }).filter(p => p.kind === 'pipe' && p.id !== 'WATER_OUT'), by = Object.fromEntries(w.map(p => [p.id, p]));
  assert(w.length === 8 && new Set(w.map(p => p.ax + ',' + p.ay)).size === 8, id + ': 8 ports on 8 different tiles');
  for (const [pid, role, side] of [['INPUT_W', 'in', 1], ['INPUT_N', 'in', 3], ['OUTPUT_E', 'out', 0], ['OUTPUT_S', 'out', 2], ['INPUT_E', 'in', 0], ['INPUT_S', 'in', 2], ['OUTPUT_W', 'out', 1], ['OUTPUT_N', 'out', 3]]) assert(by[pid] && by[pid].role === role && by[pid].side === side, id + ': ' + pid + ' is an ' + role + ' on side ' + side);
  for (const s of [0, 1, 2, 3]) assert(w.filter(p => p.side === s).length === 2 && new Set(w.filter(p => p.side === s).map(p => p.role)).size === 2, id + ': side ' + s + ' has one input and one output');
}
ok(true, 'all 16 storage types: 8 ports, one INPUT and one OUTPUT on each of the four sides');
const pos = id => { const b = { id: 1, d: id, x: 10, y: 10, r: 0, rot: 0, st: 'OPERATIONAL' }; return Object.fromEntries(B.worldPoints(b).filter(p => p.kind === 'pipe').map(p => [p.id, p.ax + ',' + p.ay])); };
const s = pos('crude_tank_s'), m = pos('crude_tank_m'), l = pos('crude_tank_l');
ok(s.INPUT_W === '9,10' && s.INPUT_N === '10,9' && s.OUTPUT_E === '12,10' && s.OUTPUT_S === '10,12', 'crude_tank_s: the four original ports are exactly where they were (9,10 / 10,9 / 12,10 / 10,12)');
ok(m.INPUT_W === '9,11' && m.INPUT_N === '11,9' && m.OUTPUT_E === '13,11' && m.OUTPUT_S === '11,13', 'crude_tank_m: the four original ports are exactly where they were');
ok(l.INPUT_W === '9,11' && l.INPUT_N === '11,9' && l.OUTPUT_E === '14,11' && l.OUTPUT_S === '11,14', 'crude_tank_l: the four original ports are exactly where they were');
// the layout works for rotation too
for (const r of [0, 1, 2, 3]) { const w = B.worldPoints({ id: 1, d: 'crude_tank_m', x: 20, y: 20, r, rot: r, st: 'OPERATIONAL' }).filter(p => p.kind === 'pipe' && p.id !== 'WATER_OUT'); assert(new Set(w.map(p => p.ax + ',' + p.ay)).size === 8, 'rotation ' + r + ': 8 distinct port tiles'); }
ok(true, 'rotation keeps 8 distinct port tiles');
console.log('TANK PORTS TESTS PASSED (' + n + ' checks)');
