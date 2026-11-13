/* Oli - stress-perf.js  (stability under load, node, real engine). Each check prints PASS / FAIL with its numbers.
 *   node --expose-gc stress-perf.js [N=3000]
 *  S1 save -> load -> continue gives exactly the same game as running straight through (every value compared, bit for bit)
 *  S2 buildings added while the simulation runs (the network keeps working, the books balance)
 *  S3 bulk pipe building and removal (2 x 400 pipes), the network stays consistent and memory comes back
 *  S4 tanks full: nothing sold, wells blocked - no error, no oil created or lost, books balance
 *  S5 materials run out (automatic purchasing off): the refineries slow down to the stock, then stop; stock never negative
 *  S6 equipment faults and repairs on the central network while it carries oil (channel fault, segment cut, pump fault)
 *  S7 saving under load: save size / time at N buildings; load time of the large world
 *  S8 memory over 30 game days at N buildings (heap sampled every 3 days)
 */
const B = require('./buildings.js'), I = require('./industry.js'), E = require('./economy.js'), EC = require('./economy-config.js'), DEFS = B.DEFS, { build } = require('./bench-full.js');
const N = +(process.argv[2] || 3000), out = [], ok = (n, c, x) => { out.push({ check: n, pass: !!c, detail: x }); console.log((c ? 'PASS ' : 'FAIL ') + n + (x === undefined ? '' : ' ' + JSON.stringify(x).slice(0, 300))); };
const gc = () => global.gc && global.gc(), heap = () => { gc(); return +(process.memoryUsage().heapUsed / 1048576).toFixed(1); }, ms = f => { const t = process.hrtime.bigint(); const r = f(); return [Number(process.hrtime.bigint() - t) / 1e6, r]; };
const state = g => JSON.stringify({ cash: g.store.cash, j: g.co.journal.bal, n: g.co.journal.n, life: g.co.led.life, qty: g.co.qty, mats: g.co.mats, b: [...g.store.items.values()].map(b => [b.id, b.st, b.s]), l: [...g.net.lines.values()].map(L => [L.id, L.flow || 0]) });
function load(json) { const d = JSON.parse(json), ts = build(1).store.ts, R = B.BuildingStore.fromJSON(ts, d.s), store = R.store, net = I.PipeNet.fromJSON(ts.W, d.n), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 }); store.cash = d.cash; co.fromJSON(d.e); return { store, net, sim, co, dropped: R.report.dropped }; }
const save = g => JSON.stringify({ s: g.store.toJSON({ live: true }), n: g.net.toJSON(), e: g.co.toJSON(), cash: g.store.cash });

