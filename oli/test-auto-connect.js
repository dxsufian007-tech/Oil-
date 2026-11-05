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
  // 8. default valves, flow in both directions (one at a time) and no oil created or lost
  ok(r.made.find(l => l.a.b === a.id).open !== false && r.made.find(l => l.a.b === b.id).open === false, 'by default the first line (A -> B) is open and the return line is built with its valve CLOSED');
  const sim = g.sim; sim.build();
  const sa = sim.ensure(a), sb = sim.ensure(b), capA = B.DEFS[a.d].capacity.value; sa.vol = capA * .8; sb.vol = 0; sa.prod = 'CRUDE'; sb.prod = 'CRUDE'; const tot0 = sa.vol + sb.vol; sim.run(3);
  const t1 = sim.ensure(a).vol + sim.ensure(b).vol;
  ok(Math.abs(t1 - tot0) < 1e-3 * tot0, 'oil is conserved while it moves A -> B (' + Math.round(tot0) + ' -> ' + Math.round(t1) + ': nothing created, nothing lost)');
  ok(sim.ensure(b).vol > 0.9 * capA * .8, 'oil really flowed A -> B: B holds ' + Math.round(sim.ensure(b).vol));
  const back = r.made.find(l => l.a.b === b.id), fwd = r.made.find(l => l.a.b === a.id); I.setLineOpen(g.net, back.id, true); I.setLineOpen(g.net, fwd.id, false); sim.build(); sim.ensure(a).vol = 0; sim.ensure(b).vol = capA * .8; sim.run(3);
  ok(sim.ensure(a).vol > 0.9 * capA * .8 && Math.abs(sim.ensure(a).vol + sim.ensure(b).vol - capA * .8) < 1e-3 * capA, 'and the other way, B -> A, once the return valve is opened: A holds ' + Math.round(sim.ensure(a).vol) + ', total unchanged');
}
{ // 2/3. tank <-> pump, pump <-> tank
  for (const order of [0, 1]) {
    const g = game(), t = put(g, 'crude_tank_s', 50, 50), p = put(g, 'pump_station_s', 58, 52), [first, second] = order ? [p, t] : [t, p], v = I.planConnect(g.store, g.net, g.ts, first.id, second.id);
    const tl = v.lines.find(l => l.from === t.id), pl = v.lines.find(l => l.from === p.id);      // Stage 5-6: a pump pushes one way, so it gets ONE line (no meaningless return into its own feed)
    ok(v.ok && v.lines.length === 1 && (order ? (pl && pl.a.port === 'OUTPUT' && roleOf(t, pl.b.port) === 'in') : (tl && roleOf(t, tl.a.port) === 'out' && tl.b.port === 'INPUT')), (order ? 'pump -> tank' : 'tank -> pump') + ': ONE line, from the sender to the receiver (pump is one-way)');
    ok(v.lines.every(l => l.dia === Math.max(I.autoDia(B.DEFS[p.d]), I.autoDia(B.DEFS[t.d]))), 'the pipe diameter is chosen automatically from the larger end (' + v.lines.map(l => l.dia).join('/') + ')');
  }
}
{ // 4. tank <-> refinery
  const g = game(), t = put(g, 'crude_tank_s', 50, 50), rf = put(g, 'refinery_s', 62, 50), v = I.planConnect(g.store, g.net, g.ts, t.id, rf.id);
  ok(v.ok && v.lines.length === 1 && v.lines[0].a.b === t.id && v.lines[0].b.port === 'CRUDE_IN', 'tank <-> refinery: the crude goes to CRUDE_IN');
  ok(v.notes.some(x => x.reason === 'oneWay' && x.from === rf.id), 'the return direction is reported as a natural one-way (a refinery product cannot enter a crude tank), not hidden');
  const r = I.layConnect(g.store, g.net, g.ts, t.id, rf.id); ok(r.ok && g.net.lines.size === 1, 'it is built as one line');
}
{ // 5. an incomplete connection is never adopted silently (all INPUT ports of A are already used, so B -> A cannot be built)
  const g = game(), a = put(g, 'crude_tank_s', 50, 50), t = put(g, 'crude_tank_s', 62, 52), ins = I.portsOf(a).filter(q => I.canTake(q)); let k = 0;
  for (const q of ins) g.net.lay({ a: { b: 900 + k, port: 'OUTPUT' }, b: { b: a.id, port: q.id }, path: [[40 + k, 40], [41 + k, 40], [42 + k, 40]], product: 'CRUDE', dia: 16 }), k++;
  const v = I.planConnect(g.store, g.net, g.ts, a.id, t.id);
  ok(!v.ok && v.state === 'INCOMPLETE' && v.partial && v.problems.length === 1 && v.problems[0].reason === 'portTaken' && v.lines.length === 1 && v.cost > 0, 'tank <-> tank when every INPUT of A is used: INCOMPLETE, the problem is named (portTaken) and the cost of what is possible is shown: ' + v.cost);
  const n0 = g.net.lines.size, r = I.layConnect(g.store, g.net, g.ts, a.id, t.id); ok(!r.ok && g.net.lines.size === n0, 'layConnect refuses it and builds nothing');
  const r2 = I.layConnect(g.store, g.net, g.ts, a.id, t.id, { allowOneWay: true }); ok(r2.ok && g.net.lines.size === n0 + 1, 'only when the player explicitly chooses "build what is possible" is the one line built');
}
{ // 5b. pump whose input is used: the connection to the next building uses its free OUTPUT (one line, complete)
  const g = game(), w = put(g, 'oil_well', 40, 50), p = put(g, 'pump_station_s', 46, 50), t = put(g, 'crude_tank_s', 56, 52); I.layConnect(g.store, g.net, g.ts, w.id, p.id);
  const v = I.planConnect(g.store, g.net, g.ts, p.id, t.id); ok(v.ok && v.lines.length === 1 && v.lines[0].from === p.id, 'pump with a used input -> tank: one complete line from the pump OUTPUT');
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
  ok(Math.abs(tot - tot2) < 1e-3 * tot && ts.slice(2).every(t => g.sim.ensure(t).vol > 1), 'the oil travels along the open lines to the tanks at the end of the network and the total never changes (' + Math.round(tot) + ' -> ' + Math.round(tot2) + ': ' + ts.map(t => Math.round(g.sim.ensure(t).vol)).join(' / ') + ')');
}
{ // 9/10. save and load, and an old save
  const g = game(), a = put(g, 'crude_tank_s', 50, 50), b = put(g, 'crude_tank_s', 60, 54), r = I.layConnect(g.store, g.net, g.ts, a.id, b.id), j = JSON.parse(JSON.stringify(g.net.toJSON())), n2 = I.PipeNet.fromJSON(g.ts.W, j);
  ok(n2.lines.size === 2 && [...n2.lines.values()].every(L => L.conn === r.conn && L.a && L.b && L.path.length > 1) && n2.nextConn > r.conn, 'saved and reloaded: both lines, their connection id and the id counter are back');
  const old = JSON.parse(JSON.stringify(j)); for (const L of old.lines) delete L.conn; delete old.nc; const n3 = I.PipeNet.fromJSON(g.ts.W, old); ok(n3.lines.size === 2 && n3.nextConn >= 1, 'a save made before this stage (no connection ids) loads unchanged');
}
console.log('AUTO CONNECT TESTS PASSED (' + n + ' checks)');
// ---- part 3: a third tank joins an existing network by itself (branch)
{ const H2 = require('./test-reserve-helpers.js'), { game: game2, put: put2 } = H2, I2 = H2.I, B2 = H2.B;
  const g = game2(), a = put2(g, 'crude_tank_s', 50, 50), b = put2(g, 'crude_tank_s', 70, 50), c = put2(g, 'crude_tank_s', 60, 64); I2.layConnect(g.store, g.net, g.ts, a.id, b.id);
  const ab = [...g.net.lines.values()].sort((p, q) => q.path.length - p.path.length)[0], SN = () => JSON.stringify([...g.net.lines.values()].sort((p, q) => p.id - q.id).map(l => [l.id, l.a, l.b, l.path, l.conn, l.dia])), snap = SN(), cash0 = g.store.cash, nb0 = g.store.list().length, nid0 = g.net.nextId, sid0 = g.store.nextId;
  const pl = I2.branchTo(g.store, g.net, g.ts, c.id, { line: ab.id }, { commit: false });
  ok(pl.ok && pl.lines.length === 2 && pl.junctionCost > 0 && pl.cost > pl.junctionCost, 'branch preview: a junction + two lines, one total shown (junction ' + pl.junctionCost + ', total ' + pl.cost + ')');
  ok(SN() === snap && [...g.net.lines.keys()].every(k => g.net.lines.get(k).id === k) && g.store.cash === cash0 && g.store.list().length === nb0 && g.net.nextId === nid0 && g.store.nextId === sid0, 'the preview leaves the network, the buildings, the ids and the cash exactly as they were');
  const r = I2.branchTo(g.store, g.net, g.ts, c.id, { line: ab.id });
  ok(r.ok && g.store.list().filter(x => x.d === 'junction').length === 2 && Math.abs(cash0 - g.store.cash - pl.cost) < 1e-6, 'branch built: one junction on each of the two lines of the connection, and the cash charged is exactly the previewed total');
  ok(g.net.lines.size === 6 && [...g.net.lines.values()].every(l => l.a && l.b), 'the two old lines are split in two each + the two branch lines = 6 lines, every one with both ends');
  const used = new Map(); let clash = false; for (const L of g.net.lines.values()) for (const e of [L.a, L.b]) { const k = e.b + ':' + e.port; if (used.has(k)) clash = true; used.set(k, 1); } ok(!clash, 'no port is used twice after the branch');
  const dup = I2.branchTo(g.store, g.net, g.ts, c.id, { building: a.id }, { commit: false }); ok(dup.ok !== undefined, 'a branch plus a direct connection can both be planned (no crash)');
  g.sim.build(); for (const t of [a, b, c]) { g.sim.ensure(t).prod = 'CRUDE'; } g.sim.ensure(a).vol = B2.DEFS[a.d].capacity.value * .9; const tot = [a, b, c].reduce((q, t) => q + g.sim.ensure(t).vol, 0); g.sim.run(30); const tot2 = [a, b, c].reduce((q, t) => q + g.sim.ensure(t).vol, 0);
  ok(Math.abs(tot - tot2) < 1e-3 * tot && g.sim.ensure(c).vol > 1, 'through the branch oil reaches the third tank (' + Math.round(g.sim.ensure(c).vol) + '), and the total is unchanged (' + Math.round(tot) + ' -> ' + Math.round(tot2) + ')');
  const nj = I2.PipeNet.fromJSON(g.ts.W, JSON.parse(JSON.stringify(g.net.toJSON()))); ok(nj.lines.size === g.net.lines.size, 'the branched network survives save and load');
  const g3 = game2(), a3 = put2(g3, 'crude_tank_s', 50, 50), b3 = put2(g3, 'crude_tank_s', 70, 50), c3 = put2(g3, 'crude_tank_s', 60, 64); I2.layConnect(g3.store, g3.net, g3.ts, a3.id, b3.id); g3.store.cash = 100;
  const poor = I2.branchTo(g3.store, g3.net, g3.ts, c3.id, { line: [...g3.net.lines.values()][0].id }); ok(!poor.ok && poor.reason === 'cash' && g3.net.lines.size === 2 && g3.store.list().filter(x => x.d === 'junction').length === 0 && g3.store.cash === 100, 'branch without enough cash: refused, the total is shown, nothing built');
  const self = I2.branchTo(g.store, g.net, g.ts, a.id, { line: ab.id }); ok(!self.ok, 'a building cannot be branched onto a line it already ends');
  const th = put2(g, 'crude_tank_s', 80, 64), tb = I2.layConnect(g.store, g.net, g.ts, th.id, c.id); ok(tb.ok, 'a fourth tank connects directly to the third (building target)');
}
// ---- part 5: control after connecting: a valve per line
{ const H3 = require('./test-reserve-helpers.js'), { game: game3, put: put3 } = H3, I3 = H3.I, B3 = H3.B;
  const g = game3(), a = put3(g, 'crude_tank_s', 50, 50), b = put3(g, 'crude_tank_s', 60, 54), r = I3.layConnect(g.store, g.net, g.ts, a.id, b.id), [l1, l2] = r.made, cap = B3.DEFS[a.d].capacity.value;
  const prep = (va, vb) => { g.sim.build(); const x = g.sim.ensure(a), y = g.sim.ensure(b); x.vol = va; y.vol = vb; x.prod = y.prod = 'CRUDE'; };
  ok(I3.partnerOf(g.net, l1) === l2 && I3.partnerOf(g.net, l2) === l1, 'each line knows its partner line');
  I3.setLineOpen(g.net, l2.id, true); ok(l1.open !== false && l2.open !== false, 'both valves can be opened (they are independent)');
  I3.setLineOpen(g.net, l1.id, false); ok(l1.open === false && l2.open !== false, 'closing one line leaves the other open');
  prep(cap * .8, 0); g.sim.run(3); ok(g.sim.ensure(b).vol < 1, 'with the A -> B line closed, nothing flows A -> B (' + Math.round(g.sim.ensure(b).vol) + ')');
  prep(0, cap * .8); g.sim.run(3); ok(g.sim.ensure(a).vol > 1, 'but the B -> A line, with its own valve open, still carries oil (' + Math.round(g.sim.ensure(a).vol) + ')');
  I3.setLineOpen(g.net, l2.id, false); prep(0, cap * .8); g.sim.run(3); ok(g.sim.ensure(a).vol < 1, 'with both closed nothing moves at all (both valves are independent)');
  I3.setLineOpen(g.net, l1.id, true); I3.setLineOpen(g.net, l2.id, true); prep(cap * .8, 0); g.sim.run(3); ok(g.sim.ensure(b).vol > 1, 'reopened: oil flows again');
  I3.setLineOpen(g.net, l1.id, false); const j = JSON.parse(JSON.stringify(g.net.toJSON())), n2 = I3.PipeNet.fromJSON(g.ts.W, j); ok([...n2.lines.values()].filter(l => l.open === false).length === 1 && n2.lines.size === 2, 'a closed valve is saved and comes back closed (the other line is still open)');
  const cash0 = g.store.cash, rm = I3.removeConnection(g.store, g.net, l1.id, false); ok(rm.ok && g.net.lines.size === 0 && Math.abs(g.store.cash - cash0 - r.cost / 2) < 1, 'deleting the connection removes both lines and gives half the price back (' + rm.refund + ')');
  const again = I3.layConnect(g.store, g.net, g.ts, a.id, b.id); ok(again.ok && g.net.lines.size === 2, 'and the connection can be created again from scratch');
}
console.log('AUTO CONNECT + BRANCH + CONTROL TESTS PASSED (' + n + ' checks)');
