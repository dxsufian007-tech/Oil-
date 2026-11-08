'use strict';
/* Automatic water sales: runs on the game clock, only above the reserve, limited by the loading pumps' daily capacity.   node test-water-auto.js */
const H = require('./test-reserve-helpers.js'), { B, I, game, put, reload } = H, assert = require('assert');
let n = 0; const ok = (c, m, x) => { if (!c) console.log('  FAIL ' + m + (x ? ' ' + JSON.stringify(x) : '')); assert(c, m); n++; console.log('  ok  ' + m); };
const S = (g, b) => g.sim.ensure(b), link = (g, t) => I.autoLinkTank(g.store, g.net, g.ts, t.id), near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e) * Math.max(1, Math.abs(a), Math.abs(b));
const conn = (g, a, b) => { const r = I.layConnect(g.store, g.net, g.ts, a.id, b.id, {}); assert(r.ok, 'connect ' + r.reason); return r; };
function site(vols, size, withLoader) {
  const g = game(1e12), T = vols.map((_, i) => put(g, 'water_tank_m', 40 + i * 5, 40)); for (let i = 1; i < T.length; i++) link(g, T[i]);
  let lp = null; if (withLoader !== false) { lp = put(g, size || 'water_pump_l', 40, 70); conn(g, T[0], lp); } g.sim.build(); vols.forEach((v, i) => { S(g, T[i]).vol = v; }); return { g, T, lp };
}
const hours = (g, h) => { g.co.advanceHours(h, 1); };
const stock = g => g.co.waterStock(), price = g => g.co.waterPrice();

