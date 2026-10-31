// Professional Oil Simulation v1 (Phase 1): network graph, well pressure, pipe hydraulics, tank back-pressure, real flow, bottlenecks.
// Every number comes from the one game simulation (core.js); this file only builds scenarios and checks them.
const assert = require('assert');
const { Game: G, CFG, Hyd, idx } = require('./core.js');
CFG.TERRAIN.MULT = [1, 1, 1, 1]; CFG.REGIONS.forEach(r => { r.mult = 1; });
CFG.PIPE.LEAK_PER_TILE_MIN = 0; CFG.BUILD = { well: 0, tank: 0, pump: 0, pipeTile: 0, pipeMax: 0 };
const HC = CFG.HYD, W = CFG.GRID_COLS, H = CFG.GRID_ROWS;
const ok = m => console.log('  ok  ' + m);
const valid = (g, w) => { const p = g.validateNetwork(); assert.deepStrictEqual(p, [], w + ': ' + p.slice(0, 4).join(' | ')); };
// every step: no NaN / Infinity / negative value, no tank above capacity, no pipe tile above its capacity
function safe(g, w) {
  const F = v => Number.isFinite(v);
  for (const b of g.buildings) {
    for (const k of ['amt', 'out', 'q', 'qt', 'wh', 'preq', 'inflow']) if (b[k] != null) assert(F(b[k]) && b[k] >= -1e-9, w + ': ' + k + ' of ' + b.type + ' = ' + b[k]);
    if (b.type === 'tank') { assert(b.amt <= g.tankCap(b) + 1e-9, w + ': tank above capacity'); const t = g.tankHyd(b); for (const k in t) if (typeof t[k] === 'number') assert(F(t[k]) && t[k] >= 0, w + ': tank ' + k + '=' + t[k]); }
    if (b.type === 'well') { const h = g.wellHyd(b); for (const k in h) if (typeof h[k] === 'number') assert(F(h[k]) && h[k] >= 0, w + ': well ' + k + '=' + h[k]); }
  }
  for (let k = 0; k < W * H; k++) {
    const a = g.net.flowK[k], p = g.net.pressK[k]; assert(F(a) && a >= 0 && F(p) && p >= 0, w + ': tile ' + k + ' flow ' + a + ' p ' + p);
    if (g.pipe[k] && a > 0) assert(a <= g.pipeCapacity(k) + 1e-6, w + ': tile ' + k + ' flow ' + a + ' > capacity ' + g.pipeCapacity(k));
  }
  for (const L of g.lines) { const h = g.lineHyd(L); for (const k in h) if (typeof h[k] === 'number') assert(F(h[k]) && (k === 'direction' || h[k] >= 0), w + ': pipe ' + k + '=' + h[k]); assert(h.currentFlow <= h.capacity + 1e-6 || !h.capacity, w + ': pipe flow above capacity'); }
}
const run = (g, sec, w) => { for (let i = 0; i < Math.round(sec / 0.1); i++) { g.step(0.1); safe(g, w || 'run'); } };
function mk() {
  const h = new G({ seed: 7 }); h.s.cash = 1e8; h.s.regions.forEach(r => { r.unlocked = true; });
  for (const a of h.areas) if (a.st !== 2) { a.st = 2; a.kind = 'medium'; a.size = a.remaining = 1e9; a.potential = 5000; }
  for (let y = 15; y < 75; y++) for (let x = 10; x < 130; x++) { const k = idx(x, y); h.map.block[k] = 0; h.map.water[k] = 0; }
  return h;
}
const B = b => 'B' + b.id;
const connect = (h, a, b, type) => { const r = h.routeNodes(a, b, type || 0); assert(r.ok, 'route ' + a + '->' + b + ': ' + r.reason); const res = h.buildLine(r); assert(res.ok, 'build ' + a + '->' + b + ': ' + res.reason); valid(h, a + '->' + b); return res.line; };
// a straight well -> tank line, `len` tiles apart
function line(kind, len, type) { const h = mk(), w = h.place('well', 15, 40, kind).building, t = h.place('tank', 15 + len, 40).building; const L = connect(h, B(w), B(t), type); return { h, w, t, L }; }
let pass = 0; const done = m => { pass++; ok(m); };

