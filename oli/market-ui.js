/* Oli - market-ui.js : the oil market screen (Brent crude | oil products), Arabic RTL, mobile first.
 * Pure view of the company's market: it reads the Oil Market Engine (engine.view / log / prod) and the game's own candles (market.gc);
 * it owns only its view state.  Used by economy-ui.js (Market tab); actions are data-act="mk..." clicks handled by act().
 * Reading order (five seconds): price card -> candlestick chart -> last 3 news -> three indicators -> trade buttons -> (advanced details).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./oil-engine.js'), require('./news-data.js'));
  else root.OliMarketUI = factory(root.OliOilEngine, root.OliNews);
})(typeof self !== 'undefined' ? self : this, function (OE, NEWS) {
  'use strict';
  const UP = '#3ccf7a', DN = '#e5584d', GRID = '#33404f', TXT = '#9aa7b4', GOLD = '#f0b429';
  const FR = { D: 'يومي', W: 'أسبوعي', M: 'شهري', Y: 'سنوي' }, SPAN = { D: 60, W: 52, M: 24, Y: 6 }, PO = ['GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS', 'BYPRODUCT'];
  const NAME = { CRUDE: 'خام برنت', GASOLINE: 'البنزين', DIESEL: 'الديزل', JET_FUEL: 'وقود الطائرات', GAS: 'الغاز المسال', BYPRODUCT: 'المنتجات الثانوية' };
  const LV = { LOW: 'منخفض', NORMAL: 'طبيعي', HIGH: 'مرتفع' }, DIRA = { UP: '▲ صعود', DOWN: '▼ هبوط', NEUTRAL: '● محايد' }, POW = { STRONG: 'قوي', MEDIUM: 'متوسط', WEAK: 'ضعيف' }, ST = { active: 'نشط', ended: 'انتهى' };
  const st = { sec: 'brent', prod: 'GASOLINE', frame: 'D', span: SPAN.D, off: 0, sel: null, log: false, more: false };
  const f2 = v => (+v).toFixed(2), pc = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%', fm = v => (+v).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const col = v => v > 0.00005 ? UP : v < -0.00005 ? DN : TXT, ar = v => v > 0.00005 ? '▲' : v < -0.00005 ? '▼' : '●';
  const btn = (act, v, label, on, extra) => '<button data-act="' + act + '"' + (v != null ? ' data-v="' + v + '"' : '') + ' class="' + (on ? 'on' : '') + '"' + (extra || '') + '>' + label + '</button>';
  const sym = () => st.sec === 'brent' ? 'CRUDE' : st.prod;
  /* candles of the game's own price for the shown item, grouped D / W / M / Y, windowed by (span, off) */
  function view(co, p) {
    p = p || sym(); const rows = co && co.market.gc ? (co.market.gc[p] || []) : [], all = OE.groupOHLC(rows, st.frame);
    const end = Math.max(1, all.length - st.off), from = Math.max(0, end - st.span); return { all, list: all.slice(from, end), end };
  }
  function chart(list, now) {
    const W = 340, H = 230, pl = 6, pr = 44, pt = 10, pb = 22; if (!list.length) return '<div class="es-sm">لا توجد شموع في هذه الفترة.</div>';
    let hi = Math.max.apply(null, list.map(c => c.h)), lo = Math.min.apply(null, list.map(c => c.l)); if (now != null) { hi = Math.max(hi, now); lo = Math.min(lo, now); }
    const pad = (hi - lo) * 0.06 || 1; hi += pad; lo = Math.max(0, lo - pad); const X = i => pl + (i + 0.5) * (W - pl - pr) / list.length, Y = v => pt + (hi - v) / (hi - lo) * (H - pt - pb), bw = Math.max(1, Math.min(14, (W - pl - pr) / list.length * 0.7));
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;direction:ltr;touch-action:manipulation" data-mk-chart="1">';
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, y = Y(v); s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + GRID + '" stroke-width=".5"/><text x="' + (W - pr + 3) + '" y="' + (y + 3).toFixed(1) + '" font-size="9" fill="' + TXT + '">' + v.toFixed(v < 100 ? 1 : 0) + '</text>'; }
    list.forEach((c, i) => { const x = X(i), up = c.c >= c.o, cc = up ? UP : DN, yo = Y(c.o), yc = Y(c.c), top = Math.min(yo, yc), hh = Math.max(1, Math.abs(yo - yc)), sel = st.sel === c.key;
      s += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + Y(c.h).toFixed(1) + '" y2="' + Y(c.l).toFixed(1) + '" stroke="' + cc + '" stroke-width="1"/><rect x="' + (x - bw / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" fill="' + cc + '"' + (sel ? ' stroke="#fff" stroke-width="1"' : '') + '/>'
        + '<rect data-act="mkSel" data-v="' + c.key + '" x="' + (x - (W - pl - pr) / list.length / 2).toFixed(1) + '" y="0" width="' + ((W - pl - pr) / list.length).toFixed(1) + '" height="' + (H - pb) + '" fill="transparent"/>'; });
    s += '<text x="' + pl + '" y="' + (H - 7) + '" font-size="9" fill="' + TXT + '">' + list[0].start + '</text><text x="' + (W - pr) + '" y="' + (H - 7) + '" font-size="9" fill="' + TXT + '" text-anchor="end">' + list[list.length - 1].end + '</text>';
    if (now != null) { const y = Y(now); s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + GOLD + '" stroke-width="1" stroke-dasharray="3 3"/><text x="' + (W - pr + 3) + '" y="' + (y - 2).toFixed(1) + '" font-size="9" fill="' + GOLD + '">' + now.toFixed(1) + '</text>'; }
    return s + '</svg>';
  }
  /* 24 h change of an item (price now against 24 hours ago) */
  function chg(co, p) { const h = co.market.hist[p] || [], now = co.market.price[p], ref = h.length > 24 ? h[h.length - 25] : now; return { d: now - ref, r: ref > 0 ? now / ref - 1 : 0 }; }
  function priceCard(co, p) {
    const c = chg(co, p), e = co.market.engine;
    return '<div class="es-card" data-mk="price"><div style="display:flex;justify-content:space-between;align-items:baseline"><h5 style="margin:0">' + NAME[p] + '</h5><span class="es-sm" style="color:' + col(c.r) + '">' + ar(c.r) + ' ' + (c.r > 0.00005 ? 'صاعد' : c.r < -0.00005 ? 'هابط' : 'مستقر') + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:4px"><b style="font-size:30px" dir="ltr">$' + f2(co.market.price[p]) + '</b><span dir="ltr" style="color:' + col(c.r) + ';font-size:14px">' + (c.d >= 0 ? '+' : '') + f2(c.d) + ' · ' + pc(c.r) + '</span></div>'
      + '<div class="es-sm">التغير خلال 24 ساعة · هذا هو سعر الشراء والبيع نفسه' + (e ? ' · حالة السوق: <b>' + e.view().regimeAr + '</b>' : '') + '</div></div>';
  }
  function chartCard(co, p) {
    const v = view(co, p), list = v.list, c = list.find(x => x.key === st.sel) || list[list.length - 1];
    let h = '<div class="es-card" data-mk="chart"><div class="es-row" style="margin:0 0 6px">' + ['D', 'W', 'M', 'Y'].map(k => btn('mkFrame', k, FR[k], st.frame === k)).join('') + '<span style="flex:1"></span>' + btn('mkNav', 'old', '◀') + btn('mkNav', 'new', '▶') + btn('mkZoom', 'in', '＋') + btn('mkZoom', 'out', '－') + '</div>';
    h += chart(list, co.market.price[p]);
    if (c) { const ch = c.c / c.o - 1; h += '<div class="es-sm" dir="ltr" style="text-align:center;margin-top:4px">' + c.start + (c.end !== c.start ? ' → ' + c.end : '') + ' · فتح ' + f2(c.o) + ' · أعلى ' + f2(c.h) + ' · أدنى ' + f2(c.l) + ' · إغلاق ' + f2(c.c) + ' <b style="color:' + col(ch) + '">' + pc(ch) + '</b></div><div class="es-sm" style="text-align:center">حجم التداول: ' + fm(c.v) + ' مليون برميل (مجموع أيام الشمعة)</div>'; }
    return h + '<div class="es-sm">' + FR[st.frame] + ' · ' + list.length + ' شمعة · <span style="color:' + UP + '">■</span> صاعدة <span style="color:' + DN + '">■</span> هابطة · الخط الذهبي = السعر الحالي</div></div>';
  }
  /* the last 3 news: short title, short description, effect and arrow; the whole log on demand */
  function newsCard(co, p) {
    const e = co.market.engine; if (!e) return ''; const log = e.log.slice().reverse().filter(n => p === 'CRUDE' || affects(n, p)), shown = st.log ? log.slice(0, 40) : log.slice(0, 3);
    const item = n => '<div style="padding:6px 0;border-top:1px solid ' + GRID + '"><div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:13px">' + n.text + '</b><span style="white-space:nowrap;color:' + (n.dir === 'UP' ? UP : n.dir === 'DOWN' ? DN : TXT) + '">' + DIRA[n.dir] + '</span></div>'
      + '<div class="es-sm">' + n.desc + '</div><div class="es-sm" style="color:' + TXT + '">التأثير: ' + POW[n.power] + ' · ' + ST[n.status] + ' · ' + (n.date || '') + '</div></div>';
    return '<div class="es-card" data-mk="news"><h5>آخر الأخبار' + (p !== 'CRUDE' ? ' المؤثرة على ' + NAME[p] : '') + '</h5>' + (shown.length ? shown.map(item).join('') : '<div class="es-sm">لا أخبار مؤثرة حتى الآن.</div>') + (log.length > 3 ? '<div class="es-row" style="margin-top:6px">' + btn('mkLog', null, st.log ? 'إخفاء السجل' : 'السجل الكامل (' + log.length + ')', st.log) + '</div>' : '') + '</div>';
  }
  /* does a news item act on this product more than on the rest of the market? */
  function affects(n, p) { const e = NEWS.EVENTS.find(x => x.id === n.id); return !!e && ((e.pd && e.pd[p] >= 2) || (e.ps && e.ps[p]) || (e.rc && p !== 'BYPRODUCT')); }
  function indicators(co, p) {
    const e = co.market.engine; if (!e) return ''; let sup, dem, stk;
    if (p === 'CRUDE') { const v = e.view().levels; sup = v.supply; dem = v.demand; stk = v.stock; } else { const s = e.prod[p], d = OE.PRODUCTS[p]; sup = e.level(s.sup / (d.dem * (1 - e.rcOut * 0 + 0))); dem = e.level(s.dem / d.dem); stk = e.level(s.S / (d.dem * e.P.prodDays)); }
    const chip = (k, lv) => '<div style="flex:1;text-align:center;padding:8px 4px;border-radius:10px;background:#1b2530"><div class="es-sm">' + k + '</div><b style="color:' + (lv === 'NORMAL' ? '#cfd8e0' : lv === 'HIGH' ? GOLD : '#5aa9e6') + '">' + LV[lv] + '</b></div>';
    return '<div class="es-card" data-mk="ind"><div style="display:flex;gap:6px">' + chip('العرض', sup) + chip('الطلب', dem) + chip('المخزون العالمي', stk) + '</div></div>';
  }
  function tradeCard(p) {
    return '<div class="es-card" data-mk="trade"><div style="display:flex;gap:6px">' + (p === 'CRUDE' ? btn('mkGo', 'buy', 'شراء النفط', false, ' style="flex:1"') : '') + btn('mkGo', 'sell:' + p, p === 'CRUDE' ? 'بيع النفط' : 'بيع ' + NAME[p], false, ' style="flex:1"') + btn('mkGo', 'storage', 'التخزين', false, ' style="flex:1"') + '</div></div>';
  }
  function moreCard(co) {
    const e = co.market.engine, v = e.view(), d = v.drivers, bq = co.bq || 0, ownHeld = Math.max(0, (co.crudeOnHand ? co.crudeOnHand() : 0) - bq);
    const row = (k, val, c) => '<div class="es-kv"><span>' + k + '</span><span dir="ltr"' + (c ? ' style="color:' + c + '"' : '') + '>' + val + '</span></div>', p1 = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%', pcol = x => x > 0.0005 ? DN : x < -0.0005 ? UP : null;
    let h = '<div class="es-card" data-mk="more"><div class="es-row" style="margin:0">' + btn('mkMore', null, st.more ? 'إخفاء التفاصيل المتقدمة' : 'تفاصيل متقدمة', st.more, ' style="flex:1"') + '</div>';
    if (st.more) {
      h += '<h5 style="margin-top:10px">المخزون العالمي</h5>' + row('مخزون تجاري معروض للبيع', fm(v.C) + ' مليون برميل · ' + (v.cover * 100).toFixed(1) + '%') + row('يغطي الاستهلاك', v.coverDays.toFixed(1) + ' يوم') + row('نفط محبوس خارج السوق', fm(v.H) + ' مليون · ' + (v.hoardShare * 100).toFixed(1) + '% · متوسط مدة الحبس ' + fm(v.hoardAge) + ' يوم') + row('الاحتياطي الاستراتيجي (منفصل)', fm(v.R) + ' مليون برميل');
      h += '<h5 style="margin-top:10px">الإمداد والطلب اليومي</h5>' + row('الإنتاج · الاستهلاك · الصافي', v.flow.P.toFixed(1) + ' · ' + v.flow.D.toFixed(1) + ' · ' + (v.flow.net >= 0 ? '+' : '') + v.flow.net.toFixed(2) + ' مليون برميل/يوم') + v.groups.map(g => row(g.ar, g.out.toFixed(1) + ' من ' + g.cap.toFixed(0) + ' · تشغيل ' + (g.util * 100).toFixed(0) + '%' + (g.outage > 0.005 ? ' · انقطاع ' + (g.outage * 100).toFixed(0) + '%' : ''))).join('') + row('حصة أوبك+ الحالية', (v.quota * 100).toFixed(0) + '%') + row('طاقة التكرير المعطلة', (v.rcOut * 100).toFixed(1) + '%');
      h += '<h5 style="margin-top:10px">ما الذي يحدد السعر الآن؟</h5>' + row('أثر المخزون (قلة المعروض = أغلى)', p1(d.inv), pcol(d.inv)) + row('فجوة العرض والطلب', p1(d.gap), pcol(d.gap)) + row('أثر الأخبار الجارية', p1(d.news), pcol(d.news)) + row('أثر حالة السوق', p1(d.regime), pcol(d.regime)) + row('الهدف · الانحراف الحالي', p1(d.target) + ' · ' + p1(v.x));
      h += '<h5 style="margin-top:10px">شركتك</h5><div class="es-sm">' + fm(bq) + ' برميل مشترى محتفظ به + ' + fm(ownHeld) + ' برميل من إنتاجك = ' + (((bq + ownHeld) / 1e6) / v.C * 100).toFixed(4) + '% من المخزون التجاري العالمي. ما تشتريه يخرج من المخزون المعروض فيرتفع السعر قليلًا، وما تبيعه يعود إليه، وأثرك يتناسب مع حجمك أمام حجم السوق.</div>';
    }
    return h + '</div>';
  }
  function productsList(co) {
    const e = co.market.engine, v = e.view(), rows = PO.map(p => { const c = chg(co, p); return { p, c, price: co.market.price[p] }; }).sort((a, b) => b.price - a.price);
    return '<div class="es-card" data-mk="plist"><h5>المنتجات النفطية · مرتبة حسب السعر</h5>' + rows.map(r => {
      const ns = e.log.slice().reverse().filter(n => n.status === 'active' && affects(n, r.p)).slice(0, 1)[0];
      return '<div data-act="mkProd" data-v="' + r.p + '" style="padding:8px 0;border-top:1px solid ' + GRID + ';cursor:pointer' + (r.p === st.prod ? ';background:#1b2530' : '') + '"><div style="display:flex;justify-content:space-between;align-items:baseline"><b>' + NAME[r.p] + '</b><span dir="ltr"><b>$' + f2(r.price) + '</b> <span style="color:' + col(r.c.r) + '">' + ar(r.c.r) + ' ' + pc(r.c.r) + '</span></span></div>'
        + '<div class="es-sm" style="color:' + TXT + '">' + (ns ? 'خبر مؤثر: ' + ns.text : 'لا خبر مؤثر الآن') + '</div></div>'; }).join('') + '<div class="es-sm">اضغط على منتج لعرض شموعه وأخباره ومؤشراته. أسعار المنتجات مرتبطة بالخام لكنها لا تتحرك بالنسبة نفسها.</div></div>';
  }
  function prodCosts(co, p) {
    const e = co.market.engine, d = OE.PRODUCTS[p], pr = co.market.price[p], cr = co.market.price.CRUDE, s = e.prod[p], row = (k, val) => '<div class="es-kv"><span>' + k + '</span><span dir="ltr">' + val + '</span></div>';
    return '<div class="es-card" data-mk="pcost"><h5>اقتصاد ' + NAME[p] + '</h5>' + row('هامش فوق الخام', (pr - cr >= 0 ? '+' : '') + f2(pr - cr)) + (d.floor ? row('أدنى سعر يغطي التكرير والنقل والتخزين', f2(cr + e.P.costFloor * Math.max(0.5, e.cost.energy))) : '') + row('مخزون المنتج', fm(s.S) + ' مليون برميل · ' + (s.S / (d.dem * e.P.prodDays) * 100).toFixed(0) + '% من الطبيعي') + row('الإمداد · الطلب', s.sup.toFixed(1) + ' · ' + s.dem.toFixed(1) + ' مليون برميل/يوم') + (e.rcOut > 0.005 ? row('تعطل التكرير', (e.rcOut * 100).toFixed(1) + '% (يقلل إمداد المنتجات)') : '') + '</div>';
  }
  function html(co) {
    if (!co || !co.market.engine) return ''; const p = sym();
    let h = '<div class="es-card" data-mk="sec"><div class="es-row" style="margin:0">' + btn('mkSec', 'brent', 'سوق خام برنت', st.sec === 'brent', ' style="flex:1"') + btn('mkSec', 'products', 'سوق المنتجات النفطية', st.sec === 'products', ' style="flex:1"') + '</div></div>';
    if (st.sec === 'products') h += productsList(co);
    h += priceCard(co, p) + chartCard(co, p) + newsCard(co, p) + indicators(co, p) + (st.sec === 'products' ? prodCosts(co, p) : '') + tradeCard(p);
    return h + moreCard(co);
  }
  /* actions: returns true when the view must be redrawn; 'mkGo' is routed by economy-ui (it owns the tabs) */
  function act(a, el, co) {
    const v = el && el.dataset ? el.dataset.v : null;
    if (a === 'mkSec') { st.sec = v; st.sel = null; st.off = 0; return true; }
    if (a === 'mkProd') { st.prod = v; st.sel = null; st.off = 0; return true; }
    if (a === 'mkFrame') { st.frame = v; st.span = SPAN[v]; st.off = 0; st.sel = null; return true; }
    if (a === 'mkNav') { const n = view(co).all.length, step = Math.max(1, Math.round(st.span / 2)); st.off = Math.max(0, Math.min(n - Math.min(n, st.span), st.off + (v === 'old' ? step : -step))); st.sel = null; return true; }
    if (a === 'mkZoom') { const n = view(co).all.length; st.span = Math.max(8, Math.min(v === 'in' ? Math.round(st.span / 1.5) : Math.round(st.span * 1.5), Math.max(8, n))); return true; }
    if (a === 'mkSel') { st.sel = v; return true; }
    if (a === 'mkLog') { st.log = !st.log; return true; }
    if (a === 'mkMore') { st.more = !st.more; return true; }
    return false;
  }
  const ACTS = ['mkSec', 'mkProd', 'mkFrame', 'mkNav', 'mkZoom', 'mkSel', 'mkLog', 'mkMore'];
  return { html, act, ACTS, state: st, view, chart, affects, NAME };
});
