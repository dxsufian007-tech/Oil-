// Phase 16 (6/20): network graph, branches, smart junctions. Core only. Every scenario is validated (validateNetwork includes the graph checks) after every change.
const assert = require('assert');
const { Game: G, CFG, idx } = require('./core.js');
CFG.TERRAIN.MULT = [1, 1, 1, 1]; CFG.REGIONS.forEach(r => { r.mult = 1; });
CFG.PIPE.LEAK_PER_TILE_MIN = 0; CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
const W = CFG.GRID_COLS;
const ok = m => console.log('  ok  ' + m);
const run = (g, sec, dt) => { dt = dt || 0.1; for (let i = 0; i < Math.round(sec / dt); i++) g.step(dt); };
const valid = (g, what) => { const p = g.validateNetwork(); assert.deepStrictEqual(p, [], what + ': ' + p.slice(0, 4).join(' | ')); };
function mk(seed) {
  const h = new G({ seed: seed || 7 }); h.s.cash = 1e8; h.s.regions.forEach(r => { r.unlocked = true; });
  for (const a of h.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
  for (let y = 24; y < 64; y++) for (let x = 30; x < 80; x++) { const k = idx(x, y); h.map.block[k] = 0; h.map.water[k] = 0; }
  return h;
}
const X = 40, Y = 40;
const route = (h, a, b, c, d, flip) => { const r = h.routePipe(a, b, c, d, !!flip); assert(r.ok, 'route ' + [a, b, c, d] + ' ' + r.reason); assert(h.buildRoute(r).ok); valid(h, 'after route ' + [a, b, c, d]); return r; };
const node = (h, x, y) => h.graphNode(idx(x, y));
const snap = h => JSON.stringify(h.graphSnapshot());
// the standard scene: well - main pipe - tank A, with room for a branch from the middle (X+6, Y) down to tank B and up to tank C
function scene(opt) {
  opt = opt || {}; const h = mk(), well = h.place('well', X, Y, 'large').building, A = h.place('tank', X + 12, Y).building;
  route(h, X + 1, Y, X + 11, Y); const o = { h, well, A };
  if (opt.B) { o.B = h.place('tank', X + 6, Y + 8).building; o.rb = route(h, X + 6, Y, X + 6, Y + 7); }
  if (opt.C) { o.C = h.place('tank', X + 6, Y - 8).building; o.rc = route(h, X + 6, Y, X + 6, Y - 6); }
  return o;
}
const tanks = h => h.buildings.filter(b => b.type === 'tank');

{ // 1. Well -> Pipe -> Tank : nodes, one segment, real flow
  const { h, well, A } = scene(); run(h, 30); valid(h, 'running');
  const s = h.graphSnapshot(); assert.deepStrictEqual(s.nodes.map(n => n.id).sort(), ['T' + A.id, 'W' + well.id]); assert.strictEqual(s.edges.length, 1); assert.strictEqual(s.edges[0].len, 11); assert.strictEqual(s.junctions, 0);
  assert(well.q > 1 && A.amt > 2, 'oil arrives: ' + [well.q, A.amt]);
  ok('TEST 1: well -> pipe -> tank: graph = 2 nodes (W' + well.id + ', T' + A.id + ') + 1 segment of 11 pipe tiles, no junction; real flow ' + well.q.toFixed(1) + ' bbl/min, tank ' + A.amt.toFixed(1));
}
{ // 2/3. Well -> Main -> T-junction -> Tank A / Tank B
  const o = scene(); const { h, well, A } = o;
  const B = h.place('tank', X + 6, Y + 8).building;
  const r = h.routePipe(X + 6, Y, X + 6, Y + 7); assert(r.ok);
  const info = h.routeInfo(r);                                                       // the preview says what is going to happen BEFORE it is built
  assert.strictEqual(info.junctions.length, 1); assert.deepStrictEqual([info.junctions[0].x, info.junctions[0].y, info.junctions[0].from, info.junctions[0].to, info.junctions[0].isNew], [X + 6, Y, 2, 3, true]);
  assert.strictEqual(info.end.kind, 'tank'); assert.strictEqual(info.fresh, 7); assert.strictEqual(info.cost, r.cost);
  const before = snap(h); h.routePipe(X + 6, Y, X + 6, Y + 7); assert.strictEqual(snap(h), before, 'previews do not touch the graph');
  assert.strictEqual(node(h, X + 6, Y), null, 'no junction before it is built');
  h.buildRoute(r); valid(h, 'branch');
  const J = node(h, X + 6, Y); assert(J && J.kind === 'junction' && J.id === 'J' + idx(X + 6, Y)); assert.strictEqual(J.edges.length, 3);
  assert.strictEqual(h.net.routes.get(well.id).length, 2, 'the well reaches both tanks');
  run(h, 40); valid(h, 'running'); assert(A.amt > 5, 'tank A (nearer ... or cheaper) receives oil: ' + A.amt);
  ok('TEST 2: well -> main -> T-junction -> tank A: junction J' + idx(X + 6, Y) + ' made by joining the middle of the main pipe, 3 segments, preview announced it (from 2 links to 3), oil to tank A ' + A.amt.toFixed(1));
  // fill A: oil must go to B through the branch
  A.amt = h.tankCap(A) - 0.01; h.hyd.dirty = true; run(h, 60); valid(h, 'rerouted');
  assert(B.amt > 3, 'full tank A -> the oil takes the branch to tank B: ' + B.amt);
  assert.strictEqual(well.target, B.id);
  for (let y = Y + 1; y <= Y + 7; y++) assert(h.net.flowK[idx(X + 6, y)] > 0.5, 'flow along the whole branch at y=' + y);
  ok('TEST 3: well -> main -> T-junction -> tank B: with A full the real flow turns into the branch (' + B.amt.toFixed(1) + ' bbl in B), every tile of the branch carries oil');
}
{ // 4. one junction with 3 branches / 5. with 4 branches
  const o = scene({ B: true }); const { h } = o;
  let J = node(h, X + 6, Y); assert.strictEqual(J.edges.length, 3); assert.strictEqual(h.graphSnapshot().junctions, 1);
  ok('TEST 4: one junction with 3 branches (west to the well, east to tank A, south to tank B): 3 segments listed on the node');
  const C = h.place('tank', X + 6, Y - 8).building, r = h.routePipe(X + 6, Y, X + 6, Y - 6); assert(r.ok);
  const info = h.routeInfo(r); assert.deepStrictEqual([info.junctions[0].from, info.junctions[0].to, info.junctions[0].isNew], [3, 4, false], 'a 4th branch on an existing junction is announced as such');
  h.buildRoute(r); valid(h, 'four-way'); J = node(h, X + 6, Y); assert.strictEqual(J.edges.length, 4); assert.strictEqual(J.deg, 4); assert.strictEqual(h.graphSnapshot().junctions, 1, 'still ONE junction (no duplicate)');
  assert.strictEqual(h.net.routes.get(o.well.id).length, 3); run(h, 30); valid(h, 'running');
  ok('TEST 5: one junction with 4 branches (N, S, E, W): same node J' + J.id.slice(1) + ', 4 segments, well reaches 3 tanks; no duplicate junction');
}
{ // 6/7. pipe joined to the middle of an existing pipe: the existing pipe is split into two logical segments
  const { h } = scene(); const g0 = h.graphSnapshot(); assert.strictEqual(g0.edges.length, 1); const main0 = g0.edges[0];
  assert.strictEqual(main0.len, 11); h.place('tank', X + 6, Y + 8); route(h, X + 6, Y, X + 6, Y + 7);
  const g1 = h.graphSnapshot(), lens = g1.edges.map(e => e.len).sort((a, b) => a - b);
  assert.deepStrictEqual(lens, [5, 5, 7], 'main split 5 + 5 around the junction tile, branch 7 tiles between junction and tank: ' + lens);
  const tiles = new Set(); for (const e of h.net.graph.edges) for (const t of e.tiles) { assert(!tiles.has(t), 'a tile is in one segment only'); tiles.add(t); } tiles.add(idx(X + 6, Y));
  assert.strictEqual(tiles.size, h.pipeCount(), 'segments + junction cover every real pipe tile exactly once');
  for (let x = X + 1; x <= X + 11; x++) { const t = idx(x, Y); assert(tiles.has(t), 'main tile ' + x); }
  assert.strictEqual(h.net.graph.orphans.length, 0);
  ok('TEST 6: a pipe joined to the middle of the main pipe -> junction node; TEST 7: the main pipe became 2 logical segments (5 + 5 tiles) + the 7-tile branch, every pipe tile belongs to exactly one segment');
}
{ // 8. a visual crossing does NOT create a connection
  const { h, well } = scene({ B: false }); const a = h.place('well', X + 8, Y + 6, 'large').building; h.place('tank', X + 8, Y - 6);
  const pc = h.pipeCount(), v0 = h.netVersion;
  const cross = h.routePipe(X + 8, Y + 5, X + 8, Y - 4);                              // straight across the main pipe: the router goes AROUND it
  assert(cross.ok && cross.auto, 'detour: ' + cross.reason); assert(cross.cells.every(c => !h.pipe[idx(c[0], c[1])]), 'the detour does not step on any pipe'); assert.strictEqual(h.routeInfo(cross).junctions.length, 0, 'a detour makes no junction');
  assert.strictEqual(h.pipeCount(), pc); assert.strictEqual(h.netVersion, v0, 'nothing rebuilt by a preview'); valid(h, 'previewed detour');
  // a wall too long to go around is refused, never crossed
  const L = mk(); L.place('well', 31, 50, 'large'); L.place('tank', 77, 50); route(L, 32, 50, 76, 50); L.place('well', 50, 52); const pcL = L.pipeCount();
  const wall = L.routePipe(50, 51, 50, 48); assert(!wall.ok && (wall.reason === 'crossPipe' || wall.reason === 'noRoute'), 'refused: ' + wall.reason); assert.strictEqual(L.buildRoute(wall).ok, false); assert.strictEqual(L.pipeCount(), pcL); valid(L, 'wall');
  // two pipelines that only touch at a corner (diagonal) stay separate networks
  const w1 = h.place('well', X + 20, Y + 10, 'large').building, w2 = h.place('well', X + 26, Y + 11, 'large').building; h.place('tank', X + 24, Y + 14); h.place('tank', X + 24, Y + 6);
  route(h, X + 21, Y + 10, X + 23, Y + 10); route(h, X + 25, Y + 11, X + 24, Y + 11);
  const c1 = h.net.compOf[idx(X + 23, Y + 10)], c2 = h.net.compOf[idx(X + 24, Y + 11)]; assert(c1 >= 0 && c2 >= 0 && c1 !== c2, 'diagonal neighbours are two networks');
  assert.strictEqual(node(h, X + 23, Y + 10).kind, 'end'); assert.strictEqual(node(h, X + 24, Y + 11).kind, 'end');
  // a run beside another network is refused instead of linking it silently
  const beside = h.routePipe(X + 20, Y + 12, X + 22, Y + 11); assert(!beside.ok || !beside.cells.slice(1, -1).some(c => h.pipe[idx(c[0] + 1, c[1])]), 'no silent contact');
  ok('TEST 8: a route across a pipe goes AROUND it (no junction, nothing built by the preview) and across a wall too long to circle it is refused ("crossPipe": pipe crossing is not a junction); diagonal neighbours stay two separate networks (both pipe ends are end nodes)');
}
{ // 9. an intentional junction DOES connect: oil flows through it
  const { h, well, A } = scene({ B: true }); A.amt = h.tankCap(A); h.hyd.dirty = true; run(h, 40); valid(h, 'running');
  const cA = h.net.compOf[idx(X + 6, Y)], cB = h.net.compOf[idx(X + 6, Y + 5)]; assert.strictEqual(cA, cB, 'branch and main are one network'); assert(tanks(h).find(t => t !== A).amt > 2);
  ok('TEST 9: the intentional junction connects the networks (same component) and oil really flows through it');
}
{ // 10/11. delete one branch / the entire branch; a left-over junction simplifies itself
  const o = scene({ B: true }); const { h, well, A, B } = o; run(h, 20);
  const m0 = h.s.cash, br = h.branchOf(idx(X + 6, Y + 3)); assert.strictEqual(br.tiles.length, 7); assert.strictEqual(br.refund, 7 * Math.floor(CFG.COST.pipe * CFG.REFUND));
  const jr = h.removeBranch(X + 6, Y); assert.strictEqual(jr.ok, false); assert.strictEqual(jr.reason, 'junction'); assert.strictEqual(h.pipeCount(), 18, 'a junction is not removable as a branch');
  const r = h.removeBranch(X + 6, Y + 3); assert(r.ok); valid(h, 'branch removed'); assert.strictEqual(r.tiles, 7); assert.strictEqual(r.refund, br.refund); assert.strictEqual(h.s.cash - m0, br.refund);
  assert.deepStrictEqual(r.simplified, ['J' + idx(X + 6, Y)], 'the junction that was left with two links is gone'); assert.strictEqual(node(h, X + 6, Y), null);
  assert.strictEqual(h.graphSnapshot().edges.length, 1, 'the main pipe is ONE segment again'); assert.strictEqual(h.graphSnapshot().edges[0].len, 11);
  assert.strictEqual(h.net.routes.get(well.id).length, 1); run(h, 30); valid(h, 'after'); assert(A.amt > 3, 'tank A is still supplied'); assert.strictEqual(B.amt, 0);
  ok('TEST 10: the branch to tank B deleted in one operation (7 tiles, refund ' + r.refund + ' exact): the junction simplified itself, the main pipe is one segment, tank A keeps its supply');
  // a dead-end branch removed completely, including its end tile
  const o2 = scene({ B: true }); const h2 = o2.h; route(h2, X + 3, Y, X + 3, Y - 4); const n0 = h2.pipeCount(); assert.strictEqual(node(h2, X + 3, Y).kind, 'junction'); assert.strictEqual(node(h2, X + 3, Y - 4).kind, 'end');
  const r2 = h2.removeBranch(X + 3, Y - 2); assert(r2.ok); assert.strictEqual(r2.tiles, 4, 'the whole stub, from the junction to its end'); assert.strictEqual(h2.pipeCount(), n0 - 4); valid(h2, 'stub removed'); assert.strictEqual(node(h2, X + 3, Y), null);
  const r3 = h2.removeBranch(X + 6, Y + 4); assert(r3.ok); assert.strictEqual(node(h2, X + 6, Y), null, 'the second junction simplifies too'); valid(h2, 'both'); run(h2, 20); valid(h2, 'running');
  assert.strictEqual(h2.removeBranch(X + 30, Y + 30).ok, false);
  ok('TEST 11: an entire dead-end branch (4 tiles incl. its end) removed in one operation; a second branch after it; remaining network valid and running');
}
{ // 12. disconnect -> flow stops -> reconnect -> flow resumes (branch network)
  const { h, well, A, B } = scene({ B: true }); run(h, 30); const flow0 = well.q; assert(flow0 > 1);
  const cutK = idx(X + 3, Y); assert(h.removeAt(X + 3, Y).ok); valid(h, 'cut'); assert.strictEqual(h.net.routes.get(well.id).length, 0, 'cut between well and junction: nothing reachable');
  const at = tanks(h).reduce((s, t) => s + t.amt, 0); run(h, 20); valid(h, 'cut running'); assert(well.q < 0.05, 'flow stops: ' + well.q); assert(Math.abs(tanks(h).reduce((s, t) => s + t.amt, 0) - at) < 1e-6, 'no oil moves');
  assert.strictEqual(h.net.graph.edges.length, 4, 'the graph shows the two pieces: the well stub (well..end), then end..junction, junction..A, junction..B'); assert.notStrictEqual(h.net.graph.nodes.find(n => n.id === 'W' + well.id).comp, h.net.graph.nodes.find(n => n.id === 'J' + idx(X + 6, Y)).comp, 'two separate networks');
  route(h, X + 3, Y, X + 3, Y); valid(h, 'reconnected'); assert.strictEqual(h.net.routes.get(well.id).length, 2); run(h, 25); assert(well.q > 1, 'flow back: ' + well.q);
  ok('TEST 12: cut the main between well and junction -> 0 routes, flow ' + 0 + ', graph shows both pieces; one tile put back -> 2 routes, flow back to ' + well.q.toFixed(1));
}
{ // 13. multiple tanks, multiple wells
  const { h, well, A, B } = scene({ B: true }); const w2 = h.place('well', X + 9, Y + 6, 'large').building;                            // second well joins the main at a second junction
  const r = h.routePipe(X + 9, Y + 5, X + 9, Y + 1); assert(r.ok, r.reason); assert.strictEqual(h.routeInfo(r).junctions.length, 1, 'ending BESIDE the main pipe also makes the junction on it'); h.buildRoute(r);
  valid(h, 'two wells'); assert.strictEqual(h.graphSnapshot().junctions, 2); assert.strictEqual(h.net.routes.get(w2.id).length, 2, 'the second well reaches both tanks too');
  run(h, 60); valid(h, 'running'); assert(well.q > 1 && w2.q > 1, 'both wells produce'); const tot = A.amt + B.amt; assert(tot > 20, 'oil in the tanks ' + tot);
  ok('TEST 13+14: 2 wells x 2 tanks over 2 junctions: every well reaches every tank, both produce (' + well.q.toFixed(1) + ' + ' + w2.q.toFixed(1) + ' bbl/min), tanks hold ' + tot.toFixed(0));
}
{ // 15. well -> pipe -> pump -> pipe -> tank
  const { h, well, A } = scene(); const p = h.place('pump', X + 5, Y); assert(p.ok, p.reason); valid(h, 'pump placed'); const pn = h.net.graph.nodes.find(n => n.kind === 'pump'); assert(pn); assert.strictEqual(pn.edges.length, 2, 'a pump node has an input and an output segment');
  run(h, 40); valid(h, 'running'); assert(well.q > 1 && A.amt > 2); assert(p.building.used, 'the route goes through the pump');
  ok('TEST 15: well -> pipe -> pump -> pipe -> tank: pump is a node with 2 segments (in/out), on the real route, oil arrives (' + A.amt.toFixed(1) + ')');
}
{ // 16. pump in a branch; pressure only when it is really part of the path
  const { h, well, A, B } = scene({ B: true }); const p = h.place('pump', X + 6, Y + 4); assert(p.ok, p.reason); valid(h, 'pump in branch'); const pump = p.building;
  A.amt = h.tankCap(A); h.hyd.dirty = true; run(h, 60); valid(h, 'running'); assert(pump.used, 'with A full the route to B uses the pump'); assert(pump.boost > 0.05 && pump.flow > 1, 'the pump works in the branch: ' + [pump.boost, pump.flow]); assert(B.amt > 3);
  const bo = pump.boost, fl = pump.flow; pump.enabled = false; h.hyd.dirty = true; run(h, 5); assert(!(pump.boost > 0.05), 'a switched-off pump adds no pressure: ' + pump.boost);
  ok('TEST 16: well -> main -> junction -> tank A + pump -> tank B: the pump (in the branch) works only when its branch is the route (boost ' + bo.toFixed(2) + ' bar, flow ' + fl.toFixed(1) + '), and gives nothing when switched off');
}
{ // 17/18/19. full tank reroute (see 3); capacity on every branch; pressure across branches
  const { h, well, A, B } = scene({ B: true }); const w2 = h.place('well', X + 9, Y + 6, 'large').building; route(h, X + 9, Y + 5, X + 9, Y + 1);
  A.amt = h.tankCap(A) - 0.01; h.hyd.dirty = true; run(h, 40); valid(h, 'running');
  let worst = 0, n = 0; for (let k = 0; k < W * 90; k++) if (h.net.live[k] === 1 && h.net.flowK[k] > 0) { const c = CFG.PIPE.CAP[Math.max(1, h.pipeLvl[k]) - 1]; worst = Math.max(worst, h.net.flowK[k] / c); n++; }
  assert(n > 5 && worst <= 1 + 1e-6, 'no tile carries more than its capacity: ' + worst);
  const act = [X + 6, Y + 6]; assert(h.net.pressK[idx(X + 6, Y + 2)] > 0 && h.net.pressK[idx(act[0], act[1])] > 0, 'pressure on the active branch'); assert(h.net.pressK[idx(X + 6, Y + 2)] >= h.net.pressK[idx(act[0], act[1])] - 1e-6, 'pressure falls toward the tank');
  ok('TEST 17: tank A full -> oil is rerouted into the branch; TEST 18: ' + n + ' flowing tiles over every branch, worst load ' + (worst * 100).toFixed(0) + '% of capacity; TEST 19: pressure solved on the branch and falling toward the tank');
}
{ // 20. save / load keeps the whole topology (ids included)
  const { h, well, A, B } = scene({ B: true, C: true }); route(h, X + 3, Y, X + 3, Y - 3); run(h, 20); valid(h, 'before save');
  const s0 = snap(h), dump = JSON.stringify(h.serialize()), h2 = new G({ seed: 7 }); h2.load(JSON.parse(dump)); valid(h2, 'after load');
  assert.strictEqual(snap(h2), s0, 'identical graph: node ids, segment ids, lengths'); run(h2, 30); valid(h2, 'running after load'); assert(h2.buildings.find(b => b.type === 'well').q > 1);
  ok('TEST 20: save/load -> identical graph (' + h.graphSnapshot().nodes.length + ' nodes, ' + h.graphSnapshot().edges.length + ' segments, junction ids), the simulation resumes from the saved topology');
}
{ // 21/22/23. no duplicate junctions, no orphans, no broken references - after a long random run
  const h = mk(5); h.place('well', X, Y, 'large'); h.place('tank', X + 20, Y + 10); h.place('tank', X + 4, Y + 14); h.place('well', X + 16, Y - 6, 'large'); h.place('tank', X + 28, Y - 6);
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; let built = 0, refused = 0, removed = 0, branches = 0, branches2 = 0;
  for (let i = 0; i < 900; i++) {
    const a = rnd();
    if (a < .5) {
      const anchors = []; for (let k = 0; k < W * 64; k++) if (h.pipe[k]) anchors.push(k); for (const b of h.buildings) anchors.push(idx(b.x, b.y));
      const from = anchors[(rnd() * anchors.length) | 0], sx = from % W + ((rnd() * 3) | 0) - 1, sy = ((from / W) | 0) + ((rnd() * 3) | 0) - 1;          // mostly from an existing pipe / building: branches, T-junctions, joins
      const ex = sx + ((rnd() * 14) | 0) - 7, ey = sy + ((rnd() * 14) | 0) - 7, r = h.routePipe(sx, sy, ex, ey, rnd() < .5); if (r.ok) { h.buildRoute(r); built++; if (h.routeInfo(r).junctions.length) branches2++; } else refused++; }
    else if (a < .7) { const ps = []; for (let k = 0; k < W * 64; k++) if (h.pipe[k]) ps.push(k); if (ps.length) { const k = ps[(rnd() * ps.length) | 0]; if (h.removeAt(k % W, (k / W) | 0).ok) removed++; } }
    else if (a < .85) { const ps = []; for (let k = 0; k < W * 64; k++) if (h.pipe[k]) ps.push(k); if (ps.length) { const k = ps[(rnd() * ps.length) | 0]; if (h.removeBranch(k % W, (k / W) | 0).ok) branches++; } }
    else run(h, 1);
    valid(h, 'random op ' + i);
    const g = h.net.graph; assert.strictEqual(new Set(g.nodes.map(n => n.id)).size, g.nodes.length, 'duplicate junction/node id'); assert.strictEqual(g.orphans.length, 0, 'orphan pipe');
  }
  ok('TEST 21-23: 900 random builds / refusals / single removals / branch removals / steps (' + built + ' built of which ' + branches2 + ' made junctions, ' + refused + ' refused, ' + removed + ' tiles removed, ' + branches + ' branches removed): graph valid after EVERY operation - no duplicate junction, no orphan pipe, no broken reference');
}
{ // 24. rapid build / cancel (previews) never touch the graph; 25. rapid connect / disconnect
  const { h, well } = scene({ B: true }); run(h, 5); const s0 = snap(h), v0 = h.netVersion, pc = h.pipeCount(), cash = h.s.cash;
  for (let i = 0; i < 400; i++) { const r = h.routePipe(X + 6 + ((i * 7) % 9) - 4, Y + (i % 5) - 2, X + 6 + ((i * 3) % 11) - 5, Y + 6 + (i % 4), i % 2 === 0); if (r.ok) h.routeInfo(r); }
  assert.strictEqual(snap(h), s0, 'previews and cancelled routes left the graph exactly as it was'); assert.strictEqual(h.netVersion, v0, 'no network rebuild for a preview'); assert.strictEqual(h.pipeCount(), pc); assert.strictEqual(h.s.cash, cash); valid(h, 'after previews');
  ok('TEST 24: 400 previews / cancelled routes: graph, pipes, money and network version unchanged (a preview never builds, never rebuilds)');
  let n = 0; for (let i = 0; i < 300; i++) {
    const k = idx(X + 1 + (i % 11), Y); if (h.pipe[k]) { h.removeAt(k % W, Y); n++; } else { const r = h.routePipe(X + 1 + (i % 11), Y, X + 1 + (i % 11), Y); if (r.ok) h.buildRoute(r); }
    if (i % 3 === 0) { const q = h.routePipe(X + 6, Y, X + 6, Y + 7); if (q.ok) h.buildRoute(q); h.removeBranch(X + 6, Y + 3); }
    valid(h, 'toggle ' + i);
  }
  ok('TEST 25: 300 rapid connect / disconnect / branch-remove operations: graph valid after every one (' + n + ' tiles cut)');
}
{ // 26. an end tile that would touch two networks at once is refused; a deliberate bridge is fine
  const h = mk(); h.place('well', X, Y, 'large'); h.place('tank', X + 14, Y); h.place('well', X, Y + 2, 'large'); h.place('tank', X + 14, Y + 2);
  route(h, X + 1, Y, X + 6, Y); route(h, X + 1, Y + 2, X + 6, Y + 2);               // two separate pipelines with ONE empty row between them
  assert.notStrictEqual(h.net.compOf[idx(X + 3, Y)], h.net.compOf[idx(X + 3, Y + 2)]);
  const amb = h.routePipe(X + 5, Y + 1, X + 9, Y + 1);                               // starts in the gap: touches both networks at once
  assert.strictEqual(amb.ok, false); assert.strictEqual(amb.reason, 'ambiguous'); assert.strictEqual(h.buildRoute(amb).ok, false); valid(h, 'ambiguous refused');
  const bridge = h.routePipe(X + 5, Y, X + 5, Y + 2); assert(bridge.ok, 'a deliberate bridge from one pipe to the other: ' + bridge.reason); const bi = h.routeInfo(bridge); assert.strictEqual(bi.junctions.length, 2, 'two T-junctions, one on each pipeline');
  h.buildRoute(bridge); valid(h, 'bridge'); assert.strictEqual(h.net.compOf[idx(X + 3, Y)], h.net.compOf[idx(X + 3, Y + 2)], 'now ONE network'); assert.strictEqual(h.graphSnapshot().junctions, 2);
  const h2 = mk(); h2.place('well', X, Y, 'large'); h2.place('tank', X + 14, Y); h2.place('well', X, Y + 2, 'large'); h2.place('tank', X + 14, Y + 2); route(h2, X + 1, Y, X + 6, Y); route(h2, X + 1, Y + 2, X + 6, Y + 2);
  const one = h2.routePipe(X + 5, Y + 1, X + 5, Y + 1); assert(one.ok && one.fresh.length === 1, 'a single tile in the gap is a deliberate join'); h2.buildRoute(one); valid(h2, 'single tile'); assert.strictEqual(h2.net.compOf[idx(X + 3, Y)], h2.net.compOf[idx(X + 3, Y + 2)]);
  ok('TEST 26: an end tile touching two different networks at once is refused ("ambiguous"); a bridge pipe from one network to the other (2 junctions) and a single tile put in a gap are fine');
}
{ // 27. graph is rebuilt only on topology changes; cost of building it
  const { h } = scene({ B: true, C: true }); const v0 = h.netVersion; run(h, 120); assert.strictEqual(h.netVersion, v0, 'no rebuild while only oil moves');
  const big = mk(3); big.place('well', 32, 26, 'large'); big.place('tank', 70, 26); route(big, 33, 26, 69, 26);
  for (let x = 36; x <= 66; x += 3) { const r = big.routePipe(x, 26, x, 26 + 24); if (r.ok) big.buildRoute(r); }                    // 11 comb branches off the main pipe, each 24 tiles: 11 junctions
  const t0 = process.hrtime.bigint(); for (let i = 0; i < 30; i++) big.rebuildNetwork(); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 30;
  valid(big, 'big'); assert(big.graphSnapshot().junctions >= 10, 'comb junctions: ' + big.graphSnapshot().junctions); assert(ms < 25, 'rebuild incl. graph ' + ms.toFixed(2) + ' ms');
  ok('TEST 27: 120 s of simulation -> 0 rebuilds; a network of ' + big.pipeCount() + ' pipe tiles / ' + big.graphSnapshot().nodes.length + ' nodes rebuilds (graph included) in ' + ms.toFixed(2) + ' ms - only when the topology changes');
}
{ // 28. drawn link == logical link everywhere, and the debug info explains a tile
  const { h, well } = scene({ B: true, C: true }); run(h, 5); valid(h, 'links');
  const d = h.tileDebug(idx(X + 6, Y)); assert.strictEqual(d.node, 'J' + idx(X + 6, Y)); assert.strictEqual(d.nodeKind, 'junction'); assert.strictEqual(d.branches, 4); assert.strictEqual(d.links, 4); assert(d.connected && d.live);
  const m = h.tileDebug(idx(X + 3, Y)); assert.strictEqual(m.nodeKind, 'segment'); assert(m.segment.startsWith('S') && m.from && m.to && m.segTiles === 5);
  assert.strictEqual(h.debugSnapshot().graph.junctions, 1);
  ok('TEST 28: every drawn link equals the solver link (checked on every tile by validateNetwork); debug info names node, segment, branches, network and connection state');
}
console.log('\nALL PHASE 16 CORE TESTS PASSED');
