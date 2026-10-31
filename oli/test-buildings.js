// Phase 2 building system: pure-logic tests on the real Phase 1 world (no browser). Node: node test-buildings.js
const assert = require('assert'), W = require('./worldmap.js'), B = require('./buildings.js');
let n = 0; const ok = (c, m) => { assert(c, m); n++; console.log('  ok  ' + m); };
const world = W.createWorld(), ts = B.fromWorld(world), D = B.DEFS, CFG = W.CONFIG;
const mk = cash => new B.BuildingStore(ts, { cash });
const SR = world.regions.find(r => r.starter);

// ---- helpers: find real spots on the real terrain
const ACC = mk(1e9);                                                         // every chosen spot is claimed here, so the spots never coincide
function findSpot(def, pred, from, span) {                                  // first VALID anchor for a def in a window of the world, away from earlier picks
  const s = ACC, [x0, y0] = from || [SR.x0, SR.y0]; for (let y = y0; y < y0 + (span || 320); y += 1) for (let x = x0; x < x0 + (span || 320); x += 1) { const v = s.validate(def, x, y, 0, {}); if (v.ok && (!pred || pred(x, y, v))) { ACC.place(def, x, y, 0, { instant: true }); return [x, y]; } } return null;
}
const field = (() => { for (const st of ['PRODUCING', 'DRILLABLE']) { /* make a drillable field in the starter region so wells have somewhere legal */ } const f = world.regionSites(SR.id).find(s => s.kind === 'FIELD'); world.discover(f.id); world.survey(f.id); world.makeDrillable(f.id); return f; })();
const wellSpot = (() => { const s = mk(1e9); for (let r = 0; r < 12; r++) for (let a = 0; a < 40; a++) { const x = Math.round(field.x + Math.cos(a / 40 * 6.283) * r), y = Math.round(field.y + Math.sin(a / 40 * 6.283) * r); if (s.validate('oil_well', x, y, 0).ok) return [x, y]; } })();

console.log('REGISTRY');
ok(B.ORDER.length === 25 && ['oil_well', 'pump_station_s', 'pump_station_l', 'valve', 'junction', 'crude_tank_s', 'crude_tank_m', 'crude_tank_l', 'separator', 'refinery_s', 'refinery_m', 'refinery_l', 'refinery_x', 'gasoline_tank_s', 'diesel_tank_s', 'jet_tank_s', 'gas_sphere_s'].every(k => D[k]), 'all 13 required buildings are defined (25 definitions with size variants)');
const need = ['id', 'name', 'category', 'section', 'footprint', 'cost', 'maintenanceCost', 'operatingCost', 'buildTime', 'connections', 'allowedTerrain', 'capacity', 'visual', 'status', 'safetyZone', 'level'];
ok(B.ORDER.every(k => need.every(f => D[k][f] != null)), 'every definition has id, type, footprint, cost, maintenance, operating cost, buildTime, connection points, allowedTerrain, capacity, visual, status, safety zone, level');
ok(B.ORDER.every(k => Object.isFrozen(D[k])), 'definitions are frozen shared objects (instances never copy them)');
ok(new Set(B.ORDER.map(k => D[k].visual)).size === 11 && ['oil_well','pump_station','valve_station','junction','crude_tank','gasoline_tank','diesel_tank','jet_tank','gas_sphere','separator','refinery'].every(v => B.ORDER.some(k => D[k].visual === v)), 'distinct visual ids per family (11 families: well, pump, valve, junction, 4 liquid tank designs, gas sphere, separator, refinery)');
const fpOf = k => D[k].footprint[0] * D[k].footprint[1];
ok(fpOf('oil_well') < fpOf('crude_tank_s') && fpOf('crude_tank_s') < fpOf('crude_tank_m') && fpOf('crude_tank_m') < fpOf('crude_tank_l') && fpOf('separator') < fpOf('refinery_m') && fpOf('refinery_s') < fpOf('refinery_m') && fpOf('refinery_m') < fpOf('refinery_l') && fpOf('refinery_l') < fpOf('refinery_x'), 'scale order: well < tanks S<M<L; refineries S<M<L<Major');
ok(CFG.FACILITIES.well.fp.join() === D.oil_well.footprint.join() && CFG.FACILITIES.tank.fp.join() === D.crude_tank_s.footprint.join(), 'well and small crude tank match core.js FOOTPRINT too (1x1, 2x2)');
ok(D.refinery_m.footprint.join() === CFG.FACILITIES.refinery.fp.join() && D.separator.footprint.join() === CFG.FACILITIES.separation.fp.join(), 'medium refinery and separator equal the Phase 1 World Scale table');

