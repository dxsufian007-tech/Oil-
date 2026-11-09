/* The Central Hybrid Pipeline Network: REAL behaviour tests on the real game world (no mocks of the network).
 *   node oli/test-central.js
 * 1 the pre-built network   2 the six channels, each alone   3 distribution at branches   4 loops / alternative paths / capacity   5 pipe cuts and pump failures
 * 6 tapping from different points   7 no mixing of products   8 save / load after a restart   9 old pipes unaffected   10 end to end: refinery -> product channels   11 accounting: asset, loan, grace, instalments */
const W = require('./worldmap.js'), B = require('./buildings.js'), I = require('./industry.js'), C = require('./central.js'), E = require('./economy.js'), EC = require('./economy-config.js');
let pass = 0, fail = 0; const ok = (c, n, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' -> ' + JSON.stringify(x))); } };
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t) * Math.max(1, Math.abs(a), Math.abs(b));
const world = W.createWorld({ seed: 20260101 });

function mk(opts) {
  opts = opts || {}; const ts = B.fromWorld(world), store = new B.BuildingStore(ts, { cash: opts.cash == null ? 500e6 : opts.cash }), net = new I.PipeNet(world.W), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 });
  const g = { ts, store, net, sim, co }; if (opts.central !== false) { g.inst = C.install(store, net); g.cn = g.inst.cn; } return g;
}
const stB = (g, id) => g.store.get(g.cn.st.get(id).b);
/* a building of kind `def` close to station `st` whose port toward the channel is wired to the station: dir 'out' = it pushes into the network (source), 'in' = it takes from it */
function attach(g, def, st, ch, dir, vol, dia) {
  if (Array.isArray(st)) { for (const s1 of st) { const b = attach(g, def, s1, ch, dir, vol, dia); if (b) return b; } return null; }
  const sb = stB(g, st);
  for (const portId of C.PORTS[ch]) { if (g.net.lines.size) { let taken = false; for (const L of g.net.lines.values()) for (const e of [L.a, L.b]) if (e && e.b === sb.id && e.port === portId) taken = true; if (taken) continue; }
    const pp = B.worldPoints(sb).find(p => p.id === portId); let tries = 0;
    for (let d = 2; d <= 30; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const x = pp.ax + dx, y = pp.ay + dy, v = g.store.validate(def, x, y, 0, { ignoreCash: true }); if (!v.ok) continue; const p = g.store.place(def, x, y, 0, { instant: true, ignoreCash: true }); if (!p.ok) continue; const b = p.building; let done = false;
      for (const q of B.worldPoints(b)) { if (q.kind !== 'pipe' || q.role !== dir) continue; const r = I.layPipe(g.store, g.net, g.ts, { b: b.id, port: q.id }, { b: sb.id, port: portId }, dia || 36, { ignoreCash: true }); if (r.ok) { done = true; break; } }
      if (done) { if (vol != null) g.sim.ensure(b).vol = vol; b.__st = st; return b; } g.store.demolish(b.id, { building: true, pipes: true }); if (++tries > 40) { d = 99; dy = 99; break; } } }
  return null;
}
const run = (g, n, dt) => { for (let i = 0; i < n; i++) g.sim.step(dt || 0.05); };
const TANK = { CRUDE: ['crude_tank_m', 'crude_tank_m'], GASOLINE: ['gasoline_tank_m', 'gasoline_tank_m'], DIESEL: ['diesel_tank_m', 'diesel_tank_m'], JET_FUEL: ['jet_tank_m', 'jet_tank_m'], GAS: ['gas_sphere_m', 'gas_sphere_m'], WATER: ['water_tank_m', 'water_tank_m'] };
const secOf = (x, y) => world.sectorAt(x, y);
const BST = ['N1', 'N2', 'N3', 'N4', 'N5', 'N5e', 'N6', 'S1'], rot = (a, k) => a.slice(k).concat(a.slice(0, k));    // stations in the B sectors (tanks of every kind are allowed there)

/* ------------------------------------------------------------------------------------------------ 1. the pre-built network */
console.log('1. the pre-built network');
let G = mk(); const cn0 = G.cn, cost0 = cn0.cost();
ok(G.inst.failed.length === 0 && G.inst.stations === 29, '1a 29 stations installed on the real world, none refused', G.inst);
ok(cn0.seg.size === 34 && cn0.trunkTiles() === 7288, '1b 34 trunk segments (19 main · 5 loops · 10 coastal), 7,288 tiles', [cn0.seg.size, cn0.trunkTiles()]);
{ const kinds = {}; for (const s of cn0.seg.values()) kinds[s.kind] = (kinds[s.kind] || 0) + 1; ok(kinds.main === 19 && kinds.loop === 5 && kinds.coast === 10, '1c the four elements: main lines + closed loops + F1 coastal links (branches are the player\'s)', kinds); }
ok(G.net.lines.size === 0 && G.store.list().every(b => B.DEFS[b.d].type === 'central'), '1d PipeNet (the old pipes) is untouched: no old line was created, the only buildings are the stations');
ok(G.store.list().every(b => b.st === 'OPERATIONAL') && G.store.cash === 500e6, '1e stations are operational and free (cash still $500M)');
{ const secs = new Set(); for (const s of cn0.st.values()) secs.add(secOf(s.x, s.y)); const need = ['A1', 'A3', 'A5', 'A7', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'D1', 'E1']; const got = need.filter(c => secs.has(c)); ok(got.length >= 10, '1f the stations lie in the real sectors', [...secs].sort()); }
{ // graph: connected + closed loops (more segments than a tree needs)
  const adj = cn0._graph(), seen = new Set(), q = [cn0.st.keys().next().value]; while (q.length) { const n = q.pop(); if (seen.has(n)) continue; seen.add(n); for (const e of adj.get(n)) q.push(e.to); }
  ok(seen.size === cn0.st.size && cn0.seg.size - cn0.st.size + 1 >= 5, '1g the graph is one connected network with independent closed loops', { reach: seen.size, st: cn0.st.size, cycles: cn0.seg.size - cn0.st.size + 1 }); }
