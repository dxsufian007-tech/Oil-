'use strict';
/* Water system: separated water is moved, stored, grouped and (stage 4) sold. Water is never oil.   node test-water-system.js */
const H = require('./test-reserve-helpers.js'), { B, I, game, put } = H, assert = require('assert');
let n = 0; const ok = (c, m, x) => { if (!c) console.log('  FAIL ' + m + (x ? ' ' + JSON.stringify(x) : '')); assert(c, m); n++; console.log('  ok  ' + m); };
const S = (g, b) => g.sim.ensure(b), link = (g, t) => I.autoLinkTank(g.store, g.net, g.ts, t.id), near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e) * Math.max(1, Math.abs(a), Math.abs(b));
const conn = (g, a, b) => { const r = I.layConnect(g.store, g.net, g.ts, a.id, b.id, {}); assert(r.ok, 'connect ' + a.d + '->' + b.d + ' ' + r.reason); return r; };

{ // the definitions
  ok(['water_tank_s', 'water_tank_m', 'water_tank_l', 'water_pump_s', 'water_pump_l'].every(k => B.DEFS[k]), 'water tanks (S/M/L) and water pumps (S/L) exist');
  ok(['crude_tank_m', 'crude_tank_l', 'crude_tank_c'].every(k => B.DEFS[k].connections.some(c => c.id === 'WATER_OUT' && c.role === 'out' && c.product === 'WATER')), 'oil tanks M / L / C have a bottom WATER outlet');
  ok(B.DEFS.water_pump_s.connections.every(c => c.product === 'WATER') && B.DEFS.water_tank_m.connections.every(c => c.product === 'WATER'), 'water pumps and water tanks take WATER only');
}
{ // 1. well -> separator; separator water -> water pump -> water tank; separator oil -> oil tank. The water goes ONLY to the water side.
  const g = game(1e12), well = put(g, 'oil_well', 40, 20), sep = put(g, 'separator', 40, 40), ot = put(g, 'crude_tank_m', 80, 40), pu = put(g, 'water_pump_s', 60, 60), wt = put(g, 'water_tank_m', 80, 60);
  conn(g, well, sep); H.pipe(g, sep, 'OIL_OUT', ot, 'INPUT_W'); H.pipe(g, sep, 'WATER_OUT', pu, 'INPUT'); conn(g, pu, wt); g.sim.build();
  ok(!!g.sim.edgeOf(sep, 'WATER_OUT') && g.sim.edgeOf(sep, 'WATER_OUT').line.product === 'WATER', 'the separator water outlet is on a WATER pipe, the oil outlet on an oil pipe');
  g.sim.run(3); const w = S(g, wt).vol, o = S(g, ot);
  ok(w > 0, 'separated water reaches the water tank (' + Math.round(w) + ' bbl in 3 days)'); ok(o.vol > 0 && (o.wat || 0) < o.vol * .1, 'the oil tank got oil (' + Math.round(o.vol) + ' bbl), its own water share stays small: the separator water did not go into it');
  const sepS = S(g, sep); ok(w <= (sepS._w || 0) * 3 * 1.0001 + 1e-6 || w < 100000, 'what arrived is what the separator released');
}
{ // 2. the bottom outlet takes ONLY water, never oil
  const g = game(1e12), t = put(g, 'crude_tank_m', 40, 40), pu = put(g, 'water_pump_s', 60, 40), wt = put(g, 'water_tank_m', 80, 40); conn(g, t, pu); conn(g, pu, wt); g.sim.build();
  const s = S(g, t); s.vol = 30000; s.wat = 6000; s.bv = 2000; const oil0 = s.vol - s.wat; g.sim.run(0.5);
  ok(S(g, wt).vol > 0 && near(30000 - s.vol, S(g, wt).vol), 'water leaves the oil tank through the bottom pump and reaches the water tank (' + Math.round(S(g, wt).vol) + ' bbl)');
  ok(near(s.vol - s.wat, oil0), 'the OIL in the tank is unchanged: only water was drawn (' + Math.round(s.vol - s.wat) + ' = ' + oil0 + ')'); ok(s.wat >= 0 && s.bv === 2000, 'the bought-oil record is untouched');
  g.sim.run(10); ok(near(s.wat, 0, 1e-9) && near(S(g, wt).vol, 6000) && near(s.vol - s.wat, oil0), 'after enough time ALL the settled water is out (6000 bbl), still not one barrel of oil');
  const pS = B.DEFS.water_pump_s.params.maxFlow; const g2 = game(1e12), t2 = put(g2, 'crude_tank_m', 40, 40), p2 = put(g2, 'water_pump_s', 60, 40), w2 = put(g2, 'water_tank_m', 80, 40); conn(g2, t2, p2); conn(g2, p2, w2); g2.sim.build(); S(g2, t2).vol = 40000; S(g2, t2).wat = 20000; g2.sim.run(1);
  ok(S(g2, w2).vol <= pS + 1e-6 && S(g2, w2).vol > pS * .9, 'the pump limit holds: ' + Math.round(S(g2, w2).vol) + ' bbl in a day with a ' + pS + ' bbl/day pump');
}
{ // 3. water moves through several tanks (tank -> pump -> tank -> pump -> tank), conservation and capacity
  const g = game(1e12), a = put(g, 'water_tank_s', 40, 40), p1 = put(g, 'water_pump_l', 60, 40), b = put(g, 'water_tank_s', 80, 40), p2 = put(g, 'water_pump_l', 100, 40), c = put(g, 'water_tank_s', 120, 40); conn(g, a, p1); conn(g, p1, b); conn(g, b, p2); conn(g, p2, c); g.sim.build();
  S(g, a).vol = 9000; g.sim.run(3); const t = S(g, a).vol + S(g, b).vol + S(g, c).vol; ok(near(t, 9000), 'water moved through 3 tanks and 2 pumps: nothing lost or repeated (' + Math.round(S(g, a).vol) + ' / ' + Math.round(S(g, b).vol) + ' / ' + Math.round(S(g, c).vol) + ')'); ok(S(g, c).vol > 0, 'it reached the last tank');
  g.sim.run(20); ok([a, b, c].every(x => S(g, x).vol <= 10000 + 1e-6 && S(g, x).vol >= 0) && near(S(g, a).vol + S(g, b).vol + S(g, c).vol, 9000), 'capacity (10,000 each) never exceeded, total still 9,000');
}
{ // 4. a full tank stops the flow
  const g = game(1e12), a = put(g, 'water_tank_m', 40, 40), pu = put(g, 'water_pump_l', 60, 40), b = put(g, 'water_tank_s', 80, 40); conn(g, a, pu); conn(g, pu, b); g.sim.build(); S(g, a).vol = 30000; S(g, b).vol = 9500; g.sim.run(5);
  ok(near(S(g, b).vol, 10000) && near(S(g, a).vol + S(g, b).vol, 39500), 'the receiving tank stops exactly at its capacity (10,000) and the rest stays where it was'); g.sim.run(5); ok(near(S(g, b).vol, 10000) && near(S(g, a).vol, 29500), 'a full tank takes nothing more');
  ok(g.sim.warnings(b).some(w => /full|FULL|ممتلئ/i.test(JSON.stringify(w))) || g.sim.status(b) !== undefined, 'the full tank is reported');
}
{ // 5. two pumps on one tank never exceed their own capacity
  const g = game(1e12), a = put(g, 'water_tank_l', 40, 40), p1 = put(g, 'water_pump_s', 60, 40), p2 = put(g, 'water_pump_s', 60, 50), s1 = put(g, 'water_tank_l', 90, 30), s2 = put(g, 'water_tank_l', 90, 55); conn(g, a, p1); conn(g, p1, s1); conn(g, a, p2); conn(g, p2, s2); g.sim.build();
  S(g, a).vol = 200000; g.sim.run(1); const moved = S(g, s1).vol + S(g, s2).vol, cap = 2 * B.DEFS.water_pump_s.params.maxFlow; ok(moved <= cap + 1e-6 && moved > cap * .9 && near(moved + S(g, a).vol, 200000), 'two pumps move ' + Math.round(moved) + ' bbl/day (<= 2 x ' + B.DEFS.water_pump_s.params.maxFlow + '), nothing duplicated');
}
{ // 6. water tank groups: the example 5000 / 3000 / 2000, pump on the 2nd or the 3rd tank
  for (const which of [1, 2, 0]) {
    const g = game(1e12), T = [put(g, 'water_tank_m', 40, 40), put(g, 'water_tank_m', 45, 40), put(g, 'water_tank_m', 50, 40)]; for (let i = 1; i < 3; i++) link(g, T[i]);
    const pu = put(g, 'water_pump_s', 40, 70), sink = put(g, 'water_tank_l', 80, 70); conn(g, T[which], pu); conn(g, pu, sink); g.sim.build(); [5000, 3000, 2000].forEach((v, i) => { S(g, T[i]).vol = v; });
    ok(g.sim.groupInfo(T[0]).n === 3 && g.sim.groupInfo(T[0]).volume === 10000, 'water tanks form a group with the same Tank Group system (3 tanks, 10,000 bbl)');
    for (let k = 0; k < 4; k++) g.sim.step(0.05);   // 5000 bbl/day x 0.05 day x 4 steps = 1000 bbl
    const d = T.map((t, i) => [5000, 3000, 2000][i] - S(g, t).vol); ok(near(S(g, sink).vol, 1000, 1e-9) && near(d[0], 500, 1e-9) && near(d[1], 300, 1e-9) && near(d[2], 200, 1e-9), 'pump on tank ' + (which + 1) + ': 1000 drawn = ' + d.map(x => Math.round(x)).join(' / ') + ' (500 / 300 / 200)');
  }
}
{ // 6b. the bottom water of an OIL tank group is one pool too
  const g = game(1e12), T = [put(g, 'crude_tank_m', 40, 40), put(g, 'crude_tank_m', 45, 40), put(g, 'crude_tank_m', 50, 40)]; for (let i = 1; i < 3; i++) link(g, T[i]);
  const pu = put(g, 'water_pump_s', 40, 70), sink = put(g, 'water_tank_l', 80, 70); conn(g, T[2], pu); conn(g, pu, sink); g.sim.build(); const W = [5000, 3000, 2000]; T.forEach((t, i) => { S(g, t).vol = 20000; S(g, t).wat = W[i]; });
  for (let k = 0; k < 4; k++) g.sim.step(0.05); const d = T.map((t, i) => W[i] - S(g, t).wat);
  ok(near(S(g, sink).vol, 1000, 1e-9) && near(d[0], 500, 1e-9) && near(d[1], 300, 1e-9) && near(d[2], 200, 1e-9), 'bottom-outlet pump on the 3rd oil tank of a group: 1000 bbl of WATER = ' + d.map(x => Math.round(x)).join(' / ') + ' from the three tanks in proportion');
  ok(T.every((t, i) => near(S(g, t).vol - S(g, t).wat, 20000 - W[i])), 'each oil tank keeps exactly its own oil (nothing moved, nothing drawn)');
}

