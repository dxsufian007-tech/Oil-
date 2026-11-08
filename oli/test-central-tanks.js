// Central 4,000,000 bbl stores for water, gasoline, diesel and jet fuel (size C, like the crude central store).   node test-central-tanks.js
const H = require('./test-reserve-helpers.js'), { B, I, game, put } = H, assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
for (const [d, prod] of [['water_tank_c', 'WATER'], ['gasoline_tank_c', 'GASOLINE'], ['diesel_tank_c', 'DIESEL'], ['jet_tank_c', 'JET_FUEL'], ['crude_tank_c', 'CRUDE']]) {
  const g = game(1e13), t = put(g, d, 60, 60), D = B.DEFS[d];
  ok(D.capacity.value === 4000000 && D.footprint[0] === 8 && D.footprint[1] === 8 && D.product === prod && D.size === 'C', d + ': 8x8, 4,000,000 bbl, product ' + prod);
  ok(g.sim.groupInfo(t) === null || g.sim.groupInfo(t).n === 1, d + ': a lone tank is not a group');
}
// a water central store inside a group with a small water tank: the group is one store of 4,010,000
{ const g = game(1e13), a = put(g, 'water_tank_c', 60, 60), b = put(g, 'water_tank_s', 70, 60); I.autoLinkTank(g.store, g.net, g.ts, b.id); g.sim.build(); const gi = g.sim.groupInfo(a); ok(gi && gi.n === 2 && gi.capacity === 4010000, 'water central + small water tank form one Tank Group (capacity ' + (gi && gi.capacity) + ')'); }
// water in a central store is water stock, never oil
{ const g = game(1e13), a = put(g, 'water_tank_c', 60, 60); g.sim.ensure(a).vol = 1000000; ok(g.co.waterInfo().stock === 1000000 && g.co.waterInfo().capacity === 4000000 && g.co.available('CRUDE') === 0, 'water central store counts as water capacity/stock only, not oil'); }
console.log('CENTRAL TANKS TESTS PASSED (' + n + ' checks)');