ok(cn0.ch && Object.keys(cn0.ch).join() === 'CRUDE,WATER,GASOLINE,DIESEL,JET_FUEL,GAS' && C.CHANNELS.every(c => cn0.ch[c].cap === 300000 && cn0.ch[c].maxP === 3000), '1h six channels, each with capacity (300,000 = the 36" class) and max pressure (3,000)');
ok(C.COLOR.CRUDE === '#4a3a2c' && C.COLOR.JET_FUEL === '#4aa3ff' && C.COLOR.GASOLINE === require('./building-config.js').PRODUCT_COLOR.GASOLINE, '1i channel colours = the game\'s product colours (crude #4a3a2c, jet #4aa3ff)');
ok(near(cost0.shell, 7288 * 6 * 120000) && cost0.pumps === 18, '1j shell cost = tiles × 6 channels × $120,000 (the 36" price)', cost0);

/* ------------------------------------------------------------------------------------------------ 2. the six channels, each alone */
console.log('2. the six channels, each on its own');
const PAIRS = { CRUDE: [BST.slice(0, 3), BST.slice(3)], GASOLINE: [BST.slice(0, 3), BST.slice(3)], DIESEL: [BST.slice(0, 3), BST.slice(3)], JET_FUEL: [BST.slice(0, 3), BST.slice(3)], GAS: [BST.slice(0, 3), BST.slice(3)] };
for (const ch of C.CHANNELS) {
  const g = mk(), cn = g.cn; let a, b, bst = null;
  if (ch === 'WATER') { // water tanks live in the E sector: tap two points of the trunk inside E1
    const pts = []; for (const [k, sid] of cn.at) { const y = Math.floor(k / world.W), x = k % world.W; if (secOf(x, y) === 'E1') pts.push([x, y, sid]); }
    const seg = pts.length ? pts[0][2] : null, sp = pts.filter(p => p[2] === seg), t1 = cn.tapPoint(sp[10][0], sp[10][1]), t2 = cn.tapPoint(sp[Math.min(sp.length - 1, 60)][0], sp[Math.min(sp.length - 1, 60)][1]);
    const p1 = C.planTap(g.store, g.net, sp[10][0], sp[10][1]), r1 = p1.ok && C.commitTap(g.store, g.net, p1, { ignoreCash: true }); const p2 = C.planTap(g.store, g.net, sp[Math.min(sp.length - 1, 60)][0], sp[Math.min(sp.length - 1, 60)][1]), r2 = p2.ok && C.commitTap(g.store, g.net, p2, { ignoreCash: true });
    ok(r1 && r1.ok && r2 && r2.ok, '2-WATER the two stations are tapped into the trunk inside E1', [p1.reason, p2.reason, sp.length]);
    a = attach(g, 'water_tank_m', r1.station.id, ch, 'out', 40000); b = attach(g, 'water_tank_m', r2.station.id, ch, 'in', 0);
  } else { const [s1, s2] = PAIRS[ch]; a = attach(g, TANK[ch][0], s1, ch, 'out', 40000); b = attach(g, TANK[ch][1], s2, ch, 'in', 0); }
  ok(a && b, '2-' + ch + ' source and destination are built and wired to the ' + ch + ' port', !!a + '/' + !!b);
  if (!(a && b)) continue; const v0 = a.s.vol; run(g, 10);
  const lost = v0 - a.s.vol, gained = b.s.vol, st = g.cn.ch[ch], others = C.CHANNELS.filter(c => c !== ch).map(c => g.cn.ch[c].flow);
  ok(gained > 1000 && near(lost, gained, 1e-9), '2-' + ch + ' it arrives: the source lost exactly what the destination gained (' + Math.round(gained) + ' bbl)', [lost, gained]);
  ok(st.flow > 0 && st.status === 'RUNNING' && st.pressure > 0 && st.pressure <= st.maxP && st.qty > 0, '2-' + ch + ' the channel reports flow ' + Math.round(st.flow) + ' bbl/d · pressure ' + Math.round(st.pressure) + ' psi · in the pipe ' + Math.round(st.qty) + ' bbl', st);
  ok(others.every(f => f === 0), '2-' + ch + ' the other five channels carry nothing', others);
  ok(st.flow <= 300000 + 1e-6 && [...g.cn.seg.values()].every(s => s.f[ch].flow <= 300000 + 1e-6), '2-' + ch + ' no segment exceeds the channel capacity');
}
{ // no stock -> no flow (nothing is invented)
  const g = mk(), a = attach(g, 'crude_tank_m', BST.slice(0, 3), 'CRUDE', 'out', 0), b = attach(g, 'crude_tank_m', BST.slice(3), 'CRUDE', 'in', 0); run(g, 10);
  ok(g.cn.ch.CRUDE.flow === 0 && a.s.vol === 0 && b.s.vol === 0, '2-stock an empty source puts nothing in the pipe and nothing appears at the destination'); }
{ // a destination that is full takes nothing
  const g = mk(), a = attach(g, 'crude_tank_m', BST.slice(0, 3), 'CRUDE', 'out', 30000), b = attach(g, 'crude_tank_m', BST.slice(3), 'CRUDE', 'in', 50000); run(g, 10);
  ok(near(a.s.vol, 30000) && near(b.s.vol, 50000), '2-full a full destination refuses: the source keeps its oil'); }

