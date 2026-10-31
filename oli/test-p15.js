// Phase 15 (5/20): smart pipe building and auto-routing. Core only: routes, detours, endpoints, pumps, cost, atomic confirm, performance.
const assert = require('assert');
const { Game: G, CFG, idx } = require('./core.js');
CFG.TERRAIN.MULT = [1, 1, 1, 1]; CFG.REGIONS.forEach(r => { r.mult = 1; });
CFG.PIPE.LEAK_PER_TILE_MIN = 0; CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
const W = CFG.GRID_COLS, H = CFG.GRID_ROWS;
const ok = m => console.log('  ok  ' + m);
const run = (g, sec) => { for (let i = 0; i < Math.round(sec / 0.1); i++) g.step(0.1); };
const valid = (g, what) => { const p = g.validateNetwork(); assert.deepStrictEqual(p, [], what + ': ' + p.slice(0, 4).join(' | ')); };
function mk(seed, clear) {
  const h = new G({ seed: seed || 7 }); h.s.cash = 1e8; h.s.regions.forEach(r => { r.unlocked = true; });
  for (const a of h.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
  if (clear !== false) for (let y = 24; y < 64; y++) for (let x = 30; x < 80; x++) { const k = idx(x, y); h.map.block[k] = 0; h.map.water[k] = 0; }
  return h;
}
const X = 40, Y = 40;
const build = (h, r) => { assert(r.ok, 'route: ' + r.reason); const b = h.buildRoute(r); assert(b.ok, 'build: ' + b.reason); valid(h, 'after build'); return b; };
const corners = cells => { let n = 0; for (let i = 1; i + 1 < cells.length; i++) if (cells[i][0] - cells[i - 1][0] !== cells[i + 1][0] - cells[i][0] || cells[i][1] - cells[i - 1][1] !== cells[i + 1][1] - cells[i][1]) n++; return n; };
const axisOnly = cells => cells.every((c, i) => !i || (Math.abs(c[0] - cells[i - 1][0]) + Math.abs(c[1] - cells[i - 1][1]) === 1));
const state = h => JSON.stringify([h.s.cash, h.s.capex, h.pipeCount(), h.buildings.length, h.netVersion]);

{ // 1-2. well -> tank: straight, then with one 90-degree turn
  const h = mk(); const w = h.place('well', X, Y, 'large').building, t = h.place('tank', X + 10, Y).building;
  const r = h.routePipe(X + 1, Y, X + 9, Y); assert(r.ok && !r.auto && corners(r.cells) === 0 && r.cells.length === 9); build(h, r); run(h, 30); assert(w.q > 1 && t.amt > 2);
  const h2 = mk(); h2.place('well', X, Y, 'large'); const t2 = h2.place('tank', X + 8, Y + 6).building; const r2 = h2.routePipe(X + 1, Y, X + 8, Y + 5);
  assert(r2.ok && !r2.auto && corners(r2.cells) === 1 && axisOnly(r2.cells), 'one corner: ' + corners(r2.cells)); build(h2, r2); run(h2, 30); assert(t2.amt > 2);
  ok('TEST 1: well -> tank straight (9 tiles, 0 corners, oil ' + t.amt.toFixed(1) + '); TEST 2: with one 90-degree turn (' + r2.cells.length + ' tiles, 1 corner, oil ' + t2.amt.toFixed(1) + ')');
}
{ // 3. several turns: the router goes around two buildings with the fewest corners
  const h = mk(); const w = h.place('well', X, Y, 'large').building; h.place('tank', X + 5, Y - 1); h.place('tank', X + 11, Y + 3); const t = h.place('tank', X + 17, Y).building;
  const r = h.routePipe(X + 1, Y, X + 16, Y); assert(r.ok && r.auto, 'detour: ' + r.reason); assert(corners(r.cells) >= 2 && corners(r.cells) <= 6, 'corners ' + corners(r.cells)); assert(axisOnly(r.cells));
  const info = h.routeInfo(r); assert.strictEqual(info.corners, corners(r.cells)); assert.strictEqual(info.auto, true); build(h, r); run(h, 40); assert(w.q > 1 && t.amt > 2, 'oil arrives through the detour: ' + t.amt);
  ok('TEST 3: well -> tank with multiple turns (' + corners(r.cells) + ' corners, ' + r.cells.length + ' tiles) around two buildings; oil ' + t.amt.toFixed(1) + ' arrives');
}
{ // 4/5/6. pump connections: well -> pump, pump -> tank, well -> pump -> tank
  const h = mk(); const w = h.place('well', X, Y, 'large').building, t = h.place('tank', X + 8, Y).building; build(h, h.routePipe(X + 1, Y, X + 7, Y)); const p = h.place('pump', X + 4, Y); assert(p.ok, p.reason); const pump = p.building;
  h.removeAt(X + 3, Y); h.removeAt(X + 2, Y); assert.strictEqual(h.net.routes.get(w.id).length, 0);
  const r4 = h.routePipe(X, Y, X + 4, Y); assert(r4.ok, 'well -> pump along its axis: ' + r4.reason); assert.strictEqual(r4.cells[r4.cells.length - 1][0], X + 4); const i4 = h.routeInfo(r4); assert.strictEqual(i4.end.kind, 'pump'); build(h, r4);
  ok('TEST 4: well -> pump: the route ends on the pump cell along its axis (' + r4.fresh.length + ' new tiles), end recognised as "' + i4.end.kind + '"');
  h.removeAt(X + 5, Y); h.removeAt(X + 6, Y); assert.strictEqual(h.net.routes.get(w.id).length, 0);
  const r5 = h.routePipe(X + 4, Y, X + 8, Y); assert(r5.ok, 'pump -> tank: ' + r5.reason); assert.strictEqual(h.routeInfo(r5).start.kind, 'pump'); build(h, r5);
  assert.strictEqual(h.net.routes.get(w.id).length, 1, 'well -> pump -> tank is one real path'); run(h, 40); valid(h, 'running'); assert(w.q > 1 && t.amt > 2 && pump.used && pump.boost > 0.1, 'oil through the pump: ' + [w.q, t.amt, pump.boost]);
  ok('TEST 5: pump -> tank (starts on the pump cell); TEST 6: well -> pump -> tank is one real path, the pump is on it and works (boost ' + pump.boost.toFixed(1) + ' bar), oil ' + t.amt.toFixed(1));
  // a pump joins only at its back and front
  const side = h.routePipe(X + 4, Y, X + 4, Y + 5); assert.strictEqual(side.ok, false); assert.strictEqual(side.reason, 'pumpSide'); const side2 = h.routePipe(X + 4, Y + 5, X + 4, Y); assert.strictEqual(side2.reason, 'pumpSide');
  ok('TEST 4b: leaving / entering a pump from its SIDE is refused ("pumpSide": cannot connect to this side of the pump) in both directions');
}
{ // 7/8/9. pipe endpoint -> pipe endpoint, pipe -> tank, pipe -> pump
  const h = mk(); const w = h.place('well', X, Y, 'large').building, t = h.place('tank', X + 14, Y + 6).building; build(h, h.routePipe(X + 1, Y, X + 5, Y));          // a stub whose END is (X+5, Y)
  const r7 = h.routePipe(X + 5, Y, X + 5, Y + 4); assert(r7.ok); assert.strictEqual(h.routeInfo(r7).start.kind, 'pipe'); build(h, r7);
  const r8 = h.routePipe(X + 5, Y + 4, X + 14, Y + 6); assert(r8.ok, 'pipe end -> tank: ' + r8.reason); assert.strictEqual(h.routeInfo(r8).end.kind, 'tank'); build(h, r8); run(h, 40); assert(t.amt > 2 && w.q > 1);
  ok('TEST 7: pipe endpoint -> new pipe (continues the line); TEST 8: pipe endpoint -> tank (oil ' + t.amt.toFixed(1) + ', ' + h.routeInfo(r8).corners + ' corner)');
  const h2 = mk(); const w2 = h2.place('well', X, Y, 'large').building, t2 = h2.place('tank', X + 12, Y).building; build(h2, h2.routePipe(X + 1, Y, X + 7, Y)); const pm = h2.place('pump', X + 8, Y); assert(!pm.ok, 'a pump needs a neighbour on both sides');
  build(h2, h2.routePipe(X + 9, Y, X + 11, Y)); const pm2 = h2.place('pump', X + 8, Y); assert(pm2.ok, pm2.reason);
  h2.removeAt(X + 7, Y); const r9 = h2.routePipe(X + 6, Y, X + 8, Y); assert(r9.ok); assert.strictEqual(h2.routeInfo(r9).end.kind, 'pump'); build(h2, r9); assert.strictEqual(h2.net.routes.get(w2.id).length, 1); run(h2, 40); assert(t2.amt > 2);
  ok('TEST 9: pipe endpoint -> pump (end recognised, joined along the axis, oil ' + t2.amt.toFixed(1) + ' reaches the tank through it)');
}
{ // 10/11/12. blocked direct route, alternative route, no valid route
  const h = mk(); const w = h.place('well', X, Y, 'large').building, t = h.place('tank', X + 12, Y).building, ob = h.place('tank', X + 5, Y).building;
  const r = h.routePipe(X, Y, X + 12, Y); assert(r.ok && r.auto, 'the direct line is blocked by a tank -> detour: ' + r.reason);
  for (const c of r.cells.slice(1, -1)) { assert(!h.occ[idx(c[0], c[1])], 'never through a building'); for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert(h.occ[idx(c[0] + d[0], c[1] + d[1])] !== ob, 'never beside the other tank'); }
  assert(corners(r.cells) <= 4 && r.cells.length - 1 <= 12 + 8, 'short and clean: ' + corners(r.cells) + ' corners, ' + r.cells.length + ' tiles');
  // the plain L is refused with the specific reason (what the player is told when no detour is wanted): same ends, buildings only
  const l = h.evalRoute((() => { const c = []; for (let x = X; x <= X + 12; x++) c.push([x, Y]); return c; })()); assert.strictEqual(l.ok, false); assert.strictEqual(l.reason, 'crossBuilding');
  build(h, r); valid(h, 'detour built'); const before = state(h);
  ok('TEST 10: the direct line through a tank is blocked (crossBuilding); TEST 11: the router goes around it - ' + r.cells.length + ' tiles, ' + corners(r.cells) + ' corners, never through or beside the other building, built and valid');
  // no valid route: the destination is walled in
  const h2 = mk(); h2.place('well', X, Y, 'large'); h2.place('tank', X + 12, Y); for (let y = Y - 1; y <= Y + 2; y++) for (let x = X + 11; x <= X + 14; x++) if (!h2.occ[idx(x, y)]) { h2.map.block[idx(x, y)] = 1; h2.map.water[idx(x, y)] = 1; }
  const cashN = h2.s.cash; const nr = h2.routePipe(X, Y, X + 12, Y); assert.strictEqual(nr.ok, false); assert.strictEqual(nr.reason, 'noRoute'); assert.strictEqual(h2.buildRoute(nr).ok, false); assert.strictEqual(h2.pipeCount(), 0); assert.strictEqual(h2.s.cash, cashN);
  ok('TEST 12: destination walled in by water -> "No valid route found" (noRoute), no pipe, no money spent');
}
{ // 13/14. outside the world, invalid endpoints
  const h = mk(); h.place('well', X, Y, 'large'); h.place('tank', X + 8, Y); h.map.block.fill(0); h.map.water.fill(0); const cash13 = h.s.cash; let n = 0;
  for (const [ex, ey] of [[-3, Y + 3], [W + 2, Y + 3], [X + 3, -5], [X + 3, H + 4], [W - 1, H]]) { const r = h.routePipe(X + 3, Y + 3, ex, ey); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'outside'); assert.strictEqual(h.buildRoute(r).ok, false); n++; }
  assert.strictEqual(h.pipeCount(), 0); assert.strictEqual(h.s.cash, cash13);
  ok('TEST 13: ' + n + ' routes ending outside the world refused ("outside"), nothing built');
  const fl = h.routePipe(X + 20, Y + 10, X + 25, Y + 10); assert.strictEqual(fl.ok, false); assert.strictEqual(fl.reason, 'floating');
  const same = h.routePipe(X + 1, Y, X + 1, Y); assert(same.ok && same.fresh.length === 1, 'a single tile beside the well is a legal pipe'); h.buildRoute(same); const again = h.routePipe(X + 1, Y, X + 1, Y); assert.strictEqual(again.ok, false); assert.strictEqual(again.reason, 'nothing'); h.removeAt(X + 1, Y);
  const wb = h.routePipe(X, Y, X + 8, Y); assert(wb.ok, 'well -> tank is fine'); const tt = h.routePipe(X + 8, Y, X, Y); assert(tt.ok);
  ok('TEST 14: invalid endpoints: a pipe in the middle of nowhere = "floating", a tile that already is a pipe = "nothing"; from/to real buildings is accepted');
}
{ // 15/16/17/18/19. money: insufficient funds, cancel, confirm, rapid confirm / cancel
  const h = mk(); h.place('well', X, Y, 'large'); h.place('tank', X + 10, Y);
  const r = h.routePipe(X + 1, Y, X + 9, Y); assert(r.ok); const cost = r.cost; assert.strictEqual(cost, 9 * CFG.COST.pipe);
  h.s.cash = cost - 1; const s0 = state(h); const b = h.buildRoute(r); assert.strictEqual(b.ok, false); assert.strictEqual(b.reason, 'cash'); assert.strictEqual(state(h), s0); assert.strictEqual(h.pipeCount(), 0);
  ok('TEST 15: ' + (cost - 1) + ' cash for a ' + cost + ' pipe -> refused ("cash"), not one tile built, not one coin spent');
  h.s.cash = 1e6; const s1 = state(h); for (let i = 0; i < 200; i++) { const q = h.routePipe(X + 1, Y + (i % 3), X + 9, Y + 2 + (i % 5), i % 2 === 0); h.routeInfo(q); }
  assert.strictEqual(state(h), s1, 'cancel = just drop the preview'); ok('TEST 16: cancel / 200 previews: cash, capex, pipes, buildings and network version unchanged; TEST 19: rapid cancel (200 previews in a row) leaves nothing behind');
  const c0 = h.s.cash; const done = h.buildRoute(r); assert(done.ok); assert.strictEqual(c0 - h.s.cash, cost, 'exactly the previewed cost'); assert.strictEqual(h.pipeCount(), 9); valid(h, 'confirmed');
  let more = 0; for (let i = 0; i < 6; i++) if (h.buildRoute(r).ok) more++; assert.strictEqual(more, 0, 'a stale preview cannot build twice'); assert.strictEqual(c0 - h.s.cash, cost, 'money was taken once'); assert.strictEqual(h.pipeCount(), 9);
  ok('TEST 17: confirm builds all 9 tiles and takes exactly ' + cost + ' (' + CFG.COST.pipe + ' x 9); TEST 18: 6 more confirms of the same preview build nothing and take nothing');
}
{ // 20-22 are touch / zoom / pan (phone test).  23/24: existing pipe crossing and endpoint connection
  const h = mk(); h.place('well', X, Y, 'large'); h.place('tank', X + 14, Y); build(h, h.routePipe(X + 1, Y, X + 13, Y)); h.place('well', X + 7, Y + 6, 'large'); h.place('tank', X + 7, Y - 8);
  const cross = h.routePipe(X + 7, Y + 5, X + 7, Y - 7); assert(!cross.ok || (cross.auto && cross.cells.slice(1, -1).every(c => !h.pipe[idx(c[0], c[1])])), 'never straight across'); const ci = cross.ok ? h.routeInfo(cross) : null; if (ci) assert.strictEqual(ci.junctions.length, 0);
  const to = h.routePipe(X + 7, Y + 5, X + 7, Y); assert(to.ok); const ti = h.routeInfo(to); assert.strictEqual(ti.junctions.length, 1); assert.strictEqual(ti.junctions[0].isNew, true); build(h, to);
  assert.strictEqual(h.net.compOf[idx(X + 7, Y + 3)], h.net.compOf[idx(X + 3, Y)], 'ending ON the pipe is a real connection'); valid(h, 'joined');
  ok('TEST 23: a route straight across a pipe is never built across it (' + (cross.ok ? 'goes around: ' + cross.cells.length + ' tiles, no junction' : 'refused: ' + cross.reason) + '); TEST 24: ending ON the pipe = one real junction, same network');
}
{ // 25. save / load after construction: same pipes, same route, same cost
  const h = mk(); h.place('well', X, Y, 'large'); h.place('tank', X + 12, Y + 5); build(h, h.routePipe(X + 1, Y, X + 12, Y + 4)); run(h, 20);
  const d = JSON.parse(JSON.stringify(h.serialize())), h2 = new G({ seed: 7 }); h2.load(d); valid(h2, 'loaded'); assert.strictEqual(h2.pipeCount(), h.pipeCount()); for (let k = 0; k < W * H; k++) assert.strictEqual(h2.pipe[k], h.pipe[k]);
  const a = h.routePipe(X + 12, Y + 4, X + 12, Y + 4), b = h2.routePipe(X + 12, Y + 4, X + 12, Y + 4); assert.strictEqual(a.ok, b.ok); run(h2, 30); assert(h2.buildings.find(b2 => b2.type === 'tank').amt > 2);
  ok('TEST 25: save/load after construction: ' + h.pipeCount() + ' pipe tiles identical, graph valid, oil keeps flowing');
}
{ // 26/27. multiple pipes, multiple buildings
  const h = mk(); let nb = 0, np = 0;
  for (let i = 0; i < 6; i++) { const y = Y - 10 + i * 4; h.place('well', X, y, 'large'); h.place('tank', X + 12 + (i % 3) * 3, y); const r = h.routePipe(X + 1, y, X + 11 + (i % 3) * 3, y); build(h, r); np++; nb += 2; }
  assert.strictEqual(h.buildings.length, nb); run(h, 40); valid(h, 'running'); const tot = h.buildings.filter(b => b.type === 'tank').reduce((a, t) => a + t.amt, 0); assert(tot > 30, 'every line delivers: ' + tot);
  assert.strictEqual(h.net.comps.length, 6, 'six separate networks, none linked by accident'); for (const w of h.buildings.filter(b => b.type === 'well')) assert(w.q > 1, 'well ' + w.id);
  ok('TEST 26-27: ' + np + ' pipes between ' + nb + ' buildings: ' + h.net.comps.length + ' independent networks, every well delivers (' + tot.toFixed(0) + ' bbl in the tanks)');
}
{ // 28/29. the whole 10x world: long routes on the natural map, speed
  const h = mk(11, false); const land = (x, y) => !h.map.block[idx(x, y)] && !h.occ[idx(x, y)]; let found = null;
  for (let y = 30; y < 60 && !found; y++) for (let x = 6; x < 20 && !found; x++) if (land(x, y)) for (let x2 = 125; x2 > 110; x2--) if (land(x2, y)) { found = [x, y, x2, y]; break; }
  assert(found, 'two land spots at opposite ends of the world'); h.place('well', found[0], found[1]);
  // a tank needs a free 2x2; use a well as the far anchor instead (any building is a legal end)
  h.place('well', found[2], found[3]);
  const t0 = process.hrtime.bigint(); const r = h.routePipe(found[0], found[1], found[2], found[3]); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert(r.ok || r.reason === 'noRoute', 'a verdict: ' + r.reason); assert(axisOnly(r.cells)); if (r.ok) { build(h, r); }
  ok('TEST 28: well at x=' + found[0] + ' -> building at x=' + found[2] + ' across the 140-wide world: ' + (r.ok ? r.cells.length + ' tiles, ' + corners(r.cells) + ' corners' + (r.auto ? ' (auto-routed)' : '') + ', built' : 'verdict "' + r.reason + '"') + ' in ' + ms.toFixed(1) + ' ms');
  // speed of the detour search: 300 random queries over a world with obstacles
  const h2 = mk(5, false); let seed = 99; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; const spots = [];
  for (let i = 0; i < 400 && spots.length < 24; i++) { const x = 4 + ((rnd() * 130) | 0), y = 4 + ((rnd() * 78) | 0); if (h2.place('well', x, y).ok) spots.push([x, y]); }
  let worst = 0, tot = 0, n = 0, auto = 0, none = 0, built = 0; const T0 = process.hrtime.bigint();
  for (let i = 0; i < 300; i++) { const a = spots[(rnd() * spots.length) | 0], b = spots[(rnd() * spots.length) | 0]; if (a === b) continue; const t1 = process.hrtime.bigint(); const q = h2.routePipe(a[0], a[1], b[0], b[1], rnd() < .5); const d = Number(process.hrtime.bigint() - t1) / 1e6; worst = Math.max(worst, d); tot += d; n++; if (q.auto) auto++; if (q.reason === 'noRoute') none++; if (q.ok) { assert(axisOnly(q.cells)); if (i % 5 === 0) { assert(h2.buildRoute(q).ok); built++; valid(h2, 'big world ' + i); } } }
  assert(worst < 120, 'worst query ' + worst.toFixed(1) + ' ms'); assert(tot / n < 25);
  ok('TEST 29: ' + n + ' long routes between random buildings of the 140x88 world: avg ' + (tot / n).toFixed(2) + ' ms, worst ' + worst.toFixed(1) + ' ms (' + auto + ' needed a detour, ' + none + ' had no route, ' + built + ' built and validated)');
}
{ // 30. a failed confirm leaves nothing behind: the world changes between preview and confirm
  const h = mk(); h.place('well', X, Y, 'large'); h.place('tank', X + 12, Y + 5); const r = h.routePipe(X + 1, Y, X + 12, Y + 4); assert(r.ok && r.fresh.length > 8);
  const mid = r.cells[(r.cells.length / 2) | 0]; h.map.block[idx(mid[0], mid[1])] = 1; h.map.water[idx(mid[0], mid[1])] = 1;                       // a tile in the middle of the route becomes water
  const s0 = state(h), b = h.buildRoute(r); assert.strictEqual(b.ok, false); assert.strictEqual(b.reason, 'water'); assert.strictEqual(state(h), s0); for (const k of r.fresh) assert.strictEqual(h.pipe[k], 0, 'not even the first tiles');
  h.map.block[idx(mid[0], mid[1])] = 0; h.map.water[idx(mid[0], mid[1])] = 0; h.place('well', mid[0], mid[1] + 3); const r2 = h.routePipe(X + 1, Y, X + 12, Y + 4);
  h.occ[idx(r2.cells[2][0], r2.cells[2][1])] = h.buildings[0]; const s1 = state(h); assert.strictEqual(h.buildRoute(r2).ok, false); assert.strictEqual(state(h), s1); h.occ[idx(r2.cells[2][0], r2.cells[2][1])] = null;
  const r3 = h.routePipe(X + 1, Y, X + 12, Y + 4); h.s.cash = r3.cost - 5; assert.strictEqual(h.buildRoute(r3).reason, 'cash'); assert.strictEqual(h.pipeCount(), 0); valid(h, 'after failures');
  ok('TEST 30: route valid at preview, then water / a building appears on it / the money is gone -> confirm refused with the reason, 0 tiles built, money unchanged - never a partial pipe');
}
{ // cost = sum of the real tile prices (terrain x region), shown before and taken after
  CFG.TERRAIN.MULT = [1, 0.85, 1.25, 1.5]; const h = mk(); h.place('well', X, Y, 'large'); h.place('tank', X + 10, Y + 4); const r = h.routePipe(X + 1, Y, X + 10, Y + 4); let sum = 0; for (const k of r.fresh) sum += Math.round(CFG.COST.pipe * h.tileMult(k % W, (k / W) | 0));
  assert.strictEqual(r.cost, sum); const c0 = h.s.cash; h.buildRoute(r); assert.strictEqual(c0 - h.s.cash, sum); CFG.TERRAIN.MULT = [1, 1, 1, 1];
  ok('TEST 31: cost = sum over the real tiles of (pipe price x terrain x region) = ' + sum + ', shown in the preview and taken exactly once on confirm');
}
console.log('\nALL PHASE 15 CORE TESTS PASSED');
