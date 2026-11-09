'use strict';
/* Tank Groups: tanks joined by a pair of opposite open lines behave as ONE storage unit (derived, never stored). Each tank keeps its own stock. */
const H = require('./test-reserve-helpers.js'), { B, I, game, put } = H;
let f = 0; const ok = (c, m) => { if (!c) { f++; console.log('FAIL', m); } else console.log('ok  ', m); }, near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e);
const mk = (type, n) => { const g = game(1e12), t = []; for (let i = 0; i < n; i++) t.push(put(g, type, 40 + i * 10, 40)); for (let i = 1; i < n; i++) I.autoLinkTank(g.store, g.net, g.ts, t[i].id); g.sim.build(); return { g, t }; };
{ const { g, t } = mk('crude_tank_c', 2), gi = g.sim.groupInfo(t[0]), cap = B.DEFS.crude_tank_c.capacity.value;
  ok(gi && gi.n === 2 && gi.members.length === 2, 'two linked tanks form ONE group'); ok(gi.capacity === 2 * cap, 'group capacity = sum of the tanks');
  const a = g.sim.ensure(t[0]), b = g.sim.ensure(t[1]); a.vol = 500; b.vol = 300; const gi2 = g.sim.groupInfo(t[1]);
  ok(gi2.volume === 800 && a.vol === 500 && b.vol === 300, 'group stock = 800; each tank still holds its own 500 / 300 (nothing copied or moved)'); ok(g.sim.groupOf(t[0]) === g.sim.groupOf(t[1]), 'both tanks resolve to the same group'); }
{ const g = game(1e12), a = put(g, 'crude_tank_c', 40, 40), c = put(g, 'crude_tank_c', 90, 40); g.sim.build(); ok(!g.sim.groupOf(a) && !g.sim.groupOf(c), 'unlinked tanks are not grouped'); }
{ const { g, t } = mk('crude_tank_c', 3), gi = g.sim.groupInfo(t[0]); ok(gi.n === 3, 'a chain of three linked tanks is one group'); }

