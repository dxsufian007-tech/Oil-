/* EXACT oil-field counts of the approved sector plan: 306 real fields and 184 dry sites, and the exact number in every sector A1-A7.
 * The numbers below are written out here on purpose (not read from the config), so a change of the plan cannot slip through.
 *   node oli/test-sector-counts.js */
const { createWorld, CONFIG } = require('./worldmap.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : '  -> ' + JSON.stringify(x))); } };
const EXPECT = { A1: [46, 28], A2: [52, 31], A3: [38, 23], A4: [32, 19], A5: [48, 29], A6: [44, 26], A7: [46, 28] };      // [oil fields, dry sites]
const W = createWorld({ seed: 20260101 });
const all = W.regions.flatMap(r => W.regionSites(r.id)), count = (w, kind) => { const o = {}; for (const r of w.regions) for (const s of w.regionSites(r.id)) if (s.kind === kind) o[w.sectorAt(s.x, s.y)] = (o[w.sectorAt(s.x, s.y)] || 0) + 1; return o; };
const kinds = [...new Set(all.map(s => s.kind))];
console.log('1. totals (kinds in the world: ' + kinds.join(', ') + ')');
const F = count(W, 'FIELD'), D = count(W, 'DRY');
T('1a EXACTLY 306 oil fields in the whole world', all.filter(s => s.kind === 'FIELD').length === 306, all.filter(s => s.kind === 'FIELD').length);
T('1b EXACTLY 184 dry sites in the whole world', all.filter(s => s.kind === 'DRY').length === 184, all.filter(s => s.kind === 'DRY').length);
T('1c the world holds nothing else (every site is a field or a dry site): ' + all.length + ' = 490', all.length === 490 && kinds.every(k => k === 'FIELD' || k === 'DRY'));
console.log('2. exact count in every extraction sector');
for (const [c, [f, d]] of Object.entries(EXPECT)) T('2' + c + ' ' + c + ': exactly ' + f + ' oil fields and ' + d + ' dry sites', F[c] === f && D[c] === d, [F[c], D[c]]);
T('2h the seven sectors add up to 306 fields and 184 dry sites', Object.values(EXPECT).reduce((n, v) => n + v[0], 0) === 306 && Object.values(EXPECT).reduce((n, v) => n + v[1], 0) === 184);
console.log('3. nothing outside A1-A7');
T('3a no field and no dry site in any B, C, D, E or F sector', Object.keys(F).concat(Object.keys(D)).every(c => EXPECT[c]), [Object.keys(F), Object.keys(D)]);
T('3b every site sits inside the bounds of the sector its id maps to (sectorOfSite agrees with the position)', all.every(s => W.sectorOfSite(s.id) === W.sectorAt(s.x, s.y)));
console.log('4. the numbers do not depend on the way the world is built');
const W2 = createWorld({ seed: 20260101 });
T('4a a second world with the same seed has the identical field list (same ids, places, reserves)', JSON.stringify(W2.regions.map(r => W2.regionSites(r.id))) === JSON.stringify(W.regions.map(r => W.regionSites(r.id))));
T('4b the config table agrees with the numbers written in this test', Object.entries(EXPECT).every(([c, v]) => CONFIG.SECTOR_FIELDS[c] && CONFIG.SECTOR_FIELDS[c][0] === v[0] && CONFIG.SECTOR_FIELDS[c][1] === v[1]));
T('4c the world has no sites without a sector and no sector holds a site of another sector', all.every(s => W.sector(W.sectorAt(s.x, s.y)))); 
console.log('5. DRY sites keep their own rules (they are not converted to fields)');
T('5a a dry site is never a field: no dry site has a reserve to drill', all.filter(s => s.kind === 'DRY').every(s => !(s.initialReserve > 0)), all.filter(s => s.kind === 'DRY' && s.initialReserve > 0).length);
T('5b every field has a positive reserve and a capacity', all.filter(s => s.kind === 'FIELD').every(s => s.initialReserve > 0 && s.props && s.props.capacity > 0));
console.log('\nSECTOR COUNT TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
