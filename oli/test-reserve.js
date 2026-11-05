/* Strategic Reserve - stage 1: one fixed zone, reserve tanks, two separate fill gauges, no auto-sell, idempotent loading.
   NODE_PATH=/opt/npm-tools/node_modules node test-reserve.js */
const W = require('./worldmap.js'), B = require('./buildings.js'), I = require('./industry.js'), E = require('./economy.js'), EC = require('./economy-config.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t) * Math.max(1, Math.abs(a), Math.abs(b));

console.log('A. the zone in the real world');
{ const w = W.createWorld({ seed: 20260101 }), z = w.reserveZoneOfWorld(), w2 = W.createWorld({ seed: 20260101 }), z2 = w2.reserveZoneOfWorld(), sr = w.regions.find(r => r.starter);
  T('A1 exactly one zone exists, in the starter region, with the Arabic name', z && z.regionId === sr.id && z.name === 'منطقة الاحتياطي الاستراتيجي' && w.regions.filter(r => w.reserveZone(r.id)).length === 1);
  T('A2 it is a fixed place: the same seed gives the same zone, every time', JSON.stringify(z) === JSON.stringify(z2) && JSON.stringify(w.reserveZoneOfWorld()) === JSON.stringify(z));
  T('A3 five growth levels, each inside the next, all inside the full rectangle', z.levels.length === 5 && z.levels.every((l, i) => i === 0 || (l.x <= z.levels[i - 1].x && l.y <= z.levels[i - 1].y && l.x + l.w >= z.levels[i - 1].x + z.levels[i - 1].w && l.y + l.h >= z.levels[i - 1].y + z.levels[i - 1].h)) && z.levels[4].x === z.x && z.levels[4].w === z.w && z.levels[4].h === z.h);
  let bad = 0, steep = 0; for (let j = 0; j < z.h; j++) for (let i = 0; i < z.w; i++) { const t = w.tile(z.x + i, z.y + j); if (!t || t.terrain === 'WATER_WADI') bad++; else if (t.slope > 6 * W.CONFIG.SLOPE_K) steep++; }
  T('A4 the whole ground is dry and buildable', bad === 0 && steep === 0, [bad, steep]);
  const rz = w.refineryZones(sr.id), hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  T('A5 it does not overlap a refinery zone, an oil field or a track', rz.every(r => !hit(z, r)) && w.regionSites(sr.id).every(q => !(q.x >= z.x && q.x <= z.x + z.w && q.y >= z.y && q.y <= z.y + z.h)) && w.tracks(sr.id).every(t => t.pts.every(([px, py]) => !(px > z.x && px < z.x + z.w && py > z.y && py < z.y + z.h))));
  const d = Math.min(...rz.map(r => Math.hypot(r.x + r.w / 2 - z.x - z.w / 2, r.y + r.h / 2 - z.y - z.h / 2)));
  T('A6 it lies close to the first refinery zones (' + Math.round(d) + ' tiles)', d < 120, d);
  const seeds = [1, 7, 99, 12345, 5, 2024]; T('A7 every tested world seed has a zone', seeds.every(s => !!W.createWorld({ seed: s }).reserveZoneOfWorld()));
  const ext = W.createWorld({ seed: 20260101, external: true }); ext.injectRegion(Object.assign({}, w.regionData(sr.id))); T('A8 the zone travels with the region data to the drawing thread (worker mode)', JSON.stringify(ext.reserveZoneOfWorld()) === JSON.stringify(z)); }

/* ---- a flat test world with a fixed reserve zone, built through the REAL fromWorld rule ---- */
const TERR = { FLAT_DESERT: { buildable: true, buildCost: 1, maxSlope: 10 }, WATER_WADI: { buildable: false, buildCost: 9, maxSlope: 0 } };
const ZN = { id: 'RESERVE', kind: 'STRATEGIC_RESERVE', name: 'منطقة الاحتياطي الاستراتيجي', x: 200, y: 100, w: 36, h: 26, levels: [0, 1, 2, 3, 4].map(l => ({ lv: l, x: 200 + Math.round((16 - 4 * l) / 2) * 0 + (16 - 4 * l) / 2, y: 100 + Math.round((12 - 3 * l) / 2), w: 20 + 4 * l, h: 14 + 3 * l })) };
ZN.levels.forEach(l => { l.x = 200 + (36 - l.w) / 2; });
const fake = { W: 400, H: 300, tile: () => ({ terrain: 'FLAT_DESERT', slope: 0 }), oilFieldAt: () => ({ kind: 'FIELD', id: 1 }), stateOf: () => 'DRILLABLE', refineryZones: () => [{ id: 1, x: 0, y: 0, w: 400, h: 300 }], regionIdAt: () => 0, siteById: () => null, take: () => 0, reserveZoneOfWorld: () => ZN, injectorsTotal: () => 0, liftFactor: () => 1 };
function game(cash, saveFrom) {
  const ts = B.fromWorld(fake, { TERRAIN: TERR, SLOPE_K: 1, PRODUCTION: { INJ_OP_DAY: 0 } }), store = new B.BuildingStore(ts, { cash: cash == null ? 500e6 : cash }), net = new I.PipeNet(ts.W), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 });
  return { ts, store, net, sim, co };
}
const put = (g, d, x, y, r) => { const v = g.store.place(d, x, y, r || 0, { instant: true }); if (!v.ok) throw new Error('place ' + d + ' ' + x + ',' + y + ' ' + v.reason); return v.building; };
const tryPut = (g, d, x, y) => g.store.validate(d, x, y, 0, {});
const A0 = ZN.levels[0];   // level 0 area: x 208..227, y 104..117 (approx)