// ---- the DRAW: a pump on the group takes from every tank, in proportion, limited only by the pump / pipe ----
const chain = (n, pumps) => { const g = game(1e12), t = []; for (let i = 0; i < n; i++) t.push(put(g, 'crude_tank_c', 40 + i * 10, 40)); for (let i = 1; i < n; i++) I.autoLinkTank(g.store, g.net, g.ts, t[i].id);
  const sink = put(g, 'crude_tank_c', 40, 120), P = []; for (let k = 0; k < pumps; k++) { const pu = put(g, 'pump_station_l', 20 + k * 30, 80); const c1 = I.layConnect(g.store, g.net, g.ts, t[k % n].id, pu.id, {}), c2 = I.layConnect(g.store, g.net, g.ts, pu.id, sink.id, {}); if (!c1.ok || !c2.ok) throw new Error('connect ' + (c1.reason || c2.reason)); P.push(pu); }
  g.sim.build(); return { g, t, sink, P, S: x => g.sim.ensure(x) }; };
{ const { g, t, sink, S } = chain(2, 1); S(t[0]).vol = 500000; S(t[1]).vol = 300000; const a0 = S(t[0]).vol, b0 = S(t[1]).vol; g.sim.run(0.05);
  const da = a0 - S(t[0]).vol, db = b0 - S(t[1]).vol, got = S(sink).vol;
  ok(da > 0 && db > 0, 'the pump draws from BOTH tanks (' + Math.round(da) + ' / ' + Math.round(db) + ')'); ok(near(da / db, 500 / 300, 1e-6), 'the draw is proportional to stock: ' + (da / db).toFixed(6) + ' = 500/300');
  ok(near(da + db, got, 1e-6), 'oil removed from the tanks = oil that arrived (no double counting)');
  g.sim.run(60); const rest = S(t[0]).vol + S(t[1]).vol, moved = S(sink).vol; ok(near(rest + moved, 800000, 1e-6), 'conservation over 60 days (' + Math.round(rest) + ' left + ' + Math.round(moved) + ' moved)'); ok(S(t[0]).vol >= 0 && S(t[1]).vol >= 0, 'no tank goes negative'); }
{ const { g, t, sink, S } = chain(2, 1); S(t[0]).vol = 0; S(t[1]).vol = 300000; const b0 = S(t[1]).vol; g.sim.run(0.05);   // the pump sits on tank 0 (empty): it keeps drawing from tank 1
  ok(S(t[1]).vol < b0 && S(sink).vol > 0 && near(b0 - S(t[1]).vol, S(sink).vol, 1e-6), 'the pump is on an EMPTY tank: the group still delivers from the other one'); }
{ const one = chain(2, 1), two = chain(2, 2), S1 = one.S, S2 = two.S; for (const c of [one, two]) { c.S(c.t[0]).vol = 4000000; c.S(c.t[1]).vol = 4000000; c.g.sim.run(1); }
  const m1 = S1(one.sink).vol, m2 = S2(two.sink).vol; ok(m2 > m1 * 1.5 && m2 <= m1 * 2.0001, 'two pumps move more (' + Math.round(m2) + ' vs ' + Math.round(m1) + ' bbl/day): each pump keeps its own capacity, they do not multiply it');
  ok(near(S2(two.t[0]).vol + S2(two.t[1]).vol + m2, 8000000, 1e-6), 'two pumps on one group: the stock leaves once (no double draw)'); }
{ const { g, t, sink, S } = chain(2, 2); S(t[0]).vol = 1000; S(t[1]).vol = 1000; g.sim.run(2);   // two pumps are much bigger than 2,000 bbl: they cannot take more than exists
  ok(S(t[0]).vol >= 0 && S(t[1]).vol >= 0 && near(S(t[0]).vol + S(t[1]).vol + S(sink).vol, 2000, 1e-6), 'pumps cannot draw more than the group holds (all 2,000 bbl end up in the sink, nothing invented)'); }
{ const { g, t, sink, S } = chain(2, 1); S(t[0]).vol = 400000; S(t[0]).wat = 40000; S(t[0]).bv = 100000; S(t[1]).vol = 400000; S(t[1]).wat = 0; S(t[1]).bv = 0; g.sim.run(5);
  const w0 = S(t[0]).wat / S(t[0]).vol, w1 = S(t[1]).wat; ok(near(w0, 0.1, 1e-6) && w1 === 0, 'each tank keeps ITS OWN water share (10% / 0%), nothing is mixed between tanks'); ok(near(S(t[0]).bv / S(t[0]).vol, 0.25, 1e-6) && S(t[1]).bv === 0, 'each tank keeps its own bought-oil share');
  const inSink = S(sink); ok(near(inSink.wat + S(t[0]).wat + S(t[1]).wat, 40000, 1e-6), 'water is conserved across the draw'); }

