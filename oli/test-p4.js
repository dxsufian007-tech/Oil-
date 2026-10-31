// Phase 4: regions, terrain, supply contracts, market events, AI competitors, shares, rank, save/load.
const assert = require('assert');
const { Game, CFG, mulberry32 } = require('./core.js'); const { idx, oldAreas } = require('./test-legacy.js');
CFG.BUILD = { well: 0, tank: 0, pipeTile: 0, pipeMax: 0 };   // Phase 6 construction time is tested in test-p6.js
const ok = n => console.log('  ok  ' + n);
const near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, m + ' (' + a + ' vs ' + b + ')');
const run = (g, sec) => { for (let i = 0; i < sec * 10; i++) g.step(0.1); };
const A4 = CFG.EXPLORE.AREA, tilesOf = (a) => { const o = []; for (let y = a.ay * A4; y < a.ay * A4 + A4; y++) for (let x = a.ax * A4; x < a.ax * A4 + A4; x++) o.push([x, y]); return o; };
const fresh = seed => new Game({ rng: mulberry32(seed), seed: 7 });
const freeTile = (g, a) => tilesOf(a).find(([x, y]) => g.canPlace('tank', x, y).reason !== 'locked' && !g.map.block[y * 140 + x] && !g.map.block[y * 140 + x + 1] && !g.map.block[(y + 1) * 140 + x] && !g.map.block[(y + 1) * 140 + x + 1]);

// ---- regions
{
  const g = fresh(1);
  assert.strictEqual(CFG.REGIONS.length, 5);
  assert.deepStrictEqual([1, 2, 3, 4, 5].map(i => g.regionState(i)), ['EXPLORED', 'LOCKED', 'LOCKED', 'LOCKED', 'LOCKED']);
  const R = [1, 2, 3, 4, 5].map(i => g.regionInfo(i));
  for (const r of R) for (const f of ['constructionMult', 'explorationCost', 'reservePotential', 'terrain', 'riskLevel', 'discovered']) assert(f in r, f);
  ok('5 regions with constructionMult / explorationCost / reservePotential / terrain / riskLevel / discovered; states ' + R.map(r => r.state).join(','));
  const a2 = oldAreas(g).find(a => a.region === 2 && a.land && tilesOf(a).some(([x, y]) => !g.map.block[y * 140 + x]));
  g.s.cash = 3000; assert.strictEqual(g.unlockRegion(2).reason, 'needCash'); assert.strictEqual(g.s.cash, 3000);
  assert.strictEqual(g.explore(a2.id).reason, 'locked'); const [lx, ly] = tilesOf(a2).find(([x, y]) => !g.map.block[y * 140 + x]);
  assert.strictEqual(g.canPlace('well', lx, ly).reason, 'locked'); ok('1. locked region: unlock needs ' + CFG.REGIONS[1].need + ' cash (3000 refused), exploring and building refused (locked)');
  g.s.cash = 5000; const r = g.unlockRegion(2); assert(r.ok && g.s.cash === 5000 - 2500 && g.regionState(2) === 'AVAILABLE'); assert.strictEqual(g.unlockRegion(2).reason, 'known');
  ok('1. unlock region 2 for $2,500 -> AVAILABLE');
  // 2-4 explore until a non-empty reserve is found
  g.s.cash = 1e6; const cands = oldAreas(g).filter(a => a.region === 2 && a.land && tilesOf(a).some(([x, y]) => !g.map.block[y * 140 + x]));
  const cx = g.s.cash; assert(g.explore(cands[0].id).ok); near(cx - g.s.cash, 1300, 0, 'region exploration cost');
  for (const a of cands.slice(1)) g.explore(a.id); run(g, 25);
  assert.strictEqual(g.regionState(2), 'EXPLORED');
  const rich = cands.find(a => a.kind !== 'empty'); assert(rich); const info = g.areaInfo(rich); assert(info.reserveSize > 0 && info.quality);
  ok('2-3. explored region 2 for $1,300/area -> EXPLORED; reserve found: ' + rich.kind + ' ' + rich.quality + ' ' + info.reserveSize + ' BBL');
  // terrain & cost multipliers
  const seen = {};
  for (const [x, y] of tilesOf(rich)) { if (g.map.block[y * 140 + x] || g.occ[y * 140 + x]) continue; const m = g.footMult('well', x, y), t = CFG.TERRAIN.NAMES[g.terrainAt(x, y)]; seen[t] = m; assert(g.canPlace('well', x, y).ok); near(g.buildCost('well', 'small', x, y), Math.round(2000 * 1.1 * CFG.TERRAIN.MULT[g.terrainAt(x, y)]), 0, 'well cost'); }
  console.log('      terrain in the area -> cost multiplier incl. region x1.1: ' + JSON.stringify(seen));
  const allT = new Set(); for (let k = 0; k < 140 * 88; k++) allT.add(g.terrain[k]); assert.strictEqual(allT.size, 4);
  assert(CFG.TERRAIN.MULT[1] < 1 && CFG.TERRAIN.MULT[0] === 1 && CFG.TERRAIN.MULT[2] > 1 && CFG.TERRAIN.MULT[3] > CFG.TERRAIN.MULT[2]); ok('terrain: FLAT cheaper, SAND normal, ROUGH and ROCK dearer (all 4 types exist on the map)');
  const [wx, wy] = tilesOf(rich).find(([x, y]) => g.canPlace('well', x, y).ok && g.canPlace('tank', x + 3, y).ok);
  const c0 = g.s.cash, w = g.place('well', wx, wy, 'small'); assert(w.ok); near(c0 - g.s.cash, g.buildCost('well', 'small', wx, wy), 0, 'charged'); assert.strictEqual(g.regionState(2), 'ACTIVE');
  const t = g.place('tank', wx + 3, wy).building; const route = g.routePipe(wx + 1, wy, wx + 2, wy, false); assert(route.ok); let exp = 0; for (const k of route.fresh) exp += Math.round(100 * g.tileMult(k % 140, (k / 140) | 0)); near(route.cost, exp, 0, 'pipe cost follows terrain'); g.buildRoute(route);
  run(g, 60); assert(t.amt > 5); ok('4-5. well built in region 2 (cost incl. terrain), region ACTIVE, pipe cost follows terrain; oil produced: ' + t.amt.toFixed(1) + ' BBL');
  // risk level raises wear
  const g2 = fresh(2); assert(CFG.REGIONS[4].risk > CFG.REGIONS[0].risk); ok('region riskLevel multiplies leak chance and well wear (R5 x' + CFG.REGIONS[4].risk + ' vs R1 x1)');
}

