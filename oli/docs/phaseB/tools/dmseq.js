/* B7: ROOT=<oli dir> SEED=n OPS=m DM=0|1|2 node dmseq.js
 * An API-level sequence fuzz of deliver(): a source tank pushing into the central network, near-full receiving tanks (so that every commit changes what the next probe can take), random probe / commit / direct-offer operations with a small
 * pool of flows (so that exact repeats happen), the results and the whole state digested after every operation.  The same seed with the memo off / shadow / on must give the same digest; a stale hit changes a probe result. */
const path = require('path'), crypto = require('crypto'), ROOT = process.env.ROOT, SEED = +(process.env.SEED || 1), OPS = +(process.env.OPS || 400), DM = process.env.DM;
const K = require(path.join(ROOT, 'test-central-kit.js')), { mk, attach, B, C } = K, rnd = require('./simscene.js').rng(SEED);
const g = mk(), cn = g.cn, sim = g.sim; if (DM !== undefined && cn.setDeliverMode) cn.setDeliverMode(+DM);
const SRC = ['N1', 'N2', 'N4'], DST = ['N2', 'N3', 'N5', 'N6', 'FS'], srcs = [], dsts = [];
for (const s of SRC) { const t = attach(g, 'crude_tank_l', [s], 'CRUDE', 'out', 1e6, 36); if (t) srcs.push(t); }
const capM = B.DEFS.crude_tank_m.capacity.value;
for (const s of DST) { const t = attach(g, 'crude_tank_m', [s], 'CRUDE', 'in', Math.floor(capM * (.9 + rnd() * .09)), 36); if (t) dsts.push(t); }
// a junction between two stations that both have a source: a cycle through the central network (the visited set is what stops the oil from going round)
const SC = require('./simscene.js'); const devs0 = null; { const A = K.stB(g, 'N1'), Bn = K.stB(g, 'N2'); const qa = SC.stPorts(g, 'N1', 'CRUDE'), qb = SC.stPorts(g, 'N2', 'CRUDE'); if (qa.ports.length && qb.ports.length) { const j = SC.attach2(g, 'junction', qa.sb, qa.ports[0], 'PORT_W', 36, rnd); if (j) SC.join(g, j, 'PORT_E', qb.sb, qb.ports[0]); } }
// a pump and a separator in front of a receiving tank each: their probe writes (pIn, _off, _sat) are the side effects a hit must reproduce
const devs = []; for (const [sts, def, inp, outp] of [[['N5', 'N3', 'FM', 'M1', 'FN', 'JN'], 'pump_station_s', 'INPUT', 'OUTPUT'], [['N6', 'N5', 'FS'], 'separator', 'MIXTURE_IN', 'OIL_OUT']]) { let d = null; for (const st of sts) { const q = SC.stPorts(g, st, 'CRUDE'); if (!q.ports.length) continue; d = SC.attach2(g, def, q.sb, q.ports[0], inp, 36, rnd); if (d) break; } if (d) { const t = SC.attach2(g, 'crude_tank_m', d, outp, ['INPUT_W', 'INPUT_N', 'INPUT_E', 'INPUT_S'], 36, rnd); if (t) { sim.ensure(t).vol = Math.floor(capM * (.5 + rnd() * .4)); dsts.push(t); devs.push(d); } } }
const DT = 0.05; sim.step(DT); cn.begin(DT); sim.dt = DT;
const bits = x => typeof x === 'number' ? Buffer.from(new Float64Array([x]).buffer).toString('hex') : String(x);
const H = crypto.createHash('sha256'), pick = a => a[Math.floor(rnd() * a.length)], FL = [{ r: 3000, p: 120 }, { r: 40000, p: 120 }, { r: 40000, p: 90 }, { r: 250000, p: 150 }, { r: 40000, p: 30 }, { r: 40000, p: 16 }];
const flow = () => { const q = pick(FL); return { prod: 'CRUDE', r: q.r, oil: 1, gas: 0, wat: 0, p: q.p }; };
const outPorts = b => B.worldPoints(b).filter(p => p.kind === 'pipe' && p.role === 'out').map(p => p.id);
let res = [];
for (let i = 0; i < OPS; i++) {
  const sb = pick(srcs), st = cn.st.get(sb.__st), op = rnd(); let r;
  if (!st) continue; const vs = () => new Set([sb.id, st.b]);
  if (i === Math.floor(OPS * .6)) {      // a probe, the building graph changes WITHOUT a step (sim.build() makes a new edge table), the same probe again: a memo that ignored the edge table would answer from the destroyed tank
    const f0 = { prod: 'CRUDE', r: 40000, oil: 1, gas: 0, wat: 0, p: 120 }, pp = C.PORTS.CRUDE[0], a1 = cn.deliver(sim, st, 'CRUDE', f0, false, vs(), pp); const gg = [...dsts]; if (gg.length > 3) { const t = gg[gg.length - 1]; g.store.demolish(t.id, { building: true, pipes: true }); dsts.pop(); sim.build(); }
    r = a1 + 1e-3 * cn.deliver(sim, st, 'CRUDE', f0, false, vs(), pp);
  }
  else if (op < .45) r = cn.deliver(sim, st, 'CRUDE', flow(), false, vs(), pick(C.PORTS.CRUDE));
  else if (op < .7) { sim._cv++; r = cn.deliver(sim, st, 'CRUDE', flow(), true, vs(), pick(C.PORTS.CRUDE)); }
  else if (op < .8) { sim._cv++; r = sim.split(sb, outPorts(sb), flow(), true, new Set([sb.id])); }      // a top-level operation: the engine bumps sim._cv before each one (stepGen)
  else if (op < .86) { const ps = [...cn.pumps.values()].filter(p => p.ch === 'CRUDE'); r = 0; if (ps.length) { const pu = pick(ps), on = rnd() < .5; if (rnd() < .5) pu.fault = on; else cn.setPumpFault(pu.id, on); } }      // a pump fault between operations (no step in between): written straight into the field (what the old tests do) or through the control
  else if (op < .9) { r = 0; }
  else { r = 0; cn.begin(DT); sim.dt = DT; for (const t of dsts) { const s = sim.ensure(t); s.vol = Math.floor(capM * (.9 + rnd() * .09)); s._pend = 0; } sim._cv++; }      // "a new step": what stepGen does (resets, begin, bump)
  H.update(bits(r) + '|' + JSON.stringify([...dsts].map(t => { const s = sim.ensure(t); return [s._pend, s._in, s.vol]; }).concat([...cn.seg.values()].map(s => [s.f.CRUDE.flow]), devs.map(d => { const s = sim.ensure(d); return [s.pIn, s._off, s._sat, s._in]; })), (k, v) => typeof v === 'number' ? bits(v) : v) + '\n'); res.push(r);
}
if (process.env.SHOWDEVS) console.error("devs", devs.map(d => d.d).join());
console.log(JSON.stringify({ seed: SEED, ops: OPS, dig: H.digest('hex').slice(0, 24), nz: res.filter(x => x > 0).length, dm: cn.dmStats }));
