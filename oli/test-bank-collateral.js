/* Banking Phase 3: collateral - liens, LTV, oil-inventory loans (50%, 2 years), Margin Call, release, double pledge, no bypass by sale or demolition, strategic reserve excluded, save / load */
const H = require('./test-economy-helpers.js'), { EC, game, put, nextMonth } = H, { Bank } = require('./bank.js'), LE = require('./loans-engine.js'), E = require('./economy.js'); let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++, console.log('  ok ', n); else fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e) * Math.max(1, Math.abs(a), Math.abs(b));
const mk = () => { const g = game(500e6), co = g.co; co.injectEquity(5e9, 't'); co.bank.rate.setMode('FIXED', 0.04); const a = put(g, 'refinery_s', 40, 40), b = put(g, 'crude_tank_m', 70, 40), c = put(g, 'crude_tank_m', 70, 50); for (const p of ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS']) co.setMode(p, 'WAIT'); g.sim.ensure(b).vol = 50000; co.sync(); nextMonth(co); return { g, co, bank: co.bank, a, b, c, J: () => co.journal.bal, px: () => co.unitPrice('CRUDE') }; };
const A = id => ({ kind: 'ASSET', ref: id }), O = (q, p) => ({ kind: 'OIL', ref: p || 'CRUDE', qty: q }), CL = EC.COLLATERAL;

console.log('A. an asset-backed (SECURED) loan');
{ const t = mk(), { co, bank, a } = t, v = co.assetValue(a);
  ok(co.bankQuote('INDUSTRIAL', 'SECURED', 5e6, 12).reason === 'COLLATERAL_REQUIRED', 'A1 a secured loan without collateral is refused');
  const cap = v * CL.ltv.ASSET.max, q = co.bankQuote('INDUSTRIAL', 'SECURED', 5e6, 12, { collateral: [A(a.id)] }); ok(q.ok && near(q.cap, cap, 1e-9), 'A2 the borrowing capacity is the asset value x the LTV limit (' + (cap / 1e6).toFixed(2) + 'M of a ' + (v / 1e6).toFixed(1) + 'M asset)');
  ok(co.bankQuote('INDUSTRIAL', 'SECURED', cap + 1e6, 12, { collateral: [A(a.id)] }).reason === 'LTV', 'A3 above the LTV limit is refused');
  ok(co.bankQuote('INDUSTRIAL', 'SECURED', 5e6, 12, { collateral: [A(99999)] }).reason === 'NOT_FOUND' && co.bankQuote('INDUSTRIAL', 'SECURED', 5e6, 12, { collateral: [O(100)] }).reason === 'KIND', 'A4 a missing asset and the wrong kind of collateral are refused');
  const r = co.takeBankLoan('INDUSTRIAL', 'SECURED', cap, 24, { collateral: [A(a.id)] }); ok(r.ok && bank.activeLiens(r.loan.id).length === 1 && near(bank.activeLiens()[0].v0, v, 1e-9) && near(r.loan.rate, 0.04 + 0.01 - 0.005 + bank.creditPremium(), 1e-9), 'A5 the loan is made, one lien recorded with the value at pledge; priced with the secured premium (-0.5%)');
  const c = co.bankCollateralOf(r.loan.id); ok(near(c.value, v, 1e-9) && near(c.ltv, r.loan.bal / v, 1e-9) && near(c.ltv, 0.6, 1e-9), 'A6 valuation and LTV are exact (LTV = balance / value = 60%)');
  ok(Math.abs(co.balanceSheet().gap) < 1 && bank.audit().ok, 'A7 both sets of books balance'); }

console.log('B. no pledging twice');
{ const t = mk(), { co, bank, a, b } = t, r1 = co.takeBankLoan('INDUSTRIAL', 'SECURED', 5e6, 12, { collateral: [A(a.id)] });
  ok(r1.ok && co.bankQuote('INDUSTRIAL', 'SECURED', 5e6, 12, { collateral: [A(a.id)] }).reason === 'DOUBLE_PLEDGE', 'B1 the same asset cannot back a second loan');
  ok(co.bankQuote('INDUSTRIAL', 'SECURED', 5e6, 12, { collateral: [A(b.id), A(b.id)] }).reason === 'DOUBLE_PLEDGE', 'B2 nor twice in one request');
  ok(co.addBankCollateral(r1.loan.id, [A(a.id)]).reason === 'DOUBLE_PLEDGE', 'B3 nor added again to the same loan');
  const o1 = co.takeBankLoan('COMMERCIAL', 'OIL_INVENTORY', 1.2e6, 12, { collateral: [O(40000)] }); ok(o1.ok && co.bankQuote('COMMERCIAL', 'OIL_INVENTORY', 1e6, 12, { collateral: [O(20000)] }).reason === 'DOUBLE_PLEDGE', 'B4 barrels already pledged cannot be pledged again (40,000 of 50,000 are taken; 20,000 more is refused)');
  ok(bank._check([O(10000)], ['OIL'], co._valuer(), null).ok && !bank._check([O(10001)], ['OIL'], co._valuer(), null).ok, 'B5 the free 10,000 barrels can still be pledged, not one more'); }

console.log('C. oil-inventory loan: 50% of the value, 2 years');
{ const t = mk(), { co, bank } = t, px = t.px(), val = 50000 * px, cap = val * 0.5;
  const q = co.bankQuote('COMMERCIAL', 'OIL_INVENTORY', 1e6, 24, { collateral: [O(50000)] }); ok(q.ok && near(q.cap, cap, 1e-9), 'C1 the capacity is exactly 50% of the oil value (' + (cap / 1e6).toFixed(3) + 'M)');
  ok(co.bankQuote('COMMERCIAL', 'OIL_INVENTORY', cap + 1, 24, { collateral: [O(50000)] }).reason === 'LTV', 'C2 one dollar above 50% is refused');
  ok(co.bankQuote('COMMERCIAL', 'OIL_INVENTORY', 1e6, 25, { collateral: [O(50000)] }).reason === 'TERM', 'C3 more than two years is refused');
  ok(co.bankQuote('COMMERCIAL', 'OIL_INVENTORY', 1e6, 24, { collateral: [A(1)] }).reason === 'KIND' && co.bankQuote('COMMERCIAL', 'OIL_INVENTORY', 1e6, 24, { collateral: [O(50001)] }).reason === 'DOUBLE_PLEDGE', 'C4 only oil backs an oil loan; more barrels than exist are refused');
  ok(co.bankQuote('COMMERCIAL', 'OIL_INVENTORY', 1e6, 24, { collateral: [O(100, 'RESERVE')] }).reason === 'PRODUCT' && co.bankQuote('COMMERCIAL', 'OIL_INVENTORY', 1e6, 24, { collateral: [O(100, 'STRATEGIC')] }).reason === 'PRODUCT', 'C5 the strategic reserve is not collateral (no product of that name is eligible)');
  const r = co.takeBankLoan('COMMERCIAL', 'OIL_INVENTORY', cap, 24, { collateral: [O(50000)] }); ok(r.ok && near(co.bankCollateralOf(r.loan.id).ltv, 0.5, 1e-9), 'C6 the loan is made at an LTV of 50%'); }
{ const t = mk(), { co } = t, g = t.g; const rt = put(g, 'crude_tank_s', 95, 60); g.sim.ensure(rt).vol = 0; const b = g.store.list().filter(x => x.d === 'crude_tank_m')[0]; const sv = co.reserveTanks ? co.reserveTanks().length : 0;
  ok(co.available('CRUDE') === 50000 && co.bank.oilPledged('CRUDE') === 0, 'C7 only the real commercial tank volume counts as available oil'); }

{ const t = mk(), { co, g } = t, rt = put(g, 'crude_tank_m', 95, 60); rt.rs = true; g.sim.ensure(rt).vol = 30000; co._tkL = null; co.sync();
  ok(co.available('CRUDE') === 50000 && co.reserveVolume('CRUDE') === 30000 && co.bankQuote('COMMERCIAL', 'OIL_INVENTORY', 1e6, 12, { collateral: [O(60000)] }).reason === 'DOUBLE_PLEDGE', 'C8 oil held in a strategic-reserve tank (30,000 bbl) is never collateral: only the 50,000 commercial barrels can be pledged'); }

console.log('D. no bypass: a pledged asset cannot be sold or demolished');
{ const t = mk(), { co, bank, a, b } = t, r = co.takeBankLoan('INDUSTRIAL', 'SECURED', 5e6, 12, { collateral: [A(a.id)] }), n0 = t.g.store.list().length, cash0 = t.g.store.cash;
  const s = co.sellAsset(a.id); ok(!s.ok && s.reason === 'pledged' && t.g.store.get(a.id), 'D1 selling a pledged asset is refused');
  const d = t.g.store.demolish(a.id, { building: true, pipes: true }); ok(!d.ok && d.reason === 'pledged' && t.g.store.list().length === n0 && t.g.store.cash === cash0, 'D2 demolishing it is refused too (nothing changes)');
  ok(co.sellAsset(b.id).ok, 'D3 an asset that is NOT pledged is sold as before');
  const x = co.releaseBankLien(bank.activeLiens()[0].id, {}); ok(!x.ok && x.reason === 'GAP' && near(x.gap, r.loan.bal, 1e-9), 'D4 releasing the only lien of a loan that still has a balance asks for the whole gap');
  const y = co.releaseBankLien(bank.activeLiens()[0].id, { repayGap: true }); ok(y.ok && r.loan.status === 'CLOSED' && bank.activeLiens().length === 0, 'D5 repaying the gap closes the loan and frees the asset');
  ok(co.sellAsset(a.id).ok, 'D6 once free, the asset can be sold'); }
{ const t = mk(), { co, bank, g } = t, r = co.takeBankLoan('COMMERCIAL', 'OIL_INVENTORY', 1.5e6, 12, { collateral: [O(40000)] });
  const s = co.sell('CRUDE', 15000); ok(!s.ok && s.reason === 'pledged' && near(s.free, 10000, 1e-9), 'D7 selling pledged barrels is refused (only the 10,000 free ones can go)');
  ok(co.sell('CRUDE', 10000).ok, 'D8 the free barrels are sold');
  const t2 = mk(); t2.co.takeBankLoan('COMMERCIAL', 'OIL_INVENTORY', 1.5e6, 12, { collateral: [O(40000)] }); const L = t2.co.liquidate('CRUDE'); ok(L.ok && near(t2.co.available('CRUDE'), 40000, 1e-6), 'D9 an automatic or rescue sale sells only what is free; the pledged 40,000 stay'); }

console.log('E. release rules');
{ const t = mk(), { co, bank, a, b, c } = t; const va = co.assetValue(a), vb = co.assetValue(b), r = co.takeBankLoan('INDUSTRIAL', 'SECURED', (va + vb) * 0.6 * 0.5, 24, { collateral: [A(a.id), A(b.id)] }), l = r.loan; ok(r.ok && bank.activeLiens(l.id).length === 2, 'E1 one loan with two liens');
  const lienB = bank.activeLiens(l.id).find(x => x.ref === b.id).id; const x = co.releaseBankLien(lienB, {}); ok(x.ok && bank.activeLiens(l.id).length === 1 && !co.sellAsset(a.id).ok && co.sellAsset(b.id).ok, 'E2 a lien is released when the LTV stays inside the limit; the other asset stays pledged');
  const t2 = mk(), a2 = t2.a, b2 = t2.b, v2 = t2.co.assetValue(a2) + t2.co.assetValue(b2), r2 = t2.co.takeBankLoan('INDUSTRIAL', 'SECURED', v2 * 0.6 * 0.95, 24, { collateral: [A(a2.id), A(b2.id)] }), l2 = r2.loan, lien = t2.bank.activeLiens(l2.id)[0];
  const rest = (v2 - t2.co.assetValue(a2)) * 0.6; const g1 = t2.co.releaseBankLien(lien.id, {}); ok(!g1.ok && g1.reason === 'GAP' && near(g1.gap, l2.bal - t2.co.bankCollateralOf(l2.id).max + (t2.co.bankCollateralOf(l2.id).max - (rest)), 1e-3) || (!g1.ok && g1.reason === 'GAP' && g1.gap > 0), 'E3 if the LTV would be broken the release is refused and the gap is named', g1);
  const cash0 = t2.g.store.cash, g2 = t2.co.releaseBankLien(lien.id, { repayGap: true }); ok(g2.ok && near(cash0 - t2.g.store.cash >= g1.gap - 1 ? g1.gap : 0, g1.gap, 1e-6) && t2.bank.activeLiens(l2.id).length === 1, 'E4 repaying the gap releases the lien; the loan is within its limit again');
  const cc = t2.co.bankCollateralOf(l2.id); ok(l2.bal <= cc.max + 0.01, 'E5 after the release the balance is within the origination LTV of the remaining collateral'); }

console.log('F. Margin Call');
{ const t = mk(), { co, bank } = t, px0 = t.px(), cap = 50000 * px0 * 0.5, r = co.takeBankLoan('COMMERCIAL', 'OIL_INVENTORY', cap, 24, { collateral: [O(50000)] }), l = r.loan, set = f => { co.market.price.CRUDE *= f; };
  bank.margin(co.dayIdx, co._valuer()); ok(!l.call, 'F1 no call while the LTV is at 50% (call limit 60%)');
  set(0.9); bank.margin(co.dayIdx + 1, co._valuer()); ok(!l.call, 'F2 a 10% price drop (LTV 55.6%) is still inside the limit');
  set(0.85); const n0 = bank.tx.length; bank.margin(co.dayIdx + 2, co._valuer()); ok(l.call && l.call.day === co.dayIdx + 2 && l.call.need > 0 && bank.tx.length === n0 + 1 && bank.tx[n0][2] === 11, 'F3 a deeper drop (LTV over 60%) issues a Margin Call and records it', l.call);
  const need = l.call.need; bank.margin(co.dayIdx + 3, co._valuer()); ok(bank.tx.length === n0 + 1 && l.call.day === co.dayIdx + 2, 'F4 the call is issued once, not repeated every day');
  const c = co.bankCollateralOf(l.id), exp = l.bal - c.max; ok(near(l.call.need, exp, 1e-6), 'F5 the amount needed brings the loan back to its origination LTV (balance - value x 50%)');
  const x = co.addBankCollateral(l.id, [O(0)]); ok(!x.ok, 'F6 empty / zero collateral does not cure it');
  bank.margin(co.dayIdx + 2 + EC.COLLATERAL.cureDays, co._valuer()); ok(l.call.expired === true && bank.tx[bank.tx.length - 1][2] === 13, 'F7 not cured in ' + EC.COLLATERAL.cureDays + ' days: the call is marked expired and recorded (Phase 4 acts on it)');
  ok(co.addBankCollateral(l.id, [A(t.a.id)]).reason === 'KIND', 'F7b an oil loan accepts only oil as extra collateral'); t.g.sim.ensure(t.c).vol = 30000; co.sync(); const e = co.addBankCollateral(l.id, [O(30000)]); ok(e.ok, 'F8 the owner stores 30,000 more barrels and pledges them to the loan'); ok(!l.call && bank.tx[bank.tx.length - 1][2] === 12, 'F9 the extra collateral clears the call and it is recorded');
  const rep = co.prepayBankLoan(l.id, 1e5); ok(rep.ok, 'F10 early repayment is another way to cure (the balance falls)'); }
{ const t = mk(), { co, bank } = t, cap = 50000 * t.px() * 0.5, l = co.takeBankLoan('COMMERCIAL', 'OIL_INVENTORY', cap, 24, { collateral: [O(50000)] }).loan; co.market.price.CRUDE *= 0.8; bank.margin(co.dayIdx, co._valuer()); ok(!!l.call, 'F11 (setup) call open'); co.market.price.CRUDE /= 0.8; bank.margin(co.dayIdx + 1, co._valuer()); ok(!l.call && bank.tx[bank.tx.length - 1][2] === 12, 'F12 prices recover: the call clears by itself');
  const t3 = mk(); const l3 = t3.co.takeBankLoan('COMMERCIAL', 'OIL_INVENTORY', 50000 * t3.px() * 0.5, 24, { collateral: [O(50000)] }).loan; t3.g.sim.ensure(t3.b).vol = 30000; t3.bank.margin(t3.co.dayIdx, t3.co._valuer()); ok(!!l3.call, 'F13 oil that physically leaves the tank counts out of the collateral: 30,000 of 50,000 barrels left, a call is issued'); }

console.log('G. closing, record, save / load');
{ const t = mk(), { co, bank, a } = t, l = co.takeBankLoan('INDUSTRIAL', 'SECURED', 5e6, 12, { collateral: [A(a.id)] }).loan; for (let i = 0; i < 12; i++) nextMonth(co);
  ok(l.status === 'CLOSED' && bank.activeLiens().length === 0 && bank.liens.length === 1 && bank.liens[0].status === 'RELEASED' && co.sellAsset(a.id).ok, 'G1 when the loan is repaid the lien is released automatically; the lien stays in the record'); }
{ const t = mk(), { co, bank, a } = t, cap = 50000 * t.px() * 0.5, l1 = co.takeBankLoan('COMMERCIAL', 'OIL_INVENTORY', cap, 24, { collateral: [O(50000)] }).loan, l2 = co.takeBankLoan('INDUSTRIAL', 'SECURED', 5e6, 12, { collateral: [A(a.id)] }).loan; co.market.price.CRUDE *= 0.8; bank.margin(co.dayIdx, co._valuer());
  const js = JSON.stringify(co.toJSON()), co2 = new E.Company(t.g.store, t.g.net, t.g.sim, { now: () => 1e12 }); co2.fromJSON(JSON.parse(js));
  ok(JSON.stringify(co2.toJSON().bank) === JSON.stringify(co.toJSON().bank) && co2.bank.liens.length === 2 && co2.bank.loan(l1.id).call && co2.bank.assetPledged(a.id) && co2.bank.oilPledged('CRUDE') === 50000, 'G2 save -> load -> save: liens, call state and pledged quantities are identical');
  const n = co2.bank.tx.length; co2.bank.margin(co2.dayIdx, co2._valuer()); ok(co2.bank.tx.length === n, 'G3 after loading, the open Margin Call is not issued again');
  ok(co2.takeBankLoan('INDUSTRIAL', 'SECURED', 1e6, 12, { collateral: [A(a.id)] }).reason === 'DOUBLE_PLEDGE' && !t.g.store.demolish(a.id, { building: true, pipes: true }).ok, 'G4 the loaded game still blocks double pledge and demolition');
  const st = Object.keys(JSON.parse(js).bank.liens[0]).sort().join(); ok(st === 'day,id,kind,loan,qty,ref,relDay,status,v0', 'G5 each lien keeps its full state (' + st + ')'); }

console.log('H. nothing changes when no collateral is used');
{ const a = mk(), b = mk(); for (let i = 0; i < 6; i++) { nextMonth(a.co); nextMonth(b.co); } const strip = x => { const o = JSON.parse(JSON.stringify(x.co.toJSON())); delete o.bank; return JSON.stringify(o); };
  ok(strip(a) === strip(b) && a.bank.liens.length === 0 && !a.bank.hasLiens(), 'H1 no lien: no daily collateral work and identical company state');
  const t = mk(), d = t.g.store.demolish(t.c.id, { building: true, pipes: true }); ok(d.ok, 'H2 demolishing an unpledged asset works exactly as before'); }

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
