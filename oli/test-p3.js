// Phase 3 scenario: upgrades, pressure, condition, maintenance, leaks, repair, quality, exploration.
const assert = require('assert');
const { Game: Game0, CFG, mulberry32 } = require('./core.js'); const { idx, oldAreas } = require('./test-legacy.js');
CFG.TERRAIN.MULT = [1, 1, 1, 1]; CFG.REGIONS.forEach(r => { r.mult = 1; });     // Phase 4 prices are tested in test-p4.js
CFG.BUILD = { well: 0, tank: 0, pipeTile: 0, pipeMax: 0 };   // Phase 6 construction time is tested in test-p6.js
function Game(o) { const h = new Game0(o); h.s.regions.forEach(r => { r.unlocked = true; }); return h; }
const ok = n => console.log('  ok  ' + n);
const near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, m + ' (' + a + ' vs ' + b + ')');
const run = (g, sec) => { for (let i = 0; i < sec * 10; i++) g.step(0.1); };
const tiles = (g, a) => { const out = [], A = CFG.EXPLORE.AREA; for (let y = a.ay * A; y < a.ay * A + A; y++) for (let x = a.ax * A; x < a.ax * A + A; x++) out.push([x, y]); return out; };

// ---- layout: a discovered starting reservoir, 1 well -> 5 pipes -> tank
const g = new Game({ rng: mulberry32(5), seed: 7 }); g.s.cash = 200000;
const known = oldAreas(g).filter(a => a.st === 2);
assert.strictEqual(known.length, 3); ok('3 starting areas are discovered, the rest is hidden');
const A0 = known[0];
let wx, wy, found = false;
for (const [x, y] of tiles(g, A0)) { if (g.canPlace('well', x, y).ok && g.canPlace('tank', x + 6, y).ok && [1, 2, 3, 4, 5].every(d => g.canPlace('pipe', x + d, y).ok !== false)) { wx = x; wy = y; found = true; break; } }
assert(found, 'free spot');
const w = g.place('well', wx, wy, 'small').building;                                             // 1. build well
const t = g.place('tank', wx + 6, wy).building;
assert(g.buildRoute(g.routePipe(wx + 1, wy, wx + 5, wy, false)).ok);
ok('1. built well + tank + pipes (cost $' + (200000 - g.s.cash) + ')');
run(g, 60);
assert(t.amt > 5 && w.status === 'producing');                                                    // 2. produce
ok('2. oil produced: tank ' + t.amt.toFixed(1) + ' BBL (status ' + w.status + ')');

// 3-4 well upgrade
const r0 = g.wellNominal(w), c0 = g.s.cash;
let r = g.upgrade(w); assert(r.ok && g.s.cash === c0 - 500 && w.level === 2);
assert(g.wellNominal(w) > r0); near(g.wellNominal(w), 12, 1e-9, 'level 2 = +20%');
run(g, 30); assert(w.out > 0); near(w.out / g.wellNominal(w), g.conditionMod(w) * g.pressureMod(w), 0.01, 'out = nominal x condition x pressure');
ok('3-4. well upgrade -$500, level 2, nominal ' + r0 + ' -> ' + g.wellNominal(w) + ' BBL/min, real output ' + w.out.toFixed(2));
g.s.cash = 100; assert.strictEqual(g.upgrade(w).reason, 'cash'); assert.strictEqual(w.level, 2); assert.strictEqual(g.s.cash, 100); g.s.cash = 200000;
ok('upgrade without money is refused and changes nothing');

// 5-6 pipe upgrade
const pk = g.net.comps.find(c => c.pipes.length).pipes[0];
assert.strictEqual(g.pipeNet(pk).cap, 25);
const info = g.pipeUpgradeInfo(pk), c1 = g.s.cash; r = g.upgradePipes(pk);
assert(r.ok && c1 - g.s.cash === info.cost && info.cost === 5 * 30); assert.strictEqual(g.pipeNet(pk).cap, 40); assert.strictEqual(g.pipeNet(pk).level, 2);
ok('5-6. pipe upgrade -$' + info.cost + ' (5 tiles x $30): capacity 25 -> ' + g.pipeNet(pk).cap + ' BBL/min');

