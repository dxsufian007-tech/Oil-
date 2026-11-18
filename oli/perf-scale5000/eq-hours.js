/* hour-by-hour equality of two engine switch settings.  node eq-hours.js <real|scene.json> <hours> <a:JSON of CentralNet overrides> <b:JSON>
   Each hour: sha1 of JSON.stringify({store,net,eco}) (everything the save holds: every pressure, flow, stock, journal value) - the two runs must give the same hash every hour. */
const path = require('path'), crypto = require('crypto'), S = require('./gen-scene.js'), C = require(path.resolve(__dirname, '..') + '/central.js');
const [what, H, A, Bj] = [process.argv[2], +process.argv[3] || 24, JSON.parse(process.argv[4] || '{}'), JSON.parse(process.argv[5] || '{}')];
const run = ov => { const keep = {}; for (const k in ov) { keep[k] = C.CentralNet[k]; C.CentralNet[k] = ov[k]; }
  const g = what === 'real' ? S.boot() : S.load(what); const sinks = (g.sinks || []).map(id => g.store.get(id)).filter(Boolean); const hs = []; const t0 = Date.now();
  for (let h = 0; h < H; h++) { for (const b of sinks) g.sim.ensure(b).vol = 0; g.co.advanceHours(1); hs.push(crypto.createHash('sha1').update(JSON.stringify({ s: g.store.toJSON(), n: g.net.toJSON(), e: g.co.toJSON() })).digest('hex').slice(0, 12)); }
  for (const k in keep) C.CentralNet[k] = keep[k]; return { hs, sec: (Date.now() - t0) / 1000, tr: g.cn.trStats, df: g.cn.dfStats, stats: g.cn.pcStats && { calls: g.cn.pcStats.calls, hit: g.cn.pcStats.lookupHit, mismatch: g.cn.pcStats.mismatch } }; };
const a = run(A), b = run(Bj); let diff = 0, first = -1; for (let h = 0; h < H; h++) if (a.hs[h] !== b.hs[h]) { diff++; if (first < 0) first = h; }
console.log(JSON.stringify({ what: path.basename(what), hours: H, A, B: Bj, hoursDifferent: diff, firstDiff: first, secA: a.sec, secB: b.sec, trB: b.tr, trA: a.tr, dfB: b.df, lastHashA: a.hs[H - 1], lastHashB: b.hs[H - 1] }));
