// Phase 5 core tests: easy-building helpers and the saved first-game flag.
const assert = require('assert');
const { Game, CFG } = require('./core.js');
const ok = m => console.log('  ok  ' + m);
const g = new Game({ seed: 7 });
assert.strictEqual(g.s.tutorialDone, false); ok('new game: tutorialDone = false');
const spots = g.validSpots('well');
assert(spots.length > 5 && spots.every(p => g.canPlace('well', p[0], p[1]).ok)); ok('validSpots(well): ' + spots.length + ' tiles, every one really buildable');
const tspots = g.validSpots('tank'); assert(tspots.length > 20 && tspots.every(p => g.canPlace('tank', p[0], p[1]).ok)); ok('validSpots(tank): ' + tspots.length + ' 2x2 spots, every one really buildable');
const s0 = spots[0], near = g.nearestValid('well', s0[0] + 2, s0[1] + 1, 3, spots); assert(near && g.canPlace('well', near[0], near[1]).ok); ok('nearestValid snaps a tap 2 tiles away onto a buildable tile');
assert.strictEqual(g.nearestValid('well', 0, 0, 1, spots), null); ok('nothing is invented when no valid tile is close');
assert.strictEqual(g.place('well', s0[0], s0[1]).ok, true);
const a = g.nearestAnchor(s0[0] + 2, s0[1], 2); assert.deepStrictEqual(a, [s0[0], s0[1]]); ok('nearestAnchor finds the well from 2 tiles away');
assert.strictEqual(g.nearestAnchor(s0[0] + 9, s0[1] + 9, 2), null); ok('no anchor far from any building');
// tutorial flag: set by the first sale, saved, and old saves (with progress) skip the guide
const t = g.place('tank', s0[0] + 4, s0[1]); if (t.ok) { g.buildRoute(g.routePipe(s0[0] + 1, s0[1], s0[0] + 3, s0[1], false)); for (let i = 0; i < 90; i++) g.step(1); }
assert(g.oilTotal() > 0); assert.strictEqual(g.s.tutorialDone, false); assert(g.sell(g.oilTotal()).ok); assert.strictEqual(g.s.tutorialDone, true); ok('first sale sets tutorialDone');
const g2 = new Game({ seed: 7 }); g2.load(JSON.parse(JSON.stringify(g.serialize()))); assert.strictEqual(g2.s.tutorialDone, true); ok('tutorialDone survives save -> load');
const old = JSON.parse(JSON.stringify(g.serialize())); delete old.s.tutorialDone; const g3 = new Game({ seed: 7 }); g3.load(old); assert.strictEqual(g3.s.tutorialDone, true); ok('old save with progress and no flag: guide is skipped');
const fresh = JSON.parse(JSON.stringify(new Game({ seed: 7 }).serialize())); delete fresh.s.tutorialDone; const g4 = new Game({ seed: 7 }); g4.load(fresh); assert.strictEqual(g4.s.tutorialDone, false); ok('old empty save: guide still shows');
console.log('ALL PHASE 5 CORE TESTS PASSED');
