// Headless test of the full loop: well -> pipe -> tank -> market -> sell -> build more.
const assert = require('assert');
const { Game: Game0, CFG } = require('./core.js'); const { idx } = require('./test-legacy.js');
// tests of Phase 1/2 mechanics build anywhere: reveal every reservoir (Phase 3 tests exploration separately in test-p3.js)
CFG.TERRAIN.MULT = [1, 1, 1, 1]; CFG.REGIONS.forEach(r => { r.mult = 1; });     // Phase 4 prices are tested in test-p4.js
CFG.BUILD = { well: 0, tank: 0, pipeTile: 0, pipeMax: 0 };   // Phase 6 construction time is tested in test-p6.js
CFG.PIPE.LEAK_PER_TILE_MIN = 0;   // random pipe leaks are covered in test-p3.js; keep these production numbers deterministic
function Game(o) { const h = new Game0(o); h.s.regions.forEach(r => { r.unlocked = true; }); for (const a of h.areas) if (a.land && a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 18000; a.potential = 90; } return h; }
Game.prototype = Game0.prototype;

const g = new Game({ seed: 7 });
const ok = (name) => console.log('  ok  ' + name);

assert.strictEqual(g.s.cash, 10000); ok('start cash $10,000');
assert.strictEqual(g.s.hist.length, CFG.HIST); ok('price history seeded');

// find free ground in the middle of the map
function freeSpot(x0, y0, type) {
  for (let y = y0; y < y0 + 10; y++) for (let x = x0; x < x0 + 20; x++) if (g.canPlace(type, x, y).ok) return [x, y];
}
const [wx, wy] = freeSpot(14, 10, 'well');
let r = g.place('well', wx, wy);
assert(r.ok); assert.strictEqual(g.s.cash, 8000); ok('place oil well (-$2,000)');

// unconnected well must not produce
g.step(60);
assert.strictEqual(g.oilTotal(), 0);
assert.strictEqual(g.buildings[0].status, 'nopipe'); ok('unconnected well is idle');

// tank 6 cells to the right
let tx = wx + 6, ty = wy;
while (!g.canPlace('tank', tx, ty).ok) ty++;
r = g.place('tank', tx, ty);
assert(r.ok); assert.strictEqual(g.s.cash, 6500); ok('place storage tank (-$1,500)');

// pipeline from well to tank: only horizontal / vertical legs
const route = g.routePipe(wx, wy, tx, ty, false);
assert(route.ok, route.reason);
for (let i = 1; i < route.cells.length; i++) {
  const dx = Math.abs(route.cells[i][0] - route.cells[i - 1][0]);
  const dy = Math.abs(route.cells[i][1] - route.cells[i - 1][1]);
  assert.strictEqual(dx + dy, 1, 'diagonal step found');
}
ok('pipeline route has no diagonal steps (' + route.cells.length + ' cells)');
const diag = g.routePipe(wx, wy, tx + 3, ty + 4, false);
for (let i = 1; i < diag.cells.length; i++) {
  assert.strictEqual(Math.abs(diag.cells[i][0] - diag.cells[i - 1][0]) + Math.abs(diag.cells[i][1] - diag.cells[i - 1][1]), 1);
}
ok('L-shaped route for a diagonal request stays 90-degree');
const cashBefore = g.s.cash;
r = g.buildRoute(route);
assert(r.ok); assert.strictEqual(g.s.cash, cashBefore - route.cost);
ok('build pipeline (-$' + route.cost + ', ' + r.segments + ' segments)');

assert(g.isWellConnected(g.buildings[0])); ok('well is connected to storage');

// produce for 2 minutes: 10 bbl/min -> 20 bbl
for (let i = 0; i < 120; i++) g.step(1);
const oil = g.oilTotal();
assert(Math.abs(oil - 20) < 0.5, 'expected ~20 bbl, got ' + oil);
ok('well produced ' + oil.toFixed(1) + ' BBL in 2 min (10 BBL/min)');

// storage full stops production
const tank = g.buildings.find(b => b.type === 'tank');
tank.amt = g.tankCap(tank) - 1;
g.step(60);
assert(Math.abs(tank.amt - g.tankCap(tank)) < 1e-6);
g.step(1);
assert.strictEqual(g.buildings[0].status, 'full');
const before = g.oilTotal(); g.step(60);
assert.strictEqual(g.oilTotal(), before);
ok('full storage stops production (status: full)');

