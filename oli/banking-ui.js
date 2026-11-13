/* Oli - banking-ui.js : the BANKING & CAPITAL MARKETS section of the Company tab (Banking Phase 6).
 * A pure VIEW of the real banking engines (co.bank: banks, Base Rate, loans, liens, rating, bonds, permanent records).  Nothing here is generated, estimated or written:
 * no button changes the simulation (only the tabs and "show more" change what is drawn), and the figures are read when the screen is opened or a tab is tapped - never per frame.
 * Arabic RTL, mobile first; it uses the same card / row classes as the rest of the Company tab.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game-calendar.js'), require('./economy-config.js'));
  else root.OliBankingUI = factory(root.OliCalendar, root.OliEconomyConfig);
})(typeof self !== 'undefined' ? self : this, function (CAL, EC) {
  'use strict';
  const st = { tab: 'overview', more: { loans: false, log: false } };
  const TABS = [['overview', 'نظرة عامة'], ['loans', 'القروض'], ['credit', 'التصنيف والضمانات'], ['bonds', 'السندات'], ['log', 'السجل']];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const money = v => (v < 0 ? '−' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US'), pct = (v, d) => (v * 100).toFixed(d == null ? 2 : d) + '%', n0 = v => Math.round(v).toLocaleString('en-US');
  const kv = (a, b, c) => '<div class="es-kv"><span>' + a + '</span><span dir="ltr" class="' + (c || '') + '">' + b + '</span></div>', card = (t, b) => '<div class="es-card"><h5>' + t + '</h5>' + b + '</div>';
  const note = t => '<div class="es-sm" style="margin-top:6px">' + t + '</div>';
  const dateOf = d => { const x = CAL.dateOfDay(d); return x.day + ' ' + CAL.MONTHS_AR[x.month - 1] + ' ' + x.year; };
  const GRADE = { A: 'ممتاز', B: 'جيد', C: 'متوسط', D: 'ضعيف', E: 'عالي المخاطر' }, CLS = { GOV: 'حكومي', CORP: 'شركات', HY: 'عالي العائد' };
  const LST = { ACTIVE: 'قائم', CLOSED: 'مُسدَّد', LOSS: 'خسارة ائتمانية' }, STG = ['منتظم', 'تأخر سداد', 'تحذير ائتماني', 'ضائقة مالية', 'إعادة هيكلة', 'استرداد الأصول'];
  const PLAN = { OFFERED: 'عرض مفتوح', ACTIVE: 'خطة سارية', DONE: 'خطة مكتملة', EXPIRED: 'انتهت مهلة العرض', BREACHED: 'خطة مخرومة' }, BST = { ACTIVE: 'قائم', MATURED: 'مستحق', CLOSED: 'مُسدَّد' };
  const LTX = { 1: 'فتح قرض', 2: 'سداد قسط', 3: 'متأخرات', 4: 'سداد متأخرات', 5: 'إعادة تسعير', 6: 'سداد مبكر', 7: 'إعادة جدولة', 8: 'إغلاق القرض', 9: 'رهن أصل', 10: 'فك رهن', 11: 'Margin Call', 12: 'انتهاء Margin Call', 13: 'مهلة Margin Call انتهت', 14: 'تغيّر التصنيف', 15: 'غرامة تأخير 2%', 16: 'تغيّر مرحلة التعثر', 17: 'عرض إعادة هيكلة', 18: 'قبول إعادة الهيكلة', 19: 'انتهاء العرض', 20: 'اكتمال الخطة', 21: 'تنفيذ على الضمان', 22: 'شطب خسارة', 23: 'نافذة الأزمة' };
  const BTX = { 1: 'إصدار سند', 2: 'كوبون مدفوع', 3: 'كوبون متأخر', 4: 'سداد كوبون متأخر', 5: 'سداد أصل السند', 6: 'شراء سند', 7: 'بيع سند', 8: 'كوبون مقبوض', 9: 'استحقاق سند', 10: 'تعثر مصدّر', 11: 'انخفاض قيمة', 12: 'استرداد', 13: 'إعادة إدراج مصدّر' };
  const spark = (vals, w, h, col) => { if (vals.length < 2) return ''; const lo = Math.min(...vals), hi = Math.max(...vals), sp = (hi - lo) || 1; const pts = vals.map((v, i) => (i / (vals.length - 1) * (w - 4) + 2).toFixed(1) + ',' + (h - 3 - (v - lo) / sp * (h - 6)).toFixed(1)).join(' '); return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" style="display:block"><polyline fill="none" stroke="' + col + '" stroke-width="2" points="' + pts + '"/></svg>'; };
  const tabs = () => '<div class="es-row" style="margin:6px 0 10px;flex-wrap:wrap">' + TABS.map(t => '<button data-act="bkTab" data-v="' + t[0] + '" class="' + (st.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>').join('') + '</div>';
  const typeLbl = t => (EC.LOAN_TYPES[t] || {}).label || t, bankLbl = id => (EC.BANKS.banks[id] || {}).label || id;

  function overview(co) {
    const B = co.bank, R = B.rate, h = R.hist.filter(x => !x.type), last = h[h.length - 1], d = CAL.dateOfDay(co.dayIdx), RM = EC.BASE_RATE.reviewMonths;
    let nm = RM.find(m => m > d.month || (m === d.month && d.day === 1 && false)); const ny = nm ? d.year : d.year + 1; nm = nm || RM[0];
    let s = card('سعر الأساس', '<div class="es-big">' + pct(R.rate) + '</div>' + kv('الوضع', R.mode === 'AUTO' ? 'تلقائي' : 'ثابت (يدوي)') + kv('المراجعة الأخيرة', last ? dateOf(last.day) : 'لم تُجرَ بعد') + kv('المراجعة القادمة', '1 ' + CAL.MONTHS_AR[nm - 1] + ' ' + ny)
      + (last ? kv('مؤشر الأسعار (zp)', last.zp.toFixed(2)) + kv('مؤشر السيولة (zl)', last.zl.toFixed(2)) + kv('مؤشر النشاط (za)', last.za.toFixed(2)) + kv('الدرجة المركبة S', last.S.toFixed(2)) : '') + (h.length > 1 ? '<div style="margin-top:6px">' + spark(h.map(x => x.rate * 100), 320, 46, '#f0b429') + '</div>' : '') + note('يتغير بخطوة 0.50% فقط بعد تأكيد الاتجاه في مراجعتين، ولا يتحرك عند نبضة اقتصادية عابرة.'));
    const sc = B.credit.score; s += card('تصنيف الشركة الائتماني', sc == null ? '<div class="es-sm">يُحسب عند نهاية أول شهر مغلق.</div>' : '<div class="es-big">' + sc + ' / 1000</div>' + kv('الفئة', B.credit.grade + ' · ' + GRADE[B.credit.grade]) + kv('العلاوة الائتمانية على القروض الجديدة', pct(B.creditPremium())) + kv('أسوأ مرحلة تعثر', STG[B.worstStage()]));
    for (const id of B.ids()) { const x = B.snapshot(id), p = EC.BANKS.banks[id], tier = R.tiers[id] | 0;
      s += card(bankLbl(id), kv('رأس المال', money(x.capital)) + kv('الودائع', money(x.deposits)) + kv('السيولة', money(x.liquidity)) + kv('الاحتياطي الإلزامي (جزء من السيولة)', money(x.reserve)) + kv('القابل للإقراض', money(x.lendable)) + kv('محفظة القروض', money(x.loans))
        + kv('الرافعة', (B.leverage(id) === Infinity ? '—' : B.leverage(id).toFixed(2)) + ' / ' + p.maxLeverage) + kv('أقصى قرض الآن', money(x.maxLoan)) + kv('هامش البنك', pct(p.spread)) + kv('علاوة السيولة', tier ? '+' + pct(EC.BASE_RATE.surcharge[tier - 1].add) : '0.00%')); }
    s += card('التزامات السوق المالي للشركة', kv('قروض البنوك القائمة', money(B.bankDebt())) + kv('سندات صادرة', money(B.bonds.debt())) + kv('استثمارات في السندات (بالتكلفة)', money(B.bonds.invested())) + kv('متأخرات القروض', money(B.arrearsTotal()), B.arrearsTotal() > 0 ? 'neg' : '') + kv('كوبونات متأخرة', money(B.bonds.arrearsTotalCoupons()), B.bonds.arrearsTotalCoupons() > 0 ? 'neg' : '') + kv('مستحق خلال سنة', money(B.dueWithinYear())));
    return s;
  }
  function loans(co) {
    const B = co.bank, all = B.loans.slice().reverse(), act = all.filter(l => l.status === 'ACTIVE'), old = all.filter(l => l.status !== 'ACTIVE'), shown = act.concat(st.more.loans ? old : old.slice(0, 5));
    if (!all.length) return '<div class="es-card"><div class="es-sm">لا توجد قروض مصرفية بعد. تظهر هنا كل قروض البنوك الثلاثة بجداولها ومتأخراتها.</div></div>';
    let h = card('ملخص', kv('قروض قائمة', act.length) + kv('إجمالي الرصيد', money(B.bankDebt() - B.bonds.debt())) + kv('أقساط متأخرة', money(B.arrearsTotal()), B.arrearsTotal() > 0 ? 'neg' : '') + kv('كل القروض المسجلة', all.length));
    for (const l of shown) {
      const due = l.status === 'ACTIVE' ? (l.fm - (l.m % l.fm)) : 0, arr = l.arrears.reduce((a, x) => a + x.int + x.prin + (x.fee || 0), 0), cc = B.collateralOf(l, co._valuer());
      h += '<div class="es-card"><h5>#' + l.id + ' · ' + typeLbl(l.type) + ' · ' + bankLbl(l.bank) + ' · ' + LST[l.status] + '</h5>' + kv('المبلغ الأصلي', money(l.principal)) + kv('الرصيد', money(l.bal)) + kv('الفائدة الحالية', pct(l.rate)) + kv('الأجل', l.term + ' شهراً (انقضى ' + l.m + ')') + kv('الدورة', ({ M: 'شهرية', Q: 'ربع سنوية', A: 'سنوية' })[l.freq]) + (l.grace > l.m ? kv('سماح حتى الشهر', l.grace) : '')
        + (l.status === 'ACTIVE' ? kv('القسط القادم', money(l.pmt) + ' · بعد ' + due + ' شهر') + kv('فائدة مستحقة غير مدفوعة', money(l.accr)) : '') + kv('فوائد مدفوعة', money(l.paidInt)) + kv('أصل مدفوع', money(l.paidPrin)) + ((l.paidFee || 0) > 0 ? kv('غرامات تأخير مدفوعة', money(l.paidFee)) : '')
        + (arr > 0 ? kv('متأخرات (' + l.arrears.length + ' قسط)', money(arr), 'neg') : '') + (l.status === 'ACTIVE' && (l.stage | 0) > 0 ? kv('مرحلة التعثر', (l.stage | 0) + ' · ' + STG[l.stage | 0], l.stage >= 3 ? 'neg' : 'warn') : '')
        + (l.plan ? kv('إعادة الهيكلة', PLAN[l.plan.status] + (l.plan.status === 'OFFERED' ? ' · حتى ' + dateOf(l.plan.expires) : ''), 'warn') : '') + (cc.value > 0 || B.activeLiens(l.id).length ? kv('قيمة الضمان / LTV', money(cc.value) + ' / ' + (isFinite(cc.ltv) ? pct(cc.ltv, 1) : '—')) : '') + (l.call ? kv('Margin Call', 'مفتوح منذ ' + dateOf(l.call.day) + ' · المطلوب ' + money(l.call.need) + (l.call.expired ? ' · انتهت المهلة' : ''), 'neg') : '')
        + (l.status !== 'ACTIVE' ? kv('أُغلق في', l.closedDay != null ? dateOf(l.closedDay) : (l.lossDay != null ? dateOf(l.lossDay) : '—')) : '') + '</div>';
    }
    if (old.length > 5) h += '<div class="es-row"><button data-act="bkMore" data-v="loans">' + (st.more.loans ? 'إخفاء المسدّدة القديمة' : 'عرض كل القروض المسدّدة (' + old.length + ')') + '</button></div>';
    return h;
  }
  function credit(co) {
    const B = co.bank, c = B.credit, W = EC.CREDIT.weights, NAMES = { pay: 'سجل السداد', cf: 'التدفقات النقدية', debt: 'الدين إلى الأصول', prof: 'الربحية', liq: 'السيولة', stab: 'الاستقرار التشغيلي' };
    let h = c.score == null ? '<div class="es-card"><div class="es-sm">لا تصنيف بعد: يُحسب بعد إغلاق أول شهر.</div></div>' : card('التصنيف الائتماني', '<div class="es-big">' + c.score + ' / 1000 · ' + c.grade + '</div>' + kv('العلاوة الائتمانية', pct(B.creditPremium())) + (c.hist.length > 1 ? '<div style="margin-top:6px">' + spark(c.hist.slice(-24).map(x => x[1]), 320, 46, '#5aa9e6') + '</div>' : '')
      + Object.keys(W).map(k => '<div class="es-kv"><span>' + NAMES[k] + ' (' + Math.round(W[k] * 100) + '%)</span><span dir="ltr">' + Math.round(c.parts[k] * 100) + '%</span></div><div class="es-bar"><i style="width:' + Math.round(c.parts[k] * 100) + '%"></i></div>').join('') + note('كل مؤشر من 0 إلى 100%، والدرجة = مجموع (المؤشر × وزنه) × 1000.'));
    const val = co._valuer(), lz = B.liens.slice().reverse(), actv = lz.filter(x => x.status === 'ACTIVE'), shown = actv.concat(lz.filter(x => x.status !== 'ACTIVE').slice(0, 5));
    h += card('الضمانات والرهون', kv('رهون قائمة', actv.length) + kv('كل الرهون المسجلة', B.liens.length) + note('المخزون الاستراتيجي ليس ضماناً. لا يُباع أو يُهدم أصل مرهون دون فك الرهن.'));
    for (const x of shown) { const l = B.loan(x.loan), cc = l ? B.collateralOf(l, val) : null, v = x.status === 'ACTIVE' ? B._value(x, val) : x.v0;
      h += '<div class="es-card"><h5>رهن #' + x.id + ' · ' + (x.kind === 'ASSET' ? 'أصل' : 'نفط') + ' · ' + (x.status === 'ACTIVE' ? 'قائم' : 'مفكوك' + (x.forced ? ' (تنفيذ البنك)' : '')) + '</h5>' + kv('الضمان', x.kind === 'ASSET' ? 'مبنى رقم ' + x.ref : n0(x.qty) + ' برميل ' + x.ref) + kv(x.status === 'ACTIVE' ? 'القيمة الآن' : 'القيمة عند الرهن', money(v)) + kv('قيمة عند الرهن', money(x.v0)) + kv('القرض', '#' + x.loan + (l ? ' · رصيد ' + money(l.bal) : ''))
        + (cc && x.status === 'ACTIVE' ? kv('LTV للقرض', isFinite(cc.ltv) ? pct(cc.ltv, 1) : '—', cc.ltv > EC.COLLATERAL.ltv.OIL.call ? 'warn' : '') : '') + kv('تاريخ الرهن', dateOf(x.day)) + '</div>'; }
    const calls = B.loans.filter(l => l.call); if (calls.length) h += card('Margin Call مفتوحة', calls.map(l => kv('قرض #' + l.id, 'المطلوب ' + money(l.call.need) + ' · منذ ' + dateOf(l.call.day), 'neg')).join(''));
    return h;
  }
  function bonds(co) {
    const B = co.bank.bonds, base = co.bank.rate.rate;
    let h = card('محفظتي', kv('استثمارات (بالتكلفة)', money(B.invested())) + kv('سندات صادرة', money(B.debt())) + kv('كوبونات مقبوضة (إجمالي)', money(B.acct.couponsIn)) + kv('كوبونات مدفوعة (إجمالي)', money(B.acct.couponsOut)) + kv('خسائر تعثر المصدّرين', money(B.acct.impaired), B.acct.impaired > 0 ? 'neg' : '') + kv('مبالغ مستردة', money(B.acct.recovered)));
    for (const p of B.pos) { const b = B.bond(p.bond), I = B.issuers[b.issuer], q = p.rec ? null : B.quote(b, co.dayIdx, base), mv = q ? p.units * EC.BONDS.unitFace * q.bid : p.carry;
      h += '<div class="es-card"><h5>حيازة · ' + esc(I.name) + ' · ' + CLS[I.cls] + (p.rec ? ' · متعثر' : '') + '</h5>' + kv('الوحدات', n0(p.units)) + kv('الكلفة الدفترية', money(p.carry)) + kv(p.rec ? 'الاسترداد المتوقع' : 'القيمة بسعر الطلب', money(mv)) + (q ? kv('الربح / الخسارة غير المحققة', money(mv - p.carry), mv - p.carry >= 0 ? 'pos' : 'neg') + kv('الكوبون', pct(b.coupon, 3) + ' · العائد ' + pct(q.ytm)) + kv('المتبقي', q.years.toFixed(1) + ' سنة') : kv('الاسترداد في', 'الشهر ' + p.rec.mi)) + '</div>'; }
    for (const b of B.issued) h += '<div class="es-card"><h5>سندي #' + b.id + ' · ' + BST[b.status] + '</h5>' + kv('القيمة الاسمية', money(b.face)) + kv('الكوبون', pct(b.coupon, 3)) + kv('الأجل', b.term + ' شهراً') + kv('كوبونات مدفوعة', b.paidCoupons) + kv('المسدّد من الأصل', money(b.repaidFace)) + (b.arrears.length ? kv('متأخرات', money(b.arrears.reduce((a, x) => a + x.amt, 0)), 'neg') : '') + '</div>';
    h += '<div class="es-card"><h5>سوق السندات (الأسعار الحية)</h5>' + note('الشراء بسعر العرض والبيع بسعر الطلب. السعر = القيمة الحالية بعائد المنحنى وتصنيف المصدّر.') + '<div style="overflow-x:auto"><table style="width:100%;font-size:11px;border-collapse:collapse;text-align:center"><tr style="color:#9aa7b4"><th>المصدّر</th><th>الفئة</th><th>تصنيف</th><th>كوبون</th><th>سنوات</th><th>عائد</th><th>عرض</th><th>طلب</th></tr>'
      + B.listed().map(b => { const q = B.quote(b, co.dayIdx, base), I = B.issuers[b.issuer]; return '<tr style="border-top:1px solid #33404f"><td>' + esc(I.name) + ' #' + b.id + '</td><td>' + CLS[I.cls] + '</td><td>' + I.score + '</td><td dir="ltr">' + pct(b.coupon, 3) + '</td><td dir="ltr">' + q.years.toFixed(1) + '</td><td dir="ltr">' + pct(q.ytm) + '</td><td dir="ltr">' + (q.ask * 100).toFixed(2) + '</td><td dir="ltr">' + (q.bid * 100).toFixed(2) + '</td></tr>'; }).join('') + '</table></div>' + note('الأسعار كنسبة من القيمة الاسمية (100 = القيمة الاسمية).') + '</div>';
    const dead = Object.values(B.issuers).filter(i => i.status === 'DEFAULTED'); if (dead.length) h += card('مصدّرون متعثرون', dead.map(i => kv(esc(i.name), 'استرداد ' + Math.round(i.rec * 100) + '%', 'neg')).join(''));
    return h;
  }
  function log(co) {
    const B = co.bank, rows = [];
    for (const t of B.tx) rows.push({ day: t[1], k: 'L', id: t[0], code: t[2], ref: t[3], a: t[4], b: t[5] }); for (const t of B.bonds.tx) rows.push({ day: t[1], k: 'B', id: t[0], code: t[2], ref: t[3], a: t[4], b: t[5] });
    rows.sort((x, y) => y.day - x.day || (y.k === x.k ? y.id - x.id : x.k < y.k ? -1 : 1)); const shown = st.more.log ? rows : rows.slice(0, 40);
    if (!rows.length) return '<div class="es-card"><div class="es-sm">السجل الدائم فارغ: تُسجَّل هنا كل عملية قرض وضمان وتعثر وسند، ولا يُمسح منه شيء.</div></div>';
    return card('السجل الدائم (' + rows.length + ' عملية)', shown.map(r => '<div class="es-kv"><span>' + dateOf(r.day) + ' · ' + (r.k === 'L' ? LTX[r.code] : BTX[r.code]) + (r.ref ? ' #' + r.ref : '') + '</span><span dir="ltr">' + (r.a ? n0(r.a) : '') + (r.b ? ' / ' + n0(r.b) : '') + '</span></div>').join('') + (rows.length > 40 ? '<div class="es-row" style="margin-top:8px"><button data-act="bkMore" data-v="log">' + (st.more.log ? 'عرض الأحدث فقط' : 'عرض كل السجل') + '</button></div>' : ''));
  }
  function html(co) {
    const body = st.tab === 'loans' ? loans(co) : st.tab === 'credit' ? credit(co) : st.tab === 'bonds' ? bonds(co) : st.tab === 'log' ? log(co) : overview(co);
    return '<div class="es-sm" style="letter-spacing:.06em">BANKING &amp; CAPITAL MARKETS</div>' + tabs() + body + note('هذه الشاشة للعرض فقط: أرقامها من محركات القروض والتصنيف والضمانات والسندات الفعلية.');
  }
  function act(a, el) {
    const v = el && el.dataset ? el.dataset.v : null;
    if (a === 'bkTab') { st.tab = TABS.some(t => t[0] === v) ? v : 'overview'; return true; }
    if (a === 'bkMore') { if (v in st.more) st.more[v] = !st.more[v]; return true; }
    return false;
  }
  return { html, act, ACTS: ['bkTab', 'bkMore'], state: st, TABS };
});