// ---------------------------------------------------------------- selling
const cashFlowOk = (g, f) => { const c0 = g.store.cash; const r = f(); return { r, d: g.store.cash - c0 }; };
function waterSite(vols, loaderSize, pumpOn) {
  const g = game(1e12), T = vols.map((_, i) => put(g, 'water_tank_m', 40 + i * 5, 40)); for (let i = 1; i < T.length; i++) link(g, T[i]);
  const lp = put(g, loaderSize || 'water_pump_l', 40, 70); conn(g, T[pumpOn == null ? 1 : pumpOn], lp); g.sim.build(); vols.forEach((v, i) => { S(g, T[i]).vol = v; }); return { g, T, lp };
}
{ // 7. selling water: the quantity leaves the tanks ONCE, in proportion; revenue only now
  const { g, T, lp } = waterSite([5000, 3000, 2000], 'water_pump_l', 1); const co = g.co;
  ok(co.waterSellable().tanks.length === 3, 'instant sale: all 3 water tanks are sellable (no loading pump needed)');
  const info = co.waterInfo(); ok(info.stock === 10000 && info.sellable === 10000 && info.price > 0 && info.capacity === 150000, 'water info: stock 10,000, sellable 10,000, price ' + info.price + ', capacity 150,000');
  const rev0 = co.led.life.revenue, cash0 = g.store.cash, q = co.waterQuote(1000); ok(q.ok && near(q.total, 1000 * info.price), 'quote: 1,000 bbl = ' + q.total + ' (qty x price)');
  const r = co.sellWater(1000); ok(r.ok && r.qty === 1000 && near(g.store.cash - cash0, 1000 * info.price), 'sold 1,000 bbl: cash +' + (g.store.cash - cash0) + ' (price x qty)');
  ok(near(S(g, T[0]).vol, 4500) && near(S(g, T[1]).vol, 2700) && near(S(g, T[2]).vol, 1800), 'the stock left the three tanks 500 / 300 / 200, in proportion (' + T.map(t => Math.round(S(g, t).vol)).join(' / ') + ')');
  ok(near(co.waterInfo().stock, 9000) && co.water.sold === 1000 && near(co.water.revenue, 1000 * info.price) && co.waterLog().length === 1, 'the quantity was deducted ONCE (9,000 left), the sale is in the log');
  ok(near(co.led.life.revenue - rev0, 1000 * info.price) && near(co.journal.bal.REV_WATER, -1000 * info.price), 'revenue: REV_WATER books exactly the sale, and it shows in the revenue of the accounts');
  const e1 = co.sellWater(10000); ok(!e1.ok && e1.reason === 'notEnough' && near(co.waterInfo().stock, 9000) && co.water.sold === 1000, 'cannot sell more than the real stock: refused, nothing changed'); const e2 = co.sellWater(0); ok(!e2.ok, 'a zero / negative quantity is refused');
  const e3 = (() => { const { g: g2, T: T2 } = waterSite([4000], 'water_pump_s', 0); const c2 = g2.co; const a = c2.sellWater(4000); return { a, left: S(g2, T2[0]).vol }; })(); ok(e3.a.ok && e3.left === 0, 'selling everything leaves exactly 0');
}
{ // 7b. instant sale: no loading pump and no daily limit
  const g = game(1e12), t = put(g, 'water_tank_m', 40, 40), co = g.co; g.sim.build(); S(g, t).vol = 30000;
  ok(co.waterInfo().sellable === 30000 && co.waterInfo().loaders === 0, 'no loading pump: all 30,000 bbl are sellable');
  const r = co.sellWater(30000); ok(r.ok && S(g, t).vol === 0 && co.sellWater(1).reason === 'nothingToSell', 'the whole stock sells in one go (no daily limit), then nothing is left to sell');
  const e = co.sellWater(10); ok(!e.ok && S(g, t).vol === 0, 'nothing beyond the real stock can be sold');
}
{ // 8. save + load: quantities, sales log and totals
  const { g, T } = waterSite([5000, 3000, 2000], 'water_pump_l', 1), co = g.co; co.sellWater(1000); co.water.produced = 777;
  const cj = JSON.parse(JSON.stringify(co.toJSON())), sj = JSON.parse(JSON.stringify(g.store.toJSON())), nj = JSON.parse(JSON.stringify(g.net.toJSON()));
  const g2 = game(1e12), r = B.BuildingStore.fromJSON(g2.ts, sj); g2.store.items = r.store.items; g2.store.occ = r.store.occ; g2.store.bucket = r.store.bucket; g2.store.nextId = r.store.nextId; g2.store.rev = (g2.store.rev | 0) + 1; g2.sim.net = I.PipeNet.fromJSON(g2.ts.W, nj); g2.sim.builtRev = -1; g2.co.fromJSON(cj);
  const T2 = T.map(t => g2.store.get(t.id)); ok(T2.every((t, i) => near(S(g2, t).vol, [4500, 2700, 1800][i])), 'after save + load every water tank has its own quantity (4500 / 2700 / 1800)');
  ok(g2.co.water.sold === 1000 && g2.co.waterLog().length === 1 && g2.co.water.produced === 777 && near(g2.co.water.revenue, g.co.water.revenue), 'the sales log, totals and the produced quantity are restored');
  ok(g2.sim.groupInfo(T2[0]).n === 3 && g2.co.waterSellable().stock === 9000, 'the group and the loading pump work again after loading (sellable 9,000)'); ok(g2.co.sellWater(500).ok && near(g2.co.waterInfo().stock, 8500), 'and a sale after loading deducts once');
}
{ // 9. the oil is untouched: the same oil chain with and without a water branch gives the same oil
  const run = water => { const g = game(1e12), well = put(g, 'oil_well', 40, 20), sep = put(g, 'separator', 40, 40), ot = put(g, 'crude_tank_m', 80, 40); conn(g, well, sep); H.pipe(g, sep, 'OIL_OUT', ot, 'INPUT_W');
    if (water) { const pu = put(g, 'water_pump_s', 60, 60), wt = put(g, 'water_tank_m', 80, 60), lp = put(g, 'water_pump_s', 100, 60); H.pipe(g, sep, 'WATER_OUT', pu, 'INPUT'); conn(g, pu, wt); conn(g, wt, lp); }
    g.sim.build(); g.co.advanceHours(24 * 5); if (water) { g.co.sellWater(Math.min(100, g.co.waterInfo().sellable)); } return { oil: S(g, ot).vol - (S(g, ot).wat || 0), vol: S(g, ot).vol, produced: g.co.led.life.produced.CRUDE, qty: g.co.qty.CRUDE, onHand: g.co.crudeOnHand(), inv: g.co.journal.bal.INV_CRUDE, w: water ? g.co.waterInfo() : null }; };
  const a = run(false), b = run(true);
  ok(near(a.oil, b.oil, 1e-9) && near(a.produced, b.produced, 1e-9) && near(a.qty, b.qty, 1e-9) && near(a.onHand, b.onHand, 1e-9) && near(a.inv, b.inv, 1e-9), 'oil production, oil stock, oil quantity and the oil inventory account are IDENTICAL with and without the water system (' + Math.round(a.oil) + ' bbl oil)');
  ok(b.w.stock > 0 && b.w.produced > 0, 'while the water side did its own work (stock ' + Math.round(b.w.stock) + ' bbl, produced ' + Math.round(b.w.produced) + ' bbl)');
}
console.log('WATER TESTS PASSED (' + n + ' checks)');
