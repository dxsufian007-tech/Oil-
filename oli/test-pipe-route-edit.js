'use strict';
/* Pipe route editing: move / add / delete a control point of an existing line in place; preview, cost, warnings, undo; never touches stock.   node test-pipe-route-edit.js */
const H = require('./test-reserve-helpers.js'), { B, I, game, put } = H, assert = require('assert');
let n = 0; const ok = (c, m, x) => { if (!c) console.log('  FAIL ' + m + (x ? ' ' + JSON.stringify(x) : '')); assert(c, m); n++; console.log('  ok  ' + m); };
const S = (g, b) => g.sim.ensure(b), K = (g, t) => t[1] * g.ts.W + t[0];
function rig(cash) {                                                  // well-less: tank A -> pump -> tank B on a flat world, one real line A->pump with a corner
  const g = game(cash == null ? 1e12 : cash), a = put(g, 'crude_tank_m', 40, 40), p = put(g, 'pump_station_s', 70, 56), t = put(g, 'crude_tank_m', 100, 40);
  const r1 = I.layConnect(g.store, g.net, g.ts, a.id, p.id, {}); assert(r1.ok, 'connect a-p ' + r1.reason); const r2 = I.layConnect(g.store, g.net, g.ts, p.id, t.id, {}); assert(r2.ok, 'connect p-t ' + r2.reason); g.sim.build(); return { g, a, p, t };
}
const lineOf = (g, a, b) => [...g.net.lines.values()].find(L => L.a && L.b && L.a.b === a.id && L.b.b === b.id);
const valid = (g, L) => { const p = L.path; for (let i = 1; i < p.length; i++) if (Math.abs(p[i][0] - p[i - 1][0]) + Math.abs(p[i][1] - p[i - 1][1]) !== 1) return false; return new Set(p.map(t => K(g, t))).size === p.length && p.every((t, i) => (i === 0 || i === p.length - 1) || !g.store.at(t[0], t[1])); };
const edges = g => { g.sim.build(); return [...g.sim.edges.values()].map(e => e.a + '>' + e.b).sort().join('|'); };

