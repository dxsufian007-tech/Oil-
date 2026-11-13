/* Oli - network-diag-central.js : NETWORK DIAGNOSTICS for the CENTRAL HYBRID NETWORK (read-only, on demand, never per frame).
 *
 *  An independent inspector for the Central trunk: stations (building + footprint), segments (main / loop / coast), central pumps and the six channels.  It reads net.central (central.js) and the
 *  store; it never writes to either and never calls the planner (plan / deliver / begin / end), so the flow and every simulation result stay exactly as they were.
 *
 *    runCentral(store, net, { sim, locate, solved, history }) -> { faults, stats, healthySegs, notes }
 *
 *  Finding shape = network-diag.js (no, code, kindAr, severity CRITICAL|HIGH|MEDIUM|LOW, confirmed, indicator, element{type,id,label}, zone, x, y, prev, next, cause, effect, fix, evidence).
 *  confirmed = a fact read from the saved structure / the engine's own state; warning = something to review; indicator = engine figure with no proven effect on flow (counted apart).
 *  Not modelled by the engine, therefore never reported: leaks / losses, per-segment pressure (the engine keeps pressure per channel only).
 *  What a segment's drawn path looks like (gaps, ends away from a station) never changes the flow - the engine routes by the registered station-to-station connection - so those are warnings / indicators. */
