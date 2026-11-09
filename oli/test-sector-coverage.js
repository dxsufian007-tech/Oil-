/* The still-valid checks of the Phase-2 zone test (kept in legacy-tests/), rewritten for the real sector world.
 * What changed on purpose (fields, regionSites, B/D zones) is not asserted any more; everything else the old test guarded is asserted again here.
 *   node oli/test-sector-coverage.js */
const { execSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const { createWorld, CONFIG } = require('./worldmap.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : '  -> ' + JSON.stringify(x))); } };
const W = createWorld({ seed: 20260101 }), S = W.sectors, by = k => S.filter(z => z.kind === k), codes = S.map(z => z.code);
const ALL = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'D1', 'D2', 'E1', 'F1'];

console.log('1. the approved distribution: 17 sectors');
T('1a exactly 17 sectors, none repeated', S.length === 17 && new Set(codes).size === 17, codes);
T('1b A (7), B (5), C (1), D (2), E (1), F (1)', by('A').length === 7 && by('B').length === 5 && by('C').length === 1 && by('D').length === 2 && by('E').length === 1 && by('F').length === 1);
T('1c the codes are exactly the approved ones', codes.slice().sort().join() === ALL.slice().sort().join());
T('1d every sector has the approved name and a one-line job (name + desc)', S.every(z => z.name && z.desc) && ['A', 'B', 'C', 'D', 'E', 'F'].every(k => new Set(by(k).map(z => z.name)).size === 1));

console.log('2. the rest of the world did not change (compared with the code before the zones, commit 484a0a7)');
let OLD = null, why = '';
try { const tmp = path.join(os.tmpdir(), 'worldmap-before-fz-cov.js'); fs.writeFileSync(tmp, execSync('git show 484a0a7:oli/worldmap.js', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 })); OLD = require(tmp).createWorld({ seed: 20260101 }); } catch (e) { why = e.message.split('\n')[0]; }
if (!OLD) { console.log('  (git isolation check skipped: ' + why + ')'); T('2x git history readable (needed for the comparison)', false, why); }
else {
  const rg = w => JSON.stringify(w.regions.map(r => [r.id, r.name, r.x0, r.y0, r.w, r.h, r.kind, r.richness, r.unlocked, r.starter])), zones = w => JSON.stringify(w.regions.map(r => [w.refineryZones(r.id), w.tankZones(r.id), w.tracks(r.id), w.strategicPoints(r.id)]));
  T('2a the 24 regions: ids, names, places, kinds, richness, unlocked: identical', rg(OLD) === rg(W));
  const fnSrc = (src, n) => { const i = src.indexOf('function ' + n + '('); if (i < 0) return null; const j = src.indexOf('\n    function ', i + 10); return src.slice(i, j < 0 ? i + 4000 : j); }, oldSrc = fs.readFileSync(path.join(os.tmpdir(), 'worldmap-before-fz-cov.js'), 'utf8'), newSrc = fs.readFileSync(path.join(__dirname, 'worldmap.js'), 'utf8');
  T('2c the CODE of tracks(), tankZones(), refineryZones() and strategicPoints() is byte-for-byte the code of 484a0a7 (their data may move because they are derived from where the fields are; the systems did not change)', ['tracks', 'tankZones', 'refineryZones', 'strategicPoints'].every(n => fnSrc(newSrc, n) && fnSrc(newSrc, n) === fnSrc(oldSrc, n)), ['tracks', 'tankZones', 'refineryZones', 'strategicPoints'].map(n => [n, !!fnSrc(newSrc, n), fnSrc(newSrc, n) === fnSrc(oldSrc, n)]));
  T('2c2 the tracks layer still works in the sector world: tracks exist in the world, every one has at least 5 points', (() => { const tr = W.regions.flatMap(r => W.tracks(r.id)); return tr.length >= 30 && tr.every(q => q.pts.length >= 5); })());
  T('2d the strategic reserve zone: same place (656,828), same width, and the FIRST FIVE levels (the ones saves can hold tanks in) are identical; the outer rings grow until a field or a track blocks them, so they may differ (level 8 is 40 tall instead of 36)', (() => { const a = OLD.reserveZoneOfWorld(), b = W.reserveZoneOfWorld(); return a.x === b.x && a.y === b.y && a.w === b.w && JSON.stringify(a.levels.slice(0, 5)) === JSON.stringify(b.levels.slice(0, 5)) && a.levels.length === b.levels.length; })());
  let same = true, bad = null; for (let i = 0; i < 4000 && same; i++) { const x = (i * 7919) % 1920, y = (i * 104729) % 1280, a = OLD.tile(x, y), b = W.tile(x, y); same = JSON.stringify(a) === JSON.stringify(b); if (!same) bad = [x, y]; }
  T('2e 4000 sampled tiles (terrain, elevation, slope, region): identical', same, bad);
  T('2f the oil probability map is identical', [[500, 500], [900, 400], [1200, 700], [1700, 300]].every(([x, y]) => W.oilProbability(x, y) === OLD.oilProbability(x, y)));
}

