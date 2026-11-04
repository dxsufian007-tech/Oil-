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
#eh-badge{position:absolute;right:-3px;top:-4px;background:#d9453a;color:#fff;border-radius:9px;font-size:10px;min-width:16px;height:16px;line-height:16px;text-align:center;display:none}
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
  const SECTIONS = [['company', 'COMPANY'], ['market', 'MARKET'], ['sell', 'SELL'], ['inventory', 'INVENTORY'], ['production', 'PRODUCTION'], ['contracts', 'CONTRACTS'], ['loans', 'LOANS'], ['alerts', 'ALERTS']];

  /* ------------------------------------------------------------ screens */
  /* ------------------------------------------------------------ Economy Phase 6: the company dashboard (every number comes from the journal and the period ledgers) */
  const AR_ACC = { CASH: 'النقد', AR: 'ذمم العقود المدينة', INV_CRUDE: 'مخزون النفط الخام', INV_GASOLINE: 'مخزون البنزين', INV_DIESEL: 'مخزون الديزل', INV_JET_FUEL: 'مخزون وقود الطائرات', INV_GAS: 'مخزون الغاز', INV_WIP: 'تكاليف المصفاة قيد التشغيل',
    FIXED: 'الأصول الثابتة بالتكلفة', ACC_DEP: 'مجمع الإهلاك', PAY_PAYROLL: 'رواتب مستحقة', PAY_TAX: 'ضريبة مستحقة', LOANS: 'القروض', EQUITY: 'رأس المال المدفوع', REV_SPOT: 'مبيعات فورية', REV_CONTRACT: 'مبيعات العقود', REV_OTHER: 'إيرادات أخرى',
    COGS: 'تكلفة البضاعة المباعة', EXP_OPERATING: 'تشغيل الخزانات', EXP_LABOR: 'الرواتب', EXP_MAINT: 'الصيانة والإصلاح', EXP_ENERGY: 'الكهرباء والطاقة', EXP_STORAGE: 'التخزين', EXP_INSURANCE: 'التأمين', EXP_ADMIN: 'الإدارة', EXP_INFRA: 'صيانة الأنابيب',
    EXP_FEES: 'رسوم البيع', EXP_PENALTY: 'غرامات العقود', EXP_INTEREST: 'فوائد القروض', EXP_TAX: 'ضريبة الدخل', EXP_DEP: 'الإهلاك', EXP_DISPOSAL: 'خسارة بيع الأصول' };
  const STAGE_AR = { NORMAL: 'وضع طبيعي', WARNING: 'تحذير مالي', PRESSURE: 'ضغط مالي', LIQUIDITY: 'أزمة سيولة', DEFAULT: 'تعثر في السداد', RESCUE: 'إجراءات إنقاذ', BANKRUPT: 'إفلاس' };
  const IND_AR = { liquidity: 'انخفاض السيولة', debt: 'تراكم الديون', salary: 'تأخر الرواتب', loan: 'تأخر أقساط القروض', losses: 'خسائر متكررة', costs: 'ارتفاع تكاليف التشغيل', sales: 'انخفاض المبيعات', halt: 'توقف الإنتاج' };
  const MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  let subScreen = '', repKey = 'income', repPer = 'month', chartRange = 'month', buySup = 'A', buyTerms = 'CASH';
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
    const rows = [['الرواتب', L.labor], ['الصيانة', L.maintenance], ['الكهرباء والطاقة', L.energy], ['التخزين', L.storage], ['الاستخراج', L.lifting], ['المواد الكيميائية', L.chem], ['التشغيل', L.operating], ['التأمين والإدارة', L.insurance + L.admin + L.infra]].filter(r => r[1] > 0);
    const tot = sumArr(rows, r => r[1]); return { rows, tot };
  }
  function rDashboard() {
    const s = CO.summary(), f = s.fin, bs = s.balance, lm = s.lastMonth, prev = s.months.length >= 2 ? s.months[s.months.length - 2] : null, last = s.months.length ? s.months[s.months.length - 1] : null, cl2 = CO.clock();
    let h = '<div class="es-sm" style="margin-bottom:8px">' + 'السنة ' + cl2.year + ' · ' + MON[(cl2.month - 1) % 12] + ' · اليوم ' + cl2.dayOfMonth + '</div>';
    h += '<div class="es-banner ' + (f.stage === 'NORMAL' ? '' : f.stage === 'WARNING' ? 'warn' : 'crit') + '" style="' + (f.stage === 'NORMAL' ? 'display:none' : '') + '">الحالة المالية: ' + (STAGE_AR[f.stage] || f.stage) + (f.negHours ? ' · ' + Math.floor(f.negHours / 24) + ' يوماً تحت الصفر' : '') + '</div>';
    const cashPrev = prev ? prev.cashEnd : null, cashCur = s.cash, netLast = last ? last.profit : null, netPrev = prev ? prev.profit : null;
    h += '<div class="es-grid">'
      + '<div class="es-card"><h5>الرصيد النقدي</h5><div class="es-big ' + (cashCur < 0 ? 'neg' : '') + '">' + M(cashCur) + '</div><div class="es-sm">' + (cashPrev == null ? 'لا توجد مقارنة بعد' : sg(cashCur - cashPrev) + ' عن نهاية الشهر السابق') + '</div></div>'
      + '<div class="es-card"><h5>قيمة الشركة</h5><div class="es-big">' + M(s.value) + '</div><div class="es-sm">أصول بسعر السوق + نقد + مخزون − ديون</div></div>'
      + '<div class="es-card"><h5>إجمالي الأصول</h5><div class="es-big">' + M(bs.totalAssets) + '</div><div class="es-sm">بالتكلفة ناقص الإهلاك + نقد + مخزون</div></div>'
      + '<div class="es-card"><h5>إجمالي الديون</h5><div class="es-big ' + (s.debt > 0 ? 'warn' : '') + '">' + M(s.debt) + '</div><div class="es-sm">' + CO.loans.length + ' قرض نشط</div></div>'
      + '<div class="es-card"><h5>قيمة المخزون</h5><div class="es-big">' + M(bs.inventory) + '</div><div class="es-sm">بالتكلفة · بسعر السوق ' + M(s.inventoryValue) + '</div></div>'
      + '<div class="es-card"><h5>صافي الربح أو الخسارة (آخر شهر مغلق)</h5><div class="es-big ' + cl(netLast || 0) + '">' + (netLast == null ? '—' : sg(netLast)) + '</div><div class="es-sm">' + (netLast == null ? 'يظهر بعد إغلاق أول شهر' : arrowAr(netLast, netPrev)) + '</div></div>'
      + '</div>';
    // performance chart with daily / monthly / yearly
    const cd = chartData(); h += card('الأداء المالي', '<div class="es-row" style="margin:0 0 6px">' + [['day', 'يومي'], ['month', 'شهري'], ['year', 'سنوي']].map(r => '<button data-act="crange" data-v="' + r[0] + '" class="' + (chartRange === r[0] ? 'on' : '') + '">' + r[1] + '</button>').join('') + '</div>'
      + (cd.labels.length ? lineChart([{ name: 'الإيرادات', color: '#8dffb0', values: cd.rev }, { name: 'المصروفات', color: '#5aa7ff', values: cd.exp }, { name: 'صافي الربح', color: '#ff9a8a', values: cd.pro }], cd.labels) : '<div class="es-sm">لا توجد أشهر مغلقة بعد — تظهر البيانات بعد نهاية أول شهر.</div>')
      + '<div class="es-kv"><span>الإيرادات</span><span class="pos">' + M(sumArr(cd.rev, v => v)) + '</span></div><div class="es-kv"><span>المصروفات</span><span>' + M(sumArr(cd.exp, v => v)) + '</span></div><div class="es-kv"><span>صافي الربح</span><span class="' + cl(sumArr(cd.pro, v => v)) + '">' + sg(sumArr(cd.pro, v => v)) + '</span></div>');
    // cash flow: this month, in three sections
    const mc = s.month.cash, F = mc.flows;
    h += card('التدفق النقدي · هذا الشهر', kv('الرصيد الافتتاحي', M(mc.start)) + kv('الأموال الداخلة', '+' + M(mc.in), 'pos') + kv('الأموال الخارجة', '−' + M(mc.out), 'neg') + kv('الرصيد النهائي', M(mc.actualEnd))
      + '<div class="es-sm" style="margin-top:6px">تشغيلي ' + sg(F.OP.net) + ' · استثماري ' + sg(F.INV.net) + ' · تمويلي ' + sg(F.FIN.net) + '</div>');
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
    h += '<div class="es-grid" style="margin-top:6px"><button data-act="screen" data-v="buy">المشتريات</button><button data-act="screen" data-v="staff">الموظفون</button><button data-act="screen" data-v="rescue">الإنقاذ المالي</button><button data-act="screen" data-v="budget">إدارة الميزانية</button><button data-act="screen" data-v="report">التقرير المالي</button><button data-act="screen" data-v="log" style="grid-column:1/3">سجل العمليات المالية</button></div>';
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
    else if (repKey === 'expenses') { const rows = [['الرواتب', P.labor], ['الصيانة والإصلاح', P.maintenance], ['الكهرباء', P.energy], ['التخزين', P.storage], ['تشغيل الخزانات', P.operating], ['التأمين', P.insurance], ['الإدارة', P.admin], ['صيانة الأنابيب', P.infra], ['رسوم البيع', P.fees], ['الغرامات', P.penalty], ['الفوائد', P.interest], ['الضريبة', P.tax], ['الإهلاك', P.depreciation], ['تكلفة البضاعة المباعة', P.cogs]].filter(r => r[1] > 0); h += card(lbl + ' · ' + perLbl, rows.length ? rows.map(r => kv(r[0], M(r[1]))).join('') + kv('<b>المجموع</b>', '<b>' + M(pick.expenses) + '</b>') : '<div class="es-sm">لا توجد مصروفات في هذه الفترة.</div>') + '<div class="es-sm">الإنتاج الذي يُباع يتحول إلى تكلفة بضاعة مباعة، وليس مصروفاً مباشراً.</div>'; }
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
    const st = s.staff; h += card('EMPLOYEES', '<div class="es-big">' + n0(st.total) + '</div><div class="es-sm">Monthly payroll ' + M(st.payroll) + ' (paid every 30 days)</div>' + kv('Operators', n0(st.operators)) + kv('Engineers', n0(st.engineers)) + kv('Maintenance', n0(st.maintenance)) + kv('Managers', n0(st.managers)));
    const p = s.power, nx = EC.POWER.tiers[CO.tier + 1]; h += card('POWER' + (p.limited ? ' · POWER LIMITED' : ''), '<div class="es-sm">' + n0(p.demand) + ' kW of ' + n0(p.cap) + ' kW (' + p.tierName + ')</div><div class="es-bar"><i style="width:' + Math.min(100, p.cap ? p.demand / p.cap * 100 : 0) + '%;background:' + (p.limited ? '#d9453a' : '#4f8fc0') + '"></i></div>' + (p.limited ? '<div class="warn">Efficiency is reduced until you add capacity.</div>' : '')
      + (nx ? '<div class="es-row"><button data-act="grid">Upgrade to ' + nx.name + ' (' + n0(nx.kw) + ' kW) · ' + M(nx.connect) + ' + ' + M(nx.monthly) + '/mo</button></div>' : ''));
    const worn = CO.store.list().filter(b => b.c < 0.999 && b.st !== 'UNDER_CONSTRUCTION'), cost = worn.reduce((a, b) => a + CO.repairCost(b), 0);
    h += card('MAINTENANCE', kv('Auto-maintenance', CO.autoRepair ? 'ON (repairs below ' + Math.round(EC.MAINTENANCE.autoRepairBelow * 100) + '%)' : 'OFF') + kv('Worn buildings', worn.length) + '<div class="es-row"><button data-act="auto">' + (CO.autoRepair ? 'Turn auto-maintenance off' : 'Turn auto-maintenance on') + '</button><button data-act="repairall"' + (worn.length ? '' : ' disabled') + '>Repair all · ' + M(cost) + '</button></div>');
    const rm = CO.refiningMargin(); if (rm.refineries) h += card('REFINING MARGIN', '<div class="es-big ' + cl(rm.margin) + '">' + sg(rm.margin) + ' / day</div><div class="es-sm">Product revenue − crude opportunity cost − energy − labor − maintenance − operating</div>');
    h += card('TAX', kv('Tax rate', Math.round(EC.TAX.rate * 100) + '% of taxable profit') + kv('Losses carried forward', M(s.taxCarry)) + kv('Paid this year', M(y.L.pl.tax)));
    return h;
  }
  /* purchasing: buy crude, products, chemicals, spare parts and operating materials from a supplier, cash or credit */
  const BUY_QTY = { CRUDE: 1000, GASOLINE: 1000, DIESEL: 1000, JET_FUEL: 1000, GAS: 1000, CHEM: 1000, PARTS: 10, OPS: 100 };
  function rBuy() {
    const sup = CO.supplierOf(buySup), items = EC.PRODUCTS.concat(EC.MATERIALS), names = Object.assign({}, EC.LABEL, EC.MATERIAL_LABEL);
    let h = '<button data-act="screen" data-v="">← العودة للوحة الشركة</button><div class="es-sm" style="margin-bottom:8px">المورد</div><div class="es-grid">' + EC.SUPPLIERS.map(x => '<button data-act="supp" data-v="' + x.id + '"' + (x.id === buySup ? ' style="outline:2px solid currentColor"' : '') + '>' + x.name + (x.creditDays ? ' · آجل ' + x.creditDays + ' يوم' : ' · نقداً فقط') + '</button>').join('') + '</div>';
    h += '<div class="es-sm" style="margin:10px 0 6px">طريقة الدفع</div><div class="es-grid"><button data-act="terms" data-v="CASH"' + (buyTerms === 'CASH' ? ' style="outline:2px solid currentColor"' : '') + '>نقداً</button><button data-act="terms" data-v="CREDIT"' + (buyTerms === 'CREDIT' ? ' style="outline:2px solid currentColor"' : '') + (sup.creditDays ? '' : ' disabled') + '>آجل</button></div>';
    h += '<div class="es-sm" style="margin:10px 0 6px">الأسعار تتبع السوق (المنتجات) أو سعر المادة القابل للتعديل في الإعدادات، والمورد يضيف علاوته ونقل ورسومه.</div>';
    for (const it of items) { const q = BUY_QTY[it], qt = CO.buyQuote(it, q, buySup), have = it === 'CRUDE' || EC.PRODUCTS.includes(it) ? CO.available(it) : CO.mats[it] || 0, room = EC.PRODUCTS.includes(it) ? CO.roomFor(it) : Infinity;
      h += '<div class="es-row" style="margin:8px 0;padding:8px 0;border-bottom:1px solid #0002"><div><b>' + names[it] + '</b> <span class="es-sm">المخزون ' + n0(have) + ' ' + (EC.UNIT[it] || 'وحدة') + '</span><div class="es-sm">' + n0(q) + ' ' + (EC.UNIT[it] || 'وحدة') + ' × ' + qt.unitPrice.toFixed(2) + ' + نقل ' + M(qt.freight) + ' + رسوم ' + M(qt.fee) + ' = <b>' + M(qt.total) + '</b></div>'
        + (room < q ? '<div class="es-sm neg">لا توجد سعة كافية في الخزانات (' + n0(room) + ' متاح)</div>' : '') + '</div>'
        + '<button data-act="buy" data-p="' + it + '" data-q="' + q + '"' + (room < q ? ' disabled' : '') + '>شراء</button></div>'; }
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
  function rCompany() {
    if (subScreen === 'rescue') return rRescue();
    if (subScreen === 'staff') return rStaff();
    if (subScreen === 'buy') return rBuy();
    if (subScreen === 'budget') return rBudget();
    if (subScreen === 'log') return rJournal();
    if (subScreen === 'report') return rFinReport();
    return rDashboard() + rCompanyDetails();
  }
  function rMarket() {
    const inv = CO.inventory(), cur = inv.find(v => v.product === mkt) || inv[0], hrs = range, vals = CO.market.series(mkt, hrs, hrs > 200 ? 120 : 0); let h = '';
    h += '<div class="es-card"><h5>' + cur.label.toUpperCase() + ' · $' + cur.marketPrice.toFixed(2) + ' ' + arrow(cur.trend) + '</h5>' + spark(vals) + '<div class="es-row" style="margin-top:4px">' + [[24, '24h'], [168, '7 Days'], [720, '30 Days']].map(r => '<button data-act="range" data-v="' + r[0] + '" class="' + (range === r[0] ? 'on' : '') + '">' + r[1] + '</button>').join('') + '</div></div>';
    const evs = CO.market.events; h += '<div class="es-card"><h5>أحداث السوق</h5>' + (evs.length ? evs.map(e => { const d = EC.MARKET.events.find(x => x.id === e.id); return '<div class="es-sm">' + (d ? d.label : e.id) + ' · متبقٍ ' + Math.ceil(e.left / 24) + ' يوم</div>'; }).join('') : '<div class="es-sm">لا أحداث نشطة الآن.</div>') + '</div>';
    for (const v of inv) {
      h += '<div class="es-card" data-act="pick" data-p="' + v.product + '" style="' + (v.product === mkt ? 'border-color:#4f8fc0' : '') + '"><div class="es-prod"><span class="dot" style="background:' + COL[v.product] + '"></span><span class="nm">' + v.label + '</span><b>$' + v.marketPrice.toFixed(2) + '</b></div>'
        + kv('Buy price (supplier A)', '$' + CO.buyQuote(v.product, 1, 'A').unitPrice.toFixed(2)) + kv('Competition', EC.MARKET.competition[v.product] || '—')
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
  function rInventory() {
    return CO.inventory().map(v => '<div class="es-card"><div class="es-prod"><span class="dot" style="background:' + COL[v.product] + '"></span><span class="nm">' + v.label + '</span><b>' + Math.round(v.fill * 100) + '%</b></div><div class="es-bar"><i style="width:' + Math.min(100, v.fill * 100) + '%;background:' + (v.fill >= 0.9 ? '#d9453a' : COL[v.product]) + '"></i></div>'
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
    h += card('YOUR LOANS', CO.loans.length ? CO.loans.map(l => '<div style="margin-bottom:10px"><b>' + (l.kind === 'EMERGENCY' ? 'Emergency credit' : l.purpose) + '</b> <span class="es-sm">' + (l.rate * 100).toFixed(1) + '% · ' + l.paid + '/' + l.months + ' paid</span>' + kv('Principal', M(l.principal)) + kv('Remaining debt', M(l.remaining)) + kv('Monthly payment', M(l.payment)) + '<div class="es-row"><button data-act="repay" data-id="' + l.id + '">Repay ' + M(l.remaining * (1 + EC.LOANS.prepayFee)) + '</button></div></div>').join('') : '<div class="es-sm">No loans.</div>');
    h += card('NEW LOAN', '<h5>AMOUNT</h5><div class="es-row" style="margin-top:0">' + EC.LOANS.amounts.map(a => '<button data-act="lamt" data-v="' + a + '" class="' + (a === loanAmt ? 'on' : '') + '">' + M(a) + '</button>').join('') + '</div><h5 style="margin-top:10px">TERM</h5><div class="es-row" style="margin-top:0">' + EC.LOANS.terms.map(t => '<button data-act="lterm" data-v="' + t + '" class="' + (t === loanTerm ? 'on' : '') + '">' + t + ' mo</button>').join('') + '</div>'
      + kv('Interest rate', (q.rate * 100).toFixed(2) + '% / year') + kv('Monthly payment', M(q.payment)) + kv('Total interest', M(q.totalInterest)) + '<div class="es-row"><button data-act="borrow"' + (q.ok ? '' : ' disabled') + ' style="' + (q.ok ? 'background:#2f9e5a;border-color:#2f9e5a;color:#fff' : '') + '">TAKE LOAN ' + M(loanAmt) + '</button></div>'
      + (q.ok ? '' : '<div class="warn">' + ({ limit: 'Above your borrowing limit (50% of assets, inventory and cash).', debtPressure: 'No new loans under debt pressure.', bankrupt: 'The company is bankrupt.' }[q.reason] || q.reason) + '</div>'));
    return h + '<div class="es-sm">Payment = P·r·(1+r)ⁿ / ((1+r)ⁿ − 1), r = annual rate / 12. Interest is an expense, the principal is not. Paid every 30 days.</div>';
  }
  function rAlerts() {
    const a = CO.alerts(); return a.length ? a.map(x => '<div class="es-alert ' + x.level + '"><b>' + x.title + '</b><span class="es-sm">' + x.detail + '</span></div>').join('') : '<div class="es-card">All clear. No alerts.</div>';
  }
  const R = { company: rCompany, market: rMarket, sell: rSell, inventory: rInventory, production: rProduction, contracts: rContracts, loans: rLoans, alerts: rAlerts };

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
    if (a === 'range') range = +v; else if (a === 'pick') { mkt = p; } else if (a === 'mode') { CO.setMode(p, v); msg = EC.LABEL[p] + ': ' + v; e.stopPropagation(); }
    else if (a === 'sellnow') { sellP = p; sellQ = null; tab = 'sell'; } else if (a === 'sellp') { sellP = p; sellQ = null; }
    else if (a === 'sellpct') { sellQ = Math.floor(CO.available(sellP) * +v / 100); }
    else if (a === 'sell') { const inp = $('sq-in'), q = inp ? +inp.value : sellQ, r = CO.sell(sellP, q); msg = r.ok ? 'Sold ' + n0(r.qty) + ' ' + EC.LABEL[sellP] + ' · +' + M(r.net) : 'Cannot sell: ' + r.reason; if (r.ok) sellQ = Math.floor(CO.available(sellP)); }
    else if (a === 'prodr') prodRange = v; else if (a === 'accept') { const r = CO.acceptContract(id); msg = r.ok ? 'Contract accepted' : r.reason === 'tooMany' ? 'Too many active contracts' : 'Offer gone'; }
    else if (a === 'deliver') { const r = CO.deliver(id); msg = r.ok ? 'Delivered ' + n0(r.qty) + ' · +' + M(r.revenue + r.reward) : 'Nothing to deliver'; }
    else if (a === 'lamt') loanAmt = +v; else if (a === 'lterm') loanTerm = +v; else if (a === 'borrow') { const r = CO.takeLoan(loanAmt, loanTerm, 'Expansion'); msg = r.ok ? 'Loan approved · +' + M(loanAmt) : 'Loan refused'; }
    else if (a === 'repay') { const r = CO.repayLoan(id); msg = r.ok ? 'Loan repaid · −' + M(r.paid) : 'Not enough cash'; }
    else if (a === 'grid') { const r = CO.gridUpgrade(); msg = r.ok ? 'Grid upgraded to ' + r.tier.name : r.reason === 'cash' ? 'Not enough cash' : 'Maximum grid'; }
    else if (a === 'auto') { CO.autoRepair = !CO.autoRepair; } else if (a === 'repairall') { const r = CO.repairAll(); msg = 'Repaired ' + r.n + ' · −' + M(r.cost); }
    else if (a === 'screen') { subScreen = v || ''; $('es-body').scrollTop = 0; }
    else if (a === 'supp') buySup = v; else if (a === 'terms') buyTerms = v;
    else if (a === 'sellasset') { const r = CO.sellAsset(id); msg = r.ok ? 'Sold · ' + (r.gainOrLoss >= 0 ? 'gain ' : 'loss ') + M(Math.abs(r.gainOrLoss)) : r.reason === 'pipes' ? 'Disconnect its pipes first' : 'Cannot sell'; }
    else if (a === 'resched') { const r = CO.rescheduleLoan(id, +v); msg = r.ok ? 'Rescheduled · new installment ' + M(r.payment) : r.reason === 'cash' ? 'Not enough cash for the fee' : 'Cannot reschedule'; }
    else if (a === 'rescue') { const r = CO.rescueLoan(+v); msg = r.ok ? 'Rescue loan +' + M(r.amount) : r.reason === 'already' ? 'A rescue loan is already running' : r.reason === 'notInTrouble' ? 'Rescue loan is for a financial crisis only' : r.reason === 'collateral' ? 'Not enough collateral' : 'Rescue loan refused'; }
    else if (a === 'costcut') { const r = CO.costCut(); msg = r.ok ? 'Cost cut on for ' + EC.RESCUE.costCutMonths + ' months' : 'Cost cut is already on'; }
    else if (a === 'liquid') { const r = CO.liquidate(p); msg = r.ok ? 'Sold · +' + M(r.net) : 'Nothing to sell'; }
    else if (a === 'hire') { const r = CO.hire(p, 1); msg = r.ok ? 'Hired · payroll ' + M(r.payroll) + '/month' : r.reason === 'cap' ? 'Hiring cap reached for this facility' : 'Cannot hire'; }
    else if (a === 'dismiss') { const r = CO.dismiss(p, 1); msg = r.ok ? 'Dismissed · payroll ' + M(r.payroll) + '/month' : 'Nobody to dismiss'; }
    else if (a === 'train') { const r = CO.train(p); msg = r.ok ? 'Training done · −' + M(r.cost) : r.reason === 'cash' ? 'Not enough cash for training' : 'Nobody to train'; }
    else if (a === 'hours') { const cur = CO.hr[p].hours; const r = CO.setHours(p, cur + (+el.dataset.d)); msg = r.ok ? 'Weekly hours: ' + r.hours : 'Cannot change hours'; }
    else if (a === 'buy') { const r = CO.buy(p, +el.dataset.q, buySup, buyTerms); msg = r.ok ? 'Bought ' + n0(r.qty) + ' · ' + M(r.cost) + (r.terms === 'CREDIT' ? ' (آجل)' : '') : r.reason === 'cash' ? 'Not enough cash' : r.reason === 'noRoom' ? 'Not enough tank room' : r.reason === 'noCredit' ? 'This supplier sells for cash only' : 'Purchase refused: ' + r.reason; }
    else if (a === 'rep') repKey = v; else if (a === 'rper') repPer = v; else if (a === 'crange') chartRange = v;
    else redo = false;
    if (msg && toastFn) toastFn(msg); if (redo) { render(true); hud(); onChange(); }
  }

  /* ------------------------------------------------------------ HUD, away report, events */
  function hud() {
    if (!CO) return; const s = CO.summary(), c = s.clock; $('eh-cash').lastChild.textContent = M(s.cash); $('eh-cash').lastChild.className = s.cash < 0 ? 'neg' : ''; const nt = $('eh-net').lastChild; nt.textContent = sg(s.dayNet); nt.className = s.dayNet > 0 ? 'pos' : s.dayNet < 0 ? 'neg' : '';
    { const inv = CO.inventory(), vol = inv.reduce((a, r) => a + r.volume + (r.water || 0), 0), cap = inv.reduce((a, r) => a + r.capacity, 0), pr = CO.productionRates(); const hp = $('eh-prod'), hs = $('eh-stor'); if (hp) { hp.lastChild.textContent = n0(pr.crude); hp.title = 'برميل نفط في اليوم'; } if (hs) { hs.lastChild.textContent = cap ? Math.round(vol / cap * 100) + '%' : '—'; hs.lastChild.className = cap && vol / cap > .9 ? 'neg' : ''; } }
    $('eh-clock').firstChild.textContent = 'Y' + c.year + ' M' + c.month; $('eh-clock').lastChild.textContent = 'D' + c.dayOfMonth + ' ' + String(c.hour).padStart(2, '0') + ':00'; $('eh-pause').textContent = CO.speed === 0 ? '▶' : '⏸'; $('eh-speed').textContent = (CO.speed || CO.lastSpeed || 1) + '×';
    const n = CO.alerts().filter(x => x.level !== 'info').length, b = $('eh-badge'); b.textContent = n; b.style.display = n ? 'block' : 'none'; const bl = $('eco-bank'); if (CO.bankrupt && bl) showBank();
    const cs = $('cash'); if (cs) cs.textContent = '$' + Math.round(s.cash).toLocaleString('en-US');
  }
  function showAway(r) {
    const box = $('eco-away'); if (!r || !r.ok) return; const rows = [['Away', Math.floor(r.realHours * 60) < 90 ? Math.round(r.realHours * 60) + ' min' : r.realHours.toFixed(1) + ' h', r.capped ? 'capped at ' + EC.OFFLINE.capHours + ' h' : ''], ['Company time', r.gameDays.toFixed(0) + ' days', '']];
    box.querySelector('.box').innerHTML = '<h3>WHILE YOU WERE AWAY</h3>' + rows.map(x => kv(x[0], x[1] + (x[2] ? ' <span class="es-sm">(' + x[2] + ')</span>' : ''))).join('')
      + kv('Produced', n0(r.producedCrude) + ' bbl crude · ' + n0(r.producedProducts) + ' bbl products') + kv('Sold', n0(r.sold) + ' bbl · ' + M(r.soldRevenue)) + kv('Operating cost', M(r.operatingCost)) + kv('Profit / Loss', '<b class="' + cl(r.profit) + '">' + sg(r.profit) + '</b>') + kv('Storage', Math.round(r.storagePct) + '%') + kv('Warnings', r.warnings)
      + '<div class="es-row"><button id="away-ok" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff">CONTINUE</button></div>'; box.classList.add('open'); CO.prevSpeed = CO.speed; CO.speed = 0; window.__awayShown = r;
    $('away-ok').onclick = () => { box.classList.remove('open'); CO.clearAway(); CO.speed = CO.prevSpeed == null ? 1 : CO.prevSpeed; if (CO.speed === 0) CO.speed = 1; hud(); onChange(); };
  }
  function showBank() {
    const b = $('eco-bank'); if (b.classList.contains('open')) return; b.classList.add('open'); b.querySelector('.box').innerHTML = '<h3>BANKRUPT</h3><div class="es-sm" style="margin-bottom:10px">Cash stayed negative for ' + EC.FINANCE.bankruptAfterDays + ' days. The company is insolvent.</div><div class="es-row"><button id="bank-new" class="danger">START A NEW COMPANY</button></div>'; $('bank-new').onclick = () => { b.classList.remove('open'); if (opts.restart) opts.restart(); hud(); };
  }
  function pumpEvents() { for (const ev of CO.drainEvents()) if (toastFn && ev.level !== 'info') toastFn((ev.level === 'crit' ? '⚠ ' : '') + ev.msg); else if (toastFn) toastFn(ev.msg); }

  /* ------------------------------------------------------------ building ECONOMICS tab */
  function buildingHtml(id) {
    const o = CO.economics(id); if (!o) return ''; const d = '<span class="es-sm"> /day</span>', rows = [];
    rows.push(['Condition', Math.round(o.condition * 100) + '% · ' + o.conditionLabel]);
    if (o.type === 'refinery') { rows.push(['Revenue (products)', M(o.productRevenueDay) + '/day'], ['Crude opportunity cost', '−' + M(o.crudeOpportunityDay) + '/day']); }
    if (o.type === 'well') rows.push(['Crude quality', o.quality], ['Revenue if sold', M(o.revenuePotentialDay) + '/day'], ['Lifting cost', '−' + M(o.liftingDay) + '/day']);
    rows.push(['Operating cost', '−' + M(o.operatingDay) + '/day'], ['Maintenance', '−' + M(o.maintenanceDay) + '/day'], ['Energy (' + n0(o.kw) + ' kW)', '−' + M(o.energyDay) + '/day'], ['Labor share', '−' + M(o.laborDay) + '/day']);
    if (o.type === 'refinery') rows.push(['Chemicals', '−' + M(o.chemicalsDay) + '/day'], ['<b>REFINING MARGIN</b>', '<b class="' + cl(o.refiningMarginDay) + '">' + sg(o.refiningMarginDay) + '/day</b>']);
    if (o.type === 'well') rows.push(['<b>Margin</b>', '<b class="' + cl(o.marginDay) + '">' + sg(o.marginDay) + '/day</b>']);
    if (o.type === 'tank' || o.type === 'gas') rows.push(['<b>Storage cost</b>', '<b>−' + M(o.storageCostDay) + '/day</b>'], ['Stored value', M(o.storedValue)]);
    if (o.type === 'pump') rows.push(['Production impact', o.production]);
    rows.push(['Purchase / value', M(o.purchase) + ' / ' + M(o.value)]);
    const b = CO.store.get(id), cost = b ? CO.repairCost(b) : 0;
    return '<table class="kv">' + rows.map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</table>' + (cost > 1 ? '<div class="row"><button id="bRepair">Repair · ' + M(cost) + '</button></div>' : '');
  }

  /* ------------------------------------------------------------ mount */
  let opts = {};
  function mount(o) {
    opts = o; CO = o.company; toastFn = o.toast; onChange = o.onChange || onChange; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const hudEl = document.createElement('div'); hudEl.id = 'eco-hud'; hudEl.innerHTML = '<div class="cell" id="eh-cash"><small>💰 الرصيد</small><b>$0</b></div><div class="cell" id="eh-prod"><small>🛢️ إنتاج/يوم</small><b>0</b></div><div class="cell" id="eh-stor"><small>🏗️ التخزين</small><b>0%</b></div><div class="cell" id="eh-net"><small>💵 أرباح/يوم</small><b>+$0</b></div><div class="cell" id="eh-clock" style="display:none"><small>Y1 M1</small><b>D1 00:00</b></div><button id="eh-pause">⏸</button><button id="eh-speed">1×</button><button id="eh-menu">☰<span id="eh-badge"></span></button>';
    document.body.appendChild(hudEl);
    const sh = document.createElement('div'); sh.id = 'eco-sheet'; sh.innerHTML = '<div class="top"><b>OLI OIL COMPANY</b><button id="es-close">✕</button></div><div id="es-tabs"></div><div id="es-body"></div>'; document.body.appendChild(sh);
    const aw = document.createElement('div'); aw.id = 'eco-away'; aw.innerHTML = '<div class="box"></div>'; document.body.appendChild(aw); const bk = document.createElement('div'); bk.id = 'eco-bank'; bk.innerHTML = '<div class="box"></div>'; bk.style.cssText = 'position:fixed;inset:0;z-index:41;background:rgba(5,8,12,.85);display:none;align-items:center;justify-content:center;padding:14px'; document.body.appendChild(bk);
    const sty = document.createElement('style'); sty.textContent = '#eco-bank.open{display:flex!important}#eco-bank .box{background:var(--panel);border:1px solid #4b5a6b;border-radius:14px;padding:16px;max-width:420px;width:100%}'; document.head.appendChild(sty);
    for (const [k, nm] of SECTIONS) { const b = document.createElement('button'); b.dataset.tab = k; b.textContent = nm; b.onclick = () => { tab = k; subScreen = ''; render(true); $('es-body').scrollTop = 0; }; $('es-tabs').appendChild(b); }
    $('es-body').addEventListener('click', act); $('es-body').addEventListener('input', e => { if (e.target.id === 'sq-in') { sellQ = Math.max(0, +e.target.value || 0); const out = $('sq-out'); if (out) out.innerHTML = sellQuoteHtml(); } });
    $('es-close').onclick = close; $('eh-menu').onclick = () => { open(); }; $('eh-cash').onclick = () => open('company'); $('eh-net').onclick = () => open('company'); $('eh-clock').onclick = () => open('market');
    $('eh-pause').onclick = () => { if (CO.speed === 0) CO.speed = CO.lastSpeed || 1; else { CO.lastSpeed = CO.speed; CO.speed = 0; } hud(); onChange(); };
    $('eh-speed').onclick = () => { const sp = EC.TIME.speeds.filter(x => x > 0), cur = CO.speed || CO.lastSpeed || 1; CO.speed = sp[(sp.indexOf(cur) + 1) % sp.length]; CO.lastSpeed = CO.speed; hud(); onChange(); };
    for (const id of ['eco-hud', 'eco-sheet', 'eco-away']) for (const ev of ['pointerdown', 'touchstart']) $(id).addEventListener(ev, e => e.stopPropagation(), { passive: true });
    timer = setInterval(() => { hud(); pumpEvents(); if ($('eco-sheet').classList.contains('open')) render(false); }, 1000); hud();
    return api;
  }
  const api = { mount, open, close, render: () => render(true), hud, showAway, buildingHtml, spark, state: () => ({ tab, subScreen, repKey, repPer, chartRange, open: $('eco-sheet').classList.contains('open'), sellP, sellQ, range, mkt }), setSell: (p, q) => { sellP = p; sellQ = q; } };
  window.OliEconomyUI = api;
})();