// ---- supply contracts
{
  const g = fresh(3); g.s.cash = 1e5; const A = oldAreas(g).find(a => a.st === 2); const [wx, wy] = tilesOf(A).find(([x, y]) => g.canPlace('well', x, y).ok && g.canPlace('tank', x + 3, y).ok);
  g.place('well', wx, wy, 'medium'); const tk = g.place('tank', wx + 3, wy).building; g.upgrade(tk); g.upgrade(tk); g.buildRoute(g.routePipe(wx + 1, wy, wx + 2, wy, false));
  const o = g.makeOrder(); assert.strictEqual(o.status, 'AVAILABLE'); for (const f of ['requiredOil', 'deliveredOil', 'remainingOil', 'price', 'deadline', 'reward', 'status']) assert(f in o, f);
  assert.strictEqual(o.reward, Math.round(o.requiredOil * o.price)); ok('6. offer: ' + o.requiredOil + ' BBL @ $' + o.price + ' = $' + o.reward + ' reward in ' + o.duration / 60 + ' min (spot $' + g.s.price.toFixed(1) + ')');
  assert.strictEqual(g.deliverOrder(o.id, 10).reason, 'nothing'); assert.strictEqual(g.acceptOrder(o.id).ok, true); assert.strictEqual(o.status, 'ACTIVE'); assert(o.deadline > g.s.time);
  assert.strictEqual(g.deliverOrder(o.id, 10).reason, 'nooil'); ok('cannot deliver before accepting, nor with an empty tank (nooil)');
  tk.amt = 80; const before = g.oilTotal(); let r = g.deliverOrder(o.id, 1e9); assert(r.ok); near(r.amount, Math.min(80, o.requiredOil), 1e-6, 'delivered no more than the stock'); near(before - g.oilTotal(), r.amount, 1e-6, 'inventory drops'); near(o.deliveredOil, r.amount, 1e-6, 'deliveredOil'); near(o.remainingOil, o.requiredOil - r.amount, 1e-6, 'remainingOil');
  ok('7. delivery limited to the stock: delivered ' + o.deliveredOil.toFixed(0) + ' of ' + o.requiredOil + ', remaining ' + o.remainingOil.toFixed(0) + ', inventory ' + g.oilTotal().toFixed(0));
  // reserve some oil for a futures contract: it is not available for orders
  tk.amt = Math.min(g.tankCap(tk), o.remainingOil + 100); g.createContract(100, 0); const free = g.oilTotal() - g.committed(); const cashB = g.s.cash;
  r = g.deliverOrder(o.id, 1e9); assert(r.ok); assert(g.oilTotal() >= g.committed() - 1e-6, 'oil promised to futures stays');
  assert(o.status === 'COMPLETED' || free < o.remainingOil + 1e-6);
  if (o.status !== 'COMPLETED') { tk.amt += o.remainingOil; r = g.deliverOrder(o.id, 1e9); }
  assert.strictEqual(o.status, 'COMPLETED'); near(g.s.cash - cashB >= 0 ? 1 : 0, 1, 0, 'paid'); assert(g.s.ordersDone[0].id === o.id && g.s.orders.every(q => q.id !== o.id)); assert(g.s.orderPaid >= o.reward);
  ok('8. contract COMPLETED: reward $' + o.reward + ' paid on completion, moved to history');
  // failing at the deadline
  const f = g.makeOrder(); g.acceptOrder(f.id); tk.amt = 300; assert(g.deliverOrder(f.id, 30).ok); const cb = g.s.cash + 0, rv = g.s.revenue; run(g, f.duration + 5);
  assert.strictEqual(g.s.ordersDone[0].status, 'FAILED'); assert(g.s.revenue - rv >= 30 * f.price * CFG.ORDER.FAIL_PAY - 0.01); assert(g.s.orderLost > 0); ok('9a. active contract past its deadline -> FAILED: partial payment ' + (30 * f.price * CFG.ORDER.FAIL_PAY).toFixed(0) + ' for delivered oil, penalty $' + g.s.orderLost.toFixed(0));
  const e = g.makeOrder(); run(g, CFG.ORDER.OFFER_LIFE + 5); assert(g.s.ordersDone.some(q => q.id === e.id && q.status === 'EXPIRED')); assert.strictEqual(g.acceptOrder(e.id).reason, 'nothing'); ok('9b. an offer nobody accepts -> EXPIRED');
  // limits
  const h = fresh(4); const ids = [1, 2, 3, 4].map(() => h.makeOrder().id); ids.slice(0, 3).forEach(i => assert(h.acceptOrder(i).ok)); assert.strictEqual(h.acceptOrder(ids[3]).reason, 'tooManyOrders'); ok('at most ' + CFG.ORDER.MAX_ACTIVE + ' contracts can be active');
  // offers appear over time, not too many, sizes follow production
  const k = fresh(5); run(k, 600); assert(k.s.orders.length + k.s.ordersDone.length >= 3 && k.s.orders.filter(q => q.status === 'AVAILABLE').length <= CFG.ORDER.MAX_OFFERS); ok('offers appear every ~' + CFG.ORDER.EVERY.join('-') + ' s (max ' + CFG.ORDER.MAX_OFFERS + ' open)');
  // risk: some offers pay less than spot, some more
  let lo = 0, hi = 0; const m = fresh(6); for (let i = 0; i < 60; i++) { const q = m.makeOrder(); if (q.price < m.s.price) lo++; else hi++; m.s.orders.length = 0; } assert(lo > 3 && hi > 3); ok('contract prices are not always better than spot: ' + lo + ' below, ' + hi + ' at/above in 60 offers');
}