// ---- the FILL: when the receiving tank is full the rest goes to the other tanks of the group ----
{ const g = game(1e12), cap = B.DEFS.crude_tank_c.capacity.value, A = put(g, 'crude_tank_c', 40, 40), Bt = put(g, 'crude_tank_c', 50, 40), C = put(g, 'crude_tank_c', 60, 40); I.autoLinkTank(g.store, g.net, g.ts, Bt.id); I.autoLinkTank(g.store, g.net, g.ts, C.id);
  const src = put(g, 'crude_tank_c', 40, 120), pu = put(g, 'pump_station_l', 20, 80); if (!I.layConnect(g.store, g.net, g.ts, src.id, pu.id, {}).ok || !I.layConnect(g.store, g.net, g.ts, pu.id, A.id, {}).ok) throw new Error('connect'); g.sim.build(); const S = x => g.sim.ensure(x);
  S(src).vol = 3e6; S(A).vol = cap - 5000; S(Bt).vol = 100; S(C).vol = 0; const water0 = 0, tot0 = S(src).vol + S(A).vol + S(Bt).vol + S(C).vol; g.sim.run(3);
  ok(S(A).vol <= cap + 1e-6 && S(A).vol > cap - 5000, 'the receiving tank fills up to its capacity and not beyond (' + Math.round(S(A).vol) + ' / ' + cap + ')');
  ok(S(Bt).vol > 100 || S(C).vol > 0, 'the surplus goes to the other tanks of the group (' + Math.round(S(Bt).vol) + ' / ' + Math.round(S(C).vol) + ')');
  ok(near(S(src).vol + S(A).vol + S(Bt).vol + S(C).vol, tot0, 1e-9), 'conservation: nothing lost or created by the overflow');
  g.sim.run(30); ok([A, Bt, C].every(t => S(t).vol <= cap + 1e-6 && S(t).vol >= 0), 'every tank stays within 0..capacity'); const gi = g.sim.groupInfo(A); ok(near(gi.volume + S(src).vol, tot0, 1e-9) && gi.volume <= gi.capacity + 1e-6, 'group stock never exceeds the group capacity (' + Math.round(gi.volume) + ' / ' + gi.capacity + ')');
  // once the whole group is full the pump is blocked (no oil is created to make room)
  S(A).vol = cap; S(Bt).vol = cap; S(C).vol = cap; const before = S(src).vol; g.sim.run(2); ok(near(S(src).vol, before, 1e-9) && S(A).vol <= cap + 1e-6, 'a full group takes nothing more'); }
// ---- joining / leaving ----
{ const g = game(1e12), A = put(g, 'crude_tank_c', 40, 40), Bt = put(g, 'crude_tank_c', 50, 40); I.autoLinkTank(g.store, g.net, g.ts, Bt.id); const S = x => g.sim.ensure(x); S(A).vol = 700; S(Bt).vol = 200; S(Bt).wat = 20; S(Bt).bv = 50;
  const C = put(g, 'crude_tank_c', 60, 40); S(C).vol = 90; const r = I.autoLinkTank(g.store, g.net, g.ts, C.id); g.sim.build(); const gi = g.sim.groupInfo(A);
  ok(r.linked.length >= 1 && gi.n === 3 && gi.volume === 990 && S(A).vol === 700 && S(Bt).vol === 200 && S(C).vol === 90, 'a new tank that is linked joins the group: 3 tanks, stock 990, nothing moved');
  for (const L of [...g.net.lines.values()]) if ((L.a.b === C.id) || (L.b.b === C.id)) I.removeConnection(g.store, g.net, L.id, true); g.sim.build();
  ok(!g.sim.groupOf(C) && S(C).vol === 90 && g.sim.groupInfo(A).n === 2 && g.sim.groupInfo(A).volume === 900 && S(Bt).wat === 20 && S(Bt).bv === 50, 'a tank that is unlinked leaves the group with its own stock (90), the others keep theirs');
  // save / load: the stocks come back tank by tank, the group is derived again
  const n2 = I.PipeNet.fromJSON(g.ts.W, JSON.parse(JSON.stringify(g.net.toJSON()))); g.sim.net = n2; g.sim.builtRev = -1; const gi2 = g.sim.groupInfo(A);
  ok(gi2 && gi2.n === 2 && gi2.volume === 900 && S(A).vol === 700 && S(Bt).vol === 200, 'after save + load of the pipes the group is derived again, stocks untouched'); }
// ---- the panel numbers ----
{ const { g, t } = mk('crude_tank_c', 2), S = x => g.sim.ensure(x); S(t[0]).vol = 500000; S(t[1]).vol = 300000; const ind = k => g.sim.indicators(t[1]).list.find(x => x.k === k);
  ok(ind('Group Tanks').v === 2 && ind('Group Stock').v === 800000 && ind('Group Capacity').v === 8000000 && ind('Level').v === 300000, 'the panel shows the group (2 tanks, 800,000 / 8,000,000) and the tank\'s own level (300,000)'); }
process.exit(f ? 1 : 0);
