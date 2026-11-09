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
T('2e F1 allows no land building: only the reserved offshore family (the sea buildings come later)', R.F.allow.every(k => !B.DEFS[k]) && R.F.allow.length === 4);
T('2f every sector kind has perks and needs to show the player', ['A', 'B', 'C', 'D', 'E', 'F'].every(k => R[k].perks.length >= 3 && R[k].needs.length >= 1));
console.log('3. a legal building is allowed, carries the sector info, and the sector discount shows in the price');
const find = (id, z) => { for (let r = 0; r < 80; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const [cx, cy] = centre(z), v = S.validate(id, cx + dx * 3, cy + dy * 3, 0, {}); if (v.ok) return [cx + dx * 3, cy + dy * 3, v]; } return null; };
const bt = find('crude_tank_s', W.sector('B4')), at = find('crude_tank_s', W.sector('A2'));
T('3a a small crude tank can be built in B4 and in A2', !!bt && !!at, [!!bt, !!at]);
if (bt && at) { const vb = bt[2], va = at[2]; T('3b the verdict names the sector and carries its perks', vb.sector.code === 'B4' && vb.sector.perks.length >= 3 && va.sector.code === 'A2');
  T('3c NO sector gives any discount (none approved): the cost in B is exactly base x terrain, and no sectorMult is set', !vb.sectorMult && !va.sectorMult && (() => { const S0 = new B.BuildingStore(Object.assign({}, ts, { sectorRule: undefined }), { cash: 1e13 }), v0 = S0.validate('crude_tank_s', bt[0], bt[1], 0, {}); return v0.ok && vb.cost === v0.cost; })(), [vb.cost]); }
const rf = find('refinery_s', W.sector('D2')); T('3d a refinery can be built in a D sector (inside the refinery zone) at the normal price, no discount', (() => { for (const r of W.regions) for (const z of W.refineryZones(r.id)) { const c = W.sectorAt(z.x + 14, z.y + 9); if (c && c[0] === 'D') { for (let j = 0; j < 12; j++) for (let i = 0; i < 20; i++) { const v = S.validate('refinery_s', z.x + i, z.y + j, 0, {}); if (v.ok) return !v.sectorMult && v.sector.kind === 'D'; } } } return false; })());
console.log('4. crossing a border, and the reserve');
T('4a a big building across the A / B border is refused (it must stand in one sector)', (() => { const v = S.validate('crude_tank_s', 984, 150, 0, {}); return v.reason === 'sectorStraddle' && S.validate('crude_tank_s', 960, 150, 0, {}).reason !== 'sectorStraddle'; })());
T('4b in C1 outside the reserve region a tank is refused: the strategic tanks belong in the reserve land', (() => { const v = S.validate('crude_tank_s', 975, 990, 0, {}); return v.reason === 'sectorReserveOnly' || v.reason === 'sectorForbidden'; })());
T('4c inside the reserve region the old reserve rule still has the last word (wells refused with its message)', S.validate('oil_well', 700, 700, 0, {}).reason === 'reserveOnly');
console.log('5. another world (no sectors) is not affected');
const W7 = createWorld({ seed: 7 }), S7 = new B.BuildingStore(B.fromWorld(W7, CONFIG), { cash: 1e13 });
T('5a no sectors: no sector verdict at all', !ts.sectorRule === false && !B.fromWorld(W7, CONFIG).sectorRule && !/^sector/.test(S7.validate('refinery_s', 700, 700, 0, {}).reason || ''));
console.log('6. F1 is prepared for the future sea buildings (no extraction exists yet)');
{ const D = B.DEFS.crude_tank_s, id = 'offshore_platform';
  T('6a the sector rule lists the whole offshore family and nothing from land', ['offshore_platform', 'offshore_support', 'subsea_pipe', 'coastal_link'].every(k => R.F.allow.includes(k)) && R.F.allow.length === 4);
  T('6b today no real building is an offshore one, so nothing can be built in F1 yet (a land building is refused by the sector)', IDS.every(k => B.DEFS[k].domain !== 'sea') && S.validate('crude_tank_s', 48, 570, 0, {}).reason === 'sectorForbidden');
  B.DEFS[id] = Object.assign({}, D, { id, domain: 'sea' });                       // a throw-away stand-in for a future platform, removed right after
  try {
    const sea = ts.tile(48, 570), vs = S.validate(id, 48, 570, 0, {}), va = S.validate(id, 1200, 640, 0, {}), vl = S.validate(id, 400, 160, 0, {});
    T('6c a sea-domain building is NOT blocked by the sector rules in F1: it is accepted on sea tiles', !!sea && ts.terrain[sea.terrain].buildable === false && vs.ok === true && vs.sector.code === 'F1', [sea && sea.terrain, vs.reason, vs.sector && vs.sector.code]);
    T('6d the same building is refused on land sectors (A, B): offshore belongs to F1 only', va.reason === 'sectorForbidden' && vl.reason === 'sectorForbidden', [va.reason, vl.reason]);
  } finally { delete B.DEFS[id]; }
  T('6e F1 stays a continuous strip: every row of the world has sea west of the coast line', (() => { for (let y = 0; y < 1280; y += 8) if (W.sectorAt(0, y) !== 'F1') return false; return true; })());
  T('6f no sea economy was added: the rule table has no multiplier anywhere', Object.keys(R).every(k => Object.keys(R[k].mult).length === 0)); }
