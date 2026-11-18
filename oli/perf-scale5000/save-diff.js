/* S6: what exactly differs in the saved file between two engine settings.  node save-diff.js <real|scene.json> <hours> <A json> <B json> [Sim.fullTankSkip A] [B]
   A / B are CentralNet overrides; the Sim switch is given with keys "Sim.fullTankSkip".  Compares store (building by building, field by field), net and economy JSON. */
const path = require('path'), S = require('./gen-scene.js'), C = require(path.resolve(__dirname, '..') + '/central.js'), I = require(path.resolve(__dirname, '..') + '/industry.js'), B = require(path.resolve(__dirname, '..') + '/buildings.js');
const [what, H, A, Bj] = [process.argv[2], +process.argv[3] || 12, JSON.parse(process.argv[4] || '{}'), JSON.parse(process.argv[5] || '{}')];
const run = ov => { const keep = {}, ks = I.Sim.fullTankSkip; for (const k in ov) { if (k === 'Sim.fullTankSkip') I.Sim.fullTankSkip = ov[k]; else { keep[k] = C.CentralNet[k]; C.CentralNet[k] = ov[k]; } }
  const g = what === 'real' ? S.boot() : S.load(what); const sinks = (g.sinks || []).map(id => g.store.get(id)).filter(Boolean); const t0 = Date.now();
  for (let h = 0; h < H; h++) { for (const b of sinks) g.sim.ensure(b).vol = 0; g.co.advanceHours(1); }
  const out = JSON.parse(JSON.stringify({ s: g.store.toJSON(), n: g.net.toJSON(), e: g.co.toJSON() })); out.sec = (Date.now() - t0) / 1000;
  for (const k in keep) C.CentralNet[k] = keep[k]; I.Sim.fullTankSkip = ks; return out; };
const a = run(A), b = run(Bj), DEFS = B.DEFS || B.BUILDINGS || {}; const diffs = {}; let nb = 0, same = 0;
const defType = d => (DEFS[d] && DEFS[d].type) || '?';
for (let i = 0; i < a.s.b.length; i++) { const x = a.s.b[i], y = b.s.b[i]; nb++; const sa = JSON.stringify(x), sb = JSON.stringify(y); if (sa === sb) { same++; continue; }
  for (let k = 0; k < x.length; k++) { if (JSON.stringify(x[k]) === JSON.stringify(y[k])) continue;
    if (k === 10 && x[k] && typeof x[k] === 'object') { for (const f of new Set([...Object.keys(x[k]), ...Object.keys(y[k] || {})])) if (JSON.stringify(x[k][f]) !== JSON.stringify((y[k] || {})[f])) { const key = defType(x[1]) + '.state.' + f + (f in x[k] ? (f in (y[k] || {}) ? ' (value)' : ' (absent in B)') : ' (absent in A)'); diffs[key] = (diffs[key] || 0) + 1; } }
    else { const key = defType(x[1]) + '.col' + k; diffs[key] = (diffs[key] || 0) + 1; } } }
const rest = { storeOther: JSON.stringify({ ...a.s, b: 0 }) === JSON.stringify({ ...b.s, b: 0 }), net: JSON.stringify(a.n) === JSON.stringify(b.n), economy: JSON.stringify(a.e) === JSON.stringify(b.e), buildings: a.s.b.length === b.s.b.length };
console.log(JSON.stringify({ what: path.basename(what), hours: H, buildings: nb, identicalBuildings: same, differingFields: diffs, restIdentical: rest, secA: a.sec, secB: b.sec }, null, 1));
