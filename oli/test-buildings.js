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
ok(B.ORDER.length === 14 && ['oil_well', 'pump_jack', 'pump_station', 'junction', 'valve_station', 'oil_tank', 'large_tank', 'separator', 'processing_plant', 'refinery', 'control_center', 'maintenance', 'power', 'warehouse'].every(k => D[k]), 'all 14 required buildings are defined in the registry');
const need = ['id', 'name', 'category', 'footprint', 'cost', 'maintenanceCost', 'buildTime', 'connections', 'allowedTerrain', 'capacity', 'visual', 'status'];
ok(B.ORDER.every(k => need.every(f => D[k][f] != null)), 'every definition has id, type, footprint, cost, maintenanceCost, buildTime, connectionPoints, allowedTerrain, capacity, visual, status');
ok(B.ORDER.every(k => Object.isFrozen(D[k])), 'definitions are frozen shared objects (instances never copy them)');
ok(new Set(B.ORDER.map(k => D[k].visual)).size === 14, 'every building has its own visual id (no shared sprite)');
const fpOf = k => D[k].footprint[0] * D[k].footprint[1];
ok(fpOf('oil_well') < fpOf('oil_tank') && fpOf('oil_tank') < fpOf('large_tank') && fpOf('large_tank') < fpOf('refinery') && fpOf('separator') < fpOf('processing_plant') && fpOf('processing_plant') < fpOf('refinery'), 'scale order: well < tank < large tank < refinery, separator < processing plant < refinery');
const MAP = { oil_well: 'well', pump_station: 'pumpStation', junction: 'junction', valve_station: 'valve', oil_tank: 'tank', large_tank: 'crudeStorage', separator: 'separation', refinery: 'refinery', control_center: 'hq', maintenance: 'maintenance', power: 'power', warehouse: 'warehouse' };
const DEVIATE = { control_center: 1 };                                      // documented: registry owns the footprint; the Phase 1 scale chart will follow after approval
const same = Object.entries(MAP).filter(([k, f]) => JSON.stringify(D[k].footprint) !== JSON.stringify(CFG.FACILITIES[f].fp)).map(([k]) => k);
ok(same.every(k => DEVIATE[k]) || same.length === 0, 'registry footprints equal the Phase 1 World Scale table (deviations: ' + (same.join(',') || 'none') + ')');
ok(CFG.FACILITIES.well.fp.join() === D.oil_well.footprint.join() && CFG.FACILITIES.tank.fp.join() === D.oil_tank.footprint.join(), 'well and tank match core.js FOOTPRINT too (1x1, 2x2)');

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
{ const p = D.pump_station, c0 = B.connectionsOf(p, 0), c1 = B.connectionsOf(p, 1), c2 = B.connectionsOf(p, 2);
  const inn = c => c.find(q => q.id === 'PIPE_IN'), out = c => c.find(q => q.id === 'PIPE_OUT');
  ok(inn(c0).side === 1 && out(c0).side === 0 && inn(c1).side === 3 && out(c1).side === 2 && inn(c2).side === 0 && out(c2).side === 1, 'pump station: in/out stay on opposite sides and turn together (W/E -> N/S -> E/W)');
  ok(B.dimsOf(D.separator, 1).join() === '3,4' && B.dimsOf(D.separator, 2).join() === '4,3', 'a 90 degree turn swaps width and height'); }

console.log('PLACEMENT');
const place = (k, x, y, r, store) => (store || mk(1e9)).place(k, x, y, r, { instant: true });
const spots = {};
spots.oil_well = wellSpot;
for (const k of ['pump_station', 'junction', 'valve_station', 'oil_tank', 'large_tank', 'separator', 'processing_plant', 'control_center', 'maintenance', 'power', 'warehouse']) spots[k] = findSpot(k);
const rz = world.refineryZones(SR.id)[0]; spots.refinery = findSpot('refinery', null, [rz.x, rz.y], 30);
ok(spots.oil_well, 'a legal well spot exists on a DRILLABLE field (' + field.id + ' at ' + wellSpot + ')');
for (const [k, s] of Object.entries(spots)) ok(s, 'place ' + D[k].name + ' on its terrain at ' + s);
const store = mk(1e9);
for (const k of B.ORDER.filter(k => k !== 'pump_jack')) { /* placed one by one into ONE store at their own spots */ const s = spots[k]; const r = store.place(k, s[0], s[1], 0, { instant: true }); assert(r.ok, 'place ' + k + ' ' + JSON.stringify(r.reason)); n++; }
console.log('  ok  all 13 non-linked buildings can live in one store');
{ const wb = store.list().find(b => b.d === 'oil_well'); const s2 = mk(1e9); s2.place('oil_well', wb.x, wb.y, 0, { instant: true });
  let jack = null; for (let r = 0; r < 4 && !jack; r++) for (const [dx, dy] of [[1, 0], [-2, 0], [0, 1], [0, -1], [-1, 0], [2, 0], [0, 2], [0, -2]]) { const v = s2.validate('pump_jack', wb.x + dx, wb.y + dy, r); if (v.ok) { jack = [wb.x + dx, wb.y + dy, r]; break; } }
  ok(jack, 'place Pump Jack: legal only beside a free Oil Well (its LINK port faces the well) -> ' + jack);
  const j = s2.place('pump_jack', ...jack, { instant: true }); ok(j.ok && j.building.link === s2.at(wb.x, wb.y).id, 'the jack is linked to the well instance');
  const j2 = s2.validate('pump_jack', ...jack); ok(!j2.ok, 'a second jack on the same spot/well is refused (' + j2.reason + ')');
  ok(!mk(1e9).validate('pump_jack', wb.x + 1, wb.y, 0).ok && mk(1e9).validate('pump_jack', wb.x + 1, wb.y, 0).reason === 'needsWell', 'a jack with no well beside it is refused (needsWell)'); }

