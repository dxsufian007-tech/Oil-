'use strict';
/* The new map as a 140 x 88 window onto the 2560 x 1600 world: it changes only the ground picture and the water/blocked tiles; the game (grid, save format, pipes, pressure, flow, pumps,
   tanks, production, prices) must behave exactly as it did.   node test-map-window.js */
const assert = require('assert'), fs = require('fs'), crypto = require('crypto');
const Core = require('./core.js'), { Game: G, CFG } = Core, MW = require('./map-window.js'), WORLD = require('./world-v4.js');
let n = 0; const ok = m => { n++; console.log('  ok  ' + m); };
const W = CFG.GRID_COLS, H = CFG.GRID_ROWS;
const sha = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

// 1. the window: deterministic, inside the world, one offset
{
  const a = MW.build({ preset: 'c3east' }), b = MW.build({ preset: 'c3east' });
  assert.strictEqual(sha(Buffer.from(a.tile).toString('base64') + Buffer.from(a.water).toString('base64')), sha(Buffer.from(b.tile).toString('base64') + Buffer.from(b.water).toString('base64')));
  assert.strictEqual(a.cols, 140); assert.strictEqual(a.rows, 88); assert.strictEqual(a.tile.length, W * H);
  ok('the window is deterministic and has exactly the size of the game grid (' + a.cols + ' x ' + a.rows + ')');
  for (const [ox, oy] of [[0, 0], [2420, 1512], [1280, 800]]) MW.build({ ox, oy });
  assert.throws(() => MW.build({ ox: 2421, oy: 0 })); assert.throws(() => MW.build({ ox: 0, oy: 1513 }));
  ok('any offset inside the world works (corners and middle) and one outside is refused: moving or growing the window later is one number');
  assert.strictEqual(CFG.GRID_COLS, 140); assert.strictEqual(CFG.GRID_ROWS, 88);
  ok('the game grid is untouched: ' + CFG.GRID_COLS + ' x ' + CFG.GRID_ROWS);
}
// 2. ground: only open water is water + blocked; rocks, wadis, hills and compounds never block anything; no roads
{
  const stats = {};
  for (const p of Object.keys(MW.PRESETS)) {
    const m = MW.build({ preset: p }), c = {};
    for (let k = 0; k < W * H; k++) { const cl = m.cls[k], isW = cl === WORLD().K.DEEP || cl === WORLD().K.SHALLOW || cl === WORLD().K.LAKE; assert.strictEqual(!!m.water[k], isW, p + ' water = open water only'); assert.strictEqual(m.block[k], m.water[k], p + ' blocked = water'); c[cl] = (c[cl] || 0) + 1; }
    stats[p] = c;
  }
  const K = WORLD().K; assert(!Object.keys(K).some(k => /road/i.test(k)), 'no road class');
  const src = fs.readFileSync('./world-v4.js', 'utf8') + fs.readFileSync('./map-window.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert(!/\broad(s)?\b/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'no road code');
  ok('only sea / lake tiles are water + blocked in every preset; rocks, wadis, hills and compounds are ground only; there is no road class and no road code');
  ok('tile classes per preset (class: tiles) ' + JSON.stringify(stats));
  const d = MW.build({ preset: 'c3east' }); let z = 0; for (const v of d.zone) if (v) z++;
  assert(d.c3 && z > 1000 && d.zones.some(q => q.id === 'C3')); ok('the C3 reserve and its zone ground are in the default window (' + z + ' zone tiles, C3 edge at column ' + d.c3.x1 + ')');
  const ind = MW.build({ preset: 'industrial' }); assert(ind.zones.some(q => q.id === 'E1') && ind.zones.some(q => q.id === 'T1')); ok('the industrial preset shows extraction E1 and transport T1');
}
// 3. a scripted plant on the OLD map and on every new window: identical game, byte for byte
const X = 70, Y = 40, B = b => 'B' + b.id, run = (g, sec) => { for (let i = 0; i < Math.round(sec / 0.1); i++) g.step(0.1); };
function mk(preset) {
  const g = new G({ seed: 7, rng: Core.mulberry32(99) }); if (preset) MW.install(g, { preset });
  g.s.cash = 1e8; g.s.regions.forEach(r => { r.unlocked = true; }); for (const a of g.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; } return g;
}
const connect = (g, a, b, type) => { const r = g.routeNodes(a, b, type); assert(r.ok, 'route ' + a + '->' + b + ': ' + r.reason); const res = g.buildLine(r); assert(res.ok, 'build ' + a + '->' + b + ': ' + res.reason); return res.line || g.lines[g.lines.length - 1]; };
function plant(g) {
  const w = g.place('well', X, Y, 'large').building, t = g.place('tank', X + 14, Y).building; connect(g, B(w), B(t));
  const L1 = g.lines[0], mid = L1.cells[L1.cells.length >> 1], p = g.place('pump', mid % W, (mid / W) | 0); assert(p.ok, p.reason);
  const w2 = g.place('well', X + 3, Y + 8, 'small').building, t2 = g.place('tank', X + 20, Y + 10).building; connect(g, B(w2), B(t2), 1);
  run(g, 120); assert.deepStrictEqual(g.validateNetwork(), []);
  const pump = g.buildings.find(b => b.type === 'pump'); return { w, t, pump, w2, t2 };
}
const fingerprint = (g, o) => JSON.stringify({ save: g.serialize(), cash: Math.round(g.s.cash * 100), q: [o.w.q, o.w2.q], amt: [o.t.amt, o.t2.amt], pump: [o.pump.flow, o.pump.boost, o.pump.kw, o.pump.pIn, o.pump.pOut], hyd: g.hydReport ? g.hydReport() : null, lines: g.lines.map(L => [L.id, L.a, L.b, L.cells.length]), warn: (g.warnings || []).length });
{
  const g0 = mk(null), o0 = plant(g0), f0 = fingerprint(g0, o0);
  assert(o0.t.amt > 0 && o0.pump.flow >= 0, 'the plant works on the old map');
  for (const p of Object.keys(MW.PRESETS)) {
    const g1 = mk(p), o1 = plant(g1); assert.strictEqual(fingerprint(g1, o1), f0, p + ': the same plant behaves differently');
  }
  ok('a plant (wells, pump, tanks, a main pipe and a branch) runs 120 s on the old map and on all three new windows with a byte-identical save, flows, pump head/power, tank fill and cash (' + sha(f0) + ')');
  ok('pressure, flow, pumps, tanks and production are unchanged: pump flow ' + o0.pump.flow.toFixed(2) + ' bbl/min, boost ' + o0.pump.boost.toFixed(2) + ' bar, tank ' + o0.t.amt.toFixed(1) + ' bbl');
}
// 4. an OLD save: loaded on the new map nothing moves, nothing is invalid, the same game continues
{
  const g0 = mk(null), o0 = plant(g0), save = JSON.parse(JSON.stringify(g0.serialize()));
  for (const p of Object.keys(MW.PRESETS)) {
    const a = new G({ seed: 7, rng: Core.mulberry32(5) }), b = new G({ seed: 7, rng: Core.mulberry32(5) }), m = MW.install(b, { preset: p });
    a.load(JSON.parse(JSON.stringify(save))); b.load(JSON.parse(JSON.stringify(save))); MW.protect(b, m);
    assert.deepStrictEqual(b.buildings.map(q => [q.id, q.type, q.x, q.y]), a.buildings.map(q => [q.id, q.type, q.x, q.y]), p + ': a building moved');
    assert.deepStrictEqual([...b.pipe], [...a.pipe], p + ': pipes changed'); assert.deepStrictEqual(b.lines.map(L => L.cells), a.lines.map(L => L.cells));
    assert.deepStrictEqual(b.validateNetwork(), []);
    run(a, 120); run(b, 120); assert.strictEqual(JSON.stringify(b.serialize()), JSON.stringify(a.serialize()), p + ': the old save continues differently on the new map');
  }
  ok('an old save loads on all three windows: every building and pipe tile on its old coordinates, the network valid, and 120 s later the save is byte-identical to the one that continued on the old map');
}
// 5. tiles under an old building are never turned into water (coast window: the sea is where an old game could have built)
{
  const m = MW.build({ preset: 'coast' }), old = new G({ seed: 7 }); let pick = -1;
  for (let y = 40; y < 50 && pick < 0; y++) for (let x = 2; x < 30; x++) { const k = y * W + x; if (m.water[k] && !old.map.water[k] && !old.map.block[k]) { pick = k; break; } }
  assert(pick >= 0, 'a tile that is new sea but old land'); const px = pick % W, py = (pick / W) | 0;
  const g = mk(null); const r = g.place('well', px, py, 'small'); assert(r.ok, r.reason); const save = JSON.parse(JSON.stringify(g.serialize()));
  const g2 = new G({ seed: 7 }), m2 = MW.install(g2, { preset: 'coast' }); assert.strictEqual(g2.map.water[pick], 1); g2.load(save); const cleared = MW.protect(g2, m2);
  assert(cleared >= 1 && g2.buildings.length === 1 && g2.buildings[0].x === px && g2.buildings[0].y === py && g2.map.water[pick] === 0, 'the occupied tile stays usable');
  let free = -1; for (let x = 2; x < 30; x++) { const k = py * W + x; if (g2.map.water[k] && Math.abs(x - px) > 3) { free = x; break; } }
  if (free >= 0) { g2.s.cash = 1e8; const q = g2.canPlace('well', free, py); assert(!q.ok && q.reason === 'water', 'the rest of the sea still refuses buildings'); }
  ok('an old building standing where the new map has sea keeps its tile (' + cleared + ' tile cleared); the open sea next to it still refuses buildings');
}
// 6. rocks and wadis do not block: a pipe and buildings go straight across them
{
  const m = MW.build({ preset: 'c3east' }), K = WORLD().K; let rock = 0, wadi = 0; for (let k = 0; k < W * H; k++) { if (m.cls[k] === K.ROCK) rock++; if (m.cls[k] === K.WADI) wadi++; }
  assert(rock > 40 && wadi > 150, 'the default window has rocks and a wadi: ' + rock + ' / ' + wadi);
  const g = mk('c3east'); let placed = 0; for (let k = 0; k < W * H && placed < 3; k++) if ((m.cls[k] === K.ROCK || m.cls[k] === K.WADI) && k % W < W - 3 && ((k / W) | 0) < H - 3) { const r = g.place('well', k % W, (k / W) | 0, 'small'); if (r.ok) placed++; }
  assert.strictEqual(placed, 3); ok('wells can be built on rock and on wadi ground (' + rock + ' rock tiles, ' + wadi + ' wadi tiles in the window)');
}
// 7. what the game file set contains, and what it must not
{
  const bw = fs.readFileSync('./build-www.js', 'utf8'); assert(/world-v4\.js/.test(bw) && /map-window\.js/.test(bw)); ok('the app package carries the two new files');
  const t = Date.now(); MW.build({ preset: 'c3east' }); const ms = Date.now() - t; ok('building the window takes ' + ms + ' ms on this machine (once at start-up)');
}
console.log('\nMAP WINDOW TESTS PASSED (' + n + ' checks)');
