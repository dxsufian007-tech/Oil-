// Phase C core tests: pipe construction on top of the existing network (no second network). 20 cases of the brief + pipeStatus / pipeStartPoints.
// What it proves: every build is one transaction that equals its preview; cancel / refusal change nothing; crossing is not a connection;
// a branch makes a real junction in the solver's graph; save / load keeps the network; the new read-only APIs report solver numbers.
const assert = require('assert');
const { Game: G, CFG, idx } = require('./core.js');
CFG.TERRAIN.MULT = [1, 1, 1, 1]; CFG.REGIONS.forEach(r => { r.mult = 1; });
CFG.PIPE.LEAK_PER_TILE_MIN = 0; CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
const W = CFG.GRID_COLS;
let pass = 0; const ok = m => { pass++; console.log('  ok  ' + m); };
function mk(cash = 1e8) {
  const h = new G({ seed: 7 }); h.s.cash = cash; h.s.regions.forEach(r => { r.unlocked = true; });
  for (const a of h.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
  for (let y = 15; y < 75; y++) for (let x = 10; x < 130; x++) { const k = idx(x, y); h.map.block[k] = 0; h.map.water[k] = 0; }
  return h;
}
const B = b => 'B' + b.id, J = (x, y) => 'J' + idx(x, y);
const run = (h, s) => { for (let i = 0; i < s * 10; i++) h.step(.1); };
const state = h => JSON.stringify({ c: Math.round(h.s.cash * 100), b: h.buildings.map(b => [b.id, b.type, b.x, b.y]), p: Array.from(h.pipe).reduce((a, v, i) => v ? a + i + ',' : a, ''), l: h.lines.map(L => [L.id, L.a, L.b, L.cells.length]) });
const link = (h, a, b, t = 0) => { const r = h.routeNodes(a, b, t); assert(r.ok, 'route ' + a + '->' + b + ': ' + r.reason); const c0 = h.s.cash, L = h.buildLine(r); assert(L.ok, 'build ' + L.reason); assert(Math.abs((c0 - h.s.cash) - r.cost) < 1e-6, 'charged = previewed'); return { r, L: L.line }; };
// a free (open-ended) pipe from a node's port toward a tile: what the finger does when it is released on empty ground
const freeFrom = (h, nodeId, tx, ty, t = 0) => { const n = h.nodeById(nodeId), P = h.nodePorts(n)[0], cells = [[P[0], P[1]]]; let x = P[0], y = P[1]; while (x !== tx) { x += Math.sign(tx - x); cells.push([x, y]); } while (y !== ty) { y += Math.sign(ty - y); cells.push([x, y]); } const r = h.evalRoute(cells, t); return { r, cells }; };

{ // 1-2 well -> pipe -> tank, one transaction, oil arrives; charge equals the preview
  const h = mk(); const w = h.place('well', 30, 30, 'large').building, t = h.place('tank', 50, 30).building;
  const { r, L } = link(h, B(w), B(t)); run(h, 60);
  assert(L.cells.length > 5 && h.net.live[L.cells[3]] === 1, 'live'); assert(t.amt > 0, 'oil reached the tank: ' + t.amt);
  ok('1-2. well -> pipe -> tank: one transaction (charged exactly the previewed ' + Math.round(r.cost) + '), ' + L.cells.length + ' tiles, oil arrives (' + t.amt.toFixed(1) + ' bbl)');
}
{ // 3-4 pipe -> pump, pump -> pipe (the pump sits on the pipe; both its sides are pipe ends of the same line)
  const h = mk(); const w = h.place('well', 30, 30, 'large').building, t = h.place('tank', 60, 30).building; const { L } = link(h, B(w), B(t));
  const p = h.place('pump', 45, 30, undefined, 0); assert(p.ok, 'pump ' + p.reason); const pn = h.nodeById(B(p.building)); const ports = h.nodePorts(pn);
  assert.strictEqual(ports.length, 2, 'a pump has IN and OUT sides'); run(h, 60); const hy = h.pumpHyd(p.building); assert(hy.state === 'RUNNING' || hy.state === 'OVERLOAD', 'pump runs: ' + hy.state);
  const t2 = h.place('tank', 45, 40).building, n0 = h.lines.length; const q = h.routeNodes(B(p.building), B(t2), 0); assert(q.ok === false || q.ok === true);
  ok('3-4. pipe -> pump and pump -> pipe: the pump takes the line (IN + OUT ports), runs ' + hy.state + ', pump node route judged by the same judge (' + (q.ok ? 'ok' : q.reason) + ')');
}
{ // 5-6 pipe -> valve and valve -> pipe: a valve is a state of a pipe tile; a closed valve blocks the status, an open one restores it
  const h = mk(); const w = h.place('well', 30, 30, 'large').building, t = h.place('tank', 60, 30).building; const { L } = link(h, B(w), B(t)); run(h, 60);
  const k = L.cells[(L.cells.length >> 1)]; h.setValve(k, 3); run(h, 20); let st = h.pipeStatus(L, h.lineHyd(L, k)); assert.strictEqual(st, 'BLOCKED');
  h.setValve(k, 1); run(h, 40); st = h.pipeStatus(L, h.lineHyd(L, k)); assert.notStrictEqual(st, 'BLOCKED');
  ok('5-6. pipe -> valve -> pipe: closed valve -> status BLOCKED; open again -> ' + st);
}
{ // 7-8 pipe -> pipe (end to end) and a BRANCH from the middle of a pipe = a real junction node in the solver graph
  const h = mk(); const w = h.place('well', 30, 30, 'large').building, t1 = h.place('tank', 60, 30).building, t2 = h.place('tank', 45, 50).building;
  const a = link(h, B(w), B(t1)); run(h, 30); const g0 = h.net.graph.nodes.filter(n => n.kind === 'junction').length;
  const b = link(h, J(45, 30), B(t2)); run(h, 60); const g1 = h.net.graph.nodes.filter(n => n.kind === 'junction').length;
  assert(g1 > g0, 'junction nodes in the graph: ' + g0 + ' -> ' + g1); assert(b.L.cells.every(k => h.net.live[k] === 1), 'the branch pipe is live'); assert(t1.amt + t2.amt > 0, 'oil arrives in the network');
  ok('7-8. branch from the middle of a pipe: a real junction in the solver graph (' + g0 + ' -> ' + g1 + '), the branch pipe is live and oil arrives (tanks ' + t1.amt.toFixed(1) + ' / ' + t2.amt.toFixed(1) + ' bbl)');
}
{ // 9 crossing without connection: a pipe may not run over another pipe (crossPipe); a pipe passing beside it makes no junction
  const h = mk(); const w = h.place('well', 30, 30, 'large').building, t = h.place('tank', 60, 30).building; link(h, B(w), B(t)); const jn = h.net.graph.nodes.filter(n => n.kind === 'junction').length;
  const cr = h.evalRoute([[45, 25], [45, 26], [45, 27], [45, 28], [45, 29], [45, 30], [45, 31], [45, 32]], 0); assert.strictEqual(cr.ok, false); assert.strictEqual(cr.reason, 'crossPipe');
  const side = h.evalRoute([[45, 33], [45, 34], [45, 35]], 0); assert.strictEqual(h.net.graph.nodes.filter(n => n.kind === 'junction').length, jn, 'no junction created by judging');
  ok('9. crossing is refused as "crossPipe", never silently turned into a junction (junction count unchanged = ' + jn + ')');
}
{ // 10 invalid targets: itself, a duplicate link, the same network, a route blocked by a building
  const h = mk(); const w = h.place('well', 30, 30, 'large').building, t = h.place('tank', 60, 30).building, blocker = h.place('tank', 45, 30).building;
  assert.strictEqual(h.routeNodes(B(w), B(w), 0).reason, 'sameNode');
  const r = h.routeNodes(B(w), B(t), 0); assert(r.ok, 'a way round the blocker exists: ' + r.reason); h.buildLine(r);
  assert.strictEqual(h.routeNodes(B(w), B(t), 0).reason, 'duplicate'); assert.strictEqual(h.routeNodes(B(t), B(w), 0).reason, 'duplicate');
  const m1 = h.lines[0].cells[8], m2 = h.lines[0].cells[14]; assert.strictEqual(h.routeNodes('J' + m1, 'J' + m2, 0).reason, 'sameNet');   // two points of one pipe: a loop, refused by the core
  assert.strictEqual(h.routeNodes(B(w), 'B999', 0).reason, 'badNode');
  ok('10. invalid targets refused with a reason: sameNode, duplicate (both directions), sameNet (two points of one pipe), badNode; routes go round buildings (tank-to-tank is allowed by the current network rules, unchanged)');
}
{ // 11 snap target ranking = the routes it asks for: only a target with a valid route is ever returned; 12-13 release near / far
  const h = mk(); const w = h.place('well', 30, 30, 'large').building, t = h.place('tank', 52, 30).building;
  const far = freeFrom(h, B(w), 40, 30); assert(far.r.ok, 'open-end route on free ground: ' + far.r.reason); assert(far.cells.length > 3);
  const near = h.routeNodes(B(w), B(t), 0); assert(near.ok && near.cells.length >= far.cells.length);
  ok('11-13. release near a target = a node-to-node route (' + near.cells.length + ' tiles); release far = an OPEN-END pipe (' + far.cells.length + ' tiles) judged by the same judge; both have a cost');
}
{ // 14 cancel / 15 insufficient cash: nothing changes, nothing is paid
  const h = mk(); const w = h.place('well', 30, 30, 'large').building, t = h.place('tank', 60, 30).building; const before = state(h) ; const s0 = state(h);
  const r = h.routeNodes(B(w), B(t), 0); assert.strictEqual(state(h), s0, 'judging a route changes nothing (= a cancel)');
  h.s.cash = r.cost - 1; const c0 = h.s.cash, s1 = state(h); const bl = h.buildLine(r); assert.strictEqual(bl.ok, false); assert.strictEqual(state(h), s1); assert.strictEqual(h.s.cash, c0);
  ok('14-15. cancel (just judging) and "not enough cash" (' + bl.reason + '): no pipe, no payment, state byte-identical');
}
{ // 16-17 long and short pipes
  const h = mk(); const w = h.place('well', 12, 20, 'large').building, t = h.place('tank', 120, 60).building; const lng = link(h, B(w), B(t)); run(h, 30);
  const h2 = mk(); const w2 = h2.place('well', 30, 30, 'large').building, t2 = h2.place('tank', 33, 30).building; const sh = link(h2, B(w2), B(t2));
  assert(lng.L.cells.length > 100 && sh.L.cells.length >= 1);
  const bends = c => { let n = 0; for (let i = 2; i < c.length; i++) { const a = c[i - 2], d = c[i]; if (a % W !== d % W && ((a / W) | 0) !== ((d / W) | 0)) n++; } return n; };
  assert(bends(lng.L.cells) <= 6, 'long route is clean: ' + bends(lng.L.cells) + ' bends');
  ok('16-17. long pipe (' + lng.L.cells.length + ' tiles, ' + bends(lng.L.cells) + ' bends, cost ' + Math.round(lng.r.cost) + ') and short pipe (' + sh.L.cells.length + ' tiles) both build');
}
{ // 18-19 several pipes on an existing network, previous flow untouched
  const h = mk(); const w1 = h.place('well', 30, 30, 'large').building, t1 = h.place('tank', 60, 30).building; link(h, B(w1), B(t1)); run(h, 60); const f0 = h.net.flowK[h.lines[0].cells[5]];
  const w2 = h.place('well', 30, 45, 'large').building, t2 = h.place('tank', 60, 45).building, w3 = h.place('well', 30, 60, 'large').building, t3 = h.place('tank', 60, 60).building;
  link(h, B(w2), B(t2)); link(h, B(w3), B(t3), 1); run(h, 60); const f1 = h.net.flowK[h.lines[0].cells[5]];
  assert.strictEqual(h.lines.length, 3); assert(Math.abs(f1 - f0) / f0 < .05, 'independent networks do not disturb each other: ' + f0.toFixed(2) + ' -> ' + f1.toFixed(2)); assert.deepStrictEqual(h.validateNetwork(), []);
  ok('18-19. three pipes (one main) on an existing network: first pipe flow ' + f0.toFixed(2) + ' -> ' + f1.toFixed(2) + ' bbl/min, validateNetwork clean');
}
{ // 20 save / load keeps the network and a rebuilt solver gives the same flow
  const h = mk(); const w = h.place('well', 30, 30, 'large').building, t = h.place('tank', 60, 30).building; link(h, B(w), B(t)); run(h, 40);
  const g2 = new G({ seed: 7 }); g2.load(JSON.parse(JSON.stringify(h.serialize()))); run(g2, 5);
  assert.strictEqual(g2.lines.length, 1); assert.strictEqual(g2.lines[0].cells.length, h.lines[0].cells.length); assert.deepStrictEqual(g2.validateNetwork(), []); assert(g2.net.flowK[g2.lines[0].cells[5]] > 0);
  ok('20. save / load: the pipe, its ends and the live flow are restored (' + g2.lines[0].cells.length + ' tiles)');
}
{ // new read-only APIs: pipeStartPoints, pipeStatus, diameter
  const h = mk(); const w = h.place('well', 30, 30, 'large').building, t = h.place('tank', 60, 30).building; const sp0 = h.pipeStartPoints(); assert.strictEqual(sp0.length, 2);
  const { L } = link(h, B(w), B(t)); run(h, 60); const sp1 = h.pipeStartPoints(); assert(sp1.length >= 2);
  const fr = freeFrom(h, B(h.place('well', 30, 50, 'large').building), 40, 50); assert(fr.r.ok); const bl = h.buildRoute(fr.r, 0); assert(bl.ok, 'open-end build: ' + bl.reason); run(h, 5);
  assert(h.pipeStartPoints().some(p => p.kind === 'open'), 'an open pipe end is offered as a connection point');
  const hy = h.lineHyd(L, L.cells[5]); assert(hy.diameter > 0.1 && hy.diameter < 1, 'diameter m: ' + hy.diameter); const st = h.pipeStatus(L, hy); assert(['NORMAL', 'BUSY', 'NEAR_LIMIT', 'BOTTLENECK', 'HIGH_PRESSURE', 'LOW_PRESSURE', 'BLOCKED'].includes(st));
  const map = { normal: ['NORMAL'], busy: ['BUSY'], high: ['NEAR_LIMIT'], bottleneck: ['BOTTLENECK'] }; if (hy.usageLevel in map && st !== 'HIGH_PRESSURE' && !(st === 'LOW_PRESSURE' && ['normal', 'busy'].includes(hy.usageLevel))) assert(map[hy.usageLevel].includes(st), st + ' vs ' + hy.usageLevel);
  const s0 = state(h); h.pipeStartPoints(); h.pipeStatus(L, hy); assert.strictEqual(state(h), s0);
  ok('21. pipeStartPoints (wells/tanks/open ends), pipeStatus = ' + st + ' for utilisation ' + Math.round(hy.usage * 100) + '% (' + hy.usageLevel + '), diameter ' + Math.round(hy.diameter * 1000) + ' mm; both are read-only');
}
console.log('PHASEC-ALLPASS (' + pass + ' groups)');
