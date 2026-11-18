/* S8 study (measurement only, no game code changed): how many receiver-port probes (toStation probe -> sim.offer) an hour makes, how long they take,
   and how many of them repeat an identical call in the same simulation state (the upper bound for "batching" one receiver port).
   node batchstat.js <real|scene.json> [hours=12] */
const S = require('./gen-scene.js'), I = require('../industry.js'), C = require('../central.js'), CN = C.CentralNet, P = CN.prototype, SP = I.Sim.prototype;
Object.assign(CN, { hopShare: 1, pcSparse: 1, trDefault: 0, rcvSkip: 1, hopFreezeSkip: 1 }); I.Sim.fullTankSkip = 1;
const g = process.argv[2] === 'real' ? S.boot() : S.load(process.argv[2]); const HRS = +process.argv[3] || 12, now = () => Number(process.hrtime.bigint()) / 1e6;
const sinks = (g.sinks || []).map(id => g.store.get(id)).filter(Boolean), drain = () => { for (const b of sinks) g.sim.ensure(b).vol = 0; };
for (let h = 0; h < 6; h++) { drain(); g.co.advanceHours(1); }
const st = { toStationProbe: 0, toStationCommit: 0, tsIter: 0, probeOffers: 0, probeOfferPos: 0, probeOfferZero: 0, commitOffers: 0, tProbeOffer: 0, tProbePos: 0, tCommitOffer: 0, repStrict: 0, repStrictPos: 0, tRepStrict: 0, repRelax: 0, tRepRelax: 0, repRelaxSame: 0, repAny: 0, tRepAny: 0, repAnySame: 0, commitMatch: 0, tCommitMatch: 0, commitMatchOtherCv: 0, plan: 0 };
let odepth = 0; const tsStack = []; const seenAll = new Map(); const probeKeys = new Set(), cvAtProbe = new Map(); const seenS = new Map(), seenR = new Map(); let curCv = -1;
const oo = SP.offer; SP.offer = function (b, port, f, commit, vis) {
  const direct = tsStack.length && tsStack[tsStack.length - 1].od === odepth && tsStack[tsStack.length - 1].tsd === tsStack.length; const entry = direct ? tsStack[tsStack.length - 1] : null;
  this._cvPre = this._cv; odepth++; const t = now(); let r; try { r = oo.call(this, b, port, f, commit, vis); } finally { odepth--; }
  if (entry && entry.depthOK) { const dt = now() - t;
    if (commit) { st.commitOffers++; st.tCommitOffer += dt; if (this._cv === curCv || true) { const vs0 = vis ? [...vis].sort().join(',') : '', k0 = b.id + '|' + port + '|' + f.r + '|' + f.p + '|' + f.prod + '|' + f.gas + '|' + f.wat + '|' + f.bf + '|' + f.sv + '|' + f.sc + '|' + f.oil + '|' + vs0; if (cvAtProbe.get(k0) === this._cvPre) { st.commitMatch++; st.tCommitMatch += dt; } else if (probeKeys.has(k0)) st.commitMatchOtherCv++; } } else {
      st.probeOffers++; st.tProbeOffer += dt; if (r > 1e-9) { st.probeOfferPos++; st.tProbePos += dt; } else st.probeOfferZero++;
      if (this._cv !== curCv) { curCv = this._cv; seenS.clear(); seenR.clear(); }
      const vs = vis ? [...vis].sort().join(',') : '', base = b.id + '|' + port + '|' + f.r + '|' + f.p + '|' + f.prod + '|' + f.gas + '|' + f.wat + '|' + f.bf + '|' + f.sv + '|' + f.sc + '|' + f.oil;
      probeKeys.add(base + '|' + vs); cvAtProbe.set(base + '|' + vs, this._cv); const ks = base + '|' + vs, pr = seenS.get(ks); if (pr !== undefined) { st.repStrict++; st.tRepStrict += dt; if (r > 1e-9) st.repStrictPos++; } else seenS.set(ks, r);
      { const kA = base + '|' + vs, pa = seenAll.get(kA); if (pa !== undefined) { st.repAny++; st.tRepAny += dt; if (Object.is(pa, r)) st.repAnySame++; } else seenAll.set(kA, r); } const pr2 = seenR.get(base); if (pr2 !== undefined) { st.repRelax++; st.tRepRelax += dt; if (Object.is(pr2, r)) st.repRelaxSame++; } else seenR.set(base, r);
    } }
  return r;
};
const ot = P.toStation; P.toStation = function (sim, ch, srcId, d, want, f, commit, vis, over) { tsStack.push({ od: odepth, tsd: tsStack.length + 1, depthOK: true }); if (commit) st.toStationCommit++; else st.toStationProbe++; try { return ot.call(this, sim, ch, srcId, d, want, f, commit, vis, over); } finally { tsStack.pop(); } };
const op = P.plan; P.plan = function (...a) { st.plan++; st.tsIter++; return op.apply(this, a); };
let tHour = 0; for (let h = 0; h < HRS; h++) { seenAll.clear(); drain(); const t = now(); g.co.advanceHours(1); tHour += now() - t; }
const r = x => +(x / HRS).toFixed(1);
console.log(JSON.stringify({ buildings: g.store.list().length, hours: HRS, msPerHour_instrumented: r(tHour), perHour: { toStationProbe: r(st.toStationProbe), toStationCommit: r(st.toStationCommit), planCalls: r(st.plan), probeOffers: r(st.probeOffers), positive: r(st.probeOfferPos), zero: r(st.probeOfferZero), commitOffers: r(st.commitOffers) },
  msPerHour: { probeOffers: r(st.tProbeOffer), ofWhichPositive: r(st.tProbePos), commitOffers: r(st.tCommitOffer) }, sharePctOfHour: { probeOffers: +(100 * st.tProbeOffer / tHour).toFixed(1), commitOffers: +(100 * st.tCommitOffer / tHour).toFixed(1) },
  repeatsSameStateStrict: { perHour: r(st.repStrict), positive: r(st.repStrictPos), msPerHour: r(st.tRepStrict), pctOfHour: +(100 * st.tRepStrict / tHour).toFixed(2) },
  commitsIdenticalToAProbeInSameState: { perHour: r(st.commitMatch), msPerHour: r(st.tCommitMatch), pctOfHour: +(100 * st.tCommitMatch / tHour).toFixed(2), matchedButStateChanged: r(st.commitMatchOtherCv) },
  repeatsAnyStateWithinTheHour: { perHour: r(st.repAny), sameResult: r(st.repAnySame), msPerHour: r(st.tRepAny), pctOfHour: +(100 * st.tRepAny / tHour).toFixed(2) },
  repeatsIgnoringVis: { perHour: r(st.repRelax), sameResult: r(st.repRelaxSame), msPerHour: r(st.tRepRelax), pctOfHour: +(100 * st.tRepRelax / tHour).toFixed(2) } }, null, 1));
