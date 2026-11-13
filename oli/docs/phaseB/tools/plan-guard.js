/* B6 invalidation guard for the plan() memo.
   Every answer of CentralNet.plan() is compared, bit for bit, with an INDEPENDENT reference (a replica of the original plan() that uses the uncached _pathCore and the original _planHops), for the SAME call,
   while the state under the memo is changed: _apply on the same / another channel (used + pump usage), begin(), setPumpFault, setPumpDir, setFault, tap / addPump (rev bump), a saturation flip inside the step,
   a different r / p0 / over for the same pair (single-slot thrash), -0 / 0, null answers.  Each call is made twice (the second one is the memo hit).
   Targeted scenarios T1..T9 are followed by a long random phase.  exit code != 0 = a stale or wrong answer was found.
   node plan-guard.js   (ROOT = tree under test, SAVE = the real save, ITER = random operations, default 5000, SEED) */
const path = require('path'), ROOT = process.env.ROOT || path.join(__dirname, '../../..'), C = require(path.join(ROOT, 'central.js')), { build } = require('./realload.js');
const { g } = build(); const cn = g.net.central; cn.setCacheMode(+(process.env.PCMODE || 2)); cn.begin(0.05);
const CAP = C.CLASS.capacity, CH = C.CHANNELS, EPS = 1e-6; let seed = +(process.env.SEED || 11); const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, pick = a => a[Math.floor(rnd() * a.length)];
const bits = x => typeof x === 'number' ? Buffer.from(new Float64Array([x]).buffer).toString('hex') : String(x);
const canon = pl => !pl ? 'null' : JSON.stringify({ h: pl.hops.map(h => [h.g.id, h.dir, h.from, h.to]), r: bits(pl.r), p: bits(pl.p), n: pl.nodes, st: pl.stats.map(([pu, a, b, on]) => [pu.id, bits(a), bits(b), on]) });
/* the reference: the original plan() of B5 (same text), but every search goes through the uncached _pathCore */
function ref(ch, from, to, r, p0, over) {
  if (from === to) return r > EPS ? { hops: [], r, p: p0, stats: [], nodes: [from] } : null;
  const first = cn._pathCore(ch, from, to, over); if (!first) return null; let best = cn._planHops(ch, first, r, p0, over);
  if (!best || best.r < r - 1e-6) {
    const seen = new Set([first.map(h => h.g.id).join()]);
    const pb = cn._pathCore(ch, from, to, over, null, true); if (pb) { const key = pb.map(h => h.g.id).join(); if (!seen.has(key)) { seen.add(key); const c = cn._planHops(ch, pb, r, p0, over); if (c && (!best || c.r > best.r + 1e-6)) best = c; } }
    for (const h0 of first) { const hops = cn._pathCore(ch, from, to, over, new Set([h0.g.id])); if (!hops) continue; const key = hops.map(h => h.g.id).join(); if (seen.has(key)) continue; seen.add(key); const c = cn._planHops(ch, hops, r, p0, over); if (c && (!best || c.r > best.r + 1e-6)) best = c; }
  }
  return best;
}
let n = 0, bad = 0; const fail = (w, a, b) => { bad++; if (bad <= 6) console.log('STALE/WRONG', w, '\n  got ', a, '\n  ref ', b); };
const cpo = o => o ? new Map(o) : o;
/* one comparison: the answer of plan() (twice: the second is the memo hit) against the reference; returns the (first) plan for the caller */
function cmp(w, ch, from, to, r, p0, over) {
  const want = canon(ref(ch, from, to, r, p0, cpo(over))); let pl = null;
  for (let k = 0; k < 2; k++) { n++; const got = cn.plan(ch, from, to, r, p0, cpo(over)); if (k === 0) pl = got; const c = canon(got); if (c !== want) fail(w + (k ? ' (hit)' : ''), c, want); }
  return pl;
}
const segs = () => [...cn.seg.keys()], sts = () => [...cn.st.keys()], pumps = () => [...cn.pumps.values()];
const R = [125000, 40000, 3000, 1e7, 250000, 1e-3, 77777.125], P0 = [58, 3000, 20, 5000, 0, -0];
/* the usual flow: apply a plan (what commit does) */
const apply = (ch, pl, f) => { if (pl && pl.hops.length) cn._apply(ch, pl, pl.r * f); };
const flipHop = (ch, id, on) => { const seg = cn.seg.get(id), i = cn._ixOf(id) * 6 + CH.indexOf(ch), used = cn._used[i] || 0; cn._apply(ch, { hops: [{ g: seg, dir: 1 }], stats: [], p: 0 }, on ? CAP - used : -used); };
const pairs = []; for (let k = 0; k < 600 && pairs.length < 50; k++) { const a = pick(sts()), b = pick(sts()), ch = pick(CH.slice(0, 3)); const pl = ref(ch, a, b, 125000, 58, null); if (pl && pl.hops.length >= 2) pairs.push([ch, a, b, pl]); }
const pumpPairs = []; for (let k = 0; k < 4000 && pumpPairs.length < 20; k++) { const p = pick(pumps()), a = pick(sts()), b = pick(sts()); const pl = ref(p.ch, a, b, 125000, 58, null); if (pl && pl.stats.length) pumpPairs.push([p.ch, a, b, pl]); }
if (!pairs.length) { console.log('no pair found'); process.exit(2); }
console.log('pairs', pairs.length, 'pump pairs', pumpPairs.length);
/* T1: apply on the same channel between memoised calls (used and pump usage change), until the path saturates */
for (const [ch, a, b] of pairs.slice(0, 25)) { cn.begin(0.05); for (let i = 0; i < 6; i++) { const pl = cmp('T1 apply #' + i, ch, a, b, 125000, 58, null); apply(ch, pl, i < 4 ? 0.9 : 1); } }
/* T2: begin() between memoised calls (everything is empty again) */
for (const [ch, a, b] of pairs.slice(0, 25)) { cn.begin(0.05); const pl = cmp('T2 fill', ch, a, b, 125000, 58, null); apply(ch, pl, 1); cmp('T2 used', ch, a, b, 125000, 58, null); cn.begin(0.05); cmp('T2 after begin', ch, a, b, 125000, 58, null); }
/* T3: pump fault / pump direction / pump usage on a path with a pump */
for (const [ch, a, b, pl0] of pumpPairs) { cn.begin(0.05); const pu = pl0.stats[0][0]; cmp('T3 before', ch, a, b, 125000, 58, null); cn.setPumpFault(pu.id, true); cmp('T3 pump fault', ch, a, b, 125000, 58, null); cn.setPumpFault(pu.id, false); cmp('T3 pump ok', ch, a, b, 125000, 58, null);
  const pl = cmp('T3 pump used', ch, a, b, 250000, 58, null); apply(ch, pl, 1); cmp('T3 after pump usage', ch, a, b, 250000, 58, null); cn.setPumpDir(pu.id, -pu.dir); cmp('T3 dir flipped', ch, a, b, 125000, 58, null); cn.setPumpDir(pu.id, -pu.dir); cmp('T3 dir back', ch, a, b, 125000, 58, null);
  /* direct writes of the plain fields (the old tests do this: p.fault = true), no method, no rev bump */
  pu.fault = true; cmp('T3 direct fault', ch, a, b, 125000, 58, null); pu.fault = false; cmp('T3 direct repair', ch, a, b, 125000, 58, null); const d0 = pu.dir; pu.dir = -d0; cmp('T3 direct dir', ch, a, b, 125000, 58, null); pu.dir = d0; cmp('T3 direct dir back', ch, a, b, 125000, 58, null); }