// market
const px = g.s.price;
g.s.cash = 0;
const have = g.oilTotal();
r = g.sell(100);
assert(r.ok); assert(Math.abs(g.s.cash - 100 * px * r.quality) < 0.01);
assert(Math.abs(g.oilTotal() - (have - 100)) < 1e-6);
ok('spot sale: sold 100 BBL @ $' + px + ' -> cash $' + g.s.cash.toFixed(0));

// price moves gradually
const g3 = new Game({ seed: 7 }); let maxStep = 0, last = g3.s.price, lo = last, hi = last;
for (let i = 0; i < 600; i++) { g3.s.time += 3; g3.priceTick(Math.random); maxStep = Math.max(maxStep, Math.abs(g3.s.price - last)); last = g3.s.price; lo = Math.min(lo, last); hi = Math.max(hi, last); }
assert(lo >= 40 && hi <= 115);
ok('price walk: range $' + lo + '-$' + hi + ', biggest single step $' + maxStep.toFixed(1));

// futures: the oil stays in the tank until the contract ends, then it is delivered at the locked price
const oil2 = g.oilTotal(), eco2 = g.economy(), prod2 = g.s.produced;
const q = g.contractQuote(500, 1);
r = g.createContract(500, 1);
assert(r.ok); assert(Math.abs(g.oilTotal() - oil2) < 1e-6, 'oil is not taken at signing');
assert.strictEqual(g.s.contracts.length, 1); assert.strictEqual(g.committed(), 500);
g.step(119); assert.strictEqual(g.s.contracts.length, 1);
g.step(2);
assert.strictEqual(g.s.contracts.length, 0); assert.strictEqual(g.s.done[0].status, 'completed');
const eco3 = g.economy();
assert(Math.abs(g.oilTotal() - (oil2 + (g.s.produced - prod2) - 500)) < 1e-6, 'oil delivered at expiry');
assert(Math.abs((eco3.revenue - eco2.revenue) - q.revenue) < 0.01, 'revenue = quantity x locked price');
assert(Math.abs((eco3.money - eco2.money) - (q.revenue - (eco3.operatingCosts - eco2.operatingCosts))) < 0.02, 'cash = revenue - operating costs');
ok('futures: 500 BBL locked @ $' + q.price + ', delivered at expiry for $' + q.revenue.toFixed(0) + ' (status completed)');

// alert
g.setAlert(g.s.price + 0.1);
let fired = false;
for (let i = 0; i < 500 && !fired; i++) { g.step(3); if (g.drainEvents().some(e => e.type === 'alert')) fired = true; }
ok('price alert ' + (fired ? 'fired' : 'did not fire (price stayed lower)'));

// upgrades + build more
g.s.cash = 20000;
const well = g.buildings[0];
r = g.upgrade(well); assert(r.ok); assert.strictEqual(g.wellNominal(well), 12);
r = g.upgrade(tank); assert(r.ok); assert.strictEqual(g.tankCap(tank), 2000);
const pk = [...g.pipeNet ? [g.net.comps.find(c => c.pipes.length).pipes[0]] : []][0];
r = g.upgradePipes(pk); assert(r.ok); assert.strictEqual(g.pipeNet(pk).cap, 40);
ok('upgrades: well 12 BBL/min, tank 2,000 BBL, pipes 40 BBL/min');
const [w2x, w2y] = freeSpot(14, 14, 'well');
r = g.place('well', w2x, w2y); assert(r.ok); ok('build more after earning money');

// save / load round trip
const dump = JSON.stringify(g.serialize());
const g5 = new Game({ seed: 7 }); g5.load(JSON.parse(dump));
assert.strictEqual(g5.buildings.length, g.buildings.length);
assert.strictEqual(g5.pipeCount(), g.pipeCount());
assert(Math.abs(g5.oilTotal() - g.oilTotal()) < 1e-6);
assert(Math.abs(g5.s.cash - g.s.cash) < 1e-6);
ok('save/load round trip (' + dump.length + ' bytes)');

// removal refund
const cashR = g.s.cash;
const rem = g.removeAt(w2x, w2y);
assert(rem.ok); assert.strictEqual(g.s.cash, cashR + 1000);
ok('remove building refunds 50%');