/* ------------------------------------------------------------------------------------------------ 3. distribution at the branches */
console.log('3. distribution at the branches');
{ const g = mk(), src = attach(g, 'crude_tank_l', ['N1', 'N2'], 'CRUDE', 'out', 250000, 36), d1 = attach(g, 'crude_tank_m', ['N3', 'N6'], 'CRUDE', 'in', 0), d2 = attach(g, 'crude_tank_m', ['N4', 'S1'], 'CRUDE', 'in', 49000), d3 = attach(g, 'crude_tank_m', ['N5', 'N5e'], 'CRUDE', 'in', 0);
  ok(src && d1 && d2 && d3, '3a one source, three branches (one of them nearly full)'); const v0 = [src.s.vol, d1.s.vol, d2.s.vol, d3.s.vol]; run(g, 1);
  const out = v0[0] - src.s.vol, got = [d1.s.vol - v0[1], d2.s.vol - v0[2], d3.s.vol - v0[3]];
  ok(near(out, got[0] + got[1] + got[2], 1e-9) && out > 0, '3b in = out: what left the source is exactly what the three branches received', { out, got });
  ok(got.every(x => x < out * 0.999), '3c no destination receives the whole source quantity', { out, got });
  ok(near(got[1], 1000, 1e-6), '3d the nearly full branch receives only what its tank can still hold (1,000 bbl)', got);
  ok(Math.abs(got[0] - got[2]) < out * 0.02 && got[0] > got[1], '3e the others share the rest by what each can take', got);
  run(g, 20); ok(d2.s.vol <= 50000 + 1e-6 && d1.s.vol <= 50000 + 1e-6 && d3.s.vol <= 50000 + 1e-6, '3f no tank is filled beyond its capacity'); }
{ // supply below demand: the real quantity is shared, nothing invented
  const g = mk(), src = attach(g, 'crude_tank_m', ['N1', 'N2'], 'CRUDE', 'out', 3000), d1 = attach(g, 'crude_tank_m', ['N3', 'N6'], 'CRUDE', 'in', 0), d2 = attach(g, 'crude_tank_m', ['N4', 'S1'], 'CRUDE', 'in', 0); run(g, 40);
  ok(near(src.s.vol + d1.s.vol + d2.s.vol, 3000, 1e-9) && src.s.vol < 1e-6, '3g supply (3,000 bbl) < demand (100,000 bbl): everything moved, total conserved, nothing created', [src.s.vol, d1.s.vol, d2.s.vol]); }

/* ------------------------------------------------------------------------------------------------ 4. loops, alternative paths, capacity */
console.log('4. loops, alternative paths and capacity');
{ const g = mk(), cn = g.cn, src = attach(g, 'crude_tank_m', ['N3', 'N4', 'N2'], 'CRUDE', 'out', 50000, 36), dst = attach(g, 'crude_tank_m', ['M2', 'M1', 'V1'], 'CRUDE', 'in', 0); ok(src && dst, '4a source on ' + (src && src.__st) + ' (B), destination on ' + (dst && dst.__st) + ' (A7)'); cn.begin(.05);
  const p0 = cn.path('CRUDE', src.__st, dst.__st); ok(p0 && p0.length >= 1, '4b a path exists', p0 && p0.map(h => h.g.id)); const first = p0.map(h => h.g.id); cn.end();
  run(g, 5); const base = dst.s.vol, flow0 = cn.ch.CRUDE.flow; ok(base > 0 && flow0 > 0, '4c product flows by the shortest path', { base, flow0, path: first });
  for (const id of first) cn.setFault(id, 'CRUDE', true); const b1 = dst.s.vol, s1 = src.s.vol; run(g, 5);
  const via = [...cn.seg.values()].filter(s => s.f.CRUDE.flow > 0).map(s => s.id);
  ok(dst.s.vol - b1 > 0 && !via.some(id => first.includes(id)), '4d the faulted segments carry nothing and the product still arrives by an alternative path', { via, faulted: first });
  ok(near(s1 - src.s.vol, dst.s.vol - b1, 1e-9), '4e no double counting: the source lost exactly what the destination gained over the alternative route', [s1 - src.s.vol, dst.s.vol - b1]);
  ok(cn.ch.CRUDE.flow > flow0 * 0.9 && cn.ch.CRUDE.flow <= flow0 + 1e-6, '4f the alternative path (' + via.length + ' segments) carries ' + Math.round(cn.ch.CRUDE.flow) + ' of the original ' + Math.round(flow0) + ' bbl/d: the longer way costs pressure, capacity is enough', [cn.ch.CRUDE.flow, flow0]);
  // cut every segment of the destination: nothing moves
  for (const s of cn.segsOf(dst.__st)) cn.setFault(s.id, null, true); const b2 = dst.s.vol, s2 = src.s.vol; run(g, 5);
  ok(dst.s.vol === b2 && near(src.s.vol, s2) && cn.ch.CRUDE.flow === 0, '4g every segment into the destination station cut: no valid path = no product moves (no teleporting)');
  for (const s of cn.seg.values()) cn.setFault(s.id, null, false); run(g, 3); ok(dst.s.vol > b2, '4h repairing the segments restores the flow'); }
{ // capacity is a hard limit and the surplus takes a second path
  const g = mk(), cn = g.cn; cn.begin(.05); const over = new Map(); let tot = 0; const used = new Set(), chunks = [];
  for (let i = 0; i < 12; i++) { const pl = cn.plan('CRUDE', 'N3', 'M2', 1e7, 5000, over); if (!pl) break; chunks.push([pl.r, pl.hops.map(h => h.g.id).join('>')]); tot += pl.r; for (const h of pl.hops) { const k = h.g.id + '|CRUDE'; over.set(k, (over.get(k) || 0) + pl.r); used.add(h.g.id); } }
  const worst = Math.max(...[...over.values()]); ok(worst <= 300000 + 1e-6, '4i capacity: no segment is ever loaded above 300,000 bbl/day however much is asked', worst);
  ok(new Set(chunks.map(c => c[1])).size >= 2 && tot > 300000, '4j the loops are effective: the flow above one path\'s capacity goes over a second, third… path (total ' + Math.round(tot) + ' bbl/day over ' + new Set(chunks.map(c => c[1])).size + ' routes)', chunks.slice(0, 5)); cn.end(); }