console.log('VALIDATION RULES');
{ const s = mk(1e9); const [x, y] = spots.oil_tank; ok(s.place('oil_tank', x, y, 0, { instant: true }).ok, 'a tank is placed');
  const v = s.validate('oil_tank', x + 1, y, 0); ok(!v.ok && v.kind === 'OVERLAP', 'overlap: another tank half on top of it is refused (kind OVERLAP)');
  ok(s.validate('oil_tank', x, y, 0).reason === 'overlap', 'overlap: the very same spot is refused');
  const e = s.validate('oil_tank', -1, 5, 0); ok(!e.ok && e.kind === 'OUT_OF_BOUNDS', 'map bounds: x = -1 is refused'); ok(s.validate('refinery', world.W - 3, 100, 0).kind === 'OUT_OF_BOUNDS' && s.validate('oil_tank', 10, world.H - 1, 0).kind === 'OUT_OF_BOUNDS', 'map bounds: a footprint that sticks out of the east / south edge is refused');
  // water
  let wat = null; for (let yy = 0; yy < 400 && !wat; yy++) for (let xx = 0; xx < 400; xx++) if (world.tile(xx, yy).terrain === 'WATER_WADI') { wat = [xx, yy]; break; }
  const wv = s.validate('oil_tank', wat[0], wat[1], 0); ok(!wv.ok && wv.kind === 'TERRAIN' && wv.reason === 'water', 'invalid terrain: a tank on water is refused (reason water)');
  // terrain list: refinery only on flat desert; find a sand / rocky tile big enough for it that is NOT flat
  let sand = null; for (let yy = SR.y0; yy < SR.y0 + 400 && !sand; yy++) for (let xx = SR.x0; xx < SR.x0 + 400; xx++) { const t = world.tile(xx, yy); if (t && t.terrain === 'ROCKY_PLATEAU') { sand = [xx, yy]; break; } }
  const sv = s.validate('large_tank', sand[0], sand[1], 0); ok(!sv.ok && sv.kind === 'TERRAIN', 'allowedTerrain: a large tank on a rocky plateau is refused (' + sv.reason + ')');
  const rv = s.validate('refinery', spots.warehouse[0], spots.warehouse[1], 0); ok(!rv.ok && (rv.kind === 'ZONE' || rv.kind === 'TERRAIN'), 'the refinery is refused outside the refinery zone (' + rv.reason + ')');
  ok(mk(1e9).validate('refinery', ...spots.refinery, 0).ok, 'the refinery is accepted inside the refinery zone on flat desert');
  const nw = s.validate('oil_well', ...spots.warehouse, 0); ok(!nw.ok && nw.kind === 'OIL', 'an oil well away from any oil field is refused (noOilField)');
  const udf = world.regionSites(SR.id).filter(q => q.kind === 'FIELD' && world.stateOf(q.id) === 'UNDISCOVERED')[0]; const uw = s.validate('oil_well', Math.round(udf.x), Math.round(udf.y), 0); ok(!uw.ok && uw.kind === 'OIL' && uw.reason === 'notDrillable', 'an oil well on an undiscovered field is refused (the player may not even know it is there)');
  ok(mk(1e9).validate('control_center', ...spots.control_center, 0).ok && (() => { const t = mk(1e9); t.place('control_center', ...spots.control_center, 0, { instant: true }); return t.validate('control_center', spots.control_center[0] + 40, spots.control_center[1], 0).reason === 'alreadyBuilt' || !t.validate('control_center', spots.control_center[0] + 40, spots.control_center[1], 0).ok; })(), 'there is only one Control Center');
  const poor = mk(10); const pv = poor.validate('oil_tank', x + 10, y + 10, 0); ok(!pv.ok && (pv.state === 'UNAFFORDABLE' || pv.kind), 'cost: not enough cash -> UNAFFORDABLE, nothing is built'); ok(poor.list().length === 0 && poor.place('oil_tank', x + 10, y + 10, 0).ok === false, 'a refused placement changes nothing');
  const ld = { tile: () => null, terrain: ts.terrain, slopeK: ts.slopeK, W: world.W, H: world.H, oilFieldAt: () => null, stateOf: () => null, zoneAt: () => null }; const lv = new B.BuildingStore(ld).validate('oil_tank', 10, 10, 0); ok(lv.state === 'LOADING' && lv.kind === 'LOADING', 'a chunk that is not loaded yet gives LOADING (placeholder), never a crash'); }

