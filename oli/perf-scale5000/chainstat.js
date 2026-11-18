/* S8 study: shape of the chains behind a receiver-port probe: nested offer/accept calls per direct probe, and what the far device is. node chainstat.js <real|scene.json> [hours] */
const S = require('./gen-scene.js'), I = require('../industry.js'), C = require('../central.js'), B = require('../buildings.js'), CN = C.CentralNet, P = CN.prototype, SP = I.Sim.prototype;
Object.assign(CN, { hopShare: 1, pcSparse: 1, trDefault: 0, rcvSkip: 1, hopFreezeSkip: 1 }); I.Sim.fullTankSkip = 1;
const g = process.argv[2] === 'real' ? S.boot() : S.load(process.argv[2]); const HRS = +process.argv[3] || 12;
const sinks = (g.sinks || []).map(id => g.store.get(id)).filter(Boolean), drain = () => { for (const b of sinks) g.sim.ensure(b).vol = 0; };
for (let h = 0; h < 6; h++) { drain(); g.co.advanceHours(1); }
let odepth = 0, tsd = 0; const stack = [], T = { probe: { n: 0, nested: 0, types: {} }, commit: { n: 0, nested: 0, types: {} } };
const oo = SP.offer; SP.offer = function (b, port, f, commit, vis) { const top = stack.length ? stack[stack.length - 1] : null; const direct = top && top.od === odepth; const K = commit ? T.commit : T.probe;
  if (direct) { K.n++; const ty = B.DEFS[(this.store.get(this.edgeOf(b, port) ? (this.edgeOf(b, port).ab === b.id && this.edgeOf(b, port).ap === port ? this.edgeOf(b, port).bb : this.edgeOf(b, port).ab) : -1) || {}) ? 1 : 0] ? 0 : 0; } else if (top) K.nested++;
  odepth++; try { return oo.call(this, b, port, f, commit, vis); } finally { odepth--; } };
const ot = P.toStation; P.toStation = function (sim, ch, s, d, w, f, commit, ...r) { stack.push({ od: odepth }); const key = commit ? 'commit' : 'probe'; const ty = B.DEFS[d.b.d].type + (B.DEFS[d.b.d].type === 'central' ? '' : ''); const v = T[key].types; v[ty] = (v[ty] || 0) + 1; try { return ot.call(this, sim, ch, s, d, w, f, commit, ...r); } finally { stack.pop(); } };
for (let h = 0; h < HRS; h++) { drain(); g.co.advanceHours(1); }
const r = x => +(x / HRS).toFixed(1); for (const k of ['probe', 'commit']) { const K = T[k]; console.log(k, 'direct offers/h', r(K.n), 'nested offers/h', r(K.nested), 'nested per direct', K.n ? +(K.nested / K.n).toFixed(2) : 0, 'receiver device types (toStation calls/h):', JSON.stringify(Object.fromEntries(Object.entries(K.types).map(([a, b]) => [a, r(b)])))); }
