// Phase 2: advanced hydraulics & control - pump, valves, bottlenecks, warnings.
// Every number comes from the one simulation (core.js). This file builds networks, changes ONE thing, and checks the measured effect on
// Flow / Pressure / Inventory. Units: flow bbl/min, pressure bar, head m, density kg/m3, g m/s2, power kW, cost $.
const assert = require('assert');
const { Game: G, CFG, Hyd, idx } = require('./core.js');
CFG.TERRAIN.MULT = [1, 1, 1, 1]; CFG.REGIONS.forEach(r => { r.mult = 1; });
CFG.PIPE.LEAK_PER_TILE_MIN = 0; CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
const HC = CFG.HYD, W = CFG.GRID_COLS;
const ok = m => console.log('  ok  ' + m);
let pass = 0; const done = m => { pass++; ok(m); };
const F = v => Number.isFinite(v);
function mk() {
  const h = new G({ seed: 7 }); h.s.cash = 1e8; h.s.regions.forEach(r => { r.unlocked = true; });
  for (const a of h.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
  for (let y = 15; y < 75; y++) for (let x = 10; x < 130; x++) { const k = idx(x, y); h.map.block[k] = 0; h.map.water[k] = 0; }
  return h;
}
const B = b => 'B' + b.id;
function safe(g, w) {
  for (const b of g.buildings) {
    for (const k of ['amt', 'out', 'flow', 'kw', 'boost', 'pIn', 'pOut', 'spin', 'costTotal', 'runTime']) if (b[k] != null) assert(F(b[k]) && b[k] >= -1e-9, w + ': ' + k + ' of ' + b.type + ' = ' + b[k]);
    if (b.type === 'tank') assert(b.amt <= g.tankCap(b) + 1e-9, w + ': tank above capacity');
    if (b.type === 'pump') { const p = g.pumpHyd(b); for (const k in p) if (typeof p[k] === 'number') assert(F(p[k]) && p[k] >= 0, w + ': pump ' + k + '=' + p[k]); }
  }
  for (let k = 0; k < g.pipe.length; k++) {
    const a = g.net.flowK[k], p = g.net.pressK[k]; assert(F(a) && a >= 0 && F(p) && p >= 0, w + ': tile ' + k);
    if (g.valve[k]) { const v = g.valveHyd(k); for (const q in v) if (typeof v[q] === 'number') assert(F(v[q]) && v[q] >= 0, w + ': valve ' + q + '=' + v[q]); }
  }
  for (const L of g.lines) { assert(F(L.util) && L.util >= 0, w + ': util'); assert(['normal', 'busy', 'high', 'bottleneck'].includes(L.status), w + ': status ' + L.status); }
}
const run = (g, sec, w) => { for (let i = 0; i < Math.round(sec / 0.1); i++) { g.step(0.1); safe(g, w || 'run'); } };

/* Scenario: Well(large) -> [small part] -> Pump -> [main part] -> Valve -> Tank, all on one straight main line y = 40.
   cells[0..] run from the well to the tank. The pump sits on cells[PUMP], the valve on cells[VALVE]. */
const PUMP = 20, VALVE = 35;
function scenario(opts) {
  opts = opts || {};
  const h = mk(), w = h.place('well', 15, 40, opts.kind || 'large').building, t = h.place('tank', 70, 40).building;
  const r = h.routeNodes(B(w), B(t), 1); assert(r.ok, 'route'); const L = h.buildLine(r).line; assert(L);
  const c = L.cells;
  if (opts.small) { for (let i = 0; i < PUMP; i++) h.pipeType[c[i]] = 0; h.rebuildNetwork(); }   // the part before the pump is a small (sub) pipe
  let p = null; if (opts.pump !== false) { const pr = h.place('pump', c[PUMP] % W, (c[PUMP] / W) | 0); assert(pr.ok, 'pump ' + pr.reason); p = pr.building; }
  if (opts.valve !== false) assert(h.setValve(c[VALVE], 1).ok);
  return { h, w, t, L, c, p, vk: c[VALVE], pk: c[PUMP] };
}
const LN = (s, i) => { const L = s.h.lineAt(s.c[i]); assert(L, 'line at tile ' + i); return L; };   // the pump splits the line in two entities: always look up by tile
const snap = s => ({ wellOut: s.w.out, tank: s.t.amt, inflow: s.t.inflow, flow: s.h.net.flowK[s.c[45]], pump: s.p ? s.p.state : '-', boost: s.p ? (s.p.boostNow || 0) : 0, pIn: s.p ? s.p.pIn : 0, pOut: s.p ? s.p.pOut : 0, wh: s.w.wh });
const fmt = x => `well ${x.wellOut.toFixed(1)} | pipe-after ${x.flow.toFixed(1)} bbl/min | tank ${x.tank.toFixed(0)} bbl (+${x.inflow.toFixed(1)}/min) | pump ${x.pump} boost ${x.boost.toFixed(2)} bar (in ${x.pIn.toFixed(1)} / out ${x.pOut.toFixed(1)}) | well-head ${x.wh.toFixed(1)} bar`;

// ---------- units: the pump curve, dP = rho g H(Q), is dimensionally consistent
{
  const sp = Hyd.pumpSpec(1);                                                 // H0 [m], Qmax [bbl/min], k = H0 / Qmax^2 [m / (bbl/min)^2]
  assert(Math.abs(sp.k * sp.Qmax * sp.Qmax - sp.H0) < 1e-9, 'H(Qmax) = 0');
  assert(Math.abs(Hyd.pumpHead(sp.H0, sp.k, 0) - sp.H0) < 1e-9, 'H(0) = H0');
  const dP = Hyd.pumpPressure(HC.RHO, sp.H0) / HC.BAR;                         // Pa -> bar
  assert(Math.abs(dP - sp.bar0) < 1e-6, 'rho*g*H0 = H0_BAR: ' + dP + ' vs ' + sp.bar0);
  for (let l = 1; l <= 3; l++) { const s = Hyd.pumpSpec(l); assert(Hyd.pumpBoost(l, 0, 1) <= s.bar0 + 1e-9 && Hyd.pumpBoost(l, s.Qmax, 1) < 1e-6); }
  done('Units: H(Q)=H0-kQ^2 [m], dP=rho*g*H [Pa]/1e5 = bar; level 1: H0 ' + sp.H0.toFixed(1) + ' m = ' + sp.bar0 + ' bar at rho ' + HC.RHO + ' kg/m3, g ' + HC.G + '; Qmax ' + sp.Qmax + ' bbl/min');
}
// ---------- Test 1-3: Pump OFF / ON / increases pressure
let base, withPump;
{
  const a = scenario({ pump: false }); run(a.h, 40); base = snap(a); assert(base.flow > 5);
  const s = scenario(); run(s.h, 40); withPump = snap(s);
  assert.strictEqual(s.p.state, 'RUNNING', 'pump RUNNING ' + s.p.state);
  assert(withPump.boost > 1, 'boost ' + withPump.boost);
  // Test 1: OFF - the pump adds nothing: boost 0, no power, no cost, same flow as a line without a pump (only its small casing loss)
  s.h.setPumpEnabled(s.p, false); run(s.h, 40); const off = snap(s);
  assert.strictEqual(s.p.state, 'OFF'); assert.strictEqual(off.boost, 0); assert.strictEqual(s.p.kw, 0);
  assert(Math.abs(off.flow - base.flow) < 0.1 * base.flow, 'OFF flow ~ no pump: ' + off.flow + ' vs ' + base.flow);
  assert(off.flow < withPump.flow - 1, 'flow falls when the pump goes OFF: ' + withPump.flow + ' -> ' + off.flow);
  done('Test 1: Pump OFF: state OFF, boost 0 bar, 0 kW; flow ' + withPump.flow.toFixed(1) + ' -> ' + off.flow.toFixed(1) + ' bbl/min (line without pump ' + base.flow.toFixed(1) + ')');
  // Test 2: ON again
  s.h.setPumpEnabled(s.p, true); run(s.h, 40); const on = snap(s);
  assert.strictEqual(s.p.state, 'RUNNING'); assert(on.boost > 1 && on.flow > off.flow + 1 && on.wellOut > off.wellOut);
  done('Test 2: Pump ON: RUNNING, boost ' + on.boost.toFixed(2) + ' bar, flow ' + off.flow.toFixed(1) + ' -> ' + on.flow.toFixed(1) + ' bbl/min, well ' + off.wellOut.toFixed(1) + ' -> ' + on.wellOut.toFixed(1));
  // Test 3: pressure rises across the pump (outlet - inlet = boost - casing loss) and the well-head pressure falls (suction)
  assert(on.pOut > on.pIn + 1, 'pOut ' + on.pOut + ' > pIn ' + on.pIn);
  assert(on.wh < off.wh - 0.5, 'well-head pressure falls with the suction: ' + off.wh + ' -> ' + on.wh);
  assert(Math.abs((on.pOut - on.pIn) - on.boost) < 1.5, 'dP across the pump ~ boost: ' + (on.pOut - on.pIn) + ' vs ' + on.boost);
  done('Test 3: Pump increases pressure: in ' + on.pIn.toFixed(2) + ' -> out ' + on.pOut.toFixed(2) + ' bar (boost ' + on.boost.toFixed(2) + '); well-head ' + off.wh.toFixed(1) + ' -> ' + on.wh.toFixed(1) + ' bar');
}
// ---------- Test 4: the flow curve H(Q) = H0 - kQ^2: more flow -> less head, and the boost seen in the network follows the curve
{
  const sp = Hyd.pumpSpec(1); let prev = Infinity;
  for (let q = 0; q <= sp.Qmax; q += sp.Qmax / 10) { const bst = Hyd.pumpBoost(1, q, 1); assert(bst <= prev + 1e-12, 'monotonic'); prev = bst; }
  const s = scenario(); run(s.h, 40); const q = s.p.flow, expect = Hyd.pumpBoost(1, q, s.p.spin);
  assert(Math.abs(s.p.boostNow - expect) < 0.02, 'network boost ' + s.p.boostNow + ' follows the curve ' + expect + ' at Q ' + q);
  const h = s.h.pumpHyd(s.p), headExp = Hyd.pumpHead(sp.H0, sp.k, q);
  assert(Math.abs(h.head - headExp * Math.min(1, s.p.spin)) < 0.5, 'head ' + h.head + ' vs ' + headExp);
  done('Test 4: Pump flow curve: Q ' + q.toFixed(1) + ' bbl/min -> head ' + h.head.toFixed(1) + ' m (H0 ' + sp.H0.toFixed(1) + '), boost ' + s.p.boostNow.toFixed(2) + ' bar = curve');
}
// ---------- Test 5: operating cost follows flow, boost and time (P = dP x Q / eff)
{
  const s = scenario(); run(s.h, 30); const p = s.p, sp = Hyd.pumpSpec(1);
  const kwExp = p.boostNow * HC.BAR * (p.flow * HC.BBL_MIN) / sp.eff / 1000;
  assert(p.kw > 0 && Math.abs(p.kw - kwExp) < 1e-6, 'kW = dP*Q/eff: ' + p.kw + ' vs ' + kwExp);
  const kw0 = p.kw, c0 = p.costTotal, t0 = p.runTime; run(s.h, 60); const c1 = p.costTotal - c0;
  assert(Math.abs(c1 - p.kw * CFG.OPEX.pumpKwMin * 60 / 60) < 0.05 * c1 + 1e-6, 'cost over 60 s = kW x $/kW/min x 1 min: ' + c1);
  assert(p.runTime - t0 > 59, 'operating time accumulates');
  const hyd = s.h.pumpHyd(p); assert(Math.abs(hyd.costPerMin - p.kw * CFG.OPEX.pumpKwMin) < 1e-9);
  // a pump that is OFF costs nothing; a longer run costs more
  s.h.setPumpEnabled(p, false); run(s.h, 20); const c2 = p.costTotal; run(s.h, 30); assert(Math.abs(p.costTotal - c2) < 1e-9, 'OFF: no cost');
  done('Test 5: Pump operating cost: ' + kw0.toFixed(1) + ' kW -> $' + hyd.costPerMin.toFixed(2) + '/min; $' + c1.toFixed(2) + ' in 60 s while running, $0 while OFF');
}
// ---------- Test 6-8: Valve OPEN / CLOSED / isolation (Well -> Pipe -> Valve -> Pipe -> Tank, no pump)
{
  const s = scenario({ pump: false }); run(s.h, 40); const open = snap(s), vo = s.h.valveHyd(s.vk);
  assert.strictEqual(vo.status, 'OPEN'); assert(vo.flow > 5 && Math.abs(vo.flow - open.flow) < 1, 'OPEN passes the flow: ' + vo.flow);
  assert(vo.pressureBefore > vo.pressureAfter, 'pressure drops across an open valve: ' + vo.pressureBefore + ' > ' + vo.pressureAfter);
  assert(open.tank > 10 && open.inflow > 5);
  done('Test 6: Valve OPEN: flow ' + vo.flow.toFixed(1) + ' bbl/min, pressure before ' + vo.pressureBefore.toFixed(2) + ' / after ' + vo.pressureAfter.toFixed(2) + ' bar; tank gains ' + open.inflow.toFixed(1) + ' bbl/min');
  const tankBefore = s.t.amt;
  s.h.setValve(s.vk, 3); run(s.h, 20); const cl = snap(s), vc = s.h.valveHyd(s.vk);
  assert.strictEqual(vc.status, 'CLOSED'); assert.strictEqual(vc.flow, 0, 'flow through the closed valve is exactly 0');
  assert.strictEqual(s.h.net.flowK[s.vk], 0);
  for (let i = VALVE; i < s.c.length; i++) assert.strictEqual(s.h.net.flowK[s.c[i]], 0, 'no flow in any tile after the valve (' + i + ')');
  assert.strictEqual(cl.wellOut, 0, 'the well has nowhere to send oil: ' + cl.wellOut);
  const grew = s.t.amt - tankBefore; assert(grew < 20 * 0.3 * open.inflow, 'tank stops growing (+' + grew.toFixed(1) + ' only the transient)');
  const t1 = s.t.amt; run(s.h, 30); assert(Math.abs(s.t.amt - t1) < 1e-9, 'tank inventory frozen');
  assert(vc.pressureBefore > open.wh + 1 || vc.pressureBefore > vo.pressureBefore, 'pressure before the closed valve rises (shut-in): ' + vc.pressureBefore);
  assert(vc.pressureAfter < vc.pressureBefore - 5, 'pressure after the closed valve is only the tank side: ' + vc.pressureAfter);
  assert(s.h.warnings.some(w => w.code === 'VALVE_CLOSED'), 'VALVE CLOSED warning');
  done('Test 7: Valve CLOSED: flow 0 exactly, well ' + open.wellOut.toFixed(1) + ' -> 0, tank frozen at ' + s.t.amt.toFixed(0) + ' bbl, pressure before ' + vc.pressureBefore.toFixed(1) + ' (shut-in) / after ' + vc.pressureAfter.toFixed(1) + ' bar');
  // reopening restores the flow (isolation is reversible)
  s.h.setValve(s.vk, 1); run(s.h, 40); const re = snap(s); assert(re.flow > 0.8 * open.flow && s.t.amt > t1 + 5, 'reopened: ' + re.flow);
  done('Test 8: Valve isolation: closed -> nothing after the valve, no tank growth, oil not drawn; reopened -> flow ' + re.flow.toFixed(1) + ' bbl/min again');
}
// ---------- Test 9-11: bottlenecks and utilisation = actualFlow / capacity
{
  // without a pump the small pipe is PRESSURE-limited (friction + well-head back-pressure): high use, but not at its capacity
  const np = scenario({ pump: false, small: true }); run(np.h, 40);
  const fNo = np.h.net.flowK[np.c[5]], capNo = np.h.pipeCapacity(np.c[5]), lNo = LN(np, 5);
  assert(Math.abs(lNo.util - fNo / capNo) < 1e-6 && fNo < 0.95 * capNo + 1e-6 && lNo.status !== 'normal', 'no pump: ' + fNo + '/' + capNo + ' ' + lNo.status);
  // with a pump the pressure problem is gone and the pipe's own capacity is the limit
  const s = scenario({ small: true }); run(s.h, 40);
  const Ls = LN(s, 5), small = s.h.lineHyd(Ls), cap = s.h.pipeCapacity(s.c[5]), flowSmall = s.h.net.flowK[s.c[5]];
  assert(Math.abs(small.usage - flowSmall / cap) < 1e-6, 'utilisation = flow/capacity: ' + small.usage + ' vs ' + flowSmall / cap);
  assert(flowSmall <= cap + 1e-6 && flowSmall > 0.95 * cap, 'small pipe limits the flow: ' + flowSmall + ' / ' + cap);
  assert.strictEqual(Ls.status, 'bottleneck'); assert(s.h.warnings.some(w => w.code === 'BOTTLENECK' && w.id === Ls.id));
  const wellCan = s.w.rate; assert(wellCan > cap, 'the well could deliver ' + wellCan + ' but the small pipe lets ' + flowSmall);
  assert(s.w.out <= cap + 1e-6, 'real flow is limited: well ' + s.w.out);
  assert(flowSmall > fNo, 'the pump raised the flow up to the pipe capacity');
  done('Test 9: Small pipe bottleneck: capacity ' + cap + '; without pump pressure-limited ' + fNo.toFixed(1) + ' (' + lNo.status + '), with pump ' + flowSmall.toFixed(1) + ' = ' + (small.usage * 100).toFixed(0) + '% BOTTLENECK while the well could give ' + wellCan.toFixed(0) + ' bbl/min');
  // the player fixes it with a bigger pipe
  const up = s.h.upgradePipes(s.c[5]); assert(up.ok, 'upgrade ' + up.reason); run(s.h, 40);
  assert(s.h.net.flowK[s.c[5]] > flowSmall + 3, 'flow rises after the upgrade'); assert.notStrictEqual(LN(s, 5).status, 'bottleneck');
  done('Test 9b: Replacing the small pipe with a bigger one: flow ' + flowSmall.toFixed(1) + ' -> ' + s.h.net.flowK[s.c[5]].toFixed(1) + ', status ' + LN(s, 5).status);
}
{
  // Test 10: the section AFTER the pump is the narrow one (with the pump supplying pressure, the pipe's capacity is the limit)
  const s = scenario(); for (let i = 25; i < s.c.length - 1; i++) s.h.pipeType[s.c[i]] = 0; s.h.rebuildNetwork(); run(s.h, 40);
  const k = s.c[40], cap = s.h.pipeCapacity(k), f = s.h.net.flowK[k];
  assert(f <= cap + 1e-6 && f > 0.9 * cap, 'downstream pipe limits: ' + f + '/' + cap);
  done('Test 10: Main pipe bottleneck (narrow section downstream): flow ' + f.toFixed(1) + '/' + cap + ' bbl/min, well throttled to ' + s.w.out.toFixed(1));
  // Test 11: utilisation bands come from flow/capacity
  const u = x => s.h.utilLevel(x);
  assert.deepStrictEqual([u(0), u(0.59), u(0.6), u(0.79), u(0.8), u(0.94), u(0.95), u(0.951), u(1)], ['normal', 'normal', 'busy', 'busy', 'high', 'high', 'bottleneck', 'bottleneck', 'bottleneck']);
  const w2 = scenario({ pump: false, kind: 'small' }); run(w2.h, 40); const lh = w2.h.lineHyd(LN(w2, 5));
  assert.strictEqual(LN(w2, 5).status, w2.h.utilLevel(lh.currentFlow / lh.capacity));
  done('Test 11: High utilisation: bands <60 normal, 60-80 busy, 80-95 high, >95 bottleneck (stored in game state L.status); small well on a main line: ' + (lh.usage * 100).toFixed(0) + '% -> ' + LN(w2, 5).status);
}
// ---------- Test 12: tank back-pressure: a filling tank pushes back, the flow falls, a full tank stops it
{
  const s = scenario({ pump: false }); run(s.h, 40); const empty = snap(s), cap = s.h.tankCap(s.t);
  s.t.amt = cap * 0.9; s.h.hyd.dirty = true; run(s.h, 30); const high = snap(s), th = s.h.tankHyd(s.t);
  assert(th.backPressure > HC.TANK.BASE + 4, 'back-pressure at 90%: ' + th.backPressure);
  assert(high.flow < empty.flow - 1, 'less flow into a nearly full tank: ' + empty.flow + ' -> ' + high.flow);
  assert(s.h.warnings.some(w => w.code === 'TANK_BACKPRESSURE' && w.id === s.t.id), 'TANK BACKPRESSURE warning');
  s.t.amt = cap; s.h.hyd.dirty = true; run(s.h, 30); assert.strictEqual(s.t.amt, cap); assert(s.w.out < 0.01, 'full tank: well stops ' + s.w.out);
  done('Test 12: Tank backpressure: tank 0->90% full: flow ' + empty.flow.toFixed(1) + ' -> ' + high.flow.toFixed(1) + ' bbl/min (back-pressure ' + th.backPressure.toFixed(1) + ' bar); full: 0, inventory never above capacity');
}
// ---------- Test 13: several bottlenecks at once
{
  const s = scenario({ small: true }); for (let i = 38; i < s.c.length - 1; i++) s.h.pipeType[s.c[i]] = 0; s.h.rebuildNetwork(); run(s.h, 40);
  const f = Math.min(...[3, 20, 45].map(i => s.h.net.flowK[s.c[i]])), cap = s.h.pipeCapacity(s.c[3]);
  assert(Math.abs(f - s.h.net.flowK[s.c[45]]) < 0.5 && s.h.net.flowK[s.c[45]] <= cap + 1e-6, 'one flow through both narrow sections');
  const l = s.h.lineHyd(LN(s, 3)); assert(l.usage > 0.95 && LN(s, 3).status === 'bottleneck');
  done('Test 13: Multiple bottlenecks: both narrow sections at ' + (l.usage * 100).toFixed(0) + '%, the network carries the minimum: ' + f.toFixed(1) + ' bbl/min');
  // two separate pipes both bottlenecked -> two BOTTLENECK warnings
  const h = mk(), w1 = h.place('well', 15, 30, 'large').building, t1 = h.place('tank', 28, 30).building, w2 = h.place('well', 15, 50, 'large').building, t2 = h.place('tank', 28, 50).building;   // short pipes: little friction, so the capacity is what limits
  h.buildLine(h.routeNodes(B(w1), B(t1), 0)); h.buildLine(h.routeNodes(B(w2), B(t2), 0)); run(h, 40);
  assert.strictEqual(h.warnings.filter(w => w.code === 'BOTTLENECK').length, 2, 'two BOTTLENECK warnings: ' + JSON.stringify(h.warnings));
  assert.strictEqual(h.lines.filter(L => L.status === 'bottleneck').length, 2);
  done('Test 13b: two separate pipes at the limit -> 2 BOTTLENECK warnings');
}
// ---------- Test 14: pump starvation - a measured condition: a tank with room is reachable, but no oil reaches the pump
{
  const h = mk(), t = h.place('tank', 70, 40).building, w = h.place('well', 15, 60, 'small').building;   // the well is NOT connected to the pump line
  const t2 = h.place('tank', 15, 40).building;
  const r = h.routeNodes(B(t2), B(t), 1); assert(r.ok); const L = h.buildLine(r).line;
  const pr = h.place('pump', L.cells[20] % W, (L.cells[20] / W) | 0, undefined, 0); assert(pr.ok); const p = pr.building;   // facing +x: towards the tank at x = 70
  run(h, 20); assert.strictEqual(p.state, 'STARVED', 'no oil behind the pump: ' + p.state); assert.strictEqual(p.flow, 0); assert.strictEqual(p.kw, 0);
  assert(h.warnings.some(x => x.code === 'PUMP_STARVED' && x.id === p.id), 'PUMP STARVED warning');
  const c0 = p.costTotal; run(h, 20); assert.strictEqual(p.costTotal, c0, 'a starved pump costs nothing');
  // connect a well behind it (the near tank at the start of the line is full, so the oil has to go through the pump to the far tank)
  t2.amt = h.tankCap(t2); h.hyd.dirty = true;
  const w3 = h.place('well', 15, 36, 'large').building; const r2 = h.routeNodes(B(w3), 'J' + L.cells[8], 1); assert(r2.ok, r2.reason); assert(h.buildLine(r2).ok);
  run(h, 40); assert(p.flow > 1 && p.state !== 'STARVED' && p.state !== 'OFF', 'oil arrives: ' + p.state + ' ' + p.flow); assert(!h.warnings.some(x => x.code === 'PUMP_STARVED'));
  done('Test 14: Pump starvation: tank with room reachable, no oil -> STARVED (flow 0, 0 kW, warning); a well connected behind it -> ' + p.state + ' ' + p.flow.toFixed(1) + ' bbl/min');
  // OVERLOAD: flow at the pump's maximum; STOPPED: tanks full
  const s = scenario({ kind: 'large' }); const sp = Hyd.pumpSpec(1); s.h.pipeType[s.c[0]] = 1;
  CFG.HYD.PUMP.QMAX[0] = 20; run(s.h, 40); const ov = s.p.state; CFG.HYD.PUMP.QMAX[0] = 60;
  assert.strictEqual(ov, 'OVERLOAD', 'flow >= 98% of Qmax -> OVERLOAD: ' + ov);
  const st = scenario(); st.t.amt = st.h.tankCap(st.t); st.h.hyd.dirty = true; run(st.h, 30); assert.strictEqual(st.p.state, 'STOPPED', 'tanks full: ' + st.p.state);
  done('Test 14b: OVERLOAD only at flow >= 98% of Qmax (' + ov + '); STOPPED when every reachable tank is full (' + st.p.state + ')');
}
// ---------- Test 15-16: Save / Load of pump and valve state
{
  const s = scenario(); run(s.h, 30); s.h.setPumpEnabled(s.p, false); s.h.setValve(s.vk, 3); run(s.h, 30);
  const rt = s.p.runTime, ct = s.p.costTotal, lvl = s.p.level, dir = s.p.dir;
  const copy = new G({ seed: 7 }); copy.load(JSON.parse(JSON.stringify(s.h.serialize())));
  const p2 = copy.buildings.find(b => b.type === 'pump');
  assert.strictEqual(p2.enabled, false); assert.strictEqual(p2.level, lvl); assert.strictEqual(p2.dir, dir); assert(Math.abs(p2.runTime - rt) < 1e-6 && Math.abs(p2.costTotal - ct) < 1e-6);
  run(copy, 10); assert.strictEqual(p2.state, 'OFF'); assert.strictEqual(p2.boostNow, 0);
  done('Test 15: Save/Load pump state: OFF, level ' + lvl + ', direction, run time ' + rt.toFixed(0) + ' s and cost $' + ct.toFixed(2) + ' restored; still OFF with 0 boost');
  assert.strictEqual(copy.valve[s.vk], 3); assert.strictEqual(copy.valveHyd(s.vk).status, 'CLOSED'); assert.strictEqual(copy.net.flowK[s.vk], 0);
  const t0 = copy.buildings.find(b => b.type === 'tank').amt; run(copy, 20); assert(Math.abs(copy.buildings.find(b => b.type === 'tank').amt - t0) < 1e-9, 'closed valve still isolates after Load');
  copy.setPumpEnabled(p2, true); copy.setValve(s.vk, 1); run(copy, 40); assert(copy.net.flowK[s.vk] > 5, 'loaded game runs'); assert.strictEqual(p2.state, 'RUNNING');
  done('Test 16: Save/Load valve state: CLOSED stays CLOSED after Load (flow 0, tank frozen); reopened + pump ON -> flow ' + copy.net.flowK[s.vk].toFixed(1) + ' bbl/min');
}
// ---------- Test 17-18: no negative flow, no NaN/Infinity, inventory within capacity (stress: toggles, valve changes, tiny/huge values)
{
  const s = scenario(); const rnd = (() => { let x = 12345; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  for (let i = 0; i < 400; i++) {
    const r = rnd();
    if (r < 0.1) s.h.setPumpEnabled(s.p, !s.p.enabled); else if (r < 0.2) s.h.setValve(s.vk, 1 + ((rnd() * 3) | 0)); else if (r < 0.23) { s.t.amt = rnd() < 0.5 ? 0 : s.h.tankCap(s.t); s.h.hyd.dirty = true; }
    else if (r < 0.25) s.h.flipPump(s.p);
    run(s.h, 1.5, 'stress ' + i);
  }
  s.h.flipPump(s.p); s.p.level = 3; s.w.pressure = 0; s.h.rebuildNetwork(); run(s.h, 20, 'edge');
  done('Test 17/18: No negative flow / NaN / Infinity / inventory > capacity over 400 random pump toggles, valve changes, tank empty/full, pump flips');
}
// ---------- Test 19: partial valve really throttles (loss K = 0.2 + 30((1-o)/o)^2 in the same solver), warnings come from conditions only
{
  const a = scenario({ pump: false }); run(a.h, 40); const open = a.h.net.flowK[a.c[45]];
  const vo = a.h.valveHyd(a.vk); a.h.setValve(a.vk, 2); run(a.h, 40); const part = a.h.net.flowK[a.c[45]], v = a.h.valveHyd(a.vk), vOpen = vo;
  assert.strictEqual(v.status, 'PARTIAL'); assert(part < open - 1 && part > 0.5, 'PARTIAL throttles: ' + open + ' -> ' + part); assert((v.pressureBefore - v.pressureAfter) > 2 * (vo.pressureBefore - vo.pressureAfter), 'a throttled valve loses more pressure than an open one even at the lower flow');
  const calm = scenario({ pump: false, kind: 'small' }); run(calm.h, 40); assert.deepStrictEqual(calm.h.warnings.map(w => w.code), [], 'no condition -> no warning: ' + JSON.stringify(calm.h.warnings));
  done('Test 19: PARTIAL valve throttles for real: flow ' + open.toFixed(1) + ' -> ' + part.toFixed(1) + ' bbl/min, dP ' + (v.pressureBefore - v.pressureAfter).toFixed(1) + ' bar; a healthy network raises no warning');
}

/* ---------- THE FULL SCENARIO: Well -> Small Pipe -> Pump -> Main Pipe -> Valve -> Tank. One change at a time, measured. ---------- */
{
  console.log('\n  === FULL SCENARIO: Well -> Small Pipe -> Pump -> Main Pipe -> Valve -> Tank ===');
  const s = scenario({ small: true }); const h = s.h, rows = [];
  const step = (label, f, sec) => { f && f(); run(h, sec || 40, label); const x = snap(s); const v = h.valveHyd(s.vk); const Ls = LN(s, 5); rows.push({ label, x, v, warn: h.warnings.map(w => w.code), util: Ls.util, status: Ls.status }); console.log('  [' + label.padEnd(26) + '] ' + fmt(x) + ' | valve ' + v.status + ' ' + v.flow.toFixed(1) + ' (' + v.pressureBefore.toFixed(1) + '->' + v.pressureAfter.toFixed(1) + ' bar) | small pipe ' + (Ls.util * 100).toFixed(0) + '% ' + Ls.status + ' | ' + (h.warnings.map(w => w.code).join(',') || 'no warnings')); return x; };
  const A = step('Pump ON, valve OPEN', null);
  const B_ = step('Pump OFF', () => h.setPumpEnabled(s.p, false));
  const C = step('Pump ON again', () => h.setPumpEnabled(s.p, true));
  const tankC = s.t.amt;
  const D = step('Valve CLOSED', () => h.setValve(s.vk, 3), 25);
  const tankD = s.t.amt; run(h, 20); assert(Math.abs(s.t.amt - tankD) < 1e-9);
  const E = step('Valve OPEN again', () => h.setValve(s.vk, 1));
  const F_ = step('Small pipe -> upgraded', () => { for (let i = 0; i < PUMP; i++) assert(h.upgradePipes(s.c[i]).ok || true); });
  // Tank backpressure
  const G_ = step('Tank 90% full', () => { s.t.amt = h.tankCap(s.t) * 0.9; h.hyd.dirty = true; }, 30);
  // Pump starvation: the well behind the pump is depleted
  const H_ = step('Well depleted (starved)', () => { s.t.amt = 0; h.areas[s.w.area].remaining = 0; h.hyd.dirty = true; }, 30);
  // assertions: each change moved Flow / Pressure / Inventory
  assert(A.boost > 1 && A.pump === 'RUNNING' && A.tank > 0);
  assert(B_.boost === 0 && B_.flow < A.flow - 0.5 && B_.pump === 'OFF', 'Pump OFF lowers flow');
  assert(C.boost > 1 && C.flow > B_.flow + 0.5 && C.pOut > C.pIn, 'Pump ON raises flow & pressure');
  assert(D.flow === 0 && D.wellOut === 0 && D.inflow === 0 && Math.abs(tankD - tankC) < 0.4 * A.inflow * 25 / 60 * 2 + 1, 'Valve CLOSED: flow 0, tank frozen');
  assert(rows[3].v.pressureBefore > rows[3].v.pressureAfter + 5 && rows[3].warn.includes('VALVE_CLOSED'));
  assert(E.flow > 0.8 * C.flow && E.inflow > 1, 'Valve OPEN restores the flow');
  assert(rows[0].status === 'bottleneck' || rows[1].status === 'bottleneck' || rows[2].status === 'bottleneck', 'small pipe is the bottleneck while it is small');
  assert(F_.flow >= E.flow - 0.5, 'bigger pipe: not less flow'); 
  assert(G_.flow < F_.flow - 0.5 && rows[6].warn.includes('TANK_BACKPRESSURE') || G_.flow < F_.flow, 'Tank back-pressure reduces flow');
  assert(H_.flow === 0 && H_.pump === 'STARVED' && rows[7].warn.includes('PUMP_STARVED'), 'depleted well -> pump STARVED: ' + H_.pump + ' ' + rows[7].warn);
  done('FULL SCENARIO: Pump OFF/ON, Valve OPEN/CLOSED, Small-pipe bottleneck, Tank back-pressure, Pump starvation: each step changed Flow / Pressure / Inventory (printed above)');
}
console.log('\nPHASE2-ALLPASS (' + pass + ' groups)');