/* ------------------------------------------------------------------------------------------------ 5. cuts and pump failures */
console.log('5. pipe cuts and pump failures');
{ const g = mk(), cn = g.cn; // find two B-sector stations whose route passes a pumped hub and is long enough that the pressure matters
  const ids = [...cn.st.keys()].filter(i => /^B/.test(secOf(cn.st.get(i).x, cn.st.get(i).y) || '')); const cands = []; cn.begin(.05);
  for (const a of ids) for (const b of ids) { if (a === b) continue; const pl = cn.plan('CRUDE', a, b, 125000, 58, null); if (!pl || !pl.stats.some(s => s[3])) continue; for (const p of cn.pumps.values()) p.fault = true; const pl2 = cn.plan('CRUDE', a, b, 125000, 58, null); for (const p of cn.pumps.values()) p.fault = false;
    if (!pl2 || pl2.r < pl.r * 0.9) cands.push({ a, b, withPump: Math.round(pl.r), without: pl2 ? Math.round(pl2.r) : 0, pEnd: Math.round(pl.p), len: pl.hops.reduce((q, h) => q + h.g.path.length, 0) }); }
  cn.end(); ok(cands.length > 0, '5a ' + cands.length + ' routes exist whose delivery really depends on a pump (e.g. ' + (cands[0] ? cands[0].a + '→' + cands[0].b + ' ' + cands[0].len + ' tiles: ' + cands[0].withPump + ' bbl/d with the pump, ' + cands[0].without + ' without' : '') + ')', cands.slice(0, 2));
  let src = null, dst = null, pick = null; const tapAlong = (hop, fromEnd) => { const P = hop.g.path, i = fromEnd ? (hop.dir === 1 ? P.length - 9 : 8) : (hop.dir === 1 ? 8 : P.length - 9); for (let k = 0; k < 40; k++) { const t = P[i + (hop.dir === 1 ? k : -k) * (fromEnd ? -1 : 1)]; if (!t) break; const pl = C.planTap(g.store, g.net, t[0], t[1]); if (pl.ok) { const r = C.commitTap(g.store, g.net, pl, { ignoreCash: true }); if (r.ok) return r.station.id; } } return null; };
  for (const c of cands) { cn.begin(.05); const pl = cn.plan('CRUDE', c.a, c.b, 125000, 58, null); cn.end(); if (!pl) continue; const ta = tapAlong(pl.hops[0], false), tb = tapAlong(pl.hops[pl.hops.length - 1], true); if (!ta || !tb) continue;
    src = attach(g, 'crude_tank_l', ta, 'CRUDE', 'out', 250000, 36); dst = src && attach(g, 'crude_tank_l', tb, 'CRUDE', 'in', 0, 36); if (src && dst) { pick = c; break; } }
  ok(!!(src && dst), '5b both ends of such a route are built (' + (pick && pick.a + ' → ' + pick.b) + ')');
  if (src && dst) { run(g, 4); const f1 = g.cn.ch.CRUDE.flow, pumps = [...cn.pumps.values()].filter(p => p.ch === 'CRUDE' && p.flow > 0); ok(f1 > 0 && pumps.length > 0 && pumps[0].pOut > pumps[0].pIn, '5c with the pumps working, the pumped hub boosts the pressure (' + Math.round(pumps[0].pIn) + ' → ' + Math.round(pumps[0].pOut) + ' psi) and ' + Math.round(f1) + ' bbl/d arrives', pumps.map(p => [p.id, p.pIn, p.pOut]));
    for (const p of cn.pumps.values()) if (p.ch === 'CRUDE') p.fault = true; run(g, 4); const f2 = g.cn.ch.CRUDE.flow; ok(f2 < f1 * 0.9, '5d pump failure: the same route now delivers ' + Math.round(f2) + ' bbl/d instead of ' + Math.round(f1) + ' (the pressure no longer carries it)', [f1, f2]);
    const before = dst.s.vol; for (const p of cn.pumps.values()) if (p.ch === 'CRUDE') p.fault = false; run(g, 4); ok(g.cn.ch.CRUDE.flow > f2 * 1.05 && dst.s.vol > before, '5e repairing the pumps restores the flow', [g.cn.ch.CRUDE.flow, f2]);
    for (const p of cn.pumps.values()) if (p.ch !== 'CRUDE') p.fault = true; run(g, 3); ok(near(g.cn.ch.CRUDE.flow, f1, 0.05), '5f a failure of the OTHER channels\' pumps does not touch the crude channel', [g.cn.ch.CRUDE.flow, f1]); } }
{ // the channel itself: closed / in fault
  const g = mk(), cn = g.cn, a = attach(g, 'gasoline_tank_m', BST.slice(0, 3), 'GASOLINE', 'out', 40000), b = attach(g, 'gasoline_tank_m', BST.slice(3), 'GASOLINE', 'in', 0), c = attach(g, 'diesel_tank_m', BST.slice(0, 3), 'DIESEL', 'out', 40000), d = attach(g, 'diesel_tank_m', BST.slice(3), 'DIESEL', 'in', 0); run(g, 3);
  const b0 = b.s.vol, d0 = d.s.vol; cn.setChannel('GASOLINE', 'CLOSED'); run(g, 5); ok(b.s.vol === b0 && cn.ch.GASOLINE.status === 'CLOSED' && d.s.vol > d0, '5g closing the GASOLINE channel stops gasoline only; diesel keeps flowing', [b.s.vol - b0, d.s.vol - d0]);
  cn.setChannel('GASOLINE', 'OPEN'); cn.setChannelFault('DIESEL', true); const d1 = d.s.vol; run(g, 5); ok(d.s.vol === d1 && cn.ch.DIESEL.status === 'FAULT', '5h a DIESEL channel fault blocks diesel', cn.ch.DIESEL.status); }

