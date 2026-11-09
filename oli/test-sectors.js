/* The 17 functional sectors (A1-A7, B1-B5, C1, D1-D2, E1, F1): layout, coverage, oil only inside A, per-sector targets.
 *   node oli/test-sectors.js */
const { execSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const { createWorld, CONFIG } = require('./worldmap.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : '  -> ' + JSON.stringify(x))); } };
const W = createWorld({ seed: 20260101 }), S = W.sectors, rect = S.filter(z => z.shape === 'rect'), by = k => S.filter(z => z.kind === k);
const allSites = () => W.regions.flatMap(r => W.regionSites(r.id));

console.log('1. the layout: 17 sectors');
T('1a exactly 17 sectors with the approved codes', S.length === 17 && S.map(z => z.code).sort().join() === ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'D1', 'D2', 'E1', 'F1'].sort().join());
T('1b A x7, B x5, C x1, D x2, E x1, F x1', by('A').length === 7 && by('B').length === 5 && by('C').length === 1 && by('D').length === 2 && by('E').length === 1 && by('F').length === 1);
T('1c every sector has a name and a short job under it', S.every(z => z.name && z.desc && z.desc.length > 4));
T('1d the world is still 1920 x 1280', W.W === 1920 && W.H === 1280);

console.log('2. the sectors cover the whole world exactly once (no gap, no overlap)');
let cover = new Map(), gaps = 0, dbl = 0, seaN = 0, landN = 0;
for (let y = 0; y < 1280; y++) for (let x = 0; x < 1920; x++) {
  const c = W.sectorAt(x, y); if (!c) { gaps++; continue; } cover.set(c, (cover.get(c) || 0) + 1);
  let hits = 0; for (const z of rect) if (x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h && x >= W.coastLine(y)) hits++; if (hits > 1) dbl++; if (x < W.coastLine(y)) seaN++; else landN++;
}
T('2a no tile belongs to no sector', gaps === 0, gaps); T('2b no land tile is in two sectors', dbl === 0, dbl);
T('2c the tile counts add up to 1920 x 1280 = 2,457,600', [...cover.values()].reduce((a, b) => a + b, 0) === 2457600);
const area = {}; for (const [k, v] of cover) area[k] = v;
T('2d A1-A6 are 198,000-201,000 tiles, A7 is 193,000-194,000 (the approved sizes)', ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].every(k => area[k] > 198000 && area[k] < 201000) && area.A7 > 193000 && area.A7 < 194000, area);
T('2e the other approved sizes: B1 77k, B5 62k, C1 128k, D1 122k, D2 150k, E1 183k', Math.abs(area.B1 - 77117) < 300 && Math.abs(area.B5 - 61777) < 300 && Math.abs(area.C1 - 127800) < 300 && Math.abs(area.D1 - 122468) < 300 && Math.abs(area.D2 - 150350) < 300 && Math.abs(area.E1 - 183400) < 300, area);
console.log('3. F1: the whole western sea strip, water only, along the coast from its start to its end');
const F = W.sector('F1');
T('3a F1 is exactly the tiles west of the coast line (all 1280 rows)', seaN === area.F1 && area.F1 > 125000 && area.F1 < 131000, area.F1);
let nonWater = 0, rowsWith = 0; for (let y = 0; y < 1280; y++) { const c = Math.ceil(W.coastLine(y)); if (c > 0) rowsWith++; for (let x = 0; x < c; x++) if (W.tile(x, y).terrain !== 'WATER_WADI') nonWater++; }
T('3b every F1 tile is sea water (no land inside F1)', nonWater === 0, nonWater);
T('3c F1 has sea in every row: one connected strip from y=0 to y=1279', rowsWith === 1280);
let landLost = 0; for (let y = 0; y < 1280; y += 3) for (let x = Math.ceil(W.coastLine(y)); x < 60; x++) if (W.sectorAt(x, y) === 'F1') landLost++;
T('3d F1 takes no land from the neighbours', landLost === 0);
T('3e the 8 prepared platform slots are sea tiles, >= 40 tiles off the shore, spread along the whole coast', F.slots.length === 8 && F.slots.every(([x, y]) => W.tile(x, y).terrain === 'WATER_WADI' && W.coastLine(y) - x >= 40) && F.slots[0][1] < 150 && F.slots[7][1] > 1100);
T('3f the sector lookup gives F1 for the sea and a land sector for the shore', W.sectorAt(10, 600) === 'F1' && W.sectorAt(300, 700) === 'A7' && W.sectorAt(300, 100) === 'B1');

