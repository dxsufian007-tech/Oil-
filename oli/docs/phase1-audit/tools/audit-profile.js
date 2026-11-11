/* Phase 1 audit (MEASUREMENT ONLY, touches no game file): cost of one game hour per size, per function (self / inclusive / calls), GC, heap.
 *   node audit-profile.js <codeRoot> <flat:N|central> <hours> <reps> <out.json>
 * reps unprofiled timing runs (ms per game hour, GC time/count, heap) + one CPU-profile run + one precise-coverage (call counts) run. */
const path = require('path'), fs = require('fs'), insp = require('inspector'), Module = require('module'), { PerformanceObserver } = require('perf_hooks');
const [ROOTa, SCEN, HOURS, REPS, OUT] = process.argv.slice(2), ROOT = path.resolve(ROOTa), H = +HOURS, NR = +REPS, BENCH = '/tmp/wt-b2/oli/bench-full.js';
const orig = Module._resolveFilename; Module._resolveFilename = function (req, parent, ...r) { if (/^\.\/(buildings|industry|economy|economy-config|central|central-plan|building-config|ledger|game-calendar|oil-engine|worldmap|core|test-central-kit)\.js$/.test(req)) return path.join(ROOT, req); return orig.call(this, req, parent, ...r); };
let mk;
if (SCEN === 'central') { const src = fs.readFileSync('/tmp/wt-b2/oli/econ-compare.js', 'utf8').split('\n'), a = src.findIndex(l => l.startsWith('function central()')), b = src.findIndex((l, i) => i > a && l.startsWith('const g = SCEN'));
  const R = f => require(path.resolve(ROOT, f)); const B = R('buildings.js'), I = R('industry.js'), E = R('economy.js'), EC = R('economy-config.js'), DEFS = B.DEFS; mk = new Function('R', 'B', 'I', 'E', 'EC', 'DEFS', 'require', 'path', src.slice(a, b).join('\n') + '\nreturn central;')(R, B, I, E, EC, DEFS, require, path); }
else { const { build } = require(BENCH), N = +SCEN.split(':')[1]; mk = () => build(N); }
const gcs = []; const po = new PerformanceObserver(l => { for (const e of l.getEntries()) gcs.push({ kind: e.detail ? e.detail.kind : e.kind, ms: e.duration }); }); po.observe({ entryTypes: ['gc'] });
const ns = () => process.hrtime.bigint(), ms = (a, b) => Number(b - a) / 1e6, mem = () => process.memoryUsage();
const timing = [];
for (let r = 0; r < NR; r++) { global.gc && global.gc(); const g = mk(), co = g.co; co.advanceHours(6); gcs.length = 0; const h0 = mem().heapUsed, t0 = ns(); let worst = 0; for (let h = 0; h < H; h++) { const a = ns(); co.advanceHours(1); worst = Math.max(worst, ms(a, ns())); } const t = ms(t0, ns());
  timing.push({ rep: r, buildings: g.store.items.size, lines: g.net.lines.size, msPerHour: t / H, worstHourMs: worst, gcCount: gcs.length, gcMs: gcs.reduce((a, x) => a + x.ms, 0), heapStartMB: h0 / 1048576, heapEndMB: mem().heapUsed / 1048576, rssMB: mem().rss / 1048576 }); }
const s = new insp.Session(); s.connect(); const post = (m, p) => new Promise((res, rej) => s.post(m, p || {}, (e, r) => e ? rej(e) : res(r)));
(async () => {
  const g = mk(), co = g.co; co.advanceHours(6); await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 200 }); await post('Profiler.start');
  const t0 = ns(); co.advanceHours(H); const profMs = ms(t0, ns()); const { profile: p } = await post('Profiler.stop');
  const byId = new Map(p.nodes.map(n => [n.id, n])); const incl = new Map(), self = new Map(); let tot = 0;
  const key = n => { const f = n.callFrame; return (f.functionName || '(anonymous)') + ' ' + (f.url ? f.url.split('/').pop() + ':' + (f.lineNumber + 1) : ''); };
  const hit = new Map(); for (const n of p.nodes) hit.set(n.id, n.hitCount || 0);
  const total = n => { let t = hit.get(n.id); for (const c of n.children || []) t += total(byId.get(c)); n._t = t; return t; }; total(p.nodes[0]);
  const walk = (n, seen) => { const k = key(n); if (n.callFrame.functionName !== '(idle)' && n.callFrame.functionName !== '(program)' && n.callFrame.functionName !== '(root)') { self.set(k, (self.get(k) || 0) + hit.get(n.id)); tot += hit.get(n.id); if (!seen.has(k)) { incl.set(k, (incl.get(k) || 0) + n._t); } } const s2 = new Set(seen).add(k); for (const c of n.children || []) walk(byId.get(c), s2); };
  walk(p.nodes[0], new Set());
  const per = v => v / tot * profMs / H, top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ fn: k, pct: +(v / tot * 100).toFixed(2), msPerHour: +per(v).toFixed(3) }));
  await post('Profiler.disable');
  const g2 = mk(); g2.co.advanceHours(6); await post('Profiler.enable'); await post('Profiler.startPreciseCoverage', { callCount: true, detailed: false }); g2.co.advanceHours(H); const cov = await post('Profiler.takePreciseCoverage'); await post('Profiler.stopPreciseCoverage');
  const calls = new Map(); for (const sc of cov.result) { if (!sc.url || !sc.url.startsWith('file://')) continue; const file = sc.url.replace('file://', ''); let src = null; try { src = fs.readFileSync(file, 'utf8'); } catch (_) { continue; } for (const f of sc.functions) { const r = f.ranges[0]; if (!r.count) continue; const line = src.slice(0, r.startOffset).split('\n').length; const k = (f.functionName || '(anonymous)') + ' ' + path.basename(file) + ':' + line; calls.set(k, (calls.get(k) || 0) + r.count); } }
  const out = { root: ROOT, scenario: SCEN, hours: H, timing, profile: { totalMsProfiled: profMs, samples: tot, top50Self: top(self, 50), top40Inclusive: top(incl, 40) }, callsPerHour: [...calls].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => ({ fn: k, callsPerHour: Math.round(v / H) })) };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log(SCEN, 'ms/hour', timing.map(t => t.msPerHour.toFixed(2)).join(' / '), 'buildings', timing[0].buildings); process.exit(0);
})();
