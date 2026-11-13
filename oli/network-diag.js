/* Oli — NETWORK DIAGNOSTICS (فاحص الشبكة).
 * A read-only inspector of the whole oil network.  It reads the REAL structure the game stores: buildings (store.items: id, def, x, y, rotation, state, b.s),
 * their connection ports (buildings.js worldPoints: id, role in/out/both, product, access tile), the explicit pipelines (pipes.lines: a / b = {b: building id, port},
 * path tiles, product, diameter, open flag) and the results of the last simulation solve (line.flow / over / hiP / lowP / pressure, b.s._sat / _lowIn / _hiP).
 * It never writes: not the store, not the net, not the simulation (the tests compare the saved state before and after).  It is run on request, never per frame.
 * Nothing here is guessed: every finding names the element, its coordinates, the evidence it rests on, and says whether it is CONFIRMED (a structural fact or an engine
 * result) or a WARNING (a state that needs the player's review).  When the exact cause cannot be established, the finding says so.
 *   run(store, net, opts) -> report        opts: { sim, locate(x, y) -> zone label, solved }
 */
(function (root) {
  'use strict';
  const nodeReq = typeof require === 'function' && typeof module !== 'undefined';
  const BD = nodeReq ? require('./buildings.js') : root.OliBuildings, CF = nodeReq ? require('./building-config.js') : root.OliBuildingConfig;
  const DEFS = BD.DEFS, worldPoints = BD.worldPoints, compatible = BD.compatible, PIPES = CF.PIPES, ANY = '*';

  const SEV = { CRITICAL: { ar: 'حرج', rank: 0, color: '#ff3b30' }, HIGH: { ar: 'مرتفع', rank: 1, color: '#ff9500' }, MEDIUM: { ar: 'متوسط', rank: 2, color: '#ffd60a' }, LOW: { ar: 'منخفض', rank: 3, color: '#ffe680' } };
  const OK_COLOR = '#34c759', NEAR_CAP = 0.95;
  const KIND_AR = {
    OPEN_END: 'اتصال مفقود', MISSING_BUILDING: 'اتصال بعنصر محذوف', BAD_PORT: 'منفذ غير صالح', WRONG_POINT: 'متصل بنقطة خاطئة', BROKEN_PATH: 'أنبوب مقطوع المسار', PATH_BLOCKED: 'مسار يعبر منشأة',
    TILE_SHARED: 'تعارض: بلاطة مشتركة', PORT_TWICE: 'تعارض: منفذ مستخدم مرتين', PRODUCT_MISMATCH: 'منتج غير متوافق', WRONG_DIRECTION: 'اتجاه تدفق خاطئ', CLOSED_LINE: 'مسار مغلق', SELF_LOOP: 'أنبوب يعود إلى نفس العنصر',
    OVER_CAPACITY: 'تجاوز سعة الأنبوب', NEAR_CAPACITY: 'اختناق (قرب السعة)', HIGH_PRESSURE: 'ضغط مرتفع', LOW_PRESSURE: 'ضغط منخفض',
    DEAD_END: 'مسار لا يصل إلى وجهته', ISOLATED: 'عنصر معزول', NO_INPUT: 'مدخل غير موصول', NO_OUTPUT: 'مخرج غير موصول', NO_SUPPLY: 'مستهلك بلا مصدر', PUMP_DISCONNECTED: 'مضخة غير متصلة',
    PUMP_OVERLOAD: 'تجاوز سعة العنصر', ELEMENT_OVERLOAD: 'تجاوز سعة العنصر', VALVE_CLOSED: 'صمام مغلق', VALVE_FAULT: 'صمام معطل', VALVE_PARTIAL: 'صمام نصف مفتوح', OUT_OF_SERVICE: 'عنصر خارج الخدمة',
    BLOCKED: 'تدفق محجوب', TANK_FULL: 'خزان ممتلئ', FACING_MISMATCH: 'منفذان متقابلان غير متوافقين', JUNCTION_USELESS: 'تفرع بلا فائدة', BRANCH_NO_EXIT: 'تفرع بلا مخرج'
  };
  const sevOf = k => ({ CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[k]);
  const nf = n => Math.round(n).toLocaleString('en-US');
  const pk = (b, p) => b + ':' + p;
  const nameOf = b => DEFS[b.d].name + ' #' + b.id;
  const pipeLabel = L => 'PIPE-' + L.id;
  const isPass = t => t === 'pump' || t === 'valve' || t === 'junction';
  const isTerminal = (b, d) => d.type === 'tank' || d.type === 'gas' || d.type === 'refinery' || (d.type === 'pump' && d.family === 'WATER_PUMP') || d.type === 'central';

  function run(store, net, opts) {
    opts = opts || {}; const sim = opts.sim || null, locate = opts.locate || null;
    const items = store.items ? [...store.items.values()] : store.list(), byId = new Map(); for (const b of items) byId.set(b.id, b);
    const lines = [...net.lines.values()], faults = [], notes = [];
    const solved = !!sim && !(sim.dirty && sim.dirty()) && opts.solved !== false;
    if (!sim) notes.push('لم تُمرَّر المحاكاة: فحوص السعة والضغط تُتجاوز.'); else if (!solved) notes.push('المحاكاة غير محدّثة منذ آخر تعديل في الشبكة: فحوص السعة والضغط تعتمد على آخر حل وقد لا تعكس التعديل.');
    if (net.central && net.central.cen && net.central.cen.size) notes.push('شبكة Central الهجينة (' + net.central.cen.size + ' بلاطة) لها نظام فحصها الخاص ولا تدخل في هذا الفحص.');

    /* ---------- indexes: ports, building cells, tiles of pipes ---------- */
    const ports = new Map(), cellOwner = new Map(), portsOf = new Map();
    for (const b of items) { const d = DEFS[b.d]; if (!d) continue; const w = worldPoints(b).filter(p => p.kind === 'pipe' && !p.reserved); portsOf.set(b.id, w); for (const p of w) ports.set(pk(b.id, p.id), p);
      const dims = (b.r & 1) ? [d.footprint[1], d.footprint[0]] : d.footprint; for (let j = 0; j < dims[1]; j++) for (let i = 0; i < dims[0]; i++) cellOwner.set((b.x + i) + ',' + (b.y + j), b.id); }
    const tileLines = new Map(); for (const L of lines) for (const t of L.path || []) { const k = t[0] + ',' + t[1]; let a = tileLines.get(k); if (!a) tileLines.set(k, a = []); a.push(L.id); }
    const where = (x, y) => (locate ? (locate(x, y) || 'غير محددة') : 'غير محددة (لا توجد خريطة)');
    const lineMid = L => { const p = L.path && L.path.length ? L.path[L.path.length >> 1] : [0, 0]; return { x: p[0], y: p[1] }; };
    let counter = 0; const add = f => { f.id = ++counter; f.sev = f.severity; f.zone = where(f.x, f.y); f.kindAr = KIND_AR[f.code] || f.code; if (f.confirmed == null) f.confirmed = true; faults.push(f); return f; };
    const bEl = b => ({ type: 'BUILDING', id: b.id, label: nameOf(b), def: b.d });
    const lEl = L => ({ type: 'PIPE', id: L.id, label: pipeLabel(L) });
    const endLabel = (ref, L) => { if (!ref) return null; const b = byId.get(ref.b); return b ? nameOf(b) + ' · ' + ref.port : 'عنصر محذوف #' + ref.b; };

    /* ---------- the graph, built exactly like the simulation builds it: open lines whose two ends exist, plus directly docked facing ports ---------- */
    const lineEdges = [], badLine = new Set(), attached = new Map();      // attached: port key -> [{line, end}]  (every line that names the port, working or not)
    const attach = (k, L, end) => { let a = attached.get(k); if (!a) attached.set(k, a = []); a.push({ line: L, end }); };
    for (const L of lines) { for (const end of ['a', 'b']) if (L[end]) attach(pk(L[end].b, L[end].port), L, end); }
    const fwd = new Map(), rev = new Map(), addE = (a, b, L) => { const d = a + '>', r = b + '<'; (fwd.get(d) || fwd.set(d, []).get(d)).push({ to: r, line: L }); (rev.get(r) || rev.set(r, []).get(r)).push({ to: d, line: L }); };   // states: 'port>' = leaving through a port, 'port<' = arriving at a port
    const dock = new Map();                                                // port key -> neighbour port key (docked)
    for (const [k, p] of ports) { const oid = cellOwner.get(p.ax + ',' + p.ay); if (oid == null || oid === p.buildingId) continue; const o = byId.get(oid); if (!o) continue;
      for (const q of portsOf.get(oid) || []) if (q.x === p.ax && q.y === p.ay && q.ax === p.x && q.ay === p.y) { const k2 = pk(oid, q.id);
        if (compatible(p, q)) { dock.set(k, k2); } else if (p.buildingId < oid || true) { /* reported once below */ } break; } }
    const seenFace = new Set();
    for (const [k, p] of ports) { const oid = cellOwner.get(p.ax + ',' + p.ay); if (oid == null || oid === p.buildingId) continue;
      for (const q of portsOf.get(oid) || []) if (q.x === p.ax && q.y === p.ay && q.ax === p.x && q.ay === p.y && !compatible(p, q) && !(p.role === q.role && p.role !== 'both')) { const k2 = pk(oid, q.id), key = k < k2 ? k + '|' + k2 : k2 + '|' + k; if (seenFace.has(key)) break; seenFace.add(key);
        const b1 = byId.get(p.buildingId), b2 = byId.get(oid), why = p.role === q.role && p.role !== 'both' ? 'المنفذان من نفس الاتجاه (' + p.role + ')' : 'منتجاهما غير متوافقين (' + (p.product || '*') + ' / ' + (q.product || '*') + ')';
        add({ code: 'FACING_MISMATCH', severity: 'MEDIUM', confirmed: false, element: bEl(b1), x: p.x, y: p.y, prev: null, next: nameOf(b2) + ' · ' + q.id, cause: 'المنفذ ' + p.id + ' في ' + nameOf(b1) + ' يلامس المنفذ ' + q.id + ' في ' + nameOf(b2) + ' ولا يتّصلان: ' + why + '.',
          effect: 'لا يمر أي تدفق بين المنشأتين عبر هذا التلامس (المحاكاة تتجاهله).', fix: 'إن كان الاتصال مقصوداً غيّر دوران إحدى المنشأتين أو استبدلها بنوع متوافق، وإلا فتجاهل هذا التنبيه.', evidence: { ports: [k, k2] } }); break; } }
    for (const L of lines) { if (!L.a || !L.b || L.open === false) continue; if (!byId.get(L.a.b) || !byId.get(L.b.b)) continue; { const ka = pk(L.a.b, L.a.port), kb = pk(L.b.b, L.b.port), pa = ports.get(ka), pb = ports.get(kb), ab = !pa || !pb || (pa.role !== 'in' && pb.role !== 'out'), ba = !pa || !pb || (pb.role !== 'in' && pa.role !== 'out');   // the engine's edge has no fixed direction: oil goes from whichever end can send to the one that can take
      if (ab) addE(ka, kb, L); if (ba) addE(kb, ka, L); if (!ab && !ba) addE(ka, kb, L); } }
    for (const [k, k2] of dock) { const p = ports.get(k), q = ports.get(k2); if (p.role !== 'in' && q.role !== 'out') addE(k, k2, null); }
    const passable = b => { const d = DEFS[b.d], s = b.s; if (b.st === 'DAMAGED') return false; if (d.type === 'valve' && s && (s.mode === 'CLOSED' || s.mode === 'FAULT')) return false; return true; };
    const innerOuts = (b, k) => { const out = [], t = DEFS[b.d].type; for (const p of portsOf.get(b.id) || []) { const k2 = pk(b.id, p.id); if (k2 !== k && p.role !== 'in' && !(t === 'tank' && p.id === 'WATER_OUT') && !(t === 'separator' && p.id !== 'OIL_OUT')) out.push(k2 + '>'); } return out; };
    const innerIns = (b, k) => { const out = [], t = DEFS[b.d].type; for (const p of portsOf.get(b.id) || []) { const k2 = pk(b.id, p.id); if (k2 !== k && p.role !== 'out') out.push(k2 + '<'); } return out; };
    const bOf = k => byId.get(+k.slice(0, k.indexOf(':')));
    const nextNodes = s => { const b = bOf(s); if (s.endsWith('>')) return (fwd.get(s) || []).map(e => e.to); const r = []; if (b && passable(b) && portsOf.has(b.id)) for (const k2 of innerOuts(b, s.slice(0, -1))) if (fwd.has(k2)) r.push(k2); return r; };      // leaving a building: only through ports that really have a line leaving
    const prevNodes = s => { const b = bOf(s); if (s.endsWith('<')) return (rev.get(s) || []).map(e => e.to); const r = []; if (b && passable(b)) for (const k2 of innerIns(b, s.slice(0, -1))) r.push(k2); return r; };

    /* ---------- per line: structure ---------- */
    const lineProblem = new Set();            // lines carrying at least one finding (for the healthy count)
    const pAccess = (ref) => { const p = ref && ports.get(pk(ref.b, ref.port)); return p || null; };
    for (const L of lines) {
      const path = L.path || [], first = path[0], last = path[path.length - 1], mid = lineMid(L), me = lEl(L), flag = f => { lineProblem.add(L.id); return add(f); };
      const ends = { a: L.a ? byId.get(L.a.b) : null, b: L.b ? byId.get(L.b.b) : null };
      if (!L.a || !L.b) {                                          // an open pipeline: one end is on a free tile
        const missing = !L.a ? 'a' : 'b', have = missing === 'a' ? L.b : L.a, hb = have && byId.get(have.b), pt = missing === 'a' ? first : last, hp = have && ports.get(pk(have.b, have.port));
        flag({ code: 'OPEN_END', severity: hp && hp.required !== false ? 'CRITICAL' : 'HIGH', element: me, x: pt ? pt[0] : mid.x, y: pt ? pt[1] : mid.y, prev: missing === 'b' ? endLabel(have, L) : null, next: missing === 'a' ? endLabel(have, L) : null,
          cause: 'الأنبوب ' + pipeLabel(L) + ' ' + (have ? 'يبدأ من ' + (hb ? nameOf(hb) + ' · ' + have.port : 'عنصر محذوف #' + have.b) : 'ليس له أي طرف موصول') + ' وطرفه ' + (missing === 'b' ? 'النهائي' : 'الأول') + ' عند البلاطة (' + (pt ? pt[0] + ',' + pt[1] : '؟') + ') لا يصل إلى أي منفذ.',
          effect: 'لا يمر عبره أي تدفق (المحاكاة تتجاهل الخطوط ذات الطرف المفتوح)' + (hb ? '؛ المنفذ ' + have.port + ' في ' + nameOf(hb) + ' يبقى بلا مسار.' : '.'), fix: 'أكمل الأنبوب بتوصيل طرفه الحر بالمنفذ الصحيح (أو احذفه إن كان بقايا).', evidence: { line: L.id, openEnd: missing } });
        continue; }
      for (const end of ['a', 'b']) { const ref = L[end], b = ends[end];
        if (!b) { flag({ code: 'MISSING_BUILDING', severity: 'CRITICAL', element: me, x: (end === 'a' ? first : last)[0], y: (end === 'a' ? first : last)[1], prev: end === 'b' ? endLabel(L.a, L) : null, next: end === 'a' ? endLabel(L.b, L) : null,
            cause: 'الطرف ' + (end === 'a' ? 'الأول' : 'الأخير') + ' من ' + pipeLabel(L) + ' يشير إلى المنشأة #' + ref.b + ' وهي غير موجودة في المخزن (حُذفت دون حذف الأنبوب).', effect: 'الأنبوب لا يحمل أي تدفق.', fix: 'احذف هذا الأنبوب أو أعد توصيله بمنشأة قائمة.', evidence: { line: L.id, missing: ref.b } }); continue; }
        const p = ports.get(pk(ref.b, ref.port));
        if (!p) { flag({ code: 'BAD_PORT', severity: 'CRITICAL', element: me, x: (end === 'a' ? first : last)[0], y: (end === 'a' ? first : last)[1], prev: null, next: null,
            cause: 'الأنبوب ' + pipeLabel(L) + ' يستخدم المنفذ «' + ref.port + '» في ' + nameOf(b) + ' وهذا المنفذ غير موجود (أو محجوز) في تعريف هذه المنشأة.', effect: 'الأنبوب لا يحمل أي تدفق.', fix: 'أعد توصيل الأنبوب بمنفذ صحيح من ' + DEFS[b.d].name + '.', evidence: { line: L.id, port: ref.port } }); continue; }
        const t = end === 'a' ? first : last; if (!t || t[0] !== p.ax || t[1] !== p.ay)
          flag({ code: 'WRONG_POINT', severity: 'CRITICAL', element: me, x: t ? t[0] : p.x, y: t ? t[1] : p.y, prev: endLabel(L.a, L), next: endLabel(L.b, L),
            cause: 'طرف ' + pipeLabel(L) + ' مسجّل على المنفذ ' + ref.port + ' في ' + nameOf(b) + ' لكن مساره ينتهي عند (' + (t ? t[0] + ',' + t[1] : '؟') + ') بينما نقطة وصل هذا المنفذ هي (' + p.ax + ',' + p.ay + ').', effect: 'الاتصال المسجّل لا يطابق موضع الأنبوب على الخريطة؛ التدفق يتبع الاتصال المسجّل لا الشكل.', fix: 'أعد رسم طرف الأنبوب ليصل إلى (' + p.ax + ',' + p.ay + ') أو أعد توصيله بالمنفذ الذي ينتهي عنده فعلاً.', evidence: { line: L.id, end, at: t, expected: [p.ax, p.ay] } }); }
      if (!ends.a || !ends.b) continue;
      const pa = ports.get(pk(L.a.b, L.a.port)), pb = ports.get(pk(L.b.b, L.b.port)); if (!pa || !pb) continue;
      for (let i = 1; i < path.length; i++) if (Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]) !== 1) { flag({ code: 'BROKEN_PATH', severity: 'MEDIUM', confirmed: false, element: me, x: path[i - 1][0], y: path[i - 1][1], prev: endLabel(L.a, L), next: endLabel(L.b, L),
          cause: 'بلاطتان متتاليتان من مسار ' + pipeLabel(L) + ' غير متجاورتين: (' + path[i - 1] + ') ثم (' + path[i] + ').', effect: 'الأنبوب مقطوع فعلياً على الخريطة رغم أن الاتصال المسجّل سليم.', fix: 'أعد رسم الأنبوب أو احذفه وأعد وصله.', evidence: { line: L.id, gapAt: i } }); break; }
      for (const t of path) { const k = t[0] + ',' + t[1], o = cellOwner.get(k); if (o != null) { const ob = byId.get(o); flag({ code: 'PATH_BLOCKED', severity: 'MEDIUM', confirmed: false, element: me, x: t[0], y: t[1], prev: endLabel(L.a, L), next: endLabel(L.b, L),
          cause: 'البلاطة (' + k + ') من ' + pipeLabel(L) + ' تقع داخل ' + nameOf(ob) + '.', effect: 'الرسم يعبر منشأة، لكن المحاكاة تتبع الاتصال المسجّل بين المنفذين فلا يتأثر التدفق.', fix: 'أعد توجيه الأنبوب حول المنشأة.', evidence: { line: L.id, tile: k, building: o } }); break; } }
      for (const t of path) { const k = t[0] + ',' + t[1], ls = tileLines.get(k); if (ls && ls.length > 1 && ls[0] === L.id) { flag({ code: 'TILE_SHARED', severity: 'MEDIUM', confirmed: false, element: me, x: t[0], y: t[1], prev: endLabel(L.a, L), next: endLabel(L.b, L),
          cause: 'البلاطة (' + k + ') تستخدمها الأنابيب ' + ls.map(i => 'PIPE-' + i).join(' و ') + ' معاً.', effect: 'تعارض في الرسم فقط: المحاكاة تتبع الاتصال المسجّل فلا يتأثر التدفق.', fix: 'أعد توجيه أحد الأنبوبين.', evidence: { tile: k, lines: ls } }); break; } }
      const probe = { kind: 'pipe', role: 'both', product: L.product && L.product !== ANY ? L.product : null };
      for (const end of ['a', 'b']) { const p = end === 'a' ? pa : pb, b = ends[end], t = end === 'a' ? first : last;
        if (!compatible(p, probe)) flag({ code: 'PRODUCT_MISMATCH', severity: 'HIGH', element: me, x: t[0], y: t[1], prev: endLabel(L.a, L), next: endLabel(L.b, L), cause: pipeLabel(L) + ' يحمل ' + L.product + ' لكن المنفذ ' + p.id + ' في ' + nameOf(b) + ' ' + (p.excl && L.product && p.excl.indexOf(L.product) >= 0 ? 'يرفض هذا المنتج' : 'مخصّص لـ ' + (p.product || '؟')) + '.', effect: 'لا تُنقل الكمية عبر هذا الطرف.', fix: 'اربط الأنبوب بمنفذ يطابق منتجه أو أعد تعيين المنتج.', evidence: { line: L.id, port: pk(b.id, p.id), product: L.product } }); }
      if (pa.role === 'in') flag({ code: 'WRONG_DIRECTION', severity: 'MEDIUM', confirmed: false, element: me, x: first[0], y: first[1], prev: endLabel(L.a, L), next: endLabel(L.b, L), cause: 'بداية ' + pipeLabel(L) + ' موصولة بالمنفذ ' + pa.id + ' في ' + nameOf(ends.a) + ' وهو منفذ دخول (in) بينما الأنبوب يُدفع منه إلى ' + nameOf(ends.b) + '.', effect: 'التسجيل عكس اتجاه المنافذ، لكن المحاكاة تمرّر النفط حسب أدوار المنافذ فلا ينقطع التدفق.', fix: 'اعكس اتجاه الأنبوب (من منفذ خروج إلى منفذ دخول) أو بدّل طرفيه.', evidence: { line: L.id, end: 'a', role: pa.role } });
      if (pb.role === 'out') flag({ code: 'WRONG_DIRECTION', severity: 'MEDIUM', confirmed: false, element: me, x: last[0], y: last[1], prev: endLabel(L.a, L), next: endLabel(L.b, L), cause: 'نهاية ' + pipeLabel(L) + ' موصولة بالمنفذ ' + pb.id + ' في ' + nameOf(ends.b) + ' وهو منفذ خروج (out) بينما يصب فيه الأنبوب.', effect: 'التسجيل عكس اتجاه المنافذ، لكن المحاكاة تمرّر النفط حسب أدوار المنافذ فلا ينقطع التدفق.', fix: 'اعكس اتجاه الأنبوب أو اربطه بمنفذ دخول.', evidence: { line: L.id, end: 'b', role: pb.role } });
      if (L.a.b === L.b.b) flag({ code: 'SELF_LOOP', severity: 'LOW', confirmed: false, element: me, x: mid.x, y: mid.y, prev: endLabel(L.a, L), next: endLabel(L.b, L), cause: pipeLabel(L) + ' يبدأ وينتهي في نفس المنشأة ' + nameOf(ends.a) + '.', effect: 'تدوير داخلي بلا فائدة.', fix: 'احذف الأنبوب إن لم يكن مقصوداً.', evidence: { line: L.id } });
      if (L.open === false) { const stor = DEFS[ends.a.d].type === 'tank' && DEFS[ends.b.d].type === 'tank'; flag({ code: 'CLOSED_LINE', severity: stor ? 'LOW' : 'MEDIUM', confirmed: false, element: me, x: mid.x, y: mid.y, prev: endLabel(L.a, L), next: endLabel(L.b, L), cause: 'صمام ' + pipeLabel(L) + ' مغلق (open = false).', effect: 'لا يمر عبره تدفق' + (stor ? ' (الربط التلقائي بين الخزانات المتجاورة يبدأ مغلقاً)' : '') + '.', fix: 'افتح الخط إن كنت تريد مرور التدفق.', evidence: { line: L.id } }); }
      if (solved) { const sp = PIPES[L.dia] || { capacity: 0, maxPressure: 0 }, fl = L.flow || 0, use = sp.capacity ? fl / sp.capacity : 0;
        if (L.over) flag({ code: 'OVER_CAPACITY', severity: 'HIGH', element: me, x: mid.x, y: mid.y, prev: endLabel(L.a, L), next: endLabel(L.b, L), cause: 'سجّل المحرك على ' + pipeLabel(L) + ' أن المعروض عليه تجاوز سعته المتاحة (القطر ' + L.dia + ' سعته ' + nf(sp.capacity) + '؛ التدفق المعتمد حالياً ' + nf(fl) + ' برميل/يوم = ' + Math.round(use * 100) + '%). لا تُحدَّد من البيانات المتاحة الذروة اللحظية التي سبّبت ذلك.', effect: 'الكمية الزائدة عن سعة الأنبوب في لحظة العرض لا تمر؛ التدفق الفعلي المعتمد هو الرقم المذكور.', fix: 'ارفع قطر الأنبوب أو وزّع التدفق على أنبوب آخر.', evidence: { line: L.id, flow: fl, cap: sp.capacity } });
        else if (use >= NEAR_CAP) flag({ code: 'NEAR_CAPACITY', severity: 'LOW', confirmed: false, element: me, x: mid.x, y: mid.y, prev: endLabel(L.a, L), next: endLabel(L.b, L), cause: 'تدفق ' + pipeLabel(L) + ' يبلغ ' + Math.round(use * 100) + '% من سعته (' + nf(fl) + ' من ' + nf(sp.capacity) + ').', effect: 'قرب الاختناق: أي زيادة في الإنتاج ستُحجب.', fix: 'فكّر في رفع القطر قبل زيادة الإنتاج.', evidence: { line: L.id, flow: fl, cap: sp.capacity } });
        if (L.hiP) flag({ code: 'HIGH_PRESSURE', severity: 'MEDIUM', element: me, x: mid.x, y: mid.y, prev: endLabel(L.a, L), next: endLabel(L.b, L), cause: 'ضغط ' + pipeLabel(L) + ' (' + nf(L.pressure || 0) + ' psi) يتجاوز حدّه ' + nf(sp.maxPressure) + ' psi.', effect: 'ضغط فوق تصنيف الأنبوب حسب المحرك؛ لا يُسجَّل أي نقص في التدفق بسببه (مؤشر وليس انقطاعاً).', fix: 'ارفع قطر الأنبوب أو خفّض ضغط المضخة قبله.', evidence: { line: L.id, p: L.pressure, max: sp.maxPressure } });
        if (L.lowP) flag({ code: 'LOW_PRESSURE', severity: 'MEDIUM', element: me, x: mid.x, y: mid.y, prev: endLabel(L.a, L), next: endLabel(L.b, L), cause: 'ضغط الدخول لا يكفي لدفع التدفق عبر ' + pipeLabel(L) + ' (طول ' + path.length + ' بلاطة، ضغط ' + nf(L.pressure || 0) + ' psi).', effect: 'ينخفض التدفق عبر هذا الأنبوب عن المطلوب.', fix: 'أضف مضخة قبله أو قصّر المسار أو ارفع القطر.', evidence: { line: L.id, p: L.pressure } }); }
    }
    /* a port named by two lines */
    for (const [k, arr] of attached) if (arr.length > 1) { const L0 = arr[0].line, b = bOf(k); if (!b) continue; const p = ports.get(k); for (const z of arr) lineProblem.add(z.line.id);
      add({ code: 'PORT_TWICE', severity: 'CRITICAL', element: bEl(b), x: p ? p.x : b.x, y: p ? p.y : b.y, prev: null, next: null, cause: 'المنفذ ' + k.split(':')[1] + ' في ' + nameOf(b) + ' تستخدمه ' + arr.map(z => pipeLabel(z.line)).join(' و ') + ' في آن واحد.', effect: 'منفذ واحد لا يحمل إلا اتصالاً واحداً؛ الاتصال الثاني غير صالح.', fix: 'أبقِ أنبوباً واحداً على هذا المنفذ ووصل الآخر بمنفذ حر.', evidence: { port: k, lines: arr.map(z => z.line.id) } }); }

    /* ---------- per building: ports in use, state, engine results ---------- */
    const hasAtt = k => attached.has(k) || dock.has(k), live = k => (fwd.has(k + '>') || rev.has(k + '<')), buildingProblem = new Set(), stopSet = new Set();
    const nbrs = (b, dir) => { const set = new Set(); for (const p of portsOf.get(b.id) || []) { const k = pk(b.id, p.id); for (const e of (dir > 0 ? fwd.get(k + '>') : rev.get(k + '<')) || []) { const o = bOf(e.to); if (o) set.add(nameOf(o)); } } return [...set].slice(0, 4).join('، ') || null; };
    const flagB = (b, f) => { buildingProblem.add(b.id); f.element = bEl(b); f.x = f.x == null ? b.x : f.x; f.y = f.y == null ? b.y : f.y; if (f.prev === undefined) f.prev = nbrs(b, -1); if (f.next === undefined) f.next = nbrs(b, 1); return add(f); };

    /* reachability: which receivers can a well's oil reach?  (backwards from the terminals) */
    const canReach = new Set(), q = []; for (const b of items) { const d = DEFS[b.d]; if (!d || !isTerminal(b, d) || !portsOf.has(b.id)) continue; for (const p of portsOf.get(b.id)) if (p.role !== 'out') { const k = pk(b.id, p.id) + '<'; if (!canReach.has(k)) { canReach.add(k); q.push(k); } } }
    while (q.length) { const k = q.pop(); for (const k2 of prevNodes(k)) if (!canReach.has(k2)) { canReach.add(k2); q.push(k2); } }
    const upstreamWells = k0 => { const seen = new Set([k0]), st = [k0], wells = new Set(); while (st.length) { const k = st.pop(), b = bOf(k); if (b && DEFS[b.d].type === 'well') wells.add(b.id); for (const k2 of prevNodes(k)) if (!seen.has(k2)) { seen.add(k2); st.push(k2); } } return wells; };
    const wellFlow = ids => { let s = 0; for (const id of ids) { const b = byId.get(id), d = b && DEFS[b.d]; if (d && d.capacity) s += d.capacity.value; } return s; };
    const effectWells = (k, what) => { const ws = upstreamWells(k + '<'); if (!ws.size) return what; return what + ' — يقطع إنتاج ' + ws.size + ' بئر (طاقتها الاسمية ' + nf(wellFlow(ws)) + ' برميل/يوم).'; };
    const stopReason = (b, fromK) => {                      // why can the flow arriving at this building go no further?  (facts only)
      const d = DEFS[b.d], reasons = [], outs = (portsOf.get(b.id) || []).filter(p => p.role !== 'in' && !(d.type === 'tank' && p.id === 'WATER_OUT'));
      if (b.st === 'DAMAGED') reasons.push(nameOf(b) + ' متضرر (DAMAGED)'); if (d.type === 'valve' && b.s && (b.s.mode === 'CLOSED' || b.s.mode === 'FAULT')) reasons.push('الصمام ' + (b.s.mode === 'CLOSED' ? 'مغلق' : 'معطل'));
      for (const p of outs) { const k = pk(b.id, p.id), at = attached.get(k) || []; for (const z of at) { if (z.end !== 'a') continue; if (z.line.open === false) reasons.push(pipeLabel(z.line) + ' المتصل بالمنفذ ' + p.id + ' مغلق'); else if (!z.line.a || !z.line.b) reasons.push(pipeLabel(z.line) + ' المتصل بالمنفذ ' + p.id + ' غير مكتمل (طرف حر)'); else if (!byId.get(z.line.a.b) || !byId.get(z.line.b.b)) reasons.push(pipeLabel(z.line) + ' يشير إلى منشأة محذوفة'); } }
      if (!reasons.length) { const anyAtt = outs.some(p => (attached.get(pk(b.id, p.id)) || []).some(z => z.end === 'a') || dock.has(pk(b.id, p.id))); reasons.push(anyAtt ? 'منافذ الخروج الموصولة لا تقود إلى مستقبِل' : 'لا يوجد أي أنبوب موصول بمنافذ الخروج'); }
      return reasons; };
    const deadStops = new Map();                            // building id -> {wells:Set, reasons}
    for (const b of items) { const d = DEFS[b.d]; if (!d || d.type !== 'well' || !portsOf.has(b.id)) continue; const outs = portsOf.get(b.id).map(p => pk(b.id, p.id)); if (!outs.some(hasAtt)) continue;
      if (outs.some(k => canReach.has(k + '>'))) continue;
      const st = outs.filter(live).map(k => k + '>'), seen = new Set(st); const stops = new Set();
      while (st.length) { const k = st.pop(), nx = nextNodes(k); if (!nx.length) { const o = bOf(k); if (o && o.id !== b.id) stops.add(o.id); } for (const k2 of nx) if (!seen.has(k2)) { seen.add(k2); st.push(k2); } }
      if (!stops.size) stops.add(b.id);
      for (const sid of stops) { let r = deadStops.get(sid); if (!r) deadStops.set(sid, r = { wells: new Set() }); r.wells.add(b.id); } }
    for (const [sid, r] of deadStops) { const o = byId.get(sid), d = DEFS[o.d], why = stopReason(o), isWell = o.id === [...r.wells][0] && d.type === 'well'; stopSet.add(sid);
      flagB(o, { code: 'DEAD_END', severity: 'CRITICAL', prev: nbrs(o, -1), next: null,
        cause: 'يصل النفط من ' + r.wells.size + ' بئر (' + [...r.wells].slice(0, 4).map(i => '#' + i).join('، ') + (r.wells.size > 4 ? '…' : '') + ') إلى ' + nameOf(o) + ' ثم يتوقف المسار: ' + why.join('؛ ') + '.',
        effect: 'لا يصل النفط إلى أي خزان أو مصفاة — يتوقف إنتاج ' + r.wells.size + ' بئر (طاقتها الاسمية ' + nf(wellFlow(r.wells)) + ' برميل/يوم).', fix: 'أكمل المسار من ' + nameOf(o) + ' إلى خزان أو مصفاة: ' + (why.some(z => /مغلق|معطل/.test(z)) ? 'افتح العنصر المغلق/أصلحه ثم أعد الفحص.' : 'وصل منفذ الخروج بأنبوب كامل ينتهي بمستقبِل.'), evidence: { wells: [...r.wells], stop: sid, reasons: why } }); }

    /* supply: processing buildings that nothing feeds */
    const fromSource = new Set(), sq = []; for (const b of items) { const d = DEFS[b.d]; if (!d || !portsOf.has(b.id)) continue; if (d.type === 'well' || d.type === 'tank' || d.type === 'gas' || d.type === 'central') for (const p of portsOf.get(b.id)) if (p.role !== 'in') { const k = pk(b.id, p.id); if (live(k) && !fromSource.has(k + '>')) { fromSource.add(k + '>'); sq.push(k + '>'); } } }
    while (sq.length) { const k = sq.pop(); for (const k2 of nextNodes(k)) if (!fromSource.has(k2)) { fromSource.add(k2); sq.push(k2); } }

    for (const b of items) {
      const d = DEFS[b.d]; if (!d || d.type === 'central' || !portsOf.has(b.id)) continue; const ps = portsOf.get(b.id), t = d.type;
      if (!ps.length) continue; const ins = ps.filter(p => p.role !== 'out'), outs = ps.filter(p => p.role !== 'in' && !(t === 'tank' && p.id === 'WATER_OUT'));
      const att = ps.filter(p => hasAtt(pk(b.id, p.id))), inAtt = ins.some(p => hasAtt(pk(b.id, p.id))), outAtt = outs.some(p => hasAtt(pk(b.id, p.id)));
      const inLive = ins.some(p => live(pk(b.id, p.id))), outLive = outs.some(p => live(pk(b.id, p.id)));
      if (b.st === 'DAMAGED') flagB(b, { code: 'OUT_OF_SERVICE', severity: 'HIGH', cause: nameOf(b) + ' في حالة DAMAGED.', effect: 'العنصر لا يعمل ولا يمر عبره تدفق.', fix: 'أصلح المنشأة (صيانة) ثم أعد الفحص.', evidence: { st: b.st } });
      if (!att.length) { if (t !== 'valve' || true) flagB(b, { code: 'ISOLATED', severity: t === 'well' || t === 'refinery' || t === 'separator' || t === 'pump' ? 'HIGH' : 'MEDIUM', confirmed: true, prev: null, next: null, cause: nameOf(b) + ' ليس موصولاً بأي أنبوب ولا يلامس أي منفذ متوافق.', effect: t === 'well' ? 'البئر لا يخرج منه نفط (سعته الاسمية ' + nf(d.capacity.value) + ' برميل/يوم غير مستغلة).' : t === 'pump' ? 'المضخة غير متصلة بأي مسار — لا تؤدي أي عمل.' : 'العنصر خارج الشبكة.', fix: 'وصّل ' + d.name + ' بمنافذه المطلوبة أو احذفه إن لم يكن مطلوباً.', evidence: {} }); continue; }
      if (t === 'pump') { if (!inAtt || (!outAtt && d.family !== 'WATER_PUMP')) flagB(b, { code: 'PUMP_DISCONNECTED', severity: !inAtt && !outAtt ? 'CRITICAL' : 'HIGH', cause: !inAtt ? 'المضخة ' + nameOf(b) + ' بلا خط دخول موصول.' : 'المضخة ' + nameOf(b) + ' بلا خط خروج موصول.', effect: 'المضخة لا تضخ شيئاً' + (!inAtt ? '' : '؛ ما يصل إليها لا يتجاوزها') + '.', fix: !inAtt ? 'وصّل منفذ INPUT بمصدر (بئر أو خط تجميع).' : 'وصّل منفذ OUTPUT بخط يقود إلى المستقبِل.', evidence: { in: inAtt, out: outAtt } });
        else if (!inLive || (!outLive && d.family !== 'WATER_PUMP')) flagB(b, { code: 'PUMP_DISCONNECTED', severity: 'HIGH', confirmed: true, cause: nameOf(b) + ' موصولة بأنابيب غير فعّالة (' + (!inLive ? 'خط الدخول' : 'خط الخروج') + ' مغلق أو غير مكتمل).', effect: 'المضخة لا تضخ شيئاً.', fix: 'أكمل/افتح الخط الموصول بالمضخة.', evidence: {} }); }
      else if (t === 'well') { if (!outLive && !stopSet.has(b.id)) flagB(b, { code: 'NO_OUTPUT', severity: 'HIGH', cause: 'مخارج ' + nameOf(b) + ' موصولة بأنابيب غير فعّالة (مغلقة أو غير مكتملة).', effect: 'لا يخرج النفط من البئر (طاقته الاسمية ' + nf(d.capacity.value) + ' برميل/يوم).', fix: 'أكمل أو افتح الأنبوب الموصول بالبئر.', evidence: {} }); }
      else if (t === 'refinery' || t === 'separator') {
        if (!inAtt) flagB(b, { code: 'NO_INPUT', severity: 'HIGH', cause: nameOf(b) + ' بلا خط دخول (' + ins.map(p => p.id).join('، ') + ').', effect: 'المنشأة لا تتلقى خاماً فلا تعمل.', fix: 'وصّل منفذ الدخول بخزان أو خط يحمل الخام.', evidence: {} });
        else if (!inLive) flagB(b, { code: 'NO_INPUT', severity: 'HIGH', cause: 'خط دخول ' + nameOf(b) + ' موصول لكنه مغلق أو غير مكتمل.', effect: 'المنشأة لا تتلقى خاماً فلا تعمل.', fix: 'أكمل أو افتح خط الدخول.', evidence: {} });
        else if (!ins.some(p => fromSource.has(pk(b.id, p.id) + '<'))) { const rs = []; const st = ins.map(p => pk(b.id, p.id)).filter(live).map(k => k + '<'), sk = new Set(st); const roots = new Set(); while (st.length) { const k = st.pop(), pv = prevNodes(k); if (!pv.length) { const o = bOf(k); if (o && o.id !== b.id) roots.add(o.id); } for (const k2 of pv) if (!sk.has(k2)) { sk.add(k2); st.push(k2); } }
          flagB(b, { code: 'NO_SUPPLY', severity: 'HIGH', cause: 'لا يصل إلى ' + nameOf(b) + ' نفط من أي بئر أو خزان: السلسلة المغذية تبدأ عند ' + ([...roots].slice(0, 3).map(i => nameOf(byId.get(i))).join('، ') || 'عنصر غير موصول') + ' التي ليس لها مصدر.', effect: 'المنشأة لا تتلقى خاماً فلا تعمل.', fix: 'اربط بداية السلسلة بخزان أو بئر.', evidence: { roots: [...roots] } }); }
        if (!outAtt && !stopSet.has(b.id) && inAtt) flagB(b, { code: 'NO_OUTPUT', severity: t === 'refinery' ? 'MEDIUM' : 'HIGH', cause: nameOf(b) + ' بلا أي خط خروج موصول.', effect: 'ناتج المنشأة لا يجد مسلكاً' + (t === 'separator' ? ' فيتوقف الفاصل.' : ' (يتراكم/يُحرق وفق المحاكاة).'), fix: 'وصّل منافذ الخروج بخزانات المنتجات.', evidence: {} });
        else if (t === 'separator' && !hasAtt(pk(b.id, 'OIL_OUT')) && inAtt) flagB(b, { code: 'NO_OUTPUT', severity: 'HIGH', cause: 'منفذ OIL_OUT في ' + nameOf(b) + ' غير موصول.', effect: 'لا يخرج الخام من الفاصل فيتوقف.', fix: 'وصّل OIL_OUT بخزان خام.', evidence: {} }); }
      else if (t === 'tank' || t === 'gas') { if (!inAtt) flagB(b, { code: 'NO_INPUT', severity: 'LOW', confirmed: false, cause: nameOf(b) + ' بلا خط دخول: لن يمتلئ بالتدفق.', effect: 'خزان لا يستقبل شيئاً.', fix: 'وصّله بخط يحمل منتجه إن كنت تريد ملأه.', evidence: {} }); }
      else if (t === 'junction') { const n = att.length, fam = d.family; if (fam === 'MANIFOLD') { if (!inAtt || !outAtt) if (!stopSet.has(b.id)) flagB(b, { code: 'BRANCH_NO_EXIT', severity: 'HIGH', cause: 'المجمّع الرئيسي ' + nameOf(b) + ' ' + (!inAtt ? 'بلا مدخل موصول.' : 'بلا مخرج موصول.'), effect: effectWells(pk(b.id, ins[0].id), 'ما يصل إلى المجمّع لا يغادره'), fix: 'وصّل ' + (!inAtt ? 'مدخلاً واحداً على الأقل.' : 'مخرجاً واحداً على الأقل.'), evidence: {} }); }
        else if (n === 1) flagB(b, { code: 'JUNCTION_USELESS', severity: 'LOW', confirmed: false, cause: 'نقطة الربط ' + nameOf(b) + ' موصولة بأنبوب واحد فقط.', effect: 'لا تفرّع شيئاً.', fix: 'وصّل بقية الاتجاهات أو أزلها.', evidence: {} }); }
      else if (t === 'valve') { if ((!inAtt || !outAtt) && !stopSet.has(b.id)) flagB(b, { code: 'BRANCH_NO_EXIT', severity: 'MEDIUM', cause: 'الصمام ' + nameOf(b) + ' ' + (!inAtt ? 'بلا دخول موصول.' : 'بلا خروج موصول.'), effect: 'الصمام لا يتحكم بأي مسار.', fix: 'وصّل طرفيه.', evidence: {} }); }
      if (t === 'valve' && b.s) { const m = b.s.mode; if (m === 'FAULT') flagB(b, { code: 'VALVE_FAULT', severity: 'HIGH', cause: 'حالة ' + nameOf(b) + ' = FAULT.', effect: 'يمنع مرور التدفق عبره.', fix: 'أصلح الصمام.', evidence: { mode: m } });
        else if (m === 'CLOSED' && inAtt && outAtt) flagB(b, { code: 'VALVE_CLOSED', severity: 'MEDIUM', confirmed: false, cause: nameOf(b) + ' مغلق (CLOSED).', effect: effectWells(pk(b.id, ins[0].id), 'التدفق عبر هذا الصمام متوقف'), fix: 'افتح الصمام إن كان الإغلاق غير مقصود.', evidence: { mode: m } });
        else if (m === 'PARTIAL' && b.s.opening < 0.5) flagB(b, { code: 'VALVE_PARTIAL', severity: 'LOW', confirmed: false, cause: nameOf(b) + ' مفتوح ' + Math.round(b.s.opening * 100) + '% فقط.', effect: 'يخنق التدفق إلى ' + Math.round(b.s.opening * 100) + '% من سعته.', fix: 'زد الفتح إن لم يكن مقصوداً.', evidence: { opening: b.s.opening } }); }
      if (solved && b.s) { const s = b.s, ws = sim.warnings(b);
        if (ws.includes('OVER_CAPACITY')) flagB(b, { code: 'ELEMENT_OVERLOAD', severity: 'HIGH', cause: 'أبلغ المحرك عن تجاوز السعة في ' + nameOf(b) + ' (تدفق داخل ' + nf(s._in || 0) + ' من أقصى ' + nf((d.params && (d.params.maxFlow || d.params.maxTotalFlow || d.params.cap)) || (d.capacity && d.capacity.value) || 0) + ' برميل/يوم).', effect: 'العنصر يحدّ التدفق عند سعته القصوى، والباقي لا يمر.', fix: 'أضف عنصراً موازياً أو استبدله بسعة أكبر.', evidence: { in: s._in } });
        if (ws.includes('HIGH_PRESSURE') && t !== 'gas') flagB(b, { code: 'HIGH_PRESSURE', severity: 'MEDIUM', cause: 'أبلغ المحرك عن ضغط مرتفع في ' + nameOf(b) + (s.pOut ? ' (' + nf(s.pOut) + ' psi)' : '') + '.', effect: 'ضغط فوق الحد الآمن للعنصر.', fix: 'خفّف ضغط المضخات أو ارفع أقطار الأنابيب قبله.', evidence: { pOut: s.pOut } });
        if (ws.includes('LOW_PRESSURE')) flagB(b, { code: 'LOW_PRESSURE', severity: 'MEDIUM', cause: 'أبلغ المحرك عن ضغط دخول منخفض في ' + nameOf(b) + '.', effect: 'لا يصل إلى العنصر ضغط كافٍ فينخفض تدفقه.', fix: 'أضف مضخة قبله أو قصّر المسار.', evidence: {} });
        if ((t === 'tank' || t === 'gas') && ws.includes('FULL')) flagB(b, { code: 'TANK_FULL', severity: 'LOW', confirmed: false, cause: nameOf(b) + ' ممتلئ (' + nf(s.vol || 0) + ' من ' + nf(d.capacity.value) + ').', effect: 'لا يستقبل مزيداً: قد يحجب التدفق القادم إليه.', fix: 'بِع المخزون أو أضف سعة تخزين.', evidence: { vol: s.vol } });
        if (t === 'well') { const st = sim.status(b); if (st === 'BLOCKED') { const rel = faults.filter(f => f.code === 'DEAD_END' && f.evidence && f.evidence.wells && f.evidence.wells.includes(b.id)); flagB(b, { code: 'BLOCKED', severity: 'MEDIUM', confirmed: false, cause: 'أبلغ المحرك أن ' + nameOf(b) + ' محجوب: ينتج ' + nf(s._out || 0) + ' من ' + nf(s._target || 0) + ' برميل/يوم.' + (rel.length ? ' مرتبط بالعطل رقم ' + rel.map(r => r.id).join('، ') + '.' : ' لم يتحدد السبب بدقة من بنية الشبكة (قد يكون خزاناً ممتلئاً أو قيد سعة/ضغط أسفل المسار).'), effect: 'الإنتاج الفعلي أقل من المستهدف.', fix: 'راجع الأعطال والتحذيرات على مسار هذا البئر.', evidence: { out: s._out, target: s._target } }); } } }
    }

    /* ---------- numbering: by severity, then by id ---------- */
    faults.sort((a, b) => sevOf(a.severity) - sevOf(b.severity) || (a.confirmed === b.confirmed ? 0 : a.confirmed ? -1 : 1) || a.id - b.id);
    faults.forEach((f, i) => { f.no = i + 1; });
    for (const f of faults) if (f.code === 'BLOCKED') { f.cause = f.cause.replace(/رقم ([\d، ]+)/, (m, ids) => 'رقم ' + ids.split('، ').map(id => { const o = faults.find(z => z.id === +id); return o ? o.no : id; }).join('، ')); }
    const confirmed = faults.filter(f => f.confirmed), warnings = faults.filter(f => !f.confirmed);
    const dockEdges = [...dock].filter(([k, k2]) => k < k2).length, connections = lines.length + dockEdges, healthyLines = lines.filter(L => !lineProblem.has(L.id)).map(L => L.id);
    const healthyBuildings = items.filter(b => DEFS[b.d] && DEFS[b.d].type !== 'central' && !buildingProblem.has(b.id)).length, nb = items.filter(b => DEFS[b.d] && DEFS[b.d].type !== 'central').length;
    const total = lines.length + nb, healthy = healthyLines.length + healthyBuildings;
    const stats = { buildings: nb, lines: lines.length, docked: dockEdges, checked: total, connections, healthyConnections: healthyLines.length + dockEdges, faults: confirmed.length, warnings: warnings.length, critical: faults.filter(f => f.severity === 'CRITICAL').length,
      health: total ? Math.round(healthy / total * 1000) / 10 : 100, healthyElements: healthy, solved };
    return { faults, stats, healthyLines, notes, SEV, OK_COLOR };
  }

  const api = { run, SEV, OK_COLOR, KIND_AR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OliNetDiag = api;
})(typeof window !== 'undefined' ? window : globalThis);