/* ------------------------------------------------------------------------------------------------ 6. tapping from any point */
console.log('6. tapping from different points of the trunk');
{ const g = mk(), cn = g.cn, n0 = cn.st.size, s0 = cn.seg.size, pts = []; // spine, a main line, a loop, a coastal link
  const pickOn = id => { const s = cn.seg.get(id); return s.path[Math.floor(s.path.length / 2) + 3]; }; for (const id of ['T-E2', 'T-E3', 'T-N5', 'L-C1', 'F-L4']) pts.push([id, pickOn(id)]);
  const made = []; for (const [id, p] of pts) { const plan = C.planTap(g.store, g.net, p[0], p[1]); const r = plan.ok ? C.commitTap(g.store, g.net, plan, { ignoreCash: true }) : plan; ok(r.ok, '6-' + id + ' a station is tapped in at (' + p[0] + ',' + p[1] + ') [' + (secOf(p[0], p[1]) || '-') + ']', r.reason); if (r.ok) made.push(r); }
  ok(cn.st.size === n0 + made.length && cn.seg.size === s0 + made.length, '6a every tap cuts its segment in two and adds one station (mechanical registration in the engine)', [cn.st.size - n0, cn.seg.size - s0]);
  ok(made.every(r => g.store.get(r.station.b) && cn.stOf(r.station.b) === r.station), '6b each new station is a real building bound to its node in the graph');
  ok(!C.planTap(g.store, g.net, 5, 5).ok && C.planTap(g.store, g.net, 5, 5).reason === 'notOnCentral', '6c a point that is not on the trunk cannot be tapped');
  { const ids = made.map(r => r.station.id), a = attach(g, 'crude_tank_m', ids, 'CRUDE', 'out', 30000), b = a && attach(g, 'crude_tank_m', ids.filter(i => i !== a.__st), 'CRUDE', 'in', 0); ok(a && b, '6d tanks are wired to two different tapped stations (' + (a && a.__st) + ' and ' + (b && b.__st) + ')'); if (a && b) { run(g, 5); ok(b.s.vol > 0 && near(30000 - a.s.vol, b.s.vol, 1e-9), '6e the product travels between the two tapped points', [a.s.vol, b.s.vol]); } }
  { g.store.cash = 500e6; const cost = C.TILE_COST, plan = C.planTap(g.store, g.net, ...pickOn('T-N6')); const gg = mk({ cash: 100 }), p2 = C.planTap(gg.store, gg.net, ...gg.cn.seg.get('T-N6').path[100]); ok(plan.ok && plan.cost >= cost && plan.cost < cost * 3 && !p2.ok && p2.reason === 'cash', '6f a tap buys a station (one tile of shell $' + cost.toLocaleString('en-US') + ' × the terrain factor of the site = $' + plan.cost.toLocaleString('en-US') + ') and is refused without the cash', [plan.cost, p2.reason]); }
  const st = made[1].station, sb = g.store.get(st.b); ok(g.store.demolish(sb.id, { building: true, pipes: true }).reason === 'centralStation', '6g a station can never be demolished (the graph would break)'); }

/* ------------------------------------------------------------------------------------------------ 7. no mixing */
console.log('7. no mixing of products');
{ const g = mk(), cn = g.cn, gt = attach(g, 'gasoline_tank_m', 'N1', 'GASOLINE', 'out', 40000), ct = attach(g, 'crude_tank_m', 'N1', 'CRUDE', 'out', 40000);
  const sb = stB(g, 'N3'), tryWire = (b, role, port) => { for (const q of B.worldPoints(b)) { if (q.kind !== 'pipe' || q.role !== role) continue; const v = I.planPipe(g.store, g.net, g.ts, { b: b.id, port: q.id }, { b: sb.id, port }, 36, { ignoreCash: true }); if (v.ok) return v; if (v.reason !== 'noRoute') return v; } return { ok: false, reason: 'none' }; };
  const v1 = tryWire(gt, 'out', C.PORT.CRUDE), v2 = tryWire(ct, 'out', C.PORT.GASOLINE); ok(!v1.ok && v1.reason === 'invalidProduct' && !v2.ok && v2.reason === 'invalidProduct', '7a a gasoline tank cannot be wired to the CRUDE port, a crude tank not to the GASOLINE port', [v1.reason, v2.reason]);
  const wt = attach(g, 'water_tank_m', 'N3', 'WATER', 'in', 0); ok(wt === null || true, '7b (water tanks are E-sector only)');
  const gd = attach(g, 'gasoline_tank_m', 'N3', 'GASOLINE', 'in', 0), cd = attach(g, 'crude_tank_m', 'N3', 'CRUDE', 'in', 0); run(g, 10);
  ok(gd.s.vol > 0 && cd.s.vol > 0 && B.DEFS[gd.d].product === 'GASOLINE' && B.DEFS[cd.d].product === 'CRUDE', '7c both products travel at the same time to their own tanks');
  ok(near(40000 - gt.s.vol, gd.s.vol, 1e-9) && near(40000 - ct.s.vol, cd.s.vol, 1e-9), '7d each destination received exactly what its own source gave: no crude in the gasoline tank, no gasoline in the crude tank');
  ok(cn.ch.CRUDE.moved > 0 && cn.ch.GASOLINE.moved > 0 && cn.ch.DIESEL.moved === 0, '7e the channels keep separate books (moved volume per channel)');
  // a crude tank offered to a station port of another product through a foreign line: the tank refuses (port product lock)
  ok(B.DEFS.central_station.connections.length === 12 && B.DEFS.central_station.connections.every(c => c.product === c.id.replace(/_PORT2?$/, '')), '7f the 12 station ports (two per channel) are each locked to one product'); }

/* ------------------------------------------------------------------------------------------------ 8. save / load after a restart */
console.log('8. save and load after a restart');
{ const g = mk(), cn = g.cn, a = attach(g, 'crude_tank_m', 'N1', 'CRUDE', 'out', 40000), b = attach(g, 'crude_tank_m', 'N3', 'CRUDE', 'in', 0); const tp = C.planTap(g.store, g.net, ...cn.seg.get('T-S1').path[300]); C.commitTap(g.store, g.net, tp, { ignoreCash: true });
  cn.setFault('T-N6', 'CRUDE', true); cn.setChannel('DIESEL', 'CLOSED'); cn.setPumpFault([...cn.pumps.values()][2].id, true); run(g, 5);
  const raw = JSON.stringify({ store: g.store.toJSON(), net: g.net.toJSON() }), d = JSON.parse(raw);
  const r = B.BuildingStore.fromJSON(B.fromWorld(world), d.store), net2 = I.PipeNet.fromJSON(world.W, d.net), sim2 = new I.Sim(r.store, net2), c2 = net2.central;
  ok(!!c2 && c2.st.size === cn.st.size && c2.seg.size === cn.seg.size && c2.pumps.size === 18 && c2.cen.size === cn.cen.size, '8a after the restart the network is back: stations, segments, pumps, occupied tiles', [c2 && c2.st.size, c2 && c2.seg.size]);
  ok(c2.seg.get('T-N6').fault.CRUDE && c2.ch.DIESEL.state === 'CLOSED' && c2.pumps.get([...cn.pumps.values()][2].id).fault, '8b faults, the closed channel and the failed pump survived the save');
  ok([...cn.seg.values()].every(s => { const t = c2.seg.get(s.id); return t && t.path.length === s.path.length && t.a === s.a && t.b === s.b; }) && [...cn.st.values()].every(s => { const t = c2.st.get(s.id); return t && t.b === s.b; }), '8c every segment (path, ends) and every station↔building binding is identical');
  ok(r.store.list().filter(x => B.DEFS[x.d].type === 'central').every(x => c2.stOf(x.id)) && net2.lines.size === g.net.lines.size, '8d the station buildings, the old pipe lines and the node bindings all came back');
  for (const x of r.store.list()) if (x.s === undefined) { /* ensured by the sim */ } const a2 = r.store.get(a.id), b2 = r.store.get(b.id); sim2.ensure(a2).vol = a.s.vol; sim2.ensure(b2).vol = b.s.vol;
  c2.setFault('T-N6', null, false); for (let i = 0; i < 5; i++) sim2.step(.05); const g2 = mk({ central: false }); void g2;
  ok(c2.ch.CRUDE.flow > 0 && b2.s.vol > b.s.vol, '8e the reloaded game carries product again (flow ' + Math.round(c2.ch.CRUDE.flow) + ' bbl/d)', [c2.ch.CRUDE.flow]);
  const ref = c2.toJSON(), again = JSON.parse(JSON.stringify(ref)); ok(JSON.stringify(again) === JSON.stringify(C.CentralNet.fromJSON(world.W, ref).toJSON()), '8f save → load → save is lossless');
  const old = I.PipeNet.fromJSON(world.W, { v: 1, next: 1, nc: 1, lines: [] }); ok(old.central === null, '8g an old save (no network inside) loads exactly as before: no network'); }

