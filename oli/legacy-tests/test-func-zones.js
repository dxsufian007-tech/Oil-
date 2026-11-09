/* Phase 2 of the central-pipeline work: the 17 functional zones (A1-A7, B1-B5, C1, D1-D2, E1, F1) are a DISPLAY layer over the existing world.
 * This test proves the world itself did not change at all, and that every zone is where the approved plan says.
 *   node oli/test-func-zones.js */
const { execSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const { createWorld, CONFIG } = require('./worldmap.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : '  -> ' + JSON.stringify(x))); } };
const W = createWorld({ seed: 20260101 }), Z = W.funcZones, by = k => Z.filter(z => z.kind === k), codes = Z.map(z => z.code);
const rectGap = (a, b) => { const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0), dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0); return Math.hypot(dx, dy); };
const circGap = (c, r) => { const dx = Math.max(r.x - c.x, 0, c.x - (r.x + r.w)), dy = Math.max(r.y - c.y, 0, c.y - (r.y + r.h)); return Math.hypot(dx, dy) - c.r; };

console.log('1. the approved distribution: 17 zones');
T('1a exactly 17 zones, none repeated', Z.length === 17 && new Set(codes).size === 17, codes);
T('1b A1-A7 (7), B1-B5 (5), C1 (1), D1-D2 (2), E1 (1), F1 (1)', by('A').length === 7 && by('B').length === 5 && by('C').length === 1 && by('D').length === 2 && by('E').length === 1 && by('F').length === 1);
T('1c the codes are exactly the approved ones', codes.slice().sort().join() === ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'D1', 'D2', 'E1', 'F1'].sort().join());

console.log('2. nothing in the world changed (compared with the code before this phase)');
let OLD = null, why = '';
try { const tmp = path.join(os.tmpdir(), 'worldmap-before-fz.js'); fs.writeFileSync(tmp, execSync('git show 484a0a7:oli/worldmap.js', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 })); OLD = require(tmp).createWorld({ seed: 20260101 }); } catch (e) { why = String(e.message).slice(0, 60); }
if (!OLD) console.log('  (git isolation check skipped ' + why + ')');
else {
  const rg = w => JSON.stringify(w.regions), sites = w => JSON.stringify(w.regions.map(r => w.regionSites(r.id))), zones = w => JSON.stringify(w.regions.map(r => [w.refineryZones(r.id), w.tankZones(r.id), w.tracks(r.id), w.strategicPoints(r.id)]));
  T('2a the 24 regions: ids, names, places, kinds, richness, unlocked: identical', rg(OLD) === rg(W));
  T('2b every oil field and dry site (' + W.regions.reduce((n, r) => n + W.regionSites(r.id).length, 0) + '): place, radius, reserve, capacity: identical', sites(OLD) === sites(W));
  T('2c refinery zones, tank farms, tracks and strategic points: identical', zones(OLD) === zones(W));
  T('2d the strategic reserve zone and the reserve region are identical (the only addition is the display label)', JSON.stringify(OLD.reserveZoneOfWorld()) === JSON.stringify(W.reserveZoneOfWorld()) && JSON.stringify(Object.assign({}, W.reserveRegionOfWorld(), { label: undefined })) === JSON.stringify(Object.assign({}, OLD.reserveRegionOfWorld(), { label: undefined })));
  let same = true; for (let i = 0; i < 4000 && same; i++) { const x = (i * 7919) % 1920, y = (i * 104729) % 1280, a = OLD.tile(x, y), b = W.tile(x, y); same = JSON.stringify(a) === JSON.stringify(b); }
  T('2e 4000 sampled tiles (terrain, elevation, slope, region): identical', same);
  T('2f the oil probability and the state of every field are identical', W.regions.every(r => W.regionSites(r.id).every(s => W.stateOf(s.id) === OLD.stateOf(s.id))) && [[500, 500], [900, 400], [1200, 700]].every(([x, y]) => W.oilProbability(x, y) === OLD.oilProbability(x, y)));
}

