// Refinery accounting: every barrel of feed is booked (products, by-product, residue, fuel, flare, loss), crude leaves the tanks only as it is processed,
// efficiency is applied once, materials gate the refinery before any crude is drawn, and the books balance.
const { B, I, E, EC, game, put, pipe } = require('./test-economy-helpers.js');
const assert = require('assert'); let n = 0; const T = (name, ok, detail) => { if (!ok) { console.log('FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); process.exit(1); } n++; console.log('  ok  ' + name); };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(b));
function build(withPumps) {
  const g = game(1e12), co = g.co, ref = put(g, 'refinery_x', 160, 60), j = put(g, 'junction', 120, 60), cts = [], pus = [];
  [[40, 40, 'PORT_N'], [40, 60, 'PORT_W'], [40, 80, 'PORT_S']].forEach(([x, y, port]) => { const ct = put(g, 'crude_tank_l', x, y), pu = put(g, 'pump_station_l', x + 24, y); cts.push(ct); pus.push(pu); pipe(g, ct, 'OUTPUT_E', pu, 'INPUT', 36); pipe(g, pu, 'OUTPUT', j, port, 36); });
  const tg = put(g, 'gasoline_tank_l', 200, 40), td = put(g, 'diesel_tank_l', 200, 60), tj = put(g, 'jet_tank_l', 200, 80), tl = put(g, 'gas_sphere_l', 180, 20);
  pipe(g, j, 'PORT_E', ref, 'CRUDE_IN', 36); pipe(g, ref, 'GASOLINE_OUT', tg, 'INPUT_W', 36); pipe(g, ref, 'DIESEL_OUT', td, 'INPUT_W', 36); pipe(g, ref, 'JET_OUT', tj, 'INPUT_W', 36); pipe(g, ref, 'GAS_OUT', tl, 'INPUT_N', 36);
  co.speed = 0; for (const p of ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) co.setMode(p, 'WAIT');   // hold stock: SPOT would sell it at once
  return { g, co, ref, cts, pus };
}
const restock = co => { for (const m of ['CHEM', 'OPS']) { const room = Math.floor(co.roomFor(m)); if (room > 0) { const r = co.buy(m, room, 'A', 'CASH'); if (!r.ok) throw new Error('restock ' + m + ' ' + r.reason); } } };
const tankSum = cts => cts.reduce((a, c) => a + (c.s ? c.s.vol : 0), 0);
// one hour at a time, summing every output the economy booked
function runHours(x, hours, keepStock) {
  const acc = { feed: 0, GASOLINE: 0, DIESEL: 0, JET_FUEL: 0, GAS: 0, byproduct: 0, residue: 0, fuel: 0, flared: 0, loss: 0, eff: [], lim: [] };
  for (let h = 0; h < hours; h++) { if (keepStock) restock(x.co); x.co.advanceHours(1); const L = x.co.refLast; if (!L) continue;
    acc.feed += L.feed; for (const k of ['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) acc[k] += L.products[k]; for (const k of ['byproduct', 'residue', 'fuel', 'flared', 'loss']) acc[k] += L[k]; acc.eff.push(x.ref.s.eff || 0); acc.lim.push(x.co.matLimit); }
  return acc;
}
console.log('REFINERY ACCOUNTING TESTS');
// 1. the 30,000 bbl/day run: crude leaves the tanks exactly as it is booked, and every barrel is explained
{ const x = build(); for (let i = 0; i < 3; i++) x.co.buy('CRUDE', 250000, 'A'); for (const p of ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) x.co.setMode(p, 'WAIT'); x.co.sync(); restock(x.co);
  x.co.advanceHours(1); const warm = x.co.refLast; T('1 the refinery takes 30,000 bbl/day from three pumps', warm && near(warm.feed * 24, 30000, 1e-3), warm && warm.feed * 24);
  const tank0 = tankSum(x.cts), qty0 = x.co.qty.CRUDE, a = runHours(x, 24 * 3, true), tankDrop = tank0 - tankSum(x.cts), qtyDrop = qty0 - x.co.qty.CRUDE;
  T('2 crude leaves the tanks exactly as much as the refinery books (tank drop = crude counter drop = feed)', near(tankDrop, a.feed, 1e-6) && near(qtyDrop, a.feed, 1e-6), { tankDrop, qtyDrop, feed: a.feed });
  const outs = a.GASOLINE + a.DIESEL + a.JET_FUEL + a.GAS + a.byproduct + a.residue + a.fuel + a.flared + a.loss;
  T('3 mass balance: feed = products + by-product + residue + fuel + flared gas + recorded loss', near(outs, a.feed, 1e-9), { outs, feed: a.feed });
  const e = a.eff[a.eff.length - 1], R = B.CFG ? null : null;
  const yGas = a.GASOLINE / a.feed, expected = e * 0.45;
  T('4 efficiency is applied once: gasoline = feed x efficiency x 45%', near(yGas, expected, 1e-3), { yGas, expected, eff: e });
  T('5 the loss is the part of the feed the efficiency does not convert, not a hidden deduction', near(a.loss + a.flared, a.feed * (1 - e), 0.02), { loss: a.loss, want: a.feed * (1 - e), eff: e });
  T('6 the by-product, residue and fuel shares of the OTHER yield are 60 / 30 / 10 percent', near(a.byproduct / (a.byproduct + a.residue + a.fuel), 0.6, 1e-3) && near(a.residue / (a.byproduct + a.residue + a.fuel), 0.3, 1e-3), { bp: a.byproduct, rs: a.residue, fu: a.fuel });
  const bal = x.co.journal.bal, qty = x.co.qty;
  const costPerBbl = k => bal[k] / qty[k];
  const pairs = [['GASOLINE', 'INV_GASOLINE', qty.GASOLINE], ['DIESEL', 'INV_DIESEL', qty.DIESEL], ['JET_FUEL', 'INV_JET_FUEL', qty.JET_FUEL], ['GAS', 'INV_GAS', qty.GAS], ['BYPRODUCT', 'INV_BYPRODUCT', x.co.qty2.BYPRODUCT]];
  const per = pairs.map(([p, acc, q]) => [p, bal[acc] / q]); T('7 every product carries the same cost per barrel of feed: gasoline, diesel, jet fuel, gas and by-product', per.every(([, c]) => near(c, per[0][1], 1e-6)), per);
  T('8 the cost of a barrel of feed is not charged twice: the work-in-progress account is empty after the run', Math.abs(bal.INV_WIP) < 1e-3, bal.INV_WIP);
  const life = x.co.led.life.produced; T('9 products, by-product and residue are in stock and match the production totals', near(qty.GASOLINE, life.GASOLINE, 1e-9) && near(qty.DIESEL, life.DIESEL, 1e-9) && near(x.co.qty2.BYPRODUCT, life.BYPRODUCT, 1e-9) && near(x.co.qty2.RESIDUE, life.RESIDUE, 1e-9) && life.GASOLINE > 0, { gas: qty.GASOLINE, life: life.GASOLINE });
  T('10 no crude is ever short of the stock counter', x.co.crudeShort < 1e-6, x.co.crudeShort);
  T('11 the books balance and the audit passes after the run', x.co.audit().ok && x.co.journal.check().ok, x.co.audit());
  const json = JSON.parse(JSON.stringify(x.co.toJSON())); T('12 by-product and residue quantities are saved', json.qty2 && json.qty2.BYPRODUCT > 0 && json.qty2.RESIDUE > 0, json.qty2);
}
// 13. no chemicals: the refinery does not run and draws no crude
{ const x = build(); for (let i = 0; i < 3; i++) x.co.buy('CRUDE', 250000, 'A'); x.co.sync(); const t0 = tankSum(x.cts), q0 = x.co.qty.CRUDE;
  const a = runHours(x, 24, false); T('13 without chemicals and operating materials the refinery draws no crude and books no output', near(tankSum(x.cts), t0, 1e-9) && a.feed === 0 && a.GASOLINE === 0 && a.loss === 0 && x.co.matLimit === 0, { t0, now: tankSum(x.cts), feed: a.feed }); }
// 14. partial chemicals: throughput is capped by the stock before any crude is drawn
{ const x = build(); for (let i = 0; i < 3; i++) x.co.buy('CRUDE', 250000, 'A'); x.co.sync(); const ch = x.co.buy('CHEM', 2000, 'A', 'CASH'); if (!ch.ok) throw new Error('chem ' + ch.reason); x.co.buy('OPS', 500, 'A', 'CASH'); x.co.sync();
  const a = runHours(x, 24, false), cap = (2000 / (0.36 / 1)); // CHEM use is 0.36 kg per bbl
  T('14 materials cap the throughput: the feed never exceeds what the chemicals allow (' + Math.round(a.feed) + ' bbl)', a.feed <= 2000 / 0.36 + 1e-6 && a.feed > 0, { feed: a.feed, limit: 2000 / 0.36 }); }
// 15. save and load keep the books
{ const x = build(); for (let i = 0; i < 3; i++) x.co.buy('CRUDE', 250000, 'A'); for (const p of ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) x.co.setMode(p, 'WAIT'); x.co.sync(); restock(x.co); runHours(x, 48, true);
  const j1 = JSON.stringify(x.co.journal.bal), q2 = JSON.stringify(x.co.qty2); const g2 = game(1e12); g2.co.fromJSON(JSON.parse(JSON.stringify(x.co.toJSON())));
  T('15 save and load keep the journal and the by-product / residue stock', JSON.stringify(g2.co.journal.bal) === j1 && JSON.stringify(g2.co.qty2) === q2, { q2, back: g2.co.qty2 }); }
console.log('\nREFINERY ACCOUNTING TESTS PASSED (' + n + ' checks)');
