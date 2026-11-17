/* S1 measurement in Node (real engine, scene from gen-scene):  node --expose-gc measure.js <scene.json> [hours=24] [--prof] [--nodrain]
   Reports: hour time (mean/median/p95/max), GC time and count during the window (perf_hooks), heap/rss, save cost (JSON.stringify of toJSON) and size, load time, connectivity proof,
   X1/X2/X5 headroom (X1 = 1 game hour/s, X2 = 2, X5 = 5 -> budget 1000/500/200 ms per hour, frame share 0.78 as in the game), and (--prof) the CPU profile by file and function. */
'use strict';
const S = require('./gen-scene.js'), { PerformanceObserver } = require('perf_hooks'), inspector = require('inspector'), fs = require('fs'), B = require(require('path').resolve(__dirname, '..') + '/buildings.js');
{ const ov = JSON.parse(process.env.CN || '{}'), CC = require(require('path').resolve(__dirname, '..') + '/central.js'); for (const k in ov) CC.CentralNet[k] = ov[k]; }
const file = process.argv[2], HRS = +process.argv[3] || 24, PROF = process.argv.includes('--prof'), DRAIN = !process.argv.includes('--nodrain');
const gc = () => { if (global.gc) global.gc(); }, mb = () => process.memoryUsage();
const t0 = process.hrtime.bigint(); const g = S.load(file); const loadMs = Number(process.hrtime.bigint() - t0) / 1e6; gc(); const heap0 = mb().heapUsed / 1048576;
const sinks = (g.sinks || []).map(id => g.store.get(id)).filter(Boolean); const drain = () => { if (DRAIN) for (const b of sinks) { const s = g.sim.ensure(b); s.vol = 0; } };
const conn = S.connectivity(g); const N = g.store.list().length;
for (let h = 0; h < 6; h++) { drain(); g.co.advanceHours(1); }            // warm-up
let gcMs = 0, gcN = 0; const obs = new PerformanceObserver(l => { for (const e of l.getEntries()) { gcMs += e.duration; gcN++; } }); obs.observe({ entryTypes: ['gc'] });
let sess = null; if (PROF) { sess = new inspector.Session(); sess.connect(); sess.post('Profiler.enable'); sess.post('Profiler.setSamplingInterval', { interval: 500 }); sess.post('Profiler.start'); }
const winStart = process.uptime() * 1000; const ts = []; for (let h = 0; h < HRS; h++) { drain(); const a = process.hrtime.bigint(); g.co.advanceHours(1); ts.push(Number(process.hrtime.bigint() - a) / 1e6); }
let prof = null; if (PROF) sess.post('Profiler.stop', (e, r) => { prof = r.profile; });
for (const e of obs.takeRecords()) { gcMs += e.duration; gcN++; }
const winEnd = process.uptime() * 1000; const sorted = ts.slice().sort((a, b) => a - b), mean = ts.reduce((a, b) => a + b, 0) / ts.length, med = sorted[sorted.length >> 1], p95 = sorted[Math.floor(sorted.length * .95)], max = sorted[sorted.length - 1];
gc(); const heap1 = mb().heapUsed / 1048576, rss = mb().rss / 1048576;
const t1 = process.hrtime.bigint(); const txt = JSON.stringify({ store: g.store.toJSON(), net: g.net.toJSON(), eco: g.co.toJSON() }); const saveMs = Number(process.hrtime.bigint() - t1) / 1e6;
const fl = S.flows(g); const cn = g.cn; const cs = { pcMode: cn.pcMode, dmMode: cn._dmMode, pc: cn.pcStats ? { calls: cn.pcStats.calls, cacheable: cn.pcStats.cacheable, hit: cn.pcStats.lookupHit, miss: cn.pcStats.miss, clears: cn.pcStats.clears } : null, dm: cn.dmStats, pl: cn.plStats }; const out = { winStartMs: Math.round(winStart), winEndMs: Math.round(winEnd), scene: file.split('/').pop(), buildings: N, lines: g.net.lines.size, stations: cn.st.size, hoursMeasured: HRS, loadMs: +loadMs.toFixed(0), hourMs: { mean: +mean.toFixed(1), median: +med.toFixed(1), p95: +p95.toFixed(1), max: +max.toFixed(1) },
  gc: { ms: +gcMs.toFixed(1), count: gcN, pctOfWindow: +(100 * gcMs / ts.reduce((a, b) => a + b, 0)).toFixed(1) }, memMB: { heapAfterLoad: +heap0.toFixed(1), heapAfter: +heap1.toFixed(1), rss: +rss.toFixed(0), heapPerBuildingKB: +((heap1 - 0) * 1024 / N).toFixed(1) },
  cache: cs, save: { stringifyMs: +saveMs.toFixed(0), KB: Math.round(txt.length / 1024) }, connectivity: { connPct: conn.connPct, connectedBuildings: conn.connected, orphanStations: conn.byType.central_station ? conn.byType.central_station.n - conn.byType.central_station.conn : 0, byTypeSample: Object.fromEntries(Object.entries(conn.byType).map(([k, v]) => [k, v.conn + '/' + v.n])) }, flows: fl,
  speeds: { X1_budgetMs: 1000, X2_budgetMs: 500, X5_budgetMs: 200, maxHoursPerSec: +(1000 / mean).toFixed(2), fitsX1: mean * 1 < 1000 * 0.78, fitsX2: mean * 2 < 1000 * 0.78, fitsX5: mean * 5 < 1000 * 0.78 } };
if (prof) { const self = {}, byFile = {}; const idx = new Map(prof.nodes.map(n => [n.id, n])); let tot = 0; prof.samples.forEach((id, i) => { const cf = idx.get(id).callFrame, k = (cf.functionName || '(anon)') + ' ' + cf.url.split('/').pop() + ':' + cf.lineNumber, f = cf.url.split('/').pop() || '(native)'; const d = prof.timeDeltas[i]; self[k] = (self[k] || 0) + d; byFile[f] = (byFile[f] || 0) + d; tot += d; });
  let gcT = 0; prof.nodes.forEach(n => { if (n.callFrame.functionName === '(garbage collector)') { /* handled below by samples */ } }); prof.samples.forEach((id, i) => { if (idx.get(id).callFrame.functionName === '(garbage collector)') gcT += prof.timeDeltas[i]; });
  out.profile = { gcPctOfProfile: +(100 * gcT / tot).toFixed(1), totalMs: +(tot / 1000).toFixed(0), byFile: Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ' ' + (100 * v / tot).toFixed(1) + '%'), top: Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => (100 * v / tot).toFixed(1) + '% ' + k) }; }
console.log(JSON.stringify(out, null, 1));
