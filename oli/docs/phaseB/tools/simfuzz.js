/* B7: ROOT=<oli dir> SEED=n STEPS=m [DM=0|1|2] node simfuzz.js  -> one JSON line: digest of the full Sim + central state after every step, and the deliver-memo stats.
 * The same seed on two roots must print the same digest (ORIGINAL / B6 vs B7).  Between steps a seeded sequence of player-like operations runs (valve modes, pump faults / directions, channel open/close, segment faults). */
const path = require('path'), crypto = require('crypto'), ROOT = process.env.ROOT, SEED = +(process.env.SEED || 1), STEPS = +(process.env.STEPS || 200), DM = process.env.DM;
const S = require('./simscene.js'), { g, rnd, info } = S.build(SEED, { dense: !!process.env.DENSE, tight: !!process.env.TIGHT }), cn = g.cn, sim = g.sim;
if (DM !== undefined && cn.setDeliverMode) cn.setDeliverMode(+DM);
const bits = x => typeof x === 'number' ? Buffer.from(new Float64Array([x]).buffer).toString('hex') : String(x);
const rep = (k, v) => typeof v === 'number' ? (Object.is(v, -0) ? '-0' : Number.isFinite(v) ? bits(v) : String(v)) : v === undefined ? '~' : v;
const H = crypto.createHash('sha256'), CHS = ['CRUDE', 'WATER', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'];
const dig = () => { const o = []; for (const b of g.store.list()) o.push([b.id, b.st, b.s]); for (const e of sim._el || []) o.push([e.flow, e.over, e.lowP, e.hiP, e.p, e.prod]);
  o.push([...cn.seg.values()].map(s => CHS.map(c => [s.f[c].flow, s.f[c].net])), [...cn.pumps.values()].map(p => [p.flow, p.pIn, p.pOut, p.lowIn, p.fault, p.dir]), CHS.map(c => [cn.ch[c].flow, cn.ch[c].pressure, cn.ch[c].qty, cn.ch[c].moved, cn.ch[c].status]));
  H.update(JSON.stringify(o, rep)); };
const pumps = [...cn.pumps.values()], segs = [...cn.seg.values()], valves = g.store.list().filter(b => b.d === 'valve'), pick = a => a[Math.floor(rnd() * a.length)];
const t0 = process.hrtime.bigint(); let ops = 0;
for (let i = 0; i < STEPS; i++) {
  if (i && i % 7 === 0) { const r = rnd(); ops++;
    if (r < .2 && pumps.length) cn.setPumpDir(pick(pumps).id, rnd() < .5 ? 1 : -1);
    else if (r < .35 && pumps.length) cn.setPumpFault && cn.setPumpFault(pick(pumps).id, rnd() < .5);
    else if (r < .5) cn.setFault(pick(segs).id, pick(CHS), rnd() < .5);
    else if (r < .6) cn.setState ? cn.setState(pick(CHS), rnd() < .5 ? 'OPEN' : 'CLOSED') : 0;
    else if (r < .8 && valves.length) { const v = g.sim.ensure(pick(valves)); v.mode = pick(['OPEN', 'PARTIAL', 'CLOSED']); v.opening = .1 + rnd() * .8; }
    else if (r < .9) { const b = pick(g.store.list()), s = g.sim.ensure(b); if (s.vol != null) s.vol = Math.max(0, s.vol + (rnd() - .4) * 50000); }
  }
  if (process.env.DENSE) for (const t of info.srcB) { const st = sim.ensure(t); if (st.vol < 4000) { st.vol = 4000 + Math.floor(rnd() * 9000); st.wat = st.vol * (rnd() * .4); } }
  sim.step(0.05 + rnd() * 0.45); dig();
}
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(JSON.stringify({ seed: SEED, steps: STEPS, ops, kinds: info.kinds, dig: H.digest('hex').slice(0, 24), ms: +ms.toFixed(0), dm: cn.dmStats || null, pl: cn.plStats ? { calls: cn.plStats.calls, hit: cn.plStats.hit } : null, flow: CHS.map(c => Math.round(cn.ch[c].moved)).join('/') }));
