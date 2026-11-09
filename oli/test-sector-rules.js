/* Sector building rules: what may be built where is enforced by validate() - the same verdict the game shows the player.
 *   node oli/test-sector-rules.js */
const B = require('./buildings.js'), { createWorld, CONFIG } = require('./worldmap.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : '  -> ' + JSON.stringify(x))); } };
const W = createWorld({ seed: 20260101 }), ts = B.fromWorld(W, CONFIG), S = new B.BuildingStore(ts, { cash: 1e13 }), R = B.SECTOR_RULES, IDS = Object.keys(B.DEFS);
const centre = z => [z.x + (z.w >> 1) - 2, z.y + (z.h >> 1) - 2];
console.log('1. every building x every sector: the verdict follows the rule table');
let bad = [], n = 0;
for (const z of W.sectors) { const [cx, cy] = z.shape === 'sea' ? [30, 600] : centre(z), kind = z.kind;
  for (const id of IDS) { const v = S.validate(id, cx, cy, 0, {}), allowed = R[kind].allow.indexOf(id) >= 0; n++;
    const sectorRefusal = v.reason === 'sectorForbidden' || v.reason === 'sectorReserveOnly';
    if (kind === 'C') { if (!allowed && !sectorRefusal && !['reserveOnly', 'reserveBounds'].includes(v.reason) && v.reason !== 'terrain' && v.reason !== 'slope') bad.push([z.code, id, v.reason]); continue; }
    if (allowed === sectorRefusal) bad.push([z.code, id, allowed, v.reason]); } }
T('1a all ' + n + ' (sector, building) pairs: refused by the SECTOR exactly when the table says so', bad.length === 0, bad.slice(0, 5));
T('1b the refusal names the sector and where the building belongs', (() => { const v = S.validate('refinery_s', 1200, 600, 0, {}); return v.reason === 'sectorForbidden' && v.sector.code === 'A3' && v.allowedIn.join() === 'D'; })());
T('1c an oil well outside A is refused and points to A', (() => { const v = S.validate('oil_well', 200, 100, 0, {}); return v.reason === 'sectorForbidden' && v.sector.code === 'B1' && v.allowedIn.join() === 'A'; })());
T('1d anything on the sea (F1) is refused with the sea sector named', (() => { const v = S.validate('crude_tank_s', 20, 500, 0, {}); return v.reason === 'sectorForbidden' && v.sector.code === 'F1'; })());
T('1e valves and junctions are shared: never refused by a sector', W.sectors.filter(z => z.shape === 'rect').every(z => { const [cx, cy] = centre(z); return !/^sector/.test(S.validate('valve', cx, cy, 0, {}).reason || '') && !/^sector/.test(S.validate('junction', cx, cy, 0, {}).reason || ''); }));
console.log('2. the rule tables are what the spec says');
T('2a wells only in A', IDS.filter(i => R.A.allow.includes(i) && /well/.test(i)).length === 1 && !['B', 'C', 'D', 'E', 'F'].some(k => R[k].allow.includes('oil_well')));
T('2b refineries only in D; separators in A, D, E', IDS.filter(i => /^refinery_/.test(i)).every(i => B.SECTOR_HOME(i).join() === 'D') && ['A', 'D', 'E'].every(k => R[k].allow.includes('separator')) && !R.B.allow.includes('separator'));
T('2c big crude tanks (large, central) only in B (and C for the reserve); small and medium also in A', B.SECTOR_HOME('crude_tank_l').join() === 'B,C' && B.SECTOR_HOME('crude_tank_s').join() === 'A,B,C' && B.SECTOR_HOME('crude_tank_m').join() === 'A,B,C');
T('2d water tanks only in E; water pumps in A, D, E', B.SECTOR_HOME('water_tank_m').join() === 'E' && ['A', 'D', 'E'].every(k => R[k].allow.includes('water_pump_s')));
T('2e F1 allows no land building (offshore buildings come later)', R.F.allow.length === 0);
T('2f every sector kind has perks and needs to show the player', ['A', 'B', 'C', 'D', 'E', 'F'].every(k => R[k].perks.length >= 3 && R[k].needs.length >= 1));
console.log('3. a legal building is allowed, carries the sector info, and the sector discount shows in the price');
const find = (id, z) => { for (let r = 0; r < 80; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const [cx, cy] = centre(z), v = S.validate(id, cx + dx * 3, cy + dy * 3, 0, {}); if (v.ok) return [cx + dx * 3, cy + dy * 3, v]; } return null; };
const bt = find('crude_tank_s', W.sector('B4')), at = find('crude_tank_s', W.sector('A2'));
T('3a a small crude tank can be built in B4 and in A2', !!bt && !!at, [!!bt, !!at]);
if (bt && at) { const vb = bt[2], va = at[2]; T('3b the verdict names the sector and carries its perks', vb.sector.code === 'B4' && vb.sector.perks.length >= 3 && va.sector.code === 'A2');
  T('3c B gives a 10% discount on tanks, A none: cost = base x terrain x 0.9 in B', vb.sectorMult === .9 && !va.sectorMult && (() => { const S0 = new B.BuildingStore(Object.assign({}, ts, { sectorRule: undefined }), { cash: 1e13 }), v0 = S0.validate('crude_tank_s', bt[0], bt[1], 0, {}); return v0.ok && vb.cost === Math.round(v0.cost * .9) || Math.abs(vb.cost - v0.cost * .9) <= 1; })(), [vb.cost]); }
const rf = find('refinery_s', W.sector('D2')); T('3d a refinery can be built in a D sector (inside the refinery zone) and costs 10% less', (() => { for (const r of W.regions) for (const z of W.refineryZones(r.id)) { const c = W.sectorAt(z.x + 14, z.y + 9); if (c && c[0] === 'D') { for (let j = 0; j < 12; j++) for (let i = 0; i < 20; i++) { const v = S.validate('refinery_s', z.x + i, z.y + j, 0, {}); if (v.ok) return v.sectorMult === .9 && v.sector.kind === 'D'; } } } return false; })());
console.log('4. crossing a border, and the reserve');
T('4a a big building across the A / B border is refused (it must stand in one sector)', (() => { const v = S.validate('crude_tank_s', 984, 150, 0, {}); return v.reason === 'sectorStraddle' && S.validate('crude_tank_s', 960, 150, 0, {}).reason !== 'sectorStraddle'; })());
T('4b in C1 outside the reserve region a tank is refused: the strategic tanks belong in the reserve land', (() => { const v = S.validate('crude_tank_s', 975, 990, 0, {}); return v.reason === 'sectorReserveOnly' || v.reason === 'sectorForbidden'; })());
T('4c inside the reserve region the old reserve rule still has the last word (wells refused with its message)', S.validate('oil_well', 700, 700, 0, {}).reason === 'reserveOnly');
console.log('5. another world (no sectors) is not affected');
const W7 = createWorld({ seed: 7 }), S7 = new B.BuildingStore(B.fromWorld(W7, CONFIG), { cash: 1e13 });
T('5a no sectors: no sector verdict at all', !ts.sectorRule === false && !B.fromWorld(W7, CONFIG).sectorRule && !/^sector/.test(S7.validate('refinery_s', 700, 700, 0, {}).reason || ''));
console.log('\nSECTOR RULES TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