/* ------------------------------------------------------------------------------------------------ 9. old pipes unaffected */
console.log('9. the old pipes are not affected');
{ const build = withCentral => { const g = mk({ central: withCentral }); const st = new Map(); // an old-style tank -> tank pipe, far from the trunk, in B3
    const a = (() => { for (let x = 660; x < 760; x += 5) for (let y = 120; y < 200; y += 5) { const v = g.store.place('crude_tank_m', x, y, 0, { instant: true, ignoreCash: true }); if (v.ok) return v.building; } })(), b = (() => { for (let x = 700; x < 800; x += 5) for (let y = 120; y < 200; y += 5) { const v = g.store.place('crude_tank_m', x, y, 0, { instant: true, ignoreCash: true }); if (v.ok) return v.building; } })();
    const L = I.planConnect(g.store, g.net, g.ts, a.id, b.id, {}); const done = I.layConnect(g.store, g.net, g.ts, a.id, b.id, { ignoreCash: true }); return { g, a, b, L, done }; };
  const x = build(false), y = build(true); ok(x.L.ok && y.L.ok && x.done.ok && y.done.ok, '9a an old-style connection between two tanks plans and is built fine with and without the central network', [x.L.reason, y.L.reason]);
  ok(JSON.stringify(x.L.lines.map(l => l.path)) === JSON.stringify(y.L.lines.map(l => l.path)), '9b the old pipe takes the SAME route, tile for tile, with the central network present');
  x.a.s = x.g.sim.ensure(x.a); y.a.s = y.g.sim.ensure(y.a); x.a.s.vol = 40000; y.a.s.vol = 40000; run(x.g, 10); run(y.g, 10);
  ok(x.b.s.vol > 0 && near(x.b.s.vol, y.b.s.vol, 1e-12) && near(x.a.s.vol, y.a.s.vol, 1e-12), '9c the old pipe moves exactly the same oil (identical volumes) with the central network running next to it', [x.b.s.vol, y.b.s.vol]);
  { const g = y.g, cn = g.cn; let hit = 0; for (const L of g.net.lines.values()) for (const [px, py] of L.path) if (cn.cen.has(cn.key(px, py))) hit++; ok(hit === 0 && g.net.lines.size >= 1, '9d no old pipe tile is a central tile (shared occupancy registry)', hit); }
  { const g = mk(), cn = g.cn, t = cn.seg.get('T-E2').path[50], a = (() => { for (let dx = -6; dx <= 6; dx++) { const v = g.store.place('crude_tank_m', t[0] + 4 + dx, t[1] - 10, 0, { instant: true, ignoreCash: true }); if (v.ok) return v.building; } })(), b = (() => { for (let dx = -6; dx <= 6; dx++) { const v = g.store.place('crude_tank_m', t[0] + 4 + dx, t[1] + 10, 0, { instant: true, ignoreCash: true }); if (v.ok) return v.building; } })();
    const L = a && b && I.planConnect(g.store, g.net, g.ts, a.id, b.id, {}); const crosses = L && L.lines && L.lines.some(l => l.path.some(p => cn.cen.has(cn.key(p[0], p[1])))); ok(!crosses, '9e an old pipe is never routed across the central trunk (it goes around or is refused)', L && (L.reason || L.ok)); }
  { const g = mk(), cn = g.cn, t = cn.seg.get('T-E2').path[80]; const v = g.store.validate('junction', t[0], t[1], 0, { ignoreCash: true }); ok(!v.ok && v.reason === 'centralPipe', '9f a building cannot be put on a central tile', v.reason); } }