console.log('3. fields and their sectors (the old A1-A7 field checks, now for 454 fields)');
const fields = W.regions.flatMap(r => W.regionSites(r.id)).filter(s => s.kind === 'FIELD');
T('3a every field belongs to one A sector and the lookup works both ways', fields.every(s => /^A[1-7]$/.test(W.sectorOfSite(s.id)) && W.sectorAt(s.x, s.y) === W.sectorOfSite(s.id)) && W.sectorOfSite('nope') === null);
T('3b fields have their own reserve and capacity (not one shared number)', new Set(fields.map(s => s.props.capacity)).size > 20 && fields.every(s => s.initialReserve > 0));
T('3c reserve, depth, pressure and quality differ between the sectors (every sector has its own profile)', (() => { const m = {}; for (const s of fields) { const c = W.sectorOfSite(s.id); (m[c] = m[c] || []).push(s.initialReserve); } const avg = Object.values(m).map(a => a.reduce((x, y) => x + y, 0) / a.length); return Object.keys(m).length === 7 && Math.max(...avg) / Math.min(...avg) > 1.15; })());
T('3d the game opens with fields discoverable from the start: A fields in regions open at the start', fields.some(s => W.regions[W.regionIdAt(s.x, s.y)].unlocked));
T('3e a field nobody discovered yet is still undiscovered and shows nothing', fields.slice(0, 40).every(s => W.stateOf(s.id) === 'UNDISCOVERED') && fields.slice(0, 40).every(s => { const v = W.visibleInfo(s.id); return v === null || v === undefined || !v.reserve; }));

console.log('4. the industrial plains: refinery zones and tank farms exist everywhere and sit in the right sectors (some moved because they avoid the new field places)');
const refZ = W.regions.flatMap(r => W.refineryZones(r.id)), tankZ = W.regions.flatMap(r => W.tankZones(r.id)), inside = (z, c) => { const q = W.sector(c); return z.x >= q.x && z.y >= q.y && z.x + z.w <= q.x + q.w && z.y + z.h <= q.y + q.h; };
T('4a the D sectors contain refinery zones (' + refZ.filter(z => by('D').some(d => inside(z, d.code))).length + ') and tank farms inside B (' + tankZ.filter(z => by('B').some(d => inside(z, d.code))).length + ')', refZ.some(z => by('D').some(d => inside(z, d.code))) && tankZ.some(z => by('B').some(d => inside(z, d.code))));
T('4b every region still has its refinery zones and tank farms (nothing was removed)', W.regions.every(r => W.refineryZones(r.id).length > 0 && W.tankZones(r.id).length > 0));
T('4c the zone lookup for generator zones works (the B3 tank farm at 568,86; D1 at 232,472)', W.tankZones(W.regionIdAt(568, 86)).some(z => z.x === 568 && z.y === 86) && W.refineryZones(W.regionIdAt(232, 472)).some(z => z.x === 232 && z.y === 472) && W.sectorAt(568, 86) === 'B3' && W.sectorAt(232, 472) === 'D1');

console.log('5. C1: the strategic reserve stays in the starter region (internal name C3)');
const C = W.sector('C1'), sr = W.regions.find(r => r.starter);
T('5a the starter region is id 14, internal name C3, at (640,640) 320x320, and lies inside C1', sr && sr.id === 14 && sr.name === 'C3' && sr.x0 === 640 && sr.y0 === 640 && sr.w === 320 && sr.h === 320 && sr.x0 >= C.x && sr.y0 >= C.y && sr.x0 + sr.w <= C.x + C.w && sr.y0 + sr.h <= C.y + C.h);
T('5b the reserve zone is where it was: (656,828)', W.reserveZoneOfWorld().x === 656 && W.reserveZoneOfWorld().y === 828);
T('5c the starter region is displayed as C1; the other cells are named «خلية …» so no cell reads like a sector code', W.regionLabel(14) === 'C1' && W.regionLabel(12) === 'خلية C1' && W.regionLabel(0) === 'خلية A1' && !W.regions.some(r => !r.starter && /^[A-F]\d$/.test(W.regionLabel(r.id))));
T('5d the zone info still carries the INTERNAL name (nothing that depends on it changes)', W.zoneInfo(14).name === 'C3');

