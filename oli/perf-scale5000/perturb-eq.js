/* S2b stress equality: the SAME seeded perturbations are applied hour by hour to an engine with the tree feature off (A) and on (B); sha1 of everything the save holds must match every hour.
   Perturbations: pump fault / direction, channel open-close, segment fault, tank full / empty, refinery limit, building REMOVAL (wells, pumps, separators, tanks, junctions with their pipes) and ADDITION (a new tap station + tank + pipe on a random trunk tile).
   node perturb-eq.js <real|scene.json> <hours> <seed> <capScale> <B-json>   capScale < 1 lowers CLASS.capacity in BOTH runs (test only) so that segments really saturate and free again. */
const path = require('path'), crypto = require('crypto'), S = require('./gen-scene.js'), dir = path.resolve(__dirname, '..'), C = require(dir + '/central.js'), K = require(dir + '/test-central-kit.js'), B = require(dir + '/buildings.js');
const [what, H, SEED, CAP, Bj] = [process.argv[2], +process.argv[3] || 24, +process.argv[4] || 1, +process.argv[5] || 1, JSON.parse(process.argv[6] || '{"trDefault":2}')];
const CAP0 = C.CLASS.capacity; const rngf = s => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
function run(ov) {
  for (const k in ov) C.CentralNet[k] = ov[k]; C.CLASS.capacity = CAP0 * CAP; const R = rngf(SEED), g = what === 'real' ? S.boot() : S.load(what); const cn = g.cn, log = { pumpFault: 0, pumpDir: 0, chan: 0, segFault: 0, full: 0, empty: 0, refLimit: 0, removed: 0, added: 0 };
  const pumps = () => [...cn.pumps.keys()], segs = () => [...cn.seg.keys()], chs = Object.keys(cn.ch), tanks = () => g.store.list().filter(b => /tank/.test(b.d)), refs = () => g.store.list().filter(b => /^refinery/.test(b.d)), killable = () => g.store.list().filter(b => /^(oil_well|crude_tank_m|separator|pump_station_l|junction)$/.test(b.d));
  const sinks = (g.sinks || []).map(id => g.store.get(id)).filter(Boolean), hs = []; const pick = a => a[Math.floor(R() * a.length)];
  for (let h = 0; h < H; h++) {
    const k = Math.floor(R() * 12); const P = pumps(), SG = segs();
    if (k === 0 && P.length) { const id = pick(P), p = cn.pumps.get(id); cn.setPumpFault(id, !p.fault); log.pumpFault++; }
    else if (k === 1 && P.length) { const id = pick(P), p = cn.pumps.get(id); cn.setPumpDir(id, -p.dir); log.pumpDir++; }
    else if (k === 2) { const c = pick(chs); cn.setChannel(c, cn.ch[c].state === 'OPEN' ? 'CLOSED' : 'OPEN'); log.chan++; }
    else if (k === 3 && SG.length) { const id = pick(SG), c = pick(chs), gg = cn.seg.get(id); cn.setFault(id, c, !gg.fault[c]); log.segFault++; }
    else if (k === 4) { const T = tanks(); if (T.length) { const b = pick(T), s = g.sim.ensure(b); s.vol = B.DEFS[b.d].capacity.value * (0.97 + 0.03 * R()); log.full++; } }
    else if (k === 5) { const T = tanks(); if (T.length) { const b = pick(T), s = g.sim.ensure(b); s.vol = 0; s.wat = 0; log.empty++; } }
    else if (k === 6) { const Rf = refs(); if (Rf.length) { const b = pick(Rf), s = g.sim.ensure(b); s.opLimit = R() < .3 ? 0 : 0.3 + 0.7 * R(); log.refLimit++; } }
    else if (k === 7 || k === 8) { const L = killable(); if (L.length) { const b = pick(L); g.store.demolish(b.id, { building: true, pipes: true, force: true }); log.removed++; } }
    else if (k === 9 || k === 10) { const tr = []; for (const gg of cn.seg.values()) for (let i = 8; i < gg.path.length - 8; i += 9) tr.push(gg.path[i]); const t = pick(tr), plan = C.planTap(g.store, g.net, t[0], t[1], { ignoreCash: true }); if (plan.ok) { const r = C.commitTap(g.store, g.net, plan, { ignoreCash: true }); if (r.ok) { const ch = pick(['CRUDE', 'GASOLINE', 'DIESEL']); const b = K.attach(g, { CRUDE: 'crude_tank_m', GASOLINE: 'gasoline_tank_m', DIESEL: 'diesel_tank_m' }[ch], [r.station.id], ch, R() < .5 ? 'in' : 'out', R() < .5 ? 3e4 : 0); if (b) log.added++; } } }
    for (const b of sinks) { const s = g.sim.ensure(b); s.vol = 0; }
    g.co.advanceHours(1); hs.push(crypto.createHash('sha1').update(JSON.stringify({ s: g.store.toJSON(), n: g.net.toJSON(), e: g.co.toJSON() })).digest('hex').slice(0, 12));
  }
  return { hs, log, tr: cn.trStats, df: cn.dfStats, inv: cn.pcStats && cn.pcStats.invalSat, N: cn._adjA && cn._adjA.length };
}
const a = run({ trDefault: 0, hopShare: 0, pcSparse: 0, rcvSkip: 0, hopFreezeSkip: 0 }), b = run(Bj); let diff = 0, first = -1; for (let h = 0; h < H; h++) if (a.hs[h] !== b.hs[h]) { diff++; if (first < 0) first = h; }
console.log(JSON.stringify({ what: path.basename(what), hours: H, seed: SEED, capScale: CAP, B: Bj, hoursDifferent: diff, firstDiff: first, perturbations: a.log, perturbationsSame: JSON.stringify(a.log) === JSON.stringify(b.log), invalSatA: a.inv, invalSatB: b.inv, stations: b.N, trB: b.tr, dfB: b.df }));