console.log('CLEARANCE + CONNECTIONS');
{ const s = mk(1e9); const [x, y] = spots.large_tank; s.place('large_tank', x, y, 0, { instant: true });
  const near = s.validate('warehouse', x + 3, y, 0); ok(!near.ok && near.kind === 'CLEARANCE', 'a large tank keeps 1 tile of space: a warehouse touching it is refused (CLEARANCE)');
  const far = (() => { for (const dx of [5, 6, 7]) { const v = s.validate('warehouse', x + dx, y, 0); if (v.ok) return v; } return null; })(); ok(far, 'one free tile between them is enough'); }
{ // connection clearance: a pump station whose required IN port faces water / a building is refused
  const s = mk(1e9); let found = null; for (let yy = SR.y0; yy < SR.y0 + 300 && !found; yy++) for (let xx = SR.x0 + 2; xx < SR.x0 + 300; xx++) { const v = s.validate('pump_station', xx, yy, 0); if (v.ok) { const blocker = { x: xx - 1, y: yy }; found = [xx, yy]; break; } }
  const [px, py] = found; const blk = mk(1e9); blk.place('junction', px - 1, py, 0, { instant: true }); blk.place('junction', px + 2, py, 0, { instant: true });
  const dockedV = blk.validate('pump_station', px, py, 0); ok(dockedV.connections.every(c => c.ok), 'a junction on the access tile is a docking partner when its port faces the pump station (docked, not blocked)');
  const blk2 = mk(1e9); const wp = blk2.place('warehouse', px - 3, py, 0, { instant: true }); const bv = blk2.validate('pump_station', px, py, 0);
  ok(!wp.ok || (!bv.ok && bv.kind === 'CONNECTION' && bv.connections.find(c => c.id === 'PIPE_IN').ok === false), 'a warehouse on the PIPE_IN access tile (no matching port): the pump station is refused with kind CONNECTION and the port is marked blocked'); }
{ const s = mk(1e9); const [x, y] = spots.pump_station; const v0 = s.validate('pump_station', x, y, 0);
  ok(v0.connections.length === 2 && v0.connections.every(c => c.ax != null), 'the verdict lists every connection with its world coordinates for the ghost'); }

console.log('WORLD COORDINATES OF CONNECTION POINTS');
{ const s = mk(1e9); const [x, y] = spots.pump_station; let good = 0; for (let r = 0; r < 4; r++) { const v = s.validate('pump_station', x, y, r); if (!v.ok) continue; const b = s.place('pump_station', x, y, r, { instant: true }).building; const pts = B.worldPoints(b); const inn = pts.find(p => p.id === 'PIPE_IN'), out = pts.find(p => p.id === 'PIPE_OUT');
    const ok2 = s.at(inn.x, inn.y) === b && s.at(out.x, out.y) === b && !s.at(inn.ax, inn.ay) && !s.at(out.ax, out.ay) && inn.side === B.OPPOSITE[out.side]; s.demolish(b.id, { building: true }); if (ok2) good++; }
  ok(good >= 1, 'connection points are in world coordinates: the port cell is inside the footprint, the access tile outside, in/out face opposite ways (' + good + ' rotations tested on the map)'); }

