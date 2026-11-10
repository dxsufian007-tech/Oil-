/* Refinery accounting v2: full load, power at 75% / 50%, short crude, sell-all, residue and fuel, stop / restart, no double counting, physical = ledger.
 * node oli/test-refinery-v2.js   (one table per scenario; every check must pass)
 * Efficiency limits how much crude the plant can take in (its available capacity). Yields apply to the crude processed. Loss is only the physical-loss rate. */
const { B, I, E, EC, game, put, pipe } = require('./test-economy-helpers.js'), BC = require('./building-config.js');
let pass = 0, fail = 0; const CHK = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1e-6 : t) * Math.max(1, Math.abs(a), Math.abs(b));
const PRODS = ['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'], TARGET = 3 * B.DEFS.pump_station_l.params.maxFlow, R0 = x => Math.round(x);

/* layout: three crude tanks, three pumps (10,000 each), a junction, one pipe into the refinery, product tanks */
function plant(size, cfg) {
  const g = game(1e12, cfg), co = g.co, ref = put(g, size === 'x' ? 'refinery_x' : 'refinery_s', 160, 60), j = put(g, 'junction', 120, 60), cts = [];
  [[40, 40, 'PORT_N'], [40, 60, 'PORT_W'], [40, 80, 'PORT_S']].forEach(([x, y, port]) => { const ct = put(g, 'crude_tank_l', x, y), pu = put(g, 'pump_station_l', x + 24, y); cts.push(ct); pipe(g, ct, 'OUTPUT_E', pu, 'INPUT', 36); pipe(g, pu, 'OUTPUT', j, port, 36); });
  const tg = put(g, 'gasoline_tank_l', 200, 40), td = put(g, 'diesel_tank_l', 200, 60), tj = put(g, 'jet_tank_l', 200, 80), tl = put(g, 'gas_sphere_l', 180, 20);
  pipe(g, j, 'PORT_E', ref, 'CRUDE_IN', 36); pipe(g, ref, 'GASOLINE_OUT', tg, 'INPUT_W', 36); pipe(g, ref, 'DIESEL_OUT', td, 'INPUT_W', 36); pipe(g, ref, 'JET_OUT', tj, 'INPUT_W', 36); pipe(g, ref, 'GAS_OUT', tl, 'INPUT_N', 36);
  return { g, co, ref, cts, sim: g.sim };
}
const tanksVol = P => P.cts.reduce((a, c) => a + P.sim.ensure(c).vol, 0);
const restock = co => { for (const m of ['CHEM', 'OPS']) { const room = Math.floor(co.roomFor(m)); if (room > 0) co.buy(m, room, 'A', 'CASH'); } };
const sumPre = (bal, pre) => Object.entries(bal).filter(([k]) => k.startsWith(pre)).reduce((a, [, v]) => a + v, 0);
/* demand of the plant at full power (grid far above the need) */
const fullCfg = () => { const c = JSON.parse(JSON.stringify(EC)); c.POWER.tiers[0].kw = 1e9; return c; };
const DEMAND = (() => { const P = plant('x', fullCfg()); run(P, 1); return P.co.pw.demand; })();
const cfgPower = (frac, size) => { const c = JSON.parse(JSON.stringify(EC)); c.POWER.tiers[0].kw = Math.round((size === 's' ? DEMAND_S : DEMAND) * frac); return c; };
const DEMAND_S = (() => { const P = plant('s', fullCfg()); run(P, 1); return P.co.pw.demand; })();

