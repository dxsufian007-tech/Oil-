// Phase 6: building system + smart oil network. Core scenarios 1-10 (the browser covers 11-12 in the UI test).
const assert = require('assert');
const { Game: Game0, CFG, idx } = require('./core.js');
CFG.TERRAIN.MULT = [1, 1, 1, 1]; CFG.REGIONS.forEach(r => { r.mult = 1; });
CFG.PIPE.LEAK_PER_TILE_MIN = 0;                                    // leaks are random: they have their own tests
const REAL_BUILD = Object.assign({}, CFG.BUILD);
const instant = () => { CFG.BUILD = { well: 0, tank: 0, pipeTile: 0, pipeMax: 0 }; };
const real = () => { CFG.BUILD = Object.assign({}, REAL_BUILD); };
const ok = m => console.log('  ok  ' + m);
const run = (g, sec) => { for (let i = 0; i < sec * 10; i++) g.step(0.1); };
function mk(seed) { const h = new Game0({ seed: seed || 7 }); h.s.cash = 1e6; h.s.regions.forEach(r => { r.unlocked = true; }); for (const a of h.areas) if (a.land && a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e6; a.potential = 500; } return h; }
function box(h, w, ht) { for (let y = 2; y < 28 - ht; y++) for (let x = 6; x < 44 - w; x++) { let f = true; for (let j = 0; j < ht && f; j++) for (let i = 0; i < w; i++) { const k = idx(x + i, y + j); if (h.map.block[k] || h.map.water[k]) { f = false; break; } } if (f) return { x, y }; } throw new Error('no free box'); }
const route = (h, a, b, c, d) => { const r = h.routePipe(a, b, c, d, false); assert(r.ok, 'route ' + [a, b, c, d] + ' ' + r.reason); assert(h.buildRoute(r).ok); };
const tanks = h => h.buildings.filter(b => b.type === 'tank');
const sumAmt = h => tanks(h).reduce((s, t) => s + t.amt, 0);
const noOver = h => { for (const t of tanks(h)) assert(t.amt <= h.tankCap(t) + 1e-9, 'inventory above capacity: ' + t.amt + ' > ' + h.tankCap(t)); };

