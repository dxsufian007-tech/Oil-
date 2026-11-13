/* Oli - loans-ui.js : the LOANS & FINANCING system of the Company tab (قروض وتمويل).
 * Eight sections (debt summary, active loans, new loan, instalment schedule, repayment log, arrears & default, banks & offers, calculator) over the REAL engines:
 *   co.bank (bank.js + loans-engine.js: bank loans, project finance, arrears, stages, restructuring plans)  and  co.loans (the old Central / ordinary loans).
 * Nothing here has its own arithmetic for money: quotes come from co.bankQuote (bank.assess), loans are made by co.takeBankLoan, repaid by co.prepayBankLoan / co.prepayLoan / co.repayLoan,
 * rescheduled by co.rescheduleBankLoan / co.rescheduleLoan, restructured by co.acceptRestructuring.  The schedule tables use the engine's own schedule functions.  Figures are read when the screen is drawn (never per frame).
 * The bonds the company OWNS or ISSUED live in the investment system (invest-ui.js); the debt the company issued as bonds is shown here only as one line of the debt summary.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game-calendar.js'), require('./economy-config.js'), require('./loans-engine.js'));
  else root.OliLoansUI = factory(root.OliCalendar, root.OliEconomyConfig, root.OliLoans);
})(typeof self !== 'undefined' ? self : this, function (CAL, EC, LE) {
  'use strict';
  const SECS = [['summary', 'ملخص الديون'], ['active', 'القروض النشطة'], ['new', 'طلب قرض جديد'], ['sched', 'جدول الأقساط'], ['log', 'سجل السداد'], ['arrears', 'المتأخرات والتعثر'], ['banks', 'البنوك والعروض'], ['calc', 'حاسبة القروض']];
  const st = { sec: 'summary', sel: null, panel: null, more: false, msg: null, wiz: { step: 1, bank: null, type: null, amount: 0, term: 0, freq: 'M', grace: 0, coll: [] }, calc: { bank: 'COMMERCIAL', type: 'WORKING_CAPITAL', amount: 10e6, term: 12, freq: 'M', grace: 0 } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const money = v => (v < 0 ? '−' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US'), pct = (v, d) => (v * 100).toFixed(d == null ? 2 : d) + '%', n0 = v => Math.round(v).toLocaleString('en-US');
  const kv = (a, b, c) => '<div class="es-kv"><span>' + a + '</span><span dir="ltr" class="' + (c || '') + '">' + b + '</span></div>', card = (t, b) => '<div class="es-card"><h5>' + t + '</h5>' + b + '</div>', note = t => '<div class="es-sm" style="margin-top:6px">' + t + '</div>';
  const btn = (act, v, label, on, extra) => '<button data-act="' + act + '" data-v="' + esc(v) + '"' + (extra || '') + ' class="' + (on ? 'on' : '') + '">' + label + '</button>';
  const STG = ['منتظم', 'تأخر سداد', 'تحذير ائتماني', 'ضائقة مالية', 'إعادة هيكلة', 'استرداد الأصول'], FREQ = { M: 'شهرية', Q: 'ربع سنوية', A: 'سنوية' };
  const PLAN = { OFFERED: 'عرض مفتوح', ACTIVE: 'خطة سارية', DONE: 'خطة مكتملة', EXPIRED: 'انتهت مهلة العرض', BREACHED: 'خطة مخرومة' };
  const WHY = { BANK: 'بنك غير معروف', TYPE: 'نوع قرض غير معروف', NOT_OFFERED: 'هذا البنك لا يقدّم هذا النوع', LOCKED_OWNER_APPROVAL: 'يتطلب موافقة المالك (مقفل)', LOCKED_COLLATERAL: 'نظام الضمانات غير مفعّل', AMOUNT_MIN: 'المبلغ أقل من الحد الأدنى للقرض', AMOUNT: 'المبلغ غير صالح', FREQ: 'دورة سداد غير متاحة', TERM: 'المدة غير مسموحة لهذا النوع/الدورة', GRACE: 'فترة السماح غير مسموحة',
    SINGLE_CAP: 'المبلغ أكبر من سقف القرض الواحد في هذا البنك', LIQUIDITY: 'سيولة البنك لا تكفي لهذا المبلغ', LEVERAGE: 'البنك بلغ حد الرفع المالي', RESTRICTED: 'الإقراض مقيَّد الآن (ضغط ديون أو تعثر)', RISK: 'تجاوز حد المخاطر: الدين بعد القرض أكبر من 50% من الأصول والمخزون والنقد', COLLATERAL_REQUIRED: 'هذا النوع يتطلب ضماناً: اختر أصولاً أو نفطاً', LTV: 'المبلغ أكبر من طاقة الاقتراض بالضمان', KIND: 'نوع ضمان غير مقبول لهذا القرض',
    DOUBLE_PLEDGE: 'الضمان مرهون لقرض آخر', NOT_FOUND: 'أصل الضمان غير موجود', PRODUCT: 'منتج غير صالح كضمان', QTY: 'كمية الضمان غير صالحة', NO_VALUER: 'تعذّر تقييم الضمان', bankrupt: 'الشركة مفلسة', cash: 'النقد لا يكفي', noLoan: 'القرض غير موجود', amount: 'المبلغ غير صالح', noOffer: 'لا يوجد عرض مفتوح', expired: 'انتهت مهلة العرض', option: 'خيار غير صالح', nothing: 'لا شيء للسداد', term: 'مدة غير مسموحة' };
  const why = r => WHY[r] || String(r);
  const monthLbl = k => { const d = CAL.dateOfDay(st._day || 0), i = d.month - 1 + k; return CAL.MONTHS_AR[((i % 12) + 12) % 12] + ' ' + (d.year + Math.floor(i / 12)); };      // the month END that is k months after this month's end (k = 0: this month)
  const dateOf = d => { const x = CAL.dateOfDay(d); return x.day + ' ' + CAL.MONTHS_AR[x.month - 1] + ' ' + x.year; };
  const typeLbl = t => (EC.LOAN_TYPES[t] || {}).label || t, bankLbl = id => (EC.BANKS.banks[id] || {}).label || id;

  /* ---------------------------------------------------------------- the data: every loan the company has, grouped, read from the engines */
  function model(co) {
    st._day = co.dayIdx; const B = co.bank, own = [];
    for (const l of co.loans) own.push({ key: 'c' + l.id, sys: 'old', l, group: 'old', status: 'ACTIVE', bal: l.remaining, rate: l.rate });
    for (const l of B.loans) {
      const arr = l.arrears.reduce((a, x) => a + x.int + x.prin + (x.fee || 0), 0), bad = l.status === 'LOSS' || (l.status === 'ACTIVE' && ((l.stage | 0) > 0 || arr > 0));
      own.push({ key: 'b' + l.id, sys: 'bank', l, arr, status: l.status, bal: l.bal, rate: l.rate, group: l.status === 'CLOSED' ? 'repaid' : bad ? 'bad' : l.type === 'PROJECT_FINANCE' ? 'project' : 'bank' });
    }
    for (const l of co.closed) own.push({ key: 'x' + l.id, sys: 'old', l, group: 'repaid', status: 'CLOSED', bal: 0, rate: l.rate });
    return { own, by: g => own.filter(o => o.group === g), get: k => own.find(o => o.key === k) || null };
  }
  const nextDue = (l) => l.fm - (l.m % l.fm);                                                                  // months until the next instalment of a bank loan (1 = this month end)
  function bankSched(l, grace0) {                                                                              // the engine's own schedule from the CURRENT balance, rate and months left
    const left = Math.max(1, l.term - l.m), gl = Math.max(0, (l.grace | 0) - l.m);
    return LE.schedule({ amount: l.bal, rate: l.rate, term: left, grace: gl, freq: l.freq });
  }
  function upcoming(co, M, months) {                                                                           // [{k, label, name, amount}] for the next `months` month ends
    const out = [];
    for (const o of M.own) { if (o.status !== 'ACTIVE') continue; const l = o.l;
      if (o.sys === 'old') { const left = l.months - l.paid, gl = Math.max(0, (l.grace | 0) - l.paid), rows = co.constructor.schedule(l.remaining, l.rate, left, gl, l.paid).rows; for (let k = 0; k < Math.min(months, rows.length); k++) out.push({ k, name: l.kind === 'CENTRAL' ? 'قرض Central' : (l.purpose || 'قرض قديم'), amount: rows[k].payment });
      } else { const nd = nextDue(l), s = bankSched(l); for (const r of s.rows) { const k = (r.m - 1) * l.fm + nd - 1; if (k < months) out.push({ k, name: typeLbl(l.type) + ' #' + l.id, amount: r.payment }); } } }
    return out.sort((a, b) => a.k - b.k);
  }
  function debtSummary(co, M) {
    const B = co.bank, oldAll = co.loans.reduce((a, l) => a + l.remaining, 0), cen = co.loans.filter(l => l.kind === 'CENTRAL').reduce((a, l) => a + l.remaining, 0), bankL = B.bankDebt() - B.bonds.debt(), bonds = B.bonds.debt(), total = oldAll + bankL + bonds, bs = co.balanceSheet();
    let interest = co.loans.reduce((a, l) => a + l.remaining * l.rate, 0) + B.loans.reduce((a, l) => a + (l.status === 'ACTIVE' ? l.bal * l.rate : 0), 0); for (const b of B.bonds.issued) if (b.status !== 'CLOSED') interest += (b.face - (b.repaidFace || 0)) * b.coupon;
    const byBank = {}; for (const id of B.ids()) byBank[id] = B.loans.filter(l => l.bank === id && l.status === 'ACTIVE').reduce((a, l) => a + l.bal, 0);
    return { oldAll, cen, bankL, bonds, total, assets: bs.totalAssets, ratio: bs.totalAssets > 0 ? total / bs.totalAssets : null, interest, byBank, up: upcoming(co, M, 3) };
  }

  /* ---------------------------------------------------------------- sections */
  const tabs = () => '<div class="es-row" style="margin:6px 0 10px;flex-wrap:wrap">' + SECS.map(s => btn('lnSec', s[0], s[1], st.sec === s[0])).join('') + '</div>';
  const msgBox = () => st.msg ? '<div class="es-card" style="border-color:' + (st.msg.ok ? '#2f9e5a' : '#c0584e') + '"><div>' + esc(st.msg.text) + '</div></div>' : '';
  function bar(label, v, tot, col) { const w = tot > 0 ? Math.max(0, Math.min(100, v / tot * 100)) : 0; return '<div style="margin:6px 0"><div class="es-kv"><span>' + label + '</span><span dir="ltr">' + money(v) + ' · ' + Math.round(w) + '%</span></div><div style="height:7px;background:#26303c;border-radius:4px"><div style="height:7px;width:' + w + '%;background:' + col + ';border-radius:4px"></div></div></div>'; }

  function summary(co, M) {
    const S = debtSummary(co, M), B = co.bank, worst = B.worstStage(), lim = EC.BANK_LOANS.maxDebtRatio, ctx = co.bankRiskCtx(), used = ctx.riskBase > 0 ? ctx.riskDebt / ctx.riskBase : null;
    let h = '<div class="es-grid"><div class="es-card"><div class="es-sm">إجمالي الدين</div><div style="font-size:19px;font-weight:700" dir="ltr">' + money(S.total) + '</div></div><div class="es-card"><div class="es-sm">الدين / الأصول</div><div style="font-size:19px;font-weight:700" dir="ltr">' + (S.ratio == null ? '—' : pct(S.ratio, 1)) + '</div></div>'
      + '<div class="es-card"><div class="es-sm">الفوائد السنوية (على الأرصدة الحالية)</div><div style="font-size:17px;font-weight:700" dir="ltr">' + money(S.interest) + '</div></div><div class="es-card"><div class="es-sm">أسوأ مرحلة تعثر</div><div style="font-size:17px;font-weight:700" class="' + (worst >= 3 ? 'neg' : worst ? 'warn' : 'pos') + '">' + STG[worst] + '</div></div></div>';
    h += card('مكوّنات الدين', kv('قروض Central', money(S.cen)) + kv('قروض قديمة أخرى', money(S.oldAll - S.cen)) + kv('قروض مصرفية وتمويل مشاريع', money(S.bankL)) + kv('سندات أصدرتها الشركة (التزام)', money(S.bonds)) + kv('الإجمالي', money(S.total)) + note('كل قروض Central تُحتسب هنا في إجمالي الدين لكنها تُعرض منفصلة عن القروض المصرفية. سندات الشركة المملوكة (أصول) ليست دَيناً وتجدها في نظام الاستثمار.'));
    h += card('حد المخاطر للاقتراض الجديد', kv('الدين الخاضع للحد (بلا Central)', money(ctx.riskDebt)) + kv('القاعدة (أصول بلا Central + مخزون + نقد)', money(ctx.riskBase)) + kv('المستخدم / الحد', (used == null ? '—' : pct(used, 1)) + ' / ' + pct(lim, 0), used != null && used > lim ? 'neg' : '') + (ctx.restricted ? '<div class="warn">الإقراض الجديد مقيَّد الآن (ضغط ديون أو مرحلة تعثر ≥ 3).</div>' : ''));
    h += card('توزيع الديون حسب الجهة', bar('قروض Central والقديمة', S.oldAll, S.total, '#d4a24c') + B.ids().map(id => bar(bankLbl(id), S.byBank[id], S.total, '#4aa3df')).join('') + bar('سندات الشركة الصادرة', S.bonds, S.total, '#a779e0'));
    h += card('الأقساط القادمة (3 أشهر)', S.up.length ? [0, 1, 2].map(k => { const r = S.up.filter(x => x.k === k); return r.length ? '<h5 style="margin:8px 0 2px">' + monthLbl(k) + ' · ' + money(r.reduce((a, x) => a + x.amount, 0)) + '</h5>' + r.map(x => kv(esc(x.name), money(x.amount))).join('') : ''; }).join('') + note('قروض Central: شهرياً من جدولها. القروض المصرفية: حسب دورة كل قرض ومحرك الجداول نفسه (تقدير على الرصيد الحالي).') : '<div class="es-sm">لا أقساط في الأشهر الثلاثة القادمة.</div>');
    return h;
  }

  function loanCard(co, o) {
    const l = o.l; let h = '', open = st.panel && st.panel.k === o.key;
    if (o.sys === 'bank') {
      const due = nextDue(l), cc = co.bank.collateralOf(l, co._valuer());
      h = '<h5>' + (l.type === 'PROJECT_FINANCE' ? '🏗️ ' : '') + '#' + l.id + ' · ' + typeLbl(l.type) + ' · ' + bankLbl(l.bank) + (l.purpose ? ' · ' + esc(l.purpose) : '') + '</h5>' + kv('المبلغ الأصلي', money(l.principal)) + kv('الرصيد', money(l.bal)) + kv('الفائدة', pct(l.rate)) + kv('الأجل', FREQ[l.freq] + ' · انقضى ' + l.m + ' من ' + l.term + ' شهراً')
        + (o.status === 'ACTIVE' ? kv('القسط القادم', money(l.pmt) + ' · بعد ' + due + ' شهر') + kv('فائدة مستحقة', money(l.accr)) : '') + kv('فوائد مدفوعة', money(l.paidInt)) + kv('أصل مدفوع', money(l.paidPrin)) + (o.arr > 0 ? kv('متأخرات', money(o.arr), 'neg') : '') + ((l.stage | 0) > 0 && o.status === 'ACTIVE' ? kv('مرحلة التعثر', STG[l.stage | 0], 'neg') : '') + (cc.value > 0 ? kv('قيمة الضمان / LTV', money(cc.value) + ' / ' + (isFinite(cc.ltv) ? pct(cc.ltv, 1) : '—')) : '')
        + (o.status === 'CLOSED' ? kv('أُغلق في', l.closedDay != null ? dateOf(l.closedDay) : '—') : '');
      if (o.status === 'ACTIVE') h += '<div class="es-row">' + btn('lnView', o.key, 'الجدول') + btn('lnPanel', o.key + '|pay', 'سداد مبكر', open && st.panel.mode === 'pay') + btn('lnPanel', o.key + '|re', 'إعادة جدولة', open && st.panel.mode === 're') + '</div>' + (open ? bankPanel(co, o) : '');
    } else if (o.status === 'ACTIVE') {
      h = '<h5>' + (l.kind === 'CENTRAL' ? '🛢️ قرض Central' : l.kind === 'EMERGENCY' ? 'ائتمان طوارئ' : esc(l.purpose || 'قرض')) + ' #' + l.id + '</h5>' + kv('الأصل', money(l.principal)) + kv('الرصيد', money(l.remaining)) + kv('الفائدة', pct(l.rate)) + kv('القسط الشهري', money(l.payment)) + kv('المسدّد من الأقساط', l.paid + ' / ' + l.months) + kv('فوائد مدفوعة', money(l.intPaid || 0)) + kv('أصل مسدّد', money(l.principal - l.remaining)) + ((l.saved || 0) > 0 ? kv('فوائد وُفّرت بالسداد المبكر', money(l.saved), 'pos') : '')
        + '<div class="es-row">' + btn('lnView', o.key, 'الجدول') + btn('lnPanel', o.key + '|pay', 'سداد مبكر', open && st.panel.mode === 'pay') + (l.kind !== 'CENTRAL' ? btn('lnPanel', o.key + '|re', 'إعادة جدولة', open && st.panel.mode === 're') : '') + '</div>' + (open ? oldPanel(co, o) : '');
    } else h = '<h5>' + (l.kind === 'CENTRAL' ? '🛢️ قرض Central' : esc(l.purpose || 'قرض')) + ' #' + l.id + ' · مُسدَّد</h5>' + kv('الأصل', money(l.principal)) + kv('فوائد مدفوعة', money(l.intPaid || 0)) + ((l.saved || 0) > 0 ? kv('فوائد وُفّرت', money(l.saved), 'pos') : '');
    return '<div class="es-card">' + h + '</div>';
  }
  const AMT_IN = (id, v) => '<input id="' + id + '" type="number" inputmode="decimal" value="' + (v || '') + '" style="width:100%;min-height:40px;border-radius:8px;border:1px solid #4b6a8a;background:#161d27;color:#fff;padding:0 8px;direction:ltr;box-sizing:border-box">';
  function bankPanel(co, o) {
    const l = o.l, p = st.panel, B = co.bank; let h = '<div class="es-card" style="background:#1b2430">';
    if (p.mode === 'pay') {
      const arrP = l.arrears.reduce((a, x) => a + x.prin, 0), free = Math.round((l.bal - arrP) * 100) / 100, a = p.amt != null ? Math.min(p.amt, free) : null, frac = co._monthFrac(), partInt = Math.round(l.bal * l.rate / 12 * frac * (1 - l.af) * 100) / 100, arrT = l.arrears.reduce((s, x) => s + x.int + x.prin + (x.fee || 0), 0), fee = a ? a * EC.BANK_LOANS.prepayFee : 0;
      h += '<b>سداد مبكر</b><div class="es-sm">الحد الأقصى للأصل القابل للسداد: ' + money(free) + (arrT > 0 ? ' · تُسدَّد المتأخرات أولاً (' + money(arrT) + ')' : '') + '</div><div class="es-row">' + [10, 25, 50, 100].map(q => btn('lnAmt', o.key + '|' + q, q === 100 ? 'الكل' : q + '%', p.q === q)).join('') + '</div><div style="margin:6px 0">' + AMT_IN('ln-amt', p.amt && p.q == null ? p.amt : '') + '</div><div class="es-row">' + btn('lnAmtIn', o.key, 'احسب المبلغ المكتوب') + '</div>';
      if (a > 0) { const need = a + l.accr + arrT + partInt + fee; h += kv('الأصل المسدَّد', money(a)) + kv('فائدة مستحقة + جزء الشهر', money(l.accr + partInt)) + (arrT > 0 ? kv('متأخرات', money(arrT)) : '') + kv('رسوم السداد المبكر', money(fee)) + kv('المطلوب نقداً (تقدير)', money(need), need > co.store.cash ? 'neg' : '') + '<div class="es-row"><button data-act="lnPay" data-v="' + o.key + '" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff"' + (need > co.store.cash ? ' disabled' : '') + '>تأكيد السداد ' + money(a) + '</button></div>' + (need > co.store.cash ? '<div class="warn">النقد لا يكفي.</div>' : ''); }
    } else {
      const T = EC.LOAN_TYPES[l.type], maxM = T.maxMonths - l.m, opts = []; for (let m = l.fm; m <= maxM && opts.length < 8; m += l.fm * Math.max(1, Math.round(Math.max(1, maxM / 8 / l.fm)))) opts.push(m);
      h += '<b>إعادة جدولة</b><div class="es-sm">مدة جديدة تبدأ من الآن (حتى ' + maxM + ' شهراً لهذا النوع). الرسم ' + pct(EC.BANK_LOANS.rescheduleFee, 2) + ' من الرصيد = ' + money(l.bal * EC.BANK_LOANS.rescheduleFee) + '.</div><div class="es-row" style="flex-wrap:wrap">' + opts.map(m => btn('lnRe', o.key + '|' + m, m + ' شهراً', p.m === m)).join('') + '</div>';
      if (p.m) { const c = Object.assign({}, l, { term: l.m + p.m }); c.pmt = LE.pmtFor(c); h += kv('القسط بعد الجدولة', money(c.pmt)) + kv('القسط الحالي', money(l.pmt)) + '<div class="es-row"><button data-act="lnResched" data-v="' + o.key + '" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff">تأكيد إعادة الجدولة إلى ' + p.m + ' شهراً</button></div>'; }
    }
    return h + '</div>';
  }
  function oldPanel(co, o) {
    const l = o.l, p = st.panel; let h = '<div class="es-card" style="background:#1b2430">';
    if (p.mode === 'pay') {
      const fee = l.kind === 'CENTRAL' ? 0 : EC.LOANS.prepayFee, a = p.amt != null ? Math.min(p.amt, l.remaining) : null;
      h += '<b>سداد مبكر</b><div class="es-sm">الرصيد ' + money(l.remaining) + (l.kind === 'CENTRAL' ? ' · بلا غرامة سداد مبكر على قرض Central' : ' · رسم السداد المبكر ' + pct(fee, 1)) + '</div><div class="es-row">' + (l.kind === 'CENTRAL' ? [10, 25, 50].map(q => btn('lnAmt', o.key + '|' + q, q + '%', p.q === q)).join('') : '') + btn('lnAmt', o.key + '|100', 'الكل', p.q === 100) + '</div>';
      if (a > 0) { const full = a >= l.remaining - 0.005, need = a * (1 + fee); h += kv('الأصل المسدَّد', money(a)) + (l.kind === 'CENTRAL' ? kv('فائدة الشهر حتى اليوم', 'تُحتسب عند السداد') : kv('رسم السداد المبكر', money(a * fee))) + kv('المطلوب نقداً (أدنى)', money(need), need > co.store.cash ? 'neg' : '') + '<div class="es-row"><button data-act="lnPay" data-v="' + o.key + '" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff"' + (need > co.store.cash ? ' disabled' : '') + '>تأكيد ' + (full ? 'سداد كامل' : 'سداد جزئي') + ' ' + money(a) + '</button></div>'; }
    } else {
      const R = EC.RESCUE;
      h += '<b>إعادة جدولة</b><div class="es-sm">الرسم ' + pct(R.rescheduleFee, 2) + ' من الرصيد = ' + money(l.remaining * R.rescheduleFee) + '.</div><div class="es-row" style="flex-wrap:wrap">' + R.rescheduleMonths.map(m => btn('lnRe', o.key + '|' + m, m + ' شهراً', p.m === m)).join('') + '</div>';
      if (p.m) h += kv('القسط بعد الجدولة', money(co.constructor.payment(l.remaining, l.rate, p.m))) + kv('القسط الحالي', money(l.payment)) + '<div class="es-row"><button data-act="lnResched" data-v="' + o.key + '" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff">تأكيد إعادة الجدولة إلى ' + p.m + ' شهراً</button></div>';
    }
    return h + '</div>';
  }
  function active(co, M) {
    const groups = [['old', '🛢️ قروض Central والقروض القديمة', 'تُحتسب في إجمالي الدين وتُعرض هنا منفصلة عن القروض المصرفية.'], ['bank', '🏦 القروض المصرفية', null], ['project', '🏗️ تمويل المشاريع', 'قروض بنكية أُخذت لتمويل بناء منشآت.'], ['bad', '⚠️ القروض المتعثرة', 'قروض مصرفية عليها متأخرات أو مرحلة تعثر.']]; let h = '', any = false;
    for (const [g, t, n] of groups) { const L = M.by(g); if (!L.length) continue; any = true; h += '<h5 style="margin:12px 0 4px">' + t + ' · ' + L.length + '</h5>' + (n ? note(n) : '') + L.map(o => loanCard(co, o)).join(''); }
    if (!any) h += card('لا توجد قروض قائمة', '<div class="es-sm">لا قروض نشطة الآن. ابدأ من «طلب قرض جديد».</div>');
    const rp = M.by('repaid'); h += '<h5 style="margin:12px 0 4px">✅ القروض المسدَّدة · ' + rp.length + '</h5>' + (rp.length ? rp.slice(0, st.more ? 999 : 3).map(o => loanCard(co, o)).join('') + (rp.length > 3 ? '<div class="es-row">' + btn('lnMore', '1', st.more ? 'إخفاء' : 'عرض الكل (' + rp.length + ')') + '</div>' : '') : '<div class="es-sm">لا قروض مسدَّدة بعد.</div>');
    return h;
  }

  /* ---- a new loan: bank -> type -> amount -> term -> frequency (+ grace) [-> collateral] -> review & confirm ---- */
  function termChoices(T, fm) { const all = [6, 12, 24, 36, 60, 84, 120, 180, 240, 360, 480, 720]; return all.filter(t => t <= T.maxMonths && t % fm === 0); }
  function collateralItems(co, type) {
    const kinds = (EC.COLLATERAL.kinds || {})[type] || [], out = [], val = co._valuer();
    if (kinds.includes('ASSET')) for (const b of co.store.list()) { if (co.bank.assetPledged(b.id)) continue; const v = val.asset(b.id); if (v > 0) out.push({ kind: 'ASSET', ref: b.id, value: v, name: (b.name || (window_DEFS(b) || b.d)) + ' #' + b.id }); }
    out.sort((a, b) => b.value - a.value); const res = out.slice(0, 12);
    if (kinds.includes('OIL')) for (const p of ['CRUDE', 'GASOLINE', 'DIESEL', 'JET_FUEL']) { const o = val.oil(p); if (o && o.avail - co.bank.oilPledged(p) > 1) res.push({ kind: 'OIL', ref: p, avail: o.avail - co.bank.oilPledged(p), price: o.price, name: EC.LABEL[p] || p }); }
    return res;
  }
  function window_DEFS(b) { try { const D = (typeof window !== 'undefined' ? window.OliBuildings : require('./buildings.js')).DEFS; return D[b.d] && D[b.d].name; } catch (e) { return null; } }
  function spec(w) { return { bank: w.bank, type: w.type, amount: w.amount, term: w.term, freq: w.freq, grace: w.grace, collateral: w.coll.length ? w.coll.map(c => c.kind === 'ASSET' ? { kind: 'ASSET', ref: c.ref } : { kind: 'OIL', ref: c.ref, qty: c.qty }) : undefined }; }
  function review(co, w, confirmBtn) {
    const q = co.bankQuote(w.bank, w.type, w.amount, w.term, spec(w)); let h = '';
    if (!q.ok) return '<div class="warn">محرك الأهلية والمخاطر لا يوافق: ' + esc(why(q.reason)) + (q.cap != null ? ' (طاقة الاقتراض بالضمان ' + money(q.cap) + ')' : '') + '</div>';
    const s = LE.schedule({ amount: w.amount, rate: q.rate, term: w.term, grace: w.grace, freq: w.freq }), fm = LE.FM[w.freq], first = monthLbl(fm - 1), fee = 0;
    h += kv('سعر الفائدة النهائي', pct(q.rate) + ' سنوياً') + kv('القسط (' + FREQ[w.freq] + ')', money(q.payment)) + kv('إجمالي الفوائد', money(s.totalInterest)) + kv('إجمالي المبلغ المستحق', money(w.amount + s.totalInterest)) + kv('موعد أول قسط', first + ' (آخر الشهر)') + kv('عدد الأقساط', s.rows.length) + (w.grace ? kv('سماح (فوائد فقط)', w.grace + ' شهراً') : '');
    h += '<div style="color:#2f9e5a" class="es-sm">✔ محرك الأهلية والمخاطر يوافق على هذا الطلب. لا يُنشأ القرض إلا بعد تأكيدك.</div>';
    return h + confirmBtn(q);
  }
  function newLoan(co, M) {
    const w = st.wiz, B = co.bank, steps = ['البنك', 'نوع القرض', 'المبلغ', 'المدة', 'دورة السداد', 'مراجعة وتأكيد'];
    let h = '<div class="es-row" style="flex-wrap:wrap;margin-bottom:8px">' + steps.map((s, i) => btn('lnStep', String(i + 1), (i + 1) + '. ' + s, w.step === i + 1, i + 1 > w.step ? ' disabled' : '')).join('') + '</div>';
    const T = w.type ? EC.LOAN_TYPES[w.type] : null, Bk = w.bank ? EC.BANKS.banks[w.bank] : null;
    if (w.step === 1) { h += card('اختر البنك', B.ids().map(id => { const b = EC.BANKS.banks[id]; return '<div style="margin-bottom:8px">' + btn('lnBank', id, esc(b.label), w.bank === id, ' style="width:100%;min-height:48px"') + '<div class="es-sm">أقصى قرض الآن ' + money(B.maxLoan(id)) + ' · سقف القرض الواحد ' + money(b.singleLoanCap) + ' · هامش البنك ' + pct(b.spread) + '</div></div>'; }).join('')); }
    else if (w.step === 2) { h += card('نوع القرض · ' + esc(bankLbl(w.bank)), Bk.types.map(t => { const ty = EC.LOAN_TYPES[t], locked = ty.lock && ty.lock !== 'COLLATERAL', r = B.quote(w.bank, t, B.creditPremium()); return '<div style="margin-bottom:8px">' + btn('lnType', t, esc(ty.label), w.type === t, ' style="width:100%;min-height:46px"' + (locked ? ' disabled' : '')) + '<div class="es-sm">' + (locked ? 'مقفل: ' + why('LOCKED_' + ty.lock) : 'فائدة تبدأ من ' + pct(r) + ' · حتى ' + ty.maxMonths + ' شهراً' + (ty.lock === 'COLLATERAL' ? ' · يتطلب ضماناً' : '')) + '</div></div>'; }).join('')); }
    else if (w.step === 3) {
      const mx = Math.min(B.maxLoan(w.bank), 1e12), mn = EC.BANK_LOANS.minAmount, pre = [1e6, 5e6, 10e6, 25e6, 50e6, 100e6, 250e6].filter(a => a >= mn && a <= mx + 1);
      h += card('المبلغ', '<div class="es-sm">بين ' + money(mn) + ' و ' + money(mx) + ' (سقف البنك والسيولة والرفع الآن)</div><div class="es-row" style="flex-wrap:wrap">' + pre.map(a => btn('lnAmount', String(a), money(a), w.amount === a)).join('') + '</div><div style="margin:8px 0">' + AMT_IN('ln-wamt', w.amount || '') + '</div><div class="es-row">' + btn('lnAmountIn', '1', 'اعتمد المبلغ المكتوب') + '</div>' + (w.amount ? kv('المختار', money(w.amount)) : '') + (w.amount ? '<div class="es-row">' + btn('lnStep', '4', 'التالي ←') + '</div>' : ''));
      if (T && T.lock === 'COLLATERAL') { const it = collateralItems(co, w.type); h += card('الضمان (إلزامي لهذا النوع)', it.length ? it.map(c => { const on = w.coll.some(z => z.kind === c.kind && z.ref === c.ref); return '<div style="margin-bottom:6px">' + btn('lnColl', c.kind + ':' + c.ref, esc(c.name) + ' · ' + money(c.kind === 'ASSET' ? c.value : c.avail * c.price), on, ' style="width:100%;min-height:42px"') + '</div>'; }).join('') + note('كل أصل أو برميل يُرهن لقرض واحد فقط. طاقة الاقتراض = قيمة الضمان × ' + pct(EC.COLLATERAL.ltv.ASSET.max, 0) + ' (أصول) / ' + pct(EC.COLLATERAL.ltv.OIL.max, 0) + ' (نفط).') : '<div class="warn">لا يوجد ضمان متاح لهذا النوع.</div>'); }
    } else if (w.step === 4) { h += card('المدة', '<div class="es-row" style="flex-wrap:wrap">' + termChoices(T, 1).map(t => btn('lnTerm', String(t), t >= 12 && t % 12 === 0 ? t / 12 + ' سنة' : t + ' شهراً', w.term === t)).join('') + '</div>' + note('الحد الأقصى لهذا النوع ' + T.maxMonths + ' شهراً.')); }
    else if (w.step === 5) { const fr = Object.keys(LE.FM).filter(f => w.term % LE.FM[f] === 0), gr = [0, 6, 12, 24].filter(g => g <= Math.min(w.term, EC.BANK_LOANS.maxGraceMonths) && g % LE.FM[w.freq] === 0);
      h += card('دورة السداد المتاحة لهذه المدة', '<div class="es-row">' + fr.map(f => btn('lnFreq', f, FREQ[f], w.freq === f)).join('') + '</div><h5 style="margin-top:10px">فترة السماح (فوائد فقط)</h5><div class="es-row">' + gr.map(g => btn('lnGrace', String(g), g ? g + ' شهراً' : 'بلا سماح', w.grace === g)).join('') + '</div><div class="es-row">' + btn('lnStep', '6', 'مراجعة الطلب ←') + '</div>'); }
    else h += card('مراجعة وتأكيد · ' + esc(bankLbl(w.bank)) + ' · ' + esc(typeLbl(w.type)) + ' · ' + money(w.amount) + ' · ' + w.term + ' شهراً', review(co, w, q => '<div class="es-row"><button data-act="lnTake" data-v="1" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff;min-height:46px">تأكيد وأخذ القرض ' + money(w.amount) + '</button></div>'));
    return h;
  }

  /* ---- the schedule of one loan ---- */
  function schedTable(rows, labelOf, paid) {
    let h = '<div style="overflow-x:auto"><table style="width:100%;font-size:11px;border-collapse:collapse;text-align:center"><tr style="color:#9aa7b4"><th>الموعد</th><th>القسط</th><th>أصل</th><th>فائدة</th><th>الرصيد</th><th>الحالة</th></tr>';
    for (const r of rows) h += '<tr style="border-top:1px solid #33404f"><td>' + labelOf(r) + '</td><td dir="ltr">' + n0(r.payment) + '</td><td dir="ltr">' + n0(r.principal) + '</td><td dir="ltr">' + n0(r.interest) + '</td><td dir="ltr">' + n0(r.balance) + '</td><td class="' + (r.paid ? 'pos' : r.late ? 'neg' : '') + '">' + (r.late ? 'متأخر' : r.paid ? 'مدفوع' : r.grace ? 'مجدول (سماح)' : 'مجدول') + '</td></tr>';
    return h + '</table></div>';
  }
  function sched(co, M) {
    const act = M.own.filter(o => o.status === 'ACTIVE'); if (!act.length) return card('لا قروض نشطة', '<div class="es-sm">لا جدول لعرضه. جدول القرض يظهر هنا بعد أخذ قرض.</div>');
    const o = M.get(st.sel) && M.get(st.sel).status === 'ACTIVE' ? M.get(st.sel) : act[0], l = o.l;
    let h = '<div class="es-row" style="flex-wrap:wrap">' + act.map(x => btn('lnView', x.key, (x.sys === 'bank' ? '#' + x.l.id + ' ' + typeLbl(x.l.type) : x.l.kind === 'CENTRAL' ? 'Central #' + x.l.id : 'قديم #' + x.l.id), x.key === o.key)).join('') + '</div>';
    let past = [], rows = [], total = 0, head;
    if (o.sys === 'bank') {
      const B = co.bank; for (const t of B.tx) if (t[3] === l.id && (t[2] === 2 || t[2] === 4 || t[2] === 6)) past.push({ day: t[1], payment: t[4] + t[5], interest: t[4], principal: t[5], code: t[2] });
      const s = bankSched(l), nd = nextDue(l); rows = s.rows.map(r => ({ k: (r.m - 1) * l.fm + nd - 1, payment: r.payment, principal: r.principal, interest: r.interest, balance: r.balance, grace: r.grace })); total = s.totalInterest;
      for (const a of l.arrears) past.push({ day: null, payment: a.int + a.prin + (a.fee || 0), interest: a.int, principal: a.prin, late: true });
      head = kv('الرصيد', money(l.bal)) + kv('الفائدة', pct(l.rate)) + kv('الدورة', FREQ[l.freq]) + kv('إجمالي الفوائد المتبقية (تقدير على الرصيد الحالي)', money(total));
    } else {
      const left = l.months - l.paid, gl = Math.max(0, (l.grace | 0) - l.paid), s = co.constructor.schedule(l.remaining, l.rate, left, gl, l.paid); rows = s.rows.map((r, i) => ({ k: i, payment: r.payment, principal: r.principal, interest: r.interest, balance: r.balance, grace: r.grace })); total = s.totalInterest;
      head = kv('الرصيد', money(l.remaining)) + kv('الفائدة', pct(l.rate)) + kv('المدفوع من الأقساط', l.paid + ' / ' + l.months) + kv('إجمالي الفوائد المتبقية', money(total));
    }
    h += card('جدول القرض #' + l.id, head + note('الأقساط المستقبلية من دالة الجداول في المحرك على الرصيد الحالي. القسط الفعلي يتغيّر إن تغيّر المعدل أو سُدِّد جزء مبكراً.'));
    const sh = rows.slice(0, st.more ? 999 : 24);
    if (past.length) h += card('أقساط سابقة ومتأخرة', schedTable(past.map(p => ({ payment: p.payment, principal: p.principal, interest: p.interest, balance: 0, paid: !p.late, late: p.late, day: p.day })).map(r => Object.assign(r, { balance: NaN })), r => r.day != null ? dateOf(r.day) : '—').replace(/NaN/g, '—'));
    h += card('الأقساط القادمة', schedTable(sh, r => monthLbl(r.k)) + (rows.length > 24 ? '<div class="es-row">' + btn('lnMore', '1', st.more ? 'إخفاء' : 'عرض كل الأقساط (' + rows.length + ')') + '</div>' : ''));
    return h;
  }

  const LTX = { 1: 'فتح قرض', 2: 'سداد قسط', 3: 'تأخر قسط', 4: 'سداد متأخرات', 5: 'إعادة تسعير', 6: 'سداد مبكر', 7: 'إعادة جدولة', 8: 'إغلاق القرض', 15: 'غرامة تأخير', 16: 'مرحلة تعثر', 17: 'عرض إعادة هيكلة', 18: 'قبول إعادة هيكلة', 19: 'انتهاء عرض', 20: 'اكتمال خطة', 22: 'شطب' };
  function log(co, M) {
    const B = co.bank, rows = []; for (const t of B.tx) if (LTX[t[2]] && t[3]) rows.push({ day: t[1], txt: LTX[t[2]] + ' · قرض #' + t[3], a: [2, 3, 4, 6, 15].includes(t[2]) ? t[4] + (t[2] === 15 ? 0 : t[5]) : t[2] === 1 ? t[4] : null, cls: t[2] === 3 || t[2] === 15 ? 'neg' : '' });
    rows.reverse(); const ol = co.journal.log.filter(e => e.type === 'LOAN_IN' || e.type === 'LOAN_PRINCIPAL' || e.type === 'LOAN_REPAY').slice().reverse();
    let h = card('القروض المصرفية · ' + rows.length + ' عملية', rows.length ? rows.slice(0, st.more ? 400 : 40).map(r => kv(dateOf(r.day) + ' · ' + r.txt, r.a != null ? money(r.a) : '', r.cls)).join('') + (rows.length > 40 ? '<div class="es-row">' + btn('lnMore', '1', st.more ? 'إخفاء' : 'عرض الكل') + '</div>' : '') : '<div class="es-sm">لا عمليات بعد.</div>');
    h += card('القروض القديمة (Central وغيرها) · من دفتر القيود', ol.length ? ol.slice(0, 30).map(e => kv(esc(e.desc || e.type), money(e.lines.filter(x => x[0] === 'CASH').reduce((a, x) => a + x[1], 0)))).join('') + note('الفائدة تُسجَّل مصروفاً في دفتر الفوائد وتظهر في الأداء المالي.') : '<div class="es-sm">لا عمليات بعد.</div>');
    return h + card('مجاميع المسدَّد', kv('فوائد القروض المصرفية المدفوعة', money(B.loans.reduce((a, l) => a + l.paidInt, 0))) + kv('أصل القروض المصرفية المدفوع', money(B.loans.reduce((a, l) => a + l.paidPrin, 0))) + kv('غرامات التأخير المدفوعة', money(B.loans.reduce((a, l) => a + (l.paidFee || 0), 0))) + kv('فوائد القروض القديمة المدفوعة', money(co.loans.concat(co.closed).reduce((a, l) => a + (l.intPaid || 0), 0))));
  }

  function arrears(co, M) {
    const B = co.bank, L = M.by('bad'), D = EC.DEFAULT; let h = card('ملخص', kv('قروض متعثرة', L.length) + kv('إجمالي المتأخرات', money(B.arrearsTotal()), B.arrearsTotal() > 0 ? 'neg' : '') + kv('أسوأ مرحلة', STG[B.worstStage()]) + kv('غرامة التأخير', pct(D.feeRate, 1) + ' من القسط المتأخر (مرة واحدة)') + note('المراحل: تأخر ' + D.stage2Days + ' يوماً ← تحذير ← ضائقة ← إعادة هيكلة ← استرداد الأصول.'));
    for (const o of L) { const l = o.l, fee = l.arrears.reduce((a, x) => a + (x.fee || 0), 0);
      h += '<div class="es-card"><h5>#' + l.id + ' · ' + typeLbl(l.type) + ' · ' + bankLbl(l.bank) + '</h5>' + kv('المرحلة', (l.stage | 0) + ' · ' + STG[l.stage | 0], l.stage >= 3 ? 'neg' : 'warn') + kv('أقساط متأخرة', l.arrears.length) + kv('أصل متأخر', money(l.arrears.reduce((a, x) => a + x.prin, 0))) + kv('فوائد متأخرة', money(l.arrears.reduce((a, x) => a + x.int, 0))) + kv('غرامات تأخير', money(fee), fee > 0 ? 'neg' : '') + (l.call ? kv('Margin Call', 'المطلوب ' + money(l.call.need) + ' · منذ ' + dateOf(l.call.day), 'neg') : '');
      if (l.plan) { h += kv('إعادة الهيكلة', PLAN[l.plan.status] + (l.plan.status === 'OFFERED' ? ' · حتى ' + dateOf(l.plan.expires) : ''), 'warn'); if (l.plan.status === 'OFFERED' && co.dayIdx <= l.plan.expires) h += '<div class="es-row">' + l.plan.options.map(op => '<button data-act="lnPlan" data-v="' + o.key + '|' + op.kind + '">' + (op.kind === 'EXTEND' ? 'تمديد الأجل ' + op.months + ' شهراً' : 'سماح ' + op.graceMonths + ' شهراً (فوائد فقط)') + '</button>').join('') + '</div>' + note('القبول يرسمل الفوائد والغرامات المتأخرة على الرصيد ويصفّر المتأخرات، ومخالفة الخطة تعيد القرض للمرحلة 5.'); }
      h += '<div class="es-row">' + btn('lnView', o.key, 'الجدول') + btn('lnPanel', o.key + '|pay', 'سداد') + '</div>' + (st.panel && st.panel.k === o.key ? bankPanel(co, o) : '') + '</div>'; }
    if (!L.length) h += card('لا متأخرات', '<div class="es-sm" style="color:#2f9e5a">كل القروض المصرفية منتظمة السداد.</div>');
    if (co.fin && co.fin.state === 'DEBT_PRESSURE') h += '<div class="warn">الشركة تحت ضغط ديون (القروض العادية الجديدة مقفلة).</div>';
    const ba = B.bonds.arrearsTotal(); if (ba > 0) h += card('متأخرات سندات الشركة الصادرة', kv('الإجمالي', money(ba), 'neg') + note('التفاصيل في نظام الاستثمار ← السندات ← السندات الصادرة.'));
    return h;
  }

  function banks(co) {
    const B = co.bank, base = B.rate.rate; let h = card('سعر الأساس', kv('Base Rate', pct(base)) + kv('علاوة ائتمانية على شركتك', pct(B.creditPremium())) + note('فائدة القرض = الأساس + هامش البنك + علاوة النوع + العلاوة الائتمانية (حسب محرك البنوك).'));
    for (const id of B.ids()) { const b = EC.BANKS.banks[id], s = B.snapshot(id, co.dayIdx);
      h += '<div class="es-card"><h5>' + esc(b.label) + '</h5>' + kv('سيولة قابلة للإقراض', money(B.lendable(id))) + kv('أقصى قرض الآن', money(B.maxLoan(id))) + kv('سقف القرض الواحد', money(b.singleLoanCap)) + kv('الرفع المالي', isFinite(B.leverage(id)) ? B.leverage(id).toFixed(2) + ' من ' + b.maxLeverage : '—') + '<h5 style="margin:8px 0 2px">عروض التمويل</h5>'
        + b.types.map(t => { const ty = EC.LOAN_TYPES[t], lock = ty.lock && ty.lock !== 'COLLATERAL'; return kv(esc(ty.label) + (ty.lock === 'COLLATERAL' ? ' (بضمان)' : ''), lock ? '<span class="neg">مقفل</span>' : pct(B.quote(id, t, B.creditPremium())) + ' · حتى ' + ty.maxMonths + ' شهراً'); }).join('') + '<div class="es-row">' + btn('lnPick', id, 'اطلب قرضاً من هذا البنك') + '</div></div>'; }
    let offers = []; for (const l of B.loans) if (l.status === 'ACTIVE' && l.plan && l.plan.status === 'OFFERED' && co.dayIdx <= l.plan.expires) offers.push(l);
    h += card('عروض إعادة الهيكلة المفتوحة', offers.length ? offers.map(l => kv('قرض #' + l.id + ' · ' + bankLbl(l.bank), 'حتى ' + dateOf(l.plan.expires))).join('') + '<div class="es-row">' + btn('lnSec', 'arrears', 'اذهب إلى المتأخرات') + '</div>' : '<div class="es-sm">لا عروض إعادة هيكلة الآن (تظهر عند مرحلة التعثر 4).</div>');
    return h;
  }

  function calcSec(co) {
    const c = st.calc, B = co.bank, bk = EC.BANKS.banks[c.bank], types = bk.types.filter(t => !(EC.LOAN_TYPES[t].lock && EC.LOAN_TYPES[t].lock !== 'COLLATERAL')), T = EC.LOAN_TYPES[c.type] || EC.LOAN_TYPES[types[0]];
    let h = card('حاسبة القروض (لا تُنشئ قرضاً)', '<div class="es-sm">البنك</div><div class="es-row">' + B.ids().map(id => btn('lnCalc', 'bank|' + id, esc(bankLbl(id)), c.bank === id)).join('') + '</div><div class="es-sm">النوع</div><div class="es-row" style="flex-wrap:wrap">' + types.map(t => btn('lnCalc', 'type|' + t, esc(typeLbl(t)), c.type === t)).join('') + '</div><div class="es-sm">المبلغ</div><div class="es-row" style="flex-wrap:wrap">' + [1e6, 5e6, 10e6, 25e6, 50e6, 100e6].map(a => btn('lnCalc', 'amount|' + a, money(a), c.amount === a)).join('') + '</div><div class="es-sm">المدة</div><div class="es-row" style="flex-wrap:wrap">' + termChoices(T, 1).map(t => btn('lnCalc', 'term|' + t, t >= 12 && t % 12 === 0 ? t / 12 + ' سنة' : t + ' شهراً', c.term === t)).join('') + '</div><div class="es-sm">الدورة</div><div class="es-row">' + Object.keys(LE.FM).filter(f => c.term % LE.FM[f] === 0).map(f => btn('lnCalc', 'freq|' + f, FREQ[f], c.freq === f)).join('') + '</div>');
    const q = co.bankQuote(c.bank, c.type, c.amount, c.term, { freq: c.freq, grace: c.grace });
    if (!q.ok) return h + '<div class="warn">' + esc(why(q.reason)) + '</div>';
    const s = LE.schedule({ amount: c.amount, rate: q.rate, term: c.term, grace: c.grace, freq: c.freq }), yrs = {}; for (const r of s.rows) { const y = Math.ceil(r.m / 12); yrs[y] = yrs[y] || { p: 0, i: 0 }; yrs[y].p += r.principal; yrs[y].i += r.interest; }
    h += card('النتيجة (من محرك التقييم نفسه)', kv('سعر الفائدة', pct(q.rate)) + kv('القسط (' + FREQ[c.freq] + ')', money(q.payment)) + kv('إجمالي الفوائد', money(s.totalInterest)) + kv('إجمالي المبلغ المستحق', money(c.amount + s.totalInterest)) + kv('موعد أول قسط', monthLbl(LE.FM[c.freq] - 1)) + kv('الأقساط', s.rows.length));
    h += card('الفائدة والأصل بالسنة', '<table style="width:100%;font-size:12px;text-align:center"><tr style="color:#9aa7b4"><th>السنة</th><th>أصل</th><th>فائدة</th></tr>' + Object.keys(yrs).slice(0, 12).map(y => '<tr><td>' + y + '</td><td dir="ltr">' + n0(yrs[y].p) + '</td><td dir="ltr">' + n0(yrs[y].i) + '</td></tr>').join('') + '</table>');
    return h + '<div class="es-row">' + btn('lnToWiz', '1', 'حوّل هذه الأرقام إلى طلب قرض') + '</div>';
  }

  function html(co) {
    const M = model(co); let body;
    switch (st.sec) { case 'active': body = active(co, M); break; case 'new': body = newLoan(co, M); break; case 'sched': body = sched(co, M); break; case 'log': body = log(co, M); break; case 'arrears': body = arrears(co, M); break; case 'banks': body = banks(co); break; case 'calc': body = calcSec(co); break; default: body = summary(co, M); }
    return '<div class="es-sm" style="letter-spacing:.06em">LOANS &amp; FINANCING</div>' + tabs() + msgBox() + body + note('أرقام هذه الشاشة من محرك القروض (bank.js) والقروض القديمة؛ كل زر يستدعي عملية حقيقية في اللعبة.');
  }

  /* ---------------------------------------------------------------- actions (each one calls a real engine function; money moves only through them) */
  const val$ = id => { const e = typeof document !== 'undefined' ? document.getElementById(id) : null; return e ? +e.value : NaN; };
  function done(r, okText) { st.msg = r && r.ok ? { ok: true, text: okText } : { ok: false, text: 'تعذّر: ' + why(r && r.reason) + (r && r.need ? ' (المطلوب ' + money(r.need) + ')' : '') }; }
  function act(a, el, co) {
    const v = el && el.dataset ? el.dataset.v : null, M = co ? model(co) : null, W = st.wiz;
    switch (a) {
      case 'lnSec': st.sec = SECS.some(s => s[0] === v) ? v : 'summary'; st.panel = null; st.msg = null; st.more = false; return true;
      case 'lnMore': st.more = !st.more; return true;
      case 'lnView': st.sel = v; st.sec = 'sched'; st.more = false; return true;
      case 'lnPanel': { const [k, mode] = v.split('|'); st.panel = st.panel && st.panel.k === k && st.panel.mode === mode ? null : { k, mode, q: null, amt: null, m: null }; st.msg = null; return true; }
      case 'lnAmt': { const [k, q] = v.split('|'), o = M.get(k); if (!o || !st.panel) return true; const free = o.sys === 'bank' ? Math.round((o.l.bal - o.l.arrears.reduce((s, x) => s + x.prin, 0)) * 100) / 100 : o.l.remaining; st.panel.q = +q; st.panel.amt = +q >= 100 ? free : Math.floor(free * +q) / 100; return true; }
      case 'lnAmtIn': { const x = val$('ln-amt'); if (st.panel && x > 0) { st.panel.q = null; st.panel.amt = x; } return true; }
      case 'lnRe': { const [k, m] = v.split('|'); if (st.panel) st.panel.m = +m; return true; }
      case 'lnPay': { const o = M.get(v); if (!o || !st.panel || !(st.panel.amt > 0)) return true; const full = st.panel.q === 100, amt = full ? null : st.panel.amt; const r = o.sys === 'bank' ? co.prepayBankLoan(o.l.id, amt) : (o.l.kind === 'CENTRAL' || !full ? co.prepayLoan(o.l.id, amt) : co.repayLoan(o.l.id)); done(r, r.ok ? (r.full || full ? 'تم سداد القرض بالكامل: ' : 'تم سداد جزء من أصل القرض: ') + money(r.paid || 0) : ''); st.panel = null; return true; }
      case 'lnResched': { const o = M.get(v); if (!o || !st.panel || !st.panel.m) return true; const r = o.sys === 'bank' ? co.rescheduleBankLoan(o.l.id, st.panel.m) : co.rescheduleLoan(o.l.id, st.panel.m); done(r, 'أُعيدت الجدولة. القسط الجديد ' + money(r.payment || 0) + ' · رسم ' + money(r.fee || 0)); st.panel = null; return true; }
      case 'lnPlan': { const [k, kind] = v.split('|'), o = M.get(k); if (!o) return true; const r = co.acceptRestructuring(o.l.id, kind); done(r, 'قُبلت إعادة الهيكلة: رُسملت ' + money(r.capitalised || 0) + ' والقسط الجديد ' + money(r.payment || 0)); return true; }
      case 'lnPick': W.bank = v; W.step = 2; W.type = null; W.coll = []; st.sec = 'new'; return true;
      case 'lnBank': W.bank = v; W.step = 2; W.type = null; W.coll = []; return true;
      case 'lnType': { W.type = v; W.coll = []; const T = EC.LOAN_TYPES[v]; W.term = 0; W.step = 3; W.grace = 0; W.freq = 'M'; W.amount = W.amount || 0; return true; }
      case 'lnAmount': W.amount = +v; return true;
      case 'lnAmountIn': { const x = val$('ln-wamt'); if (x > 0) W.amount = Math.round(x); return true; }
      case 'lnColl': { const [kind, ref] = v.split(':'), i = W.coll.findIndex(c => c.kind === kind && String(c.ref) === ref); if (i >= 0) W.coll.splice(i, 1); else { const it = collateralItems(co, W.type).find(c => c.kind === kind && String(c.ref) === ref); if (it) W.coll.push(kind === 'ASSET' ? { kind, ref: it.ref } : { kind, ref: it.ref, qty: Math.floor(it.avail) }); } return true; }
      case 'lnStep': { const n = +v; if (n === 4 && (!W.amount || (EC.LOAN_TYPES[W.type] && EC.LOAN_TYPES[W.type].lock === 'COLLATERAL' && !W.coll.length))) { st.msg = { ok: false, text: !W.amount ? 'حدّد المبلغ أولاً.' : 'اختر ضماناً أولاً.' }; return true; } W.step = n; st.msg = null; return true; }
      case 'lnTerm': W.term = +v; W.freq = W.term % 1 === 0 ? 'M' : 'M'; W.grace = 0; W.step = 5; return true;
      case 'lnFreq': W.freq = v; W.grace = 0; return true;
      case 'lnGrace': W.grace = +v; return true;
      case 'lnTake': { const r = co.takeBankLoan(W.bank, W.type, W.amount, W.term, Object.assign({ freq: W.freq, grace: W.grace }, { collateral: spec(W).collateral })); done(r, r.ok ? 'تم إنشاء القرض #' + r.loan.id + ': ' + money(W.amount) + ' بفائدة ' + pct(r.rate) + ' · القسط ' + money(r.payment) : ''); if (r.ok) { st.sec = 'active'; st.wiz = { step: 1, bank: null, type: null, amount: 0, term: 0, freq: 'M', grace: 0, coll: [] }; } return true; }
      case 'lnCalc': { const [k, x] = v.split('|'), c = st.calc; if (k === 'bank') { c.bank = x; const ts = EC.BANKS.banks[x].types.filter(t => !EC.LOAN_TYPES[t].lock || EC.LOAN_TYPES[t].lock === 'COLLATERAL'); if (!EC.BANKS.banks[x].types.includes(c.type)) c.type = ts[0]; } else if (k === 'type') { c.type = x; if (c.term > EC.LOAN_TYPES[x].maxMonths) c.term = EC.LOAN_TYPES[x].maxMonths; } else if (k === 'amount') c.amount = +x; else if (k === 'term') { c.term = +x; if (c.term % LE.FM[c.freq]) c.freq = 'M'; } else if (k === 'freq') c.freq = x; return true; }
      case 'lnToWiz': { const c = st.calc; Object.assign(W, { bank: c.bank, type: c.type, amount: c.amount, term: c.term, freq: c.freq, grace: c.grace, coll: [], step: 6 }); st.sec = 'new'; return true; }
    }
    return false;
  }
  const ACTS = ['lnSec', 'lnMore', 'lnView', 'lnPanel', 'lnAmt', 'lnAmtIn', 'lnRe', 'lnPay', 'lnResched', 'lnPlan', 'lnPick', 'lnBank', 'lnType', 'lnAmount', 'lnAmountIn', 'lnColl', 'lnStep', 'lnTerm', 'lnFreq', 'lnGrace', 'lnTake', 'lnCalc', 'lnToWiz'];
  return { html, act, ACTS, state: st, SECS, model, debtSummary, upcoming };
});
