// Phase 14 (placement validation 4/20): footprints, world bounds, overlap, states, revalidation, exact cost, speed. Core only.
const assert = require('assert');
const { Game: G, CFG, idx } = require('./core.js');
CFG.TERRAIN.MULT = [1, 1, 1, 1]; CFG.REGIONS.forEach(r => { r.mult = 1; });
const W = CFG.GRID_COLS, H = CFG.GRID_ROWS;
const ok = m => console.log('  ok  ' + m);
function mk(seed) { const h = new G({ seed: seed || 7 }); h.s.cash = 1e8; h.s.regions.forEach(r => { r.unlocked = true; }); for (const a of h.areas) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; } return h; }
function flat(h) { for (let k = 0; k < W * H; k++) { h.map.block[k] = 0; h.map.water[k] = 0; } }
const valid = (h, w) => { const p = h.validateNetwork(); assert.deepStrictEqual(p, [], w + ': ' + p.slice(0, 3).join(' | ')); };

{ // 1. footprints come from one table
  const h = mk(); assert.deepStrictEqual(h.footprintOf('well'), [1, 1]); assert.deepStrictEqual(h.footprintOf('tank'), [2, 2]); assert.deepStrictEqual(h.footprintOf('pump'), [1, 1]);
  flat(h); const t = h.place('tank', 50, 40).building; assert.deepStrictEqual(h.cellsOf(t).sort((a, b) => a - b), [idx(50, 40), idx(51, 40), idx(50, 41), idx(51, 41)].sort((a, b) => a - b)); for (const k of h.cellsOf(t)) assert.strictEqual(h.occ[k], t);
  ok('TEST 1: footprints: well 1x1, tank 2x2 (4 registered cells), pump 1x1 - one table (CFG.FOOTPRINT) feeds cellsOf, canPlace, price and spots');
}
{ // 2. world bounds: every edge and corner, whole footprint, three types
  const h = mk(); flat(h); let n = 0;
  const edge = (type, x, y, want) => { const r = h.placement(type, x, y); assert.strictEqual(r.ok, false, type + ' ' + [x, y]); assert.strictEqual(r.state, 'INVALID'); assert.strictEqual(r.kind, 'OUT_OF_BOUNDS'); assert.strictEqual(r.reason, want, type + ' ' + [x, y] + ' ' + r.reason); assert.strictEqual(h.place(type, x, y).ok, false); n++; };
  for (const [x, y] of [[-1, 10], [10, -1], [W, 10], [10, H], [-5, -5], [W + 3, H + 3]]) { edge('well', x, y, 'outside'); edge('tank', x, y, 'outside'); edge('pump', x, y, 'outside'); }
  for (const [x, y] of [[W - 1, 10], [10, H - 1], [W - 1, H - 1]]) edge('tank', x, y, 'edge');          // anchor inside, part of the 2x2 outside
  for (const [type, x, y] of [['well', 0, 0], ['well', W - 1, H - 1], ['tank', 0, 0], ['tank', W - 2, H - 2], ['tank', W - 2, 0], ['tank', 0, H - 2]]) { const r = h.placement(type, x, y); assert(r.ok, type + ' ' + [x, y] + ' ' + r.reason); }
  assert.deepStrictEqual(h.buildings, []); assert.strictEqual(h.s.cash, 1e8);
  ok('TEST 2: ' + n + ' out-of-world attempts refused (anchor outside = "outside", footprint sticking out = "edge"), nothing built, no money moved; all four corners accept a tank that fits exactly');
}
{ // 3. overlap matrix: any type over any existing type, anchor vs corner overlap reasons
  const h = mk(); flat(h); const X = 40, Y = 40;
  h.place('well', X, Y); h.place('tank', X + 5, Y); h.buildRoute(h.routePipe(X + 1, Y, X + 4, Y, false)); const pump = h.place('pump', X + 2, Y); assert(pump.ok, 'pump on a straight pipe: ' + pump.reason);
  let n = 0;
  for (const type of ['well', 'tank', 'pump']) for (const [name, cells] of [['well', [[X, Y]]], ['tank', [[X + 5, Y], [X + 6, Y], [X + 5, Y + 1], [X + 6, Y + 1]]], ['pump', [[X + 2, Y]]]]) for (const [cx, cy] of cells) {
    const r = h.placement(type, cx, cy); assert.strictEqual(r.ok, false, type + ' on ' + name + ' ' + [cx, cy]); assert(['OCCUPIED', 'OVERLAPPING'].includes(r.kind), type + ' on ' + name + ': ' + r.kind + ' ' + r.reason); assert.strictEqual(h.place(type, cx, cy).ok, false); n++; }
  // a 2x2 tank whose far corner clips the existing tank / well is OVERLAPPING; its anchor on a building is OCCUPIED
  const clip = h.placement('tank', X + 6, Y - 1); assert.strictEqual(clip.kind, 'OVERLAPPING'); assert.strictEqual(clip.reason, 'overlap'); const own = h.placement('tank', X + 5, Y); assert.strictEqual(own.reason, 'occupied'); assert.strictEqual(own.kind, 'OCCUPIED');
  const clipW = h.placement('tank', X - 1, Y - 1); assert.strictEqual(clipW.reason, 'overlap');
  ok('TEST 3: ' + n + ' overlap attempts (well/tank/pump over well/tank/pump, every covered cell) all refused; a tank clipping a neighbour with one corner = "overlap" (OVERLAPPING), anchor on a building = "occupied" (OCCUPIED)');
  // beside existing buildings is allowed - no invented gaps
  for (const [type, x, y] of [['well', X, Y + 1], ['well', X, Y - 1], ['well', X - 1, Y], ['tank', X + 7, Y], ['tank', X + 5, Y + 2], ['tank', X + 3, Y + 2]]) { const r = h.placement(type, x, y); assert(r.ok, type + ' beside at ' + [x, y] + ': ' + r.reason); }
  // Phase B rule: beside the MIDDLE of a pipe (would connect by accident) is refused with its own reason
  { const r = h.placement('well', X + 1, Y + 1); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'touchesPipe'); }
  ok('TEST 4: placing directly beside existing buildings (touching edges, no gap) is valid - efficient use of land');
}
{ // 5. states and exact money
  const h = mk(); flat(h); h.s.cash = 1000; let r = h.placement('tank', 50, 40); assert.strictEqual(r.state, 'UNAFFORDABLE'); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'cash'); assert.strictEqual(r.cost, 1500); assert.strictEqual(h.place('tank', 50, 40).ok, false); assert.strictEqual(h.s.cash, 1000); assert.strictEqual(h.buildings.length, 0);
  h.s.cash = 5000; r = h.placement('tank', 50, 40); assert.strictEqual(r.state, 'VALID'); assert(r.ok); assert.strictEqual(r.cells.length, 4);
  for (let i = 0; i < 20; i++) h.placement('tank', 50, 40);                                     // previewing any number of times costs nothing
  assert.strictEqual(h.s.cash, 5000);
  const b = h.place('tank', 50, 40); assert(b.ok); assert.strictEqual(b.cost, r.cost); assert.strictEqual(h.s.cash, 5000 - r.cost, 'exactly the previewed price');
  assert.strictEqual(h.place('tank', 50, 40).ok, false); assert.strictEqual(h.s.cash, 5000 - r.cost, 'a repeated confirm does not charge again'); assert.strictEqual(h.buildings.length, 1);
  assert.strictEqual(h.placement('well', 50, 40).state, 'INVALID');                              // INVALID wins over money when the spot is bad
  h.s.cash = 10; assert.strictEqual(h.placement('well', 50, 40).state, 'INVALID'); valid(h, 'states');
  ok('TEST 5: states VALID / INVALID / UNAFFORDABLE; 20 previews cost $0; confirm charges exactly the previewed $' + r.cost + ' once; a repeat confirm and an unaffordable confirm change nothing');
}
{ // 6. confirm revalidates against the CURRENT state (stale preview)
  const h = mk(); flat(h); const pv = h.placement('tank', 60, 40); assert(pv.ok); h.place('well', 61, 41);                           // the spot is taken after the preview
  const cash = h.s.cash; const r = h.place('tank', 60, 40); assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'overlap'); assert.strictEqual(h.s.cash, cash); assert.strictEqual(h.buildings.length, 1);
  h.map.water[idx(70, 40)] = 1; assert.strictEqual(h.place('well', 70, 40).ok, false);   // the terrain turned into water after the preview
  h.s.cash = 0; assert.strictEqual(h.place('well', 72, 40).ok, false); assert.strictEqual(h.s.cash, 0); valid(h, 'stale');
  ok('TEST 6: Confirm revalidates on the live state: spot taken after the preview -> refused ("overlap"), terrain changed -> refused, money gone -> refused; nothing charged or created');
}
{ // 7. restricted areas / terrain keep working and are classified
  const h = new G({ seed: 7 }); h.s.cash = 1e8; flat(h); const locked = h.areas.find(a => a.land && !h.regionOpen(a.region)); if (locked) { const r = h.placement('tank', locked.ax * 4 + 1, locked.ay * 4 + 1); assert.strictEqual(r.kind, 'RESTRICTED_AREA'); assert.strictEqual(r.reason, 'locked'); }
  const un = h.areas.find(a => a.land && h.regionOpen(a.region) && a.st !== 2); if (un) { const r = h.placement('well', un.ax * 4 + 1, un.ay * 4 + 1); assert.strictEqual(r.kind, 'RESTRICTED_AREA'); assert.strictEqual(r.reason, 'notExplored'); }
  h.map.water[idx(50, 40)] = 1; assert.strictEqual(h.placement('tank', 49, 39).reason, 'water'); assert.strictEqual(h.placement('tank', 49, 39).kind, 'TERRAIN'); h.map.water[idx(50, 40)] = 0; h.map.block[idx(51, 41)] = 1; assert.strictEqual(h.placement('tank', 50, 40).reason, 'blocked');
  ok('TEST 7: locked region / unexplored area -> RESTRICTED_AREA, water / blocked tile under any corner of the footprint -> TERRAIN (existing rules preserved and classified)');
}
{ // 8. fuzz over the whole 140x88 world: invariants hold, placement() agrees with place(), refused attempts never change state
  const h = mk(11); flat(h); let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; let built = 0, refused = 0;
  for (let i = 0; i < 3000; i++) {
    const type = ['well', 'tank', 'pump'][(rnd() * 3) | 0], x = ((rnd() * (W + 6)) | 0) - 3, y = ((rnd() * (H + 6)) | 0) - 3, cash = h.s.cash, nb = h.buildings.length, pl = h.placement(type, x, y);
    const r = h.place(type, x, y); assert.strictEqual(!!r.ok, pl.ok, type + ' ' + [x, y] + ' placement() and place() disagree: ' + pl.reason + '/' + r.reason);
    if (r.ok) { built++; assert.strictEqual(cash - h.s.cash, pl.cost, 'charged exactly the quoted price'); assert.strictEqual(h.buildings.length, nb + 1); } else { refused++; assert.strictEqual(h.s.cash, cash); assert.strictEqual(h.buildings.length, nb); }
    if (i % 250 === 0) valid(h, 'fuzz ' + i);
  }
  valid(h, 'fuzz end'); assert(built > 100 && refused > 500, built + '/' + refused);
  ok('TEST 8: 3000 random placements across the whole 140x88 world (incl. outside it): ' + built + ' built, ' + refused + ' refused; placement() == place() every time; price exact; refusals change nothing; no overlaps / outside buildings / unregistered cells');
}
{ // 9. speed: validation must be a grid lookup, not a scan
  const h = mk(); flat(h); for (let i = 0; i < 400; i++) h.place(['well', 'tank'][i % 2], 4 + (i % 20) * 6, 4 + ((i / 20) | 0) * 4);
  assert(h.buildings.length > 300); let t = process.hrtime.bigint(); let c = 0; for (let i = 0; i < 100000; i++) { c += h.placement('tank', i % W, (i * 7) % H).ok ? 1 : 0; } const ms = Number(process.hrtime.bigint() - t) / 1e6;
  assert(ms < 1500, 'placement() x 100000 took ' + ms + ' ms with ' + h.buildings.length + ' buildings'); ok('TEST 9: 100,000 placement() checks on a world with ' + h.buildings.length + ' buildings took ' + ms.toFixed(0) + ' ms (' + (ms * 1000 / 100000).toFixed(2) + ' us each): grid lookups, no object scan');
}
console.log('ALL PHASE 14 CORE TESTS PASSED');
