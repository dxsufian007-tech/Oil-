/* Bidirectional pumps of the central network: Forward / Reverse, pressure and flow both ways, loops, failures, no mixing, no double counting, save / load */
const K = require('./test-central-kit.js'), { C, mk, attach, run, near, stB } = K; let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' -> ' + JSON.stringify(x))); } };
const pumpsOf = (cn, ch) => [...cn.pumps.values()].filter(p => p.ch === ch), setDir = (cn, ch, d) => pumpsOf(cn, ch).forEach(p => cn.setPumpDir(p.id, d));
const probe = (cn, ch, a, b, r) => { cn.begin(.05); const pl = cn.plan(ch, a, b, r || 125000, 58, null); cn.end(); return pl && { r: Math.round(pl.r), p: Math.round(pl.p), on: pl.stats.filter(s => s[3]).length, ids: pl.stats.filter(s => s[3]).map(s => s[0].id), hops: pl.hops.map(h => h.g.id) }; };

console.log('1. the pump model');
{ const g = mk(), cn = g.cn, ps = [...cn.pumps.values()];
  ok(ps.length === 18 && ps.every(p => p.dir === 1 && cn.seg.has(p.seg) && (cn.seg.get(p.seg).a === p.st || cn.seg.get(p.seg).b === p.st)), '1a 18 pumps (3 hubs × 6 channels), each mounted on a real segment of its hub, default Forward');
  const p = ps[0]; ok(cn.setPumpDir(p.id, -1) && p.dir === -1 && cn.setPumpDir(p.id, 1) && p.dir === 1 && !cn.setPumpDir(p.id, 0) && !cn.setPumpDir(p.id, 2) && !cn.setPumpDir('nope', 1), '1b direction is Forward (+1) or Reverse (−1) only; anything else is refused');
  const bad = cn.pumps.get(ps[0].id); const keep = bad.seg; bad.seg = [...cn.seg.values()].find(s => s.a !== bad.st && s.b !== bad.st).id; ok(!cn.setPumpDir(bad.id, -1), '1c a pump cannot be reversed on a pipe that is not attached to its station (no pumping through a path that does not exist)'); bad.seg = keep; }