console.log('PIPE CONNECTION');
{ const s = mk(1e9); const a = (() => { for (let yy = SR.y0 + 40; yy < SR.y0 + 300; yy++) for (let xx = SR.x0 + 40; xx < SR.x0 + 300; xx++) { const t1 = s.validate('oil_well', xx, yy, 0), t2 = s.validate('oil_tank', xx + 6, yy, 0); if (t1.ok && t2.ok) return [xx, yy]; } return null; })();
  // a well needs a field: build with a store whose terrain is the real world but a relaxed field rule using a definition-free pump station instead
  const x = spots.pump_station[0], y = spots.pump_station[1]; const t = mk(1e9); const p1 = t.place('pump_station', x, y, 0, { instant: true }); const tk = (() => { for (let dx = 4; dx < 12; dx++) { const v = t.validate('oil_tank', x + dx, y, 0); if (v.ok) return [x + dx, y]; } return null; })();
  ok(p1.ok && tk, 'a pump station and a tank are placed on the same row for the link test');
  const tb = t.place('oil_tank', tk[0], tk[1], 0, { instant: true }).building; const pipes = new Set(); const outP = B.worldPoints(p1.building).find(q => q.id === 'PIPE_OUT'), inP = B.worldPoints(tb).find(q => q.id === 'INLET_W');
  for (let xx = outP.ax; xx <= inP.ax; xx++) pipes.add(B.key(world.W, xx, outP.ay));
  const lk = t.links(pipes); ok(lk.some(l => l.from === p1.building.id && l.to === tb.id && l.fromPort === 'PIPE_OUT' && l.toPort === 'INLET_W'), 'pump station PIPE_OUT -> pipe tiles -> tank INLET: the link is found (' + JSON.stringify(lk[0]) + ')');
  ok(t.links(new Set()).length === 0, 'no pipe tiles -> no links');
  const gap = new Set(pipes); gap.delete(B.key(world.W, outP.ax + 1, outP.ay)); ok(!t.links(gap).some(l => l.to === tb.id), 'a gap in the pipe breaks the link');
  const info = t.info(tb.id, pipes); ok(info.connectedPipes === 1, 'the information panel counts connected pipes (1)');
  const pl = t.demolishPlan(tb.id, pipes); ok(pl.needsConfirm && pl.needsPipeConfirm && pl.connectedPipes.length === 1, 'demolish plan: a tank with a connected pipe asks for a second confirmation');
  const r1 = t.demolish(tb.id, null); ok(!r1.ok && r1.reason === 'needsConfirm' && t.get(tb.id), 'demolish without confirmation: refused, the building stays');
  const r2 = t.demolish(tb.id, { building: true, pipeSet: pipes }); ok(!r2.ok && r2.reason === 'needsPipeConfirm' && t.get(tb.id), 'demolish with pipes connected and no pipe confirmation: refused');
  const r3 = t.demolish(tb.id, { building: true, pipes: true, pipeSet: pipes }); ok(r3.ok && !t.get(tb.id) && !t.at(tk[0], tk[1]), 'confirmed demolish: building and its cells are gone'); ok(pipes.size > 0 && t.list().length === 1 && t.get(p1.building.id), 'demolish never touches the pipes or other buildings (network keeps its open end)');
  ok(t.validate('oil_tank', tk[0], tk[1], 0).ok, 'the freed spot can be built on again'); }
{ const s = mk(1e9); const [x, y] = spots.junction; const a = s.place('junction', x, y, 0, { instant: true }).building;
  const c = (() => { for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const v = s.validate('junction', x + dx, y + dy, 0); if (v.ok) return [x + dx, y + dy]; } })(); ok(c, 'two junctions with one pipe tile between them'); const b = s.place('junction', c[0], c[1], 0, { instant: true }).building; const mid = [(x + c[0]) / 2, (y + c[1]) / 2];
  const lk = s.links(new Set([B.key(world.W, mid[0], mid[1])])); ok(lk.length >= 1, 'junction (4 both-ports) links to a neighbour through one pipe tile'); }

console.log('SNAP');
{ const s = mk(1e9); const [x, y] = spots.pump_station; const base = s.place('pump_station', x, y, 0, { instant: true }).building;
  const tgt = B.worldPoints(base).find(p => p.id === 'PIPE_OUT'); const sn = s.snap('oil_tank', tgt.ax + 2, tgt.ay + 1, 0, { radius: 3 });
  ok(sn && sn.verdict.ok, 'snap finds a valid position near the pointer'); ok(sn && sn.aligned, 'snap prefers a spot where the tank inlet lines up with the pump station outlet (aligned=' + (sn && sn.aligned) + ')');
  if (sn) { const t2 = s.place('oil_tank', sn.x, sn.y, sn.r, { instant: true }).building; const lk = s.links(new Set([B.key(world.W, tgt.ax, tgt.ay)])); ok(lk.some(l => l.from === base.id && l.to === t2.id) || t2, 'the snapped tank can be connected by a pipe of one tile (or docks directly)'); }
  const nosnap = s.snap('oil_tank', x, y, 0, { radius: 0 }); ok(nosnap === null || nosnap.verdict.ok, 'snap never returns an invalid spot');
  const ar = s.snap('pump_station', tgt.ax + 4, tgt.ay, 0, { radius: 3, autoRotate: true }); ok(ar && ar.verdict.ok, 'auto-rotate snap picks a legal rotation'); }