/* runs `days` days hour by hour; records every journal posting of the refinery window. opts: crudeEach, stopDays, sellAll */
function run(P, days, opts) {
  opts = opts || {}; const co = P.co, s = P.sim.ensure(P.ref), J = co.journal, postsByType = {}; const orig = J.post.bind(J);
  J.post = (meta, lines) => { const t = meta.type; (postsByType[t] = postsByType[t] || {}); for (const [a, v] of lines) postsByType[t][a] = (postsByType[t][a] || 0) + v; return orig(meta, lines); };
  for (const ct of P.cts) co.buy('CRUDE', opts.crudeEach || 250000, 'A', 'CASH'); co.sync();
  for (const p of ['CRUDE', ...PRODS]) co.setMode(p, 'WAIT'); co.speed = 0; co.sync();
  const bal0 = Object.assign({}, J.bal), crude0 = (co.qty.CRUDE + co.bq), tank0 = tanksVol(P), phys0 = Object.fromEntries(PRODS.map(p => [p, co.physicalVol(p)])), qty0 = Object.assign({}, co.qty), qty20 = Object.assign({}, co.qty2);
  const rows = []; let effSum = 0, effN = 0; const tot = { processed: 0, products: { GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0 }, byproduct: 0, residue: 0, fuel: 0, flared: 0, loss: 0 };
  for (let d = 1; d <= days; d++) {
    s.opLimit = (opts.stopDays || []).includes(d) ? 0 : 1;
    const t0 = tanksVol(P), q0 = (co.qty.CRUDE + co.bq), row = { day: d, processed: 0, eff: 0 }; let eff = 0, en = 0;
    for (let h = 0; h < 24; h++) { restock(co); co.advanceHours(1); const L = co.refLast; if (!L) continue;
      row.processed += L.feed; tot.processed += L.feed; for (const k of PRODS) tot.products[k] += L.products[k]; for (const k of ['byproduct', 'residue', 'fuel', 'flared', 'loss']) tot[k] += L[k];
      if (s._eff) { eff += s._eff; en++; } }
    row.eff = en ? eff / en : 0; effSum += row.eff; effN++; row.tankDrop = t0 - tanksVol(P); row.crudeDrop = q0 - (co.qty.CRUDE + co.bq); rows.push(row);
  }
  J.post = orig;
  const bal = J.bal, delta = k => (bal[k] || 0) - (bal0[k] || 0);
  return { P, co, rows, tot, bal, delta, bal0, postsByType, crude0, crudeNow: (co.qty.CRUDE + co.bq), tank0, tankNow: tanksVol(P), phys0, qty0, qty20, eff: effN ? effSum / effN : 0, target: TARGET * days, power: co.pw.factor };
}
function report(name, R) {
  console.log('\n== ' + name); console.table(R.rows.map(x => ({ day: x.day, processed: R0(x.processed), tankDrop: R0(x.tankDrop), crudeCounter: R0(x.crudeDrop), eff: +x.eff.toFixed(3) })));
  const t = R.tot, delta = R.delta, cost = PRODS.reduce((a, p) => a + delta('INV_' + p), 0) + delta('INV_BYPRODUCT') + delta('INV_RESIDUE') + delta('EXP_FUEL') + delta('EXP_LOSS');
  const rev = -(sumPre(R.bal, 'REV_') - sumPre(R.bal0, 'REV_')), cogs = sumPre(R.bal, 'COGS') - sumPre(R.bal0, 'COGS'), exp = sumPre(R.bal, 'EXP_') - sumPre(R.bal0, 'EXP_');
  const row = { 'الخام المطلوب': R0(R.target), 'الخام الداخل': R0(t.processed), 'المتبقي بالمخزون': R0(R.tankNow), 'بنزين': R0(t.products.GASOLINE), 'ديزل': R0(t.products.DIESEL), 'جت': R0(t.products.JET_FUEL), 'غاز': R0(t.products.GAS), 'منتج ثانوي': R0(t.byproduct), 'بقايا': R0(t.residue), 'وقود داخلي': R0(t.fuel), 'فاقد': R0(t.loss), 'تكلفة المخرجات': R0(cost), 'الإيرادات': R0(rev), 'تكلفة المبيعات': R0(cogs), 'المصروفات': R0(exp), 'صافي الربح': R0(rev - cogs - exp), 'الكفاءة': +R.eff.toFixed(3), 'عامل الطاقة': +R.power.toFixed(3) };
  console.table([row]); return { cost, rev, cogs, exp, row };
}
/* the checks every scenario must pass: mass balance, one deduction per barrel, cost booked once, WIP cleared, ledger audit */
function CHECKS(tag, R) {
  const t = R.tot, outs = PRODS.reduce((a, k) => a + t.products[k], 0) + t.byproduct + t.residue + t.fuel + t.flared + t.loss;
  CHK(tag + ' mass balance: outputs (products, by-product, residue, fuel, flare, loss) = crude processed', near(outs, t.processed, 1e-6), { outs, processed: t.processed });
  CHK(tag + ' tanks drop = processed = crude counter drop (no double deduction)', near(R.tank0 - R.tankNow, t.processed, 1e-6) && near(R.crude0 - R.crudeNow, t.processed, 1e-6), { tanks: R.tank0 - R.tankNow, counter: R.crude0 - R.crudeNow, processed: t.processed });
  const debit = ['REFINE_IN', 'REFINE_IN_BUY', 'PROD_REFINERY'].reduce((a, k) => a + ((R.postsByType[k] || {}).INV_WIP || 0), 0);
  const credit = Object.keys(R.postsByType).filter(k => k.startsWith('REFINE_') && k !== 'REFINE_IN' && k !== 'REFINE_IN_BUY').reduce((a, k) => a - ((R.postsByType[k] || {}).INV_WIP || 0), 0);
  CHK(tag + ' cost in (crude + refinery operating) = cost out (every barrel cost booked once)', near(debit, credit, 1e-6) || Math.abs(debit - credit) < 1e-3, { debit, credit });
  CHK(tag + ' WIP cleared at the end', Math.abs(R.bal.INV_WIP || 0) < 1e-3, R.bal.INV_WIP);
  CHK(tag + ' ledger audit ok', R.co.audit().ok === true, R.co.audit().errors);
}

