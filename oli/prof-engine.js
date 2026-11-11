/* Oli - prof-engine.js  (where the engine's time goes: a CPU profile of N game hours on the bench world, self time per function, for one code tree)
 *   node prof-engine.js <codeRoot> [N=3000] [hours=48]
 * Prints the total ms, ms per game hour and the 20 functions with the most self time (share of all samples, idle excluded) - run it on the old tree and the new one.
 * bench-full.js is always taken from this folder (the old tree has no copy); only the engine files come from <codeRoot>.
 */
const path = require('path'), insp = require('inspector'), Module = require('module');
const ROOT = path.resolve(process.argv[2] || '.'), N = +(process.argv[3] || 3000), H = +(process.argv[4] || 48);
const orig = Module._resolveFilename; Module._resolveFilename = function (req, parent, ...r) { if (/^\.\/(buildings|industry|economy|economy-config|central|central-plan|building-config|ledger|game-calendar|oil-engine|worldmap|core)\.js$/.test(req)) return path.join(ROOT, req); return orig.call(this, req, parent, ...r); };
const { build } = require('./bench-full.js'); const g = build(N); g.co.advanceHours(6);
const s = new insp.Session(); s.connect();
s.post('Profiler.enable', () => s.post('Profiler.setSamplingInterval', { interval: 250 }, () => s.post('Profiler.start', () => {
  const t0 = process.hrtime.bigint(); g.co.advanceHours(H); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  s.post('Profiler.stop', (e, { profile: p }) => {
    const self = new Map(); let tot = 0;
    for (const n of p.nodes) { const f = n.callFrame, k = (f.functionName || '(anon)') + ' ' + (f.url ? f.url.split('/').pop() + ':' + (f.lineNumber + 1) : ''); if (f.functionName === '(idle)' || f.functionName === '(program)') continue; tot += n.hitCount; self.set(k, (self.get(k) || 0) + n.hitCount); }
    console.log(JSON.stringify({ root: ROOT, N, buildings: g.store.items.size, hours: H, totalMs: Math.round(ms), msPerHour: +(ms / H).toFixed(2) }));
    [...self].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log((v / tot * 100).toFixed(1).padStart(5) + '%  ' + (v / tot * ms / H).toFixed(2).padStart(6) + ' ms/h  ' + k));
  });
})));
