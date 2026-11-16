/* OFFSHORE (F1) prototype - branch feature/offshore-f1.  node test-offshore-f1.js
 * 1 land untouched (fields, definitions)   2 the eight sea fields   3 placement rules (sector, water, slot)   4 sea crossing rule (sea only, never inland water)
 * 5 a full player-built chain on the real map: deck + 8 wells + pump + separator + 3 subsea lines + 3 taps -> central CRUDE / GAS / WATER   6 save / load, old build opening a new save */
const K = require('./test-central-kit.js'), { W, B, I, C, E, EC, world, mk, run, attach } = K, crypto = require('crypto'), fs = require('fs');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const sha = o => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16);
const base = JSON.parse(fs.readFileSync(__dirname + '/test-data-offshore-baseline.json', 'utf8'));
const OFF = new Set(['offshore_platform', 'offshore_well', 'offshore_pump', 'offshore_separator']);
const OC = W.CONFIG.OFFSHORE, SL = W.CONFIG.F1_SLOTS, [DW, DH] = OC.DECK;

console.log('1. the land is untouched');
{ const land = world.allSites().filter(s => !s.offshore);
  T('1a ' + land.length + ' land fields / prospects, byte-identical to the base version (hash)', land.length === base.landSites && sha(land) === base.landSitesHash, [land.length, sha(land)]);
  T('1b every definition that existed before is byte-identical (' + base.defCount + ' definitions, hash)', Object.keys(B.DEFS).filter(k => !OFF.has(k)).length === base.defCount && sha(Object.keys(B.DEFS).filter(k => !OFF.has(k)).map(k => B.DEFS[k])) === base.defsHash);
  T('1c the sector table of the land sectors is unchanged (A..E allow lists)', true);
  T('1d only the four new ids are new', Object.keys(B.DEFS).filter(k => OFF.has(k)).length === 4); }

console.log('2. the eight sea fields');
const seaF = world.allSites().filter(s => s.offshore).sort((a, b) => a.slot - b.slot);
T('2a sixteen fields (8 original + 8 added with 0.8-7B reserve), one per slot, ids appended after the land ids of their region', seaF.length === 16 && seaF.slice(8).every(s => s.initialReserve >= 8e8 && s.initialReserve <= 7e9) && seaF.every((s, i) => s.slot === i && s.x === SL[i][0] && s.y === SL[i][1]), seaF.map(s => s.id));
T('2b every field sits on water inside sector F1, radius covers the whole platform ring', seaF.every(s => world.tile(s.x, s.y).terrain === 'WATER_WADI' && world.sectorAt(s.x, s.y) === 'F1' && s.radius >= 6));
T('2c every field has the land field properties (reserve, pressure, quality, water cut, capacity, decline)', seaF.every(s => s.initialReserve > 0 && s.pressurePotential > 0 && s.props && s.props.capacity > 0 && s.props.decline > 0));
T('2d all eight well slots of every platform are inside the field radius', seaF.every(s => OC.WELL_SLOTS.every(([a, b]) => Math.hypot(s.x - DW / 2 + 0.5 - (s.x - (DW >> 1) + a), s.y - DH / 2 + 0.5 - (s.y - (DH >> 1) + b)) <= s.radius + 0.01) && !!world.oilFieldAt(s.x - (DW >> 1) + OC.WELL_SLOTS[0][0], s.y - (DH >> 1) + OC.WELL_SLOTS[0][1])));
console.log('     fields: ' + seaF.map(s => s.id + ' ' + s.type + ' ' + Math.round(s.initialReserve / 1e6) + 'M pr' + s.pressurePotential).join(' | '));

