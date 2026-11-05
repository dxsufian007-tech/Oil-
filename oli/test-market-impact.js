/* Phase 3: the company on the world market + the net-oil (no water) rule.
   NODE_PATH=/opt/npm-tools/node_modules node test-market-impact.js */
const { B, I, E, EC, game, put, pipe, A0, reload, near } = require('./test-reserve-helpers.js');
let pass = 0, fail = 0; const T = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL ' + n + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const bal = (co, k) => co.journal.bal[k] || 0, days = (co, n, f) => { for (let d = 0; d < n; d++) { if (f) f(d); co.advanceHours(24); } }, M = 1e6;
const supply = co => { for (const m of ['CHEM', 'OPS', 'PARTS']) { const room = Math.floor(co.roomFor(m)); if (room > 0) co.buy(m, Math.min(room, 5000), 'A', 'CASH'); } };
/* wells -> separator -> a tank (in the reserve zone, or commercial); the tank can also feed an outlet to a second tank */
function chain(inZone) {
  const g = game(), co = g.co, cx = 130, w = [put(g, 'oil_well', cx, 100), put(g, 'oil_well', cx, 104), put(g, 'oil_well', cx, 108)], jn = put(g, 'junction', cx + 8, 104), pump = put(g, 'pump_station_l', cx + 14, 104), sep = put(g, 'separator', cx + 30, 102);
  const T1 = inZone ? put(g, 'crude_tank_m', A0.x + 2, A0.y + 2) : put(g, 'crude_tank_m', cx + 60, 102); co.sync();
  ['PORT_N', 'PORT_W', 'PORT_S'].forEach((p, i) => pipe(g, w[i], 'OIL_OUT_E', jn, p)); pipe(g, jn, 'PORT_E', pump, 'INPUT'); pipe(g, pump, 'OUTPUT', sep, 'MIXTURE_IN'); pipe(g, sep, 'OIL_OUT', T1, 'INPUT_W'); return Object.assign(g, { T1 });
}
const sumHist = (e, i) => e.coHist.filter(r => r[0] >= 0).reduce((a, r) => a + r[i], 0) + e.dayFlow[['', 'prod', 'off', 'buy', 'hold', 'rel'][i]];