// ---------- Test 1: Well -> Pipe -> Junction -> Pipe -> Tank: a real graph, oil moves along the real path
{
  const h = mk(), w = h.place('well', 20, 40, 'medium').building, A = h.place('tank', 40, 40).building, Bt = h.place('tank', 30, 52).building;
  const L1 = connect(h, B(w), B(A)), mid = L1.cells[Math.floor(L1.cells.length / 2)];
  connect(h, 'J' + mid, B(Bt));
  const g = h.networkGraph(), J = g.nodes.find(n => n.id === 'J' + mid);
  assert(J && J.kind === 'junction' && J.links.length === 3, 'junction node with 3 pipes: ' + JSON.stringify(J));
  assert(g.nodes.some(n => n.kind === 'well') && g.nodes.filter(n => n.kind === 'tank').length === 2);
  A.amt = h.tankCap(A); h.hyd.dirty = true;          // tank A full: the only way left is Well -> Pipe -> Junction -> Pipe -> Tank B
  run(h, 40, 'T1');
  const g2 = h.networkGraph(), path = g2.paths.find(p => p.well === w.id);
  assert.strictEqual(path.tank, Bt.id); assert(path.tiles.includes(mid), 'the path runs through the junction');
  assert(Bt.amt > 5, 'oil reached tank B: ' + Bt.amt);
  const chain = g2.edges.filter(e => e.flow > 0);
  assert(chain.some(e => e.from === B(w) && e.to === 'J' + mid), 'well -> junction pipe carries oil towards the junction: ' + JSON.stringify(chain));
  assert(chain.some(e => e.from === 'J' + mid && e.to === B(Bt)), 'junction -> tank B pipe carries oil towards tank B');
  const toA = g2.edges.find(e => e.a === 'J' + mid && e.b === B(A) || e.b === 'J' + mid && e.a === B(A)); assert(toA && toA.flow === 0, 'no oil into the full tank A');
  done('Test 1: Well -> Pipe -> Junction(' + J.links.length + ' pipes) -> Pipe -> Tank: ' + chain.map(e => e.from + '->' + e.to + ' ' + e.flow.toFixed(1)).join(', ') + ' bbl/min; tank B ' + Bt.amt.toFixed(0) + ' bbl, full tank A gets 0');
}
// ---------- Test 2: no pressure difference -> flow 0
{
  const { h, w, t } = line('small', 12);
  w.pressure = 0; t.amt = h.tankCap(t) * 0.99; h.hyd.dirty = true;   // reservoir 14 x 0.6 = 8.4 bar < back-pressure 1 + 8 x 0.98 = 8.84 bar, tank still has room
  run(h, 20, 'T2'); const wh = h.wellHyd(w), th = h.tankHyd(t);
  assert(wh.reservoirPressure < th.backPressure, [wh.reservoirPressure, th.backPressure]);
  assert(th.inventory < th.capacity, 'tank has room'); assert.strictEqual(w.out, 0); assert.strictEqual(h.lineHyd(h.lines[0]).currentFlow, 0);
  assert.strictEqual(Hyd.tankBack(0.99) > 8.4, true);
  done('Test 2: reservoir ' + wh.reservoirPressure.toFixed(2) + ' bar < tank back-pressure ' + th.backPressure.toFixed(2) + ' bar (tank ' + (th.fillRatio * 100).toFixed(0) + '%, still room) -> flow 0');
}
// ---------- Test 3: pipe capacity is a hard limit; bottleneck level
{
  const { h, w, L } = line('large', 10, 0); run(h, 40, 'T3'); const p = h.lineHyd(L);
  assert(w.rate > p.capacity * 1.5, 'well can give more than the pipe carries');
  assert(p.currentFlow <= p.capacity + 1e-9 && p.currentFlow > p.capacity * 0.97, [p.currentFlow, p.capacity]);
  assert.strictEqual(w.lim, 'capacity'); assert.strictEqual(p.usageLevel, 'critical');
  const m = line('medium', 10, 0); run(m.h, 40, 'T3b'); const pm = m.h.lineHyd(m.L); assert.strictEqual(pm.usageLevel, 'warning', 'medium well on a branch pipe ~80%: ' + pm.usage);
  const s = line('small', 10, 0); run(s.h, 40, 'T3c'); assert.strictEqual(s.h.lineHyd(s.L).usageLevel, 'normal');
  done('Test 3: well ' + w.rate.toFixed(1) + ' bbl/min into a ' + p.capacity + ' bbl/min pipe -> ' + p.currentFlow.toFixed(1) + ' (usage ' + (p.usage * 100).toFixed(0) + '% critical); ' + (pm.usage * 100).toFixed(0) + '% -> warning; ' + (s.h.lineHyd(s.L).usage * 100).toFixed(0) + '% -> normal');
}
// ---------- Test 4: a bigger diameter -> less resistance, more flow
{
  const a = line('medium', 40, 0), b = line('medium', 40, 1); run(a.h, 40, 'T4a'); run(b.h, 40, 'T4b');
  const pa = a.h.lineHyd(a.L), pb = b.h.lineHyd(b.L);
  assert(pb.diameter > pa.diameter);
  const la = Hyd.loss(pa.diameter, HC.ROUGH, 15, 0), lb = Hyd.loss(pb.diameter, HC.ROUGH, 15, 0); assert(lb < la, [la, lb]);
  const ea = a.h.elemLoss({ k: a.L.cells[3], kind: 'pipe', K: 0 }, 15, 0), eb = b.h.elemLoss({ k: b.L.cells[3], kind: 'pipe', K: 0 }, 15, 0);
  assert(eb < ea * 0.5, 'the solver uses the bigger diameter: ' + [ea, eb]);
  assert(pb.currentFlow > pa.currentFlow * 1.2, 'more flow: ' + [pa.currentFlow, pb.currentFlow]);
  // upgrading a pipe's level (bigger diameter) on the same route also raises the flow
  const c = line('medium', 40, 0); run(c.h, 20, 'T4c'); const before = c.h.lineHyd(c.L).currentFlow; for (const k of c.L.cells) c.h.pipeLvl[k] = 2; c.h.rebuildNetwork(); run(c.h, 30, 'T4d'); const after = c.h.lineHyd(c.L);
  assert(after.diameter > pa.diameter && after.currentFlow > before * 1.15, [before, after.currentFlow]);
  done('Test 4: 40-tile line, branch D=' + pa.diameter.toFixed(3) + ' m -> ' + pa.currentFlow.toFixed(1) + ' bbl/min (loss ' + pa.pressureLoss.toFixed(1) + ' bar); main D=' + pb.diameter.toFixed(3) + ' m -> ' + pb.currentFlow.toFixed(1) + ' bbl/min (loss ' + pb.pressureLoss.toFixed(1) + ' bar); level-2 branch ' + after.currentFlow.toFixed(1));
}
// ---------- Test 5: filling a tank raises its back-pressure (and that slows the flow into it)
{
  const { h, w, t, L } = line('medium', 30); const rows = [];
  for (const f of [0, 0.5, 0.8, 0.95]) { t.amt = h.tankCap(t) * f; h.hyd.dirty = true; run(h, 15, 'T5'); const th = h.tankHyd(t); rows.push([f, th.backPressure, w.qt, h.lineHyd(L).pressureOut]); }
  for (let i = 1; i < rows.length; i++) { assert(rows[i][1] > rows[i - 1][1], 'back-pressure rises'); assert(rows[i][2] <= rows[i - 1][2] + 1e-9, 'flow does not rise as the tank fills'); }
  assert(rows[3][2] < rows[0][2] * 0.95, 'a nearly full tank takes noticeably less');
  done('Test 5: fill -> back-pressure -> flow: ' + rows.map(r => (r[0] * 100) + '%: ' + r[1].toFixed(2) + ' bar, ' + r[2].toFixed(1) + ' bbl/min').join(' | '));
}
// ---------- Test 6: a full tank never goes above its capacity
{
  const { h, w, t } = line('large', 8, 1); t.amt = h.tankCap(t) - 25;
  run(h, 60, 'T6'); assert.strictEqual(t.amt, h.tankCap(t)); assert.strictEqual(w.out, 0); assert.strictEqual(h.tankHyd(t).fillRatio, 1);
  const p = h.s.produced; run(h, 20, 'T6b'); assert.strictEqual(h.s.produced, p);
  done('Test 6: full tank: inventory ' + t.amt + ' = capacity ' + h.tankCap(t) + ', inflow 0, nothing more produced');
}
// ---------- Test 7: cutting a pipe stops the flow in the part that is no longer connected
{
  const h = mk(), w = h.place('well', 20, 40, 'medium').building, A = h.place('tank', 40, 40).building, Bt = h.place('tank', 30, 52).building;
  const L1 = connect(h, B(w), B(A)), mid = L1.cells[Math.floor(L1.cells.length / 2)]; const L2 = connect(h, 'J' + mid, B(Bt));
  A.amt = h.tankCap(A); h.hyd.dirty = true; run(h, 30, 'T7'); assert(Bt.amt > 1);
  const cut = L2.cells[Math.floor(L2.cells.length / 2)]; assert(h.removeAt(cut % W, (cut / W) | 0).ok !== false); valid(h, 'cut');
  const b0 = Bt.amt; run(h, 20, 'T7b');
  assert.strictEqual(Bt.amt, b0, 'tank B gets nothing after the cut'); assert.strictEqual(w.out, 0, 'the only tank with room is cut off');
  for (const L of h.lines) assert.strictEqual(h.lineHyd(L).currentFlow, 0, 'pipe ' + L.id + ' (' + L.a + '-' + L.b + ') still shows flow');
  A.amt = 0; h.hyd.dirty = true; run(h, 20, 'T7c'); assert(A.amt > 1, 'the connected part works again once A has room');
  const stub = h.lines.filter(L => L.a[0] === 'E' || L.b[0] === 'E'); assert(stub.length >= 1 && stub.every(L => h.lineHyd(L).currentFlow === 0), 'open stubs carry nothing');
  done('Test 7: cutting the junction -> tank B pipe: tank B stays at ' + b0.toFixed(1) + ' bbl, every pipe 0; the still-connected part (well -> A) flows again: ' + w.out.toFixed(1) + ' bbl/min; ' + stub.length + ' open stubs at 0');
}
// ---------- Test 8: changing the well pressure changes the flow, and gradually (dQ/dt = (Qt - Q) / tau)
{
  const { h, w, L } = line('medium', 40); let maxJump = 0, prev = 0;
  for (let i = 0; i < 300; i++) { h.step(0.1); safe(h, 'T8'); maxJump = Math.max(maxJump, Math.abs(w.out - prev)); prev = w.out; }
  const q1 = w.out, first = (() => { const x = line('medium', 40); x.h.step(0.1); return x.w.out; })();
  assert(first < q1 * 0.2, 'no jump from 0 to the full flow: first step ' + first + ' of ' + q1);
  w.pressure = 0.3; h.hyd.dirty = true; prev = w.out; let mj2 = 0;
  for (let i = 0; i < 300; i++) { h.step(0.1); safe(h, 'T8b'); mj2 = Math.max(mj2, Math.abs(w.out - prev)); prev = w.out; }
  const q2 = w.out, wh = h.wellHyd(w); assert(q2 < q1 * 0.9, [q1, q2]); assert(mj2 < (q1 - q2) * 0.3, 'the drop is gradual: ' + mj2);
  w.pressure = 1; h.hyd.dirty = true; run(h, 30, 'T8c'); assert(Math.abs(w.out - q1) < 0.05 * q1, 'back up again');
  done('Test 8: well pressure 100% -> ' + q1.toFixed(1) + ' bbl/min; 30% (reservoir ' + wh.reservoirPressure.toFixed(1) + ' bar, PI ' + wh.productivityIndex.toFixed(2) + ') -> ' + q2.toFixed(1) + '; back -> ' + w.out.toFixed(1) + '. First step ' + first.toFixed(2) + ', biggest change per 0.1 s ' + Math.max(maxJump, mj2).toFixed(2));
}
// ---------- Test 9: the tank's fill level sets its back-pressure: P = Pbase + Pmax x fill^2
{
  const { h, t, L } = line('small', 20); const rows = [];
  for (const f of [0, 0.25, 0.5, 0.75, 0.9]) {
    t.amt = h.tankCap(t) * f; h.hyd.dirty = true; run(h, 10, 'T9'); const th = h.tankHyd(t);
    assert(Math.abs(th.backPressure - (th.basePressure + th.maxBackPressure * th.fillRatio * th.fillRatio)) < 1e-9);
    rows.push([th.fillRatio, th.backPressure, h.lineHyd(L).pressureOut]);
  }
  for (let i = 1; i < rows.length; i++) assert(rows[i][1] > rows[i - 1][1] && rows[i][2] >= rows[i - 1][2] - 1e-6);
  done('Test 9: ' + rows.map(r => (r[0] * 100).toFixed(0) + '% -> ' + r[1].toFixed(2) + ' bar').join(', ') + '; the pressure at the pipe end follows it');
}
// ---------- Test 10 is in the browser (test-v2-phase1.js): the oil on screen moves with currentFlow. Here: the flow it reads is the real one.
{
  const { h, L } = line('medium', 20); run(h, 30, 'T10'); const p = h.lineHyd(L);
  assert(p.currentFlow > 0 && p.direction === 1 && p.from === L.a && p.to === L.b);
  assert(Math.abs(p.currentFlow - h.net.flowK[L.cells[3]]) < 1e-9);
  done('Test 10 (core part): the pipe reports currentFlow ' + p.currentFlow.toFixed(2) + ' bbl/min and direction ' + p.from + ' -> ' + p.to + ' from the solver (screen part: test-v2-phase1.js)');
}
// ---------- Test 11: no NaN / Infinity anywhere, even with broken inputs
{
  const { h, w, t, L } = line('large', 15);
  run(h, 10, 'T11');
  w.pressure = NaN; w.rate = NaN; t.amt = NaN; h.hyd.dirty = true; h.step(0.1);
  w.pressure = 1; t.amt = 0; h.hyd.dirty = true; run(h, 10, 'T11b');
  w.pressure = 0; h.step(0); h.step(1e-9); h.step(5); run(h, 5, 'T11c');
  for (const k of [0, 1e-12, 1e9]) { const r = Hyd.loss(0.2, HC.ROUGH, k, 1); assert(Number.isFinite(r) && r >= 0 && r <= HC.P_MAX); }
  assert.strictEqual(Hyd.friction(0, 0.2, HC.ROUGH), 0); assert.strictEqual(Hyd.loss(0, HC.ROUGH, 10, 0), 0); assert(Number.isFinite(Hyd.tankBack(NaN)));
  done('Test 11: NaN inputs, zero flow, zero diameter, dt 0 / 5 s, flow 1e9 -> every value finite, nothing negative, pressures <= ' + HC.P_MAX + ' bar');
}
// ---------- Test 12: several wells and several tanks on one network
{
  const h = mk();
  const w1 = h.place('well', 20, 30, 'large').building, w2 = h.place('well', 20, 45, 'medium').building, w3 = h.place('well', 20, 60, 'small').building;
  const t1 = h.place('tank', 70, 30).building, t2 = h.place('tank', 70, 45).building, t3 = h.place('tank', 70, 60).building;
  const M = connect(h, B(w1), B(t1), 1); const j = M.cells[Math.floor(M.cells.length / 2)];
  connect(h, B(w2), 'J' + j); connect(h, B(w3), B(t3)); const M2 = h.lines.find(L => L.b === B(t3) || L.a === B(t3)); const j2 = M2.cells[Math.floor(M2.cells.length / 2)];
  connect(h, 'J' + j2, B(t2)); connect(h, B(t2), B(t1));
  const p0 = h.s.produced;
  for (let i = 0; i < 4000; i++) {
    h.step(0.1); safe(h, 'T12');
    if (i === 1000) { const k = M.cells[2]; h.removeAt(k % W, (k / W) | 0); }
    if (i === 1500) { h.sell(h.oilTotal()); }
    if (i === 2500) { const r = h.routeNodes(B(w1), 'J' + j); if (r.ok) h.buildLine(r); }
    if (i % 500 === 0) valid(h, 'T12 step ' + i);
  }
  valid(h, 'T12 end');
  const stored = [t1, t2, t3].reduce((a, t) => a + t.amt, 0); assert(Math.abs(h.s.produced - p0 - (stored + h.s.sold)) < 1e-3, 'oil conserved: ' + [h.s.produced - p0, stored, h.s.sold]);
  assert(h.hyd.warn === 0 || h.hyd.converged, 'solver ok');
  done('Test 12: 3 wells, 3 tanks, 2 junctions, a cut, a sale, a reconnection over 400 s: graph valid every check, oil conserved (produced ' + (h.s.produced - p0).toFixed(0) + ' = stored ' + stored.toFixed(0) + ' + sold ' + h.s.sold.toFixed(0) + '), ' + h.hyd.solves + ' solves');
}
console.log('PHASE 1 core: ' + pass + ' passed / 0 failed');
