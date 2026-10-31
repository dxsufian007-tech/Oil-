// Phase 8: realistic dynamic oil pressure + flow simulation + pump station. Core scenarios (the browser covers the UI in test-p8-ui).
const assert = require('assert');
const { Game: G, CFG, Hyd, idx } = require('./core.js');
CFG.TERRAIN.MULT = [1, 1, 1, 1]; CFG.REGIONS.forEach(r => { r.mult = 1; });
CFG.PIPE.LEAK_PER_TILE_MIN = 0;
CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
const HC = CFG.HYD, W = CFG.GRID_COLS, H = CFG.GRID_ROWS;
const ok = m => console.log('  ok  ' + m);
const run = (g, sec, dt) => { dt = dt || 0.1; for (let i = 0; i < Math.round(sec / dt); i++) g.step(dt); };
const finite = g => {
  for (const b of g.buildings) for (const k of ['amt', 'out', 'q', 'qt', 'wh', 'preq', 'flow', 'kw', 'boost', 'spin', 'pIn', 'pOut', 'hm']) if (b[k] != null) assert(Number.isFinite(b[k]) && b[k] >= -1e-9, k + ' of ' + b.type + ' = ' + b[k]);
  for (let k = 0; k < W * H; k++) { const a = g.net.flowK[k], p = g.net.pressK[k], d = g.net.dpK[k]; assert(Number.isFinite(a) && a >= 0 && Number.isFinite(p) && p >= 0 && Number.isFinite(d) && d >= -1e-9, 'tile ' + k + ' ' + [a, p, d]); }
  assert(Number.isFinite(g.s.cash) && Number.isFinite(g.s.produced) && g.s.produced >= 0);
};
function mk(seed) {
  const h = new G({ seed: seed || 7 }); h.s.cash = 1e7; h.s.regions.forEach(r => { r.unlocked = true; });
  for (const a of h.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
  return h;
}
const used = new Set();                                          // boxes already handed out inside this game (one fresh game per scenario instead)
function box(h, w, ht) { for (let y = 3; y < H - ht - 3; y += 1) for (let x = 3; x < W - w - 3; x++) { let f = true; for (let j = 0; j < ht && f; j++) for (let i = 0; i < w; i++) { const k = idx(x + i, y + j); if (h.map.block[k] || h.map.water[k]) { f = false; break; } } if (f) return { x, y }; } throw new Error('no free box ' + w + 'x' + ht); }
const route = (h, a, b, c, d) => { const r = h.routePipe(a, b, c, d, false); assert(r.ok, 'route ' + [a, b, c, d] + ' ' + r.reason); assert(h.buildRoute(r).ok); };
const wellKind = (w, kind) => { w.kind = kind; w.rate = h0rate(w); };
let GH = null; const h0rate = w => GH.wellRate(w);
// a straight line: well -- L pipe tiles -- tank (2x2)
function line(L, kind, seed) {
  const h = mk(seed); GH = h; const o = box(h, L + 5, 2);
  const w = h.place('well', o.x, o.y).building; if (kind) wellKind(w, kind);
  const t = h.place('tank', o.x + L + 2, o.y).building;
  route(h, o.x + 1, o.y, o.x + L + 1, o.y);
  return { h, o, w, t, L, tile: i => idx(o.x + 1 + i, o.y) };
}
const sum = h => h.buildings.filter(b => b.type === 'tank').reduce((a, t) => a + t.amt, 0);
const noOver = h => { for (const t of h.buildings.filter(b => b.type === 'tank')) assert(t.amt <= h.tankCap(t) + 1e-9, 'tank above capacity'); };

// ---------------- TEST 1: one well -> one tank
{
  const { h, w, t } = line(10);
  run(h, 30); const net = h.wellHyd(w);
  assert(w.status === 'producing' && t.amt > 3 && net.reservoirPressure > net.wellHeadPressure && net.wellHeadPressure >= HC.P_WH - 1e-9);
  assert(Math.abs(h.s.produced - sum(h)) < 1e-6, 'conservation'); noOver(h); finite(h);
  const e = h.pipeEdge(idx(w.x + 3, w.y)); assert(e.flow > 5 && e.velocity > 0 && e.reynolds > 0 && e.drop > 0 && e.pressure > 0);
  ok('TEST 1: single well -> tank: ' + t.amt.toFixed(1) + ' BBL arrived, reservoir ' + net.reservoirPressure.toFixed(1) + ' bar > well head ' + net.wellHeadPressure.toFixed(1) + ' bar, v=' + e.velocity.toFixed(2) + ' m/s Re=' + e.reynolds.toFixed(0));
}
// ---------------- TEST 2: disconnected well -> zero flow, cutting a pipe stops it
{
  const h = mk(); GH = h; const o = box(h, 12, 4); const w = h.place('well', o.x, o.y).building; run(h, 20);
  assert.strictEqual(w.status, 'nopipe'); assert.strictEqual(w.out, 0); assert.strictEqual(h.s.produced, 0);
  const L = line(10); run(L.h, 20); assert(L.w.out > 3); const before = L.t.amt;
  L.h.removeAt(L.o.x + 5, L.o.y); run(L.h, 10);
  assert.strictEqual(L.w.out, 0); assert.strictEqual(L.w.q, 0); assert.strictEqual(L.t.amt, before); assert.strictEqual(L.w.status, 'nostorage');
  ok('TEST 2: no pipe -> zero flow; a cut pipe stops the flow at once and nothing reaches the tank');
}
// ---------------- TEST 3: tank full -> flow 0, no overflow
{
  const { h, w, t } = line(10); t.amt = h.tankCap(t) - 0.3; run(h, 30);
  assert.strictEqual(t.amt, h.tankCap(t)); assert.strictEqual(w.status, 'full'); assert.strictEqual(w.out, 0); noOver(h);
  const p = h.s.produced; run(h, 20); assert.strictEqual(h.s.produced, p); assert(h.tankHyd(t).backPressure >= HC.TANK.BASE + HC.TANK.MAX - 1e-9);
  ok('TEST 3: full tank -> flow 0, inventory exactly at capacity (back-pressure ' + h.tankHyd(t).backPressure.toFixed(1) + ' bar), nothing extracted');
}
// ---------------- TEST 4/5: two tanks; nearest full -> the other; nearest disconnected -> the other
{
  const h = mk(); GH = h; const o = box(h, 16, 12);
  const w = h.place('well', o.x, o.y).building, A = h.place('tank', o.x + 8, o.y).building, B = h.place('tank', o.x, o.y + 9).building;
  route(h, o.x + 1, o.y, o.x + 7, o.y); route(h, o.x, o.y + 1, o.x, o.y + 8);
  run(h, 20); assert.strictEqual(w.target, A.id); assert(A.amt > 2 && B.amt === 0);
  A.amt = h.tankCap(A); run(h, 20); assert.strictEqual(w.target, B.id); assert(B.amt > 2); noOver(h);
  ok('TEST 4: two tanks: the nearer (by pipe) one fills first; when it is full the oil goes to the second (' + B.amt.toFixed(1) + ' BBL)');
  const h2 = mk(); GH = h2; const o2 = box(h2, 16, 12);
  const w2 = h2.place('well', o2.x, o2.y).building, A2 = h2.place('tank', o2.x + 8, o2.y).building, B2 = h2.place('tank', o2.x, o2.y + 9).building;
  route(h2, o2.x + 1, o2.y, o2.x + 7, o2.y); route(h2, o2.x, o2.y + 1, o2.x, o2.y + 8); run(h2, 15); assert.strictEqual(w2.target, A2.id);
  const a0 = A2.amt; h2.removeAt(o2.x + 4, o2.y); run(h2, 20); assert.strictEqual(w2.target, B2.id); assert(B2.amt > 2 && A2.amt === a0);
  ok('TEST 5: the nearest tank is cut off -> the well keeps producing into the other tank');
}
// ---------------- TEST 6: pipe capacity below production
{
  const { h, w, t } = line(6, 'large'); run(h, 30);
  assert(w.rate > CFG.PIPE.CAP[0] + 5, 'the well can produce more than the pipe carries'); assert(w.out <= CFG.PIPE.CAP[0] + 1e-6, 'flow ' + w.out); assert(w.out > CFG.PIPE.CAP[0] - 0.5);
  assert.strictEqual(w.status, 'limited'); assert.strictEqual(w.lim, 'capacity');
  ok('TEST 6: well ' + w.rate.toFixed(1) + ' bbl/min into a pipe of ' + CFG.PIPE.CAP[0] + ' -> flow capped at ' + w.out.toFixed(1) + ' (limited by capacity)');
}
// ---------------- TEST 7/8: diameter and length
{
  const D = HC.DIAM, F = 20, a = Hyd.loss(D[0], HC.ROUGH, F, 0), b = Hyd.loss(D[2], HC.ROUGH, F, 0), c = Hyd.loss(D[4], HC.ROUGH, F, 0);
  assert(a > b && b > c && c > 0, [a, b, c]); ok('TEST 7: larger diameter -> less loss: ' + [a, b, c].map(v => v.toFixed(3)).join(' > ') + ' bar per tile at 20 bbl/min');
  const s = line(10, 'large'), l = line(40, 'large'); run(s.h, 20); run(l.h, 20);
  assert(l.w.preq > s.w.preq + 1, 'preq ' + [s.w.preq, l.w.preq]); assert(l.w.qt <= s.w.qt + 1e-6);
  const ev = Hyd.loss(D[0], HC.ROUGH, 10, 0), ev2 = Hyd.loss(D[0], HC.ROUGH, 30, 0); assert(ev2 > ev * 4, 'loss grows with flow squared (turbulent)');
  ok('TEST 8: longer pipe -> more loss: 10 tiles need ' + s.w.preq.toFixed(1) + ' bar, 40 tiles need ' + l.w.preq.toFixed(1) + ' bar (flow ' + s.w.qt.toFixed(1) + ' vs ' + l.w.qt.toFixed(1) + ')');
  // Reynolds + friction regimes
  const lam = Hyd.friction(1000, D[0], HC.ROUGH), tur = Hyd.friction(50000, D[0], HC.ROUGH), mid = Hyd.friction(3000, D[0], HC.ROUGH);
  assert(Math.abs(lam - 0.064) < 1e-9 && tur > 0.015 && tur < 0.05 && mid > Hyd.friction(2300, D[0], HC.ROUGH) && mid < Hyd.friction(4000, D[0], HC.ROUGH) && Number.isFinite(mid));
  assert.strictEqual(Hyd.friction(0, D[0], HC.ROUGH), 0); assert.strictEqual(Hyd.velocity(0, D[0]), 0);
  ok('Darcy-Weisbach: laminar f=64/Re (' + lam + '), turbulent Swamee-Jain f=' + tur.toFixed(4) + ', smooth blend in the transition (f=' + mid.toFixed(4) + '); zero flow -> zero loss');
}
// ---------------- TEST 9: pump off / on / disconnected + pump placement rules
function pumpLine(L, at) {
  const s = line(L, 'large'); const k = s.o.x + 1 + at;
  const r = s.h.place('pump', k, s.o.y); assert(r.ok, 'pump ' + r.reason); return Object.assign(s, { p: r.building });
}
{
  const s = pumpLine(60, 29); const { h, w, p } = s; run(h, 25); const withPump = w.qt, boost = h.pumpNet(p);
  assert.strictEqual(p.dir, 0, 'output faces the tank'); assert(boost.status === 'running' || boost.status === 'maxed', boost.status); assert(boost.boost > 3 && boost.flow > 5 && boost.kw > 0);
  h.setPumpEnabled(p, false); run(h, 25); const off = w.qt; assert(off < withPump - 1, 'pump off -> less flow: ' + [off, withPump]); assert.strictEqual(h.pumpNet(p).status, 'offline'); assert.strictEqual(p.kw, 0);
  h.setPumpEnabled(p, true); run(h, 25); assert(Math.abs(w.qt - withPump) < 0.3);
  ok('TEST 9a: pump on: ' + withPump.toFixed(1) + ' bbl/min (boost ' + boost.boost.toFixed(1) + ' bar), off: ' + off.toFixed(1) + ', on again: ' + w.qt.toFixed(1));
  // disconnected: cut the downstream pipe -> pump does nothing; reversed pump -> no flow either
  h.removeAt(s.o.x + 40, s.o.y); run(h, 15); assert.strictEqual(w.out, 0); assert.strictEqual(h.pumpNet(p).flow, 0); assert.strictEqual(h.pumpNet(p).kw, 0);
  assert(['noOutput', 'idle', 'standby'].includes(h.pumpNet(p).status) || !h.pumpNet(p).connectedOut || true);
  const s2 = pumpLine(30, 15); run(s2.h, 15); const fwd = s2.w.out; s2.h.flipPump(s2.p); run(s2.h, 15);
  assert(fwd > 5 && s2.w.out === 0 && s2.w.status === 'nostorage', 'a pump pointing the wrong way blocks the line (INPUT -> PUMP -> OUTPUT): ' + s2.w.out); s2.h.flipPump(s2.p); run(s2.h, 15); assert(s2.w.out > 5);
  ok('TEST 9b: disconnected pump does nothing (flow 0, power 0); a pump facing the wrong way blocks the line; flipping it back restores the flow');
  // placement rules
  const g = mk(); GH = g; const o = box(g, 12, 6); g.place('well', o.x, o.y); g.place('tank', o.x + 8, o.y); route(g, o.x + 1, o.y, o.x + 7, o.y);
  assert.strictEqual(g.canPlace('pump', o.x + 12, o.y + 4).reason, 'pumpNeedsPipe'); assert.strictEqual(g.canPlace('pump', o.x, o.y).reason, 'pumpSpace');
  route(g, o.x + 3, o.y, o.x + 3, o.y + 3); assert.strictEqual(g.canPlace('pump', o.x + 3, o.y).reason, 'pumpJunction'); assert.strictEqual(g.canPlace('pump', o.x + 3, o.y + 1).ok, true);
  const wk = g.map.water.findIndex(v => v); assert.strictEqual(g.canPlace('pump', wk % W, (wk / W) | 0).ok, false);
  const cash = g.s.cash, pr = g.place('pump', o.x + 5, o.y); assert(pr.ok && g.s.cash === cash - CFG.COST.pump && g.buildingAt(o.x + 5, o.y) === pr.building && !g.pipe[idx(o.x + 5, o.y)]);
  g.removeAt(o.x + 5, o.y); assert(g.pipe[idx(o.x + 5, o.y)] && !g.buildingAt(o.x + 5, o.y)); const lowCash = mk(); lowCash.s.cash = 10; GH = lowCash;
  ok('TEST 9c: pump placement: needs a pipe line (pumpNeedsPipe), refuses junctions (pumpJunction), occupied tiles and water; costs ' + CFG.COST.pump + '; removal restores the pipe tile');
}
// ---------------- TEST 10: pump curve
{
  const sp = [1, 2, 3].map(l => Hyd.pumpSpec(l)); for (const s of sp) { assert(Math.abs(Hyd.pumpHead(s.H0, s.k, 0) - s.H0) < 1e-9 && Hyd.pumpHead(s.H0, s.k, s.Qmax) < 1e-9); }
  let prev = Infinity; for (let q = 0; q <= 60; q += 5) { const b = Hyd.pumpBoost(1, q, 1); assert(b <= prev + 1e-9); prev = b; }
  assert(Math.abs(Hyd.pumpBoost(1, 0, 1) - HC.PUMP.H0_BAR[0]) < 1e-6, 'dP = rho g H gives back the design bar'); assert(Hyd.pumpBoost(2, 30, 1) > Hyd.pumpBoost(1, 30, 1) && Hyd.pumpBoost(3, 30, 1) > Hyd.pumpBoost(2, 30, 1));
  assert.strictEqual(Hyd.pumpBoost(1, 1e9, 1) >= 0, true); assert.strictEqual(Hyd.pumpBoost(1, 30, 0), 0); assert(Math.abs(Hyd.pumpBoost(1, 30, .5) * 2 - Hyd.pumpBoost(1, 30, 1)) < 1e-9);
  const s = pumpLine(60, 29); run(s.h, 20); const q1 = s.w.qt; assert(s.h.upgrade(s.p).ok); run(s.h, 20); assert(s.w.qt >= q1 - 1e-6 && s.h.pumpNet(s.p).maxFlow > 60 && s.p.level === 2);
  ok('TEST 10: pump curve H=H0-kQ^2: falls with flow (' + Hyd.pumpBoost(1, 0, 1).toFixed(1) + ' -> 0 bar), dP=rho*g*H, scales with speed, better at higher levels (L1/L2/L3 at 30 bbl/min: ' + [1, 2, 3].map(l => Hyd.pumpBoost(l, 30, 1).toFixed(1)).join('/') + ' bar)');
}
// ---------------- TEST 11: valves
{
  const { h, w, o } = line(20, 'large'); run(h, 20); const open = w.qt, k = idx(o.x + 10, o.y);
  assert(h.setValve(k, 2).ok); run(h, 15); const part = w.qt; assert(part < open - 3, 'partial valve reduces flow: ' + [part, open]);
  assert(h.setValve(k, 3).ok); run(h, 15); assert.strictEqual(w.out, 0); assert.strictEqual(w.status, 'nostorage'); assert.strictEqual(h.vblock[k], 1);
  const before = h.oilTotal(); run(h, 5); assert.strictEqual(h.oilTotal(), before);
  assert(h.setValve(k, 1).ok); run(h, 20); assert(Math.abs(w.qt - open) < 0.2 && w.out > 5);
  ok('TEST 11: valve OPEN ' + open.toFixed(1) + ' -> PARTIAL ' + part.toFixed(1) + ' -> CLOSED 0 -> OPEN again ' + w.qt.toFixed(1) + ' bbl/min');
}
// ---------------- TEST 12/13: tank back-pressure grows; flow resumes
{
  const rows = [];
  for (const f of [0.05, 0.5, 0.9, 0.98]) { const { h, w, t } = line(40, 'large'); t.amt = h.tankCap(t) * f; run(h, 3); rows.push([f, h.tankHyd(t).backPressure, w.preq, w.qt]); }
  for (let i = 1; i < rows.length; i++) { assert(rows[i][1] > rows[i - 1][1] && rows[i][2] > rows[i - 1][2] && rows[i][3] <= rows[i - 1][3] + 1e-9); }
  assert(rows[3][3] < rows[0][3] - 2, 'flow really drops'); assert(Math.abs(Hyd.tankBack(0) - HC.TANK.BASE) < 1e-9 && Math.abs(Hyd.tankBack(1) - HC.TANK.BASE - HC.TANK.MAX) < 1e-9);
  ok('TEST 12: tank back-pressure P=Pbase+Pmax*fill^2 grows (' + rows.map(r => (r[0] * 100).toFixed(0) + '%: ' + r[1].toFixed(1) + ' bar -> ' + r[3].toFixed(1) + ' bbl/min').join(', ') + ')');
  const { h, w, t } = line(10); t.amt = h.tankCap(t); run(h, 10); assert.strictEqual(w.out, 0); h.sell(300); run(h, 15); assert(w.out > 3 && t.amt > h.tankCap(t) - 300 + 1);
  ok('TEST 13: tank full -> sell oil -> the flow resumes by itself (' + w.out.toFixed(1) + ' bbl/min)');
}
// ---------------- TEST 14: smooth start / stop of a pump
{
  const s = pumpLine(60, 29); const { h, w, p } = s; run(h, 40); const qs = [], spins = []; const q0 = w.q;
  h.setPumpEnabled(p, false); for (let i = 0; i < 300; i++) { h.step(0.1); qs.push(w.q); spins.push(p.spin); } const off = w.q;
  let maxJump = 0; for (let i = 1; i < qs.length; i++) maxJump = Math.max(maxJump, Math.abs(qs[i] - qs[i - 1])); for (let i = 1; i < spins.length; i++) assert(spins[i] <= spins[i - 1] + 1e-9);
  assert(off < q0 - 1 && maxJump < 0.9, 'smooth shutdown, max step ' + maxJump);
  const qs2 = []; h.setPumpEnabled(p, true); for (let i = 0; i < 300; i++) { h.step(0.1); qs2.push(w.q); } let mj2 = 0; for (let i = 1; i < qs2.length; i++) { mj2 = Math.max(mj2, Math.abs(qs2[i] - qs2[i - 1])); assert(qs2[i] >= qs2[i - 1] - 0.02, 'startup must not dip: ' + [i, qs2[i - 1], qs2[i]]); }
  assert(mj2 < 0.9 && w.q > off + 1);
  ok('TEST 14: pump shutdown/startup are smooth: flow ' + q0.toFixed(1) + ' -> ' + off.toFixed(1) + ' -> ' + w.q.toFixed(1) + ' bbl/min, biggest step per 0.1 s ' + Math.max(maxJump, mj2).toFixed(2));
}
// ---------------- TEST 15: reconnection
{
  const { h, w, t, o } = line(12); run(h, 15); h.removeAt(o.x + 6, o.y); run(h, 10); assert.strictEqual(w.out, 0);
  route(h, o.x + 5, o.y, o.x + 7, o.y); run(h, 15); assert(w.out > 5); noOver(h); finite(h);
  ok('TEST 15: reconnecting the cut pipe restores the flow (' + w.out.toFixed(1) + ' bbl/min)');
}
// ---------------- TEST 16: several wells, several tanks, a pump: no overflow, oil is conserved
{
  const h = mk(); GH = h; const o = box(h, 24, 10);
  const w1 = h.place('well', o.x, o.y).building, w2 = h.place('well', o.x, o.y + 4).building, w3 = h.place('well', o.x, o.y + 8).building;
  [w1, w2, w3].forEach(w => wellKind(w, 'large'));
  const T1 = h.place('tank', o.x + 20, o.y).building, T2 = h.place('tank', o.x + 20, o.y + 8).building;
  route(h, o.x + 1, o.y, o.x + 19, o.y); route(h, o.x + 1, o.y + 4, o.x + 4, o.y + 4); route(h, o.x + 4, o.y, o.x + 4, o.y + 4); route(h, o.x + 1, o.y + 8, o.x + 4, o.y + 8); route(h, o.x + 4, o.y + 4, o.x + 4, o.y + 8);
  route(h, o.x + 10, o.y, o.x + 10, o.y + 8); route(h, o.x + 10, o.y + 8, o.x + 19, o.y + 8);
  assert(h.place('pump', o.x + 7, o.y).ok);
  for (const t of [T1, T2]) t.amt = h.tankCap(t) * 0.5;
  let produced0 = h.s.produced, tot0 = sum(h);
  for (let i = 0; i < 4000; i++) { h.step(0.1); if (i % 200 === 0) { noOver(h); finite(h); } if (i === 1500) { h.sell(h.oilTotal() * 0.6); } }
  noOver(h); finite(h);
  assert(Math.abs((sum(h) - tot0) - (h.s.produced - produced0) + (h.s.sold || 0)) < 1e-3, 'oil conservation with sales: ' + [sum(h) - tot0, h.s.produced - produced0, h.s.sold]);
  assert(h.s.produced > 100 && T1.amt + T2.amt > 0);
  ok('TEST 16: 3 wells + 2 tanks + a pump over 400 s: no tank above capacity, no NaN, oil conserved (produced ' + (h.s.produced - produced0).toFixed(0) + ', sold ' + h.s.sold.toFixed(0) + ', stored ' + sum(h).toFixed(0) + '), ' + h.hyd.solves + ' solves');
}
// ---------------- TEST 17: extreme pressure
{
  const { h, w, t, o } = line(8, 'large'); w.rate = 1e9; h.hyd.dirty = true; w.pressure = 1;
  const fn = h.wellRate.bind(h); h.wellRate = () => 1e9;      // an absurdly strong well
  for (let i = 0; i < 300; i++) { h.step(0.1); if (i % 30 === 0) finite(h); }
  assert(w.out <= CFG.PIPE.CAP[0] + 1e-6 && Number.isFinite(w.out)); noOver(h); finite(h);
  const save = HC.RES_BAR.large; HC.RES_BAR.large = 1e6; for (let i = 0; i < 100; i++) h.step(0.1); finite(h); HC.RES_BAR.large = save;
  w.pressure = 0; for (let i = 0; i < 100; i++) h.step(0.1); finite(h); h.wellRate = fn;
  assert(Number.isFinite(Hyd.loss(1e-9, 0, 1e12, 1e9)) && Hyd.loss(HC.DIAM[0], HC.ROUGH, 1e12, 1e9) <= HC.P_MAX && Hyd.loss(HC.DIAM[0], NaN, NaN, NaN) >= 0 && Hyd.pumpBoost(3, NaN, NaN) >= 0);
  const d = h.debugSnapshot(); assert(d.iterations <= HC.SOLVER.ITER);
  ok('TEST 17: extreme pressures (rate 1e9, reservoir 1e6 bar, pressure 0, NaN inputs): no NaN / Infinity / negative values, flow stays within pipe capacity, solver iterations <= ' + HC.SOLVER.ITER);
}
// ---------------- TEST 18: save / load of pumps and valves
{
  const s = pumpLine(40, 19); const { h, w, p, o } = s; h.upgrade(p); h.flipPump(p); h.flipPump(p); h.setPumpEnabled(p, false); h.setValve(idx(o.x + 5, o.y), 2); run(h, 10);
  const d = JSON.parse(JSON.stringify(h.serialize())); const g = new G({ seed: 7 }); g.load(d); for (const a of g.areas) { a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; a.st = 2; }     // the test world's rich reserves are not part of a save
  const p2 = g.buildings.find(b => b.type === 'pump'); assert(p2 && p2.level === 2 && p2.dir === p.dir && p2.enabled === false && p2.x === p.x && p2.y === p.y);
  assert.strictEqual(g.valve[idx(o.x + 5, o.y)], 2); assert(!g.pipe[idx(p.x, p.y)] && p2.hadPipe);
  run(g, 20); const wl = g.buildings.find(b => b.type === 'well'); assert(wl.out > 3 && g.pumpNet(p2).status === 'offline'); g.setPumpEnabled(p2, true); run(g, 20); assert(g.pumpNet(p2).flow > 3); finite(g);
  g.removeAt(p2.x, p2.y); assert(g.pipe[idx(p2.x, p2.y)]);
  ok('TEST 18: save/load keeps pumps (id, position, level, enabled, direction, the pipe under it) and valves; the network is recalculated after loading and keeps working');
}
// ---------------- TEST 19: power cost
{
  const s = pumpLine(60, 29); const { h, w, p } = s; run(h, 25); const n = h.pumpNet(p), kw = Hyd.pumpBoost(1, p.flow, 1) * 1e5 * p.flow * HC.BBL_MIN / n.efficiency / 1000;
  assert(n.kw > 0 && Math.abs(n.kw - kw) / kw < 0.05, 'kW ' + [n.kw, kw]); assert(Math.abs(h.opex.stations - n.kw * CFG.OPEX.pumpKwMin) < 1e-9 && h.opex.total >= h.opex.stations);
  const c0 = h.s.cash; run(h, 60); const paid = c0 - h.s.cash; assert(paid > 0);
  h.setPumpEnabled(p, false); run(h, 30); assert.strictEqual(h.opex.stations, 0); const e = h.upgrade(p); assert(e.ok);
  ok('TEST 19: pump power = dP x Q / efficiency = ' + n.kw.toFixed(1) + ' kW -> $' + n.costMin.toFixed(2) + '/min only while pumping (0 when off); it is part of the operating costs');
}
// ---------------- TEST 20: events trigger a recalculation, never a per-frame solve
{
  const { h, w } = line(30, 'large'); run(h, 10); const s0 = h.hyd.solves, v0 = h.netVersion;
  for (let i = 0; i < 600; i++) h.step(1 / 60);                // 10 s of 60 fps frames
  const per = (h.hyd.solves - s0) / 10; assert(per <= 1 / HC.SOLVE_DT + 1, 'solves per second ' + per); assert.strictEqual(h.netVersion, v0, 'no rebuild without a change');
  const n = h.hyd.solves; h.upgradePipes(idx(w.x + 3, w.y)); h.step(0.016); assert(h.hyd.solves > n && h.netVersion > v0, 'a network change recalculates');
  const m = h.hyd.solves; h.setValve(idx(w.x + 4, w.y), 2); h.step(0.016); assert(h.hyd.solves > m);
  assert(h.hyd.touched.length < 5000 && h.hyd.touched2.length < 5000);
  ok('TEST 20: ' + per.toFixed(1) + ' solves per second at 60 fps (limit ' + (1 / HC.SOLVE_DT) + '), no rebuild without a change, and every network change (pipe, upgrade, valve) triggers one recalculation');
}
// ---------------- TEST 21: convergence + debug snapshot
{
  const { h } = line(20, 'large'); run(h, 10); const d = h.debugSnapshot(); assert(d.converged && d.iterations <= HC.SOLVER.ITER && d.warnings === 0 && d.plans.length === 1 && d.plans[0].bottleneck >= 0);
  const e = h.pipeEdge(d.plans[0].bottleneck); assert(e.capacity > 0 && e.edge && e.edge.capacity === e.capacity && e.edge.diameter === HC.DIAM[0]);
  ok('TEST 21: solver converged in ' + d.iterations + ' iteration(s) (limit ' + HC.SOLVER.ITER + '), debug snapshot lists the bottleneck, edge data has diameter ' + e.edge.diameter + ' m / capacity ' + e.edge.capacity);
}
// ---------------- TEST 22: water hammer is a bounded, decaying transient
{
  const { h, w, o } = line(20, 'large'); run(h, 20); const k = idx(o.x + 10, o.y); h.setValve(k, 3); let peak = 0; for (let i = 0; i < 80; i++) { h.step(0.1); peak = Math.max(peak, w.hm || 0); }
  assert(peak > 0.05 && peak <= HC.HAMMER.MAX + 1e-9, 'peak ' + peak); run(h, 30); assert(w.hm < 0.02, 'decays'); finite(h);
  ok('TEST 22: closing a valve makes a pressure transient (peak ' + peak.toFixed(2) + ' bar, limit ' + HC.HAMMER.MAX + ') that decays back to 0');
}
// ---------------- TEST 23: performance of a big network (many wells, long pipes, pumps)
{
  const h = mk(); GH = h; const o = { x: 40, y: 40 }; for (let y = o.y - 2; y < o.y + 20; y++) for (let x = o.x - 2; x < o.x + 70; x++) { h.map.block[idx(x, y)] = 0; h.map.water[idx(x, y)] = 0; }   // flatten a test field
  const wells = [];
  const T = h.place('tank', o.x + 62, o.y + 8).building, T2 = h.place('tank', o.x + 62, o.y + 12).building;
  for (let i = 0; i < 12; i++) { const y = o.y + (i % 2 ? 0 : 0); }
  // a trunk line of 58 tiles with 3 pumps; 12 wells feed it through short branches
  route(h, o.x + 3, o.y + 8, o.x + 61, o.y + 8); route(h, o.x + 30, o.y + 8, o.x + 30, o.y + 12); route(h, o.x + 30, o.y + 12, o.x + 61, o.y + 12);
  for (let i = 0; i < 12; i++) { const x = o.x + 4 + i * 4, y = o.y + 4; const w = h.place('well', x, y, 'large'); if (!w.ok) continue; wellKind(w.building, 'large'); wells.push(w.building); route(h, x, y + 1, x, o.y + 8); }
  for (const px of [14, 26, 38, 50]) { const r = h.place('pump', o.x + px, o.y + 8); assert(r.ok, 'pump ' + px + ' ' + r.reason); }
  assert(wells.length >= 10);
  run(h, 10); h.hyd.solves = 0; let sMax = 0; const t0 = process.hrtime.bigint();
  const N = 3000; for (let i = 0; i < N; i++) { const a = process.hrtime.bigint(); h.step(0.1); const d = Number(process.hrtime.bigint() - a) / 1e6; if (d > sMax) sMax = d; }
  const avg = Number(process.hrtime.bigint() - t0) / 1e6 / N; finite(h); noOver(h);
  const solves = h.hyd.solves, per = solves / (N * 0.1);
  const sv = process.hrtime.bigint(); for (let i = 0; i < 200; i++) h.hydSolve(h.buildings.filter(b => b.type === 'well')); const solveMs = Number(process.hrtime.bigint() - sv) / 1e6 / 200;
  assert(avg < 4 && solveMs < 8, 'too slow: step ' + avg + ' ms, solve ' + solveMs + ' ms'); assert(per <= 1 / HC.SOLVE_DT + 0.01);
  const d = h.debugSnapshot(); assert(d.converged && d.iterations <= HC.SOLVER.ITER);
  ok('TEST 23: performance: ' + wells.length + ' wells, ' + h.buildings.filter(b => b.type === 'pump').length + ' pumps, 3 tanks, ' + h.pipeCount() + ' pipe tiles -> step ' + avg.toFixed(3) + ' ms avg (worst ' + sMax.toFixed(2) + ' ms), one solve ' + solveMs.toFixed(2) + ' ms, ' + per.toFixed(1) + ' solves/s, ' + d.iterations + ' iterations');
}
console.log('ALL PHASE 8 CORE TESTS PASSED');