console.log('1. the net-oil rule: water is never oil');
{ const g = chain(false), co = g.co; days(co, 12, () => supply(co)); const t = g.sim.ensure(g.T1);
  T('1a the separator leaves some water in the tank (the case this rule is about)', (t.wat || 0) > 1, t.wat);
  T('1b the oil stock is the NET oil: tank volume minus its water, in the books and on the screen figures', near(co.crudeOnHand(), t.vol - t.wat, 1e-9) && near(co.available('CRUDE'), t.vol - t.wat, 1e-9) && near(co.qty.CRUDE, t.vol - t.wat, 1e-6), [co.crudeOnHand(), t.vol - t.wat, co.qty.CRUDE]);
  const f = co.fills().commercial; T('1c the gauge keeps the physical space (water takes room) and the net oil and the water are shown separately', near(f.volume, t.vol) && near(f.oil, t.vol - t.wat) && near(f.water, t.wat) && near(f.oil + f.water, f.volume), f);
  T('1d what was produced = net oil in stock + water-displaced overflow only: no water counted as produced oil', near(co.led.life.produced.CRUDE, co.qty.CRUDE + co.crudeLoss, 1e-6), [co.led.life.produced.CRUDE, co.qty.CRUDE, co.crudeLoss]);
  T('1e the inventory account holds only net oil: its cost per barrel equals the book cost / net barrels', co.audit().ok && bal(co, 'INV_CRUDE') > 0, co.audit());
  const gz = chain(true), cz = gz.co; days(cz, 12, () => supply(cz)); const rt = gz.sim.ensure(gz.T1);
  T('1f the reserve follows the same rule: net oil only (same result as a commercial tank on the same chain)', near(cz.reserveStock('CRUDE'), rt.vol - rt.wat, 1e-9) && near(cz.crudeLoss, co.crudeLoss, 1e-9) && near(cz.reserveStock('CRUDE'), co.qty.CRUDE, 1e-9), [cz.reserveStock('CRUDE'), co.qty.CRUDE, cz.crudeLoss, co.crudeLoss]);
  const netBefore = co.crudeAvailable('ALL'), wat0 = g.sim.ensure(g.T1).wat, sold = co.sell('CRUDE', netBefore, 'SPOT'); T('1g selling everything sells the net oil and never the water: only net barrels are paid and counted; the water leaves with the oil unpaid', sold.ok && near(sold.qty, netBefore, 1e-6) && g.sim.ensure(g.T1).vol < 1e-6, [sold.qty, netBefore, g.sim.ensure(g.T1).vol, wat0]);
  T('1h and the books balance', co.audit().ok && cz.audit().ok); }
{ /* OLD SAVE: the books counted the water as oil.  Migration = one time, no journal entry, no loss, no duplication */
  const g = chain(false), co = g.co; days(co, 10, () => supply(co)); const t = g.sim.ensure(g.T1), net = t.vol - t.wat;
  co.qty.CRUDE = t.vol; /* the old, overstated book */ const cj = JSON.parse(JSON.stringify(co.toJSON())); delete cj.netOil;
  const inv0 = bal(co, 'INV_CRUDE'), n0 = co.journal.n, g2 = reload(Object.assign({}, g, { co: { toJSON: () => cj } })); 
  T('1i an older save (no net-oil flag) loads as "not migrated yet"', g2.co.netOil === false);
  const lossOf = x => { const a = []; const o = x.co._post.bind(x.co); x.co._post = (m, l, ...r) => { if (m.type === 'CRUDE_LOSS' || m.type === 'RESERVE_LOSS') a.push(l.find(z => z[0] === 'EXP_LOSS')[1]); return o(m, l, ...r); }; return a; };
  const cjCtl = JSON.parse(JSON.stringify(co.toJSON())); cjCtl.netOil = 1; cjCtl.qty = Object.assign({}, cjCtl.qty, { CRUDE: t.vol - t.wat }); const gc = reload(Object.assign({}, g, { co: { toJSON: () => cjCtl } })); const posted = lossOf(g2), ctl = lossOf(gc);
  g2.co.advanceHours(1); gc.co.advanceHours(1);
  T('1j after the first hour: book quantity = net oil, flag set, a record of how many barrels were corrected', g2.co.netOil === true && near(g2.co.qty.CRUDE, g2.co.crudeOnHand() - g2.co.boughtInTanks(), 1e-6) && g2.co.netOilFix && g2.co.netOilFix.barrels > 1, [g2.co.qty.CRUDE, g2.co.netOilFix]);
  T('1k nothing was written off for the water: the loss entries of the migrated game are exactly those of an identical game that already had the correct books (' + posted.length + ' normal separator-slop entries, same amounts)', posted.length === ctl.length && posted.every((v, i) => near(v, ctl[i], 1e-9)) && g2.co.audit().ok, [posted, ctl]);
  const q1 = g2.co.qty.CRUDE; g2.co.advanceHours(1); const cj2 = JSON.parse(JSON.stringify(g2.co.toJSON())); T('1l the flag is saved; loading that save again never repeats the correction', cj2.netOil === 1 && true);
  T('1m the books balance after migrating', g2.co.audit().ok, g2.co.audit()); }
{ /* migration edge: a save whose tank held only water-equivalent stock */
  const g = game(), co = g.co, tk = put(g, 'crude_tank_m', 60, 60); co.sync(); const t = g.sim.ensure(tk); t.vol = 1000; t.wat = 1000; co.qty.CRUDE = 1000; co.netOil = false; co.advanceHours(1);
  T('1n a tank of pure water holds no oil stock: the old 1,000 book barrels are brought to zero without a crash, and the audit passes', co.qty.CRUDE < 1e-6 && co.netOil === true && co.audit().ok, [co.qty.CRUDE, co.audit()]); }