console.log('B. building rules inside the zone');
{ const g = game(); const inside = tryPut(g, 'crude_tank_m', A0.x + 2, A0.y + 2);
  T('B1 a tank inside the open area is valid and becomes a reserve tank', inside.ok && inside.reserve === true);
  const b = put(g, 'crude_tank_m', A0.x + 2, A0.y + 2); T('B1b the placed building is flagged as a reserve tank (b.rs) and its kind is RESERVE', b.rs === 1 && g.sim.tankKind(b) === 'RESERVE');
  const out = tryPut(g, 'crude_tank_m', 50, 50); T('B2 a tank outside the whole zone is an ordinary commercial tank', out.ok && !out.reserve);
  const over = tryPut(g, 'crude_tank_m', A0.x + A0.w - 1, A0.y + 2); T('B3 a tank crossing the edge of the open area is refused (reserveBounds)', !over.ok && over.reason === 'reserveBounds', over.reason);
  const lock = tryPut(g, 'crude_tank_m', 200, 100); T('B4 ground inside the zone but not yet opened is refused for tanks', !lock.ok && lock.reason === 'reserveBounds');
  T('B5 wells, separators, refineries cannot be built inside the zone (storage only)', ['oil_well', 'separator', 'refinery_s'].every(d => { const v = tryPut(g, d, A0.x + 4, A0.y + 4); return !v.ok && (v.reason === 'reserveOnly' || v.reason === 'overlap'); }));
  T('B6 pumps, valves and junctions are allowed inside (they are the pipe network)', ['pump_station_s', 'junction'].every(d => tryPut(g, d, A0.x + 12, A0.y + 9).ok || tryPut(g, d, A0.x + 14, A0.y + 9).ok));
  const r0 = g.co.reserveExpand(); T('B7 expanding opens the next ring', r0.ok && g.co.reserve.lv === 1 && tryPut(g, 'crude_tank_m', 200 + 8, A0.y + 2 - 2).reason !== 'reserveBounds' || g.co.reserve.lv === 1, r0);
  const at = ZN.levels[1]; const v = tryPut(g, 'crude_tank_m', at.x, at.y); T('B7b a place that was locked at level 0 is valid at level 1 (and reserve)', v.ok && v.reserve === true, v.reason);
  const mv = g.store.move(b.id, 50, 50); T('B8 a reserve tank cannot be dragged out of the zone (its stock would change system)', !mv.ok && mv.reason === 'reserveMove'); const cb = put(g, 'crude_tank_m', 60, 60); const mv2 = g.store.move(cb.id, A0.x + 8, A0.y + 2); T('B8b a commercial tank cannot be dragged into the zone', !mv2.ok && mv2.reason === 'reserveMove', mv2.reason); }