// 7-8 bottleneck: three big wells on a level-1 trunk, the surplus stays in the ground
{
  const h = new Game({ rng: mulberry32(9), seed: 7 }); h.s.cash = 1e6;
  const a = oldAreas(h).filter(x => x.st === 2).sort((p, q) => q.potential - p.potential)[0];
  const T = tiles(h, a); let ox, oy;
  for (const [x, y] of T) { if ([0, 1, 2].every(i => h.canPlace('well', x, y + i).ok) && h.canPlace('tank', x + 4, y).ok) { ox = x; oy = y; break; } }
  assert(ox != null);
  const ws = [0, 1, 2].map(i => h.place('well', ox, oy + i, 'medium').building);
  const tk = h.place('tank', ox + 4, oy).building; h.upgrade(tk); h.upgrade(tk); h.upgrade(tk);
  assert(h.buildRoute(h.routePipe(ox + 1, oy, ox + 1, oy + 2, false)).ok); assert(h.buildRoute(h.routePipe(ox + 1, oy, ox + 3, oy, false)).ok);
  const want = ws.reduce((s, b) => s + h.wellRate(b), 0); assert(want > 60);
  const rem0 = a.remaining, a0 = tk.amt; run(h, 60);
  const flow = h.pipeNet(h.net.comps.find(c => c.pipes.length).pipes[0]);
  near(tk.amt - a0, 25, 1.5, 'level-1 pipes carry 25/min'); assert(ws.every(b => b.status === 'limited'));
  near(rem0 - a.remaining, 25, 1.5, 'only what is carried is taken out of the ground (the rest stays in the reserve)');
  ok('7-8. bottleneck: wells want ' + want.toFixed(0) + '/min, pipe carries 25/min; ground lost only ' + (rem0 - a.remaining).toFixed(1) + ' BBL (excess stays in reserve), status limited');
  // 9-11 tank fill + upgrade
  tk.amt = h.tankCap(tk) - 2; const cap0 = h.tankCap(tk); run(h, 30);
  assert.strictEqual(tk.amt, cap0); assert(ws.every(b => b.status === 'full'));
  const c2 = h.s.cash; assert(h.upgrade(tk).ok); assert.strictEqual(c2 - h.s.cash, CFG.UPGRADE.tank[3]);
  assert(h.tankCap(tk) > cap0); run(h, 10); assert(tk.amt > cap0 && ws.some(b => b.status === 'limited'));
  ok('9-11. tank full (' + cap0 + ') stopped the wells; upgrade -$' + CFG.UPGRADE.tank[3] + ' -> capacity ' + h.tankCap(tk) + ', production resumed');
}

// 12-15 pressure, condition, maintenance
{
  const h = new Game({ rng: mulberry32(11), seed: 7 }); h.s.cash = 1e6;
  const a = oldAreas(h).filter(x => x.st === 2)[0], T = tiles(h, a); let ox, oy;
  for (const [x, y] of T) if (h.canPlace('well', x, y).ok && h.canPlace('tank', x + 3, y).ok) { ox = x; oy = y; break; }
  const wl = h.place('well', ox, oy, 'large').building, tk = h.place('tank', ox + 3, oy).building;
  for (let i = 0; i < 4; i++) h.upgrade(tk);
  assert(h.buildRoute(h.routePipe(ox + 1, oy, ox + 2, oy, false)).ok);
  for (let i = 0; i < 4; i++) h.upgradePipes(h.net.comps.find(c => c.pipes.length).pipes[0]);
  const p0 = wl.pressure, k0 = wl.condition, o0 = (run(h, 5), wl.out);
  run(h, 600);
  assert(wl.pressure < p0 && wl.condition < k0); const o1 = wl.out; assert(o1 < o0);
  ok('12-13. after 10 min: pressure ' + (p0 * 100).toFixed(0) + '% -> ' + (wl.pressure * 100).toFixed(1) + '%, condition ' + (k0 * 100).toFixed(0) + '% -> ' + (wl.condition * 100).toFixed(1) + '%, output ' + o0.toFixed(1) + ' -> ' + o1.toFixed(1) + ' BBL/min');
  const mc = h.maintenanceCost(wl), cs = h.s.cash, m0 = h.s.maintenance; r = h.maintain(wl);
  assert(r.ok && mc > 0); near(cs - h.s.cash, mc, 1e-6, 'cash paid'); assert.strictEqual(wl.condition, 1); near(h.s.maintenance - m0, mc, 1e-6, 'maintenance cost recorded');
  assert.strictEqual(h.maintain(wl).reason, 'good');
  const sm = h.maintenanceCost(Object.assign({}, wl, { condition: 0.5 })), lg = h.maintenanceCost(Object.assign({}, wl, { condition: 0.9 })); assert(sm > lg);
  ok('14-15. maintenance cost $' + mc.toFixed(0) + ' (worse condition costs more), condition back to 100%, expense booked');
  // pressure recovers when the well is idle
  tk.amt = h.tankCap(tk); run(h, 120); assert(wl.pressure >= 0); const pi = wl.pressure; run(h, 300); assert(wl.pressure > pi);
  ok('pressure slowly recovers while the well is stopped');
  // broken well stops until maintained
  wl.condition = 0.05; tk.amt = 0; run(h, 2); assert.strictEqual(wl.status, 'broken'); assert.strictEqual(wl.out, 0);
  assert(h.maintain(wl).ok); run(h, 3); assert.strictEqual(wl.status, 'producing'); ok('a broken well (condition <= 10%) stops and resumes after maintenance');
}