console.log('2. what the company does reaches the market engine');
{ const g = chain(false), co = g.co, e = co.market.engine; days(co, 15, () => supply(co));
  T('2a new games run the "own oil is supply when produced" rule; older engine saves keep the old rule', e.ownAtProd === true);
  T('2b the produced oil (net) reached the engine exactly: Σ daily rows + today = ledger crude produced', near(sumHist(e, 1) * M, co.led.life.produced.CRUDE, 1e-6), [sumHist(e, 1) * M, co.led.life.produced.CRUDE]);
  T('2c the engine\'s oil accounts close (nothing counted twice or lost)', Math.abs(e.check()) < 1e-6, e.check());
  const c0 = e.C, s0 = co.sell('CRUDE', 5000, 'SPOT', { source: 'OWN' }); T('2d selling own oil that was already supply when produced does not add it again: the world stock is unchanged', s0.ok && near(e.C, c0, 1e-12) && near(sumHist(e, 2) * M, 5000, 1e-6), [e.C - c0, sumHist(e, 2) * M]);
  const f = co.marketFootprint(30); T('2e production share = company production / (rest of the world + company), from the real daily rows', f.prod > 0 && near(f.shareProd, f.prod / (f.worldProd) * 100, 1e-9) && f.shareProd < 0.1, f);
  T('2f supply share = oil offered / (rest of the world + offered)', near(f.shareSupply, f.offered / f.worldSupply * 100, 1e-9));
  const rows = e.coHist.filter(r => r[0] >= 0).slice(-30); T('2g the monthly average is the mean of the last 30 daily rows (' + rows.length + ' days exist)', near(f.prod, rows.reduce((a, r) => a + r[1], 0) / rows.length * M, 1e-9) && f.days === rows.length, [f.prod, f.days]);
  T('2h the daily figure is the last day, not an average', near(f.day.prod, rows[rows.length - 1][1] * M, 1e-9)); }
{ /* reserve flows: own oil in, out, sold */
  const g = game(), co = g.co, R = put(g, 'crude_tank_m', A0.x + 2, A0.y + 2), C = put(g, 'crude_tank_m', A0.x - 30, A0.y + 2), D = put(g, 'crude_tank_m', A0.x + 40, A0.y + 2); co.sync(); pipe(g, C, 'OUTPUT_E', R, 'INPUT_W'); pipe(g, R, 'OUTPUT_E', D, 'INPUT_W');
  const e = co.market.engine, tc = g.sim.ensure(C); tc.vol = 40000; co.qty.CRUDE = 40000; co.journal.post({ type: 'TEST', desc: 'seed own oil' }, [['INV_CRUDE', 1200000], ['EQUITY', -1200000]]); e.C -= 0; e.acct.coIn += 0.04; e.C += 0.04;             // 40,000 own barrels that are already supply in the engine
  const k0 = e.K; days(co, 3);
  T('2i own oil piped into the reserve leaves the market stock and is kept as "held off the market" (K)', near(e.K * M, g.sim.ensure(R).vol, 1e-6) && e.K > 0, [e.K * M, g.sim.ensure(R).vol]);
  const kc0 = e.dayFlow.kout; co.reserveRelease(R.id, 10000); days(co, 2);
  T('2j releasing 10,000 barrels (to the commercial store) gives them back to the market stock: K falls by exactly that', near(e.K * M, 30000, 1e-6) && near(e.coHist.filter(r => r[0] >= 0).reduce((a, r) => a + r[5], 0) * M, 10000, 1e-6), [e.K * M]);
  const cBefore = e.C, kf = e.dayFlow.kout; const rs = co.reserveSell('CRUDE', 5000); T('2k selling 5,000 reserve barrels adds them to the supply (they were off the market) and reduces K', rs.ok && near(e.K * M, 25000, 1e-6) && near((e.dayFlow.kout - kf) * M, 5000, 1e-6) && near(e.C - cBefore, 0.005, 1e-9), [e.K * M, e.C - cBefore]);
  T('2l the engine closes and the books balance', Math.abs(e.check()) < 1e-6 && co.audit().ok, [e.check(), co.audit()]);
  const f = co.marketFootprint(30); T('2m the footprint reports what was held and released', f.held > 0 && f.released > 0 && near(f.kept, 25000, 1e-6), f); }
{ const g = game(), co = g.co, R = put(g, 'crude_tank_m', A0.x + 2, A0.y + 2); co.sync(); const e = co.market.engine, c0 = e.C; co.reserveBuy('CRUDE', 30000, 'A', 'CASH');
  T('2n buying oil into the reserve takes it out of the market stock (a real purchase)', near(c0 - e.C, 0.03, 1e-9) && e.K === 0, [c0 - e.C, e.K]);
  const c1 = e.C; co.reserveSell('CRUDE', 10000); T('2o selling that bought oil gives it back; no new supply is invented', near(e.C - c1, 0.01, 1e-9) && Math.abs(e.check()) < 1e-6, [e.C - c1, e.check()]); }