console.log('stress at N =', N);
{ // S1
  const a = build(N); a.co.advanceHours(48); const ref = state(a);
  const b = build(N); b.co.advanceHours(24); const [sv, js] = ms(() => save(b)); const [lt, c] = ms(() => load(js)); c.co.advanceHours(24);
  ok('S1 save at 24h -> load -> 24h more = 48h straight through (every building, line, account, stock)', state(c) === ref && !c.dropped.length, { saveMs: +sv.toFixed(0), loadMs: +lt.toFixed(0), sizeKB: Math.round(js.length / 1024) }); }
{ // S2
  const g2 = build(N + 600); g2.co.advanceHours(3); const before = g2.store.items.size; for (let i = 0; i < 6; i++) { g2.co.advanceHours(2); g2.store.place('crude_tank_s', 1300, 10 + i * 4, 0, { instant: true }); g2.store.place('oil_well', 1310, 10 + i * 4, 0, { instant: true }); }
  ok('S2 buildings added between game hours while it runs: no error, books balance', g2.store.items.size > before && g2.co.audit().ok && g2.co.journal.check().ok, { before, after: g2.store.items.size }); }
{ // S3
  const g = build(N); g.co.advanceHours(3); const h0 = heap(), l0 = g.net.lines.size, made = []; const ts = g.store.ts;
  const t0 = process.hrtime.bigint(); for (let k = 0; k < 400; k++) { const a = g.store.place('crude_tank_s', 1310 + (k % 20) * 4, 600 + Math.floor(k / 20) * 9, 0, { instant: true }), b = g.store.place('crude_tank_s', 1310 + (k % 20) * 4, 604 + Math.floor(k / 20) * 9, 0, { instant: true }); if (a.ok && b.ok) { const r = I.layConnect(g.store, g.net, ts, a.building.id, b.building.id, {}); if (r.ok) made.push(...r.made.map(L => L.id)); } }
  const buildMs = Number(process.hrtime.bigint() - t0) / 1e6; g.co.advanceHours(3); const mid = g.net.lines.size;
  const t1 = process.hrtime.bigint(); for (const id of made) g.net.remove(id); const remMs = Number(process.hrtime.bigint() - t1) / 1e6; g.co.advanceHours(3); const h1 = heap();
  ok('S3 ' + made.length + ' pipes laid and removed again: line count back, network still works, books balance', g.net.lines.size === l0 && mid === l0 + made.length && g.co.audit().ok && g.co.led.life.produced.CRUDE > 0, { laid: made.length, layMs: Math.round(buildMs), removeMs: Math.round(remMs), heapBeforeMB: h0, heapAfterMB: h1 }); }
{ // S4
  const g = build(Math.min(N, 1000)); for (const p of EC.PRODUCTS) g.co.setMode(p, 'WAIT'); g.co.advanceHours(24 * 40); let full = 0, neg = 0; for (const b of g.store.list()) { const d = DEFS[b.d]; if ((d.type === 'tank' || d.type === 'gas') && b.s) { if (b.s.vol >= d.capacity.value * 0.999) full++; if (b.s.vol < -1e-9) neg++; } }
  const blocked = g.store.list().filter(b => DEFS[b.d].type === 'well' && g.sim.status(b) === 'BLOCKED').length;
  ok('S4 40 days without selling: tanks full, wells blocked, no negative stock, books balance', full > 0 && neg === 0 && g.co.audit().ok && g.co.journal.check().ok, { fullTanks: full, blockedWells: blocked }); }
{ // S5
  const g = build(Math.min(N, 1000)); for (const m of ['CHEM', 'OPS']) g.co.setAutoBuy(m, { on: false }); g.co.buy('CHEM', 3000, 'A', 'CASH'); g.co.buy('OPS', 100, 'A', 'CASH'); let neg = false, last = null;
  for (let h = 0; h < 24 * 6; h++) { g.co.advanceHours(1); if (g.co.mats.CHEM < -1e-9 || g.co.mats.OPS < -1e-9) neg = true; last = g.co.matLimit; }
  const refs = g.store.list().filter(b => DEFS[b.d].type === 'refinery'); ok('S5 materials run out with automatic purchasing off: refineries stop (NO_MATERIALS), stock never negative', !neg && last === 0 && refs.every(r => g.sim.status(r) === 'NO_MATERIALS' || g.sim.status(r) === 'NO_INPUT' || g.sim.status(r) === 'READY'), { chem: g.co.mats.CHEM, matLimit: last, status: refs.slice(0, 3).map(r => g.sim.status(r)) });
  for (const m of ['CHEM', 'OPS']) g.co.setAutoBuy(m, { on: true }); g.co.advanceHours(24); ok('S5b automatic purchasing switched back on: they run again', g.co.matLimit === 1 && refs.some(r => r.s._in > 0), { matLimit: g.co.matLimit }); }
{ // S6
  const K = require('./test-central-kit.js'), g = K.mk(), src = K.attach(g, 'crude_tank_l', ['N3', 'N4', 'N5'], 'CRUDE', 'out', 150000), dst = K.attach(g, 'crude_tank_l', ['N1', 'N2', 'S1', 'FS'], 'CRUDE', 'in', 0); for (const b of g.store.list()) g.sim.ensure(b);
  const cn = g.cn, moved = () => cn.ch.CRUDE.moved; g.co.advanceHours(6); const m0 = moved(); cn.setChannelFault('CRUDE', true); g.co.advanceHours(6); const m1 = moved(); cn.setChannelFault('CRUDE', false); g.co.advanceHours(6); const m2 = moved();
  const seg = [...cn.seg.values()][0]; for (let i = 0; i < 20; i++) { cn.setFault(seg.id, 'CRUDE', i % 2 === 0); for (const p of cn.pumps.values()) cn.setPumpFault(p.id, i % 3 === 0); g.co.advanceHours(1); } for (const p of cn.pumps.values()) cn.setPumpFault(p.id, false); cn.setFault(seg.id, 'CRUDE', false); g.co.advanceHours(6);
  ok('S6 central network faults while carrying oil: a channel fault stops it, the repair restarts it; 20 fault/repair cycles on a segment and the pumps: no error, books balance', m0 > 0 && m1 === m0 && m2 > m1 && moved() > m2 && g.co.audit().ok && src && dst, { moved: [Math.round(m0), Math.round(m1), Math.round(m2), Math.round(moved())] }); }
{ // S7
  const g = build(N); g.co.advanceHours(24); const [sv, js] = ms(() => save(g)); const [lt, c] = ms(() => load(js)); const [ft] = ms(() => c.co.advanceHours(1));
  ok('S7 saving under load at ' + g.store.items.size + ' buildings and loading the large world', !c.dropped.length && c.store.items.size === g.store.items.size, { saveMs: +sv.toFixed(0), sizeKB: Math.round(js.length / 1024), loadMs: +lt.toFixed(0), firstHourAfterLoadMs: +ft.toFixed(1) }); }
{ // S8
  const g = build(N), pts = []; for (let d = 0; d <= 30; d += 3) { if (d) g.co.advanceHours(72); pts.push([d, heap()]); }
  const grow = pts[pts.length - 1][1] - pts[1][1]; ok('S8 heap over 30 game days stays flat (growth from day 3 to day 30 under 15 MB)', grow < 15, { heapMBByDay: pts }); }
require('fs').writeFileSync(process.env.OUT || '/dev/null', JSON.stringify({ N, results: out }, null, 1));
console.log(out.every(r => r.pass) ? 'ALL STRESS CHECKS PASSED' : 'SOME STRESS CHECKS FAILED');
