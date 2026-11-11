/* Oli - help.js  (the in-game help: one uniform Arabic help sheet for every building, pipe, central-network part and oil field)
 *
 * Every number shown here is READ from the game's own data: building-config.js (capacities, pressures, costs, yields),
 * buildings.js (footprint, ports, terrain, sectors), economy-config.js (power, materials, lifting cost, time), game-config.js
 * (the Arabic texts) and the LIVE state of the selected object (industry.js Sim, economy.js Company, central.js CentralNet).
 * Nothing here changes the simulation or the economy: it only reads.
 *
 * Adding a building: a new DEFS entry gets a full help sheet automatically (generic sections from its def + GC.INFO texts);
 * a new TYPE can add its own profile to PROFILE below.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OliHelp = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* the twelve sections, in the order the player reads them */
  const SECTIONS = [
    ['what', '🎯', 'وظيفة المعدة'], ['how', '▶️', 'طريقة التشغيل'], ['in', '📥', 'المدخلات'], ['out', '📤', 'المخرجات'],
    ['cap', '📊', 'الطاقة الإنتاجية'], ['build', '🏗️', 'متطلبات البناء'], ['conn', '🔗', 'التوصيلات'], ['eff', '⚡', 'الكفاءة'],
    ['cost', '💵', 'التكاليف'], ['state', '🩺', 'حالة المعدة'], ['fix', '🛠️', 'المشاكل والحلول'], ['ex', '💡', 'مثال عملي']
  ];
  const STATUS_AR = { RUNNING: 'يعمل', READY: 'جاهز (لا يمر شيء الآن)', OFFLINE: 'متوقف', UNDER_CONSTRUCTION: 'قيد البناء', DEPLETED: 'نضب الحقل', BLOCKED: 'مسدود', NO_INPUT: 'لا يصله شيء', NO_MATERIALS: 'ينقصها كيماويات/مواد تشغيل', NO_OUTPUT: 'مخرجه غير موصول', LOW_PRESSURE: 'ضغط الدخول منخفض', HIGH_PRESSURE: 'ضغط مرتفع', OVER_CAPACITY: 'فوق السعة', DAMAGED: 'تالف', MAINTENANCE: 'قيد الصيانة', STOPPED: 'متوقف بأمرك', OPEN: 'مفتوح', CLOSED: 'مغلق', FAULT: 'معطّل' };
  const TONE = { RUNNING: 'ok', READY: 'info', OPEN: 'ok', UNDER_CONSTRUCTION: 'info', OVER_CAPACITY: 'warn', HIGH_PRESSURE: 'warn', LOW_PRESSURE: 'warn', BLOCKED: 'warn', STOPPED: 'warn', CLOSED: 'warn' };
  const TERRAIN_AR = { FLAT_DESERT: 'صحراء مستوية', SAND_DUNES: 'كثبان رملية', ROCKY_GROUND: 'أرض صخرية', ROCKY_PLATEAU: 'هضبة صخرية', VALLEY: 'وادٍ', WATER_WADI: 'مجرى ماء' };
  const SECTOR_AR = { A: 'استخراج النفط', B: 'تخزين وتوزيع', C: 'الاحتياطي الاستراتيجي', D: 'التكرير والمعالجة', E: 'المياه والمعالجة', F: 'المنشآت البحرية' };
  const PORT_AR = { in: 'دخول', out: 'خروج', both: 'دخول وخروج' };
  const SIDE_AR = { E: 'الشرق', W: 'الغرب', N: 'الشمال', S: 'الجنوب' };
  const TANK_KIND_AR = { COMMERCIAL: 'تخزين تجاري (غير موصول بأنابيب)', PRODUCTION: 'مخزن إنتاج (تصله آبار)', TRADE: 'مخزن تجارة ونقل (موصول بلا آبار)', RESERVE: 'احتياطي استراتيجي' };

  /* ---------------------------------------------------------------- formatting (Arabic words, Latin digits like the rest of the game) */
  const n0 = v => Math.round(+v || 0).toLocaleString('en-US');
  const n1 = v => (Math.round((+v || 0) * 10) / 10).toLocaleString('en-US');
  const pct = v => n0((+v || 0) * 100) + '%';
  const money = v => { v = +v || 0; const a = Math.abs(v); return (v < 0 ? '−' : '') + (a >= 1e9 ? '$' + n1(a / 1e9) + ' مليار' : a >= 1e6 ? '$' + n1(a / 1e6) + ' مليون' : '$' + (a < 100 && a % 1 ? (Math.round(a * 100) / 100).toLocaleString('en-US') : n0(a))); };
  const UNIT = { 'bbl/day': 'برميل/يوم', bbl: 'برميل', boe: 'برميل مكافئ', 'boe/day': 'برميل مكافئ/يوم' };
  const u = s => UNIT[s] || s;
  const PSI = 'رطل/بوصة² (psi)';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const b_ = s => '<b>' + s + '</b>';

  /* ---------------------------------------------------------------- shared facts read from the def */
  function ctxOf(c) { return Object.assign({ GC: null, B: null, BC: null, EC: null, SIM: null, store: null, pipes: null, company: null, CEN: null }, c || {}); }
  const prodName = (C, p) => p && p !== '*' ? ((C.BC && C.BC.PRODUCT_LABEL[p]) || p) : 'منتج الخط';
  const nameOf = (C, id) => (C.GC && C.GC.INFO[id] && C.GC.INFO[id].name) || (C.B && C.B.DEFS[id] && C.B.DEFS[id].name) || id;
  const infoOf = (C, id) => (C.GC && C.GC.INFO[id]) || {};
  const dayRealSec = C => (C.EC && C.EC.TIME && C.EC.TIME.dayRealSeconds) || 12;
  function ports(def) { return (def.connections || []).filter(c => c.kind === 'pipe' && !c.reserved); }
  function portSummary(C, def) {
    const g = new Map(); for (const c of ports(def)) { const k = c.role + '|' + (c.product || '*'); g.set(k, (g.get(k) || 0) + 1); }
    return [...g].map(([k, n]) => { const [role, p] = k.split('|'); return n + ' منفذ ' + PORT_AR[role] + ' (' + prodName(C, p) + ')'; });
  }
  function portAr(C, e) { const bd = C.store && C.store.get(e.b), d = bd && C.B.DEFS[bd.d], c = d && (d.connections || []).find(q => q.id === e.port); return c ? ({ in: 'مدخل', out: 'مخرج', both: 'منفذ' })[c.role] + ' ' + prodName(C, c.product) : 'منفذ'; }
  function powerKW(C, def) {
    const K = C.EC && C.EC.POWER_KW; if (!K) return 0; const t = def.type;
    return t === 'well' ? K.well : t === 'pump' ? (K.pump[def.size] || 0) : t === 'separator' ? K.separator : t === 'refinery' ? (K.refinery[def.size] || 0) : t === 'gas' ? K.gas : 0;
  }
  function buildCost(C, def) {
    if (def.type === 'well' && def.costRange) return money(def.costRange[0]) + ' – ' + money(def.costRange[1]) + ' (حسب عمق الحقل)';
    if (def.type === 'central') return money(def.cost) + ' لنقطة ربط جديدة تضيفها أنت (المحطات المبنية مسبقاً ضمن تمويل الشبكة)';
    return money(def.cost) + (def.baseCost != null && def.costPerBarrel ? ' (أساس ' + money(def.baseCost) + ' + ' + money(def.costPerBarrel) + ' لكل ' + u(def.capacity.unit) + ' سعة)' : '');
  }
  function sectorsOf(C, id) { if (!C.B || !C.B.SECTOR_RULES) return []; const out = []; for (const q in C.B.SECTOR_RULES) if (C.B.SECTOR_RULES[q].allow.indexOf(id) >= 0) out.push(q); return out; }

  /* ---------------------------------------------------------------- live facts of a placed building */
  function live(C, b) {
    const S = C.SIM, def = C.B.DEFS[b.d], s = S ? S.ensure(b) : (b.s || {}); let st = S ? S.status(b) : (b.st || 'READY'); const warn = S ? S.warnings(b) : [];
    if (def.type === 'well' && s.started === false && st !== 'UNDER_CONSTRUCTION') st = 'STOPPED';
    const conn = ports(def).map(c => { const e = S && S.edgeOf ? S.edgeOf(b, c.id) : null, o = e && S.other ? S.other(e, b, c.id) : null; return { c, e, other: o && o.b ? o.b : null, flow: e ? e.flow || 0 : 0 }; });
    return { def, s, st, warn, conn, cap: def.capacity.value };
  }
  const linked = L => L.conn.filter(x => x.e);
  const otherName = (C, x) => x.other ? esc(nameOf(C, x.other.d)) + ' ' + x.other.id : '—';

  /* ================================================================ PROFILES: one per building type (all numbers read from the def / config) */
  const PROFILE = {
    well(C, def, L) {
      const W = C.BC.WELL, info = infoOf(C, def.id), s = L ? L.s : null, o = {};
      o.what = [info.does || 'يستخرج النفط الخام.', 'يخرج منه نفط خام مختلط بماء وغاز مصاحبين؛ نسبة الماء تبدأ قرب ' + pct(W.waterCutStart) + ' وتزداد كلما نضب الحقل (حتى نحو ' + pct(W.waterCutEnd) + ').', 'هو مصدر كل الدخل في بداية اللعبة: بدونه لا يوجد نفط تبيعه أو تكرّره.'];
      o.how = ['يُبنى فوق حقل نفط قابل للحفر فقط (اضغط على الحقل ثم «🛢️ حفر بئر»).', 'بعد انتهاء البناء يبقى البئر متوقفاً حتى تضغط «▶ ابدأ الإنتاج» في بطاقته.', 'وصّل أنبوباً من أي جانب من جوانبه الأربعة إلى خزان نفط خام أو فاصل أو نقطة ربط.', 'يمكنك إيقافه في أي وقت من زر «⏸ أوقف الإنتاج».'];
      o.in = ['لا يحتاج مادة خام: يسحب من مكمن الحقل نفسه.', 'كهرباء: ' + n0(powerKW(C, def)) + ' كيلوواط عند الحمل الكامل.', 'عمّال تشغيل (نقصهم يخفض الإنتاج).'];
      o.out = ['نفط خام (مع ماء وغاز مصاحبين) من 4 منافذ خروج: شرق، غرب، شمال، جنوب.'];
      o.cap = ['الإنتاج الاسمي للبئر الواحد بين ' + n0(W.production[0]) + ' و' + n0(W.production[1]) + ' برميل/يوم حسب الحقل.', 'الضغط عند رأس البئر بين ' + n0(W.pressure[0]) + ' و' + n0(W.pressure[1]) + ' ' + PSI + '.'];
      if (s) o.cap.push('هذا البئر: الإنتاج الاسمي ' + b_(n0(s.nominal)) + ' برميل/يوم · الهدف الآن ' + b_(n0(s._target)) + ' · الفعلي ' + b_(n0(s._out)) + ' برميل/يوم.', 'الاحتياطي المتبقي ' + b_(n0(s.reserve)) + ' برميل من ' + n0(s.reserve0) + '.');
      o.eff = ['↑ ضغط المكمن: الهدف = الإنتاج الاسمي × (0.4 + 0.6 × ضغط المكمن)؛ يهبط الضغط مع السحب.', '↓ سعة الحقل مشتركة بين آباره: آبار أكثر لا تُخرج نفطاً أكثر من سعة الحقل.', '↓ إذا كان الأنبوب أو الخزان بعده لا يستوعب كل الإنتاج يصبح البئر «مسدوداً» وينتج أقل.', '↓ نقص الكهرباء أو العمّال يخفض الإنتاج.', '↓ نسبة الماء تزيد مع نضوب الحقل، فيقل النفط الصافي.'];
      o.ex = ['بئر إنتاجه 1,500 برميل/يوم موصول بخزان صغير سعته 10,000 برميل يملؤه في نحو 6.7 أيام لعب (اليوم = ' + dayRealSec(C) + ' ثانية بالسرعة 1×). بعدها بِع النفط أو أضف خزاناً.'];
      return o;
    },
    pump(C, def, L) {
      const P = def.params, info = infoOf(C, def.id), water = def.family === 'WATER_PUMP', s = L ? L.s : null, o = {};
      o.what = [info.does || 'ترفع ضغط السائل في الخط.', 'تضيف دفعة ضغط بين ' + n0(P.boost[0]) + ' و' + n0(P.boost[1]) + ' ' + PSI + ' (تُضرب في كفاءتها) فيصل السائل أبعد ويعبر خطوطاً أطول.', water ? 'تنقل الماء فقط ولا تلمس النفط أبداً.' : 'تحمل منتج الخط الموصول بها (نفط خام أو أي منتج).'];
      if (P.inputs) o.what.push('فيها ' + P.inputs + ' مداخل و' + P.outputs + ' مخارج تجمع عدة خطوط وتوزّعها.');
      o.how = ['ضعها على مسار الخط بين المصدر والوجهة.', 'وصّل منفذ الدخول بالمصدر ومنفذ الخروج بالوجهة.', 'تعمل تلقائياً متى وصلها سائل بضغط لا يقل عن ' + n0(P.minInletPsi) + ' ' + PSI + '.'];
      if (water) o.how.push('بلا مخرج موصول تعمل «مضخة تحميل» تجهّز الماء للبيع من بطاقة المياه في المخزون.');
      o.in = [(water ? 'ماء' : 'سائل الخط') + ' بضغط دخول ' + n0(P.minInletPsi) + ' ' + PSI + ' على الأقل.', 'كهرباء: ' + n0(powerKW(C, def)) + ' كيلوواط عند الحمل الكامل.'];
      o.out = ['نفس الكمية الداخلة بضغط أعلى (لا تُنتج سائلاً جديداً).'];
      o.cap = ['أقصى تدفق ' + b_(n0(P.maxFlow)) + ' برميل/يوم.', 'الكفاءة بين ' + pct(P.eff[0]) + ' و' + pct(P.eff[1]) + '.', 'أقصى ضغط آمن للخط 3,000 ' + PSI + '.'];
      if (s) o.cap.push('هذه المضخة: دفعة ' + b_(n0(s.boost)) + ' psi × كفاءة ' + b_(pct(s.eff)) + ' = ' + n0(s.boost * s.eff) + ' psi · التدفق الآن ' + b_(n0(s._in)) + ' برميل/يوم (' + pct((s._in || 0) / P.maxFlow) + ' من طاقتها) · دخول ' + n0(s.pIn) + ' ← خروج ' + n0(s.pOut || s.pIn) + ' psi.');
      o.eff = ['↓ ضغط دخول أقل من ' + n0(P.minInletPsi) + ' psi يوقف الضخ.', '↓ تدفق أكبر من ' + n0(P.maxFlow) + ' برميل/يوم: الزائد لا يمر (فوق السعة).', '↓ ضغط خروج فوق 3,000 psi: تحذير ضغط مرتفع.', '↓ نقص الكهرباء أو العمّال.'];
      o.ex = ['خط طويل يصل فيه النفط بضغط 150 psi: مضخة دفعتها ' + n0(P.boost[0]) + ' psi وكفاءتها ' + pct(P.eff[0]) + ' ترفعه إلى نحو ' + n0(150 + P.boost[0] * P.eff[0]) + ' psi فيكمل طريقه.'];
      return o;
    },
    valve(C, def, L) {
      const P = def.params, o = {};
      o.what = [infoOf(C, def.id).does || 'يفتح أو يغلق أو يقلل التدفق.', 'يستعمل لعزل جزء من الشبكة أو التحكم في كمية ما يمر.'];
      o.how = ['ضعه على خط أنابيب ووصّل دخوله وخروجه.', 'زر «الصمام» في بطاقته يبدّل الوضع: مفتوح ← جزئي ← مغلق.'];
      o.in = ['سائل الخط القادم من منفذ الدخول.']; o.out = ['نفس السائل من منفذ الخروج، بحسب نسبة الفتح.'];
      o.cap = ['أقصى تدفق ' + b_(n0(P.maxFlow)) + ' برميل/يوم · تحمّل ضغط ' + n0(P.pressureRating) + ' ' + PSI + '.'];
      if (L) o.cap.push('الآن: ' + (STATUS_AR[L.s.mode] || L.s.mode) + (L.s.mode === 'PARTIAL' ? ' ' + pct(L.s.opening) : '') + ' · يمر ' + b_(n0(L.s._in)) + ' برميل/يوم.');
      o.eff = ['الوضع الجزئي يقلل ما يمر بنسبة الفتح.', 'تدفق فوق ' + n0(P.maxFlow) + ' برميل/يوم لا يمر كله.'];
      o.ex = ['تريد صيانة خزان؟ أغلق الصمام قبله فيتوقف ما يصله دون هدم الأنابيب.'];
      return o;
    },
    junction(C, def, L) {
      const P = def.params, man = def.family === 'MANIFOLD', o = {};
      o.what = [infoOf(C, def.id).does || 'تجمع أو تقسّم الخطوط.'];
      o.how = man ? ['وصّل حتى ' + P.inputs + ' خطوط دخول و' + P.outputs + ' خطوط خروج.', 'توزّع الخليط على المخارج حسب السعة المتاحة لكل مخرج.'] : ['ضعها حيث تلتقي الخطوط، أو أضفها على أنبوب قائم من زر «🔀 وصلة هنا» في بطاقة الأنبوب.', 'كل منافذها الأربعة تعمل دخولاً أو خروجاً حسب اتجاه الخطوط.'];
      o.in = ['ما يصلها من الخطوط الداخلة (أي منتج، لكن خطاً واحداً لكل منتج).']; o.out = ['نفس الكمية موزّعة على الخطوط الخارجة.'];
      o.cap = ['أقصى تدفق إجمالي ' + b_(n0(P.maxTotalFlow)) + ' برميل/يوم · حد الضغط ' + n0(P.pressureLimit) + ' ' + PSI + '.'];
      if (L) o.cap.push('الآن يمر ' + b_(n0(L.s._in)) + ' برميل/يوم (' + pct((L.s._in || 0) / P.maxTotalFlow) + ' من الحد).');
      o.eff = ['تدفق فوق الحد الإجمالي لا يمر كله (فوق السعة).', 'ضغط فوق ' + n0(P.pressureLimit) + ' psi يعطي تحذير ضغط مرتفع.'];
      o.ex = man ? ['تسعة آبار يدخل كل منها 2,000 برميل/يوم (18,000 إجمالاً) تخرج من مخرج واحد أو تتوزع على ثلاثة خزانات.'] : ['ثلاثة آبار كل منها 1,000 برميل/يوم تصب في نقطة ربط واحدة ويخرج منها خط واحد يحمل 3,000 برميل/يوم إلى الخزان.'];
      return o;
    },
    tank(C, def, L) {
      const p = def.product, nm = prodName(C, p), SAFE = C.BC.SAFETY, o = {}, s = L ? L.s : null, cap = def.capacity.value;
      o.what = [infoOf(C, def.id).does || 'يخزّن ' + nm + '.', 'يقبل ' + nm + ' فقط؛ أي منتج آخر يُرفض.'];
      if (p === 'CRUDE') o.what.push('نوعه يتحدد من توصيله: إن وصلته آبار فهو «مخزن إنتاج»، وإن لم يتصل بأنابيب فهو «تخزين تجاري» يقبل النفط المشترى.');
      if (ports(def).some(c => c.id === 'WATER_OUT')) o.what.push('له مخرج سفلي للماء المترسب يمكن توصيله بمضخة مياه.');
      o.how = ['ابنه قرب مصدره ووصّل أنبوباً إلى أحد منافذ الدخول وأنبوباً من أحد منافذ الخروج إلى الوجهة.', 'البيع من ☰ ← «بيع»: يُسحب من الخزانات.', 'الخزانات المتلاصقة من نفس المنتج تعمل مجموعة واحدة.'];
      o.in = [nm + ' من الأنابيب أو من الشراء.']; o.out = [nm + ' إلى الأنابيب الخارجة أو بالبيع.'];
      o.cap = ['السعة ' + b_(n0(cap)) + ' ' + u(def.capacity.unit) + '.', 'تحذير «شبه ممتلئ» فوق ' + pct(SAFE.tankNearFull) + ' و«ممتلئ» عند ' + pct(SAFE.tankFull) + '.'];
      if (s) o.cap.push('الآن: ' + b_(n0(s.vol)) + ' من ' + n0(cap) + ' (' + pct(s.vol / cap) + ') · المتبقي ' + b_(n0(Math.max(0, cap - s.vol))) + ' · داخل ' + n0(s._in) + ' · خارج ' + n0(s._out) + ' ' + u(def.capacity.unit) + '/يوم.');
      o.eff = ['الخزان لا ينتج؛ ما يهم هو المساحة الحرة: الممتلئ يوقف ما قبله ويسد الآبار.', 'خطوط خروج أكثر أو بيع منتظم يبقيه فارغاً.'];
      const r = 2500; o.ex = ['يصله ' + n0(r) + ' برميل/يوم ولا يخرج منه شيء: يمتلئ في ' + n1(cap / r) + ' يوم لعب (≈ ' + n0(cap / r * dayRealSec(C)) + ' ثانية بالسرعة 1×).'];
      return o;
    },
    gas(C, def, L) {
      const o = PROFILE.tank(C, def, L), P = def.params, SAFE = C.BC.SAFETY, s = L ? L.s : null;
      o.what.push('الغاز مضغوط: يرتفع الضغط داخلها كلما امتلأت حتى أقصى ' + n0(P.maxPressure) + ' ' + PSI + '.');
      o.cap.push('ضغط أقصى ' + n0(P.maxPressure) + ' psi · تحذير الضغط فوق ' + pct(SAFE.gasHighPressure) + ' منه · تحذير الحرارة فوق ' + n0(SAFE.gasHighTempC) + '°م.');
      if (s) o.cap.push('الضغط الآن ' + b_(n0(s.press || 15)) + ' psi · الحرارة ' + n0(s.temp) + '°م.');
      o.eff.push('امتلاء عالٍ = ضغط عالٍ: بِع الغاز أو أضف كرة أخرى قبل الوصول إلى الحد.');
      return o;
    },
    separator(C, def, L) {
      const P = def.params, s = L ? L.s : null, o = {};
      o.what = [infoOf(C, def.id).does || 'يفصل النفط عن الغاز والماء.', 'نسب الفصل: نفط ' + pct(P.oilSep) + ' · غاز ' + pct(P.gasSep) + ' · ماء ' + pct(P.waterSep) + '.'];
      o.how = ['ضعه بين الآبار والخزان.', 'وصّل خليط الآبار إلى مدخله، ومخرج النفط إلى خزان خام.', 'اختياري: مخرج الغاز إلى كرة غاز، ومخرج الماء إلى مضخة/خزان مياه.'];
      o.in = ['خليط الآبار (نفط + ماء + غاز) بضغط ' + n0(P.minInletPsi) + ' ' + PSI + ' على الأقل.', 'كهرباء: ' + n0(powerKW(C, def)) + ' كيلوواط.'];
      o.out = ['نفط أنظف · غاز · ماء، كلٌّ من مخرجه.', 'إن لم يوصل مخرج الغاز يُحرق الغاز (يضيع). وإن لم يوصل مخرج الماء لا يُنقل الماء المفصول إلى أي مكان.'];
      o.cap = ['السعة ' + b_(n0(P.cap)) + ' برميل/يوم من الخليط.'];
      if (s) o.cap.push('الآن: دخول ' + b_(n0(s._in)) + ' · نفط ' + n0(s._o) + ' · غاز ' + n0(s._g) + ' · ماء ' + n0(s._w) + ' برميل/يوم.');
      o.eff = ['↓ ضغط دخول أقل من ' + n0(P.minInletPsi) + ' psi يوقفه.', '↓ إذا امتلأ خزان النفط بعده يتوقف الفصل (مسدود).', '↓ نقص الكهرباء أو العمّال.'];
      o.ex = ['يدخله 10,000 برميل/يوم فيها 20% ماء: يخرج الماء المفصول (≈ ' + n0(10000 * .2 * P.waterSep) + ' برميل/يوم) إلى مخرج الماء ويذهب النفط الأنظف إلى الخزان، فتحصل المصفاة على خام أجود.'];
      return o;
    },
    refinery(C, def, L) {
      const P = def.params, R = C.BC.REFINERY, Y = R.yields, MU = C.EC && C.EC.MATERIAL_USE, ML = (C.EC && C.EC.MATERIAL_LABEL) || {}, s = L ? L.s : null, o = {};
      o.what = [infoOf(C, def.id).does || 'تحوّل النفط الخام إلى منتجات.', 'من كل 100 برميل خام: ' + n0(Y.GASOLINE) + ' بنزين · ' + n0(Y.DIESEL) + ' ديزل · ' + n0(Y.JET_FUEL) + ' وقود طائرات · ' + n0(Y.GAS) + ' غاز · ' + n0(Y.OTHER) + ' منتجات أخرى.'];
      o.how = ['تُبنى داخل منطقة المصافي المسوّاة (القطاع D).', 'وصّل خزان خام (أو محطة الشبكة المركزية) إلى مدخل الخام.', 'وصّل كل مخرج منتج (بنزين/ديزل/وقود طائرات/غاز) بخزان من نفس المنتج.', (C.EC && C.EC.MATERIALS_REQUIRED !== false) ? 'اشترِ كيماويات ومواد تشغيل من «الشراء» قبل التشغيل.' : 'لا تحتاج شراء كيماويات أو مواد تشغيل: تعمل بدونها ولا تُحسب لها تكلفة.', 'زر «حد التشغيل» يحدد نسبة السعة المستخدمة: 100% ← 75% ← 50%.'];
      o.in = ['نفط خام بضغط ' + n0(R.minInletPsi) + ' ' + PSI + ' على الأقل.'];
      if (MU) o.in.push((ML.CHEM || 'كيماويات') + ': ' + MU.CHEM.qty + ' كغ لكل برميل مكرَّر' + ((C.EC && C.EC.MATERIALS_REQUIRED !== false) ? '.' : ' (غير مطلوبة حالياً).'), (ML.OPS || 'مواد تشغيل') + ': ' + MU.OPS.qty + ' وحدة لكل برميل مكرَّر.');
      o.in.push('كهرباء: ' + n0(powerKW(C, def)) + ' كيلوواط عند الحمل الكامل.');
      o.out = ['بنزين · ديزل · وقود طائرات · غاز، لكل منتج مخرجه الخاص.', 'المنتج الذي لا مخرج موصول له لا يُنقل إلى أي خزان؛ الغاز غير الموصول يُحرق.'];
      o.cap = ['السعة الاسمية ' + b_(n0(P.cap)) + ' برميل/يوم خام.'];
      if (MU && (C.EC && C.EC.MATERIALS_REQUIRED !== false)) o.cap.push('عند السعة الكاملة تحتاج يومياً ' + n0(P.cap * MU.CHEM.qty) + ' كغ كيماويات و' + n0(P.cap * MU.OPS.qty) + ' وحدة مواد تشغيل.');
      if (s) { const p = s._p || {}; o.cap.push('الآن: يُكرَّر ' + b_(n0(s._in)) + ' برميل/يوم (' + pct((s._in || 0) / P.cap) + ') · بنزين ' + n0(p.GASOLINE) + ' · ديزل ' + n0(p.DIESEL) + ' · وقود طائرات ' + n0(p.JET_FUEL) + ' · غاز ' + n0(p.GAS) + ' · الكفاءة ' + pct(s.eff) + ' · حد التشغيل ' + pct(s.opLimit) + '.'); }
      o.eff = ['الكفاءة الأساسية ' + pct(R.baseEfficiency) + '، وتنقص بسبب:', '↓ الماء والغاز في الخام (استعمل فاصلاً قبلها).', '↓ ضغط دخول أقل من ' + n0(R.minInletPsi) + ' psi.', '↓ حرارة فوق ' + n0(R.maxTempC) + '°م (المثلى ' + n0(R.optimalTempC) + '°م).', '↓ تشغيل بحمل منخفض جداً (أقل من 60%).', ].concat((C.EC && C.EC.MATERIALS_REQUIRED !== false) ? ['↓ نقص الكيماويات أو مواد التشغيل يحد ما تقبله.'] : []).concat(['↓ نقص الكهرباء أو العمّال، وجودة الخام المنخفضة.']);
      const x = Math.min(P.cap, 10000); o.ex = ['يدخلها ' + n0(x) + ' برميل/يوم: تخرج ≈ ' + n0(x * Y.GASOLINE / 100) + ' بنزين و' + n0(x * Y.DIESEL / 100) + ' ديزل و' + n0(x * Y.JET_FUEL / 100) + ' وقود طائرات و' + n0(x * Y.GAS / 100) + ' غاز' + (MU ? '، وتستهلك ' + n0(x * MU.CHEM.qty) + ' كغ كيماويات و' + n1(x * MU.OPS.qty) + ' وحدة مواد تشغيل يومياً' : '') + '.'];
      return o;
    },
    central(C, def, L, b) {
      const CEN = C.CEN, cls = CEN ? CEN.CLASS : { capacity: 300000, maxPressure: 3000 }, chs = (def.params && def.params.channels) || [], o = {};
      o.what = [infoOf(C, def.id).does || 'تربط فرعك بقناة المنتج المناسبة في الأنبوب المركزي.', 'الأنبوب المركزي فيه ست قنوات منفصلة لا تختلط: ' + chs.map(c => prodName(C, c)).join('، ') + '.', 'المحطة ترسل ما يصلها إلى قناته، وتسلّم منها لمن يطلب حسب الطلب والسعة والضغط.'];
      o.how = ['اضغط «🔗 توصيل» في بطاقة المحطة ثم المنشأة: يُرسم أنبوب عادي إلى المنفذ المطابق لمنتجها.', 'منشأة ترسل (بئر/خزان/مصفاة) ← تدخل المنتج إلى القناة؛ منشأة تستقبل (خزان/مصفاة) ← تسحب منها.', 'لإضافة محطة جديدة: «🛢️ الشبكة المركزية» ← «🔀 إنشاء فرع» ثم المس الخط.'];
      o.in = ['أي من المنتجات الستة، كل منتج من منفذيه فقط (12 منفذاً: منفذان لكل قناة).']; o.out = ['نفس المنتجات إلى المنشآت الموصولة، عبر القناة المطابقة.'];
      o.cap = ['كل قناة بفئة 36 بوصة: ' + b_(n0(cls.capacity)) + ' برميل/يوم لكل مقطع، وضغط أقصى ' + n0(cls.maxPressure) + ' ' + PSI + '.', 'الكمية تُوزّع حسب طلب كل مستقبل ومساحته الحرة وضغط الوصول، لا بالتساوي.'];
      o.eff = ['↓ قناة مغلقة أو معطّلة أو مقطع مقطوع: لا تمر الحركة (أو تلتف عبر الحلقة البديلة إن وُجدت).', '↓ مسافة طويلة بلا مضخة = ضغط أقل عند الوصول.', '↑ مضخات الشبكة ترفع الضغط في اتجاهها فقط (أمامي/عكسي).'];
      o.ex = ['مصفاة موصولة بمنفذ الخام في محطة تسحب الخام الذي ترسله آبار موصولة بمحطة أخرى بعيدة، ويعود بنزينها عبر قناة البنزين إلى خزانات قطاع التخزين.'];
      return o;
    }
  };

  /* ---------------------------------------------------------------- the twelve sections of a building (def + live state) */
  function sectionsFor(C, def, L, b) {
    const prof = (PROFILE[def.type] || generic)(C, def, L, b), info = infoOf(C, def.id), sec = {};
    sec.what = prof.what || [info.does || def.name]; if (info.when) sec.what.push('متى تحتاجها؟ ' + info.when);
    sec.how = prof.how || ['ابنها من القائمة ثم وصّلها بالأنابيب من زر «🔗 توصيل».'];
    sec.in = prof.in || ['منافذ الدخول: ' + (portSummary(C, def).filter(x => /دخول/.test(x)).join('، ') || 'لا يوجد')];
    sec.out = prof.out || ['منافذ الخروج: ' + (portSummary(C, def).filter(x => /خروج/.test(x)).join('، ') || 'لا يوجد')];
    sec.cap = prof.cap || ['السعة: ' + n0(def.capacity.value) + ' ' + u(def.capacity.unit) + '.'];
    /* building requirements: footprint, sector, terrain, slope, field / zone, safety distance, unlock level */
    const sc = sectorsOf(C, def.id), B = [];
    B.push('المساحة: ' + def.footprint[0] + '×' + def.footprint[1] + ' مربعات' + (def.rotatable ? ' (يمكن تدويرها)' : '') + '.');
    if (sc.length) B.push('القطاعات المسموحة: ' + (sc.length >= 5 ? 'كل القطاعات البرية' : sc.map(q => q + ' «' + (SECTOR_AR[q] || q) + '»').join('، ')) + '.');
    if (def.allowedTerrain && def.allowedTerrain.length) B.push('الأرض: ' + def.allowedTerrain.map(t => TERRAIN_AR[t] || t).join('، ') + ' · أقصى ميل ' + def.maxSlope + '.');
    if (def.requires && def.requires.oilField) B.push('يجب أن يكون فوق حقل نفط مكتشف وقابل للحفر.');
    if (def.zone === 'REFINERY') B.push('داخل منطقة المصافي المسوّاة (المستطيل البنفسجي).');
    if (def.safetyZone) B.push('مسافة أمان ' + def.safetyZone + ' مربع حولها لا يُبنى فيها.');
    B.push('مدة البناء: ' + n0(def.buildTime) + ' ساعة لعب (≈ ' + n1(def.buildTime / 24 * dayRealSec(C)) + ' ثانية بالسرعة 1×).');
    if (info.lv) B.push('تُفتح في المستوى ' + info.lv + (C.GC && C.GC.LEVELS ? ' «' + ((C.GC.LEVELS.find(l => l.lv === info.lv) || {}).name || '') + '»' : '') + '.');
    B.push('تكلفة البناء: ' + buildCost(C, def) + '.');
    if (def.type === 'central') B.splice(0, B.length, 'المحطة 3×3 ملاصقة للأنبوب المركزي؛ لا تُبنى من القائمة بل من لوحة «🛢️ الشبكة المركزية» ← «🔀 إنشاء فرع».', 'تحتاج أرضاً غير شديدة الانحدار بجانب الخط، ولا تُبنى على الماء.', 'تكلفة نقطة جديدة: ' + money(def.cost) + ' (مربع واحد من القنوات الست).');
    sec.build = B;
    /* connections: every port (live: connected to what, how much) */
    const Cn = [], ps = ports(def);
    Cn.push('المنافذ: ' + (portSummary(C, def).join(' · ') || 'لا يوجد') + '.');
    if (info.links) Cn.push('ما يُوصل بها: ' + info.links);
    if (L) { const on = linked(L); Cn.push(on.length ? 'موصول الآن: ' + on.length + ' من ' + ps.length + ' منافذ.' : 'لا يوجد أي منفذ موصول بعد.'); for (const x of on) Cn.push('• ' + ({ in: 'مدخل', out: 'مخرج', both: 'منفذ' })[x.c.role] + ' ' + prodName(C, x.c.product) + (x.c.side ? ' (جهة ' + (SIDE_AR[x.c.side] || x.c.side) + ')' : '') + ' ← ' + otherName(C, x) + ' · ' + n0(x.flow) + ' برميل/يوم'); }
    Cn.push('للتوصيل: اضغط «🔗 توصيل» في بطاقة المعدة ثم المعدة الأخرى؛ يختار المسار والمنفذ المطابق للمنتج تلقائياً.');
    sec.conn = Cn;
    sec.eff = (prof.eff || []).slice(); if (C.company && L) { const ce = L.s.ecoEff; if (ce != null && def.type !== 'tank') sec.eff.push('معامل الكهرباء والعمّال وجودة الخام لهذه المعدة الآن: ' + b_(pct(ce)) + '.'); }
    if (!sec.eff.length) sec.eff = ['لا عوامل كفاءة لهذه المعدة: تعمل بسعتها ما دامت موصولة.'];
    /* costs: build + daily operation + maintenance + variable */
    const K = [], O = C.EC && C.EC.OPERATING;
    K.push('البناء: ' + buildCost(C, def) + '.');
    if (def.operatingCost) K.push('التشغيل: حتى ' + money(def.operatingCost) + ' يومياً' + (O ? ' (' + pct(O.fixedShare) + ' منها ثابتة والباقي حسب الحمل)' : '') + '.');
    if (def.maintenanceCost) K.push('الصيانة: نحو ' + money(def.maintenanceCost) + ' يومياً، تُدفع تلقائياً (لا أعطال عشوائية ولا اهتلاك في اللعبة).');
    if (def.type === 'well' && C.EC && C.EC.VARIABLE) K.push('تكلفة الرفع: ' + money(C.EC.VARIABLE.liftingPerBbl) + ' لكل برميل منتج.');
    if (def.type === 'refinery' && C.EC && C.EC.MATERIAL_PRICE && C.EC.MATERIALS_REQUIRED !== false) K.push('الكيماويات ' + money(C.EC.MATERIAL_PRICE.CHEM) + ' للكغ (' + money(C.EC.MATERIAL_PRICE.CHEM * C.EC.MATERIAL_USE.CHEM.qty) + ' لكل برميل مكرَّر)، ومواد التشغيل ' + money(C.EC.MATERIAL_PRICE.OPS) + ' للوحدة (' + money(C.EC.MATERIAL_PRICE.OPS * C.EC.MATERIAL_USE.OPS.qty) + ' لكل برميل)' + (C.EC.MATERIALS_REQUIRED !== false ? ' — تُشترى مسبقاً وتُسحب من المخزون.' : ' — تُخصم تلقائياً من النقد، والمخزون المشترى (إن وُجد) يُستهلك أولاً.'));
    if (powerKW(C, def)) K.push('الكهرباء: حتى ' + n0(powerKW(C, def)) + ' كيلوواط من حصة شبكتك.');
    if (def.type === 'central') K.splice(0, K.length, 'المحطات المبنية مسبقاً جزء من الشبكة الممولة بقرض 100% (60 سنة · 6% · سماح سنتان).', 'صيانة وتشغيل الشبكة تُسجّل في حسابيها الخاصين ضمن التقرير المالي للشبكة.', 'نقطة ربط جديدة: ' + money(def.cost) + '.');
    sec.cost = K;
    return { sec, prof };
  }
  function generic(C, def) {
    const info = infoOf(C, def.id), ps = portSummary(C, def);
    return { what: [info.does || def.name], in: ['منافذ الدخول: ' + (ps.filter(x => /دخول/.test(x)).join('، ') || 'لا يوجد')], out: ['منافذ الخروج: ' + (ps.filter(x => /خروج/.test(x)).join('، ') || 'لا يوجد')], cap: [info.prod || ('السعة ' + n0(def.capacity.value) + ' ' + u(def.capacity.unit))], ex: info.chain ? ['السلسلة: ' + info.chain.map(c => c[1]).join(' ← ')] : [] };
  }

  /* ================================================================ DIAGNOSIS: the live reason behind a status and how to fix it */
  function diagnose(C, b, L) {
    const def = L.def, s = L.s, st = L.st, I = [], add = (tone, t, fix) => I.push({ tone, t, fix: fix || '' }), ins = L.conn.filter(x => x.c.role !== 'out'), outs = L.conn.filter(x => x.c.role !== 'in' && !(def.type === 'tank' && x.c.id === 'WATER_OUT'));
    const anyIn = ins.some(x => x.e), anyOut = outs.some(x => x.e);
    if (st === 'UNDER_CONSTRUCTION') { const left = C.store && b.t0 != null ? Math.max(0, def.buildTime - (C.store.time - b.t0)) : null; add('info', 'قيد البناء' + (left != null ? ': بقيت ' + n0(left) + ' ساعة لعب تقريباً' : '') + '.', 'ستعمل تلقائياً عند اكتمال البناء. يمكنك توصيلها بالأنابيب الآن.'); return I; }
    if (st === 'DAMAGED' || st === 'MAINTENANCE') add('bad', 'المعدة في حالة «' + STATUS_AR[st] + '» من حفظ قديم.', 'تُستعاد تلقائياً: الصيانة في اللعبة تكلفة يومية ولا توجد أعطال عشوائية.');
    if (C.company && C.company.pwStop != null && s.ecoEff === 0 && def.type !== 'well') add('bad', 'توقفت بسبب نقص الكهرباء (تُطفأ المعدات الأقل أهمية أولاً).', 'ارفع شبكة الكهرباء أو اشترِ كهرباء من شاشة الطاقة.');
    else if (C.company && C.company.pw && C.company.pw.factor < 1 && powerKW(C, def)) add('warn', 'الكهرباء غير كافية: الكفاءة نزلت إلى ' + pct(C.company.pw.factor) + ' من الكهرباء المطلوبة.', 'ارفع مستوى شبكة الكهرباء.');
    if (C.company && C.company.staffF != null && C.company.staffF < 0.999 && powerKW(C, def)) add('warn', 'فريق العمل ناقص أو غير مدرّب: الإنتاج × ' + pct(C.company.staffF) + '.', 'وظّف ودرّب العمّال من شاشة الموظفين.');
    const T = def.type;
    if (T === 'well') {
      if (st === 'STOPPED') add('warn', 'البئر متوقف: الآبار الجديدة تنتظر أمرك.', 'اضغط «▶ ابدأ الإنتاج» في بطاقة البئر.');
      if (st === 'DEPLETED') add('bad', 'نضب الاحتياطي: لا نفط متبقٍ في هذا البئر.', 'احفر في حقل آخر، أو اهدم البئر لاسترداد جزء من ثمنه.');
      if (!anyOut) add('bad', 'لا يوجد أنبوب خارج من البئر: النفط لا يذهب لأي مكان.', 'اضغط «🔗 توصيل» ثم اختر خزان نفط خام أو فاصلاً أو نقطة ربط.');
      else if (st === 'BLOCKED') { const full = blockers(C, b); add('warn', 'البئر مسدود: ينتج ' + n0(s._out) + ' من هدف ' + n0(s._target) + ' برميل/يوم لأن ما بعده لا يستوعب.' + (full.length ? ' السبب: ' + full.join('؛ ') + '.' : ''), 'بِع من الخزان أو أضف خزاناً، أو استعمل أنبوباً بقطر أكبر.'); }
    }
    if (T === 'pump') {
      const P = def.params;
      if (!anyIn) add('bad', 'منفذ الدخول غير موصول: لا يصل المضخة أي سائل.', 'وصّل خطاً من المصدر إلى منفذ دخول المضخة.');
      if (!anyOut && def.family !== 'WATER_PUMP') add('bad', 'منفذ الخروج غير موصول.', 'وصّل خطاً من منفذ الخروج إلى الوجهة.');
      if (st === 'LOW_PRESSURE') add('warn', 'ضغط الدخول ' + n0(s.pIn) + ' psi أقل من الحد الأدنى ' + n0(P.minInletPsi) + ' psi فتوقف الضخ.', 'قرّب المضخة من المصدر، أو ضع مضخة أخرى قبلها، أو اختصر الخط.');
      if (st === 'HIGH_PRESSURE') add('warn', 'ضغط الخروج ' + n0(s.pOut) + ' psi فوق 3,000 psi.', 'أبعد المضخة عن المصدر أو أزل مضخة متتالية.');
      if (st === 'OVER_CAPACITY') add('warn', 'يصلها أكثر من طاقتها ' + n0(P.maxFlow) + ' برميل/يوم، فلا يمر الزائد.', 'ضع مضخة أكبر أو مضخة ثانية على خط موازٍ.');
      if (st === 'READY' && anyIn) add('info', 'موصولة لكن لا يصلها شيء الآن.', 'تأكد أن المصدر قبلها يعمل وأن الصمامات مفتوحة.');
    }
    if (T === 'valve') { if (s.mode === 'CLOSED') add('warn', 'الصمام مغلق: لا يمر شيء.', 'اضغط زر «الصمام» حتى يصبح «مفتوح».'); if (s.mode === 'PARTIAL') add('info', 'الصمام مفتوح جزئياً ' + pct(s.opening) + '.', 'اضغط زر «الصمام» للفتح الكامل.'); if (s.mode === 'FAULT') add('bad', 'الصمام معطّل.', 'بدّل وضعه من زر «الصمام».'); }
    if (T === 'junction') { if (st === 'OVER_CAPACITY') add('warn', 'يمر أكثر من الحد الإجمالي ' + n0(def.params.maxTotalFlow) + ' برميل/يوم.', 'وزّع الخطوط على نقطة ربط ثانية أو استعمل التفريعة الرئيسية.'); if (linked(L).length < 2) add('info', 'موصولة بأقل من خطين: نقطة الربط تحتاج خطاً داخلاً وخطاً خارجاً على الأقل.', 'وصّل خطاً آخر.'); }
    if (T === 'tank' || T === 'gas') {
      const cap = L.cap, fill = s.vol / cap, room = Math.max(0, cap - s.vol), unit = u(def.capacity.unit);
      if (L.warn.includes('FULL')) add('bad', 'الخزان ممتلئ: ' + n0(s.vol) + ' من ' + n0(cap) + ' ' + unit + ' (المتبقي ' + n0(room) + '). ما قبله يتوقف.', 'بِع من ☰ ← «بيع»، أو وصّل خطاً خارجاً، أو ابنِ خزاناً ملاصقاً ليصبحا مجموعة.');
      else if (L.warn.includes('NEAR_FULL')) add('warn', 'شبه ممتلئ: ' + pct(fill) + ' · المتبقي ' + n0(room) + ' ' + unit + (s._in > s._out ? ' (يمتلئ خلال ≈ ' + n1(room / Math.max(1e-9, (s._in || 0) - (s._out || 0))) + ' يوم)' : '') + '.', 'جهّز البيع أو خزاناً إضافياً.');
      if (st === 'BLOCKED') add('bad', 'يصله منتج غير ' + prodName(C, def.product) + ' فيرفضه.', 'افصل الخط الخطأ ووصّله بخزان من نوع منتجه.');
      if (!anyIn && !anyOut) add('info', 'غير موصول بأنابيب' + (def.product === 'CRUDE' ? ': يعمل تخزيناً تجارياً يقبل النفط المشترى فقط.' : '.'), 'اضغط «🔗 توصيل» لربطه بمصدر.');
      if (T === 'gas' && L.warn.includes('HIGH_PRESSURE')) add('warn', 'ضغط الغاز ' + n0(s.press) + ' psi قريب من الحد ' + n0(def.params.maxPressure) + '.', 'بِع الغاز أو أضف كرة غاز.');
    }
    if (T === 'separator' || T === 'refinery') {
      const minP = T === 'refinery' ? C.BC.REFINERY.minInletPsi : def.params.minInletPsi;
      if (!anyIn) add('bad', 'منفذ الدخول غير موصول: لا يصلها خام.', 'وصّل خزان خام أو محطة مركزية إلى منفذ الدخول.');
      if (st === 'NO_OUTPUT') add('bad', T === 'refinery' ? 'لا يوجد أي مخرج منتج موصول.' : 'مخرج النفط غير موصول.', 'وصّل المخرج بخزان مناسب.');
      if (st === 'LOW_PRESSURE') add('warn', 'ضغط الدخول ' + n0(s.pIn) + ' psi أقل من ' + n0(minP) + ' psi.', 'ضع مضخة على خط التغذية أو قرّب المصدر.');
      if (st === 'BLOCKED') { const why = blockedOutlet(C, b, L); add('bad', why ? why.t : 'خزانات المخرجات لا تستوعب: توقف التشغيل كله.', why ? why.fix : 'بِع المنتجات أو أضف خزانات.'); }
      if (st === 'OVER_CAPACITY') add('info', 'يصلها ' + n0(s._off) + ' برميل/يوم وهي تأخذ ' + n0(s._in) + ' فقط (السعة × حد التشغيل × الكفاءة)؛ الباقي ينتظر في المصدر ولا يضيع.', T === 'refinery' ? 'ارفع «حد التشغيل» إلى 100% أو ابنِ مصفاة إضافية.' : 'ابنِ فاصلاً إضافياً.');
      if (anyIn && st === 'NO_INPUT') add('warn', 'موصولة لكن لا يصلها خام الآن.', 'تأكد أن خزان الخام قبلها فيه نفط وأن الصمامات والقنوات مفتوحة.');
      if (T === 'separator') { if (!L.conn.find(x => x.c.id === 'GAS_OUT').e) add('info', 'مخرج الغاز غير موصول: الغاز المفصول يُحرق.', 'وصّله بكرة غاز إن أردت بيعه.'); }
      if (T === 'refinery') {
        const MU = C.EC && C.EC.MATERIAL_USE, co = C.company, cap = def.params.cap;
        if (st === 'NO_MATERIALS' || (s.matLim != null && s.matLim < 0.999)) {
          const mats = co && co.mats ? co.mats : {}, need = MU ? { CHEM: cap * MU.CHEM.qty, OPS: cap * MU.OPS.qty } : null;
          add(s.matLim > 0 ? 'warn' : 'bad', 'المواد لا تكفي: تعمل بـ ' + pct(s.matLim || 0) + ' من سعتها.' + (need ? ' المخزون: كيماويات ' + n0(mats.CHEM) + ' كغ (تحتاج ' + n0(need.CHEM) + ' كغ/يوم عند السعة الكاملة) · مواد تشغيل ' + n0(mats.OPS) + ' وحدة (تحتاج ' + n1(need.OPS) + ' وحدة/يوم).' : ''), 'افتح ☰ ← «الشراء» واشترِ «مواد كيميائية» و«مواد تشغيل». يتحسن التشغيل فوراً عند وصولها.');
        }
        const miss = ['GASOLINE_OUT', 'DIESEL_OUT', 'JET_OUT', 'GAS_OUT'].filter(id => { const x = L.conn.find(y => y.c.id === id); return x && !x.e; });
        if (anyOut && miss.length) add('warn', 'مخارج غير موصولة: ' + miss.map(m => ({ GASOLINE_OUT: 'البنزين', DIESEL_OUT: 'الديزل', JET_OUT: 'وقود الطائرات', GAS_OUT: 'الغاز' })[m]).join('، ') + ' — نصيبها من الإنتاج لا يُخزَّن' + (miss.includes('GAS_OUT') ? ' (الغاز يُحرق)' : '') + '.', 'وصّل كل مخرج بخزان من نفس المنتج.');
        if (s.opLimit < 1) add('info', 'حد التشغيل مضبوط على ' + pct(s.opLimit) + '.', 'اضغط «حد التشغيل» للعودة إلى 100%.');
      }
    }
    if (T === 'central') {
      const cn = C.pipes && C.pipes.central, st0 = cn && cn.stOf ? cn.stOf(b.id) : null;
      if (!st0) add('warn', 'المحطة غير مسجّلة في الشبكة المركزية.', 'استعمل محطات الشبكة أو أنشئ فرعاً من لوحة الشبكة المركزية.');
      if (cn) for (const c of (def.params.channels || [])) { const ci = cn.channelInfo(c); if (ci.state === 'CLOSED') add('warn', 'قناة ' + prodName(C, c) + ' مغلقة: لا تستقبل ولا توزع.', 'افتحها من لوحة «🛢️ الشبكة المركزية».'); else if (ci.fault) add('bad', 'قناة ' + prodName(C, c) + ' معطّلة.', 'أصلحها من لوحة الشبكة المركزية.'); else if (ci.faultySegs) add('warn', 'في قناة ' + prodName(C, c) + ' مقطع مقطوع: قد تلتف الحركة أو تتوقف بين بعض المحطات.', 'المس الخط عند المقطع واضغط 🔧 لإصلاحه.'); }
      if (!linked(L).length) add('info', 'لا توجد منشأة موصولة بهذه المحطة: لا ترسل ولا تستقبل شيئاً.', 'اضغط «🔗 توصيل» ثم اختر المنشأة.');
    }
    if (!I.length) add('ok', st === 'RUNNING' ? 'تعمل بشكل طبيعي ولا توجد مشكلة.' : 'لا توجد مشكلة حالياً.', '');
    return I;
  }
  /* the refinery / separator outlet that takes nothing (set by the Sim in s._blkPort): a full tank, or a central channel with no receiving tank anywhere */
  function blockedOutlet(C, b, L) {
    const port = L.s._blkPort, x = port && L.conn.find(y => y.c.id === port); if (!x || !x.other) return null; const pn = prodName(C, x.c.product), od = C.B.DEFS[x.other.d];
    const head = 'المصفاة متوقفة بالكامل لأن مخرج ' + pn + ' لا يجد من يستقبله (كل المنتجات تخرج معاً بنسب ثابتة، فإذا تعذّر واحد توقف الكل): ';
    if (od.type === 'central') { const cn = C.pipes && C.pipes.central, rc = cn ? cn.receivers(C.SIM, x.c.product, null, null).filter(r => r.b.id !== x.other.id || true) : [];
      const tanks = rc.filter(r => { const e = C.SIM.edgeOf(r.b, r.port), o = e && C.SIM.other(e, r.b, r.port); return o && o.b && o.b.id !== b.id; });
      if (!tanks.length) return { t: head + 'المخرج موصول بمحطة الشبكة المركزية ' + x.other.id + '، لكن لا يوجد أي خزان ' + pn + ' موصول بأي محطة على قناة ' + pn + '.', fix: 'ابنِ خزان ' + pn + ' ووصّله بأي محطة ربط مركزية، أو وصّل مخرج ' + pn + ' بخزان مباشرة.' };
      return { t: head + 'خزانات ' + pn + ' الموصولة بالشبكة لا تستوعب الآن (ممتلئة أو بعيدة جداً بضغط غير كافٍ).', fix: 'بِع ' + pn + ' أو أضف خزاناً، أو ضع مضخة على قناة ' + pn + '.' }; }
    if (od.type === 'tank' || od.type === 'gas') return { t: head + esc(nameOf(C, x.other.d)) + ' ' + x.other.id + ' ممتلئ.', fix: 'بِع ' + pn + ' أو أضف خزاناً ملاصقاً.' };
    return { t: head + 'ما بعد المخرج (' + esc(nameOf(C, x.other.d)) + ' ' + x.other.id + ') لا يستقبل.', fix: 'تأكد من أن الخط بعده يصل إلى خزان ' + pn + ' فيه مكان.' };
  }
  /* what downstream stops a well: full tanks / saturated lines reachable from its outlets (first hops only, enough to point at the culprit) */
  function blockers(C, b) {
    const S = C.SIM, out = [], seen = new Set([b.id]), q = [b]; let guard = 0;
    while (q.length && guard++ < 40) { const x = q.shift(), d = C.B.DEFS[x.d];
      for (const c of ports(d)) { if (c.role === 'in') continue; const e = S.edgeOf(x, c.id); if (!e) continue; if (e.over) out.push('الأنبوب من ' + esc(nameOf(C, x.d)) + ' ' + x.id + ' فوق سعته'); const o = S.other(e, x, c.id); if (!o || !o.b || seen.has(o.b.id)) continue; seen.add(o.b.id);
        const od = C.B.DEFS[o.b.d], os = S.ensure(o.b); if ((od.type === 'tank' || od.type === 'gas') && os.vol >= od.capacity.value * 0.999) out.push(esc(nameOf(C, o.b.d)) + ' ' + o.b.id + ' ممتلئ'); else if (od.type !== 'tank' && od.type !== 'gas') q.push(o.b); } }
    return [...new Set(out)].slice(0, 4);
  }

  /* ================================================================ public: documents */
  function statusOf(code) { return { code, text: STATUS_AR[code] || code, tone: TONE[code] || (code === 'DEPLETED' || code === 'DAMAGED' || /^NO_/.test(code) ? 'bad' : 'info') }; }
  function building(c, b) {
    const C = ctxOf(c), L = live(C, b), def = L.def, info = infoOf(C, def.id), { sec, prof } = sectionsFor(C, def, L, b), issues = diagnose(C, b, L);
    sec.state = ['الحالة: ' + b_(STATUS_AR[L.st] || L.st) + '.'];
    if (C.SIM) { const ind = C.SIM.indicators(b).list.filter(i => i.k !== 'Status' && typeof i.v === 'number').slice(0, 10); const AR = { Production: 'الإنتاج', Pressure: 'الضغط', 'Reservoir Pressure': 'ضغط المكمن', 'Remaining Reserve': 'الاحتياطي المتبقي', 'Water Cut': 'نسبة الماء', Gas: 'الغاز', Efficiency: 'الكفاءة', 'Flow In': 'تدفق الدخول', 'Flow Out': 'تدفق الخروج', 'Pressure In': 'ضغط الدخول', 'Pressure Out': 'ضغط الخروج', Boost: 'الدفعة', Power: 'القدرة', Utilization: 'نسبة الاستغلال', Flow: 'التدفق', 'Max Flow': 'أقصى تدفق', 'Pressure Rating': 'تحمّل الضغط', Opening: 'نسبة الفتح', 'Max Total Flow': 'أقصى تدفق إجمالي', 'Pressure Limit': 'حد الضغط', Ports: 'المنافذ', Level: 'المخزون', Capacity: 'السعة', Fill: 'الامتلاء', 'Input Flow': 'الداخل', 'Output Flow': 'الخارج', 'Available Capacity': 'المساحة الحرة', 'Current Level': 'المخزون', 'Gas Capacity': 'السعة', Temperature: 'الحرارة', 'Feed In': 'الداخل', 'Oil Out': 'نفط خارج', 'Gas Out': 'غاز خارج', 'Water Out': 'ماء خارج', Feed: 'الداخل', Throughput: 'ما يُكرَّر', Gasoline: 'بنزين', Diesel: 'ديزل', 'Jet Fuel': 'وقود طائرات', 'Group Tanks': 'خزانات المجموعة', 'Group Capacity': 'سعة المجموعة', 'Group Stock': 'مخزون المجموعة', 'Group Free': 'المساحة الحرة للمجموعة', 'Purchased Oil': 'نفط مشترى', 'Produced Oil': 'نفط منتج', Input: 'الداخل', Output: 'الخارج', 'Max Pressure': 'الضغط الأقصى', 'Gas / LPG': 'غاز', Other: 'منتجات أخرى', 'Output 1 Flow': 'تدفق المخرج 1', 'Output 2 Flow': 'تدفق المخرج 2', 'Output 3 Flow': 'تدفق المخرج 3' };
      const UN = { 'bbl/day': 'برميل/يوم', bbl: 'برميل', boe: 'برميل مكافئ', 'boe/day': 'برميل مكافئ/يوم', psi: 'psi', '%': '%', kW: 'كيلوواط', '°C': '°م' };
      for (const i of ind) if (AR[i.k]) sec.state.push(AR[i.k] + ': ' + n0(i.v) + ' ' + (UN[i.u] || i.u)); }
    if (def.type === 'tank' && def.product === 'CRUDE' && C.SIM && C.SIM.tankKind) sec.state.push('نوع الخزان: ' + (TANK_KIND_AR[C.SIM.tankKind(b)] || '—'));
    sec.fix = issues.map(x => x.t + (x.fix ? ' ← <i>الحل: ' + x.fix + '</i>' : ''));
    sec.fix.push('أسباب شائعة لتوقف هذا النوع: ' + commonCauses(def));
    sec.ex = (prof.ex && prof.ex.length ? prof.ex : ['—']);
    return { kind: 'building', id: b.id, def: def.id, icon: info.icon || '🏗️', name: nameOf(C, def.id) + ' ' + b.id, status: statusOf(L.st), issues, sec };
  }
  function definition(c, id) {
    const C = ctxOf(c), def = C.B.DEFS[id]; if (id === 'pipe') return pipeDef(C); if (!def) return null; const info = infoOf(C, id), { sec, prof } = sectionsFor(C, def, null, null);
    sec.state = ['لم تُبنَ بعد. بعد البناء يظهر هنا وضعها الحي: يعمل، متوقف، ممتلئ، ينقصه شيء…'];
    sec.fix = ['أسباب شائعة لتوقف هذا النوع: ' + commonCauses(def)]; sec.ex = prof.ex && prof.ex.length ? prof.ex : ['—'];
    return { kind: 'def', def: id, icon: info.icon || '🏗️', name: nameOf(C, id), status: { code: 'PLAN', text: 'قبل البناء', tone: 'info' }, issues: [], sec };
  }
  function commonCauses(def) {
    return ({ well: 'لم يُضغط «ابدأ الإنتاج»، لا أنبوب خارج، خزان ممتلئ بعده، نضوب الحقل.', pump: 'منفذ غير موصول، ضغط دخول منخفض، تدفق فوق طاقتها.', valve: 'الصمام مغلق أو مفتوح جزئياً.', junction: 'تدفق فوق الحد الإجمالي، خط واحد فقط موصول.', tank: 'امتلاء الخزان، منتج خطأ في الخط، لا خط خروج ولا بيع.', gas: 'امتلاء الكرة وارتفاع الضغط.', separator: 'لا خام داخل، مخرج النفط غير موصول، ضغط دخول أقل من الحد، خزان النفط بعده ممتلئ.', refinery: 'نقص الكيماويات أو مواد التشغيل، لا خام، مخرج موصول لا يجد خزاناً لمنتجه، مخارج غير موصولة، خزانات المنتجات ممتلئة، ضغط دخول منخفض.', central: 'قناة مغلقة أو معطّلة، مقطع مقطوع، لا منشأة موصولة بالمنفذ المطابق.' })[def.type] || 'منفذ غير موصول أو لا يصلها شيء.';
  }
  /* a pipeline line */
  function pipe(c, L) {
    const C = ctxOf(c), BC = C.BC, sp = BC.PIPES[L.dia] || BC.PIPES[BC.PIPE_DEFAULT], S = C.SIM, info = S && L.path && L.path.length ? S.pipeInfo(L.path[0][0], L.path[0][1]) : null, open = !(L.a && L.b), sec = {}, I = [], add = (tone, t, fix) => I.push({ tone, t, fix });
    const end = (e, at) => e ? esc(nameOf(C, (C.store.get(e.b) || {}).d)) + ' ' + e.b + ' (' + portAr(C, e) + ')' : 'طرف مفتوح عند المربع (' + at[0] + '، ' + at[1] + ')';
    sec.what = ['ينقل منتجاً واحداً بين منشأتين. المنتج يُحدد من أول ما يمر فيه ولا يُخلط بغيره.'];
    sec.how = ['من «🔧 الأنابيب» ← «ارسم أنبوباً» ثم اضغط المنشأة الأولى ثم الثانية؛ أو «🔗 توصيل» من بطاقة المنشأة.', 'من بطاقة الأنبوب: تعديل المسار، إضافة وصلة، إغلاق/فتح الخط، إعادة الرسم، الحذف (مع استرداد الثمن).'];
    sec.in = ['من: ' + end(L.a, L.path[0])]; sec.out = ['إلى: ' + end(L.b, L.path[L.path.length - 1])];
    sec.cap = ['القطر ' + L.dia + ' بوصة: سعة ' + b_(n0(sp.capacity)) + ' برميل/يوم · ضغط أقصى ' + n0(sp.maxPressure) + ' ' + PSI + '.', 'الأقطار المتاحة: ' + Object.keys(BC.PIPES).map(d => d + '″ = ' + n0(BC.PIPES[d].capacity) + ' برميل/يوم').join(' · ') + '.'];
    if (info) sec.cap.push('الآن: يمر ' + b_(n0(info.currentFlow)) + ' برميل/يوم (' + pct(info.currentFlow / sp.capacity) + ') بضغط ' + n0(info.pressure) + ' psi.');
    sec.build = ['الطول ' + L.path.length + ' مربعاً (' + n0(L.path.length * BC.TILE_METERS) + ' متر).', 'لا يمر فوق المباني أو الأنبوب المركزي.'];
    sec.conn = ['طرف البداية: ' + end(L.a, L.path[0]), 'طرف النهاية: ' + end(L.b, L.path[L.path.length - 1]), 'المنتج: ' + (L.product && L.product !== '*' ? prodName(C, L.product) : 'غير محدد بعد')];
    sec.eff = ['↓ كل مربع يفقد ضغطاً بالاحتكاك (معامل هذا القطر ' + sp.fric + '): الخط الطويل يحتاج مضخة.', '↓ التدفق فوق السعة لا يمر.', '↑ القطر الأكبر يحمل أكثر ويفقد ضغطاً أقل.'];
    sec.cost = ['البناء: ' + money(sp.cost) + ' لكل مربع × ' + L.path.length + ' = ' + money(sp.cost * L.path.length) + '.', 'الحذف يعيد الثمن كاملاً.'];
    if (open) add('bad', 'الأنبوب غير متصل من أحد طرفيه: ' + (!L.a ? 'البداية عند (' + L.path[0].join('، ') + ')' : 'النهاية عند (' + L.path[L.path.length - 1].join('، ') + ')') + '.', 'اضغط «وصّل الطرف المفتوح» في بطاقة الأنبوب ثم المنشأة.');
    if (L.open === false) add('warn', 'الخط مغلق بصمامه: لا يمر شيء.', 'افتحه من زر الصمام في بطاقة الأنبوب.');
    if (info && info.status === 'OVER_CAPACITY') add('warn', 'التدفق فوق سعة الأنبوب ' + n0(sp.capacity) + ' برميل/يوم.', 'ارسم خطاً موازياً أو أعد رسمه بقطر أكبر.');
    if (info && info.status === 'LOW_PRESSURE') add('warn', 'الضغط منخفض في هذا الخط.', 'ضع مضخة على المسار أو اختصره.');
    if (info && info.status === 'HIGH_PRESSURE') add('warn', 'الضغط فوق حد الأنبوب ' + n0(sp.maxPressure) + ' psi.', 'استعمل قطراً يتحمل ضغطاً أعلى أو أبعد المضخة.');
    if (!I.length) add('ok', info && info.currentFlow > 0 ? 'الخط يعمل.' : 'الخط متصل ولا يمر فيه شيء الآن (المصدر لا يرسل أو الوجهة ممتلئة).', '');
    sec.state = ['الحالة: ' + (open ? 'غير متصل' : L.open === false ? 'مغلق' : info && info.currentFlow > 0 ? 'يعمل' : 'متصل') + '.']; sec.fix = I.map(x => x.t + (x.fix ? ' ← <i>الحل: ' + x.fix + '</i>' : ''));
    sec.ex = ['بئر 2,000 برميل/يوم يكفيه أنبوب 8″ (30,000)، أما عشرون بئراً معاً (40,000) فتحتاج 16″.'];
    return { kind: 'pipe', icon: '🔧', name: 'خط أنابيب ' + L.id, status: open ? { code: 'NO_OUTPUT', text: 'غير متصل', tone: 'bad' } : statusOf(info && info.currentFlow > 0 ? 'RUNNING' : 'READY'), issues: I, sec };
  }
  /* pipes before drawing one (build menu) */
  function pipeDef(C) {
    const BC = C.BC, P = BC.PIPES, ds = Object.keys(P), sec = {};
    sec.what = ['ينقل منتجاً واحداً (نفط خام أو بنزين أو ديزل أو وقود طائرات أو غاز أو ماء) بين منشأتين، ولا يُخلط منتجان في أنبوب واحد.'];
    sec.how = ['«🔧 الأنابيب» ← «ارسم أنبوباً» ثم اضغط المنشأة الأولى ثم الثانية؛ أو «🔗 توصيل» من بطاقة المنشأة فيُرسم المسار تلقائياً.', 'يمكن ترك طرف مفتوح ووصله لاحقاً.'];
    sec.in = ['ما يخرج من منفذ المنشأة في بدايته.']; sec.out = ['يسلّمه إلى منفذ المنشأة في نهايته.'];
    sec.cap = ds.map(d => 'قطر ' + d + ' بوصة: ' + b_(n0(P[d].capacity)) + ' برميل/يوم · ضغط أقصى ' + n0(P[d].maxPressure) + ' psi');
    sec.build = ['يمر على المربعات الفارغة ولا يعبر المباني أو الأنبوب المركزي.', 'المربع = ' + BC.TILE_METERS + ' متراً.'];
    sec.conn = ['يتصل بأي منفذ دخول/خروج يقبل منتجه؛ نقطة الربط تجمع أو تقسّم الخطوط.'];
    sec.eff = ['كل مربع يفقد ضغطاً بالاحتكاك (معامل ' + ds.map(d => d + '″ = ' + P[d].fric).join('، ') + ')؛ الخط الطويل يحتاج مضخة.'];
    sec.cost = ds.map(d => 'قطر ' + d + '″: ' + money(P[d].cost) + ' لكل مربع').concat(['الحذف يعيد الثمن كاملاً.']);
    sec.state = ['لم يُرسم بعد.']; sec.fix = ['أسباب شائعة: طرف مفتوح غير موصول، صمام الخط مغلق، تدفق فوق سعة القطر، ضغط منخفض في خط طويل.'];
    sec.ex = ['بئر 2,000 برميل/يوم يكفيه أنبوب 8″ (' + n0(P[8] ? P[8].capacity : 0) + ')، أما عشرون بئراً معاً (40,000) فتحتاج 16″.'];
    return { kind: 'def', def: 'pipe', icon: '🔧', name: 'خط أنابيب', status: { code: 'PLAN', text: 'قبل الرسم', tone: 'info' }, issues: [], sec };
  }
  /* a segment of the central trunk */
  function segment(c, g) {
    const C = ctxOf(c), CEN = C.CEN, cn = C.pipes.central, cls = CEN.CLASS, PU = CEN.PUMP, sec = {}, I = [], add = (tone, t, fix) => I.push({ tone, t, fix });
    const kind = g.kind === 'loop' ? 'حلقة بديلة' : g.kind === 'coast' ? 'وصلة ساحلية' : 'خط رئيسي';
    sec.what = ['جزء من الأنبوب المركزي (' + kind + ') بين المحطتين ' + g.a + ' و' + g.b + '.', 'يحمل ست قنوات منفصلة: ' + CEN.CHANNELS.map(x => prodName(C, x)).join('، ') + '.'];
    sec.how = ['لا تحتاج تشغيله: ينقل تلقائياً ما ترسله المحطات إلى من يطلب.', 'المس الخط لترى تدفق كل قناة، أو لتقطع قناة/تصلحها (✂/🔧)، أو لإنشاء فرع جديد (🔀 فرع هنا).'];
    sec.in = ['ما ترسله المنشآت الموصولة بالمحطات.']; sec.out = ['تسليم إلى المنشآت الطالبة عبر المحطات.'];
    sec.cap = ['كل قناة ' + b_(n0(cls.capacity)) + ' برميل/يوم وضغط أقصى ' + n0(cls.maxPressure) + ' ' + PSI + '.', 'الطول ' + g.path.length + ' مربعاً.'];
    for (const x of CEN.CHANNELS) sec.cap.push('• ' + prodName(C, x) + ': ' + (g.fault[x] ? 'مقطوعة' : n0(g.f[x].flow) + ' برميل/يوم'));
    sec.build = ['مبني مسبقاً ضمن الشبكة. يمكن إضافة محطة ربط بجانب أي نقطة منه (3×3، على أرض غير منحدرة، ليست ماء).'];
    sec.conn = ['طرفاه: المحطة ' + g.a + ' والمحطة ' + g.b + '.', 'الوصول إليه من المنشآت يكون بأنبوب عادي إلى منفذ المحطة المطابق للمنتج.'];
    const pumps = CEN.CHANNELS.reduce((a, x) => a.concat(cn.pumpsOn(g, x)), []);
    sec.eff = ['↓ الاحتكاك يُفقد ضغطاً على طول المقطع.', '↑ مضخة الشبكة (دفعة ' + n0(PU.boost[0]) + '–' + n0(PU.boost[1]) + ' psi، حتى ' + n0(PU.maxFlow) + ' برميل/يوم) تدعم الاتجاه المضبوط لها فقط.'];
    for (const p of pumps) sec.eff.push('• مضخة ' + prodName(C, p.ch) + ' عند ' + p.st + ': ' + (p.dir === 1 ? 'أمامي' : 'عكسي') + ' — تدفع من ' + (p.dir === 1 ? g.a : g.b) + ' إلى ' + (p.dir === 1 ? g.b : g.a) + (p.fault ? ' (معطّلة)' : ''));
    sec.cost = ['الشبكة ممولة 100% بقرض (60 سنة · 6% · سماح سنتان)؛ سعر المربع ' + money(CEN.TILE_COST) + ' (ست قنوات 36″).', 'الصيانة والتشغيل تظهر في التقرير المالي للشبكة.'];
    for (const x of CEN.CHANNELS) { if (g.fault[x]) add('bad', 'قناة ' + prodName(C, x) + ' مقطوعة في هذا المقطع.', 'اضغط 🔧 ' + prodName(C, x) + ' في بطاقة المقطع.'); const ci = cn.channelInfo(x); if (ci.state === 'CLOSED') add('warn', 'قناة ' + prodName(C, x) + ' مغلقة في كل الشبكة.', 'افتحها من لوحة الشبكة المركزية.'); }
    for (const p of pumps) if (p.fault) add('warn', 'مضخة ' + prodName(C, p.ch) + ' عند ' + p.st + ' معطّلة: الحركة تمر بلا دعم ضغط.', 'اضغط 🔧 بجانبها.');
    if (!I.length) add('ok', 'المقطع سليم.', '');
    sec.state = ['الحالة: ' + (I.some(x => x.tone === 'bad') ? 'فيه قطع' : 'سليم') + '.']; sec.fix = I.map(x => x.t + (x.fix ? ' ← <i>الحل: ' + x.fix + '</i>' : ''));
    sec.ex = ['إذا قطعت قناة الخام هنا، يلتف الخام عبر الحلقة البديلة إن وُجد مسار آخر، وإلا يتوقف التسليم بين المحطات على جانبي القطع.'];
    return { kind: 'segment', icon: '🛢️', name: 'الأنبوب المركزي · ' + g.id, status: I.some(x => x.tone === 'bad') ? { code: 'FAULT', text: 'فيه قطع', tone: 'bad' } : statusOf('RUNNING'), issues: I, sec };
  }
  /* an oil field */
  function field(c, f, wells) {
    const C = ctxOf(c), W = C.BC.WELL, wd = C.B.DEFS.oil_well, p = f.props || {}, sec = {};
    sec.what = ['حقل نفط مكتشف: المكان الوحيد الذي تُحفر فيه الآبار.'];
    sec.how = ['اضغط «🛢️ حفر بئر» ثم ضع البئر داخل الحقل، وبعد البناء ابدأ الإنتاج.'];
    sec.in = ['لا يحتاج شيئاً.']; sec.out = ['النفط الخام عبر الآبار.'];
    sec.cap = [p.capacity ? 'سعة الحقل ' + b_(n0(p.capacity)) + ' برميل/يوم تتقاسمها آباره.' : 'الإنتاج الاسمي للبئر ' + n0(W.production[0]) + '–' + n0(W.production[1]) + ' برميل/يوم.'];
    if (f.remainingReserve != null) sec.cap.push('الاحتياطي المتبقي ' + b_(n0(f.remainingReserve)) + ' من ' + n0(f.initialReserve) + ' برميل.');
    if (f.pr != null) sec.cap.push('ضغط المكمن ' + pct(f.pr) + ' من بدايته.');
    sec.build = ['البئر 1×1 فوق الحقل، ' + (wd.allowedTerrain || []).map(t => TERRAIN_AR[t] || t).join('، ') + '.'];
    sec.conn = ['كل بئر يوصل بخزان أو فاصل أو نقطة ربط أو محطة مركزية.'];
    sec.eff = ['آبار أكثر تملأ سعة الحقل أسرع، لكنها لا تتجاوزها.', 'الضغط والإنتاج يهبطان مع السحب.'];
    sec.cost = ['البئر: ' + money(W.cost[0]) + ' – ' + money(W.cost[1]) + ' · تشغيل ' + money(W.op) + ' و صيانة ' + money(W.maint) + ' يومياً.'];
    sec.state = ['آبارك في هذا الحقل: ' + (wells || 0) + '.']; sec.fix = ['لا يوجد مشاكل في الحقل نفسه.']; sec.ex = ['حقل سعته 10,000 برميل/يوم: أربعة آبار اسمية 2,500 تملؤه؛ البئر الخامس لا يضيف نفطاً.'];
    return { kind: 'field', icon: '⛰️', name: 'حقل نفط' + (f.sector ? ' · ' + f.sector : ''), status: { code: 'FIELD', text: 'قابل للحفر', tone: 'ok' }, issues: [], sec };
  }

  /* ================================================================ rendering: ONE design for every help sheet */
  const CSS = '#hlp{position:fixed;inset:0;z-index:60;background:rgba(4,7,12,.72);display:none;align-items:flex-end;justify-content:center}#hlp.open{display:flex}'
    + '#hlp .bx{width:100%;max-width:640px;max-height:88vh;display:flex;flex-direction:column;background:#0f1a2e;border:2px solid #e6a13a;border-bottom:0;border-radius:18px 18px 0 0;color:#eef2f7;direction:rtl;font-family:system-ui,\'Noto Sans Arabic\',Tahoma,sans-serif}'
    + '#hlp .hd{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #2b3a52}#hlp .hd .ic{font-size:28px}#hlp .hd b{flex:1;font-size:17px}#hlp .hd button{min-width:44px;min-height:44px;border-radius:12px;background:#1d2a40;border:1px solid #3a4d6b;color:#fff;font-size:18px}'
    + '#hlp .pill{display:inline-block;padding:2px 10px;border-radius:99px;font-size:13px;font-weight:700;margin-top:2px}#hlp .t-ok{background:#1f4d33;color:#8dffb0}#hlp .t-warn{background:#4d3b1a;color:#ffd27a}#hlp .t-bad{background:#4d1f1f;color:#ff9a8a}#hlp .t-info{background:#1d3550;color:#9fd1ff}'
    + '#hlp .bd{overflow-y:auto;padding:10px 12px 18px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}#hlp .iss{border-radius:12px;padding:8px 10px;margin:0 0 8px;font-size:14px;line-height:1.6}#hlp .iss.t-ok,#hlp .iss.t-info,#hlp .iss.t-warn,#hlp .iss.t-bad{color:#eef2f7}#hlp .iss i{display:block;font-style:normal;color:#ffe2a6;margin-top:2px}'
    + '#hlp details{background:#15233a;border:1px solid #26385a;border-radius:12px;margin:0 0 6px}#hlp summary{list-style:none;padding:10px 12px;font-weight:800;font-size:15px;cursor:pointer;display:flex;gap:8px;align-items:center;min-height:24px}#hlp summary::-webkit-details-marker{display:none}#hlp summary::after{content:"▾";margin-inline-start:auto;color:#e6a13a}#hlp details[open] summary::after{content:"▴"}'
    + '#hlp ul{margin:0;padding:0 26px 10px 12px;font-size:14px;line-height:1.7}#hlp li{margin:2px 0}#hlp li i{font-style:normal;color:#ffe2a6}#hlp b{color:#fff}';
  function html(doc, openSet) {
    const tone = doc.status.tone || 'info';
    let h = '<div class="hd"><span class="ic">' + doc.icon + '</span><div style="flex:1;min-width:0"><b>ℹ️ ' + esc(doc.name) + '</b><br><span class="pill t-' + tone + '">● ' + esc(doc.status.text) + '</span></div><button id="hlp-x" aria-label="إغلاق">✕</button></div><div class="bd" id="hlp-bd">';
    for (const x of doc.issues.filter(x => x.tone !== 'ok')) h += '<div class="iss t-' + x.tone + '">' + (x.tone === 'bad' ? '⛔ ' : x.tone === 'warn' ? '⚠️ ' : 'ℹ️ ') + x.t + (x.fix ? '<i>✔ الحل: ' + x.fix + '</i>' : '') + '</div>';
    if (!doc.issues.some(x => x.tone !== 'ok') && doc.issues.length) h += '<div class="iss t-ok">✅ ' + doc.issues[0].t + '</div>';
    for (const [k, ic, t] of SECTIONS) { const L = doc.sec[k] || []; const op = openSet ? openSet.has(k) : (k === 'what' || k === 'state' || (k === 'fix' && doc.issues.some(x => x.tone !== 'ok'))); h += '<details data-k="' + k + '"' + (op ? ' open' : '') + '><summary>' + ic + ' ' + t + '</summary><ul>' + (L.length ? L : ['—']).map(x => '<li>' + x + '</li>').join('') + '</ul></details>'; }
    return h + '</div>';
  }

  /* ================================================================ browser: the sheet (opened by the ℹ️ of the info card) */
  let env = null, cur = null, el = null, timer = null;
  function docOf(t) {
    if (!env || !t) return null; const C = env.ctx();
    if (t.kind === 'b') { const b = C.store.get(t.id); return b ? building(C, b) : null; }
    if (t.kind === 'd') return definition(C, t.id);
    if (t.kind === 'p') { const L = C.pipes.lineAt(t.x, t.y); return L ? pipe(C, L) : null; }
    if (t.kind === 'c') { const cn = C.pipes.central, tp = cn && cn.tapPoint(t.x, t.y); return tp ? segment(C, tp.seg) : null; }
    if (t.kind === 'f') return field(C, t.f, t.wells);
    return null;
  }
  function paint() {
    if (!el || !cur) return; const d = docOf(cur); if (!d) { close(); return; }
    const bd = el.querySelector('#hlp-bd'), top = bd ? bd.scrollTop : 0, open = bd ? new Set([...el.querySelectorAll('details[open]')].map(x => x.dataset.k)) : null;
    const h = html(d, open); if (el._h === h) return; el._h = h; el.querySelector('.bx').innerHTML = h; const nb = el.querySelector('#hlp-bd'); if (nb) nb.scrollTop = top;
  }
  function open(t) { if (!el) return false; cur = t; el._h = null; el.querySelector('.bx').innerHTML = ''; paint(); if (!el._h) return false; el.classList.add('open'); clearInterval(timer); timer = setInterval(paint, 1000); return true; }
  function close() { if (!el) return; el.classList.remove('open'); cur = null; clearInterval(timer); timer = null; }
  function mount(e) {
    env = e; const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'hlp'; el.innerHTML = '<div class="bx" role="dialog" aria-label="مساعدة"></div>'; document.body.appendChild(el);
    for (const k of ['pointerdown', 'touchstart', 'wheel']) el.addEventListener(k, ev => ev.stopPropagation(), { passive: true });       // the map under the sheet never pans or zooms
    el.addEventListener('click', ev => { if (ev.target === el || ev.target.closest('#hlp-x')) close(); });
    /* the ℹ️ drawn in the corner of the info card is now a real button: a tap within its corner opens the help of what the card shows */
    const info = document.getElementById('info');
    const hit = ev => { const r = info.getBoundingClientRect(), x = ev.clientX, y = ev.clientY, sz = Math.max(48, Math.min(64, r.width * .14)); return document.dir === 'ltr' ? (x < r.left + sz && y < r.top + sz) : (x > r.right - sz && y < r.top + sz); };
    info.addEventListener('click', ev => { if (ev.target.closest('button,input,a')) return; if (!hit(ev) && !ev.target.closest('.hlp-i')) return; const t = env.target(); if (!t) return; ev.stopPropagation(); open(t); }, true);
    return { open, close };
  }

  return { SECTIONS, STATUS_AR, PROFILE, building, definition, pipe, segment, field, html, mount, open, close, isOpen: () => !!(el && el.classList.contains('open')) };
});
