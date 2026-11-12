/* B4 invalidation guard for the extended path cache (ban / bias / over entries).
   Every cached answer of CentralNet.path() is compared with the uncached _pathCore() for the SAME call, while the step is changed under the cache's feet:
     - a segment of the channel becomes saturated or free INSIDE the step (_apply with a load that fills it / a negative load that empties it),
     - begin() starts a new step,  - a fault is set / cleared (rev bump),  - `over` is non-empty and (does / does not) change the capacity predicate of a segment it mentions,
     - the same (from, to) asked with a different banned segment, with bias, and plain,  - repeated calls (the second one is the cache hit).
   Targeted scenarios T1..T5 (one per kind of invalidation) are followed by a long random phase.  exit code != 0 = a stale or wrong answer was found.
   node ban-guard.js   (ROOT = tree under test, SAVE = the real save, ITER = random operations, default 6000) */
const path = require('path'), ROOT = process.env.ROOT || path.join(__dirname, '../../..'), C = require(path.join(ROOT, 'central.js')), { build } = require('./realload.js');
const { g } = build(); const cn = g.net.central; cn.setCacheMode(+(process.env.PCMODE || 2)); cn.begin(0.05);
const CAP = C.CLASS.capacity, CH = C.CHANNELS; let seed = +(process.env.SEED || 7); const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, pick = a => a[Math.floor(rnd() * a.length)];
const segs = [...cn.seg.keys()], sts = [...cn.st.keys()];
const sig = h => h ? JSON.stringify(h.map(x => [x.g.id, x.dir, x.from, x.to])) : 'null';
let n = 0, bad = 0; const fail = (w, a, b) => { bad++; if (bad <= 6) console.log('STALE/WRONG', w, '\n  cached  ', a, '\n  uncached', b); };
/* one comparison: the cached answer (twice: the second is the cache hit) against the uncached search */
function cmp(w, ch, from, to, over, ban, bias) {
  const mk = () => ban ? new Set(ban) : null, ref = sig(cn._pathCore(ch, from, to, over, mk(), bias));
  for (let k = 0; k < 2; k++) { n++; const got = sig(cn.path(ch, from, to, over, mk(), bias)); if (got !== ref) fail(w + (k ? ' (hit)' : ''), got, ref); }
}
/* every kind of call for one pair */
function all(w, ch, from, to, over) {
  cmp(w + ' plain', ch, from, to, over, null, false); cmp(w + ' bias', ch, from, to, over, null, true);
  const first = cn._pathCore(ch, from, to, null, null, false); if (first) for (const h of first) cmp(w + ' ban ' + h.g.id, ch, from, to, over, [h.g.id], false);
}
const flipHop = (ch, id, on) => { const seg = cn.seg.get(id), i = cn._ixOf(id) * 6 + CH.indexOf(ch), used = cn._used[i] || 0; cn._apply(ch, { hops: [{ g: seg, dir: 1 }], stats: [], p: 0 }, on ? CAP - used : -used); };   /* fills the segment to exactly its capacity / empties it: the predicate flips */
const pairs = []; for (let k = 0; k < 400 && pairs.length < 60; k++) { const a = pick(sts), b = pick(sts), ch = pick(CH.slice(0, 3)); const p = cn._pathCore(ch, a, b, null, null, false); if (p && p.length >= 3) pairs.push([ch, a, b, p]); }
if (!pairs.length) { console.log('no pair found'); process.exit(2); }
/* T1: a segment of the channel becomes saturated / free inside the step, between cached calls */
for (const [ch, a, b, first] of pairs.slice(0, 20)) { all('T1 before', ch, a, b, null); for (const h of first.slice(0, 3)) { flipHop(ch, h.g.id, true); all('T1 sat ' + h.g.id, ch, a, b, null); flipHop(ch, h.g.id, false); all('T1 free ' + h.g.id, ch, a, b, null); } }
/* T2: `over` non-empty after the cache was filled with over empty: with a value that flips a segment of the path / the alternatives, and with one that flips nothing */
for (const [ch, a, b, first] of pairs.slice(0, 20)) { all('T2 fill', ch, a, b, null); for (const h of first.slice(0, 3)) { const o = new Map([[h.g.id + '|' + ch, CAP]]); all('T2 over-sat ' + h.g.id, ch, a, b, o); const o2 = new Map([[h.g.id + '|' + ch, 1e-3]]); all('T2 over-small ' + h.g.id, ch, a, b, o2); const alt = cn._pathCore(ch, a, b, null, new Set([h.g.id]), false); if (alt) for (const h2 of alt.slice(0, 2)) all('T2 over-alt ' + h2.g.id, ch, a, b, new Map([[h2.g.id + '|' + ch, CAP]])); } }
/* T3: the same pair banned on one segment, then on another */
for (const [ch, a, b, first] of pairs.slice(0, 20)) for (const h1 of first.slice(0, 4)) for (const h2 of first.slice(0, 4)) { cmp('T3 ban1 ' + h1.g.id, ch, a, b, null, [h1.g.id], false); cmp('T3 ban2 ' + h2.g.id, ch, a, b, null, [h2.g.id], false); }
/* T4: a segment saturated, the cache filled, then a new step (begin) empties everything */
for (const [ch, a, b, first] of pairs.slice(0, 20)) { const h = first[Math.floor(first.length / 2)]; flipHop(ch, h.g.id, true); all('T4 filled while saturated ' + h.g.id, ch, a, b, null); cn.begin(0.05); all('T4 after begin ' + h.g.id, ch, a, b, null); }
/* T5: bias and plain for the same pair (different answers exist only where a pump pushes the right way) */
let diff = 0; for (const [ch, a, b] of pairs) { cn.begin(0.05); const p = sig(cn._pathCore(ch, a, b, null, null, false)), q = sig(cn._pathCore(ch, a, b, null, null, true)); if (p !== q) diff++; cmp('T5 plain first', ch, a, b, null, null, false); cmp('T5 then bias', ch, a, b, null, null, true); cn.begin(0.05); cmp('T5 bias first', ch, a, b, null, null, true); cmp('T5 then plain', ch, a, b, null, null, false); }
if (!diff) console.log('note: no pair where bias differs from plain was found (T5 cannot show a difference)');
/* faults (rev bump) */
for (const [ch, a, b, first] of pairs.slice(0, 15)) { all('F before', ch, a, b, null); const h = first[0]; cn.setFault(h.g.id, ch, true); all('F fault ' + h.g.id, ch, a, b, null); cn.setFault(h.g.id, ch, false); all('F cleared ' + h.g.id, ch, a, b, null); }
/* random phase: random calls mixed with random changes of the step */
for (let it = 0; it < +(process.env.ITER || 6000); it++) {
  const r = rnd(), ch = pick(CH), P = pairs.length && rnd() < .7 ? pick(pairs) : null, a = P ? P[1] : pick(sts), b = P ? P[2] : pick(sts), cc = P ? P[0] : ch;
  if (r < .45) { const o = rnd() < .5 ? null : new Map([[pick(segs) + '|' + cc, pick([CAP, CAP - 1e-7, CAP - 2e-6, 5, 1e-3])]]); const first = cn._pathCore(cc, a, b, o, null, false); const kind = rnd(); if (kind < .3) cmp('R plain', cc, a, b, o, null, false); else if (kind < .5) cmp('R bias', cc, a, b, o, null, true); else if (first && first.length) cmp('R ban', cc, a, b, o, [pick(first).g.id], false); else cmp('R ban-any', cc, a, b, o, [pick(segs)], false); }
  else if (r < .75) flipHop(cc, pick(segs), rnd() < .6);
  else if (r < .85) cn.begin(0.05);
  else if (r < .95) cn.setFault(pick(segs), cc, rnd() < .5);
  else { const ids = [...cn.seg.keys()]; for (const id of ids) cn.setFault(id, cc, false); }
}
console.log('ban-guard: checks', n, 'failures', bad); process.exit(bad ? 1 : 0);
