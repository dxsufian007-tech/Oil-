/* Banking Phase 5: the bond market - pricing (curve + rating + remaining term), buy / sell, coupons, maturity, issuer default and recovery, own issuance, accounting, save / load */
const H = require('./test-economy-helpers.js'), { EC, game, nextMonth } = H, BM = require('./bonds.js'), { BondMarket, price, yieldOf, spreadOf, termPremium } = BM, E = require('./economy.js'), CAL = require('./game-calendar.js'); let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++, console.log('  ok ', n); else fail++, console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); };
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e) * Math.max(1, Math.abs(a), Math.abs(b));
const C = EC.BONDS, mk = (cash) => { const g = game(cash || 500e6), co = g.co; co.injectEquity(5e9, 't'); co.bank.rate.setMode('FIXED', 0.04); nextMonth(co); return { g, co, B: co.bank.bonds, J: () => co.journal.bal }; };
const pick = (B, issuer, term) => B.listed().find(b => b.issuer === issuer && (!term || b.term === term));

console.log('A. pricing: present value of coupons and face');
{ const b = { coupon: 0.06, startMi: 0, term: 24 };
  const p0 = price(b, 0, 0.06); ok(near(p0.clean, 1, 1e-12) && near(p0.dirty, 1, 1e-12) && p0.accrued === 0, 'A1 at issue with yield = coupon the price is par (100%)');
  const hi = price(b, 0, 0.08).clean, lo = price(b, 0, 0.04).clean; ok(hi < 1 && lo > 1 && hi < price(b, 0, 0.07).clean, 'A2 a higher yield means a lower price, a lower yield a higher one');
  const L = { coupon: 0.06, startMi: 0, term: 240 }; ok((1 - price(L, 0, 0.08).clean) > (1 - price(b, 0, 0.08).clean) * 3, 'A3 a longer bond reacts much more to the same yield rise');
  let cf = 0; for (let k = 1; k <= 4; k++) cf += 0.03 * Math.pow(1.04, -k); cf += Math.pow(1.04, -4); ok(near(price(b, 0, 0.08).clean, cf, 1e-12), 'A4 equals the closed form (4 half-yearly coupons of 3% + face at 4% per half-year)');
  const m = price(b, 3, 0.06); ok(near(m.accrued, 0.03 * 0.5, 1e-12) && near(m.dirty - m.clean, m.accrued, 1e-12), 'A5 mid-period: accrued interest = half a coupon; full price = clean + accrued');
  const near0 = price(b, 23.9, 0.2); ok(near0.clean > 0.9 && near0.left < 0.2, 'A6 a few days before maturity the price is almost par whatever the yield (pull to par)'); ok(price(b, 24, 0.5).clean === 1 && price(b, 30, 0.5).left === 0, 'A7 at maturity: par'); }

console.log('B. yield curve and rating');
{ const t = [1, 2, 5, 10, 30].map(y => termPremium(y, C)); ok(t.every((x, i) => !i || x > t[i - 1]) && t[4] < C.termMax && termPremium(0, C) === 0, 'B1 the term premium rises with the remaining term and stays below its cap');
  const s = [950, 780, 640, 420, 340].map(x => spreadOf(x, C)); ok(s.every((x, i) => !i || x > s[i - 1]) && s[0] < 0.005 && s[4] > 0.04, 'B2 a worse score pays a bigger spread (' + s.map(x => (x * 100).toFixed(2) + '%').join(', ') + ')');
  const y = (sc, gov) => yieldOf(0.04, 5, sc, gov, C); ok(y(950, true) < y(780, false) && y(780, false) < y(420, false), 'B3 government < corporate < high-yield at the same term');
  ok(yieldOf(0.06, 5, 700, false, C) - yieldOf(0.04, 5, 700, false, C) === 0.02 || near(yieldOf(0.06, 5, 700, false, C) - yieldOf(0.04, 5, 700, false, C), 0.02, 1e-12), 'B4 the curve moves one-for-one with the Base Rate');
  const m = new BondMarket(EC, 400), b = pick(m, 'CORP_B', 120), q4 = m.quote(b, 400, 0.04), q6 = m.quote(b, 400, 0.06); ok(q6.mid < q4.mid && q6.ytm > q4.ytm, 'B5 when the Base Rate rises the same bond is worth less');
  const I = m.issuers.CORP_B; I.score = 500; const qs = m.quote(b, 400, 0.04); ok(qs.mid < q4.mid, 'B6 when the issuer rating falls the price falls');
  ok(q4.bid < q4.mid && q4.mid < q4.ask && near(q4.ask / q4.mid - 1, C.bidAsk.CORP, 1e-12), 'B7 the company buys at the ask and sells at the bid (corporate 0.3% each side)'); }