/* T4: faults (rev bump) and null answers: the memo must not keep a null / non-null answer */
for (const [ch, a, b, pl0] of pairs.slice(0, 25)) { cn.begin(0.05); cmp('T4 before', ch, a, b, 125000, 58, null); for (const h of pl0.hops) cn.setFault(h.g.id, ch, true); cmp('T4 all faulted (null?)', ch, a, b, 125000, 58, null); cmp('T4 again', ch, a, b, 3000, 58, null); for (const h of pl0.hops) cn.setFault(h.g.id, ch, false); cmp('T4 cleared', ch, a, b, 125000, 58, null); cn.setFault(pl0.hops[0].g.id, ch, true); cmp('T4 first faulted', ch, a, b, 125000, 58, null); cn.setFault(pl0.hops[0].g.id, ch, false); }
/* T5: an apply on ANOTHER channel must not change the answers of this one (and the answer must still be right) */
for (const [ch, a, b] of pairs.slice(0, 25)) { cn.begin(0.05); cmp('T5 fill', ch, a, b, 125000, 58, null); const o = CH[(CH.indexOf(ch) + 1) % 6]; const po = cmp('T5 other', o, a, b, 125000, 58, null); apply(o, po, 1); cmp('T5 after other apply', ch, a, b, 125000, 58, null); cmp('T5 other after', o, a, b, 125000, 58, null); const pl = cmp('T5 same', ch, a, b, 125000, 58, null); apply(ch, pl, 1); cmp('T5 after own apply', ch, a, b, 125000, 58, null); }
/* T6: the same pair with other r / p0 (single-slot thrash, -0 / 0, tiny r, huge r) */
for (const [ch, a, b] of pairs.slice(0, 20)) { cn.begin(0.05); for (let k = 0; k < 24; k++) cmp('T6 r/p0 #' + k, ch, a, b, pick(R), pick(P0), null); for (const r of [125000, 40000, 125000, 125000, 40000]) cmp('T6 alt r', ch, a, b, r, 58, null); cmp('T6 -0', ch, a, b, -0, 58, null); cmp('T6 0', ch, a, b, 0, 58, null); cmp('T6 NaN-free p0 0', ch, a, b, 125000, 0, null); cmp('T6 p0 -0', ch, a, b, 125000, -0, null); }
/* T7: over (empty Map / non-empty): never memoised, never pollutes the memo */
for (const [ch, a, b, pl0] of pairs.slice(0, 25)) { cn.begin(0.05); cmp('T7 null', ch, a, b, 125000, 58, null); const h = pl0.hops[0]; const o = new Map([[h.g.id + '|' + ch, CAP]]); cmp('T7 over sat', ch, a, b, 125000, 58, o); cmp('T7 null again', ch, a, b, 125000, 58, null); cmp('T7 empty Map', ch, a, b, 125000, 58, new Map()); const o2 = new Map([[h.g.id + '|' + ch, 1e4]]); cmp('T7 over small', ch, a, b, 125000, 58, o2); cmp('T7 over small 2', ch, a, b, 125000, 58, o2); cmp('T7 null 3', ch, a, b, 125000, 58, null); }
/* T8: saturation flip inside the step (a segment of the channel gets exactly full / free) */
for (const [ch, a, b, pl0] of pairs.slice(0, 25)) { cn.begin(0.05); cmp('T8 before', ch, a, b, 125000, 58, null); for (const h of pl0.hops.slice(0, 3)) { flipHop(ch, h.g.id, true); cmp('T8 sat ' + h.g.id, ch, a, b, 125000, 58, null); flipHop(ch, h.g.id, false); cmp('T8 free ' + h.g.id, ch, a, b, 125000, 58, null); } }
/* T9: the graph changes (tap a new station, add a pump): rev bump */
for (const [ch, a, b, pl0] of pairs.slice(0, 12)) { cn.begin(0.05); cmp('T9 before', ch, a, b, 125000, 58, null); const g0 = pl0.hops[Math.floor(pl0.hops.length / 2)].g; if (g0.path.length > 3) { const [x, y] = g0.path[Math.floor(g0.path.length / 2)]; cn.tap(x, y, {}); } cmp('T9 after tap', ch, a, b, 125000, 58, null); const sts0 = sts(); cn.addPump({ st: pick(sts0), ch }); cmp('T9 after addPump', ch, a, b, 125000, 58, null); }
/* random phase */
for (let it = 0; it < +(process.env.ITER || 5000); it++) {
  const r = rnd(), P = rnd() < .75 ? pick(pairs) : null, ss = sts(), a = P && cn.st.has(P[1]) ? P[1] : pick(ss), b = P && cn.st.has(P[2]) ? P[2] : pick(ss), ch = P ? P[0] : pick(CH);
  if (r < .5) { const rr = pick(R), pp = pick(P0), o = rnd() < .8 ? null : new Map([[pick(segs()) + '|' + ch, pick([CAP, 1e4, 5])]]); const pl = cmp('R plan', ch, a, b, rr, pp, o); if (rnd() < .5) apply(ch, pl, pick([1, .5, .9])); }
  else if (r < .72) { const pl = ref(ch, a, b, pick(R), 58, null); apply(pick(CH), pl, pick([1, .5])); }
  else if (r < .78) flipHop(ch, pick(segs()), rnd() < .6);
  else if (r < .86) cn.begin(0.05);
  else if (r < .92) { const ps = pumps(); if (ps.length) cn.setPumpFault(pick(ps).id, rnd() < .5); }
  else if (r < .94) { const ps = pumps(); if (ps.length) pick(ps).fault = rnd() < .5; }
  else if (r < .955) { const ps = pumps(); if (ps.length) pick(ps).dir = rnd() < .5 ? 1 : -1; }
  else if (r < .96) cn.setFault(pick(segs()), ch, rnd() < .5);
  else if (r < .985) { const ps = pumps(); if (ps.length) { const p = pick(ps); cn.setPumpDir(p.id, rnd() < .5 ? 1 : -1); } }
  else { for (const id of segs()) cn.setFault(id, ch, false); for (const p of pumps()) cn.setPumpFault(p.id, false); }
}
console.log('plan-guard: checks', n, 'failures', bad, 'memo', JSON.stringify(cn.plStats)); process.exit(bad || cn.plStats.mismatch ? 1 : 0);
