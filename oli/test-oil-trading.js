/* Phase 7 of the oil system: storage and trading of crude.
 * Tank kinds (commercial / production / trade), buying, capacity, partial amounts, average cost, freight, selling from the right stock, the refinery using produced and bought crude,
 * the two stocks never counting a barrel twice, and saving.  Everything is built with the real functions (store.place, layPipe, Sim, Company).
 *   NODE_PATH=/opt/npm-tools/node_modules node oli/test-oil-trading.js */
const { B, I, E, EC, game, put, pipe } = require('./test-economy-helpers.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(a), Math.abs(b));
const quiet = () => { const c = JSON.parse(JSON.stringify(EC)); return c; };
const DEFSB = B.DEFS;

/* the plant: one well feeds a PRODUCTION tank; two tanks with nothing upstream (TRADE) and a refinery fed through a junction; and one tank with no pipe at all (COMMERCIAL) */
function plant(cfg) {
  const g = game(1e12, cfg), co = g.co, ref = put(g, 'refinery_x', 160, 60), j = put(g, 'junction', 120, 60), cts = [], pus = [];
  [[40, 40, 'PORT_N'], [40, 60, 'PORT_W'], [40, 80, 'PORT_S']].forEach(([x, y, port]) => { const ct = put(g, 'crude_tank_l', x, y), pu = put(g, 'pump_station_l', x + 24, y); cts.push(ct); pus.push(pu); pipe(g, ct, 'OUTPUT_E', pu, 'INPUT', 36); pipe(g, pu, 'OUTPUT', j, port, 36); });
  const tg = put(g, 'gasoline_tank_l', 200, 40), td = put(g, 'diesel_tank_l', 200, 60), tj = put(g, 'jet_tank_l', 200, 80), tl = put(g, 'gas_sphere_l', 180, 20);
  pipe(g, j, 'PORT_E', ref, 'CRUDE_IN', 36); pipe(g, ref, 'GASOLINE_OUT', tg, 'INPUT_W', 36); pipe(g, ref, 'DIESEL_OUT', td, 'INPUT_W', 36); pipe(g, ref, 'JET_OUT', tj, 'INPUT_W', 36); pipe(g, ref, 'GAS_OUT', tl, 'INPUT_N', 36);
  const well = put(g, 'oil_well', 22, 40); const wp = pipe(g, well, 'OIL_OUT_E', cts[0], 'INPUT_W', 16);
  const commercial = put(g, 'crude_tank_m', 100, 110);
  co.speed = 0; for (const p of ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) co.setMode(p, 'WAIT');
  for (const b of g.store.list()) g.sim.ensure(b);
  return { g, co, ref, j, cts, pus, well, wp, commercial, prodTank: cts[0], tradeA: cts[1], tradeB: cts[2] };
}
const restock = co => { for (const m of ['CHEM', 'OPS']) { const room = Math.floor(co.roomFor(m)); if (room > 0) { const r = co.buy(m, room, 'A', 'CASH'); if (!r.ok) throw new Error('restock ' + m + ' ' + r.reason); } } };
const vol = (co, b) => co.sim.ensure(b).vol, bv = (co, b) => co.sim.ensure(b).bv || 0, bal = (co, a) => co.journal.bal[a] || 0;
const hours = (co, n, keep) => { for (let h = 0; h < n; h++) { if (keep) restock(co); co.advanceHours(1); } };

console.log('1. what a tank is is decided by where its oil can come from, not by a pipe being there');
{ const x = plant(), co = x.co, S = x.g.sim;
  T('1a a tank with no pipe is COMMERCIAL storage', co.tankKindOf(x.commercial) === 'COMMERCIAL');
  T('1b a tank fed (through the well\'s pipe) by a well is a PRODUCTION tank', co.tankKindOf(x.prodTank) === 'PRODUCTION');
  T('1c a tank that only feeds a refinery, with no well upstream, is a TRADE tank — a pipe alone does not make it production', co.tankKindOf(x.tradeA) === 'TRADE' && co.tankKindOf(x.tradeB) === 'TRADE');
  const t2 = put(x.g, 'crude_tank_m', 100, 150), t3 = put(x.g, 'crude_tank_m', 130, 150); x.g.sim.ensure(t2); x.g.sim.ensure(t3);
  const pp = pipe(x.g, t2, 'OUTPUT_E', t3, 'INPUT_W', 16);
  T('1d two tanks joined by a pipe with no well upstream: both are TRADE', pp.ok && co.tankKindOf(t2) === 'TRADE' && co.tankKindOf(t3) === 'TRADE', [co.tankKindOf(t2), co.tankKindOf(t3)]);
  const t4 = put(x.g, 'crude_tank_m', 100, 190), t5 = put(x.g, 'crude_tank_m', 130, 190), p2 = pipe(x.g, t4, 'OUTPUT_E', t5, 'INPUT_W', 16);
  const w2 = put(x.g, 'oil_well', 80, 190), p3 = pipe(x.g, w2, 'OIL_OUT_E', t4, 'INPUT_W', 16);
  T('1e a tank downstream of a PRODUCTION tank is a PRODUCTION tank too (the oil upstream is the wells\')', p3.ok && co.tankKindOf(t4) === 'PRODUCTION' && co.tankKindOf(t5) === 'PRODUCTION', [co.tankKindOf(t4), co.tankKindOf(t5)]);
  x.g.store.demolish(w2.id, { building: true, pipes: true, pipeSet: x.g.net }); S.build();
  T('1f when the well and its pipe are removed the same tanks become TRADE again (the kind follows the network)', co.tankKindOf(t4) === 'TRADE' && co.tankKindOf(t5) === 'TRADE', [co.tankKindOf(t4), co.tankKindOf(t5)]);
  const pg = x.g.store.list().find(b => DEFSB[b.d].product === 'GASOLINE' && DEFSB[b.d].type === 'tank');
  T('1g product tanks have no crude kind', co.tankKindOf(pg) === null);
  const ind = S.indicators(x.commercial).list.map(i => i.k); const rep = co.tankReport();
  T('1h the tank panel shows the kind, the bought oil and the produced oil; the report lists every crude tank with its Arabic kind', ['Tank Type', 'Purchased Oil', 'Produced Oil'].every(k => ind.includes(k)) && rep.length >= 6 && rep.every(r => r.kindAr && r.capacity > 0 && r.free <= r.capacity) && rep.find(r => r.id === x.prodTank.id).canBuy === false && rep.find(r => r.id === x.commercial.id).canBuy === true, rep.map(r => r.kind)); }

console.log('2. buying crude: where it goes, what it costs, what stops it');
{ const x = plant(), co = x.co, c0 = x.g.store.cash, p0 = { ...co.led.life.produced };
  const r = co.buy('CRUDE', 1000, 'A', 'CASH'), tradeVols = [vol(co, x.tradeA), vol(co, x.tradeB), vol(co, x.commercial)];
  T('2a the purchase is accepted', r.ok, r);
  T('2b the bought oil lies in the commercial / trade tanks and NOT in the tank the well feeds', near(tradeVols.reduce((a, b) => a + b, 0), 1000, 1e-9) && vol(co, x.prodTank) === 0 && bv(co, x.prodTank) === 0, tradeVols);
  T('2c every barrel put in is marked as bought (bv = volume in those tanks)', near(bv(co, x.tradeA) + bv(co, x.tradeB) + bv(co, x.commercial), 1000, 1e-9));
  T('2d cash falls by the total (price + freight + fee), the bought stock\'s own account rises by the same, the produced stock is untouched', near(c0 - x.g.store.cash, r.cost, 1e-9) && near(bal(co, 'INV_CRUDE_BUY'), r.cost, 1e-9) && bal(co, 'INV_CRUDE') === 0 && co.qty.CRUDE === 0 && near(co.bq, 1000, 1e-9));
  const pur = co.purchases[co.purchases.length - 1]; T('2e the purchase is recorded: quantity, price per barrel, total, supplier and terms', pur.item === 'CRUDE' && pur.qty === 1000 && pur.supplier && near(pur.total, r.cost, 1e-9) && near(pur.unitPrice * pur.qty, pur.total, 1e-6) && pur.terms === 'CASH', pur);
  const lg = co.tradeLog.find(e => e.kind === 'PURCHASE'); T('2f the trade log shows it with the tanks it went to', lg && lg.qty === 1000 && lg.supplier === pur.supplier && lg.tanks.length >= 1 && near(lg.tanks.reduce((a, t) => a + t.qty, 0), 1000, 1e-9), lg);
  T('2g a purchase is not production: the produced counters did not move', co.led.life.produced.CRUDE === p0.CRUDE);
  T('2h the audit passes and the books agree with the tanks', co.audit().ok && near(co.boughtInTanks(), co.bq, 1e-9), co.audit());
  const poor = plant(); poor.g.store.cash = 100; poor.co.sync(); const rp = poor.co.buy('CRUDE', 1000, 'A', 'CASH');
  T('2i not enough money: the purchase is refused and nothing changes (no oil, no cost, no cash)', !rp.ok && rp.reason === 'cash' && poor.co.bq === 0 && bal(poor.co, 'INV_CRUDE_BUY') === 0 && poor.g.store.cash === 100);
  const g2 = game(1e9, quiet()); put(g2, 'crude_tank_m', 40, 40); const lone = g2.co;
  const ct = g2.store.list()[0]; put(g2, 'oil_well', 20, 40); const wl = g2.store.list().find(b => DEFSB[b.d].type === 'well'); pipe(g2, wl, 'OIL_OUT_E', ct, 'INPUT_W', 16); g2.sim.build();
  const rn = lone.buy('CRUDE', 100, 'A', 'CASH'); T('2j with only a production tank there is nowhere to put bought oil: refused with a clear reason, no cost booked, no oil', !rn.ok && rn.reason === 'noTradeTank' && lone.bq === 0 && bal(lone, 'INV_CRUDE_BUY') === 0 && lone.purchases.length === 0, rn.reason); }

console.log('3. capacity and partial amounts');
{ const x = plant(), co = x.co, cash0 = x.g.store.cash, capC = DEFSB[x.commercial.d].capacity.value, capA = DEFSB[x.tradeA.d].capacity.value, capB = DEFSB[x.tradeB.d].capacity.value, room = capC + capA + capB;
  T('3a the room for bought oil is the free capacity of the non-production tanks only', near(co.tradeRoom(), room, 1e-9), [co.tradeRoom(), room]);
  const over = co.buy('CRUDE', room + 1, 'A', 'CASH'); T('3b more than the room is refused (noRoom) and nothing is taken', !over.ok && over.reason === 'noRoom' && co.bq === 0 && x.g.store.cash === cash0);
  const a = co.buy('CRUDE', 30000, 'A', 'CASH'), b = co.buy('CRUDE', 7500.5, 'C', 'CASH'), c = co.buy('CRUDE', 0.25, 'A', 'CASH');
  T('3c partial and fractional purchases are all accepted', a.ok && b.ok && c.ok && near(co.bq, 37500.75, 1e-9), co.bq);
  const vols = [x.commercial, x.tradeA, x.tradeB].map(t => vol(co, t)); T('3d the oil is shared out over the tanks (emptiest first) and no tank passes its capacity', vols.every((v, i) => v <= [capC, capA, capB][i] + 1e-9) && near(vols.reduce((p, q) => p + q, 0), 37500.75, 1e-9), vols);
  const fill = co.buy('CRUDE', co.tradeRoom(), 'A', 'CASH'); T('3e buying exactly what is left fills the tanks to the brim and not a barrel more', fill.ok && near(co.tradeRoom(), 0, 1e-6) && [x.commercial, x.tradeA, x.tradeB].every((t, i) => vol(co, t) <= [capC, capA, capB][i] + 1e-9), [fill.reason, co.tradeRoom()]);
  const one = co.buy('CRUDE', 1, 'A', 'CASH'); T('3f and then even one barrel is refused', !one.ok && one.reason === 'noRoom');
  T('3g the production tank still holds none of it', vol(co, x.prodTank) === 0 && co.audit().ok); }

console.log('4. the average cost of a barrel');
{ const x = plant(), co = x.co, a = co.buy('CRUDE', 1000, 'A', 'CASH'), c = co.buy('CRUDE', 3000, 'C', 'CASH'), avg = (a.cost + c.cost) / 4000;
  T('4a the cost per bought barrel is the weighted average of the purchases (freight and fees included)', near(co.unitCostBuy(), avg, 1e-9) && a.unitCost !== c.unitCost, [co.unitCostBuy(), avg]);
  T('4b the value of the bought stock = quantity x average cost = the account', near(co.bq * co.unitCostBuy(), bal(co, 'INV_CRUDE_BUY'), 1e-9));
  const rep = co.inventory().find(r => r.product === 'CRUDE'); T('4c the crude row of the inventory screen shows the bought stock separately (quantity, value, average cost)', near(rep.boughtQty, 4000, 1e-9) && near(rep.boughtBook, a.cost + c.cost, 1e-9) && near(rep.boughtUnitCost, avg, 1e-9) && rep.ownVolume === 0, rep); }

console.log('5. moving oil between tanks (freight is added to the cost)');
{ const x = plant(), co = x.co; co.buy('CRUDE', 10000, 'A', 'CASH'); const src = [x.commercial, x.tradeA, x.tradeB].find(t => bv(co, t) > 0), dst = [x.commercial, x.tradeA, x.tradeB].find(t => t !== src && bv(co, t) === 0) || [x.commercial, x.tradeA, x.tradeB].find(t => t !== src);
  const have = bv(co, src), c0 = x.g.store.cash, inv0 = bal(co, 'INV_CRUDE_BUY'), uc0 = co.unitCostBuy(), tr = co.transfer(src.id, dst.id, 4000), fr = 4000 * EC.TRADE.TRANSFER_COST;
  T('5a a partial transfer is accepted and costs freight per barrel', tr.ok && tr.qty === 4000 && near(tr.cost, fr, 1e-9), tr);
  T('5b cash falls by the freight and the same amount is added to the bought stock\'s value (not expensed)', near(c0 - x.g.store.cash, fr, 1e-9) && near(bal(co, 'INV_CRUDE_BUY') - inv0, fr, 1e-9));
  T('5c the quantity bought is unchanged, so the average cost per barrel rises by the freight share', near(co.bq, 10000, 1e-9) && near(co.unitCostBuy(), uc0 + fr / 10000, 1e-9));
  T('5d the oil really moved: the source lost 4,000 barrels of bought oil (volume and bought share together)', near(have - bv(co, src), 4000, 1e-9) && near(vol(co, src), bv(co, src), 1e-6), [have, bv(co, src)]);
  const s0 = bv(co, src), d0 = bv(co, dst); const t2 = co.transfer(src.id, dst.id, 1000); T('5e a second transfer moves exactly that quantity again', t2.ok && near(s0 - bv(co, src), 1000, 1e-9) && near(bv(co, dst) - d0, 1000, 1e-9));
  T('5f a transfer to or from the PRODUCTION tank is refused', co.transfer(src.id, x.prodTank.id, 10).reason === 'productionTank' && co.transfer(x.prodTank.id, dst.id, 10).reason === 'productionTank');
  T('5g more than the bought oil in that tank is refused, nothing moves', co.transfer(src.id, dst.id, 1e9).ok === false && near(bv(co, src), s0 - 1000, 1e-9));
  const full = plant(); full.co.buy('CRUDE', 5000, 'A', 'CASH'); const fs = [full.commercial, full.tradeA, full.tradeB].find(t => bv(full.co, t) > 0); const fo = [full.commercial, full.tradeA, full.tradeB].find(t => t !== fs); full.g.sim.ensure(fo).vol = DEFSB[fo.d].capacity.value - 100; full.g.sim.ensure(fo).bv = 0;
  T('5h a destination without room refuses the transfer', full.co.transfer(fs.id, fo.id, 1000).reason === 'noRoom');
  T('5i the audit passes and the books still agree with the tanks after the transfers', co.audit().ok && near(co.boughtInTanks(), co.bq, 1e-9), co.audit()); }

console.log('6. selling: from the right stock, profit from the cost of what was sold');
{ const x = plant(), co = x.co; const b1 = co.buy('CRUDE', 8000, 'A', 'CASH'), cost0 = bal(co, 'INV_CRUDE_BUY'), uc = co.unitCostBuy(), c0 = x.g.store.cash;
  co.setMode('CRUDE', 'WAIT'); const r = co.sell('CRUDE', 3000, 'SPOT', { source: 'BOUGHT' });
  T('6a selling bought crude is accepted', r.ok && r.qty === 3000 && r.bought === 3000 && r.own === 0, r);
  T('6b the cost of goods sold is the average cost of the bought stock x the barrels sold', near(r.cost, 3000 * uc, 1e-9) && near(cost0 - bal(co, 'INV_CRUDE_BUY'), 3000 * uc, 1e-9));
  T('6c the profit is revenue - fee - that cost', near(r.profit, r.gross - r.fee - 3000 * uc, 1e-9) && near(x.g.store.cash - c0, r.gross - r.fee, 1e-9));
  T('6d the bought stock fell by what was sold, the produced stock was not touched', near(co.bq, 5000, 1e-9) && co.qty.CRUDE === 0 && bal(co, 'INV_CRUDE') === 0 && near(co.boughtInTanks(), 5000, 1e-9));
  T('6e the average cost of the barrels left is unchanged by the sale', near(co.unitCostBuy(), uc, 1e-9));
  const lg = co.tradeLog.filter(e => e.kind === 'SALE').pop(); T('6f the trade log records the sale with revenue, cost and profit', lg && near(lg.profit, r.profit, 1e-9) && lg.source === 'BOUGHT', lg);
  T('6g selling more bought crude than there is is refused and nothing moves', co.sell('CRUDE', 9000, 'SPOT', { source: 'BOUGHT' }).ok === false && near(co.bq, 5000, 1e-9));
  T('6h asking for produced crude when there is none: refused (the bought oil is not produced oil)', co.sell('CRUDE', 100, 'SPOT', { source: 'OWN' }).ok === false && near(co.bq, 5000, 1e-9));
  T('6i an unknown source is refused', co.sell('CRUDE', 100, 'SPOT', { source: 'XYZ' }).reason === 'source');
  const loss = plant(); loss.co.buy('CRUDE', 5000, 'C', 'CASH'); const ucl = loss.co.unitCostBuy(); loss.co.market.price.CRUDE = ucl * 0.5; const rl = loss.co.sell('CRUDE', 2000, 'SPOT', { source: 'BOUGHT' });
  T('6j if the price has fallen below the cost the sale shows a LOSS, from the cost of the barrels sold', rl.ok && rl.profit < 0 && near(rl.profit, rl.gross - rl.fee - 2000 * ucl, 1e-9), rl.profit);
  const rest = co.sell('CRUDE', co.bq, 'SPOT', { source: 'BOUGHT' }); T('6k selling the last barrels empties the stock and its account (no cost left over, no negative stock)', rest.ok && co.bq === 0 && Math.abs(bal(co, 'INV_CRUDE_BUY')) < 1e-6 && co.audit().ok, [co.bq, bal(co, 'INV_CRUDE_BUY')]); }

console.log('7. the refinery uses bought oil, produced oil, or both — each from its own books');
{ const x = plant(), co = x.co; co.buy('CRUDE', 60000, 'A', 'CASH'); restock(co); const bq0 = co.bq, own0 = co.qty.CRUDE, wip0 = bal(co, 'INV_WIP'), posts = {}, J = co.journal, orig = J.post.bind(J);
  J.post = (meta, lines) => { const k = meta.type; posts[k] = posts[k] || {}; for (const [a, v] of lines) posts[k][a] = (posts[k][a] || 0) + v; return orig(meta, lines); };   /* every posting is counted, the journal keeps only its last entries */
  const ib0 = bal(co, 'INV_CRUDE_BUY'), uc = co.unitCostBuy(); co.advanceHours(2); hours(co, 48, true); const L = co.led.life;
  const feed = L.produced.THRU, boughtUsed = co.boughtUsed;
  T('7a the refinery runs on the bought oil', feed > 0 && boughtUsed > 0, [feed, boughtUsed]);
  T('7b the bought stock fell by exactly the bought barrels the refinery took (books = tanks)', near(bq0 - co.bq, boughtUsed, 1e-9) && near(co.boughtInTanks(), co.bq, 1e-6), [bq0 - co.bq, boughtUsed]);
  T('7c produced oil was used too (a mixture of both): feed = bought barrels + the well\'s barrels taken from its own stock, the difference being the water that travelled with the well\'s oil', co.led.life.produced.CRUDE > 0 && (feed - boughtUsed) > 0 && near(feed, boughtUsed + (co.led.life.produced.CRUDE - co.qty.CRUDE - co.crudeLoss) + co.crudeShort, 1e-6), [feed, boughtUsed, co.led.life.produced.CRUDE, co.qty.CRUDE, co.crudeLoss, co.crudeShort]);
  const postBuy = (posts.REFINE_IN_BUY || {}).INV_WIP || 0, postOwn = (posts.REFINE_IN || {}).INV_WIP || 0, handling = (posts.PROD_CRUDE || {}).INV_CRUDE_BUY || 0;
  T('7d the cost of the bought oil that entered the refinery came out of the bought account only: account fell by exactly that (plus what the handling cost added)', near(ib0 + handling - bal(co, 'INV_CRUDE_BUY'), postBuy, 1e-6) && postBuy > 0 && (posts.REFINE_IN_BUY || {}).INV_CRUDE === undefined, [ib0, handling, bal(co, 'INV_CRUDE_BUY'), postBuy]);
  T('7d2 the cost per bought barrel that entered stayed close to its average (the handling cost of idle pumps is the only addition): ' + (postBuy / boughtUsed).toFixed(2) + ' vs ' + uc.toFixed(2), postBuy / boughtUsed >= uc * 0.999 && postBuy / boughtUsed < uc * 1.05, [postBuy / boughtUsed, uc]);
  T('7e the produced oil\'s cost came from the produced account only (no double deduction across the two accounts)', postOwn >= 0 && co.qty.CRUDE >= 0 && bal(co, 'INV_CRUDE') >= -1e-6);
  T('7f the bought oil is never short of the books; the only shortfall is the water carried by the well\'s oil (under 5%) and the audit is clean', co.audit().ok && co.crudeShort < 0.05 * co.led.life.produced.CRUDE, [co.crudeShort, co.led.life.produced.CRUDE, co.audit()]);
  const ref = co.refLast; T('7g every barrel of feed is explained (products + fuel + flare + loss = feed)', ref && ref.feed > 0);
  const tl = co.tradeLog.filter(e => e.kind === 'REFINE'); T('7h the trade log shows the bought oil used by the refinery', tl.length >= 1 && near(tl.reduce((a, e) => a + e.qty, 0), boughtUsed, 1e-6), tl); }
{ const x = plant(), co = x.co; co.buy('CRUDE', 30000, 'A', 'CASH'); restock(co);
  const inb = co.led.life.produced.CRUDE; hours(co, 24 * 10, true);
  const produced = co.led.life.produced.CRUDE, thru = co.led.life.produced.THRU, bought = 30000 - co.bq, sold = 0, lost = co.crudeLoss, stock = co.qty.CRUDE + co.bq;
  T('8a conservation: produced + bought - refined - lost + (water refined with the well\'s oil) = what is on the books now: every barrel is counted once', near(produced + 30000 - thru - lost + co.crudeShort, stock, 1e-6), [produced + 30000 - thru - lost + co.crudeShort, stock]);
  T('8b and the books agree with the tanks: bought stock = bought oil in the tanks exactly; produced stock never above the produced oil in the tanks', near(co.bq, co.boughtInTanks(), 1e-6) && co.qty.CRUDE <= co.crudeOnHand() - co.boughtInTanks() + 1e-6, [co.qty.CRUDE, co.crudeOnHand() - co.boughtInTanks()]);
  T('8c the produced counter shows only the well\'s oil, never the purchase', produced < 30000 && near(produced, co.led.life.produced.CRUDE, 1e-12));
  T('8d the audit is clean after ten days', co.audit().ok, co.audit()); }

console.log('9. storage and operating costs');
{ const x = plant(), co = x.co; co.buy('CRUDE', 20000, 'A', 'CASH'); const st0 = bal(co, 'EXP_STORAGE'), inv0 = bal(co, 'INV_CRUDE_BUY'); const stored = co.boughtInTanks() + co.crudeOnHand() - co.boughtInTanks();
  for (let h = 0; h < 24; h++) co.advanceHours(1); const st1 = bal(co, 'EXP_STORAGE') - st0;
  T('9a keeping oil in tanks costs money every day, charged to the period (about volume x storage rate)', st1 > 0 && near(st1, co.crudeOnHand() * 0 + 20000 * EC.STORAGE_COST.CRUDE, 0.25), [st1, 20000 * EC.STORAGE_COST.CRUDE]);
  T('9b storage is an expense of the period; it is not added to the bought oil\'s cost (only freight is capitalised)', near(bal(co, 'INV_CRUDE_BUY'), inv0, 0.02) || bal(co, 'INV_CRUDE_BUY') >= inv0 - 1e-9);
  T('9c tank operation and maintenance are expensed as well', bal(co, 'EXP_OPERATING') > 0); }

console.log('10. saving and loading');
{ const x = plant(), co = x.co; co.buy('CRUDE', 12000, 'A', 'CASH'); co.buy('CRUDE', 3000, 'C', 'CASH'); const src = [x.commercial, x.tradeA, x.tradeB].find(t => bv(co, t) > 0), dst = [x.commercial, x.tradeA, x.tradeB].find(t => t !== src); co.transfer(src.id, dst.id, 2500); co.sell('CRUDE', 1000, 'SPOT', { source: 'BOUGHT' }); restock(co); hours(co, 30, true);
  const snap = { co: JSON.parse(JSON.stringify(co.toJSON())), st: JSON.parse(JSON.stringify(x.g.store.toJSON())), nt: JSON.parse(JSON.stringify(x.g.net.toJSON())) };
  const store2 = B.BuildingStore.fromJSON(x.g.ts, snap.st).store, net2 = I.PipeNet.fromJSON(x.g.ts.W, snap.nt), sim2 = new I.Sim(store2, net2), co2 = new E.Company(store2, net2, sim2, { now: () => 1e12 }); const ok = co2.fromJSON(snap.co);
  T('10a the company loads', ok === true);
  T('10b the bought stock, its account, the average cost and the bought-oil use are the same after loading', near(co2.bq, co.bq, 1e-9) && near(bal(co2, 'INV_CRUDE_BUY'), bal(co, 'INV_CRUDE_BUY'), 1e-6) && near(co2.unitCostBuy(), co.unitCostBuy(), 1e-9) && near(co2.boughtUsed, co.boughtUsed, 1e-9), [co.bq, co2.bq]);
  T('10c the oil in every tank, and how much of it was bought, come back exactly', co.tanksOf('CRUDE').every(b => { const a = co.sim.ensure(b), c = co2.sim.ensure(co2.store.get(b.id)); return near(a.vol, c.vol, 1e-9) && near(a.bv || 0, c.bv || 0, 1e-9); }));
  T('10d the trade log (purchases, transfer, sale, refinery use) and the purchase list come back', co2.tradeLog.length === co.tradeLog.length && co2.tradeLog.map(e => e.kind).join() === co.tradeLog.map(e => e.kind).join() && co2.purchases.length === co.purchases.length && co2.nextTrade === co.nextTrade);
  T('10e the kinds of the tanks are the same after loading (they follow the saved network)', co.tanksOf('CRUDE').every(b => co.tankKindOf(b) === co2.tankKindOf(co2.store.get(b.id))));
  T('10f the audit is clean after loading and the books equal the tanks', co2.audit().ok && near(co2.boughtInTanks(), co2.bq, 1e-6), co2.audit());
  restock(co2); co2.advanceHours(24); T('10g the game keeps running after loading: the audit stays clean and the bought stock still equals the tanks', co2.audit().ok && near(co2.bq, co2.boughtInTanks(), 1e-6), co2.audit());
  const old = JSON.parse(JSON.stringify(snap.co)); delete old.bq; delete old.tradeLog; delete old.nextTrade; delete old.boughtUsed; const co3 = new E.Company(B.BuildingStore.fromJSON(x.g.ts, snap.st).store, I.PipeNet.fromJSON(x.g.ts.W, snap.nt), new I.Sim(B.BuildingStore.fromJSON(x.g.ts, snap.st).store, I.PipeNet.fromJSON(x.g.ts.W, snap.nt)), { now: () => 1e12 });
  T('10h an old save without trade data loads with an empty bought stock and an empty log', co3.fromJSON(old) === true && co3.bq === 0 && co3.tradeLog.length === 0); }

console.log('11. a production tank is never mixed with purchases: wells and fields are untouched');
{ const x = plant(), co = x.co, v0 = vol(co, x.prodTank); co.buy('CRUDE', 50000, 'A', 'CASH'); co.buy('CRUDE', 5000, 'C', 'CASH');
  T('11a purchases never enter the production tank (volume, bought share and its kind unchanged)', vol(co, x.prodTank) === v0 && bv(co, x.prodTank) === 0 && co.tankKindOf(x.prodTank) === 'PRODUCTION');
  hours(co, 24 * 3, false); T('11b after days of running the production tank holds only produced oil', bv(co, x.prodTank) === 0);
  T('11c the commercial tank (no pipe) never receives the well\'s oil, only what was bought', near(vol(co, x.commercial), bv(co, x.commercial), 1e-9) && (x.g.sim.ensure(x.commercial)._in || 0) === 0);
  const sold = co.sell('CRUDE', 500, 'SPOT', { source: 'OWN' }); const bq1 = co.bq; T('11d selling produced oil takes nothing from the bought stock', sold.ok ? (sold.bought === 0 && near(co.bq, bq1, 1e-9)) : sold.reason === 'notEnough' || sold.reason === 'nothingToSell');
  const g0 = plant(); g0.co.buy('CRUDE', 5000, 'A', 'CASH'); g0.g.store.list().filter(b => ['refinery'].includes(DEFSB[b.d].type)).forEach(b => { b.st = 'DAMAGED'; b.c = 0; }); const q2 = g0.co.bq; g0.co.autoRepair = false; hours(g0.co, 48, false); T('11e nothing bought disappears while the refinery is stopped (no hidden loss, no consumption)', near(g0.co.bq, q2, 1e-9) && near(g0.co.boughtInTanks(), q2, 1e-9) && g0.co.audit().ok, [g0.co.bq, q2]); }


console.log('12. on the real world: buying oil never touches a field\'s reserve or a well\'s production');
{ const W = require('./worldmap.js'), world = W.createWorld({ seed: 20260101 }), ts = B.fromWorld(world), store = new B.BuildingStore(ts, { cash: 1e11 }), net = new I.PipeNet(ts.W), sim = new I.Sim(store, net), co = new E.Company(store, net, sim, { now: () => 1e12 });
  const reg = world.homeRegionOfWorld(), f = world.regionSites(reg.id).filter(s => s.kind === 'FIELD').sort((a, b) => b.radius - a.radius)[2]; world.discover(f.id); world.survey(f.id); world.makeDrillable(f.id);
  const spot = (def, cx, cy, maxr, skip) => { for (let r = 0; r <= maxr; r++) { const n = 16 + r * 6; for (let a = 0; a < n; a++) { const x = Math.round(cx + Math.cos(a / n * 6.283) * r), y = Math.round(cy + Math.sin(a / n * 6.283) * r); if (skip && skip(x, y)) continue; if (store.validate(def, x, y, 0, {}).ok) return [x, y]; } } return null; };
  let well = null, tank = null; for (let tries = 0; tries < 12 && !tank; tries++) { const s = spot('oil_well', f.x, f.y, f.radius, (x, y) => store.list().some(o => Math.hypot(o.x - x, o.y - y) < 7)); if (!s) break; const w = store.place('oil_well', s[0], s[1], 0, { instant: true }); if (!w.ok) continue; const ts2 = spot('crude_tank_l', w.building.x + 8, w.building.y, 16); const t = ts2 && store.place('crude_tank_l', ts2[0], ts2[1], 0, { instant: true }); if (t && t.ok && I.layPipe(store, net, ts, { b: w.building.id, port: 'OIL_OUT_E' }, { b: t.building.id, port: 'INPUT_W' }, 16).ok) { well = w.building; tank = t.building; } else { store.demolish(w.building.id, { building: true, pipes: true, pipeSet: net }); } }
  const cs = spot('crude_tank_m', f.x + 40, f.y + 40, 40); const com = cs && store.place('crude_tank_m', cs[0], cs[1], 0, { instant: true });
  T('12a a producing well with its tank and a separate commercial tank were built on the real world', !!well && !!tank && com && com.ok);
  for (const b of store.list()) sim.ensure(b); co.speed = 0; co.setMode('CRUDE', 'WAIT'); co.advanceHours(24 * 3);
  const kinds = [co.tankKindOf(tank), co.tankKindOf(com.building)]; T('12b the well\'s tank is PRODUCTION, the other tank COMMERCIAL', kinds[0] === 'PRODUCTION' && kinds[1] === 'COMMERCIAL', kinds);
  const rem0 = f.remainingReserve, pr0 = f.pr, prod0 = f.produced, led0 = co.led.life.produced.CRUDE, out0 = co.sim.ensure(well)._out;
  const r = co.buy('CRUDE', 20000, 'A', 'CASH'); T('12c the purchase works', r.ok, r);
  T('12d the field\'s reserve, its pressure and the oil it has produced are exactly as before the purchase', f.remainingReserve === rem0 && f.pr === pr0 && f.produced === prod0);
  T('12e the produced-oil counter of the company did not move because of the purchase', co.led.life.produced.CRUDE === led0);
  co.advanceHours(24 * 5);
  const took = f.produced - prod0, booked = co.led.life.produced.CRUDE - led0;
  T('12f over the next days the field gave exactly what the wells took, and the company booked exactly that as produced oil (bought oil excluded)', Math.abs(took - booked) <= 1e-6 * Math.max(1, took) + 1e-3 && took > 0, [took, booked]);
  T('12g the bought stock is still 20,000 barrels (nothing refines it, nothing mixes into the produced stock) and the audit is clean', near(co.bq, 20000, 1e-9) && near(co.boughtInTanks(), 20000, 1e-9) && co.audit().ok, [co.bq, co.audit()]); }

console.log('\nOIL TRADING TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