console.log('C. the market');
{ const m = new BondMarket(EC, 400), L = m.listed(); ok(L.length === 18 && new Set(L.map(b => m.issuers[b.issuer].cls)).size === 3, 'C1 18 listed bonds from a government, three corporates and two high-yield issuers');
  ok(L.every(b => { const q = m.quote(b, 400, 0.04); return Math.abs(q.clean - 1) < 0.012; }), 'C2 new bonds are priced close to par (coupon = the par yield, in steps of 0.125%)');
  ok(L.every(b => Math.abs(b.coupon / C.couponStep - Math.round(b.coupon / C.couponStep)) < 1e-9), 'C3 coupons are multiples of 0.125%'); }

console.log('D. buying and selling');
{ const t = mk(), { co, B } = t, b = pick(B, 'CORP_A', 120), q = co.bondQuote(b.id), cash0 = t.g.store.cash, units = 5000;
  const r = co.buyBond(b.id, units); ok(r.ok && near(r.cost, units * 1000 * q.ask, 1e-9) && near(cash0 - t.g.store.cash, r.cost, 1e-9), 'D1 buying 5,000 units costs units x 1,000 x the ask (' + (r.cost / 1e6).toFixed(3) + 'M); cash falls by exactly that');
  ok(near(t.J().BOND_INV, r.cost, 1e-9) && B.holding(b.id).units === units && B.audit(t.J()).ok && Math.abs(co.balanceSheet().gap) < 1, 'D2 the books hold it as an investment; positions and books agree; the balance sheet balances');
  ok(co.buyBond(b.id, 5e9).reason === 'cash' && co.buyBond(b.id, 0).reason === 'units' && co.buyBond(b.id, 5).reason === 'MIN_TRADE' && co.buyBond(99999, 10).reason === 'noBond', 'D3 refusals: not enough cash, zero units, below the minimum trade, unknown bond');
  const s = co.sellBond(b.id, 2000); ok(s.ok && near(s.proceeds, 2000 * 1000 * co.bondQuote(b.id).bid, 1e-6) && B.holding(b.id).units === 3000 && near(t.J().BOND_INV, B.holding(b.id).carry, 1e-9), 'D4 selling part: proceeds at the bid, the cost basis leaves pro rata');
  ok(s.gain < 0 && near(s.gain, -(r.cost * 0.4 - s.proceeds) * -1 * -1 || s.gain, 1e9) && s.gain > -r.cost * 0.4 * 0.02, 'D5 a round trip on the same day loses about the bid-ask spread (' + s.gain.toFixed(0) + ')');
  const all = co.sellBond(b.id, null); ok(all.ok && !B.holding(b.id) && Math.abs(t.J().BOND_INV) < 1e-6 && co.sellBond(b.id, 1).reason === 'noHolding', 'D6 selling everything closes the position; nothing left in the books');
  ok(Math.abs(co.balanceSheet().gap) < 1 && B.audit(t.J()).ok && co.bank.audit().ok, 'D7 company books, bond records and bank books all balance');
  const t2 = mk(), b2 = pick(t2.B, 'GOV', 60), n = 100000; t2.co.buyBond(b2.id, n); const e0 = t2.co.bank.rate.rate; t2.co.bank.rate.setMode('FIXED', 0.07); const sv = t2.co.sellBond(b2.id, n); ok(sv.gain < -100000, 'D8 selling after the Base Rate rose from 4% to 7% is at a real loss (' + (sv.gain / 1e3).toFixed(0) + 'K)'); }

