// Phase 2 final verification: explicit limit / OFF / valve-position / save-load checks on the full scenario (no new features).
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
const sp = Hyd.pumpSpec(1);
// 1. pump under high load: three wells feed the pump input; flow through the pump <= Qmax, boost <= H0 bar, nothing negative / NaN
{
  const s = scenario({ small: false }); for (const [x, y] of [[15, 42], [15, 38]]) { const w2 = s.h.place('well', x, y, 'large'); if (w2.ok) { const r = s.h.routeNodes(B(w2.building), B(s.t), 1); if (r.ok) s.h.buildLine(r); } }
  let maxQ = 0, maxB = 0; for (let i = 0; i < 600; i++) { s.h.step(0.1); safe(s.h, 'load'); const ph = s.h.pumpHyd(s.p); maxQ = Math.max(maxQ, ph.flow); maxB = Math.max(maxB, ph.boost); }
  assert(maxQ <= sp.Qmax * 1.001, 'pump flow ' + maxQ + ' > Qmax ' + sp.Qmax); assert(maxB <= sp.bar0 + 1e-9, 'boost ' + maxB + ' > ' + sp.bar0);
  done('High load: max pump flow ' + maxQ.toFixed(1) + ' <= Qmax ' + sp.Qmax + ' bbl/min; max boost ' + maxB.toFixed(2) + ' <= H0 ' + sp.bar0 + ' bar; no NaN / negative');
}
// 2. pump OFF: boost exactly 0; ON: boost > 0 and flow/pressure differ (measured)
{
  const s = scenario({ valve: false }); run(s.h, 40); const on = snap(s); s.h.setPumpEnabled(s.p, false); run(s.h, 40); const off = snap(s);
  assert.strictEqual(off.boost, 0); assert.strictEqual(s.h.pumpHyd(s.p).boost, 0); assert(on.boost > 0.5 && on.pOut > off.pOut - 1e-9 || on.flow !== off.flow, 'ON differs from OFF');
  done('Pump OFF boost 0 (flow ' + off.flow.toFixed(1) + ', out ' + off.pOut.toFixed(1) + ' bar); ON boost ' + on.boost.toFixed(2) + ' (flow ' + on.flow.toFixed(1) + ', out ' + on.pOut.toFixed(1) + ')');
}
// 3. valve OPEN / PARTIAL / CLOSED order: flow after the valve falls, pressure before it rises, closed = exactly 0 and flow after = 0
{
  const s = scenario(); const R = {}; for (const [n, st] of [['OPEN', 1], ['PARTIAL', 2], ['CLOSED', 3]]) { s.h.setValve(s.vk, st); run(s.h, 60); const v = s.h.valveHyd(s.vk); R[n] = { f: s.h.net.flowK[s.c[VALVE + 5]], before: v.pressureBefore, after: v.pressureAfter, vf: v.flow }; }
  assert(R.OPEN.f > R.PARTIAL.f + 0.5 && R.PARTIAL.f > 0 && R.CLOSED.f === 0 && R.CLOSED.vf === 0, JSON.stringify(R));
  assert(R.CLOSED.before > R.OPEN.before - 1e-9 && R.CLOSED.after < R.CLOSED.before, JSON.stringify(R));
  done('Valve OPEN ' + R.OPEN.f.toFixed(1) + ' > PARTIAL ' + R.PARTIAL.f.toFixed(1) + ' > CLOSED 0 bbl/min; pressure before: ' + ['OPEN', 'PARTIAL', 'CLOSED'].map(n => R[n].before.toFixed(1)).join(' / ') + ' bar');
}
// 4. Save/Load mid-run keeps pump + valve state and the simulation continues identically-valid
{
  const s = scenario(); run(s.h, 30); s.h.setValve(s.vk, 2); s.h.setPumpEnabled(s.p, false); run(s.h, 20);
  const c = new G({ seed: 7 }); c.load(JSON.parse(JSON.stringify(s.h.serialize()))); const p2 = c.buildings.find(b => b.type === 'pump');
  assert.strictEqual(c.valve[s.vk], 2); assert.strictEqual(p2.enabled, false); run(c, 20, 'loaded');
  done('Save/Load: valve PARTIAL and pump OFF restored, simulation valid after load');
}
console.log('\nPHASE2-FINAL-ALLPASS (' + pass + ' groups)');