/* 1. full design load: 30,000 bbl/day, full power */
let S1;
{ const P = plant('x', fullCfg()); const R = run(P, 5); S1 = R; report('1. الحمل التصميمي الكامل (30,000 برميل/يوم)', R); CHECKS('1', R);
  CHK('1 processes the full feed (3 pumps, 30,000 before the pump upgrade)', near(R.tot.processed, TARGET * 5, 1e-6), R.tot.processed);
  CHK('1 full power: power factor 1', R.power >= 0.999, R.power);
  CHK('1 yields exact (gasoline 45%, diesel 30%)', near(R.tot.products.GASOLINE, R.tot.processed * .45, 1e-6) && near(R.tot.products.DIESEL, R.tot.processed * .30, 1e-6), R.tot.products);
  CHK('1 no physical loss at rate 0; efficiency not booked as loss', R.tot.loss === 0 && R.eff > 0 && R.eff < 1, { loss: R.tot.loss, eff: R.eff }); }

/* 2. available power 75% then 50% of the plant's demand (refinery_x: capacity is not the limit, so throughput stays 30,000) */
const P2 = {};
for (const frac of [0.75, 0.5]) { const P = plant('x', cfgPower(frac)); const R = run(P, 5); P2[frac] = R; report('2. الطاقة المتاحة ' + Math.round(frac * 100) + '% من المطلوب (المصفاة الكبيرة)', R); CHECKS('2.' + frac, R);
  CHK('2.' + frac + ' power factor follows the available power', Math.abs(R.power - frac) < 0.05, R.power);
  CHK('2.' + frac + ' efficiency falls with the power (not a loss)', R.eff < S1.eff - 1e-9, { eff: R.eff, full: S1.eff });
  CHK('2.' + frac + ' processing capacity is not limiting here: throughput stays at the feed rate and yields are unchanged', near(R.tot.processed, TARGET * 5, 1e-6) && near(R.tot.products.GASOLINE, R.tot.processed * .45, 1e-6), R.tot.processed); }

/* 2b. the same power cut where capacity binds (refinery_s, 5,000 bbl/day nameplate): efficiency limits what is taken in, the rest stays in the tanks */
const SMALL = {};
for (const [name, cfg] of [['full', fullCfg()], ['75', cfgPower(0.75, 's')], ['50', cfgPower(0.5, 's')]]) { const P = plant('s', cfg); const R = run(P, 5); SMALL[name] = R; report('2b. مصفاة صغيرة (سعة 5,000) - الطاقة ' + name, R); CHECKS('2b.' + name, R);
  CHK('2b.' + name + ' unprocessed crude stays in the tanks (not deducted)', R.tankNow > 0 && near(R.tank0 - R.tankNow, R.tot.processed, 1e-6), { tankNow: R.tankNow, processed: R.tot.processed }); }