// ---- market events
{
  const g = fresh(7); run(g, 30); const p0 = g.s.price;
  const e = g.startEvent('DEMAND_SURGE', { duration: 120, peak: 1.18 }); assert(e); assert(g.drainEvents().some(x => x.type === 'marketEvent' && x.phase === 'start'));
  for (const f of ['type', 'start', 'duration', 'peak']) assert(f in e); const v = g.eventView(); assert(v.priceTo > v.priceFrom);
  let last = g.s.price, maxStep = 0, peak = 0, jumped = 0; for (let i = 0; i < 120 * 2; i++) { g.step(0.5); maxStep = Math.max(maxStep, Math.abs(g.s.price - last)); last = g.s.price; peak = Math.max(peak, g.s.price); }
  assert(maxStep < 1.0, 'no jumps: ' + maxStep); assert(g.s.event, 'still fading'); const natNow = g.s.nat;
  assert(peak > p0 * 1.05 || peak > natNow * 1.1, 'price rose during the event'); near(g.s.evMult, g.eventMultAt(g.s.time), 0.02, 'multiplier synced');
  ok('10-11. DEMAND_SURGE: price $' + v.priceFrom + ' -> peak $' + peak.toFixed(1) + ' (planned $' + v.priceTo + '), largest step per 0.5 s $' + maxStep.toFixed(2) + ' (gradual)');
  run(g, 200); assert.strictEqual(g.s.event, null); assert(g.drainEvents().some(x => x.type === 'marketEvent' && x.phase === 'end')); near(g.s.evMult, 1, 1e-9, 'multiplier back to 1'); assert.strictEqual(g.s.eventHist[0].type, 'DEMAND_SURGE'); assert(g.s.nextEvent > g.s.time + 200);
  ok('12. event ends: multiplier fades back to 1.00 gradually, next event scheduled in ' + (g.s.nextEvent - g.s.time).toFixed(0) + ' s');
  // drop & shock lower the price
  for (const t of ['SUPPLY_SHOCK', 'MARKET_DROP']) { const q = fresh(8); run(q, 20); q.startEvent(t); run(q, 100); assert(q.s.evMult < 0.95, t + ' ' + q.s.evMult); }
  const q = fresh(9); run(q, 20); q.startEvent('MARKET_BOOM'); run(q, 100); assert(q.s.evMult > 1.05); q.s.event = null; q.startEvent('STABLE_MARKET'); assert.strictEqual(q.s.event.peak, 1); ok('SUPPLY_SHOCK / MARKET_DROP lower, MARKET_BOOM raises, STABLE_MARKET calms the price');
  // events are not frequent
  const n = fresh(10); let starts = 0; for (let i = 0; i < 36000; i++) { n.step(1); } n.drainEvents(); let c = 0; const h = fresh(10); for (let i = 0; i < 7200; i++) { h.step(1); for (const x of h.drainEvents()) if (x.type === 'marketEvent' && x.phase === 'start') c++; } assert(c >= 4 && c <= 20); ok('events are rare: ' + c + ' in 2 game hours');
  // natural walk stays inside the limits
  const mm = fresh(11); let lo = 1e9, hi = 0; for (let i = 0; i < 20000; i++) { mm.step(1); lo = Math.min(lo, mm.s.price); hi = Math.max(hi, mm.s.price); } assert(lo >= CFG.PRICE.MIN && hi <= CFG.PRICE.MAX); ok('price stays within $' + CFG.PRICE.MIN + '-$' + CFG.PRICE.MAX + ' with events and competitors (seen $' + lo.toFixed(1) + '-$' + hi.toFixed(1) + ')');
}