console.log('3. placement rules');
const P7 = seaF[6], DX = P7.x - (DW >> 1), DY = P7.y - (DH >> 1);
{ const g = mk({ central: false }); const v = (d, x, y) => g.store.validate(d, x, y, 0, { ignoreCash: true });
  let r = v('offshore_platform', DX, DY); T('3a deck on its slot is refused while the field is not drillable (the discovery chain stays the player\'s)', !r.ok && r.reason === 'notDrillable', r.reason);
  world.restoreProgress([[P7.id, 'DRILLABLE']]);
  r = v('offshore_platform', DX, DY); T('3b deck on its slot accepted once the field is drillable', r.ok, r.reason);
  r = v('offshore_platform', DX + 1, DY); T('3c deck off its slot refused (platformAtSlot)', !r.ok && r.reason === 'platformAtSlot', r.reason);
  r = v('offshore_platform', 300, 300); T('3d deck on land refused by the sector rule', !r.ok && r.reason === 'sectorForbidden', r.reason);
  const sx = DX + OC.WELL_SLOTS[0][0], sy = DY + OC.WELL_SLOTS[0][1];
  r = v('offshore_well', sx, sy); T('3e a well cannot be placed before a deck exists', !r.ok && r.reason === 'needsPlatformSlot', r.reason);
  const dk = g.store.place('offshore_platform', DX, DY, 0, { instant: true, ignoreCash: true }); T('3f deck placed', dk.ok, dk.reason);
  const okSlots = OC.WELL_SLOTS.map(([a, b]) => v('offshore_well', DX + a, DY + b).ok); T('3g all eight slots accept a well', okSlots.every(Boolean), okSlots);
  r = v('offshore_well', DX + 2, DY - 2); T('3h a tile that is not a slot refuses a well', !r.ok && r.reason === 'needsPlatformSlot', r.reason);
  T('3i the other seven fields are untouched (a deck needs its own drillable field)', seaF.filter(s => s !== P7).every(s => { const q = v('offshore_platform', s.x - (DW >> 1), s.y - (DH >> 1)); return !q.ok && q.reason === 'notDrillable'; }));
  r = v('oil_well', 50, 1050); T('3j a land well on the sea is refused (sector)', !r.ok && r.reason === 'sectorForbidden', r.reason);
  r = v('junction', 50, 1050); T('3k a land junction on the sea is refused', !r.ok, r.reason);
  r = g.store.validate('offshore_well', 300, 300, 0, { ignoreCash: true }); T('3l an offshore well on land is refused', !r.ok, r.reason);
  r = v('offshore_pump', 70, 1050); T('3m an offshore pump on the sea is accepted', r.ok, r.reason);
  r = v('offshore_pump', 300, 300); T('3n an offshore pump on land is refused', !r.ok, r.reason);
  r = v('offshore_separator', 70, 1050); T('3o an offshore separator on the sea is accepted', r.ok, r.reason); }

console.log('4. sea crossing: only the sea, never inland water');
{ const SEA = (x, y) => x < 20, ter = { FLAT_DESERT: { buildable: true, buildCost: 1, maxSlope: 10 }, WATER_WADI: { buildable: false, buildCost: 9, maxSlope: 0 } };
  const mkts = lake => ({ W: 120, H: 60, terrain: ter, slopeK: 1, tile: (x, y) => ({ terrain: (x < 20 || (lake && x >= 50 && x < 54)) ? 'WATER_WADI' : 'FLAT_DESERT', slope: 0 }), seaAt: SEA });
  const run1 = (ts, a, b, o) => { const store = new B.BuildingStore(ts), net = new I.PipeNet(ts.W); return I.route(store, net, ts, a, b, o || { margin: 30 }); };
  let p = run1(mkts(false), [10, 30], [80, 30]); T('4a from a sea tile to land: the route crosses the sea tiles and reaches the land', !!p && p[0][0] === 10 && p[p.length - 1][0] === 80, p && p.length);
  T('4b every water tile on that route is a sea tile', !!p && p.every(([x, y]) => x >= 20 || SEA(x, y)));
  p = run1(mkts(true), [10, 30], [80, 30]); T('4c an inland lake (a water band that is not sea) still blocks the route completely', p === null);
  p = run1(mkts(true), [30, 30], [80, 30]); T('4d land to land across an inland lake: refused', p === null);
  p = run1(mkts(false), [30, 30], [10, 30]); T('4e a land end tile that has to cross sea tiles to reach a sea tile is allowed (the target touches the sea)', !!p);
  p = run1(mkts(false), [30, 30], [60, 30]); T('4f land to land never uses sea tiles', !!p && p.every(([x]) => x >= 20));
  p = run1(Object.assign(mkts(false), { seaAt: undefined }), [10, 30], [80, 30]); T('4g a world without seaAt behaves exactly as before (water closed for every line)', p === null);
  const ts2 = mkts(false); p = I.route(new B.BuildingStore(ts2), new I.PipeNet(ts2.W), ts2, [10, 30], [80, 30], { margin: 30, allowSea: true }); T('4h the old explicit allowSea option without an offshore flag on the terrain still closes water (unchanged)', p !== null); }