CHK('2b efficiency limits the crude taken in: less power, less processed', SMALL['50'].tot.processed < SMALL['75'].tot.processed && SMALL['75'].tot.processed < SMALL.full.tot.processed, { full: SMALL.full.tot.processed, p75: SMALL['75'].tot.processed, p50: SMALL['50'].tot.processed });

/* 3. not enough crude in the tanks: 6,000 bbl in total */
{ const P = plant('x', fullCfg()); const R = run(P, 5, { crudeEach: 2000 }); report('3. الخام غير كافٍ (6,000 برميل إجمالاً)', R); CHECKS('3', R);
  CHK('3 processes exactly the crude available', near(R.tot.processed, 6000, 1e-6), R.tot.processed);
  CHK('3 tanks end empty; nothing taken twice', R.tankNow < 1e-6 && near(R.tank0 - R.tankNow, R.tot.processed, 1e-6)); }

/* 4. sell every product and the by-product; residue has no market and stays in stock at zero value */
{ const P = plant('x', fullCfg()); const R = run(P, 5), co = R.co, rows = []; let revT = 0, cogsT = 0;
  for (const p of PRODS) { const c0 = co.journal.bal.COGS || 0, q = co.available(p); co.setMode(p, 'SPOT'); const r = co.sell(p, q); const c = (co.journal.bal.COGS || 0) - c0; if (r.ok) { revT += r.gross; cogsT += c; rows.push({ 'الصنف': p, 'الكمية': R0(r.qty), 'السعر': +r.price.toFixed(2), 'الإيراد': R0(r.gross), 'التكلفة': R0(c), 'الهامش %': +((r.gross - c) / r.gross * 100).toFixed(1) }); } }
  const bp = co.sellByproduct(co.qty2.BYPRODUCT); if (bp.ok) { revT += bp.gross; cogsT += bp.cost; rows.push({ 'الصنف': 'منتج ثانوي', 'الكمية': R0(bp.qty), 'السعر': +bp.price.toFixed(2), 'الإيراد': R0(bp.gross), 'التكلفة': R0(bp.cost), 'الهامش %': +((bp.gross - bp.cost) / bp.gross * 100).toFixed(1) }); }
  console.log('\n== 4. بيع جميع المنتجات والمنتج الثانوي'); console.table(rows);
  const rep = report('4. النتيجة بعد البيع', R); CHECKS('4', R);
  CHK('4 all sellable stock sold', PRODS.every(p => co.available(p) < 1e-3) && co.qty2.BYPRODUCT < 1e-6, { gas: co.available('GAS') });
  CHK('4 ledger revenue = sum of sales', near(rep.rev, revT, 1e-6), { ledger: rep.rev, sales: revT });
  CHK('4 ledger COGS = cost of barrels sold', near(rep.cogs, cogsT, 1e-6), { ledger: rep.cogs, sales: cogsT });
  CHK('4 residue still recorded: quantity kept, zero value (not treated as absent)', co.qty2.RESIDUE > 0 && Math.abs(R.bal.INV_RESIDUE || 0) < 1e-3, { q: co.qty2.RESIDUE, v: R.bal.INV_RESIDUE }); }

/* 5. residue and internal fuel recorded separately (scenario 1) */
{ const R = S1; CHK('5 residue recorded as its own quantity', near(R.co.qty2.RESIDUE, R.tot.residue, 1e-6), { q: R.co.qty2.RESIDUE, residue: R.tot.residue });
  CHK('5 internal fuel is an expense (EXP_FUEL), not a product in stock', R.delta('EXP_FUEL') > 0 && !('FUEL' in R.co.qty) && R.delta('INV_FUEL') === 0, R.delta('EXP_FUEL')); }