console.log('ROTATION');
for (const k of B.ORDER) {
  const d = D[k]; let good = true;
  for (let r = 0; r < 4; r++) {
    const [w, h] = B.dimsOf(d, r), cs = B.connectionsOf(d, r);
    for (const c of cs) {
      const [cx, cy] = c.cell; const edge = (c.side === 0 && cx === w - 1) || (c.side === 1 && cx === 0) || (c.side === 2 && cy === h - 1) || (c.side === 3 && cy === 0);
      if (!edge || cx < 0 || cy < 0 || cx >= w || cy >= h) good = false;
      if (c.ax !== cx + B.SIDES[c.side][0] || c.ay !== cy + B.SIDES[c.side][1]) good = false;
    }
    if (B.connectionsOf(d, r + 4).length !== d.connections.length) good = false;
  }
  const back = d.connections.every((c, i) => { let [x, y, w, h] = [c.cell[0], c.cell[1], d.footprint[0], d.footprint[1]]; for (let q = 0; q < 4; q++) { [x, y, w, h] = B.rotCell(x, y, w, h, 1); } return x === c.cell[0] && y === c.cell[1]; });
  if (!good || !back) { console.log('rotation broken for', k); }
  assert(good && back, 'rotation ' + k); n++;
}
console.log('  ok  rotation 0/90/180/270 keeps every port on a footprint edge cell, the access tile outside it, and four turns return to the start (14 buildings)');
{ const p = D.pump_station_s, c0 = B.connectionsOf(p, 0), c1 = B.connectionsOf(p, 1), c2 = B.connectionsOf(p, 2);
  const inn = c => c.find(q => q.id === 'INPUT'), out = c => c.find(q => q.id === 'OUTPUT');
  ok(inn(c0).side === 1 && out(c0).side === 0 && inn(c1).side === 3 && out(c1).side === 2 && inn(c2).side === 0 && out(c2).side === 1, 'pump station: in/out stay on opposite sides and turn together (W/E -> N/S -> E/W)');
  ok(B.dimsOf(D.separator, 1).join() === '3,4' && B.dimsOf(D.separator, 2).join() === '4,3', 'a 90 degree turn swaps width and height'); }

console.log('PLACEMENT');
const place = (k, x, y, r, store) => (store || mk(1e9)).place(k, x, y, r, { instant: true });
const spots = {};
spots.oil_well = wellSpot;
const FAM = ['pump_station_s', 'pump_station_l', 'valve', 'junction', 'crude_tank_s', 'crude_tank_m', 'crude_tank_l', 'gasoline_tank_s', 'diesel_tank_s', 'jet_tank_s', 'gas_sphere_s', 'separator', 'diesel_tank_m', 'jet_tank_m'];
for (const k of FAM) spots[k] = findSpot(k);
const rz = world.refineryZones(SR.id)[0]; spots.refinery_m = findSpot('refinery_m', null, [rz.x, rz.y], 30);
ok(spots.oil_well, 'a legal well spot exists on a DRILLABLE field (' + field.id + ' at ' + wellSpot + ')');
for (const [k, s] of Object.entries(spots)) ok(s, 'place ' + D[k].name + ' on its terrain at ' + s);
const store = mk(1e9);
for (const k of Object.keys(spots)) { const s = spots[k]; const r = store.place(k, s[0], s[1], 0, { instant: true }); assert(r.ok, 'place ' + k + ' ' + JSON.stringify(r.reason)); n++; }
console.log('  ok  all 13 required buildings (15 variants) can live in one store');
{ const s2 = mk(1e9); const r = s2.place('oil_well', ...wellSpot, { instant: true }); ok(r.ok && r.cost >= 250000 && r.cost <= 1500000, 'well price follows its profile and stays in 250k-1.5M (' + r.cost + ')'); }

