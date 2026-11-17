/* S2b rollout: automatic fallback test.  A fault is injected into the tree code after the k-th use; the run must (a) switch the feature off by itself (trStats.disabled = 1) and (b) give the same sha1 every hour as the plain engine.
   node inject-fallback.js <real|scene.json> <hours> <fault: corrupt|throw|badtree> <mode 1|2> <trVerify> [afterN]
   corrupt = the tree answer loses its first hop;  throw = _treeBuild throws;  badtree = _treeBuild returns a tree whose predecessor of every 3rd node is damaged. */
const path = require('path'), crypto = require('crypto'), S = require('./gen-scene.js'), C = require(path.resolve(__dirname, '..') + '/central.js'), CN = C.CentralNet;
const [what, H, fault, mode, ver, after] = [process.argv[2], +process.argv[3] || 12, process.argv[4], +process.argv[5] || 1, +process.argv[6] || 16, +process.argv[7] || 3];
const run = inj => {
  CN.trDefault = inj ? mode : 0; CN.trVerify = ver; const P = CN.prototype, o = { b: P._treeBuild, h: P._treeHops }; let n = 0;
  if (inj && fault === 'corrupt') P._treeHops = function (...a) { const r = o.h.apply(this, a); return (r && ++n > after && r.length > 1) ? r.slice(1) : r; };
  if (inj && fault === 'throw') P._treeBuild = function (...a) { if (++n > after) throw new Error('injected'); return o.b.apply(this, a); };
  if (inj && fault === 'badtree') P._treeBuild = function (...a) { const t = o.b.apply(this, a); if (++n > after) for (let i = 0; i < t.pe.length; i += 3) if (t.pe[i]) t.pe[i] = t.pe[(i + 1) % t.pe.length] || null; return t; };
  const g = what === 'real' ? S.boot() : S.load(what), sinks = (g.sinks || []).map(id => g.store.get(id)).filter(Boolean), hs = [];
  for (let h = 0; h < H; h++) { for (const b of sinks) g.sim.ensure(b).vol = 0; g.co.advanceHours(1); hs.push(crypto.createHash('sha1').update(JSON.stringify({ s: g.store.toJSON(), n: g.net.toJSON(), e: g.co.toJSON() })).digest('hex').slice(0, 12)); }
  P._treeBuild = o.b; P._treeHops = o.h; return { hs, tr: g.cn.trStats, mode: g.cn.trMode, injected: n };
};
const a = run(false), b = run(true); let diff = 0, first = -1; for (let h = 0; h < H; h++) if (a.hs[h] !== b.hs[h]) { diff++; if (first < 0) first = h; }
console.log(JSON.stringify({ what: path.basename(what), hours: H, fault, mode, trVerify: ver, afterN: after, hoursDifferent: diff, firstDiff: first, finalMode: b.mode, selfDisabled: b.tr.disabled, mismatch: b.tr.mismatch, errors: b.tr.errors, treeUses: b.injected }));
