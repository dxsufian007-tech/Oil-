// Phase 23: node-to-node pipe entities + auto-routing (core). Every scenario ends with validateNetwork (graph + hydraulics + pipe entities).
const assert = require('assert');
const { Game: G, CFG, idx } = require('./core.js');
CFG.TERRAIN.MULT = [1, 1, 1, 1]; CFG.REGIONS.forEach(r => { r.mult = 1; });
CFG.PIPE.LEAK_PER_TILE_MIN = 0; CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
const W = CFG.GRID_COLS, ok = m => console.log('  ok  ' + m);
const run = (g, sec) => { for (let i = 0; i < Math.round(sec / 0.1); i++) g.step(0.1); };
const valid = (g, w) => { const p = g.validateNetwork(); assert.deepStrictEqual(p, [], w + ': ' + p.slice(0, 4).join(' | ')); };
function mk() { const h = new G({ seed: 7 }); h.s.cash = 1e8; h.s.regions.forEach(r => { r.unlocked = true; }); for (const a of h.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; } for (let y = 20; y < 70; y++) for (let x = 25; x < 100; x++) { const k = idx(x, y); h.map.block[k] = 0; h.map.water[k] = 0; } return h; }
const X = 40, Y = 40, B = b => 'B' + b.id;
const connect = (h, a, b, type) => { const r = h.routeNodes(a, b, type); assert(r.ok, 'route ' + a + '->' + b + ': ' + r.reason); const res = h.buildLine(r); assert(res.ok, 'build ' + a + '->' + b + ': ' + res.reason + ' ' + JSON.stringify(res.detail || '')); valid(h, a + '->' + b); return res.line; };
let t0;
{ // 1. Well -> Storage: tap two NODES, the router picks the sides; one entity whose ends are exactly those nodes; oil flows
  const h = mk(), w = h.place('well', X, Y, 'large').building, t = h.place('tank', X + 10, Y + 4).building;
  const cash = h.s.cash, r = h.routeNodes(B(w), B(t)); assert(r.ok, r.reason); assert.strictEqual(h.s.cash, cash, 'routing costs nothing'); assert.strictEqual(h.lines.length, 0, 'a preview creates nothing');
  const L = connect(h, B(w), B(t)); assert.strictEqual(h.lines.length, 1); assert.strictEqual(L.a, B(w)); assert.strictEqual(L.b, B(t)); assert.strictEqual(L.cells.length, r.fresh.length);
  run(h, 30); assert(w.q > 1 && t.amt > 0); ok('1. well -> tank by node IDs: line #' + L.id + ' ' + L.a + ' -> ' + L.b + ', ' + L.cells.length + ' tiles, preview == built route, oil flows (q=' + w.q.toFixed(1) + ')');
}
{ // 2. Well -> Pump -> Storage (pump placed on the line, two lines meeting at the pump node)
  const h = mk(), w = h.place('well', X, Y, 'large').building, t = h.place('tank', X + 14, Y).building; connect(h, B(w), B(t));
  const p = h.place('pump', X + 7, Y); assert(p.ok, p.reason); valid(h, 'pump on line'); const ls = h.lines.filter(L => L.a === B(p.building) || L.b === B(p.building));
  assert.strictEqual(ls.length, 2, 'the line is split at the pump into well->pump and pump->tank: ' + JSON.stringify(h.lines.map(L => [L.a, L.b])));
  run(h, 30); assert(t.amt > 0); ok('2. well -> pump -> tank: lines ' + h.lines.map(L => L.a + '->' + L.b).join(', ') + ', oil reaches the tank');
}
{ // 3. tank -> tank (storage to storage) and 9. junction with several connections
  const h = mk(), w = h.place('well', X, Y, 'large').building, A = h.place('tank', X + 12, Y).building, Bt = h.place('tank', X + 6, Y + 9).building, C = h.place('tank', X + 6, Y - 9).building;
  const L1 = connect(h, B(w), B(A)); const mid = L1.cells[Math.floor(L1.cells.length / 2)];
  const L2 = connect(h, 'J' + mid, B(Bt)); const L3 = connect(h, 'J' + mid, B(C));
  assert(L2.a.startsWith('J') || L2.a.startsWith('B')); const node = h.graphNode(mid); assert(node && node.kind === 'J' || h.net.type[mid] === 1, 'junction tile');
  const comp = k => h.net.compOf[k]; assert(comp(L2.cells[0]) === comp(mid) && comp(L3.cells[0]) === comp(mid) && comp(L1.cells[0]) === comp(mid), 'one network');
  assert.strictEqual(L2.b, B(Bt)); assert.strictEqual(L3.b, B(C));
  A.amt = h.tankCap(A); h.hyd.dirty = true; run(h, 60); assert(Bt.amt > 0 || C.amt > 0, [A.amt, Bt.amt, C.amt].join()); ok('3/9. junction on an existing pipe (tile ' + mid + ') joins 3 branches into one network; with tank A full the oil goes down a branch (B ' + Bt.amt.toFixed(0) + ', C ' + C.amt.toFixed(0) + ')');
  const L4 = connect(h, B(A), B(Bt)); ok('3. storage -> storage pipe: ' + L4.a + ' -> ' + L4.b);
}
{ // 4. invalid nodes, 5. duplicate, same node
  const h = mk(), w = h.place('well', X, Y, 'large').building, t = h.place('tank', X + 10, Y).building;
  assert.strictEqual(h.routeNodes('B999', B(t)).reason, 'badNode'); assert.strictEqual(h.routeNodes('J' + idx(X + 3, Y + 3), B(t)).reason, 'badNode'); assert.strictEqual(h.routeNodes(B(w), B(w)).reason, 'sameNode');
  connect(h, B(w), B(t)); const d = h.routeNodes(B(t), B(w)); assert.strictEqual(d.reason, 'duplicate'); const cash = h.s.cash; assert(!h.buildLine(d).ok); assert.strictEqual(h.s.cash, cash); assert.strictEqual(h.lines.length, 1);
  ok('4/5. unknown node, empty tile, same node -> refused with a reason; the same pair twice -> "duplicate", nothing built, no money taken');
}
{ // 6. a building in the way -> the route goes round it; 7. impossible route
  const h = mk(), w = h.place('well', X, Y, 'large').building, t = h.place('tank', X + 16, Y).building; h.place('tank', X + 8, Y - 1); h.place('tank', X + 8, Y + 1);
  const r = h.routeNodes(B(w), B(t)); assert(r.ok, r.reason); for (const c of r.cells) assert(!h.occ[idx(c[0], c[1])], 'never through a building'); connect(h, B(w), B(t)); ok('6. two tanks in the way: auto route goes round them (' + r.cells.length + ' tiles), never through a building');
  const h2 = mk(), w2 = h2.place('well', X, Y, 'large').building, t2 = h2.place('tank', X + 20, Y).building;
  for (let y = 0; y < CFG.GRID_ROWS; y++) { h2.map.water[idx(X + 10, y)] = 1; h2.map.block[idx(X + 10, y)] = 1; } const r2 = h2.routeNodes(B(w2), B(t2)); assert(!r2.ok); assert.strictEqual(h2.lines.length, 0); ok('7. a river across the whole map: no route ("' + r2.reason + '"), nothing built');
}
{ // 10. delete a pipe tile -> the entity splits, ends become open; 11. delete a building -> the line end becomes open; graph valid
  const h = mk(), w = h.place('well', X, Y, 'large').building, t = h.place('tank', X + 12, Y).building; const L = connect(h, B(w), B(t)); const mid = L.cells[5];
  h.removeAt(mid % W, (mid / W) | 0); valid(h, 'tile erased'); assert.strictEqual(h.lines.length, 2); assert(h.lines.every(q => q.a[0] === 'E' || q.b[0] === 'E')); run(h, 5); assert.strictEqual((h.net.routes.get(w.id) || []).length, 0);
  ok('10. one tile erased: the pipe becomes two entities with an open end each (' + h.lines.map(q => q.a + '->' + q.b).join(', ') + '), no route');
  const h2 = mk(), w2 = h2.place('well', X, Y, 'large').building, t2 = h2.place('tank', X + 12, Y).building; connect(h2, B(w2), B(t2)); h2.removeAt(t2.x, t2.y); valid(h2, 'tank removed');
  assert.strictEqual(h2.lines.length, 1); assert(h2.lines[0].b[0] === 'E' || h2.lines[0].a[0] === 'E'); ok('11. tank deleted: the line now ends in an open end (' + h2.lines[0].a + '->' + h2.lines[0].b + '), no reference to the deleted tank');
}
{ // 12/13. save -> load (restart): IDs, ends, cells identical; graph rebuilt; oil still flows; 17. several pipes in a row; 18. large network + routing cost
  const h = mk(), w = h.place('well', X, Y, 'large').building; const tanks = []; for (let i = 0; i < 6; i++) tanks.push(h.place('tank', X + 8 + i * 6, Y + (i % 2 ? 8 : -8)).building);
  let prev = B(w); const L0 = connect(h, B(w), B(tanks[0])); for (let i = 1; i < 6; i++) connect(h, B(tanks[i - 1]), B(tanks[i]));
  ok('17. six pipes built one after the other: ' + h.lines.length + ' entities, no duplicates, graph valid');
  run(h, 20); const snap = JSON.stringify(h.lines.map(L => [L.id, L.a, L.b, L.type, L.cells]));
  const d = JSON.parse(JSON.stringify(h.serialize())); const h2 = new G({ seed: 7 }); h2.load(d); valid(h2, 'after load');
  assert.strictEqual(JSON.stringify(h2.lines.map(L => [L.id, L.a, L.b, L.type, L.cells])), snap); run(h2, 20); assert(h2.buildings.find(b => b.type === 'well').q > 1);
  const nl = h2.routeNodes(B(h2.buildings[0]), B(h2.buildings[3])); ok('12/13. save -> load: ' + h2.lines.length + ' pipe entities identical (IDs, start/end nodes, tiles), graph rebuilt, oil flows; next new id continues at ' + h2.s.nextLineId);
  // old save without entities: migration builds them from the tiles
  delete d.lines; const h3 = new G({ seed: 7 }); h3.load(d); valid(h3, 'old save'); assert(h3.lines.length >= 1); ok('migration: an old save (no pipe entities) gets entities built from its tiles, graph valid');
  // big network routing cost
  const hb = mk(); const ws = []; for (let i = 0; i < 8; i++) ws.push(hb.place('well', 30 + i * 8, 26, 'large').building); const tk = hb.place('tank', 60, 60).building;
  let ms = 0; for (const wl of ws) { const s0 = Date.now(); const r = hb.routeNodes(B(wl), B(tk)); ms = Math.max(ms, Date.now() - s0); if (r.ok) hb.buildLine(r); }
  valid(hb, 'big'); ok('18. 8 wells -> one tank (pipes join each other): ' + hb.lines.length + ' entities, graph valid, slowest route ' + ms + ' ms (runs only on a tap)');
}
console.log('ALL PHASE 23 CORE TESTS PASSED');