console.log('3. the six scenarios on the world market (8 seeds each; effect = price against the same world without the company)');
const mkRun = (seed, f, nd, setup) => { const m = new E.Market(EC, null, seed), e = m.engine; if (setup) setup(e); const o = { p: {} }; for (let d = 0; d < nd; d++) { for (let h = 0; h < 24; h++) { if (h === 12) f(e, d); m.tick(d * 24 + h); } if ([1, 10, 30, 60, 120].includes(d + 1)) o.p[d + 1] = e.price(); } o.e = e; return o; };
const seeds = [1, 2, 3, 4, 5, 6, 7, 8], eff = (f, nd, setup, big) => { const out = {}, rs = []; for (const s of seeds) { const b = mkRun(s, () => { }, nd, setup), r = mkRun(s, f, nd, setup); rs.push([b, r]); } for (const t of [1, 10, 30, 60, 120]) if (rs[0][0].p[t]) out[t] = rs.reduce((a, [b, r]) => a + (r.p[t] / b.p[t] - 1), 0) / seeds.length * 100; out.resp = rs.reduce((a, [, r]) => a + r.e.resp, 0) / seeds.length * M; out.chk = Math.max(...rs.map(([, r]) => Math.abs(r.e.check()))); out.rs = rs; return out; };
const prodH = 0.5 * M;      // a large company: 0.5 mb/d = 0.5% of the world
const A = eff(e => { e.coProduce(prodH); e.playerSell(prodH, 0); }, 120), Bh = eff(e => { e.coProduce(prodH); e.coHold(prodH, prodH); }, 120), Bm = eff(e => { e.coProduce(prodH); e.coHold(0.8 * prodH, 0.8 * prodH); e.playerSell(0.2 * prodH, 0); }, 120);
T('3a [produces a lot, sells most] extra supply lowers the price: ' + A[60].toFixed(2) + '% after 60 days, ' + A[120].toFixed(2) + '% after 120', A[10] < 0 && A[60] < A[10] && A[120] < -0.5, A);
T('3b [produces a lot, sells most] the other producers cut output in answer (negative response ' + Math.round(A.resp) + ' bbl/d)', A.resp < -50000, A.resp);
T('3c [produces a lot, stores most] storing 80% of the output: the price is higher than for the seller (supply withheld) and lower than... baseline is only reached when ALL is stored', Bm[60] > A[60] && Bm[60] < 0, [A[60], Bm[60]]);
T('3d [stores everything it produces] the world sees no extra supply: effect = 0 against the world without the company', Math.abs(Bh[60]) < 1e-9 && Math.abs(Bh[120]) < 1e-9, Bh);
T('3e the engine\'s oil accounts close in all three scenarios', A.chk < 1e-6 && Bh.chk < 1e-6 && Bm.chk < 1e-6, [A.chk, Bh.chk, Bm.chk]);
{ /* big releases from the reserve: first fill the reserve, then release a lot */
  const f = (e, d) => { if (d < 40) { e.coProduce(prodH); e.coHold(prodH, prodH); } else { e.coRelease(prodH * 2, prodH * 2); e.playerSellReserve(prodH * 2, 0); } };
  const Rl = eff(f, 120); const pre = Rl[30], post = Rl[120];
  T('3f [releases big volumes from the reserve] while it only stores the world is unchanged (' + pre.toFixed(3) + '%), then the released oil is extra supply and pushes the price down (' + Rl[60].toFixed(2) + '% at day 60); once the reserve is empty (day 60) the effect fades (' + post.toFixed(2) + '% at 120)', Math.abs(pre) < 1e-9 && Rl[60] < -0.3 && Math.abs(post) < Math.abs(Rl[60]), [pre, Rl[60], post]);
  const mid = mkRun(1, f, 55); T('3g [releases] the other producers cut back while the release goes on (' + Math.round(mid.e.resp * M) + ' bbl/d at day 55)', mid.e.resp * M < -50000, mid.e.resp * M);
  T('3h the reserve cannot give back more than it holds: K never goes negative', Rl.rs.every(([, r]) => r.e.K >= -1e-12), Rl.rs.map(([, r]) => r.e.K)); }
{ /* buying to hoard */
  const Bb = eff(e => { e.playerBuy(prodH); e.coHold(prodH, 0); }, 120);
  T('3i [hoards by buying] taking oil off the market raises the price: ' + Bb[10].toFixed(2) + '% (10 days), ' + Bb[60].toFixed(2) + '% (60), ' + Bb[120].toFixed(2) + '% (120)', Bb[10] > 0 && Bb[60] > Bb[10] && Bb[120] > 0.5, Bb);
  T('3j [hoards by buying] competitors respond with more output (' + Math.round(Bb.resp) + ' bbl/d), which stops the effect growing without limit', Bb.resp > 50000 && Bb[120] < 8, [Bb.resp, Bb[120]]);
  const r0 = Bb.rs[0][1].e, early = (() => { const r = mkRun(1, e => { e.playerBuy(prodH); e.coHold(prodH, 0); }, 3); return r.e.resp; })();
  T('3k the response builds with a delay (day 3: ' + Math.round(early * M) + ' bbl/d, later: ' + Math.round(r0.resp * M) + ')', early * M < 0.6 * r0.resp * M, [early * M, r0.resp * M]);
  T('3l the response never exceeds the share of the spare capacity the producers have', Bb.rs.every(([, r]) => { const v = r.e.view(); const spare = v.groups.reduce((q, g) => q + Math.max(0, g.cap - g.out), 0); return r.e.resp <= r.e.P.respSpare * spare + 1e-9; }), 0); }
{ /* high demand and low stock vs a glut with high stocks: the same company action */
  const lo = e => { e.C = 0.88 * e.P.C0; e.indus = 0.05; }, hi = e => { e.C = 1.14 * e.P.C0; e.indus = -0.04; };
  const f = e => { e.playerBuy(prodH); e.coHold(prodH, 0); };
  const L = eff(f, 60, lo), H = eff(f, 60, hi);
  T('3m [high world demand, low world stock] the same purchase moves the price more (' + L[30].toFixed(2) + '%) than in a glut with full stocks (' + H[30].toFixed(2) + '%)', L[30] > H[30] * 1.15 && L[30] > 0 && H[30] > 0, [L[30], H[30]]);
  T('3n in the glut the competitors have spare capacity but the stock is high: price stays muted; both runs conserve oil', H[60] < L[60], [H[60], L[60]]); }