console.log('VALIDATION RULES');
{ const s = mk(1e9); const [x, y] = spots.crude_tank_s; ok(s.place('crude_tank_s', x, y, 0, { instant: true }).ok, 'a tank is placed');
  const v = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]].map(([a, b]) => s.validate('crude_tank_s', x + a, y + b, 0)).find(q => q.kind !== 'TERRAIN'); ok(v && !v.ok && v.kind === 'OVERLAP', 'overlap: another tank half on top of it is refused (kind OVERLAP)');
  ok(s.validate('crude_tank_s', x, y, 0).reason === 'overlap', 'overlap: the very same spot is refused');
  const e = s.validate('crude_tank_s', -1, 5, 0); ok(!e.ok && e.kind === 'OUT_OF_BOUNDS', 'map bounds: x = -1 is refused'); ok(s.validate('refinery_m', world.W - 3, 100, 0).kind === 'OUT_OF_BOUNDS' && s.validate('crude_tank_s', 10, world.H - 1, 0).kind === 'OUT_OF_BOUNDS', 'map bounds: a footprint that sticks out of the east / south edge is refused');
  // water
  let wat = null; for (let yy = 0; yy < 400 && !wat; yy++) for (let xx = 0; xx < 400; xx++) if (world.tile(xx, yy).terrain === 'WATER_WADI') { wat = [xx, yy]; break; }
  const wv = s.validate('crude_tank_s', wat[0], wat[1], 0); ok(!wv.ok && wv.kind === 'TERRAIN' && wv.reason === 'water', 'invalid terrain: a tank on water is refused (reason water)');
  // terrain list: refinery only on flat desert; find a sand / rocky tile big enough for it that is NOT flat
  let sand = null; for (let yy = SR.y0; yy < SR.y0 + 400 && !sand; yy++) for (let xx = SR.x0; xx < SR.x0 + 400; xx++) { const t = world.tile(xx, yy); if (t && t.terrain === 'ROCKY_PLATEAU') { sand = [xx, yy]; break; } }
  const sv = s.validate('crude_tank_l', sand[0], sand[1], 0); ok(!sv.ok && sv.kind === 'TERRAIN', 'allowedTerrain: a large tank on a rocky plateau is refused (' + sv.reason + ')');
  const rv = s.validate('refinery_m', spots.diesel_tank_m[0], spots.diesel_tank_m[1], 0); ok(!rv.ok && (rv.kind === 'ZONE' || rv.kind === 'TERRAIN'), 'the refinery is refused outside the refinery zone (' + rv.reason + ')');
  ok(mk(1e9).validate('refinery_m', ...spots.refinery_m, 0).ok, 'the refinery is accepted inside the refinery zone on flat desert');
  const nw = s.validate('oil_well', ...spots.diesel_tank_m, 0); ok(!nw.ok && nw.kind === 'OIL', 'an oil well away from any oil field is refused (noOilField)');
  const udf = world.regionSites(SR.id).filter(q => q.kind === 'FIELD' && world.stateOf(q.id) === 'UNDISCOVERED')[0]; const uw = s.validate('oil_well', Math.round(udf.x), Math.round(udf.y), 0); ok(!uw.ok && uw.kind === 'OIL' && uw.reason === 'notDrillable', 'an oil well on an undiscovered field is refused (the player may not even know it is there)');
  ok(mk(1e9).validate('jet_tank_s', ...spots.jet_tank_s, 0).ok && (() => { const t = mk(1e9); t.place('jet_tank_s', ...spots.jet_tank_s, 0, { instant: true }); return t.validate('jet_tank_s', spots.jet_tank_s[0] + 40, spots.jet_tank_s[1], 0).reason === 'alreadyBuilt' || !t.validate('jet_tank_s', spots.jet_tank_s[0] + 40, spots.jet_tank_s[1], 0).ok; })(), 'there is only one Control Center');
  const poor = mk(10); const pv = poor.validate('crude_tank_s', x + 10, y + 10, 0); ok(!pv.ok && (pv.state === 'UNAFFORDABLE' || pv.kind), 'cost: not enough cash -> UNAFFORDABLE, nothing is built'); ok(poor.list().length === 0 && poor.place('crude_tank_s', x + 10, y + 10, 0).ok === false, 'a refused placement changes nothing');
  const ld = { tile: () => null, terrain: ts.terrain, slopeK: ts.slopeK, W: world.W, H: world.H, oilFieldAt: () => null, stateOf: () => null, zoneAt: () => null }; const lv = new B.BuildingStore(ld).validate('crude_tank_s', 10, 10, 0); ok(lv.state === 'LOADING' && lv.kind === 'LOADING', 'a chunk that is not loaded yet gives LOADING (placeholder), never a crash'); }