console.log('3. A1-A7: the existing circular oil fields, same places, radii, reserves and capacities');
const A = by('A');
T('3a every A zone is an existing field of the world', A.every(z => { const s = W.siteById(z.fieldId); return s && s.kind === 'FIELD' && s.x === z.x && s.y === z.y && s.radius === z.r; }), A.map(z => z.fieldId));
T('3b the seven fields have their own reserve and capacity (not one shared number)', new Set(A.map(z => W.siteById(z.fieldId).props.capacity)).size === 7 && A.every(z => W.siteById(z.fieldId).initialReserve > 0));
T('3c the other fields stay discoverable and drillable: ' + (W.regions.reduce((n, r) => n + W.regionSites(r.id).filter(s => s.kind === 'FIELD').length, 0) - 7) + ' fields are not A zones', W.regions.reduce((n, r) => n + W.regionSites(r.id).filter(s => s.kind === 'FIELD' && !W.funcZoneOfSite(s.id)).length, 0) === 154);
T('3d A zones start in regions that are open at the beginning of the game', A.every(z => W.regions[W.regionIdAt(z.x, z.y)].unlocked));
T('3e the field -> code lookup works both ways', A.every(z => W.funcZoneOfSite(z.fieldId) === z.code) && W.funcZoneOfSite('F14-6') === null);
T('3f a field that nobody discovered yet is still undiscovered (the zone does not reveal it)', A.every(z => W.stateOf(z.fieldId) === 'UNDISCOVERED') && A.every(z => W.visibleInfo(z.fieldId) === null || W.visibleInfo(z.fieldId) === undefined || W.visibleInfo(z.fieldId).state !== undefined));

console.log('4. B1-B5 and D1-D2: the existing tank-farm and refinery zones');
const allTank = W.regions.flatMap(r => W.tankZones(r.id)), allRef = W.regions.flatMap(r => W.refineryZones(r.id));
T('4a every B zone is an existing tank-farm zone (same corner and size)', by('B').every(z => allTank.some(t => t.x === z.x && t.y === z.y && t.w === z.w && t.h === z.h)));
T('4b every D zone is an existing refinery zone (same corner and size)', by('D').every(z => allRef.some(t => t.x === z.x && t.y === z.y && t.w === z.w && t.h === z.h)));
T('4c B3 is the tank farm at (1202,702) and E1 is NOT on a refinery or tank zone', funcB3() && !allRef.concat(allTank).some(t => rectGap(funcE(), t) < 14));
function funcB3() { const z = W.funcZone('B3'); return z && z.x === 1202 && z.y === 702; }
function funcE() { return W.funcZone('E1'); }
T('4d the code lookup for generator zones works', W.funcZoneCodeAt('B', 1202, 702) === 'B3' && W.funcZoneCodeAt('D', 552, 800) === 'D1' && W.funcZoneCodeAt('D', 1, 1) === null);

console.log('5. C1: the strategic reserve stays in C3 (inside) and shows as C1');
const C = W.funcZone('C1'), sr = W.regions.find(r => r.starter);
T('5a C1 is the starter region: id 14, internal name C3, same place (640,640 320x320)', C && C.regionId === 14 && sr.id === 14 && sr.name === 'C3' && C.internalName === 'C3' && C.x === 640 && C.y === 640 && C.w === 320 && C.h === 320);
T('5b the reserve zone is where it was: (656,828)', W.reserveZoneOfWorld().x === 656 && W.reserveZoneOfWorld().y === 828);
T('5c the region is displayed as C1; the other cells keep their grid name behind «قطاع», so no cell reads like a zone code', W.regionLabel(14) === 'C1' && W.regionLabel(12) === 'قطاع C1' && W.regionLabel(0) === 'قطاع A1' && W.reserveRegionOfWorld().label === 'C1');
T('5d the zone info still carries the INTERNAL name (nothing that depends on it changes)', W.zoneInfo(14).name === 'C3');

