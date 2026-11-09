/* shared builder for the Strategic Reserve tests: a flat world with ONE fixed reserve zone, built through the real fromWorld rule */
const B = require('./buildings.js'), I = require('./industry.js'), E = require('./economy.js'), EC = require('./economy-config.js');
const TERR = { FLAT_DESERT: { buildable: true, buildCost: 1, maxSlope: 10 }, WATER_WADI: { buildable: false, buildCost: 9, maxSlope: 0 } };
const ZN = { id: 'RESERVE', kind: 'STRATEGIC_RESERVE', name: 'منطقة الاحتياطي الاستراتيجي', x: 200, y: 100, w: 36, h: 26, levels: [0, 1, 2, 3, 4].map(l => ({ lv: l, x: 200 + (36 - (20 + 4 * l)) / 2, y: 100 + Math.round((12 - 3 * l) / 2), w: 20 + 4 * l, h: 14 + 3 * l })) };
const fake = { W: 400, H: 300, tile: () => ({ terrain: 'FLAT_DESERT', slope: 0 }), oilFieldAt: () => ({ kind: 'FIELD', id: 1 }), stateOf: () => 'DRILLABLE', refineryZones: () => [{ id: 1, x: 0, y: 0, w: 400, h: 300 }], regionIdAt: () => 0, siteById: () => null, take: () => 0, reserveZoneOfWorld: () => ZN, injectorsTotal: () => 0, liftFactor: () => 1 };
function game(cash) {
  const ts = B.fromWorld(fake, { TERRAIN: TERR, SLOPE_K: 1, PRODUCTION: { INJ_OP_DAY: 0 } }), store = new B.BuildingStore(ts, { cash: cash == null ? 500e6 : cash }), net = new I.PipeNet(ts.W), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 });
  store.cash = cash == null ? 500e6 : cash;
  for (const p of EC.PRODUCTS) co.setMode(p, 'WAIT');                                                         // no auto-sell unless a test asks for it
  return { ts, store, net, sim, co };
}
const put = (g, d, x, y, r) => { const v = g.store.place(d, x, y, r || 0, { instant: true }); if (!v.ok) throw new Error('place ' + d + ' ' + x + ',' + y + ' ' + v.reason); return v.building; };
const pipe = (g, a, ap, b, bp, dia) => { const r = I.layPipe(g.store, g.net, g.ts, { b: a.id, port: ap }, { b: b.id, port: bp }, dia || 16); if (r.ok === false) throw new Error('pipe ' + ap + '->' + bp + ' ' + r.reason); return r; };
const A0 = ZN.levels[0];
/* reload a game from the saved JSON of another (store + company), exactly what a real save / load does */
function reload(g) {
  const sj = JSON.parse(JSON.stringify(g.store.toJSON())), cj = JSON.parse(JSON.stringify(g.co.toJSON())), nj = JSON.parse(JSON.stringify(g.net.toJSON())), g2 = game(); const r = B.BuildingStore.fromJSON(g2.ts, sj);
  g2.store.items = r.store.items; g2.store.occ = r.store.occ; g2.store.bucket = r.store.bucket; g2.store.nextId = r.store.nextId; g2.store.time = r.store.time; g2.store.cash = g.store.cash; { const n2 = I.PipeNet.fromJSON(g2.ts.W, nj); for (const L of n2.lines.values()) g2.net.lay({ a: L.a, b: L.b, path: L.path, product: L.product, dia: L.dia }); g2.net.nextId = nj.next || g2.net.nextId; } g2.co.fromJSON(cj); return g2;
}
module.exports = { B, I, E, EC, ZN, game, put, pipe, A0, reload, near: (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t) * Math.max(1, Math.abs(a), Math.abs(b)) };
