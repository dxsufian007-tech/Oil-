/* ROOT=<oli dir> SCENE=real|scene HOURS=n TRACE=1 node identity-b1.js : state SHA + exact cash + (TRACE) a hash of every toStation call (src, receiver, want bits, commit, got bits) and every _apply (hop ids, acc bits) */
const path = require('path'), crypto = require('crypto'), ROOT = process.env.ROOT, HOURS = +(process.env.HOURS || 12), TRACE = !!process.env.TRACE;
if (process.env.CAPSCALE) { const CFGX = require(path.join(ROOT, 'building-config.js')); CFGX.PIPES[36].capacity *= +process.env.CAPSCALE; }      // test only: a smaller 36-inch capacity makes the real network saturate, in both the original and the new code
const SC = process.env.SCENE === 'scene' ? (process.env.SCENE_FILE || path.join(ROOT, 'docs/phaseA/tools/scene-central.js')) : path.join(__dirname, 'realload.js');
const { g, co } = require(SC).build(), CN = Object.getPrototypeOf(g.net.central), bits = x => typeof x === 'number' ? Buffer.from(new Float64Array([x]).buffer).toString('hex') : String(x);
const PHM = process.env.PH; if (PHM === 'b2') CN._planHops = CN._planHopsB2; if (PHM === 'alt') { let k = 0; CN._planHops = function () { return (++k & 1 ? CN._planHopsB2 : CN._planHopsB3a).apply(this, arguments); }; }      // PH=b2 / PH=alt (switch on every call): the diagnostics switch must not change any result
const H = crypto.createHash('sha256'); let calls = 0, applies = 0; const PC = +(process.env.PC || 0); if (PC) g.net.central.setCacheMode(PC);      // PC=1 shadow, PC=2 cache on (production code path), 0 off
if (TRACE) {
  const oT = CN.toStation, oA = CN._apply;
  CN.toStation = function (sim, ch, srcId, d, want, f, commit) { calls++; const r = oT.apply(this, arguments); H.update([ch, srcId, d.s.id, d.port, bits(want), bits(f.r), bits(f.p), commit, bits(r)].join(',') + '\n'); return r; };
  CN._apply = function (ch, pl, acc) { applies++; H.update(['A', ch, pl.hops.map(h => h.g.id + h.dir).join(), bits(pl.r), bits(pl.p), bits(acc), pl.stats.map(s => s[0].id + bits(s[1]) + bits(s[2]) + s[3]).join()].join(',') + '\n'); return oA.apply(this, arguments); };
}
const t0 = process.hrtime.bigint(); co.advanceHours(HOURS); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
const strip = o => { if (o && typeof o === 'object') { for (const k of ['lastSim', 'savedAt']) delete o[k]; for (const k in o) strip(o[k]); } return o; };
const cn = g.net.central, CH = ['CRUDE', 'WATER', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'];
const flows = JSON.stringify([[...cn.seg.values()].map(s => CH.map(c => [bits(s.f[c].flow), bits(s.f[c].net)])), [...cn.pumps.values()].map(p => [bits(p.flow), bits(p.pIn), bits(p.pOut), p.lowIn]), CH.map(c => [bits(cn.ch[c].flow), bits(cn.ch[c].pressure), bits(cn.ch[c].qty), bits(cn.ch[c].moved), cn.ch[c].status])]);
const snap = JSON.stringify(strip(JSON.parse(JSON.stringify({ eco: co.toJSON(), store: g.store.toJSON({ live: true }), net: g.net.toJSON() }))));
const stock = JSON.stringify([...g.store.list()].map(b => [b.id, b.s && b.s.vol != null ? bits(b.s.vol) : '']));
console.log(JSON.stringify({ root: ROOT.split('/').slice(-3, -1).join('/'), hours: co.hours, sha: crypto.createHash('sha256').update(snap).digest('hex').slice(0, 32), flows: crypto.createHash('sha256').update(flows).digest('hex').slice(0, 16), stock: crypto.createHash('sha256').update(stock).digest('hex').slice(0, 16), cash: bits(g.store.cash), trace: TRACE ? H.digest('hex').slice(0, 32) : null, calls, applies, pc: PC ? (({ calls, cacheable, lookupHit, miss, verified, mismatch, invalSat, clears, entries, tamper }) => ({ calls, cacheable, lookupHit, miss, verified, mismatch, invalSat, clears, entries, tamper }))(g.net.central.pcStats || {}) : null, msPerHour: +(ms / HOURS).toFixed(1) }));