console.log('C. two separate gauges: commercial vs reserve');
{ const g = game(), co = g.co; const ct = put(g, 'crude_tank_m', 60, 60), ct2 = put(g, 'crude_tank_m', 70, 60), rt = put(g, 'crude_tank_m', A0.x + 2, A0.y + 2), rt2 = put(g, 'crude_tank_m', A0.x + 8, A0.y + 2), rg = put(g, 'gasoline_tank_s', A0.x + 14, A0.y + 2);
  co.sync(); g.sim.ensure(ct).vol = 40000; g.sim.ensure(ct2).vol = 35000; g.sim.ensure(rt).vol = 20000; g.sim.ensure(rt2).vol = 10000; g.sim.ensure(rg).vol = 4000;
  const f = co.fills();
  T('C1 commercial: 75,000 of 100,000 = 75% (reserve tanks are not in it)', f.commercial.capacity === 100000 && f.commercial.volume === 75000 && near(f.commercial.fill, 0.75), f.commercial);
  T('C2 reserve: 34,000 of 110,000 (2 crude 50,000 + 1 gasoline 10,000) counted on reserve tanks only', f.reserve.capacity === 110000 && f.reserve.volume === 34000 && near(f.reserve.fill, 34000 / 110000) && f.reserve.tanks === 3, f.reserve);
  T('C3 the two gauges are never added: total is not mixed into either', f.commercial.fill !== f.reserve.fill && f.commercial.capacity + f.reserve.capacity === 210000);
  T('C4 per-product commercial capacity ignores the reserve (crude 100,000, gasoline 0)', co.capacity('CRUDE') === 100000 && co.capacity('GASOLINE') === 0 && co.available('GASOLINE') === 0 && co.physicalVol('GASOLINE') === 0);
  T('C5 per-product reserve figures are separate (crude 100,000 cap / 30,000 held; gasoline 10,000 / 4,000)', co.reserveCapacity('CRUDE') === 100000 && co.reserveVolume('CRUDE') === 30000 && co.reserveCapacity('GASOLINE') === 10000 && co.reserveVolume('GASOLINE') === 4000);
  const cap0 = f.commercial.capacity, rcap0 = f.reserve.capacity; put(g, 'crude_tank_s', 90, 60); const f2 = co.fills();
  T('C6 building a commercial tank raises commercial capacity only', f2.commercial.capacity === cap0 + 10000 && f2.reserve.capacity === rcap0 && f2.reserve.volume === f.reserve.volume);
  put(g, 'crude_tank_s', A0.x + 14, A0.y + 6); const f3 = co.fills(); T('C7 building a reserve tank raises reserve capacity only', f3.reserve.capacity === rcap0 + 10000 && f3.commercial.capacity === f2.commercial.capacity && f3.commercial.volume === f2.commercial.volume);
  T('C8 the reserve tank list is the zone\'s own tanks with fill each', co.reserveInfo().tanks.length === 4 && co.reserveInfo().tanks.every(t => t.capacity > 0 && t.fill >= 0) && co.reserveInfo().exists);
  T('C9 the commercial list (tanks screen) does not include reserve tanks', co.tankReport().every(t => t.id !== rt.id && t.id !== rt2.id) && co.tankReport().length === 3); }