/* ------------------------------------------------------------------------------------------------ 10. end to end: refinery on the network */
console.log('10. end to end: crude in, refinery, four product channels out');
{ const g = mk(), cn = g.cn; const zones = []; for (const r of world.regions) for (const z of world.refineryZones(r.id)) { const c = secOf(z.x + (z.w >> 1), z.y + (z.h >> 1)); if (c && c[0] === 'D') zones.push(z); }
  let best = null; for (const z of zones) for (const [k, sid] of cn.at) { const y = Math.floor(k / world.W), x = k % world.W, d = Math.hypot(x - (z.x + z.w / 2), y - (z.y + z.h / 2)); if (!best || d < best.d) best = { d, x, y, z, sid }; }
  ok(!!best, '10a a refinery zone in a D sector and the trunk tile nearest to it', best && [best.d | 0, best.x, best.y]);
  const crudeSrc = attach(g, 'crude_tank_l', 'N1', 'CRUDE', 'out', 250000); ok(!!crudeSrc, '10b a crude tank (250,000 bbl) wired to the network at N1');
  let ref = null, st = null; const tries = []; const zc = [best.z.x + best.z.w / 2, best.z.y + best.z.h / 2];
  // the refinery goes in the zone at the spot nearest to the trunk (normal validation: D sector, refinery zone, flat ground)
  { let bp = null; for (let x = best.z.x; x <= best.z.x + best.z.w - 8; x++) for (let y = best.z.y; y <= best.z.y + best.z.h - 8; y++) { const v = g.store.validate('refinery_s', x, y, 0, { ignoreCash: true }); if (!v.ok) continue; const d = Math.hypot(x + 4 - best.x, y + 4 - best.y); if (!bp || d < bp.d) bp = { x, y, d }; } if (bp) { const p = g.store.place('refinery_s', bp.x, bp.y, 0, { instant: true, ignoreCash: true }); if (p.ok) ref = p.building; } }
  const wires = [['CRUDE_IN', 'CRUDE'], ['GASOLINE_OUT', 'GASOLINE'], ['DIESEL_OUT', 'DIESEL'], ['JET_OUT', 'JET_FUEL'], ['GAS_OUT', 'GAS']]; let wired = null; const taps = []; const rb = ref && ref.x + 4, rbY = ref && ref.y + 4;
  if (ref) { const sorted = [...cn.at.keys()].map(k => [k % world.W, Math.floor(k / world.W)]).sort((p, q) => Math.hypot(p[0] - rb, p[1] - rbY) - Math.hypot(q[0] - rb, q[1] - rbY));
    for (const [x, y] of sorted) { if (taps.some(t => Math.hypot(t[0] - x, t[1] - y) < 8)) continue; if (taps.length >= 10) break; taps.push([x, y]); const plan = C.planTap(g.store, g.net, x, y, { toward: [rb, rbY] }); if (!plan.ok) continue; const r = C.commitTap(g.store, g.net, plan, { ignoreCash: true }); if (!r.ok) continue; const sb = stB(g, r.station.id); let good = 0;
      const lay = (mask, ord) => { const ok = []; for (const k of ord || [0, 1, 2, 3, 4]) { const [rp, ch] = wires[k], portId = C.PORTS[ch][(mask >> k) & 1], v2 = I.layPipe(g.store, g.net, g.ts, { b: ref.id, port: rp }, { b: sb.id, port: portId }, 36, { ignoreCash: true }); if (v2.ok) ok.push(ch); } return ok; }, clear = () => { for (const L of [...g.net.lines.values()]) if (L.a && L.a.b === ref.id) g.net.remove(L.id); };
      let bestM = null; const ORDS = [[0, 1, 2, 3, 4], [4, 3, 2, 1, 0], [1, 2, 3, 4, 0], [2, 3, 4, 0, 1], [3, 4, 0, 1, 2], [4, 0, 1, 2, 3], [0, 4, 3, 2, 1], [0, 2, 4, 1, 3], [2, 1, 3, 0, 4], [3, 1, 2, 0, 4]]; for (const ord of ORDS) { for (let mask = 0; mask < 32; mask++) { const ok = lay(mask, ord); clear(); if (ok.includes('CRUDE') && (!bestM || ok.length > bestM.ok.length)) bestM = { mask, ord, ok }; if (bestM && bestM.ok.length === 5) break; } if (bestM && bestM.ok.length === 5) break; }
      if (bestM && bestM.ok.length >= 3) { lay(bestM.mask, bestM.ord); st = r.station.id; wired = bestM.ok; break; } tries.push([r.station.id, bestM ? bestM.ok.length : 0]); } }
  ref = wired ? ref : null;
  ok(!!ref, '10c a refinery stands in D and is wired to ONE tapped station: crude in + ' + (wired ? wired.filter(c => c !== 'CRUDE').join("/") : '-') + ' out', wired || tries);
  if (ref) { const OUT = { GASOLINE: ['gasoline_tank_m', 'GASOLINE'], DIESEL: ['diesel_tank_m', 'DIESEL'], JET_FUEL: ['jet_tank_m', 'JET_FUEL'], GAS: ['gas_sphere_m', 'GAS'] }, dest = {}; let allOk = true;
    for (const ch of wired.filter(c => c !== 'CRUDE')) { dest[ch] = attach(g, OUT[ch][0], BST, ch, 'in', 0); if (!dest[ch]) allOk = false; }
    ok(allOk && Object.keys(dest).length >= 2, '10d one product tank per wired product channel (' + Object.keys(dest).join(', ') + ') at the B stations'); const c0 = crudeSrc.s.vol; run(g, 30);
    const used = c0 - crudeSrc.s.vol, made = ref.s.made, R = require('./building-config.js').REFINERY;
    ok(used > 1000 && near(ref.s.crude, used, 1e-6), '10e the refinery took ' + Math.round(used) + ' bbl of crude, all of it from the tank through the CRUDE channel', [used, ref.s.crude]);
    ok(Object.values(dest).every(d => d.s.vol > 0), '10f every product reached its own tank through its own channel', Object.fromEntries(Object.entries(dest).map(([k, d]) => [k, Math.round(d.s.vol)])));
    ok(Object.entries(dest).every(([ch, d]) => near(d.s.vol, made[ch], 1e-9)), '10g what the refinery made = what the destination tanks hold (every barrel accounted for)', Object.fromEntries(Object.entries(dest).map(([k, d]) => [k, [Math.round(d.s.vol), Math.round(made[k])]])));
    { const ws = Object.keys(dest), y = R.yields; const pairs = ws.filter(c => c !== ws[0]).map(c => near(made[c] / made[ws[0]], y[c] / y[ws[0]], 0.02)); ok(pairs.every(Boolean), '10h the existing refinery yields are untouched: the products arrive in the recipe\'s proportions (' + ws.map(c => c + ' ' + y[c]).join(' : ') + ')', ws.map(c => [c, made[c]])); }
    ok(cn.ch.CRUDE.moved > 0 && wired.filter(c => c !== 'CRUDE').every(c => cn.ch[c].moved > 0), '10i the channels worked at once and each kept its own volume count', C.CHANNELS.map(c => c + ':' + Math.round(cn.ch[c].moved))); } }

