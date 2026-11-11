/* Oli - econ-compare.js  (proof that a performance change did not change the game: the same scenario on two code trees, every number compared exactly)
 *   node econ-compare.js <codeRoot> <scenario> <hours> <out.json>
 *   scenario: flat:N  - N buildings in production clusters (wells, junctions, pumps, tanks, valves, refineries, product tanks) on a flat test world, products sold on the
 *                       spot market (automatic selling) and materials bought automatically - the economy runs as in the game
 *             central - the real world with the central network installed: a large refinery wired to tapped stations, crude from a far station, product tanks on others
 * The snapshot holds, as exact doubles (no rounding): cash, every journal account balance and the entry count, the lifetime ledger (produced, sold, P&L, cash flow), stocks
 * (oil, products, by-products, materials, bought oil), market prices, purchases, every building's numeric state, every pipeline flow and pressure, and for the central
 * network every channel / segment / pump figure. Compare two snapshots with:  node econ-compare.js --diff a.json b.json
 */
const fs = require('fs'), path = require('path');
if (process.argv[2] === '--diff') {
  const a = JSON.parse(fs.readFileSync(process.argv[3])), b = JSON.parse(fs.readFileSync(process.argv[4])), out = []; let n = 0;
  const walk = (x, y, k) => { if (typeof x === 'object' && x && typeof y === 'object' && y) { for (const q of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[q], y[q], k + '.' + q); return; } n++; if (!Object.is(x, y)) out.push(k + ': ' + JSON.stringify(x) + ' != ' + JSON.stringify(y)); };
  walk(a, b, ''); console.log(out.length ? 'DIFFERENT: ' + out.length + ' of ' + n + ' values\n' + out.slice(0, 30).join('\n') : 'IDENTICAL: all ' + n + ' values are the same, bit for bit'); process.exit(out.length ? 1 : 0);
}
const [ROOT, SCEN, HOURS, OUT] = process.argv.slice(2), R = f => require(path.resolve(ROOT, f));
const B = R('buildings.js'), I = R('industry.js'), E = R('economy.js'), EC = R('economy-config.js'), DEFS = B.DEFS;
function flat(N) {
  const TERR = { FLAT_DESERT: { buildable: true, buildCost: 1, maxSlope: 99 } }, W = 1400, H = 1000, ts = { W, H, tile: () => ({ terrain: 'FLAT_DESERT', slope: 0 }), terrain: TERR, slopeK: 1, oilFieldAt: () => ({ kind: 'FIELD', id: 1 }), stateOf: () => 'DRILLABLE', zoneAt: () => ({ id: 1 }) };
  const store = new B.BuildingStore(ts, { cash: 1e11 }), net = new I.PipeNet(W), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 });
  const put = (d, x, y) => { const v = store.place(d, x, y, 0, { instant: true }); return v.ok ? v.building : null; }, pipe = (a, ap, b, bp) => a && b ? I.layPipe(store, net, ts, { b: a.id, port: ap }, { b: b.id, port: bp }, 16) : null, conn = (a, b) => a && b ? I.layConnect(store, net, ts, a.id, b.id, { allowOneWay: true }) : null;
  let k = 0; const CW = 46, CH = 30, cols = 28;
  while (store.items.size < N) { const ox = 5 + (k % cols) * CW, oy = 5 + Math.floor(k / cols) * CH; k++; if (oy + CH > H) break;
    const w = [0, 4, 8, 12, 16].map(d => put('oil_well', ox, oy + 2 + d)), j = put('junction', ox + 6, oy + 6), p = put('pump_station_s', ox + 10, oy + 6), t = put('crude_tank_m', ox + 16, oy + 6), v = put('valve', ox + 23, oy + 7);
    pipe(w[0], 'OIL_OUT_E', j, 'PORT_N'); pipe(w[1], 'OIL_OUT_E', j, 'PORT_W'); pipe(w[2], 'OIL_OUT_E', j, 'PORT_S'); pipe(j, 'PORT_E', p, 'INPUT'); pipe(p, 'OUTPUT', t, 'INPUT_W'); pipe(w[3], 'OIL_OUT_E', t, 'INPUT_S'); pipe(w[4], 'OIL_OUT_E', t, 'INPUT_N'); conn(t, v);
    if (k % 3 === 0) { const r = put('refinery_s', ox + 27, oy + 4); conn(v, r); conn(r, put('gasoline_tank_s', ox + 37, oy + 1)); conn(r, put('diesel_tank_s', ox + 37, oy + 6)); conn(r, put('jet_tank_s', ox + 37, oy + 11)); conn(r, put('gas_sphere_s', ox + 29, oy + 14)); }
    else conn(v, put('crude_tank_m', ox + 27, oy + 6)); }
  for (const b of store.list()) { sim.ensure(b); if (DEFS[b.d].type === 'well') b.s.started = true; } co.sync();
  return { store, net, sim, co };
}
function central() {
  const K = R('test-central-kit.js'), C = K.C, g = K.mk(); let ref = null;
  for (let y = 420; y < 520 && !ref; y += 2) for (let x = 150; x < 230 && !ref; x += 2) if (K.secOf(x, y) === 'D1' && g.store.validate('refinery_l', x, y, 0, { ignoreCash: true }).ok) ref = g.store.place('refinery_l', x, y, 0, { instant: true, ignoreCash: true }).building;
  const cx = ref.x + 5, cy = ref.y + 4, tiles = []; for (const s of g.cn.seg.values()) for (const [x, y] of s.path) tiles.push([Math.hypot(x - cx, y - cy), x, y]); tiles.sort((a, b) => a[0] - b[0]);
  const st = []; for (const [, x, y] of tiles) { if (st.length >= 2) break; if (st.some(m => Math.hypot(m.x - x, m.y - y) < 8)) continue; const pl = C.planTap(g.store, g.net, x, y, {}); if (!pl.ok) continue; const r = C.commitTap(g.store, g.net, pl, { instant: true }); if (r.ok) st.push({ x, y, b: r.building.id }); }
  const CH = { GASOLINE_OUT: 'GASOLINE', DIESEL_OUT: 'DIESEL', JET_OUT: 'JET_FUEL', GAS_OUT: 'GAS' }, taken = (b, port) => [...g.net.lines.values()].some(L => [L.a, L.b].some(e => e && e.b === b && e.port === port));
  for (const [t, ow] of [[st[0].b, false], [st[0].b, false], [st[1].b, true], [st[1].b, true], [st[1].b, true]]) I.layConnect(g.store, g.net, g.ts, ref.id, t, { ignoreCash: true, allowOneWay: ow });
  for (const [op, ch] of Object.entries(CH)) { if (taken(ref.id, op)) continue; let ok = false; for (const t of [st[0].b, st[1].b]) for (const sp of C.PORTS[ch]) { if (ok || taken(t, sp)) continue; for (const d of [36, 16, 8]) if (!ok && I.layPipe(g.store, g.net, g.ts, { b: ref.id, port: op }, { b: t, port: sp }, d, { ignoreCash: true }).ok) ok = true; } }
  K.attach(g, 'crude_tank_l', ['N3', 'N4', 'N5', 'S1', 'FS'], 'CRUDE', 'out', 150000); K.attach(g, 'crude_tank_l', ['JN', 'JM', 'JS'], 'CRUDE', 'out', 120000);
  for (const [ch, d] of [['GASOLINE', 'gasoline_tank_l'], ['DIESEL', 'diesel_tank_l'], ['JET_FUEL', 'jet_tank_l'], ['GAS', 'gas_sphere_l']]) K.attach(g, d, ['N1', 'N2', 'N3', 'N4', 'S1', 'FS', 'F1', 'F2'], ch, 'in');
  for (const b of g.store.list()) g.sim.ensure(b); g.store.cash = 3e9; g.co.sync(); return { store: g.store, net: g.net, sim: g.sim, co: g.co };
}
const g = SCEN === 'central' ? central() : flat(+SCEN.split(':')[1] || 1000), co = g.co;
const SELLP = ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'], sales = [];     // the same player actions in both runs: at the end of every game day, half of what is available of each product is sold on the spot market
for (let left = +HOURS; left > 0; ) { const h = Math.min(24, left); co.advanceHours(h); left -= h; if (h === 24) for (const p of SELLP) { const q = Math.floor(co.available(p) * 0.5); if (q > 0) { const r = co.sell(p, q); sales.push([co.hours, p, q, r.ok ? r.net : 0]); } } }
const num = o => { const r = {}; for (const k in o) { const v = o[k]; if (typeof v === 'number' || typeof v === 'boolean') r[k] = v; else if (v && typeof v === 'object' && !Array.isArray(v)) { const n = num(v); if (Object.keys(n).length) r[k] = n; } } return r; };
const snap = { scenario: SCEN, hours: co.hours, nBuildings: g.store.items.size, lines: g.net.lines.size, cash: g.store.cash, journal: Object.assign({ entries: co.journal.n }, co.journal.bal), life: num(co.led.life), month: num(co.led.month),
  stocks: { qty: co.qty, qty2: co.qty2, mats: co.mats, bq: co.bq }, prices: num(co.market.price), sales, purchases: co.purchases.map(p => [p.item, p.qty, p.total, p.terms, !!p.auto]), events: co.events.length,
  water: num(co.water), staff: num(co.staff), power: num(co.pw), autoBuyLog: (co.autoBuy && co.autoBuy.log || []).map(e => [e.t, e.item, e.ok, e.qty || 0, e.total || 0]),
  buildings: [...g.store.items.values()].map(b => [b.id, b.d, b.st, b.s ? num(b.s) : null]), pipes: [...g.net.lines.values()].map(L => [L.id, L.flow || 0, L.pressure || 0, L.open !== false]) };
if (g.net.central) { const cn = g.net.central; snap.central = { channels: num(cn.ch), segments: [...cn.seg.values()].map(s => [s.id, num(s.f), num(s.fault)]), pumps: [...cn.pumps.values()].map(p => [p.id, p.dir, p.flow || 0, p.pIn || 0, p.pOut || 0, !!p.fault]) }; }
fs.writeFileSync(OUT, JSON.stringify(snap)); console.log(SCEN, 'hours', co.hours, 'buildings', snap.nBuildings, 'lines', snap.lines, 'cash', Math.round(g.store.cash), 'sold', JSON.stringify(num(co.led.life.sold)).slice(0, 120), 'purchases', snap.purchases.length, 'sales', sales.length);