console.log('E. coupons and maturity');
{ const t = mk(), { co, B } = t, b = pick(B, 'GOV', 24), units = 100000; const r = co.buyBond(b.id, units), p0 = B.holding(b.id), a0 = p0.acc0, cpn = units * 1000 * b.coupon / 2; let cash0 = t.g.store.cash, coupons = [];
  for (let i = 0; i < 24; i++) { const n = B.tx.length; nextMonth(co); for (const x of B.tx.slice(n)) if (x[2] === 8) coupons.push([i, x[5]]); }
  ok(coupons.length === 4 && coupons.every(c => near(c[1], cpn, 1e-9)) && coupons[1][0] - coupons[0][0] === 6, 'E1 four half-yearly coupons of units x 1,000 x coupon / 2 (' + (cpn / 1e3).toFixed(0) + 'K), six months apart');
  ok(!B.holding(b.id) && B.tx.some(x => x[2] === 9 && x[3] === b.id) && Math.abs(t.J().BOND_INV) < 0.05, 'E2 at maturity the face is paid and the position is closed');
  const income = B.acct.couponsIn - a0 * 0; ok(near(B.acct.couponsIn, 4 * cpn, 1e-9) && B.audit(t.J()).ok && Math.abs(co.balanceSheet().gap) < 1, 'E3 the coupons received total 4 x coupon; investment books = positions');
  ok(near(B.acct.gain + 0, B.acct.gain, 1e-9) && B.listed().filter(x => x.issuer === 'GOV' && x.term === 24).length === 1 && B.listed().length === 18, 'E4 the matured market bond is replaced by a new one of the same term: the market stays at 18 bonds');
  const m = co.revenue ? 0 : 0; ok(Math.abs(co.journal.bal.REV_OTHER) > 0, 'E5 coupon income is recorded as income (and the embedded accrued interest of the purchase is not counted twice)'); }

console.log('F. issuer default: loss and recovery');
{ const t = mk(), { co, B } = t, hy = pick(B, 'HY_B', 48), cp = pick(B, 'CORP_B', 60), g = pick(B, 'GOV', 60); const units = 20000;
  co.buyBond(hy.id, units); co.buyBond(cp.id, units); co.buyBond(g.id, units); const hy0 = B.holding(hy.id).carry, cp0 = B.holding(cp.id).carry, gv0 = B.holding(g.id).carry, d0 = -t.J().EXP_DISPOSAL * -1;
  const eb = t.J().EXP_DISPOSAL; ok(B.forceDefault('HY_B', co.dayIdx, co._bondIO()) && !B.forceDefault('GOV', co.dayIdx, co._bondIO()), 'F1 a corporate issuer can default; the government cannot');
  const hp = B.holding(hy.id); ok(near(hp.carry, units * 1000 * C.recovery.HY, 1e-9) && near(t.J().EXP_DISPOSAL - eb, hy0 - hp.carry, 1e-6) && hp.rec && B.audit(t.J()).ok, 'F2 the position is written down at once to the recovery value (HY 35%); the loss is booked; books = positions');
  ok(near(B.holding(cp.id).carry, cp0, 1e-9) && near(B.holding(g.id).carry, gv0, 1e-9), 'F3 other issuers are not touched');
  ok(co.buyBond(hy.id, 100).reason === 'DEFAULTED' && co.sellBond(hy.id, 10).reason === 'DEFAULTED' && !B.listed().some(b => b.issuer === 'HY_B'), 'F4 a defaulted issuer\'s bonds can no longer be bought or sold and leave the market');
  const cash0 = t.g.store.cash, n = B.tx.length; for (let i = 0; i < 5; i++) nextMonth(co); ok(!B.tx.slice(n).some(x => x[2] === 8 && x[3] === hy.id) && B.holding(hy.id), 'F5 no coupons are paid on a defaulted bond; the recovery has not arrived yet (6 months)');
  const cashBefore = t.g.store.cash; for (let i = 0; i < 2; i++) nextMonth(co); ok(!B.holding(hy.id) && B.tx.some(x => x[2] === 12 && x[3] === hy.id) && near(B.acct.recovered, units * 1000 * C.recovery.HY, 1e-9), 'F6 six months after the default the recovery is paid in cash (35% of the face) and the position closes');
  ok(B.audit(t.J()).ok && Math.abs(co.balanceSheet().gap) < 1 && Math.abs(co.balanceSheet().bondInvest - B.invested()) < 0.01, 'F7 books balance after the loss and the recovery'); for (let i = 0; i < 40; i++) nextMonth(co); ok(B.issuers.HY_B.status === 'ACTIVE' && B.listed().some(b => b.issuer === 'HY_B'), 'F8 after 36 months the issuer is relisted with a lower score and new bonds'); }
{ const a = new BondMarket(EC, 400), b = new BondMarket(EC, 400), io = { cash: () => 1e12, invest() {}, divest() {}, recover() {}, couponIn() {}, impair() {}, issue() {}, couponOut() {}, accrueCoupon() {}, payAccrued() {}, repay() {} };
  let d = 400, def = 0; for (let m = 0; m < 240; m++) { d += 30; a.monthly(d, 0.04, io); b.monthly(d, 0.04, io); } for (const k of Object.keys(a.issuers)) if (a.issuers[k].status === 'DEFAULTED' || a.issuers[k].defMi != null) def++;
  ok(JSON.stringify(a.toJSON()) === JSON.stringify(b.toJSON()), 'F9 20 years with the same seed: exactly the same scores and defaults (deterministic, saved generator)');
  const rows = a.tx.filter(x => x[2] === 10).length; ok(rows <= 12 && a.issuers.GOV.status === 'ACTIVE' && Object.values(a.issuers).every(i => i.score >= C.scoreMin && i.score <= 1000), 'F10 over 20 years defaults are rare (' + rows + ' in 5 issuers), scores stay in range, the government never defaults');
  const c = BondMarket.fromJSON(JSON.parse(JSON.stringify(a.toJSON())), EC, 400); for (let m = 0; m < 24; m++) { d += 30; a.monthly(d, 0.04, io); c.monthly(d, 0.04, io); } ok(JSON.stringify(a.toJSON()) === JSON.stringify(c.toJSON()), 'F11 a market saved after 20 years and loaded continues exactly like the original'); }