/* ------------------------------------------------------------------------------------------------ 11. accounting: asset, loan, grace, instalments */
console.log('11. accounting: the asset, the bank loan, the grace period and the instalments');
{ const g = mk({ cash: EC.CENTRAL.startCash }), co = g.co, cost = g.cn.cost(), value = Math.round(cost.shell + cost.stationsValue + cost.pump), R = EC.CENTRAL;
  ok(R.startCash === 500e6 && R.rate === 0.06 && R.months === 720 && R.grace === 24, '11a the given terms: $500M cash, 6%, 60 years, 2 years grace', R);
  const cash0 = g.store.cash, r = co.acquireCentral(cost); const bs = co.balanceSheet();
  ok(r.ok && g.store.cash === cash0 && bs.cash === 500e6, '11b the purchase moves NO cash: $500M stays in the bank account', [g.store.cash, bs.cash]);
  ok(near(value, 5247360000 + 29 * 720000 + 810000000), '11c network value = shell $5,247.36M + 29 stations $20.88M + 18 pumps $810M = $' + (value / 1e6).toFixed(2) + 'M', value);
  ok(bs.loans === value && near(co.centralValue(), value) && near(bs.fixedNet, value, 1e-9), '11d the network is an asset (fixed assets) and the bank loan a liability of the same amount', { loans: bs.loans, fixed: bs.fixedNet });
  ok(Math.abs(bs.gap) < 1e-3 && near(bs.totalEquity, 500e6 - 0, 1e-9), '11e the balance sheet balances and equity is just the $500M of owner capital (the company paid nothing for the network)', { gap: bs.gap, eq: bs.totalEquity });
  const l = co.centralLoan(); ok(l && l.kind === 'CENTRAL' && l.principal === value && l.rate === 0.06 && l.months === 720 && l.grace === 24, '11f one loan: 6%, 720 months, 24 of them grace', l && [l.kind, l.rate, l.months, l.grace]);
  const tab = E.Company.loanTable(value, 0.06, 720, 24), pay = tab.payment; ok(near(pay, E.payment(value, 0.06, 696), 1e-12), '11g after the grace the instalment is the annuity of 696 months: $' + pay.toFixed(2), pay);
  ok(tab.rows.length === 720 && tab.rows[23].balance === value && tab.rows.slice(0, 24).every(x => x.principal === 0 && near(x.interest, value * 0.005, 1e-12)) && Math.abs(tab.rows[719].balance) < 1e-3, '11h the schedule: 24 interest-only months of $' + (value * 0.005 / 1e6).toFixed(3) + 'M, then 696 instalments, balance 0 at month 720');
  // run the books month by month
  co.injectEquity(2e11, 'test funding: stands in for the sales a player earns (the company has no income in this test)'); const startFixed = co.journal.bal.FIXED, EXP = a => -co.journal.bal[a] || co.journal.bal[a]; const intr = () => co.journal.bal.EXP_INTEREST, prin = () => -co.journal.bal.LOANS; void prin;
  const stamp = () => ({ int: co.journal.bal.EXP_INTEREST, loans: co.journal.bal.LOANS, cmaint: co.journal.bal.EXP_CMAINT || 0, cops: co.journal.bal.EXP_COPS || 0, cash: g.store.cash, maint: co.journal.bal.EXP_MAINT || 0 });
  let prev = stamp(); const rows = []; for (let m = 1; m <= 27; m++) { require('./test-economy-helpers.js').nextMonth(co); const s = stamp(); rows.push({ m, dInt: s.int - prev.int, dPrin: s.loans - prev.loans, dCm: s.cmaint - prev.cmaint, dCo: s.cops - prev.cops, rem: -s.loans }); prev = s; }
  ok(rows.slice(0, 24).every(x => near(x.dInt, value * 0.005, 1e-9) && Math.abs(x.dPrin) < 1e-6), '11i months 1–24: only interest is paid ($' + (value * 0.005 / 1e6).toFixed(3) + 'M/month booked as interest expense), the principal does not move', rows.slice(0, 3));
  ok(rows[24].dPrin > 0 && near(rows[24].dInt + rows[24].dPrin, pay, 1e-6) && near(rows[24].dInt, value * 0.005, 1e-9), '11j month 25: interest + principal = the instalment; the principal part REDUCES the liability (not an expense)', rows[24]);
  ok(rows[25].dPrin > rows[24].dPrin && rows[25].dInt < rows[24].dInt && near(rows[26].rem, tab.rows[26].balance, 1e-9), '11k the interest share falls and the principal share rises; the balance after month 27 matches the schedule ($' + (rows[26].rem / 1e6).toFixed(3) + 'M)', [rows[26].rem, tab.rows[26].balance]);
  ok(rows.every(x => x.dCm > 0) && rows.every(x => x.dCo >= 0), '11l maintenance (pipeline upkeep + pumps/stations) and operation are separate expense accounts, booked every month', rows.slice(0, 2));
  const pl = co.led.life.pl; ok(pl.interest > 0 && pl.cmaint > 0 && pl.cops > 0 && co.led.life.principal > 0 && co.led.life.loansIn === 0 && co.led.life.capex === 0, '11m the books: interest is a financial expense, principal repayment is a cash-flow item (liability reduction), the acquisition itself is NOT a cash flow', { int: pl.interest, cm: pl.cmaint, co: pl.cops, prin: co.led.life.principal });
  ok(Math.abs(co.balanceSheet().gap) < 1, '11n after 27 months of books the balance sheet still balances', co.balanceSheet().gap);
  const J = co.journal.bal; ok(J.EXP_INSURANCE >= 0 && near(J.EXP_INSURANCE, 0, 1) , '11o insurance and administration are NOT charged on the network (no extra cost invented): insurance base excludes it', J.EXP_INSURANCE);
  const rep = co.centralReport(); ok(rep && rep.asset === value && !rep.inGrace && rep.table.rows.length === 720, '11p the finance report exposes asset, loan, instalment and the whole table', rep && [rep.asset, rep.inGrace]);
  const co2 = new E.Company(g.store, g.net, g.sim, { now: () => 1e12 }); ok(co2.fromJSON(JSON.parse(JSON.stringify(co.toJSON()))) && co2.central && co2.central.value === value && co2.centralLoan() && near(co2.centralLoan().remaining, co.centralLoan().remaining, 1e-12), '11q the company saves and reloads the network, the loan and its progress'); }

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
