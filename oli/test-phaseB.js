// Phase B (core): the building model - footprint, rotation, connection points -, placement validation by occupancy, the "no accidental connection" rule,
// scored snap, cost preview, cancel / confirm, save / load, and proof that previews never touch the simulation or the economy.
const assert = require('assert');
const { Game: G, CFG, idx } = require('./core.js');
CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
CFG.TERRAIN.MULT = [1, 1, 1, 1]; CFG.REGIONS.forEach(r => { r.mult = 1; });
const W = CFG.GRID_COLS, ok = m => console.log('  ok  ' + m); let pass = 0; const done = m => { pass++; ok(m); };
function mk(cash = 1e7) {
  const h = new G({ seed: 7 }); h.s.cash = cash; h.s.regions.forEach(r => { r.unlocked = true; });
  for (const a of h.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
  for (let y = 15; y < 75; y++) for (let x = 10; x < 130; x++) { const k = idx(x, y); h.map.block[k] = 0; h.map.water[k] = 0; }
  return h;
}
const line = h => { const w = h.place('well', 15, 40, 'large').building, t = h.place('tank', 70, 40).building; const L = h.buildLine(h.routeNodes('B' + w.id, 'B' + t.id, 1)).line; return { w, t, L }; };
const snapshot = h => JSON.stringify(h.serialize());
const roles = pts => pts.map(p => p.role).sort().join(',');

// ---- 1. the model: id, type, position, rotation, width, height, footprint, connection points
{
  const h = mk(); const w = h.place('well', 20, 20, 'small').building, t = h.place('tank', 30, 20).building;
  const mw = h.buildingModel(w), mt = h.buildingModel(t);
  for (const m of [mw, mt]) for (const k of ['id', 'type', 'x', 'y', 'rotation', 'width', 'height', 'footprint', 'connectionPoints']) assert(k in m, 'model field ' + k);
  assert.deepStrictEqual([mw.width, mw.height, mt.width, mt.height], [1, 1, 2, 2]); assert.strictEqual(mw.footprint.length, 1); assert.strictEqual(mt.footprint.length, 4);
  assert.strictEqual(roles(mw.connectionPoints), 'out,out,out,out'); assert.strictEqual(mt.connectionPoints.length, 8); assert.strictEqual(roles(mt.connectionPoints), Array(8).fill('in').join(','));
  for (const m of [mw, mt]) for (const p of m.connectionPoints) { assert(!m.footprint.some(c => c[0] === p.x && c[1] === p.y), 'a connection tile is outside the footprint'); }
  done('Model: well 1x1 with 4 OUT points, tank 2x2 with 8 IN points (all outside the footprint); id/type/position/rotation/size/footprint present');
}
// ---- 2. pump: IN + OUT on its axis, rotation turns both
{
  const h = mk(); const { L } = line(h); const c = L.cells[20], x = c % W, y = (c / W) | 0;
  const p = h.place('pump', x, y).building; const m = h.buildingModel(p);
  assert.strictEqual(m.connectionPoints.length, 2); assert.strictEqual(roles(m.connectionPoints), 'in,out');
  const o = m.connectionPoints.find(q => q.role === 'out'), i = m.connectionPoints.find(q => q.role === 'in');
  assert.strictEqual((o.x - x) + (i.x - x), 0); assert.strictEqual((o.y - y) + (i.y - y), 0); assert(Math.abs(o.x - x) + Math.abs(o.y - y) === 1);
  const rot0 = m.rotation, out0 = [o.x, o.y]; h.flipPump(p); const m2 = h.buildingModel(p), o2 = m2.connectionPoints.find(q => q.role === 'out');
  assert.strictEqual((m2.rotation - rot0 + 360) % 360, 180); assert.deepStrictEqual([o2.x, o2.y], [i.x, i.y]); assert.notDeepStrictEqual([o2.x, o2.y], out0);
  for (const dir of [0, 1, 2, 3]) { const pts = h.connectionPoints('pump', 50, 50, dir), oo = pts.find(q => q.role === 'out'); assert.deepStrictEqual([oo.x - 50, oo.y - 50], [[1, 0], [-1, 0], [0, 1], [0, -1]][dir]); }
  assert.deepStrictEqual([0, 1, 2, 3].map(d => h.rotationOf({ type: 'pump', dir: d })), [0, 180, 90, 270]);
  done('Pump: IN and OUT on opposite sides of its axis; flip = rotation +180 and swaps both points; all four facings give 0/180/90/270 and the right OUT side');
}
// ---- 3. valve and junction connection points live on pipe tiles
{
  const h = mk(); const { L } = line(h); const vk = L.cells[25]; assert(h.setValve(vk, 1).ok);
  const vp = h.valvePorts(vk); assert.strictEqual(vp.length, 2); assert.strictEqual(roles(vp), 'in,out');
  const a = L.cells[24], b = L.cells[26]; assert.deepStrictEqual([vp[0].x, vp[0].y], [a % W, (a / W) | 0]); assert.deepStrictEqual([vp[1].x, vp[1].y], [b % W, (b / W) | 0]);
  assert.strictEqual(h.junctionPorts(L.cells[10]).length, 2);
  done('Valve: IN towards the start of its line, OUT towards the end; junction/pipe tile: its pipe neighbours (2 on a straight run)');
}
// ---- 4. validation by footprint/occupancy, not by picture overlap
{
  const h = mk(); h.place('tank', 40, 40);
  assert.strictEqual(h.placement('tank', 39, 39).reason, 'overlap'); assert.strictEqual(h.placement('tank', 41, 41).reason, 'occupied'); assert.strictEqual(h.placement('tank', 40, 40).reason, 'occupied');
  assert.strictEqual(h.placement('tank', 42, 40).ok, true, 'a tank right beside another one (cells touch, no overlap)'); assert.strictEqual(h.placement('tank', 38, 38).ok, true, 'diagonal corner touch is fine');
  assert.strictEqual(h.placement('tank', 139, 40).reason, 'edge'); assert.strictEqual(h.placement('tank', -1, 5).reason, 'outside'); assert.strictEqual(h.placement('tank', 40, 87).reason, 'edge');
  const wk = idx(60, 60); h.map.water[wk] = 1; assert.strictEqual(h.placement('tank', 59, 59).reason, 'water'); assert.strictEqual(h.placement('tank', 60, 59).reason, 'water');
  const pl = h.placement('tank', 70, 70); assert.strictEqual(pl.cells.length, 4); assert.deepStrictEqual(pl.cells[3], [71, 71]);
  done('Validation by cells: overlap, occupied, map edge (footprint sticking out), outside, water under any cell; touching tanks and corners are allowed');
}
// ---- 5. no accidental connection: beside the middle of a pipe is refused; at an open end is a deliberate, valid attachment
{
  const h = mk(); const { L, t } = line(h); const mid = L.cells[30], mx = mid % W, my = (mid / W) | 0;
  const nodes0 = h.net.graph.nodes.length;
  for (const [dx, dy] of [[0, 1], [0, -2], [1, 1], [-1, 1]]) { const r = h.placement('tank', mx + dx, my + dy); assert(!r.ok && (r.reason === 'touchesPipe' || r.reason === 'pipe'), 'beside the middle: ' + r.reason); }
  assert.strictEqual(h.placement('tank', mx, my + 2).ok, true, 'one tile away from the pipe is fine');
  const tooClose = h.place('tank', mx, my + 1); assert(!tooClose.ok && tooClose.reason === 'touchesPipe'); assert.strictEqual(h.net.graph.nodes.length, nodes0, 'a refused placement changes nothing');
  const rm = h.removeAt(t.x, t.y); const endK = L.cells[L.cells.length - 1], ex = endK % W, ey = (endK / W) | 0; assert(rm.ok, 'remove ' + JSON.stringify(rm)); assert(h.graphNode(endK), 'graph ' + (h.net.graph ? h.net.graph.nodes.length + ' nodes, tileNode ' + h.net.graph.tileNode[endK] + ' pipe ' + h.pipe[endK] : 'null') + ' no node at the line end ' + ex + ',' + ey + ' lines ' + h.lines.map(q => q.cells.length + ':' + (q.cells[q.cells.length - 1] % W))); assert.strictEqual(h.graphNode(endK).kind, 'end');
  const n1 = h.net.graph.nodes.length, pr = h.place('tank', ex + 1, ey); assert(pr.ok, 'at the open end: ' + pr.reason);
  assert.strictEqual(h.validateNetwork().length, 0); assert.strictEqual(h.net.graph.nodes.filter(n => n.kind === 'junction').length, 0, 'no accidental junction');
  for (let i = 0; i < 400; i++) h.step(.1); assert(h.buildings.find(b => b.id === pr.building.id).amt > 1, 'oil reaches the tank attached to the open end');
  done('No accidental connection: beside a pipe\'s middle -> refused (touchesPipe), nothing changed; one tile away fine; at an OPEN END -> valid, 0 junctions, network valid, oil arrives');
}
// ---- 6. snap: scored, local, invalid never attracts, hysteresis input (distance), compatible open end preferred
{
  const h = mk(); const { L, t } = line(h); const mid = L.cells[30], mx = mid % W, my = (mid / W) | 0;
  const s1 = h.snapPlacement('tank', mx, my + 1, 2, { fx: mx, fy: my + 1 }); assert(s1 && h.canPlace('tank', s1.x, s1.y).ok, 'snaps to a valid tile'); assert(Math.hypot(s1.x - mx, s1.y - (my + 1)) <= 2.01);
  const wk = idx(100, 60); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) h.map.water[idx(100 + dx, 60 + dy)] = 1;
  assert.strictEqual(h.snapPlacement('tank', 100, 60, 2, { fx: 100, fy: 60 }), null, 'only invalid tiles around -> nothing attracts, nothing is invented');
  // invalid tiles never win: sweep many finger positions
  for (let i = 0; i < 300; i++) { const x = 20 + (i * 7) % 90, y = 20 + (i * 11) % 50, s = h.snapPlacement('tank', x, y, 2, { fx: x + .3, fy: y - .2 }); if (s) assert(h.canPlace('tank', s.x, s.y).ok, 'snap returned an invalid tile'); }
  // compatible connection: with an open pipe end 2 tiles away the touching spot beats an equally near free spot
  h.removeAt(t.x, t.y); const endK = L.cells[L.cells.length - 1], ex = endK % W, ey = (endK / W) | 0;
  h.map.water[idx(ex + 1, ey + 1)] = 1;   // the tile under the finger is invalid (its footprint would cover this water), so it must snap
  assert(!h.canPlace('tank', ex + 1, ey).ok); const sn = h.snapPlacement('tank', ex + 1, ey, 2, { fx: ex + 1, fy: ey });
  assert(sn && sn.compat >= 1, 'prefers the spot that touches the open end over an equally near free spot: ' + JSON.stringify(sn));
  const far = h.snapPlacement('tank', ex + 3, ey + 3, 2, { fx: ex + 3, fy: ey + 3 }); assert(far && far.compat === 0, 'no open end within reach: plain nearest valid');
  let t0 = process.hrtime.bigint(); for (let i = 0; i < 300; i++) h.snapPlacement('tank', mx, my + 1, 2, { fx: mx, fy: my + 1 }); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 300;
  assert(ms < 1, 'snap too slow: ' + ms);
  done('Snap: always a valid tile within the radius, never invented when none, prefers a spot touching an open pipe end; ' + ms.toFixed(3) + ' ms per call (was 3.2 ms scanning the whole map)');
}
// ---- 7. cost preview and confirm/cancel: previewing never charges; building charges exactly the previewed cost
{
  const h = mk(5000); const before = snapshot(h); const pl = h.placement('tank', 40, 40);
  for (let i = 0; i < 100; i++) { h.placement('tank', 40 + (i % 5), 40); h.snapPlacement('tank', 40, 40, 2); h.connectionPoints('tank', 40, 40); h.nearestValid('tank', 41, 41, 2); }
  assert.strictEqual(snapshot(h), before, 'preview/snap/ports calls must not change the saved state'); assert.strictEqual(h.s.cash, 5000);
  const r = h.place('tank', 40, 40); assert(r.ok); assert.strictEqual(r.cost, pl.cost); assert.strictEqual(h.s.cash, 5000 - pl.cost);
  const poor = mk(10); const pp = poor.placement('tank', 40, 40); assert.strictEqual(pp.state, 'UNAFFORDABLE'); assert.strictEqual(pp.ok, false); const b2 = snapshot(poor); assert(!poor.place('tank', 40, 40).ok); assert.strictEqual(snapshot(poor), b2, 'a refused build changes nothing');
  done('Cost preview: previews/snaps/ports leave the saved state byte-identical; build charges exactly the previewed $' + pl.cost + '; unaffordable -> UNAFFORDABLE and nothing changes');
}
// ---- 8. previews do not influence simulation / economy: the same game twice with the same random sequence, one with hundreds of previews in between
{
  const realRandom = Math.random, seeded = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const play = withPreviews => { Math.random = seeded(4242); const g = mk(); const b = line(g); for (let i = 0; i < 600; i++) { g.step(.1); if (withPreviews && i % 3 === 0) { g.placement('tank', 30 + (i % 20), 30); g.snapPlacement('well', 40, 40, 2); g.connectionPoints('tank', 50, 50); g.buildingModel(b.t); g.pipeContacts('tank', 40, 40); } } return JSON.stringify(g.serialize()); };
  try { const A = play(false), B = play(true); assert.strictEqual(A, B); } finally { Math.random = realRandom; }
  done('Hydraulics / network / economy / market: 600 steps with 200 interleaved previews end byte-identical (same random sequence) to the game without previews');
}
// ---- 9. save / load keeps type, position, rotation, connection points, pump facing
{
  const h = mk(); const { L } = line(h); const c = L.cells[20]; const p = h.place('pump', c % W, (c / W) | 0).building; h.flipPump(p); const t2 = h.place('tank', 40, 60).building; for (let i = 0; i < 50; i++) h.step(.1);
  const g = new G({ seed: 7 }); g.load(JSON.parse(JSON.stringify(h.serialize())));
  for (const b of h.buildings) { const o = g.buildings.find(q => q.id === b.id); assert(o, 'building ' + b.id); assert.deepStrictEqual(g.buildingModel(o), h.buildingModel(b)); }
  assert.strictEqual(g.buildingModel(g.buildings.find(q => q.id === p.id)).rotation, h.buildingModel(p).rotation);
  done('Save/Load: every building has the same type, position, rotation, footprint and connection points after a reload (pump facing included)');
}
// ---- 10. moving a connected building one tile along its own pipe is not blocked by the touch rule
{
  const h = mk(); const { w, t, L } = line(h);
  assert(h.beginMove(t.id)); const r = h.canMove(t.id, t.x, t.y + 1); h.endMove(); assert(r.ok || r.reason !== 'touchesPipe', 'own pipe must not block the move: ' + r.reason);
  const far = mk(); const f = line(far); far.beginMove(f.t.id); const bad = far.canMove(f.t.id, f.L.cells[30] % W, ((f.L.cells[30] / W) | 0) + 1); far.endMove(); assert(!bad.ok && bad.reason === 'touchesPipe', 'but beside the middle of the pipe it is refused: ' + bad.reason);
  done('Move: a connected tank may be nudged next to its own pipe; moving it beside another part of the pipe is refused');
}
// ---- 11. the same rule while the pipe is still under construction (the network graph does not contain it yet)
{
  const saved = CFG.BUILD; CFG.BUILD = { well: 5, tank: 4, pump: 3, pipeTile: 0.12, pipeMax: 3 };
  try {
    const h = mk(); const { L, t } = line(h); assert(h.pipe[L.cells[30]] && h.graphNode(L.cells[30]) === null, 'precondition: the graph does not know the unfinished pipe');
    const mid = L.cells[30], mx = mid % W, my = (mid / W) | 0; assert.strictEqual(h.placement('tank', mx, my + 1).reason, 'touchesPipe');
    h.removeAt(t.x, t.y); const endK = L.cells[L.cells.length - 1], ex = endK % W, ey = (endK / W) | 0; assert.strictEqual(h.placement('tank', ex + 1, ey).ok, true, 'open end of an unfinished pipe');
  } finally { CFG.BUILD = saved; }
  done('Same rule on a pipe that is still being built: beside its middle refused, at its open end allowed');
}
console.log('\nPHASEB-ALLPASS (' + pass + ' groups)');