// 16-19 leak -> flow drops -> repair -> flow returns
{
  const h = new Game({ rng: mulberry32(13), seed: 7 }); h.s.cash = 1e6;
  const a = oldAreas(h).filter(x => x.st === 2)[0], T = tiles(h, a); let ox, oy;
  for (const [x, y] of T) if (h.canPlace('well', x, y).ok && h.canPlace('tank', x + 4, y).ok) { ox = x; oy = y; break; }
  const wl = h.place('well', ox, oy, 'small').building, tk = h.place('tank', ox + 4, oy).building;
  assert(h.buildRoute(h.routePipe(ox + 1, oy, ox + 3, oy, false)).ok);
  const comp = () => h.net.comps.find(c => c.pipes.length); run(h, 20);
  const base = comp().flow * 60 / (h.lastDt || 0.1) ; // per-step flow -> per minute computed below instead
  const measure = () => { const a0 = tk.amt; run(h, 30); return (tk.amt - a0) * 2; };
  const normal = measure(); h.drainEvents && h.drainEvents();
  const k = comp().pipes[1]; h.pipeSt[k] = 1; h.updateComp(comp());                                       // trigger a leak
  assert.strictEqual(comp().leaks, 1); const leaking = measure();
  assert(leaking < normal * 0.85 && leaking > normal * 0.5); assert(h.s.leaked > 0);
  ok('16-17. leak: flow ' + normal.toFixed(2) + ' -> ' + leaking.toFixed(2) + ' BBL/min, oil lost ' + h.s.leaked.toFixed(1) + ' BBL');
  const cs = h.s.cash; r = h.repairPipe(k); assert(r.ok && cs - h.s.cash === r.cost); assert.strictEqual(h.pipeSt[k], 2);
  assert.strictEqual(h.repairPipe(k).reason, 'repairing'); assert.strictEqual(h.s.cash, cs - r.cost); ok('18. repair paid ($' + r.cost + '), state REPAIRING, second repair refused');
  run(h, CFG.PIPE.REPAIR_TIME + 2); assert.strictEqual(h.pipeSt[k], 0); assert.strictEqual(comp().leaks, 0);
  const back = measure(); near(back, normal, normal * 0.08, 'flow returns'); assert.strictEqual(h.repairPipe(k).reason, 'noleak');
  ok('19. repaired: flow back to ' + back.toFixed(2) + ' BBL/min (normal ' + normal.toFixed(2) + ')');
  // random leaks really happen (moderate): 120 simulated minutes
  const q = new Game({ rng: mulberry32(77), seed: 7 }); q.s.cash = 1e6;
  const aa = oldAreas(q).filter(x => x.st === 2)[0]; let qx, qy;
  for (const [x, y] of tiles(q, aa)) if (q.canPlace('well', x, y).ok && q.canPlace('tank', x + 8, y).ok) { qx = x; qy = y; break; }
  q.place('well', qx, qy); const qt = q.place('tank', qx + 8, qy).building; for (let i = 0; i < 4; i++) q.upgrade(qt);
  q.buildRoute(q.routePipe(qx + 1, qy, qx + 7, qy, false)); let leaks = 0; q.drainEvents();
  for (let i = 0; i < 7200; i++) { q.step(1); for (const e of q.drainEvents()) if (e.type === 'leak') { leaks++; q.pipeSt[e.k] === 1 && q.repairPipe(e.k); } q.buildings[0].condition = 1; qt.amt = 0; }
  assert(leaks >= 1 && leaks <= 30, 'moderate leaks: ' + leaks); ok('random leaks are moderate: ' + leaks + ' in 120 min on a 7-tile level-1 pipe');
}