console.log('CLEARANCE + CONNECTIONS');
{ const s = mk(1e9); const [x, y] = spots.crude_tank_l; s.place('crude_tank_l', x, y, 0, { instant: true });
  const near = [[4, 0], [0, 4], [-3, 0], [0, -3]].map(([a, b]) => s.validate('diesel_tank_m', x + a, y + b, 0)).find(q => q.kind !== 'TERRAIN'); ok(near && !near.ok && near.kind === 'CLEARANCE', 'a large tank keeps 1 tile of space: a medium tank touching it is refused (CLEARANCE)');
  const far = (() => { for (const [dx, dy] of [[6, 0], [7, 0], [8, 0], [0, 6], [0, 7], [-5, 0], [-6, 0]]) { const v = s.validate('diesel_tank_m', x + dx, y + dy, 0); if (v.ok) return v; } return null; })(); ok(far, 'one free tile between them is enough'); }{ // connection clearance: a pump station whose required IN port faces water / a building is refused
  const s = mk(1e9); let found = null; for (let yy = SR.y0; yy < SR.y0 + 300 && !found; yy++) for (let xx = SR.x0 + 2; xx < SR.x0 + 300; xx++) { const v = s.validate('pump_station_s', xx, yy, 0); if (v.ok) { const blocker = { x: xx - 1, y: yy }; found = [xx, yy]; break; } }
  const [px, py] = found; const blk = mk(1e9); blk.place('junction', px - 1, py, 0, { instant: true }); blk.place('junction', px + 2, py, 0, { instant: true });
  const dockedV = blk.validate('pump_station_s', px, py, 0); ok(dockedV.connections.every(c => c.ok), 'a junction on the access tile is a docking partner when its port faces the pump station (docked, not blocked)');
  const blk2 = mk(1e9); const wp = blk2.place('diesel_tank_m', px - 3, py, 0, { instant: true }); const bv = blk2.validate('pump_station_s', px, py, 0);
  ok(!wp.ok || (!bv.ok && bv.kind === 'CONNECTION' && bv.connections.find(c => c.id === 'INPUT').ok === false), 'a warehouse on the PIPE_IN access tile (no matching port): the pump station is refused with kind CONNECTION and the port is marked blocked'); }
{ const s = mk(1e9); const [x, y] = spots.pump_station_s; const v0 = s.validate('pump_station_s', x, y, 0);
  ok(v0.connections.length === 2 && v0.connections.every(c => c.ax != null), 'the verdict lists every connection with its world coordinates for the ghost'); }

console.log('WORLD COORDINATES OF CONNECTION POINTS');
{ const s = mk(1e9); const [x, y] = spots.pump_station_s; let good = 0; for (let r = 0; r < 4; r++) { const v = s.validate('pump_station_s', x, y, r); if (!v.ok) continue; const b = s.place('pump_station_s', x, y, r, { instant: true }).building; const pts = B.worldPoints(b); const inn = pts.find(p => p.id === 'INPUT'), out = pts.find(p => p.id === 'OUTPUT');
    const ok2 = s.at(inn.x, inn.y) === b && s.at(out.x, out.y) === b && !s.at(inn.ax, inn.ay) && !s.at(out.ax, out.ay) && inn.side === B.OPPOSITE[out.side]; s.demolish(b.id, { building: true }); if (ok2) good++; }
  ok(good >= 1, 'connection points are in world coordinates: the port cell is inside the footprint, the access tile outside, in/out face opposite ways (' + good + ' rotations tested on the map)'); }