/* ---------- additions: grid, anchoring, throughput, trend, levels, config, saves ---------- */
const { makeMap } = require('./core.js');
assert.strictEqual(CFG.GRID_ROWS, 88); assert.strictEqual(CFG.GRID_COLS, 140);
assert.strictEqual(g.map.water.length, 88 * 140); assert.strictEqual(88 * 140, 10 * 28 * 44); ok('build grid is 88 rows x 140 columns = exactly 10x the old 28 x 44 map');

// no floating pipelines, and the preview says whether a route joins a well to a tank
{
  const h = new Game({ seed: 7 }); h.s.cash = 50000;
  const fits = (ox, oy) => { for (let y = oy; y < oy + 6; y++) for (let x = ox; x < ox + 8; x++) { if (h.map.block[y * 44 + x]) return false; } return true; };
  let ox = 14, oy = 9; outer: for (oy = 8; oy < 18; oy++) for (ox = 14; ox < 30; ox++) if (fits(ox, oy)) break outer;
  const far = h.routePipe(ox + 5, oy + 5, ox + 7, oy + 5, false);
  assert(!far.ok && far.reason === 'floating', 'floating pipe should be rejected: ' + far.reason);
  assert(!h.buildRoute(far).ok); assert.strictEqual(h.pipeCount(), 0);
  ok('floating pipeline is rejected (reason: floating)');

  // 3 wells beside a trunk pipe, tank at the end -> pipe capacity 25/min limits 30/min of wells
  for (let i = 0; i < 3; i++) assert(h.place('well', ox, oy + i).ok);
  assert(h.place('tank', ox + 4, oy).ok);
  const partial = h.routePipe(ox + 1, oy, ox + 1, oy + 2, false);
  assert(partial.ok && partial.connects === false); ok('route from wells that does not reach a tank is allowed but connects=false');
  h.buildRoute(partial);
  const toTank = h.routePipe(ox + 1, oy, ox + 3, oy, false);
  assert(toTank.ok && toTank.connects === true); ok('route that reaches the tank reports connects=true');
  h.buildRoute(toTank);
  const _lk = CFG.PIPE.LEAK_PER_TILE_MIN; CFG.PIPE.LEAK_PER_TILE_MIN = 0;   // random leaks would make the flow measurement flaky
  for (let i = 0; i < 120; i++) h.step(1);
  CFG.PIPE.LEAK_PER_TILE_MIN = _lk;
  const prod = h.oilTotal() / 2;
  assert(Math.abs(prod - 25) < 1.5, 'expected ~25 BBL/min through level-1 pipes, got ' + prod.toFixed(2));
  assert(h.buildings.filter(b => b.type === 'well').every(b => b.status === 'limited'));
  ok('pipeline capacity limits 3 wells (30/min) to 25 BBL/min (status: limited)');
  const before = h.oilTotal(); assert(h.upgradePipes(h.net.comps.find(c => c.pipes.length).pipes[0]).ok);
  for (let i = 0; i < 60; i++) h.step(1);
  assert(Math.abs((h.oilTotal() - before) - 30) < 1.5, 'after pipe upgrade expected ~30/min'); ok('pipe upgrade lifts the limit to the full 30 BBL/min');
}

// levels 1..5, production grows each upgrade, cap at 5
{
  const h = new Game({ seed: 7 }); h.s.cash = 1e6;
  const w = h.place('well', 20, 14).building, t = h.place('tank', 24, 14).building;
  const rates = [h.wellNominal(w)], caps = [h.tankCap(t)];
  for (let i = 0; i < 4; i++) { assert(h.upgrade(w).ok); assert(h.upgrade(t).ok); rates.push(h.wellNominal(w)); caps.push(h.tankCap(t)); }
  assert.deepStrictEqual(rates, [10, 12, 14, 16.5, 20]); assert.deepStrictEqual(caps, [1000, 2000, 3500, 5500, 8000]);
  assert.strictEqual(h.upgrade(w).reason, 'maxlevel'); assert.strictEqual(h.upgrade(t).reason, 'maxlevel');
  ok('wells: ' + rates.join('/') + ' BBL/min, tanks: ' + caps.join('/') + ' BBL, both stop at level 5');
}