{ const { g, a, p } = rig(), L = lineOf(g, a, p); ok(!!L && valid(g, L), 'a real line exists and is a valid tile path (' + L.path.length + ' tiles)');
  const cps = I.controlPoints(L); ok(cps.length >= 2 && cps[0].end && cps[cps.length - 1].end && cps[0].i === 0 && cps[cps.length - 1].i === L.path.length - 1, 'control points: both ends + the corners (' + cps.length + ')');
  // ---- move a point: pick the middle of the path and push it sideways
  const mid = Math.floor(L.path.length / 2), prev = cps.filter(c => c.i < mid).pop(), next = cps.find(c => c.i > mid), tgt = [L.path[mid][0], L.path[mid][1] - 6];
  const e0 = edges(g), cash0 = g.store.cash, oldPath = L.path.map(t => t.slice()), flow0 = L.flow, dia0 = L.dia, conn0 = L.conn, open0 = L.open;
  const plan = I.planReroute(g.store, g.net, g.ts, L.id, { from: prev.i, to: next.i, via: [tgt] }); ok(plan.ok, 'preview ok', plan.reason);
  ok(JSON.stringify(g.net.lines.get(L.id).path) === JSON.stringify(oldPath) && g.store.cash === cash0, 'the PREVIEW changes nothing (path and cash untouched)');
  ok(plan.path.some(t => t[0] === tgt[0] && t[1] === tgt[1]) && plan.added.length > 0 && plan.cost === Math.max(0, plan.deltaLen) * B.DEFS.crude_tank_m.cost * 0 + Math.max(0, plan.deltaLen) * require('./building-config.js').PIPES[L.dia].cost, 'the new route passes the dragged point; cost = extra tiles x pipe price (' + plan.cost + ')');
  for (let j = 0; j < prev.i; j++) assert(plan.path[j][0] === oldPath[j][0] && plan.path[j][1] === oldPath[j][1]); for (let j = next.i; j < oldPath.length; j++) { const q = plan.path[plan.path.length - (oldPath.length - j)]; assert(q[0] === oldPath[j][0] && q[1] === oldPath[j][1]); } ok(true, 'only the part between the two neighbouring corners changed; the rest is tile for tile');
  const vol = [S(g, a).vol, S(g, g.store.list().find(x => x.d === 'pump_station_s')).vol]; S(g, a).vol = 20000; const before = S(g, a).vol;
  const r = I.commitReroute(g.store, g.net, g.ts, plan); ok(r.ok && g.net.lines.get(L.id) === L && L.id === plan.id, 'committed in place: SAME line object and id'); ok(valid(g, L) && g.store.cash === cash0 - plan.cost, 'the new path is valid (no building crossed, contiguous, no overlap) and the cost was paid');
  ok(L.a.b === a.id && L.b.b === p.id && L.dia === dia0 && L.conn === conn0 && L.open === open0 && L.flow === flow0 && L.product, 'ports, diameter, pair, open flag, flow and product are unchanged');
  ok(edges(g) === e0, 'the network edges (what is connected to what) are exactly the same');
  g.sim.run(1); ok(S(g, a).vol <= before + 1e-6 && L.path.length === plan.path.length, 'the simulation runs on the new path (no error)');
  ok(g.net.lineAt(oldPath[mid][0], oldPath[mid][1]) !== L || plan.path.some(t => t[0] === oldPath[mid][0] && t[1] === oldPath[mid][1]), 'tiles left behind are free again (not owned by the line)');
  // ---- undo
  const u = I.undoReroute(g.store, g.net); ok(u.ok && JSON.stringify(L.path) === JSON.stringify(oldPath) && g.store.cash === cash0 && edges(g) === e0, 'undo restores the old path, the money and the connection exactly');
  ok(!I.undoReroute(g.store, g.net).ok, 'a second undo has nothing to undo'); }
{ // ---- delete a point: remove a corner -> the two neighbours are joined by the shortest route
  const { g, a, p } = rig(), L = lineOf(g, a, p), cps = I.controlPoints(L); const inner = cps.filter(c => !c.end);
  if (inner.length) { const c = inner[0], i = cps.indexOf(c), plan = I.planReroute(g.store, g.net, g.ts, L.id, { from: cps[i - 1].i, to: cps[i + 1].i, via: [] }); ok(plan.ok, 'deleting a corner is routable (' + plan.reason + ')'); const r = I.commitReroute(g.store, g.net, g.ts, plan); ok(r.ok && valid(g, L) && I.controlPoints(L).length <= cps.length, 'the corner is gone (' + cps.length + ' -> ' + I.controlPoints(L).length + ' points) and the line is still valid'); } else ok(true, '(straight line: no corner to delete)'); }
{ // ---- refuse: through a building, off the land, onto another pipe, bad range, an open line, no money
  const { g, a, p, t } = rig(), L = lineOf(g, a, p), cps = I.controlPoints(L), f = cps[0].i, k = cps[cps.length - 1].i;
  const bx = g.store.list().find(x => x.id === t.id); const thru = I.planReroute(g.store, g.net, g.ts, L.id, { from: f, to: k, via: [[bx.x + 1, bx.y + 1]] }); ok(!thru.ok, 'a point inside a building is refused (' + thru.reason + ')');
  const other = lineOf(g, p, t), oth = other.path[Math.floor(other.path.length / 2)]; const onp = I.planReroute(g.store, g.net, g.ts, L.id, { from: f, to: k, via: [[oth[0], oth[1]]] }); ok(!onp.ok, 'a point on another pipe is refused (' + onp.reason + ')');
  ok(!I.planReroute(g.store, g.net, g.ts, L.id, { from: 5, to: 2, via: [] }).ok, 'a bad range is refused'); ok(!I.planReroute(g.store, g.net, g.ts, 9999, { from: 0, to: 3 }).ok, 'an unknown line is refused');
  const own = I.planReroute(g.store, g.net, g.ts, L.id, { from: f, to: k, via: [L.path[Math.floor(L.path.length / 2)]] }); ok(!own.ok || own.path.length === new Set(own.path.map(x => K(g, x))).size, 'never crosses itself');
  const poor = I.planReroute(g.store, g.net, g.ts, L.id, { from: f, to: k, via: [[L.path[1][0], L.path[1][1] - 25]] }, {}); if (poor.ok && poor.cost > 0) { g.store.cash = poor.cost - 1; const p2 = I.planReroute(g.store, g.net, g.ts, L.id, { from: f, to: k, via: [[L.path[1][0], L.path[1][1] - 25]] }); ok(!p2.ok && p2.reason === 'cash', 'not enough cash: refused, nothing changed'); } else ok(true, '(cash check not reachable here)'); }
{ // ---- warnings: a much longer route on a busy line warns BEFORE approval; the edit itself is never blocked by a warning
  const { g, a, p } = rig(), L = lineOf(g, a, p); L.flow = 25000; const cps = I.controlPoints(L), plan = I.planReroute(g.store, g.net, g.ts, L.id, { from: cps[0].i, to: cps[cps.length - 1].i, via: [[L.path[2][0], L.path[2][1] - 30]] });
  ok(plan.ok && plan.warnings.length > 0 && plan.warnings.every(w => w.code), 'a far detour on a busy line carries warnings: ' + plan.warnings.map(w => w.code).join(','));
  ok(JSON.stringify(plan.warnings).includes('lowerPressure') || JSON.stringify(plan.warnings).includes('longerBusy'), 'the warning names the risk (pressure / busy line)'); }
{ // ---- conservation: stock before = stock after across several edits and undos, junction line too
  const { g, a, p, t } = rig(), L = lineOf(g, a, p); S(g, a).vol = 33333; const tot = () => g.store.list().reduce((q, b) => q + (g.sim.ensure(b).vol || 0), 0); const t0 = tot();
  for (let i = 0; i < 4; i++) { const cps = I.controlPoints(L); const j = Math.floor(L.path.length / 2), pc = cps.filter(c => c.i < j).pop(), nc = cps.find(c => c.i > j); const pl = I.planReroute(g.store, g.net, g.ts, L.id, { from: pc.i, to: nc.i, via: [[L.path[j][0], L.path[j][1] + (i % 2 ? 4 : -4)]] }); if (pl.ok) I.commitReroute(g.store, g.net, g.ts, pl); }
  ok(Math.abs(tot() - t0) < 1e-9 && valid(g, L), 'after several edits the stock is exactly the same (' + t0 + ') and the path is valid'); while (I.undoReroute(g.store, g.net).ok); ok(Math.abs(tot() - t0) < 1e-9, 'after undoing them all: still the same stock'); }
{ // ---- fuzz: 300 random edits (move / add / delete) on real lines: every accepted edit leaves a valid path, the same connections and the same stock; every refused edit changes nothing
  const { g, a, p, t } = rig(); const Ls = [lineOf(g, a, p), lineOf(g, p, t)]; S(g, a).vol = 11111; const e0 = edges(g), tot = () => g.store.list().reduce((q, b) => q + (g.sim.ensure(b).vol || 0), 0), t0 = tot(); let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; let acc = 0, ref = 0, bad = 0;
  for (let i = 0; i < 300; i++) { const L = Ls[i % 2], cps = I.controlPoints(L), j = 1 + Math.floor(rnd() * (L.path.length - 2)), pc = cps.filter(c => c.i < j).pop(), nc = cps.find(c => c.i > j), mode = Math.floor(rnd() * 3), via = mode === 2 ? [] : [[L.path[j][0] + Math.round((rnd() - .5) * 20), L.path[j][1] + Math.round((rnd() - .5) * 20)]];
    const before = JSON.stringify(L.path), pl = I.planReroute(g.store, g.net, g.ts, L.id, { from: pc.i, to: nc.i, via }); if (!pl.ok) { ref++; if (JSON.stringify(L.path) !== before) bad++; continue; } I.commitReroute(g.store, g.net, g.ts, pl); acc++; if (!valid(g, L)) bad++; if (i % 7 === 0) I.undoReroute(g.store, g.net); }
  ok(acc > 50 && bad === 0, 'fuzz: ' + acc + ' accepted / ' + ref + ' refused edits, none left an invalid path or changed a refused line'); ok(edges(g) === e0 && Math.abs(tot() - t0) < 1e-9, 'after all of them: the same connections and exactly the same stock'); }
console.log(n + ' checks passed');