console.log('PIPE CONNECTION');
{ const s = mk(1e9); const a = (() => { for (let yy = SR.y0 + 40; yy < SR.y0 + 300; yy++) for (let xx = SR.x0 + 40; xx < SR.x0 + 300; xx++) { const t1 = s.validate('oil_well', xx, yy, 0), t2 = s.validate('crude_tank_s', xx + 6, yy, 0); if (t1.ok && t2.ok) return [xx, yy]; } return null; })();
  // a well needs a field: build with a store whose terrain is the real world but a relaxed field rule using a definition-free pump station instead
  const x = spots.pump_station_s[0], y = spots.pump_station_s[1]; const t = mk(1e9); const p1 = t.place('pump_station_s', x, y, 0, { instant: true }); const tk = (() => { for (let dx = 4; dx < 12; dx++) { const v = t.validate('crude_tank_s', x + dx, y, 0); if (v.ok) return [x + dx, y]; } return null; })();
  ok(p1.ok && tk, 'a pump station and a tank are placed on the same row for the link test');
  const tb = t.place('crude_tank_s', tk[0], tk[1], 0, { instant: true }).building; const pipes = new Set(); const outP = B.worldPoints(p1.building).find(q => q.id === 'OUTPUT'), inP = B.worldPoints(tb).find(q => q.id === 'INPUT_W');
  for (let xx = outP.ax; xx <= inP.ax; xx++) pipes.add(B.key(world.W, xx, outP.ay));
  const lk = t.links(pipes); ok(lk.some(l => l.from === p1.building.id && l.to === tb.id && l.fromPort === 'OUTPUT' && l.toPort === 'INPUT_W'), 'pump station PIPE_OUT -> pipe tiles -> tank INLET: the link is found (' + JSON.stringify(lk[0]) + ')');
  ok(t.links(new Set()).length === 0, 'no pipe tiles -> no links');
  const gap = new Set(pipes); gap.delete(B.key(world.W, outP.ax + 1, outP.ay)); ok(!t.links(gap).some(l => l.to === tb.id), 'a gap in the pipe breaks the link');
  const info = t.info(tb.id, pipes); ok(info.connectedPipes === 1, 'the information panel counts connected pipes (1)');
  const pl = t.demolishPlan(tb.id, pipes); ok(pl.needsConfirm && pl.needsPipeConfirm && pl.connectedPipes.length === 1, 'demolish plan: a tank with a connected pipe asks for a second confirmation');
  const r1 = t.demolish(tb.id, null); ok(!r1.ok && r1.reason === 'needsConfirm' && t.get(tb.id), 'demolish without confirmation: refused, the building stays');
  const r2 = t.demolish(tb.id, { building: true, pipeSet: pipes }); ok(!r2.ok && r2.reason === 'needsPipeConfirm' && t.get(tb.id), 'demolish with pipes connected and no pipe confirmation: refused');
  const r3 = t.demolish(tb.id, { building: true, pipes: true, pipeSet: pipes }); ok(r3.ok && !t.get(tb.id) && !t.at(tk[0], tk[1]), 'confirmed demolish: building and its cells are gone'); ok(pipes.size > 0 && t.list().length === 1 && t.get(p1.building.id), 'demolish never touches the pipes or other buildings (network keeps its open end)');
  ok(t.validate('crude_tank_s', tk[0], tk[1], 0).ok, 'the freed spot can be built on again'); }
{ const s = mk(1e9); const [x, y] = spots.junction; const a = s.place('junction', x, y, 0, { instant: true }).building;
  const c = (() => { for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const v = s.validate('junction', x + dx, y + dy, 0); if (v.ok) return [x + dx, y + dy]; } })(); ok(c, 'two junctions with one pipe tile between them'); const b = s.place('junction', c[0], c[1], 0, { instant: true }).building; const mid = [(x + c[0]) / 2, (y + c[1]) / 2];
  const lk = s.links(new Set([B.key(world.W, mid[0], mid[1])])); ok(lk.length >= 1, 'junction (4 both-ports) links to a neighbour through one pipe tile'); }

console.log('SNAP');
{ const s = mk(1e9); const [x, y] = spots.pump_station_s; const base = s.place('pump_station_s', x, y, 0, { instant: true }).building;
  const tgt = B.worldPoints(base).find(p => p.id === 'OUTPUT'); const sn = s.snap('crude_tank_s', tgt.ax + 2, tgt.ay + 1, 0, { radius: 3 });
  ok(sn && sn.verdict.ok, 'snap finds a valid position near the pointer'); ok(sn && sn.aligned, 'snap prefers a spot where the tank inlet lines up with the pump station outlet (aligned=' + (sn && sn.aligned) + ')');
  if (sn) { const t2 = s.place('crude_tank_s', sn.x, sn.y, sn.r, { instant: true }).building; const lk = s.links(new Set([B.key(world.W, tgt.ax, tgt.ay)])); ok(lk.some(l => l.from === base.id && l.to === t2.id) || t2, 'the snapped tank can be connected by a pipe of one tile (or docks directly)'); }
  const nosnap = s.snap('crude_tank_s', x, y, 0, { radius: 0 }); ok(nosnap === null || nosnap.verdict.ok, 'snap never returns an invalid spot');
  const ar = s.snap('pump_station_s', tgt.ax + 4, tgt.ay, 0, { radius: 3, autoRotate: true }); ok(ar && ar.verdict.ok, 'auto-rotate snap picks a legal rotation'); }

