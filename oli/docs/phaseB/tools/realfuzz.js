/* (the tank perturbation is half the time a nearly FULL tank: its room limits the flow, so every commit changes what the next probe can take)  B7: ROOT=<oli dir> SEED=n STEPS=m DM=0|1|2 node realfuzz.js   (needs docs/phaseB/realsave.json)
 * The REAL save (separators, refineries, pumps, junctions, tanks, nested central deliveries) stepped with random dt and seeded player-like perturbations; the digest covers every building state, every edge, the whole central network after EVERY step. */
const path = require('path'), crypto = require('crypto'), B = require(path.join(process.env.ROOT, 'buildings.js')), ROOT = process.env.ROOT, SEED = +(process.env.SEED || 1), STEPS = +(process.env.STEPS || 40), DM = process.env.DM;
if (process.env.CAPSCALE) { const CFGX = require(path.join(ROOT, 'building-config.js')); CFGX.PIPES[36].capacity *= +process.env.CAPSCALE; }      // saturated regime: a smaller 36-inch capacity makes pipes / pumps limit the flow
const { g, co } = require(path.join(__dirname, 'realload.js')).build(), cn = g.net.central, sim = g.sim, rng = require('./simscene.js').rng, rnd = rng(SEED);
if (DM !== undefined && cn.setDeliverMode) cn.setDeliverMode(+DM);
const bits = x => Buffer.from(new Float64Array([x]).buffer).toString('hex'); const rep = (k, v) => typeof v === 'number' ? (Object.is(v, -0) ? '-0' : Number.isFinite(v) ? bits(v) : String(v)) : v === undefined ? '~' : v;
const H = crypto.createHash('sha256'), CHS = ['CRUDE', 'WATER', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'];
const dig = () => { const o = []; for (const b of g.store.list()) o.push([b.id, b.st, b.s]); for (const e of sim._el || []) o.push([e.flow, e.over, e.lowP, e.hiP, e.p, e.prod]);
  o.push([...cn.seg.values()].map(s => CHS.map(c => [s.f[c].flow, s.f[c].net])), [...cn.pumps.values()].map(p => [p.flow, p.pIn, p.pOut, p.lowIn, p.fault, p.dir]), CHS.map(c => [cn.ch[c].flow, cn.ch[c].pressure, cn.ch[c].qty, cn.ch[c].moved, cn.ch[c].status])); H.update(JSON.stringify(o, rep)); };
const pumps = [...cn.pumps.values()], segs = [...cn.seg.values()], bl = g.store.list(), pick = a => a[Math.floor(rnd() * a.length)], tanks = bl.filter(b => /tank|sphere/.test(b.d)), refs = bl.filter(b => /refinery/.test(b.d));
const t0 = process.hrtime.bigint(); let ops = 0;
for (let i = 0; i < STEPS; i++) {
  if (i && i % 2 === 0) { const r = rnd(); ops++;
    if (r < .15) cn.setPumpDir(pick(pumps).id, rnd() < .5 ? 1 : -1); else if (r < .3) cn.setPumpFault(pick(pumps).id, rnd() < .5); else if (r < .4) cn.setFault(pick(segs).id, pick(CHS), rnd() < .5);
    else if (r < .5) cn.setChannel(pick(CHS), rnd() < .3 ? 'CLOSED' : 'OPEN'); else if (r < .7 && tanks.length) { const tb = pick(tanks), s = sim.ensure(tb); if (s.vol != null) s.vol = rnd() < .5 ? Math.max(0, s.vol * (.2 + rnd() * 1.6)) : Math.max(0, B.DEFS[tb.d].capacity.value * (.9 + rnd() * .1)); } else if (refs.length) sim.ensure(pick(refs)).opLimit = .3 + rnd() * .7; }
  sim.step(0.02 + rnd() * 0.06); dig();
}
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(JSON.stringify({ seed: SEED, steps: STEPS, ops, dig: H.digest('hex').slice(0, 24), ms: +ms.toFixed(0), dm: cn.dmStats, flow: CHS.map(c => Math.round(cn.ch[c].moved)).join('/') }));
