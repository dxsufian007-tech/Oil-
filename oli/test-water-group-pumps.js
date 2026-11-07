// Review test: a water group of several tanks, a pump connected to each tank in turn, then one pump per tank at once; loader link + daily capacity checks.   node test-water-group-pumps.js
const H = require('./test-reserve-helpers.js'), { B, I, game, put } = H, assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
const S = (g, b) => g.sim.ensure(b), near = (a, b, e) => Math.abs(a - b) <= (e || 1e-6) * Math.max(1, Math.abs(a), Math.abs(b));
const conn = (g, a, b) => { const r = I.layConnect(g.store, g.net, g.ts, a.id, b.id, {}); assert(r.ok, 'connect ' + a.x + ',' + a.y + '>' + b.x + ',' + b.y + ' ' + a.d + '>' + b.d + ' ' + r.reason); return r; };
const STOCK = [10000, 6000, 2000, 0, 2000], TOT = 20000;
const mk = () => { const g = game(1e12), T = []; for (let i = 0; i < 5; i++) { T.push(put(g, 'water_tank_m', 40 + i * 5, 40)); if (i) I.autoLinkTank(g.store, g.net, g.ts, T[i].id); } return { g, T }; };
// A. the same pump on each tank in turn: always the whole group, proportional, sink gets exactly the drawn amount
for (let k = 0; k < 5; k++) {
  const { g, T } = mk(), pu = put(g, 'water_pump_s', 40 + k * 5, 70), sink = put(g, 'water_tank_l', 90, 70); conn(g, T[k], pu); conn(g, pu, sink); g.sim.build(); STOCK.forEach((v, i) => { S(g, T[i]).vol = v; });
  assert(g.sim.groupInfo(T[0]).n === 5, 'group of 5'); for (let s = 0; s < 4; s++) g.sim.step(0.05);   // 5000 x 0.2 = 1000 bbl
  const d = T.map((t, i) => STOCK[i] - S(g, t).vol), exp = STOCK.map(v => 1000 * v / TOT);
  ok(near(S(g, sink).vol, 1000, 1e-9) && d.every((x, i) => near(x, exp[i], 1e-9)) && near(T.reduce((a, t) => a + S(g, t).vol, 0) + S(g, sink).vol, TOT, 1e-12), 'pump on tank ' + (k + 1) + ': drew ' + d.map(Math.round).join('/') + ' (= 500/300/100/0/100), nothing lost or duplicated, the empty tank gave nothing');
}
// B. one pump on EVERY tank at once: combined capacity 5 x 5000, never above any pump or the available water
{ const { g, T } = mk(), sinks = [], ps = []; T.forEach((t, i) => { const up = i % 2, lane = i >> 1, px = 40 + i * 5, py = up ? 28 - lane * 10 : 56 + lane * 10, pu = put(g, 'water_pump_s', px, py), sk = put(g, 'water_tank_l', px + 4, py); conn(g, t, pu); conn(g, pu, sk); ps.push(pu); sinks.push(sk); }); g.sim.build(); STOCK.forEach((v, i) => { S(g, T[i]).vol = v; });
  const got = () => sinks.reduce((a, k) => a + S(g, k).vol, 0), cap = 5000 * 0.05;
  g.sim.step(0.05); const got1 = got(); ok(got1 <= 5 * cap + 1e-6 && got1 > 1.5 * cap, 'five pumps together move more than one pump but never above 5 x 5000/day (' + Math.round(got1) + ' bbl in 0.05 day)');
  ok(sinks.every(k => S(g, k).vol <= cap + 1e-6), 'no single pump moved more than its own capacity (' + sinks.map(k => Math.round(S(g, k).vol)).join('/') + ')');
  for (let s = 0; s < 80; s++) g.sim.step(0.05);
  ok(near(got(), TOT, 1e-9) && T.every(t => S(g, t).vol < 1e-6), 'all 20,000 bbl end in the sinks, exactly (no loss, no duplication)'); }
// C. loading pumps: each linked in turn, sale deducted proportionally from the whole group, once, within the loader capacity
for (let k = 0; k < 5; k++) {
  const { g, T } = mk(), lp = put(g, 'water_pump_s', 40 + k * 5, 70); conn(g, T[k], lp); g.sim.build(); STOCK.forEach((v, i) => { S(g, T[i]).vol = v; });
  const C = g.co, info = C.waterInfo();
  ok(info.loaders === 1 && near(info.sellable, 5000) && near(info.stock, TOT), 'loader on tank ' + (k + 1) + ': sees the whole group (' + info.stock + ' bbl), sellable ' + info.sellable + ' (daily capacity 5,000)');
  const r = C.sellWater(1000); ok(r.ok && near(r.gross, 1000 * C.waterPrice()), 'sale of 1000 at ' + C.waterPrice() + ' = ' + r.gross);
  const d = T.map((t, i) => STOCK[i] - S(g, t).vol); ok(d.every((x, i) => near(x, 1000 * STOCK[i] / TOT, 1e-9)), 'deducted proportionally ' + d.map(Math.round).join('/') + ', once');
  ok(!C.sellWater(5000).ok, 'above the remaining daily loading capacity: refused');
}
// D. loader link must be real: closing the loader line (or no line) = nothing sellable
{ const { g, T } = mk(), lp = put(g, 'water_pump_s', 40, 70); const r = conn(g, T[0], lp); g.sim.build(); S(g, T[0]).vol = 5000;
  ok(g.co.waterInfo().sellable > 0, 'connected loader: sellable');
  for (const l of g.net.lines.values()) I.setLineOpen(g.net, l.id, false); g.sim.build(); g.sim.dirty && g.sim.dirty();
  ok(g.co.waterInfo().loaders === 0 && g.co.waterInfo().sellable === 0 && !g.co.sellWater(100).ok, 'loader line closed: no loader, nothing sellable, sale refused');
  const g2 = mk(); put(g2.g, 'water_pump_s', 40, 70); g2.g.sim.build(); S(g2.g, g2.T[0]).vol = 5000; ok(g2.g.co.waterInfo().loaders === 0 && !g2.g.co.sellWater(100).ok, 'pump placed but not connected: no sale'); }
// E. price override hook
{ const { g } = mk(); const p0 = g.co.waterPrice(); g.co.market.price.WATER = 2.25; ok(p0 === 1.5 && g.co.waterPrice() === 2.25, 'price: default 1.5, overridable through the market price table (market.price.WATER)'); }
console.log('WATER GROUP/PUMP REVIEW TESTS PASSED (' + n + ' checks)');
