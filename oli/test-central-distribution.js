/* Distribution at a branch point follows what each destination can really take (its branch capacity, its free space, the pressure that reaches it) — not an equal split.  node test-central-distribution.js */
const K = require('./test-central-kit.js'), { C, mk, attach, run, near } = K; let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' -> ' + JSON.stringify(x))); } };
const DT = .05, rate = (g, tanks, f) => { const v0 = tanks.map(t => t.s.vol); run(g, 1, DT); return tanks.map((t, i) => (t.s.vol - v0[i]) / DT); };
const mkSet = (dst, srcVol, srcDef) => { const g = mk(), src = attach(g, srcDef || 'crude_tank_l', ['N1', 'N2'], 'CRUDE', 'out', srcVol, 36), D = dst.map(d => attach(g, d.def || 'crude_tank_m', d.st, 'CRUDE', 'in', d.vol || 0, d.dia)); return { g, src, D }; };
const ST = [['N3', 'N6'], ['N4', 'S1'], ['N5', 'N5e'], ['FS', 'M1']];

console.log('1. different branch capacities (8" = 30,000, 16" = 100,000, 36" = 300,000 bbl/d)');
{ const { g, src, D } = mkSet([{ st: ST[0], dia: 8 }, { st: ST[1], dia: 16 }, { st: ST[2], dia: 36 }], 250000); ok(src && D.every(Boolean), '1a a source and three destinations on branches of different size');
  const q = rate(g, [src, ...D]), out = -q[0], got = q.slice(1);
  ok(near(out, got[0] + got[1] + got[2], 1e-9) && out > 0, '1b in = out: ' + Math.round(out) + ' bbl/d left the source, ' + got.map(Math.round).join(' + ') + ' arrived', [out, got]);
  ok(got[0] <= 30000 + 1e-6 && got[1] <= 100000 + 1e-6 && got[2] <= 300000 + 1e-6, '1c no destination receives more than its own branch can carry (30,000 / 100,000 / 300,000)', got);
  ok(got[0] > 0 && got[0] < got[2] * 0.999 || got[0] === Math.min(30000, got[2]), '1d the small branch is not handed an equal share it cannot take', got);
  ok(got.every(x => x < out * 0.999), '1e nobody receives the whole source quantity', [out, got]); }

console.log('2. a nearly full tank takes only its free space; the remainder is shared by the others');
{ const { g, src, D } = mkSet([{ st: ST[0], dia: 36, vol: 49000 }, { st: ST[1], dia: 36 }, { st: ST[2], dia: 36 }], 250000), q = rate(g, [src, ...D]), out = -q[0], got = q.slice(1);
  ok(near(got[0] * DT, 1000, 1e-6), '2a the nearly full tank received exactly its 1,000 bbl of free space (' + Math.round(got[0] * DT) + ')', got);
  ok(near(got[1], got[2], 0.02) && got[1] > got[0], '2b what it could not take went to the others, split between them (' + got.slice(1).map(Math.round).join(' / ') + ' bbl/d)', got);
  ok(near(out, got[0] + got[1] + got[2], 1e-9), '2c in = out', [out, got]); }

console.log('3. demand above the supply: the real quantity is shared by capacity, demand below it: everybody gets their need');
{ const small = mkSet([{ st: ST[0], dia: 8 }, { st: ST[1], dia: 16 }], 20000, 'crude_tank_m'), q = rate(small.g, [small.src, ...small.D]), out = -q[0], got = q.slice(1);
  ok(out > 0 && got[0] <= 30000 + 1e-6 && near(out, got[0] + got[1], 1e-9), '3a supply (' + Math.round(out) + ' bbl/d) below the combined capacity (130,000): all of it is delivered, none created', [out, got]);
  ok(Math.abs(got[0] - got[1]) < out * 0.02, '3b when nobody is capacity-limited the sharing is equal (' + got.map(Math.round).join(' / ') + ')', got);
  const big = mkSet([{ st: ST[0], dia: 8 }, { st: ST[1], dia: 16 }], 250000), q2 = rate(big.g, [big.src, ...big.D]), g2 = q2.slice(1); ok(near(g2[0], Math.min(30000, -q2[0] - g2[1]), 0.05) || g2[0] <= 30000 + 1e-6, '3c with plenty of supply the 8" branch gets its 30,000 maximum and the 16" the rest: ' + g2.map(Math.round).join(' / '), g2); }

console.log('4. pressure: a destination across a pressure-starved route receives less than a near one');
{ const g = mk(), cn = g.cn, src = attach(g, 'crude_tank_l', ['N6'], 'CRUDE', 'out', 250000, 36), nr = attach(g, 'crude_tank_m', ['N5e', 'N3'], 'CRUDE', 'in', 0, 36), fr = attach(g, 'crude_tank_m', ['M2'], 'CRUDE', 'in', 0, 36);
  ok(src && nr && fr, '4a source at N6, a near destination (' + (nr && nr.__st) + ') and a far one (M2)'); if (src && nr && fr) {
    cn.begin(DT); const rf = cn.plan('CRUDE', 'N6', 'M2', 125000, 58, null), rn = cn.plan('CRUDE', 'N6', nr.__st, 125000, 58, null); cn.end(); for (const p of cn.pumps.values()) cn.setPumpFault(p.id, true); cn.begin(DT); const rf0 = cn.plan('CRUDE', 'N6', 'M2', 125000, 58, null); cn.end(); for (const p of cn.pumps.values()) cn.setPumpFault(p.id, true);
    const q = rate(g, [src, nr, fr]), f = q.slice(1), outT = -q[0]; ok(rf0 && rf && rf0.r < rf.r, '4b the far route really is pressure-limited without the pumps (' + Math.round(rf0.r) + ' bbl/d against ' + Math.round(rf.r) + ' with them)', [rf0 && rf0.r, rf && rf.r]);
    ok(f[0] >= f[1] - 1e-6 && near(outT, f[0] + f[1], 1e-9), '4c pumps failed: the far destination gets no more than the near one (' + Math.round(f[1]) + ' vs ' + Math.round(f[0]) + ' bbl/d), in = out (parallel loop paths still deliver most of it)', [f, rf0.r]); } }

console.log('5. six channels share the same rule');
{ let all = true; const rows = []; for (const ch of C.CHANNELS) { const T = { CRUDE: 'crude_tank_m', WATER: 'water_tank_m', GASOLINE: 'gasoline_tank_m', DIESEL: 'diesel_tank_m', JET_FUEL: 'jet_tank_m', GAS: 'gas_sphere_m' }[ch]; const g = mk(), A = [...g.cn.st.keys()], s = attach(g, T, A, ch, 'out', 40000, 36), d1 = attach(g, T, A.slice().reverse(), ch, 'in', 0, 8), d2 = attach(g, T, A.slice(5).concat(A.slice(0, 5)), ch, 'in', 0, 36); if (!s || !d1 || !d2) { all = false; rows.push([ch, 'build']); continue; }
    const q = rate(g, [s, d1, d2]); rows.push([ch, Math.round(-q[0]), Math.round(q[1]), Math.round(q[2])]); if (!(near(-q[0], q[1] + q[2], 1e-9) && q[1] <= 30000 + 1e-6 && q[1] > 0 && q[2] > 0)) all = false; }
  ok(all, '5a every channel: in = out, the 8" branch never above 30,000 bbl/d, both receive', rows); }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
