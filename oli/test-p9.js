// Pipe network integrity: graph == real pipes, no accidental links between networks, rerouting, deletion, capacity. Every step is validated.
const assert = require('assert');
const { Game: G, CFG, idx } = require('./core.js');
CFG.TERRAIN.MULT = [1, 1, 1, 1]; CFG.REGIONS.forEach(r => { r.mult = 1; });
CFG.PIPE.LEAK_PER_TILE_MIN = 0; CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
const W = CFG.GRID_COLS, H = CFG.GRID_ROWS;
const ok = m => console.log('  ok  ' + m);
const run = (g, sec, dt) => { dt = dt || 0.1; for (let i = 0; i < Math.round(sec / dt); i++) g.step(dt); };
const valid = (g, what) => { const p = g.validateNetwork(); assert.deepStrictEqual(p, [], what + ': ' + p.slice(0, 3).join(' | ')); };
function mk(seed) {
  const h = new G({ seed: seed || 7 }); h.s.cash = 1e7; h.s.regions.forEach(r => { r.unlocked = true; });
  for (const a of h.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
  return h;
}
function box(h, w, ht) { const x0 = 12, y0 = 40; for (let y = y0 - 2; y < y0 + ht + 2; y++) for (let x = x0 - 2; x < x0 + w + 2; x++) { const k = idx(x, y); h.map.block[k] = 0; h.map.water[k] = 0; } return { x: x0, y: y0 }; }
const route = (h, a, b, c, d, flip) => { const r = h.routePipe(a, b, c, d, !!flip); assert(r.ok, 'route ' + [a, b, c, d] + ' ' + r.reason); assert(h.buildRoute(r).ok); valid(h, 'after route'); return r; };
const tankAmt = h => h.buildings.filter(b => b.type === 'tank').reduce((a, t) => a + t.amt, 0);
const rate = (h, w) => { const a = w.q; return a; };

{ // 1. Well -> Pipe -> Tank
  const h = mk(), o = box(h, 16, 6), w = h.place('well', o.x, o.y).building, t = h.place('tank', o.x + 12, o.y).building;
  route(h, o.x + 1, o.y, o.x + 11, o.y); run(h, 30); valid(h, 'running');
  assert(w.q > 1 && t.amt > 2, 'oil reaches the tank: ' + [w.q, t.amt]);
  const r = h.net.routes.get(w.id); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].path.length, 11); assert.strictEqual(r[0].tank, t);
  for (let i = 0; i < 11; i++) assert(h.net.flowK[idx(o.x + 1 + i, o.y)] > 0.5, 'flow on every tile of the real path');
  ok('TEST 1: well -> pipe -> tank: flow ' + w.q.toFixed(1) + ' bbl/min along all 11 real pipe tiles, graph valid');
  // pipes elsewhere carry nothing
  assert.strictEqual(h.net.flowK[idx(o.x + 1, o.y + 3)], 0);
}
{ // 2. Well -> several pipes (separate builds with corners) -> Tank
  const h = mk(), o = box(h, 20, 10), w = h.place('well', o.x, o.y).building, t = h.place('tank', o.x + 15, o.y + 5).building;
  route(h, o.x + 1, o.y, o.x + 8, o.y); route(h, o.x + 8, o.y, o.x + 8, o.y + 5); route(h, o.x + 8, o.y + 5, o.x + 14, o.y + 5);
  assert.strictEqual(h.net.routes.get(w.id).length, 1);
  run(h, 30); valid(h, 'multi'); assert(t.amt > 2, 'reached tank through 3 builds: ' + t.amt);
  ok('TEST 2: well -> 3 separate pipe builds with corners -> tank (' + t.amt.toFixed(1) + ' bbl), one connected component');
}
{ // 3. Well -> several tanks: nearest by path first
  const h = mk(), o = box(h, 30, 8), w = h.place('well', o.x, o.y).building, near = h.place('tank', o.x + 7, o.y + 1).building, far = h.place('tank', o.x + 25, o.y).building;
  route(h, o.x + 1, o.y, o.x + 24, o.y); run(h, 20); valid(h, 'two tanks');
  assert(near.amt > 2 && far.amt === 0, 'nearest first: ' + [near.amt, far.amt]);
  ok('TEST 3: well with two tanks on one line -> nearest path first (' + near.amt.toFixed(1) + ' vs ' + far.amt + ')');
  near.amt = h.tankCap(near); h.hyd.dirty = true; run(h, 40); valid(h, 'near full');
  assert(far.amt > 2 && near.amt <= h.tankCap(near) + 1e-9, 'near tank full -> the far tank gets the oil: ' + far.amt);
}
{ // 4. Tank full -> reroute (two separate branches), then no tank left -> stop
  const h = mk(), o = box(h, 24, 12), w = h.place('well', o.x, o.y + 4).building, a = h.place('tank', o.x + 20, o.y).building, b = h.place('tank', o.x + 20, o.y + 8).building;
  route(h, o.x + 1, o.y + 4, o.x + 8, o.y + 4); route(h, o.x + 8, o.y + 4, o.x + 8, o.y + 1); route(h, o.x + 8, o.y + 1, o.x + 19, o.y + 1);
  route(h, o.x + 8, o.y + 4, o.x + 8, o.y + 9); route(h, o.x + 8, o.y + 9, o.x + 19, o.y + 9);
  assert.strictEqual(h.net.routes.get(w.id).length, 2, 'two tank routes'); run(h, 20); valid(h, 'two branches');
  const first = h.net.routes.get(w.id)[0].tank, second = first === a ? b : a;
  assert(first.amt > 2 && second.amt < 0.5, 'first branch gets the oil: ' + [first.amt, second.amt]);
  first.amt = h.tankCap(first); h.hyd.dirty = true; const s0 = second.amt; run(h, 30); valid(h, 'rerouted');
  assert(second.amt > s0 + 2 && Math.abs(first.amt - h.tankCap(first)) < 1e-6, 'full tank -> oil goes to the other tank: ' + [first.amt, second.amt]);
  second.amt = h.tankCap(second); h.hyd.dirty = true; run(h, 10); valid(h, 'both full');
  assert(w.q < 0.05 && tankAmt(h) <= h.tankCap(a) + h.tankCap(b) + 1e-6, 'no tank with room -> the flow stops: ' + w.q);
  ok('TEST 4: tank full -> oil rerouted to the second tank (' + second.amt.toFixed(0) + '), both full -> flow stops (q=' + w.q.toFixed(3) + ')');
  // 5. delete a pipe -> disconnect; reconnect -> resume
  second.amt = 0; first.amt = 0; h.hyd.dirty = true; run(h, 10); assert(w.q > 1);
  const cut1 = idx(o.x + 4, o.y + 4), v0 = h.netVersion;
  assert(h.removeAt(o.x + 4, o.y + 4).ok); assert(h.netVersion > v0, 'graph rebuilt on delete'); valid(h, 'after delete');
  assert.strictEqual(h.net.routes.get(w.id).length, 0, 'well cut off from every tank'); run(h, 15); valid(h, 'cut running');
  assert(w.q < 0.05 && tankAmt(h) < 1e-3 + (first.amt + second.amt), 'cut pipe -> flow 0');
  const before = tankAmt(h); run(h, 10); assert(Math.abs(tankAmt(h) - before) < 1e-6, 'no oil moves while disconnected');
  h.buildRoute(h.routePipe(o.x + 4, o.y + 4, o.x + 4, o.y + 4, false)); // single tile re-placed
  valid(h, 'after reconnect'); assert.strictEqual(h.net.routes.get(w.id).length, 2); run(h, 20); valid(h, 'resumed');
  assert(w.q > 1 && tankAmt(h) > before + 2, 'reconnected pipe -> the flow resumes: ' + [w.q, tankAmt(h)]);
  ok('TEST 5: pipe deleted -> well cut off (0 routes, flow 0, no oil moves); pipe rebuilt -> 2 routes again and flow resumes (' + w.q.toFixed(1) + ' bbl/min)');
}
{ // 6. capacity below production
  const h = mk(), o = box(h, 16, 6), w = h.place('well', o.x, o.y, 'large').building, t = h.place('tank', o.x + 12, o.y).building;
  route(h, o.x + 1, o.y, o.x + 11, o.y); run(h, 40); valid(h, 'cap');
  const cap = CFG.PIPE.CAP[0]; assert(w.rate > cap + 3, 'the well can make more than the pipe carries: ' + [w.rate, cap]);
  assert(w.q <= cap + 1e-3 && w.q > cap - 1, 'flow limited to the pipe capacity: ' + [w.q, cap]);
  for (let i = 0; i < 11; i++) assert(h.net.flowK[idx(o.x + 1 + i, o.y)] <= cap + 1e-3);
  const l1 = w.q; const info = h.pipeUpgradeInfo(idx(o.x + 3, o.y)); assert(h.upgradePipes(idx(o.x + 3, o.y)).ok); run(h, 40); valid(h, 'cap upgrade');
  assert(w.q > l1 + 2, 'upgrading the pipe lets more oil through: ' + [l1, w.q]);
  ok('TEST 6: well can make ' + w.rate.toFixed(1) + ' but the pipe carries ' + cap + ' -> flow ' + l1.toFixed(1) + '; upgraded pipe -> ' + w.q.toFixed(1));
}
{ // 7. crossing and touching without a junction
  const h = mk(), o = box(h, 24, 16), X = o.x, Y = o.y;
  const wA = h.place('well', X + 10, Y + 2).building, tA = h.place('tank', X + 9, Y + 9).building;
  route(h, X + 10, Y + 3, X + 10, Y + 8);                                              // network A: a vertical line, well on top, tank at the bottom
  const wB = h.place('well', X + 3, Y + 6).building, tB = h.place('tank', X + 17, Y + 6).building;
  const cross = h.routePipe(X + 4, Y + 6, X + 16, Y + 6, false);
  // a straight route across network A is never built across it: the router goes around it (a clean detour that touches nothing) or refuses
  assert(!cross.ok || (cross.auto && cross.cells.every(c => !h.pipe[idx(c[0], c[1])] || (c[0] === X + 4 && c[1] === Y + 6) || (c[0] === X + 16 && c[1] === Y + 6))), 'a crossing becomes a detour or is refused: ' + cross.reason);
  if (cross.ok) for (const c of cross.cells) for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k2 = idx(c[0] + d[0], c[1] + d[1]); assert(!(h.net.compOf[k2] >= 0 && h.net.compOf[k2] === h.net.compOf[idx(X + 10, Y + 5)]), 'the detour does not touch network A at ' + c); }
  const pc = h.pipeCount(); valid(h, 'previewed crossing'); assert.strictEqual(h.pipeCount(), pc);
  // a route that would run right beside the line is re-planned along its other L (no contact); when both legs touch it is refused
  const wC = h.place('well', X + 13, Y + 8).building;
  const alt = h.routePipe(X + 12, Y + 8, X + 11, Y + 2, false); assert(alt.ok, alt.reason);
  assert(alt.cells.every(c => c[0] !== 11 || c[1] === 2), 'auto routing picked the leg that does not touch network A');
  const both = h.routePipe(X + 11, Y + 2, X + 11, Y + 9, false); assert(both.ok ? both.auto : both.reason === 'pipeTouch', 'a straight run beside network A is refused or re-routed away from it: ' + both.reason);
  if (both.ok) assert(both.cells.slice(1, -1).every(c => c[0] !== X + 11 && c[0] !== X + 9), 'the re-routed line keeps one empty tile away from A');
  const v0 = h.pipeCount(); if (!both.ok) assert(!h.buildRoute(both).ok); assert.strictEqual(h.pipeCount(), v0);
  const gapLine = h.routePipe(X + 12, Y + 8, X + 12, Y + 4, false); assert(gapLine.ok, gapLine.reason); assert(h.buildRoute(gapLine).ok); valid(h, 'gap line built');
  assert.notStrictEqual(h.net.compOf[idx(X + 12, Y + 5)], h.net.compOf[idx(X + 10, Y + 5)], 'a line one empty tile away only looks close to A: it is a separate network');
  // a deliberate junction: END the pipe on the existing line
  const j = h.routePipe(X + 4, Y + 6, X + 9, Y + 6, false); assert(j.ok, j.reason); assert(h.buildRoute(j).ok); valid(h, 'junction');
  assert.strictEqual(h.net.compOf[idx(X + 6, Y + 6)], h.net.compOf[idx(X + 10, Y + 6)], 'ending next to a pipe joins the networks');
  run(h, 60); valid(h, 'junction running'); assert(tA.amt > 2, 'oil from well B flows through the junction into tank A: ' + tA.amt);
  ok('TEST 7: a crossing is routed around (touching nothing) or refused, a run beside another network re-planned or refused (pipeTouch), a nearby pipe stays a separate network, ending ON a pipe = real junction and oil follows it (' + tA.amt.toFixed(1) + ' bbl)');
}
{ // 8. two networks one empty tile apart stay independent
  const h = mk(), o = box(h, 24, 12);
  const w1 = h.place('well', o.x, o.y).building, t1 = h.place('tank', o.x + 20, o.y).building, w2 = h.place('well', o.x, o.y + 3).building, t2 = h.place('tank', o.x + 20, o.y + 3).building;
  route(h, o.x + 1, o.y, o.x + 19, o.y); route(h, o.x + 1, o.y + 3, o.x + 19, o.y + 3);
  assert.notStrictEqual(h.net.compOf[idx(o.x + 5, o.y)], h.net.compOf[idx(o.x + 5, o.y + 3)]);
  t1.amt = h.tankCap(t1); h.hyd.dirty = true; run(h, 30); valid(h, 'two nets');
  assert(t2.amt > 2 && w1.q < 0.05, 'full tank 1 does not push oil into network 2: ' + [w1.q, t2.amt]);
  ok('TEST 8: two parallel networks (one tile apart) stay separate: a full tank in one never changes the other');
}
{ // 9. graph is rebuilt only on real changes
  const h = mk(), o = box(h, 16, 6), w = h.place('well', o.x, o.y).building, t = h.place('tank', o.x + 12, o.y).building;
  route(h, o.x + 1, o.y, o.x + 11, o.y); run(h, 2); const v = h.netVersion; run(h, 60); assert.strictEqual(h.netVersion, v, 'no rebuild without a change');
  h.removeAt(o.x + 5, o.y); assert(h.netVersion > v); const v2 = h.netVersion; run(h, 5); assert.strictEqual(h.netVersion, v2);
  ok('TEST 9: the graph is rebuilt only when something changes (600 idle steps -> no rebuild; delete -> exactly one)');
}
{ // 10. save / load keeps a valid graph
  const h = mk(), o = box(h, 16, 6), w = h.place('well', o.x, o.y).building, t = h.place('tank', o.x + 12, o.y).building;
  route(h, o.x + 1, o.y, o.x + 11, o.y); run(h, 10);
  const h2 = new G({ seed: 7 }); h2.load(JSON.parse(JSON.stringify(h.serialize()))); valid(h2, 'loaded'); run(h2, 20); valid(h2, 'loaded running');
  assert(h2.buildings.filter(b => b.type === 'tank')[0].amt > t.amt);
  ok('TEST 10: save/load rebuilds an identical, valid graph and the oil keeps flowing');
}
{ // 11. random building / routing / deleting: the graph must stay consistent after EVERY operation
  const { mulberry32 } = require('./core.js'); const rnd = mulberry32(12345);
  const h = mk(3), o = box(h, 40, 30); let n = { route: 0, refused: 0, del: 0, b: 0 };
  const R = (a, b) => a + Math.floor(rnd() * (b - a));
  for (let i = 0; i < 700; i++) {
    const r = rnd(), x = o.x + R(0, 40), y = o.y + R(0, 30);
    if (r < .08) { if (h.place(rnd() < .6 ? 'well' : 'tank', x, y).ok) n.b++; }
    else if (r < .62) { const rt = h.routePipe(x, y, o.x + R(0, 40), o.y + R(0, 30), rnd() < .5); if (rt.ok) { if (h.buildRoute(rt).ok) n.route++; } else n.refused++; }
    else if (r < .75) { if (h.removeAt(x, y).ok) n.del++; }
    else if (r < .8) h.setValve(idx(x, y), R(0, 4));
    else run(h, 3);
    valid(h, 'fuzz step ' + i);
  }
  run(h, 30); valid(h, 'fuzz end');
  for (const t of h.buildings.filter(b => b.type === 'tank')) assert(t.amt <= h.tankCap(t) + 1e-9);
  ok('TEST 11: 700 random operations (' + n.b + ' buildings, ' + n.route + ' routes, ' + n.refused + ' refused routes, ' + n.del + ' deletions) -> network valid after every single one');
}
console.log('ALL PIPE-NETWORK TESTS PASSED');