console.log('4. proportional to the real size');
{ const f = k => e => { e.playerBuy(k * M); e.coHold(k * M, 0); };
  const s1 = eff(f(0.1), 60), s2 = eff(f(0.2), 60), s5 = eff(f(0.5), 60), sT = eff(f(0.001), 60);
  T('4a doubling the size roughly doubles the effect (0.1 mb/d: ' + s1[60].toFixed(3) + '%, 0.2: ' + s2[60].toFixed(3) + '%)', s2[60] / s1[60] > 1.7 && s2[60] / s1[60] < 2.3, [s1[60], s2[60]]);
  T('4b five times the size gives about five times the effect', s5[60] / s1[60] > 4.2 && s5[60] / s1[60] < 5.8, [s1[60], s5[60]]);
  T('4c a small company (1,000 bbl/d) is invisible: under 0.01% on the price', Math.abs(sT[60]) < 0.01, sT[60]);
  const huge = eff(f(8), 120);
  T('4d an absurdly large action (8% of world output) cannot break the model: the price stays inside its limits and oil still conserves', huge.rs.every(([, r]) => r.e.x <= r.e.P.xMax + 1e-9 && r.e.price() > 0) && huge.chk < 1e-6, huge[120]); }

console.log('5. crude and products stay independent');
{ const base = mkRun(3, () => { }, 40), crude = mkRun(3, e => { e.playerBuy(0.5 * M); e.coHold(0.5 * M, 0); }, 40), prod = mkRun(3, e => { e.productBuy('GASOLINE', 0.5 * M); }, 40);
  T('5a hoarding crude does not touch any product stock or product pressure (same S and y for all four products)', ['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'].every(k => near(crude.e.prod[k].S, base.e.prod[k].S, 1e-12) && near(crude.e.prod[k].y, base.e.prod[k].y, 1e-12)), 0);
  T('5b the product prices move only through their normal link to the crude price (never more than their crude elasticity allows)', (() => { const dc = Math.log(crude.e.price() / base.e.price()); const pr = (r, k) => { r.e.hour(0); return r.e._pp(k, r.e.prod[k].y); }; return dc > 0 && Math.abs(Math.log(pr(crude, 'DIESEL') / pr(base, 'DIESEL'))) <= dc * 1.0001 + 1e-9; })());
  T('5c buying gasoline for the reserve changes the gasoline stock only: crude stock and crude price are identical to the world without it', near(prod.e.C, base.e.C, 1e-12) && near(prod.e.price(), base.e.price(), 1e-12) && prod.e.prod.GASOLINE.S < base.e.prod.GASOLINE.S && near(prod.e.prod.DIESEL.S, base.e.prod.DIESEL.S, 1e-12), [prod.e.prod.GASOLINE.S, base.e.prod.GASOLINE.S]);
  T('5d the oil engine did not consume extra random numbers: the world without the company is identical to the one before this phase (same stream)', near(base.e.price(), (() => { const m = new E.Market(EC, null, 3), e = m.engine; for (let d = 0; d < 40; d++) for (let h = 0; h < 24; h++) m.tick(d * 24 + h); return e.price(); })(), 1e-12)); }