console.log('4. every oil field and dry prospect is inside A1-A7');
const sites = allSites(), fields = sites.filter(s => s.kind === 'FIELD'), dry = sites.filter(s => s.kind === 'DRY');
T('4a not one oil field outside A (B / C / D / E / F have none)', fields.every(s => W.sectorAt(s.x, s.y)[0] === 'A'), fields.filter(s => W.sectorAt(s.x, s.y)[0] !== 'A').length);
T('4b the dry prospects are inside A too (they keep their rules, nothing becomes a field)', dry.every(s => W.sectorAt(s.x, s.y)[0] === 'A') && dry.every(s => s.initialReserve === 0 && s.props === null));
const tgt = CONFIG.SECTOR_FIELDS, nF = {}, nD = {}; for (const s of fields) nF[s.sector] = (nF[s.sector] || 0) + 1; for (const s of dry) nD[s.sector] = (nD[s.sector] || 0) + 1;
T('4c every A reaches its target of fields and dry sites EXACTLY (no margin; the written-out numbers are in test-sector-counts.js)', by('A').every(z => nF[z.code] === tgt[z.code][0] && nD[z.code] === tgt[z.code][1]), { nF, nD });
T('4d exactly 454 fields and 36 dry sites in total (490 sites), high density', fields.length === 454 && dry.length === 36, [fields.length, dry.length]);
T('4e the site stays in the sector it was made for (its own record agrees)', sites.every(s => s.sector === W.sectorAt(s.x, s.y)));
let gapOk = true; for (let i = 0; i < sites.length && gapOk; i++) for (let j = i + 1; j < sites.length; j++) { const a = sites[i], b = sites[j]; if (Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius + CONFIG.MIN_GAP - 1e-6) { gapOk = false; break; } }
T('4f fields keep the minimum gap (room for wells and collection stations)', gapOk);
T('4g no field is on water', sites.every(s => W.tile(s.x, s.y).terrain !== 'WATER_WADI'));
const avg = k => { const a = fields.filter(s => s.sector === k); return a.reduce((p, s) => p + s.initialReserve, 0) / a.length; };
T('4h the sectors differ: A4 (heavy, poor) has smaller reserves than A2 (rich, light)', avg('A4') < avg('A2') && fields.filter(s => s.sector === 'A4' && s.quality === 'LOW').length > fields.filter(s => s.sector === 'A2' && s.quality === 'LOW').length);
T('4i every field has reserve, depth, pressure, quality and capacity', fields.every(s => s.initialReserve > 0 && s.depth > 0 && s.pressurePotential > 0 && s.quality && s.props && s.props.capacity > 0));
T('4j the sites are the same every time the world is made (deterministic)', JSON.stringify(allSites()) === JSON.stringify(W.regions.flatMap(r => createWorld({ seed: 20260101 }).regionSites(r.id))));

console.log('5. the lookups still work (region, id, near, at)');
T('5a siteById / sitesNear / oilFieldAt find every field', fields.every(s => W.siteById(s.id) === s && W.sitesNear(s.x, s.y, 2).includes(s) && W.oilFieldAt(s.x, s.y) && W.oilFieldAt(s.x, s.y).kind === 'FIELD'));
T('5b a field belongs to the region cell it lies in (the cell is only the lookup key)', sites.every(s => s.regionId === W.regionIdAt(s.x, s.y)));
T('5c the ids are unique', new Set(sites.map(s => s.id)).size === sites.length);
T('5d the exploration states still start undiscovered (the sectors reveal nothing)', fields.every(s => W.stateOf(s.id) === 'UNDISCOVERED') && fields.every(s => W.visibleInfo(s.id) == null || W.visibleInfo(s.id).state !== undefined));

console.log('6. the start: the cells open at the beginning hold oil to drill');
const open = W.regions.filter(r => r.unlocked), perCell = open.map(r => [r.name, W.regionSites(r.id).filter(s => s.kind === 'FIELD').length]);
T('6a the open cells (C2 west, C4 east) contain oil fields in A7 / A3 / A5', open.filter(r => ['C2', 'C4'].includes(r.name)).every(r => W.regionSites(r.id).some(s => s.kind === 'FIELD')), perCell);
T('6b C1 holds the whole reserve region and the reserve zone', (() => { const c = W.sector('C1'), r = W.reserveRegionOfWorld(), z = W.reserveZoneOfWorld(); return r.x >= c.x && r.y >= c.y && r.x + r.w <= c.x + c.w && r.y + r.h <= c.y + c.h && z.x >= c.x && z.x + z.w <= c.x + c.w && z.y >= c.y && z.y + z.h <= c.y + c.h; })());
T('6c the water zone E1 area exists in the south (the old 810,1066 spot lies inside E1)', W.sectorAt(810, 1066) === 'E1');
T('6d the cell grid keeps its names behind «خلية» and the reserve cell reads C1', W.regionLabel(12) === 'خلية C1' && W.regionLabel(14) === 'C1' && W.zoneInfo(14).name === 'C3');

console.log('7. another world seed is the OLD world, unchanged');
let OLD = null; try { const tmp = path.join(os.tmpdir(), 'worldmap-before-sectors.js'); fs.writeFileSync(tmp, execSync('git show 484a0a7:oli/worldmap.js', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 })); OLD = require(tmp); } catch (e) { }
const W7 = createWorld({ seed: 7 });
T('7a no sectors: the old names, the old sites', W7.sectors.length === 0 && W7.sectorAt(100, 100) === null && W7.regionLabel(14) === 'C3');
if (OLD) { const O7 = OLD.createWorld({ seed: 7 }); T('7b seed 7: every site identical to the code before the sectors', JSON.stringify(W7.regions.map(r => W7.regionSites(r.id))) === JSON.stringify(O7.regions.map(r => O7.regionSites(r.id)))); const O = OLD.createWorld({ seed: 20260101 }); let same = true; for (let i = 0; i < 3000 && same; i++) { const x = (i * 7919) % 1920, y = (i * 104729) % 1280; same = JSON.stringify(O.tile(x, y)) === JSON.stringify(W.tile(x, y)); } T('7c the terrain of the default world is identical (3000 tiles): only the sites moved', same); } else console.log('  (git comparison skipped)');

console.log('8. external mode (the game thread): the sectors work without chunk or site data');
const X = createWorld({ seed: 20260101, external: true });
T('8a 17 sectors, sectorAt and labels work with nothing loaded', X.sectors.length === 17 && X.sectorAt(1500, 100) === 'A2' && X.sectorAt(10, 10) === 'F1' && X.regionLabel(14) === 'C1');

console.log('\nSECTORS TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