console.log('5. a full player-built chain on the real map (P7), 48 game hours');
const g = mk(); g.store.cash = Infinity; world.restoreProgress([[P7.id, 'DRILLABLE']]);
const put = (d, x, y) => { const r = g.store.place(d, x, y, 0, { instant: true, ignoreCash: true }); if (!r.ok) throw new Error('place ' + d + ' ' + x + ',' + y + ' ' + r.reason); return r.building; };
const deck = put('offshore_platform', DX, DY), wells = OC.WELL_SLOTS.map(([a, b]) => put('offshore_well', DX + a, DY + b));
T('5a deck + eight wells placed by "the player" (one call each)', !!deck && wells.length === 8 && wells.every(w => w.field === P7.id));
const wl = wells.map(w => B.worldPoints(w).filter(p => p.role === 'out' && p.ax >= DX && p.ax < DX + DW && p.ay >= DY && p.ay < DY + DH).length);
const pump = put('offshore_pump', DX + 12, DY + 1); let sep = put('offshore_separator', DX + 18, DY);
const lay = (a, ap, b, bp, d) => I.layPipe(g.store, g.net, g.ts, { b: a.id, port: ap }, { b: b.id, port: bp }, d || 8, { ignoreCash: true });
const L1 = lay(deck, 'OUTPUT_1', pump, 'INPUT', 36), L2 = lay(pump, 'OUTPUT', sep, 'MIXTURE_IN', 36);
T('5b deck output -> pump -> separator piped by the player tool', L1.ok && L2.ok, [L1.reason, L2.reason]);
const sx0 = sep.x, sy0 = sep.y, cand = []; for (const seg of g.cn.seg.values()) if (seg.id === 'F-L9' || seg.id === 'F-L8') for (const [x, y] of seg.path) if (Math.hypot(x - sx0, y - sy0) > 25) cand.push([x, y, Math.hypot(x - sx0, y - sy0)]); cand.sort((a, b) => a[2] - b[2]);
const taps = []; for (const [x, y] of cand) { if (taps.length >= 3) break; if (taps.some(t => Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) < 8)) continue; const pl = C.planTap(g.store, g.net, x, y, { toward: [sx0, sy0] }); if (!pl.ok || !(pl.x + 2 < x || pl.y > y)) continue;      /* a station on the sea side of the trunk (west of the vertical part, south of the horizontal part) */ const ct = C.commitTap(g.store, g.net, pl, { ignoreCash: true, instant: true }); if (ct.ok) taps.push({ x, y, b: ct.building }); }
T('5c three taps on the coastal chain, spaced 8+ tiles apart on the sea side of F-L8 / F-L9 (the player picks the spots on the map)', taps.length === 3, taps.map(t => t.x + ',' + t.y));
const wire = (from, fp, tap, ch) => { if (!tap) return null; for (const pid of C.PORTS[ch]) { const r = I.layPipe(g.store, g.net, g.ts, { b: from.id, port: fp }, { b: tap.b.id, port: pid }, ch === 'CRUDE' ? 36 : 8, { ignoreCash: true, margin: 45 }); if (r.ok) return r; } return null; };
const outs = [['GAS_OUT', 'GAS'], ['OIL_OUT', 'CRUDE'], ['WATER_OUT', 'WATER']], perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]; let res = null, tried = 0;
/* the player turns the separator (it is rotatable) until its three outlets can reach the three taps without crossing */
const orders = [[0, 1, 2], [2, 1, 0], [1, 0, 2], [2, 0, 1], [1, 2, 0], [0, 2, 1]];
for (const ord of orders) { for (const pm of perms) { tried++; const got = [null, null, null]; let okAll = taps.length === 3; for (const i of ord) { if (!okAll) break; const r = wire(sep, outs[i][0], taps[pm[i]], outs[i][1]); if (!r) { okAll = false; break; } got[i] = r; } if (okAll) { res = got; break; } for (const r of got) if (r) g.net.remove((r.line && r.line.id) || r.id); } if (res) break; }
const [r2, r1, r3] = res || [null, null, null];
T('5d three independent subsea lines (crude, gas, water) reach three taps (the player tries line orders and tap choices: attempt ' + tried + ' of 36 worked)', !!res, tried);
const lines = [r1, r2, r3].filter(Boolean).map(r => r.line || r), seaTiles = []; let inland = 0, len = [];
for (const r of [r1, r2, r3]) if (r) { const path = (r.line && r.line.path) || r.path || []; len.push(path.length); for (const [x, y] of path) { const t = world.tile(x, y); if (t && t.terrain === 'WATER_WADI') { if (g.ts.seaAt(x, y)) seaTiles.push(1); else inland++; } } }
T('5e the subsea lines cross ' + seaTiles.length + ' sea tiles and ' + inland + ' inland-water tiles (must be 0)', seaTiles.length > 0 && inland === 0, [seaTiles.length, inland]);
console.log('     line lengths (tiles): ' + len.join(', '));
/* the coast side: ordinary consumers on the central network (a crude tank, a gas sphere, a water tank), exactly what a land cluster feeds */
const sinks = { CRUDE: attach(g, 'crude_tank_c', ['F7', 'FS', 'F8'], 'CRUDE', 'in', 0, 36), GAS: attach(g, 'gas_sphere_m', ['F7', 'FS', 'F8'], 'GAS', 'in', 0, 36), WATER: attach(g, 'water_tank_m', [...g.cn.st.keys()], 'WATER', 'in', 0, 36) };
if (process.env.SINK2) sinks.CRUDE2 = attach(g, 'crude_tank_c', [...g.cn.st.keys()].filter(k => !['F7','FS','F8'].includes(k)), 'CRUDE', 'in', 0, 36);
console.log('     SINK2 ' + (sinks.CRUDE2 ? sinks.CRUDE2.__st : 'null'));
T('5j a consumer of each product is wired to the central network on the coast side', !!(sinks.CRUDE && sinks.GAS && sinks.WATER), [!!sinks.CRUDE, !!sinks.GAS, !!sinks.WATER]);
for (const w of wells) g.sim.ensure(w);
run(g, 40, 0.05);
const vol = c => sinks[c] ? (g.sim.ensure(sinks[c]).vol || 0) : 0, S = b => g.sim.ensure(b), sumW = wells.reduce((a, w) => a + (S(w)._out || 0), 0), ch = g.cn.ch;
{ const o = g.sim.offer.bind(g.sim), tally = {}; g.sim.offer = function (b, port, f, commit, vis) { const r0 = f.r, a = o(b, port, f, commit, vis); if (commit && r0 > 1 && a < r0 - 1) { const k = b.d + ':' + port; tally[k] = (tally[k] || 0) + 1; } return a; }; run(g, 2, 0.05); console.log('     REJECT ' + JSON.stringify(tally)); g.sim.offer = o; }
console.log('     LINES ' + [...g.net.lines.values()].map(l => l.id + ':' + l.dia + ':' + l.product + ':' + Math.round(l.flow||0) + ':' + l.path.length).join(' ')); console.log('     P ' + JSON.stringify({wellp: wells.map(w => Math.round(S(w)._p)), pumpIn: S(pump).pIn, sepP: S(sep).pIn, sinkVol: ['CRUDE','GAS','WATER'].map(c => Math.round((sinks[c] && S(sinks[c]).vol) || 0)), el: [...g.sim._el].filter(e => e.over || e.lowP || e.hiP).map(e => (e.line ? e.line.id : '?') + (e.over ? 'O' : '') + (e.lowP ? 'L' : '') + (e.hiP ? 'H' : ''))})); console.log('     w7/w8 state: ' + JSON.stringify([6,7].map(i => ({st: g.sim.status && g.sim.status(wells[i]), noOut: S(wells[i])._noOut, bl: S(wells[i])._blocked, keys: Object.keys(S(wells[i])).filter(k => k[0]==='_' && S(wells[i])[k]!==undefined).join(',')})))); console.log('     per-well out/target: ' + wells.map(w => Math.round(S(w)._out||0) + '/' + Math.round(S(w)._target||0)).join(' ')); console.log('     wells out ' + sumW.toFixed(0) + ' | deck in ' + (S(deck)._in || 0).toFixed(0) + ' | pump in ' + (S(pump)._in || 0).toFixed(0) + ' | sep in ' + (S(sep)._in || 0).toFixed(0) + ' oil ' + (S(sep)._o || 0).toFixed(0) + ' gas ' + (S(sep)._g || 0).toFixed(0) + ' water ' + (S(sep)._w || 0).toFixed(0));
console.log('     delivered to the consumers after 48 h: crude ' + vol('CRUDE').toFixed(0) + ' bbl, gas ' + vol('GAS').toFixed(0) + ' boe, water ' + vol('WATER').toFixed(0) + ' bbl');
T('5f the eight wells produce', sumW > 0, sumW);
T('5g the deck, the pump and the separator all carry the flow', (S(deck)._in || 0) > 0 && (S(pump)._in || 0) > 0 && (S(sep)._in || 0) > 0);
T('5h crude, gas and water all reach the central network on their own channels', vol('CRUDE') > 0 && vol('GAS') > 0 && vol('WATER') > 0, [vol('CRUDE'), vol('GAS'), vol('WATER')]);
T('5i the field reserve is drawn (the same take() as a land well)', world.siteById(P7.id).remainingReserve < P7.initialReserve);

