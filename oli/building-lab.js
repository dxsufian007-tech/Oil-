/* Oli - building-lab.js  (Phase 2 host: the building system on the Phase 1 world)
 * SELECT (palette chip) -> DRAG (live ghost, finger offset) -> VALIDATE (one verdict) -> SMART SNAP (ports line up) -> CONFIRM (build bar).
 * The palette drag, the ghost drag and the pipe tool are captured before the map's own camera input sees them, so the camera never moves during a build gesture.
 * Nothing here touches core.js, the Phase A camera, the Phase C pipes or the map generator; pipes drawn here are a lab layer (a Set of tiles) only.
 */
(function () {
  'use strict';
  const WP = window.__wp, B = OliBuildings, I = OliIndustry, BC = OliBuildingConfig, A = OliBuildingArt, world = WP.world, ctx = WP.ctx, cam = WP.cam, hooks = WP.hooks, CFG = OliWorld.CONFIG, cv = document.getElementById('c');
  const GC = OliGameConfig, GU = window.OliGameUI, AR = window.OliAR, ts = B.fromWorld(world), qsL = new URLSearchParams(location.search), EC = OliEconomyConfig, EU = OliEconomyUI, START_CASH = qsL.get('cash') ? +qsL.get('cash') : EC.START_CASH, STORE = new B.BuildingStore(ts, { cash: START_CASH }), pipes = new I.PipeNet(world.W), SIM = new I.Sim(STORE, pipes), WW = world.W, SAVE_KEY = 'oli-lab-v2', COMPANY = new OliEconomy.Company(STORE, pipes, SIM, {}), DEMO_CAPITAL = 260e6;
  const $ = id => document.getElementById(id), fmt$ = n => '$' + Math.round(n).toLocaleString('en-US'), nameOf = id => (GC.INFO[id] && GC.INFO[id].name) || B.DEFS[id].name;
  const CAT = { EXTRACTION: '#d9962b', PIPELINE: '#4f8fc0', CRUDE_STORAGE: '#8f9aa6', PROCESSING: '#6faa7d', PRODUCT_STORAGE: '#c86a5a' }, SECTIONS = ['EXTRACTION', 'PIPELINE', 'CRUDE STORAGE', 'PROCESSING', 'PRODUCT STORAGE'], STCOL = { RUNNING: '#8dffb0', READY: '#cfd8e3', OFFLINE: '#9aa4ae', UNDER_CONSTRUCTION: '#f0be28', DEPLETED: '#ff9a3a', BLOCKED: '#ff8a80', NO_INPUT: '#ffd27a', NO_OUTPUT: '#ffd27a', LOW_PRESSURE: '#ffd27a', HIGH_PRESSURE: '#ff9a3a', OVER_CAPACITY: '#ff9a3a', MAINTENANCE: '#8fc4ff', DAMAGED: '#ff6a5a' };
  const REASON = { outside: 'خارج حدود الخريطة', water: 'لا يمكن البناء على الماء', terrain: 'أرض غير مناسبة لهذا المبنى', slope: 'الأرض شديدة الانحدار', overlap: 'يتداخل مع مبنى آخر', tooClose: 'قريب جدًا من منشأة أخرى (اترك مربعًا فارغًا)', CLEARANCE: 'قريب جدًا من منشأة أخرى (اترك مربعًا فارغًا)', OVERLAP: 'يتداخل مع مبنى آخر', TERRAIN: 'أرض غير مناسبة لهذا المبنى', ZONE: 'يجب أن يكون داخل منطقة المصافي', OIL: 'يجب أن يكون فوق حقل نفط صالح للحفر', CONNECTION: 'نقطة اتصال محجوبة', PRODUCT: 'منتجات غير متوافقة', RULE: 'غير مسموح هنا', LOADING: 'جارٍ تحميل هذا الجزء من الخريطة…',
    needsZone: 'يجب أن يكون داخل منطقة المصافي', invalidProduct: 'لا يمكن ربط هذين المنتجين ببعضهما', noRoute: 'لا يوجد مسار حر للأنبوب (ماء أو مبانٍ أو أنابيب في الطريق)', portTaken: 'هذه النقطة فيها أنبوب بالفعل', portRoles: 'يجب ربط نقطة خروج بنقطة دخول', noPort: 'ابدأ وانتهِ عند مبنى', sameBuilding: 'اختر مبنى آخر', tooShort: 'الأنبوب قصير جدًا', noOilField: 'يحتاج إلى حقل نفط يمكن الحفر فيه', notDrillable: 'لا يمكن الحفر في هذا الحقل الآن',
    wellHasJack: 'هذا البئر فيه مضخة بالفعل', connectionBlocked: 'نقطة اتصال محجوبة', notLoaded: 'جارٍ تحميل هذا الجزء من الخريطة…', cash: 'الرصيد لا يكفي', unknownBuilding: 'مبنى غير معروف', nothing: 'لا يوجد شيء هنا' };
  const STAR = { RUNNING: 'يعمل', READY: 'جاهز', OFFLINE: 'متوقف', UNDER_CONSTRUCTION: 'قيد البناء', DEPLETED: 'نضب الحقل', BLOCKED: 'مسدود', NO_INPUT: 'لا يصله نفط', NO_OUTPUT: 'غير متصل', LOW_PRESSURE: 'ضغط منخفض', HIGH_PRESSURE: 'ضغط مرتفع', OVER_CAPACITY: 'فوق السعة', DAMAGED: 'تالف', MAINTENANCE: 'قيد الصيانة', FULL: 'ممتلئ', NEAR_FULL: 'شبه ممتلئ', EMERGENCY: 'طوارئ' };
  const state = { drag: null, pending: null, sel: null, pipeTool: false, pipeDrag: null, demo: null, toast: '', toastAt: 0, rot: {}, lastTile: null };
  let animUntil = 0;

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
  function showSection(sec) { section = sec; pal.innerHTML = ''; for (const id of B.ORDER) if (B.DEFS[id].section === sec) pal.appendChild(chipFor(id)); pal.scrollLeft = 0; for (const t of tabs.children) t.classList.toggle('on', t.dataset.sec === sec); }
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
  function cancelAll(silent) { state.drag = null; state.pending = null; state.pipeDrag = null; state.pipeMode = null; hideBar(); if (!silent) toast('تم الإلغاء'); WP.markDirty(); }

  /* a pending ghost can be dragged again by touching it (everything else still pans the map) */
  window.addEventListener('pointerdown', e => {
    if (e.target !== cv) return;
    if (state.drag) { e.stopImmediatePropagation(); return; }                                     // a build gesture is running: nothing else may move the camera
    if (state.pipeTool) { e.stopImmediatePropagation(); startPipe(e); return; }
    const p = state.pending; if (!p) return; const t = WP.toTile(e.clientX, e.clientY), [w, h] = dims(p.def, p.r);
    if (t.x >= p.x - .6 && t.x <= p.x + w + .6 && t.y >= p.y - .6 && t.y <= p.y + h + .6) {
      e.stopImmediatePropagation(); state.drag = { def: p.def, r: p.r, x: p.x, y: p.y, from: 'ghost', pid: e.pointerId, touch: e.pointerType !== 'mouse', grab: { x: t.x - p.x, y: t.y - p.y + (e.pointerType !== 'mouse' ? 0 : 0) }, verdict: p.verdict }; state.pending = null; hideBar(); WP.markDirty();
    }
  }, true);

  /* ------------------------------------------------------------ confirm bar */
  const bar = $('buildbar');
  function showBar() { const p = state.pending; if (!p) return; const d = B.DEFS[p.def], v = p.verdict, ok = v.ok;
    bar.innerHTML = '<div class="msg ' + (ok ? 'good' : 'bad') + '">' + (ok ? '🟢 مكان صالح للبناء' : '🔴 لا يمكن البناء هنا') + ' · ' + nameOf(p.def) + ' · ' + (ok ? fmt$(v.cost) + (p.aligned ? ' · الأنابيب متحاذية' : '') : (v.state === 'UNAFFORDABLE' ? 'الرصيد لا يكفي (' + fmt$(v.cost) + ')' : REASON[v.reason] || REASON[v.kind] || v.reason)) + '</div>'
      + '<div class="btns"><button id="bBuild"' + (ok ? '' : ' disabled') + '>✓ بناء</button>' + (d.rotatable ? '<button id="bRot">⟳ تدوير</button>' : '') + '<button id="bNext">💡 مكان آخر</button><button id="bCancel">✕ إلغاء</button></div>'; bar.style.display = 'block'; }
  function hideBar() { bar.style.display = 'none'; bar.innerHTML = ''; }
  bar.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; if (b.id === 'bBuild') confirmBuild(); else if (b.id === 'bRot') rotatePending(); else if (b.id === 'bCancel') cancelAll(); else if (b.id === 'bNext') { state.spotIdx = (state.spotIdx || 0) + 1; const p = state.pending; if (p) startBuild(p.def, true); } else if (b.id === 'bPipeOk') commitPlan(); else if (b.id === 'bPipeBack') pipeMode(true); else if (b.id === 'bPipeEnd') pipeMode(false); });
  function rotatePending() { const p = state.pending; if (!p) return; const d = B.DEFS[p.def]; if (!d.rotatable) return; const [w0, h0] = dims(p.def, p.r); p.r = (p.r + 1) & 3; state.rot[p.def] = p.r; const [w, h] = dims(p.def, p.r);
    p.x += Math.round((w0 - w) / 2); p.y += Math.round((h0 - h) / 2); const g = evaluate({ def: p.def, r: p.r, x: p.x, y: p.y }, true); p.x = g.x; p.y = g.y; p.verdict = g.verdict; p.aligned = false; showBar(); WP.markDirty(); }
  function confirmBuild() {
    const p = state.pending; if (!p) return; const r = STORE.place(p.def, p.x, p.y, p.r, {});                       // place() validates again: the player can never build on a stale verdict
    if (!r.ok) { p.verdict = r; showBar(); toast(REASON[r.reason] || r.reason); return; }
    state.pending = null; hideBar(); state.sel = r.building.id; if (B.DEFS[p.def].type === 'well') SIM.ensure(r.building).started = false; toast(nameOf(p.def) + ' · جارٍ البناء · −' + fmt$(r.cost)); save(); showBuilding(r.building.id); WP.markDirty(); updateCash();
  }

  /* ------------------------------------------------------------ existing buildings: panel, demolish */
  const M = n => n >= 1e6 ? '$' + (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'k' : '$' + n;
  function showDefinition(id) {
    const d = B.DEFS[id], req = [d.requires.oilField ? 'on a drillable oil field' : '', d.zone ? 'inside the ' + d.zone.toLowerCase() + ' zone' : ''].filter(Boolean), ports = d.connections.filter(c => c.kind === 'pipe' && !c.reserved).map(c => c.id.replace(/_/g, ' ').toLowerCase() + (c.product && c.product !== '*' ? ' (' + BC.PRODUCT_LABEL[c.product].toLowerCase() + ')' : '')).join(', ');
    $('info').innerHTML = '<h4>' + d.name + ' <span class="k">' + d.section + '</span></h4><span class="k">' + d.footprint.join('×') + ' tiles · build ' + (d.type === 'well' ? '$250k–1.5M' : M(d.cost)) + ' · runs ' + M(d.operatingCost) + '/day · upkeep ' + M(d.maintenanceCost) + '/day · ' + d.capacity.value.toLocaleString('en-US') + ' ' + d.capacity.unit
      + '<br>Ports: ' + ports + (d.safetyZone ? '<br>Safety zone: ' + d.safetyZone + ' tile' : '') + (req.length ? '<br>Needs: ' + req.join(', ') : '') + '</span><div class="k" style="margin-top:6px">Drag it onto the map.</div>';
  }
  let showAll = false, showEcon = false;
  function showBuilding(id) {
    const b = STORE.get(id); if (!b) return; state.sel = id; const d = B.DEFS[b.d], st = SIM.status(b), ind = SIM.indicators(b), warn = SIM.warnings(b), list = showAll ? ind.list : ind.list.slice(0, ind.top);
    const lv = d.type === 'tank' ? SIM.levelStateOf(b) : d.type === 'gas' ? SIM.gasSafetyOf(b) : null;
    const stopped = d.type === 'well' && b.s && b.s.started === false && st !== 'UNDER_CONSTRUCTION', stTxt = stopped ? 'متوقف — اضغط «ابدأ الإنتاج»' : (STAR[st] || st);
    let h = '<h4>' + nameOf(b.d) + ' <span class="st" style="color:' + (stopped ? '#ffd27a' : STCOL[st] || '#fff') + '">● ' + stTxt + '</span></h4>';
    h += '<table class="kv">' + list.filter(i => i.k !== 'Status').map(i => '<tr><td>' + i.k + '</td><td>' + (typeof i.v === 'number' ? i.v.toLocaleString('en-US') : i.v) + (i.u ? ' ' + i.u : '') + '</td></tr>').join('') + '</table>';
    if (warn.length) h += '<div class="k" style="color:#ffb066">⚠ ' + warn.map(w => STAR[w] || w.replace(/_/g, ' ')).join(' · ') + '</div>';
    if (showAll) h += '<div class="k">Product: ' + (d.product ? BC.PRODUCT_LABEL[d.product] : 'carries the line product') + ' · runs ' + M(d.operatingCost) + '/day · upkeep ' + M(d.maintenanceCost) + '/day · level ' + (b.lv || 1) + '</div>';
    if (d.type === 'well' && st !== 'UNDER_CONSTRUCTION') h += (b.s && b.s.started === false ? '<div class="row"><button id="bStartWell" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff;font-weight:800;min-height:48px;flex:1">▶ ابدأ الإنتاج</button></div>' : '<div class="row"><button id="bStopWell">⏸ أوقف الإنتاج</button></div>');
    if (showEcon) h += '<div class="k" style="margin-top:6px;letter-spacing:.06em">الاقتصاد</div>' + EU.buildingHtml(id);
    h += '<div class="row">' + '<button id="bEcon"' + (showEcon ? ' class="on"' : '') + '>الاقتصاد</button>' + (ind.list.length > ind.top ? '<button id="bMore">' + (showAll ? 'أقل' : 'تفاصيل') + '</button>' : '') + (d.type === 'valve' ? '<button id="bValve">الصمام: ' + ({ OPEN: 'مفتوح', PARTIAL: 'جزئي', CLOSED: 'مغلق', FAULT: 'عطل' }[b.s.mode] || b.s.mode) + '</button>' : '') + (d.type === 'refinery' ? '<button id="bLimit">حد التشغيل ' + Math.round(b.s.opLimit * 100) + '%</button>' : '') + '<button id="bDemo">هدم…</button></div>';
    $('info').innerHTML = h; WP.markDirty();
  }
  function showPipe(x, y) {
    const i = SIM.pipeInfo(x, y); if (!i) return; state.sel = null; const L = pipes.lineAt(x, y), open = !(L && L.a && L.b), st = open ? 'غير متصل' : (i.currentFlow > 0 ? 'متصل · يعمل' : 'متصل');
    $('info').innerHTML = '<h4>🔧 خط أنابيب <span class="st" style="color:' + (open ? '#ffd27a' : '#8dffb0') + '">● ' + st + '</span></h4><table class="kv"><tr><td>المنتج</td><td>' + (i.product === 'unassigned' ? 'غير محدد بعد' : GC.PRODUCT_NAMES[i.product] || i.product) + '</td></tr><tr><td>القطر</td><td>' + i.diameter + ' بوصة</td></tr><tr><td>الطول</td><td>' + L.path.length + ' مربعًا</td></tr><tr><td>الضغط</td><td>' + i.pressure.toLocaleString('en-US') + ' رطل/بوصة²</td></tr><tr><td>التدفق</td><td>' + i.currentFlow.toLocaleString('en-US') + ' برميل / يوم</td></tr><tr><td>السعة</td><td>' + i.capacity.toLocaleString('en-US') + ' برميل / يوم</td></tr></table>'
      + (open ? '<div class="k" style="margin-top:4px">لا يشترط إكمال الشبكة الآن: وصّل الطرف المفتوح بمبنى عندما تبنيه.</div><div class="row"><button id="bConnectLine" data-id="' + L.id + '" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff;font-weight:800;min-height:46px">🔗 وصّل بمبنى</button></div>' : ''); WP.markDirty();
  }

  $('info').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'bDig') { startBuild('oil_well'); return; }
    if (b.id === 'bStartWell') { const w = STORE.get(state.sel); if (w) { SIM.ensure(w).started = true; toast('🛢️ بدأ الإنتاج'); save(); showBuilding(w.id); } return; }
    if (b.id === 'bStopWell') { const w = STORE.get(state.sel); if (w) { SIM.ensure(w).started = false; toast('تم إيقاف الإنتاج'); save(); showBuilding(w.id); } return; }
    if (b.id === 'bConnectLine') { pipeMode(true); const pm = state.pipeMode; pm.a = { kind: 'line', id: +b.dataset.id }; pm.step = 2; pipeBar('✅ أنبوب مفتوح · اضغط على المبنى الذي تريد توصيله به.', '', false, '<button id="bPipeBack">↩ البداية</button>'); return; }
    if (b.id === 'bMore') { showAll = !showAll; showBuilding(state.sel); return; }
    if (b.id === 'bEcon') { showEcon = !showEcon; showBuilding(state.sel); return; }
    if (b.id === 'bRepair') { const r = COMPANY.repair(state.sel); toast(r.ok ? 'Repaired · −' + OliEconomy.fmtMoney(r.cost) : 'Not enough cash to repair'); save(); updateCash(); showBuilding(state.sel); return; }
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
    if (state.pipeMode) return pipeTap(px, py);
    if (state.pending || state.drag) return false;
    const t = WP.toTile(px, py), b = STORE.at(Math.floor(t.x), Math.floor(t.y)); if (b) { showBuilding(b.id); return true; } if (pipes.lineAt(Math.floor(t.x), Math.floor(t.y))) { showPipe(Math.floor(t.x), Math.floor(t.y)); return true; }
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
    else if (focus && Math.hypot(focus.x - c.x, focus.y - c.y) < 60) { ox = focus.x + 3; oy = focus.y; }
    const seen = new Set();
    for (let rad = 0; rad <= R && out.length < 10; rad++) for (let dx = -rad; dx <= rad && out.length < 10; dx++) for (let dy = -rad; dy <= rad && out.length < 10; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue; const x = ox + dx - Math.floor(w / 2), y = oy + dy - Math.floor(h / 2), k = x + ',' + y; if (seen.has(k)) continue; seen.add(k);
      const v = STORE.validate(id, x, y, r, {}); if (v.ok || v.state === 'UNAFFORDABLE') out.push({ x, y });
    }
    return out;
  }
  function startBuild(id, again) {
    if (!again) { cancelAll(true); state.spotIdx = 0; } const r = state.rot[id] || 0, list = spotsFor(id, r);
    if (!list.length) { toast('لا يوجد مكان مناسب قريب. حرّك الخريطة ثم جرّب مرة أخرى.'); return false; }
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
    if (!on) { state.pipeMode = null; state.pipeDrag = null; hideBar(); WP.markDirty(); return; } cancelAll(true); state.pipeMode = { step: 1, a: null, plan: null }; state.pipeDrag = null;
    pipeBar('🔧 اضغط على المبنى الذي يبدأ منه الأنبوب (مثلًا البئر)'); WP.markDirty();
  }
  function nearBuilding(t) { return STORE.at(Math.floor(t.x), Math.floor(t.y)) || STORE.query(Math.floor(t.x) - 1, Math.floor(t.y) - 1, Math.floor(t.x) + 1, Math.floor(t.y) + 1)[0] || null; }
  function pipeTap(px, py) {
    const pm = state.pipeMode, t = WP.toTile(px, py), tx = Math.floor(t.x), ty = Math.floor(t.y), bld = nearBuilding(t), ln = pipes.lineAt(tx, ty);
    if (pm.step === 1) {
      if (bld) { pm.a = { kind: 'b', id: bld.id }; pm.step = 2; state.sel = bld.id; pipeBar('✅ ' + nameOf(bld.d) + ' · الآن اضغط على المبنى الذي ينتهي عنده الأنبوب، أو على أرض فارغة لينتهي الأنبوب مفتوحًا (غير متصل).', '', false, '<button id="bPipeBack">↩ البداية</button>'); }
      else if (ln && !ln.b) { pm.a = { kind: 'line', id: ln.id }; pm.step = 2; pipeBar('✅ أنبوب مفتوح · اضغط على المبنى الذي تريد توصيله به.', '', false, '<button id="bPipeBack">↩ البداية</button>'); }
      else toast('اضغط على مبنى لتبدأ منه'); WP.markDirty(); return true;
    }
    let plan = null, kind = null;
    if (pm.a.kind === 'b') { if (bld && bld.id !== pm.a.id) { plan = bestPlan(pm.a.id, bld.id); kind = 'pipe'; } else if (!bld && !ln) { plan = openPlan(pm.a.id, [tx, ty]); kind = 'open'; } else { toast('اختر مبنى آخر أو أرضًا فارغة'); return true; } }
    else if (bld) { const L = pipes.lines.get(pm.a.id); let fail = null; for (const p of freePorts(bld)) { const v = I.planClosePipe(STORE, pipes, ts, pm.a.id, { b: bld.id, port: p.id }, { ignoreCash: true }); if (v.ok) { if (!plan || v.add.length < plan.add.length) { plan = v; plan.port = p.id; plan.bid = bld.id; } } else fail = fail || v; } if (!plan) plan = fail || { ok: false, reason: 'portTaken' }; kind = 'close'; }
    else { toast('اضغط على مبنى لتوصيل الأنبوب به'); return true; }
    pm.plan = plan; pm.kind = kind; pm.end = [tx, ty]; pm.bid = bld && bld.id;
    if (plan.ok) { const tiles = (plan.path || plan.add).length, afford = STORE.cash >= plan.cost, prod = plan.product && plan.product !== '*' ? ' ' + GC.PRODUCT_NAMES[plan.product] : '';
      pipeBar((kind === 'open' ? '🟠 أنبوب مفتوح (غير متصل)' : '🟢 مسار صالح') + prod + ' · ' + tiles + ' مربعًا · ' + fmt$(plan.cost) + (afford ? '' : ' · الرصيد لا يكفي'), afford ? 'good' : 'bad', afford, '<button id="bPipeBack">↩ البداية</button>'); }
    else pipeBar('🔴 ' + (plan.state === 'UNAFFORDABLE' ? 'الرصيد لا يكفي' : REASON[plan.reason] || plan.reason), 'bad', false, '<button id="bPipeBack">↩ البداية</button>');
    state.pipeDrag = null; WP.markDirty(); return true;
  }
  function commitPlan() {
    const pm = state.pipeMode; if (!pm || !pm.plan || !pm.plan.ok) return; const pl = pm.plan; let r = null;
    if (pm.kind === 'pipe') r = I.layPipe(STORE, pipes, ts, pl.a, pl.b, dia, {}); else if (pm.kind === 'open') r = I.layOpenPipe(STORE, pipes, ts, pl.a, pm.end, dia, {}); else r = I.closePipe(STORE, pipes, ts, pl.id, { b: pl.bid, port: pl.port }, {});
    if (!r.ok) { toast(r.state === 'UNAFFORDABLE' ? 'الرصيد لا يكفي للأنبوب' : REASON[r.reason] || r.reason); return; }
    toast(pm.kind === 'open' ? '🟠 تم مد الأنبوب ولم يتصل بعد' : '✅ تم الربط · الحالة: متصل · −' + fmt$(r.cost)); save(); updateCash(); pipeMode(true); WP.markDirty();
  }
  /* the oil field card: the player taps a field and is offered "dig a well" */
  function fieldNear(t) { let best = null, bd = 4.5; for (const f of fieldSites()) { const d = Math.hypot(f.x - t.x, f.y - t.y); if (d < bd) { bd = d; best = f; } } return best; }
  function showField(f) {
    const n = STORE.list().filter(b => B.DEFS[b.d].type === 'well' && Math.hypot(b.x - f.x, b.y - f.y) < 14).length;
    $('info').innerHTML = '<h4>⛰️ حقل نفط</h4><span class="k">يمكنك الحفر هنا. ' + (n ? 'لديك ' + n + ' بئر في هذا الحقل.' : 'لا توجد آبار في هذا الحقل بعد.') + ' تكلفة البئر من ' + fmt$(B.DEFS.oil_well.cost) + '.</span><div class="row"><button id="bDig" data-fx="' + f.x + '" data-fy="' + f.y + '" style="background:#2f9e5a;border-color:#2f9e5a;color:#fff;font-weight:800;min-height:46px">🛢️ حفر بئر</button></div>'; WP.markDirty();
  }

  /* ------------------------------------------------------------ drawing */
  const sx = WP.sx, sy = WP.sy;
  function diamondPath(x, y, w, h) { ctx.beginPath(); ctx.moveTo(sx(x, y), sy(x, y)); ctx.lineTo(sx(x + w, y), sy(x + w, y)); ctx.lineTo(sx(x + w, y + h), sy(x + w, y + h)); ctx.lineTo(sx(x, y + h), sy(x, y + h)); ctx.closePath(); }
  function tankFill(b) { const d = B.DEFS[b.d]; return b.s && b.s.vol != null ? b.s.vol / d.capacity.value : 0; }
  function drawBuildings(lv, vb) {
    const now = performance.now() / 1000, list = STORE.query(Math.floor(vb.x0) - 2, Math.floor(vb.y0) - 2, Math.ceil(vb.x1) + 2, Math.ceil(vb.y1) + 2); let anim = false;
    list.sort((p, q) => { const a = B.dimsOf(B.DEFS[p.d], p.r), c = B.dimsOf(B.DEFS[q.d], q.r); return (p.x + a[0] + p.y + a[1]) - (q.x + c[0] + q.y + c[1]); });
    // pipes first (they lie on the ground)
    if (pipes.size && lv !== 'FAR') drawPipes(vb);
    for (const b of list) {
      const d = B.DEFS[b.d], [w, h] = B.dimsOf(d, b.r);
      if (lv === 'FAR' || cam.z < .12) { diamondPath(b.x, b.y, w, h); ctx.fillStyle = CAT[d.category]; ctx.fill(); ctx.strokeStyle = 'rgba(20,16,10,.7)'; ctx.lineWidth = 1; ctx.stroke(); continue; }
      A.draw(ctx, d.visual, { ox: sx(b.x, b.y), oy: sy(b.x, b.y), z: cam.z, r: b.r, w: d.footprint[0], h: d.footprint[1], t: now, fill: tankFill(b), state: b.st });
      if (d.type === 'refinery' && b.s && b.s._in > 0) anim = true;
      if (b.id === state.sel) { diamondPath(b.x, b.y, w, h); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2.2; ctx.setLineDash([7, 4]); ctx.stroke(); ctx.setLineDash([]); drawPorts(b, true); }
    }
    if (anim && cam.z >= .3) { animUntil = performance.now() + 140; setTimeout(() => WP.markDirty(), 120); }
  }
  function drawPipes(vb) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; const view = [vb.x0 - 3, vb.y0 - 3, vb.x1 + 3, vb.y1 + 3];
    for (const L of pipes.lines.values()) {
      const P = L.path; if (!P.length) continue; let vis = false; for (const q of P) if (q[0] >= view[0] && q[0] <= view[2] && q[1] >= view[1] && q[1] <= view[3]) { vis = true; break; } if (!vis) continue;
      const wd = Math.max(2, (4 + L.dia / 5) * cam.z), col = L.product === '*' ? '#7f8a96' : BC.PRODUCT_COLOR[L.product], path = () => { ctx.beginPath(); P.forEach((q, i) => i ? ctx.lineTo(sx(q[0] + .5, q[1] + .5), sy(q[0] + .5, q[1] + .5)) : ctx.moveTo(sx(q[0] + .5, q[1] + .5), sy(q[0] + .5, q[1] + .5))); ctx.stroke(); };
      ctx.strokeStyle = 'rgba(30,26,20,.6)'; ctx.lineWidth = wd + 3 * cam.z; path(); ctx.strokeStyle = L.product === 'CRUDE' ? '#4a3a2c' : col; ctx.lineWidth = wd; path();
      if ((L.flow || 0) > 1) { ctx.setLineDash([5 * cam.z + 2, 9 * cam.z + 4]); ctx.lineDashOffset = -(performance.now() / 60 % 100); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = Math.max(1, wd * .35); path(); ctx.setLineDash([]); animUntil = performance.now() + 200; }
      if (L.over || L.hiP) { ctx.strokeStyle = 'rgba(255,110,60,.9)'; ctx.lineWidth = Math.max(1.2, wd * .3); path(); }
    }
  }
  function drawPorts(b, selected) {                                                // little arrows on the access tile: blue = in, orange = out, white = both
    for (const p of B.worldPoints(b)) { if (p.kind !== 'pipe' && !selected) continue; const x = sx(p.ax + .5, p.ay + .5), y = sy(p.ax + .5, p.ay + .5), r = Math.max(3, 6 * cam.z); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = p.reserved ? 'rgba(200,200,200,.5)' : p.role === 'in' ? '#4aa3ff' : p.role === 'out' ? '#ff9a3a' : '#f1f1f1'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1; ctx.stroke(); }
  }
  hooks.afterOverlays = (lv, vb) => drawBuildings(lv, vb);
  hooks.top = (lv, vb) => {
    const pmv = state.pipeMode; if (pmv) { const pa = pmv.a && (pmv.a.kind === 'b' ? STORE.get(pmv.a.id) : null); if (pa) { diamondPath(pa.x, pa.y, ...B.dimsOf(B.DEFS[pa.d], pa.r)); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]); }
      const pl = pmv.plan; if (pl) { const path = pl.ok ? (pl.path || pl.add) : null, col = pl.ok ? (pmv.kind === 'open' ? 'rgba(255,170,60,.6)' : 'rgba(80,220,120,.55)') : 'rgba(240,70,60,.5)'; if (path) { ctx.fillStyle = col; for (const [x, y] of path) { diamondPath(x, y, 1, 1); ctx.fill(); } const e = path[path.length - 1]; ctx.beginPath(); ctx.arc(sx(e[0] + .5, e[1] + .5), sy(e[0] + .5, e[1] + .5), Math.max(5, 9 * cam.z), 0, 7); ctx.fillStyle = pmv.kind === 'open' ? '#ffb347' : '#6dff9a'; ctx.fill(); } } }
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
    const label = loading ? 'جارٍ التحميل…' : ok ? fmt$(v.cost) : state.drag && state.drag.over ? 'اترك للإلغاء' : (REASON[v.reason] || REASON[v.kind] || v.reason); ctx.font = '600 13px system-ui'; ctx.textAlign = 'center'; const X = sx(g.x + w / 2, g.y), Y = sy(g.x + w / 2, g.y) - 12 - (d.footprint[0] > 1 ? 40 * cam.z : 14 * cam.z);
    const tw = ctx.measureText(label).width, Xc = Math.max(tw / 2 + 8, Math.min(WP.VW() - tw / 2 - 8, X)); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,16,.85)'; ctx.strokeText(label, Xc, Y); ctx.fillStyle = ok ? '#8dffb0' : loading ? '#ddd' : '#ffb0a8'; ctx.fillText(label, Xc, Y);
  };

  /* ------------------------------------------------------------ cash, save / load, keys, test handle */
  function updateCash() { $('cash').textContent = fmt$(STORE.cash); EU.hud(); }
  function save() { if (window.__noSave || !window.__lab || !window.__lab.restored) return;      /* never write before the saved game has been loaded: on a slow phone the autosave could overwrite it with an empty world */ try { COMPANY.stamp(Date.now()); COMPANY.sync(); localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, store: STORE.toJSON(), net: pipes.toJSON(), cash: STORE.cash, eco: COMPANY.toJSON(), guide: GU.toJSON() })); window.__saveError = null; } catch (e) { window.__saveError = String(e && e.message || e); } }
  function swapNet(n2) { pipes.clear(); pipes.lines = n2.lines; pipes.at = n2.at; pipes.nextId = n2.nextId; for (const k of n2) pipes.add(k); pipes.rev++; }
  function load(o) {
    o = o || {};
    let raw = null; try { raw = localStorage.getItem(SAVE_KEY); } catch (_) { } if (!raw) return { loaded: 0, from: 'none' };
    let d; try { d = JSON.parse(raw); } catch (_) { return { loaded: 0, from: 'corrupt' }; } if (!d || d.v !== 2) return { loaded: 0, from: 'oldFormat' };
    const r = B.BuildingStore.fromJSON(ts, d.store); STORE.items = r.store.items; STORE.occ = r.store.occ; STORE.bucket = r.store.bucket; STORE.nextId = r.store.nextId; STORE.time = r.store.time; STORE.rev = (STORE.rev | 0) + 1; STORE.cash = d.cash == null ? STORE.cash : d.cash;
    swapNet(I.PipeNet.fromJSON(WW, d.net)); if (d.eco && COMPANY.fromJSON(d.eco)) { /* company restored */ } else COMPANY.reset(); GU.fromJSON(d.guide);
    let away = null; if (o.catchUp !== false) away = COMPANY.catchUp(Date.now()); else COMPANY.stamp(Date.now());                                 // the app was closed: the company kept working (capped, validated)
    updateCash(); WP.markDirty(); return { loaded: r.report.loaded, dropped: r.report.dropped, from: 'save', lines: pipes.lines.size, away };
  }
  function reset() { STORE.items.clear(); STORE.occ.clear(); STORE.bucket.clear(); STORE.nextId = 1; STORE.rev = (STORE.rev | 0) + 1; STORE.cash = START_CASH; swapNet(new I.PipeNet(WW)); COMPANY.reset(); GU.reset(); state.sel = null; state.pending = null; state.pipeMode = null; hideBar(); save(); updateCash(); WP.markDirty(); }
  $('tSave').onclick = () => { save(); toast('Saved · ' + STORE.items.size + ' buildings · ' + pipes.lines.size + ' pipelines'); };
  $('tLoad').onclick = () => { const r = load({ catchUp: false }); toast(r.loaded ? 'Loaded ' + r.loaded + ' buildings' : 'Nothing saved yet'); };
  $('tReset').onclick = () => { if (confirm('Remove every building?')) { reset(); toast('Cleared'); } };
  window.addEventListener('keydown', e => { if (e.key === 'Escape') cancelAll(); else if ((e.key === 'r' || e.key === 'R')) { if (state.drag) { const g = state.drag; g.r = (g.r + 1) & 3; state.rot[g.def] = g.r; evaluate(g); WP.markDirty(); } else rotatePending(); } else if (e.key === 'Enter' && state.pending && state.pending.verdict.ok) confirmBuild(); });
  $('tFields').onclick = () => { const sr = world.regions.find(r => r.starter), f = world.regionSites(sr.id).filter(s => s.kind === 'FIELD' && (world.stateOf(s.id) === 'DRILLABLE' || world.stateOf(s.id) === 'PRODUCING'))[0]; if (f) WP.goto(f.x, f.y, .75); };
  $('tRef').onclick = () => { const sr = world.regions.find(r => r.starter), z = world.refineryZones(sr.id)[0]; if (z) WP.goto(z.x + z.w / 2, z.y + z.h / 2, .5); };

  /* the full Phase 2 chain for screenshots, tests and device checks:  OIL FIELD -> 3 WELLS -> JUNCTION -> PUMP -> PIPE -> SEPARATOR -> CRUDE STORAGE -> REFINERY -> GASOLINE / DIESEL / JET / GAS storage */
  const until = async fn => { for (let i = 0; i < 600; i++) { await new Promise(r => setTimeout(r, 100)); if (fn()) return true; } return false; };
  const settle = async () => { await new Promise(r => setTimeout(r, 450)); await until(() => WP.idle()); };
  function connect(a, b, o) {
    o = o || {}; const pa = B.worldPoints(a).filter(p => p.kind === 'pipe' && !p.reserved && p.role !== 'in' && (!o.ap || p.id === o.ap)), pb = B.worldPoints(b).filter(p => p.kind === 'pipe' && !p.reserved && p.role !== 'out' && (!o.bp || p.id === o.bp)), c = [];
    for (const p of pa) for (const q of pb) c.push({ p, q, d: Math.abs(p.ax - q.ax) + Math.abs(p.ay - q.ay) }); c.sort((x, y) => x.d - y.d);
    for (const { p, q } of c) { const r = I.layPipe(STORE, pipes, ts, { b: a.id, port: p.id }, { b: b.id, port: q.id }, o.dia || 16, { ignoreCash: true }); if (r.ok) return r; if (r.reason === 'invalidProduct') continue; }
    return null;
  }
  async function buildDemo() {
    reset(); COMPANY.injectEquity(DEMO_CAPITAL, 'Demo setup capital'); const sr = world.regions.find(r => r.starter), fld = world.regionSites(sr.id).find(q => q.kind === 'FIELD' && (world.stateOf(q.id) === 'DRILLABLE' || world.stateOf(q.id) === 'PRODUCING')); if (!fld) return { ok: false, reason: 'noField' };
    const put = (def, x, y, rad) => { const sn = STORE.snap(def, Math.round(x), Math.round(y), 0, { radius: rad == null ? 5 : rad, ignoreCash: true }); if (!sn) return null; const res = STORE.place(def, sn.x, sn.y, sn.r, { instant: true }); return res.ok ? res.building : null; };
    const fx = Math.round(fld.x), fy = Math.round(fld.y), out = { failed: [] }, z = world.refineryZones(sr.id)[0]; WP.goto(fx + 10, fy + 2, .3); await settle();
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
  $('tDemo').onclick = async () => { toast('Building the full oil chain…'); const r = await buildDemo(); toast(r.ok ? 'Oil chain built: ' + r.total + ' buildings · ' + r.pipelines + ' pipelines' : 'Demo incomplete: ' + (r.failed || [r.reason]).join(', ')); };

  /* simulation clock: Game Time.  1x = one game day per dayRealSeconds; the company advances in whole game hours (no dependence on FPS); nothing is simulated while paused or while a report is open */
  let lastT = performance.now(), lastDraw = 0;
  const tick = setInterval(() => {
    const now = performance.now(), dtS = Math.min(2, (now - lastT) / 1000); lastT = now; const hrs = dtS * (24 / EC.TIME.dayRealSeconds) * (COMPANY.speed || 0);
    if (COMPANY.speed > 0 && !COMPANY.bankrupt) COMPANY.run(hrs);
    const sel = state.sel && STORE.get(state.sel); if (sel && !state.demo && !state.pending && !state.drag && now - lastDraw > 480) { showBuilding(sel.id); } if (STORE.items.size && now - lastDraw > 480) { lastDraw = now; WP.markDirty(); }
  }, EC.TIME.tickMs);
  setInterval(() => { if (STORE.items.size || COMPANY.hours > 0) save(); }, 6000);                          // autosave: the company stamp is what the offline report measures from
  document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); } else { lastT = performance.now(); const a = COMPANY.catchUp(Date.now()); if (a && a.ok) { EU.showAway(a); save(); } } });
  window.addEventListener('pagehide', () => save());
  EU.mount({ company: COMPANY, toast, onChange: () => save(), restart: () => { reset(); toast('New company founded'); } });
  window.__lab = { startBuild, pipeMode, pipeTap, commitPlan, spotsFor, nameOf, showField, fieldNear, fieldSites, GU, REASON, company: COMPANY, EU, buildDemo, store: STORE, pipes, sim: SIM, I, BC, state, B, A, evaluate, save, load, reset, toast, confirmBuild, rotatePending, cancelAll, showBuilding, showPipe, anchorFor, commitPipe, planFor, portNear, connect, updateCash, showSection, setDia: d => { dia = d; }, ready: () => true };
  updateCash(); window.__lab.GU.mount(); if (AR) AR.install();
  const wait = setInterval(() => { if (WP.idle && WP.idle()) { clearInterval(wait); const r = load(); window.__lab.restored = r; if (r.from !== 'save' && !GU.dev) { const f = fieldSites()[0]; if (f) WP.goto(f.x, f.y, .55); } if (r.loaded) toast('Restored ' + r.loaded + ' buildings'); if (r.away && r.away.ok) EU.showAway(r.away); WP.markDirty(); } }, 200);
})();
