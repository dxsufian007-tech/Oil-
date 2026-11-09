/* Oli - building-lab.js  (Phase 2 host: the building system on the Phase 1 world)
 * SELECT (palette chip) -> DRAG (live ghost, finger offset) -> VALIDATE (one verdict) -> SMART SNAP (ports line up) -> CONFIRM (build bar).
 * The palette drag, the ghost drag and the pipe tool are captured before the map's own camera input sees them, so the camera never moves during a build gesture.
 * Nothing here touches core.js, the Phase A camera, the Phase C pipes or the map generator; pipes drawn here are a lab layer (a Set of tiles) only.
 */
(function () {
  'use strict';
  const WP = window.__wp, B = OliBuildings, I = OliIndustry, BC = OliBuildingConfig, A = OliBuildingArt, world = WP.world, ctx = WP.ctx, cam = WP.cam, hooks = WP.hooks, CFG = OliWorld.CONFIG, cv = document.getElementById('c');
  const CEN = window.OliCentral || null, CUI = window.OliCentralUI || null, GC = OliGameConfig, GU = window.OliGameUI, AR = window.OliAR, ts = B.fromWorld(world), qsL = new URLSearchParams(location.search), EC = OliEconomyConfig, EU = OliEconomyUI, START_CASH = qsL.get('cash') ? +qsL.get('cash') : window.OLI_DEMO ? 1e8 : EC.START_CASH, STORE = new B.BuildingStore(ts, { cash: START_CASH }), pipes = new I.PipeNet(world.W), SIM = new I.Sim(STORE, pipes), WW = world.W, SAVE_KEY = 'oli-lab-v2', COMPANY = new OliEconomy.Company(STORE, pipes, SIM, { marketSeed: qsL.get('mseed') ? +qsL.get('mseed') : qsL.get('lab') ? 0 : (Math.random() * 4294967295) >>> 0 }), DEMO_CAPITAL = 260e6;
  const $ = id => document.getElementById(id), fmt$ = n => '$' + Math.round(n).toLocaleString('en-US'), nameOf = id => (GC.INFO[id] && GC.INFO[id].name) || B.DEFS[id].name;
  const CAT = { EXTRACTION: '#d9962b', PIPELINE: '#4f8fc0', CRUDE_STORAGE: '#8f9aa6', PROCESSING: '#6faa7d', PRODUCT_STORAGE: '#c86a5a', WATER: '#4aa9d6' }, SECTIONS = ['EXTRACTION', 'PIPELINE', 'CRUDE STORAGE', 'PROCESSING', 'PRODUCT STORAGE', 'WATER'], STCOL = { RUNNING: '#8dffb0', READY: '#cfd8e3', OFFLINE: '#9aa4ae', UNDER_CONSTRUCTION: '#f0be28', DEPLETED: '#ff9a3a', BLOCKED: '#ff8a80', NO_INPUT: '#ffd27a', NO_MATERIALS: '#ff9a3a', NO_OUTPUT: '#ffd27a', LOW_PRESSURE: '#ffd27a', HIGH_PRESSURE: '#ff9a3a', OVER_CAPACITY: '#ff9a3a', MAINTENANCE: '#8fc4ff', DAMAGED: '#ff6a5a' };
  const REASON = { landForSea: 'المنشأة البحرية تُبنى على الماء فقط', zoneSeparation: 'مخزن احتياطي ومخزن تجاري: لا يُربطان تلقائياً', alreadyConnected: 'هاتان المنشأتان متصلتان بالفعل', exists: 'هذا الاتجاه موصول بالفعل', noSpot: 'لا يوجد مكان صالح لوصلة على هذا الخط', pipeSmall: 'قطر الأنبوب أصغر من تدفق المصدر', reserveBounds: 'داخل منطقة الاحتياطي: الخزان يجب أن يقع كاملاً داخل المساحة المفتوحة (وسّع المنطقة لفتح مساحة أكبر)', reserveOnly: 'منطقة الاحتياطي الاستراتيجي (C3 كاملة) للتخزين فقط: لا تُبنى فيها آبار ولا مصافٍ ولا مبانٍ تجارية. المسموح: خزانات الاحتياطي والمضخات والصمامات ونقاط الربط', reserveNotEmpty: 'لا يُهدم خزان احتياطي فيه نفط: اسحبه أو بِعه أولاً', reserveMove: 'لا يُنقل الخزان بين المخزون التجاري والاحتياطي بالسحب؛ ابنِ خزاناً جديداً في المكان المناسب', outside: 'خارج حدود الخريطة', water: 'لا يمكن البناء على الماء', terrain: 'أرض غير مناسبة لهذا المبنى', slope: 'الأرض شديدة الانحدار', overlap: 'يتداخل مع مبنى آخر', tooClose: 'قريب جدًا من منشأة أخرى (اترك مربعًا فارغًا)', CLEARANCE: 'قريب جدًا من منشأة أخرى (اترك مربعًا فارغًا)', OVERLAP: 'يتداخل مع مبنى آخر', TERRAIN: 'أرض غير مناسبة لهذا المبنى', ZONE: 'المصفاة تُبنى داخل المنطقة البنفسجية المتقطعة (منطقة المصافي) — اضغط «مكان آخر»', OIL: 'يجب أن يكون فوق حقل نفط صالح للحفر', CONNECTION: 'نقطة اتصال محجوبة', PRODUCT: 'منتجات غير متوافقة', RULE: 'غير مسموح هنا', LOADING: 'جارٍ تحميل هذا الجزء من الخريطة…',
    needsZone: 'المصفاة تُبنى داخل المنطقة البنفسجية المتقطعة (منطقة المصافي) — اضغط «مكان آخر»', invalidProduct: 'لا يمكن ربط هذين المنتجين ببعضهما', noRoute: 'لا يوجد مسار حر للأنبوب (ماء أو مبانٍ أو أنابيب في الطريق)', portTaken: 'هذه النقطة فيها أنبوب بالفعل', portRoles: 'يجب ربط نقطة خروج بنقطة دخول', noPort: 'ابدأ وانتهِ عند مبنى', sameBuilding: 'اختر مبنى آخر', tooShort: 'الأنبوب قصير جدًا', noOilField: 'يحتاج إلى حقل نفط يمكن الحفر فيه', notDrillable: 'لا يمكن الحفر في هذا الحقل الآن',
    wellHasJack: 'هذا البئر فيه مضخة بالفعل', connectionBlocked: 'نقطة اتصال محجوبة', notLoaded: 'جارٍ تحميل هذا الجزء من الخريطة…', cash: 'الرصيد لا يكفي', unknownBuilding: 'مبنى غير معروف', nothing: 'لا يوجد شيء هنا' };
  const STAR = { RUNNING: 'يعمل', READY: 'جاهز', OFFLINE: 'متوقف', UNDER_CONSTRUCTION: 'قيد البناء', DEPLETED: 'نضب الحقل', BLOCKED: 'مسدود', NO_INPUT: 'لا يصله نفط', NO_MATERIALS: 'ينقصها كيماويات/مواد تشغيل', NO_OUTPUT: 'غير متصل', LOW_PRESSURE: 'ضغط منخفض', HIGH_PRESSURE: 'ضغط مرتفع', OVER_CAPACITY: 'فوق السعة', DAMAGED: 'تالف', MAINTENANCE: 'قيد الصيانة', FULL: 'ممتلئ', NEAR_FULL: 'شبه ممتلئ', EMERGENCY: 'طوارئ' };
  const state = { drag: null, pending: null, sel: null, pipeTool: false, pipeDrag: null, demo: null, toast: '', toastAt: 0, rot: {}, lastTile: null };
  let animUntil = 0, animNeed = false, animOn = false;      // animNeed: this frame shows something that moves (flowing pipes, a running refinery) -> ONE timer schedules the next frame

  /* ------------------------------------------------------------ palette */
  const pal = $('pal'), tabs = $('tabs'); let section = SECTIONS[0];
  const fmtC = d => d.type === 'well' ? '$250k–1.5M' : fmt$(d.cost).replace(/,000,000$/, 'M').replace(/(\d),(\d{3}),(\d{3})$/, (m, a, b2) => a + '.' + b2[0] + 'M').replace(/,000$/, 'k');
  function chipFor(id) {
    const d = B.DEFS[id], b = document.createElement('button'); b.className = 'chip'; b.dataset.def = id; b.style.setProperty('--cat', CAT[d.category]);
    const c = document.createElement('canvas'), W = 76, H = 50; c.width = W * 2; c.height = H * 2; c.style.width = W + 'px'; c.style.height = H + 'px'; b.appendChild(c);
    const g = c.getContext('2d'), [fw, fh] = d.footprint, zz = Math.min(.5, 70 / ((fw + fh) * 32), 40 / ((fw + fh) * 16 + 70));
    g.scale(2, 2); A.draw(g, d.visual, { ox: W / 2 + (fh - fw) * 16 * zz, oy: H - 6 - (fw + fh) * 16 * zz, z: zz, r: 0, w: fw, h: fh, t: .4, fill: .6, state: 'OPERATIONAL' });
    const s = document.createElement('span'); s.textContent = d.name.replace(' (small)', ' S').replace(' (medium)', ' M').replace(' (large)', ' L').replace('Gas / LPG Sphere', 'Gas/LPG Tank'); b.appendChild(s); const q = document.createElement('i'); q.textContent = fmtC(d) + ' · ' + fw + '×' + fh; b.appendChild(q); return b;
  }
  function showSection(sec) { section = sec; pal.innerHTML = ''; for (const id of B.ORDER) if (B.DEFS[id].section === sec && id !== 'central_station') pal.appendChild(chipFor(id)); pal.scrollLeft = 0; for (const t of tabs.children) t.classList.toggle('on', t.dataset.sec === sec); }
  for (const sec of SECTIONS) { const t = document.createElement('button'); t.textContent = sec; t.dataset.sec = sec; t.onclick = () => showSection(sec); tabs.appendChild(t); }
  showSection(SECTIONS[0]);
  function toast(m) { state.toast = m; state.toastAt = performance.now(); const t = $('toast'); t.textContent = m; t.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => { t.style.opacity = 0; }, 2600); }

  /* ------------------------------------------------------------ geometry helpers */
  const dims = (id, r) => B.dimsOf(B.DEFS[id], B.DEFS[id].rotatable ? r : 0);
  function anchorFor(id, r, clientX, clientY, touch) {                            // the pointer is the footprint centre; touch lifts the ghost above the finger
    const t = WP.toTile(clientX, clientY - (touch ? 58 : 0)), [w, h] = dims(id, r); return { x: Math.round(t.x - w / 2), y: Math.round(t.y - h / 2) };
  }
  function evaluate(g, raw) {                                                     // snap + verdict for a ghost {def, r, x, y}; raw = no snapping (dropping exactly where the player pointed)
    const R = Math.max(1, Math.min(4, Math.round(26 / (32 * cam.z))));           // snap radius in tiles shrinks as the player zooms in
    const sn = raw ? null : STORE.snap(g.def, g.x, g.y, g.r, { radius: R, ignoreCash: true });
    if (sn) { g.x = sn.x; g.y = sn.y; g.r = sn.r; g.snapped = true; g.aligned = sn.aligned; } else { g.snapped = false; g.aligned = false; }
    g.verdict = STORE.validate(g.def, g.x, g.y, g.r, {}); return g;
  }

  /* ------------------------------------------------------------ palette drag */
  let pdn = null;
  pal.addEventListener('pointerdown', e => { const chip = e.target.closest('.chip'); if (!chip) return; pdn = { id: chip.dataset.def, x0: e.clientX, y0: e.clientY, pid: e.pointerId, started: false, chip, touch: e.pointerType !== 'mouse' }; });
  window.addEventListener('pointermove', e => {
    if (pdn && e.pointerId === pdn.pid) {
      const dx = e.clientX - pdn.x0, dy = e.clientY - pdn.y0;
      if (!pdn.started && (pdn.touch ? (dy < -10 && Math.abs(dy) > Math.abs(dx) * .7) : Math.hypot(dx, dy) > 6)) { pdn.started = true; try { pdn.chip.setPointerCapture(e.pointerId); } catch (_) { } beginDrag(pdn.id, e, pdn.touch, 'palette'); }
      if (pdn.started) { moveDrag(e); e.preventDefault(); }
    } else if (state.drag && state.drag.from === 'ghost' && e.pointerId === state.drag.pid) { moveDrag(e); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('pointerup', e => {
    if (pdn && e.pointerId === pdn.pid) { const was = pdn; pdn = null; if (was.started) endDrag(e); else showDefinition(was.id); return; }
    if (state.drag && state.drag.from === 'ghost' && e.pointerId === state.drag.pid) { endDrag(e); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('pointercancel', e => { if (pdn && e.pointerId === pdn.pid) { if (pdn.started) cancelAll(true); pdn = null; } if (state.drag && e.pointerId === state.drag.pid) cancelAll(true); }, true);

  function beginDrag(id, e, touch, from) {
    const r = state.rot[id] || 0, g = { def: id, r, x: 0, y: 0, from, pid: e.pointerId, touch }; state.pending = null; hideBar(); const a = anchorFor(id, r, e.clientX, e.clientY, touch); g.x = a.x; g.y = a.y; state.drag = evaluate(g); state.sel = null; WP.markDirty();
    $('info').innerHTML = '<h4>' + nameOf(id) + '</h4><span class="k">حرّك إصبعك فوق الخريطة: الأخضر = يمكن البناء، الأحمر = لا يمكن.</span>';
  }
  function moveDrag(e) {
    const g = state.drag; if (!g) return; const a = g.from === 'ghost' ? { x: Math.round(WP.toTile(e.clientX, e.clientY - (g.touch ? 58 : 0)).x - g.grab.x), y: Math.round(WP.toTile(e.clientX, e.clientY - (g.touch ? 58 : 0)).y - g.grab.y) } : anchorFor(g.def, g.r, e.clientX, e.clientY, g.touch);
    g.over = e.clientY > innerHeight - 140; if (a.x === g.rawX && a.y === g.rawY) { WP.markDirty(); return; } g.rawX = a.x; g.rawY = a.y; g.x = a.x; g.y = a.y; evaluate(g); WP.markDirty();
  }
  function endDrag(e) {
    const g = state.drag; state.drag = null; if (!g) return;
    if (g.over || e.clientY > innerHeight - 140) { state.pending = null; hideBar(); toast('تم الإلغاء'); WP.markDirty(); return; }
    state.pending = { def: g.def, x: g.x, y: g.y, r: g.r, verdict: g.verdict, snapped: g.snapped, aligned: g.aligned }; showBar(); WP.markDirty();
  }
  function cancelAll(silent) { if (state.pipeEdit) { state.pipeEdit = null; try { document.body.classList.remove('pipemode'); } catch (e) { } } state.drag = null; state.pending = null; state.pipeDrag = null; state.pipeMode = null; hideBar(); if (!silent) toast('تم الإلغاء'); WP.markDirty(); }

  /* a pending ghost can be dragged again by touching it (everything else still pans the map) */
  window.addEventListener('pointerdown', e => {
    if (e.target !== cv) return;
    if (state.drag) { e.stopImmediatePropagation(); return; }                                     // a build gesture is running: nothing else may move the camera
    if (state.pipeEdit && editDown(e)) { e.stopImmediatePropagation(); return; }
    if (state.pipeTool) { e.stopImmediatePropagation(); startPipe(e); return; }
    const p = state.pending; if (!p) return; const t = WP.toTile(e.clientX, e.clientY), [w, h] = dims(p.def, p.r);
    if (t.x >= p.x - .6 && t.x <= p.x + w + .6 && t.y >= p.y - .6 && t.y <= p.y + h + .6) {
      e.stopImmediatePropagation(); state.drag = { def: p.def, r: p.r, x: p.x, y: p.y, from: 'ghost', pid: e.pointerId, touch: e.pointerType !== 'mouse', grab: { x: t.x - p.x, y: t.y - p.y + (e.pointerType !== 'mouse' ? 0 : 0) }, verdict: p.verdict }; state.pending = null; hideBar(); WP.markDirty();
    }
  }, true);

  /* ------------------------------------------------------------ sectors: where the player stands, what is allowed there, what it gives (the rules themselves live in buildings.js SECTOR_RULES and are enforced by validate()) */
  const SECK = {}; for (const z of world.sectors || []) { const k = z.kind, o = SECK[k] || (SECK[k] = { codes: [], name: z.name }); o.codes.push(z.code); }
  const secKindText = k => { const o = SECK[k]; return o ? '\u2066' + (o.codes.length > 1 ? o.codes[0] + '–' + o.codes[o.codes.length - 1] : o.codes[0]) + '\u2069 ' + o.name : k; };
  function why(v) {
    if (!v) return ''; const s = v.sector || {}, home = (v.allowedIn || []).map(secKindText).join(' أو ');
    if (v.reason === 'sectorForbidden') return 'غير مسموح في قطاع ' + s.code + ' (' + s.name + ')' + (home ? ' — يُبنى في: ' + home : s.kind === 'F' ? ' — البناء البحري قيد التجهيز' : '');
    if (v.reason === 'sectorReserveOnly') return 'قطاع الاحتياطي الاستراتيجي: الخزانات داخل منطقة الاحتياطي المفتوحة فقط';
    if (v.reason === 'sectorStraddle') return 'المبنى يعبر حدود قطاعين — ضعه كاملاً داخل قطاع واحد' + (home ? ' (' + home + ')' : '');
    return REASON[v.reason] || REASON[v.kind] || v.reason;
  }
  function sectorLine(v) {
    const s = v && v.sector; if (!s) return ''; const perk = (s.perks || []).slice(0, 2).join(' · '), need = (s.needs || [])[0];
    return '<div class="msg" style="font-size:12px;opacity:.9;margin-top:3px">📍 قطاع <b>' + s.code + '</b> · ' + s.name + (v.sectorMult ? ' · خصم ' + Math.round((1 - v.sectorMult) * 100) + '%' : '') + (perk ? '<br>✦ ' + perk : '') + (need && v.ok === false && v.reason !== 'sectorForbidden' ? '<br>⚙ ' + need : '') + '</div>';
  }

  /* ------------------------------------------------------------ confirm bar */
  const bar = $('buildbar');
  function showBar() { const p = state.pending; if (!p) return; const d = B.DEFS[p.def], v = p.verdict, ok = v.ok;
    bar.innerHTML = '<div class="msg ' + (ok ? 'good' : 'bad') + '">' + (ok ? '🟢 مكان صالح للبناء' : '🔴 لا يمكن البناء هنا') + ' · ' + nameOf(p.def) + ' · ' + (ok ? fmt$(v.cost) + (p.aligned ? ' · الأنابيب متحاذية' : '') : (v.state === 'UNAFFORDABLE' ? 'الرصيد لا يكفي (' + fmt$(v.cost) + ')' : why(v))) + '</div>' + sectorLine(v)
      + '<div class="btns"><button id="bBuild"' + (ok ? '' : ' disabled') + '>✓ بناء</button>' + (d.rotatable ? '<button id="bRot">⟳ تدوير</button>' : '') + '<button id="bNext">💡 مكان آخر</button><button id="bCancel">✕ إلغاء</button></div>'; bar.style.display = 'block'; }
  function hideBar() { bar.style.display = 'none'; bar.innerHTML = ''; }
  bar.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; if (state.pipeEdit && editAct(b.id)) return; if (b.id === 'bPipeOne') { const pm = state.pipeMode; if (pm) { pm.oneWay = true; commitPlan(); } return; } if (b.id === 'bBuild') confirmBuild(); else if (b.id === 'bRot') rotatePending(); else if (b.id === 'bCancel') cancelAll(); else if (b.id === 'bNext') { state.spotIdx = (state.spotIdx || 0) + 1; const p = state.pending; if (p) startBuild(p.def, true); } else if (b.id === 'bPipeOk') commitPlan(); else if (b.id === 'bPipeBack') pipeMode(true); else if (b.id === 'bPipeEnd') pipeMode(false); });
  function rotatePending() { const p = state.pending; if (!p) return; const d = B.DEFS[p.def]; if (!d.rotatable) return; const [w0, h0] = dims(p.def, p.r); p.r = (p.r + 1) & 3; state.rot[p.def] = p.r; const [w, h] = dims(p.def, p.r);
    p.x += Math.round((w0 - w) / 2); p.y += Math.round((h0 - h) / 2); const g = evaluate({ def: p.def, r: p.r, x: p.x, y: p.y }, true); p.x = g.x; p.y = g.y; p.verdict = g.verdict; p.aligned = false; showBar(); WP.markDirty(); }
  /* a storage tank that was just built is linked to its adjacent tanks (see I.autoLinkTank): the note says what happened, and why not when it did not */
  function autoLinkNote(b) {
    const al = I.autoLinkTank(STORE, pipes, ts, b.id); let msg = ''; if (al.linked.length) msg += ' · رُبط تلقائياً بـ ' + al.linked.length + ' خزان (وحدة تخزين واحدة)';
    const bad = al.skipped.filter(x => x.reason !== 'exists'); if (bad.length) msg += ' · لم يُربط ' + bad.length + ': ' + [...new Set(bad.map(x => REASON[x.reason] || x.reason))].join('، ');
    if (al.linked.length) { state.pipeSel = null; WP.markDirty(); } return msg;
  }
  function confirmBuild() {
    const p = state.pending; if (!p) return; const r = STORE.place(p.def, p.x, p.y, p.r, {});                       // place() validates again: the player can never build on a stale verdict
    if (!r.ok) { p.verdict = r; showBar(); toast(why(r)); return; }
    state.pending = null; hideBar(); state.sel = r.building.id; if (B.DEFS[p.def].type === 'well') SIM.ensure(r.building).started = false; let msg = nameOf(p.def) + ' · جارٍ البناء · −' + fmt$(r.cost);
    msg += autoLinkNote(r.building);
    toast(msg); save(); showBuilding(r.building.id); WP.markDirty(); updateCash(); adviseUpgrade();
  }

  /* ------------------------------------------------------------ existing buildings: panel, demolish */
  const M = n => n >= 1e6 ? '$' + (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'k' : '$' + n;
  function showDefinition(id) {
    const d = B.DEFS[id], req = [d.requires.oilField ? 'on a drillable oil field' : '', d.zone ? 'inside the ' + d.zone.toLowerCase() + ' zone' : ''].filter(Boolean), ports = d.connections.filter(c => c.kind === 'pipe' && !c.reserved).map(c => c.id.replace(/_/g, ' ').toLowerCase() + (c.product && c.product !== '*' ? ' (' + BC.PRODUCT_LABEL[c.product].toLowerCase() + ')' : '')).join(', ');
    $('info').innerHTML = '<h4>' + d.name + ' <span class="k">' + d.section + '</span></h4><span class="k">' + d.footprint.join('×') + ' tiles · build ' + (d.type === 'well' ? '$250k–1.5M' : M(d.cost)) + ' · runs ' + M(d.operatingCost) + '/day · upkeep ' + M(d.maintenanceCost) + '/day · ' + d.capacity.value.toLocaleString('en-US') + ' ' + d.capacity.unit
      + '<br>Ports: ' + ports + (d.safetyZone ? '<br>Safety zone: ' + d.safetyZone + ' tile' : '') + (req.length ? '<br>Needs: ' + req.join(', ') : '') + '</span><div class="k" style="margin-top:6px">Drag it onto the map.</div>';
  }
  let showAll = false, showEcon = false;
  /* the lines attached to a building: which ones are connected (and which way they carry oil, how much, valve state) and which are open-ended / not connected */
  function connRows(bd) {
    const ls = [...pipes.lines.values()].filter(L => (L.a && L.a.b === bd.id) || (L.b && L.b.b === bd.id)); if (!ls.length) return '';
    const on = ls.filter(L => L.a && L.b), off = ls.filter(L => !(L.a && L.b));
    let h = '<div class="k" style="margin-top:6px">الأنابيب: ' + on.length + ' متصلة' + (off.length ? ' · <span style="color:#ffd27a">' + off.length + ' غير متصلة</span>' : '') + '</div>';
    for (const L of on) { const out = L.a.b === bd.id, other = out ? L.b.b : L.a.b, closed = L.open === false; h += '<div class="k" style="' + (closed ? 'color:#ff8a80' : '') + '">' + (out ? '▶ يرسل إلى ' : '◀ يستقبل من ') + bname(other) + ' · ' + (closed ? '⛔ مغلق' : Math.round(L.flow || 0).toLocaleString('en-US') + ' برميل/يوم') + '</div>'; }
    return h;
  }
  function showBuilding(id) {
    try { return showBuilding_(id); } catch (e) {        /* a card that throws must never be silent: show a basic card + the reason so it can be reported */
      const b = STORE.get(id); state.sel = id; $('info').innerHTML = '<h4>' + (b ? nameOf(b.d) : '') + '</h4><span class="k">تعذّر عرض التفاصيل الكاملة: ' + String(e && e.message || e).slice(0, 90) + '</span>'; try { console.error('showBuilding', e && e.stack); } catch (_) {} WP.markDirty(); }
  }
  function showBuilding_(id) {
    const b = STORE.get(id); if (!b) return; state.sel = id; const d = B.DEFS[b.d], st = SIM.status(b), ind = SIM.indicators(b), warn = SIM.warnings(b), list = showAll ? ind.list : ind.list.slice(0, ind.top);
    const lv = d.type === 'tank' ? SIM.levelStateOf(b) : d.type === 'gas' ? SIM.gasSafetyOf(b) : null;
    const stopped = d.type === 'well' && b.s && b.s.started === false && st !== 'UNDER_CONSTRUCTION', stTxt = stopped ? 'متوقف — اضغط «ابدأ الإنتاج»' : (STAR[st] || st);
    let h = '<h4>' + nameOf(b.d) + ' <span class="st" style="color:' + (stopped ? '#ffd27a' : STCOL[st] || '#fff') + '">● ' + stTxt + '</span></h4>';
    h += '<table class="kv">' + list.filter(i => i.k !== 'Status').map(i => '<tr><td>' + i.k + '</td><td>' + (typeof i.v === 'number' ? i.v.toLocaleString('en-US') : i.v) + (i.u ? ' ' + i.u : '') + '</td></tr>').join('') + '</table>';
    h += connRows(b);
    if (warn.length) h += '<div class="k" style="color:#ffb066">⚠ ' + warn.map(w => STAR[w] || w.replace(/_/g, ' ')).join(' · ') + '</div>';
    if (showAll) h += '<div class="k">Product: ' + (d.product ? BC.PRODUCT_LABEL[d.product] : 'carries the line product') + ' · runs ' + M(d.operatingCost) + '/day · upkeep ' + M(d.maintenanceCost) + '/day · level ' + (b.lv || 1) + '</div>';
    if (d.type === 'well' && st !== 'UNDER_CONSTRUCTION') h += (b.s && b.s.started === false ? '<div class="row"><button id="bStartWell" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff;font-weight:800;min-height:48px;flex:1">▶ ابدأ الإنتاج</button></div>' : '<div class="row"><button id="bStopWell">⏸ أوقف الإنتاج</button></div>');
    if (showEcon) h += '<div class="k" style="margin-top:6px;letter-spacing:.06em">الاقتصاد</div>' + EU.buildingHtml(id);
    h += '<div class="row">' + '<button id="bEcon"' + (showEcon ? ' class="on"' : '') + '>الاقتصاد</button>' + (ind.list.length > ind.top ? '<button id="bMore">' + (showAll ? 'أقل' : 'تفاصيل') + '</button>' : '') + (d.type !== 'well' || false ? '<button id="bConnectAuto" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff;font-weight:800">🔗 توصيل</button>' : '<button id="bConnectAuto" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff;font-weight:800">🔗 توصيل</button>') + (d.type === 'valve' ? '<button id="bValve">الصمام: ' + ({ OPEN: 'مفتوح', PARTIAL: 'جزئي', CLOSED: 'مغلق', FAULT: 'عطل' }[b.s.mode] || b.s.mode) + '</button>' : '') + (d.type === 'refinery' ? '<button id="bLimit">حد التشغيل ' + Math.round(b.s.opLimit * 100) + '%</button>' : '') + '<button id="bDemo">هدم…</button></div>';
    { const el = $('info'); if (!(el._h === h && el._hDom === el.innerHTML)) { el.innerHTML = h; el._h = h; el._hDom = el.innerHTML; WP.markDirty(); } }      // unchanged card: no DOM rewrite and no redraw
  }
  /* what the player sees and can do on a connected line: its direction, flow, valve; its partner line; the whole connection */
  const bname = id => { const x = STORE.get(id); return x ? '<bdi>' + nameOf(x.d) + ' ' + x.id + '</bdi>' : '—'; };
  function lineRows(L) {
    if (!L) return ''; const closed = L.open === false, fl = Math.round(L.flow || 0).toLocaleString('en-US'); let h = '';
    if (L.a && L.b) h += '<tr><td>الاتجاه</td><td>من ' + bname(L.a.b) + ' إلى ' + bname(L.b.b) + (closed ? '' : fl !== '0' ? ' ▶ يتدفق' : ' ◼ لا تدفق الآن') + '</td></tr>';
    h += '<tr><td>الصمام</td><td style="color:' + (closed ? '#ff8a80' : '#8dffb0') + '">' + (closed ? '⛔ مغلق' : '✅ مفتوح') + '</td></tr>';
    const P = I.partnerOf(pipes, L); if (P && P.a && P.b) h += '<tr><td>الخط المقابل</td><td>من ' + bname(P.a.b) + ' إلى ' + bname(P.b.b) + ' · ' + (P.open === false ? '⛔ مغلق' : '✅ مفتوح') + ' · تدفق ' + Math.round(P.flow || 0).toLocaleString('en-US') + '</td></tr>';
    return h;
  }
  function lineButtons(L) {
    if (!L) return ''; const P = I.partnerOf(pipes, L), closed = L.open === false;
    let h = '<div class="row" style="margin-top:6px"><button id="bLineValve" data-id="' + L.id + '" style="min-height:44px;flex:1;' + (closed ? 'background:#2f9e5a;border-color:#2f9e5a;color:#fff' : '') + '">' + (closed ? '✅ افتح هذا الخط' : '⛔ أغلق هذا الخط') + '</button>'
      + (P ? '<button id="bLineValve" data-id="' + P.id + '" style="min-height:44px;flex:1">' + (P.open === false ? '✅ افتح الخط المقابل' : '⛔ أغلق الخط المقابل') + '</button>' : '') + '</div>';
    if (L.conn && P) h += '<div class="row" style="margin-top:6px"><button id="bConnRedo" data-id="' + L.id + '" style="min-height:44px;flex:1">♻️ إعادة إنشاء التوصيل</button><button id="bConnDel" data-id="' + L.id + '" style="min-height:44px;flex:1;background:#7a2a2a;border-color:#a33;color:#fff">🗑️ حذف التوصيل كاملاً</button></div>';
    return h;
  }
  function showPipe(x, y) {
    const i = SIM.pipeInfo(x, y); if (!i) return; state.sel = null; state.pipeSel = { x, y }; const L = pipes.lineAt(x, y), open = !(L && L.a && L.b), st = open ? 'غير متصل' : (i.currentFlow > 0 ? 'متصل · يعمل' : 'متصل');
    $('info').innerHTML = '<h4>🔧 خط أنابيب <span class="st" style="color:' + (open ? '#ffd27a' : '#8dffb0') + '">● ' + st + '</span></h4><table class="kv">'+ lineRows(L) +'<tr><td>المنتج</td><td>' + (i.product === 'unassigned' ? 'غير محدد بعد' : GC.PRODUCT_NAMES[i.product] || i.product) + '</td></tr><tr><td>القطر</td><td>' + i.diameter + ' بوصة</td></tr><tr><td>الطول</td><td>' + L.path.length + ' مربعًا</td></tr><tr><td>الضغط</td><td>' + i.pressure.toLocaleString('en-US') + ' رطل/بوصة²</td></tr><tr><td>التدفق</td><td>' + i.currentFlow.toLocaleString('en-US') + ' برميل / يوم</td></tr><tr><td>السعة</td><td>' + i.capacity.toLocaleString('en-US') + ' برميل / يوم</td></tr></table>'
      + (open ? '<div class="k" style="margin-top:4px">لا يشترط إكمال الشبكة الآن: وصّل الطرف المفتوح بمبنى عندما تبنيه.</div><div class="row"><button id="bConnectLine" data-id="' + L.id + '" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff;font-weight:800;min-height:46px">🔗 وصّل بمبنى</button></div>' : '')
      + lineButtons(L)
      + '<div class="row" style="margin-top:6px"><button id="bPipeEdit" style="min-height:44px">🛠️ تعديل المسار</button><button id="bPipeJoint" style="min-height:44px">🔀 وصلة هنا</button><button id="bPipeRedo" style="min-height:44px">✏️ إعادة رسم</button><button id="bPipeDel" style="min-height:44px;background:#7a2a2a;border-color:#a33;color:#fff">🗑️ حذف</button></div>'; WP.markDirty();
  }
  /* pipes: delete (half the price comes back), redraw (free undo, then draw again from the same start) and a junction on any tile */
  const pipeCostOf = L => L.path.length * BC.PIPES[L.dia].cost;
  function lineBackup(L) { return { a: L.a, b: L.b, path: L.path.map(p => p.slice()), product: L.product, dia: L.dia }; }
  function deletePipe(L, full) { const refund = Math.floor(pipeCostOf(L) * (full ? 1 : 0.5)); pipes.remove(L.id); if (STORE.cash !== Infinity) STORE.cash += refund; return refund; }
  function addJunction(L) {
    const sel = state.pipeSel, n = L.path.length; let idx = L.path.findIndex(p => p[0] === sel.x && p[1] === sel.y); if (n < 3) { toast('الأنبوب قصير جدًا لوضع وصلة'); return false; } idx = Math.max(1, Math.min(n - 2, idx < 0 ? n >> 1 : idx));
    let T = L.path[idx]; const bk = lineBackup(L), cash0 = STORE.cash, cost = BC.JUNCTION.cost; if (STORE.cash < cost) { toast('الرصيد لا يكفي لبناء وصلة'); return false; }
    pipes.remove(L.id); let v = STORE.validate('junction', T[0], T[1], 0, {});
    if (!v.ok) { const order = []; for (let k = 1; k <= n - 2; k++) order.push(k); order.sort((p, q) => Math.abs(p - idx) - Math.abs(q - idx)); for (const k of order) { const vv = STORE.validate('junction', bk.path[k][0], bk.path[k][1], 0, {}); if (vv.ok) { T = bk.path[k]; v = vv; break; } } }
    const before = new Set(pipes.lines.keys()); const rollback = j => { for (const id of [...pipes.lines.keys()]) if (!before.has(id)) pipes.remove(id); if (j) STORE.demolish(j.id, { building: true, pipes: true, pipeSet: pipes }); pipes.lay(bk); STORE.cash = cash0; };
    if (!v.ok) { rollback(null); toast('لا يمكن وضع وصلة هنا: ' + (REASON[v.reason] || v.reason)); return false; }
    const pr = STORE.place('junction', T[0], T[1], 0, { instant: true }); if (!pr.ok) { rollback(null); toast('لا يمكن وضع وصلة هنا'); return false; } const j = pr.building;
    const ports = B.worldPoints(j).filter(q => q.kind === 'pipe' && !q.reserved).map(q => q.id), lay1 = (p) => I.planPipe(STORE, pipes, ts, bk.a, { b: j.id, port: p }, bk.dia, { ignoreCash: true });
    let best = null; for (const p of ports) { const v1 = lay1(p); if (v1.ok && (!best || v1.path.length < best.v.path.length)) best = { p, v: v1 }; }
    if (!best) { rollback(j); toast('تعذّر توصيل الأنبوب بالوصلة'); return false; } const r1 = I.layPipe(STORE, pipes, ts, bk.a, { b: j.id, port: best.p }, bk.dia, { ignoreCash: true }); if (!r1.ok) { rollback(j); toast('تعذّر توصيل الأنبوب بالوصلة'); return false; }
    let ok2 = false; const end = bk.path[bk.path.length - 1]; for (const p of ports) { if (p === best.p) continue; const r2 = bk.b ? I.planPipe(STORE, pipes, ts, { b: j.id, port: p }, bk.b, bk.dia, { ignoreCash: true }) : I.planOpenPipe(STORE, pipes, ts, { b: j.id, port: p }, end, bk.dia, { ignoreCash: true }); if (r2.ok) { const L2 = bk.b ? I.layPipe(STORE, pipes, ts, { b: j.id, port: p }, bk.b, bk.dia, { ignoreCash: true }) : I.layOpenPipe(STORE, pipes, ts, { b: j.id, port: p }, end, bk.dia, { ignoreCash: true }); if (L2.ok) { ok2 = true; break; } } }
    if (!ok2) { rollback(j); toast('تعذّر إكمال الأنبوب بعد الوصلة'); return false; }
    STORE.cash = cash0 - cost; state.sel = j.id; return j;
  }

  $('info').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'bDig') { startBuild('oil_well'); return; }
    if (b.id === 'bStartWell') { const w = STORE.get(state.sel); if (w) { SIM.ensure(w).started = true; toast('🛢️ بدأ الإنتاج'); save(); showBuilding(w.id); } return; }
    if (b.id === 'bStopWell') { const w = STORE.get(state.sel); if (w) { SIM.ensure(w).started = false; toast('تم إيقاف الإنتاج'); save(); showBuilding(w.id); } return; }
    if (b.id === 'bLineValve') { const id = +b.dataset.id, L = pipes.lines.get(id); if (!L) return; I.setLineOpen(pipes, id, L.open === false); save(); toast(L.open === false ? '⛔ أُغلق الخط' : '✅ فُتح الخط'); if (state.pipeSel) showPipe(state.pipeSel.x, state.pipeSel.y); WP.markDirty(); return; }
    if (b.id === 'bConnDel') { const L = pipes.lines.get(+b.dataset.id); if (!L) return; if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '⚠️ اضغط للتأكيد (يُحذف الخطان)'; return; } const r = I.removeConnection(STORE, pipes, L.id, false); state.pipeSel = null; $('info').innerHTML = ''; toast('🗑️ حُذف التوصيل (' + r.ids.length + ' خطوط) · +' + fmt$(r.refund)); save(); updateCash(); WP.markDirty(); return; }
    if (b.id === 'bConnRedo') { const L = pipes.lines.get(+b.dataset.id); if (!L || !L.a || !L.b) return; const A = L.a.b, T = L.b.b, r = I.removeConnection(STORE, pipes, L.id, true); state.pipeSel = null; $('info').innerHTML = ''; pipeMode(true); const pm = state.pipeMode; pm.a = { kind: 'b', id: A }; pm.step = 2; pm.kind = 'auto'; pm.tgt = T; pm.oneWay = false; pm.plan = I.planConnect(STORE, pipes, ts, A, T, {}); autoBar(pm, pm.plan, 'auto'); toast('♻️ أُلغي التوصيل القديم (استُردّ ثمنه كاملاً) · هذا هو التوصيل الجديد المقترح'); save(); updateCash(); WP.markDirty(); return; }
    if (b.id === 'bPipeDel') { const L = state.pipeSel && pipes.lineAt(state.pipeSel.x, state.pipeSel.y); if (!L) return; if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '⚠️ اضغط للتأكيد'; return; } const r = deletePipe(L, false); state.pipeSel = null; $('info').innerHTML = ''; toast('🗑️ تم حذف الأنبوب · +' + fmt$(r)); save(); updateCash(); WP.markDirty(); return; }
    if (b.id === 'bPipeRedo') { const L = state.pipeSel && pipes.lineAt(state.pipeSel.x, state.pipeSel.y); if (!L) return; const a = L.a; deletePipe(L, true); state.pipeSel = null; $('info').innerHTML = ''; pipeMode(true); const pm = state.pipeMode; if (a && STORE.get(a.b)) { pm.a = { kind: 'b', id: a.b }; pm.step = 2; state.sel = a.b; pipeBar('✏️ أُزيل الأنبوب القديم (استرداد كامل). اضغط على المبنى الذي ينتهي عنده الأنبوب الجديد، أو على أرض فارغة.', '', false, '<button id="bPipeBack">↩ البداية</button>'); } save(); updateCash(); WP.markDirty(); return; }
    if (b.id === 'bPipeEdit') { const L = state.pipeSel && pipes.lineAt(state.pipeSel.x, state.pipeSel.y); if (L) routeEdit(L.id); return; }
    if (b.id === 'bPipeJoint') { const L = state.pipeSel && pipes.lineAt(state.pipeSel.x, state.pipeSel.y); if (!L) return; if (!GU.can('junction')) { toast('🔒 نقطة الربط تُفتح في المستوى 2'); return; } const j = addJunction(L); if (j) { state.pipeSel = null; $('info').innerHTML = ''; toast('🔀 تمت إضافة وصلة · ارسم منها أنبوبًا جديدًا'); pipeMode(true); const pm = state.pipeMode; pm.a = { kind: 'b', id: j.id }; pm.step = 2; pipeBar('🔀 الوصلة جاهزة. اضغط على المبنى الذي يتصل به الفرع الجديد، أو على أرض فارغة.', '', false, '<button id="bPipeBack">↩ البداية</button>'); save(); updateCash(); } WP.markDirty(); return; }
    if (b.id === 'bConnectAuto') { const id = state.sel, bd = STORE.get(id); if (!bd) return; pipeMode(true); const pm = state.pipeMode; pm.a = { kind: 'b', id }; pm.step = 2; state.sel = id; pipeBar('✅ ' + nameOf(bd.d) + ' · الآن اضغط على المنشأة الثانية (أو على أنبوب موصول لتتفرّع منه). اللعبة تختار المنافذ والمسار وتبني الخطين.', '', false, '<button id="bPipeBack">↩ البداية</button>'); WP.markDirty(); return; }
    if (b.id === 'bConnectLine') { pipeMode(true); const pm = state.pipeMode; pm.a = { kind: 'line', id: +b.dataset.id }; pm.step = 2; pipeBar('✅ أنبوب مفتوح · اضغط على المبنى الذي تريد توصيله به.', '', false, '<button id="bPipeBack">↩ البداية</button>'); return; }
    if (b.id === 'bMore') { showAll = !showAll; showBuilding(state.sel); return; }
    if (b.id === 'bEcon') { showEcon = !showEcon; showBuilding(state.sel); return; }
    if (b.id === 'bRepair') { const r = COMPANY.repair(state.sel); toast(r.ok ? 'Repaired · −' + OliEconomy.fmtMoney(r.cost) : r.reason === 'noPart' ? 'No spare parts in stock' : r.reason === 'noOps' ? 'No operating materials in stock' : 'Not enough cash to repair'); save(); updateCash(); showBuilding(state.sel); return; }
    if (b.id === 'bValve') { const v = STORE.get(state.sel), order = ['OPEN', 'PARTIAL', 'CLOSED']; const nx = order[(order.indexOf(v.s.mode) + 1) % 3]; SIM.setValve(v, nx, .5); save(); showBuilding(state.sel); return; }
    if (b.id === 'bLimit') { const v = STORE.get(state.sel); v.s.opLimit = v.s.opLimit > .99 ? .75 : v.s.opLimit > .74 ? .5 : 1; save(); showBuilding(state.sel); return; }
    if (b.id === 'bDemo') { const plan = STORE.demolishPlan(state.sel, pipes); state.demo = { id: state.sel, step: 1, plan };
      $('info').innerHTML = '<h4>Demolish ' + plan.name + '?</h4><span class="k">You get back ' + fmt$(plan.refund) + '. ' + (plan.dependents.length ? 'A linked pump jack will lose its well. ' : '') + '</span><div class="row"><button id="bDemoYes" class="danger">Yes, demolish</button><button id="bDemoNo">Keep it</button></div>'; }
    else if (b.id === 'bDemoNo') { state.demo = null; showBuilding(state.sel); }
    else if (b.id === 'bDemoYes') { const d = state.demo; if (!d) return;
      if (d.plan.needsPipeConfirm && d.step === 1) { d.step = 2; $('info').innerHTML = '<h4>' + d.plan.connectedPipes.length + ' pipe' + (d.plan.connectedPipes.length > 1 ? 's are' : ' is') + ' connected</h4><span class="k">The pipes stay in place with an open end. Demolish anyway?</span><div class="row"><button id="bDemoYes" class="danger">Demolish and leave open pipe</button><button id="bDemoNo">Keep it</button></div>'; return; }
      const r = STORE.demolish(d.id, { building: true, pipes: true, pipeSet: pipes }); state.demo = null; if (r.ok) { state.sel = null; toast('Demolished · +' + fmt$(r.refund)); $('info').textContent = 'Demolished.'; save(); updateCash(); } else toast(r.reason); WP.markDirty(); }
  });
  hooks.tap = (px, py) => {
    if (CUI && !state.pipeEdit && !state.pipeMode && !state.pending && !state.drag) { const t0 = WP.toTile(px, py); if (CUI.tap(Math.floor(t0.x), Math.floor(t0.y))) return true; }
    if (state.pipeEdit) return editTap(px, py);
    if (state.pipeMode) return pipeTap(px, py);
    if (state.pending || state.drag) return false;
    const t = WP.toTile(px, py), b = STORE.at(Math.floor(t.x), Math.floor(t.y)); if (b) { showBuilding(b.id); return true; } if (pipes.lineAt(Math.floor(t.x), Math.floor(t.y))) { showPipe(Math.floor(t.x), Math.floor(t.y)); return true; }
    { const rz = world.reserveZoneOfWorld && world.reserveZoneOfWorld(), tx = Math.floor(t.x), ty = Math.floor(t.y); if (rz && tx >= rz.x && ty >= rz.y && tx < rz.x + rz.w && ty < rz.y + rz.h) { state.sel = null; WP.markDirty(); if (EU && EU.open) EU.open('reserve'); return true; } }       // the Strategic Reserve zone: a tap on its ground (not on a building) opens its screen
    const near = STORE.query(Math.floor(t.x) - 1, Math.floor(t.y) - 1, Math.floor(t.x) + 1, Math.floor(t.y) + 1)[0]; if (near && cam.z < .5) { showBuilding(near.id); return true; }
    if (!GU.dev) { const f = fieldNear(t); if (f) { state.sel = null; showField(f); return true; } $('info').innerHTML = ''; state.sel = null; WP.markDirty(); return true; }
    if (state.sel) { state.sel = null; WP.markDirty(); } return false;
  };

  /* ------------------------------------------------------------ pipe tool: drag from a port to a port; the planner validates product, roles, route and cash and returns ONE verdict */
  let dia = BC.PIPE_DEFAULT; const DIAS = Object.keys(BC.PIPES).map(Number);
  $('tPipe').onclick = () => { state.pipeTool = !state.pipeTool; $('tPipe').classList.toggle('on', state.pipeTool); toast(state.pipeTool ? 'Pipe tool: drag from one port to another. Switch it off to pan.' : 'Pipe tool off'); };
  $('tDia').onclick = () => { dia = DIAS[(DIAS.indexOf(dia) + 1) % DIAS.length]; $('tDia').textContent = dia + '"'; const s = BC.PIPES[dia]; toast(dia + '" pipe · ' + s.capacity.toLocaleString('en-US') + ' bbl/day · ' + fmt$(s.cost) + '/tile'); };
  function portNear(t) {
    let best = null, bd = 2.6; for (const b of STORE.query(Math.floor(t.x) - 4, Math.floor(t.y) - 4, Math.floor(t.x) + 4, Math.floor(t.y) + 4)) for (const p of B.worldPoints(b)) { if (p.kind !== 'pipe' || p.reserved) continue; const d = Math.hypot(p.ax + .5 - t.x, p.ay + .5 - t.y); if (d < bd) { bd = d; best = { b: b.id, port: p.id, ax: p.ax, ay: p.ay, product: p.product, role: p.role }; } }
    return best;
  }
  function planFor(a, b) { if (!a || !b) return null; return I.planPipe(STORE, pipes, ts, { b: a.b, port: a.port }, { b: b.b, port: b.port }, dia, { ignoreCash: true }); }
  function startPipe(e) { const t = WP.toTile(e.clientX, e.clientY), a = portNear(t); if (!a) { toast(REASON.noPort); return; } state.pipeDrag = { a, b: null, pid: e.pointerId, cur: t, v: null }; WP.markDirty();
    const mv = ev => { if (ev.pointerId !== state.pipeDrag.pid) return; const d = state.pipeDrag; d.cur = WP.toTile(ev.clientX, ev.clientY); const nb = portNear(d.cur); d.b = nb && nb.b !== d.a.b ? nb : null; d.v = planFor(d.a, d.b); WP.markDirty(); };
    const up = ev => { if (ev.pointerId !== state.pipeDrag.pid) return; window.removeEventListener('pointermove', mv, true); window.removeEventListener('pointerup', up, true); const d = state.pipeDrag; state.pipeDrag = null; WP.markDirty(); if (!d.b) { toast('Drop on another building port'); return; } commitPipe(d.a, d.b); };
    window.addEventListener('pointermove', mv, true); window.addEventListener('pointerup', up, true); }
  /* ------------------------------------------------------------ ROUTE EDITING (touch): handles on the corners of a selected line; drag a handle (or tap it, then tap the new place) to move it; touch the route to add a point; delete a corner; preview with cost and warnings; confirm; undo.
   * Everything is decided by I.planReroute / commitReroute / undoReroute: the line is changed in place, its ends and junctions never move, and no stock is touched. */
  const EREASON = { noRoute: 'لا يوجد مسار حر هناك (مبنى أو أنبوب أو ماء في الطريق)', viaBlocked: 'هذه النقطة على الأنبوب نفسه أو على طرفه', selfOverlap: 'المسار الجديد يتقاطع مع نفسه', openLine: 'الأنبوب غير موصول بمبنى في طرفه الآخر', badRange: 'نقطة غير صالحة', changed: 'تغيّر الأنبوب منذ المعاينة', blocked: 'المسار القديم لم يعد حرًّا (شيء بُني عليه)', nothing: 'لا يوجد تعديل للتراجع عنه', noLine: 'الأنبوب لم يعد موجودًا', cash: 'الرصيد لا يكفي' };
  const EWARN = w => w.code === 'lowerPressure' ? '⚠ المسار أطول: قد يفقد الأنبوب نحو ' + w.psi + ' رطل/بوصة² من الضغط عند تدفق ' + w.flow.toLocaleString('en-US') + ' برميل/يوم' : w.code === 'longerBusy' ? '⚠ الخط مشغول وأصبح أطول بـ ' + w.tiles + ' مربعًا: قد ينخفض التدفق في طرفه البعيد' : w.code === 'closedLine' ? 'ℹ الخط مغلق بصمام: لا يتأثر تدفق الآن' : '';
  function routeEdit(id) {
    const L = pipes.lines.get(id); if (!L || !L.a || !L.b) { toast('تعديل المسار للأنبوب الموصول بمبنيين فقط'); return false; }
    cancelAll(true); try { document.body.classList.add('pipemode'); } catch (e) { } state.pipeEdit = { id, sel: null, plan: null, drag: null, note: '' }; editBar(); WP.markDirty(); return true;
  }
  function editEnd() { state.pipeEdit = null; try { document.body.classList.remove('pipemode'); } catch (e) { } hideBar(); WP.markDirty(); }
  function editLine() { const pe = state.pipeEdit; return pe ? pipes.lines.get(pe.id) : null; }
  function editBar() {
    const pe = state.pipeEdit; if (!pe) return; const L = editLine(); if (!L) { editEnd(); return; }
    const cps = I.controlPoints(L), sel = pe.sel != null ? cps.find(c => c.i === pe.sel) : null, pl = pe.plan; let msg, cls = '';
    if (pl && pl.ok) { cls = 'good'; msg = '🟢 معاينة المسار الجديد · ' + (pl.deltaLen >= 0 ? '+' : '') + pl.deltaLen + ' مربعًا · ' + (pl.cost > 0 ? 'التكلفة ' + fmt$(pl.cost) : 'بلا تكلفة') + pl.warnings.map(w => '<br>' + EWARN(w)).join(''); }
    else if (pl) { cls = 'bad'; msg = '🔴 ' + (pl.state === 'UNAFFORDABLE' ? 'الرصيد لا يكفي (' + fmt$(pl.cost) + ')' : EREASON[pl.reason] || pl.reason); }
    else msg = pe.note || (sel ? '✅ نقطة محددة: اضغط مكانًا جديدًا على الأرض أو اسحبها' + (sel.end ? ' (طرف الأنبوب ثابت: لا يتحرك)' : '') : '🛠️ اسحب أي نقطة بيضاء لتغيير المسار، أو المس الأنبوب لإضافة نقطة');
    bar.innerHTML = '<div class="msg ' + cls + '">' + msg + '</div><div class="btns">' + (pl && pl.ok ? '<button id="bEditOk">✓ اعتماد</button>' : '') + (sel && !sel.end && !pl ? '<button id="bEditDel">🗑️ حذف النقطة</button>' : '') + (pl ? '<button id="bEditNo">✕ إلغاء المعاينة</button>' : '') + '<button id="bEditUndo"' + ((pipes.editLog || []).length ? '' : ' disabled') + '>↩ تراجع</button><button id="bEditEnd">إنهاء</button></div>'; bar.style.display = 'block';
  }
  /* the part of the path a point belongs to: the corners on both sides (the rest of the line is not touched) */
  function editRange(L, j) { const cps = I.controlPoints(L), p = cps.filter(c => c.i < j).pop(), n = cps.find(c => c.i > j); return p && n ? { from: p.i, to: n.i } : null; }
  function editPreview(j, tile) {
    const pe = state.pipeEdit, L = editLine(); if (!L) return; const r = editRange(L, j); if (!r) { pe.plan = { ok: false, reason: 'badRange' }; editBar(); return; }
    pe.plan = I.planReroute(STORE, pipes, ts, L.id, { from: r.from, to: r.to, via: tile ? [tile] : [] }, { ignoreCash: false }); editBar(); WP.markDirty();
  }
  function editHandleAt(px, py) {                                                    // a control point within a fingertip (screen distance), else the nearest route tile
    const L = editLine(); if (!L) return null; const rc = cv.getBoundingClientRect(), X = px - rc.left, Y = py - rc.top, R = Math.max(26, 18 * cam.z); let best = null, bd = R;
    for (const c of I.controlPoints(L)) { const d = Math.hypot(sx(c.x + .5, c.y + .5) - X, sy(c.x + .5, c.y + .5) - Y); if (d < bd) { bd = d; best = { i: c.i, handle: true, end: c.end }; } }
    if (best) return best; bd = Math.max(16, 12 * cam.z); L.path.forEach((t, i) => { const d = Math.hypot(sx(t[0] + .5, t[1] + .5) - X, sy(t[0] + .5, t[1] + .5) - Y); if (d < bd) { bd = d; best = { i, handle: false, end: i === 0 || i === L.path.length - 1 }; } }); return best;
  }
  function editDown(e) {
    const pe = state.pipeEdit; if (!pe) return false; const h = editHandleAt(e.clientX, e.clientY); if (!h) return false;
    pe.sel = h.i; pe.plan = null; pe.drag = { pid: e.pointerId, i: h.i, end: h.end, x0: e.clientX, y0: e.clientY, moved: false }; editBar(); WP.markDirty();
    const mv = ev => { const d = pe.drag; if (!d || ev.pointerId !== d.pid) return; if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 8) return; d.moved = true; if (d.end) return; const t = WP.toTile(ev.clientX, ev.clientY); editPreview(d.i, [Math.floor(t.x), Math.floor(t.y)]); };
    const up = ev => { const d = pe.drag; if (!d || ev.pointerId !== d.pid) return; window.removeEventListener('pointermove', mv, true); window.removeEventListener('pointerup', up, true); pe.drag = null; if (d.end && d.moved) { pe.plan = null; pe.note = 'طرف الأنبوب ثابت (هو منفذ المبنى): حرّك نقطة أخرى'; } editBar(); WP.markDirty(); };
    window.addEventListener('pointermove', mv, true); window.addEventListener('pointerup', up, true); return true;
  }
  function editTap(px, py) {                                                          // a tap on the empty ground moves the selected point there (tap, then tap)
    const pe = state.pipeEdit; if (!pe) return false; const L = editLine(); if (!L) { editEnd(); return true; } const t = WP.toTile(px, py);
    if (pe.sel != null && !(pe.sel === 0 || pe.sel === L.path.length - 1)) editPreview(pe.sel, [Math.floor(t.x), Math.floor(t.y)]); else { pe.note = 'اختر نقطة بيضاء أو المس الأنبوب أولًا'; editBar(); } return true;
  }
  function editAct(id) {
    const pe = state.pipeEdit; if (!pe) return false; const L = editLine();
    if (id === 'bEditEnd') { editEnd(); showPipe(L ? L.path[Math.floor(L.path.length / 2)][0] : 0, L ? L.path[Math.floor(L.path.length / 2)][1] : 0); return true; }
    if (id === 'bEditNo') { pe.plan = null; pe.note = ''; editBar(); WP.markDirty(); return true; }
    if (id === 'bEditDel') { if (pe.sel != null) editPreview(pe.sel, null); return true; }
    if (id === 'bEditUndo') { const r = I.undoReroute(STORE, pipes); if (r.ok) { toast('↩ تم التراجع عن آخر تعديل' + (r.refund ? ' · +' + fmt$(r.refund) : '')); save(); updateCash(); } else toast(EREASON[r.reason] || r.reason); pe.plan = null; pe.sel = null; editBar(); WP.markDirty(); return true; }
    if (id === 'bEditOk') { const r = I.commitReroute(STORE, pipes, ts, pe.plan); if (r.ok) { toast('✅ عُدّل مسار الأنبوب' + (r.cost ? ' · −' + fmt$(r.cost) : '')); save(); updateCash(); pe.plan = null; pe.sel = null; pe.note = ''; } else toast(EREASON[r.reason] || r.reason); editBar(); WP.markDirty(); return true; }
    return false;
  }
  function drawEdit() {
    const pe = state.pipeEdit; if (!pe) return; const L = editLine(); if (!L) return;
    ctx.fillStyle = 'rgba(120,200,255,.28)'; for (const [x, y] of L.path) { diamondPath(x, y, 1, 1); ctx.fill(); }
    const pl = pe.plan; if (pl) { ctx.fillStyle = pl.ok ? 'rgba(80,220,120,.6)' : 'rgba(240,70,60,.5)'; if (pl.ok) { for (const [x, y] of pl.removed) { diamondPath(x, y, 1, 1); ctx.fillStyle = 'rgba(240,90,70,.5)'; ctx.fill(); } ctx.fillStyle = 'rgba(80,220,120,.65)'; for (const [x, y] of pl.added) { diamondPath(x, y, 1, 1); ctx.fill(); } } }
    const R = Math.max(7, 10 * cam.z); for (const c of I.controlPoints(L)) { const X = sx(c.x + .5, c.y + .5), Y = sy(c.x + .5, c.y + .5), on = pe.sel === c.i; ctx.beginPath(); ctx.arc(X, Y, on ? R * 1.3 : R, 0, 7); ctx.fillStyle = c.end ? '#9aa4b2' : '#ffffff'; ctx.fill(); ctx.lineWidth = on ? 4 : 2.5; ctx.strokeStyle = on ? '#ffd24a' : '#3a6ea5'; ctx.stroke(); }
    if (pe.sel != null && !I.controlPoints(L).some(c => c.i === pe.sel) && L.path[pe.sel]) { const t = L.path[pe.sel], X = sx(t[0] + .5, t[1] + .5), Y = sy(t[0] + .5, t[1] + .5); ctx.beginPath(); ctx.arc(X, Y, R * 1.3, 0, 7); ctx.fillStyle = '#ffe9a8'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#ffd24a'; ctx.stroke(); }
  }
  function commitPipe(a, b) {
    const r = I.layPipe(STORE, pipes, ts, { b: a.b, port: a.port }, { b: b.b, port: b.port }, dia, {}); if (!r.ok) { toast(r.state === 'UNAFFORDABLE' ? 'Not enough cash for the pipe' : REASON[r.reason] || r.reason); WP.markDirty(); return r; }
    toast((r.product === '*' ? 'Pipe' : BC.PRODUCT_LABEL[r.product] + ' pipe') + ' laid · ' + r.path.length + ' tiles · −' + fmt$(r.cost)); save(); updateCash(); if (state.sel) showBuilding(state.sel); WP.markDirty(); return r;
  }


  /* ------------------------------------------------------------ game flow: "build" from a card, suggested spots, one-tap pipes, the field card */
  const free = (pp) => !pipes.lines || ![...pipes.lines.values()].some(L => [L.a, L.b].some(e => e && e.b === pp.b && e.port === pp.port));
  function fieldSites() { const out = []; for (const r of world.regions) for (const q of world.regionSites(r.id)) if (q.kind === 'FIELD' && (world.stateOf(q.id) === 'DRILLABLE' || world.stateOf(q.id) === 'PRODUCING')) out.push(q); return out; }
  function spotsFor(id, r) {
    const out = [], [w, h] = dims(id, r), c = WP.toTile(WP.VW() / 2, WP.VH() * .38), focus = (state.sel && STORE.get(state.sel)) || STORE.get(STORE.nextId - 1); let ox = Math.round(c.x), oy = Math.round(c.y), R = 26;
    if (B.DEFS[id].type === 'well') { const f = fieldSites().sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0]; if (!f) return out; ox = Math.round(f.x); oy = Math.round(f.y); R = 16; }
    else if (focus && Math.hypot(focus.x - c.x, focus.y - c.y) < 60) { ox = focus.x + 3; oy = focus.y; }   // next to the building the player is working on, if it is on screen
    if (B.DEFS[id].type === 'refinery') {                                       // a refinery must sit inside a refinery zone: search the zone nearest to the view
      let z = null, zd = Infinity; for (const r of world.regions) for (const q of world.refineryZones(r.id)) { const d = Math.hypot(q.x + q.w / 2 - c.x, q.y + q.h / 2 - c.y); if (d < zd) { zd = d; z = q; } }
      if (z) { ox = Math.round(z.x + z.w / 2); oy = Math.round(z.y + z.h / 2); R = 16; }
    }
    const seen = new Set();
    for (let rad = 0; rad <= R && out.length < 10; rad++) for (let dx = -rad; dx <= rad && out.length < 10; dx++) for (let dy = -rad; dy <= rad && out.length < 10; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue; const x = ox + dx - Math.floor(w / 2), y = oy + dy - Math.floor(h / 2), k = x + ',' + y; if (seen.has(k)) continue; seen.add(k);
      const v = STORE.validate(id, x, y, r, {}); if (v.ok || v.state === 'UNAFFORDABLE') out.push({ x, y });
    }
    return out;
  }
  function startBuild(id, again) {
    if (!again) { cancelAll(true); state.spotIdx = 0; } const r = state.rot[id] || 0, list = spotsFor(id, r);
    if (!list.length) {
      const [w0, h0] = dims(id, r), cx = Math.round(cam.x - w0 / 2), cy = Math.round(cam.y - h0 / 2), v = STORE.validate(id, cx, cy, r, {});
      if (/^sector/.test(v.reason || '')) { state.pending = { def: id, x: cx, y: cy, r, verdict: v, snapped: false, aligned: false }; state.sel = null; $('info').innerHTML = '<h4>' + nameOf(id) + '</h4><span class="k">' + why(v) + '</span>'; showBar(); toast(why(v)); WP.markDirty(); return false; }      // the sector forbids it here: show the red verdict and WHY, so the player knows where it belongs
      toast('لا يوجد مكان مناسب قريب. حرّك الخريطة ثم جرّب مرة أخرى.'); return false;
    }
    const sp = list[(state.spotIdx || 0) % list.length], g = evaluate({ def: id, r, x: sp.x, y: sp.y }), [w, h] = dims(id, g.r); state.pending = { def: id, x: g.x, y: g.y, r: g.r, verdict: g.verdict, snapped: g.snapped, aligned: g.aligned }; state.sel = null;
    WP.goto(g.x + w / 2, g.y + h / 2, Math.max(cam.z, .55)); $('info').innerHTML = '<h4>' + nameOf(id) + '</h4><span class="k">اسحب المبنى على الخريطة لتغيير مكانه، ثم اضغط «بناء».</span>'; showBar(); WP.markDirty(); return true;
  }
  function freePorts(b, roles) { return B.worldPoints(b).filter(p => p.kind === 'pipe' && !p.reserved && (!roles || roles.includes(p.role)) && free({ b: b.id, port: p.id })); }
  function bestPlan(aId, bId) {
    const A = STORE.get(aId), Bb = STORE.get(bId); let best = null, fail = null;
    for (const p of freePorts(A)) for (const q of freePorts(Bb)) { const v = I.planPipe(STORE, pipes, ts, { b: aId, port: p.id }, { b: bId, port: q.id }, dia, { ignoreCash: true }); if (v.ok) { if (!best || v.path.length < best.path.length) best = v; } else if (!fail || (v.reason === 'invalidProduct' && fail.reason !== 'invalidProduct') || fail.reason === 'portRoles') fail = v; }
    if (best) return best; return fail || { ok: false, reason: 'portTaken' };
  }
  function openPlan(aId, end) {
    const A = STORE.get(aId); let fail = null; const ps = freePorts(A, ['out', 'both']).sort((p, q) => Math.hypot(p.ax - end[0], p.ay - end[1]) - Math.hypot(q.ax - end[0], q.ay - end[1]));
    if (!ps.length) return { ok: false, reason: 'portTaken' }; for (const p of ps) { const v = I.planOpenPipe(STORE, pipes, ts, { b: aId, port: p.id }, end, dia, { ignoreCash: true }); if (v.ok) return v; fail = v; } return fail;
  }
  function pipeBar(msg, cls, ok, extra) { bar.innerHTML = '<div class="msg ' + (cls || '') + '">' + msg + '</div><div class="btns">' + (ok ? '<button id="bPipeOk">✓ بناء</button>' : '') + (extra || '') + '<button id="bPipeEnd">✕ إنهاء</button></div>'; bar.style.display = 'block'; }
  function pipeMode(on) {
    try { document.body.classList.toggle('pipemode', !!on); } catch (e) { }                    // while a pipe is being drawn / connected the info card steps aside (it would cover the buildings to tap)
    if (!on) { state.pipeMode = null; state.pipeDrag = null; hideBar(); WP.markDirty(); return; } cancelAll(true); state.pipeMode = { step: 1, a: null, plan: null }; state.pipeDrag = null;
    pipeBar('🔧 اضغط على المبنى الذي يبدأ منه الأنبوب (مثلًا البئر)'); WP.markDirty();
  }
  function nearBuilding(t) { return STORE.at(Math.floor(t.x), Math.floor(t.y)) || STORE.query(Math.floor(t.x) - 1, Math.floor(t.y) - 1, Math.floor(t.x) + 1, Math.floor(t.y) + 1)[0] || null; }
  /* the verdict of an automatic connection, in plain Arabic: what will be built, what it costs, what cannot be done and why */
  function autoBar(pm, v, kind) {
    const ln = v.lines || [], dirTxt = d => d === 'ab' ? 'ذهاب' : 'إياب', rs = r => REASON[r] || r, tiles = ln.reduce((q, l) => q + l.path.length, 0);
    let msg = '';
    if (!ln.length) msg = '🔴 تعذّر التوصيل: ' + (v.state === 'UNAFFORDABLE' ? 'الرصيد لا يكفي' : rs(v.reason));
    else {
      msg = (v.ok ? '🟢 ' : v.state === 'UNAFFORDABLE' ? '🟠 ' : '🔴 ') + (kind === 'branch' ? 'تفرّع بوصلة · ' : '') + ln.length + (ln.length === 2 ? ' خطان مستقلان (ذهاب وإياب)' : ' خط واحد') + ' · ' + tiles + ' مربعاً' + (v.junctionCost ? ' · وصلة ' + fmt$(v.junctionCost) : '') + ' · التكلفة الكلية ' + fmt$(v.cost);
      for (const n of v.notes || []) { if (n.reason === 'oneWay') msg += n.why === 'directionalDevice' ? '<br>ℹ المضخة/التفريعة تدفع باتجاه واحد، لذلك يكفي خط واحد' : '<br>ℹ اتجاه ' + dirTxt(n.dir) + ' غير ممكن بطبيعة المنشأتين (خط واحد يكفي)'; else if (n.reason === 'pipeSmall') msg += '<br>⚠ تدفق المصدر ' + Math.round(n.flow).toLocaleString('en-US') + ' أكبر من سعة الأنبوب ' + n.capacity.toLocaleString('en-US'); }
      for (const p of v.problems || []) msg += '<br>✖ اتجاه ' + dirTxt(p.dir) + ': ' + rs(p.reason);
      if (ln.length === 2 && v.ok) msg += '<br>ℹ يُفتح خط الذهاب فقط؛ خط الإياب جاهز بصمام مغلق (تفتحه من بطاقة الأنبوب).';
      if (v.partial) msg += '<br>التوصيل ناقص ولن يُعتمد تلقائياً.';
      if (v.state === 'UNAFFORDABLE') msg += '<br>الرصيد لا يكفي.';
    }
    pipeBar(msg, v.ok ? 'good' : 'bad', !!v.ok, (v.partial && ln.length && STORE.cash >= v.cost ? '<button id="bPipeOne">بناء الخط الممكن فقط (' + fmt$(v.cost) + ')</button>' : '') + '<button id="bPipeBack">↩ البداية</button>');
  }
  function pipeTap(px, py) {
    const pm = state.pipeMode, t = WP.toTile(px, py), tx = Math.floor(t.x), ty = Math.floor(t.y), bld = nearBuilding(t), ln = pipes.lineAt(tx, ty);
    if (pm.step === 1) {
      if (bld) { pm.a = { kind: 'b', id: bld.id }; pm.step = 2; state.sel = bld.id; pipeBar('✅ ' + nameOf(bld.d) + ' · الآن اضغط على المبنى الذي ينتهي عنده الأنبوب، أو على أرض فارغة لينتهي الأنبوب مفتوحًا (غير متصل).', '', false, '<button id="bPipeBack">↩ البداية</button>'); }
      else if (ln && !ln.b) { pm.a = { kind: 'line', id: ln.id }; pm.step = 2; pipeBar('✅ أنبوب مفتوح · اضغط على المبنى الذي تريد توصيله به.', '', false, '<button id="bPipeBack">↩ البداية</button>'); }
      else toast('اضغط على مبنى لتبدأ منه'); WP.markDirty(); return true;
    }
    let plan = null, kind = null;
    if (pm.a.kind === 'b') { if (bld && bld.id !== pm.a.id) { plan = I.planConnect(STORE, pipes, ts, pm.a.id, bld.id, {}); kind = 'auto'; pm.tgt = bld.id; }
      else if (!bld && ln && ln.a && ln.b && ln.a.b !== pm.a.id && ln.b.b !== pm.a.id) { plan = I.branchTo(STORE, pipes, ts, pm.a.id, { line: ln.id, idx: pm.idx = Math.max(1, ln.path.findIndex(p => p[0] === tx && p[1] === ty)) }, { commit: false }); kind = 'branch'; pm.tgt = ln.id; }
      else if (!bld && !ln) { plan = openPlan(pm.a.id, [tx, ty]); kind = 'open'; } else { toast('اختر مبنى آخر، أو أنبوباً موصولاً، أو أرضاً فارغة'); return true; } }
    else if (bld) { const L = pipes.lines.get(pm.a.id); let fail = null; for (const p of freePorts(bld, ['in', 'both'])) { const v = I.planClosePipe(STORE, pipes, ts, pm.a.id, { b: bld.id, port: p.id }, { ignoreCash: true }); if (v.ok) { if (!plan || v.add.length < plan.add.length) { plan = v; plan.port = p.id; plan.bid = bld.id; } } else fail = fail || v; } if (!plan) plan = fail || { ok: false, reason: 'portTaken' }; kind = 'close'; }
    else { toast('اضغط على مبنى لتوصيل الأنبوب به'); return true; }
    pm.plan = plan; pm.kind = kind; pm.end = [tx, ty]; pm.bid = bld && bld.id; pm.oneWay = false;
    if (kind === 'auto' || kind === 'branch') { autoBar(pm, plan, kind); state.pipeDrag = null; WP.markDirty(); return true; }
    if (plan.ok) { const tiles = (plan.path || plan.add).length, afford = STORE.cash >= plan.cost, prod = plan.product && plan.product !== '*' ? ' ' + GC.PRODUCT_NAMES[plan.product] : '';
      pipeBar((kind === 'open' ? '🟠 أنبوب مفتوح (غير متصل)' : '🟢 مسار صالح') + prod + ' · ' + tiles + ' مربعًا · ' + fmt$(plan.cost) + (afford ? '' : ' · الرصيد لا يكفي'), afford ? 'good' : 'bad', afford, '<button id="bPipeBack">↩ البداية</button>'); }
    else pipeBar('🔴 ' + (plan.state === 'UNAFFORDABLE' ? 'الرصيد لا يكفي' : REASON[plan.reason] || plan.reason), 'bad', false, '<button id="bPipeBack">↩ البداية</button>');
    state.pipeDrag = null; WP.markDirty(); return true;
  }
  /* SMART PIPE SIZING: after the network changes, lines whose real flow now exceeds their size are offered an upgrade; the player confirms and pays the price difference (upgrade only, never smaller) */
  let advSig = '';
  function adviseUpgrade(force) {
    let el = document.getElementById('pipeAdvice'); const adv = I.pipeAdvice(STORE, pipes), sig = adv.list.map(x => x.id + ':' + x.to).join(',');
    if (!adv.list.length) { if (el) el.style.display = 'none'; advSig = ''; return; } if (!force && sig === advSig) return; advSig = sig;
    if (!el) { el = document.createElement('div'); el.id = 'pipeAdvice'; el.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(96px + env(safe-area-inset-top,0px));z-index:60;background:#12202e;color:#fff;border:1px solid #4aa9d6;border-radius:14px;padding:10px 12px;font:600 14px system-ui;display:none;direction:rtl;box-shadow:0 6px 20px rgba(0,0,0,.45)'; document.body.appendChild(el); el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'up') { const r = I.upgradeLines(STORE, pipes); if (r.ok) { toast('✅ تمت ترقية ' + r.n + ' أنبوب · −' + fmt$(r.cost)); save(); updateCash(); WP.markDirty(); } else toast(r.reason === 'cash' ? 'الرصيد لا يكفي للترقية (' + fmt$(r.cost) + ')' : 'لا ترقية مطلوبة'); }
      el.style.display = 'none'; advSig = ''; if (b.dataset.a !== 'up') advSig = '*' + advSig; }); }
    const n = adv.list.length; el.innerHTML = '<div>🔧 تحليل الشبكة: ' + n + (n === 1 ? ' أنبوب' : ' أنابيب') + ' لا يكفي تدفقها الفعلي. ترقيتها إلى الحجم المناسب تكلّف <b>' + fmt$(adv.cost) + '</b>.</div><div style="display:flex;gap:8px;margin-top:8px"><button data-a="up" style="flex:1;padding:9px;border-radius:10px;border:0;background:#2f9e5a;color:#fff;font:700 14px system-ui">ترقية الآن</button><button data-a="later" style="flex:1;padding:9px;border-radius:10px;border:1px solid #556;background:transparent;color:#fff;font:700 14px system-ui">لاحقاً</button></div>'; el.style.display = 'block';
  }
  function commitPlan() {
    const pm = state.pipeMode; if (!pm || !pm.plan || !(pm.plan.ok || (pm.oneWay && pm.plan.partial && pm.plan.lines.length))) return; const pl = pm.plan; let r = null;
    if (pm.kind === 'auto' || pm.kind === 'branch') {
      r = pm.kind === 'auto' ? I.layConnect(STORE, pipes, ts, pm.a.id, pm.tgt, { allowOneWay: pm.oneWay }) : I.branchTo(STORE, pipes, ts, pm.a.id, { line: pm.tgt, idx: pm.idx }, { allowOneWay: pm.oneWay });
      if (!r.ok) { toast(r.state === 'UNAFFORDABLE' ? 'الرصيد لا يكفي' : REASON[r.reason] || r.reason || 'تعذّر التوصيل'); autoBar(pm, r, pm.kind); WP.markDirty(); return; }
      toast('✅ تم التوصيل · ' + r.made.length + (r.made.length === 2 ? ' خطان' : ' خط') + ' · −' + fmt$(r.cost)); save(); updateCash(); pipeMode(true); adviseUpgrade(); WP.markDirty(); return;
    }
    if (pm.kind === 'pipe') r = I.layPipe(STORE, pipes, ts, pl.a, pl.b, dia, {}); else if (pm.kind === 'open') r = I.layOpenPipe(STORE, pipes, ts, pl.a, pm.end, dia, {}); else r = I.closePipe(STORE, pipes, ts, pl.id, { b: pl.bid, port: pl.port }, {});
    if (!r.ok) { toast(r.state === 'UNAFFORDABLE' ? 'الرصيد لا يكفي للأنبوب' : REASON[r.reason] || r.reason); return; }
    toast(pm.kind === 'open' ? '🟠 تم مد الأنبوب ولم يتصل بعد' : '✅ تم الربط · الحالة: متصل · −' + fmt$(r.cost)); save(); updateCash(); pipeMode(true); WP.markDirty();
  }
  /* the oil field card: the player taps a field and is offered "dig a well" */
  function fieldNear(t) { let best = null, bd = 4.5; for (const f of fieldSites()) { const d = Math.hypot(f.x - t.x, f.y - t.y); if (d < bd) { bd = d; best = f; } } return best; }
  function showField(f) {
    const n = STORE.list().filter(b => B.DEFS[b.d].type === 'well' && Math.hypot(b.x - f.x, b.y - f.y) < 14).length;
    $('info').innerHTML = '<h4>⛰️ حقل نفط' + (f.sector ? ' · ' + f.sector : '') + '</h4><span class="k">يمكنك الحفر هنا. ' + (n ? 'لديك ' + n + ' بئر في هذا الحقل.' : 'لا توجد آبار في هذا الحقل بعد.') + ' تكلفة البئر من ' + fmt$(B.DEFS.oil_well.cost) + '.</span><div class="row"><button id="bDig" data-fx="' + f.x + '" data-fy="' + f.y + '" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff;font-weight:800;min-height:46px">🛢️ حفر بئر</button></div>'; WP.markDirty();
  }

  /* ------------------------------------------------------------ drawing */
  const sx = WP.sx, sy = WP.sy;
  function diamondPath(x, y, w, h) { ctx.beginPath(); ctx.moveTo(sx(x, y), sy(x, y)); ctx.lineTo(sx(x + w, y), sy(x + w, y)); ctx.lineTo(sx(x + w, y + h), sy(x + w, y + h)); ctx.lineTo(sx(x, y + h), sy(x, y + h)); ctx.closePath(); }
  function tankFill(b) { const d = B.DEFS[b.d]; return b.s && b.s.vol != null ? b.s.vol / d.capacity.value : 0; }
  // Stage 5 perf: a building that does not move is painted ONCE into a small offscreen sprite and then just copied (panning no longer re-runs ~100 canvas operations per building per frame).
  // Not used while the zoom is changing, and never for the refinery (flare / fans animate).  Sprites are keyed by visual, rotation, size, zoom, resolution, fill (1/32) and state.
  const SPRITES = !/nosprite/.test(location.search), sprites = new Map(), latest = new Map(); let scaledUsed = false, zTimer = 0, lastZ = cam.z, zStable = false, spriteDpr = 0, spriteBudget = 3;
  window.__perfSpr = () => sprites.size; window.__perfSprPx = () => spritePx;                                   /* test build only reads this (memory report) */
  let spritePx = 0;
  function makeSprite(d, o, fill, z) {                                       // one picture of a building at zoom z (the whole procedural drawing, done once)
    const dpr = WP.dpr(), [W, H] = o.r & 1 ? [o.h, o.w] : [o.w, o.h], pad = 12, up = 5 * A.HU * z, offX = H * 32 * z + pad, offY = up + pad, cw = Math.ceil((W + H) * 32 * z + 2 * pad), ch = Math.ceil(up + (W + H) * 16 * z + 2 * pad);
    if (cw * ch * dpr * dpr > 6e6) return null; const c = document.createElement('canvas'); c.width = Math.ceil(cw * dpr); c.height = Math.ceil(ch * dpr); const g = c.getContext('2d'); g.scale(dpr, dpr);
    A.draw(g, d.visual, Object.assign({}, o, { z, ox: offX, oy: offY, fill: fill / 32 })); spritePx += c.width * c.height; return { c, offX, offY, cw, ch, z, px: c.width * c.height };
  }
  function keepSprite(key, sp) {                                             // bounded cache: at most 240 pictures and ~12M pixels (about 48 MB), oldest dropped first
    sprites.set(key, sp); while ((sprites.size > 240 || spritePx > 12e6) && sprites.size > 1) { const k = sprites.keys().next().value, q = sprites.get(k); spritePx -= q.px; sprites.delete(k); }
  }
  function drawSprite(d, o, b) {
    if (d.visual === 'refinery') return false; const dpr = WP.dpr(); spriteDpr = dpr;           // pictures are keyed by resolution: a change of resolution (moving the map) keeps the others, the size limit drops the oldest
    const fill = Math.round(Math.max(0, Math.min(1, o.fill || 0)) * 32), base = d.visual + '|' + o.r + '|' + o.w + 'x' + o.h + '|' + dpr + '|' + fill + '|' + o.state;
    const steady = b._fb === fill; b._fb = fill;
    if (!zStable) {                                                           // the zoom is changing: a picture made at the nearest zoom step (about 9% apart) is drawn slightly scaled - no full procedural redraw of every building per frame; a crisp frame follows when the zoom stops
      const zq = Math.pow(2, Math.round(Math.log2(o.z) * 8) / 8), qk = base + '|q' + zq.toFixed(4); let q = sprites.get(qk);
      if (!q) { if (!steady || spriteBudget <= 0) return false; spriteBudget--; q = makeSprite(d, o, fill, zq); if (!q) return false; keepSprite(qk, q); }
      const k = o.z / zq; ctx.drawImage(q.c, o.ox - q.offX * k, o.oy - q.offY * k, q.cw * k, q.ch * k); scaledUsed = true; return true;
    }
    const key = base + '|' + o.z.toFixed(3); let sp = sprites.get(key);
    if (!sp) {
      if (!steady || spriteBudget <= 0) return false;                         // a tank whose level is changing right now is drawn directly (no point caching a picture that is stale next frame)
      spriteBudget--;                                                         // at most 3 new pictures per frame - the rest are drawn directly, so a burst (e.g. tanks filling at x5) never causes a long frame
      sp = makeSprite(d, o, fill, o.z); if (!sp) return false; keepSprite(key, sp);
    }
    ctx.drawImage(sp.c, Math.round((o.ox - sp.offX) * dpr) / dpr, Math.round((o.oy - sp.offY) * dpr) / dpr, sp.cw, sp.ch); return true;
  }
  function drawBuildings(lv, vb) {
    zStable = Math.abs(cam.z - lastZ) < 1e-6; lastZ = cam.z; spriteBudget = 3; scaledUsed = false;
    animNeed = false; const now = performance.now() / 1000, list = STORE.query(Math.floor(vb.x0) - 2, Math.floor(vb.y0) - 2, Math.ceil(vb.x1) + 2, Math.ceil(vb.y1) + 2); let anim = false;
    const sk = p => { if (p._skr !== p.r || p._skx !== p.x || p._sky !== p.y) { const a = B.dimsOf(B.DEFS[p.d], p.r); p._sk = p.x + a[0] + p.y + a[1]; p._skr = p.r; p._skx = p.x; p._sky = p.y; } return p._sk; };      // draw order key cached on the building (it only changes if the building does)
    list.sort((p, q) => sk(p) - sk(q));
    // pipes first (they lie on the ground)
    if (pipes.central && CUI) { try { CUI.draw(ctx, sx, sy, cam, vb, pipes.central, CEN.COLOR, CEN.CHANNELS, () => { animNeed = true; }); } catch (_) { } }
    if (pipes.size && lv !== 'FAR') { const tp = performance.now(); drawPipes(vb); WP.stats.t.pipes += performance.now() - tp; }
    for (const b of list) {
      const d = B.DEFS[b.d], [w, h] = B.dimsOf(d, b.r);
      if (lv === 'FAR' || cam.z < .12) { diamondPath(b.x, b.y, w, h); ctx.fillStyle = CAT[d.category]; ctx.fill(); ctx.strokeStyle = 'rgba(20,16,10,.7)'; ctx.lineWidth = 1; ctx.stroke(); continue; }
      const o = { ox: sx(b.x, b.y), oy: sy(b.x, b.y), z: cam.z, r: b.r, w: d.footprint[0], h: d.footprint[1], t: now, fill: tankFill(b), state: b.st };
      if (!(SPRITES && drawSprite(d, o, b))) { A.draw(ctx, d.visual, o); WP.stats.sprMiss = (WP.stats.sprMiss | 0) + 1; } else WP.stats.sprHit = (WP.stats.sprHit | 0) + 1;
      if (d.type === 'refinery' && b.s && b.s._in > 0) animNeed = true;
      if (b.id === state.sel) { diamondPath(b.x, b.y, w, h); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2.2; ctx.setLineDash([7, 4]); ctx.stroke(); ctx.setLineDash([]); drawPorts(b, true); }
    }
    if (lv !== 'FAR' && state.sel != null) { const sb = STORE.get(state.sel); const gi = sb && B.DEFS[sb.d].type === 'tank' ? SIM.groupInfo(sb) : null; if (gi && gi.n > 1) drawGroupFrame(gi, sb); else lastGroupFrame = null; } else lastGroupFrame = null;
    if (scaledUsed) { clearTimeout(zTimer); zTimer = setTimeout(() => WP.markDirty(), 140); }
    animOn = animNeed && cam.z >= .3 && COMPANY.speed > 0;      // moving parts (flowing pipes, a running refinery) are refreshed by the 480 ms tick below - at most 2 frames/s, none at all while paused / idle
  }
  let lastGroupFrame = null;
  /* a light frame around the tank group of the selected tank: each member outlined, one outer frame, and a label with the number of tanks, the group capacity and the total stock */
  function drawGroupFrame(gi, sb) {
    const ms = gi.members.map(id => STORE.get(id)).filter(Boolean); if (!ms.length) return; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    ctx.save(); ctx.lineJoin = 'round'; ctx.setLineDash([3, 3]); ctx.lineWidth = Math.max(1, 1.6 * Math.min(1.4, cam.z + .4)); ctx.strokeStyle = 'rgba(125,205,255,.85)'; ctx.fillStyle = 'rgba(110,190,255,.07)';
    for (const m of ms) { const [w, h] = B.dimsOf(B.DEFS[m.d], m.r); diamondPath(m.x, m.y, w, h); ctx.fill(); if (m.id !== sb.id) ctx.stroke(); x0 = Math.min(x0, m.x); y0 = Math.min(y0, m.y); x1 = Math.max(x1, m.x + w); y1 = Math.max(y1, m.y + h); }
    ctx.setLineDash([9, 5]); ctx.lineWidth = Math.max(1.4, 2.2 * Math.min(1.4, cam.z + .4)); ctx.strokeStyle = 'rgba(150,220,255,.95)'; diamondPath(x0 - .8, y0 - .8, x1 - x0 + 1.6, y1 - y0 + 1.6); ctx.stroke(); ctx.setLineDash([]);
    const f = v => v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(Math.round(v)), txt = 'مجموعة تخزين · ' + gi.n + ' خزان · السعة ' + f(gi.capacity) + ' · المخزون ' + f(gi.volume), ax = sx(x0 - .8, y0 - .8), ay = sy(x0 - .8, y0 - .8) - 16;
    ctx.font = '700 12px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const tw = ctx.measureText(txt).width + 18, bx = Math.max(6 + tw / 2, Math.min(cv.clientWidth - 6 - tw / 2, cv.clientWidth / 2)), by = Math.max(150, Math.min(cv.clientHeight - 230, ay));
    ctx.fillStyle = 'rgba(10,22,44,.92)'; ctx.strokeStyle = 'rgba(150,220,255,.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(bx - tw / 2, by - 11, tw, 22, 8) : ctx.rect(bx - tw / 2, by - 11, tw, 22)); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e8f6ff'; ctx.fillText(txt, bx, by + 1);
    ctx.restore(); lastGroupFrame = { n: gi.n, capacity: gi.capacity, volume: gi.volume, label: txt, members: ms.length };
  }
  function drawPipes(vb) {                                                                  // Stage 5 perf: the visible lines are collected first and stroked in a few batches (one path per style) instead of 3-4 canvas strokes per line
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; const view = [vb.x0 - 3, vb.y0 - 3, vb.x1 + 3, vb.y1 + 3], vis = [];
    for (const L of pipes.lines.values()) { const P = L.path; if (!P.length) continue; let bb = L._bb; if (!bb || L._bbp !== P || L._bbn !== P.length) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of P) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; } bb = L._bb = [x0, y0, x1, y1]; L._bbp = P; L._bbn = P.length; }
      if (bb[2] < view[0] || bb[0] > view[2] || bb[3] < view[1] || bb[1] > view[3]) continue;      /* the line's box is off screen: its points are not even looked at */
      for (const q of P) if (q[0] >= view[0] && q[0] <= view[2] && q[1] >= view[1] && q[1] <= view[3]) { vis.push(L); break; } }
    if (!vis.length) return; const add = L => { L.path.forEach((q, i) => i ? ctx.lineTo(sx(q[0] + .5, q[1] + .5), sy(q[0] + .5, q[1] + .5)) : ctx.moveTo(sx(q[0] + .5, q[1] + .5), sy(q[0] + .5, q[1] + .5))); };
    const batch = (ls, style, w, dash) => { if (!ls.length) return; ctx.beginPath(); for (const L of ls) add(L); ctx.strokeStyle = style; ctx.lineWidth = w; if (dash) { ctx.setLineDash(dash[0]); ctx.lineDashOffset = dash[1]; } ctx.stroke(); if (dash) ctx.setLineDash([]); };
    const wdOf = L => Math.max(2, (4 + L.dia / 5) * cam.z), byW = new Map(); for (const L of vis) { const k = wdOf(L).toFixed(2); (byW.get(k) || byW.set(k, []).get(k)).push(L); }
    for (const [k, ls] of byW) { const wd = +k; batch(ls, 'rgba(30,26,20,.6)', wd + 3 * cam.z);
      const byC = new Map(); for (const L of ls) { const c = L.product === 'CRUDE' ? '#4a3a2c' : L.product === '*' ? '#7f8a96' : BC.PRODUCT_COLOR[L.product]; (byC.get(c) || byC.set(c, []).get(c)).push(L); } for (const [c, cl] of byC) batch(cl, c, wd);
      const fl = ls.filter(L => (L.flow || 0) > 1); if (fl.length) { batch(fl, 'rgba(255,255,255,.6)', Math.max(1, wd * .35), [[5 * cam.z + 2, 9 * cam.z + 4], -(performance.now() / 60 % 100)]); animNeed = true; }
      batch(ls.filter(L => L.over || L.hiP), 'rgba(255,110,60,.9)', Math.max(1.2, wd * .3)); }
  }
  function drawPorts(b, selected) {                                                // little arrows on the access tile: blue = in, orange = out, white = both
    for (const p of B.worldPoints(b)) { if (p.kind !== 'pipe' && !selected) continue; const x = sx(p.ax + .5, p.ay + .5), y = sy(p.ax + .5, p.ay + .5), r = Math.max(3, 6 * cam.z); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = p.reserved ? 'rgba(200,200,200,.5)' : p.role === 'in' ? '#4aa3ff' : p.role === 'out' ? '#ff9a3a' : '#f1f1f1'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1; ctx.stroke(); }
  }
  hooks.afterOverlays = (lv, vb) => drawBuildings(lv, vb);
  hooks.top = (lv, vb) => {
    if (state.pipeEdit) drawEdit();
    const pmv = state.pipeMode; if (pmv) { const pa = pmv.a && (pmv.a.kind === 'b' ? STORE.get(pmv.a.id) : null); if (pa) { diamondPath(pa.x, pa.y, ...B.dimsOf(B.DEFS[pa.d], pa.r)); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]); }
      const pl0 = pmv.plan; if (pl0 && (pmv.kind === 'auto' || pmv.kind === 'branch') && pl0.lines) { pl0.lines.forEach((l, i) => { ctx.fillStyle = pl0.ok ? (i ? 'rgba(90,170,255,.55)' : 'rgba(80,220,120,.55)') : 'rgba(255,170,60,.55)'; for (const [x, y] of l.path) { diamondPath(x, y, 1, 1); ctx.fill(); } }); }
      const pl = pmv.plan && pmv.kind !== 'auto' && pmv.kind !== 'branch' ? pmv.plan : null; if (pl) { const path = pl.ok ? (pl.path || pl.add) : null, col = pl.ok ? (pmv.kind === 'open' ? 'rgba(255,170,60,.6)' : 'rgba(80,220,120,.55)') : 'rgba(240,70,60,.5)'; if (path) { ctx.fillStyle = col; for (const [x, y] of path) { diamondPath(x, y, 1, 1); ctx.fill(); } const e = path[path.length - 1]; ctx.beginPath(); ctx.arc(sx(e[0] + .5, e[1] + .5), sy(e[0] + .5, e[1] + .5), Math.max(5, 9 * cam.z), 0, 7); ctx.fillStyle = pmv.kind === 'open' ? '#ffb347' : '#6dff9a'; ctx.fill(); } } }
    const g = state.drag || state.pending; if (state.pipeDrag) { const pd = state.pipeDrag, v = pd.v, good = v && v.ok; const path = v && v.path ? v.path : null;
      if (path) { ctx.fillStyle = good ? 'rgba(80,220,120,.55)' : 'rgba(240,70,60,.55)'; for (const [x, y] of path) { diamondPath(x, y, 1, 1); ctx.fill(); } }
      const mk2 = (p, c) => { if (!p) return; ctx.beginPath(); ctx.arc(sx(p.ax + .5, p.ay + .5), sy(p.ax + .5, p.ay + .5), Math.max(5, 9 * cam.z), 0, 7); ctx.fillStyle = c; ctx.fill(); }; mk2(pd.a, '#ffd24a'); mk2(pd.b, good ? '#6dff9a' : '#ff8a80');
      const msg = pd.b ? (good ? (v.product === '*' ? 'أنبوب' : GC.PRODUCT_NAMES[v.product]) + ' · ' + v.path.length + ' مربعًا · ' + fmt$(v.cost) : (REASON[v.reason] || v.reason)) : 'اسحب إلى مبنى'; ctx.font = '700 13px system-ui'; ctx.textAlign = 'center'; const X = sx(pd.cur.x, pd.cur.y), Y = sy(pd.cur.x, pd.cur.y) - 26; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,16,.9)'; ctx.strokeText(msg, X, Y); ctx.fillStyle = pd.b ? (good ? '#8dffb0' : '#ff9a8a') : '#fff'; ctx.fillText(msg, X, Y); }
    if (!g) return; const d = B.DEFS[g.def], v = g.verdict, [w, h] = dims(g.def, g.r), ok = v && v.ok, loading = v && v.state === 'LOADING';
    if (lv !== 'FAR' && cam.z >= .2) { ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; for (let gx = g.x - 5; gx < g.x + w + 5; gx++) for (let gy = g.y - 5; gy < g.y + h + 5; gy++) { diamondPath(gx, gy, 1, 1); ctx.stroke(); }
      const sz = d.safetyZone || 0; if (sz) { diamondPath(g.x - sz, g.y - sz, w + 2 * sz, h + 2 * sz); ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(255,214,90,.8)'; ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]); } }
    const col = loading ? 'rgba(180,180,190,.45)' : ok ? 'rgba(80,220,120,.38)' : 'rgba(240,70,60,.42)', edge = loading ? '#c9c9d2' : ok ? '#6dff9a' : '#ff8a80';
    diamondPath(g.x, g.y, w, h); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = 2.4; ctx.stroke();
    if (lv !== 'FAR' && cam.z >= .12) { A.draw(ctx, d.visual, { ox: sx(g.x, g.y), oy: sy(g.x, g.y), z: cam.z, r: g.r, w: d.footprint[0], h: d.footprint[1], t: 0, fill: .5, state: 'OPERATIONAL', alpha: ok ? .8 : .55 }); }
    if (v && v.connections) for (const c of v.connections) { if (c.kind !== 'pipe' && c.kind !== 'link') continue; const x = sx(c.ax + .5, c.ay + .5), y = sy(c.ax + .5, c.ay + .5), r = Math.max(3.5, 7 * cam.z); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = !c.ok ? '#ff5a4d' : c.reserved ? 'rgba(210,210,210,.6)' : c.role === 'in' ? '#4aa3ff' : c.role === 'out' ? '#ff9a3a' : '#f4f4f4'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1.2; ctx.stroke();
      const sd = B.SIDES[c.side]; ctx.beginPath(); ctx.moveTo(sx(c.x + .5, c.y + .5), sy(c.x + .5, c.y + .5)); ctx.lineTo(x, y); ctx.strokeStyle = !c.ok ? '#ff5a4d' : 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.6; ctx.stroke(); }
    // direction arrow: from the footprint centre toward the rotated "east" face (the way a rotation turns)
    { const cx = g.x + w / 2, cy = g.y + h / 2, dv = [[1, 0], [0, 1], [-1, 0], [0, -1]][g.r & 3], x0 = sx(cx, cy), y0 = sy(cx, cy), x1 = sx(cx + dv[0] * Math.min(w, h) * .38, cy + dv[1] * Math.min(w, h) * .38), y1 = sy(cx + dv[0] * Math.min(w, h) * .38, cy + dv[1] * Math.min(w, h) * .38);
      if (d.rotatable) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.beginPath(); ctx.arc(x1, y1, 4.5, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); } }
    const label = loading ? 'جارٍ التحميل…' : ok ? fmt$(v.cost) : state.drag && state.drag.over ? 'اترك للإلغاء' : (/^sector/.test(v.reason || '') ? why(v).split(' — ')[0] : (REASON[v.reason] || REASON[v.kind] || v.reason)); ctx.font = '600 13px system-ui'; ctx.textAlign = 'center'; const X = sx(g.x + w / 2, g.y), Y = sy(g.x + w / 2, g.y) - 12 - (d.footprint[0] > 1 ? 40 * cam.z : 14 * cam.z);
    const tw = ctx.measureText(label).width, Xc = Math.max(tw / 2 + 8, Math.min(WP.VW() - tw / 2 - 8, X)); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,16,.85)'; ctx.strokeText(label, Xc, Y); ctx.fillStyle = ok ? '#8dffb0' : loading ? '#ddd' : '#ffb0a8'; ctx.fillText(label, Xc, Y);
  };

  /* ------------------------------------------------------------ cash, save / load, keys, test handle */
  function updateCash() { $('cash').textContent = fmt$(STORE.cash); EU.hud(); }
  /* test-only timing hook (window.__perfT exists only in the performance-test build): measures, never changes behaviour */
  function save() { const P = window.__perfT; if (!P) return save_(); const t = performance.now(); try { return save_(); } finally { P.save += performance.now() - t; P.saveN++; } }
  function save_() { if (window.__noSave || !window.__lab || !window.__lab.restored || catching) return;      /* never write before the saved game has been loaded: on a slow phone the autosave could overwrite it with an empty world */ try { COMPANY.stamp(Date.now()); COMPANY.sync(); const out = JSON.stringify({ v: 2, store: STORE.toJSON(), net: pipes.toJSON(), cash: STORE.cash, eco: COMPANY.toJSON(), guide: GU.toJSON(), wd: { r: world.reserveSnapshot(), p: world.progressSnapshot(), z: world.zoneSnapshot() } });
      try { const prev = localStorage.getItem(SAVE_KEY), now = Date.now(); if (prev && prev.length > 200 && now - bakAt > 60000) { localStorage.setItem(SAVE_KEY + '-bak', prev); bakAt = now; } } catch (_) { }   /* a rolling copy of the previous good save (at most once a minute) */
      localStorage.setItem(SAVE_KEY, out); window.__saveError = null; saveFailShown = false; } catch (e) { window.__saveError = String(e && e.message || e); if (!saveFailShown) { saveFailShown = true; try { toast('⚠ تعذّر حفظ اللعبة: ' + window.__saveError); } catch (_) { } } } }
  let bakAt = 0, saveFailShown = false, catching = false;
  /* Offline catch-up in short slices (never one long freeze): a progress bar is shown, the same ticks run in the same order, nothing is saved until it ends */
  function runCatchUp(job, done) {
    catching = true; let box = document.getElementById('cu-box');
    if (!box) { box = document.createElement('div'); box.id = 'cu-box'; box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(8,14,22,.82);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#fff;font:700 18px sans-serif;direction:rtl'; box.innerHTML = '<div>⏳ جارٍ احتساب إنتاج شركتك أثناء غيابك…</div><div style="width:70%;max-width:340px;height:12px;background:#2a3846;border-radius:6px;overflow:hidden"><div id="cu-bar" style="height:100%;width:0;background:#4fb36a"></div></div><div id="cu-pct" style="font-size:14px;opacity:.8">0%</div>'; document.body.appendChild(box); }
    box.style.display = 'flex'; const bar = document.getElementById('cu-bar'), pct = document.getElementById('cu-pct');
    const slice = () => { let p = 1; try { p = COMPANY.catchUpStep(12); } catch (e) { window.__loadError = String(e && e.message || e); p = 1; } bar.style.width = Math.round(p * 100) + '%'; pct.textContent = Math.round(p * 100) + '%';
      if (p < 1) { setTimeout(slice, 0); return; }
      let a = null; try { a = COMPANY.catchUpFinish(); } catch (e) { window.__loadError = String(e && e.message || e); } catching = false; box.style.display = 'none'; simLast = performance.now(); done(a); };
    setTimeout(slice, 0);
  }
  function swapNet(n2) { pipes.clear(); pipes.lines = n2.lines; pipes.at = n2.at; pipes.nextId = n2.nextId; pipes.nextConn = n2.nextConn; pipes.central = n2.central || null; for (const k of n2) pipes.add(k); pipes.rev++; }
  function load(o) {
    o = o || {}; const keys = [SAVE_KEY, SAVE_KEY + '-bak']; let last = { loaded: 0, from: 'none' }, soft = null;
    for (const k of keys) {
      let r; try { r = loadFrom(k, o); } catch (e) { window.__loadError = String(e && e.message || e); r = { loaded: 0, from: 'error', error: window.__loadError }; }
      if (r.from === 'save' && r.loaded === 0 && r.dropped && r.dropped.length) { if (!soft) soft = r; if (k === keys[keys.length - 1]) { reset0(); try { return loadFrom(SAVE_KEY, o); } catch (_) { return soft; } } reset0(); continue; }   /* a save whose buildings were all rejected is not a good save: the backup is tried first */
      if (r.from === 'save') { if (k !== SAVE_KEY) { r.fromBackup = true; try { toast('تمت استعادة نسخة الحفظ الاحتياطية'); } catch (_) { } } return r; }
      if (r.from !== 'none') last = r; else if (last.from === 'none') last = r;
      if (r.from === 'error') { try { reset0(); } catch (_) { } }               // a half-loaded game is cleared before the backup is tried
    }
    if (soft) { reset0(); try { return loadFrom(SAVE_KEY, o); } catch (_) { return soft; } }              // only a rejected-buildings save exists: load it as it was
    return last;
  }
  function reset0() { const ns = window.__noSave; window.__noSave = true; try { reset(); } finally { window.__noSave = ns; } }
  function loadFrom(key, o) {
    let raw = null; try { raw = localStorage.getItem(key); } catch (_) { } if (!raw) return { loaded: 0, from: 'none' };
    let d; try { d = JSON.parse(raw); } catch (_) { return { loaded: 0, from: 'corrupt' }; } if (!d || d.v !== 2) return { loaded: 0, from: 'oldFormat' };
    if (d.wd) { try { world.restoreProgress(d.wd.p); world.restoreReserve(d.wd.r); world.restoreZones(d.wd.z); } catch (_) { } }      /* the fields' discovery state, what is left in each field, the wells drilled and the evaluated zones */
    const r = B.BuildingStore.fromJSON(ts, d.store); STORE.items = r.store.items; STORE.occ = r.store.occ; STORE.bucket = r.store.bucket; STORE.nextId = r.store.nextId; STORE.time = r.store.time; STORE.rev = (STORE.rev | 0) + 1; STORE.cash = d.cash == null ? STORE.cash : d.cash;
    swapNet(I.PipeNet.fromJSON(WW, d.net)); if (d.eco && COMPANY.fromJSON(d.eco)) { /* company restored */ } else COMPANY.reset(); GU.fromJSON(d.guide);
    let away = null, job = null; if (o.catchUp === false) COMPANY.stamp(Date.now()); else if (o.sliced) { job = COMPANY.catchUpStart(Date.now()); if (job && !job.job) { away = job; job = null; } } else away = COMPANY.catchUp(Date.now());                                 // the app was closed: the company kept working (capped, validated)
    updateCash(); WP.markDirty(); return { loaded: r.report.loaded, dropped: r.report.dropped, from: 'save', lines: pipes.lines.size, away, job };
  }
  function reset() { STORE.items.clear(); STORE.occ.clear(); STORE.bucket.clear(); STORE.nextId = 1; STORE.rev = (STORE.rev | 0) + 1; STORE.cash = START_CASH; swapNet(new I.PipeNet(WW)); COMPANY.reset(); GU.reset(); state.sel = null; state.pending = null; state.pipeMode = null; hideBar(); save(); updateCash(); WP.markDirty(); }
  $('tSave').onclick = () => { save(); toast('Saved · ' + STORE.items.size + ' buildings · ' + pipes.lines.size + ' pipelines'); };
  $('tLoad').onclick = () => { const r = load({ catchUp: false }); toast(r.loaded ? 'Loaded ' + r.loaded + ' buildings' : 'Nothing saved yet'); };
  $('tReset').onclick = () => { if (confirm('Remove every building?')) { reset(); toast('Cleared'); } };
  window.addEventListener('keydown', e => { if (e.key === 'Escape') cancelAll(); else if ((e.key === 'r' || e.key === 'R')) { if (state.drag) { const g = state.drag; g.r = (g.r + 1) & 3; state.rot[g.def] = g.r; evaluate(g); WP.markDirty(); } else rotatePending(); } else if (e.key === 'Enter' && state.pending && state.pending.verdict.ok) confirmBuild(); });
  $('tFields').onclick = () => { const sr = world.homeRegionOfWorld(), f = world.regionSites(sr.id).filter(s => s.kind === 'FIELD' && (world.stateOf(s.id) === 'DRILLABLE' || world.stateOf(s.id) === 'PRODUCING'))[0]; if (f) WP.goto(f.x, f.y, .75); };
  $('tRef').onclick = () => { const sr = world.homeRegionOfWorld(), z = refZonesForDemo(sr)[0]; if (z) WP.goto(z.x + z.w / 2, z.y + z.h / 2, .5); };

  /* the full Phase 2 chain for screenshots, tests and device checks:  OIL FIELD -> 3 WELLS -> JUNCTION -> PUMP -> PIPE -> SEPARATOR -> CRUDE STORAGE -> REFINERY -> GASOLINE / DIESEL / JET / GAS storage */
  const until = async fn => { for (let i = 0; i < 600; i++) { await new Promise(r => setTimeout(r, 100)); if (fn()) return true; } return false; };
  const settle = async () => { await new Promise(r => setTimeout(r, 450)); await until(() => WP.idle()); };
  function connect(a, b, o) {
    o = o || {}; const pa = B.worldPoints(a).filter(p => p.kind === 'pipe' && !p.reserved && p.role !== 'in' && (!o.ap || p.id === o.ap)), pb = B.worldPoints(b).filter(p => p.kind === 'pipe' && !p.reserved && p.role !== 'out' && (!o.bp || p.id === o.bp)), c = [];
    for (const p of pa) for (const q of pb) c.push({ p, q, d: Math.abs(p.ax - q.ax) + Math.abs(p.ay - q.ay) }); c.sort((x, y) => x.d - y.d);
    for (const { p, q } of c) { const r = I.layPipe(STORE, pipes, ts, { b: a.id, port: p.id }, { b: b.id, port: q.id }, o.dia || 16, { ignoreCash: true, guard: 400000 }); if (r.ok) return r; if (r.reason === 'invalidProduct') continue; }
    return null;
  }
  async function buildDemoAt(sr, fld, z) {
    reset(); COMPANY.injectEquity(DEMO_CAPITAL, 'Demo setup capital'); 
    const put = (def, x, y, rad) => { const sn = STORE.snap(def, Math.round(x), Math.round(y), 0, { radius: rad == null ? 5 : rad, ignoreCash: true }); if (!sn) return null; const res = STORE.place(def, sn.x, sn.y, sn.r, { instant: true }); return res.ok ? res.building : null; };
    const fx = Math.round(fld.x), fy = Math.round(fld.y), out = { failed: [] }; WP.goto(fx + 10, fy + 2, .3); await settle();
    const w = [put('oil_well', fx - 3, fy - 4, 3), put('oil_well', fx - 3, fy, 3), put('oil_well', fx - 3, fy + 4, 3)].filter(Boolean), jn = put('junction', fx + 3, fy, 4), pu = put('pump_station_l', fx + 8, fy - 1, 4), sp = put('separator', fx + 16, fy - 2, 4), ct = put('crude_tank_m', fx + 26, fy - 1, 5);
    const names = { w, jn, pu, sp, ct }; for (const k of Object.keys(names)) if (!names[k] || (Array.isArray(names[k]) && !names[k].length)) out.failed.push(k); out.wells = w.length;
    let rf = null, tg, td, tj, tl; if (z) { WP.goto(z.x + 14, z.y + 9, .3); await settle(); rf = put('refinery_m', z.x + 4, z.y + 5, 6); tg = put('gasoline_tank_m', z.x + 20, z.y + 1, 5); td = put('diesel_tank_m', z.x + 20, z.y + 6, 5); tj = put('jet_tank_m', z.x + 20, z.y + 11, 5); tl = put('gas_sphere_m', z.x + 12, z.y + 14, 5); }
    for (const [k, v] of Object.entries({ rf, tg, td, tj, tl })) if (!v) out.failed.push(k);
    const link = (a, b, o, nm) => { if (!a || !b) { out.failed.push(nm); return null; } const r = connect(a, b, o); if (!r) out.failed.push(nm); return r; };
    w.forEach((x, i) => link(x, jn, { bp: ['PORT_N', 'PORT_W', 'PORT_S'][i] }, 'well' + i)); link(jn, pu, { ap: 'PORT_E', bp: 'INPUT' }, 'jn-pump'); link(pu, sp, { ap: 'OUTPUT', bp: 'MIXTURE_IN' }, 'pump-sep'); link(sp, ct, { ap: 'OIL_OUT', bp: 'INPUT_W' }, 'sep-tank');
    WP.goto((fx + (z ? z.x : fx)) / 2, (fy + (z ? z.y : fy)) / 2, .2); await settle();
    link(ct, rf, { ap: 'OUTPUT_E', bp: 'CRUDE_IN', dia: 24 }, 'tank-ref'); link(rf, tg, { ap: 'GASOLINE_OUT', bp: 'INPUT_W' }, 'ref-gasoline'); link(rf, td, { ap: 'DIESEL_OUT', bp: 'INPUT_W' }, 'ref-diesel'); link(rf, tj, { ap: 'JET_OUT', bp: 'INPUT_W' }, 'ref-jet'); link(rf, tl, { ap: 'GAS_OUT', bp: 'INPUT_N' }, 'ref-gas');
    out.total = STORE.list().length; out.pipelines = pipes.lines.size; out.pipeTiles = pipes.size; out.chain = { well: w[0] && w[0].id, junction: jn && jn.id, pump: pu && pu.id, separator: sp && sp.id, crude: ct && ct.id, refinery: rf && rf.id, gasoline: tg && tg.id, diesel: td && td.id, jet: tj && tj.id, gas: tl && tl.id };
    out.ok = !out.failed.length; GU.setLevel(6); save(); updateCash(); WP.markDirty(); return out;
  }
  /* the demo chain: the largest working field of the home region, trying the refinery zones nearest first, until the whole chain fits the ground (no part left out). The reserve region C3 never takes part. */
  /* the refinery zones the demo may use: with sectors only those inside a D sector (refineries are refused anywhere else), else the home region's own */
  function refZonesForDemo(sr) { if (!(world.sectors && world.sectors.length)) return world.refineryZones(sr.id); const o = []; for (const r of world.regions) for (const z of world.refineryZones(r.id)) { const c = world.sectorAt(z.x + (z.w >> 1), z.y + (z.h >> 1)); if (c && c[0] === 'D') o.push(z); } return o; }
  async function buildDemo() {
    const sr = world.homeRegionOfWorld(), fs = world.regionSites(sr.id).filter(q => q.kind === 'FIELD' && (world.stateOf(q.id) === 'DRILLABLE' || world.stateOf(q.id) === 'PRODUCING')).sort((a, b) => b.radius - a.radius), zs = refZonesForDemo(sr); if (!fs.length) return { ok: false, reason: 'noField' };
    let best = null; for (const f of fs.slice(0, 6)) for (const z of zs.slice().sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))) { const r = await buildDemoAt(sr, f, z); if (r.ok) return r; if (!best || r.failed.length < best.failed.length) best = r; }
    return best;
  }
  $('tDemo').onclick = async () => { toast('Building the full oil chain…'); const r = await buildDemo(); window.__demoLast = r; toast(r.ok ? 'Oil chain built: ' + r.total + ' buildings · ' + r.pipelines + ' pipelines' : 'Demo incomplete: ' + (r.failed || [r.reason]).join(', ')); };

  /* simulation clock: Game Time.  1x = one game day per dayRealSeconds; the company advances in whole game hours (no dependence on FPS); nothing is simulated while paused or while a report is open */
  let lastT = performance.now(), lastDraw = 0, lastSig = '';
  function visSig() { let h = (STORE.rev | 0) + '/' + pipes.rev + '/' + (state.sel || 0) + '/' + COMPANY.reserve.lv + '/'; let k = 0; for (const b of STORE.items.values()) { const d = B.DEFS[b.d]; k = (k * 31 + b.st.length + (d.type === 'tank' || d.type === 'gas' ? Math.round(tankFill(b) * 32) : 0) + (b.s && b.s._in > 0 ? 7 : 0)) | 0; } let f = 0; if (pipes.central) { const c = pipes.central; f = c.rev | 0; for (const k of CEN.CHANNELS) { const i = c.ch[k]; f = (f * 7 + (i.flow > 1 ? 1 : 0) + (i.fault ? 2 : 0) + (i.state === 'CLOSED' ? 4 : 0)) | 0; } for (const g of c.seg.values()) for (const k of CEN.CHANNELS) f = (f * 3 + (g.fault[k] ? 1 : 0) + (g.f[k].flow > 1 ? 2 : 0)) | 0; } for (const L of pipes.lines.values()) f = (f * 3 + ((L.flow || 0) > 1 ? 1 : 0) + (L.over || L.hiP ? 2 : 0)) | 0; return h + k + '/' + f; }
  /* The company is advanced in SMALL slices (about 16 times a second) instead of one burst every 250 ms: exactly the same whole game hours in the same order (run() keeps the remainder), but no single frame has to carry a whole burst - this is what keeps x5 / x10 smooth on a phone */
  let simLast = performance.now();
  const simPump = setInterval(() => { const now = performance.now(), dtS = Math.min(2, (now - simLast) / 1000); simLast = now; if (window.__homeOpen) return;      /* the main menu is open: the company waits */
    if (COMPANY.speed > 0 && !COMPANY.bankrupt && !catching) COMPANY.run(dtS * (24 / EC.TIME.dayRealSeconds) * (COMPANY.speed || 0)); }, 62);
  const tick = setInterval(() => {
    const PT = window.__perfT, tk0 = PT ? performance.now() : 0, now = performance.now();
    if (WP.ui.reserveLv !== COMPANY.reserve.lv) { WP.ui.reserveLv = COMPANY.reserve.lv; WP.markDirty(); } if (now - lastDraw > (COMPANY.speed >= 5 ? 960 : 480)) { lastDraw = now; const tu0 = PT ? performance.now() : 0; const sel = state.sel && STORE.get(state.sel); if (sel && !state.demo && !state.pending && !state.drag) showBuilding(sel.id); const sg = visSig(); if (sg !== lastSig || animOn) { lastSig = sg; WP.markDirty(); } if (PT) { PT.ui += performance.now() - tu0; PT.uiN++; } }      // Stage 5 perf: the map is redrawn only when something it shows has changed (animation has its own timer)
  if (PT) { PT.tick += performance.now() - tk0; PT.tickN++; }
  }, EC.TIME.tickMs);
  setInterval(() => { if (STORE.items.size || COMPANY.hours > 0) save(); }, 6000);                          // autosave: the company stamp is what the offline report measures from
  document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); } else { simLast = performance.now(); const j = COMPANY.catchUpStart(Date.now()); if (j && j.job) runCatchUp(j, a => { if (a && a.ok) EU.showAway(a); save(); }); else if (j && j.ok) { EU.showAway(j); save(); } } });
  window.addEventListener('pagehide', () => save());
  EU.mount({ company: COMPANY, toast, onChange: () => save(), restart: () => newGame(), showZone: () => { const z = world.reserveZoneOfWorld(); if (z) { WP.goto(z.x + z.w / 2, z.y + z.h / 2, .5); toast('منطقة الاحتياطي الاستراتيجي (باللون الأصفر)'); } } });
  /* a new game: everything is cleared (buildings, pipes, money, the lesson) and the camera returns to the first oil field */
  /* the Central Hybrid Network exists from the first day: stations free and operating, $500M cash, the network bought with a 100% bank loan (60 y, 6%, 2 y grace) */
  function installCentral() { if (!CEN || window.OLI_CENTRAL === false || pipes.central) return null; const r = CEN.install(STORE, pipes); STORE.cash = EC.CENTRAL.startCash; COMPANY.reset(); const a = COMPANY.acquireCentral(pipes.central.cost()); STORE.rev = (STORE.rev | 0) + 1; updateCash(); WP.markDirty(); return { install: r, acquire: a }; }
  function newGame() { reset(); installCentral(); try { localStorage.removeItem('oli-lab-v2'); } catch (_) { } const f = fieldSites()[0]; if (f && !GU.dev) WP.goto(f.x, f.y, .55); if (GU.closeSheet) GU.closeSheet(); const es = document.getElementById('eco-sheet'); if (es) es.classList.remove('open'); toast('🔄 بدأت لعبة جديدة · $10M'); save(); WP.markDirty(); }
  if (!GU.dev && !window.OLI_HOME) {   // in the app the reset lives in the main menu (with its own confirmation)
    const top = document.querySelector('#eco-sheet .top'); if (top) { const nb = document.createElement('button'); nb.id = 'es-new'; nb.textContent = '🔄 لعبة جديدة'; nb.style.cssText = 'min-height:40px;margin-inline-start:8px;background:#7a2a2a;border:1px solid #a33;color:#fff;border-radius:8px;padding:0 12px;font-weight:700'; let armed = 0; nb.onclick = () => { if (!armed) { armed = 1; nb.textContent = '⚠️ اضغط للتأكيد: سيُمسح كل شيء'; setTimeout(() => { armed = 0; nb.textContent = '🔄 لعبة جديدة'; }, 4000); return; } armed = 0; nb.textContent = '🔄 لعبة جديدة'; newGame(); }; top.insertBefore(nb, top.querySelector('#es-close')); } }
  window.__lab = { CEN, CUI, installCentral, routeEdit, editPreview, editAct, editEnd, adviseUpgrade, groupFrame: () => lastGroupFrame, autoLinkNote, ts, newGame, startBuild, pipeMode, pipeTap, commitPlan, spotsFor, nameOf, showField, fieldNear, fieldSites, GU, REASON, company: COMPANY, EU, buildDemo, store: STORE, pipes, sim: SIM, I, BC, state, B, A, evaluate, save, load, reset, toast, confirmBuild, rotatePending, cancelAll, showBuilding, showPipe, anchorFor, commitPipe, planFor, portNear, connect, updateCash, showSection, setDia: d => { dia = d; }, ready: () => true };
  if (CUI) CUI.mount({ cn: () => pipes.central, CEN, store: STORE, pipes, company: COMPANY, toast, WP, state, save, updateCash, showBuilding });
  updateCash(); window.__lab.GU.mount(); if (AR) AR.install();
  const wait = setInterval(() => { if (WP.idle && WP.idle()) { clearInterval(wait); const r = load({ sliced: true }); window.__lab.restored = r; if (r.from !== 'save') { try { installCentral(); save(); } catch (e) { window.__loadError = String(e && e.message || e); } } if (r.from !== 'save' && !GU.dev) { const f = fieldSites()[0]; if (f) WP.goto(f.x, f.y, .55); } if (r.loaded) toast('Restored ' + r.loaded + ' buildings'); if (r.away && r.away.ok) EU.showAway(r.away); if (r.job) runCatchUp(r.job, a => { r.away = a; r.job = null; if (a && a.ok) EU.showAway(a); WP.markDirty(); save(); }); WP.markDirty(); } }, 200);
})();