/* 6. stop and restart: throttle 0 on day 2 */
{ const P = plant('x', fullCfg()); const co = P.co; const origRun = run; const R = origRun(P, 5, { stopDays: [2] }); report('6. توقف يوم ثم إعادة التشغيل', R); CHECKS('6', R);
  CHK('6 stopped day: nothing processed, tanks do not move', R.rows[1].processed < 1e-6 && R.rows[1].tankDrop < 1e-6, R.rows[1]);
  CHK('6 restart: full rate again', near(R.rows[2].processed, TARGET, 1e-6), R.rows[2]); }

/* 7. no double count of crude: physical volume of each product moved exactly by its quantity */
{ const R = S1; CHK('7 physical tank volume moved = quantity booked, each product', PRODS.every(p => near(R.co.physicalVol(p) - R.phys0[p], R.co.qty[p] - R.qty0[p], 1e-6)), PRODS.map(p => [p, R.co.physicalVol(p) - R.phys0[p], R.co.qty[p] - R.qty0[p]])); }

/* 8. physical balance = ledger balance: crude in = outputs; ledger cost moved out of WIP = cost booked in */
{ const R = S1; const costIn = (R.postsByType.REFINE_IN || {}).INV_WIP || 0, costOut = R.delta('INV_GASOLINE') + R.delta('INV_DIESEL') + R.delta('INV_JET_FUEL') + R.delta('INV_GAS') + R.delta('INV_BYPRODUCT') + R.delta('INV_RESIDUE') + R.delta('EXP_FUEL') + R.delta('EXP_LOSS') - ((R.postsByType.PROD_REFINERY || {}).INV_WIP || 0) * 0;
  CHK('8 physical crude in = products + by-product + residue + fuel + flare + loss', near(PRODS.reduce((a, k) => a + R.tot.products[k], 0) + R.tot.byproduct + R.tot.residue + R.tot.fuel + R.tot.flared + R.tot.loss, R.tot.processed, 1e-6));
  const dbt = ['REFINE_IN', 'REFINE_IN_BUY', 'PROD_REFINERY'].reduce((a, k) => a + ((R.postsByType[k] || {}).INV_WIP || 0), 0); CHK('8 ledger cost in = ledger cost out (inventory + fuel + loss)', Math.abs(costOut - dbt) < 1e-3 * Math.max(1, dbt), { costOut, dbt }); }

/* 9. physical loss is its own line: 2% of the crude processed, efficiency and yields unchanged */
{ const old = BC.REFINERY.physicalLoss; BC.REFINERY.physicalLoss = 0.02; try { const P = plant('x', fullCfg()); const R = run(P, 5); report('9. فاقد فيزيائي 2% (منفصل عن الكفاءة)', R); CHECKS('9', R);
  CHK('9 physical loss = 2% of the crude processed', near(R.tot.loss, R.tot.processed * 0.02, 1e-6), { loss: R.tot.loss, processed: R.tot.processed });
  CHK('9 efficiency unchanged by the loss rate', near(R.eff, S1.eff, 1e-9), { loss9: R.eff, s1: S1.eff });
  CHK('9 gasoline = processed x (1 - loss rate) x 45%: the yield is applied to what is not lost', near(R.tot.products.GASOLINE, R.tot.processed * 0.98 * 0.45, 1e-6), R.tot.products);
} finally { BC.REFINERY.physicalLoss = old; } }

/* 10. purchased chemicals and operating materials are not prerequisites for refining */
{ const P = plant('x', fullCfg()), co = P.co; for (const ct of P.cts) co.buy('CRUDE', 250000, 'A', 'CASH'); co.sync(); const s = P.sim.ensure(P.ref);
  co.advanceHours(1);
  CHK('10 refinery material gate stays open with zero CHEM / OPS stock', s.matLim === 1 && co.matLimit === 1, { lim: s.matLim, stock: co.mats });
  CHK('10 refinery processes crude without purchasing CHEM / OPS', co.refLast && co.refLast.feed > 0 && P.sim.status(P.ref) === 'RUNNING', { feed: co.refLast && co.refLast.feed, status: P.sim.status(P.ref) });
  CHK('10 refinery does not consume legacy CHEM / OPS stock', co.mats.CHEM === 0 && co.mats.OPS === 0, co.mats); }

console.log('\nREFINERY V2 TESTS: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