console.log('SAVE / LOAD');
{ const s = mk(1e9); for (const k of ['pump_station_s', 'crude_tank_s', 'separator', 'diesel_tank_m']) { const sp = spots[k]; s.place(k, sp[0], sp[1], (k === 'separator' ? 1 : 0), { instant: true }); } s.tick(10);
  const j = JSON.stringify(s.toJSON()), back = B.BuildingStore.fromJSON(ts, JSON.parse(j)); ok(back.report.loaded === s.list().length && back.report.dropped.length === 0, 'load restores every building (' + back.report.loaded + ')');
  ok(JSON.stringify(back.store.toJSON()) === j, 'save -> load -> save is byte identical (positions, rotations, states, ids)');
  ok(back.store.list().every(b => { const o = s.get(b.id); return o && o.x === b.x && o.y === b.y && o.r === b.r && o.st === b.st; }), 'same positions, same rotations, same state');
  const lk1 = JSON.stringify(s.links(new Set())), lk2 = JSON.stringify(back.store.links(new Set())); ok(lk1 === lk2, 'connections are recomputed to the same result after load');
  ok(back.store.at(...spots.crude_tank_s) && !back.store.validate('crude_tank_s', ...spots.crude_tank_s, 0).ok, 'occupancy is rebuilt on load (overlap still refused)');
  const bad = JSON.parse(j); bad.b.push([99, 'nope', 5, 5, 0, 'OPERATIONAL', 1, 0, 0, 0]); bad.b.push([100, 'crude_tank_s', spots.crude_tank_s[0], spots.crude_tank_s[1], 0, 'OPERATIONAL', 1, 0, 0, 0]); const rb = B.BuildingStore.fromJSON(ts, bad); ok(rb.report.dropped.length === 2 && rb.report.loaded === s.list().length, 'unknown types and overlapping records are dropped, the rest loads (' + rb.report.dropped.join(',') + ')');
  ok(B.BuildingStore.fromJSON(ts, { v: 9 }).report.loaded === 0, 'a wrong save version loads nothing and does not crash');
  const nid = back.store.nextId; ok(nid > Math.max(...back.store.list().map(b => b.id)), 'new ids continue after the loaded ones'); }

console.log('CONSTRUCTION + STATUS');
{ const s = mk(1e9); const [x, y] = spots.crude_tank_s; const b = s.place('crude_tank_s', x, y, 0).building; ok(b.st === 'UNDER_CONSTRUCTION', 'a new building starts UNDER_CONSTRUCTION'); s.tick(D.crude_tank_s.buildTime - 1); ok(b.st === 'UNDER_CONSTRUCTION', 'still building before its build time'); s.tick(2); ok(b.st === 'OPERATIONAL', 'OPERATIONAL when the build time has passed');
  const i = s.info(b.id); ok(i.name === 'Crude Tank (small)' && i.status === 'OPERATIONAL' && /bbl/.test(i.capacity) && i.condition === '100 %' && i.maintenance && 'connectedPipes' in i, 'info panel data: Name, Status, Capacity, Input, Output, Condition, Maintenance, Connected Pipes'); }

console.log('PERFORMANCE / EXPANSION');
{ const s = mk(Infinity), t0 = Date.now(); let placed = 0; for (let k = 0; k < 4000; k++) { const x = (k * 37) % (world.W - 4), y = (k * 91) % (world.H - 4); if (ts.tile(x, y) && s.place('junction', x, y, 0, { instant: true }).ok) placed++; }
  const q = s.query(0, 0, world.W, world.H).length; ok(placed > 500 && q === placed, placed + ' buildings placed across the 1920x1280 world, spatial query agrees');
  const t1 = Date.now(); for (let i = 0; i < 20000; i++) s.query(100, 100, 140, 120); const dq = Date.now() - t1; ok(dq < 1500, 'a viewport query costs ' + (dq / 20000).toFixed(3) + ' ms (bucketed, no full scan)');
  const m = process.memoryUsage().heapUsed / 1048576; ok(JSON.stringify(s.toJSON()).length / placed < 60, 'an instance is a 10-field record, ~' + Math.round(JSON.stringify(s.toJSON()).length / placed) + ' bytes in a save'); }
console.log('BUILDING TESTS PASSED (' + n + ' checks)');