// ---- construction is real
{
  real(); const h = mk(); const o = box(h, 14, 8);
  const w = h.place('well', o.x, o.y).building, t = h.place('tank', o.x + 8, o.y).building;
  assert(w.ready > h.s.time && t.ready > h.s.time); assert.strictEqual(h.buildings.length, 2);   // in Game State at once, unfinished
  route(h, o.x + 1, o.y, o.x + 7, o.y);
  const tiles = [...Array(7)].map((_, i) => h.pipeReady[idx(o.x + 1 + i, o.y)]); for (let i = 1; i < 7; i++) assert(tiles[i] > tiles[i - 1], 'pipe segments finish one after another');
  run(h, 3); assert.strictEqual(w.status, 'building'); assert.strictEqual(sumAmt(h), 0); assert(!h.isWellConnected(w));
  const mid = h.buildProgress(w); assert(mid > 0 && mid < 1);
  const snap = JSON.parse(JSON.stringify(h.serialize())); const h2 = new Game0({ seed: 7 }); h2.load(snap); assert(h2.buildings.find(b => b.type === 'well').ready > h2.s.time); run(h2, 8);
  assert(h2.isWellConnected(h2.buildings.find(b => b.type === 'well'))); ok('construction: objects exist in Game State immediately but are unusable until finished, pipes finish segment by segment, progress in (0,1), and a save made mid-construction finishes after loading');
  run(h, 4); assert(h.isWellConnected(w)); run(h, 20); assert(sumAmt(h) > 0); ok('after construction the well is connected and oil flows');
  instant();
}
// ---- TEST 1: well + pipe + tank
{
  const h = mk(); const o = box(h, 14, 8); h.place('well', o.x, o.y); h.place('tank', o.x + 8, o.y); route(h, o.x + 1, o.y, o.x + 7, o.y); run(h, 60);
  const w = h.buildings[0]; assert(sumAmt(h) > 9 && w.status === 'producing' && h.wellNet(w).target.id === h.buildings[1].id); noOver(h);
  ok('TEST 1: well + pipe + tank -> ' + sumAmt(h).toFixed(1) + ' BBL arrived in the tank (target tank = the connected one)');
  // conservation: produced = stored
  assert(Math.abs(h.s.produced - sumAmt(h)) < 1e-6); ok('everything produced is in the tank (no oil appears or vanishes)');
}
// ---- TEST 2/3: no pipe, broken pipe
{
  const h = mk(); const o = box(h, 14, 8); const w = h.place('well', o.x, o.y).building; h.place('tank', o.x + 8, o.y); run(h, 30);
  assert.strictEqual(sumAmt(h), 0); assert.strictEqual(w.status, 'nopipe'); assert.strictEqual(h.wellNet(w).why, 'nopipe'); ok('TEST 2: well with no pipe -> no flow (status nopipe)');
  route(h, o.x + 1, o.y, o.x + 3, o.y);                      // pipe that stops 4 tiles short of the tank
  run(h, 30); assert.strictEqual(sumAmt(h), 0); assert.strictEqual(w.status, 'nostorage'); assert(!h.isWellConnected(w)); ok('TEST 3: pipe that does not reach a tank -> no flow (status nostorage, not connected)');
  for (const k of h.net.comps.filter(c => c.pipes.length).flatMap(c => c.pipes)) assert.strictEqual(h.net.flowK[k], 0);
  const st = h.pipeStat(idx(o.x + 2, o.y)); assert.strictEqual(st.issue, 'noTank'); assert(!st.connected); ok('pipe panel data says WHY: issue = noTank');
}
// ---- TEST 4/10: two tanks, path distance beats map distance, a shorter path updates the target
{
  const h = mk(); const o = box(h, 11, 8), X = o.x, Y = o.y;
  const w = h.place('well', X, Y).building;
  const B = h.place('tank', X + 8, Y).building;                 // far on the map, short pipe
  const A = h.place('tank', X + 2, Y + 3).building;             // close on the map, but only reachable the long way round
  route(h, X + 1, Y, X + 7, Y);                                  // short trunk to B (7 tiles)
  route(h, X, Y + 1, X, Y + 6); route(h, X, Y + 6, X + 4, Y + 6); route(h, X + 4, Y + 6, X + 4, Y + 4);   // long way to A
  const rt = h.net.routes.get(w.id); assert.strictEqual(rt.length, 2); assert(rt[0].tank === B && rt[0].len < rt[1].len, 'B is closer by pipe');
  assert(Math.hypot(A.x - w.x, A.y - w.y) < Math.hypot(B.x - w.x, B.y - w.y)); run(h, 60);
  assert.strictEqual(w.target, B.id); assert(B.amt > 5 && A.amt === 0); ok('TEST 4: well reaches two tanks; A is nearer on the map (' + Math.hypot(A.x - w.x, A.y - w.y).toFixed(1) + ') but B is nearer by pipe (' + rt[0].len + ' vs ' + rt[1].len + ' tiles) -> oil goes to B only');
  // TEST 5: nearest tank full -> the other
  B.amt = h.tankCap(B); run(h, 30); assert.strictEqual(w.target, A.id); assert(A.amt > 3); assert.strictEqual(B.amt, h.tankCap(B)); ok('TEST 5: nearest tank full -> target switches to the next valid tank (A got ' + A.amt.toFixed(1) + ' BBL)');
  // TEST 6: all full
  A.amt = h.tankCap(A) - 0.5; run(h, 60); assert.strictEqual(A.amt, h.tankCap(A)); assert.strictEqual(w.status, 'full'); assert.strictEqual(h.wellNet(w).why, 'full'); noOver(h); const prodBefore = h.s.produced; run(h, 30); assert.strictEqual(h.s.produced, prodBefore); assert.strictEqual(w.out, 0);
  ok('TEST 6: every tank full -> inventory stays at capacity (never above), well status full, nothing is extracted'); A.amt = 0; B.amt = 0;
  // selling frees room -> flow returns to the nearest valid tank (B)
  run(h, 20); assert.strictEqual(w.target, B.id); assert(B.amt > 0); ok('room appears again -> flow returns to the nearest tank');
  // TEST 10: a new pipe opens a shorter path to A
  route(h, X + 2, Y, X + 2, Y + 2);                              // trunk tile (X+2,Y) -> down to tank A's top edge
  const rt2 = h.net.routes.get(w.id); assert(rt2[0].tank === A && rt2[0].len < rt2[1].len, 'routes were recalculated'); B.amt = 0; A.amt = 0; run(h, 30);
  assert.strictEqual(w.target, A.id); assert(A.amt > 3 && B.amt === 0); ok('TEST 10: a new pipe opens a shorter path -> routes recalculated, target = A (' + rt2[0].len + ' tiles now), path and oil follow');
}
// ---- TEST 7/8: cut + reconnect
{
  const h = mk(); const o = box(h, 14, 8); const w = h.place('well', o.x, o.y).building; const T = h.place('tank', o.x + 8, o.y).building; route(h, o.x + 1, o.y, o.x + 7, o.y); run(h, 30);
  const a0 = T.amt; assert(a0 > 3);
  h.removeAt(o.x + 4, o.y); run(h, 30); assert.strictEqual(T.amt, a0); assert.strictEqual(w.status, 'nostorage'); assert.strictEqual(h.pipeStat(idx(o.x + 6, o.y)).flow, 0); ok('TEST 7: pipe removed -> no flow through it (tank stays at ' + a0.toFixed(1) + ')');
  route(h, o.x + 3, o.y, o.x + 5, o.y); run(h, 30); assert(T.amt > a0 + 3); assert.strictEqual(w.status, 'producing'); ok('TEST 8: pipe rebuilt -> flow returns (tank ' + a0.toFixed(1) + ' -> ' + T.amt.toFixed(1) + ')');
}
// ---- TEST 9: production > capacity
{
  const h = mk(); const o = box(h, 10, 6); const ws = []; for (let i = 0; i < 3; i++) ws.push(h.place('well', o.x, o.y + i * 2, 'large').building);
  const T = h.place('tank', o.x + 8, o.y).building; for (let i = 0; i < 4; i++) h.upgrade(T);
  route(h, o.x + 1, o.y, o.x + 1, o.y + 4); route(h, o.x + 1, o.y, o.x + 7, o.y);
  const want = ws.reduce((s, w) => s + w.rate, 0); assert(want > 60, 'wells want ' + want);
  const a0 = T.amt; run(h, 60); const got = T.amt - a0;
  assert(got <= 25 + 1e-6 && got > 23, 'carried ' + got); assert(ws.every(w => w.status === 'limited')); noOver(h);
  for (const k of h.net.comps.flatMap(c => c.pipes)) assert(h.net.flowK[k] <= h.pipeStat(k).cap + 1e-6, 'tile flow above capacity');
  ok('TEST 9: wells want ' + want.toFixed(0) + '/min, pipes carry ' + got.toFixed(1) + '/min (cap 25), every tile <= capacity, wells show "limited"');
  // production -> capacity -> actual flow -> inventory all agree
  const c = h.net.comps.find(c => c.pipes.length); const g0 = h.s.produced, t0 = sumAmt(h); run(h, 30); assert(Math.abs((h.s.produced - g0) - (sumAmt(h) - t0)) < 1e-6); ok('production = actual flow = inventory change (consistent)');
}
// ---- several wells, several tanks: each well picks its own nearest tank
{
  const h = mk(); const o = box(h, 19, 4), X = o.x, Y = o.y;
  const W1 = h.place('well', X, Y).building, W2 = h.place('well', X, Y + 2).building, W3 = h.place('well', X + 17, Y).building;
  const T1 = h.place('tank', X + 4, Y).building, T2 = h.place('tank', X + 12, Y).building;
  route(h, X + 1, Y, X + 3, Y); route(h, X + 1, Y + 2, X + 1, Y); route(h, X + 3, Y, X + 3, Y + 2); route(h, X + 3, Y + 2, X + 12, Y + 2); route(h, X + 14, Y, X + 16, Y);   // T1 and T2 share one network; W3 only touches T2
  run(h, 60); assert.strictEqual(W1.target, T1.id); assert.strictEqual(W2.target, T1.id); assert.strictEqual(W3.target, T2.id); noOver(h);
  assert(T1.amt > 15 && T2.amt > 5); assert.deepStrictEqual(h.tankNet(T1).feeding.map(w => w.id).sort(), [W1.id, W2.id].sort()); assert(h.tankNet(T1).inflow > 5);
  ok('W1 -> T1, W2 -> T1, W3 -> T2 (' + [W1, W2, W3].map(w => w.target).join(',') + '); tank panel data: feeding wells ' + h.tankNet(T1).feeding.length + ', incoming ' + h.tankNet(T1).inflow.toFixed(1) + '/min');
  // flow through every tile points somewhere real and the direction ends in a tank
  let tiles = 0; for (const k of h.net.comps.flatMap(c => c.pipes)) if (h.net.flowK[k] > 0) { tiles++; const n = h.net.fnext[k]; assert(n >= 0 && (h.pipe[n] || (h.occ[n] && h.occ[n].type === 'tank'))); } assert(tiles > 3); ok('flow direction of ' + tiles + ' carrying tiles follows the real path (each points to the next pipe tile or a tank)');
  // every tank cap is respected under stress
  for (const t of [T1, T2]) t.amt = h.tankCap(t) - 1; run(h, 120); noOver(h); ok('stress: tanks nearly full, 3 wells pushing: inventory never above capacity');
}
// ---- save / load keeps targets and flow state consistent
{
  const h = mk(); const o = box(h, 14, 8); h.place('well', o.x, o.y); h.place('tank', o.x + 8, o.y); route(h, o.x + 1, o.y, o.x + 7, o.y); run(h, 40);
  const d = JSON.parse(JSON.stringify(h.serialize())); const h2 = new Game0({ seed: 7 }); h2.load(d); run(h2, 1); const w2 = h2.buildings[0];
  assert(h2.isWellConnected(w2) && w2.target === h2.buildings[1].id && Math.abs(sumAmt(h2) - sumAmt(h)) < 1.5); ok('save -> load: network and target are rebuilt from Game State, inventory kept');
}
// ---- performance: the network is not recomputed per step
{
  const h = mk(); const o = box(h, 14, 8); h.place('well', o.x, o.y); h.place('tank', o.x + 8, o.y); route(h, o.x + 1, o.y, o.x + 7, o.y); run(h, 5);
  const v = h.netVersion; run(h, 60); assert.strictEqual(h.netVersion, v); const t0 = process.hrtime.bigint(); run(h, 600); const ms = Number(process.hrtime.bigint() - t0) / 1e6; ok('no network rebuild during 65 s of steady flow (version ' + v + '); 6000 steps in ' + ms.toFixed(0) + ' ms');
}
console.log('ALL PHASE 6 CORE TESTS PASSED');
