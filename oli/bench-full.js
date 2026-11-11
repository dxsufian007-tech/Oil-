/* Oli - bench-full.js  (performance: the whole hourly tick - economy + simulator with real pipes - against the number of buildings)
 * Builds N buildings on a flat test world in production clusters joined by real pipes (wells -> junction -> pump -> crude tank -> valve -> refinery -> product tanks),
 * then times Company.advanceHours (one game hour = one tick, exactly what the game runs per hour at every speed).
 *   node --expose-gc bench-full.js 500 1000 3000 5000      env: HOURS (default 48), SNAP=file (write a state snapshot to compare runs)
 */
const fs = require('fs'), B = require('./buildings.js'), I = require('./industry.js'), E = require('./economy.js'), EC = require('./economy-config.js');
const TERR = { FLAT_DESERT: { buildable: true, buildCost: 1, maxSlope: 99 } };
const world = (W, H) => ({ W, H, tile: () => ({ terrain: 'FLAT_DESERT', slope: 0 }), terrain: TERR, slopeK: 1, oilFieldAt: () => ({ kind: 'FIELD', id: 1 }), stateOf: () => 'DRILLABLE', zoneAt: () => ({ id: 1 }) });
const gc = () => { if (global.gc) global.gc(); }, heapMB = () => { gc(); return process.memoryUsage().heapUsed / 1048576; };
function build(N) {
  const W = 1400, H = 1000, ts = world(W, H), store = new B.BuildingStore(ts, { cash: 1e15 }), net = new I.PipeNet(W), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 });
  const put = (d, x, y) => { const v = store.place(d, x, y, 0, { instant: true }); return v.ok ? v.building : null; }, FAIL = {}, pipe = (a, ap, b, bp, dia) => { const r = a && b ? I.layPipe(store, net, ts, { b: a.id, port: ap }, { b: b.id, port: bp }, dia || 16) : { ok: false, reason: 'noBuilding' }; if (!r.ok) { const k = ap + '>' + bp + ':' + r.reason; FAIL[k] = (FAIL[k] || 0) + 1; } return r; }, conn = (a, b) => { const r = a && b ? I.layConnect(store, net, ts, a.id, b.id, { allowOneWay: true }) : { ok: false, reason: 'noBuilding' }; if (!r.ok) { const k = (a ? a.d : '?') + '>' + (b ? b.d : '?') + ':' + r.reason; FAIL[k] = (FAIL[k] || 0) + 1; } return r; };
  let n = 0, k = 0; const CW = 46, CH = 30, cols = Math.floor((W - 10) / CW);
  while (n < N) { const ox = 5 + (k % cols) * CW, oy = 5 + Math.floor(k / cols) * CH; k++; if (oy + CH > H) break;
    const w = [put('oil_well', ox, oy + 2), put('oil_well', ox, oy + 6), put('oil_well', ox, oy + 10), put('oil_well', ox, oy + 14), put('oil_well', ox, oy + 18)];
    const j = put('junction', ox + 6, oy + 6), p = put('pump_station_s', ox + 10, oy + 6), t = put('crude_tank_m', ox + 16, oy + 6), v = put('valve', ox + 23, oy + 7);
    pipe(w[0], 'OIL_OUT_E', j, 'PORT_N'); pipe(w[1], 'OIL_OUT_E', j, 'PORT_W'); pipe(w[2], 'OIL_OUT_E', j, 'PORT_S'); pipe(j, 'PORT_E', p, 'INPUT'); pipe(p, 'OUTPUT', t, 'INPUT_W'); pipe(w[3], 'OIL_OUT_E', t, 'INPUT_S'); pipe(w[4], 'OIL_OUT_E', t, 'INPUT_N');
    conn(t, v); n += 9;
    if (k % 3 === 0) { const r = put('refinery_s', ox + 27, oy + 4), tg = put('gasoline_tank_s', ox + 37, oy + 1), td = put('diesel_tank_s', ox + 37, oy + 6), tj = put('jet_tank_s', ox + 37, oy + 11), tl = put('gas_sphere_s', ox + 29, oy + 14);
      conn(v, r); conn(r, tg); conn(r, td); conn(r, tj); conn(r, tl); n += 5; }
    else { const t2 = put('crude_tank_m', ox + 27, oy + 6); conn(v, t2); n += 1; } }
  for (const b of store.list()) { sim.ensure(b); if (DEFS[b.d].type === 'well') b.s.started = true; }
  for (const p of EC.PRODUCTS) co.setMode(p, 'WAIT'); co.sync();
  if (Object.keys(FAIL).length) console.log('pipe failures', JSON.stringify(FAIL));
  return { store, net, sim, co };
}
const DEFS = B.DEFS, sizes = process.argv.slice(2).map(Number).filter(Boolean), rows = [];
module.exports = { build };
if (require.main === module) for (const N of sizes.length ? sizes : [500, 1000, 3000, 5000]) {
  const h0 = heapMB(), t0 = process.hrtime.bigint(), g = build(N), buildMs = Number(process.hrtime.bigint() - t0) / 1e6, nb = g.store.items.size, nl = g.net.lines.size;
  g.co.advanceHours(6);                                                    // warm up (JIT, first graph build)
  const hours = +(process.env.HOURS || 48), per = []; for (let i = 0; i < hours; i++) { const a = process.hrtime.bigint(); g.co.advanceHours(1); per.push(Number(process.hrtime.bigint() - a) / 1e6); }
  per.sort((a, b) => a - b); const avg = per.reduce((a, b) => a + b, 0) / per.length, p95 = per[Math.floor(per.length * .95)], mx = per[per.length - 1];
  const s = process.hrtime.bigint(); for (let i = 0; i < 50; i++) g.sim.status(g.store.get(1)); 
  const t3 = process.hrtime.bigint(), json = JSON.stringify({ s: g.store.toJSON(), n: g.net.toJSON(), e: g.co.toJSON() }), saveMs = Number(process.hrtime.bigint() - t3) / 1e6;
  const mem = heapMB() - h0, refs = g.store.list().filter(b => DEFS[b.d].type === 'refinery');
  const row = { N: nb, pipes: nl, buildS: +(buildMs / 1000).toFixed(1), tickMs: +avg.toFixed(2), p95: +p95.toFixed(2), max: +mx.toFixed(2), x1: +(avg * 2 / 10).toFixed(1), x10: +(avg * 20 / 10).toFixed(1), saveMs: +saveMs.toFixed(0), saveKB: Math.round(json.length / 1024), heapMB: +mem.toFixed(0), thru: Math.round(g.co.led.life.produced.THRU), crude: Math.round(g.co.led.life.produced.CRUDE) };
  rows.push(row); console.log(JSON.stringify(row));
  if (process.env.SNAP) { const r6 = v => Math.round(v * 1e6) / 1e6, j = g.co.journal.bal; fs.writeFileSync(process.env.SNAP + '.' + N + '.json', JSON.stringify({ cash: r6(g.store.cash), journal: Object.fromEntries(Object.keys(j).map(k => [k, r6(j[k])])), qty: g.co.qty, mats: g.co.mats, b: [...g.store.items.values()].map(b => [b.id, b.s && Object.fromEntries(Object.entries(b.s).filter(([k, v]) => k[0] !== '_' && typeof v === 'number').map(([k, v]) => [k, r6(v)]))]), lines: [...g.net.lines.values()].map(L => [L.id, r6(L.flow || 0)]) })); }
}
if (require.main === module) console.log('\nbuildings | pipes | tick ms per game hour (avg / p95 / max) | main-thread % at x1 | at x10 | save ms | save KB | heap MB');
if (require.main === module) for (const r of rows) console.log([r.N, r.pipes, r.tickMs + ' / ' + r.p95 + ' / ' + r.max, r.x1 + '%', r.x10 + '%', r.saveMs, r.saveKB, r.heapMB].join(' | '));
