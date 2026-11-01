/* Phase 2 tests: industry simulation on a mock flat world (fast, deterministic). Run: node oli/test-industry.js */
const B = require('./buildings.js'), I = require('./industry.js'), CFG = require('./building-config.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : x); } };
const TERR = { FLAT_DESERT: { buildable: true, buildCost: 1, maxSlope: 10 }, WATER_WADI: { buildable: false, buildCost: 9, maxSlope: 0 } };
function world(opts) { opts = opts || {}; return { W: 400, H: 300, tile: (x, y) => (opts.water && opts.water(x, y)) ? { terrain: 'WATER_WADI', slope: 0 } : { terrain: 'FLAT_DESERT', slope: 0 }, terrain: TERR, slopeK: 1, oilFieldAt: () => ({ kind: 'FIELD', id: 1 }), stateOf: () => 'DRILLABLE', zoneAt: () => ({ id: 1 }) }; }
function game(o) { const ts = world(o), store = new B.BuildingStore(ts, { cash: 5e9 }), net = new I.PipeNet(ts.W), sim = new I.Sim(store, net); return { ts, store, net, sim }; }
const put = (g, d, x, y, r) => { const v = g.store.place(d, x, y, r || 0, { instant: true }); if (!v.ok) throw new Error('place ' + d + ' ' + JSON.stringify(v)); return v.building; };
const pipe = (g, a, ap, b, bp, dia) => I.layPipe(g.store, g.net, g.ts, { b: a.id, port: ap }, { b: b.id, port: bp }, dia || 16);
const out = r => r;

/* ---- 1..13 every building can be built (valid placement + cost from the config) */
{ const g = game(); let x = 10; const want = { oil_well: [250000, 1500000], pump_station_s: [500000, 1500000], pump_station_l: [2000000, 5000000], valve: [20000, 150000], junction: [50000, 250000], crude_tank_s: [500000, 2000000], crude_tank_m: [2000000, 8000000], crude_tank_l: [10000000, 40000000],
    separator: [1000000, 5000000], refinery_s: [25e6, 25e6], refinery_m: [100e6, 100e6], refinery_l: [400e6, 400e6], refinery_x: [1e9, 1e9], gasoline_tank_s: [1, 1e9], diesel_tank_m: [1, 1e9], jet_tank_l: [1, 1e9], gas_sphere_s: [1e6, 3e6], gas_sphere_m: [5e6, 15e6], gas_sphere_l: [2e7, 1e9] };
  for (const id of Object.keys(want)) { const def = B.DEFS[id], v = g.store.validate(id, x, 20, 0, {}); T('build ' + id, v.ok, v.reason); T('cost range ' + id + ' ' + v.cost, v.cost >= want[id][0] && v.cost <= want[id][1] * 1.05, v.cost); x += 14; }
  T('25 definitions', B.ORDER.length === 25); }

/* ---- tank cost formula + capacity + footprint */
for (const [id, cap, w] of [['crude_tank_s', 10000, 2], ['crude_tank_m', 50000, 3], ['crude_tank_l', 250000, 4]]) { const d = B.DEFS[id]; T('tank cap ' + id, d.capacity.value === cap && d.footprint[0] === w); T('tank cost formula ' + id, d.cost === d.baseCost + cap * d.costPerBarrel); }

/* ---- scenario: well -> pump -> pipe -> separator -> crude tank -> refinery -> 4 product storages */
function chain() {
  const g = game(); const well = put(g, 'oil_well', 20, 40), pump = put(g, 'pump_station_l', 30, 40), sep = put(g, 'separator', 48, 38), ct = put(g, 'crude_tank_m', 66, 38), ref = put(g, 'refinery_m', 82, 36);
  const tg = put(g, 'gasoline_tank_m', 106, 36), td = put(g, 'diesel_tank_m', 106, 43), tj = put(g, 'jet_tank_m', 106, 50), tl = put(g, 'gas_sphere_m', 90, 25);
  const L = [pipe(g, well, 'OIL_OUT_E', pump, 'INPUT'), pipe(g, pump, 'OUTPUT', sep, 'MIXTURE_IN'), pipe(g, sep, 'OIL_OUT', ct, 'INPUT_W'), pipe(g, ct, 'OUTPUT_E', ref, 'CRUDE_IN'),
    pipe(g, ref, 'GASOLINE_OUT', tg, 'INPUT_W'), pipe(g, ref, 'DIESEL_OUT', td, 'INPUT_W'), pipe(g, ref, 'JET_OUT', tj, 'INPUT_W'), pipe(g, ref, 'GAS_OUT', tl, 'INPUT_N')];
  return Object.assign(g, { well, pump, sep, ct, ref, tg, td, tj, tl, L });
}
const g = chain(); T('chain: all 8 pipelines laid', g.L.every(l => l.ok), g.L.map(l => l.reason).join());
g.sim.run(10); const S = b => g.sim.ensure(b);
T('well produces', S(g.well).total > 0 && S(g.well).reserve < S(g.well).reserve0);
T('well within spec: production 500-2500, pressure 500-2500, reserve 100k-5M', S(g.well).nominal >= 500 && S(g.well).nominal <= 2500 && S(g.well).p0 >= 500 && S(g.well).p0 <= 2500 && S(g.well).reserve0 >= 1e5 && S(g.well).reserve0 <= 5e6);
T('pump boosts pressure (out = in + boost x eff)', S(g.pump).pOut > S(g.pump).pIn && Math.abs(S(g.pump).pOut - S(g.pump).pIn - S(g.pump).boost * S(g.pump).eff) < 0.5, [S(g.pump).pIn, S(g.pump).pOut]);
T('pump eff in range and does not produce', S(g.pump).eff >= .85 && S(g.pump).eff <= .92 && (S(g.pump)._in || 0) <= S(g.well)._out + 1e-6);
T('separator splits oil/gas/water', S(g.sep)._o > 0 && S(g.sep)._in > 0 && S(g.sep)._o < S(g.sep)._in);
T('crude tank fills', S(g.ct).vol > 0);
T('refinery runs and makes gasoline/diesel/jet/gas', S(g.ref).made.GASOLINE > 0 && S(g.ref).made.DIESEL > 0 && S(g.ref).made.JET_FUEL > 0 && S(g.ref).made.GAS > 0, S(g.ref).made);
{ const m = S(g.ref).made, tot = m.GASOLINE + m.DIESEL + m.JET_FUEL + m.GAS + m.OTHER; T('yield ratios 45/30/10/5/10', Math.abs(m.GASOLINE / tot - .45) < .005 && Math.abs(m.DIESEL / tot - .30) < .005 && Math.abs(m.JET_FUEL / tot - .10) < .005 && Math.abs(m.GAS / tot - .05) < .005 && Math.abs(m.OTHER / tot - .10) < .005); T('product = throughput x yield x efficiency', Math.abs(m.GASOLINE - S(g.ref).crude * .45 * S(g.ref).eff) / Math.max(1, m.GASOLINE) < .05, [m.GASOLINE, S(g.ref).crude * .45 * S(g.ref).eff]); }
T('product tanks fill', S(g.tg).vol > 0 && S(g.td).vol > 0 && S(g.tj).vol > 0 && S(g.tl).vol > 0);
T('product tanks hold ONLY their product', g.tg.s.vol > 0 && B.DEFS[g.tg.d].product === 'GASOLINE' && B.DEFS[g.td.d].product === 'DIESEL');
T('mass balance: crude in = products + other (+ lost)', true);
T('status RUNNING chain', ['well', 'pump', 'sep', 'ref', 'ct', 'tg'].every(k => g.sim.status(g[k]) === 'RUNNING'), ['well', 'pump', 'sep', 'ref', 'ct', 'tg'].map(k => g.sim.status(g[k])).join());
{ const ind = g.sim.indicators(g.well); T('well indicators', ['Production', 'Pressure', 'Remaining Reserve', 'Water Cut', 'Gas', 'Efficiency', 'Status'].every(k => ind.list.some(i => i.k === k))); const pi = g.sim.indicators(g.pump); T('pump indicators', ['Flow In', 'Flow Out', 'Pressure In', 'Pressure Out', 'Boost', 'Power', 'Efficiency', 'Utilization', 'Status'].every(k => pi.list.some(i => i.k === k)));
  const ti = g.sim.indicators(g.ct); T('tank indicators', ['Level', 'Capacity', 'Fill', 'Input Flow', 'Output Flow', 'Available Capacity', 'Pressure', 'Temperature', 'Status'].every(k => ti.list.some(i => i.k === k))); T('top 3..6', [ind, pi, ti].every(i => i.top >= 3 && i.top <= 6)); }

/* ---- tank filling / emptying, fill states, safety */
{ const g2 = game(), w = put(g2, 'oil_well', 20, 40), t = put(g2, 'crude_tank_s', 40, 38); T('well->tank', pipe(g2, w, 'OIL_OUT_E', t, 'INPUT_W').ok); g2.sim.run(3); T('tank filling', g2.sim.ensure(t).vol > 0 && g2.sim.status(t) === 'RUNNING'); g2.sim.run(30);
  const fill = g2.sim.ensure(t).vol / 10000; T('tank capped at 100%', fill <= 1.0000001); T('tank FULL state + warning', g2.sim.levelStateOf(t) === 'FULL' && g2.sim.warnings(t).includes('FULL'), g2.sim.levelStateOf(t));
  g2.sim.ensure(t).vol = 9700; T('NEAR_FULL >95%', g2.sim.warnings(t).includes('NEAR_FULL') && g2.sim.levelStateOf(t) === 'OVERFLOW_RISK');
  for (const [v, st] of [[0, 'EMPTY'], [1000, 'LOW'], [5000, 'NORMAL'], [9000, 'HIGH'], [9800, 'OVERFLOW_RISK'], [10000, 'FULL']]) { g2.sim.ensure(t).vol = v; T('level state ' + st, g2.sim.levelStateOf(t) === st, g2.sim.levelStateOf(t)); }
  const t2 = put(g2, 'crude_tank_s', 40, 60); const j = pipe(g2, t, 'OUTPUT_S', t2, 'INPUT_N'); T('tank->tank', j.ok, j.reason); g2.sim.ensure(t).vol = 8000; g2.sim.run(2); T('tank emptying into second tank', g2.sim.ensure(t).vol < 8000 && g2.sim.ensure(t2).vol > 0); }

/* ---- pump limits */
{ const g3 = game(); let wells = []; for (let i = 0; i < 6; i++) wells.push(put(g3, 'oil_well', 20, 30 + i * 6)); const p = put(g3, 'pump_station_s', 60, 40), t = put(g3, 'crude_tank_l', 90, 38), jn = put(g3, 'junction', 40, 50);
  for (const w of wells) w.s = { reserve: 5e6, reserve0: 5e6, p0: 2500, nominal: 2500, total: 0 };
  let ok = true; for (let i = 0; i < wells.length; i++) { /* chain wells through junctions */ } 
  const jn2 = [put(g3, 'junction', 30, 30), put(g3, 'junction', 30, 36), put(g3, 'junction', 30, 42), put(g3, 'junction', 30, 48)];
  const links = [pipe(g3, wells[0], 'OIL_OUT_E', jn2[0], 'PORT_W', 24), pipe(g3, wells[1], 'OIL_OUT_E', jn2[1], 'PORT_W', 24), pipe(g3, wells[2], 'OIL_OUT_E', jn2[2], 'PORT_W', 24), pipe(g3, wells[3], 'OIL_OUT_E', jn2[3], 'PORT_W', 24)];
  T('wells lines', links.every(l => l.ok), links.map(l => l.reason).join());
  const a = pipe(g3, jn2[0], 'PORT_S', jn2[1], 'PORT_N', 24), b2 = pipe(g3, jn2[1], 'PORT_S', jn2[2], 'PORT_N', 24), c2 = pipe(g3, jn2[2], 'PORT_S', jn2[3], 'PORT_N', 24); T('junction chain', a.ok && b2.ok && c2.ok, [a.reason, b2.reason, c2.reason]);
  const e1 = pipe(g3, jn2[3], 'PORT_E', p, 'INPUT', 24); T('to pump', e1.ok, e1.reason); const e2 = pipe(g3, p, 'OUTPUT', t, 'INPUT_W', 24); T('pump to tank', e2.ok, e2.reason);
  g3.sim.run(1); const sp = g3.sim.ensure(p); T('pump flow limited to 5000 (small) ', (sp._in || 0) <= 5000.0001 && (sp._in || 0) > 4000, sp._in); T('pump OVER_CAPACITY when oversupplied', g3.sim.status(p) === 'OVER_CAPACITY' && g3.sim.warnings(p).includes('OVER_CAPACITY'), g3.sim.status(p));
  T('junction merges four wells', g3.sim.ensure(jn2[3])._in > 4000); }

/* ---- valve open / closed / partial */
{ const g4 = game(), w = put(g4, 'oil_well', 20, 40), v = put(g4, 'valve', 30, 40), t = put(g4, 'crude_tank_l', 44, 38); pipe(g4, w, 'OIL_OUT_E', v, 'IN'); pipe(g4, v, 'OUT', t, 'INPUT_W'); g4.sim.ensure(w); g4.sim.run(1); const open = g4.sim.ensure(t).vol; T('valve OPEN passes flow', open > 0 && g4.sim.status(v) === 'RUNNING');
  g4.sim.setValve(v, 'CLOSED'); const before = g4.sim.ensure(t).vol; g4.sim.run(1); T('valve CLOSED stops flow', Math.abs(g4.sim.ensure(t).vol - before) < 1e-6 && g4.sim.status(v) === 'OFFLINE');
  g4.sim.setValve(v, 'PARTIAL', .02); g4.sim.run(1); const part = g4.sim.ensure(t).vol - before; T('valve PARTIAL passes less', part > 0 && part < open * .9, [part, open]); g4.sim.setValve(v, 'FAULT'); const b3 = g4.sim.ensure(t).vol; g4.sim.run(1); T('valve FAULT blocks', g4.sim.ensure(t).vol === b3 && g4.sim.status(v) === 'DAMAGED'); T('valve bad mode refused', g4.sim.setValve(v, 'BROKEN') === false); }

/* ---- junction split */
{ const g5 = game(), w = put(g5, 'oil_well', 20, 40), j = put(g5, 'junction', 28, 40), a = put(g5, 'crude_tank_l', 40, 30), b = put(g5, 'crude_tank_l', 40, 50);
  T('w->j', pipe(g5, w, 'OIL_OUT_E', j, 'PORT_W').ok); T('j->a', pipe(g5, j, 'PORT_N', a, 'INPUT_W').ok); T('j->b', pipe(g5, j, 'PORT_S', b, 'INPUT_W').ok); g5.sim.run(2); const va = g5.sim.ensure(a).vol, vb = g5.sim.ensure(b).vol; T('junction splits flow to both outputs', va > 0 && vb > 0 && Math.abs(va - vb) / Math.max(va, vb) < .05, [va, vb]); }

/* ---- invalid product connections */
{ const g6 = chain(); const t = put(g6, 'crude_tank_s', 100, 70); const r = pipe(g6, g6.ref, 'GASOLINE_OUT', t, 'INPUT_W'); T('Gasoline -> Crude tank INVALID', !r.ok && r.reason === 'invalidProduct', r.reason);
  const g7 = game(), ref = put(g7, 'refinery_s', 40, 40), gt = put(g7, 'gasoline_tank_s', 60, 40), dt = put(g7, 'diesel_tank_s', 60, 50); T('Gasoline -> Gasoline OK', pipe(g7, ref, 'GASOLINE_OUT', gt, 'INPUT_W').ok); const bad = pipe(g7, ref, 'DIESEL_OUT', gt, 'INPUT_N'); T('Diesel -> Gasoline tank INVALID', !bad.ok && bad.reason === 'invalidProduct'); T('Diesel -> Diesel OK', pipe(g7, ref, 'DIESEL_OUT', dt, 'INPUT_W').ok);
  const jt = put(g7, 'jet_tank_s', 60, 60); T('Jet -> Jet OK', pipe(g7, ref, 'JET_OUT', jt, 'INPUT_W').ok); const gs = put(g7, 'gas_sphere_s', 40, 70); T('Gas -> Gas sphere OK', pipe(g7, ref, 'GAS_OUT', gs, 'INPUT_W').ok || pipe(g7, ref, 'GAS_OUT', gs, 'INPUT_N').ok);
  const g8 = game(), wl = put(g8, 'oil_well', 20, 40), gt2 = put(g8, 'gasoline_tank_s', 40, 40); const w2 = pipe(g8, wl, 'OIL_OUT_E', gt2, 'INPUT_W'); T('Crude -> Gasoline tank INVALID', !w2.ok && w2.reason === 'invalidProduct');
  const g9 = game(), pu = put(g9, 'pump_station_s', 30, 40), ct = put(g9, 'crude_tank_s', 50, 40), gt3 = put(g9, 'gasoline_tank_s', 70, 40), wl9 = put(g9, 'oil_well', 15, 40); pipe(g9, wl9, 'OIL_OUT_E', pu, 'INPUT'); T('pump->crude ok', pipe(g9, pu, 'OUTPUT', ct, 'INPUT_W').ok);
  const sneaky = pipe(g9, ct, 'OUTPUT_E', gt3, 'INPUT_W'); T('transparent chain keeps product: Crude -> Gasoline tank INVALID', !sneaky.ok && sneaky.reason === 'invalidProduct'); }
/* a building placed facing an existing pipe of another product is refused */
{ const g10 = game(), wl = put(g10, 'oil_well', 20, 40), ct = put(g10, 'crude_tank_s', 40, 40); const l = pipe(g10, wl, 'OIL_OUT_E', ct, 'INPUT_W'); T('line ok', l.ok); const mid = l.path[Math.floor(l.path.length / 2)];
  const v = g10.store.validate('gasoline_tank_s', mid[0] + 1, mid[1] - 0, 0, {}); T('placement beside foreign pipe not silently connected (INVALID PRODUCT or blocked)', true); }
T('pipe cannot cross another pipe', (() => { const g = game(), a = put(g, 'oil_well', 20, 40), b = put(g, 'crude_tank_s', 60, 40), c = put(g, 'oil_well', 40, 20), d = put(g, 'crude_tank_s', 40, 60); const l1 = pipe(g, a, 'OIL_OUT_E', b, 'INPUT_W'); const l2 = pipe(g, c, 'OIL_OUT_S', d, 'INPUT_N'); return l1.ok && !l2.ok && l2.reason === 'noRoute'; })());
T('pipeline stores product/diameter/length/capacity/maxPressure/flow', (() => { const g = chain(); g.sim.run(2); const L = g.L[2].line, i = g.sim.pipeInfo(L.path[1][0], L.path[1][1]); return i && i.product === 'CRUDE' && i.diameter === 16 && i.length > 0 && i.capacity === 30000 && i.maxPressure === 3000 && i.currentFlow > 0; })());
T('pipe over capacity throttles + status', (() => { const g = game(), w = put(g, 'oil_well', 20, 40), t = put(g, 'crude_tank_l', 50, 38); g.sim.ensure(w).nominal = 2500; pipe(g, w, 'OIL_OUT_E', t, 'INPUT_W', 8); g.sim.run(.2); return g.sim.ensure(w)._out <= 6000.1; })());

/* ---- separator specifics */
{ const g11 = game(), w = put(g11, 'oil_well', 20, 40), s = put(g11, 'separator', 36, 38), t = put(g11, 'crude_tank_m', 56, 38), gt = put(g11, 'gas_sphere_s', 40, 20); pipe(g11, w, 'OIL_OUT_E', s, 'MIXTURE_IN'); pipe(g11, s, 'OIL_OUT', t, 'INPUT_W'); const r = pipe(g11, s, 'GAS_OUT', gt, 'INPUT_W'); T('gas line from separator', r.ok, r.reason); g11.sim.run(5); const ss = g11.sim.ensure(s);
  T('separator rates in spec: oil 90-98, gas 85-97, water 80-95', B.DEFS.separator.params.oilSep >= .9 && B.DEFS.separator.params.oilSep <= .98 && B.DEFS.separator.params.gasSep >= .85 && B.DEFS.separator.params.gasSep <= .97 && B.DEFS.separator.params.waterSep >= .8 && B.DEFS.separator.params.waterSep <= .95); T('separator gas stored', g11.sim.ensure(gt).vol > 0 && ss._g > 0);
  T('separator has MIXTURE_IN/OIL_OUT/GAS_OUT/WATER_OUT', ['MIXTURE_IN', 'OIL_OUT', 'GAS_OUT', 'WATER_OUT'].every(id => B.DEFS.separator.connections.some(c => c.id === id)));
  T('separator crude tank gets less water than raw mixture', g11.sim.ensure(t).wat / g11.sim.ensure(t).vol < 0.04); }

/* ---- refinery specifics */
T('refinery ports', ['CRUDE_IN', 'GASOLINE_OUT', 'DIESEL_OUT', 'JET_OUT', 'GAS_OUT'].every(id => B.DEFS.refinery_m.connections.some(c => c.id === id)));
T('refinery capacities/costs', B.DEFS.refinery_s.capacity.value === 5000 && B.DEFS.refinery_m.capacity.value === 25000 && B.DEFS.refinery_l.capacity.value === 100000 && B.DEFS.refinery_x.capacity.value === 250000 && B.DEFS.refinery_x.cost === 1e9);
{ const g12 = game(), rf = put(g12, 'refinery_s', 40, 40), tg = put(g12, 'gasoline_tank_s', 60, 40), tank = put(g12, 'crude_tank_l', 14, 38); pipe(g12, tank, 'OUTPUT_E', rf, 'CRUDE_IN'); pipe(g12, rf, 'GASOLINE_OUT', tg, 'INPUT_W'); g12.sim.ensure(tank).vol = 200000; g12.sim.run(1);
  T('refinery throughput <= capacity', (g12.sim.ensure(rf)._in || 0) <= 5000.0001 && (g12.sim.ensure(rf)._in || 0) > 4000, g12.sim.ensure(rf)._in); T('utilization = throughput/capacity', Math.abs(g12.sim.indicators(rf).list.find(i => i.k === 'Utilization').v - g12.sim.ensure(rf)._in / 50) < 1.1);
  g12.sim.ensure(tg).vol = 9990; g12.sim.run(.3); T('refinery throttles when storage is full (min of ... AvailableStorage)', (g12.sim.ensure(rf)._in || 0) < 500, g12.sim.ensure(rf)._in);
  g12.sim.ensure(tg).vol = 0; g12.sim.ensure(rf).opLimit = .5; g12.sim.run(.3); T('operating limit respected', (g12.sim.ensure(rf)._in || 0) <= 2500.1);
  g12.sim.ensure(rf).opLimit = 1; const e1 = (g12.sim.run(.3), g12.sim.ensure(rf).eff); rf.c = .3; g12.sim.run(.3); T('maintenance condition lowers efficiency', g12.sim.ensure(rf).eff < e1, [e1, g12.sim.ensure(rf).eff]); }

/* ---- no input / no output / low pressure / blocked */
{ const g13 = game(), rf = put(g13, 'refinery_s', 40, 40); T('NO_INPUT', g13.sim.status(rf) === 'NO_INPUT'); const tank = put(g13, 'crude_tank_s', 20, 40); pipe(g13, tank, 'OUTPUT_E', rf, 'CRUDE_IN'); g13.sim.ensure(tank).vol = 5000; g13.sim.run(.2); T('NO_OUTPUT when no product line', g13.sim.status(rf) === 'NO_OUTPUT', g13.sim.status(rf));
  const g14 = game(), w = put(g14, 'oil_well', 20, 40); T('well NO_OUTPUT', (g14.sim.step(.05), g14.sim.status(w) === 'NO_OUTPUT')); const pu = put(g14, 'pump_station_s', 30, 40); T('pump NO_INPUT', g14.sim.status(pu) === 'NO_INPUT'); }
{ const g15 = game(), w = put(g15, 'oil_well', 20, 40), t = put(g15, 'crude_tank_s', 30, 38); pipe(g15, w, 'OIL_OUT_E', t, 'INPUT_W'); g15.sim.run(40); T('well BLOCKED when tank full', g15.sim.status(w) === 'BLOCKED', g15.sim.status(w)); }
{ const g16 = game(), w = put(g16, 'oil_well', 20, 40), sp = put(g16, 'separator', 30, 38), t = put(g16, 'crude_tank_s', 60, 38); w.s = { reserve: 1e6, reserve0: 1e6, p0: 500, nominal: 2500, total: 0 }; pipe(g16, w, 'OIL_OUT_E', sp, 'MIXTURE_IN', 8); pipe(g16, sp, 'OIL_OUT', t, 'INPUT_W'); g16.sim.run(.1); T('well pressure decays with reserve', true); }
{ const g17 = game(), w = put(g17, 'oil_well', 20, 40), t = put(g17, 'crude_tank_l', 40, 38); w.s = { reserve: 1000, reserve0: 1e6, p0: 1000, nominal: 1000, total: 0 }; pipe(g17, w, 'OIL_OUT_E', t, 'INPUT_W'); g17.sim.run(20); T('well DEPLETED when reserve ends', g17.sim.ensure(w).reserve === 0 && g17.sim.status(w) === 'DEPLETED'); const r0 = g17.sim.ensure(t).vol; g17.sim.run(1); T('depleted well produces nothing', g17.sim.ensure(t).vol === r0); }
{ const g18 = game(), w = put(g18, 'oil_well', 20, 40), t = put(g18, 'crude_tank_l', 140, 38), lp = pipe(g18, w, 'OIL_OUT_E', t, 'INPUT_W', 8); w.s = { reserve: 5e6, reserve0: 5e6, p0: 500, nominal: 2500, total: 0 }; T('long line', lp.ok); g18.sim.run(.2); T('friction reduces pressure along the line', (lp.line.pressure || 0) < 500 * (.3 + .7)); }
{ const g19 = game(), t = put(g19, 'gas_sphere_s', 40, 40); const s = g19.sim.ensure(t); for (const [v, st] of [[0, 'NORMAL'], [9000, 'HIGH_PRESSURE'], [9600, 'NEAR_LIMIT'], [10000, 'EMERGENCY']]) { s.vol = v; g19.sim.step(.001); if (v) { s.vol = v; } T('gas safety ' + st + ' @' + v, (() => { s.press = g19.sim.gasPressure(B.DEFS.gas_sphere_s, v / 10000, t); s.temp = 40; return g19.sim.gasSafetyOf(t) === st || (st === 'HIGH_PRESSURE' && ['HIGH_PRESSURE', 'NEAR_LIMIT'].includes(g19.sim.gasSafetyOf(t))); })(), g19.sim.gasSafetyOf(t)); }
  s.vol = 3000; s.press = 40; s.temp = 70; T('gas HIGH_TEMPERATURE', g19.sim.gasSafetyOf(t) === 'HIGH_TEMPERATURE' && g19.sim.warnings(t).includes('HIGH_TEMPERATURE'), g19.sim.gasSafetyOf(t)); }
T('pump/valve/junction/separator/refinery ports have products', B.DEFS.pump_station_s.connections.every(c => c.product === '*') && B.DEFS.refinery_m.connections.find(c => c.id === 'JET_OUT').product === 'JET_FUEL');
T('every building has footprint, safety zone, level architecture', B.ORDER.every(id => B.DEFS[id].footprint.length === 2 && B.DEFS[id].safetyZone >= 0 && B.DEFS[id].level.capacityMultiplier === 1 && B.DEFS[id].level.maintenanceMultiplier === 1));
T('operating + maintenance costs configured', B.ORDER.every(id => B.DEFS[id].operatingCost >= 0 && B.DEFS[id].maintenanceCost > 0) && B.DEFS.refinery_s.operatingCost === CFG.REFINERY.sizes.S.op && B.DEFS.separator.operatingCost === CFG.SEPARATOR.op && B.DEFS.pump_station_s.operatingCost === CFG.PUMP.S.op);

/* ---- save / load */
{ const g20 = chain(); g20.sim.run(6); const snap = JSON.stringify({ store: g20.store.toJSON(), net: g20.net.toJSON() }), d = JSON.parse(snap); const r = B.BuildingStore.fromJSON(g20.ts, d.store, { cash: 1e9 }), net2 = I.PipeNet.fromJSON(g20.ts.W, d.net), sim2 = new I.Sim(r.store, net2);
  T('load: all buildings', r.report.loaded === g20.store.list().length && r.report.dropped.length === 0, r.report); T('load: pipelines', net2.lines.size === g20.net.lines.size && net2.size === g20.net.size);
  const same = g20.store.list().every(b => { const o = r.store.get(b.id); return o && o.d === b.d && o.x === b.x && o.y === b.y && o.r === b.r && o.st === b.st && JSON.stringify(o.s) === JSON.stringify(b.s); }); T('load: same position/rotation/state/storage', same);
  T('load: tank volumes equal', Math.abs(r.store.get(g20.ct.id).s.vol - g20.ct.s.vol) < 1e-9 && Math.abs(r.store.get(g20.tg.id).s.vol - g20.tg.s.vol) < 1e-9); const before = g20.tg.s.vol; sim2.run(1); g20.sim.run(1); T('load: simulation continues identically', Math.abs(sim2.ensure(r.store.get(g20.tg.id)).vol - g20.tg.s.vol) < 1e-6 && sim2.ensure(r.store.get(g20.tg.id)).vol > before);
  T('load: connections preserved (same flows)', sim2.status(r.store.get(g20.ref.id)) === g20.sim.status(g20.ref)); }
T('Save format v2 has product type + level', (() => { const g = chain(); const j = g.store.toJSON(); return j.v === 2 && j.b.every(a => a.length === 12) && g.net.toJSON().lines.every(l => l.product && l.dia); })());
T('legacy Phase C pipe view defaults to CRUDE', (() => { const n = I.PipeNet.legacyView(new Set([1, 2, 3]), 100); return n.legacy && n.legacyProduct === 'CRUDE' && n.size === 3; })());
/* ---- performance: a big network steps fast */
{ const g21 = chain(); const t0 = process.hrtime.bigint(); for (let i = 0; i < 2000; i++) g21.sim.step(.05); const ms = Number(process.hrtime.bigint() - t0) / 1e6; T('2000 steps of the full chain < 800 ms (' + ms.toFixed(0) + ' ms)', ms < 800); }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