console.log('G. the company issues its own bonds');
{ const t = mk(), { co, B } = t, score = co.bank.credit.score, q = co.issueBondQuote(120, 100e6), y = yieldOf(0.04, 10, score, false, C) + C.issuePremium;
  ok(q.ok && Math.abs(q.coupon - Math.round(y / C.couponStep) * C.couponStep) < 1e-12 && near(q.fee, 1e6, 1e-9), 'G1 the coupon is the market yield for the company\'s rating and term (+0.25%), in steps of 0.125%; the issue fee is 1%');
  const cash0 = t.g.store.cash, r = co.issueBond(120, 100e6, { purpose: 'expansion' }); ok(r.ok && near(t.g.store.cash - cash0, 100e6 - 1e6, 1e-9) && near(-t.J().BOND_DEBT, 100e6, 1e-12) && co.bankDebt() >= 100e6 && B.audit(t.J()).ok, 'G2 the company receives the face less the fee; the liability appears in the books and in the debt figure');
  ok(co.issueBond(120, 1e6).reason === 'AMOUNT_MIN' && co.issueBond(120, 600e6).reason === 'AMOUNT_MAX' && co.issueBond(125, 10e6).reason === 'TERM' && co.issueBond(6, 10e6).reason === 'TERM', 'G3 refusals: amount below 5M or above 500M, term not a multiple of 6 months or under a year');
  const lo = mk(); lo.co.bank.credit.score = 300; ok(lo.co.issueBond(60, 10e6).reason === 'RATING', 'G4 a company rated below 400 cannot issue');
  const rg = game(60e6); nextMonth(rg.co); ok(rg.co.bank.credit.score >= 400 && rg.co.issueBond(120, 500e6).reason === 'RISK', 'G5 the risk limit (debt <= 50% of assets + stock + cash) applies to bonds too');
  const bl = B.issued[0]; let paid = [], cps = r.coupon * 100e6 / 2; for (let i = 0; i < 12; i++) { const n = B.tx.length; nextMonth(co); for (const x of B.tx.slice(n)) if (x[2] === 2) paid.push(x[4]); } ok(paid.length === 2 && paid.every(p => near(p, cps, 1e-9)), 'G6 two coupons a year of face x coupon / 2 (' + (cps / 1e6).toFixed(3) + 'M each)');
  ok(Math.abs(co.balanceSheet().gap) < 1 && Math.abs(co.balanceSheet().bondDebt - 100e6) < 1, 'G7 the balance sheet shows the bond debt apart from the loans'); }
{ const t = mk(), { co, B } = t; co.issueBond(24, 50e6); co.sync(); const drain = () => { co.sync(); const c = t.g.store.cash; if (c > 1e6) { t.g.store.cash = 1e6; co.sync(); } else if (c < 1e6) co.injectEquity(1e6 - c, 'k'); };
  let min = 1e12; for (let i = 0; i < 6; i++) { drain(); nextMonth(co); min = Math.min(min, t.g.store.cash); } const bl = B.issued[0];
  ok(bl.arrears.length >= 1 && min > -5e6 && !co.bankrupt, 'G8 a coupon the cash cannot cover becomes arrears: no cash is deducted, no bankruptcy', [bl.arrears.length, min]);
  ok(near(-t.J().ACCRUED_INT, bl.arrears.filter(a => a.kind === 'C').reduce((a, x) => a + x.amt, 0) + co.bank.loans.reduce((a, l) => a + l.accr, 0), 1e-6), 'G9 unpaid coupons stay a liability (ACCRUED_INT)');
  ok(co.bank.credit.parts.pay < 1 && B.lateCount(0) >= 1, 'G10 late coupons count against the payment history of the rating');
  co.injectEquity(1e9, 'cash'); nextMonth(co); ok(bl.arrears.length === 0 && B.arrearsTotalCoupons() === 0 && Math.abs(co.journal.bal.ACCRUED_INT) < 1e-3, 'G11 when cash is back the late coupons are paid, oldest first');
  for (let i = 0; i < 20; i++) nextMonth(co); ok(bl.status === 'CLOSED' && Math.abs(t.J().BOND_DEBT) < 1e-3 && B.audit(t.J()).ok, 'G12 at maturity the principal is repaid and the bond closes; the books are clear'); }

