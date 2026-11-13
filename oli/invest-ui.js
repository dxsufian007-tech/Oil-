/* Oli - invest-ui.js : the INVESTMENT system of the Company tab (نظام الاستثمار), placed after the loans & financing system.
 * Four sections: overview, portfolio, bonds (market / my holdings / my issued bonds, with buy, sell and issue) and the investment operations log.
 * It reads and drives the SAME bond engine as the rest of the game (bonds.js through co.buyBond / co.sellBond / co.issueBond): no second engine, no own prices.
 * Accounting is kept apart from the loans: a bond the company OWNS is an asset (BOND_INV, shown here); a bond the company ISSUED is a debt (BOND_DEBT, it also counts in the debt summary of the loans system, one line, never mixed with the value of owned bonds).
 * The only real investment instrument in the game is the bond market, so the portfolio is the bond portfolio; nothing else is invented.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game-calendar.js'), require('./economy-config.js'));
  else root.OliInvestUI = factory(root.OliCalendar, root.OliEconomyConfig);
})(typeof self !== 'undefined' ? self : this, function (CAL, EC) {
  'use strict';
  const SECS = [['over', 'نظرة عامة'], ['port', 'المحفظة الاستثمارية'], ['bonds', 'السندات'], ['log', 'سجل العمليات']], SUBS = [['mkt', 'سوق السندات'], ['mine', 'محفظتي'], ['iss', 'سنداتي الصادرة']];
  const st = { sec: 'over', sub: 'mkt', cls: 'ALL', sel: null, mode: null, units: 0, msg: null, more: false, iss: { term: 60, amount: 50e6 } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const money = v => (v < 0 ? '−' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US'), pct = (v, d) => (v * 100).toFixed(d == null ? 2 : d) + '%', n0 = v => Math.round(v).toLocaleString('en-US');
  const kv = (a, b, c) => '<div class="es-kv"><span>' + a + '</span><span dir="ltr" class="' + (c || '') + '">' + b + '</span></div>', card = (t, b) => '<div class="es-card"><h5>' + t + '</h5>' + b + '</div>', note = t => '<div class="es-sm" style="margin-top:6px">' + t + '</div>';
  const btn = (act, v, label, on, extra) => '<button data-act="' + act + '" data-v="' + esc(v) + '"' + (extra || '') + ' class="' + (on ? 'on' : '') + '">' + label + '</button>';
  const CLS = { GOV: 'حكومي', CORP: 'شركات', HY: 'عالي العائد' }, BST = { ACTIVE: 'جارٍ', MATURED: 'مستحق', CLOSED: 'مُغلق' };
  const BTX = { 1: 'إصدار سند', 2: 'كوبون مدفوع', 3: 'كوبون متأخر', 4: 'سداد كوبون متأخر', 5: 'سداد أصل السند', 6: 'شراء سند', 7: 'بيع سند', 8: 'كوبون مقبوض', 9: 'استحقاق سند', 10: 'تعثر مصدّر', 11: 'انخفاض قيمة', 12: 'استرداد', 13: 'إعادة إدراج مصدّر' };
  const INV_CODES = [6, 7, 8, 9, 10, 11, 12, 13], WHY = { noBond: 'السند غير موجود', DEFAULTED: 'المصدّر متعثر', units: 'عدد الوحدات غير صالح', MIN_TRADE: 'أقل من الحد الأدنى للصفقة', cash: 'النقد لا يكفي', noHolding: 'لا تملك هذا السند', bankrupt: 'الشركة مفلسة', TERM: 'أجل غير مسموح', AMOUNT_MIN: 'المبلغ أقل من الحد الأدنى للإصدار', AMOUNT_MAX: 'المبلغ أكبر من الحد الأقصى للإصدار', RATING: 'تصنيفك الائتماني أقل من الحد المطلوب للإصدار', RESTRICTED: 'الإصدار مقيَّد الآن (ضغط ديون أو تعثر)', RISK: 'تجاوز حد المخاطر: الدين بعد الإصدار أكبر من 50% من الأصول والمخزون والنقد' };
  const why = r => WHY[r] || String(r), dateOf = d => { const x = CAL.dateOfDay(d); return x.day + ' ' + CAL.MONTHS_AR[x.month - 1] + ' ' + x.year; };
  const F = () => EC.BONDS.unitFace;

  /* every figure of the overview comes from here (read when the screen is drawn) */
  function figures(co) {
    const B = co.bank.bonds, base = co.bank.rate.rate; let mv = 0, cost = 0, unreal = 0, n = 0, def = 0;
    for (const p of B.pos) { const b = B.bond(p.bond); n++; cost += p.carry; if (p.rec) { mv += p.carry; def += p.carry; continue; } const q = B.quote(b, co.dayIdx, base), v = p.units * F() * q.bid; mv += v; unreal += v - p.carry; }
    const a = B.acct, cash = co.store.cash, impaired = a.impaired;
    return { mv, cost, unreal, n, def, gain: a.gain, couponsIn: a.couponsIn, impaired, recovered: a.recovered, total: unreal + a.gain + a.couponsIn - impaired, share: cash + cost > 0 ? cost / (cash + cost) : 0, cash, debt: B.debt(), bought: a.bought, sold: a.sold };
  }
  const tabs = () => '<div class="es-row" style="margin:6px 0 10px;flex-wrap:wrap">' + SECS.map(s => btn('ivSec', s[0], s[1], st.sec === s[0])).join('') + '</div>';
  const msgBox = () => st.msg ? '<div class="es-card" style="border-color:' + (st.msg.ok ? '#2f9e5a' : '#c0584e') + '"><div>' + esc(st.msg.text) + '</div></div>' : '';

  function over(co) {
    const f = figures(co), lim = 'cls'; let h = '<div class="es-grid"><div class="es-card"><div class="es-sm">القيمة السوقية للاستثمارات</div><div style="font-size:19px;font-weight:700" dir="ltr">' + money(f.mv) + '</div></div><div class="es-card"><div class="es-sm">التكلفة الدفترية</div><div style="font-size:19px;font-weight:700" dir="ltr">' + money(f.cost) + '</div></div><div class="es-card"><div class="es-sm">ربح / خسارة غير محققة</div><div style="font-size:19px;font-weight:700" class="' + (f.unreal >= 0 ? 'pos' : 'neg') + '" dir="ltr">' + money(f.unreal) + '</div></div><div class="es-card"><div class="es-sm">السيولة المستثمرة</div><div style="font-size:19px;font-weight:700" dir="ltr">' + pct(f.share, 1) + '</div></div></div>';
    h += card('العائد المحقق وغير المحقق', kv('ربح مبيعات واستحقاقات (محقق)', money(f.gain), f.gain >= 0 ? 'pos' : 'neg') + kv('كوبونات مقبوضة (إجمالي)', money(f.couponsIn), 'pos') + kv('خسائر تعثر المصدّرين (محققة)', money(-f.impaired), f.impaired > 0 ? 'neg' : '') + kv('ربح / خسارة غير محققة', money(f.unreal), f.unreal >= 0 ? 'pos' : 'neg') + kv('العائد الإجمالي منذ البداية', money(f.total), f.total >= 0 ? 'pos' : 'neg') + note('مجموع الأرقام أعلاه من دفتر السندات نفسه. الكوبونات تُحتسب بقيمتها الكاملة المقبوضة.'));
    h += card('السيولة والاستثمار', kv('نقد الشركة', money(f.cash)) + kv('استثمارات بالتكلفة', money(f.cost)) + kv('نسبة المستثمر من (النقد + الاستثمار)', pct(f.share, 1)) + kv('إجمالي المشتريات', money(f.bought)) + kv('إجمالي المبيعات', money(f.sold)) + (f.def > 0 ? kv('استثمارات متعثرة (استرداد متوقع)', money(f.def), 'neg') : ''));
    h += card('فصل الاستثمار عن الديون', kv('قيمة السندات التي أملكها (أصل)', money(f.mv)) + kv('سندات أصدرتها الشركة (التزام)', money(f.debt)) + note('هذان رقمان مستقلان: الأول يُحتسب في الأصول ونظام الاستثمار، والثاني دين يُحتسب في نظام القروض والتمويل.'));
    return h + note('الأداة الاستثمارية الحقيقية الوحيدة في اللعبة الآن هي سوق السندات، لذلك المحفظة هي محفظة السندات.');
  }

  function port(co) {
    const B = co.bank.bonds, base = co.bank.rate.rate; if (!B.pos.length) return card('لا استثمارات حالية', '<div class="es-sm">لم تشترِ أي سند بعد. افتح «السندات» ← «سوق السندات» لتشتري.</div>');
    return B.pos.map(p => { const b = B.bond(p.bond), I = B.issuers[b.issuer], q = p.rec ? null : B.quote(b, co.dayIdx, base), v = q ? p.units * F() * q.bid : p.carry, pl = v - p.carry, left = Math.max(0, b.startMi + b.term - nowM(co.dayIdx));
      return '<div class="es-card"><h5>' + esc(I.name) + ' #' + b.id + ' · ' + CLS[I.cls] + (p.rec ? ' · متعثر' : '') + '</h5>' + kv('الوحدات', n0(p.units) + ' × ' + n0(F())) + kv('التكلفة', money(p.carry)) + kv(p.rec ? 'الاسترداد المتوقع' : 'القيمة بسعر الطلب', money(v)) + kv('الأداء', (p.carry > 0 ? pct(pl / p.carry, 2) : '—') + ' · ' + money(pl), pl >= 0 ? 'pos' : 'neg') + kv('الكوبون', pct(b.coupon, 3) + ' نصف سنوي') + (q ? kv('العائد حتى الاستحقاق', pct(q.ytm)) : '') + '</div>'; }).join('');
  }
  const nowM = day => { const d = CAL.dateOfDay(day | 0); return d.year * 12 + d.month - 1 + (d.day - 1) / d.daysInMonth; };
  const monthsLeft = (B, b, co) => { const d = CAL.dateOfDay(co.dayIdx), mi = d.year * 12 + d.month - 1; return Math.max(0, b.startMi + b.term - mi); };
  const maturityOf = (b, co) => { const m = b.startMi + b.term, y = Math.floor(m / 12), mo = m % 12; return CAL.MONTHS_AR[mo] + ' ' + y; };
  const subTabs = () => '<div class="es-row" style="margin-bottom:8px;flex-wrap:wrap">' + SUBS.map(s => btn('ivSub', s[0], s[1], st.sub === s[0])).join('') + '</div>';

  function market(co) {
    const B = co.bank.bonds, base = co.bank.rate.rate; let h = '<div class="es-row" style="flex-wrap:wrap">' + [['ALL', 'الكل'], ['GOV', 'حكومية'], ['CORP', 'شركات'], ['HY', 'عالية العائد']].map(c => btn('ivCls', c[0], c[1], st.cls === c[0])).join('') + '</div>';
    const L = B.listed().filter(b => st.cls === 'ALL' || B.issuers[b.issuer].cls === st.cls);
    h += '<div class="es-card"><h5>سوق السندات (أسعار حية)</h5>' + note('الشراء بسعر العرض (Ask) والبيع بسعر الطلب (Bid)، لكل 100 من القيمة الاسمية. الأسعار تُحسب من منحنى العائد وتصنيف المصدّر.') + '<div style="overflow-x:auto"><table style="width:100%;font-size:11px;border-collapse:collapse;text-align:center"><tr style="color:#9aa7b4"><th>المصدّر</th><th>الفئة</th><th>الكوبون</th><th>الاستحقاق</th><th>العائد</th><th>Ask</th><th>Bid</th><th></th></tr>'
      + L.map(b => { const q = B.quote(b, co.dayIdx, base), I = B.issuers[b.issuer]; return '<tr style="border-top:1px solid #33404f"><td>' + esc(I.name) + ' #' + b.id + '<div class="es-sm">مخاطر ' + (I.score >= 700 ? 'منخفضة' : I.score >= 500 ? 'متوسطة' : 'مرتفعة') + ' (' + I.score + ')</div></td><td>' + CLS[I.cls] + '</td><td dir="ltr">' + pct(b.coupon, 3) + '</td><td>' + maturityOf(b, co) + '</td><td dir="ltr">' + pct(q.ytm) + '</td><td dir="ltr">' + (q.ask * 100).toFixed(2) + '</td><td dir="ltr">' + (q.bid * 100).toFixed(2) + '</td><td>' + btn('ivBuy', String(b.id), 'شراء', st.sel === b.id && st.mode === 'buy') + '</td></tr>' + (st.sel === b.id && st.mode === 'buy' ? '<tr><td colspan="8" style="text-align:right">' + tradePanel(co, b, 'buy') + '</td></tr>' : ''); }).join('') + '</table></div></div>';
    const dead = Object.values(B.issuers).filter(i => i.status === 'DEFAULTED'); if (dead.length) h += card('مصدّرون متعثرون', dead.map(i => kv(esc(i.name), 'استرداد ' + Math.round(i.rec * 100) + '%', 'neg')).join('') + note('لا تُشترى سندات المصدّر المتعثر. تُعاد إدراجها بعد ' + EC.BONDS.relistMonths + ' شهراً.'));
    return h;
  }
  function tradePanel(co, b, mode) {
    const B = co.bank.bonds, q = B.quote(b, co.dayIdx, co.bank.rate.rate), p = B.holding(b.id), u = st.units, px = mode === 'buy' ? q.ask : q.bid, val = u * F() * px, maxBuy = Math.floor(co.store.cash / (F() * q.ask));
    const presets = mode === 'buy' ? [100, 1000, 5000, 20000].filter(x => x <= Math.max(maxBuy, 100)) : p ? [0.25, 0.5, 1].map(f => Math.max(1, Math.floor(p.units * f))) : [];
    let h = '<div style="background:#1b2430;border-radius:8px;padding:8px"><b>' + (mode === 'buy' ? 'شراء' : 'بيع') + ' · ' + esc(B.issuers[b.issuer].name) + ' #' + b.id + '</b><div class="es-sm">الوحدة = ' + money(F()) + ' من القيمة الاسمية' + (mode === 'buy' ? ' · أقصى ما يكفيه النقد ' + n0(maxBuy) + ' وحدة' : p ? ' · تملك ' + n0(p.units) + ' وحدة' : '') + '</div><div class="es-row" style="flex-wrap:wrap">' + presets.map(x => btn('ivUnits', String(x), n0(x), u === x)).join('') + '</div><input id="iv-units" type="number" inputmode="numeric" value="' + (u || '') + '" style="width:100%;min-height:40px;border-radius:8px;border:1px solid #4b6a8a;background:#161d27;color:#fff;padding:0 8px;direction:ltr;box-sizing:border-box;margin:6px 0"><div class="es-row">' + btn('ivUnitsIn', '1', 'اعتمد العدد المكتوب') + '</div>';
    if (u > 0) { h += kv('السعر (لكل 100 من الاسمية)', (px * 100).toFixed(2)) + kv(mode === 'buy' ? 'التكلفة الكلية (تشمل الكوبون المستحق)' : 'العائد المقبوض', money(val), mode === 'buy' && val > co.store.cash ? 'neg' : '');
      if (mode === 'sell' && p) { const carry = p.carry * u / p.units; h += kv('التكلفة الدفترية للجزء', money(carry)) + kv('الربح / الخسارة المحققة', money(val - carry), val - carry >= 0 ? 'pos' : 'neg'); }
      h += '<div class="es-row"><button data-act="ivConfirm" data-v="' + mode + '|' + b.id + '" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff;min-height:44px"' + (mode === 'buy' && val > co.store.cash ? ' disabled' : '') + '>تأكيد ' + (mode === 'buy' ? 'الشراء' : 'البيع') + ' ' + n0(u) + ' وحدة</button></div>'; }
    return h + '</div>';
  }
  function mine(co) {
    const B = co.bank.bonds, base = co.bank.rate.rate; if (!B.pos.length) return card('محفظتي من السندات', '<div class="es-sm">لا حيازات. اشترِ من «سوق السندات».</div>');
    let h = ''; const nextCpn = (b) => { const d = CAL.dateOfDay(co.dayIdx), mi = d.year * 12 + d.month - 1, k = mi - b.startMi, rem = k < 0 ? -k : 6 - (k % 6 || 6) + (k % 6 === 0 && k > 0 ? 6 : 0); return k % 6 === 0 && k > 0 ? 6 : 6 - (k % 6); };
    for (const p of B.pos) { const b = B.bond(p.bond), I = B.issuers[b.issuer], q = p.rec ? null : B.quote(b, co.dayIdx, base), v = q ? p.units * F() * q.bid : p.carry, pl = v - p.carry, cpn = p.units * F() * b.coupon / 2, pay = p.rec ? null : Math.min(nextCpn(b), monthsLeft(B, b, co));
      h += '<div class="es-card"><h5>' + esc(I.name) + ' #' + b.id + ' · ' + CLS[I.cls] + (p.rec ? ' · متعثر' : '') + '</h5>' + kv('الوحدات', n0(p.units)) + kv('القيمة الاسمية', money(p.units * F())) + kv('التكلفة', money(p.carry)) + kv(p.rec ? 'الاسترداد المتوقع' : 'القيمة السوقية (Bid)', money(v)) + kv('ربح / خسارة', money(pl), pl >= 0 ? 'pos' : 'neg') + (p.rec ? kv('دفعة الاسترداد', 'بعد ' + Math.max(0, p.rec.mi - (CAL.dateOfDay(co.dayIdx).year * 12 + CAL.dateOfDay(co.dayIdx).month - 1)) + ' شهر', 'warn') : kv('الكوبون القادم', money(cpn) + ' · بعد ' + pay + ' شهر') + kv('تاريخ الاستحقاق', maturityOf(b, co) + ' (بعد ' + monthsLeft(B, b, co) + ' شهراً)'))
        + (p.rec ? '' : '<div class="es-row">' + btn('ivSell', String(b.id), 'بيع', st.sel === b.id && st.mode === 'sell') + '</div>') + (st.sel === b.id && st.mode === 'sell' ? tradePanel(co, b, 'sell') : '') + '</div>'; }
    return h;
  }
  function issued(co) {
    const B = co.bank.bonds, D = EC.BONDS, I = st.iss; let h = card('إصدار سند جديد للشركة', '<div class="es-sm">الأجل</div><div class="es-row" style="flex-wrap:wrap">' + [12, 24, 36, 60, 84, 120].map(t => btn('ivIss', 'term|' + t, t >= 12 ? t / 12 + ' سنة' : t + ' شهراً', I.term === t)).join('') + '</div><div class="es-sm">المبلغ</div><div class="es-row" style="flex-wrap:wrap">' + [5e6, 25e6, 50e6, 100e6, 250e6].map(a => btn('ivIss', 'amount|' + a, money(a), I.amount === a)).join('') + '</div>' + issueReview(co));
    if (!B.issued.length) return h + card('سندات الشركة الصادرة', '<div class="es-sm">لم تُصدر أي سند بعد.</div>');
    for (const b of B.issued) { const arr = b.arrears.reduce((a, x) => a + x.amt, 0), left = Math.max(0, b.startMi + b.term - (CAL.dateOfDay(co.dayIdx).year * 12 + CAL.dateOfDay(co.dayIdx).month - 1));
      h += '<div class="es-card"><h5>سندي #' + b.id + ' · ' + BST[b.status] + (arr > 0 ? ' · متعثر' : '') + '</h5>' + kv('القيمة الاسمية', money(b.face)) + kv('المتبقي من الأصل', money(b.face - b.repaidFace)) + kv('الكوبون', pct(b.coupon, 3) + ' نصف سنوي') + kv('كوبون قادم', money(b.face * b.coupon / 2)) + kv('كوبونات مدفوعة', b.paidCoupons) + kv('الاستحقاق', maturityOf(b, co) + ' (بعد ' + left + ' شهراً)') + kv('الغرض', esc(b.purpose || '—')) + (arr > 0 ? kv('متأخرات (كوبونات / أصل)', money(arr), 'neg') + note('المتأخرات تُسدَّد تلقائياً عند توفر النقد.') : '') + '</div>'; }
    return h + note('السندات الصادرة التزام على الشركة وتدخل في إجمالي الدين، وكوبوناتها مصروف فوائد.');
  }
  function issueReview(co) {
    const I = st.iss, q = co.issueBondQuote(I.term, I.amount); if (!q.ok) return '<div class="warn">' + esc(why(q.reason)) + '</div>';
    return kv('الكوبون السنوي', pct(q.coupon, 3)) + kv('الكوبون نصف السنوي', money(I.amount * q.coupon / 2)) + kv('رسوم الإصدار', money(q.fee)) + kv('صافي المقبوض', money(q.net)) + kv('الأصل المستحق عند الاستحقاق', money(I.amount)) + '<div style="color:#2f9e5a" class="es-sm">✔ الإصدار مسموح. لا يُنفَّذ إلا بتأكيدك.</div><div class="es-row"><button data-act="ivIssue" data-v="1" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff;min-height:44px">تأكيد إصدار ' + money(I.amount) + '</button></div>';
  }
  function bondsSec(co) { return subTabs() + (st.sub === 'mine' ? mine(co) : st.sub === 'iss' ? issued(co) : market(co)); }

  function log(co) {
    const B = co.bank.bonds, rows = B.tx.filter(t => INV_CODES.indexOf(t[2]) >= 0).slice().reverse(), LB = Object.keys({ 6: 1, 7: 1 }); const idOf = c => c; const TXN = { 6: 'BUY', 7: 'SELL', 8: 'COUPON_IN', 9: 'MATURE_IN', 10: 'ISSUER_DEFAULT', 11: 'IMPAIR', 12: 'RECOVERY', 13: 'RELIST' };
    const line = t => { const code = t[2]; let a = '';
      if (code === 6) a = n0(t[4]) + ' وحدة · ' + money(t[5]); else if (code === 7) a = n0(t[4]) + ' وحدة · ' + money(t[5]); else if (code === 8) a = money(t[5]); else if (code === 9) a = n0(t[4]) + ' وحدة · ' + money(t[5]); else if (code === 11) a = money(-t[5]); else if (code === 12) a = money(t[5]); else if (code === 10) a = 'استرداد ' + t[5] + '%';
      const ref = t[3] ? ' #' + t[3] : ''; return kv(dateOf(t[1]) + ' · ' + BTX[code] + ref, a, code === 11 || code === 10 ? 'neg' : code === 8 || code === 12 ? 'pos' : ''); };
    const a = B.acct; let h = card('مجاميع', kv('عمليات استثمارية', rows.length) + kv('مشتريات', money(a.bought)) + kv('مبيعات', money(a.sold)) + kv('أرباح محققة (مبيعات واستحقاق)', money(a.gain), a.gain >= 0 ? 'pos' : 'neg') + kv('كوبونات مقبوضة', money(a.couponsIn), 'pos') + kv('خسائر تعثر', money(-a.impaired), a.impaired > 0 ? 'neg' : '') + kv('استرداد بعد التعثر', money(a.recovered)));
    h += card('سجل العمليات الاستثمارية (' + rows.length + ')', rows.length ? rows.slice(0, st.more ? 500 : 40).map(line).join('') + (rows.length > 40 ? '<div class="es-row">' + btn('ivMore', '1', st.more ? 'عرض الأحدث فقط' : 'عرض الكل') + '</div>' : '') : '<div class="es-sm">لا عمليات بعد.</div>');
    const io = B.tx.filter(t => [1, 2, 3, 4, 5].indexOf(t[2]) >= 0).length; return h + note('عمليات السندات الصادرة (' + io + ' عملية: إصدار وكوبونات وسداد) تظهر في نظام القروض والتمويل كجزء من الدين وفي قسم «سنداتي الصادرة».');
  }

  function html(co) {
    let body; switch (st.sec) { case 'port': body = port(co); break; case 'bonds': body = bondsSec(co); break; case 'log': body = log(co); break; default: body = over(co); }
    return '<div class="es-sm" style="letter-spacing:.06em">INVESTMENT</div>' + tabs() + msgBox() + body + note('أرقام هذه الشاشة من محرك السندات نفسه (bonds.js)؛ كل زر ينفّذ عملية حقيقية في اللعبة.');
  }

  const val$ = id => { const e = typeof document !== 'undefined' ? document.getElementById(id) : null; return e ? +e.value : NaN; };
  function act(a, el, co) {
    const v = el && el.dataset ? el.dataset.v : null;
    switch (a) {
      case 'ivSec': st.sec = SECS.some(s => s[0] === v) ? v : 'over'; st.sel = null; st.mode = null; st.msg = null; st.more = false; return true;
      case 'ivSub': st.sub = v; st.sel = null; st.mode = null; st.msg = null; return true;
      case 'ivCls': st.cls = v; return true;
      case 'ivMore': st.more = !st.more; return true;
      case 'ivBuy': case 'ivSell': { const id = +v, mode = a === 'ivBuy' ? 'buy' : 'sell'; if (st.sel === id && st.mode === mode) { st.sel = null; st.mode = null; } else { st.sel = id; st.mode = mode; st.units = 0; } st.msg = null; return true; }
      case 'ivUnits': st.units = Math.floor(+v); return true;
      case 'ivUnitsIn': { const x = val$('iv-units'); if (x >= 1) st.units = Math.floor(x); return true; }
      case 'ivConfirm': { const [mode, id] = v.split('|'), r = mode === 'buy' ? co.buyBond(+id, st.units) : co.sellBond(+id, st.units);
        st.msg = r.ok ? { ok: true, text: mode === 'buy' ? 'تم شراء ' + n0(r.units) + ' وحدة بتكلفة ' + money(r.cost) : 'تم بيع ' + n0(r.units) + ' وحدة بعائد ' + money(r.proceeds) + ' (ربح/خسارة محققة ' + money(r.gain) + ')' } : { ok: false, text: 'تعذّر: ' + why(r.reason) + (r.need ? ' (المطلوب ' + money(r.need) + ')' : '') };
        if (r.ok) { st.sel = null; st.mode = null; st.units = 0; } return true; }
      case 'ivIss': { const [k, x] = v.split('|'); st.iss[k] = +x; return true; }
      case 'ivIssue': { const r = co.issueBond(st.iss.term, st.iss.amount, { purpose: 'Bond issue' }); st.msg = r.ok ? { ok: true, text: 'تم إصدار السند #' + r.bond.id + ' بقيمة ' + money(r.bond.face) + ' وكوبون ' + pct(r.coupon, 3) + ' · رسوم ' + money(r.fee) } : { ok: false, text: 'تعذّر: ' + why(r.reason) }; return true; }
    }
    return false;
  }
  const ACTS = ['ivSec', 'ivSub', 'ivCls', 'ivMore', 'ivBuy', 'ivSell', 'ivUnits', 'ivUnitsIn', 'ivConfirm', 'ivIss', 'ivIssue'];
  return { html, act, ACTS, state: st, SECS, figures };
});