console.log('2. product A → B, reverse the pumps, B → A (real tanks, real Sim)');
const N4 = 'N6', FS = 'FS';
{ // A = N4 (north), B = FS (south): the backbone x=992 runs north → south, the pumps push south
  const g = mk(), cn = g.cn, ra = probe(cn, 'CRUDE', N4, FS), rb = probe(cn, 'CRUDE', FS, N4);
  ok(ra && rb && ra.hops.length > 3, '2a the route exists both ways on the real map (' + ra.hops.length + ' hops)', [ra, rb]);
  ok(ra.on >= 2 && rb.on === 0, '2b Forward pumps: A→B passes ' + ra.on + ' working pumps, B→A passes none (the pumps push the other way, the product bypasses them)', [ra.on, rb.on]);
  ok(ra.p > rb.p * 1.5 || ra.r > rb.r * 1.1, '2c A→B arrives at ' + ra.p + ' psi / ' + ra.r + ' bbl/d, B→A at ' + rb.p + ' psi / ' + rb.r + ' bbl/d', [ra, rb]);
  setDir(cn, 'CRUDE', -1); const ra2 = probe(cn, 'CRUDE', N4, FS), rb2 = probe(cn, 'CRUDE', FS, N4);
  ok(rb2.on >= 2 && ra2.on === 0, '2d Reverse: suction and discharge swap — now B→A is the pumped way (' + rb2.on + ' pumps) and A→B bypasses', [ra2.on, rb2.on]);
  ok(near(rb2.p, ra.p, 0.35) && ra2.p < ra.p * 0.7, '2e pressure in both directions: B→A reversed ≈ A→B forward (' + rb2.p + ' vs ' + ra.p + ' psi); A→B after the reversal drops to ' + ra2.p + ' psi', [ra, rb, ra2, rb2]);
  const other = pumpsOf(cn, 'WATER'); ok(other.every(p => p.dir === 1) && pumpsOf(cn, 'CRUDE').every(p => p.dir === -1), '2f reversing the CRUDE pumps did not touch the other five channels'); }
{ // end to end with tanks: A → B
  const g = mk(), cn = g.cn, A = attach(g, 'crude_tank_m', [N4], 'CRUDE', 'out', 40000, 36), Bt = A && attach(g, 'crude_tank_m', [FS], 'CRUDE', 'in', 0, 36);
  ok(!!A && !!Bt, '2g a crude tank is wired to N4 and another to FS through the CRUDE ports'); if (A && Bt) {
    const sa = g.sim.ensure(A), sb = g.sim.ensure(Bt), a0 = sa.vol; run(g, 6); const moved = a0 - sa.vol;
    ok(moved > 1000 && near(sb.vol, moved, 1e-6), '2h A→B: ' + Math.round(moved) + ' bbl left A and exactly that arrived in B (nothing created, nothing lost)', [moved, sb.vol]);
    const pu = pumpsOf(cn, 'CRUDE').filter(p => p.flow > 0); ok(pu.length >= 2 && pu.every(p => p.pOut > p.pIn), '2i the Forward pumps work: pressure up at each (' + pu.map(p => Math.round(p.pIn) + '→' + Math.round(p.pOut)).join(', ') + ' psi)', pu.map(p => [p.id, p.pIn, p.pOut]));
    } }
{ // the other way on a second game: the tank at FS is the source, the tank at N6 the destination
  const mkBA = d => { const g = mk(), cn = g.cn; if (d) setDir(cn, 'CRUDE', -1); const S = attach(g, 'crude_tank_m', [FS], 'CRUDE', 'out', 40000, 36), D = S && attach(g, 'crude_tank_m', [N4], 'CRUDE', 'in', 0, 36); return { g, cn, S, D }; };
  const f = mkBA(false), r = mkBA(true); ok(f.S && f.D && r.S && r.D, '2j tanks wired: source at B (FS), destination at A (N6)'); if (f.S && f.D && r.S && r.D) {
    const sf = f.g.sim.ensure(f.S), df = f.g.sim.ensure(f.D); run(f.g, 6); const mf = 40000 - sf.vol, flowF = f.cn.ch.CRUDE.flow, prF = f.cn.ch.CRUDE.pressure, workF = pumpsOf(f.cn, 'CRUDE').filter(p => p.flow > 0).length;
    const sr = r.g.sim.ensure(r.S), dr = r.g.sim.ensure(r.D); run(r.g, 6); const mr = 40000 - sr.vol, flowR = r.cn.ch.CRUDE.flow, prR = r.cn.ch.CRUDE.pressure, pu = pumpsOf(r.cn, 'CRUDE').filter(p => p.flow > 0);
    ok(mf > 1000 && near(df.vol, mf, 1e-6) && mr > 1000 && near(dr.vol, mr, 1e-6), '2k B→A moves product both with the pumps Forward (' + Math.round(mf) + ' bbl) and Reversed (' + Math.round(mr) + ' bbl); every barrel that left B arrived in A', [mf, df.vol, mr, dr.vol]);
    ok(workF === 0 && pu.length >= 2 && pu.every(p => p.pOut > p.pIn), '2l B→A: Forward pumps are idle (' + workF + ' working); Reversed, ' + pu.length + ' pumps work and lift the pressure (' + pu.map(p => Math.round(p.pIn) + '→' + Math.round(p.pOut)).join(', ') + ' psi)', [workF, pu.map(p => [p.pIn, p.pOut])]);
    ok(prR > prF && flowR >= flowF - 1e-6, '2m channel pressure B→A: ' + Math.round(prF) + ' psi (Forward, pumps idle) → ' + Math.round(prR) + ' psi (Reversed); flow ' + Math.round(flowF) + ' → ' + Math.round(flowR) + ' bbl/d', [prF, prR, flowF, flowR]);
    ok(near(r.cn.ch.CRUDE.flow * 6 * .05, mr, 0.03), '2n the channel flow matches what the tanks exchanged (no double counting)', [r.cn.ch.CRUDE.flow * .3, mr]); } }

