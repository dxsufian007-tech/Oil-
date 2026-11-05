/* Oli - brent-ui.js : the Japanese-candlestick chart of the historical Brent market (SVG, no libraries, Arabic).
 * Pure view: it reads OliBrentMarket (candles / periods) and the company's market (position, price); it owns only its view state (frame, window, selection, comparison).
 * Used by economy-ui.js (Market tab, CRUDE) - actions are data-act="b..." clicks handled by act().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./brent-market.js'));
  else root.OliBrentUI = factory(root.OliBrentMarket);
})(typeof self !== 'undefined' ? self : this, function (BM) {
  'use strict';
  const G = typeof self !== 'undefined' ? self : globalThis; const UP = '#3ccf7a', DN = '#e5584d', GRID = '#33404f', TXT = '#9aa7b4';
  const SPAN = { D: 90, W: 104, M: 120, Y: 27 }, YSPAN = { D: 260, W: 53, M: 12, Y: 27 }, FR_AR = BM.FRAMES, YEARS = []; for (let y = +BM.FIRST.slice(0, 4); y <= +BM.LAST.slice(0, 4); y++) YEARS.push(y);
  const st = { src: 'official', frame: 'M', mode: 'live', anchor: null, span: SPAN.M, sel: null, a: 2008, b: 2020 };
  const f2 = v => (+v).toFixed(2), pc = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
  const view = co => {                                                       // the candles to draw: up to the market 'now' (live) or anywhere in the record (browse)
    const w = co && co.market.historical() ? co.market.where(co.hours - 1 < 0 ? 0 : co.hours - 1) : null, nowNum = w ? w.dayNum : null;
    const gameRows = co && co.market.gc ? co.market.gc.filter(g => g.cy === (w ? w.cycle : 1)).map(g => ({ d: g.d, o: g.o, h: g.h, l: g.l, c: g.c })) : [];
    const all = st.src === 'game' ? BM.groupOHLC(gameRows, st.frame) : st.mode === 'live' && nowNum != null ? BM.candles(st.frame, { upto: nowNum }) : BM.candles(st.frame);
    let end = all.length; if (st.mode === 'browse' && st.anchor) { end = all.filter(c => c.start <= st.anchor).length; }
    const from = Math.max(0, end - st.span); return { all, list: all.slice(from, end), from, end, w };
  };
  function chart(list, w, co) {
    const W = 340, H = 230, pl = 6, pr = 44, pt = 10, pb = 22; if (!list.length) return '<div class="es-sm">لا توجد شموع في هذه الفترة.</div>';
    let hi = Math.max.apply(null, list.map(c => c.h)), lo = Math.min.apply(null, list.map(c => c.l)); const gp = co && w ? co.market.price.CRUDE : null; if (gp != null && w && list[0].start <= w.recordDate && list[list.length - 1].end >= w.recordDate) { hi = Math.max(hi, gp); lo = Math.min(lo, gp); }
    const pad = (hi - lo) * 0.06 || 1; hi += pad; lo = Math.max(0, lo - pad); const X = i => pl + (i + 0.5) * (W - pl - pr) / list.length, Y = v => pt + (hi - v) / (hi - lo) * (H - pt - pb), bw = Math.max(1, Math.min(14, (W - pl - pr) / list.length * 0.7));
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;direction:ltr;touch-action:manipulation" data-brent-chart="1">';
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, y = Y(v); s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + GRID + '" stroke-width=".5"/><text x="' + (W - pr + 3) + '" y="' + (y + 3).toFixed(1) + '" font-size="9" fill="' + TXT + '">' + v.toFixed(v >= 100 ? 0 : 1) + '</text>'; }
    list.forEach((c, i) => { const x = X(i), up = c.c >= c.o, col = up ? UP : DN, yo = Y(c.o), yc = Y(c.c), top = Math.min(yo, yc), hh = Math.max(1, Math.abs(yo - yc)), sel = st.sel === c.key;
      s += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + Y(c.h).toFixed(1) + '" y2="' + Y(c.l).toFixed(1) + '" stroke="' + col + '" stroke-width="1"/><rect x="' + (x - bw / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" fill="' + col + '"' + (sel ? ' stroke="#fff" stroke-width="1"' : '') + '/>'
        + '<rect data-act="bsel" data-v="' + c.key + '" x="' + (x - (W - pl - pr) / list.length / 2).toFixed(1) + '" y="0" width="' + ((W - pl - pr) / list.length).toFixed(1) + '" height="' + (H - pb) + '" fill="transparent"/>'; });
    const lab = i => list[i].start; s += '<text x="' + pl + '" y="' + (H - 7) + '" font-size="9" fill="' + TXT + '">' + lab(0) + '</text><text x="' + (W - pr) + '" y="' + (H - 7) + '" font-size="9" fill="' + TXT + '" text-anchor="end">' + list[list.length - 1].end + '</text>';
    if (w && gp != null && list[0].start <= w.recordDate && list[list.length - 1].end >= w.recordDate) { const y = Y(gp); s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#f0b429" stroke-width="1" stroke-dasharray="3 3"/><text x="' + (W - pr + 3) + '" y="' + (y - 2).toFixed(1) + '" font-size="9" fill="#f0b429" font-weight="700">' + gp.toFixed(2) + '</text>'; }
    return s + '</svg>';
  }
  const btn = (act, v, label, on, extra) => '<button data-act="' + act + '"' + (v != null ? ' data-v="' + v + '"' : '') + ' class="' + (on ? 'on' : '') + '"' + (extra || '') + '>' + label + '</button>';
  function detail(c, prev) {
    if (!c) return ''; const ch = c.c / c.o - 1;
    return '<div class="es-kv"><span>الفترة</span><span dir="ltr">' + c.start + (c.end !== c.start ? ' → ' + c.end : '') + ' · ' + c.n + ' يوم تداول</span></div><div class="es-kv"><span>الافتتاح · الإغلاق</span><span dir="ltr">' + f2(c.o) + ' · ' + f2(c.c) + ' <b style="color:' + (ch >= 0 ? UP : DN) + '">' + pc(ch) + '</b></span></div>'
      + '<div class="es-kv"><span>الأعلى · الأدنى</span><span dir="ltr">' + f2(c.h) + ' · ' + f2(c.l) + '</span></div><div class="es-kv"><span>حجم التداول</span><span>غير متوفر في المصدر الرسمي</span></div>';
  }
  function compare() {
    const A = BM.period(st.a + '-01-01', st.a + '-12-31'), B = BM.period(st.b + '-01-01', st.b + '-12-31'), row = (k, f) => '<div class="es-kv"><span>' + k + '</span><span dir="ltr">' + f(A) + ' | ' + f(B) + '</span></div>';
    // normalised overlay: both periods rebased to 100 at their first close
    const ser = p => { if (!p) return []; const rows = BM.candles('D', { from: p.from, to: p.to }); const b = rows[0].c; return rows.map(c => c.c / b * 100); }, sa = ser(A), sb = ser(B), all = sa.concat(sb), mn = Math.min.apply(null, all), mx = Math.max.apply(null, all), H = 110, Wd = 320;
    const path = (s, col) => '<path d="' + s.map((v, i) => (i ? 'L' : 'M') + (6 + i * (Wd - 12) / Math.max(1, s.length - 1)).toFixed(1) + ' ' + (6 + (mx - v) / ((mx - mn) || 1) * (H - 12)).toFixed(1)).join(' ') + '" fill="none" stroke="' + col + '" stroke-width="1.6"/>';
    const yr = (k, v) => '<span style="display:inline-flex;gap:4px;align-items:center">' + btn('bcmp-', k, '◀') + '<b dir="ltr">' + v + '</b>' + btn('bcmp+', k, '▶') + '</span>';
    return '<div class="es-card" data-brent="compare"><h5>مقارنة فترتين تاريخيتين</h5><div class="es-row" style="justify-content:space-between"><span style="color:#5aa9e6">● ' + yr('a', st.a) + '</span><span style="color:#f0b429">● ' + yr('b', st.b) + '</span></div>'
      + '<svg viewBox="0 0 ' + Wd + ' ' + H + '" width="100%" style="display:block;direction:ltr">' + path(sa, '#5aa9e6') + path(sb, '#f0b429') + '</svg><div class="es-sm">كل فترة مضبوطة على 100 عند أول إغلاق لها.</div>'
      + (A && B ? row('أول إغلاق', p => f2(p.first)) + row('آخر إغلاق', p => f2(p.last)) + row('التغير', p => pc(p.change)) + row('الأعلى', p => f2(p.high)) + row('الأدنى', p => f2(p.low)) + row('المتوسط', p => f2(p.avg)) + row('أيام التداول', p => p.days) : '') + '</div>';
  }
  const fm = v => (+v).toLocaleString('en-US', { maximumFractionDigits: 0 }), p1 = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
  function worldHtml(co) {
    const wd = co && co.market.world; if (!wd) return ''; const v = wd.view(), d = v.drivers, bq = co.bq || 0, ownHeld = Math.max(0, (co.crudeOnHand ? co.crudeOnHand() : 0) - bq);
    const row = (k, val, c) => '<div class="es-kv"><span>' + k + '</span><span dir="ltr"' + (c ? ' style="color:' + c + '"' : '') + '>' + val + '</span></div>', pcol = x => x > 0.0005 ? DN : x < -0.0005 ? UP : null;
    return '<div class="es-card" data-brent="world"><h5>المخزون العالمي والنفط المحبوس</h5>'
      + row('المخزون التجاري المعروض للبيع', fm(v.C) + ' مليون برميل · ' + (v.cover * 100).toFixed(1) + '% من الطبيعي') + row('المتوسط التاريخي (سنة) · يغطي الاستهلاك', fm(v.avg) + ' · ' + v.coverDays.toFixed(1) + ' يوم')
      + row('النفط المحبوس خارج السوق', fm(v.H) + ' مليون برميل · ' + (v.hoardShare * 100).toFixed(1) + '% من المخزون · متوسط مدة الحبس ' + fm(v.hoardAge) + ' يوم') + row('الاحتياطي الاستراتيجي (غير معروض)', fm(v.R) + ' مليون برميل')
      + row('الإنتاج · الاستهلاك اليومي · الصافي', v.flow.P.toFixed(1) + ' · ' + v.flow.D.toFixed(1) + ' · ' + (v.flow.net >= 0 ? '+' : '') + v.flow.net.toFixed(2) + ' مليون برميل/يوم') + row('المرحلة الاقتصادية', v.phaseAr)
      + '<div class="es-sm" style="margin-top:6px"><b>ما الذي يحدد السعر الآن؟</b> سعر السوق = إغلاق برنت الرسمي لليوم × (1 + الانحراف). الانحراف يتجه نحو هدف يجمع:</div>'
      + row('أثر المخزون التجاري (قلة المعروض = أغلى)', p1(d.inv), pcol(d.inv)) + row('أثر الأخبار الجارية', p1(d.news), pcol(d.news)) + row('أثر المرحلة الاقتصادية', p1(d.phase), pcol(d.phase)) + row('الانحراف الحالي عن إغلاق برنت', p1(Math.exp(v.x) - 1), pcol(v.x))
      + '<div class="es-sm" style="margin-top:6px">شركتك: ' + fm(bq) + ' برميل مشترى محتفظ به + ' + fm(ownHeld) + ' برميل من إنتاجك = ' + (((bq + ownHeld) / 1e6) / v.C * 100).toFixed(4) + '% من المخزون التجاري العالمي. النفط الذي تشتريه يخرج من المخزون المعروض، وما تبيعه يعود إليه، فلا يُحسب البرميل مرتين.</div></div>';
  }
  function newsHtml(co) {
    const wd = co && co.market.world; if (!wd) return ''; const v = wd.view(), CATS = (G.OliNews || {}).CATS || {}, log = wd.log.slice(-12).reverse();
    const sgn = (n) => n > 0.0005 ? '▲' : n < -0.0005 ? '▼' : '●';
    return '<div class="es-card" data-brent="news"><h5>أخبار السوق (' + (G.OliNews ? G.OliNews.COUNT : 100) + ' خبرًا محتملًا)</h5>'
      + (v.active.length ? v.active.map(a => '<div class="es-sm">⚡ ' + a.text + ' <span style="color:' + TXT + '">· ' + (CATS[a.cat] || '') + ' · يتبقى ' + a.left + ' يوم · قوة التأثير ' + Math.round(a.f * 100) + '%</span></div>').join('') + '<div class="es-sm"><b>صافي الأخبار:</b> الإمداد ' + (v.news.sup >= 0 ? '+' : '') + v.news.sup.toFixed(2) + ' · الطلب ' + (v.news.dem >= 0 ? '+' : '') + v.news.dem.toFixed(2) + ' مليون برميل/يوم · علاوة المخاطر ' + p1(v.news.sent) + '</div>' : '<div class="es-sm">لا توجد أخبار مؤثرة الآن.</div>')
      + (log.length ? '<div class="es-sm" style="margin-top:6px"><b>سجل الأخبار التي ظهرت:</b></div>' + log.map(e => '<div class="es-sm" dir="rtl"><span dir="ltr" style="color:' + TXT + '">' + (e.date || '') + '</span> ' + e.text + '</div>').join('') : '') + '</div>';
  }
  function html(co) {
    const v = view(co), w = v.w, b = co && co.market.brent, list = v.list, c = list.find(x => x.key === st.sel) || list[list.length - 1];
    const gp = co ? co.market.price.CRUDE : null, ref = b ? b.ref : null, adj = b && b.adj != null ? b.adj : 1;
    let h = '<div class="es-card" data-brent="main"><h5>برنت الخام · السوق التاريخي</h5>';
    if (b) h += '<div class="es-kv"><span>تاريخ اللعبة</span><span dir="ltr">' + co.clock().text.slice(0, 10) + '</span></div><div class="es-kv"><span>تاريخ السوق التاريخي · الدورة</span><span dir="ltr"><b>' + b.date + '</b> · الدورة ' + b.cycle + (b.trading ? '' : ' · السوق مغلق (آخر إغلاق ' + b.recordDate + ')') + '</span></div>'
      + '<div class="es-kv"><span>سعر السوق المُستخدم في الشراء والبيع</span><span dir="ltr"><b>$' + f2(gp) + '</b></span></div><div class="es-kv"><span>إغلاق برنت الرسمي لهذا اليوم</span><span dir="ltr">$' + f2(ref) + (Math.abs(adj - 1) > 0.0005 ? ' <span style="color:#f0b429">(تأثير مبيعاتك/المخزون ' + pc(adj - 1) + ')</span>' : '') + '</span></div>';
    if (co && co.market.gc) h += '<div class="es-row" style="margin:6px 0 0">' + btn('bsrc', 'official', 'برنت التاريخي الرسمي', st.src === 'official') + btn('bsrc', 'game', 'سعر اللعبة (للتداول)', st.src === 'game') + '</div>';
    h += '<div class="es-row" style="margin:6px 0">' + ['D', 'W', 'M', 'Y'].map(k => btn('bframe', k, FR_AR[k], st.frame === k)).join('') + '</div>';
    h += '<div class="es-row" style="margin:0 0 6px">' + btn('bmode', 'live', 'حتى اليوم', st.mode === 'live') + btn('bmode', 'browse', 'كل السجل', st.mode === 'browse') + btn('bnav', 'back', '◀◀') + btn('bnav', 'prev', '◀') + btn('bnav', 'next', '▶') + btn('bnav', 'fwd', '▶▶') + btn('bzoom', 'in', '＋') + btn('bzoom', 'out', '－') + '</div>';
    h += '<div style="display:flex;gap:4px;overflow-x:auto;padding:2px 0 6px;direction:ltr">' + YEARS.map(y => btn('byear', y, y, false, ' style="flex:0 0 auto;padding:3px 7px;font-size:11px"')).join('') + '</div>';
    h += chart(list, w, co) + '<div class="es-sm" style="margin:4px 0">' + FR_AR[st.frame] + ' · ' + list.length + ' شمعة · <span style="color:' + UP + '">■</span> صاعدة <span style="color:' + DN + '">■</span> هابطة · الخط الذهبي = سعر السوق الحالي</div>';
    h += '<div data-brent="detail">' + detail(c) + '</div>';
    if (st.src === 'game') h += '<div class="es-sm">شموع سعر اللعبة: الافتتاح والأعلى والأدنى والإغلاق من حركة السعر الفعلية كل ساعة لعبة، وهو السعر نفسه الذي تشتري وتبيع به.</div>';
    h += '<div class="es-sm">الشموع مبنية من الإغلاقات اليومية الرسمية فقط لإدارة معلومات الطاقة الأمريكية (المصدر لا يوفر افتتاحًا ولا أعلى ولا أدنى ولا حجم تداول): الإغلاق = آخر إغلاق في الفترة، الافتتاح = إغلاق الفترة السابقة، الأعلى والأدنى = أعلى وأدنى إغلاق. أيام العطل بلا شموع ولا أسعار مختلقة.</div></div>';
    return h + worldHtml(co) + newsHtml(co) + compare();
  }
  /* actions: returns true when the view must be redrawn */
  function act(a, el, co) {
    const v = el && el.dataset ? el.dataset.v : null, V = view(co);
    if (a === 'bsrc') { st.src = v; st.sel = null; return true; }
    if (a === 'bframe') { st.frame = v; st.span = SPAN[v]; st.sel = null; if (st.mode === 'browse' && !st.anchor) st.anchor = BM.LAST; return true; }
    if (a === 'bmode') { st.mode = v; st.sel = null; if (v === 'browse') st.anchor = BM.LAST; return true; }
    if (a === 'bnav') { const all = BM.candles(st.frame), cur = st.mode === 'browse' && st.anchor ? all.filter(c => c.start <= st.anchor).length : (V.end), step = v === 'back' || v === 'fwd' ? st.span : Math.max(1, Math.round(st.span / 4)), to = Math.min(all.length, Math.max(1, cur + (v === 'back' || v === 'prev' ? -step : step)));
      st.mode = 'browse'; st.anchor = all[to - 1].start; st.sel = null; return true; }
    if (a === 'bzoom') { st.span = Math.max(8, Math.min(v === 'in' ? Math.round(st.span / 1.5) : Math.round(st.span * 1.5), BM.candles(st.frame).length)); return true; }
    if (a === 'byear') { st.mode = 'browse'; st.anchor = v + '-12-31'; st.span = YSPAN[st.frame]; if (st.frame === 'Y') st.anchor = BM.LAST; st.sel = null; return true; }
    if (a === 'bsel') { st.sel = v; return true; }
    if (a === 'bcmp-' || a === 'bcmp+') { const k = v, d = a === 'bcmp+' ? 1 : -1; st[k] = Math.max(YEARS[0], Math.min(YEARS[YEARS.length - 1], st[k] + d)); return true; }
    return false;
  }
  const ACTS = ['bsrc', 'bframe', 'bmode', 'bnav', 'bzoom', 'byear', 'bsel', 'bcmp-', 'bcmp+'];
  return { html, act, ACTS, state: st, view, chart, worldHtml, newsHtml };
});