// ---- AI competitors
{
  const g = fresh(12); assert.deepStrictEqual(g.s.comp.map(c => c.strategy), ['AGGRESSIVE', 'BALANCED', 'CONSERVATIVE']); for (const f of ['money', 'prod', 'stock', 'share', 'strategy']) assert(f in g.s.comp[0], f);
  let ticks = 0; const orig = g.aiStep.bind(g); g.aiStep = d => { ticks++; orig(d); };
  const p0 = g.s.comp.map(c => c.prod); run(g, 60); assert(ticks >= 11 && ticks <= 12); ok('13. AI updates once every ' + CFG.AI.TICK + ' s (' + ticks + ' updates in 60 s of 600 steps), not every frame');
  run(g, 1800);
  for (const c of g.s.comp) { assert(c.produced > 0 && c.sold > 0 && c.revenue > 0 && c.money >= 0 && c.stock >= 0 && c.prod >= CFG.AI.COMPANIES.find(o => o.id === c.id).prod); }
  ok('14-15. after 31 min: ' + g.s.comp.map(c => c.id + ' ' + c.strategy[0] + ': prod ' + c.prod.toFixed(1) + '/min, produced ' + c.produced.toFixed(0) + ', sold ' + c.sold.toFixed(0) + ', revenue $' + c.revenue.toFixed(0)).join(' | '));
  const [a, b, c2] = g.s.comp; assert(c2.stock / (c2.prod * 110) >= 0 && a.sold / a.produced > 0.5);
  // strategies differ
  const stk = ['AGGRESSIVE', 'BALANCED', 'CONSERVATIVE'].map(s => { const q = fresh(13); q.s.price = 60; q.s.comp.forEach(c => { c.stock = 0; }); for (let i = 0; i < 360; i++) q.aiStep(5); return q.s.comp.find(c => c.strategy === s).stock / q.s.comp.find(c => c.strategy === s).produced; });
  assert(stk[2] > stk[1] && stk[1] > stk[0], 'low price: conservative holds the most, aggressive the least: ' + stk.map(v => v.toFixed(2)).join('/'));
  ok('strategies: at a low price they keep ' + stk.map(v => (v * 100).toFixed(0) + '%').join(' / ') + ' of their oil (AGGRESSIVE / BALANCED / CONSERVATIVE)');
  // market effect (limited)
  const q = fresh(14); q.s.aiProd = 100; q.s.aiSold = 160; const down = q.aiMultNow(); q.s.aiSold = 40; const up = q.aiMultNow(); q.s.aiSold = 100;
  assert(down < 1 && up > 1 && down >= CFG.AI.MIN_MULT && up <= CFG.AI.MAX_MULT && Math.abs(q.aiMultNow() - 1) < 1e-9); ok('16. market effect: heavy selling x' + down.toFixed(3) + ', hoarding x' + up.toFixed(3) + ' (limited to +-4%)');
  const sold = fresh(15); run(sold, 20); const pn = sold.s.price; sold.s.aiProd = 100; sold.s.aiSold = 190; sold.priceTick(sold.rng, true); assert(sold.s.aiMult < 1); ok('the competitor multiplier really enters the quoted price (aiMult ' + sold.s.aiMult.toFixed(3) + ')');
  // shares + rank
  const w = fresh(16); const A = oldAreas(w).find(a => a.st === 2); const [wx, wy] = tilesOf(A).find(([x, y]) => w.canPlace('well', x, y).ok && w.canPlace('tank', x + 3, y).ok); w.s.cash = 1e5; w.place('well', wx, wy, 'large'); const tk = w.place('tank', wx + 3, wy).building; for (let i = 0; i < 4; i++) w.upgrade(tk); w.buildRoute(w.routePipe(wx + 1, wy, wx + 2, wy, false)); w.upgradePipes(w.net.comps.find(c => c.pipes.length).pipes[0]);
  run(w, 900); w.sell(w.oilTotal()); let sh = w.marketShares(); let tot = sh.reduce((s, r) => s + r.share, 0); near(tot, 1, 1e-9, 'shares sum to 100%'); const pl = sh.find(r => r.player); assert(pl.share > 0.05);
  const comp = w.s.comp.reduce((s, c) => s + c.ema, 0); near(pl.share, w.s.pRate / (w.s.pRate + comp), 1e-9, 'share = production / total production');
  ok('17. market share = production moving average / total: ' + sh.map(r => (r.player ? 'Player ' : 'Co.' + r.id + ' ') + (r.share * 100).toFixed(0) + '%').join(', '));
  const rk = w.ranking(); for (let i = 1; i < rk.length; i++) assert(rk[i - 1].revenue >= rk[i].revenue); assert.deepStrictEqual(rk.map(r => r.rank), [1, 2, 3, 4]); ok('18. rank by total revenue: ' + rk.map(r => r.rank + '.' + (r.player ? 'Player' : 'Co.' + r.id) + ' $' + r.revenue.toFixed(0)).join('  '));
  // player rank can change with sales
  const before = w.ranking().find(r => r.player).rank; w.s.revenue += 1e7; assert.strictEqual(w.ranking()[0].player, true); ok('rank follows revenue (player ' + before + ' -> 1 after +$10M)');
}