// market: previous price + trend
{
  const h = new Game({ seed: 7 });
  const p0 = h.s.price; h.s.time += 3; h.priceTick(Math.random);
  assert.strictEqual(h.s.prev, p0); ok('previous price is tracked (' + p0 + ' -> ' + h.s.price + ')');
  h.s.hist = [70, 70, 70, 70, 70, 70, 75]; assert.strictEqual(h.priceTrend().dir, 1);
  h.s.hist = [75, 74, 73, 72, 71, 70, 69]; assert.strictEqual(h.priceTrend().dir, -1);
  h.s.hist = [70, 70.2, 70, 70.1, 70, 70.2, 70.3]; assert.strictEqual(h.priceTrend().dir, 0);
  ok('price trend reads rising / falling / stable');
}

// all costs come from CFG
{
  const saved = CFG.WELL_KINDS.small.cost, savedU = CFG.UPGRADE.well;
  CFG.WELL_KINDS.small.cost = 777; CFG.UPGRADE.well = [111, 111, 111, 111];
  const h = new Game({ seed: 7 }); const r = h.place('well', 20, 14);
  assert(r.ok && h.s.cash === 10000 - 777);
  assert.strictEqual(h.upgradeCost(r.building), 111);
  CFG.WELL_KINDS.small.cost = saved; CFG.UPGRADE.well = savedU;
  ok('changing CFG.COST / CFG.UPGRADE changes game prices');
}

// logs are message keys, not text
assert(g.s.log.every(l => typeof l.k === 'string' && l.k.indexOf('log.') === 0)); ok('activity log stores translatable message keys');

// save round trip keeps market state, levels, contracts
{
  const h = new Game({ seed: 7 }); h.s.cash = 99999;
  const w = h.place('well', 20, 14).building; const t = h.place('tank', 23, 14).building;
  h.buildRoute(h.routePipe(21, 14, 22, 14, false));
  h.upgrade(w); h.upgrade(t); t.amt = 900; for (let i = 0; i < 30; i++) h.step(3);
  h.createContract(100, 1);
  const copy = new Game({ seed: 7 }); copy.load(JSON.parse(JSON.stringify(h.serialize())));
  assert.strictEqual(copy.s.price, h.s.price); assert.strictEqual(copy.s.prev, h.s.prev);
  assert.deepStrictEqual(copy.s.hist, h.s.hist); assert.strictEqual(copy.s.contracts.length, 1);
  assert.strictEqual(copy.buildings.find(b => b.type === 'well').level, 2);
  assert(Math.abs(copy.oilTotal() - h.oilTotal()) < 1e-6); assert.strictEqual(copy.s.cash, h.s.cash);
  ok('save keeps cash, oil, wells, pipes, tanks, upgrades, price history and contracts');
}


// price glides toward each market tick instead of jumping
{
  const h = new Game({ seed: 11 }); let maxJump = 0, last = h.s.price, moved = 0;
  for (let i = 0; i < 4000; i++) { h.step(0.05); maxJump = Math.max(maxJump, Math.abs(h.s.price - last)); if (h.s.price !== last) moved++; last = h.s.price; }
  assert.ok(maxJump < 0.9, 'price moves smoothly, max step ' + maxJump.toFixed(2));
  assert.ok(moved > 500, 'price keeps moving between ticks');
  assert.ok(Math.abs(h.s.hist[h.s.hist.length - 1] - h.s.tgt) < 1e-9, 'history records the target');
  ok('price glides smoothly (max step per 0.05s: ' + maxJump.toFixed(2) + ')');
}

