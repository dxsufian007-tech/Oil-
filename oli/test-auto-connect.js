// Stage 5 / part 2: AUTOMATIC CONNECTION - two buildings in, a complete two-line connection out (ports, route, corners, cost) built with the existing PipeNet / route / planPipe.   node test-auto-connect.js
const H = require('./test-reserve-helpers.js'), { B, I, game, put } = H, assert = require('assert');
let n = 0; const ok = (c, m, x) => { if (!c) console.log('  FAIL ' + m + (x ? ' ' + JSON.stringify(x) : '')); assert(c, m); n++; console.log('  ok  ' + m); };
const roleOf = (b, id) => B.worldPoints(b).find(p => p.id === id).role;
const noOverlap = (l1, l2) => { const s = new Set(l1.path.map(t => t.join(','))); return !l2.path.some(t => s.has(t.join(','))); };
const contiguous = L => L.path.every((t, i) => i === 0 || Math.abs(t[0] - L.path[i - 1][0]) + Math.abs(t[1] - L.path[i - 1][1]) === 1);

{ // 1. tank <-> tank
  const g = game(), a = put(g, 'crude_tank_s', 50, 50), b = put(g, 'crude_tank_s', 60, 54), n0 = g.net.lines.size, id0 = g.net.nextId, rev0 = g.net.rev, cash0 = g.store.cash;
  const v = I.planConnect(g.store, g.net, g.ts, a.id, b.id);
  ok(v.ok && v.state === 'VALID' && v.lines.length === 2, 'tank <-> tank: the plan has TWO lines and is valid');
  const ab = v.lines.find(l => l.dir === 'ab'), ba = v.lines.find(l => l.dir === 'ba');
  ok(roleOf(a, ab.a.port) === 'out' && roleOf(b, ab.b.port) === 'in' && ab.a.b === a.id && ab.b.b === b.id, 'line 1 goes from an OUTPUT of A to an INPUT of B (' + ab.a.port + ' -> ' + ab.b.port + ')');
  ok(roleOf(b, ba.a.port) === 'out' && roleOf(a, ba.b.port) === 'in' && ba.a.b === b.id && ba.b.b === a.id, 'line 2 goes from an OUTPUT of B to an INPUT of A (' + ba.a.port + ' -> ' + ba.b.port + ')');
  ok(contiguous({ path: ab.path }) && contiguous({ path: ba.path }) && noOverlap(ab, ba), 'both routes are continuous and the two lines do not overlap');
  ok(Math.abs(v.cost - (ab.cost + ba.cost)) < 1e-6 && v.cost > 0, 'the cost is the sum of both lines and is shown before building: ' + v.cost);
  ok(g.net.lines.size === n0 && g.net.nextId === id0 && g.net.rev === rev0 && g.store.cash === cash0, 'planning builds nothing and changes nothing (no lines, no ids, no cash)');
  const r = I.layConnect(g.store, g.net, g.ts, a.id, b.id);
  ok(r.ok && r.made.length === 2 && g.net.lines.size === n0 + 2 && Math.abs(cash0 - g.store.cash - v.cost) < 1e-6, 'layConnect builds both lines and charges exactly the planned cost');
  ok(r.made[0].conn && r.made[0].conn === r.made[1].conn, 'the two lines share one connection id');
  const again = I.planConnect(g.store, g.net, g.ts, a.id, b.id);
  ok(!again.ok && again.reason === 'alreadyConnected', 'connecting the same two buildings again is refused (no duplicate): ' + again.reason);
  // 8. flow in both directions + no oil created or lost
  const sim = g.sim; sim.build();
  const sa = sim.ensure(a), sb = sim.ensure(b), capA = B.DEFS[a.d].capacity.value; sa.vol = capA * .8; sb.vol = 0; sa.prod = 'CRUDE'; sb.prod = 'CRUDE'; const tot0 = sa.vol + sb.vol; sim.run(3);
  const t1 = sim.ensure(a).vol + sim.ensure(b).vol;
  ok(Math.abs(t1 - tot0) < 1e-3 * tot0, 'oil is conserved while it moves A -> B (' + Math.round(tot0) + ' -> ' + Math.round(t1) + ': nothing created, nothing lost)');
  ok(sim.ensure(b).vol > 1, 'oil really flowed A -> B: B holds ' + Math.round(sim.ensure(b).vol));
  const g2 = game(), a2 = put(g2, 'crude_tank_s', 50, 50), b2 = put(g2, 'crude_tank_s', 60, 54); I.layConnect(g2.store, g2.net, g2.ts, a2.id, b2.id); g2.sim.build(); const x = g2.sim.ensure(a2), y = g2.sim.ensure(b2); x.vol = 0; y.vol = capA * .8; x.prod = y.prod = 'CRUDE'; g2.sim.run(3);
  ok(g2.sim.ensure(a2).vol > 1 && Math.abs(g2.sim.ensure(a2).vol + g2.sim.ensure(b2).vol - capA * .8) < 1e-3 * capA, 'and the other way, B -> A: A holds ' + Math.round(g2.sim.ensure(a2).vol) + ' and the total is unchanged');
}
{ // 2/3. tank <-> pump, pump <-> tank
  for (const order of [0, 1]) {
    const g = game(), t = put(g, 'crude_tank_s', 50, 50), p = put(g, 'pump_station_s', 58, 52), [first, second] = order ? [p, t] : [t, p], v = I.planConnect(g.store, g.net, g.ts, first.id, second.id);
    const tl = v.lines.find(l => l.from === t.id), pl = v.lines.find(l => l.from === p.id);
    ok(v.ok && v.lines.length === 2 && tl && pl && roleOf(t, tl.a.port) === 'out' && tl.b.port === 'INPUT' && pl.a.port === 'OUTPUT' && roleOf(t, pl.b.port) === 'in', (order ? 'pump <-> tank' : 'tank <-> pump') + ': the tank output goes to the pump INPUT and the pump OUTPUT comes back to a tank input');
    ok(v.lines.every(l => l.dia === I.autoDia(B.DEFS[l.from === p.id ? p.d : t.d])), 'the pipe diameter is chosen automatically from the sender (' + v.lines.map(l => l.dia).join('/') + ')');
  }
}
{ // 4. tank <-> refinery
  const g = game(), t = put(g, 'crude_tank_s', 50, 50), rf = put(g, 'refinery_s', 62, 50), v = I.planConnect(g.store, g.net, g.ts, t.id, rf.id);
  ok(v.ok && v.lines.length === 1 && v.lines[0].a.b === t.id && v.lines[0].b.port === 'CRUDE_IN', 'tank <-> refinery: the crude goes to CRUDE_IN');
  ok(v.notes.some(x => x.reason === 'oneWay' && x.from === rf.id), 'the return direction is reported as a natural one-way (a refinery product cannot enter a crude tank), not hidden');
  const r = I.layConnect(g.store, g.net, g.ts, t.id, rf.id); ok(r.ok && g.net.lines.size === 1, 'it is built as one line');
}
{ // 5. an incomplete connection is never adopted silently
  const g = game(), w = put(g, 'oil_well', 40, 50), p = put(g, 'pump_station_s', 46, 50), t = put(g, 'crude_tank_s', 56, 52); I.layConnect(g.store, g.net, g.ts, w.id, p.id);
  const v = I.planConnect(g.store, g.net, g.ts, p.id, t.id);
  ok(!v.ok && v.state === 'INCOMPLETE' && v.partial && v.problems.length === 1 && v.problems[0].reason === 'portTaken' && v.lines.length === 1 && v.cost > 0, 'pump <-> tank when the pump input is already used: INCOMPLETE, the problem is named (portTaken) and the cost of what is possible is shown: ' + v.cost);
  const n0 = g.net.lines.size, r = I.layConnect(g.store, g.net, g.ts, p.id, t.id); ok(!r.ok && g.net.lines.size === n0, 'layConnect refuses it and builds nothing');
  const r2 = I.layConnect(g.store, g.net, g.ts, p.id, t.id, { allowOneWay: true }); ok(r2.ok && g.net.lines.size === n0 + 1, 'only when the player explicitly chooses "build what is possible" is the one line built');
}
{ // 6. cash
  const g = game(), a = put(g, 'crude_tank_s', 50, 50), b = put(g, 'crude_tank_s', 70, 54); g.store.cash = 10; const v = I.planConnect(g.store, g.net, g.ts, a.id, b.id), r = I.layConnect(g.store, g.net, g.ts, a.id, b.id);
  ok(!v.ok && v.state === 'UNAFFORDABLE' && v.reason === 'cash' && v.cost > 10 && r.state === 'UNAFFORDABLE' && g.net.lines.size === 0 && g.store.cash === 10, 'insufficient cash: UNAFFORDABLE, the cost is shown, nothing is built or charged');
}
{ // blocked: the target is walled in
  const g = game(), a = put(g, 'crude_tank_s', 50, 50), b = put(g, 'crude_tank_s', 60, 50); for (let y = 40; y <= 70; y++) for (const x of [55, 56]) if (!g.store.at(x, y)) g.store.place('valve', x, y, 0, { instant: true });
  const v = I.planConnect(g.store, g.net, g.ts, a.id, b.id, { margin: 4 }); ok(!v.ok && v.lines.length === 0 && v.reason === 'noRoute', 'a wall of buildings with no way round: no route, reason named (' + v.reason + ')');
}
{ // 7. several tanks on one network
  const g = game(), ts = [put(g, 'crude_tank_s', 50, 50), put(g, 'crude_tank_s', 60, 50), put(g, 'crude_tank_s', 55, 60), put(g, 'crude_tank_s', 66, 58)];
  const pairs = [[0, 1], [1, 2], [1, 3], [0, 2]]; let all = true; for (const [i, j] of pairs) { const r = I.layConnect(g.store, g.net, g.ts, ts[i].id, ts[j].id); if (!r.ok) { all = false; console.log('   pair', i, j, r.reason, JSON.stringify(r.problems)); } }
  ok(all && g.net.lines.size === 8, 'four tanks, four connections: 8 independent lines, none refused (' + g.net.lines.size + ')');
  const used = new Map(); let clash = false; for (const L of g.net.lines.values()) for (const e of [L.a, L.b]) { const k = e.b + ':' + e.port; if (used.has(k)) clash = true; used.set(k, 1); } ok(!clash, 'no port is used twice');
  const tiles = new Set(); let overlap = false; for (const L of g.net.lines.values()) for (const t of L.path) { const k = t.join(','); if (tiles.has(k)) overlap = true; tiles.add(k); } ok(!overlap, 'no two lines share a tile');
  g.sim.build(); const s = g.sim.ensure(ts[0]); s.vol = B.DEFS[ts[0].d].capacity.value * .9; s.prod = 'CRUDE'; for (const t of ts) g.sim.ensure(t).prod = 'CRUDE'; const tot = ts.reduce((q, t) => q + g.sim.ensure(t).vol, 0); g.sim.run(20); const tot2 = ts.reduce((q, t) => q + g.sim.ensure(t).vol, 0);
  ok(Math.abs(tot - tot2) < 1e-3 * tot && ts.slice(1).every(t => g.sim.ensure(t).vol > 1), 'the oil spreads to all other tanks and the total never changes (' + Math.round(tot) + ' -> ' + Math.round(tot2) + ')');
}
{ // 9/10. save and load, and an old save
  const g = game(), a = put(g, 'crude_tank_s', 50, 50), b = put(g, 'crude_tank_s', 60, 54), r = I.layConnect(g.store, g.net, g.ts, a.id, b.id), j = JSON.parse(JSON.stringify(g.net.toJSON())), n2 = I.PipeNet.fromJSON(g.ts.W, j);
  ok(n2.lines.size === 2 && [...n2.lines.values()].every(L => L.conn === r.conn && L.a && L.b && L.path.length > 1) && n2.nextConn > r.conn, 'saved and reloaded: both lines, their connection id and the id counter are back');
  const old = JSON.parse(JSON.stringify(j)); for (const L of old.lines) delete L.conn; delete old.nc; const n3 = I.PipeNet.fromJSON(g.ts.W, old); ok(n3.lines.size === 2 && n3.nextConn >= 1, 'a save made before this stage (no connection ids) loads unchanged');
}
console.log('AUTO CONNECT TESTS PASSED (' + n + ' checks)');
