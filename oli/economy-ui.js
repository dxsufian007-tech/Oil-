/* Oli - economy-ui.js  (Phase 3 screens: HUD, Company, Market, Sell, Inventory, Production, Contracts, Loans, Alerts, "While you were away", building ECONOMICS tab)
 * Cards, charts and big numbers; no spreadsheets.  Mobile first: one column, 44 px touch targets, the sheet scrolls vertically and never moves the map camera.
 * Every number comes from OliEconomy / OliEconomyConfig - nothing is hard-coded here.
 */
(function () {
  'use strict';
  const E = OliEconomy, EC = OliEconomyConfig, M = E.fmtMoney, SELL = EC.PRODUCTS, $ = id => document.getElementById(id), n0 = v => Math.round(v).toLocaleString('en-US'), sg = v => (v >= 0 ? '+' : '') + M(v), pc = (v, d) => (v >= 0 ? '+' : '') + (v * 100).toFixed(d == null ? 1 : d) + '%';
  const CSS = `
#eco-hud{position:absolute;left:6px;right:6px;top:54px;height:40px;display:flex;gap:4px;align-items:stretch;z-index:7;pointer-events:none}
#eco-hud>*{pointer-events:auto;background:rgba(27,34,44,.94);border:1px solid #33404f;border-radius:10px}
#eco-hud .cell{flex:1 1 0;min-width:0;padding:3px 7px;display:flex;flex-direction:column;justify-content:center;line-height:1.15;overflow:hidden}
#eco-hud .cell small{font-size:10px;color:var(--mut);letter-spacing:.06em;white-space:nowrap}#eco-hud .cell b{font-size:12.5px;direction:ltr;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#eco-hud button{flex:0 0 auto;min-width:34px;min-height:40px;padding:0 4px;font-weight:700;position:relative}#eco-hud .pos{color:#8dffb0}#eco-hud .neg{color:#ff9a8a}
#eco-time{position:absolute;left:6px;right:6px;top:98px;height:36px;display:flex;gap:4px;align-items:stretch;z-index:7;pointer-events:none;direction:ltr}#eco-time #tm-slow{order:1}#eco-time #eh-pause{order:2}#eco-time #tm-fast{order:3}#eco-time #eh-speed{order:4}#eco-time #eh-clock{order:5;direction:rtl;text-align:right}#eco-time>*{pointer-events:auto;background:rgba(27,34,44,.94);border:1px solid #33404f;border-radius:10px;color:inherit}#eco-time #eh-clock{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;padding:2px 10px;line-height:1.15}#eco-time #eh-clock small{font-size:10px;color:var(--mut)}#eco-time #eh-clock b{font-size:13px}#eco-time button{flex:0 0 auto;min-width:40px;font-weight:700;font-size:15px}#eco-time #eh-speed{min-width:58px;font-size:13px}#eco-time.paused #eh-clock b{color:#ffcf6b}#eco-time.paused #eh-speed{color:#ffcf6b}#eh-badge{position:absolute;right:-3px;top:-4px;background:#d9453a;color:#fff;border-radius:9px;font-size:10px;min-width:16px;height:16px;line-height:16px;text-align:center;display:none}
#eco-sheet{position:fixed;inset:0;z-index:30;background:var(--bg);display:none;flex-direction:column;touch-action:pan-y}#eco-sheet.open{display:flex}
#eco-sheet .top{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #33404f}#eco-sheet .top b{flex:1;font-size:15px;letter-spacing:.04em}
#es-tabs{display:flex;gap:4px;padding:6px 8px;overflow-x:auto;touch-action:pan-x;border-bottom:1px solid #33404f;flex:0 0 auto}#es-tabs button{flex:0 0 auto;min-height:38px;padding:4px 12px;border-radius:18px;font-size:12px}#es-tabs button.on{background:#2f6fb0;border-color:#2f6fb0;color:#fff}
#es-body{flex:1;overflow-y:auto;overflow-x:hidden;padding:10px;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding-bottom:40px}
.es-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.es-card{background:var(--panel);border:1px solid #33404f;border-radius:12px;padding:10px 12px;margin-bottom:10px}.es-grid .es-card{margin:0}
.es-card h5{margin:0 0 6px;font-size:11px;color:var(--mut);letter-spacing:.07em;font-weight:600}.es-big{font-size:21px;font-weight:700}.es-sm{font-size:11px;color:var(--mut)}
.es-kv{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)}.es-kv:last-child{border:0}.es-kv span:first-child{color:var(--mut)}
.pos{color:#8dffb0}.neg{color:#ff9a8a}.warn{color:#ffd27a}.es-bar{height:8px;background:#0e1319;border-radius:4px;overflow:hidden;margin:6px 0}.es-bar i{display:block;height:100%;background:#4f8fc0}
.es-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.es-row button{min-height:44px;flex:1 1 auto}.es-row button.on{background:var(--acc);color:#222;border-color:var(--acc)}
.es-tbl{width:100%;border-collapse:collapse}.es-tbl td,.es-tbl th{padding:4px 4px;text-align:right}.es-tbl td:first-child,.es-tbl th:first-child{text-align:left;color:var(--mut)}.es-tbl th{font-size:11px;color:var(--mut);font-weight:600}
.es-banner{padding:10px 12px;border-radius:12px;margin-bottom:10px;font-weight:600}.es-banner.warn{background:#4a3a14;color:#ffd27a}.es-banner.crit{background:#4a1d19;color:#ff9a8a}
.es-prod{display:flex;align-items:center;gap:10px}.es-prod .dot{width:10px;height:10px;border-radius:50%}.es-prod .nm{flex:1;font-weight:600}
.es-in{width:100%;font-size:20px;padding:10px;text-align:right;min-height:48px}#eco-away{position:fixed;inset:0;z-index:40;background:rgba(5,8,12,.82);display:none;align-items:center;justify-content:center;padding:14px}#eco-away.open{display:flex}
#eco-away .box{background:var(--panel);border:1px solid #4b5a6b;border-radius:14px;padding:16px;max-width:420px;width:100%;max-height:90%;overflow:auto}#eco-away h3{margin:0 0 10px;letter-spacing:.05em}
.es-alert{border-left:4px solid #4f8fc0;padding:8px 10px;background:var(--panel);border-radius:8px;margin-bottom:8px}.es-alert.warn{border-color:#e6a13a}.es-alert.crit{border-color:#d9453a}.es-alert b{display:block}
`;
  const COL = { CRUDE: '#a58a6a', GASOLINE: '#e0584a', DIESEL: '#e2b32c', JET_FUEL: '#4aa3ff', GAS: '#8fd694' };
  let CO = null, tab = 'company', sellP = 'CRUDE', sellQ = null, range = 24, prodRange = 'daily', loanAmt = 10000000, loanTerm = 24, toastFn = null, onChange = () => { }, timer = null, mkt = 'CRUDE', econOpen = false;

  const kv = (a, b, cls) => '<div class="es-kv"><span>' + a + '</span><span class="' + (cls || '') + '">' + b + '</span></div>';
  const card = (t, body) => '<div class="es-card"><h5>' + t + '</h5>' + body + '</div>';
  const big = (t, v, sub, cls) => '<div class="es-card"><h5>' + t + '</h5><div class="es-big ' + (cls || '') + '">' + v + '</div>' + (sub ? '<div class="es-sm">' + sub + '</div>' : '') + '</div>';
  const cl = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';

  function spark(vals, w, h) {
    if (!vals || vals.length < 2) return ''; w = w || 320; h = h || 120; const pad = 6, mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), rg = (mx - mn) || 1, pts = vals.map((v, i) => [pad + i * (w - 2 * pad) / (vals.length - 1), h - 16 - (v - mn) / rg * (h - 32)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '), up = vals[vals.length - 1] >= vals[0], col = up ? '#8dffb0' : '#ff9a8a';
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" style="display:block"><path d="' + d + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (h - 2) + ' L' + pts[0][0].toFixed(1) + ' ' + (h - 2) + 'Z" fill="' + col + '" opacity=".12"/><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round"/>'
      + '<text x="' + pad + '" y="11" fill="#9aa3ad" font-size="10">$' + mx.toFixed(2) + '</text><text x="' + pad + '" y="' + (h - 3) + '" fill="#9aa3ad" font-size="10">$' + mn.toFixed(2) + '</text></svg>';
  }
  const arrow = t => t === 'UP' ? '<span class="pos">▲ UP</span>' : t === 'DOWN' ? '<span class="neg">▼ DOWN</span>' : '<span class="es-sm">■ STABLE</span>';
  const SECTIONS = [['company', 'COMPANY'], ['market', 'MARKET'], ['sell', 'SELL'], ['inventory', 'INVENTORY'], ['storage', 'STORAGE'], ['reserve', 'RESERVE'], ['production', 'PRODUCTION'], ['contracts', 'CONTRACTS'], ['loans', 'LOANS'], ['alerts', 'ALERTS']];

  /* ------------------------------------------------------------ screens */
  /* ------------------------------------------------------------ Economy Phase 6: the company dashboard (every number comes from the journal and the period ledgers) */
  const AR_ACC = { CASH: 'النقد', AR: 'ذمم العقود المدينة', INV_CRUDE: 'مخزون النفط المنتج', INV_CRUDE_BUY: 'مخزون النفط المشترى', INV_GASOLINE: 'مخزون البنزين', INV_DIESEL: 'مخزون الديزل', INV_JET_FUEL: 'مخزون وقود الطائرات', INV_GAS: 'مخزون الغاز', INV_WIP: 'تكاليف المصفاة قيد التشغيل',
    FIXED: 'الأصول الثابتة بالتكلفة', ACC_DEP: 'مجمع الإهلاك', PAY_PAYROLL: 'رواتب مستحقة', PAY_TAX: 'ضريبة مستحقة', LOANS: 'القروض', EQUITY: 'رأس المال المدفوع', REV_SPOT: 'مبيعات فورية', REV_CONTRACT: 'مبيعات العقود', REV_OTHER: 'إيرادات أخرى',
    COGS: 'تكلفة البضاعة المباعة', EXP_OPERATING: 'تشغيل الخزانات', EXP_CMAINT: 'صيانة الشبكة المركزية', EXP_COPS: 'تشغيل الشبكة المركزية', EXP_LABOR: 'الرواتب', EXP_MAINT: 'الصيانة والإصلاح', EXP_ENERGY: 'الكهرباء والطاقة', EXP_STORAGE: 'التخزين', EXP_RSTORAGE: 'تخزين الاحتياطي', EXP_ROPS: 'تشغيل خزانات الاحتياطي', EXP_INSURANCE: 'التأمين', EXP_ADMIN: 'الإدارة', EXP_INFRA: 'صيانة الأنابيب',
    EXP_FEES: 'رسوم البيع', EXP_EXPLORATION: 'الاستكشاف والآبار الاختبارية', EXP_PENALTY: 'غرامات العقود', EXP_INTEREST: 'فوائد القروض', EXP_TAX: 'ضريبة الدخل', EXP_DEP: 'الإهلاك', EXP_DISPOSAL: 'خسارة بيع الأصول' };
  const STAGE_AR = { NORMAL: 'وضع طبيعي', WARNING: 'تحذير مالي', PRESSURE: 'ضغط مالي', LIQUIDITY: 'أزمة سيولة', DEFAULT: 'تعثر في السداد', RESCUE: 'إجراءات إنقاذ', BANKRUPT: 'إفلاس' };
  const IND_AR = { liquidity: 'انخفاض السيولة', debt: 'تراكم الديون', salary: 'تأخر الرواتب', loan: 'تأخر أقساط القروض', losses: 'خسائر متكررة', costs: 'ارتفاع تكاليف التشغيل', sales: 'انخفاض المبيعات', halt: 'توقف الإنتاج' };
  const MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  let subScreen = '', repKey = 'income', repPer = 'month', chartRange = 'month', buySup = 'A', buyTerms = 'CASH', trFrom = null, trTo = null, trQty = 1000, stBuyQty = 5000, rvP = 'CRUDE', rvQ = 100000, rvRelQ = 5000, rvSellQ = 100000, rvSec = 'ov', stSec = 'tanks';
  const REPORTS = [['income', 'قائمة الدخل'], ['balance', 'الميزانية العمومية'], ['cashflow', 'قائمة التدفقات النقدية'], ['expenses', 'تقرير المصروفات'], ['revenue', 'تقرير الإيرادات'], ['payroll', 'تقرير الرواتب'], ['production', 'الإنتاج وتكلفة البرميل'], ['debt', 'تقرير الديون والقروض'], ['assets', 'الأصول والإهلاك'], ['tax', 'تقرير الضرائب']];
  const PER = [['day', 'يومي'], ['month', 'شهري'], ['year', 'سنوي']];
  const arrowAr = (cur, prev) => { if (prev == null) return '<span class="es-sm">لا توجد مقارنة</span>'; const d = cur - prev; return d > 0 ? '<span class="pos">▲ ' + sg(d) + ' عن الشهر السابق</span>' : d < 0 ? '<span class="neg">▼ ' + sg(d) + ' عن الشهر السابق</span>' : '<span class="es-sm">بلا تغيير</span>'; };
  const nameOf = k => AR_ACC[k] || k;
  const sumArr = (a, f) => a.reduce((s, x) => s + f(x), 0);

  function lineChart(series, labels) {                                              // plain SVG: one line per series, values in the same unit
    const W = 320, H = 150, P = 26, all = []; for (const s of series) for (const v of s.values) all.push(v); all.push(0);
    const mx = Math.max(...all), mn = Math.min(...all), span = (mx - mn) || 1, n = labels.length, x = i => P + (n > 1 ? i * (W - 2 * P) / (n - 1) : (W - 2 * P) / 2), y = v => H - 20 - (v - mn) / span * (H - 40);
    let g = '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="#33404f" stroke-dasharray="3 3"/>';
    for (const s of series) { const pts = s.values.map((v, i) => x(i) + ',' + y(v)).join(' '); g += '<polyline fill="none" stroke="' + s.color + '" stroke-width="2" points="' + pts + '"/>'; s.values.forEach((v, i) => { g += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="2.6" fill="' + s.color + '"/>'; }); }
    labels.forEach((l, i) => { g += '<text x="' + x(i) + '" y="' + (H - 4) + '" font-size="9" text-anchor="middle" fill="#8ea0b4">' + l + '</text>'; });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="direction:ltr;max-height:170px">' + g + '</svg>';
  }
  function chartData(s) {
    if (chartRange === 'day') { const a = CO.days.slice(-30); return { labels: a.map(d => String(d.d + 1)), rev: a.map(d => d.revenue), exp: a.map(d => d.expenses), pro: a.map(d => d.profit) }; }
    if (chartRange === 'year') { const groups = []; for (let i = 0; i < CO.months.length; i += 12) groups.push(CO.months.slice(i, i + 12)); const a = groups.slice(-6); return { labels: a.map((g, i) => 'سنة ' + (groups.length - a.length + i + 1)), rev: a.map(g => sumArr(g, m => m.revenue)), exp: a.map(g => sumArr(g, m => m.expenses)), pro: a.map(g => sumArr(g, m => m.profit)) }; }
    const a = CO.months.slice(-6); return { labels: a.map(m => MON[(m.n - 1) % 12]), rev: a.map(m => m.revenue), exp: a.map(m => m.expenses), pro: a.map(m => m.profit) };
  }
  function costShares(L) {                                                          // the cost breakdown: incurred costs of the period (production cost included)
    const rows = [['الرواتب', L.labor], ['الصيانة', L.maintenance], ['الكهرباء والطاقة', L.energy], ['التخزين', L.storage], ['الاستخراج', L.lifting], ['المواد الكيميائية', L.chem], ['التشغيل', L.operating], ['الاستكشاف', L.exploration], ['وقود وفواقد المصفاة', L.refFuel + L.refLoss], ['التأمين والإدارة', L.insurance + L.admin + L.infra]].filter(r => r[1] > 0);
    const tot = sumArr(rows, r => r[1]); return { rows, tot };
  }
  function rDashboard() {
    const s = CO.summary(), f = s.fin, bs = s.balance, lm = s.lastMonth, prev = s.months.length >= 2 ? s.months[s.months.length - 2] : null, last = s.months.length ? s.months[s.months.length - 1] : null, cl2 = CO.clock();
    let h = '<div class="es-sm" style="margin-bottom:8px">' + cl2.weekdayName + ' ' + cl2.textAr + ' · ' + String(cl2.hour).padStart(2, '0') + ':00 · ' + (CO.speed === 0 ? 'الوقت متوقف' : 'السرعة ×' + CO.speed) + '</div>';
    h += '<div class="es-banner ' + (f.stage === 'NORMAL' ? '' : f.stage === 'WARNING' ? 'warn' : 'crit') + '" style="' + (f.stage === 'NORMAL' ? 'display:none' : '') + '">الحالة المالية: ' + (STAGE_AR[f.stage] || f.stage) + (f.negHours ? ' · ' + Math.floor(f.negHours / 24) + ' يوماً تحت الصفر' : '') + '</div>';
    const cashPrev = prev ? prev.cashEnd : null, cashCur = s.cash, netLast = last ? last.profit : null, netPrev = prev ? prev.profit : null;
    h += '<div class="es-grid">'
      + '<div class="es-card"><h5>الرصيد النقدي</h5><div class="es-big ' + (cashCur < 0 ? 'neg' : '') + '">' + M(cashCur) + '</div><div class="es-sm">' + (cashPrev == null ? 'لا توجد مقارنة بعد' : sg(cashCur - cashPrev) + ' عن نهاية الشهر السابق') + '</div></div>'
      + '<div class="es-card"><h5>قيمة الشركة</h5><div class="es-big">' + M(s.value) + '</div><div class="es-sm">أصول بسعر السوق + نقد + مخزون − ديون</div></div>'
      + '<div class="es-card"><h5>إجمالي الأصول</h5><div class="es-big">' + M(bs.totalAssets) + '</div><div class="es-sm">بالتكلفة (لا عمر افتراضي ولا إهلاك جديد) + نقد + مخزون</div></div>'
      + '<div class="es-card"><h5>إجمالي الديون</h5><div class="es-big ' + (s.debt > 0 ? 'warn' : '') + '">' + M(s.debt) + '</div><div class="es-sm">' + CO.loans.length + ' قرض نشط</div></div>'
      + '<div class="es-card"><h5>قيمة المخزون</h5><div class="es-big">' + M(bs.inventory) + '</div><div class="es-sm">بالتكلفة · بسعر السوق ' + M(s.inventoryValue) + '</div></div>'
      + '<div class="es-card"><h5>صافي الربح أو الخسارة (آخر شهر مغلق)</h5><div class="es-big ' + cl(netLast || 0) + '">' + (netLast == null ? '—' : sg(netLast)) + '</div><div class="es-sm">' + (netLast == null ? 'يظهر بعد إغلاق أول شهر' : arrowAr(netLast, netPrev)) + '</div></div>'
      + '</div>';
    // the two financial screens (performance chart, cash flow)
    h += '<div class="es-grid"><button data-act="screen" data-v="perf" style="min-height:64px;font-size:15px">📈 الأداء المالي<div class="es-sm">الإيرادات · المصروفات · الربح</div></button><button data-act="screen" data-v="cash" style="min-height:64px;font-size:15px">💵 التدفق النقدي<div class="es-sm">الداخل · الخارج · الرصيد</div></button></div><div class="es-grid"><button data-act="screen" data-v="bank" style="min-height:64px;font-size:15px;grid-column:1/-1">🏦 المصارف وأسواق المال<div class="es-sm">BANKING &amp; CAPITAL MARKETS · القروض · التصنيف · السندات</div></button></div>';
    // cost breakdown
    const src = lm ? lm.L : s.month.L, sh = costShares(src);
    h += card('تكاليف التشغيل · ' + (lm ? 'آخر شهر مغلق' : 'الشهر الحالي'), sh.rows.length ? sh.rows.map(r => kv(r[0], M(r[1]) + ' · ' + Math.round(r[1] / sh.tot * 100) + '%')).join('') : '<div class="es-sm">لا توجد تكاليف مسجلة بعد.</div>');
    // health
    const F0 = EC.FIXED, monthlyFixed = s.staff.payroll + F0.adminBase, cover = monthlyFixed > 0 ? Math.max(0, s.cash) / monthlyFixed : 0;
    const wells = CO.store.list().filter(b => b.s && DEFS_TYPE(b) === 'well' && b.st === 'OPERATIONAL'); let wOut = 0, wTar = 0; for (const b of wells) { wOut += b.s._out || 0; wTar += b.s._target || 0; }
    const eff = wTar > 0 ? wOut / wTar : null, bl = CO.store.list(), cond = bl.length ? sumArr(bl, b => b.c) / bl.length : null, act = f.indicators.filter(i => i.on).map(i => IND_AR[i.key] || i.label);
    const risk = f.stage === 'NORMAL' ? 'منخفض' : f.stage === 'WARNING' ? 'متوسط' : 'مرتفع';
    h += card('صحة الشركة', '<div class="es-grid" style="margin:0 0 8px">'
      + '<div><div class="es-sm">السيولة</div><div class="es-big" style="font-size:17px">' + cover.toFixed(1) + ' شهر</div><div class="es-bar"><i style="width:' + Math.min(100, cover / 3 * 100) + '%;background:#4f8fc0"></i></div></div>'
      + '<div><div class="es-sm">كفاءة الإنتاج</div><div class="es-big" style="font-size:17px">' + (eff == null ? '—' : Math.round(eff * 100) + '%') + '</div><div class="es-bar"><i style="width:' + (eff == null ? 0 : eff * 100) + '%;background:#5cbf7a"></i></div></div>'
      + '<div><div class="es-sm">حالة الأصول</div><div class="es-big" style="font-size:17px">' + (cond == null ? '—' : Math.round(cond * 100) + '%') + '</div><div class="es-bar"><i style="width:' + (cond == null ? 0 : cond * 100) + '%;background:#5cbf7a"></i></div></div>'
      + '<div><div class="es-sm">مستوى المخاطر</div><div class="es-big ' + (risk === 'مرتفع' ? 'neg' : risk === 'متوسط' ? 'warn' : 'pos') + '" style="font-size:17px">' + risk + '</div><div class="es-sm">' + f.score + ' من 8 مؤشرات</div></div></div>'
      + (act.length ? '<div class="es-sm">مؤشرات نشطة: ' + act.join('، ') + '</div>' : '<div class="es-sm">لا توجد مؤشرات خطر نشطة.</div>'));
    // the three screens
    h += '<div class="es-grid" style="margin-top:6px"><button data-act="screen" data-v="buy">المشتريات</button><button data-act="screen" data-v="staff">الموظفون</button><button data-act="screen" data-v="rescue">الإنقاذ المالي</button><button data-act="screen" data-v="power">الكهرباء</button><button data-act="screen" data-v="ratios">المؤشرات المالية</button><button data-act="screen" data-v="budget">إدارة الميزانية</button><button data-act="screen" data-v="report">التقرير المالي</button><button data-act="screen" data-v="log" style="grid-column:1/3">سجل العمليات المالية</button></div>';
    return h;
  }
  const DEFS_TYPE = b => window.OliBuildings.DEFS[b.d].type;
  function rBudget() {
    const s = CO.summary(), F0 = EC.FIXED, pay = s.staff.payroll, loanPay = CO.loans.reduce((a, l) => a + l.payment, 0), power = EC.POWER.tiers[CO.tier].monthly, ins = s.assets * F0.insurancePerMonth, adm = F0.adminBase + s.assets * F0.adminPerAsset, lm = s.lastMonth, taxEst = lm && lm.tax > 0 ? lm.tax : Math.max(0, (lm ? lm.netProfit : 0)) * EC.TAX.rate;
    const commit = pay + loanPay + power + ins + adm + taxEst, free = s.cash - commit;
    let h = card('الالتزامات الشهرية المعروفة', kv('الرواتب (تُدفع كل 30 يوماً)', M(pay)) + kv('أقساط القروض (أصل + فائدة)', M(loanPay)) + kv('شبكة الكهرباء', M(power)) + kv('التأمين على الأصول', M(ins)) + kv('الإدارة', M(adm)) + kv('الضريبة المتوقعة', M(taxEst)) + kv('<b>مجموع الالتزامات</b>', '<b>' + M(commit) + '</b>'));
    h += card('ما يمكن إنفاقه الآن', kv('الرصيد النقدي', M(s.cash)) + kv('بعد تغطية شهر كامل من الالتزامات', '<b class="' + cl(free) + '">' + M(free) + '</b>') + '<div class="es-sm">المبلغ المتاح للاستثمار أو الشراء دون أن تتعثر الشركة في الشهر القادم. المعادلة: النقد − الالتزامات الشهرية.</div>');
    h += card('السيولة بالأشهر', '<div class="es-big">' + (commit > 0 ? (s.cash / commit).toFixed(1) : '∞') + ' شهر</div><div class="es-sm">كم شهراً تكفي النقدية الحالية لتغطية الالتزامات الشهرية.</div>');
    return '<button data-act="screen" data-v="">← العودة للوحة الشركة</button>' + h;
  }
  function rJournal() {
    const log = CO.journal.log.slice().reverse().slice(0, 80);
    let h = '<button data-act="screen" data-v="">← العودة للوحة الشركة</button><div class="es-sm" style="margin:8px 0">آخر ' + log.length + ' قيد من ' + CO.journal.n + '. كل قيد متوازن: مجموع المدين = مجموع الدائن.</div>';
    if (!log.length) return h + '<div class="es-sm">لا توجد عمليات بعد.</div>';
    for (const e of log) h += '<div class="es-card" style="padding:8px 10px"><div style="display:flex;justify-content:space-between;gap:6px"><b>' + e.type.replace(/_/g, ' ') + '</b><span class="es-sm">#' + e.id + ' · ' + (e.flow === 'NONE' ? 'بدون نقد' : { OP: 'تشغيلي', INV: 'استثماري', FIN: 'تمويلي' }[e.flow]) + '</span></div><div class="es-sm">' + (e.desc || '') + '</div>'
      + e.lines.map(([a, v]) => kv(nameOf(a), (v > 0 ? 'مدين ' : 'دائن ') + M(Math.abs(v)), v > 0 ? 'pos' : 'neg')).join('') + '</div>';
    return h;
  }
  function rFinReport() {
    const s = CO.summary(), per = repPer, pick = per === 'day' ? s.today : per === 'year' ? s.year : (s.lastMonth || s.month);
    const perLbl = per === 'day' ? 'اليوم الحالي' : per === 'year' ? 'السنة الحالية' : (s.lastMonth ? 'آخر شهر مغلق' : 'الشهر الحالي حتى الآن');
    let h = '<button data-act="screen" data-v="">← العودة للوحة الشركة</button><div class="es-row" style="margin:8px 0">' + PER.map(r => '<button data-act="rper" data-v="' + r[0] + '" class="' + (repPer === r[0] ? 'on' : '') + '">' + r[1] + '</button>').join('') + '</div>';
    h += '<div class="es-row" style="margin:0 0 8px">' + REPORTS.map(r => '<button data-act="rep" data-v="' + r[0] + '" class="' + (repKey === r[0] ? 'on' : '') + '">' + r[1] + '</button>').join('') + '</div>';
    const L = pick.L || {}, P = L.pl || {}, c = pick.cash || {}, lbl = REPORTS.find(r => r[0] === repKey)[1];
    if (repKey === 'income') h += card(lbl + ' · ' + perLbl, kv('الإيرادات (المبيعات)', M(pick.revenue)) + kv('تكلفة البضاعة المباعة', '−' + M(P.cogs || 0)) + kv('<b>مجمل الربح</b>', '<b class="' + cl(pick.grossProfit) + '">' + sg(pick.grossProfit) + '</b>') + kv('رسوم البيع', '−' + M(P.fees || 0)) + kv('مصروفات الرواتب', '−' + M(P.labor || 0)) + kv('الصيانة والإصلاح', '−' + M(P.maintenance || 0)) + kv('الكهرباء والطاقة', '−' + M(P.energy || 0)) + kv('التخزين والتشغيل', '−' + M((P.storage || 0) + (P.operating || 0))) + kv('التأمين والإدارة وصيانة الأنابيب', '−' + M((P.insurance || 0) + (P.admin || 0) + (P.infra || 0))) + kv('الإهلاك', '−' + M(P.depreciation || 0)) + kv('الغرامات والخسائر', '−' + M((P.penalty || 0) + (P.disposal || 0))) + kv('فوائد القروض', '−' + M(P.interest || 0)) + kv('ضريبة الدخل', '−' + M(P.tax || 0)) + kv('<b>صافي الربح أو الخسارة</b>', '<b class="' + cl(pick.netProfit) + '">' + sg(pick.netProfit) + '</b>'));
    else if (repKey === 'balance') { const b = CO.balanceSheet(); h += card(lbl + ' · الآن', '<div class="es-sm">الأصول</div>' + kv('النقد', M(b.cash)) + kv('ذمم العقود المدينة', M(b.receivables)) + PRODS_KV(b) + kv('تكاليف المصفاة قيد التشغيل', M(b.wip)) + kv('الأصول الثابتة بالتكلفة', M(b.fixedCost)) + kv('مجمع الإهلاك', '−' + M(-b.accumulatedDepreciation)) + kv('<b>إجمالي الأصول</b>', '<b>' + M(b.totalAssets) + '</b>')
      + '<div class="es-sm" style="margin-top:8px">الالتزامات وحقوق الملكية</div>' + kv('رواتب مستحقة', M(b.payroll)) + kv('ضريبة مستحقة', M(b.tax)) + kv('القروض', M(b.loans)) + kv('رأس المال المدفوع', M(b.paidIn)) + kv('الأرباح المتراكمة (نتيجة النشاط)', sg(b.result)) + kv('<b>إجمالي الالتزامات وحقوق الملكية</b>', '<b>' + M(b.totalLiabilities + b.totalEquity) + '</b>')
      + '<div class="es-sm" style="margin-top:8px">فحص الميزان: ' + (Math.abs(b.gap) < 0.01 ? 'متوازن ✓' : 'فرق ' + M(b.gap)) + '</div>'); }
    else if (repKey === 'cashflow') h += card(lbl + ' · ' + perLbl, kv('الرصيد الافتتاحي', M(c.start)) + kv('تشغيلي: داخل', '+' + M(c.flows.OP.in), 'pos') + kv('تشغيلي: خارج', '−' + M(c.flows.OP.out), 'neg') + kv('<b>صافي التشغيل</b>', '<b class="' + cl(c.flows.OP.net) + '">' + sg(c.flows.OP.net) + '</b>') + kv('استثماري: صافي', sg(c.flows.INV.net)) + kv('تمويلي: صافي', sg(c.flows.FIN.net)) + kv('<b>الرصيد النهائي</b>', '<b>' + M(c.end) + '</b>'));
    else if (repKey === 'expenses') { const rows = [['الرواتب', P.labor], ['الصيانة والإصلاح', P.maintenance], ['الكهرباء', P.energy], ['التخزين', P.storage], ['تشغيل الخزانات', P.operating], ['التأمين', P.insurance], ['الإدارة', P.admin], ['صيانة الأنابيب', P.infra], ['رسوم البيع', P.fees], ['الغرامات', P.penalty], ['الفوائد', P.interest], ['الضريبة', P.tax], ['الاستكشاف والآبار الاختبارية', P.exploration], ['وقود المصفاة الداخلي', P.refFuel], ['فواقد المصفاة', P.refLoss], ['الإهلاك', P.depreciation], ['تكلفة البضاعة المباعة', P.cogs]].filter(r => r[1] > 0); h += card(lbl + ' · ' + perLbl, rows.length ? rows.map(r => kv(r[0], M(r[1]))).join('') + kv('<b>المجموع</b>', '<b>' + M(pick.expenses) + '</b>') : '<div class="es-sm">لا توجد مصروفات في هذه الفترة.</div>') + '<div class="es-sm">الإنتاج الذي يُباع يتحول إلى تكلفة بضاعة مباعة، وليس مصروفاً مباشراً.</div>'; }
    else if (repKey === 'revenue') h += card(lbl + ' · ' + perLbl, kv('مبيعات فورية', M(L.spot || 0)) + kv('مبيعات العقود', M(L.contract || 0)) + kv('إيرادات أخرى', M(L.other || 0)) + kv('<b>إجمالي الإيرادات</b>', '<b>' + M(pick.revenue) + '</b>') + '<div class="es-sm">الإيراد يُسجل عند البيع فقط. النفط في الخزان ليس إيراداً.</div>');
    else if (repKey === 'payroll') { const st = s.staff, Sx = EC.LABOR.salary; h += card('الموظفون والرواتب', kv('المشغلون: ' + n0(st.operators), M(st.operators * Sx.operators)) + kv('المهندسون: ' + n0(st.engineers), M(st.engineers * Sx.engineers)) + kv('موظفو الصيانة: ' + n0(st.maintenance), M(st.maintenance * Sx.maintenance)) + kv('المديرون: ' + n0(st.managers), M(st.managers * Sx.managers)) + kv('<b>الرواتب الشهرية</b>', '<b>' + M(st.payroll) + '</b>') + kv('رواتب مستحقة لم تُدفع بعد', M(-CO.journal.bal.PAY_PAYROLL)) + '<div class="es-sm">الرواتب تُستحق كل ساعة وتُدفع كل 30 يوماً.</div>'); }
    else if (repKey === 'production') { const rows = SELL.map(p => { const v = CO.inventory().find(x => x.product === p); return kv(EC.LABEL[p], n0(L.produced ? L.produced[p] : 0) + ' مُنتج · تكلفة البرميل ' + '$' + (v.unitCost || 0).toFixed(2)); }); h += card(lbl + ' · ' + perLbl, rows.join('') + kv('المصفاة: معالج', n0(L.produced ? L.produced.THRU : 0))); }
    else if (repKey === 'debt') { h += card('القروض النشطة', CO.loans.length ? CO.loans.map(l => kv(l.purpose || 'قرض', M(l.remaining) + ' · ' + (l.rate * 100).toFixed(1) + '% · ' + l.paid + '/' + l.months)).join('') : '<div class="es-sm">لا توجد قروض نشطة.</div>') + kv('<b>إجمالي الدين</b>', '<b>' + M(CO.debt()) + '</b>') + kv('أقساط الشهر القادم', M(CO.loans.reduce((a, l) => a + l.payment, 0))) + kv('فوائد مدفوعة (منذ البداية)', M(CO.led.life.pl.interest)); }
    else if (repKey === 'assets') { const A = CO.assetList(); h += card('الأصول ' + '(' + A.length + ' مبنى)', A.length ? A.slice(0, 30).map(a => kv(a.name + ' · ' + a.label, M(a.book) + ' ' + '<span class="es-sm">إهلاك ' + M(a.depreciated) + '</span>')).join('') : '<div class="es-sm">لا توجد مبانٍ.</div>') + kv('<b>الأصول بالتكلفة الدفترية</b>', '<b>' + M(CO.balanceSheet().fixedNet) + '</b>') + '<div class="es-sm">الإهلاك القسري: ' + Math.round(EC.ASSET.depreciationPerYear * 100) + '% سنوياً من التكلفة، لا ينزل عن ' + Math.round(EC.ASSET.floor * 100) + '%.</div>'; }
    else if (repKey === 'tax') { const y = s.year; h += card(lbl, kv('نسبة الضريبة', Math.round(EC.TAX.rate * 100) + '% من الربح الخاضع') + kv('خسائر مرحّلة', M(s.taxCarry)) + kv('ضريبة مدفوعة هذه السنة', M(y.L.pl.tax)) + kv('ضريبة الشهر المغلق', M(s.lastMonth ? s.lastMonth.L.pl.tax : 0)) + '<div class="es-sm">لا تُفرض ضريبة في شهر الخسارة. الخسارة تُرحّل وتُخصم من الأرباح اللاحقة.</div>'); }
    return h;
  }
  const PRODS_KV = b => SELL.filter(p => p !== 'CRUDE' || true).map(p => kv('مخزون ' + EC.LABEL[p], M(b.inventoryByProduct[p] || 0))).join('');

  function rCompanyDetails() {
    const s = CO.summary(), y = s.year; let h = '';
    h += card('RECEIVABLES', '<div class="es-big">' + M(s.receivables) + '</div><div class="es-sm">contracts not paid yet</div>' + kv('Overdue', M(s.overdue.amount) + ' · ' + s.overdue.count + ' contracts'));
    const st = s.staff; h += card('EMPLOYEES', '<div class="es-big">' + n0(st.total) + '</div><div class="es-sm">Monthly payroll ' + M(st.payroll) + ' (paid every 30 days)</div>' + kv('Operators', n0(st.operators)) + kv('Engineers', n0(st.engineers)) + kv('Maintenance', n0(st.maintenance)) + kv('Managers', n0(st.managers)));
    const p = s.power, nx = EC.POWER.tiers[CO.tier + 1]; h += card('POWER' + (p.limited ? ' · POWER LIMITED' : ''), '<div class="es-sm">' + n0(p.demand) + ' kW of ' + n0(p.cap) + ' kW (' + p.tierName + ')</div><div class="es-bar"><i style="width:' + Math.min(100, p.cap ? p.demand / p.cap * 100 : 0) + '%;background:' + (p.limited ? '#d9453a' : '#4f8fc0') + '"></i></div>' + (p.limited ? '<div class="warn">Efficiency is reduced until you add capacity.</div>' : '')
      + (nx ? '<div class="es-row"><button data-act="grid">Upgrade to ' + nx.name + ' (' + n0(nx.kw) + ' kW) · ' + M(nx.connect) + ' + ' + M(nx.monthly) + '/mo</button></div>' : ''));
    { const md = CO.store.list().filter(b => b.st !== 'UNDER_CONSTRUCTION').reduce((a, b) => a + CO.maintDay(b, CO.loadOf(b)), 0); h += card('الصيانة', '<div class="es-sm">الصيانة تلقائية بالكامل: تُحسب كلفتها يوميًا ضمن التكاليف، والمعدات لا تتآكل ولا تتلف ولا يلزمك إصلاحها.</div>' + kv('كلفة الصيانة اليومية', '$' + n0(md))); }
    const rm = CO.refiningMargin(); if (rm.refineries) h += card('REFINING MARGIN', '<div class="es-big ' + cl(rm.margin) + '">' + sg(rm.margin) + ' / day</div><div class="es-sm">Product revenue − crude opportunity cost − energy − labor − maintenance − operating</div>');
    h += card('TAX', kv('Tax rate', Math.round(EC.TAX.rate * 100) + '% of taxable profit') + kv('Losses carried forward', M(s.taxCarry)) + kv('Paid this year', M(y.L.pl.tax)));
    return h;
  }
  /* purchasing: buy crude, products, chemicals, spare parts and operating materials from a supplier, cash or credit */
  const BUY_QTY = { CRUDE: 1000, GASOLINE: 1000, DIESEL: 1000, JET_FUEL: 1000, GAS: 1000, CHEM: 1000, PARTS: 10, OPS: 100 };
  function rBuy() {
    const sup = CO.supplierOf(buySup), items = EC.PRODUCTS.concat(EC.MATERIALS), names = Object.assign({}, EC.LABEL, EC.MATERIAL_LABEL);
    const uOf = it => EC.PRODUCTS.includes(it) ? (EC.UNIT[it] || 'برميل') : ({ kg: 'كجم', pcs: 'قطعة', unit: 'وحدة' })[EC.MATERIAL_UNIT[it]] || 'وحدة';
    let h = '<button data-act="screen" data-v="">← العودة للوحة الشركة</button><div class="es-sm" style="margin-bottom:8px">المورد</div><div class="es-grid">' + EC.SUPPLIERS.map(x => '<button data-act="supp" data-v="' + x.id + '"' + (x.id === buySup ? ' style="outline:2px solid currentColor"' : '') + '>' + x.name + (x.creditDays ? ' · آجل ' + x.creditDays + ' يوم' : ' · نقداً فقط') + '</button>').join('') + '</div>';
    h += '<div class="es-sm" style="margin:10px 0 6px">طريقة الدفع</div><div class="es-grid"><button data-act="terms" data-v="CASH"' + (buyTerms === 'CASH' ? ' style="outline:2px solid currentColor"' : '') + '>نقداً</button><button data-act="terms" data-v="CREDIT"' + (buyTerms === 'CREDIT' ? ' style="outline:2px solid currentColor"' : '') + (sup.creditDays ? '' : ' disabled') + '>آجل</button></div>';
    h += '<div class="es-sm" style="margin:10px 0 6px">الأسعار تتبع السوق (المنتجات) أو سعر المادة القابل للتعديل في الإعدادات، والمورد يضيف علاوته ونقل ورسومه.</div>';
    for (const it of items) { const q = BUY_QTY[it], qt = CO.buyQuote(it, q, buySup), have = it === 'CRUDE' || EC.PRODUCTS.includes(it) ? CO.available(it) : CO.mats[it] || 0, room = it === 'CRUDE' ? CO.tradeRoom() : CO.roomFor(it);
      h += '<div class="es-row" style="margin:8px 0;padding:8px 0;border-bottom:1px solid #0002"><div><b>' + names[it] + '</b> <span class="es-sm">المخزون ' + n0(have) + ' ' + uOf(it) + '</span><div class="es-sm">' + n0(q) + ' ' + uOf(it) + ' × ' + qt.unitPrice.toFixed(2) + ' + نقل ' + M(qt.freight) + ' + رسوم ' + M(qt.fee) + ' = <b>' + M(qt.total) + '</b></div>'
        + (it === 'CRUDE' && !CO.tradeTanks().length ? '<div class="es-sm neg">النفط المشترى لا يدخل مخزن الإنتاج: ابنِ مخزنًا تجاريًا (غير موصول بالأنابيب) أو مخزن تجارة ونقل</div>' : room < q ? '<div class="es-sm neg">لا توجد سعة كافية في الخزانات (' + n0(room) + ' متاح)</div>' : '') + '</div>'
        + '<button data-act="buy" data-p="' + it + '" data-q="' + q + '"' + (room < q ? ' disabled' : '') + '>شراء</button></div>'; }
    return h + abHtml();
  }
  /* automatic purchasing of materials + warehouse levels (economy.js: autoBuyInfo / setAutoBuy / upgradeWarehouse) */
  const AB_REASON = { cash: 'الرصيد لا يكفي', budget: 'بلغ سقف الإنفاق اليومي', room: 'المستودع ممتلئ', bankrupt: 'الشركة مفلسة' };
  function abHtml() {
    if (!CO.autoBuyInfo) return ''; const U = { kg: 'كغ', pcs: 'قطعة', unit: 'وحدة' }, t = h0 => { const d = Math.floor(h0 / 24) + 1, hh = Math.floor(h0 % 24); return 'يوم ' + d + ' · ' + String(hh).padStart(2, '0') + ':00'; };
    let h = '<h5 style="margin:16px 0 6px">🔁 الشراء التلقائي للمواد والمستودعات</h5><div class="es-sm">تشتري اللعبة المادة تلقائياً عندما ينزل المخزون تحت «حد إعادة الطلب» حتى يصل إلى «المستوى المستهدف»، من أرخص مورد (السعر + النقل + الرسوم)، نقداً من رصيد الشركة. الحقل الفارغ = تلقائي حسب الاستهلاك اليومي الحالي.</div>';
    for (const m of EC.MATERIALS) { const i = CO.autoBuyInfo(m), u = U[i.unit] || i.unit, w = CO.warehouseUpgradeInfo(m), f = i.fail;
      h += '<div class="es-card" style="margin:8px 0" data-ab="' + m + '"><div class="es-row"><b>' + i.label + '</b><button data-act="abon" data-p="' + m + '" class="' + (i.on ? 'on' : '') + '">' + (i.on ? '✅ الشراء التلقائي مفعّل' : '⏸ الشراء التلقائي متوقف') + '</button></div>'
        + '<div class="es-sm">المخزون <b>' + n0(i.stock) + '</b> من ' + n0(i.capacity) + ' ' + u + ' · الاستهلاك الفعلي ' + n0(i.usedDay) + ' ' + u + '/يوم · حاجة المنشآت بنسبة تشغيلها الحالية ' + n0(i.needDay) + ' ' + u + '/يوم · '
        + (i.daysLeft == null ? 'لا توجد منشأة تستهلكها الآن (لا يُشترى شيء)' : 'يكفي ' + (i.daysLeft >= 999 ? 'أكثر من 999' : (Math.round(i.daysLeft * 10) / 10)) + ' يوم') + '</div>'
        + (f && i.on ? '<div class="es-sm neg">⚠ تعذّر الشراء التلقائي: ' + (AB_REASON[f.reason] || f.reason) + (f.reason === 'cash' && f.need ? ' (المطلوب ≈ ' + M(f.need) + '، المتاح ' + M(f.cash || 0) + ')' : '') + '</div>' : '')
        + '<div class="es-grid" style="margin-top:6px">'
        + '<label class="es-sm">حد إعادة الطلب (' + u + ')<input id="ab-' + m + '-reorder" class="es-in" type="number" inputmode="numeric" min="0" placeholder="تلقائي: ' + n0(i.reorderAuto ? i.reorder : i.needDay * i.reorderDays) + ' (' + i.reorderDays + ' أيام)" value="' + (i.reorderAuto ? '' : Math.round(i.reorder)) + '"></label>'
        + '<label class="es-sm">المستوى المستهدف (' + u + ')<input id="ab-' + m + '-target" class="es-in" type="number" inputmode="numeric" min="0" placeholder="تلقائي: ' + n0(i.targetAuto ? i.target : i.needDay * i.targetDays) + ' (' + i.targetDays + ' أيام)" value="' + (i.targetAuto ? '' : Math.round(i.target)) + '"></label>'
        + '<label class="es-sm">أقصى كمية للطلب الواحد (' + u + ')<input id="ab-' + m + '-maxQty" class="es-in" type="number" inputmode="numeric" min="0" placeholder="بلا حد" value="' + (i.maxQty || '') + '"></label>'
        + '<label class="es-sm">الحد الأقصى للإنفاق اليومي ($)<input id="ab-' + m + '-maxSpendDay" class="es-in" type="number" inputmode="numeric" min="0" placeholder="بلا حد" value="' + (i.maxSpendDay || '') + '"></label></div>'
        + '<div class="es-row"><button data-act="abset" data-p="' + m + '">💾 حفظ الإعدادات</button><span class="es-sm">أُنفق اليوم ' + M(i.spentToday) + '</span></div>'
        + (w ? '<div class="es-row" style="margin-top:6px"><span class="es-sm">المستودع: المستوى ' + w.level + ' من ' + w.maxLevel + ' · السعة ' + n0(w.capacity) + ' ' + u + '</span>' + (w.next != null ? '<button data-act="whup" data-p="' + m + '">⬆ توسيع إلى ' + n0(w.next) + ' · ' + M(w.cost) + '</button>' : '<span class="es-sm">أعلى مستوى</span>') + '</div>' : '')
        + '</div>'; }
    const L = CO.autoBuyLog(10);
    h += '<div class="es-sm" style="margin:8px 0 4px"><b>سجل الشراء التلقائي</b> (آخر ' + L.length + ')</div>' + (L.length ? L.map(e => '<div class="es-sm' + (e.ok ? '' : ' neg') + '">' + t(e.t) + ' · ' + (EC.MATERIAL_LABEL[e.item] || e.item) + ' · ' + (e.ok ? n0(e.qty) + ' × ' + (e.unit || 0).toFixed(2) + ' = ' + M(e.total) + ' · ' + e.supplier + (e.partial ? ' (جزئي: الرصيد لا يكفي للكمية كلها)' : '') : 'تعذّر: ' + (AB_REASON[e.reason] || e.reason)) + '</div>').join('') : '<div class="es-sm">لا توجد عمليات بعد.</div>');
    return h;
  }
  /* employees: headcount vs need, training, hours, and what the crew does to output */
  const ROLE_AR = { operators: 'مشغلون', engineers: 'مهندسون', maintenance: 'صيانة', managers: 'مديرون' };
  function rStaff() {
    const s = CO.staff, H = EC.HR, pct = v => Math.round(v * 100) + '%';
    let h = '<button data-act="screen" data-v="">← العودة للوحة الشركة</button>';
    h += '<div class="es-row" style="margin:8px 0"><div><div class="es-sm">كفاءة الفريق</div><div class="es-big ' + (CO.teamEff < 0.95 ? 'warn' : 'pos') + '">' + pct(CO.teamEff) + '</div></div>'
      + '<div><div class="es-sm">عامل الإنتاج</div><div class="es-big">' + pct(CO.staffF) + '</div></div><div><div class="es-sm">الرواتب الشهرية</div><div class="es-big">' + M(s.payroll) + '</div></div></div>';
    h += '<div class="es-sm">' + (CO.engMult > 1 ? 'نقص المهندسين يرفع خطر الأعطال ×' + CO.engMult.toFixed(2) : CO.engMult < 1 ? 'المهندسون الزائدون يقللون خطر الأعطال ×' + CO.engMult.toFixed(2) : 'خطر الأعطال طبيعي (المهندسون بالعدد المطلوب)') + '</div>';
    for (const r of H.roles) { const x = CO.hr[r], n = s[r], req = s.required ? s.required[r] : 0, cap = Math.max(H.surplusMin, Math.ceil(H.surplusShare * req)), short = n < req;
      h += '<div style="margin:10px 0;padding:8px 0;border-bottom:1px solid #0002"><div><b>' + ROLE_AR[r] + '</b> · ' + n + ' من ' + req + ' مطلوب' + (short ? ' <span class="neg">(نقص)</span>' : '') + '</div>'
        + '<div class="es-sm">التدريب ' + pct(x.training) + ' · ساعات ' + x.hours + ' في الأسبوع · الراتب ' + M(EC.LABOR.salary[r] || 0) + ' للفرد شهرياً</div>'
        + '<div class="es-grid" style="margin-top:6px">'
        + '<button data-act="hire" data-p="' + r + '"' + (x.extra + 1 > cap ? ' disabled' : '') + '>+ توظيف</button>'
        + '<button data-act="dismiss" data-p="' + r + '"' + (n <= 0 ? ' disabled' : '') + '>− صرف</button>'
        + (r === 'managers' ? '' : '<button data-act="train" data-p="' + r + '"' + (n <= 0 ? ' disabled' : '') + '>تدريب · ' + M(n * H.trainingCost) + '</button>')
        + '<button data-act="hours" data-p="' + r + '" data-d="-4">ساعات −4</button><button data-act="hours" data-p="' + r + '" data-d="4">ساعات +4</button></div></div>'; }
    return h;
  }
  /* rescue: sell what is not needed, reschedule debt, a rescue loan, cut costs, sell stock for cash */
  function rRescue() {
    const R = EC.RESCUE, trouble = CO.inTrouble(), F = EC.FIXED;
    let h = '<button data-act="screen" data-v="">← العودة للوحة الشركة</button>';
    h += '<div class="es-sm" style="margin:8px 0">الحالة: ' + (trouble ? '<span class="neg">أزمة سيولة — الإنقاذ متاح</span>' : 'وضع طبيعي — قرض الإنقاذ يتطلب أزمة') + (CO.costCutOn() ? ' · خفض التكاليف مفعّل' : '') + '</div>';
    h += '<div style="margin:10px 0"><b>بيع أصل غير مطلوب</b><div class="es-sm">السعر = ' + Math.round(R.assetSaleRatio * 100) + '% من القيمة السوقية. الربح أو الخسارة = السعر − القيمة الدفترية.</div>';
    const list = CO.store.list().slice(0, 12); h += list.length ? list.map(b => { const price = CO.assetValue(b) * R.assetSaleRatio, book = CO.assetRec(b).cost - (CO.assetRec(b).dep || 0);
      return '<div class="es-row" style="margin:6px 0"><div>' + window.OliBuildings.DEFS[b.d].name + ' <span class="es-sm">سعر ' + M(price) + ' · دفتري ' + M(book) + '</span></div><button data-act="sellasset" data-id="' + b.id + '">بيع</button></div>'; }).join('') : '<div class="es-sm">لا توجد أصول.</div>';
    h += '</div><div style="margin:10px 0"><b>جدولة الديون</b><div class="es-sm">الرصيد يبقى كما هو، والأقساط تُعاد حسابها على المدة الجديدة، وتُدفع رسوم ' + Math.round(R.rescheduleFee * 1000) / 10 + '%.</div>';
    h += CO.loans.length ? CO.loans.map(l => '<div style="margin:6px 0"><div class="es-sm">' + (l.purpose || 'قرض') + ' · الرصيد ' + M(l.remaining) + ' · القسط ' + M(l.payment) + '</div><div class="es-grid">' + R.rescheduleMonths.map(m => '<button data-act="resched" data-id="' + l.id + '" data-v="' + m + '">' + m + ' شهر</button>').join('') + '</div></div>').join('') : '<div class="es-sm">لا توجد قروض.</div>';
    h += '</div><div style="margin:10px 0"><b>قرض إنقاذ</b><div class="es-sm">حتى ' + M(R.loanMax) + ' بضمان الأصول والمخزون، لمدة ' + R.loanTerm + ' شهراً بفائدة ' + Math.round(R.loanRate * 100) + '%، واحد في كل مرة.</div><button data-act="rescue" data-v="' + R.loanMax + '"' + (trouble ? '' : ' disabled') + '>طلب ' + M(R.loanMax) + '</button></div>';
    h += '<div style="margin:10px 0"><b>خفض التكاليف</b><div class="es-sm">الإدارة وتشغيل الخزانات أقل بـ ' + Math.round(R.costCutShare * 100) + '% لمدة ' + R.costCutMonths + ' شهراً.</div><button data-act="costcut"' + (CO.costCutOn() ? ' disabled' : '') + '>تفعيل خفض التكاليف</button></div>';
    h += '<div style="margin:10px 0"><b>تخفيض العمالة</b><div class="es-sm">من شاشة الموظفين: صرف موظف يخفض الرواتب فوراً.</div></div>';
    h += '<div style="margin:10px 0"><b>بيع المخزون لتوفير السيولة</b><div class="es-grid" style="margin-top:6px">' + SELL.map(p => '<button data-act="liquid" data-p="' + p + '"' + (CO.available(p) > 0 ? '' : ' disabled') + '>' + EC.LABEL[p] + ' · ' + n0(CO.available(p)) + '</button>').join('') + '</div></div>';
    return h;
  }
  /* power: demand, supply, bought power, shortage, what stops, and the grid */
  function rPower() {
    const p = CO.pw, P = EC.POWER, nx = P.tiers[CO.tier + 1], pct = v => Math.round(v * 100) + '%';
    const stopName = { 6: 'الخزانات والصمامات', 4: 'المصافي والغاز', 2: 'الفواصل' };
    let h = '<button data-act="screen" data-v="">← العودة للوحة الشركة</button>';
    h += '<div class="es-row" style="margin:8px 0"><div><div class="es-sm">الطلب</div><div class="es-big">' + n0(p.demand) + ' kW</div></div><div><div class="es-sm">الشبكة</div><div class="es-big">' + n0(p.cap) + ' kW</div></div><div><div class="es-sm">مشتراة</div><div class="es-big">' + n0(p.bought || 0) + ' kW</div></div></div>';
    h += '<div class="es-sm">المتاح = الشبكة + المشتراة = ' + n0(p.supplied || 0) + ' kW · العجز = ' + n0(p.shortage || 0) + ' kW · عامل الكهرباء ' + pct(p.factor) + '</div>';
    h += '<div class="es-sm" style="margin-top:6px">' + (p.stopFrom == null ? 'لا توقف للمنشآت.' : '<span class="neg">توقف بسبب العجز: ' + (stopName[p.stopFrom] || '') + ' (حسب الأولوية)</span>') + '</div>';
    h += '<div style="margin:12px 0"><b>شراء الكهرباء</b><div class="es-sm">عند العجز يُشترى حتى ' + n0(P_BUY().maxKW) + ' kW بسعر ' + P_BUY().priceMult + ' × سعر الشبكة لكل kWh.</div><div class="es-grid" style="margin-top:6px"><button data-act="pbuy" data-v="' + (CO.powerBuy ? '0' : '1') + '"' + (CO.powerBuy ? ' style="outline:2px solid currentColor"' : '') + '>' + (CO.powerBuy ? 'الشراء مفعّل — إيقاف' : 'تفعيل الشراء') + '</button></div></div>';
    h += '<div style="margin:12px 0"><b>الشبكة</b><div class="es-sm">' + (nx ? 'الشبكة التالية: ' + n0(nx.kw) + ' kW · رسوم الربط ' + M(nx.connect) + ' · الشهري ' + M(nx.monthly) : 'أعلى شبكة.') + '</div>' + (nx ? '<button data-act="grid">ربط الشبكة التالية</button>' : '') + '</div>';
    return h;
  }
  function P_BUY() { return EC.POWER_BUY; }
  /* financial ratios of the last closed month: averages of the start and end balances; غير متاح when the denominator is zero */
  function rRatios() {
    let h = '<button data-act="screen" data-v="">← العودة للوحة الشركة</button>';
    const r = CO.lastMonth && CO.lastMonth.ratios; if (!r) return h + '<div class="es-sm" style="margin-top:8px">تظهر المؤشرات بعد إغلاق أول شهر.</div>';
    const v = (x, f) => x == null ? 'غير متاح' : f(x), pc = x => (+x).toFixed(1) + '%', xx = x => (+x).toFixed(2);
    const rows = [['هامش صافي الربح', v(r.netMargin, pc), 'صافي الربح ÷ الإيرادات'], ['هامش التشغيل', v(r.operatingMargin, pc), 'ربح التشغيل قبل الفائدة والضريبة ÷ الإيرادات'],
      ['العائد على الأصول ROA', v(r.roa, pc), 'صافي الربح ÷ متوسط الأصول'], ['العائد على حقوق الملكية ROE', v(r.roe, pc), 'صافي الربح ÷ متوسط حقوق الملكية'],
      ['نسبة التداول', v(r.currentRatio, xx), 'الأصول المتداولة ÷ الالتزامات المتداولة'], ['الدين إلى الأصول', v(r.debtToAssets, xx), 'إجمالي الالتزامات ÷ إجمالي الأصول'],
      ['تكلفة البرميل', v(r.costPerBarrel, d => '$' + d.toFixed(2)), 'التكاليف ÷ البراميل المنتجة']];
    h += '<div class="es-sm" style="margin:8px 0">الشهر المغلق الأخير</div>' + rows.map(x => '<div class="es-card"><div class="es-kv"><span>' + x[0] + '</span><b class="' + (x[1] === 'غير متاح' ? 'warn' : '') + '">' + x[1] + '</b></div><div class="es-sm">' + x[2] + '</div></div>').join('');
    return h;
  }
  function rCompany() {
    if (subScreen === 'ratios') return rRatios();
    if (subScreen === 'power') return rPower();
    if (subScreen === 'rescue') return rRescue();
    if (subScreen === 'staff') return rStaff();
    if (subScreen === 'buy') return rBuy();
    const FUI = typeof window !== 'undefined' && window.OliFinanceUI; if (FUI && (subScreen === 'perf' || subScreen === 'cash')) return '<button data-act="screen" data-v="">← العودة للوحة الشركة</button><h5 style="margin:8px 0">' + (subScreen === 'perf' ? 'الأداء المالي' : 'التدفق النقدي') + '</h5>' + (subScreen === 'perf' ? FUI.perf(CO) : FUI.cash(CO));
    const KUI = typeof window !== 'undefined' && window.OliBankingUI; if (KUI && subScreen === 'bank') return '<button data-act="screen" data-v="">← العودة للوحة الشركة</button><h5 style="margin:8px 0">المصارف وأسواق المال</h5>' + KUI.html(CO);
    if (subScreen === 'budget') return rBudget();
    if (subScreen === 'log') return rJournal();
    if (subScreen === 'report') return rFinReport();
    return rDashboard() + rCompanyDetails();
  }
  function rMarket() {
    const inv = CO.inventory(), cur = inv.find(v => v.product === mkt) || inv[0], hrs = range, vals = CO.market.series(mkt, hrs, hrs > 200 ? 120 : 0); let h = '';
    const BUI = typeof window !== 'undefined' && window.OliMarketUI, eng = !!(BUI && CO.market.engine);
    if (eng) h = BUI.html(CO); else h += '<div class="es-card"><h5>' + cur.label.toUpperCase() + ' · $' + cur.marketPrice.toFixed(2) + ' ' + arrow(cur.trend) + '</h5>' + spark(vals) + '<div class="es-row" style="margin-top:4px">' + [[24, '24h'], [168, '7 Days'], [720, '30 Days']].map(r => '<button data-act="range" data-v="' + r[0] + '" class="' + (range === r[0] ? 'on' : '') + '">' + r[1] + '</button>').join('') + '</div></div>';
    const evs = eng ? null : CO.market.events; if (evs) h += '<div class="es-card"><h5>أحداث السوق</h5>' + (evs.length ? evs.map(e => { const d = EC.MARKET.events.find(x => x.id === e.id); return '<div class="es-sm">' + (d ? d.label : e.id) + ' · متبقٍ ' + Math.ceil(e.left / 24) + ' يوم</div>'; }).join('') : '<div class="es-sm">لا أحداث نشطة الآن.</div>') + '</div>';
    if (!eng || BUI.state.more) for (const v of inv) {
      h += '<div class="es-card" data-act="pick" data-p="' + v.product + '" style="' + (v.product === mkt ? 'border-color:#4f8fc0' : '') + '"><div class="es-prod"><span class="dot" style="background:' + COL[v.product] + '"></span><span class="nm">' + v.label + '</span><b>$' + v.marketPrice.toFixed(2) + '</b></div>'
        + kv('سعر الشراء (مورد أ)', '$' + CO.buyQuote(v.product, 1, 'A').unitPrice.toFixed(2)) + kv('المنافسة', ({ LOW: 'منخفضة', MEDIUM: 'متوسطة', HIGH: 'مرتفعة' })[EC.MARKET.competition[v.product]] || '—')
        + kv('24h change', '<span class="' + cl(v.change24) + '">' + pc(v.change24) + '</span>') + kv('Trend', arrow(v.trend)) + kv('Your inventory', n0(v.volume) + ' ' + v.unit) + kv('Potential revenue', M(v.potential))
        + '<div class="es-row"><button data-act="mode" data-p="' + v.product + '" data-v="WAIT" class="' + (v.mode === 'WAIT' ? 'on' : '') + '">انتظر</button><button data-act="mode" data-p="' + v.product + '" data-v="SPOT" class="' + (v.mode === 'SPOT' ? 'on' : '') + '">بيع تلقائي</button><button data-act="mode" data-p="' + v.product + '" data-v="CONTRACT" class="' + (v.mode === 'CONTRACT' ? 'on' : '') + '">عقود</button><button data-act="sellnow" data-p="' + v.product + '">SELL NOW</button></div></div>';
    }
    h += '<div class="es-sm">انتظر: يبقى المخزون (تستمر تكلفة التخزين). بيع تلقائي (الافتراضي): عند امتلاء ' + Math.round(EC.AUTOSELL.trigger * 100) + '% يُباع حتى ' + Math.round(EC.AUTOSELL.target * 100) + '%، إلا إذا كان السعر ضعيفًا. عقود: التسليم للعقود المفتوحة.</div>';
    return h;
  }
  function rSell() {
    const v = CO.inventory().find(x => x.product === sellP), q = CO.quote(sellP, sellQ == null ? v.volume : sellQ); if (sellQ == null) sellQ = Math.floor(v.volume);
    let h = '<div class="es-row" style="margin:0 0 8px">' + SELL.map(p => '<button data-act="sellp" data-p="' + p + '" class="' + (p === sellP ? 'on' : '') + '">' + EC.LABEL[p] + '</button>').join('') + '</div>';
    h += card('SELL ' + v.label.toUpperCase(), kv('Available', n0(v.volume) + ' ' + v.unit) + kv('Market price', '$' + v.marketPrice.toFixed(2)) + (sellP === 'CRUDE' ? kv('Crude quality', CO.crudeLabel() + ' × ' + CO.crudeQ.toFixed(2)) : '')
      + '<h5 style="margin-top:10px">QUANTITY</h5><input id="sq-in" class="es-in" type="number" inputmode="numeric" min="0" value="' + Math.floor(sellQ) + '"><div class="es-row">' + [25, 50, 75, 100].map(p => '<button data-act="sellpct" data-v="' + p + '">' + p + '%</button>').join('') + '</div><div id="sq-out">' + sellQuoteHtml() + '</div>');
    return h + '<div class="es-sm">Revenue only comes from selling a product. Oil sitting in a tank is not revenue yet. Selling a lot lowers the price for a few days.</div>';
  }
  function sellQuoteHtml() {
    const q = CO.quote(sellP, sellQ), bad = q.available <= 0 || q.qty <= 0; return kv('Gross', M(q.gross)) + kv('Fees (' + (EC.FEES.spot * 100).toFixed(1) + '%)', '−' + M(q.fee)) + kv('<b>Net</b>', '<b class="pos">' + M(q.net) + '</b>') + '<div class="es-row"><button data-act="sell"' + (bad ? ' disabled' : '') + ' style="' + (bad ? '' : 'background:#2f9e5a;border-color:#2f9e5a;color:#fff') + '">SELL ' + n0(q.qty) + '</button></div>' + (q.available <= 0 ? '<div class="warn">Nothing in storage to sell.</div>' : '');
  }
  function rByproducts() {
    const bp = CO.byproducts();
    return '<div class="es-card"><div class="es-prod"><span class="dot" style="background:#9a7ec8"></span><span class="nm">By-products</span><b>' + n0(bp.qty) + ' bbl</b></div>' + kv('By-product in stock', n0(bp.qty) + ' bbl') + kv('Cost per bbl', '$' + bp.unitCost.toFixed(2)) + kv('Sale price', '$' + bp.price.toFixed(2)) + kv('Book value', M(bp.value))
      + '<div class="es-row"><button data-act="sellbp"' + (bp.qty > 0.5 ? '' : ' disabled') + ' style="' + (bp.qty > 0.5 ? 'background:#2f9e5a;border-color:#2f9e5a;color:#fff' : '') + '">SELL ALL BY-PRODUCT</button></div>'
      + kv('Residue (not for sale)', n0(bp.residue) + ' bbl · value ' + M(bp.residueValue)) + kv('Internal fuel burned (expense)', n0(bp.fuelBurned) + ' bbl · ' + M(bp.fuelCost)) + '</div>';
  }
  /* oil storage and trading (Phase 7): what each tank is, what it holds and where the oil came from, buying, moving, selling bought oil, and the log */
  const SRC_AR = { EMPTY: 'فارغ', PRODUCED: 'نفط منتج من آبارك', BOUGHT: 'نفط مشترى', MIXED: 'خليط (منتج ومشترى)' };
  const KIND_HELP = { COMMERCIAL: 'غير موصول بأنابيب: يخزّن النفط المشترى أو المنقول فقط، ولا يستقبل إنتاج الآبار.', PRODUCTION: 'موصول بمنظومة الآبار: يستقبل النفط المستخرج ويمرره للمصفاة. لا يدخله نفط مشترى.', TRADE: 'موصول بأنابيب نقل وتجارة (لا آبار خلفه): يستقبل النفط المشترى أو المنقول ويغذي المصفاة أو التوزيع.' };
  const TL_AR = { PURCHASE: 'شراء', TRANSFER: 'نقل', SALE: 'بيع', REFINE: 'تكرير' };
  const tradeLine = e => { const q = n0(e.qty) + ' برميل', t = Math.round(e.t / 24);
    if (e.kind === 'PURCHASE') return 'يوم ' + t + ' · شراء ' + q + ' من ' + e.supplier + ' بتكلفة ' + M(e.total) + ' (' + (e.total / e.qty).toFixed(2) + '/برميل) · خُزّن في ' + e.tanks.length + ' خزان';
    if (e.kind === 'TRANSFER') return 'يوم ' + t + ' · نقل ' + q + ' بين خزانين · أجرة ' + M(e.cost) + ' أُضيفت إلى تكلفة المخزون';
    if (e.kind === 'SALE') return 'يوم ' + t + ' · بيع ' + q + ' (' + (e.source === 'BOUGHT' ? 'مشترى' : e.source === 'OWN' ? 'منتج' : 'خليط') + ') بإيراد ' + M(e.revenue) + ' · ' + (e.profit >= 0 ? 'ربح ' : 'خسارة ') + M(Math.abs(e.profit));
    return 'يوم ' + t + ' · دخل المصفاة ' + q + ' من النفط المشترى بتكلفة ' + M(e.cost); };
  /* two separate gauges, never added together: the commercial stores and the Strategic Reserve */
  const gaugeCard = (title, g, note) => card(title, '<div class="es-prod"><span class="nm">' + n0(g.volume) + ' من ' + n0(g.capacity) + '</span><b>' + (g.capacity > 0 ? Math.round(g.fill * 100) + '%' : '—') + '</b></div><div class="es-bar"><i style="width:' + Math.min(100, g.fill * 100) + '%;background:' + (g.fill >= .9 ? '#d9453a' : '#8f9aa6') + '"></i></div><div class="es-sm">' + (g.tanks ? g.tanks + ' خزان' : 'لا توجد خزانات بعد') + (g.water > 0.5 ? ' · منها ماء ' + n0(g.water) + ' (لا يُحسب نفطاً)' : '') + (note ? ' · ' + note : '') + '</div>');
  function rReserve() {
    const I = CO.reserveInfo(), f = I.fills; const S = { ov: '', tr: '', rl: '', mk: '', lg: '' };
    if (!I.exists) return card('منطقة الاحتياطي الاستراتيجي', '<div class="es-sm">لا توجد منطقة احتياطي في هذا العالم بعد.</div>');
    S.ov += card('منطقة الاحتياطي الاستراتيجي', kv('الموقع الثابت', I.zone.x + '، ' + I.zone.y + ' (على الخريطة بالأصفر)') + kv('المساحة المفتوحة', '<bdi dir="ltr">' + I.area.w + '×' + I.area.h + '</bdi> مربع (المستوى ' + I.level + ' من ' + I.maxLevel + ')') + kv('أقصى مساحة', '<bdi dir="ltr">' + I.zone.w + '×' + I.zone.h + '</bdi> مربع') + (I.region ? kv('أرض الاحتياطي', 'المنطقة ' + (I.region.label || I.region.name) + ' كاملة (للتخزين فقط)') : '') + kv('سعة الاحتياطي الكلية', n0(f.reserve.capacity) + ' برميل') + kv('مخزون الاحتياطي', n0(f.reserve.volume) + ' برميل') + kv('نسبة الامتلاء', Math.round(f.reserve.fill * 100) + '%') + kv('عدد الخزانات', n0(f.reserve.tanks)) + '<div class="es-sm" style="margin:6px 0">منشأة تخزين فقط: تُبنى فيها الخزانات والمضخات والصمامات. لا يدخل ما فيها في البيع التلقائي، ولا يخرج نفطها إلا بقرارك.</div><button data-act="rvgo" style="min-height:48px;width:100%;font-weight:800">📍 إظهار على الخريطة</button>');
    const c = I.expandCost; S.ov += card('توسعة المنطقة', c == null ? '<div class="es-sm">فُتحت المساحة كاملة.</div>' : '<div class="es-sm">فتح الحلقة التالية من الأرض يتيح بناء خزانات أكثر. التكلفة تُسجَّل أصلاً ثابتاً في دفتر الشركة.</div><button data-act="rvexp"' + (CO.store.cash < c ? ' disabled' : '') + '>توسيع المنطقة · ' + M(c) + '</button>' + (CO.store.cash < c ? '<div class="es-sm neg">الرصيد لا يكفي</div>' : ''));
    S.ov += card('خزانات الاحتياطي (' + I.tanks.length + ')', I.tanks.length ? I.tanks.map(t => '<div class="es-prod"><span class="nm">' + '<bdi>' + t.name + '</bdi> · رقم ' + t.id + ' — ' + EC.LABEL[t.product] + '</span><b>' + Math.round(t.fill * 100) + '%</b></div><div class="es-bar"><i style="width:' + Math.min(100, t.fill * 100) + '%;background:#f0b429"></i></div><div class="es-sm">' + n0(t.volume) + ' من ' + n0(t.capacity) + (t.product === 'GAS' ? ' برميل مكافئ' : ' برميل') + '</div>').join('') : '<div class="es-sm">لا توجد خزانات بعد. اختر خزاناً من لوحة البناء وضعه داخل الإطار الأصفر.</div>');
    const qts = [1000, 5000, 10000, 25000], RVQ = [100000, 250000, 500000, 1000000, 2500000, 5000000], pick = (act, cur, list) => '<div class="es-grid">' + (list || qts).map(q => '<button data-act="' + act + '" data-v="' + q + '"' + (q === cur ? ' style="outline:2px solid currentColor"' : '') + '>' + n0(q) + '</button>').join('') + '</div>';
    const prods = [...new Set(I.tanks.map(t => t.product))];
    if (!prods.includes(rvP)) rvP = prods[0] || 'CRUDE';
    S.tr += card('الأرصدة وتكلفة المتوسط', I.tanks.length ? kv('قيمة الاحتياطي في الدفتر', M(I.book)) + SELL.filter(p => (I.byProduct && I.byProduct[p]) || CO.reserveStock(p) > 0).map(p => kv(EC.LABEL[p], n0(CO.reserveStock(p)) + ' · متوسط ' + '$' + CO.reserveAvgCost(p).toFixed(2))).join('') : '<div class="es-sm">لا توجد خزانات.</div>');
    if (I.tanks.length) {
      const qt = CO.reserveBuyQuote(rvP, rvQ, buySup);
      S.tr += card('شراء إلى الاحتياطي', '<div class="es-row">' + prods.map(p => '<button data-act="rvp" data-v="' + p + '" class="' + (p === rvP ? 'on' : '') + '">' + EC.LABEL[p] + '</button>').join('') + '</div>' + pick('rvq', rvQ, RVQ)
        + (qt.ok ? kv('السعر', '$' + qt.unitPrice.toFixed(2)) + kv('الإجمالي (مع الشحن والرسوم)', M(qt.total)) + kv('متوسط التكلفة بعد الشراء', '$' + qt.avgAfter.toFixed(2)) + kv('المساحة الفارغة', n0(qt.room)) : '<div class="es-sm neg">لا يمكن الشراء الآن</div>')
        + '<button data-act="rvbuy"' + (qt.ok && qt.qty <= qt.room && CO.store.cash >= qt.total ? '' : ' disabled') + '>اشترِ إلى الاحتياطي</button>');
      S.rl += card('سحب بأمرك', '<div class="es-sm">لا يخرج شيء من الاحتياطي بمجرد توصيل أنبوب. حدّد الكمية وأمر السحب لكل خزان؛ يمرّ النفط عبر الأنبوب الموصول بالمخرج ثم يُغلق المخرج وحده.</div>' + pick('rvrq', rvRelQ)
        + I.tanks.map(t => '<div class="es-prod"><span class="nm">' + '<bdi>' + t.name + '</bdi> · رقم ' + t.id + ' — ' + EC.LABEL[t.product] + '</span><b>' + n0(t.volume) + '</b></div><div class="es-sm">' + (t.hasOutlet ? (t.release > 0 ? 'أمر مفتوح: ' + n0(t.release) + ' برميل' : 'المخرج مغلق') : 'لا يوجد أنبوب على المخرج') + '</div><div class="es-row"><button data-act="rvrel" data-id="' + t.id + '"' + (t.hasOutlet && t.volume > 0 ? '' : ' disabled') + '>اسحب ' + n0(Math.min(rvRelQ, t.volume)) + '</button><button data-act="rvstop" data-id="' + t.id + '"' + (t.release > 0 ? '' : ' disabled') + '>إلغاء الأمر</button></div>').join(''));
      const sq = CO.reserveSellQuote(rvP, rvSellQ);
      S.tr += card('بيع يدوي من الاحتياطي', '<div class="es-sm">لا يبيع النظام التلقائي من الاحتياطي أبداً. البيع هنا بقرارك فقط.</div>' + pick('rvsq', rvSellQ, RVQ)
        + (sq.ok ? kv('سعر السوق', '$' + sq.unitPrice.toFixed(2)) + kv('الصافي بعد الرسوم', M(sq.net)) + kv('تكلفة البراميل من الاحتياطي', M(sq.estCost)) + kv(sq.estProfit >= 0 ? 'الربح المتوقع' : 'الخسارة المتوقعة', M(Math.abs(sq.estProfit)), sq.estProfit >= 0 ? 'pos' : 'neg') : '<div class="es-sm">لا يوجد مخزون من ' + EC.LABEL[rvP] + ' في الاحتياطي.</div>')
        + '<button data-act="rvsell"' + (sq.ok && sq.qty > 0 && rvSellQ <= sq.available + 1e-6 ? '' : ' disabled') + '>بِع ' + n0(rvSellQ) + ' ' + EC.LABEL[rvP] + '</button>');
      const cs = I.cost; S.ov += card('تكاليف الاحتياطي اليومية', kv('التخزين', M(cs.storage)) + kv('التشغيل والصيانة والطاقة', M(cs.ops)) + kv('الإجمالي', M(cs.total)) + '<div class="es-sm">تظهر في المصروفات بخطّين مستقلّين عن المخازن التجارية.</div>');
    }
    { const fp = CO.marketFootprint(30), d = fp && CO.market.footprint(1), pct = v => v.toFixed(v < 0.01 && v > 0 ? 4 : 3) + '%', bb = v => n0(v) + ' برميل/يوم';
      S.mk += card('أثر الشركة على السوق العالمي', fp ? kv('حصتك من الإنتاج العالمي (آخر يوم)', pct(d.shareProd)) + kv('حصتك من الإنتاج العالمي (متوسط ' + fp.days + ' يوم)', pct(fp.shareProd)) + kv('حصتك من المعروض العالمي (متوسط)', pct(fp.shareSupply))
        + kv('متوسط ما تطرحه يومياً', bb(fp.offered)) + kv('متوسط ما تطرحه شهرياً', n0(fp.offered * 30) + ' برميل') + kv('نفط محجوب في الاحتياطي عن السوق', n0(fp.kept) + ' برميل') + kv('استجابة المنتجين الآخرين', (fp.response >= 0 ? 'زيادة ' : 'خفض ') + bb(Math.abs(fp.response)))
        + kv('أثر إضافة مليون برميل على السعر', (fp.sensitivity).toFixed(2) + '% تقريباً') + '<div class="es-sm">القيم من السجل اليومي الفعلي. أثرك على السعر يتناسب مع حجمك الحقيقي، ويتضخم عندما يكون المخزون العالمي منخفضاً والطلب مرتفعاً.</div>' : '<div class="es-sm">لا بيانات سوق بعد.</div>');
      S.mk += card('قيمة الاحتياطي', kv('التكلفة الدفترية', M(I.book)) + kv('بسعر السوق اليوم', M(I.marketValue)) + kv(I.unrealized >= 0 ? 'ربح غير محقق' : 'خسارة غير محققة', M(Math.abs(I.unrealized)), I.unrealized >= 0 ? 'pos' : 'neg') + '<div class="es-sm">لا يُسجَّل في الدفتر قبل البيع الفعلي.</div>'); }
    const KL = { BUY: 'شراء', IN: 'دخول', OUT: 'خروج', ORDER: 'أمر سحب', STOP: 'إلغاء أمر', SELL: 'بيع', EXPAND: 'توسعة' };
    const lg = CO.reserveLog(25); S.lg += card('سجل عمليات الاحتياطي', lg.length ? lg.map(l => '<div class="es-sm">يوم ' + Math.floor(l.t / 24 + 1) + ' · <b>' + (KL[l.kind] || l.kind) + '</b>' + (l.product ? ' ' + EC.LABEL[l.product] : '') + (l.qty ? ' · ' + n0(l.qty) + ' برميل' : '') + (l.value ? ' · ' + M(l.value) : '') + (l.tank ? ' · خزان #' + l.tank : '') + (l.note ? ' · ' + l.note : '') + '</div>').join('') : '<div class="es-sm">لا عمليات بعد.</div>');
    const mini = (title, g, bar) => '<div class="es-card"><h5>' + title + '</h5><div class="es-big">' + (g.capacity > 0 ? Math.round(g.fill * 100) + '%' : '—') + '</div><div class="es-bar"><i style="width:' + Math.min(100, g.fill * 100) + '%;background:' + bar + '"></i></div><div class="es-sm">' + n0(g.volume) + ' من ' + n0(g.capacity) + '</div><div class="es-sm">' + (g.tanks ? g.tanks + ' خزان' : 'لا خزانات') + (g.water > 0.5 ? ' · ماء ' + n0(g.water) : '') + '</div></div>';
    const SEC = [['ov', 'نظرة عامة'], ['tr', 'شراء وبيع'], ['rl', 'سحب'], ['mk', 'السوق'], ['lg', 'السجل']];
    return '<div class="es-grid">' + mini('امتلاء الاحتياطي الاستراتيجي', f.reserve, '#f0b429') + mini('امتلاء المخزون التجاري', f.commercial, '#8f9aa6') + '</div><div class="es-sm" style="margin:-4px 0 8px">مؤشران مستقلان: كل نسبة = حجمها ÷ سعتها فقط، ولا يُجمع أحدهما مع الآخر.</div>'
      + '<div class="es-row" style="margin:0 0 8px;flex-wrap:nowrap">' + SEC.map(x => '<button style="min-width:0;padding:4px 4px;font-size:12px" data-act="rvsec" data-v="' + x[0] + '" class="' + (x[0] === rvSec ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>' + (S[rvSec] || S.ov);
  }
  function rStorage() {
    const rep = CO.tankReport(), inv = CO.inventory().find(r => r.product === 'CRUDE'), can = rep.filter(r => r.canBuy), sel = id => id === trFrom ? ' style="outline:2px solid #3b82c4"' : id === trTo ? ' style="outline:2px solid #2f9e5a"' : '';
    const S = { tanks: '', trade: '', log: '' }; let h = '';
    S.tanks += gaugeCard('امتلاء المخزون التجاري', CO.fills().commercial, 'الاحتياطي الاستراتيجي له مؤشر منفصل في تبويب الاحتياطي');
    S.tanks += card('أنواع المخازن', '<div class="es-sm">' + ['COMMERCIAL', 'PRODUCTION', 'TRADE'].map(k => '<div style="margin:4px 0"><b>' + ({ COMMERCIAL: 'تخزين تجاري', PRODUCTION: 'مخزن إنتاج', TRADE: 'مخزن تجارة ونقل' })[k] + ':</b> ' + KIND_HELP[k] + '</div>').join('') + '<div style="margin-top:6px">وجود أنبوب لا يكفي لتحديد النوع: يُحدَّد من مصدر النفط الذي يصل إلى الخزان.</div></div>');
    S.tanks += card('النفط المشترى مقابل النفط المنتج', kv('نفط منتج في المخازن', n0(inv.ownVolume) + ' برميل') + kv('نفط مشترى في المخازن', n0(inv.boughtVolume) + ' برميل') + kv('المخزون المشترى (دفتر)', n0(inv.boughtQty) + ' برميل · ' + M(inv.boughtBook)) + kv('متوسط تكلفة البرميل المشترى', M(inv.boughtUnitCost)) + kv('استهلكته المصفاة حتى الآن', n0(inv.boughtUsed) + ' برميل') + kv('سعة متاحة للشراء', n0(inv.tradeRoom) + ' برميل'));
    if (!rep.length) S.tanks += '<div class="es-card es-sm">لا توجد خزانات نفط خام بعد.</div>';
    for (const r of rep) S.tanks += '<div class="es-card"><div class="es-prod"><span class="nm">' + '<bdi>' + r.name + '</bdi> · رقم ' + r.id + ' — <b>' + r.kindAr + '</b></span><b>' + Math.round(r.fill * 100) + '%</b></div><div class="es-bar"><i style="width:' + Math.min(100, r.fill * 100) + '%;background:' + (r.fill >= .9 ? '#d9453a' : '#8f9aa6') + '"></i></div>'
      + kv('السعة الإجمالية', n0(r.capacity) + ' برميل') + kv('الكمية الحالية', n0(r.volume) + ' برميل') + kv('المساحة المتبقية', n0(r.free) + ' برميل') + kv('مصدر النفط', SRC_AR[r.source]) + (r.bought > 0 ? kv('منه مشترى', n0(r.bought) + ' برميل') : '') + (r.own > 0 ? kv('منه منتج', n0(r.own) + ' برميل') : '')
      + '<div class="es-sm" style="margin:4px 0">' + KIND_HELP[r.kind] + '</div>' + (r.canBuy ? '<div class="es-grid"><button data-act="trsel" data-v="from" data-id="' + r.id + '"' + sel(r.id) + '>مصدر النقل</button><button data-act="trsel" data-v="to" data-id="' + r.id + '"' + sel(r.id) + '>وجهة النقل</button></div>' : '') + '</div>';
    const qt = CO.buyQuote('CRUDE', stBuyQty, buySup), room = CO.tradeRoom();
    S.trade += card('شراء نفط خام', '<div class="es-sm">يُخزَّن في مخزن تجاري أو تجارة فقط، ويُخصم من رصيد الشركة وقت الشراء. المورد: ' + (CO.supplierOf(buySup) || {}).name + '</div><div class="es-grid">' + [1000, 5000, 10000, 25000].map(q => '<button data-act="stq" data-v="' + q + '"' + (q === stBuyQty ? ' style="outline:2px solid currentColor"' : '') + '>' + n0(q) + '</button>').join('') + '</div>'
      + '<div class="es-sm" style="margin:6px 0">' + n0(stBuyQty) + ' × ' + qt.unitPrice.toFixed(2) + ' + نقل ' + M(qt.freight) + ' + رسوم ' + M(qt.fee) + ' = <b>' + M(qt.total) + '</b></div>'
      + (!can.length ? '<div class="es-sm neg">لا يوجد مخزن تجاري أو تجارة: ابنِ خزان نفط خام غير موصول بالآبار.</div>' : room < stBuyQty ? '<div class="es-sm neg">المساحة المتاحة ' + n0(room) + ' برميل فقط</div>' : '') + '<button data-act="buy" data-p="CRUDE" data-q="' + stBuyQty + '"' + (!can.length || room < stBuyQty ? ' disabled' : '') + '>شراء</button>');
    const fromR = rep.find(r => r.id === trFrom), toR = rep.find(r => r.id === trTo);
    S.trade += card('نقل نفط مشترى بين الخزانات', '<div class="es-sm">من: <b>' + (fromR ? '<bdi>' + fromR.name + '</bdi> · رقم ' + fromR.id : 'لم يُختر') + '</b> · إلى: <b>' + (toR ? '<bdi>' + toR.name + '</bdi> · رقم ' + toR.id : 'لم يُختر') + '</b><br>أجرة النقل ' + M(EC.TRADE.TRANSFER_COST) + ' للبرميل وتُضاف إلى تكلفة النفط المشترى. لا يُنقل من/إلى مخزن الإنتاج.</div><div class="es-grid">' + [500, 1000, 5000].map(q => '<button data-act="trq" data-v="' + q + '"' + (q === trQty ? ' style="outline:2px solid currentColor"' : '') + '>' + n0(q) + '</button>').join('') + '</div><button data-act="transfer"' + (fromR && toR ? '' : ' disabled') + '>نقل ' + n0(trQty) + ' برميل</button>');
    const bq = CO.quote('CRUDE', inv.boughtVolume, 'BOUGHT'), pq = CO.quote('CRUDE', inv.ownVolume, 'OWN');
    S.trade += card('بيع النفط الخام', '<div class="es-sm">السعر الحالي ' + M(CO.market.price.CRUDE * CO.crudeQ) + '/برميل · متوسط تكلفة المشترى ' + M(inv.boughtUnitCost) + ' · الربح أو الخسارة يُحسب على تكلفة الكمية المباعة فقط.</div>'
      + '<div class="es-row" style="margin-top:6px"><div><b>المشترى</b> <span class="es-sm">' + n0(inv.boughtVolume) + ' برميل</span></div><div class="es-grid"><button data-act="sellsrc" data-v="BOUGHT" data-q="1000"' + (inv.boughtVolume < 1 ? ' disabled' : '') + '>بيع 1,000</button><button data-act="sellsrc" data-v="BOUGHT" data-q="all"' + (inv.boughtVolume < 1 ? ' disabled' : '') + '>بيع الكل (' + M(bq.net - inv.boughtVolume * inv.boughtUnitCost) + ' ' + (bq.net - inv.boughtVolume * inv.boughtUnitCost >= 0 ? 'ربح' : 'خسارة') + ')</button></div></div>'
      + '<div class="es-row" style="margin-top:6px"><div><b>المنتج من آبارك</b> <span class="es-sm">' + n0(inv.ownVolume) + ' برميل</span></div><div class="es-grid"><button data-act="sellsrc" data-v="OWN" data-q="1000"' + (inv.ownVolume < 1 ? ' disabled' : '') + '>بيع 1,000</button><button data-act="sellsrc" data-v="OWN" data-q="all"' + (inv.ownVolume < 1 ? ' disabled' : '') + '>بيع الكل</button></div></div>');
    const lg = CO.tradeLog.slice(-15).reverse();
    S.log += card('سجل العمليات (شراء · نقل · بيع · تكرير)', lg.length ? lg.map(e => '<div class="es-sm" style="margin:4px 0;border-bottom:1px solid #0002;padding-bottom:3px"><b>' + TL_AR[e.kind] + '</b> — ' + tradeLine(e) + '</div>').join('') : '<div class="es-sm">لا توجد عمليات بعد.</div>');
    const SEC = [['tanks', 'الخزانات'], ['trade', 'شراء ونقل وبيع'], ['log', 'السجل']];
    return '<div class="es-row" style="margin:0 0 8px;flex-wrap:nowrap">' + SEC.map(x => '<button style="min-width:0;padding:4px 4px;font-size:12px" data-act="stsec" data-v="' + x[0] + '" class="' + (x[0] === stSec ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>' + (S[stSec] || S.tanks);
  }
  /* WATER (stage 2): separated water is stored in water tanks and sold through a loading pump. Its own card: stock, what can be sold, the price, the total, the log. Never counted as oil. */
  let wQ = 1000; const WQ = [1000, 5000, 10000, 50000, 'all'], WREASON = { noLoader: 'لا توجد مضخة تحميل: ابنِ مضخة مياه موصولة بخزان مياه ولا مخرج لها', notEnough: 'الكمية أكبر من المياه المتاحة', loadLimit: 'تجاوزت قدرة التحميل اليومية لمضخات التحميل', nothingToSell: 'لا توجد مياه للبيع', qty: 'اختر كمية صحيحة', bankrupt: 'الشركة مفلسة' };
  function autoWaterHtml() {                                                       // automatic sale: switch + the reserve to keep; the sale itself runs on the game clock, not here
    const a = CO.autoWaterInfo(), st = !a.on ? 'متوقف' : a.loaders <= 0 ? 'مفعّل · لا توجد مضخة تحميل موصولة بشبكة مياه' : a.stock <= a.reserve + 1e-6 ? 'مفعّل · المخزون عند الاحتياطي (البيع متوقف)' : a.dailyLeft <= 1e-6 ? 'مفعّل · بلغت قدرة التحميل اليومية' : 'مفعّل · يبيع الآن';
    return '<div class="es-sm" style="margin-top:8px"><b>البيع التلقائي</b></div>'
      + '<div class="es-row"><button data-act="wauto" class="' + (a.on ? 'on' : '') + '" style="' + (a.on ? 'background:#2f9e5a;border-color:#2f9e5a;color:#fff' : '') + '">' + (a.on ? 'مفعّل ✓ (اضغط للإيقاف)' : 'إيقاف (اضغط للتشغيل)') + '</button></div>'
      + '<div class="es-sm">الكمية المحتفَظ بها (احتياطي المياه)</div><input id="wr-in" class="es-in" type="number" inputmode="numeric" min="0" value="' + Math.floor(a.reserve) + '"><div class="es-row"><button data-act="wrset">حفظ الاحتياطي</button></div>'
      + kv('الحالة', st) + kv('المتاح للبيع التلقائي', n0(a.available) + ' برميل') + kv('مضخات التحميل الموصولة', n0(a.loaders)) + kv('قدرة التحميل اليومية', n0(a.dailyCap) + ' برميل/يوم')
      + kv('المباع تلقائياً اليوم', n0(a.soldToday) + ' برميل') + kv('إجمالي المباع تلقائياً', n0(a.soldTotal) + ' برميل');
  }
  function rWater() {
    const w = CO.waterInfo(), q = wQ === 'all' ? Math.floor(w.sellable) : Math.min(wQ, Math.max(0, Math.floor(w.sellable))), quote = q > 0 ? CO.waterQuote(q) : { ok: false }, log = CO.waterLog(5);
    const has = w.tanks > 0, warn = !has ? '<div class="es-sm">لا توجد خزانات مياه بعد: ابنِ خزان مياه من قائمة التخزين.</div>' : w.full ? '<div class="es-sm neg">⚠️ خزانات المياه ممتلئة: توقّف استقبال المياه. بِع المياه أو ابنِ خزاناً إضافياً.</div>' : '';
    return '<div class="es-card"><div class="es-prod"><span class="dot" style="background:#5fb8d9"></span><span class="nm">المياه</span><b>' + n0(w.stock) + ' برميل</b></div>' + (has ? '<div class="es-bar"><i style="width:' + Math.min(100, Math.round(w.fill * 100)) + '%;background:#5fb8d9"></i></div>' : '') + warn
      + kv('السعة الكلية', n0(w.capacity) + ' برميل') + kv('كمية المياه المخزنة', n0(w.stock) + ' برميل') + kv('المساحة المتاحة', n0(w.free) + ' برميل') + kv('نسبة الامتلاء', Math.round(w.fill * 100) + '%')
      + kv('المتاح للبيع الآن', n0(w.sellable) + ' برميل') + kv('سعر البيع', '$' + w.price.toFixed(2) + ' / برميل')
      + '<div class="es-row" style="flex-wrap:wrap">' + WQ.map(x => '<button data-act="wq" data-v="' + x + '" class="' + (x === wQ ? 'on' : '') + '">' + (x === 'all' ? 'الكل' : n0(x)) + '</button>').join('') + '</div>'
      + kv('الكمية المراد بيعها', n0(q) + ' برميل') + kv('<b>إجمالي الصفقة</b>', '<b class="pos">' + M(q * w.price) + '</b>')
      + '<div class="es-row"><button data-act="wsell"' + (quote.ok ? '' : ' disabled') + ' style="' + (quote.ok ? 'background:#2f9e5a;border-color:#2f9e5a;color:#fff' : '') + '">بيع ' + n0(q) + ' برميل ماء</button></div>'
      + autoWaterHtml()
      + kv('إنتاج المياه (كمية فقط)', n0(w.produced) + ' برميل') + kv('إجمالي المباع', n0(w.sold) + ' برميل') + kv('إيرادات المياه', M(w.revenue))
      + (log.length ? '<div class="es-sm" style="margin-top:6px"><b>سجل البيع</b></div>' + log.map(e => '<div class="es-sm" style="border-bottom:1px solid #0002;padding:2px 0">' + n0(e.qty) + ' برميل × $' + e.price.toFixed(2) + ' = ' + M(e.total) + '</div>').join('') : '') + '</div>';
  }
  function rInventory() {
    return rWater() + rByproducts() + CO.inventory().map(v => '<div class="es-card"><div class="es-prod"><span class="dot" style="background:' + COL[v.product] + '"></span><span class="nm">' + v.label + '</span><b>' + Math.round(v.fill * 100) + '%</b></div><div class="es-bar"><i style="width:' + Math.min(100, v.fill * 100) + '%;background:' + (v.fill >= 0.9 ? '#d9453a' : COL[v.product]) + '"></i></div>'
      + kv('Current volume', n0(v.volume + (v.water || 0)) + ' ' + v.unit) + (v.water > 0 ? kv('of which water', n0(v.water) + ' ' + v.unit) : '') + kv('Capacity', n0(v.capacity) + ' ' + v.unit) + kv('Market value', M(v.value)) + kv('Storage cost', M(v.storageCostDay) + ' / day') + '</div>').join('');
  }
  function rProduction() {
    const pr = CO.production(prodRange), rt = CO.productionRates(), row = (nm, k, c) => '<div class="es-card"><div class="es-prod"><span class="dot" style="background:' + c + '"></span><span class="nm">' + nm + '</span><div style="text-align:right"><div class="es-big" style="font-size:18px">' + n0(pr[k]) + '</div><div class="es-sm">now ' + n0(rt[k]) + ' / day</div></div></div></div>';
    return '<div class="es-row" style="margin:0 0 8px">' + [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(r => '<button data-act="prodr" data-v="' + r[0] + '" class="' + (prodRange === r[0] ? 'on' : '') + '">' + r[1] + '</button>').join('') + '</div><div class="es-sm" style="margin-bottom:8px">Barrels produced in the last ' + (prodRange === 'daily' ? '24 hours' : prodRange === 'weekly' ? '7 days' : '30 days') + '</div>'
      + row('Crude Production', 'crude', COL.CRUDE) + row('Refinery Throughput', 'throughput', '#6faa7d') + row('Gasoline Production', 'gasoline', COL.GASOLINE) + row('Diesel Production', 'diesel', COL.DIESEL) + row('Jet Fuel Production', 'jet', COL.JET_FUEL) + row('Gas Production', 'gas', COL.GAS);
  }
  function rContracts() {
    const now = CO.hours; let h = '<div class="es-card"><h5>ACTIVE (' + CO.activeContracts().length + '/' + EC.CONTRACTS.maxActive + ')</h5>';
    const act = CO.activeContracts(); h += act.length ? act.map(c => { const left = (c.deadline - now) / 24, pct = c.delivered / c.qty * 100, have = CO.available(c.product); return '<div style="margin-bottom:12px"><b>Deliver ' + n0(c.qty) + ' ' + EC.UNIT[c.product] + ' ' + EC.LABEL[c.product] + '</b><div class="es-sm">$' + c.price.toFixed(2) + ' each · ' + Math.max(0, Math.ceil(left)) + ' days left · penalty ' + M(c.penalty) + ' · bonus ' + M(c.reward) + '</div><div class="es-bar"><i style="width:' + pct + '%"></i></div><div class="es-sm">' + n0(c.delivered) + ' / ' + n0(c.qty) + ' delivered · in stock ' + n0(have) + '</div><div class="es-row"><button data-act="deliver" data-id="' + c.id + '"' + (have > 0 ? '' : ' disabled') + '>DELIVER ' + n0(Math.min(have, c.qty - c.delivered)) + '</button></div></div>'; }).join('') : '<div class="es-sm">No active contracts.</div>'; h += '</div>';
    h += '<div class="es-card"><h5>OFFERS</h5>' + CO.offers.map(o => '<div style="margin-bottom:12px"><b>Deliver ' + n0(o.qty) + ' ' + EC.UNIT[o.product] + ' ' + EC.LABEL[o.product] + '</b><div class="es-sm">within ' + o.days + ' days · $' + o.price.toFixed(2) + ' each (market $' + CO.market.price[o.product].toFixed(2) + ') = ' + M(o.value) + '</div><div class="es-sm">Bonus ' + M(o.reward) + ' · penalty if late ' + M(o.penalty) + ' · offer ends in ' + Math.ceil((o.expires - now) / 24) + ' days</div><div class="es-row"><button data-act="accept" data-id="' + o.id + '">ACCEPT</button></div></div>').join('') + '</div>';
    if (CO.history.length) h += card('RECENT', CO.history.slice(0, 5).map(c => kv(EC.LABEL[c.product] + ' ' + n0(c.qty), c.status === 'DONE' ? '<span class="pos">DONE</span>' : '<span class="neg">FAILED −' + M(c.paid || 0) + '</span>')).join(''));
    return h + '<div class="es-sm">Deliver by hand, or set a product to CONTRACT in MARKET to deliver automatically.</div>';
  }
  function rLoans() {
    const q = CO.loanQuote(loanAmt, loanTerm), debt = CO.debt(), mpay = CO.loans.reduce((a, l) => a + l.payment, 0); let h = '<div class="es-grid">' + big('DEBT', M(debt), 'Borrowing room ' + M(q.room)) + big('NEXT PAYMENT', M(mpay), 'in ' + Math.ceil(CO.nextPaymentInDays()) + ' days') + '</div>';
    h += card('YOUR LOANS', CO.loans.length ? CO.loans.map(l => '<div style="margin-bottom:10px"><b>' + (l.kind === 'EMERGENCY' ? 'Emergency credit' : l.purpose) + '</b> <span class="es-sm">' + (l.rate * 100).toFixed(1) + '% · ' + l.paid + '/' + l.months + ' paid</span>' + kv('Principal', M(l.principal)) + kv('Remaining debt', M(l.remaining)) + kv('Monthly payment', M(l.payment)) + (l.kind === 'CENTRAL' ? kv('Interest paid so far', M(l.intPaid || 0)) + kv('Principal repaid', M(l.principal - l.remaining)) + kv('Future interest saved by early repayment', M(l.saved || 0)) : '') + '<div class="es-row">' + (l.kind === 'CENTRAL' ? [10, 25, 50].map(p => '<button data-act="prepay" data-id="' + l.id + '" data-v="' + p + '">Pay ' + p + '%</button>').join('') : '') + '<button data-act="repay" data-id="' + l.id + '">Repay all ' + M(l.remaining * (1 + (l.kind === 'CENTRAL' ? 0 : EC.LOANS.prepayFee))) + '</button></div></div>').join('') : '<div class="es-sm">No loans.</div>');
    h += card('NEW LOAN', '<h5>AMOUNT</h5><div class="es-row" style="margin-top:0">' + EC.LOANS.amounts.map(a => '<button data-act="lamt" data-v="' + a + '" class="' + (a === loanAmt ? 'on' : '') + '">' + M(a) + '</button>').join('') + '</div><h5 style="margin-top:10px">TERM</h5><div class="es-row" style="margin-top:0">' + EC.LOANS.terms.map(t => '<button data-act="lterm" data-v="' + t + '" class="' + (t === loanTerm ? 'on' : '') + '">' + t + ' mo</button>').join('') + '</div>'
      + kv('Interest rate', (q.rate * 100).toFixed(2) + '% / year') + kv('Monthly payment', M(q.payment)) + kv('Total interest', M(q.totalInterest)) + '<div class="es-row"><button data-act="borrow"' + (q.ok ? '' : ' disabled') + ' style="' + (q.ok ? 'background:#2f9e5a;border-color:#2f9e5a;color:#fff' : '') + '">TAKE LOAN ' + M(loanAmt) + '</button></div>'
      + (q.ok ? '' : '<div class="warn">' + ({ limit: 'Above your borrowing limit (50% of assets, inventory and cash).', debtPressure: 'No new loans under debt pressure.', bankrupt: 'The company is bankrupt.' }[q.reason] || q.reason) + '</div>'));
    return h + '<div class="es-sm">Payment = P·r·(1+r)ⁿ / ((1+r)ⁿ − 1), r = annual rate / 12. Interest is an expense, the principal is not. Paid every 30 days.</div>';
  }
  function rAlerts() {
    const a = CO.alerts(); return a.length ? a.map(x => '<div class="es-alert ' + x.level + '"><b>' + x.title + '</b><span class="es-sm">' + x.detail + '</span></div>').join('') : '<div class="es-card">All clear. No alerts.</div>';
  }
  const R = { company: rCompany, market: rMarket, sell: rSell, inventory: rInventory, storage: rStorage, reserve: rReserve, production: rProduction, contracts: rContracts, loans: rLoans, alerts: rAlerts };

  /* ------------------------------------------------------------ sheet */
  function render(force) {
    const sh = $('eco-sheet'); if (!sh || !sh.classList.contains('open')) return; const body = $('es-body');
    if (tab === 'sell' && !force) { const o = $('sq-out'); if (o) { o.innerHTML = sellQuoteHtml(); return; } }
    if (!force && document.activeElement && document.activeElement.tagName === 'INPUT') return;
    const st = body.scrollTop; body.innerHTML = R[tab](); body.scrollTop = st;
    for (const b of $('es-tabs').children) b.classList.toggle('on', b.dataset.tab === tab);
    const al = $('es-tabs').querySelector('[data-tab=alerts]'); if (al) { const n = CO.alerts().filter(x => x.level !== 'info').length; al.textContent = 'ALERTS' + (n ? ' (' + n + ')' : ''); }
  }
  function open(t) { tab = t || tab; if (tab === 'sell' && sellQ == null) sellQ = null; $('eco-sheet').classList.add('open'); render(true); }
  function close() { $('eco-sheet').classList.remove('open'); }
  function act(e) {
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return; const a = el.dataset.act, v = el.dataset.v, p = el.dataset.p, id = +el.dataset.id; let msg = null, redo = true;
    const BUI = typeof window !== 'undefined' && window.OliMarketUI; if (BUI && a === 'mkGo') { e.stopPropagation(); const g = el.dataset.v.split(':'); if (g[0] === 'sell') { sellP = g[1]; sellQ = null; tab = 'sell'; } else tab = 'storage'; subScreen = ''; render(true); return; }
    const KUI = typeof window !== 'undefined' && window.OliBankingUI; if (KUI && KUI.ACTS.includes(a)) { e.stopPropagation(); if (KUI.act(a, el, CO)) render(true); return; }
    const FUI = typeof window !== 'undefined' && window.OliFinanceUI; if (FUI && FUI.ACTS.includes(a)) { e.stopPropagation(); if (FUI.act(a, el, CO)) render(true); return; }
    if (BUI && BUI.ACTS.includes(a)) { e.stopPropagation(); if (BUI.act(a, el, CO)) render(true); return; }      // the oil market screen
    if (a === 'range') range = +v; else if (a === 'pick') { mkt = p; } else if (a === 'mode') { CO.setMode(p, v); msg = EC.LABEL[p] + ': ' + v; e.stopPropagation(); }
    else if (a === 'sellnow') { sellP = p; sellQ = null; tab = 'sell'; } else if (a === 'sellp') { sellP = p; sellQ = null; }
    else if (a === 'sellpct') { sellQ = Math.floor(CO.available(sellP) * +v / 100); }
    else if (a === 'sell') { const inp = $('sq-in'), q = inp ? +inp.value : sellQ, r = CO.sell(sellP, q); msg = r.ok ? 'Sold ' + n0(r.qty) + ' ' + EC.LABEL[sellP] + ' · +' + M(r.net) : 'Cannot sell: ' + r.reason; if (r.ok) sellQ = Math.floor(CO.available(sellP)); }
    else if (a === 'wq') wQ = v === 'all' ? 'all' : +v;
    else if (a === 'wauto') { const x = CO.autoWaterInfo(); CO.setAutoWater(!x.on); msg = !x.on ? 'تم تشغيل البيع التلقائي للمياه' : 'تم إيقاف البيع التلقائي للمياه'; }
    else if (a === 'wrset') { const inp = $('wr-in'), r = CO.setAutoWater(undefined, inp ? inp.value : 0); msg = 'احتياطي المياه: ' + n0(r.reserve) + ' برميل'; }
    else if (a === 'wsell') { const w = CO.waterInfo(), q = wQ === 'all' ? Math.floor(w.sellable) : Math.min(wQ, Math.floor(w.sellable)), r = CO.sellWater(q); msg = r.ok ? 'بيع ' + n0(r.qty) + ' برميل ماء · +' + M(r.gross) : 'تعذّر البيع: ' + (WREASON[r.reason] || r.reason); }
    else if (a === 'sellbp') { const r = CO.sellByproduct(CO.qty2.BYPRODUCT); msg = r.ok ? 'Sold ' + n0(r.qty) + ' By-products · +' + M(r.net) : 'Cannot sell: ' + r.reason; }
    else if (a === 'prodr') prodRange = v; else if (a === 'accept') { const r = CO.acceptContract(id); msg = r.ok ? 'Contract accepted' : r.reason === 'tooMany' ? 'Too many active contracts' : 'Offer gone'; }
    else if (a === 'deliver') { const r = CO.deliver(id); msg = r.ok ? 'Delivered ' + n0(r.qty) + ' · +' + M(r.revenue + r.reward) : 'Nothing to deliver'; }
    else if (a === 'lamt') loanAmt = +v; else if (a === 'lterm') loanTerm = +v; else if (a === 'borrow') { const r = CO.takeLoan(loanAmt, loanTerm, 'Expansion'); msg = r.ok ? 'Loan approved · +' + M(loanAmt) : 'Loan refused'; }
    else if (a === 'prepay') { const l0 = CO.loans.find(x => x.id === id), r = l0 ? CO.prepayLoan(id, l0.remaining * (+v) / 100) : { ok: false }; msg = r.ok ? 'Early repayment · −' + M(r.paid + r.accrued) + ' · interest saved ' + M(r.saved) : 'Not enough cash'; }
    else if (a === 'repay') { const r = CO.repayLoan(id); msg = r.ok ? 'Loan repaid · −' + M(r.paid) : 'Not enough cash'; }
    else if (a === 'grid') { const r = CO.gridUpgrade(); msg = r.ok ? 'Grid upgraded to ' + r.tier.name : r.reason === 'cash' ? 'Not enough cash' : 'Maximum grid'; }
    
    else if (a === 'screen') { subScreen = v || ''; $('es-body').scrollTop = 0; }
    else if (a === 'supp') buySup = v; else if (a === 'terms') buyTerms = v;
    else if (a === 'pbuy') { CO.setPowerBuy(v === '1'); msg = CO.powerBuy ? 'Bought power switched on' : 'Bought power switched off'; }
    else if (a === 'sellasset') { const r = CO.sellAsset(id); msg = r.ok ? 'Sold · ' + (r.gainOrLoss >= 0 ? 'gain ' : 'loss ') + M(Math.abs(r.gainOrLoss)) : r.reason === 'pipes' ? 'Disconnect its pipes first' : 'Cannot sell'; }
    else if (a === 'resched') { const r = CO.rescheduleLoan(id, +v); msg = r.ok ? 'Rescheduled · new installment ' + M(r.payment) : r.reason === 'cash' ? 'Not enough cash for the fee' : 'Cannot reschedule'; }
    else if (a === 'rescue') { const r = CO.rescueLoan(+v); msg = r.ok ? 'Rescue loan +' + M(r.amount) : r.reason === 'already' ? 'A rescue loan is already running' : r.reason === 'notInTrouble' ? 'Rescue loan is for a financial crisis only' : r.reason === 'collateral' ? 'Not enough collateral' : 'Rescue loan refused'; }
    else if (a === 'costcut') { const r = CO.costCut(); msg = r.ok ? 'Cost cut on for ' + EC.RESCUE.costCutMonths + ' months' : 'Cost cut is already on'; }
    else if (a === 'liquid') { const r = CO.liquidate(p); msg = r.ok ? 'Sold · +' + M(r.net) : 'Nothing to sell'; }
    else if (a === 'hire') { const r = CO.hire(p, 1); msg = r.ok ? 'Hired · payroll ' + M(r.payroll) + '/month' : r.reason === 'cap' ? 'Hiring cap reached for this facility' : 'Cannot hire'; }
    else if (a === 'dismiss') { const r = CO.dismiss(p, 1); msg = r.ok ? 'Dismissed · payroll ' + M(r.payroll) + '/month' : 'Nobody to dismiss'; }
    else if (a === 'train') { const r = CO.train(p); msg = r.ok ? 'Training done · −' + M(r.cost) : r.reason === 'cash' ? 'Not enough cash for training' : 'Nobody to train'; }
    else if (a === 'hours') { const cur = CO.hr[p].hours; const r = CO.setHours(p, cur + (+el.dataset.d)); msg = r.ok ? 'Weekly hours: ' + r.hours : 'Cannot change hours'; }
    else if (a === 'abon') { const i = CO.autoBuyInfo(p); CO.setAutoBuy(p, { on: !i.on }); msg = (EC.MATERIAL_LABEL[p] || p) + ': ' + (!i.on ? 'تم تفعيل الشراء التلقائي' : 'تم إيقاف الشراء التلقائي'); }
    else if (a === 'abset') { const g = k => { const x = $('ab-' + p + '-' + k); return x ? (x.value.trim() === '' ? null : x.value) : undefined; }; CO.setAutoBuy(p, { reorder: g('reorder'), target: g('target'), maxQty: g('maxQty'), maxSpendDay: g('maxSpendDay') }); if (document.activeElement) document.activeElement.blur(); msg = 'حُفظت إعدادات الشراء التلقائي · ' + (EC.MATERIAL_LABEL[p] || p); }
    else if (a === 'whup') { const r = CO.upgradeWarehouse(p); msg = r.ok ? 'تم توسيع المستودع إلى ' + n0(r.capacity) + ' · ' + M(r.cost) : r.reason === 'cash' ? 'الرصيد لا يكفي لتوسيع المستودع (' + M(r.need) + ')' : 'المستودع في أعلى مستوى'; }
    else if (a === 'buy') { const r = CO.buy(p, +el.dataset.q, buySup, buyTerms); msg = r.ok ? 'Bought ' + n0(r.qty) + ' · ' + M(r.cost) + (r.terms === 'CREDIT' ? ' (آجل)' : '') : r.reason === 'cash' ? 'Not enough cash' : r.reason === 'noTradeTank' ? 'لا يوجد مخزن تجاري أو تجارة لاستقبال النفط المشترى' : r.reason === 'noRoom' ? 'Not enough tank room' : r.reason === 'noCredit' ? 'This supplier sells for cash only' : 'Purchase refused: ' + r.reason; }
    else if (a === 'stsec') { stSec = v; $('es-body').scrollTop = 0; }
    else if (a === 'rvgo') { close(); if (opts.showZone) opts.showZone(); return; }
    else if (a === 'rvsec') { rvSec = v; $('es-body').scrollTop = 0; }
    else if (a === 'rvp') rvP = v; else if (a === 'rvq') rvQ = +v; else if (a === 'rvrq') rvRelQ = +v; else if (a === 'rvsq') rvSellQ = +v;
    else if (a === 'rvbuy') { const r = CO.reserveBuy(rvP, rvQ, buySup, buyTerms); msg = r.ok ? 'اشتريت ' + n0(r.qty) + ' إلى الاحتياطي · ' + M(r.cost) : ({ cash: 'الرصيد لا يكفي', noRoom: 'لا توجد مساحة كافية في خزانات الاحتياطي', noReserveTank: 'لا يوجد خزان احتياطي لهذا المنتج' })[r.reason] || 'تعذّر الشراء'; }
    else if (a === 'rvrel') { const r = CO.reserveRelease(id, rvRelQ); msg = r.ok ? 'أُمر بسحب ' + n0(r.qty) + ' برميل' : ({ noPipe: 'لا يوجد أنبوب موصول بمخرج الخزان', notEnough: 'الخزان لا يحوي هذه الكمية' })[r.reason] || 'تعذّر السحب'; }
    else if (a === 'rvstop') { CO.reserveStop(id); msg = 'أُلغي أمر السحب'; }
    else if (a === 'rvsell') { const r = CO.reserveSell(rvP, rvSellQ); msg = r.ok ? 'بيع ' + n0(r.qty) + ' برميل من الاحتياطي · ' + (r.profit >= 0 ? 'ربح ' : 'خسارة ') + M(Math.abs(r.profit)) : r.reason === 'notEnough' ? 'الاحتياطي لا يحوي هذه الكمية' : 'تعذّر البيع'; }
    else if (a === 'rvexp') { const r = CO.reserveExpand(); msg = r.ok ? 'تم فتح مساحة أكبر من الاحتياطي · ' + M(r.cost) : r.reason === 'cash' ? 'الرصيد لا يكفي للتوسعة' : 'لا يمكن التوسعة'; }
    else if (a === 'trsel') { if (v === 'from') trFrom = id; else trTo = id; } else if (a === 'trq') trQty = +v; else if (a === 'stq') stBuyQty = +v;
    else if (a === 'transfer') { const r = CO.transfer(trFrom, trTo, trQty); msg = r.ok ? 'نُقل ' + n0(r.qty) + ' برميل · أجرة ' + M(r.cost) : ({ productionTank: 'لا يمكن النقل من/إلى مخزن الإنتاج', notEnough: 'الخزان المصدر فيه نفط مشترى أقل من المطلوب (' + n0(r.have || 0) + ')', nothingToMove: 'لا يوجد نفط مشترى في الخزان المصدر', noRoom: 'لا توجد مساحة كافية في الخزان الوجهة', cash: 'الرصيد لا يكفي لأجرة النقل', notReady: 'أحد الخزانين غير جاهز', tank: 'اختر خزانين مختلفين' })[r.reason] || 'تعذّر النقل'; }
    else if (a === 'sellsrc') { const all = el.dataset.q === 'all', q = all ? CO.crudeAvailable(v) : +el.dataset.q, r = CO.sell('CRUDE', q, 'SPOT', { source: v }); msg = r.ok ? 'بيع ' + n0(r.qty) + ' برميل · ' + (r.profit >= 0 ? 'ربح ' : 'خسارة ') + M(Math.abs(r.profit)) : r.reason === 'notEnough' ? 'الكمية المتاحة من هذا المصدر أقل' : 'تعذّر البيع'; }
    else if (a === 'rep') repKey = v; else if (a === 'rper') repPer = v; else if (a === 'crange') chartRange = v;
    else redo = false;
    if (msg && toastFn) toastFn(msg); if (redo) { render(true); hud(); onChange(); }
  }

  /* ------------------------------------------------------------ HUD, away report, events */
  function hud() {
    if (!CO) return; const s = CO.summary(), c = s.clock; $('eh-cash').lastChild.textContent = M(s.cash); $('eh-cash').lastChild.className = s.cash < 0 ? 'neg' : ''; const nt = $('eh-net').lastChild; nt.textContent = sg(s.dayNet); nt.className = s.dayNet > 0 ? 'pos' : s.dayNet < 0 ? 'neg' : '';
    { const inv = CO.inventory(), vol = inv.reduce((a, r) => a + r.volume + (r.water || 0), 0), cap = inv.reduce((a, r) => a + r.capacity, 0), pr = CO.productionRates(); const hp = $('eh-prod'), hs = $('eh-stor'); if (hp) { hp.lastChild.textContent = n0(pr.crude); hp.title = 'برميل نفط في اليوم'; } if (hs) { hs.lastChild.textContent = cap ? Math.round(vol / cap * 100) + '%' : '—'; hs.lastChild.className = cap && vol / cap > .9 ? 'neg' : ''; } }
    $('eh-clock').firstChild.textContent = c.weekdayName + ' · ' + String(c.hour).padStart(2, '0') + ':00'; $('eh-clock').lastChild.textContent = c.textAr; $('eh-pause').textContent = CO.speed === 0 ? '▶' : '⏸'; $('eh-speed').textContent = CO.speed === 0 ? 'متوقف' : '×' + CO.speed; $('eh-speed').title = 'السرعة المختارة: ×1 = ساعة لعب كل ثانية. السرعة الفعلية والساعات المتراكمة في لوحة التشخيص (اضغط مطوّلًا على هذا الزر)';      /* the button shows the CHOSEN speed only; what the device really reaches is measured in the diagnostics panel (live-diag.js), never shown here as if it were reached */ $('eco-time').classList.toggle('paused', CO.speed === 0);
    const n = CO.alerts().filter(x => x.level !== 'info').length, b = $('eh-badge'); b.textContent = n; b.style.display = n ? 'block' : 'none'; const bl = $('eco-bank'); if (CO.bankrupt && bl) showBank();
    const cs = $('cash'); if (cs) cs.textContent = '$' + Math.round(s.cash).toLocaleString('en-US');
  }
  function showAway(r) {
    const box = $('eco-away'); if (!r || !r.ok) return; const rows = [['Away', Math.floor(r.realHours * 60) < 90 ? Math.round(r.realHours * 60) + ' min' : r.realHours.toFixed(1) + ' h', r.capped ? 'capped at ' + EC.OFFLINE.capHours + ' h' : ''], ['Company time', r.gameDays.toFixed(0) + ' days', '']];
    box.querySelector('.box').innerHTML = '<h3>WHILE YOU WERE AWAY</h3>' + rows.map(x => kv(x[0], x[1] + (x[2] ? ' <span class="es-sm">(' + x[2] + ')</span>' : ''))).join('')
      + kv('Produced', n0(r.producedCrude) + ' bbl crude · ' + n0(r.producedProducts) + ' bbl products') + kv('Sold', n0(r.sold) + ' bbl · ' + M(r.soldRevenue)) + kv('Operating cost', M(r.operatingCost)) + kv('Profit / Loss', '<b class="' + cl(r.profit) + '">' + sg(r.profit) + '</b>') + kv('Storage', Math.round(r.storagePct) + '%') + kv('Warnings', r.warnings)
      + '<div class="es-row"><button id="away-ok" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff">CONTINUE</button></div>'; box.classList.add('open'); CO.prevSpeed = CO.speed; CO.setSpeed(0); window.__awayShown = r;
    $('away-ok').onclick = () => { box.classList.remove('open'); CO.clearAway(); CO.setSpeed(CO.prevSpeed > 0 ? CO.prevSpeed : 1); hud(); onChange(); };
  }
  function showBank() {
    const b = $('eco-bank'); if (b.classList.contains('open')) return; b.classList.add('open'); b.querySelector('.box').innerHTML = '<h3>BANKRUPT</h3><div class="es-sm" style="margin-bottom:10px">Cash stayed negative for ' + EC.FINANCE.bankruptAfterDays + ' days. The company is insolvent.</div><div class="es-row"><button id="bank-new" class="danger">START A NEW COMPANY</button></div>'; $('bank-new').onclick = () => { b.classList.remove('open'); if (opts.restart) opts.restart(); hud(); };
  }
  function pumpEvents() { for (const ev of CO.drainEvents()) if (toastFn && ev.level !== 'info') toastFn((ev.level === 'crit' ? '⚠ ' : '') + ev.msg); else if (toastFn) toastFn(ev.msg); }

  /* ------------------------------------------------------------ building ECONOMICS tab */
  function buildingHtml(id) {
    const o = CO.economics(id); if (!o) return ''; const d = '<span class="es-sm"> /day</span>', rows = [];
    rows.push(['الصيانة', 'تلقائية · ضمن التكاليف']);
    if (o.type === 'refinery') rows.push(['By-product made', n0(o.byproductDay) + ' bbl/day'], ['Residue made (not for sale)', n0(o.residueDay) + ' bbl/day'], ['Internal fuel burned', n0(o.fuelDay) + ' bbl/day']);
    if (o.type === 'refinery') { rows.push(['Revenue (products)', M(o.productRevenueDay) + '/day'], ['Crude opportunity cost', '−' + M(o.crudeOpportunityDay) + '/day']); }
    if (o.type === 'well') rows.push(['Crude quality', o.quality], ['Revenue if sold', M(o.revenuePotentialDay) + '/day'], ['Lifting cost', '−' + M(o.liftingDay) + '/day']);
    rows.push(['Operating cost', '−' + M(o.operatingDay) + '/day'], ['Maintenance', '−' + M(o.maintenanceDay) + '/day'], ['Energy (' + n0(o.kw) + ' kW)', '−' + M(o.energyDay) + '/day'], ['Labor share', '−' + M(o.laborDay) + '/day']);
    if (o.type === 'refinery') rows.push(['Chemicals', '−' + M(o.chemicalsDay) + '/day'], ['<b>REFINING MARGIN</b>', '<b class="' + cl(o.refiningMarginDay) + '">' + sg(o.refiningMarginDay) + '/day</b>']);
    if (o.type === 'well') rows.push(['<b>Margin</b>', '<b class="' + cl(o.marginDay) + '">' + sg(o.marginDay) + '/day</b>']);
    if (o.type === 'tank' || o.type === 'gas') rows.push(['<b>Storage cost</b>', '<b>−' + M(o.storageCostDay) + '/day</b>'], ['Stored value', M(o.storedValue)]);
    if (o.type === 'pump') rows.push(['Production impact', o.production]);
    rows.push(['Purchase / value', M(o.purchase) + ' / ' + M(o.value)]);
    const cost = 0;
    return '<table class="kv">' + rows.map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</table>' + (cost > 1 ? '<div class="row"><button id="bRepair">Repair · ' + M(cost) + '</button></div>' : '');
  }

  /* ------------------------------------------------------------ mount */
  let opts = {};
  function mount(o) {
    opts = o; CO = o.company; toastFn = o.toast; onChange = o.onChange || onChange; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const hudEl = document.createElement('div'); hudEl.id = 'eco-hud'; hudEl.innerHTML = '<div class="cell" id="eh-cash"><small>💰 الرصيد</small><b>$0</b></div><div class="cell" id="eh-prod"><small>🛢️ إنتاج/يوم</small><b>0</b></div><div class="cell" id="eh-stor"><small>🏗️ التخزين</small><b>0%</b></div><div class="cell" id="eh-net"><small>💵 أرباح/يوم</small><b>+$0</b></div><button id="eh-menu">☰<span id="eh-badge"></span></button>';
    document.body.appendChild(hudEl);
    const tb = document.createElement('div'); tb.id = 'eco-time'; tb.innerHTML = '<div id="eh-clock" title="تاريخ اللعبة"><small>الخميس · 00:00</small><b>1 يناير 2026</b></div><button id="tm-slow" title="أبطأ">⏪</button><button id="eh-pause" title="إيقاف / تشغيل الوقت">⏸</button><button id="tm-fast" title="أسرع">⏩</button><button id="eh-speed" title="سرعة الوقت">1×</button>'; document.body.appendChild(tb);
    const sh = document.createElement('div'); sh.id = 'eco-sheet'; sh.innerHTML = '<div class="top"><b>OLI OIL COMPANY</b><button id="es-close">✕</button></div><div id="es-tabs"></div><div id="es-body"></div>'; document.body.appendChild(sh);
    const aw = document.createElement('div'); aw.id = 'eco-away'; aw.innerHTML = '<div class="box"></div>'; document.body.appendChild(aw); const bk = document.createElement('div'); bk.id = 'eco-bank'; bk.innerHTML = '<div class="box"></div>'; bk.style.cssText = 'position:fixed;inset:0;z-index:41;background:rgba(5,8,12,.85);display:none;align-items:center;justify-content:center;padding:14px'; document.body.appendChild(bk);
    const sty = document.createElement('style'); sty.textContent = '#eco-bank.open{display:flex!important}#eco-bank .box{background:var(--panel);border:1px solid #4b5a6b;border-radius:14px;padding:16px;max-width:420px;width:100%}'; document.head.appendChild(sty);
    for (const [k, nm] of SECTIONS) { const b = document.createElement('button'); b.dataset.tab = k; b.textContent = nm; b.onclick = () => { tab = k; subScreen = ''; render(true); $('es-body').scrollTop = 0; }; $('es-tabs').appendChild(b); }
    $('es-body').addEventListener('click', act); $('es-body').addEventListener('input', e => { if (e.target.id === 'sq-in') { sellQ = Math.max(0, +e.target.value || 0); const out = $('sq-out'); if (out) out.innerHTML = sellQuoteHtml(); } });
    $('es-close').onclick = close; $('eh-menu').onclick = () => { open(); }; $('eh-cash').onclick = () => open('company'); $('eh-net').onclick = () => open('company'); $('eh-clock').onclick = () => open('market');
    $('eh-pause').onclick = () => { CO.togglePause(); hud(); onChange(); };
    $('tm-fast').onclick = () => { CO.faster(); hud(); onChange(); }; $('tm-slow').onclick = () => { CO.slower(); hud(); onChange(); };
    $('eh-speed').onclick = () => { const sp = EC.TIME.speeds.filter(x => x >= 1), cur = CO.speed || CO.lastSpeed || 1, i = sp.indexOf(cur); CO.setSpeed(sp[(i + 1) % sp.length]); hud(); onChange(); };
    for (const id of ['eco-hud', 'eco-sheet', 'eco-away']) for (const ev of ['pointerdown', 'touchstart']) $(id).addEventListener(ev, e => e.stopPropagation(), { passive: true });
    timer = setInterval(() => { hud(); pumpEvents(); if ($('eco-sheet').classList.contains('open')) render(false); }, 1000); hud();
    return api;
  }
  const api = { mount, open, close, render: () => render(true), hud, showAway, buildingHtml, spark, state: () => ({ tab, subScreen, repKey, repPer, chartRange, open: $('eco-sheet').classList.contains('open'), sellP, sellQ, range, mkt }), setSell: (p, q) => { sellP = p; sellQ = q; } };
  window.OliEconomyUI = api;
})();