// ===== Phase-1 verification: simulation invariants =====
{
  const G = Game, C = CFG;
  const g = new G({ seed: 5 }); g.s.cash = 1e6;
  // layout: well(5,5) -> pipe -> tank(9,5); a second well with NO pipe; a third well piped to nothing
  assert.ok(g.place('well', 5, 5).ok); assert.ok(g.place('tank', 9, 5).ok);
  assert.ok(g.buildRoute(g.routePipe(6, 5, 8, 5, false)).ok);
  assert.ok(g.place('well', 20, 20).ok);                       // isolated
  assert.ok(g.place('well', 5, 15).ok); assert.ok(g.buildRoute(g.routePipe(6, 15, 9, 15, false)).ok);   // pipe leads nowhere
  const wells = g.buildings.filter(b => b.type === 'well'), tank = g.buildings.find(b => b.type === 'tank');
  let drained = 0, maxAmt = 0;
  const sellSome = f => { const before = g.oilTotal(); const r = g.sell(before * f); if (r.ok) drained += r.amount; };
  for (let i = 0; i < 6000; i++) {                                // 10 simulated minutes at 0.1 s
    g.step(0.1);
    maxAmt = Math.max(maxAmt, tank.amt);
    assert.ok(tank.amt <= g.tankCap(tank) + 1e-9 && tank.amt >= -1e-9, 'inventory stays within 0..capacity');
    if (i === 2500) sellSome(0.5);
    if (i === 4000) { const r = g.createContract(g.oilTotal() * 0.5, 1); drained += r.quote ? g.s.contracts[g.s.contracts.length - 1].amount : 0; }
  }
  ok('inventory never leaves 0..capacity over 10 minutes (peak ' + maxAmt.toFixed(1) + ' / ' + g.tankCap(tank) + ')');
  // conservation: everything produced is either in a tank or was sold / reserved
  assert.ok(Math.abs(g.s.produced - drained - g.oilTotal()) < 1e-6, 'oil conservation');
  ok('oil conservation: produced ' + g.s.produced.toFixed(1) + ' = stored ' + g.oilTotal().toFixed(1) + ' + sold/reserved ' + drained.toFixed(1));
  // produced matches the well's real rate (10 bbl/min * 10 min, one well)
  assert.ok(g.s.produced < 100 && g.s.produced > 95, 'only the connected well produced (a little less than 100 as its pressure falls): ' + g.s.produced);
  ok('production matches the rate: 10 bbl/min x 10 min, minus pressure loss = ' + g.s.produced.toFixed(1) + ' (disconnected wells produced nothing)');
  assert.deepStrictEqual(wells.map(w => w.status), ['producing', 'nopipe', 'nostorage']);
  assert.ok(wells[1].out === 0 && wells[2].out === 0, 'disconnected wells have zero output');
  ok('statuses: connected=producing, isolated=nopipe, pipe-to-nowhere=nostorage');
  // fill it: production must really stop and the tank must not overflow
  tank.amt = g.tankCap(tank) - 0.05;
  for (let i = 0; i < 100; i++) g.step(0.1);
  assert.strictEqual(tank.amt, g.tankCap(tank)); assert.strictEqual(wells[0].status, 'full'); assert.strictEqual(wells[0].out, 0);
  const prod = g.s.produced; for (let i = 0; i < 100; i++) g.step(0.1);
  assert.strictEqual(g.s.produced, prod); ok('full tank: wells really stop, nothing is produced, inventory stays at capacity');
  // selling reduces inventory and cash correctly, production resumes
  const oil0 = g.oilTotal(), cash0 = g.s.cash, price = g.s.price, r = g.sell(1000);
  assert.ok(Math.abs(g.oilTotal() - (oil0 - 1000)) < 1e-9); assert.ok(Math.abs(g.s.cash - (cash0 + Math.round(1000 * price * r.quality * 100) / 100)) < 1e-6);
  g.step(0.1); assert.strictEqual(wells[0].status, 'producing');
  ok('sale of 1000 BBL: inventory -1000, cash +' + r.revenue.toFixed(0) + ', production resumes');
  // oversell / bad amounts are rejected or clamped
  for (let i = 0; i < 20; i++) g.step(0.1);              // the flow ramps up smoothly now: let some oil arrive
  const big = g.sell(1e9); assert.ok(g.oilTotal() < 1e-9 && big.amount <= oil0); assert.strictEqual(g.sell(0).ok, false);
  ok('selling more than the inventory is clamped; selling nothing is refused');
  // a corrupted save can not put more oil in a tank than it holds
  const d = g.serialize(); d.buildings.find(b => b.type === 'tank').amt = 1e9; const h = new G(); h.load(d);
  assert.strictEqual(h.oilTotal(), h.storageCap()); ok('a tampered save is clamped to capacity on load');
  // removing the pipe really cuts the flow
  const k = g.buildings.find(b => b.type === 'tank'); k.amt = 0; g.removeAt(7, 5); const p0 = g.s.produced; for (let i = 0; i < 100; i++) g.step(0.1);
  assert.strictEqual(g.s.produced, p0); assert.strictEqual(wells[0].status, 'nostorage'); ok('removing a pipe segment stops the flow in the simulation (not just visually)');
  // alert fires on the quoted price, never before it
  const a = new G({ seed: 3 }); const target = a.s.price + 2; a.setAlert(target); let fired = false;
  for (let i = 0; i < 40000 && !fired; i++) { a.step(0.05); for (const e of a.drainEvents()) if (e.type === 'alert') { fired = true; assert.ok(a.s.price >= target, 'alert fired early: price ' + a.s.price + ' < ' + target); } }
  assert.ok(fired, 'alert eventually fires');
  ok('price alert fires only when the quoted price has reached the target');
}