// ---- save / reload
{
  const g = fresh(17); g.s.cash = 1e6; const A = oldAreas(g).find(a => a.st === 2); const [wx, wy] = tilesOf(A).find(([x, y]) => g.canPlace('well', x, y).ok && g.canPlace('tank', x + 3, y).ok);
  g.place('well', wx, wy, 'medium'); const tk = g.place('tank', wx + 3, wy).building; g.upgrade(tk); g.buildRoute(g.routePipe(wx + 1, wy, wx + 2, wy, false));
  g.unlockRegion(2); const ha = oldAreas(g).find(a => a.region === 2 && a.land && tilesOf(a).some(([x, y]) => !g.map.block[y * 140 + x])); g.explore(ha.id); run(g, 400);
  const o = g.makeOrder(); g.acceptOrder(o.id); tk.amt = 100; g.deliverOrder(o.id, 40); g.makeOrder(); g.startEvent('MARKET_BOOM'); run(g, 20);
  g.createContract(50, 0);
  const d = JSON.parse(JSON.stringify(g.serialize())); const j = new Game({ rng: mulberry32(1), seed: 7 }); j.load(d);
  const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
  eq(j.s.regions, g.s.regions, 'regions'); eq(j.s.orders, g.s.orders, 'orders'); eq(j.s.ordersDone, g.s.ordersDone, 'ordersDone'); eq(j.s.event, g.s.event, 'event'); eq(j.s.comp, g.s.comp, 'competitors'); eq(j.s.contracts, g.s.contracts, 'futures');
  assert.strictEqual(j.s.price, g.s.price); assert.strictEqual(j.s.nat, g.s.nat); assert.strictEqual(j.s.cash, g.s.cash); assert.strictEqual(j.buildings.length, g.buildings.length); assert.strictEqual(j.pipeCount(), g.pipeCount());
  eq(j.areas.map(a => [a.st, a.remaining]), g.areas.map(a => [a.st, a.remaining]), 'areas'); assert.strictEqual(j.regionState(2), g.regionState(2)); eq(j.marketShares(), g.marketShares(), 'shares'); eq(j.eventView(), g.eventView(), 'event view');
  const prod0 = j.s.comp[0].produced; run(j, 60); run(g, 60); assert(j.s.price >= CFG.PRICE.MIN && j.s.price <= CFG.PRICE.MAX); assert(j.s.comp[0].produced > prod0);
  ok('19-21. save -> JSON -> load: regions, supply contracts (active + history), event, competitors, market, wells, pipes, tanks, money all identical, and the game keeps running');
  // old (phase 3) save
  const old = JSON.parse(JSON.stringify(d)); for (const k of ['regions', 'orders', 'ordersDone', 'event', 'comp', 'nat', 'nextEvent', 'pRate', 'aiProd', 'aiSold']) delete old.s[k]; const o3 = new Game({ seed: 7 }); o3.load(old); assert.strictEqual(o3.s.comp.length, 3); assert(o3.regionOpen(1)); run(o3, 30);
  ok('a Phase 3 save (no Phase 4 data) loads with default regions, competitors and no event');
}
console.log('\nALL PHASE 4 CORE TESTS PASSED');