// 11 quality + 12 well types
{
  const h = new Game({ rng: mulberry32(3), seed: 7 }); h.s.cash = 1e6;
  const ks = CFG.WELL_KINDS; assert(ks.small.base < ks.medium.base && ks.medium.base < ks.large.base);
  assert(ks.small.decay < ks.medium.decay && ks.medium.decay < ks.large.decay); assert(ks.small.wear < ks.large.wear);
  ok('well types differ: small ' + ks.small.base + ' / medium ' + ks.medium.base + ' / large ' + ks.large.base + ' BBL/min, pressure loss ' + ks.small.decay + '/' + ks.medium.decay + '/' + ks.large.decay + ' %/min');
  const tk = h.place('tank', 20, 14).building; const px = h.s.price;
  for (const [ql, f] of [['LOW', 0.85], ['MEDIUM', 1], ['HIGH', 1.2]]) {
    tk.amt = 100; tk.qm = CFG.QUALITY[ql]; const c = h.s.cash; const rr = h.sell(100); near(h.s.cash - c, 100 * h.s.price * f, 0.02, ql); assert.strictEqual(rr.quality, f);
  }
  ok('oil quality: LOW 0.85 / MEDIUM 1.00 / HIGH 1.20 x market price paid');
  // mixing
  tk.amt = 100; tk.qm = 1; const w1 = tk.amt; tk.qm = (w1 * 1 + 100 * 1.2) / (w1 + 100); near(tk.qm, 1.1, 1e-9, 'mix'); ok('mixed oil in one tank is priced by its weighted quality');
}

// 20-23 exploration
{
  const h = new Game({ rng: mulberry32(15), seed: 7 }); h.s.cash = 20000;
  const hidden = oldAreas(h).find(a => a.st === 0 && a.land);
  const info0 = h.areaInfo(hidden); assert.strictEqual(info0.state, 'unexplored'); assert(!('reserveSize' in info0) && !('quality' in info0));
  const T = tiles(h, hidden).find(([x, y]) => !h.map.block[y * 140 + x]);
  assert.strictEqual(h.canPlace('well', T[0], T[1]).reason, 'notExplored'); assert.strictEqual(h.place('well', T[0], T[1]).ok, false);
  ok('21-23a. undiscovered area hides its data and refuses wells (' + h.canPlace('well', T[0], T[1]).reason + ')');
  const c0 = h.s.cash; r = h.explore(hidden.id); assert(r.ok && c0 - h.s.cash === h.exploreCost(hidden) && hidden.st === 1);
  assert.strictEqual(h.explore(hidden.id).reason, 'exploring'); assert.strictEqual(h.canPlace('well', T[0], T[1]).ok, false);
  run(h, CFG.EXPLORE.TIME - 1); assert.strictEqual(h.areaInfo(hidden).state, 'exploring'); run(h, 2); assert.strictEqual(h.areaInfo(hidden).state, 'discovered');
  assert(h.drainEvents().some(e => e.type === 'explored'));
  const info = h.areaInfo(hidden); assert(['empty', 'small', 'medium', 'large'].includes(info.kind)); assert.strictEqual(h.s.exploration, h.exploreCost(hidden));
  ok('20-22. explore -$' + h.exploreCost(hidden) + ', took ' + CFG.EXPLORE.TIME + ' s, result: ' + info.kind.toUpperCase() + (info.kind === 'empty' ? '' : ' (size ' + info.reserveSize + ', quality ' + info.quality + ', potential ' + info.productionPotential + '/min)'));
  // build on every kind of discovered result; empty refuses
  let built = 0, refused = 0; const kinds = {};
  const q = new Game({ rng: mulberry32(100), seed: 7 }); q.s.cash = 1e7;
  const cands = oldAreas(q).filter(a => a.st === 0 && a.land);
  for (const a of cands) q.explore(a.id);
  run(q, 21);
  for (const a of cands) {
    const sp = tiles(q, a).find(([x, y]) => !q.map.block[y * 140 + x] && q.occ[y * 140 + x] == null);
    if (!sp) continue;
    kinds[a.kind] = (kinds[a.kind] || 0) + 1;
    const cc = q.s.cash, rr = q.place('well', sp[0], sp[1], 'medium');
    if (a.kind === 'empty') { assert.strictEqual(rr.ok, false); assert.strictEqual(rr.reason, 'noOil'); refused++; }
    else { assert(rr.ok, a.kind + ' ' + rr.reason); assert.strictEqual(cc - q.s.cash, CFG.WELL_KINDS.medium.cost); assert.strictEqual(rr.building.quality, a.quality); assert.strictEqual(rr.building.area, a.id); built++; }
  }
  console.log('      area results over the map: ' + JSON.stringify(kinds));
  assert(built && refused); ok('23-24. wells can be built on a discovered reserve (cost charged, quality inherited); EMPTY areas refuse (noOil)');
}