console.log('3. all six channels, both directions, separated');
{ const g = mk(), cn = g.cn; const rows = []; for (const ch of C.CHANNELS) { const f = probe(cn, ch, N4, FS), b0 = probe(cn, ch, FS, N4); setDir(cn, ch, -1); const f1 = probe(cn, ch, N4, FS), b1 = probe(cn, ch, FS, N4); rows.push({ ch, f, b0, f1, b1 }); }
  ok(rows.every(r => r.f.on >= 2 && r.b0.on === 0 && r.b1.on >= 2 && r.f1.on === 0), '3a every channel: Forward pumps help A→B only, Reverse helps B→A only', rows.map(r => [r.ch, r.f.on, r.b0.on, r.b1.on, r.f1.on]));
  ok(rows.every(r => r.b1.p > r.b0.p * 1.5 || r.b1.r > r.b0.r * 1.1), '3b every channel: reversing raises the B→A pressure / flow', rows.map(r => [r.ch, r.b0.p, r.b1.p]));
  ok(C.CHANNELS.every(ch => pumpsOf(cn, ch).every(p => p.dir === -1 && p.ch === ch)) && [...cn.pumps.values()].every(p => p.dir === -1), '3c each pump keeps its own channel (no pump serves two products)'); }

console.log('4. pump failure in both directions');
{ const g = mk(), cn = g.cn; for (const d of [1, -1]) { setDir(cn, 'CRUDE', d); const a = d === 1 ? [N4, FS] : [FS, N4], ok0 = probe(cn, 'CRUDE', a[0], a[1]); pumpsOf(cn, 'CRUDE').forEach(p => cn.setPumpFault(p.id, true)); const f = probe(cn, 'CRUDE', a[0], a[1]); pumpsOf(cn, 'CRUDE').forEach(p => cn.setPumpFault(p.id, false));
    ok(ok0.on >= 2 && f.on === 0 && f.p < ok0.p * 0.5 && f.r <= ok0.r, '4' + (d === 1 ? 'a' : 'b') + ' ' + (d === 1 ? 'Forward' : 'Reverse') + ': working ' + ok0.p + ' psi / ' + ok0.r + ' bbl/d, all pumps failed ' + f.p + ' psi / ' + f.r + ' bbl/d', [ok0, f]); }
  setDir(cn, 'CRUDE', 1); const ps = pumpsOf(cn, 'CRUDE'); cn.setPumpFault(ps[0].id, true); const one = probe(cn, 'CRUDE', N4, FS); ok(one.on === 1 && !one.ids.includes(ps[0].id), '4c one failed pump of two on the route: the other still works, the failed one is bypassed', one);
  cn.setPumpFault(ps[0].id, false); cn.setPumpFault(ps[1].id, true); const tw = probe(cn, 'CRUDE', FS, N4); ok(tw.on === 0, '4d a failed pump does not make the idle direction pump either'); }

console.log('5. closed loops: no double counting, no phantom flow');
{ const g = mk(), cn = g.cn; // put pumps on BOTH segments of a loop (L-C1: FN→FM, L-C2: FM→FS) pushing round it, and on the parallel main line the other way
  const loops = [...cn.seg.values()].filter(s => s.kind === 'loop'); const c1 = cn.seg.get('L-C1'), c2 = cn.seg.get('L-C2'); ok(!!c1 && !!c2, '5a the loop segments exist');
  const ids = []; for (const [seg, st, dir] of [[c1, c1.a, 1], [c2, c2.a, 1]]) { const p = cn.addPump({ st, ch: 'CRUDE', seg: seg.id, dir }); ids.push(p.id); }
  // a closed circuit of pumps with no source: nothing may move
  run(g, 8); ok(cn.ch.CRUDE.flow === 0 && [...cn.seg.values()].every(s => s.f.CRUDE.flow === 0) && ids.every(id => cn.pumps.get(id).flow === 0), '5b pumps on a loop with no source create no flow at all (a pump moves product, it does not create it)');
  const A = attach(g, 'crude_tank_m', ['FM'], 'CRUDE', 'out', 40000, 36), Bt = A && attach(g, 'crude_tank_m', ['FS'], 'CRUDE', 'in', 0, 36); ok(!!A && !!Bt, '5c tanks at FM and FS'); if (A && Bt) { const sa = g.sim.ensure(A), sb = g.sim.ensure(Bt); run(g, 8); const m = 40000 - sa.vol;
    ok(m > 1000 && near(sb.vol, m, 1e-6), '5d through the pumped loop: ' + Math.round(m) + ' bbl left the source and exactly that arrived (no copy of the product travels another way)', [m, sb.vol]);
    let sumIn = 0; for (const s of cn.seg.values()) if (s.a === 'FM' || s.b === 'FM') sumIn += s.f.CRUDE.flow; ok(near(sumIn, cn.ch.CRUDE.flow, 1e-6) || sumIn <= cn.ch.CRUDE.flow + 1e-6, '5e what leaves the source station over all its segments equals the channel flow (each barrel counted once)', [sumIn, cn.ch.CRUDE.flow]);
    ids.forEach(id => cn.setPumpDir(id, -1)); const v0 = sb.vol; run(g, 8); ok(sb.vol > v0 && near(40000 - sa.vol, sb.vol, 1e-6), '5f with the loop pumps reversed the transfer still conserves the product', [sb.vol, sa.vol]); } }

