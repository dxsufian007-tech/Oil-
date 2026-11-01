/* shared builder for the economy tests: the Phase 2 chain on a flat mock world */
const B = require('./buildings.js'), I = require('./industry.js'), E = require('./economy.js'), EC = require('./economy-config.js');
const TERR = { FLAT_DESERT: { buildable: true, buildCost: 1, maxSlope: 10 }, WATER_WADI: { buildable: false, buildCost: 9, maxSlope: 0 } };
function world() { return { W: 400, H: 300, tile: () => ({ terrain: 'FLAT_DESERT', slope: 0 }), terrain: TERR, slopeK: 1, oilFieldAt: () => ({ kind: 'FIELD', id: 1 }), stateOf: () => 'DRILLABLE', zoneAt: () => ({ id: 1 }) }; }
function game(cash, cfg) { const ts = world(), store = new B.BuildingStore(ts, { cash: cash == null ? 50e6 : cash }), net = new I.PipeNet(ts.W), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { config: cfg, now: () => 1e12 }); return { ts, store, net, sim, co }; }
const put = (g, d, x, y, r, instant) => { const v = g.store.place(d, x, y, r || 0, { instant: instant !== false }); if (!v.ok) throw new Error('place ' + d + ' ' + JSON.stringify(v)); return v.building; };
const pipe = (g, a, ap, b, bp, dia) => I.layPipe(g.store, g.net, g.ts, { b: a.id, port: ap }, { b: b.id, port: bp }, dia || 16);
/* wells -> junction -> pump -> separator -> crude tank -> refinery -> products.  `full` = with the refinery and 4 product stores */
function chain(g, full, big) {
  const c = {}; c.wells = [put(g, 'oil_well', 20, 36), put(g, 'oil_well', 20, 40), put(g, 'oil_well', 20, 44)]; c.jn = put(g, 'junction', 28, 40); c.pump = put(g, 'pump_station_l', 34, 40); c.sep = put(g, 'separator', 50, 38); c.ct = put(g, 'crude_tank_m', 68, 38);
  const L = []; ['PORT_N', 'PORT_W', 'PORT_S'].forEach((p, i) => L.push(pipe(g, c.wells[i], 'OIL_OUT_E', c.jn, p)));
  L.push(pipe(g, c.jn, 'PORT_E', c.pump, 'INPUT'), pipe(g, c.pump, 'OUTPUT', c.sep, 'MIXTURE_IN'), pipe(g, c.sep, 'OIL_OUT', c.ct, 'INPUT_W'));
  if (full) { c.ref = put(g, 'refinery_s', 86, 36); const z = big ? 'm' : 's'; c.tg = put(g, 'gasoline_tank_' + z, 108, 36); c.td = put(g, 'diesel_tank_' + z, 108, 43); c.tj = put(g, 'jet_tank_' + z, 108, 50); c.tl = put(g, 'gas_sphere_' + z, 92, 25);
    L.push(pipe(g, c.ct, 'OUTPUT_E', c.ref, 'CRUDE_IN'), pipe(g, c.ref, 'GASOLINE_OUT', c.tg, 'INPUT_W'), pipe(g, c.ref, 'DIESEL_OUT', c.td, 'INPUT_W'), pipe(g, c.ref, 'JET_OUT', c.tj, 'INPUT_W'), pipe(g, c.ref, 'GAS_OUT', c.tl, 'INPUT_N')); }
  c.L = L; return c;
}
module.exports = { B, I, E, EC, game, put, pipe, chain };