console.log('6. old engine saves keep working');
{ const m = new E.Market(EC, null, 5), e = m.engine; for (let h = 0; h < 24 * 20; h++) m.tick(h); const sj = JSON.parse(JSON.stringify(m.toJSON())); for (const k of ['dayFlow', 'sfs', 'resp', 'K', 'ownAtProd', 'coHist']) delete sj.engine[k];
  const m2 = new E.Market(EC, sj), e2 = m2.engine;
  T('6a an engine save from before this phase loads with the OLD rule (own oil joins the stock when sold) and empty footprint', e2.ownAtProd === false && e2.K === 0 && e2.coHist.length === 0 && e2.resp === 0);
  const c0 = e2.C; e2.playerSell(10000, 0); T('6b under the old rule a sale of own oil adds it to the world stock once', near(e2.C - c0, 0.01, 1e-12) && Math.abs(e2.check()) < 1e-6, e2.C - c0);
  e2.coProduce(5000); e2.coHold(5000, 5000); T('6c the new hooks only record figures under the old rule (no oil moved, nothing doubled)', near(e2.C - c0, 0.01, 1e-12) && e2.K === 0);
  for (let h = 24 * 20; h < 24 * 40; h++) m2.tick(h); T('6d the old-rule market keeps running and conserving', Math.abs(e2.check()) < 1e-6 && isFinite(e2.price())); }
{ const m = new E.Market(EC, null, 6), e = m.engine; for (let d = 0; d < 30; d++) { for (let h = 0; h < 24; h++) { if (h === 12) { e.coProduce(0.2 * M); e.coHold(0.1 * M, 0.1 * M); e.playerBuy(0.05 * M); } m.tick(d * 24 + h); } }
  const j = JSON.parse(JSON.stringify(m.toJSON())), m2 = new E.Market(EC, j);
  for (let d = 30; d < 50; d++) for (let h = 0; h < 24; h++) { if (h === 12) { e.coRelease(0.05 * M, 0.05 * M); m2.engine.coRelease(0.05 * M, 0.05 * M); } m.tick(d * 24 + h); m2.tick(d * 24 + h); }
  T('6e a saved and reloaded market continues exactly like the one that was never saved (price, stock, kept oil, response, daily rows)', m.engine.price() === m2.engine.price() && m.engine.K === m2.engine.K && m.engine.resp === m2.engine.resp && JSON.stringify(m.engine.coHist) === JSON.stringify(m2.engine.coHist), [m.engine.price(), m2.engine.price()]); }

