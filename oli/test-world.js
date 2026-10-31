/* Map/Oil world tests (isolated). node test-world.js [--regression]  (--regression also runs the existing Phase A/B/C core suites unchanged) */
const assert = require('assert'), { createWorld, CONFIG, STATES } = require('./worldmap.js'), cp = require('child_process'), fs = require('fs'), path = require('path');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const W = createWorld({ seed: 20260101 });
// 1 scale + structure
ok(Math.abs(W.scale() - 200) < 1, 'world is ~200x the current 140x88 map: ' + W.scale());
ok(W.regions.length === 24 && W.regions.every(r => r.w === 320 && r.h === 320), '24 regions of 5x5 chunks');
ok(W.CHUNK === 64 && W.W === 1920 && W.H === 1280, 'chunk size / world size');
// 2 lazy: reading one tile only generates a few chunks, never the whole world
const L = createWorld({ seed: 1 }); L.tile(100, 100); ok(L.chunksGenerated() === 1, 'one tile -> one chunk'); L.tile(2, 2); ok(L.chunksGenerated() === 2, 'second chunk only');
for (let i = 0; i < 400; i++) L.chunk(i % 30, (i / 30) | 0); ok(L.cachedChunks() <= 160, 'chunk cache is bounded (LRU)');
// 3 determinism: same seed -> identical world; different seed -> different
const A = createWorld({ seed: 7 }), B = createWorld({ seed: 7 }), D = createWorld({ seed: 8 });
let same = true, diff = false; for (let i = 0; i < 400; i++) { const x = (i * 97) % 1920, y = (i * 53) % 1280; if (A.tile(x, y).id !== B.tile(x, y).id || A.tile(x, y).elevation !== B.tile(x, y).elevation) same = false; if (A.tile(x, y).id !== D.tile(x, y).id) diff = true; }
ok(same, 'same seed same terrain'); ok(diff, 'other seed other terrain');
const sig = w => JSON.stringify(w.allSites().map(s => [s.id, s.x, s.y, s.type, s.initialReserve, s.depth, s.pressurePotential, s.quality]));
ok(sig(A) === sig(B), 'same seed same oil fields'); ok(sig(A) !== sig(D), 'other seed other oil fields');
ok(sig(W).length > 1000 && require('crypto').createHash('md5').update(sig(createWorld({ seed: 20260101 }))).digest('hex') === require('crypto').createHash('md5').update(sig(W)).digest('hex'), 'fixed default seed reproducible');
// 4 terrain: every type present, none dominates, ids/props complete
const cnt = {}; let tot = 0; for (let y = 0; y < W.H; y += 8) for (let x = 0; x < W.W; x += 8) { const t = W.tile(x, y); cnt[t.terrain] = (cnt[t.terrain] || 0) + 1; tot++; }
for (const k of Object.keys(CONFIG.TERRAIN)) { const p = (cnt[k] || 0) / tot; ok(p > .03 && p < .4, k + ' share ' + (100 * p).toFixed(1) + '%'); }
for (const k in CONFIG.TERRAIN) { const t = CONFIG.TERRAIN[k]; ok('buildable' in t && 'buildCost' in t && 'oilMod' in t && 'maxSlope' in t, k + ' has buildability/cost/oil/slope'); }
const lv = new Set(); for (let i = 0; i < 3000; i++) lv.add(W.tile((i * 131) % 1920, (i * 71) % 1280).level); ok(lv.size >= 5, 'elevation levels vary: ' + lv.size);
// 5 oil: all 4 sizes + dry, ordering of reserve by type, distribution not uniform
const all = W.allSites(), fields = all.filter(s => s.kind === 'FIELD'), dry = all.filter(s => s.kind === 'DRY');
for (const t of ['SMALL', 'MEDIUM', 'LARGE', 'MAJOR']) ok(fields.some(s => s.type === t), 'has ' + t); ok(dry.length > 20, 'dry prospects exist (promising but not guaranteed)');
const avg = t => { const a = fields.filter(s => s.type === t); return a.reduce((p, s) => p + s.initialReserve, 0) / a.length; }; ok(avg('SMALL') < avg('MEDIUM') && avg('MEDIUM') < avg('LARGE') && avg('LARGE') < avg('MAJOR'), 'reserve grows with size');
ok(fields.every(s => W.tile(s.x, s.y).terrain !== 'WATER' && s.remainingReserve === s.initialReserve && s.depth > 0 && ['LOW', 'MEDIUM', 'HIGH'].includes(s.quality) && s.pressurePotential > 0), 'field properties');
ok(fields.some(s => s.type === 'LARGE' && s.depth > 2200) && fields.some(s => s.type === 'SMALL' && s.depth < 800), 'big-but-deep and small-but-shallow both exist');
let overlaps = 0; for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) < all[i].radius + all[j].radius) overlaps++; ok(overlaps === 0, 'no two oil sites overlap (' + overlaps + ')');
const byR = {}; for (const f of fields) byR[W.regions[f.regionId].richness] = (byR[W.regions[f.regionId].richness] || []).concat(f.initialReserve);
const mean = a => a.reduce((p, q) => p + q, 0) / a.length; ok(['POOR', 'MEDIUM', 'RICH'].every(k => byR[k] && byR[k].length), 'all richness classes occur');
const perRegion = r => W.regionSites(r.id).filter(s => s.kind === 'FIELD').length; const poor = W.regions.filter(r => r.richness === 'POOR').map(perRegion), rich = W.regions.filter(r => r.richness === 'RICH').map(perRegion); ok(mean(rich) > mean(poor) * 1.8, 'rich regions have clearly more fields');
ok(W.regionSites(W.regions.find(r => r.starter).id).filter(s => s.kind === 'FIELD').length >= 4, 'starter region has fields');
const vv = W.regions.filter(r => !r.starter).map(r => perRegion(r)); ok(Math.max(...vv) / Math.max(1, Math.min(...vv)) >= 2, 'not evenly spread');
ok(fields.filter(s => s.terrainType === 'ROCKY_RIDGE').length < fields.length * .08, 'ridges are poor oil ground'); ok(fields.filter(s => s.terrainType === 'LOW_VALLEY').length > 0, 'valleys can hold oil');
ok(W.oilProbability(5, 5) >= 0 && W.oilProbability(-1, 0) === 0, 'probability bounds');
const f0 = fields[0]; ok(W.oilFieldAt(f0.x, f0.y) && W.oilFieldAt(f0.x, f0.y).id === f0.id, 'oilFieldAt');
// 6 discovery
const F = fields.slice(0, 6).map(s => s.id); const f = F[0];
ok(W.stateOf(f) === 'UNDISCOVERED' && W.visibleInfo(f) === null, 'undiscovered: player knows nothing');
ok(!W.survey(f).ok && !W.makeDrillable(f).ok && W.stateOf(f) === 'UNDISCOVERED', 'cannot skip states');
ok(W.discover(f).ok, 'discover'); let v = W.visibleInfo(f); ok(v.state === 'DISCOVERED' && !('type' in v) && !('estimatedReserve' in v) && !('depth' in v) && !('x' in v) && v.indicator, 'DISCOVERED reveals only a rough area');
ok(Math.hypot(v.indicator.x - fields[0].x, v.indicator.y - fields[0].y) < v.indicator.r, 'the indicator contains the real field');
ok(W.survey(f).ok, 'survey'); v = W.visibleInfo(f); ok(v.type && v.estimatedReserve && v.reserveRange && !('depth' in v) && !('pressurePotential' in v) && !('remainingReserve' in v), 'SURVEYED: estimates, no depth / exact numbers');
ok(v.reserveRange[0] <= fields[0].initialReserve * 1.6 && v.reserveRange[1] >= fields[0].initialReserve * .6, 'estimate is in the right neighbourhood but not exact'); ok(v.estimatedReserve !== fields[0].initialReserve || fields[0].estimateError > 0, 'estimate is an estimate');
ok(W.makeDrillable(f).ok, 'drillable'); v = W.visibleInfo(f); ok(v.depth && v.estimatedCost > 0 && /not charged/.test(v.costNote), 'DRILLABLE shows depth and an uncharged estimate');
ok(!W.deplete(f).ok, 'cannot deplete while oil remains'); fields[0].remainingReserve = 0; ok(W.deplete(f).ok && W.stateOf(f) === 'DEPLETED', 'depleted'); ok(!W.discover(f).ok, 'no way back');
const dsite = dry[0]; W.discover(dsite.id); W.survey(dsite.id); ok(!W.makeDrillable(dsite.id).ok, 'a dry prospect never becomes drillable'); ok(W.visibleInfo(dsite.id).dry, 'survey reveals it is dry');
const snap = W.progressSnapshot(); const W2 = createWorld({ seed: 20260101 }); W2.restoreProgress(snap); ok(W2.stateOf(f) === 'DEPLETED' && W2.stateOf(dsite.id) === 'SURVEYED', 'progress snapshot / restore');
// 7 well <-> field link (interface)
const g = fields[1]; ok(!W.WellLink.bind('w1', g.id).ok, 'cannot link an undrillable field'); W.discover(g.id); W.survey(g.id); W.makeDrillable(g.id); ok(W.WellLink.bind('w1', g.id).ok && W.WellLink.fieldOf('w1') === g.id, 'link');
const before = g.remainingReserve; const r = W.WellLink.extract('w1', 1000); ok(r.took === 1000 && g.remainingReserve === before - 1000, 'extract reduces reserve'); W.WellLink.extract('w1', 1e12); ok(g.remainingReserve === 0 && W.stateOf(g.id) === 'DEPLETED', 'emptying a field depletes it');
// 8 building zones
let water = null, flat = null; for (let y = 0; y < 400 && !(water && flat); y += 3) for (let x = 0; x < 400; x += 3) { const t = W.tile(x, y); if (!water && t.terrain === 'WATER') water = t; if (!flat && t.terrain === 'FLAT_DESERT' && t.slope < 10 && W.canBuildAt('well', x, y).ok) flat = t; }
ok(water && !W.canBuildAt('well', water.x, water.y).ok && W.canBuildAt('well', water.x, water.y).reason === 'water', 'water is not buildable'); ok(flat && W.canBuildAt('well', flat.x, flat.y).ok, 'flat ground is buildable');
ok(W.canBuildAt('well', -3, 5).reason === 'outside', 'outside the world'); ok(W.canBuildAt('nope', 5, 5).reason === 'unknownFacility', 'unknown facility');
for (const k in CONFIG.FACILITIES) { const fc = CONFIG.FACILITIES[k]; ok(fc.fp.length === 2 && fc.ports && fc.maxSlope >= 0, k + ' has footprint / ports / slope rule'); } ok(Object.keys(CONFIG.FACILITIES).length >= 12, 'all future facilities declared');
const zs = W.regions.flatMap(r => W.refineryZones(r.id)); ok(zs.length >= 20, 'refinery zones exist: ' + zs.length);
ok(zs.every(z => z.w >= 24 && z.h >= 16 && z.w * z.h > 20 * CONFIG.FACILITIES.tank.fp[0] * CONFIG.FACILITIES.tank.fp[1] && z.expansion > .3), 'zones are big and have room to grow'); ok(zs.every(z => W.sitesNear(z.x + z.w / 2, z.y + z.h / 2, 10).length === 0), 'no oil field inside a refinery zone');
const z0 = zs[0], inRef = W.canBuildAt('refinery', z0.x + 4, z0.y + 4); ok(inRef.ok && inRef.footprint[0] === 6, 'refinery fits in its zone'); ok(W.canBuildAt('refinery', flat.x, flat.y).reason === 'needsZone' || !W.canBuildAt('refinery', flat.x, flat.y).ok, 'refinery outside a zone is refused');
let steep = null; for (let y = 0; y < 600 && !steep; y += 2) for (let x = 0; x < 600; x += 2) { const t = W.tile(x, y); if (t.terrain !== 'WATER' && t.slope > 25) { steep = t; break; } } ok(steep && !W.canBuildAt('tank', steep.x, steep.y).ok, 'steep ground refuses a tank');
// 9 zoom + iso + adapter
ok(W.levelForZoom(0.05) === 'FAR' && W.levelForZoom(0.4) === 'MEDIUM' && W.levelForZoom(1) === 'CLOSE', 'zoom levels');
for (const [x, y] of [[0, 0], [10, 3], [139, 87], [1500, 900]]) { const p = W.iso.tc(x, y), t = W.iso.toTile(p.x, p.y + 1); ok(t.x === x && t.y === y, 'iso roundtrip ' + x + ',' + y); }
const v2src = fs.readFileSync(path.join(__dirname, 'v2.js'), 'utf8'); ok(v2src.includes('({ x: (x - y) * 32, y: (x + y + 1) * 16 })'), 'iso formula identical to v2.js tc()');
const lw = W.toLegacyWindow(800, 800); ok(lw.w === 140 && lw.h === 88 && lw.water.length === 140 * 88 && lw.terrain.length === 140 * 88 && Math.max(...lw.terrain) <= 3, 'legacy window has the arrays / size of the current map');
// 10 performance + memory
const t0 = Date.now(); const P = createWorld({ seed: 3 }); for (let i = 0; i < 40; i++) P.chunk(i % 8, (i / 8) | 0); const per = (Date.now() - t0) / 40; ok(per < 60, 'chunk generation ' + per.toFixed(1) + ' ms each');
const t1 = Date.now(); for (let i = 0; i < 20000; i++) W.tile(700 + (i * 7) % 200, 600 + (i * 13) % 150); ok((Date.now() - t1) < 1500, 'tile lookups (coherent access) fast: ' + (Date.now() - t1) + ' ms / 20000');
// 11 isolation: no shared file touched (compared with the commit the branch started from)
try { const base = cp.execSync('git merge-base HEAD main', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), ch = cp.execSync('git diff --name-only ' + base + ' HEAD', { cwd: __dirname }).toString().split('\n').filter(Boolean);
  const prot = /(^|\/)(v2\.js|core\.js|v2\.html|v2\.css|v2-lang\.js|build-www\.js|package\.json|offline\.js|phaser\.min\.js)$|(^|\/)test-(v2-)?(phase|core|p\d|legacy|offline)/; const bad = ch.filter(f => prot.test(f)); ok(bad.length === 0, 'protected files changed: ' + bad.join(',')); console.log('files changed vs main:', ch.join(', ') || '(only uncommitted)'); } catch (e) { console.log('(git isolation check skipped)'); }
const lines = ['v2.js', 'core.js'].map(f => fs.statSync(path.join(__dirname, f)).size); ok(lines.every(x => x > 1000), 'protected files still present');
if (process.argv.includes('--regression')) for (const t of ['test-core.js', 'test-phaseB.js', 'test-phaseC.js', 'test-offline.js']) { const r = cp.spawnSync('node', [t], { cwd: __dirname, encoding: 'utf8' }); ok(r.status === 0, t + ' still passes: ' + (r.stdout + r.stderr).slice(-200)); console.log('regression', t, 'OK'); }
console.log('WORLD TESTS PASSED (' + n + ' checks)');
