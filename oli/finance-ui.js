/* Oli - finance-ui.js : the two financial screens of the Company tab - Performance (big chart: revenue / expenses / net) and Cash flow.
 * Pure view of the company's REAL daily financial record (co.finSeries): days, months and years are sums of the same daily rows, nothing is generated.
 * Arabic RTL, mobile first.  Actions: data-act="f..." clicks handled by act().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game-calendar.js'));
  else root.OliFinanceUI = factory(root.OliCalendar);
})(typeof self !== 'undefined' ? self : this, function (CAL) {
  'use strict';
  const REV = '#3ccf7a', EXP = '#5aa9e6', NET = '#f0b429', NEG = '#e5584d', GRID = '#33404f', TXT = '#9aa7b4';
  const FR = { D: 'يومي', M: 'شهري', Y: 'سنوي' }, WIN = { D: 30, M: 12, Y: 10 };
  const st = { frame: 'M', year: null, off: 0, cmp: false, sel: null, csel: null };
  const money = v => (v < 0 ? '−' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
  const axis = v => { const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e9 ? s + (a / 1e9).toFixed(1) + ' مليار' : a >= 1e6 ? s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + ' م' : a >= 1e3 ? s + (a / 1e3).toFixed(0) + ' ألف' : s + Math.round(a); };
  const pad = n => String(n).padStart(2, '0'), cls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
  const btn = (act, v, label, on, extra) => '<button data-act="' + act + '"' + (v != null ? ' data-v="' + v + '"' : '') + ' class="' + (on ? 'on' : '') + '"' + (extra || '') + '>' + label + '</button>';
  const partial = (p, frame) => frame === 'M' ? p.n < CAL.daysInMonth(p.year, p.month) : frame === 'Y' ? p.n < CAL.daysInYear(p.year) : false;
  const dateOf = d => CAL.dateOfDay(d), label = (p, frame) => { if (frame === 'Y') return String(p.year); const d1 = dateOf(p.from); return frame === 'M' ? CAL.MONTHS_AR[p.month - 1] : pad(d1.day) + '/' + pad(d1.month); };
  const full = (p, frame) => { if (frame === 'Y') return 'سنة ' + p.year; if (frame === 'M') return CAL.MONTHS_AR[p.month - 1] + ' ' + p.year; const d = dateOf(p.from); return d.day + ' ' + CAL.MONTHS_AR[d.month - 1] + ' ' + d.year; };
  /* the periods shown: the window of the frame (30 days back from the end, a calendar year of months, all years) */
  function windowOf(co) {
    const all = co.finSeries(st.frame), years = [...new Set(co.finSeries('Y').map(p => p.year))];
    if (st.year == null || (st.frame !== 'D' && !years.includes(st.year))) st.year = years.length ? years[years.length - 1] : null;
    if (st.frame === 'Y') return { all, list: all.slice(-WIN.Y), years };
    if (st.frame === 'M') return { all, list: all.filter(p => p.year === st.year), years };
    const end = Math.max(1, all.length - st.off), from = Math.max(0, end - WIN.D); return { all, list: all.slice(from, end), years, end };
  }
  function chart(list, prev) {
    const W = 360, H = 400, pl = 52, pr = 10, pt = 14, pb = 30; if (!list.length) return '<div class="es-sm" style="padding:30px 0;text-align:center">لا توجد أيام مغلقة بعد — يظهر المنحنى بعد نهاية أول يوم في اللعبة.</div>';
    const vals = []; for (const p of list.concat(prev || [])) vals.push(p.rev, p.exp, p.pro); let hi = Math.max(0, ...vals), lo = Math.min(0, ...vals); const sp = (hi - lo) || 1; hi += sp * 0.06; lo -= lo < 0 ? sp * 0.06 : 0;
    const n = list.length, X = i => pl + (n > 1 ? i * (W - pl - pr) / (n - 1) : (W - pl - pr) / 2), Y = v => pt + (hi - v) / (hi - lo) * (H - pt - pb);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;direction:ltr;touch-action:manipulation" data-f-chart="1">';
    for (let k = 0; k <= 5; k++) { const v = lo + (hi - lo) * k / 5, y = Y(v); s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + GRID + '" stroke-width=".6"/><text x="' + (pl - 4) + '" y="' + (y + 3).toFixed(1) + '" font-size="10" fill="' + TXT + '" text-anchor="end">' + axis(v) + '</text>'; }
    const y0 = Y(0); s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '" stroke="#8ea0b4" stroke-width="1"/>';
    const step = Math.max(1, Math.ceil(n / 7)); list.forEach((p, i) => { if (i % step === 0 || i === n - 1) s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 10) + '" font-size="10" fill="' + TXT + '" text-anchor="middle">' + label(p, st.frame) + '</text>'; });
    const line = (arr, k, col, dash, w) => '<polyline fill="none" stroke="' + col + '" stroke-width="' + w + '"' + (dash ? ' stroke-dasharray="5 4" opacity=".55"' : '') + ' stroke-linejoin="round" points="' + arr.map((p, i) => X(i).toFixed(1) + ',' + Y(p[k]).toFixed(1)).join(' ') + '"/>';
    const part = partial(list[n - 1], st.frame);
    if (prev && prev.length) for (const [k, c] of [['rev', REV], ['exp', EXP], ['pro', NET]]) s += line(prev.slice(0, n), k, c, true, 1.5);
    for (const [k, c] of [['rev', REV], ['exp', EXP], ['pro', NET]]) {
      s += line(part && n > 1 ? list.slice(0, n - 1) : list, k, c, false, 2.4);
      if (part && n > 1) s += '<line x1="' + X(n - 2).toFixed(1) + '" y1="' + Y(list[n - 2][k]).toFixed(1) + '" x2="' + X(n - 1).toFixed(1) + '" y2="' + Y(list[n - 1][k]).toFixed(1) + '" stroke="' + c + '" stroke-width="2.4" stroke-dasharray="4 4"/>';
      if (n <= 40) list.forEach((p, i) => { const open = part && i === n - 1; s += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(p[k]).toFixed(1) + '" r="3" fill="' + (open ? '#0f141a' : c) + '" stroke="' + c + '" stroke-width="1.6"/>'; }); }
    const sel = st.sel != null && st.sel < n ? st.sel : null; if (sel != null) { const x = X(sel); s += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + pt + '" y2="' + (H - pb) + '" stroke="#fff" stroke-width="1" stroke-dasharray="3 3"/>'; for (const [k, c] of [['rev', REV], ['exp', EXP], ['pro', NET]]) s += '<circle cx="' + x.toFixed(1) + '" cy="' + Y(list[sel][k]).toFixed(1) + '" r="5.5" fill="' + c + '" stroke="#fff" stroke-width="1.5"/>'; }
    const bw = (W - pl - pr) / Math.max(1, n - 1); list.forEach((p, i) => { s += '<rect data-act="fsel" data-v="' + i + '" x="' + (X(i) - bw / 2).toFixed(1) + '" y="0" width="' + bw.toFixed(1) + '" height="' + (H - pb) + '" fill="transparent"/>'; });
    return s + '</svg>';
  }
  const tile = (k, v, c) => '<div style="flex:1 1 30%;min-width:96px;background:#1b2530;border-radius:10px;padding:8px 6px;text-align:center"><div class="es-sm">' + k + '</div><b class="' + (c || '') + '" style="font-size:14px">' + v + '</b></div>';
  const legend = '<div style="display:flex;gap:14px;justify-content:center;font-size:12px;margin:2px 0 6px"><span style="color:' + REV + '">● الإيرادات</span><span style="color:' + EXP + '">● المصروفات</span><span style="color:' + NET + '">● صافي الربح</span></div><div class="es-sm" style="text-align:center;margin:-4px 0 6px">القيم بالدولار · الخط المتقطع في آخر الرسم = فترة لم تكتمل بعد</div>';
  function controls(W) {
    let h = '<div class="es-row" style="margin:0 0 6px">' + ['D', 'M', 'Y'].map(k => btn('ffr', k, FR[k], st.frame === k, ' style="flex:1"')).join('') + '</div>';
    if (st.frame === 'M') { const i = W.years.indexOf(st.year); h += '<div class="es-row" style="margin:0 0 6px;align-items:center">' + btn('fyr', -1, '◀', false, i <= 0 ? ' disabled' : '') + '<b style="flex:1;text-align:center">' + (st.year == null ? '—' : st.year) + '</b>' + btn('fyr', 1, '▶', false, i < 0 || i >= W.years.length - 1 ? ' disabled' : '') + btn('fcmp', null, 'قارن بالسنة السابقة', st.cmp, i <= 0 ? ' disabled' : '') + '</div>'; }
    if (st.frame === 'D') h += '<div class="es-row" style="margin:0 0 6px;align-items:center">' + btn('fnav', 'old', '◀ أقدم', false, W.all.length - st.off <= WIN.D ? ' disabled' : '') + '<span style="flex:1"></span>' + btn('fnav', 'new', 'أحدث ▶', false, st.off <= 0 ? ' disabled' : '') + '</div>';
    return h;
  }
  /* screen 1: performance */
  function perf(co) {
    const W = windowOf(co), list = W.list, sum = k => list.reduce((a, p) => a + p[k], 0), last = list.length ? list[list.length - 1] : null, s = co.summary();
    let h = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">' + tile('إجمالي الإيرادات', money(sum('rev')), 'pos') + tile('إجمالي المصروفات', money(sum('exp'))) + tile('صافي الربح / الخسارة', money(sum('pro')), cls(sum('pro'))) + tile('قيمة الأصول', money(s.assets)) + tile('إجمالي الديون', money(s.debt), s.debt > 0 ? 'warn' : '') + '</div>';
    h += '<div class="es-sm" style="margin:-2px 0 8px">الأرقام الثلاثة الأولى لمجموع الفترة المعروضة في الرسم، والأصول والديون الآن.</div>' + controls(W) + legend;
    let prev = null; if (st.frame === 'M' && st.cmp) { prev = W.all.filter(p => p.year === st.year - 1); }
    h += chart(list, prev);
    const sel = st.sel != null ? list[st.sel] : null, p = sel || last;
    if (p) h += '<div style="background:#1b2530;border-radius:10px;padding:8px 10px;margin-top:6px"><div style="display:flex;justify-content:space-between"><b>' + full(p, st.frame) + '</b><span class="es-sm">' + (sel ? 'النقطة المختارة' : 'آخر نقطة — اضغط أي نقطة في الرسم') + '</span></div>' + (partial(p, st.frame) ? '<div class="es-sm" style="color:#f0b429">فترة لم تكتمل: ' + p.n + ' يومًا من ' + (st.frame === 'M' ? CAL.daysInMonth(p.year, p.month) : CAL.daysInYear(p.year)) + '</div>' : '')
      + '<div class="es-kv"><span style="color:' + REV + '">● الإيرادات</span><span dir="ltr">' + money(p.rev) + '</span></div><div class="es-kv"><span style="color:' + EXP + '">● المصروفات</span><span dir="ltr">' + money(p.exp) + '</span></div><div class="es-kv"><span style="color:' + NET + '">● صافي الربح</span><span dir="ltr" class="' + cls(p.pro) + '"><b>' + money(p.pro) + '</b> ' + (p.pro >= 0 ? 'ربح' : 'خسارة') + '</span></div></div>';
    if (st.frame === 'M' && st.cmp && prev && prev.length) { const a = k => prev.reduce((x, q) => x + q[k], 0), b = k => list.reduce((x, q) => x + q[k], 0), row = (t, k) => '<div class="es-kv"><span>' + t + '</span><span dir="ltr">' + money(a(k)) + ' ← ' + money(b(k)) + '</span></div>';
      h += '<div style="background:#1b2530;border-radius:10px;padding:8px 10px;margin-top:6px"><b>' + (st.year - 1) + ' مقابل ' + st.year + '</b>' + row('الإيرادات', 'rev') + row('المصروفات', 'exp') + row('صافي الربح', 'pro') + '<div class="es-sm">الخطوط المتقطعة في الرسم = السنة السابقة.</div></div>'; }
    return h;
  }
  /* screen 2: cash flow */
  function cash(co) {
    const W = windowOf(co), list = W.list, i = st.csel != null && st.csel < list.length ? st.csel : list.length - 1, p = list[i];
    let h = controls(W);
    if (!p) return h + '<div class="es-sm" style="padding:24px 0;text-align:center">لا توجد أيام مغلقة بعد.</div>';
    h += '<div style="background:#1b2530;border-radius:12px;padding:10px 12px"><div style="display:flex;justify-content:space-between"><b>' + full(p, st.frame) + '</b><span class="es-sm">' + p.n + ' يوم</span></div>'
      + '<div class="es-kv"><span>رصيد البداية</span><span dir="ltr"><b>' + money(p.cstart) + '</b></span></div><div class="es-kv"><span>الأموال الداخلة</span><span dir="ltr" class="pos">+' + money(p.cin) + '</span></div><div class="es-kv"><span>الأموال الخارجة</span><span dir="ltr" class="neg">−' + money(p.cout) + '</span></div><div class="es-kv"><span>الرصيد النهائي</span><span dir="ltr"><b>' + money(p.cend) + '</b></span></div>'
      + '<div class="es-sm">البداية + الداخل − الخارج = النهاية (من حركة النقد الفعلية).</div></div>';
    h += '<div style="margin-top:8px">' + list.slice().reverse().map(q => { const k = list.indexOf(q); return '<div data-act="fcs" data-v="' + k + '" style="display:flex;justify-content:space-between;gap:6px;padding:8px 4px;border-top:1px solid ' + GRID + (k === i ? ';background:#1b2530' : '') + ';cursor:pointer"><span>' + full(q, st.frame) + '</span><span dir="ltr"><span class="pos">+' + axis(q.cin) + '</span> <span class="neg">−' + axis(q.cout) + '</span> ← <b>$' + axis(q.cend) + '</b></span></div>'; }).join('') + '</div>';
    return h;
  }
  function act(a, el, co) {
    const v = el && el.dataset ? el.dataset.v : null;
    if (a === 'ffr') { st.frame = v; st.sel = null; st.csel = null; st.off = 0; return true; }
    if (a === 'fyr') { const ys = co.finSeries('Y').map(p => p.year), i = ys.indexOf(st.year) + (+v); if (i >= 0 && i < ys.length) st.year = ys[i]; st.sel = null; st.csel = null; return true; }
    if (a === 'fcmp') { st.cmp = !st.cmp; return true; }
    if (a === 'fnav') { const n = co.finSeries('D').length, step = WIN.D; st.off = Math.max(0, Math.min(Math.max(0, n - WIN.D), st.off + (v === 'old' ? step : -step))); st.sel = null; st.csel = null; return true; }
    if (a === 'fsel') { st.sel = +v; return true; }
    if (a === 'fcs') { st.csel = +v; return true; }
    return false;
  }
  return { perf, cash, act, ACTS: ['ffr', 'fyr', 'fcmp', 'fnav', 'fsel', 'fcs'], state: st, chart, money };
});