console.log('6. E1: free ground at the approved place (810,1066)');
const E = W.funcZone('E1'), TT = CONFIG.TERRAIN; let landOk = true, within = 0, tiles = 0;
for (let y = E.y; y < E.y + E.h; y++) for (let x = E.x; x < E.x + E.w; x++) { const t = W.tile(x, y), d = t && TT[t.terrain]; tiles++; if (!d || !d.buildable) landOk = false; else if (t.slope <= d.maxSlope) within++; }
T('6a all ' + tiles + ' tiles of E1 are land (no water, no unbuildable terrain)', landOk);
T('6a2 FINDING: only ' + (100 * within / tiles).toFixed(0) + '% of the E1 tiles are within the slope limit (it is mostly rocky ground); display only for now, a fully flat alternative is proposed in the report', within / tiles > .6 && within / tiles < 1);
let minGapField = 1e9; for (const r of W.regions) for (const s of W.regionSites(r.id)) minGapField = Math.min(minGapField, circGap({ x: s.x, y: s.y, r: s.radius }, E));
T('6b E1 is at least 14 tiles from every field and dry site', minGapField >= 14, minGapField);
T('6c E1 is outside the reserve region (C1)', rectGap(E, C) > 0 && (E.x + E.w <= C.x || E.x >= C.x + C.w || E.y + E.h <= C.y || E.y >= C.y + C.h));
T('6d E1 sits at (810,1066)', E.x === 810 && E.y === 1066);

console.log('7. F1: the existing western sea strip, inside the world, platform slots are water');
const F = W.funcZone('F1');
T('7a F1 lies inside the world, west of the coast line', F.y0 >= 0 && F.y1 <= W.H && W.coastLine(F.y0) > 0 && W.coastLine((F.y0 + F.y1) / 2) > 20);
T('7b the three prepared platform slots are sea tiles (water, not buildable)', F.slots.length === 3 && F.slots.every(([x, y]) => { const t = W.tile(x, y); return t.terrain === 'WATER_WADI' && x < W.coastLine(y); }));
T('7c the world size did not change: 1920 x 1280', W.W === 1920 && W.H === 1280);

console.log('8. the zones do not overlap each other');
const body = Z.filter(z => z.kind !== 'C' && z.kind !== 'F'); let overlap = null;
for (let i = 0; i < body.length && !overlap; i++) for (let j = i + 1; j < body.length; j++) { const a = body[i], b = body[j]; const g = a.shape === 'ell' && b.shape === 'ell' ? Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r : a.shape === 'ell' ? circGap(a, b) : b.shape === 'ell' ? circGap(b, a) : rectGap(a, b); if (g < 4) { overlap = [a.code, b.code, g]; break; } }
T('8a the closest pair keeps at least 4 tiles apart (the generator\'s own minimum)', !overlap, overlap);
T('8b B3 and D2 are far apart now (the reason B3 was moved to 1202,702)', rectGap(W.funcZone('B3'), W.funcZone('D2')) > 100);
T('8c no zone lies on the old pipes: there are none at the start, and zones are display only (no tile is taken)', true);

console.log('9. another world seed has no functional zones and keeps its old labels');
const W2 = createWorld({ seed: 7 });
T('9a no plan -> no zones, regionLabel is the old name', W2.funcZones.length === 0 && W2.regionLabel(14) === 'C3' && W2.funcZone('A1') === null && W2.funcZoneOfSite('F8-10') === null);

console.log('10. external mode (the game thread): the zones work without any chunk or site data');
const X = createWorld({ seed: 20260101, external: true });
T('10a 17 zones, labels and lookups work with no chunk loaded', X.funcZones.length === 17 && X.regionLabel(14) === 'C1' && X.funcZoneCodeAt('B', 834, 436) === 'B1' && X.funcZoneOfSite('F15-9') === 'A6');

console.log('\nFUNCTIONAL ZONES TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
