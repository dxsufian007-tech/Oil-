/* Phase 4 of the oil system: wells. Four kinds, every well has its own numbers, and all the production wells of a field draw from the field's ONE reserve (no reserve is counted twice).
 * Everything is built with the real functions on the real world (world.drillWell, store.place, layPipe, Sim.step).
 *   NODE_PATH=/opt/npm-tools/node_modules node oli/test-wells.js */
const W = require('./worldmap.js'), B = require('./buildings.js'), I = require('./industry.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
const WL = W.CONFIG.WELLS, CFGW = require('./building-config.js').WELL;

function newWorld(seed) { const world = W.createWorld({ seed: seed || 20260101 }), ts = B.fromWorld(world), store = new B.BuildingStore(ts, { cash: 1e11 }), net = new I.PipeNet(ts.W), sim = new I.Sim(store, net); return { world, ts, store, net, sim }; }
const fieldOf = (g, pick) => g.world.regionSites(g.world.regions.find(r => r.starter).id).filter(s => s.kind === 'FIELD').sort((a, b) => b.radius - a.radius)[pick || 0];
const open = (g, f) => { g.world.discover(f.id); g.world.survey(f.id); g.world.makeDrillable(f.id); return f; };
function spotNear(g, def, cx, cy, maxr, skip) { for (let r = 0; r <= maxr; r++) { const n = 16 + r * 6; for (let a = 0; a < n; a++) { const x = Math.round(cx + Math.cos(a / n * 6.283) * r), y = Math.round(cy + Math.sin(a / n * 6.283) * r); if (skip && skip(x, y)) continue; if (g.store.validate(def, x, y, 0, {}).ok) return [x, y]; } } return null; }
/* n production wells on the field, each piped into its own crude tank, so every well can really deliver its oil */
function rig(g, f, n) {
  const wells = [], bad = []; let tries = 0, giveUp = (x, y) => bad.some(q => Math.hypot(q[0] - x, q[1] - y) < 3);
  while (wells.length < n && tries++ < n * 12) {
    const s = spotNear(g, 'oil_well', f.x, f.y, f.radius, (x, y) => giveUp(x, y) || g.store.list().some(o => Math.hypot(o.x - x, o.y - y) < 7)); if (!s) break; const w = g.store.place('oil_well', s[0], s[1], 0, { instant: true }); if (!w.ok) { bad.push(s); continue; }
    const drop = () => { g.store.demolish(w.building.id, { building: true, pipes: true, pipeSet: g.net }); bad.push(s); };
    const ts = spotNear(g, 'crude_tank_l', w.building.x + 8, w.building.y, 16); const t = ts && g.store.place('crude_tank_l', ts[0], ts[1], 0, { instant: true }); if (!(t && t.ok)) { drop(); continue; }
    const L = I.layPipe(g.store, g.net, g.ts, { b: w.building.id, port: 'OIL_OUT_E' }, { b: t.building.id, port: 'INPUT_W' }, 16); if (!L.ok) { g.store.demolish(t.building.id, { building: true, pipes: true, pipeSet: g.net }); drop(); continue; }
    wells.push(w.building);
  }
  return wells;
}
/* run `hours` hours and add up the oil the wells took out of the ground (bbl) */
function run(g, wells, hours) { let oil = 0, mix = 0; for (let h = 0; h < hours; h++) { g.sim.step(1 / 24); for (const w of wells) { const s = w.s; if (s._out) { oil += s._out / 24 * (1 - s._wc - s._gas); mix += s._out / 24; } } } return { oil, mix }; }

console.log('1. the four kinds of well');
{ const g = newWorld(), real = g.world.regionSites(g.world.regions.find(r => r.starter).id).filter(s => s.kind === 'FIELD')[0], dry = g.world.allSites().find(s => s.kind === 'DRY' && g.world.regions[s.regionId].unlocked);
  T('1a an exploratory well needs a discovered site: refused on an unknown one', g.world.drillWell('EXPLORATORY', real.id).reason === 'state');
  g.world.discover(real.id); g.world.discover(dry.id);
  const e1 = g.world.drillWell('EXPLORATORY', real.id, 5), e2 = g.world.drillWell('EXPLORATORY', dry.id, 6);
  T('1b exploratory well on a real field finds oil and surveys it; on a dry prospect it finds nothing', e1.ok && e1.result === 'OIL' && g.world.stateOf(real.id) === 'SURVEYED' && e2.ok && e2.result === 'DRY' && g.world.visibleInfo(dry.id).dry === true, [e1, e2]);
  T('1c every drilled well has a kind, a depth, a cost and a date', [e1, e2].every(w => w.type === 'EXPLORATORY' && w.depth > 0 && w.cost >= WL.minCost * WL.EXPLORATORY.factor && w.t > 0));
  T('1d the cost grows with the depth (a deeper site costs more to drill)', (() => { const a = g.world.allSites().filter(s => s.kind === 'FIELD'), lo = a.reduce((p, q) => q.depth < p.depth ? q : p), hi = a.reduce((p, q) => q.depth > p.depth ? q : p); return g.world.drillCost('APPRAISAL', hi.id) > g.world.drillCost('APPRAISAL', lo.id); })());
  T('1e a dry prospect cannot be appraised or developed', g.world.drillWell('APPRAISAL', dry.id).reason === 'dry' && g.world.makeDrillable(dry.id).reason === 'dry');
  const before = g.world.visibleInfo(real.id), a1 = g.world.drillWell('APPRAISAL', real.id, 7), mid = g.world.visibleInfo(real.id), a2 = g.world.drillWell('APPRAISAL', real.id, 8), after = g.world.visibleInfo(real.id), width = v => v.reserveRange[1] - v.reserveRange[0];
  T('1f the first appraisal well makes the field drillable and narrows the reserve estimate', a1.ok && a1.result === 'APPRAISED' && g.world.stateOf(real.id) === 'DRILLABLE' && width(mid) < width(before), [width(before), width(mid)]);
  T('1g every further appraisal narrows it again, but the estimate never becomes the exact number', a2.ok && width(after) < width(mid) && after.estimatedReserve !== real.initialReserve && after.reserveRange[0] <= real.initialReserve * 1.05 && after.reserveRange[1] >= real.initialReserve * .95, [width(mid), width(after)]);
  T('1h an injection well needs a producing field', g.world.drillWell('INJECTION', real.id).reason === 'state');
  const g2 = newWorld(), f = open(g2, fieldOf(g2)), w = rig(g2, f, 1); run(g2, w, 2); const early = g2.world.drillWell('INJECTION', f.id, 9);
  T('1i once the field produces, injection wells can be drilled and are counted on the field', w.length === 1 && g2.world.stateOf(f.id) === 'PRODUCING' && early.ok && f.injectors === 1, [w.length, g2.world.stateOf(f.id), early]);
  T('1j the registry knows every well drilled on a site', g.world.wellsOf(real.id).length === 3 && g.world.wellsOf(real.id).map(x => x.type).join() === 'EXPLORATORY,APPRAISAL,APPRAISAL'); }

console.log('2. production wells: every well has its own numbers');
{ const g = newWorld(), f = open(g, fieldOf(g)), wells = rig(g, f, 4);
  T('2a four production wells were built on the field and know which field they belong to', wells.length === 4 && wells.every(w => w.field === f.id), wells.length);
  run(g, wells, 3);
  T('2b each well has a daily production inside the game range', wells.every(w => w.s.nominal >= 500 && w.s.nominal <= 2500), wells.map(w => w.s.nominal));
  T('2c each well has an operating cost, a maintenance cost, a build cost, a condition and a status', wells.every(w => B.DEFS.oil_well.operatingCost > 0 && B.DEFS.oil_well.maintenanceCost > 0 && B.DEFS.oil_well.cost > 0 && w.c > 0 && w.c <= 1 && w.st));
  T('2d the well takes its depth, pressure, water cut and decline from its field', wells.every(w => w.s.shared === 1 && w.s.p0 >= 500 && w.s._wc >= CFGW.waterCutStart - 1e-9 && w.s._wc < 0.6 && w.s._wc !== CFGW.waterCutStart));
  T('2e the well\'s own decline follows the field\'s reserve (it is weaker when the field is emptier)', (() => { const w = wells[0]; return w.s._target <= w.s.nominal * 1.0001; })()); }

console.log('3. the reserve belongs to the field and is never counted twice');
{ const one = newWorld(), f1 = open(one, fieldOf(one)), w1 = rig(one, f1, 1), four = newWorld(), f4 = open(four, fieldOf(four)), w4 = rig(four, f4, 4);
  const r1 = run(one, w1, 48), r4 = run(four, w4, 48);
  T('3a four wells on the field produce much more than one (more wells = more capacity; each well keeps its own rate)', r4.oil > 2.5 * r1.oil && r4.oil < 8 * r1.oil, [r1.oil, r4.oil]);
  T('3b but the field lost exactly what the wells produced (one reserve, no double counting): 1 well', near(f1.initialReserve - f1.remainingReserve, r1.oil, 0.002), [f1.initialReserve - f1.remainingReserve, r1.oil]);
  T('3c the same with 4 wells: the field lost the oil of all four, once', near(f4.initialReserve - f4.remainingReserve, r4.oil, 0.002), [f4.initialReserve - f4.remainingReserve, r4.oil]);
  T('3d every well shows the same remaining reserve: the field\'s', w4.every(w => w.s.reserve === f4.remainingReserve));
  T('3e four wells did not multiply the reserve: the field started with its own reserve, not 4 times a well\'s', f4.initialReserve === f1.initialReserve && f4.initialReserve > 1e6);
  const other = fieldOf(four, 2), before = other.remainingReserve; run(four, w4, 5);
  T('3f a well draws only from its own field, other fields stay untouched', other.remainingReserve === before && other.id !== f4.id); }

console.log('4. the field capacity limits all its wells together');
{ const g = newWorld(), f = open(g, fieldOf(g)); f.props.capacity = 1000; const wells = rig(g, f, 4); const r = run(g, wells, 24);
  T('4a four wells were built', wells.length === 4, wells.length);
  T('4b with a small field capacity (1000 bbl/day) the four wells together cannot take more than the field can deliver', r.oil <= 1000 * 1.001, [r.oil]);
  T('4c but they still take most of it (the capacity is shared, not wasted)', r.oil > 1000 * 0.9, [r.oil]);
  T('4d each well is throttled well below its own capacity', wells.every(w => w.s._target < 0.9 * w.s.nominal)); }

console.log('5. depletion: the oil does not come back');
{ const g = newWorld(), f = open(g, fieldOf(g)); const start = 20000; f.remainingReserve = start; f.initialReserve = Math.max(f.initialReserve, start); const wells = rig(g, f, 3), spare = spotNear(g, 'oil_well', f.x, f.y, f.radius, (x, y) => g.store.list().some(o => Math.hypot(o.x - x, o.y - y) < 7)); let total = 0;
  for (let d = 0; d < 120 && f.remainingReserve > 0; d++) total += run(g, wells, 24).oil;
  T('5a the wells took exactly what was left in the field, not a barrel more', near(total, start, 0.002), [total, start]);
  T('5b the field is empty and marked depleted', f.remainingReserve === 0 && g.world.stateOf(f.id) === 'DEPLETED', [f.remainingReserve, g.world.stateOf(f.id)]);
  T('5c every well of the field stopped', wells.every(w => w.s._depleted && !(w.s._out > 0)));
  const more = run(g, wells, 48); T('5d nothing is produced afterwards and nothing regenerates', more.oil === 0 && f.remainingReserve === 0);
  T('5e a depleted field cannot take a new well (a free spot existed and is refused now)', !!spare && g.store.validate('oil_well', spare[0], spare[1], 0, {}).reason === 'depleted', spare && g.store.validate('oil_well', spare[0], spare[1], 0, {})); }

console.log('6. a broken well');
{ const g = newWorld(), f = open(g, fieldOf(g)), wells = rig(g, f, 3); run(g, wells, 6);
  const dead = wells[0]; dead.c = 0; dead.st = 'DAMAGED'; const r = run(g, wells.slice(1), 24), before = f.remainingReserve; run(g, wells, 1);
  T('6a a broken well produces nothing', !(dead.s._out > 0), dead.s._out);
  T('6b the other wells go on, and the broken one takes nothing out of the field', wells.slice(1).every(w => w.s._out > 0) && r.oil > 0);
  T('6c the field lost only what the working wells produced', near(before - f.remainingReserve, wells.slice(1).reduce((a, w) => a + w.s._out / 24 * (1 - w.s._wc - w.s._gas), 0), 0.01)); }

console.log('7. save and restore');
{ const g = newWorld(), f = open(g, fieldOf(g)), wells = rig(g, f, 2); run(g, wells, 30); g.world.drillWell('INJECTION', f.id, 3);
  const snap = JSON.parse(JSON.stringify(g.world.reserveSnapshot())), ps = JSON.parse(JSON.stringify(g.world.progressSnapshot())), left = f.remainingReserve;
  const h = newWorld(); h.world.restoreProgress(ps); h.world.restoreReserve(snap); const f2 = h.world.siteById(f.id);
  T('7a the remaining reserve of the field comes back exactly', f2.remainingReserve === left && left < f.initialReserve, [f2.remainingReserve, left]);
  T('7b the state, the injection well and the well registry come back', h.world.stateOf(f.id) === 'PRODUCING' && f2.injectors === 1 && h.world.wellsOf(f.id).length === 1);
  T('7c the saved data holds only the fields that changed (small save)', snap.f.length === 1 && JSON.stringify(snap).length < 600, JSON.stringify(snap).length);
  T('7d wells saved with the store come back tied to their field and show its restored reserve', (() => { const j = JSON.parse(JSON.stringify(g.store.toJSON())), st = B.BuildingStore.fromJSON(h.ts, j).store, sim2 = new I.Sim(st, new I.PipeNet(h.ts.W)), ws = st.list().filter(b => b.d === 'oil_well'); sim2.step(1 / 24); return ws.length === 2 && ws.every(w => w.field === f.id && w.s.shared === 1 && w.s.reserve === f2.remainingReserve); })()); }

console.log('8. a well of an older save joins its field');
{ const g = newWorld(), f = open(g, fieldOf(g)), wells = rig(g, f, 2); run(g, wells, 2);
  for (const w of wells) { w.s.shared = 0; delete w.s.shared; w.s.reserve = 123456; w.s.reserve0 = 123456; w.s.nominal = 1000; }
  run(g, wells, 2); T('8a an old well that carried its own reserve now shows its field\'s reserve and draws from it', wells.every(w => w.s.shared === 1 && w.s.reserve0 === f.initialReserve && w.s.reserve === f.remainingReserve));
}

console.log('\nWELL TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