(function (root) {
  'use strict';
  const BD = typeof require === 'function' ? require('./buildings.js') : root.OliBuildings;
  const SEV = { CRITICAL: { rank: 0, ar: 'حرج', color: '#ff3b30' }, HIGH: { rank: 1, ar: 'مرتفع', color: '#ff9500' }, MEDIUM: { rank: 2, ar: 'متوسط', color: '#ffd60a' }, LOW: { rank: 3, ar: 'منخفض', color: '#8e9aaf' } };
  const CHANNELS = ['CRUDE', 'WATER', 'GASOLINE', 'DIESEL', 'JET_FUEL', 'GAS'], CH_AR = { CRUDE: 'الخام', WATER: 'المياه', GASOLINE: 'البنزين', DIESEL: 'الديزل', JET_FUEL: 'وقود الطائرات', GAS: 'الغاز' };
  const CH_OF_PORT = {}; for (const c of CHANNELS) { CH_OF_PORT[c + '_PORT'] = c; CH_OF_PORT[c + '_PORT2'] = c; }
  const NEAR_CAP = 0.95, OK_COLOR = '#34c759';
  const KIND_AR = {
    C_SEG_NO_STATION: 'قطاع بلا محطة طرف', C_SEG_FAULT: 'قطاع معطّل (قناة)', C_SEG_GAP: 'رسم قطاع متقطّع', C_SEG_END: 'مؤشر: نهاية القطاع بعيدة عن المحطة', C_SEG_ON_BUILDING: 'قطاع يعبر منشأة', C_SEG_NEAR_CAP: 'قطاع قرب السعة',
    C_STATION_NO_BUILDING: 'محطة بلا منشأة', C_BUILDING_NO_STATION: 'منشأة Central بلا محطة', C_STATION_DAMAGED: 'محطة متضرّرة', C_STATION_ISOLATED: 'محطة معزولة عن الجذع', C_NET_SPLIT: 'شبكة Central منقسمة',
    C_PUMP_NO_STATION: 'مضخة مركزية بلا محطة', C_PUMP_NO_SEG: 'مضخة مركزية بلا قطاع', C_PUMP_SEG_FAR: 'مضخة على قطاع لا يمس محطتها', C_PUMP_FAULT: 'مضخة مركزية معطّلة', C_PUMP_CHANNEL_DOWN: 'مضخة على قناة متوقفة', C_PUMP_LOWIN: 'ضغط شفط منخفض',
    C_CH_FAULT: 'قناة معطّلة', C_CH_CLOSED: 'قناة مغلقة', C_CH_PARTITION: 'قناة مقسومة بسبب أعطال', C_CH_HIGH_PRESSURE: 'مؤشر: ضغط القناة فوق التصنيف', C_CH_SATURATED: 'قناة مشبعة'
  };
  const nf = n => Math.round(n || 0).toLocaleString('en-US');
  const sevOf = s => (SEV[s] || SEV.LOW).rank;

  function runCentral(store, net, opts) {
    opts = opts || {}; const sim = opts.sim, locate = opts.locate, C = net && net.central, notes = [], faults = [];
    const empty = { faults, healthySegs: [], notes, SEV, OK_COLOR, CH_AR, stats: { stations: 0, segments: 0, pumps: 0, channels: 0, tiles: 0, branches: 0, checked: 0, healthy: 0, faults: 0, warnings: 0, indicators: 0, critical: 0, health: 100, solved: false, present: false } };
    if (!C || !C.st || !C.st.size) { notes.push('لا توجد شبكة Central في هذا الحفظ.'); return empty; }
    const solved = !!sim && !(sim.dirty && sim.dirty()) && opts.solved !== false;
    if (!sim) notes.push('لم تُمرَّر المحاكاة: فحوص التدفق والضغط في Central تُتجاوز.'); else if (!solved) notes.push('المحاكاة غير محدّثة منذ آخر تعديل: فحوص التدفق والضغط في Central تعتمد على آخر حل.');
    const where = (x, y) => (locate ? (locate(x, y) || 'غير محددة') : 'غير محددة (لا توجد خريطة)');
    let counter = 0; const add = f => { f.id = ++counter; f.sev = f.severity; f.zone = f.global ? 'القناة كلها (ليست في مكان واحد)' : where(f.x, f.y); f.kindAr = KIND_AR[f.code] || f.code; if (f.confirmed == null) f.confirmed = true; f.central = true; faults.push(f); return f; };
    const stations = [...C.st.values()], segs = [...C.seg.values()], pumps = [...C.pumps.values()];
    const stLabel = s => 'محطة Central ' + s.id + (s.b != null ? ' (#' + s.b + ')' : ''), segLabel = g => 'قطاع ' + g.id + ' (' + g.kind + ')', pumpLabel = p => 'مضخة مركزية ' + p.id + ' · ' + (CH_AR[p.ch] || p.ch);
    const stEl = s => ({ type: 'CSTATION', id: s.id, label: stLabel(s) }), segEl = g => ({ type: 'CSEG', id: g.id, label: segLabel(g) }), pumpEl = p => ({ type: 'CPUMP', id: p.id, label: pumpLabel(p) });
    const segMid = g => { const p = g.path && g.path.length ? g.path[g.path.length >> 1] : [0, 0]; return { x: p[0], y: p[1] }; };
    const bad = { seg: new Set(), st: new Set(), pump: new Set(), ch: new Set() };      // elements carrying a finding that is not an indicator
    const note = (kind, id, f) => { if (!f.indicator) bad[kind].add(id); return add(f); };

    /* ---- the structure: adjacency of stations by segment (all / per channel with only the segments that are up) ---- */
    const comp = (up) => { const par = new Map(); const find = x => { let r = x; while (par.get(r) !== r) r = par.get(r); while (par.get(x) !== r) { const n = par.get(x); par.set(x, r); x = n; } return r; };
      for (const s of stations) par.set(s.id, s.id); for (const g of segs) { if (!par.has(g.a) || !par.has(g.b) || !up(g)) continue; const ra = find(g.a), rb = find(g.b); if (ra !== rb) par.set(rb, ra); } return find; };
    const segsAt = new Map(); for (const g of segs) for (const e of [g.a, g.b]) { let a = segsAt.get(e); if (!a) segsAt.set(e, a = []); a.push(g); }

    /* ---- the branches: ordinary pipe lines from a station port, per station and channel ---- */
    const byB = new Map(); for (const s of stations) if (s.b != null) byB.set(s.b, s); const stOf = id => byB.get(id) || null;      // own index: the net's cache is never touched
    const branch = new Map(), branchCh = new Map(); let branches = 0;
    for (const L of net.lines.values()) for (const e of [L.a, L.b]) { if (!e) continue; const st = stOf(e.b), ch = CH_OF_PORT[e.port]; if (!st || !ch) continue; branches++; branch.set(st.id, (branch.get(st.id) || 0) + 1); const k = st.id + '|' + ch; branchCh.set(k, (branchCh.get(k) || 0) + 1); }
    const hasBranch = (sid, ch) => branchCh.has(sid + '|' + ch);

    /* ---- stations ---- */
    for (const s of stations) {
      const b = s.b != null ? store.get(s.b) : null;
      if (s.b != null && !b) note('st', s.id, { code: 'C_STATION_NO_BUILDING', severity: 'HIGH', element: stEl(s), x: s.x, y: s.y, prev: null, next: null, cause: 'المحطة ' + s.id + ' تشير إلى المنشأة #' + s.b + ' وهي غير موجودة في الحفظ.', effect: 'لا يمكن لأي فرع أن يتصل بهذه المحطة، وقطاعاتها تبقى في الجذع بلا نقطة تسليم.', fix: 'أعد بناء محطة Central في هذا الموضع أو أزل المحطة من الشبكة.', evidence: { station: s.id, building: s.b } });
      if (b && b.st === 'DAMAGED') note('st', s.id, { code: 'C_STATION_DAMAGED', severity: 'HIGH', element: stEl(s), x: s.x, y: s.y, prev: null, next: null, cause: 'حالة منشأة المحطة المسجّلة DAMAGED.', effect: 'لا تستقبل المحطة ولا تسلّم أي كمية (المحرك يتجاهل المنشآت المتضرّرة).', fix: 'أصلح المنشأة من قائمة الصيانة.', evidence: { building: b.id, state: b.st } });
      const mine = segsAt.get(s.id) || [];
      if (!mine.length) { const nb = branch.get(s.id) || 0; note('st', s.id, { code: 'C_STATION_ISOLATED', severity: nb ? 'HIGH' : 'LOW', confirmed: !!nb, element: stEl(s), x: s.x, y: s.y, prev: null, next: null,
        cause: 'لا يوجد أي قطاع يبدأ أو ينتهي عند المحطة ' + s.id + (nb ? ' بينما لها ' + nb + ' فرع/فروع.' : ' ولا فروع عليها.'), effect: nb ? 'النفط الداخل إلى المحطة لا يستطيع الوصول إلى أي محطة أخرى.' : 'محطة غير مستخدمة.', fix: 'صِلها بالجذع بقطاع إلى أقرب محطة أو أزلها إن لم تكن مطلوبة.', evidence: { station: s.id, branches: nb } }); }
    }
    for (const b of store.items ? store.items.values() : store.list()) { const d = BD.DEFS[b.d]; if (d && d.type === 'central' && !stOf(b.id)) note('st', 'B' + b.id, { code: 'C_BUILDING_NO_STATION', severity: 'HIGH', element: { type: 'CSTATION', id: 'B' + b.id, label: 'منشأة Central #' + b.id }, x: b.x, y: b.y, prev: null, next: null, cause: 'المنشأة #' + b.id + ' من نوع محطة Central لكنها غير مسجّلة كمحطة في الجذع.', effect: 'فروعها لا تدخل شبكة Central: لا يصلها ولا يخرج منها شيء عبر الجذع.', fix: 'صِل المنشأة بالجذع أو أزلها.', evidence: { building: b.id } }); }

    /* ---- network split (structure only): every component other than the biggest ---- */
    { const find = comp(() => true), by = new Map(); for (const s of stations) { const r = find(s.id); let a = by.get(r); if (!a) by.set(r, a = []); a.push(s); } if (by.size > 1) { const groups = [...by.values()].sort((a, b) => b.length - a.length);
        for (const grp of groups.slice(1)) { const s0 = grp[0]; note('st', s0.id, { code: 'C_NET_SPLIT', severity: 'MEDIUM', confirmed: false, element: stEl(s0), x: s0.x, y: s0.y, prev: null, next: null, cause: 'مجموعة من ' + grp.length + ' محطة/محطات (' + grp.slice(0, 5).map(z => z.id).join('، ') + (grp.length > 5 ? '…' : '') + ') غير موصولة بالجذع الرئيسي (' + groups[0].length + ' محطة).', effect: 'لا يتبادل النفط بين هذه المجموعة وبقية الشبكة.', fix: 'صِل المجموعتين بقطاع إن كان التبادل مطلوباً.', evidence: { size: grp.length, main: groups[0].length } }); } } }

    /* ---- segments ---- */
    for (const g of segs) {
      const A = C.st.get(g.a), Z = C.st.get(g.b), mid = segMid(g), me = segEl(g), prev = A ? stLabel(A) : 'محطة محذوفة ' + g.a, next = Z ? stLabel(Z) : 'محطة محذوفة ' + g.b, path = g.path || [];
      if (!A || !Z) { note('seg', g.id, { code: 'C_SEG_NO_STATION', severity: 'CRITICAL', element: me, x: mid.x, y: mid.y, prev, next, cause: 'طرف ' + (A ? g.b : g.a) + ' من ' + segLabel(g) + ' غير موجود في قائمة المحطات.', effect: 'القطاع مقطوع: لا يعبر عبره أي تدفق.', fix: 'أعد المحطة المفقودة أو أزل القطاع.', evidence: { seg: g.id, a: g.a, b: g.b } }); continue; }
      for (let i = 1; i < path.length; i++) if (Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]) !== 1) { note('seg', g.id, { code: 'C_SEG_GAP', severity: 'MEDIUM', confirmed: false, element: me, x: path[i - 1][0], y: path[i - 1][1], prev, next, cause: 'بلاطتان متتاليتان من ' + segLabel(g) + ' غير متجاورتين: (' + path[i - 1] + ') ثم (' + path[i] + ').', effect: 'الرسم متقطّع؛ المحرك يتبع الاتصال المسجّل بين المحطتين فلا يتأثر التدفق.', fix: 'أعد رسم القطاع إن كان الرسم مهماً.', evidence: { seg: g.id, at: i } }); break; }
      for (const [st, t, side] of [[A, path[0], 'a'], [Z, path[path.length - 1], 'b']]) { if (!t) continue; const cells = st.cells && st.cells.length ? st.cells : [[st.x, st.y]]; let d = 1e9; for (const c of cells) d = Math.min(d, Math.abs(c[0] - t[0]) + Math.abs(c[1] - t[1]));
        if (d > 1) note('seg', g.id, { code: 'C_SEG_END', severity: 'LOW', confirmed: false, indicator: true, element: me, x: t[0], y: t[1], prev, next, cause: 'نهاية ' + segLabel(g) + ' عند (' + t + ') تبعد ' + d + ' بلاطات عن ' + stLabel(st) + '.', effect: 'مؤشر هندسي فقط: المحرك يتبع الاتصال المسجّل بين المحطتين، ولا يُلاحظ أي أثر على التدفق.', fix: 'لا إجراء ضروري.', evidence: { seg: g.id, side, dist: d } }); }
      let blocked = null; for (const t of path) { const o = store.at(t[0], t[1]); if (o && !(BD.DEFS[o.d] && BD.DEFS[o.d].type === 'central')) { blocked = { t, o }; break; } }
      if (blocked) note('seg', g.id, { code: 'C_SEG_ON_BUILDING', severity: 'MEDIUM', confirmed: false, element: me, x: blocked.t[0], y: blocked.t[1], prev, next, cause: 'البلاطة (' + blocked.t + ') من ' + segLabel(g) + ' تقع داخل منشأة #' + blocked.o.id + '.', effect: 'تعارض في الرسم؛ المحرك يتبع الاتصال المسجّل فلا يتأثر التدفق.', fix: 'انقل المنشأة أو أعد توجيه القطاع.', evidence: { seg: g.id, building: blocked.o.id } });
      const fch = CHANNELS.filter(c => g.fault && g.fault[c]);
      if (fch.length) { const upFind = c => comp(z => !(z.fault && z.fault[c])); const cut = fch.filter(c => { const f = upFind(c); return f(g.a) !== f(g.b); }), rer = fch.filter(c => !cut.includes(c));
        note('seg', g.id, { code: 'C_SEG_FAULT', severity: cut.length ? 'HIGH' : 'MEDIUM', element: me, x: mid.x, y: mid.y, prev, next, cause: segLabel(g) + ' مسجَّل معطّلاً في القنوات: ' + fch.map(c => CH_AR[c]).join('، ') + '.',
          effect: (cut.length ? 'لا يوجد بديل لهذا القطاع في قنوات: ' + cut.map(c => CH_AR[c]).join('، ') + ' فيتوقف التبادل عبره. ' : '') + (rer.length ? 'في قنوات ' + rer.map(c => CH_AR[c]).join('، ') + ' يوجد مسار بديل (حلقة) يحمل التدفق.' : ''), fix: 'أصلح القطاع من لوحة Central.', evidence: { seg: g.id, channels: fch, noAlternative: cut } }); }
      if (solved) for (const c of CHANNELS) { const f = g.f && g.f[c]; if (f && f.flow >= C.ch[c].cap * NEAR_CAP) note('seg', g.id, { code: 'C_SEG_NEAR_CAP', severity: 'LOW', confirmed: false, element: me, x: mid.x, y: mid.y, prev, next, cause: 'تدفق ' + CH_AR[c] + ' في ' + segLabel(g) + ' (' + nf(f.flow) + ') يبلغ ' + Math.round(f.flow / C.ch[c].cap * 100) + '% من سعة القناة (' + nf(C.ch[c].cap) + ').', effect: 'قرب الاختناق: أي زيادة ستحوَّل إلى مسار آخر أو تُحجب.', fix: 'أضف حلقة موازية أو وزّع الأحمال.', evidence: { seg: g.id, ch: c, flow: f.flow } }); }
    }

    /* ---- pumps ---- */
    for (const p of pumps) {
      const st = C.st.get(p.st), g = p.seg ? C.seg.get(p.seg) : null, me = pumpEl(p), px = st ? st.x : 0, py = st ? st.y : 0;
      if (!st) { note('pump', p.id, { code: 'C_PUMP_NO_STATION', severity: 'HIGH', element: me, x: px, y: py, prev: null, next: null, cause: pumpLabel(p) + ' تشير إلى المحطة ' + p.st + ' غير الموجودة.', effect: 'لا تدفع المضخة شيئاً.', fix: 'احذف المضخة أو أعدها إلى محطة قائمة.', evidence: { pump: p.id, st: p.st } }); continue; }
      const nm = g ? segLabel(g) : null;
      if (!g) note('pump', p.id, { code: 'C_PUMP_NO_SEG', severity: 'HIGH', element: me, x: px, y: py, prev: stLabel(st), next: null, cause: pumpLabel(p) + ' غير مثبّتة على أي قطاع' + (p.seg ? ' (القطاع ' + p.seg + ' غير موجود)' : '') + '.', effect: 'لا تُضاف أي دفعة ضغط إلى التدفق.', fix: 'ثبّت المضخة على قطاع يبدأ من محطتها.', evidence: { pump: p.id, seg: p.seg } });
      else if (g.a !== p.st && g.b !== p.st) note('pump', p.id, { code: 'C_PUMP_SEG_FAR', severity: 'HIGH', element: me, x: px, y: py, prev: stLabel(st), next: nm, cause: pumpLabel(p) + ' على ' + nm + ' الذي لا يبدأ ولا ينتهي عند محطتها ' + p.st + '.', effect: 'لا تُضاف أي دفعة ضغط إلى التدفق.', fix: 'انقل المضخة إلى قطاع متصل بمحطتها.', evidence: { pump: p.id, seg: g.id } });
      if (p.fault) note('pump', p.id, { code: 'C_PUMP_FAULT', severity: 'HIGH', element: me, x: px, y: py, prev: stLabel(st), next: nm, cause: pumpLabel(p) + ' مسجَّلة معطّلة (fault).', effect: 'لا تضيف دفعة ضغط: تنخفض قدرة القناة على الدفع عبر القطاع.', fix: 'أصلح المضخة من لوحة Central.', evidence: { pump: p.id } });
      const ch = C.ch[p.ch]; if (ch && (ch.state === 'CLOSED' || ch.fault)) note('pump', p.id, { code: 'C_PUMP_CHANNEL_DOWN', severity: 'LOW', confirmed: false, element: me, x: px, y: py, prev: stLabel(st), next: nm, cause: 'قناة ' + (CH_AR[p.ch] || p.ch) + ' ' + (ch.fault ? 'معطّلة' : 'مغلقة') + ' فلا تعمل المضخة عليها.', effect: 'مضخة بلا عمل ما دامت القناة متوقفة.', fix: 'افتح القناة أو أصلحها.', evidence: { pump: p.id, ch: p.ch } });
      if (solved && p.lowIn) note('pump', p.id, { code: 'C_PUMP_LOWIN', severity: 'MEDIUM', confirmed: false, element: me, x: px, y: py, prev: stLabel(st), next: nm, cause: 'أبلغ المحرك أن ضغط الشفط عند ' + pumpLabel(p) + ' منخفض (lowIn).', effect: 'تدفع المضخة أقل من قدرتها.', fix: 'أضف مضخة أو رفع ضغط المصدر قبلها.', evidence: { pump: p.id, pIn: p.pIn } });
    }

    /* ---- channels ---- */
    const firstSeg = segs.length ? segMid(segs[0]) : { x: 0, y: 0 };
    for (const c of CHANNELS) { const ch = C.ch[c]; if (!ch) continue;
      const loc = (() => { const g = segs.find(z => z.fault && z.fault[c]); return g ? segMid(g) : firstSeg; })(), me = { type: 'CCHANNEL', id: c, label: 'قناة ' + CH_AR[c] }, ends = s => stLabel(s);
      const cp = pumps.filter(p => p.ch === c), cpOk = cp.filter(p => !p.fault).length, cs = segs.filter(g => g.fault && g.fault[c]).length, manual = !!(opts.cenManual && opts.cenManual[c]);
      const chType = 'قناة نقل ' + CH_AR[c] + ' (' + c + ') — إحدى قنوات Central الست', real = 'الحالة المسجّلة في المحرك: state=' + ch.state + '، fault=' + (ch.fault ? 'true' : 'false') + (ch.status ? '، status=' + ch.status : '') + '.';
      const origin = manual ? 'المصدر: عُطّلت يدوياً من لوحة Central (زر «تعطيل القناة للاختبار») في هذه الجلسة.' : 'المصدر: الحالة محفوظة هكذا في ملف الحفظ (لم تُعطَّل من اللوحة في هذه الجلسة؛ المحرك لا يسجّل من أو متى عطّلها).';
      const detail = 'هذا عطل على القناة نفسها وليس على قطاع: ' + cp.length + ' مضخة عليها (' + cpOk + ' سليمة) و' + cs + ' قطاع مقطوع عليها، وبقية القطاعات تُعدّ سليمة ما لم يُذكر لها عطل مستقل.';
      if (ch.fault) note('ch', c, { code: 'C_CH_FAULT', severity: 'CRITICAL', element: me, x: null, y: null, global: true, prev: null, next: null, cause: chType + ' معطّلة بالكامل. ' + real + ' ' + origin, effect: 'لا يعبر أي ' + CH_AR[c] + ' عبر شبكة Central (المحرك لا يمرّر شيئاً على قناة fault=true). ' + detail, fix: manual ? 'أصلح القناة من لوحة Central (زر «إصلاح القناة المعطّلة»).' : 'إن لم يكن التعطيل مقصوداً: افتح لوحة Central، اختر قناة ' + CH_AR[c] + ' واضغط «إصلاح القناة المعطّلة».', evidence: { ch: c, state: ch.state, fault: !!ch.fault, status: ch.status, manual, pumps: cp.length, pumpsOk: cpOk, cutSegments: cs } });
      else if (ch.state === 'CLOSED') note('ch', c, { code: 'C_CH_CLOSED', severity: 'MEDIUM', confirmed: false, element: me, x: null, y: null, global: true, prev: null, next: null, cause: chType + ' مغلقة من اللاعب. ' + real, effect: 'لا يعبر ' + CH_AR[c] + ' عبر Central ما دامت مغلقة. ' + detail, fix: 'افتح القناة من لوحة Central إن لم يكن الإغلاق مقصوداً.', evidence: { ch: c, state: ch.state, fault: !!ch.fault, status: ch.status } });
      /* partition caused by faulty segments: stations that have branches on this channel and are reachable structurally but not through the segments that are up */
      const all = comp(() => true), up = comp(g => !(g.fault && g.fault[c])), hs = stations.filter(s => hasBranch(s.id, c));
      if (hs.length > 1) { const groups = new Map(); for (const s of hs) { const r = up(s.id); let a = groups.get(r); if (!a) groups.set(r, a = []); a.push(s); }
        const struct = new Map(); for (const s of hs) { const r = all(s.id); let a = struct.get(r); if (!a) struct.set(r, a = []); a.push(s); }
        for (const grp of struct.values()) { const parts = new Set(grp.map(s => up(s.id))); if (parts.size > 1) { const cut = segs.filter(g => g.fault && g.fault[c]); note('ch', c, { code: 'C_CH_PARTITION', severity: 'HIGH', element: me, x: loc.x, y: loc.y, prev: null, next: null, cause: 'محطات لها فروع ' + CH_AR[c] + ' (' + grp.slice(0, 4).map(ends).join('، ') + (grp.length > 4 ? '…' : '') + ') انقسمت إلى ' + parts.size + ' مجموعات غير متصلة بسبب القطاعات المعطّلة: ' + cut.slice(0, 5).map(g => g.id).join('، ') + '.', effect: 'لا يصل ' + CH_AR[c] + ' من إحدى المجموعتين إلى الأخرى.', fix: 'أصلح القطاعات المعطّلة المذكورة أو أضف حلقة بديلة.', evidence: { ch: c, parts: parts.size, faulty: cut.map(g => g.id) } }); break; } } }
      if (solved && ch.pressure > ch.maxP) note('ch', c, { code: 'C_CH_HIGH_PRESSURE', severity: 'LOW', confirmed: false, indicator: true, element: me, x: null, y: null, global: true, prev: null, next: null, cause: 'ضغط قناة ' + CH_AR[c] + ' (' + nf(ch.pressure) + ' psi) فوق تصنيفها ' + nf(ch.maxP) + ' psi حسب المحرك.', effect: 'مؤشر وليس عطلاً: لا يُسجَّل نقص في التدفق بسببه.', fix: 'راجع المضخات المركزية على القناة.', evidence: { ch: c, p: ch.pressure } });
      if (solved && ch.cap && ch.flow >= ch.cap * NEAR_CAP) note('ch', c, { code: 'C_CH_SATURATED', severity: 'MEDIUM', confirmed: false, element: me, x: null, y: null, global: true, prev: null, next: null, cause: 'تدفق قناة ' + CH_AR[c] + ' (' + nf(ch.flow) + ') يبلغ ' + Math.round(ch.flow / ch.cap * 100) + '% من سعتها.', effect: 'قرب الاختناق.', fix: 'وزّع الأحمال على قنوات/قطاعات أخرى.', evidence: { ch: c, flow: ch.flow } }); }

    /* ---- numbering: confirmed by severity, then warnings, then indicators ---- */
    const grp = f => f.indicator ? 2 : f.confirmed ? 0 : 1; faults.sort((a, b) => grp(a) - grp(b) || sevOf(a.severity) - sevOf(b.severity) || a.id - b.id); faults.forEach((f, i) => { f.no = i + 1; });
    const confirmed = faults.filter(f => f.confirmed), warnings = faults.filter(f => !f.confirmed && !f.indicator), indicators = faults.filter(f => f.indicator);
    const tiles = (() => { let n = 0; for (const g of segs) n += (g.path || []).length; return n; })();
    const checked = stations.length + segs.length + pumps.length + CHANNELS.length, healthyN = stations.filter(s => !bad.st.has(s.id)).length + segs.filter(g => !bad.seg.has(g.id)).length + pumps.filter(p => !bad.pump.has(p.id)).length + CHANNELS.filter(c => !bad.ch.has(c)).length;
    const stats = { stations: stations.length, segments: segs.length, pumps: pumps.length, channels: CHANNELS.length, tiles, branches, checked, healthy: healthyN, faults: confirmed.length, warnings: warnings.length, indicators: indicators.length, critical: faults.filter(f => f.severity === 'CRITICAL').length,
      health: checked ? Math.round(healthyN / checked * 1000) / 10 : 100, solved, present: true };
    notes.push('لا يُفحص هنا: التسرب والفاقد (لا نموذج لهما في المحرك)، وضغط كل قطاع على حدة (المحرك يحتفظ بالضغط لكل قناة فقط)، وما يجري داخل المنشآت التي تتصل بها الفروع (يغطيها فحص النفط).');
    return { faults, stats, healthySegs: segs.filter(g => !bad.seg.has(g.id)).map(g => g.id), notes, SEV, OK_COLOR, CH_AR };
  }

  const api = { runCentral, SEV, KIND_AR, CH_AR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OliNetDiagCentral = api;
})(typeof window !== 'undefined' ? window : globalThis);