console.log('7. final confirmations: no discount in any price, the pipe search limit is the old one');
{ const fs = require('fs'), path = require('path'), src = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
  const S0 = new B.BuildingStore(Object.assign({}, ts, { sectorRule: undefined }), { cash: 1e13 });
  let pairs = 0, diff = [];
  for (const z of W.sectors) { if (z.shape === 'sea') continue; for (const id of IDS) { if (R[z.kind].allow.indexOf(id) < 0) continue; const D = B.DEFS[id]; let hit = null; for (let k = 0; k < 400 && !hit; k++) { const x = z.x + 20 + ((k * 37) % Math.max(1, z.w - 60)), y = z.y + 20 + ((k * 53) % Math.max(1, z.h - 60)), v = S.validate(id, x, y, 0, {}); if (v.ok) hit = [x, y, v]; } if (!hit) continue; pairs++; const v0 = S0.validate(id, hit[0], hit[1], 0, {}); if (!v0.ok || v0.cost !== hit[2].cost || hit[2].sectorMult) diff.push([z.code, id, v0.cost, hit[2].cost]); } }
  T('7a the price of every building in every sector (' + pairs + ' sector/building pairs checked) is IDENTICAL to the price with the sector rules switched off: no discount anywhere', pairs > 100 && diff.length === 0, diff.slice(0, 4));
  T('7b the price formula has no sector term except the (empty) multiplier table: cost = base x terrain x (sectorMult || 1) and sectorMult is never set', /\*\s*\(res\.sectorMult \|\| 1\)/.test(src('buildings.js')) && Object.keys(R).every(k => Object.keys(R[k].mult).length === 0));
  T('7c the DEFAULT pipe search limit is still 60000 (industry.js is unchanged)', /opts\.guard \|\| 60000\)/.test(src('industry.js')) && !/400000/.test(src('industry.js')));
  const lab = src('building-lab.js'), uses = (lab.match(/guard:\s*400000/g) || []).length;
  T('7d the 400000 limit appears exactly once outside the tests, in the automatic demo chain (connectDemo), and nowhere in the player\'s pipe tools', uses === 1 && /for \(const \{ p, q \} of c\) \{ const r = I\.layPipe\([^;]*guard: 400000/.test(lab) && !/400000/.test(src('world-preview.js')) && !/400000/.test(src('economy-ui.js'))); }
console.log('\nSECTOR RULES TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
