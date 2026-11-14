/* Oli — NETWORK DIAGNOSTICS screen (فاحص الشبكة): the panel, the map overlay and the jump to a fault.
 * All data comes from OliNetDiag.run() (network-diag.js), which only READS the game.  The inspection runs when the player taps «فحص الشبكة» / «إعادة الفحص» - never per frame.
 * The map overlay is drawn from the stored report (cheap polylines and markers); it never touches the simulation.
 *   html(report, state)  pure: the panel as an HTML string (also used by the tests)        */
(function (root) {
  'use strict';
  const ND = typeof require === 'function' && typeof module !== 'undefined' ? require('./network-diag.js') : root.OliNetDiag;
  const NDC = typeof require === 'function' && typeof module !== 'undefined' ? require('./network-diag-central.js') : root.OliNetDiagCentral;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = n => String(n).padStart(2, '0'), SEV = ND.SEV;


  /* the oil report + the Central report -> one numbered list (confirmed by severity, then warnings, then indicators); each part keeps its own statistics */
  function merge(rep, crep) {
    const out = Object.assign({}, rep), grp = f => f.indicator ? 2 : f.confirmed ? 0 : 1, all = rep.faults.concat(crep ? crep.faults : []).map((f, i) => Object.assign({}, f, { _o: i }));
    all.sort((a, b) => grp(a) - grp(b) || SEV[a.severity].rank - SEV[b.severity].rank || (!!a.central - !!b.central) || a._o - b._o); const remap = new Map(); all.forEach((f, i) => { if (!f.central) remap.set(f.no, i + 1); f.no = i + 1; delete f._o; });
    if (rep.rca) { const m = n => remap.has(n) ? remap.get(n) : n; out.rca = Object.assign({}, rep.rca, { groups: rep.rca.groups.map(g => Object.assign({}, g, { rootNo: g.rootNo == null ? null : m(g.rootNo), symptoms: g.symptoms.map(m) })) }); for (const f of all) if (f.rca && f.rca.rootNo != null && !f.central) f.rca = Object.assign({}, f.rca, { rootNo: m(f.rca.rootNo) }); }
    out.faults = all; out.central = crep ? crep.stats : null; out.healthySegs = crep ? crep.healthySegs : []; out.notes = rep.notes.filter(n => !/Central/.test(n)).concat(crep ? crep.notes : []); return out;
  }
  const label = f => f.indicator ? 'مؤشر رقم ' : f.confirmed ? 'العطل رقم ' : 'تحذير رقم ', grpName = f => f.indicator ? 'مؤشرات (ليست أعطالاً: لا أثر مثبت على التدفق)' : f.confirmed ? 'الأعطال المؤكدة' : 'تحذيرات تحتاج مراجعة';

  const fmt = n => Math.round(n).toLocaleString('en-US');
  const rcaHtml = rep => { const R = rep.rca; if (!R || !R.groups.length) return ''; const T = R.totals;
    let h = '<div class="nd-rca"><b>السبب الجذري</b> · ' + T.roots + ' سبب جذري يفسّر ' + T.symptoms + ' عرضاً' + (T.lostBblDay > 0 ? ' · إنتاج مفقود نحو ' + fmt(T.lostBblDay) + ' برميل/يوم من ' + T.wells + ' بئر' + (T.lostUsdDay != null ? ' (≈ ' + fmt(T.lostUsdDay) + ' $/يوم بسعر السوق الحالي)' : '') : '') + '<div class="nd-sub">كل بئر يُحسب مرة واحدة فقط تحت سبب واحد. قراءة فقط: لا يُنفَّذ أي إصلاح.</div>';
    for (const g of R.groups.slice(0, 6)) h += '<button class="nd-rr" data-nd="go" data-n="' + (g.rootNo || '') + '"' + (g.rootNo ? '' : ' disabled') + '><b>' + esc(g.label) + '</b> — ' + esc(g.causeAr || g.code) + '<span class="nd-sub"> · يؤثر على ' + g.symptoms.length + ' عرض' + (g.wells.length ? ' · ' + g.wells.length + ' بئر · ' + fmt(g.lostBblDay) + ' برميل/يوم' : '') + (g.downstream.count ? ' · ' + g.downstream.count + ' منشأة بعده' + (g.downstream.truncated ? '+' : '') : '') + (g.maskedBy ? ' · يقع بعد سبب آخر' : '') + '</span></button>';
    if (R.groups.length > 6) h += '<div class="nd-sub">و ' + (R.groups.length - 6) + ' أسباب أخرى…</div>'; return h + '</div>'; };
  const rcaRows = (f, rep) => { const c = f.rca; if (!c || c.role === 'INDEPENDENT') return c ? '<tr><td>الدور</td><td>مستقل: لا يسبّب أعراضاً أخرى ولا هو عرض لغيره</td></tr>' : ''; const R = rep && rep.rca, g = R && R.groups.find(z => z.id === c.group); let h = '<tr><td>الدور</td><td>' + (c.role === 'ROOT' ? 'سبب جذري' : 'عرض لسبب ' + (c.rootNo ? 'العطل رقم ' + num(c.rootNo) : esc(c.reason || 'غير مسجَّل كعطل'))) + '</td></tr>';
    if (g && c.role === 'ROOT') { if (g.wells.length) h += '<tr><td>الإنتاج المفقود</td><td>' + fmt(g.lostBblDay) + ' برميل/يوم من ' + g.wells.length + ' بئر <span class="nd-sub">(' + (c.basis === 'engine' ? 'من نتائج المحاكاة' : 'السعة الاسمية: المحاكاة غير محدّثة') + ')</span></td></tr>';
      if (g.downstream.items.length) h += '<tr><td>المنشآت بعد العطل</td><td>' + g.downstream.items.map(i => esc(i.label)).join('، ') + (g.downstream.count > g.downstream.items.length ? ' و' + (g.downstream.count - g.downstream.items.length) + (g.downstream.truncated ? '+' : '') + ' أخرى' : '') + '</td></tr>'; }
    return h; };
  const usd = n => '$' + fmt(n), lvl = { high: '#ff6b61', warn: '#ffd60a', info: '#8e9aaf' };
  const remEnv = () => { const L = window.__lab; if (!L) return null; const co = L.company; return { store: L.store, net: L.pipes, ts: L.ts, sim: L.sim, DEFS: window.OliBuildings.DEFS, PIPES: window.OliBuildingConfig.PIPES, BD: window.OliBuildings, planPipe: L.I.planPipe, planClosePipe: L.I.planClosePipe, sizeNew: L.I.sizeNew, flowModel: L.I.flowModel, PipeNet: L.I.PipeNet, demolishPlan: (id, n) => L.store.demolishPlan(id, n), cash: L.store.cash, crudePrice: ((co && co.market && co.market.price) || {}).CRUDE }; };
  const costText = c => c.net === 0 && !c.pay && !c.refund ? 'مجاني' : (c.pay ? 'يُدفع ' + usd(c.pay) : '') + (c.refund ? (c.pay ? ' · ' : '') + 'يُسترد ' + usd(c.refund) : '') + (c.pay && c.refund ? ' · الصافي ' + (c.net >= 0 ? usd(c.net) : '+' + usd(-c.net)) : '') + (c.exact ? '' : ' (تقدير)');
  const remedyHtml = (f, rep) => { const RM = typeof window !== 'undefined' ? window.OliFaultRemedies : null, env = RM ? remEnv() : null; if (!RM || !env) return ''; let R; try { R = RM.forFault(f, env, rep); } catch (e) { return ''; }
    let h = '<div class="nd-rem"><b>الحلول المقترحة</b><div class="nd-sub">اقتراح ومعاينة فقط: لا يُنفَّذ شيء ولا يُخصم مال ولا تتغير اللعبة.</div>';
    if (R.refer) return h + '<div class="nd-sub">هذا عَرَض: الحل في العطل رقم ' + num(R.refer) + ' (السبب الجذري).</div></div>';
    if (!R.options.length) return h + R.notes.map(n => '<div class="nd-sub">' + esc(n) + '</div>').join('') + '</div>';
    for (const o of R.options) { const key = f.no + '|' + o.id, open = st.opt === key;
      h += '<div class="nd-op' + (o.recommended ? ' rec' : '') + '"><button data-nd="opt" data-k="' + esc(key) + '"><b>' + esc(o.titleAr) + '</b>' + (o.recommended ? ' <span class="nd-sv" style="background:#34c759">موصى به</span>' : '') + '<div class="nd-sub">' + costText(o.cost) + (o.effect.recoverBblDay > 0 ? ' · قد يعيد حتى ' + fmt(o.effect.recoverBblDay) + ' برميل/يوم' + (o.effect.recoverUsdDay != null ? ' (≈ ' + fmt(o.effect.recoverUsdDay) + ' $/يوم)' : '') : '') + (o.risks.some(r => r.level === 'high') ? ' · ⚠ مخاطرة عالية' : '') + '</div></button>';
      if (open) { h += '<div class="nd-pv"><div class="nd-sub">الكلفة: ' + esc(o.cost.basis) + '</div>'; if (o.preview.changes.length) h += '<b>معاينة قبل الإصلاح</b><table class="nd-d">' + o.preview.changes.map(c => '<tr><td>' + esc(c.what) + ' · ' + esc(c.field) + '</td><td>' + esc(c.before) + ' ← ' + esc(c.after) + '</td></tr>').join('') + '</table>';
        if (o.effect.basis) h += '<div class="nd-sub">' + esc(o.effect.basis) + '</div>'; if (o.risks.length) h += '<b>المخاطر</b>' + o.risks.map(r => '<div class="nd-rk" style="color:' + lvl[r.level] + '">• ' + esc(r.ar) + '</div>').join(''); h += (o.notes || []).map(n => '<div class="nd-sub">' + esc(n) + '</div>').join('') + (o.affordable ? '' : '<div class="nd-rk" style="color:#ffd60a">الرصيد الحالي لا يكفي.</div>') + (rpCan(o) ? rpBox(f, o, key) : '') + '</div>'; }
      h += '</div>'; }
    return h + '</div>'; };
  const rpEnv = () => { const e = remEnv(); if (!e) return null; const L = window.__lab, co = L.company; return Object.assign(e, { company: co, DEFS: window.OliBuildings.DEFS, scan: () => ND.run(L.store, L.pipes, { sim: L.sim, locate, crudePrice: e.crudePrice }), nowMs: () => Date.now() }); };
  const RP = () => (typeof window !== 'undefined' && window.OliFaultRepair) ? (st.rpr || (st.rpr = window.OliFaultRepair.create())) : null;
  const rpCan = o => !!window.OliFaultRepair && o.actions.length > 0 && o.actions.every(a => window.OliFaultRepair.SCOPE.indexOf(a.kind) >= 0);
  const whatIfHtml = w => { if (!w || !w.ok) return ''; const nf = n => Math.round(n || 0).toLocaleString('en-US'), row = z => '<tr><td>' + esc(z.label) + '</td><td>' + nf(z.before) + '</td><td>' + nf(z.after) + '</td></tr>'; let h = '<div class="nd-sub"><b>ماذا لو؟</b> (' + esc(w.label) + ')</div><table class="nd-t"><tr><td></td><td>قبل</td><td>بعد</td></tr>' + (w.lines || []).map(row).join('') + (w.receivers || []).map(row).join('') + '</table>'; if (w.bottleneck) h += '<div class="nd-sub">الاختناق التالي: ' + esc(w.bottleneck.label || w.bottleneck.kind) + '</div>'; return h; };
  const rpBox = (f, o, key) => { const r = st.rp; if (!r || r.key !== key) return '<button class="nd-go" data-nd="rpPlan" data-k="' + esc(key) + '">نفّذ هذا الإصلاح…</button>';
    if (r.err) return '<div class="nd-rk" style="color:#ff6b61">' + esc(r.err) + '</div><button data-nd="rpCancel">حسناً</button>';
    const t = RP().get(r.id), paused = window.__lab && window.__lab.company && window.__lab.company.speed === 0, need = t.needConfirms, step = t.confirms;
    let h = '<div class="nd-conf"><b>' + (need > 1 ? 'تأكيد نهائي مطلوب' : 'تأكيد التنفيذ') + '</b><div class="nd-sub">' + esc(t.titleAr) + ' · ' + (t.quote.pay ? 'التكلفة ' + usd(t.quote.pay) + ' (قيد واحد في الدفتر)' : t.quote.refund ? 'يُسترد ' + usd(t.quote.refund) + ' (يُسجَّل في الدفتر)' : 'بلا كلفة ولا استرداد') + '</div>' + whatIfHtml(t.whatIf) + ((t.actions || []).some(a => a.kind === 'UPGRADE_PIPE') ? '<div class="nd-sub">يُعاد تقييم الاختناق بعد استئناف اللعبة.</div>' : '') + '<div class="nd-sub">قبل التنفيذ يُعاد فحص العطل والشروط والسعر. إن فشل أي شيء يُتراجع عن كل شيء ولا يُخصم مال.</div>';
    if (!paused) h += '<div class="nd-rk" style="color:#ffd60a">أوقف اللعبة مؤقتاً أولاً: الإصلاح لا يُنفَّذ أثناء التشغيل.</div>';
    h += '<button class="nd-go" data-nd="rpConfirm"' + (paused ? '' : ' disabled') + '>' + (need > 1 ? (step === 0 ? ((t.actions || []).some(a => a.kind === 'DELETE_PIPE') ? 'احذف… (التأكيد 1 من 2)' : 'تأكيد أولي (1 من 2)') : ((t.actions || []).some(a => a.kind === 'DELETE_PIPE') ? '⚠ تأكيد الحذف النهائي (2 من 2)' : '⚠ تأكيد التنفيذ النهائي (2 من 2)')) : 'نفّذ الآن') + '</button> <button data-nd="rpCancel">إلغاء</button></div>'; return h; };
  const HEAD = '<div class="nd-h"><span>فاحص الشبكة</span><span class="nd-hb"><button class="nd-m" data-nd="min" title="تصغير مع إبقاء العلامات">—</button><button class="nd-x" data-nd="close" title="إخفاء">✕</button></span></div>';
  const TR_ROW = (k, v) => '<tr><td>' + k + '</td><td>' + v + '</td></tr>';
  function traceHtml(f) {
    const T = f.trace; if (!T) return ''; const known = T.firstBad != null, nf = n => Math.round(n || 0).toLocaleString('en-US');
    let h = '<div class="nd-tr"><b>تتبّع مسار ' + esc(T.well.label) + '</b><table class="nd-d">'
      + TR_ROW('البئر', esc(T.well.label) + ' · ' + esc(f.zone)) + TR_ROW('حالة البئر', esc(T.well.state)) + TR_ROW('الإنتاج المتأثر', 'ينتج ' + nf(T.well.out) + ' من ' + nf(T.well.target) + ' برميل/يوم — يُفقد ' + nf(T.lost) + (T.sharedWith && T.sharedWith.length ? ' (ومع ' + T.sharedWith.length + ' بئر بنفس السبب: ' + nf(T.groupLost) + ' برميل/يوم)' : ''))
      + TR_ROW('آخر عنصر سليم', esc(f.prev || '—')) + TR_ROW('أول نقطة فشل', known ? esc(T.culprit) + ' · المعرّف ' + esc(T.responsible.id) : 'السبب غير محدد') + TR_ROW('السبب', esc(T.causeAr)) + '</table>';
    if (T.causes && T.causes.length) { h += '<div class="nd-cs">'; T.causes.forEach((c, i) => { h += '<div class="nd-c' + (c.first ? ' first' : '') + '"><b>السبب ' + (i + 1) + (c.first ? ' (أول انقطاع)' : '') + '</b> · ' + esc(c.element || '') + '<div>' + esc(c.ar) + '</div><div class="nd-fx">الإصلاح: ' + esc(c.fix) + '</div></div>'; }); h += '</div>'; }
    else if (!known) h += '<div class="nd-c"><b>السبب غير محدد</b><div>لم أجد على المسار أي عنصر مسجَّل كقيد، فلا أخمّن سبباً.</div></div>';
    if (T.after && T.after.length) h += '<div class="nd-af">بعد نقطة الانقطاع: ' + T.after.filter(z => z.type !== 'pipe').map(z => esc(z.label)).slice(0, 5).join('، ') + '</div>';
    return h + '</div>';
  }
  function html(rep, st) {
    st = st || {}; if (!rep) return HEAD + '<div class="nd-scroll"><p class="nd-p">يفحص هذا النظام الشبكة كاملة (كل الأنابيب والمنشآت وليس الجزء الظاهر على الشاشة) ويحدّد مكان كل عطل وسببه. هو للتشخيص فقط: لا يصلح شيئاً ولا يغيّر التدفق.</p><button class="nd-go" data-nd="scan">فحص الشبكة الآن</button></div>';
    const S = rep.stats, bad = st.stale ? '<div class="nd-stale">تغيّرت الشبكة منذ آخر فحص — أعد الفحص لتحديث النتائج.</div>' : '';
    const grade = S.health >= 95 ? '#34c759' : S.health >= 75 ? '#ffd60a' : S.health >= 50 ? '#ff9500' : '#ff3b30';
    let h = HEAD + '<div class="nd-scroll">' + bad
      + '<div class="nd-sum"><div class="nd-big" style="color:' + grade + '">' + S.health + '%<small>سلامة الشبكة</small></div><table class="nd-t">'
      + '<tr><td>العناصر المفحوصة</td><td>' + S.checked + '</td></tr><tr><td>الاتصالات السليمة</td><td>' + S.healthyConnections + ' من ' + S.connections + '</td></tr>'
      + '<tr><td>الأعطال المؤكدة</td><td style="color:#ff6b61">' + S.faults + '</td></tr><tr><td>التحذيرات</td><td style="color:#ffd60a">' + S.warnings + '</td></tr><tr><td>المؤشرات (ليست أعطالاً)</td><td style="color:#8e9aaf">' + (S.indicators || 0) + '</td></tr></table></div>';
    const Cs = rep.central; if (Cs && Cs.present) h += '<div class="nd-cen"><b>شبكة Central</b> · سلامة ' + Cs.health + '%<table class="nd-t"><tr><td>العناصر المفحوصة</td><td>' + Cs.checked + ' (' + Cs.stations + ' محطة · ' + Cs.segments + ' قطاع · ' + Cs.pumps + ' مضخة · ' + Cs.channels + ' قنوات)</td></tr><tr><td>الأعطال المؤكدة</td><td style="color:#ff6b61">' + Cs.faults + '</td></tr><tr><td>التحذيرات</td><td style="color:#ffd60a">' + Cs.warnings + '</td></tr><tr><td>المؤشرات</td><td style="color:#8e9aaf">' + Cs.indicators + '</td></tr></table></div>';
    if (st.flash) h += '<div class="nd-flash' + (st.flash.ok ? ' ok' : '') + '">' + esc(st.flash.msg) + '</div>';
    h += rcaHtml(rep);
    for (const n of rep.notes) h += '<div class="nd-note">' + esc(n) + '</div>';
    h += '<div class="nd-row"><button class="nd-go" data-nd="scan">إعادة الفحص</button><button data-nd="ok" class="' + (st.showOk === false ? '' : 'on') + '">إظهار السليم (أخضر)</button></div>';
    if (!rep.faults.length) return h + '<p class="nd-p" style="color:#34c759">لم يُعثر على أي عطل أو تحذير في ' + S.checked + ' عنصراً. كل الاتصالات سليمة.</p></div>';
    const flt = st.filter || 'all', list = rep.faults.filter(f => flt === 'all' || (flt === 'central' ? f.central : !f.central));
    if (Cs && Cs.present) h += '<div class="nd-row">' + [['all', 'الكل'], ['oil', 'النفط'], ['central', 'Central']].map(([k, t]) => '<button data-nd="flt" data-k="' + k + '" class="' + (flt === k ? 'on' : '') + '">' + t + '</button>').join('') + '</div>';
    h += '<div class="nd-list">'; const shown = list.slice(0, st.limit || 200); let lastG = null;
    for (const f of shown) { const sv = SEV[f.severity], open = st.sel === f.no, col = f.indicator ? '#8e9aaf' : f.confirmed ? sv.color : '#ffd60a'; const gn = grpName(f); if (gn !== lastG) { lastG = gn; h += '<div class="nd-g">' + gn + '</div>'; }
      h += '<div class="nd-f' + (open ? ' sel' : '') + '" style="border-color:' + col + '"><button class="nd-fh" data-nd="go" data-n="' + f.no + '"><b>' + label(f) + num(f.no) + '</b> <span class="nd-sv" style="background:' + col + '">' + sv.ar + '</span><div class="nd-s">' + esc(f.kindAr) + ' · ' + esc(f.element.label) + ' · ' + esc(f.zone) + '</div></button>';
      if (open) h += '<table class="nd-d"><tr><td>النوع</td><td>' + esc(f.kindAr) + (f.indicator ? ' (مؤشر)' : f.confirmed ? ' (مؤكد)' : ' (تحذير يحتاج مراجعة)') + '</td></tr><tr><td>الخطورة</td><td>' + sv.ar + '</td></tr><tr><td>العنصر</td><td>' + esc(f.element.label) + ' · المعرّف ' + esc(f.element.id) + '</td></tr>'
        + '<tr><td>المنطقة</td><td>' + esc(f.zone) + '</td></tr><tr><td>الإحداثيات</td><td dir="ltr">' + (f.global ? '— (عطل على القناة كلها، لا موضع واحد له)' : '(' + f.x + ', ' + f.y + ')') + '</td></tr><tr><td>السابق في التدفق</td><td>' + esc(f.prev || '—') + '</td></tr><tr><td>اللاحق في التدفق</td><td>' + esc(f.next || '—') + '</td></tr>'
        + rcaRows(f, rep)
        + (f.issue ? '<tr><td>أول رصد</td><td>' + (f.issue.ageHours < 1 ? 'في هذا الفحص' : 'منذ ' + (f.issue.ageHours >= 24 ? Math.floor(f.issue.ageHours / 24) + ' يوم لعبة' : Math.floor(f.issue.ageHours) + ' ساعة لعبة')) + ' · ظهر في ' + f.issue.scans + ' فحص' + (f.issue.reopened ? ' · عاد ' + f.issue.reopened + ' مرة' : '') + ' <span class="nd-sub">(منذ أن رآه الفاحص في هذه الجلسة)</span></td></tr>' : '') + (f.merged ? '<tr><td>أطراف مدموجة</td><td>' + f.merged + ' (عطل واحد للأنبوب)</td></tr>' : '')
        + '<tr><td>السبب</td><td>' + esc(f.cause) + '</td></tr><tr><td>التأثير</td><td>' + esc(f.effect) + '</td></tr><tr><td>الإصلاح المقترح</td><td>' + esc(f.fix) + '</td></tr></table>' + remedyHtml(f, rep) + traceHtml(f);
      h += '</div>'; }
    if (list.length > shown.length) h += '<button data-nd="more" class="nd-go">عرض المزيد (' + (list.length - shown.length) + ' متبقية)</button>';
    return h + '</div></div>';
  }

  const api = { html, merge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OliNetDiagUI = api;
  if (typeof window === 'undefined' || !window.__wp || !window.__lab) return;

  /* ------------------------------------------------------------------ browser wiring */
  const WP = window.__wp, LAB = window.__lab, hooks = WP.hooks, ctx = WP.ctx, cam = WP.cam, sx = WP.sx, sy = WP.sy, $ = id => document.getElementById(id);
  const DEFS = (window.OliBuildings || {}).DEFS, st = { rep: null, sel: null, showOk: true, limit: 200, rev: -1, n: -1, stale: false }, ov = { lines: [], marks: [] };
  const css = document.createElement('style'); css.textContent = '#ndBtn{border-color:#4b5a6b}'
    + '#ndPanel{display:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:75vw;height:65vh;max-width:560px;min-width:min(290px,96vw);max-height:calc(100vh - 24px);box-sizing:border-box;flex-direction:column;overflow:hidden;background:rgba(12,17,25,.74);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);border:1px solid rgba(120,138,160,.55);border-radius:12px;padding:6px 8px;z-index:12;direction:rtl;color:#e8eef5;font-size:13px;line-height:1.35}'
    + '#ndPanel.open{display:flex}#ndPanel *{box-sizing:border-box}'
    + '#ndPanel .nd-h{flex:0 0 auto;font-weight:700;font-size:14px;margin:0 0 4px;display:flex;justify-content:space-between;align-items:center;gap:6px}#ndPanel .nd-hb{display:flex;gap:5px}'
    + '#ndPanel .nd-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding-left:2px}'
    + '#ndPanel button{font:inherit;color:inherit;background:rgba(34,43,55,.9);border:1px solid #3b4756;border-radius:8px;padding:4px 9px;min-height:34px}#ndPanel button.on{background:rgba(44,58,75,.95);border-color:#34c759}'
    + '#ndPanel .nd-x,#ndPanel .nd-m{min-height:32px;min-width:34px;padding:2px 8px;font-size:15px}#ndPanel .nd-go{width:100%;margin:4px 0;background:rgba(42,90,138,.95);border-color:#4b8fd0}#ndPanel .nd-p{margin:6px 4px;line-height:1.55}'
    + '#ndPanel .nd-sum{display:flex;gap:8px;align-items:center}#ndPanel .nd-big{font-size:24px;font-weight:800;text-align:center;min-width:78px}#ndPanel .nd-big small{display:block;font-size:11px;font-weight:400;color:#9aa8b8}'
    + '#ndPanel .nd-t{flex:1;border-collapse:collapse;font-size:12px}#ndPanel .nd-t td{padding:1px 4px;border-bottom:1px solid rgba(70,86,106,.6)}#ndPanel .nd-row{display:flex;gap:5px;margin:3px 0}#ndPanel .nd-row button{flex:1;padding:3px 6px;min-height:32px;font-size:12px}'
    + '#ndPanel .nd-tr{margin:4px 0 2px;font-size:12px}#ndPanel .nd-c{margin:4px 0;padding:4px 6px;border-right:3px solid #ffd60a;background:rgba(255,255,255,.05);border-radius:6px}#ndPanel .nd-c.first{border-color:#ff453a}#ndPanel .nd-fx{color:#9fd3a8}#ndPanel .nd-af{margin-top:4px;color:#ff9f0a}#ndPanel .nd-note,#ndPanel .nd-stale{font-size:11px;color:#ffd27a;margin:3px 2px}#ndPanel .nd-f{border-right:4px solid;border-radius:8px;background:rgba(26,35,47,.82);margin:4px 0;overflow:hidden}'
    + '#ndPanel .nd-fh{width:100%;text-align:right;background:transparent;border:0;padding:5px 8px;min-height:0}#ndPanel .nd-sv{display:inline-block;color:#111;border-radius:6px;padding:0 6px;font-size:11px;font-weight:700;margin-right:6px}#ndPanel .nd-s{font-size:11px;color:#a9b6c5;margin-top:2px}'
    + '#ndPanel .nd-sub{opacity:.6;font-size:10px}#ndPanel .nd-rca{margin:8px 0;padding:8px;border:1px solid #3a4560;border-radius:8px;font-size:11px;line-height:1.6}#ndPanel .nd-rem{margin:8px 0;font-size:11px}#ndPanel .nd-op{margin-top:6px;border:1px solid #3a4560;border-radius:8px;padding:4px 6px}#ndPanel .nd-op.rec{border-color:#34c759}#ndPanel .nd-op>button{display:block;width:100%;text-align:right;background:none;border:0;color:inherit;padding:4px 0}#ndPanel .nd-pv{padding:4px 0;line-height:1.6}#ndPanel .nd-conf{margin-top:6px;padding:6px;border:1px dashed #ffd60a;border-radius:6px}#ndPanel .nd-flash{margin:6px 0;padding:6px;border-radius:6px;background:#3a1f1f;font-size:11px}#ndPanel .nd-flash.ok{background:#1f3a26}#ndPanel .nd-conf button,#ndPanel .nd-pv .nd-go{margin-top:4px;padding:6px 10px;border-radius:6px;border:0;background:#2c3550;color:inherit;font-size:11px}#ndPanel .nd-conf button:disabled{opacity:.4}#ndPanel .nd-rr{display:block;width:100%;text-align:right;background:#1b2234;border:0;border-radius:6px;margin-top:4px;padding:6px;color:inherit;font-size:11px}#ndPanel .nd-d{width:100%;border-collapse:collapse;font-size:12px}#ndPanel .nd-d td{padding:3px 8px;border-top:1px solid rgba(70,86,106,.6);vertical-align:top}#ndPanel .nd-d td:first-child{color:#9aa8b8;white-space:nowrap;width:1%}'
    + '#ndPanel .nd-g{font-size:12px;font-weight:700;color:#9aa8b8;margin:6px 4px 1px}#ndPanel .nd-cen{margin:5px 0;padding:4px 6px;border:1px solid rgba(80,96,116,.7);border-radius:8px;background:rgba(24,32,43,.7);font-size:12px}'
    + '#ndChip{display:none;position:fixed;right:8px;top:50px;z-index:12;width:min(64vw,250px);box-sizing:border-box;direction:rtl;text-align:right;color:#e8eef5;background:rgba(12,17,25,.86);border:1px solid #4b8fd0;border-radius:14px;padding:6px 10px;font:600 12px/1.35 system-ui}'
    + 'body.dev #ndChip{top:100px}#ndChip.on{display:block}#ndChip .nd-ct{display:flex;justify-content:space-between;gap:6px;align-items:center;font-size:13px}#ndChip .nd-cx{font-weight:400;color:#c4d0dd;margin-top:3px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}#ndChip .nd-co{font-size:11px;color:#8fc1f2;margin-top:3px}';
  document.head.appendChild(css);
  const bar = $('bar'), btn = document.createElement('button'); btn.id = 'ndBtn'; btn.textContent = 'فاحص الشبكة'; bar.insertBefore(btn, bar.firstChild);
  const panel = document.createElement('div'); panel.id = 'ndPanel'; document.body.appendChild(panel);
  const chip = document.createElement('div'); chip.id = 'ndChip'; document.body.appendChild(chip);
  /* window state: 'full' (the window), 'min' (a small card; the markers stay on the map), 'hidden' (nothing; the report is kept, so showing it again never re-scans) */
  let mode = 'hidden'; Object.defineProperty(st, 'mode', { get: () => mode, set: v => { mode = v; }, enumerable: true });
  Object.defineProperty(st, 'open', { get: () => mode === 'full', set: v => { mode = v ? 'full' : (st.rep ? 'min' : 'hidden'); }, enumerable: true });
  const locate = (x, y) => { try { const w = WP.world, id = w.regionIdAt(x, y); return id == null ? null : w.regionLabel(id); } catch (e) { return null; } };
  const cenSig = () => { const C = LAB.pipes.central; if (!C) return ''; let f = 0; for (const p of C.pumps.values()) if (p.fault) f++; return C.rev + '|' + f + '|' + Object.keys(C.ch).map(k => C.ch[k].state + (C.ch[k].fault ? 'F' : '')).join(',') + '|' + [...C.seg.values()].reduce((a, g) => a + Object.keys(g.fault).length, 0); };
  const stale = () => !!st.rep && (LAB.pipes.rev !== st.rev || LAB.store.items.size !== st.n || cenSig() !== st.csig);
  const chipHtml = () => { const r = st.rep; if (!r) return ''; const nF = r.faults.filter(f => f.confirmed).length, nW = r.faults.filter(f => !f.confirmed && !f.indicator).length, f = st.sel != null ? r.faults.find(z => z.no === st.sel) : null;
    return f ? '<div class="nd-ct"><span>' + (f.indicator ? 'مؤشر ' : f.confirmed ? 'عطل ' : 'تحذير ') + num(f.no) + ' · ' + esc(f.element.label) + '</span><span>⤢</span></div><div class="nd-cx">' + esc(f.cause) + '</div><div class="nd-co">اضغط لفتح التفاصيل</div>'
      : '<div class="nd-ct"><span>🔍 فاحص الشبكة</span><span>⤢</span></div><div class="nd-cx">' + nF + ' عطل · ' + nW + ' تحذير · سلامة ' + r.stats.health + '%</div>'; };
  const render = () => { st.stale = stale(); panel.classList.toggle('open', mode === 'full'); if (mode === 'full') { const sc = panel.querySelector('.nd-scroll'), top = sc ? sc.scrollTop : 0; panel.innerHTML = html(st.rep, st); const n = panel.querySelector('.nd-scroll'); if (n) n.scrollTop = top; } chip.classList.toggle('on', mode === 'min' && !!st.rep); if (mode === 'min') chip.innerHTML = chipHtml(); WP.markDirty(); };
  function scan() {
    const t0 = performance.now(), hist = st.hist || (st.hist = { __scans: 0 }), opt = { sim: LAB.sim, locate, crudePrice: ((window.__lab && window.__lab.company && window.__lab.company.market && window.__lab.company.market.price) || {}).CRUDE, history: hist, cenManual: window.__cnManual || {} };
    const orep = ND.run(LAB.store, LAB.pipes, opt), crep = NDC ? NDC.runCentral(LAB.store, LAB.pipes, opt) : null; st.rep = merge(orep, crep); st.rev = LAB.pipes.rev; st.n = LAB.store.items.size; st.csig = cenSig(); st.sel = null; st.ms = performance.now() - t0;
    { const FR = window.OliFaultRegistry, co = window.__lab && window.__lab.company; if (FR) FR.update(st.reg || (st.reg = FR.create()), st.rep, co ? co.hours : 0); }      // in-memory issue registry: nothing is saved, nothing in the game is touched
    hist.__scans++; for (const f of st.rep.faults) if (f.code === 'OFFER_EXCEEDS') { const k = f.code + '|' + f.element.id, r = hist[k] || (hist[k] = { hit: 0 }); r.hit++; }
    const rep = st.rep, L = LAB.pipes.lines, CS = LAB.pipes.central; ov.lines = []; ov.marks = []; const bbOf = pts => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const p of pts) { if (p[0] < a) a = p[0]; if (p[0] > c) c = p[0]; if (p[1] < b) b = p[1]; if (p[1] > d) d = p[1]; } return [a, b, c, d]; };
    const sevOf = new Map(); for (const f of rep.faults) if (f.element.type === 'PIPE' || f.element.type === 'CSEG') { const key = f.element.type + f.element.id, cur = sevOf.get(key); const rk = f.indicator ? 9 : (f.confirmed ? 0 : 5) + SEV[f.severity].rank; if (!cur || rk < cur.rk) sevOf.set(key, { f, rk }); }
    const colOf = f => f.indicator ? '#8e9aaf' : f.confirmed ? SEV[f.severity].color : '#ffd60a';
    for (const id of rep.healthyLines) { const l = L.get(id); if (l && l.path.length) { const pts = l.path.map(p => [p[0] + .5, p[1] + .5]); ov.lines.push({ pts, bb: bbOf(pts), c: ND.OK_COLOR, w: 2, ok: true }); } }
    if (CS) for (const id of rep.healthySegs || []) { const g = CS.seg.get(id); if (g && g.path.length) { const pts = g.path.map(p => [p[0] + .5, p[1] + .5]); ov.lines.push({ pts, bb: bbOf(pts), c: ND.OK_COLOR, w: 3, ok: true, central: true }); } }
    for (const [key, { f }] of sevOf) { const l = f.element.type === 'PIPE' ? L.get(f.element.id) : CS && CS.seg.get(f.element.id); if (l && l.path.length) { const pts = l.path.map(p => [p[0] + .5, p[1] + .5]); ov.lines.push({ pts, bb: bbOf(pts), c: colOf(f), w: 3.5, no: f.no, central: f.central }); } }
    for (const f of rep.faults) if (f.x != null && f.y != null) ov.marks.push({ x: f.x + .5, y: f.y + .5, c: colOf(f), no: f.no, f });
    LAB.toast && LAB.toast('اكتمل الفحص: ' + rep.faults.filter(f => f.confirmed).length + ' عطل · ' + rep.faults.filter(f => !f.confirmed && !f.indicator).length + ' تحذير · ' + rep.faults.filter(f => f.indicator).length + ' مؤشر'); render();
  }
  function select(no) {
    const f = st.rep && st.rep.faults.find(z => z.no === no); if (!f) return; st.sel = no; if (f.x != null && f.y != null) { WP.goto(f.x + .5, f.y + .5, Math.max(cam.z, 0.9)); if (mode === 'full') mode = 'min'; } render();      // a whole-channel finding has no place on the map: the window stays open
  }
  btn.addEventListener('click', () => { if (mode === 'full') mode = 'hidden'; else { mode = 'full'; if (!st.rep) { scan(); return; } } render(); });
  chip.addEventListener('click', () => { mode = 'full'; render(); const f = panel.querySelector('.nd-f.sel'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' }); });
  panel.addEventListener('click', e => { const el = e.target.closest('[data-nd]'); if (!el) return; const a = el.dataset.nd;
    if (a === 'scan') scan(); else if (a === 'close') { mode = 'hidden'; render(); } else if (a === 'min') { mode = 'min'; render(); } else if (a === 'rpPlan') { const key = el.dataset.k, [no, oid] = key.split('|'), f = st.rep.faults.find(z => z.no === +no), e = rpEnv(), R = RP(); if (!f || !e || !R) return; const p = R.plan(f, oid, e, st.rep); st.rp = p.ok ? { key, id: p.ticket.id } : { key, err: p.ar }; render(); }
    else if (a === 'rpCancel') { if (st.rp && st.rp.id) RP().cancel(st.rp.id); st.rp = null; render(); }
    else if (a === 'rpConfirm') { const r = st.rp, e = rpEnv(), R = RP(); if (!r || !r.id || !e) return; const c = R.confirm(r.id, e); if (!c.ok) { st.rp = { key: r.key, err: c.ar || 'انتهت صلاحية التذكرة: أعد التخطيط.' }; render(); return; } if (!c.ready) { render(); return; }
      const x = R.execute(r.id, e); st.flash = { ok: !!x.ok, msg: x.ok ? 'نُفِّذ الإصلاح: ' + R.get(r.id).titleAr + (x.verify && x.verify.fixed ? ' · تأكد الفحص الجديد أن العطل انتهى. التدفق يتحدّث عند استئناف اللعبة.' : ' · لم يختفِ العطل من الفحص الجديد: راجعه.') : (x.ar || 'لم يُنفَّذ الإصلاح.') }; st.rp = null; st.opt = null; scan(); st.sel = null; render(); }
    else if (a === 'opt') { st.opt = st.opt === el.dataset.k ? null : el.dataset.k; render(); } else if (a === 'ok') { st.showOk = !st.showOk; render(); } else if (a === 'flt') { st.filter = el.dataset.k; render(); } else if (a === 'more') { st.limit += 200; render(); } else if (a === 'go') { const n = +el.dataset.n; if (st.sel === n) { st.sel = null; render(); } else select(n); } });

  const prevAfter = hooks.afterOverlays;
  hooks.afterOverlays = (lv, vb) => {
    if (prevAfter) prevAfter(lv, vb);
    if (mode === 'hidden' || !st.rep) return; const near = (x, y) => x > vb.x0 - 40 && x < vb.x1 + 40 && y > vb.y0 - 40 && y < vb.y1 + 40;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const it of ov.lines) { if (it.ok && st.showOk === false) continue; const bb = it.bb; if (bb && (bb[2] < vb.x0 - 40 || bb[0] > vb.x1 + 40 || bb[3] < vb.y0 - 40 || bb[1] > vb.y1 + 40)) continue;
      ctx.beginPath(); it.pts.forEach((p, i) => i ? ctx.lineTo(sx(p[0], p[1]), sy(p[0], p[1])) : ctx.moveTo(sx(p[0], p[1]), sy(p[0], p[1]))); ctx.globalAlpha = it.ok ? .75 : 1; ctx.strokeStyle = it.c; ctx.lineWidth = Math.max(1.5, it.w * Math.min(1.6, Math.max(.7, cam.z))); ctx.stroke(); ctx.globalAlpha = 1; }
    const sel = st.sel; for (const m of ov.marks) { if (!near(m.x, m.y)) continue; const X = sx(m.x, m.y), Y = sy(m.x, m.y), r = (m.no === sel ? 11 : 7) * Math.min(1.4, Math.max(.8, cam.z * 1.1));
      if (m.no === sel) { const f = m.f; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.arc(X, Y, r + 9, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        if (f.element.type === 'BUILDING' && DEFS) { const b = LAB.store.get(f.element.id), d = b && DEFS[b.d]; if (d) { const w = (b.r & 1) ? d.footprint[1] : d.footprint[0], h = (b.r & 1) ? d.footprint[0] : d.footprint[1]; ctx.beginPath(); ctx.moveTo(sx(b.x, b.y), sy(b.x, b.y)); ctx.lineTo(sx(b.x + w, b.y), sy(b.x + w, b.y)); ctx.lineTo(sx(b.x + w, b.y + h), sy(b.x + w, b.y + h)); ctx.lineTo(sx(b.x, b.y + h), sy(b.x, b.y + h)); ctx.closePath(); ctx.strokeStyle = m.c; ctx.lineWidth = 3; ctx.stroke(); } }
        if (f.element.type === 'CSEG' && LAB.pipes.central) { const g = LAB.pipes.central.seg.get(f.element.id); if (g && g.path.length) { ctx.beginPath(); g.path.forEach((p, i) => i ? ctx.lineTo(sx(p[0] + .5, p[1] + .5), sy(p[0] + .5, p[1] + .5)) : ctx.moveTo(sx(p[0] + .5, p[1] + .5), sy(p[0] + .5, p[1] + .5))); ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.globalAlpha = .55; ctx.stroke(); ctx.globalAlpha = 1; } }
        if (f.element.type === 'CSTATION' && LAB.pipes.central) { const s0 = LAB.pipes.central.st.get(f.element.id), b = s0 && s0.b != null ? LAB.store.get(s0.b) : null, d = b && DEFS && DEFS[b.d]; if (d) { const w = (b.r & 1) ? d.footprint[1] : d.footprint[0], h = (b.r & 1) ? d.footprint[0] : d.footprint[1]; ctx.beginPath(); ctx.moveTo(sx(b.x, b.y), sy(b.x, b.y)); ctx.lineTo(sx(b.x + w, b.y), sy(b.x + w, b.y)); ctx.lineTo(sx(b.x + w, b.y + h), sy(b.x + w, b.y + h)); ctx.lineTo(sx(b.x, b.y + h), sy(b.x, b.y + h)); ctx.closePath(); ctx.strokeStyle = m.c; ctx.lineWidth = 3; ctx.stroke(); } } }
      ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fillStyle = m.c; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#111'; ctx.stroke(); if (cam.z >= .5 || m.no === sel) { ctx.fillStyle = '#111'; ctx.font = '700 ' + Math.round(r * 1.1) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(m.no), X, Y + r * .38); } }
    { const sf = st.sel != null && st.rep.faults.find(z => z.no === st.sel), T = sf && sf.trace; if (T) {      /* the traced oil path of the selected blocked well: healthy part green, break point red, what comes after orange */
      const col = i => T.firstBad == null ? '#ffd60a' : i < T.firstBad ? '#34c759' : i === T.firstBad ? '#ff3b30' : '#ff9500', z = Math.min(1.6, Math.max(.7, cam.z));
      T.steps.forEach((s, i) => { const c = col(i); ctx.strokeStyle = c; ctx.fillStyle = c; ctx.setLineDash(i > (T.firstBad == null ? 1e9 : T.firstBad) || T.firstBad == null ? [7, 5] : []);
        if (s.path && s.path.length) { ctx.beginPath(); s.path.forEach((p, k) => k ? ctx.lineTo(sx(p[0] + .5, p[1] + .5), sy(p[0] + .5, p[1] + .5)) : ctx.moveTo(sx(p[0] + .5, p[1] + .5), sy(p[0] + .5, p[1] + .5))); ctx.lineWidth = (i === T.firstBad ? 7 : 5) * z; ctx.globalAlpha = .85; ctx.stroke(); ctx.globalAlpha = 1; }
        else { const X = sx(s.x + .5, s.y + .5), Y = sy(s.x + .5, s.y + .5); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(X, Y, (i === T.firstBad ? 9 : 6) * z, 0, 7); ctx.globalAlpha = .9; ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = '#111'; ctx.stroke(); } });
      ctx.setLineDash([]); if (T.firstBad != null) { const s = T.steps[T.firstBad], X = sx(s.x + .5, s.y + .5), Y = sy(s.x + .5, s.y + .5), r = 12 * z; ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.moveTo(X - r * .6, Y - r * .6); ctx.lineTo(X + r * .6, Y + r * .6); ctx.moveTo(X + r * .6, Y - r * .6); ctx.lineTo(X - r * .6, Y + r * .6); ctx.stroke(); } } }
    ctx.restore();
  };
  const prevTap = hooks.tap;
  hooks.tap = (px, py) => { if (mode !== 'hidden' && st.rep) { const t = WP.toTile(px, py); let best = null, bd = 2.2; for (const m of ov.marks) { const d = Math.hypot(m.x - t.x, m.y - t.y); if (d < bd) { bd = d; best = m; } } if (best) { select(best.no); return true; } }
    return prevTap ? prevTap(px, py) : false; };
  /* the player's way in: the «فاحص الشبكة» button of the Company tab (the dev toolbar #bar is hidden in the normal game) closes the sheet, opens the panel and scans */
  const openFromMenu = () => { const x = $('es-close'); if (x) x.click(); mode = 'full'; if (st.rep) render(); else scan(); };
  document.addEventListener('click', e => { const el = e.target.closest && e.target.closest('[data-nd-open]'); if (el) { e.stopPropagation(); openFromMenu(); } }, true);
  window.__netdiag = { st, ov, scan, select, render, panel, openFromMenu };
})(typeof window !== 'undefined' ? window : globalThis);