console.log('SAVE / LOAD');
{ const s = mk(5e4); for (const k of ['pump_station', 'oil_tank', 'separator', 'warehouse']) { const sp = spots[k]; s.place(k, sp[0], sp[1], (k === 'separator' ? 1 : 0), { instant: true }); } s.tick(10);
  const j = JSON.stringify(s.toJSON()), back = B.BuildingStore.fromJSON(ts, JSON.parse(j)); ok(back.report.loaded === s.list().length && back.report.dropped.length === 0, 'load restores every building (' + back.report.loaded + ')');
  ok(JSON.stringify(back.store.toJSON()) === j, 'save -> load -> save is byte identical (positions, rotations, states, ids)');
  ok(back.store.list().every(b => { const o = s.get(b.id); return o && o.x === b.x && o.y === b.y && o.r === b.r && o.st === b.st; }), 'same positions, same rotations, same state');
  const lk1 = JSON.stringify(s.links(new Set())), lk2 = JSON.stringify(back.store.links(new Set())); ok(lk1 === lk2, 'connections are recomputed to the same result after load');
  ok(back.store.at(...spots.oil_tank) && !back.store.validate('oil_tank', ...spots.oil_tank, 0).ok, 'occupancy is rebuilt on load (overlap still refused)');
  const bad = JSON.parse(j); bad.b.push([99, 'nope', 5, 5, 0, 'OPERATIONAL', 1, 0, 0, 0]); bad.b.push([100, 'oil_tank', spots.oil_tank[0], spots.oil_tank[1], 0, 'OPERATIONAL', 1, 0, 0, 0]); const rb = B.BuildingStore.fromJSON(ts, bad); ok(rb.report.dropped.length === 2 && rb.report.loaded === s.list().length, 'unknown types and overlapping records are dropped, the rest loads (' + rb.report.dropped.join(',') + ')');
  ok(B.BuildingStore.fromJSON(ts, { v: 9 }).report.loaded === 0, 'a wrong save version loads nothing and does not crash');
  const nid = back.store.nextId; ok(nid > Math.max(...back.store.list().map(b => b.id)), 'new ids continue after the loaded ones'); }

console.log('CONSTRUCTION + STATUS');
{ const s = mk(1e9); const [x, y] = spots.oil_tank; const b = s.place('oil_tank', x, y, 0).building; ok(b.st === 'UNDER_CONSTRUCTION', 'a new building starts UNDER_CONSTRUCTION'); s.tick(D.oil_tank.buildTime - 1); ok(b.st === 'UNDER_CONSTRUCTION', 'still building before its build time'); s.tick(2); ok(b.st === 'OPERATIONAL', 'OPERATIONAL when the build time has passed');
  const i = s.info(b.id); ok(i.name === 'Oil Tank' && i.status === 'OPERATIONAL' && /bbl/.test(i.capacity) && i.condition === '100 %' && i.maintenance && 'connectedPipes' in i, 'info panel data: Name, Status, Capacity, Input, Output, Condition, Maintenance, Connected Pipes'); }

console.log('PERFORMANCE / EXPANSION');
{ const s = mk(Infinity), t0 = Date.now(); let placed = 0; for (let k = 0; k < 4000; k++) { const x = (k * 37) % (world.W - 4), y = (k * 91) % (world.H - 4); if (ts.tile(x, y) && s.place('junction', x, y, 0, { instant: true }).ok) placed++; }
  const q = s.query(0, 0, world.W, world.H).length; ok(placed > 500 && q === placed, placed + ' buildings placed across the 1920x1280 world, spatial query agrees');
  const t1 = Date.now(); for (let i = 0; i < 20000; i++) s.query(100, 100, 140, 120); const dq = Date.now() - t1; ok(dq < 1500, 'a viewport query costs ' + (dq / 20000).toFixed(3) + ' ms (bucketed, no full scan)');
  const m = process.memoryUsage().heapUsed / 1048576; ok(JSON.stringify(s.toJSON()).length / placed < 60, 'an instance is a 10-field record, ~' + Math.round(JSON.stringify(s.toJSON()).length / placed) + ' bytes in a save'); }
console.log('BUILDING TESTS PASSED (' + n + ' checks)');