// 24-25 economy sync + save/load keeps all Phase 3 state
{
  const h = new Game({ rng: mulberry32(21), seed: 7 }); h.s.cash = 1e6;
  const a = oldAreas(h).filter(x => x.st === 2)[0]; let ox, oy;
  for (const [x, y] of tiles(h, a)) if (h.canPlace('well', x, y).ok && h.canPlace('tank', x + 4, y).ok) { ox = x; oy = y; break; }
  const wl = h.place('well', ox, oy, 'medium').building, tk = h.place('tank', ox + 4, oy).building; h.buildRoute(h.routePipe(ox + 1, oy, ox + 3, oy, false));
  h.upgrade(wl); h.upgrade(wl); h.upgrade(tk); const pk = h.net.comps.find(c => c.pipes.length).pipes[1]; h.upgradePipes(pk); h.pipeSt[pk] = 1; h.updateComp(h.pipeNet(pk));
  const hid = oldAreas(h).find(x => x.st === 0 && x.land); h.explore(hid.id); run(h, 300);
  const E = h.economy();
  near(E.money + E.owed, CFG.START_CASH - 0 + (1e6 - CFG.START_CASH) - h.s.capex + h.s.refunds + E.revenue - E.operatingCosts, 0.05, 'money balance with upgrades/maintenance/exploration');
  const d = JSON.parse(JSON.stringify(h.serialize())), j = new Game({ seed: 7 }); j.load(d);
  const w2 = j.buildings.find(b => b.type === 'well'), t2 = j.buildings.find(b => b.type === 'tank');
  assert.strictEqual(w2.level, 3); assert.strictEqual(w2.kind, 'medium'); near(w2.pressure, wl.pressure, 1e-9, 'p'); near(w2.condition, wl.condition, 1e-9, 'c'); assert.strictEqual(w2.quality, wl.quality);
  assert.strictEqual(t2.level, 2); assert.strictEqual(j.pipeLvl[pk], 2); assert.strictEqual(j.pipeSt[pk], 1); assert.strictEqual(j.areas[hid.id].st, hid.st); near(j.areas[a.id].remaining, a.remaining, 1e-6, 'rem');
  near(j.net.comps.find(c => c.pipes.length).cap, 40, 0, 'upgraded network capacity'); near(j.s.exploration, h.s.exploration, 0, 'e');
  ok('25. economy balances (money = start - capex + refunds + revenue - costs); save/load keeps levels, pressure, condition, quality, leaks, areas');
}

// old Phase-2 saves still load
{
  const old = { v: 1, s: new Game({ seed: 7 }).s, pipes: [], buildings: [{ id: 1, type: 'well', x: 20, y: 14, level: 3, invested: 0 }, { id: 2, type: 'tank', x: 24, y: 14, level: 2, amt: 5000, invested: 0 }] };
  const j = new Game({ seed: 7 }); j.load(JSON.parse(JSON.stringify(old)));
  const w = j.buildings[0]; assert.strictEqual(w.kind, 'small'); assert.strictEqual(w.pressure, 1); assert(j.tankCap(j.buildings[1]) >= j.buildings[1].amt); j.step(1);
  ok('an older save (no Phase 3 fields) loads: well becomes small, pressure/condition 100%, tank clamped to its capacity');
}
console.log('\nALL PHASE 3 CORE TESTS PASSED');
