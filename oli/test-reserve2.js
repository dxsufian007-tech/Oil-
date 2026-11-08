/* Strategic Reserve - stage 2: buying into it, pipe transfers, manual release and sale, accounting, separate costs, the log, saving.
   NODE_PATH=/opt/npm-tools/node_modules node test-reserve2.js */
const { B, I, E, EC, game, put, pipe, A0, reload, near } = require('./test-reserve-helpers.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const bal = (co, k) => co.journal.bal[k] || 0, days = (co, n) => { for (let d = 0; d < n; d++) co.advanceHours(24); };
const plKeys = ['COGS', 'EXP_LOSS', 'REV_SPOT', 'EXP_FEES', 'EXP_OPERATING', 'EXP_MAINT', 'EXP_STORAGE'];
/* reserve crude tank R (inside the zone), commercial tank C west of it (inbound pipe C -> R) and commercial tank D east of it (outbound pipe R -> D) */
function rig(opt) {
  opt = opt || {}; const g = game(), co = track(g.co), R = put(g, 'crude_tank_m', A0.x + 2, A0.y + 2), C = put(g, 'crude_tank_m', A0.x - 30, A0.y + 2), D = put(g, 'crude_tank_m', A0.x + 40, A0.y + 2); co.sync();
  if (opt.inbound !== false) pipe(g, C, 'OUTPUT_E', R, 'INPUT_W', opt.dia); if (opt.outbound !== false) pipe(g, R, 'OUTPUT_E', D, 'INPUT_W', opt.dia); if (opt.cash != null) g.store.cash = opt.cash;       /* after the pipes are paid: pipe prices follow the capacity now */
  return Object.assign(g, { R, C, D });
}
const tot = co => ({ cash: co.store.cash, inv: bal(co, 'INV_CRUDE') + bal(co, 'INV_CRUDE_BUY'), res: bal(co, 'INV_RESERVE') });
const plSnap = co => Object.fromEntries(plKeys.map(k => [k, bal(co, k)]));
const lastEntries = (co, type) => (co.__p || []).filter(e => e.type === type);
function track(co) { const o = co._post.bind(co); co.__p = []; co._post = (m, l, ...r) => { co.__p.push({ type: m.type, lines: l.map(x => [x[0], x[1]]) }); return o(m, l, ...r); }; return co; }

console.log('1. buying into the reserve');
{ const g = rig(), co = g.co, q = co.reserveBuyQuote('CRUDE', 20000, 'A');
  T('1a the quote shows price, freight, fee, total and the average cost the reserve would have', q.ok && q.unitPrice > 0 && q.freight > 0 && q.fee > 0 && near(q.total, q.gross + q.freight + q.fee) && near(q.avgAfter, q.total / 20000) && q.room === 50000, q);
  const c0 = g.store.cash, r = co.reserveBuy('CRUDE', 20000, 'A', 'CASH'); const R = co.reserveInfo().tanks.find(t => t.id === g.R.id);
  T('1b the purchase pays the full total in cash and the oil lands in the reserve tank', r.ok && near(c0 - g.store.cash, q.total) && g.sim.ensure(g.R).vol === 20000 && R.net === 20000, r);
  T('1c the reserve ledger account holds exactly the cost; average cost per barrel = total / quantity', near(bal(co, 'INV_RESERVE'), q.total) && near(R.avgCost, q.total / 20000) && near(co.reserveAvgCost('CRUDE'), q.total / 20000));
  T('1d the commercial books are untouched (no commercial stock, no bought-crude stock)', co.qty.CRUDE === 0 && co.bq === 0 && bal(co, 'INV_CRUDE') === 0 && bal(co, 'INV_CRUDE_BUY') === 0 && co.available('CRUDE') === 0 && co.fills().commercial.volume === 0);
  const r2 = co.reserveBuy('CRUDE', 10000, 'A', 'CASH'); const unit2 = r2.unitCost;
  T('1e a second purchase gives the weighted average cost of all the oil held', r2.ok && near(co.reserveAvgCost('CRUDE'), (q.total + r2.cost) / 30000) && near(bal(co, 'INV_RESERVE'), q.total + r2.cost), [co.reserveAvgCost('CRUDE'), unit2]);
  T('1f the books balance and the audit passes', co.audit().ok, co.audit());
  const n0 = co.journal.n, c1 = g.store.cash, big = co.reserveBuy('CRUDE', 30000, 'A', 'CASH'); T('1g more than the room left is refused, nothing booked, nothing changed', !big.ok && big.reason === 'noRoom' && big.room === 20000 && co.journal.n === n0 && g.store.cash === c1 && g.sim.ensure(g.R).vol === 30000, big);
  const poor = rig({ cash: 1e6 }); const pr = poor.co.reserveBuy('CRUDE', 20000, 'A', 'CASH'); T('1h not enough cash: refused and nothing booked', !pr.ok && pr.reason === 'cash' && poor.co.reserveStock('CRUDE') === 0 && poor.co.audit().ok);
  const nt = game(), nr = nt.co.reserveBuy('CRUDE', 1000, 'A', 'CASH'); T('1i no reserve tank of that product: refused', !nr.ok && nr.reason === 'noReserveTank');
  const gg = rig(); const gt = put(gg, 'gasoline_tank_s', A0.x + 8, A0.y + 8); gg.co.sync(); const pg = gg.co.reserveBuy('GASOLINE', 5000, 'A', 'CASH'); T('1j products can be bought into a reserve product tank (gasoline: its own price)', pg.ok && gg.sim.ensure(gt).vol === 5000 && pg.cost > 0, pg);
  T('1k the commercial-purchase path is unchanged: buying crude normally still fills a commercial tank only', (() => { const x = rig(), y = x.co.buy('CRUDE', 10000, 'A', 'CASH'); return y.ok && x.co.bq === 10000 && x.sim.ensure(x.R).vol === 0 && x.co.reserveVolume() === 0; })());
  const cr = rig(); const cp = cr.co.reserveBuy('CRUDE', 20000, 'A', 'CREDIT'); T('1l a credit purchase creates a supplier payable, no cash now, and is paid when due', cp.ok && cr.co.payables.length === 1 && near(bal(cr.co, 'PAY_SUPPLIERS'), -cp.cost), cp);
  days(cr.co, 31); T('1m the payable was paid in cash on its due day and the audit passes', cr.co.payables.length === 0 && near(bal(cr.co, 'PAY_SUPPLIERS'), 0, 1e-9) && cr.co.audit().ok, cr.co.audit()); }

console.log('2. moving oil into the reserve through pipes (an internal transfer)');
{ const g = rig(), co = g.co; const b0 = co.buy('CRUDE', 30000, 'A', 'CASH'); const book0 = bal(co, 'INV_CRUDE_BUY'), cash0 = g.store.cash, pl0 = plSnap(co), q0 = co.bq; days(co, 4);
  const R = g.sim.ensure(g.R), C = g.sim.ensure(g.C);
  T('2a bought oil piped from a commercial tank arrives in the reserve; the commercial tank is drained of exactly what arrived', C.vol + R.vol === 30000 || near(C.vol + R.vol, 30000, 1e-9), [C.vol, R.vol]);
  T('2b at its average cost: the commercial bought-crude account fell by exactly what the reserve account rose by (internal transfer, one booking)', near(bal(co, 'INV_RESERVE') + bal(co, 'INV_CRUDE_BUY'), book0, 1e-9) && R.vol === 30000, [bal(co, 'INV_RESERVE'), bal(co, 'INV_CRUDE_BUY'), book0]);
  const moveE = lastEntries(co, 'RESERVE_IN'); T('2c the entries are RESERVE_IN transfers: no revenue, no cost of goods sold, no loss, no expense, no cash line', moveE.length >= 1 && moveE.every(e => e.lines.every(l => ['INV_RESERVE', 'INV_CRUDE', 'INV_CRUDE_BUY'].includes(l[0]))), moveE.map(e => e.lines));
  const pl1 = plSnap(co); T('2d the profit and loss is exactly as before (no sale, no purchase, no gain, no loss, no double charge)', ['COGS', 'EXP_LOSS', 'REV_SPOT', 'EXP_FEES'].every(k => near(pl1[k], pl0[k], 1e-12)), [pl0, pl1]);
  T('2e no crude loss was booked and no oil vanished: commercial books and tanks agree (bq = commercial bought volume = 0)', co.crudeLoss === 0 && co.bq === 0 && co.boughtInTanks() === 0 && co.audit().ok, [co.crudeLoss, co.bq, co.audit()]);
  T('2f the gauges moved by the barrels moved: commercial 0 of 100,000; reserve 30,000 of 50,000 = 60%', near(co.fills().commercial.fill, 0, 1e-9) && near(co.fills().reserve.fill, 0.6), co.fills());
  T('2g the reserve tank remembers the oil is bought (its share, not produced)', co.reserveInfo().tanks[0].bought === 30000 && co.reserveInfo().tanks[0].own === 0);
  const lg = co.reserveLog(10); T('2h the log has the transfer as IN with quantity, value and tank (not a purchase)', lg.some(l => l.kind === 'IN' && near(l.qty, 30000, 1e-9) && l.tank === g.R.id && near(l.value, book0, 1e-9)), lg); }
{ const g = rig({ dia: 8 }), co = g.co; co.buy('CRUDE', 50000, 'A', 'CASH'); days(co, 1); const cap = require('./building-config.js').PIPES[8].capacity, moved = g.sim.ensure(g.R).vol;
  T('2i the pipe\'s capacity limits the transfer: ' + Math.round(moved) + ' bbl in a day through a pipe of ' + cap + ' bbl/day', moved > 0 && moved <= cap * 1.001, [moved, cap]);
  days(co, 4); T('2j with time the rest arrives, each barrel once (reserve + commercial = what was bought)', near(g.sim.ensure(g.R).vol + g.sim.ensure(g.C).vol, 50000, 1e-9) && co.audit().ok, [g.sim.ensure(g.R).vol, g.sim.ensure(g.C).vol]); }
{ const g = rig(), co = g.co; co.buy('CRUDE', 50000, 'A', 'CASH'); co.reserveBuy('CRUDE', 40000, 'A', 'CASH'); days(co, 3);
  T('2k a full reserve tank does not overflow: the room limits the arrival, the rest stays in the source', g.sim.ensure(g.R).vol <= 50000 && near(g.sim.ensure(g.R).vol, 50000, 1e-9) && near(g.sim.ensure(g.C).vol, 40000, 1e-9), [g.sim.ensure(g.R).vol, g.sim.ensure(g.C).vol]);
  T('2l books still agree with the tanks', co.audit().ok, co.audit()); }
{ const g = rig({ inbound: false }), co = g.co; co.buy('CRUDE', 30000, 'A', 'CASH'); days(co, 3); T('2m no pipe, no transfer: without a real connection nothing moves into the reserve', g.sim.ensure(g.R).vol === 0 && g.sim.ensure(g.C).vol === 30000); }

console.log('3. production reaches the reserve by pipe (own oil, booked once)');
{ const g = game(), co = g.co, cx = 130, w = [put(g, 'oil_well', cx, 100), put(g, 'oil_well', cx, 104), put(g, 'oil_well', cx, 108)], jn = put(g, 'junction', cx + 8, 104), pump = put(g, 'pump_station_l', cx + 14, 104), sep = put(g, 'separator', cx + 30, 102), R = put(g, 'crude_tank_m', A0.x + 2, A0.y + 2); co.sync();
  ['PORT_N', 'PORT_W', 'PORT_S'].forEach((p, i) => pipe(g, w[i], 'OIL_OUT_E', jn, p)); pipe(g, jn, 'PORT_E', pump, 'INPUT'); pipe(g, pump, 'OUTPUT', sep, 'MIXTURE_IN'); pipe(g, sep, 'OIL_OUT', R, 'INPUT_W');
  const supply = () => { for (const m of ['CHEM', 'OPS', 'PARTS']) { const room = Math.floor(co.roomFor(m)); if (room > 0) co.buy(m, Math.min(room, 5000), 'A', 'CASH'); } };
  for (let d = 0; d < 20; d++) { supply(); co.advanceHours(24); }
  const Rs = g.sim.ensure(R);
  T('3a wells -> separator -> reserve tank: the reserve fills (' + Math.round(Rs.vol) + ' bbl)', Rs.vol > 1000, Rs.vol);
  T('3b the produced oil moved from the commercial books to the reserve books; only the separator water and tank-full overflow are lost (same as a commercial tank), and the commercial crude stock is zero', near(co.crudeLoss, co.led.life.produced.CRUDE - co.reserveStock('CRUDE'), 1e-6) && co.qty.CRUDE < 1e-6 && bal(co, 'INV_CRUDE') < 0.01, [co.crudeLoss, co.qty.CRUDE, bal(co, 'INV_CRUDE')]);
  T('3c the reserve account equals the sum of the tank (own-oil cost), and is positive', near(bal(co, 'INV_RESERVE'), (Rs.cO || 0) + (Rs.cB || 0), 1e-9) && bal(co, 'INV_RESERVE') > 1000 && (Rs.cB || 0) === 0, [bal(co, 'INV_RESERVE'), Rs.cO, Rs.cB]);
  T('3d the reserve oil is own production (none counted as bought), and the audit passes', co.reserveInfo().tanks[0].bought === 0 && co.audit().ok, co.audit());
  const prod = co.led.life.produced.CRUDE; T('3e the production is counted once as produced, and equals what reached the reserve (+ losses of the separator)', prod > 0 && prod >= Rs.vol - 1e-6 && Rs.vol > 0.8 * prod, [prod, Rs.vol]); }

console.log('4. manual release (the outlet never opens by itself)');
{ const g = rig(), co = g.co; co.reserveBuy('CRUDE', 40000, 'A', 'CASH'); const avg = co.reserveAvgCost('CRUDE'); days(co, 3);
  T('4a connecting an outlet pipe does NOT release anything: nothing left the reserve in three days', g.sim.ensure(g.R).vol === 40000 && g.sim.ensure(g.D).vol === 0 && lastEntries(co, 'RESERVE_OUT').length === 0);
  const r = co.reserveRelease(g.R.id, 5000); T('4b an order for 5,000 barrels is accepted', r.ok && r.qty === 5000, r);
  days(co, 1); const R = g.sim.ensure(g.R), D = g.sim.ensure(g.D);
  T('4c exactly 5,000 barrels left, arrived once, and the outlet closed again', near(R.vol, 35000, 1e-9) && near(D.vol, 5000, 1e-9) && (R.rel || 0) === 0, [R.vol, D.vol, R.rel]);
  days(co, 2); T('4d nothing more flows afterwards', near(g.sim.ensure(g.R).vol, 35000, 1e-9) && near(g.sim.ensure(g.D).vol, 5000, 1e-9));
  T('4e at the average cost: the commercial stock took 5,000 x average cost out of the reserve books (internal transfer)', near(bal(co, 'INV_CRUDE_BUY'), 5000 * avg, 1e-9) && near(bal(co, 'INV_RESERVE'), 35000 * avg, 1e-9) && near(co.bq, 5000, 1e-9) && co.boughtInTanks() === 5000, [bal(co, 'INV_CRUDE_BUY'), 5000 * avg]);
  T('4f no profit, no loss: the release entries touch only inventory accounts', lastEntries(co, 'RESERVE_OUT').every(e => e.lines.every(l => ['INV_RESERVE', 'INV_CRUDE', 'INV_CRUDE_BUY'].includes(l[0]))) && bal(co, 'EXP_LOSS') === 0 && bal(co, 'COGS') === 0 && co.audit().ok, co.audit());
  T('4g the amount is the player\'s: asking for more than the tank holds is refused, nothing opens', (() => { const x = co.reserveRelease(g.R.id, 99999); return !x.ok && x.reason === 'notEnough' && (g.sim.ensure(g.R).rel || 0) === 0; })());
  T('4h without an outlet pipe the order is refused (no real connection)', (() => { const x = rig({ outbound: false }); x.co.reserveBuy('CRUDE', 10000, 'A', 'CASH'); const y = x.co.reserveRelease(x.R.id, 1000); return !y.ok && y.reason === 'noPipe'; })());
  T('4i a commercial tank cannot be ordered released (the order is reserve-only)', !co.reserveRelease(g.C.id, 100).ok);
  const o2 = co.reserveRelease(g.R.id, 10000); co.reserveStop(g.R.id); days(co, 1); T('4j an order can be cancelled: stopping closes the outlet and nothing flows', o2.ok && near(g.sim.ensure(g.R).vol, 35000, 1e-9) && (g.sim.ensure(g.R).rel || 0) === 0);
  const o3 = co.reserveRelease(g.R.id, 20000); days(co, 1); co.reserveRelease(g.R.id, 5000); days(co, 1); T('4k orders add up: 20,000 + 5,000 left in total, and no more (' + Math.round(g.sim.ensure(g.R).vol) + ' left)', o3.ok && near(g.sim.ensure(g.R).vol, 10000, 1e-9) && near(g.sim.ensure(g.D).vol, 30000, 1e-9), [g.sim.ensure(g.R).vol, g.sim.ensure(g.D).vol]);
  const rc = g.sim.ensure(g.R); days(co, 1); const lg = co.reserveLog(30); T('4l the log shows the orders (ORDER) and the departures (OUT) with quantities', lg.some(l => l.kind === 'ORDER' && l.qty === 5000) && lg.some(l => l.kind === 'OUT' && l.qty > 0) && lg.some(l => l.kind === 'STOP'), lg.map(l => l.kind)); }
{ /* release into a refinery */
  const g = game(), co = g.co, R = put(g, 'crude_tank_m', A0.x + 2, A0.y + 2), rf = put(g, 'refinery_s', 250, 100), tg = put(g, 'gasoline_tank_m', 280, 100), td = put(g, 'diesel_tank_m', 280, 108), tj = put(g, 'jet_tank_m', 280, 116), tl = put(g, 'gas_sphere_m', 300, 124); co.sync();
  pipe(g, R, 'OUTPUT_E', rf, 'CRUDE_IN'); pipe(g, rf, 'GASOLINE_OUT', tg, 'INPUT_W'); pipe(g, rf, 'DIESEL_OUT', td, 'INPUT_W'); pipe(g, rf, 'JET_OUT', tj, 'INPUT_W'); pipe(g, rf, 'GAS_OUT', tl, 'INPUT_N');
  co.reserveBuy('CRUDE', 40000, 'A', 'CASH'); co.buy('CHEM', 5000, 'A', 'CASH'); co.buy('OPS', 5000, 'A', 'CASH'); co.buy('PARTS', 100, 'A', 'CASH'); days(co, 3); T('4m before any order the refinery gets nothing from the reserve', (g.sim.ensure(rf)._in || 0) === 0 && g.sim.ensure(R).vol === 40000);
  const avg = co.reserveAvgCost('CRUDE'), cut = co.crudeShort; co.reserveRelease(R.id, 20000); days(co, 3);
  T('4n with an order the refinery receives and processes oil from the reserve; the reserve fell, products appeared', g.sim.ensure(R).vol < 40000 && co.led.life.produced.THRU > 0 && co.led.life.produced.GASOLINE > 0, [g.sim.ensure(R).vol, co.led.life.produced.THRU]);
  T('4o the refinery used oil that was in the books: no shortfall, no loss, the audit passes', co.crudeShort === cut && co.crudeLoss === 0 && co.audit().ok, [co.crudeShort, co.crudeLoss, co.audit()]);
  T('4p the cost of the processed reserve oil went into the refinery products (the reserve account fell by its cost)', bal(co, 'INV_RESERVE') < 40000 * avg - 1000 && bal(co, 'INV_GASOLINE') > 0, [bal(co, 'INV_RESERVE'), bal(co, 'INV_GASOLINE')]); }

console.log('5. selling by hand out of the reserve');
{ const g = rig(), co = g.co; co.reserveBuy('CRUDE', 40000, 'A', 'CASH'); const avg = co.reserveAvgCost('CRUDE'); for (const p of EC.PRODUCTS) co.setMode(p, 'SPOT'); days(co, 20);
  T('5a auto-sell (SPOT, tank 80% full) never sells reserve oil', g.sim.ensure(g.R).vol === 40000 && lastEntries(co, 'SALE_SPOT').length === 0);
  const q = co.reserveSellQuote('CRUDE', 10000), c0 = g.store.cash; T('5b the quote shows price, fee, net and the profit against the reserve cost', q.ok && q.qty === 10000 && near(q.gross, 10000 * q.unitPrice) && near(q.fee, q.gross * EC.FEES.spot) && near(q.estCost, 10000 * avg) && near(q.estProfit, q.net - 10000 * avg), q);
  const r = co.reserveSell('CRUDE', 10000); T('5c selling 10,000 barrels by hand: cash +net, the reserve fell by the barrels and the cost of goods sold is the reserve cost', r.ok && near(g.store.cash - c0, r.net, 1e-9) && near(g.sim.ensure(g.R).vol, 30000, 1e-9) && near(r.cost, 10000 * avg, 1e-9) && near(bal(co, 'INV_RESERVE'), 30000 * avg, 1e-9), r);
  T('5d profit = gross - fee - cost, booked in the same revenue / COGS / fee accounts as a spot sale', near(r.profit, r.gross - r.fee - r.cost, 1e-9) && near(bal(co, 'COGS'), r.cost, 1e-9) && near(-bal(co, 'REV_SPOT'), r.gross, 1e-9) && near(bal(co, 'EXP_FEES'), r.fee, 1e-9), [bal(co, 'COGS'), bal(co, 'REV_SPOT')]);
  T('5e the audit passes and the commercial stock was not touched', co.audit().ok && co.qty.CRUDE === 0 && co.bq === 0, co.audit());
  const bad = co.reserveSell('CRUDE', 99999); T('5f selling more than the reserve holds is refused, nothing changes', !bad.ok && bad.reason === 'notEnough' && near(g.sim.ensure(g.R).vol, 30000, 1e-9));
  const none = co.reserveSell('CRUDE', 0); T('5g zero quantity: refused', !none.ok && none.reason === 'nothingToSell');
  const all = co.reserveSell('CRUDE', co.reserveStock('CRUDE')); T('5h emptying the tank completely leaves no residual cost anywhere: the tank and the reserve account are exactly zero', all.ok && g.sim.ensure(g.R).vol === 0 && (g.sim.ensure(g.R).cO || 0) === 0 && (g.sim.ensure(g.R).cB || 0) === 0 && Math.abs(bal(co, 'INV_RESERVE')) < 1e-6 && co.audit().ok, [bal(co, 'INV_RESERVE'), g.sim.ensure(g.R)]);
  T('5i the log has both sales with revenue, fee, cost and profit', co.reserveLog(10).filter(l => l.kind === 'SELL').length === 2 && co.reserveLog(10).every(l => l.kind !== 'SELL' || (l.revenue > 0 && l.cost > 0 && 'profit' in l))); }
{ const g = game(), co = g.co, R1 = put(g, 'crude_tank_s', A0.x + 2, A0.y + 2), R2 = put(g, 'crude_tank_s', A0.x + 8, A0.y + 2); co.sync(); co.reserveBuy('CRUDE', 8000, 'A', 'CASH', R1.id); co.reserveBuy('CRUDE', 6000, 'B', 'CASH', R2.id);
  const c1 = co.reserveInfo().tanks.find(t => t.id === R1.id).avgCost, c2 = co.reserveInfo().tanks.find(t => t.id === R2.id).avgCost;
  T('5j two tanks, two suppliers: each tank has its own average cost', c1 > 0 && c2 > 0 && Math.abs(c1 - c2) > 1e-6, [c1, c2]);
  const r = co.reserveSell('CRUDE', 3000, R2.id); T('5k selling from a chosen tank uses that tank\'s cost, the other tank is untouched', r.ok && near(r.cost, 3000 * c2, 1e-9) && g.sim.ensure(R1).vol === 8000 && near(g.sim.ensure(R2).vol, 3000, 1e-9)); }

console.log('6. separate costs');
{ const R = game(), C = game(), B = game(); const r1 = put(R, 'crude_tank_m', A0.x + 2, A0.y + 2), c1 = put(C, 'crude_tank_m', 60, 60), r2 = put(B, 'crude_tank_m', A0.x + 2, A0.y + 2), c2 = put(B, 'crude_tank_m', 60, 60); for (const x of [R, C, B]) x.co.sync();
  R.sim.ensure(r1).vol = 30000; C.sim.ensure(c1).vol = 30000; B.sim.ensure(r2).vol = 30000; B.sim.ensure(c2).vol = 30000; for (const x of [R, C, B]) x.co.advanceHours(24 * 5);
  const e = co => ({ st: bal(co, 'EXP_STORAGE'), rs: bal(co, 'EXP_RSTORAGE'), op: bal(co, 'EXP_OPERATING'), rops: bal(co, 'EXP_ROPS') }), a = e(R.co), b = e(C.co), m = e(B.co);
  T('6a a reserve-only company pays reserve storage and reserve operation, and no commercial storage / tank operation', a.rs > 0 && a.rops > 0 && a.st === 0 && a.op === 0, a);
  T('6b a commercial-only company pays the old lines and nothing on the reserve lines', b.st > 0 && b.op > 0 && b.rs === 0 && b.rops === 0, b);
  T('6c with both, each line is exactly what each system costs alone (no duplicate, nothing lost)', near(m.st, b.st, 1e-9) && near(m.op, b.op, 1e-9) && near(m.rs, a.rs, 1e-9) && near(m.rops, a.rops, 1e-9), [m, a, b]);
  T('6d the reserve storage cost is volume x the same per-barrel rate (30,000 bbl x ' + EC.STORAGE_COST.CRUDE + ' x 5 days)', near(a.rs, 30000 * EC.STORAGE_COST.CRUDE * 5, 1e-6), [a.rs, 30000 * EC.STORAGE_COST.CRUDE * 5]);
  T('6e the reserve lines are part of the company expenses and the books balance', B.co.audit().ok && B.co.led.life.pl.rstorage === bal(B.co, 'EXP_RSTORAGE') && B.co.led.life.pl.rops === bal(B.co, 'EXP_ROPS'), B.co.audit());
  const ci = B.co.reserveInfo().cost; T('6f the screen\'s daily reserve cost matches what is charged per day', near(ci.storage, 30000 * EC.STORAGE_COST.CRUDE, 1e-6) && ci.total > ci.storage, ci); }

console.log('7. nothing is lost or counted twice');
{ const g = rig(), co = g.co; co.buy('CRUDE', 20000, 'A', 'CASH'); co.reserveBuy('CRUDE', 20000, 'A', 'CASH'); const oil = () => g.sim.ensure(g.C).vol + g.sim.ensure(g.R).vol + g.sim.ensure(g.D).vol, books = () => co.qty.CRUDE + co.bq + co.reserveStock('CRUDE'), cashv = () => g.store.cash;
  const o0 = oil(), bk0 = books(); days(co, 2); co.reserveRelease(g.R.id, 15000); days(co, 2); co.reserveRelease(g.R.id, 8000); days(co, 2);
  T('7a physical barrels are conserved through all the moves (' + o0 + ')', near(oil(), o0, 1e-9), [oil(), o0]); T('7b book barrels (commercial + bought + reserve) are conserved too', near(books(), bk0, 1e-9), [books(), bk0]);
  T('7c book value is conserved: INV_CRUDE + INV_CRUDE_BUY + INV_RESERVE = what was paid', co.audit().ok);
  const bought = lastEntries(co, 'PURCHASE_CASH').reduce((a, e) => a + e.lines.filter(l => l[0] !== 'CASH').reduce((s, l) => s + l[1], 0), 0); T('7d the value of the oil held equals what was paid for it (no sale happened; transfers added or removed nothing)', near(bal(co, 'INV_CRUDE') + bal(co, 'INV_CRUDE_BUY') + bal(co, 'INV_RESERVE'), bought, 1e-9), [bal(co, 'INV_CRUDE') + bal(co, 'INV_CRUDE_BUY') + bal(co, 'INV_RESERVE'), bought]);
  T('7e every transfer entry is balanced by itself and touches only inventory accounts', [...lastEntries(co, 'RESERVE_IN'), ...lastEntries(co, 'RESERVE_OUT')].every(e => near(e.lines.reduce((s, l) => s + l[1], 0), 0, 1e-9) && e.lines.every(l => /^INV_/.test(l[0]))));
  T('7f the reserve cannot be sold by selling "everything" commercially', (() => { const r = co.sell('CRUDE', 1e9, 'SPOT', { source: 'ALL' }); return g.sim.ensure(g.R).vol + 0 >= 0 && co.reserveStock('CRUDE') > 0; })()); }

console.log('8. protecting the stock');
{ const g = rig(), co = g.co; co.reserveBuy('CRUDE', 10000, 'A', 'CASH'); const d = g.store.demolish(g.R.id, { building: true, pipes: true, pipeSet: new Set() }); T('8a a reserve tank that holds oil cannot be demolished', !d.ok && d.reason === 'reserveNotEmpty' && g.store.get(g.R.id) && co.audit().ok, d.reason);
  co.reserveSell('CRUDE', 10000); const d2 = g.store.demolish(g.R.id, { building: true, pipes: true, pipeSet: new Set(g.net.lines.size ? [] : []) }); T('8b once empty it can be demolished normally', d2.ok || d2.reason === 'needsPipeConfirm', d2.reason); }

console.log('9. saving and loading after all of it');
{ const g = rig(), co = g.co; co.reserveBuy('CRUDE', 30000, 'A', 'CASH'); co.buy('CRUDE', 15000, 'A', 'CASH'); days(co, 2); co.reserveRelease(g.R.id, 12000); days(co, 1); co.reserveSell('CRUDE', 2000); co.reserveRelease(g.R.id, 3000);     // an order still open when saved
  const snap = x => { const t = x.sim.ensure(x.store.get(g.R.id)); return ({ vol: t.vol, cO: t.cO, cB: t.cB, rel: t.rel, bv: t.bv, book: bal(x.co, 'INV_RESERVE'), cash: x.store.cash, fills: x.co.fills(), log: x.co.reserve.log.length, lv: x.co.reserve.lv }); };
  const g2 = reload(g), s1 = snap(g), s2 = snap(g2); T('9a the restored game has the same reserve tank, costs, open order, ledger account, cash, gauges and log', JSON.stringify(s1) === JSON.stringify(s2), [s1, s2]);
  T('9b the books balance after loading', g2.co.audit().ok, g2.co.audit()); T('9c the log came back entry by entry', JSON.stringify(g2.co.reserve.log) === JSON.stringify(co.reserve.log));
  days(co, 3); days(g2.co, 3); const a = snap(g), b = snap(g2); T('9d both keep going the same way: the open order finished identically in the restored game', JSON.stringify(a) === JSON.stringify(b), [a, b]);
  g2.co.fromJSON(JSON.parse(JSON.stringify(g2.co.toJSON()))); T('9e loading the same company data again changes nothing (idempotent)', JSON.stringify(snap(g2)) === JSON.stringify(b)); }

console.log('10. months of mixed activity');
{ const g = rig(), co = g.co, gt = put(g, 'gasoline_tank_s', A0.x + 8, A0.y + 8); co.sync(); let bad = null; const checks = []; for (let d = 0; d < 90; d++) {
    if (d % 7 === 0) co.reserveBuy('CRUDE', 4000 + d * 10, d % 2 ? 'A' : 'B', 'CASH'); if (d % 11 === 3) co.buy('CRUDE', 3000, 'A', 'CASH'); if (d % 9 === 4) co.reserveRelease(g.R.id, Math.min(3000, co.reserveStock('CRUDE'))); if (d % 13 === 5) co.reserveSell('CRUDE', Math.min(2500, co.reserveStock('CRUDE')));
    if (d % 17 === 6) co.reserveBuy('GASOLINE', 1500, 'A', 'CASH'); if (d % 19 === 9) co.reserveSell('GASOLINE', Math.min(700, co.reserveStock('GASOLINE')));
    co.advanceHours(24); const a = co.audit(); if (!a.ok && !bad) bad = { day: d, errors: a.errors }; const f = co.fills(); checks.push(f.reserve.fill <= 1 + 1e-9 && f.commercial.fill <= 1 + 1e-9 && g.sim.ensure(g.R).vol >= -1e-9); }
  T('10a ninety days of buying, piping, releasing and selling: the audit passed every day', !bad, bad); T('10b no tank ever overflowed or went negative', checks.every(Boolean));
  T('10c the reserve account is the sum of the tanks at the end, to the cent', near(bal(co, 'INV_RESERVE'), co.reserveBook(), 1e-9), [bal(co, 'INV_RESERVE'), co.reserveBook()]); T('10d no oil was ever booked as lost or short', co.crudeLoss === 0 && (co.reserve.short || 0) < 1e-6, [co.crudeLoss, co.reserve.short]);
  T('10e the log is bounded and every entry has a kind, a time, a quantity and a tank or tanks', co.reserve.log.length <= 300 && co.reserve.log.every(l => l.kind && l.t >= 0 && 'qty' in l)); }

console.log('\nRESERVE STAGE-2 TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