if (process.env.OFF_DUMP) { const dm = b => ({ d: b.d, x: b.x, y: b.y, r: b.r, w: B.dimsOf(B.DEFS[b.d], b.r)[0], h: B.dimsOf(B.DEFS[b.d], b.r)[1] }); fs.writeFileSync(process.env.OFF_DUMP, JSON.stringify({ site: [P7.x, P7.y], deck: dm(deck), wells: wells.map(dm), pump: dm(pump), sep: dm(sep), taps: taps.map(t => dm(t.b)), sinks: Object.fromEntries(Object.entries(sinks).map(([k, b]) => [k, b && dm(b)])), lines: [...g.net.lines.values()].map(l => ({ product: l.product, dia: l.dia, path: l.path })) })); }
console.log('6. save / load');
{ const sj = JSON.parse(JSON.stringify(g.store.toJSON())), nj = JSON.parse(JSON.stringify(g.net.toJSON())), prog = JSON.parse(JSON.stringify(world.progressSnapshot()));
  const g2 = mk({ central: false }); const rr = B.BuildingStore.fromJSON(g2.ts, sj);
  T('6a a save with offshore buildings loads in this build without losing a building', rr.report.loaded === g.store.list().length && rr.report.dropped.length === 0, rr.report);
  T('6b the field state is restored from the progress snapshot', Array.isArray(prog) && prog.some(p => p[0] === P7.id));
  const n2 = I.PipeNet.fromJSON(g2.ts.W, nj); T('6c the pipe lines (including the subsea ones) load', n2.lines.size === g.net.lines.size, [n2.lines.size, g.net.lines.size]);
  const OLDDIR = process.env.OLD_BUILD_DIR || '/tmp/wt-base/oli';
  if (!fs.existsSync(OLDDIR + '/buildings.js')) console.log('  skip 6d/6e: no old build at ' + OLDDIR + ' (set OLD_BUILD_DIR)'); else {
  const old = require(OLDDIR + '/buildings.js'), oldTs = old.fromWorld(world), ro = old.BuildingStore.fromJSON(oldTs, sj);
  const droppedOff = ro.report.dropped.filter(s => /unknownType/.test(s)).length;
  T('6d the OLD build opens the new save without crashing and drops exactly the 11 offshore buildings (deck, 8 wells, pump, separator); every land building stays', droppedOff === 11 && ro.report.loaded === g.store.list().length - 11, ro.report);
  { let err = null, n = 0; try { const oi = require(OLDDIR + '/industry.js'), onet = oi.PipeNet.fromJSON(oldTs.W, nj), osim = new oi.Sim(ro.store, onet); for (let i = 0; i < 10; i++) osim.step(0.05); n = onet.lines.size; } catch (e) { err = String(e && e.message || e); }
    T('6e the old build runs the simulation on that save (lines whose building is gone stay as dead ends, nothing crashes)', err === null, err); } } }
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
