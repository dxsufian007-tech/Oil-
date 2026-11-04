/* Stage 8 helper: the full oil plant built on the REAL world with the real functions (store.snap / store.place / layPipe), exactly the way the game's demo chain is built.
 *   wells -> junction -> pump -> separator -> PRODUCTION tank -> junction -> refinery -> 4 product stores ; a TRADE tank (+ pump) feeding the same junction ; a COMMERCIAL tank on its own. */
const B = require('./buildings.js'), I = require('./industry.js'), E = require('./economy.js'), EC = require('./economy-config.js'), W = require('./worldmap.js');
function newGame(opts) {
  opts = opts || {}; const world = W.createWorld({ seed: opts.seed || 20260101 }), ts = B.fromWorld(world), store = new B.BuildingStore(ts, { cash: opts.cash == null ? 2e9 : opts.cash }), net = new I.PipeNet(ts.W), sim = new I.Sim(store, net);
  const co = new E.Company(store, net, sim, { now: () => 1e12, config: opts.config });
  return { world, ts, store, net, sim, co, sr: world.regions.find(r => r.starter) };
}
const put = (g, def, x, y, rad) => { for (const R of [rad == null ? 5 : rad, 9, 14, 22]) { const sn = g.store.snap(def, Math.round(x), Math.round(y), 0, { radius: R, ignoreCash: true }); if (!sn) continue; const r = g.store.place(def, sn.x, sn.y, sn.r, { instant: true }); if (r.ok) return r.building; } return null; };
function connect(g, a, b, o) {
  o = o || {}; const pa = B.worldPoints(a).filter(p => p.kind === 'pipe' && !p.reserved && p.role !== 'in' && (!o.ap || p.id === o.ap)), pb = B.worldPoints(b).filter(p => p.kind === 'pipe' && !p.reserved && p.role !== 'out' && (!o.bp || p.id === o.bp)), c = [];
  for (const p of pa) for (const q of pb) c.push({ p, q, d: Math.abs(p.ax - q.ax) + Math.abs(p.ay - q.ay) }); c.sort((x, y) => x.d - y.d);
  for (const { p, q } of c) { const r = I.layPipe(g.store, g.net, g.ts, { b: a.id, port: p.id }, { b: b.id, port: q.id }, o.dia || 16, { ignoreCash: true }); if (r.ok) return r; } return null;
}
const fieldsOf = g => g.world.regionSites(g.sr.id).filter(s => s.kind === 'FIELD').sort((a, b) => b.radius - a.radius);
/* open a field through the same state steps the player takes (no money here: use Company.drillWell for the paid steps) */
const openField = (g, f) => { g.world.discover(f.id); g.world.survey(f.id); g.world.makeDrillable(f.id); return f; };
function buildPlant(g, f, opts) {
  opts = opts || {}; const zn = g.world.refineryZones(g.sr.id)[opts.zone == null ? 1 : opts.zone], fx = f.x, fy = f.y, fail = [], P = {};
  P.wells = [put(g, 'oil_well', fx - 3, fy - 4, 3), put(g, 'oil_well', fx - 3, fy, 3), put(g, 'oil_well', fx - 3, fy + 4, 3)].filter(Boolean).slice(0, opts.wells || 3);
  P.jn = put(g, 'junction', fx + 3, fy, 4); P.pump = put(g, 'pump_station_l', fx + 8, fy - 1, 4); P.sep = put(g, 'separator', fx + 16, fy - 2, 4); P.ct = put(g, opts.tank || 'crude_tank_m', fx + 26, fy - 1, 5);
  P.rf = put(g, 'refinery_m', zn.x + 4, zn.y + 5, 6); P.tg = put(g, 'gasoline_tank_m', zn.x + 20, zn.y + 1, 5); P.td = put(g, 'diesel_tank_m', zn.x + 20, zn.y + 6, 5); P.tj = put(g, 'jet_tank_m', zn.x + 20, zn.y + 11, 5); P.tl = put(g, 'gas_sphere_m', zn.x + 12, zn.y + 14, 5);
  P.j2 = put(g, 'junction', zn.x - 6, zn.y + 5, 4); P.tt = put(g, 'crude_tank_m', zn.x - 30, zn.y + 20, 5); P.tp = put(g, 'pump_station_l', zn.x - 18, zn.y + 20, 4); P.cm = put(g, 'crude_tank_m', zn.x - 30, zn.y - 10, 5);
  for (const k of Object.keys(P)) if (!P[k] || (Array.isArray(P[k]) && !P[k].length)) fail.push(k);
  const L = (a, b, o, n) => { if (!a || !b) { fail.push(n); return null; } const r = connect(g, a, b, o); if (!r) fail.push(n); return r; }; P.lines = {};
  P.wells.forEach((w, i) => { P.lines['well' + i] = L(w, P.jn, { bp: ['PORT_N', 'PORT_W', 'PORT_S'][i] }, 'well' + i); }); P.lines.jnPump = L(P.jn, P.pump, { ap: 'PORT_E', bp: 'INPUT' }, 'jn-pump'); P.lines.pumpSep = L(P.pump, P.sep, { ap: 'OUTPUT', bp: 'MIXTURE_IN' }, 'pump-sep'); P.lines.sepTank = L(P.sep, P.ct, { ap: 'OIL_OUT', bp: 'INPUT_W' }, 'sep-tank');
  P.lines.tankJ2 = L(P.ct, P.j2, { ap: 'OUTPUT_E', bp: 'PORT_W', dia: 24 }, 'tank-j2'); P.lines.j2Ref = L(P.j2, P.rf, { ap: 'PORT_E', bp: 'CRUDE_IN', dia: 24 }, 'j2-ref'); P.lines.ttPump = L(P.tt, P.tp, { ap: 'OUTPUT_E', bp: 'INPUT', dia: 24 }, 'tt-pump'); P.lines.tpJ2 = L(P.tp, P.j2, { ap: 'OUTPUT', bp: 'PORT_S', dia: 24 }, 'tp-j2');
  L(P.rf, P.tg, { ap: 'GASOLINE_OUT', bp: 'INPUT_W' }, 'gasoline'); L(P.rf, P.td, { ap: 'DIESEL_OUT', bp: 'INPUT_W' }, 'diesel'); L(P.rf, P.tj, { ap: 'JET_OUT', bp: 'INPUT_W' }, 'jet'); L(P.rf, P.tl, { ap: 'GAS_OUT', bp: 'INPUT_N' }, 'gas');
  P.fail = fail; for (const b of g.store.list()) g.sim.ensure(b); return P;
}
const stockUp = co => { for (const [m, q] of [['CHEM', 20000], ['OPS', 5000], ['PARTS', 200]]) { const r = co.buy(m, q, 'A', 'CASH'); if (!r.ok) throw new Error('stock ' + m + ' ' + r.reason); } };
const restock = co => { for (const m of ['CHEM', 'OPS']) { const room = Math.floor(co.roomFor(m)); if (room > 0) { const r = co.buy(m, room, 'A', 'CASH'); if (!r.ok) throw new Error('restock ' + m + ' ' + r.reason); } } };
/* run n game hours, topping the refinery materials up every hour (so the refinery is never limited by chemicals) when keep is set */
const hours = (co, n, keep) => { for (let h = 0; h < n; h++) { if (keep) restock(co); co.advanceHours(1); } };
/* the whole cycle up to a running plant: evaluate the zone, drill the exploratory and two appraisal wells (all paid), build the plant */
function cycle(opts) {
  opts = opts || {}; const g = newGame(opts), f = fieldsOf(g)[0]; g.f = f; g.world.discover(f.id);
  const ev = g.co.exploreZone(g.world, g.sr.id), ex = g.co.drillWell(g.world, 'EXPLORATORY', f.id), a1 = g.co.drillWell(g.world, 'APPRAISAL', f.id), a2 = g.co.drillWell(g.world, 'APPRAISAL', f.id);
  g.steps = { ev, ex, a1, a2 }; g.P = buildPlant(g, f, opts); g.co.setSpeed(0); for (const p of ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) g.co.setMode(p, 'WAIT'); stockUp(g.co); return g;
}
module.exports = { B, I, E, EC, W, newGame, put, connect, fieldsOf, openField, buildPlant, stockUp, restock, hours, cycle };
