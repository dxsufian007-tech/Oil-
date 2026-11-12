/* B1 identity fuzz: the ORIGINAL central.js (757fed1) and the NEW one are driven with the same random operations; every result must be bit-identical.  node fuzz.js [seeds] */
const ORIG = require((process.env.ORIG_ROOT || '../../../../orig/oli') + '/central.js'), NEW = require(process.env.NEWPATH || (process.env.NEW_ROOT ? process.env.NEW_ROOT + '/central.js' : '../../../central.js'));
if (process.env.PH === 'b2') NEW.CentralNet.prototype._planHops = NEW.CentralNet.prototype._planHopsB2; if (process.env.PH === 'alt') { const P = NEW.CentralNet.prototype; let k = 0; P._planHops = function () { return (++k & 1 ? P._planHopsB2 : P._planHopsB3a).apply(this, arguments); }; }
const SEEDS = +(process.argv[2] || 200), CH = ORIG.CHANNELS, CAP = ORIG.CLASS.capacity;
const bits = x => typeof x === 'number' ? Buffer.from(new Float64Array([x]).buffer).toString('hex') : x;
const canon = pl => !pl ? 'null' : JSON.stringify({ h: pl.hops.map(h => [h.g.id, h.dir, h.from, h.to]), r: bits(pl.r), p: bits(pl.p), st: pl.stats.map(([pu, a, b, on]) => [pu.id, bits(a), bits(b), on]), n: pl.nodes });
const cpath = h => h ? JSON.stringify(h.map(x => [x.g.id, x.dir, x.from, x.to])) : 'null';
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function mkNet(M, spec) {
  const cn = new M.CentralNet(1000);
  for (const s of spec.st) cn.addStation({ id: s.id, x: s.x, y: s.y });
  for (const g of spec.seg) cn.addSeg({ id: g.id, kind: 'main', a: g.a, b: g.b, path: g.path, fault: Object.assign({}, g.fault) });
  for (const p of spec.pu) cn.addPump({ id: p.id, st: p.st, ch: p.ch, seg: p.seg, dir: p.dir, boost: p.boost, eff: p.eff, fault: p.fault });
  return cn;
}
let total = 0, sat = 0, alt = 0; const AGG = { calls: 0, cacheable: 0, lookupHit: 0, miss: 0, verified: 0, mismatch: 0, invalSat: 0, begin: 0, rev: 0, nonChannel: 0, ban: 0, bias: 0, over: 0 }, CAUSE = { setFault: 0, setPumpDir: 0, setPumpFault: 0, addSeg: 0, addPump: 0, tap: 0, addStation: 0 }; let firstMis = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const R = rng(seed * 7919), ri = n => Math.floor(R() * n), nN = 4 + ri(14), spec = { st: [], seg: [], pu: [] };
  for (let i = 0; i < nN; i++) spec.st.push({ id: 'S' + i, x: i * 3, y: 0 });
  const addSeg = (a, b, id) => { const len = 3 + ri(3), x0 = 100 + spec.seg.length * 20; const path = []; for (let k = 0; k < len; k++) path.push([x0 + k, 10 + spec.seg.length]); const f = {}; if (R() < 0.08) f[CH[ri(6)]] = true; spec.seg.push({ id, a, b, path, fault: f }); };
  for (let i = 1; i < nN; i++) addSeg('S' + ri(i), 'S' + i, 'G' + spec.seg.length);                  // a tree, then loops (ties in length happen: lengths are 3..5)
  for (let k = ri(nN); k > 0; k--) { const a = ri(nN); let b = ri(nN); if (a !== b) addSeg('S' + a, 'S' + b, 'G' + spec.seg.length); }
  for (let k = ri(10); k > 0; k--) { const g = spec.seg[ri(spec.seg.length)], st = R() < .5 ? g.a : g.b; spec.pu.push({ id: 'P' + spec.pu.length, st, ch: CH[ri(6)], seg: g.id, dir: R() < .5 ? 1 : -1, boost: 20 + ri(60), eff: .5 + R() * .5, fault: R() < .1 }); }
  const A = mkNet(ORIG, spec), B = mkNet(NEW, spec); B.pcMode = 1; const HOT = []; for (let h = 0; h < 4; h++) HOT.push([CH[ri(6)], 'S' + ri(nN), 'S' + ri(nN)]); const  both = f => [f(A), f(B)], eq = (x, y, what) => { total++; if (x !== y) { console.log('MISMATCH seed', seed, what, '\n ORIG', x, '\n NEW ', y); process.exit(1); } };
  const SEG = spec.seg.map(g => g.id); let extra = 0;
  for (let step = 0; step < 6; step++) {
    A.begin(0.05); B.begin(0.05);
    for (let op = 0; op < 60; op++) {
      const hot = R() < .6 ? HOT[ri(4)] : null, ch = hot ? hot[0] : CH[ri(6)], f = hot ? hot[1] : 'S' + ri(nN), t = hot ? hot[2] : 'S' + ri(nN), r = R() < .2 ? CAP * (0.5 + R() * 2) : R() * CAP * .6, p0 = R() < .1 ? 0 : 50 + R() * 500, k = R();
      let over = null; if (R() < .3) { over = []; for (let j = ri(4); j > 0; j--) over.push([SEG[ri(SEG.length)] + '|' + ch, R() * CAP]); if (R() < .3) over.push(['P' + (spec.pu.length ? spec.pu[ri(spec.pu.length)].id : 'P0'), R() * 50000]); }
      const mkOver = () => over ? new Map(over) : (R() < 0 ? new Map() : null), emptyOver = R() < .2;
      const ov = () => emptyOver && !over ? new Map() : mkOver();
      if (k < .25) { const ban = R() < .4 ? new Set([SEG[ri(SEG.length)]]) : null, bias = R() < .3, o = [ov(), ov()]; eq(cpath(A.path(ch, f, t, o[0], ban, bias)), cpath(B.path(ch, f, t, o[1], ban, bias)), 'path'); }
      else if (k < .85) { const o = [ov(), ov()], pa = A.plan(ch, f, t, r, p0, o[0]), pb = B.plan(ch, f, t, r, p0, o[1]); eq(canon(pa), canon(pb), 'plan'); if (pa && pa.hops.length > 1) alt++;
        if (pa && R() < .7) { const acc = pa.r * (R() < .3 ? 1 : R()); A._apply(ch, pa, acc); B._apply(ch, pb, acc); for (const g of spec.seg) if (CAP - A.usedOf(null, g.id, ch) <= 1e-6) { sat++; break; } } }
      else if (k < .93) { const g = SEG[ri(SEG.length)], c = R() < .3 ? null : CH[ri(6)], on = R() < .5; both(n => n.setFault(g, c, on)); CAUSE.setFault++; }
      else if (k < .97 && spec.pu.length) { const p = spec.pu[ri(spec.pu.length)].id; if (R() < .5) { const dv = R() < .5 ? 1 : -1; both(n => n.setPumpDir(p, dv)); CAUSE.setPumpDir++; } else { const on = R() < .5; both(n => n.setPumpFault(p, on)); CAUSE.setPumpFault++; } }
      else if (k < .985 && R() < .5) { const g = spec.seg[ri(spec.seg.length)]; if (g.path.length >= 3 && A.seg.has(g.id) && B.seg.has(g.id)) { const [x, y] = g.path[1]; const ra = A.tap(x, y, {}), rb = B.tap(x, y, {}); eq(String(!!ra.ok) + (ra.station ? ra.station.id : ''), String(!!rb.ok) + (rb.station ? rb.station.id : ''), 'tap'); if (ra.ok && !ra.existing) { CAUSE.tap++; SEG.push(...ra.segs.map(q => q.id)); for (const q of ra.segs) spec.seg.push({ id: q.id, a: q.a, b: q.b, path: q.path, fault: {} }); spec.seg = spec.seg.filter(q => q.id !== g.id); const ix = SEG.indexOf(g.id); if (ix >= 0) SEG.splice(ix, 1); } } }
      else if (k < .99 && A.seg.size) { const g = [...A.seg.values()][ri(A.seg.size)], stn = R() < .5 ? g.a : g.b, chp = CH[ri(6)], dr = R() < .5 ? 1 : -1, bo = 20 + ri(60), ef = .5 + R() * .5, idp = 'Q' + (extra++) + '_' + step + '_' + op; both(n => n.addPump({ id: idp, st: stn, ch: chp, seg: g.id, dir: dr, boost: bo, eff: ef, fault: false })); CAUSE.addPump++; }
      else if (k < .995) { const idn = 'N' + step + '_' + op; both(n => n.addStation({ id: idn, x: 9000 + step * 10 + op, y: 0 })); CAUSE.addStation++; }
      else if (extra < 3) { extra++; const a = 'S' + ri(nN), b = 'S' + ri(nN); if (a !== b) { const id = 'X' + extra + '_' + step, x0 = 5000 + extra * 40 + step * 400, path = [[x0, 1], [x0 + 1, 1], [x0 + 2, 1], [x0 + 3, 1]]; both(n => n.addSeg({ id, kind: 'main', a, b, path, fault: {} })); CAUSE.addSeg++; SEG.push(id); spec.seg.push({ id, a, b, path, fault: {} }); } }   // a segment added in the middle of a step
      for (const ch2 of CH) { eq(bits(A.usedOf(null, SEG[0], ch2)), bits(B.usedOf(null, SEG[0], ch2)), 'usedOf'); }
    }
    A.end(); B.end(); { const t = B.pcStats; if (t) { for (const k of ['calls','cacheable','lookupHit','miss','verified','mismatch','invalSat','nonChannel','ban','bias','over']) AGG[k] += t[k]; AGG.begin += t.clears.begin; AGG.rev += t.clears.rev; if (t.first.length && firstMis.length < 3) firstMis.push(...t.first); B.pcStats = null; } }
    const dump = n => JSON.stringify([[...n.seg.values()].map(g => CH.map(c => [bits(g.f[c].flow), bits(g.f[c].net)])), [...n.pumps.values()].map(p => [p.id, bits(p.flow), bits(p.pIn), bits(p.pOut), p.lowIn]), CH.map(c => [bits(n.ch[c].flow), bits(n.ch[c].pressure), bits(n.ch[c].qty), bits(n.ch[c].moved), n.ch[c].status, n.ch[c].dir, n.ch[c].hasFault, n.ch[c].tiles]), n._chFlow && CH.map(c => [bits(n._chFlow[c]), bits(n._chP[c]), bits(n._chPw[c])])]);
    eq(dump(A), dump(B), 'end() state');
  }
}
console.log(JSON.stringify({ shadow: AGG, mutations: CAUSE, firstMismatches: firstMis.slice(0, 3) })); if (AGG.mismatch) { console.log('SHADOW MISMATCHES'); process.exit(2); }
console.log('FUZZ OK seeds', SEEDS, 'comparisons', total, 'saturation-events', sat, 'multi-hop plans', alt);
