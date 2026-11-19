'use strict';
// Hybrid vs full-solve comparison. usage: node hybrid-compare.js [real|<scene.json>] [hours] [tol]
const path = require('path'), S = require('./gen-scene.js'), { Sim } = (() => { const m = require('../industry.js'); return { Sim: m.Sim || m }; })();
const target = process.argv[2] || 'real', H = +(process.argv[3] || 336), tol = +(process.argv[4] || 0.001);
function mk(h) { Sim.hybrid = h; Sim.hybridTol = tol; return target === 'real' ? S.boot() : S.load(target); }
function run(h) { const g = mk(h), sim = g.sim, out = [], t0 = process.hrtime.bigint(); const dt = 1 / 24;
  for (let i = 0; i < H; i++) { const it = sim.stepGen(dt, false); let r; do r = it.next(); while (!r.done);
    let gas = 0, oil = 0, ref = 0; for (const b of g.store.list()) { const s = b.s || {}, t = require('../buildings.js').DEFS[b.d].type; if (t === 'gas') gas += s.vol || 0; else if (t === 'tank') oil += s.vol || 0; else if (t === 'refinery') ref += s._in || 0; }
    out.push([gas, oil, ref, g.co && g.co.cash != null ? g.co.cash : 0]); }
  return { out, ms: Number(process.hrtime.bigint() - t0) / 1e6, st: sim.hybridStats && sim.hybridStats() }; }
const A = run(0), B = run(1); let mx = [0, 0, 0, 0];
for (let i = 0; i < H; i++) for (let k = 0; k < 4; k++) { const a = A.out[i][k], b = B.out[i][k]; mx[k] = Math.max(mx[k], Math.abs(a - b) / (Math.abs(a) + 1e-9)); }
console.log(JSON.stringify({ target, H, tol, msFull: A.ms | 0, msHyb: B.ms | 0, saved: +(1 - B.ms / A.ms).toFixed(3), maxRelDev: { gas: mx[0], oil: mx[1], refIn: mx[2], cash: mx[3] }, stats: B.st }));