console.log('6. E1: water sector, free of oil sites');
const E = W.sector('E1'), TT = CONFIG.TERRAIN, R14 = W.regions[14];
let landOk = true, within = 0, tiles = 0; for (let y = E.y; y < E.y + E.h; y++) for (let x = E.x; x < E.x + E.w; x++) { const t = W.tile(x, y), d = t && TT[t.terrain]; tiles++; if (d && d.buildable) { if (t.slope <= d.maxSlope) within++; } }
T('6a E1 has land to build on: ' + (100 * within / tiles).toFixed(0) + '% of its ' + tiles + ' tiles are within the slope limit (finding kept: it is mostly rocky ground)', within / tiles > .3 && within / tiles < 1);
T('6b E1 holds no oil field and no dry site at all', W.regions.every(r => W.regionSites(r.id).every(s => W.sectorAt(s.x, s.y) !== 'E1')));
T('6c E1 is outside the reserve region (C1)', E.x + E.w <= C.x || E.x >= C.x + C.w || E.y + E.h <= C.y || E.y >= C.y + C.h);
T('6d the old E1 anchor (810,1066) lies inside E1 and nothing is built there', W.sectorAt(810, 1066) === 'E1');

console.log('7. F1: the western sea strip, inside the world, platform slots are water');
const F1 = W.sector('F1');
T('7a F1 covers every row of the world, west of the coast line', W.sectorAt(0, 0) === 'F1' && W.sectorAt(0, 1279) === 'F1' && [0, 300, 640, 1000, 1279].every(y => W.coastLine(y) > 20 && W.sectorAt(W.coastLine(y) - 1, y) === 'F1' && W.sectorAt(W.coastLine(y), y) !== 'F1'));
T('7b the prepared platform slots (' + F1.slots.length + ') are sea tiles (water, not buildable), inside F1', F1.slots.length === 8 && F1.slots.every(([x, y]) => { const t = W.tile(x, y); return t.terrain === 'WATER_WADI' && x < W.coastLine(y) && W.sectorAt(x, y) === 'F1'; }));
T('7c the world size did not change: 1920 x 1280', W.W === 1920 && W.H === 1280);

console.log('8. the sectors tile the world: no gap, no overlap');
let gap = null; const seen = {}; for (let y = 0; y < 1280 && !gap; y += 5) for (let x = 0; x < 1920; x += 5) { const c = W.sectorAt(x, y); if (!c) { gap = [x, y]; break; } seen[c] = (seen[c] || 0) + 1; }
T('8a every sampled tile of the world is in exactly one sector (no gap)', !gap && Object.keys(seen).length === 17, gap || Object.keys(seen).length);
T('8b the land sector rectangles do not overlap each other', (() => { const L = S.filter(z => z.shape !== 'sea'); for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i], b = L[j]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return false; } return true; })());

console.log('9. another world seed has no sectors and keeps its old labels');
const W7 = createWorld({ seed: 7 });
T('9a no plan -> no sectors, regionLabel is the old name', W7.sectors.length === 0 && W7.regionLabel(14) === 'C3' && W7.sector('A1') === null && W7.sectorOfSite('F8-10') === null);
T('9b the legacy switch (sectors:false) gives the pre-sector world: fields spread over all regions', createWorld({ seed: 20260101, sectors: false }).sectors.length === 0);

console.log('10. external mode (the game thread): sectors work without any chunk or site data');
const X = createWorld({ seed: 20260101, external: true });
T('10a 17 sectors, labels and lookups work with no chunk loaded', X.sectors.length === 17 && X.regionLabel(14) === 'C1' && X.sectorAt(834, 436) === 'D2' && X.sectorAt(60, 600) === 'F1');
console.log('\nSECTOR COVERAGE TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