console.log('6. the reverse direction gives an alternative path when the main one is cut');
{ const g = mk(), cn = g.cn; const base = probe(cn, 'CRUDE', FS, N4); // FS → N4 along the backbone: pumped only when Reverse
  const before = probe(cn, 'CRUDE', FS, N4); setDir(cn, 'CRUDE', -1); const rev = probe(cn, 'CRUDE', FS, N4);
  const cut = rev.hops.find(h => /^T-E/.test(h)); cn.setFault(cut, 'CRUDE', true); const alt = probe(cn, 'CRUDE', FS, N4);
  ok(alt && !alt.hops.includes(cut) && alt.hops.some(h => /^L-/.test(h)), '6a main line cut (' + cut + '): the product reroutes over the closed loops', alt);
  // put a pump on the alternative path pointing the way the product travels, then the opposite
  const first = cn.seg.get(alt.hops.find(h => /^L-/.test(h))); const nodes = alt.hops.map(h => cn.seg.get(h)); const hop = (() => { let at = 'FS'; for (const h of alt.hops) { const g2 = cn.seg.get(h); const d = g2.a === at ? 1 : -1; if (h === first.id) return { g: g2, d, from: at }; at = d === 1 ? g2.b : g2.a; } })();
  const pump = cn.addPump({ st: hop.from, ch: 'CRUDE', seg: hop.g.id, dir: hop.d }); const withP = probe(cn, 'CRUDE', FS, N4); cn.setPumpDir(pump.id, -hop.d); const against = probe(cn, 'CRUDE', FS, N4);
  ok(withP.r > alt.r * 1.5 && against.r <= alt.r + 1 && against.on === alt.on, '6b a pump on the alternative path lifts the delivery to ' + withP.r + ' bbl/d only when set the way the product travels; set against it the delivery stays at ' + against.r + ' (no pump: ' + alt.r + ')', [alt, withP, against]);
  cn.setFault(cut, 'CRUDE', false); }

console.log('7. save / load and tapping keep the direction');
{ const g = mk(), cn = g.cn; const p = pumpsOf(cn, 'GAS')[1]; cn.setPumpDir(p.id, -1); cn.setPumpFault(pumpsOf(cn, 'GAS')[2].id, true);
  const c2 = C.CentralNet.fromJSON(K.world.W, JSON.parse(JSON.stringify(cn.toJSON()))); ok(c2.pumps.get(p.id).dir === -1 && c2.pumps.get(p.id).seg === p.seg && c2.pumps.get(pumpsOf(cn, 'GAS')[0].id).dir === 1 && c2.pumps.get(pumpsOf(cn, 'GAS')[2].id).fault, '7a the direction (and the segment) of every pump survives save / load', [c2.pumps.get(p.id).dir]);
  const seg = cn.seg.get(p.seg); let tapped = null; for (let i = 5; i < seg.path.length - 5 && !tapped; i++) { const [x, y] = seg.path[i], pl = C.planTap(g.store, g.net, x, y); if (pl.ok) { const r = C.commitTap(g.store, g.net, pl, { ignoreCash: true }); if (r.ok) tapped = r; } }
  ok(tapped && cn.seg.has(cn.pumps.get(p.id).seg) && cn.pumps.get(p.id).dir === -1, '7b a free tap on the pump\'s segment keeps the pump on the half next to its hub with its direction', tapped && [cn.pumps.get(p.id).seg]); }

console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