{ // 1. the spec example: reserve 10,000, stock 15,000 -> 5,000 sell by themselves; at 10,000 it stops
  const { g, T } = site([15000]), co = g.co; co.setAutoWater(true, 10000);
  ok(co.autoWaterInfo().available === 5000, 'reserve 10,000 / stock 15,000 -> 5,000 available');
  const cash0 = g.store.cash; hours(g, 1); ok(stock(g) < 15000 && stock(g) > 10000, 'selling starts on its own with the game clock (no screen opened): ' + Math.round(stock(g)));
  hours(g, 12); ok(near(stock(g), 10000, 1e-9), 'selling stops exactly at the reserve (10,000), never below'); const s1 = co.water.sold;
  hours(g, 24); ok(near(stock(g), 10000, 1e-9) && co.water.sold === s1, 'at the reserve nothing more is sold');
  ok(near(co.water.revenue, 5000 * price(g)) && near(co.journal.bal.REV_WATER, -5000 * price(g)), 'water revenue, REV_WATER and the log hold exactly 5,000 x price (no double sale)');
  S(g, T[0]).vol += 3000; hours(g, 12); ok(near(stock(g), 10000, 1e-9) && near(co.water.sold, 8000), 'more water arrives -> selling resumes by itself and stops at the reserve again (8,000 sold in all)');
}
{ // 2. off = nothing sold; reserve 0 sells everything; reserve above stock sells nothing
  const { g } = site([8000]), co = g.co; hours(g, 48); ok(stock(g) === 8000 && co.water.sold === 0, 'switch OFF: nothing is sold');
  co.setAutoWater(true, 9000); hours(g, 48); ok(stock(g) === 8000 && co.water.sold === 0, 'reserve above the stock: nothing is sold');
  co.setAutoWater(true, 0); hours(g, 48); ok(near(stock(g), 0, 1, 1) && near(co.water.sold, 8000), 'reserve 0: everything is sold, never more than exists'); hours(g, 24); ok(stock(g) >= 0 && near(co.water.sold, 8000), 'an empty tank sells nothing more');
}
{ // 3. the daily capacity of the loading pump (water_pump_s = maxFlow per day)
  const cap = B.DEFS.water_pump_s.params.maxFlow, { g } = site([cap * 5], 'water_pump_s'), co = g.co; co.setAutoWater(true, 0);
  hours(g, 24); ok(near(co.water.sold, cap, 1e-6), 'one day sells exactly the pump capacity (' + cap + ')'); hours(g, 24); ok(near(co.water.sold, cap * 2, 1e-6), 'the next day another ' + cap + ' (the daily counter resets)');
  hours(g, 5); const mid = co.water.sold; ok(mid > cap * 2 && mid < cap * 3, 'capacity is spread over the day: ' + Math.round(mid));
}
{ // 4. no loading pump / pump not connected / pump not operational -> no automatic sale
  const a = site([20000], 'water_pump_l', false); a.g.co.setAutoWater(true, 0); hours(a.g, 48); ok(stock(a.g) === 20000 && a.g.co.water.sold === 0, 'no loading pump: nothing is sold automatically');
  const b = site([20000]); b.g.co.setAutoWater(true, 0); ok(b.g.co.autoWaterInfo().loaders === 1, 'a connected loading pump is counted');
  const edge = b.g.sim.edgeOf(b.lp, 'INPUT'); ok(!!edge, 'the loading pump has a real INPUT edge'); I.setLineOpen(b.g.net, edge.line.id, false); b.g.sim.build();
  ok(b.g.co.autoWaterInfo().loaders === 0, 'line CLOSED (valve) -> the pump is not on an open network, not a loader'); hours(b.g, 48); ok(stock(b.g) === 20000 && b.g.co.water.sold === 0, 'closed line: nothing is sold');
  I.setLineOpen(b.g.net, edge.line.id, true); b.g.sim.build(); hours(b.g, 2); ok(b.g.co.water.sold > 0, 'line re-opened: selling resumes');
}
{ // 5. two tanks of a group, the sale is proportional and ONCE per tank; oil is untouched
  const { g, T } = site([6000, 4000], 'water_pump_l'), co = g.co, oil = put(g, 'crude_tank_m', 100, 100); g.sim.build(); S(g, oil).vol = 5000; co.setAutoWater(true, 2000); hours(g, 24);
  ok(near(stock(g), 2000, 1e-9), 'group stock goes to the reserve (2,000)'); ok(near(S(g, T[0]).vol / S(g, T[1]).vol, 1.5, 1e-6), 'taken in proportion from both tanks (ratio 6000:4000 kept)'); ok(S(g, oil).vol === 5000 && co.crudeOnHand() === 5000, 'oil is untouched');
  ok(co.waterLog().length === 1 && co.waterLog()[0].auto === true && near(co.waterLog()[0].qty, 8000), 'the day\'s automatic sales are one log line (8,000 bbl)');
}
{ // 6. manual sale + automatic sale never sell the same barrel twice
  const { g } = site([10000]), co = g.co; co.setAutoWater(true, 0); hours(g, 3); const s0 = co.water.sold; const r = co.sellWater(2000); ok(r.ok, 'manual sale works while auto is on');
  hours(g, 48); ok(near(co.water.sold, 10000 - 0) && stock(g) >= 0 && near(co.water.sold + stock(g), 10000), 'sold + stock = the original 10,000 (nothing created, nothing sold twice)', { sold: co.water.sold, st: stock(g) });
}
{ // 7. save / load keeps the setting and the counters
  const { g } = site([15000]), co = g.co; co.setAutoWater(true, 12000); hours(g, 2); const g2 = reload(g), c2 = g2.co;
  ok(c2.water.auto.on === true && c2.water.auto.reserve === 12000 && near(c2.water.auto.sold, co.water.auto.sold), 'auto flag, reserve and sold counter survive save/load');
  const old = JSON.parse(JSON.stringify(co.toJSON())); delete old.water.auto; const g3 = game(1e12); g3.co.fromJSON ? g3.co.fromJSON(old) : null; ok(!g3.co.fromJSON || (g3.co.water.auto && g3.co.water.auto.on === false && g3.co.water.auto.reserve === 0), 'an OLD save (no auto field) loads with auto OFF');
}
console.log(n + ' checks passed');
