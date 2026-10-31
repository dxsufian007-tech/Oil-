// Phase 22: moving buildings (core). One transaction, the graph always agrees, cancel changes nothing, save/load keeps the new position.
const assert = require('assert');
const { Game: G, CFG, idx } = require('./core.js');
CFG.TERRAIN.MULT = [1, 1, 1, 1]; CFG.REGIONS.forEach(r => { r.mult = 1; });
CFG.PIPE.LEAK_PER_TILE_MIN = 0; CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
const ok = m => console.log('  ok  ' + m);
const run = (g, sec) => { for (let i = 0; i < Math.round(sec / 0.1); i++) g.step(0.1); };
const valid = (g, what) => { const p = g.validateNetwork(); assert.deepStrictEqual(p, [], what + ': ' + p.slice(0, 4).join(' | ')); };
function mk() { const h = new G({ seed: 7 }); h.s.cash = 1e8; h.s.regions.forEach(r => { r.unlocked = true; }); for (const a of h.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; } for (let y = 24; y < 64; y++) for (let x = 30; x < 80; x++) { const k = idx(x, y); h.map.block[k] = 0; h.map.water[k] = 0; } return h; }
const X = 40, Y = 40;
const h = mk(), well = h.place('well', X, Y, 'large').building, tank = h.place('tank', X + 12, Y).building;
const r = h.routePipe(X + 1, Y, X + 11, Y); assert(r.ok && h.buildRoute(r).ok); valid(h, 'built'); run(h, 20);
const q0 = well.q; assert(q0 > 0 && h.net.routes.get(well.id).length === 1); ok('well -> pipe -> tank flows (q=' + q0.toFixed(1) + ')');
// 1. canMove is a pure question
const cash = h.s.cash, bx = tank.x, by = tank.y, snap = JSON.stringify([...h.occ].map(o => o ? o.id : 0).filter(Boolean));
assert(h.canMove(tank.id, X + 12, Y + 5).ok); assert.strictEqual(h.canMove(tank.id, tank.x, tank.y).reason, 'sameSpot');
assert.strictEqual(h.canMove(tank.id, X, Y).ok, false); assert.strictEqual(h.canMove(tank.id, X + 5, Y).reason, 'pipe'); assert.strictEqual(h.canMove(tank.id, 0, 0).ok, false);
assert.strictEqual(h.s.cash, cash); assert.strictEqual(tank.x, bx); assert.strictEqual(JSON.stringify([...h.occ].map(o => o ? o.id : 0).filter(Boolean)), snap); ok('canMove changes nothing; specific reasons: sameSpot / occupied / pipe / outside');
// 2. invalid move = no change at all
const bad = h.moveBuilding(tank.id, X + 5, Y); assert(!bad.ok && tank.x === bx && tank.y === by && h.occ[idx(bx, by)] === tank); valid(h, 'invalid move'); ok('invalid move: nothing moved, nothing paid (' + bad.reason + ')');
// 3. a building being moved does not block its own neighbourhood (move one tile)
assert(h.canMove(tank.id, X + 13, Y).ok); ok('a tank may move one tile (its own old cells do not block it)');
// 4. valid move away from the pipe: old cells free, new cells taken, graph rebuilt and consistent, route gone, oil stops
h.beginMove(tank.id); assert(h.canPlace('tank', X + 12, Y).ok === true, 'during a move its own spot is free'); h.endMove(); assert(h.canPlace('tank', X + 12, Y).ok === false, 'after the move ends it blocks again');
const m = h.moveBuilding(tank.id, X + 14, Y + 6); assert(m.ok); assert(tank.x === X + 14 && tank.y === Y + 6);
assert(!h.occ[idx(X + 12, Y)] && h.occ[idx(X + 14, Y + 6)] === tank); assert.strictEqual(h.s.cash, cash, 'moving is free'); valid(h, 'after move');
run(h, 5); assert.strictEqual((h.net.routes.get(well.id) || []).length, 0, 'the pipe no longer touches the tank -> no route'); ok('moved: old cells free, new cells taken, graph valid, the well has 0 routes (pipe no longer touches the tank)');
// 5. move it back next to the pipe end -> reconnects by itself
const back = h.moveBuilding(tank.id, X + 12, Y); assert(back.ok); valid(h, 'move back'); run(h, 30); assert.strictEqual(h.net.routes.get(well.id).length, 1); assert(well.q > 1); ok('moved back next to the pipe: connected again, oil flows (q=' + well.q.toFixed(1) + ')');
// 6. move the well
const w2 = h.moveBuilding(well.id, X, Y + 1); assert(w2.ok); valid(h, 'move well'); ok('well moved one row: graph valid (' + (h.net.routes.get(well.id) || []).length + ' routes)');
// 7. pumps are not movable (explicit reason)
const hp = mk(); hp.place('well', X, Y, 'large'); hp.place('tank', X + 12, Y); const rp = hp.routePipe(X + 1, Y, X + 11, Y); hp.buildRoute(rp); const pm = hp.place('pump', X + 5, Y); if (pm.ok) { assert.strictEqual(hp.canMove(pm.building.id, X + 5, Y + 3).reason, 'noMove'); ok('pump: clear "cannot move" reason'); }
assert(h.moveBuilding(well.id, X, Y).ok); valid(h, 'well back'); run(h, 30);
// 8. save / load keeps the new position and rebuilds the network
const d = JSON.parse(JSON.stringify(h.serialize())); const h2 = new G({ seed: 7 }); h2.load(d); const t2 = h2.buildings.find(b => b.id === tank.id); assert(t2.x === tank.x && t2.y === tank.y && h2.occ[idx(tank.x, tank.y)] === t2); valid(h2, 'after load'); run(h2, 10); assert.strictEqual(h2.net.routes.get(well.id).length, 1); ok('save -> load: moved position kept, graph valid, route restored');
console.log('ALL PHASE 22 CORE TESTS PASSED');