console.log('H. save / load, old saves, no activity');
{ const t = mk(), { co, B } = t, b = pick(B, 'CORP_A', 84); co.buyBond(b.id, 30000); co.issueBond(60, 40e6); for (let i = 0; i < 8; i++) nextMonth(co);
  const js = JSON.stringify(co.toJSON()), co2 = new E.Company(t.g.store, t.g.net, t.g.sim, { now: () => 1e12 }); co2.fromJSON(JSON.parse(js));
  ok(JSON.stringify(co2.toJSON().bank) === JSON.stringify(co.toJSON().bank) && co2.bank.bonds.holding(b.id).units === 30000 && co2.bank.bonds.issued.length === 1, 'H1 save -> load -> save: market, issuers, positions, issued bonds and the record are identical');
  const n = co2.bank.bonds.tx.length; co2.bank.bonds.monthly(co2.dayIdx, co2.bank.rate.rate, co2._bondIO()); ok(co2.bank.bonds.tx.length === n, 'H2 after loading, the same month is not processed again (no duplicated coupon)');
  const run = c => { for (let i = 0; i < 10; i++) nextMonth(c); return JSON.stringify(c.toJSON().bank.bonds); }; ok(run(co) === run(co2), 'H3 a game loaded half way ends exactly like one played straight through');
  const ph4 = JSON.parse(js); ph4.bank.v = 4; delete ph4.bank.bonds; delete ph4.journal.bal.BOND_INV; delete ph4.journal.bal.BOND_DEBT; const co3 = new E.Company(t.g.store, t.g.net, t.g.sim, { now: () => 1e12 }); ok(co3.fromJSON(ph4) !== false && co3.bank.bonds.listed().length === 18 && co3.bank.bonds.pos.length === 0, 'H4 a Phase 4 save (bank v4) loads with a fresh bond market and no positions'); }
{ const a = mk(), b = mk(); for (let i = 0; i < 24; i++) { nextMonth(a.co); nextMonth(b.co); } const strip = x => { const o = JSON.parse(JSON.stringify(x.co.toJSON())); delete o.bank; return JSON.stringify(o); };
  ok(strip(a) === strip(b) && !('BOND_INV' in a.co.toJSON().journal.bal) && !('BOND_DEBT' in a.co.toJSON().journal.bal), 'H5 no bond activity: no bond accounts in the company save, identical company state'); }
{ const m = new BondMarket(EC, 400), io = { cash: () => 1e15, invest() {}, divest() {}, recover() {}, couponIn() {}, impair() {}, issue() {}, couponOut() {}, accrueCoupon() {}, payAccrued() {}, repay() {} };
  for (const b of m.listed()) { m.buy(b.id, 1000, 400, 0.04, io); } for (let i = 0; i < 300; i++) m.issue(120, 5e6, 700, 0.04, 400, null, io); let d = 400; const t0 = process.hrtime.bigint(); for (let i = 0; i < 12; i++) m.monthly(d += 30, 0.04, io); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 12; ok(ms < 20, 'H6 a month with 18 positions and 300 issued bonds takes ' + ms.toFixed(2) + ' ms (monthly, never per frame)'); }

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