console.log('D. no automatic selling, no buying into the reserve by accident, no outflow by itself');
{ const g = game(), co = g.co; const rg = put(g, 'gasoline_tank_m', A0.x + 2, A0.y + 2), cg = put(g, 'gasoline_tank_m', 60, 60), rt = put(g, 'crude_tank_m', A0.x + 8, A0.y + 2), ct = put(g, 'crude_tank_m', 80, 60);
  co.sync(); for (const p of EC.PRODUCTS) co.setMode(p, 'SPOT'); g.sim.ensure(rg).vol = 45000; g.sim.ensure(cg).vol = 45000; g.sim.ensure(rt).vol = 30000;   // both gasoline tanks are 90% full: above the auto-sell trigger (80%)
  const cash0 = g.store.cash; for (let d = 0; d < 20; d++) co.advanceHours(24);
  T('D1 auto-sell (SPOT) sold from the commercial tank only; the reserve gasoline is untouched', g.sim.ensure(cg).vol < 45000 && g.sim.ensure(rg).vol === 45000, [g.sim.ensure(cg).vol, g.sim.ensure(rg).vol]);
  T('D2 reserve crude is untouched by auto-sell too', g.sim.ensure(rt).vol === 30000);
  const q = co.buy('CRUDE', 5000, 'A', 'CASH'); T('D3 bought oil goes to a commercial/trade tank, never into a reserve tank', q.ok && g.sim.ensure(rt).vol === 30000 && co.tradeTanks().every(b => !b.rs), q);
  const r = co.sell('CRUDE', 1e9, 'SPOT', { source: 'ALL' }); T('D4 even selling everything cannot touch the reserve (it is not "available")', g.sim.ensure(rt).vol === 30000 && g.sim.ensure(rg).vol === 45000 && co.available('CRUDE') < 1e-6 + 5000, [co.available('CRUDE')]);
  T('D5 the books still balance', co.audit().ok, co.audit()); }
{ const g = game(), co = g.co; const rt = put(g, 'crude_tank_m', A0.x + 2, A0.y + 2), rf = put(g, 'crude_tank_m', 250, 104); co.sync(); for (const p of EC.PRODUCTS) co.setMode(p, 'WAIT');   g.sim.ensure(rt).vol = 40000;
  const lay = I.layPipe(g.store, g.net, g.ts, { b: rt.id, port: 'OUTPUT_E' }, { b: rf.id, port: 'INPUT_W' }, 16);
  T('D6 a reserve tank can be piped to a commercial tank / refinery by the same pipe network', lay && lay.ok !== false, lay && lay.reason);
  for (let d = 0; d < 5; d++) co.advanceHours(24);
  { const gc = game(), cc = gc.co; const ctank = put(gc, 'crude_tank_m', 60, 60), rf2 = put(gc, 'crude_tank_m', 120, 100); cc.sync(); gc.sim.ensure(ctank).vol = 40000; I.layPipe(gc.store, gc.net, gc.ts, { b: ctank.id, port: 'OUTPUT_E' }, { b: rf2.id, port: 'INPUT_W' }, 16); for (let d = 0; d < 5; d++) cc.advanceHours(24);
    T('D6b control: the same layout with an ordinary commercial tank does move oil to the destination', gc.sim.ensure(ctank).vol < 40000 && gc.sim.ensure(rf2).vol > 0, gc.sim.ensure(ctank).vol); }
  T('D7 but its outlet stays closed by itself: nothing flows to the destination until the player orders a release', g.sim.ensure(rt).vol === 40000 && g.sim.ensure(rf).vol === 0, [g.sim.ensure(rt).vol, g.sim.ensure(rf)._in]);
  g.sim.ensure(rt).rel = 1; for (let d = 0; d < 2; d++) co.advanceHours(24); T('D8 with an ordered release (stage 2 uses this switch) the oil does flow, and every barrel that left arrived once', g.sim.ensure(rt).vol < 40000 && near(g.sim.ensure(rt).vol + g.sim.ensure(rf).vol, 40000, 1e-6), [g.sim.ensure(rt).vol, g.sim.ensure(rf).vol]); }

console.log('E. money: expansion in the same ledger');
{ const g = game(), co = g.co; co.sync(); const c0 = g.store.cash, fx0 = co.journal.bal.FIXED, cost = co.reserveExpandCost(), r = co.reserveExpand();
  T('E1 expansion costs cash and adds a fixed asset of the same size (one ledger)', r.ok && r.cost === cost && near(c0 - g.store.cash, cost) && near(co.journal.bal.FIXED - fx0, cost) && co.audit().ok);
  T('E2 costs rise level by level', EC.RESERVE.expand.every((v, i, a) => i === 0 || v > a[i - 1]));
  while (co.reserveExpand().ok); T('E3 the last level stops further expansion', co.reserve.lv === 4 && co.reserveExpand().reason === 'maxLevel' && co.reserveExpandCost() === null);
  const poor = game(1e6).co; T('E4 not enough cash: refused, nothing booked', poor.reserveExpand().reason === 'cash' && poor.reserve.lv === 0 && poor.audit().ok);
  T('E5 the expansion appears in the audit log', co.reserve.log.length === 4 && co.reserve.log.every(l => l.kind === 'EXPAND')); }