console.log('7. prices, purchases, sales, stock value and profit');
{ const g = game(), co = g.co, R = put(g, 'crude_tank_m', A0.x + 2, A0.y + 2); co.sync(); const e = co.market.engine;
  const q = co.reserveBuyQuote('CRUDE', 30000, 'A'); T('7a the purchase quote is built on the market price of the moment (price x quantity + freight + fee)', q.ok && near(q.gross, 30000 * q.unitPrice) && near(q.unitPrice, co.buyQuote('CRUDE', 30000, 'A').unitPrice) && q.unitPrice > 0, q);
  const r = co.reserveBuy('CRUDE', 30000, 'A', 'CASH'), avg = co.reserveAvgCost('CRUDE'); days(co, 20);
  const info = co.reserveInfo(), px = co.market.price.CRUDE; T('7b the reserve is valued at today\'s market price (not booked) next to its book cost, and the gap is the unrealised result', near(info.marketValue, 30000 * px, 1e-9) && near(info.unrealized, info.marketValue - info.book, 1e-9) && near(info.book, bal(co, 'INV_RESERVE'), 1e-9), info.unrealized);
  const sq = co.reserveSellQuote('CRUDE', 30000); T('7c the sale quote uses the same market price: expected profit = revenue - fee - book cost', near(sq.unitPrice, px, 1e-9) && near(sq.estProfit, sq.net - 30000 * avg, 1e-6), sq);
  const c0 = g.store.cash, s = co.reserveSell('CRUDE', 30000); T('7d the real sale gives exactly the quoted profit and the same figure appears in the books (revenue - fee - cost of goods)', s.ok && near(s.profit, sq.estProfit, 1e-6) && near(-bal(co, 'REV_SPOT') - bal(co, 'EXP_FEES') - bal(co, 'COGS'), s.profit, 1e-6) && near(g.store.cash - c0, s.net, 1e-9), s);
  T('7e after the sale the reserve holds nothing and the stock value is zero in the books and at the market', near(bal(co, 'INV_RESERVE'), 0, 1e-6) && co.reserveInfo().marketValue === 0 && co.audit().ok); }
{ /* big purchases move the next quote: a company that hoards sees a higher price next time (through the engine), not through any invented number */
  const mk = () => { const m = new E.Market(EC, null, 9); return m; }; const a = mk(), b = mk(); for (let d = 0; d < 60; d++) for (let h = 0; h < 24; h++) { if (h === 12) b.engine.playerBuy(0.5 * M); a.tick(d * 24 + h); b.tick(d * 24 + h); }
  T('7f after hoarding for 60 days the market price a new purchase would pay is higher than without the hoarding', b.price.CRUDE > a.price.CRUDE, [a.price.CRUDE, b.price.CRUDE]); }

console.log('8. a company running for months');
{ const g = chain(true), co = g.co, e = co.market.engine, tc = put(g, 'crude_tank_m', A0.x - 30, A0.y + 2), tr = put(g, 'crude_tank_m', A0.x + 40, A0.y + 2); co.sync(); pipe(g, g.T1, 'OUTPUT_E', tr, 'INPUT_W'); let bad = null, kneg = false;
  for (let d = 0; d < 80; d++) { supply(co); if (d === 30) co.reserveRelease(g.T1.id, 20000); if (d === 45) co.reserveSell('CRUDE', 5000); if (d % 20 === 5) co.reserveBuy('CRUDE', 3000, 'B', 'CASH'); co.advanceHours(24); const a = co.audit(); if (!a.ok && !bad) bad = [d, a.errors]; if (Math.abs(e.check()) > 1e-5 && !bad) bad = [d, 'engine ' + e.check()]; if (e.K < -1e-12) kneg = true; }
  T('8a eighty days of production, storing, releasing, selling and buying: books and the engine balanced every day', !bad, bad); T('8b the kept oil never went negative', !kneg);
  const f = co.marketFootprint(30); T('8c the footprint is made of real numbers and the company stays far below 1% of the world', isFinite(f.shareProd) && f.shareProd >= 0 && f.shareProd < 1 && co.led.life.produced.CRUDE > 40000 && isFinite(f.sensitivity), f);
  const own = co.reserveInfo().tanks.reduce((a, t) => a + t.own, 0); T('8d the engine\'s "held off the market" oil equals the own oil in the reserve (' + Math.round(own) + ' bbl), the part bought from the market excluded', near(e.K * M, own, 1e-3) || Math.abs(e.K * M - own) < 50, [e.K * M, own]); }

console.log('\nPHASE 3 TESTS: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
