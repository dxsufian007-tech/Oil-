/* Oli - perf-aggregate.js  (repeated browser benchmark runs -> mean, standard deviation and range per case, as Markdown and CSV)
 *   node perf-aggregate.js out.csv  A=a-1.json,a-2.json,a-3.json  B=b-1.json,...  [C=...]
 * A case = variant x buildings x speed x action x ground cache.  Reported: fps, frame time p95, longest frame, % frames over 33 ms, simulation ms per game hour,
 * draw ms per map redraw, map redraws per second, whole game hours per second (and the wanted hours per second).
 */
const fs = require('fs'), [OUT, ...SETS] = process.argv.slice(2), rows = new Map();
const M = ['fps', 'p95', 'max', 'slow33', 'econMsPerHour', 'drawMsPerRedraw', 'redrawsPerSec', 'wholeHoursPerSec', 'econMaxMs', 'heapMB'];
for (const set of SETS) { const [v, files] = set.split('='); for (const f of files.split(',')) { const d = JSON.parse(fs.readFileSync(f)); for (const r of d) { if (r.fps == null) continue;
  const k = [v, r.N, r.speed, r.act, r.cache || 'on'].join('|'); if (!rows.has(k)) rows.set(k, { v, N: r.N, speed: r.speed, act: r.act, cache: r.cache || 'on', want: r.wantedHoursPerSec, runs: [] }); rows.get(k).runs.push(r); } } }
const stat = a => { const n = a.length, m = a.reduce((x, y) => x + y, 0) / n, sd = n > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1)) : 0; return { n, m, sd, lo: Math.min(...a), hi: Math.max(...a) }; };
const csv = ['variant,buildings,speed,action,ground_cache,runs,wanted_hours_per_s,' + M.flatMap(k => [k + '_mean', k + '_sd', k + '_min', k + '_max']).join(',')];
const md = ['| variant | speed | map | cache | runs | FPS mean ± sd (min–max) | p95 ms | longest frame ms | sim ms / game hour | draw ms / redraw | game h/s real / wanted |', '|---|---|---|---|---|---|---|---|---|---|---|'];
const f1 = (s, d = 1) => s.m.toFixed(d) + ' ± ' + s.sd.toFixed(d) + ' (' + s.lo.toFixed(d) + '–' + s.hi.toFixed(d) + ')';
for (const r of [...rows.values()].sort((a, b) => a.speed - b.speed || a.act.localeCompare(b.act) || a.v.localeCompare(b.v) || a.cache.localeCompare(b.cache))) {
  const S = {}; for (const k of M) { const a = r.runs.map(x => x[k]).filter(x => x != null && !isNaN(x)); S[k] = stat(a.length ? a : [0]); }
  csv.push([r.v, r.N, r.speed, r.act, r.cache, r.runs.length, r.want, ...M.flatMap(k => [S[k].m.toFixed(2), S[k].sd.toFixed(2), S[k].lo, S[k].hi])].join(','));
  md.push(`| ${r.v} | ×${r.speed} | ${r.act === 'pan' ? 'moving' : 'still'} | ${r.cache} | ${r.runs.length} | ${f1(S.fps)} | ${f1(S.p95, 0)} | ${f1(S.max, 0)} | ${f1(S.econMsPerHour)} | ${f1(S.drawMsPerRedraw, 2)} | ${S.wholeHoursPerSec.m.toFixed(2)} ± ${S.wholeHoursPerSec.sd.toFixed(2)} / ${r.want} |`);
}
fs.writeFileSync(OUT, csv.join('\n') + '\n'); console.log(md.join('\n'));