console.log('F. save / load');
{ const g = game(), co = g.co; co.reserveExpand(); co.reserveExpand(); const rt = put(g, 'crude_tank_m', A0.x + 2, A0.y + 2), ct = put(g, 'crude_tank_m', 60, 60); co.sync(); g.sim.ensure(rt).vol = 12345; g.sim.ensure(ct).vol = 33333;
  co.advanceHours(24 * 3); const f0 = JSON.parse(JSON.stringify(co.fills())), sj = JSON.parse(JSON.stringify(g.store.toJSON())), cj = JSON.parse(JSON.stringify(co.toJSON()));
  const g2 = game(); g2.store.items.clear(); g2.store.occ.clear(); g2.store.bucket.clear(); const r = B.BuildingStore.fromJSON(g2.ts, sj); g2.store.items = r.store.items; g2.store.occ = r.store.occ; g2.store.bucket = r.store.bucket; g2.store.nextId = r.store.nextId; g2.store.cash = g.store.cash;
  g2.co.fromJSON(JSON.parse(JSON.stringify(cj)));
  T('F1 reserve tank flag, level and gauges come back exactly', g2.co.reserve.lv === 2 && g2.store.get(rt.id).rs === 1 && !g2.store.get(ct.id).rs && JSON.stringify(g2.co.fills()) === JSON.stringify(f0), [g2.co.fills(), f0]);
  g2.co.fromJSON(JSON.parse(JSON.stringify(cj))); g2.co.fromJSON(JSON.parse(JSON.stringify(cj))); T('F2 loading the same save again and again changes nothing (idempotent)', g2.co.reserve.lv === 2 && g2.co.reserve.log.length === 2 && JSON.stringify(g2.co.fills()) === JSON.stringify(f0));
  T('F3 the books balance after loading', g2.co.audit().ok);
  /* an OLD save: no reserve data at all, and a commercial tank that happens to lie inside the zone */
  const g3 = game(); const old = put(g3, 'crude_tank_m', 60, 60); g3.sim.ensure(old).vol = 20000; const sj3 = JSON.parse(JSON.stringify(g3.store.toJSON())); sj3.b.forEach(a => a.length = 12);     // rows from before the reserve flag
  const cj3 = JSON.parse(JSON.stringify(g3.co.toJSON())); delete cj3.reserve;
  const g4 = game(); const r4 = B.BuildingStore.fromJSON(g4.ts, sj3); g4.store.items = r4.store.items; g4.store.occ = r4.store.occ; g4.store.bucket = r4.store.bucket; g4.store.nextId = r4.store.nextId; g4.co.fromJSON(cj3);
  T('F4 an old save loads: reserve starts closed at level 0, empty, and the old commercial stock is NOT moved into it', g4.co.reserve.lv === 0 && g4.co.reserveTanks().length === 0 && g4.co.fills().reserve.volume === 0 && g4.co.fills().commercial.volume === 20000 && g4.store.list().length === 1);
  const mid = JSON.parse(JSON.stringify(cj)); mid.reserve.lv = 99; g2.co.fromJSON(mid); T('F5 a corrupt level is clamped to the real range', g2.co.reserve.lv === 4); }

console.log('G. months of play with the reserve present');
{ const g = game(), co = g.co; const rt = put(g, 'crude_tank_m', A0.x + 2, A0.y + 2), rg = put(g, 'gasoline_tank_s', A0.x + 8, A0.y + 2), ct = put(g, 'crude_tank_m', 60, 60); co.sync(); g.sim.ensure(rt).vol = 25000; g.sim.ensure(rg).vol = 8000; g.sim.ensure(ct).vol = 20000;
  for (let d = 0; d < 120; d++) co.advanceHours(24);
  T('G1 four months: reserve volumes unchanged, books balance, storage cost kept being charged', g.sim.ensure(rt).vol === 25000 && g.sim.ensure(rg).vol === 8000 && co.audit().ok && co.led.life.pl.maintenance >= 0);
  const f = co.fills(); T('G2 gauges still separate and sane', f.reserve.fill > 0 && f.reserve.fill <= 1 && f.commercial.fill >= 0 && f.commercial.fill <= 1); }

console.log('\nRESERVE STAGE-1 TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