// ===== PHASE 2: market, selling, wait, futures, operating costs, profit =====
{
  const { mulberry32 } = require('./core.js'); const G = Game, C = CFG;
  const near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e + 0.03 * Math.abs(b), m + ' (' + a + ' vs ' + b + ')');
  const g = new G({ rng: mulberry32(21) });
  // 1-4. start, produce, move through the pipe, fill the tank
  assert.strictEqual(g.s.cash, C.START_CASH);
  assert.ok(g.place('well', 5, 5).ok); assert.ok(g.place('tank', 9, 5).ok); assert.ok(g.buildRoute(g.routePipe(6, 5, 8, 5, false)).ok);
  const well = g.buildings[0], tank = g.buildings[1];
  for (let i = 0; i < 3000; i++) g.step(0.1);                       // 5 simulated minutes
  near(tank.amt, 50, 0.01, 'well -> pipe -> tank moved 10 bbl/min x 5 min'); ok('produce -> pipe -> tank: 50 BBL after 5 min');
  g.buildings[1].amt = 650; tank.amt = 650;                         // the spec example: 650 stored
  // 5-6. market state is real and bounded
  const m0 = g.market();
  assert.strictEqual(m0.currentOilPrice, g.s.price); assert.ok(m0.currentOilPrice >= C.PRICE.MIN && m0.currentOilPrice <= C.PRICE.MAX);
  assert.ok('previousOilPrice' in m0 && 'priceChange' in m0 && 'priceDirection' in m0 && 'marketTime' in m0);
  ok('market state: price $' + m0.currentOilPrice.toFixed(2) + ' (prev $' + m0.previousOilPrice + ', change ' + m0.priceChange.toFixed(2) + ', t=' + m0.marketTime.toFixed(0) + 's)');
  // 7-10. sell part of the inventory
  const E0 = g.economy(), cash0 = g.s.cash, p1 = g.s.price, level0 = tank.amt / g.tankCap(tank);
  const r1 = g.sell(200);
  assert.ok(r1.ok); near(g.s.cash - cash0, 200 * p1, 0.01, 'money increased by sold x price');
  near(tank.amt, 450, 1e-9, 'inventory 650 - 200 = 450'); near(tank.amt / g.tankCap(tank), 450 / 1000, 1e-9, 'tank level follows the inventory');
  near(g.economy().revenue - E0.revenue, 200 * p1, 0.01, 'revenue increased by the sale');
  ok('sold 200 of 650 @ $' + p1.toFixed(2) + ': money +' + (200 * p1).toFixed(0) + ', inventory 450, tank ' + (450 / 10).toFixed(1) + '% (was ' + (level0 * 100).toFixed(1) + '%)');
  // 11. WAIT: the price keeps moving, the oil stays, waiting costs money
  const eco1 = g.economy(), pw = []; for (let i = 0; i < 20; i++) { g.step(3); pw.push(g.s.price); }
  assert.ok(new Set(pw.map(v => v.toFixed(1))).size > 5, 'price keeps moving while waiting');
  assert.ok(g.economy().operatingCosts > eco1.operatingCosts, 'waiting costs operating money'); assert.ok(g.oilTotal() >= 450 - 1e-9, 'oil stays in storage');
  ok('wait: price moved $' + Math.min(...pw).toFixed(1) + '-$' + Math.max(...pw).toFixed(1) + ' over 60 s, oil stayed, operating costs +$' + (g.economy().operatingCosts - eco1.operatingCosts).toFixed(2));
  // 12-15. sell again at a different price; revenue / costs / profit stay linked
  const p2 = g.s.price; assert.notStrictEqual(p2, p1);
  const r2 = g.sell(250); assert.ok(r2.ok);
  const E2 = g.economy();
  near(E2.revenue, r1.revenue + r2.revenue, 0.02, 'revenue = sum of all sales'); near(E2.profit, E2.revenue - E2.operatingCosts, 1e-9, 'profit = revenue - operating costs');
  near(E2.money + E2.owed, C.START_CASH - g.s.capex + g.s.refunds + E2.revenue - E2.operatingCosts, 0.02, 'money balance');
  ok('second sale @ $' + p2.toFixed(2) + ' (first @ $' + p1.toFixed(2) + '): revenue $' + E2.revenue.toFixed(0) + ' - costs $' + E2.operatingCosts.toFixed(2) + ' = profit $' + E2.profit.toFixed(2));
  // operating cost accounting, checked independently: 60 s with a running pump
  const h = new G({ rng: mulberry32(2) }); h.s.cash = 1e5; h.place('well', 5, 5); h.place('tank', 9, 5); h.buildRoute(h.routePipe(6, 5, 8, 5, false));
  h.buildings[1].amt = 100; const c0 = h.s.operatingCosts, a0 = h.buildings[1].amt;
  for (let i = 0; i < 600; i++) h.step(0.1);
  const npipes = h.pipe.reduce((a, b) => a + b, 0), expect = (C.OPEX.well + C.OPEX.tank + npipes * C.OPEX.pipe) + C.OPEX.store * (a0 + 5);   // 1 min: pump + tank + 5 pipes + holding cost of ~105 bbl
  near(h.s.operatingCosts - c0, expect, 0.3, 'operating cost for one minute matches the price list');
  ok('operating cost of one minute = $' + (h.s.operatingCosts - c0).toFixed(2) + ' (pump ' + C.OPEX.well + ' + tank ' + C.OPEX.tank + ' + ' + npipes + ' pipes + holding)');
  // a stopped pump costs nothing
  h.buildings[1].amt = h.tankCap(h.buildings[1]); h.step(0.1); h.step(0.1); assert.strictEqual(h.opex.pump, 0); ok('a pump that is stopped (storage full) costs nothing');
  // 16-18. futures: create, countdown, completed
  const f = new G({ rng: mulberry32(4) }); f.s.cash = 1e5; f.place('tank', 9, 5); const ft = f.buildings[0]; ft.amt = 800;
  const cq = f.contractQuote(500, 1); const cr = f.createContract(500, 1); assert.ok(cr.ok);
  const k = f.s.contracts[0]; assert.strictEqual(k.status, 'active'); assert.strictEqual(k.price, cq.price); assert.strictEqual(f.committed(), 500);
  const c2 = f.createContract(400, 0); assert.ok(c2.ok); assert.strictEqual(c2.amount, 300, 'only the uncommitted oil (300) can be signed for'); assert.strictEqual(f.createContract(50, 0).reason, 'nofree', 'nothing left to commit');
  const left0 = k.end - f.s.time; f.step(30); near(k.end - f.s.time, left0 - 30, 1e-9, 'countdown'); ok('contract countdown: ' + left0 + ' s -> ' + (k.end - f.s.time) + ' s');
  const ev0 = f.economy(); f.step(100);
  assert.strictEqual(f.s.contracts.length, 0); const d0 = f.s.done.find(x => x.id === k.id); assert.strictEqual(d0.status, 'completed');
  near(f.economy().revenue - ev0.revenue, 500 * cq.price + 300 * f.s.done.find(x => x.amount === 300).price, 0.02, 'futures revenue = quantity x locked price'); assert.strictEqual(f.oilTotal(), 0);
  ok('contract COMPLETED: 500 BBL x locked $' + cq.price + ' paid, inventory delivered');
  // EXPIRED: oil sold elsewhere -> penalty, never negative inventory
  const e = new G({ rng: mulberry32(6) }); e.s.cash = 5000; e.place('tank', 9, 5); const et = e.buildings[0]; et.amt = 400; assert.ok(e.createContract(400, 0).ok);
  e.sell(300); const cash5 = e.s.cash, oc5 = e.s.operatingCosts, price5 = e.s.contracts[0].price; e.step(61);
  const dk = e.s.done[0]; assert.strictEqual(dk.status, 'expired'); near(e.s.penalties, 400 * price5 * C.FUT_PENALTY, 0.02, 'penalty = 15% of contract value');
  assert.ok(e.s.operatingCosts - oc5 >= e.s.penalties - 1e-9); assert.ok(et.amt >= 0 && e.oilTotal() >= 0);
  ok('contract EXPIRED (oil sold elsewhere): penalty $' + e.s.penalties.toFixed(0) + ', inventory untouched (' + et.amt.toFixed(1) + ')');
  // 19-20. nothing goes negative; unpaid costs become a debt that the next revenue pays first
  const z = new G({ rng: mulberry32(8) }); z.s.cash = 1500; z.place('tank', 9, 5); z.buildings[0].amt = 1900;
  for (let i = 0; i < 3000; i++) { z.step(0.1); assert.ok(z.s.cash >= 0 && z.buildings[0].amt >= 0); }
  assert.ok(z.s.owed > 0, 'costs the player could not pay are owed'); const owed = z.s.owed, rv = z.sell(500);
  near(z.s.owed, Math.max(0, owed - rv.revenue), 0.02, 'revenue pays the debt first'); assert.ok(z.s.cash >= 0);
  ok('money never goes negative: unpaid costs ($' + owed.toFixed(0) + ') are owed and settled from the next sale');
  // futures are a real risk/reward bet: outcome versus selling on the spot market at expiry goes both ways
  let gain = 0, loss = 0, sum = 0; const N = 60;
  for (let sd = 1; sd <= N; sd++) {
    const q = new G({ rng: mulberry32(sd * 7919) });
    q.s.cash = 1e5; q.place('tank', 9, 5); q.buildings[0].amt = 1000; q.step(sd * 11);
    q.createContract(500, 3); q.step(301); const kk = q.s.done[0]; assert.strictEqual(kk.status, 'completed');
    if (kk.result > 0) gain++; else loss++; sum += kk.result;
  }
  assert.ok(gain > 5 && loss > 5, 'futures can win and lose against the spot price'); ok('futures are not guaranteed profit: ' + N + ' five-minute contracts -> ' + gain + ' beat the spot price, ' + loss + ' lost to it (avg ' + (sum / N).toFixed(0) + ')');
  // market: bounded, gradual, trending for a while
  const mk = new G({ rng: mulberry32(9) }); const diffs = []; let prev = mk.s.price, lo = 1e9, hi = -1e9;
  for (let i = 0; i < 12000; i++) { mk.step(1); if (i % 3 === 2) { diffs.push(mk.s.price - prev); prev = mk.s.price; } lo = Math.min(lo, mk.s.price); hi = Math.max(hi, mk.s.price); }
  assert.ok(lo >= C.PRICE.MIN && hi <= C.PRICE.MAX, 'price stays inside MIN/MAX'); const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  let nume = 0, den = 0; for (let i = 1; i < diffs.length; i++) { nume += (diffs[i] - mean) * (diffs[i - 1] - mean); } for (const d of diffs) den += (d - mean) * (d - mean);
  const ac = nume / den; assert.ok(ac > 0.3, 'moves persist (trend autocorrelation ' + ac.toFixed(2) + ')'); assert.ok(Math.max(...diffs.map(Math.abs)) < 3, 'no wild jumps');
  ok('market over 200 min: $' + lo.toFixed(1) + '-$' + hi.toFixed(1) + ' (limits ' + C.PRICE.MIN + '-' + C.PRICE.MAX + '), trends persist (autocorr ' + ac.toFixed(2) + '), biggest 3 s move $' + Math.max(...diffs.map(Math.abs)).toFixed(2));
  // save keeps the economy
  const sv = new G(); sv.load(JSON.parse(JSON.stringify(e.serialize()))); near(sv.s.penalties, e.s.penalties, 1e-9, 'penalties saved'); assert.strictEqual(sv.s.done.length, e.s.done.length); near(sv.economy().profit, e.economy().profit, 1e-9, 'profit saved');
  ok('save keeps revenue, operating costs, profit, debt and finished contracts');
}

console.log('\nALL CORE TESTS PASSED');
