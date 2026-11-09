/* Oli - central-ui.js : the simple screen of the Central Hybrid Network.
 *  draw()  : grey shell (a little wider than the old 36" pipe, same dark border) with six thin colour lanes (the game's product colours), moving dashes in the real flow direction,
 *            red marks on cut channels, small squares on the stations / branch points.
 *  mount() : a floating button -> a sheet with one chip per channel (state / flow / pressure / capacity / direction / quantity), open-close, the loan table and the money lines;
 *            tapping the trunk shows that segment (flow per channel, cut / repair a channel) and offers "branch here" (free tap from ANY tile). */
(function (root, factory) { root.OliCentralUI = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const NAME = { CRUDE: 'نفط خام', WATER: 'مياه', GASOLINE: 'بنزين', DIESEL: 'ديزل', JET_FUEL: 'وقود طائرات', GAS: 'غاز' };
  const ST = { RUNNING: 'يعمل', READY: 'جاهزة', CLOSED: 'مغلقة', FAULT: 'عطل' };
  const fmt = n => { n = Math.round(n); const a = Math.abs(n); return (n < 0 ? '-' : '') + '$' + (a >= 1e9 ? (a / 1e9).toFixed(3) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a.toLocaleString('en-US')); };
  const num = (n, d) => (+n || 0).toFixed(d == null ? 1 : d);
  let env = null, cache = new WeakMap(), sel = 'CRUDE', branch = null;

  /* corner points of a segment path (cached) and the offset of a polyline by `off` pixels (miter joins) */
  function corners(g) { const P = g.path, k = P.length; if (g._cp && g._cpn === k) return g._cp; const o = [P[0]]; for (let i = 1; i < k - 1; i++) { const a = P[i - 1], b = P[i], c = P[i + 1]; if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) o.push(b); } o.push(P[k - 1]); g._cpn = k; return (g._cp = o); }
  function lane(pts, off) { const n = pts.length, out = []; const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
    for (let i = 0; i < n; i++) { let nx, ny; if (i === 0) [nx, ny] = nrm(pts[0], pts[1]); else if (i === n - 1) [nx, ny] = nrm(pts[n - 2], pts[n - 1]); else { const a = nrm(pts[i - 1], pts[i]), b = nrm(pts[i], pts[i + 1]), dd = 1 + a[0] * b[0] + a[1] * b[1]; nx = (a[0] + b[0]) / (dd || 1); ny = (a[1] + b[1]) / (dd || 1); } out.push([pts[i][0] + nx * off, pts[i][1] + ny * off]); } return out; }

  function draw(ctx, sx, sy, cam, vb, cn, COLOR, CHANNELS, animCb) {
    if (!cn) return; const z = cam.z, shell = (4 + 36 / 5) * z + 4 * z, view = [vb.x0 - 4, vb.y0 - 4, vb.x1 + 4, vb.y1 + 4], segs = [];
    for (const g of cn.seg.values()) { const P = g.path; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; if (!g._bb || g._bbn !== P.length) { for (const q of P) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; } g._bb = [x0, y0, x1, y1]; g._bbn = P.length; } const b = g._bb; if (b[2] < view[0] || b[0] > view[2] || b[3] < view[1] || b[1] > view[3]) continue; segs.push(g); }
    if (!segs.length) return; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.setLineDash([]);
    const pt = (q, o) => [sx(q[0] + .5 + (o ? o[0] : 0), q[1] + .5 + (o ? o[1] : 0)), sy(q[0] + .5 + (o ? o[0] : 0), q[1] + .5 + (o ? o[1] : 0))];
    const stroke = (g, style, w, off, dash) => { const c = corners(g); const sp = c.map(q => { const p = pt(q); return p; }); const L = off ? lane(sp, off) : sp; ctx.beginPath(); L.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.strokeStyle = style; ctx.lineWidth = w; if (dash) { ctx.setLineDash(dash[0]); ctx.lineDashOffset = dash[1]; } ctx.stroke(); if (dash) ctx.setLineDash([]); };
    for (const g of segs) stroke(g, 'rgba(30,26,20,.7)', shell + 3 * z);                                            // the same dark border the old pipes have
    for (const g of segs) stroke(g, g.kind === 'loop' ? '#7d858f' : g.kind === 'coast' ? '#8794a3' : '#8a929b', shell);   // the grey shell
    const lw = Math.max(.6, shell / 8.5), step = shell / 7;                                                          // six lanes inside the shell
    CHANNELS.forEach((c, i) => { const off = (i - 2.5) * step, st = cn.ch[c], dim = st.state === 'CLOSED' || st.fault; const col = COLOR[c];
      for (const g of segs) { const bad = g.fault[c]; ctx.globalAlpha = bad ? .35 : dim ? .4 : 1; stroke(g, col, lw, off); ctx.globalAlpha = 1;
        const f = g.f[c]; if (!bad && f && f.flow > 1 && shell > 5) { const fw = Math.max(.8, lw * .55), dir = f.net >= 0 ? 1 : -1; stroke(g, 'rgba(255,255,255,.85)', fw, off, [[3 * z + 1.5, 7 * z + 3], -dir * (performance.now() / 70 % 100)]); animCb && animCb(); }
        if (bad && shell > 5) stroke(g, '#ff4a3a', Math.max(.8, lw * .6), off, [[2 * z + 1, 3 * z + 2], 0]); } });
    for (const p of cn.pumps.values()) { const g = cn.seg.get(p.seg); if (!g || !segs.includes(g) || shell < 6) continue; const P = g.path, n = P.length, k = Math.min(n - 2, 7), i = p.st === g.a ? k : n - 1 - k, a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx = dx / l * p.dir; dy = dy / l * p.dir;
      const c = CHANNELS.indexOf(p.ch), off = (c - 2.5) * step, q0 = pt(P[i]), q1 = pt([P[i][0] + dx, P[i][1] + dy]); let ux = q1[0] - q0[0], uy = q1[1] - q0[1]; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul; const cx = q0[0] - uy * off, cy = q0[1] + ux * off, r = Math.max(2.2, shell * .3);
      ctx.beginPath(); ctx.moveTo(cx + ux * r, cy + uy * r); ctx.lineTo(cx - ux * r * .7 - uy * r * .8, cy - uy * r * .7 + ux * r * .8); ctx.lineTo(cx - ux * r * .7 + uy * r * .8, cy - uy * r * .7 - ux * r * .8); ctx.closePath(); ctx.fillStyle = p.fault ? '#ff4a3a' : '#ffffff'; ctx.fill(); ctx.lineWidth = Math.max(.8, z * .6); ctx.strokeStyle = COLOR[p.ch]; ctx.stroke(); }
    for (const s of cn.st.values()) { if (s.cells) continue; const p = pt([s.x, s.y]); if (p[0] < -30 || p[1] < -30 || p[0] > ctx.canvas.width + 30) continue; ctx.fillStyle = '#e8edf2'; ctx.strokeStyle = '#1e1a14'; ctx.lineWidth = Math.max(1, z * .8); const r = Math.max(2, shell * .45); ctx.beginPath(); ctx.rect(p[0] - r, p[1] - r, 2 * r, 2 * r); ctx.fill(); ctx.stroke(); }
  }

  const css = '#cn-btn{position:absolute;right:8px;top:190px;z-index:6;min-height:40px;padding:0 12px;border-radius:10px;background:rgba(27,34,44,.94);border:1px solid #6b7d92;color:#fff;font-weight:700}'
    + '#cn-sheet{position:fixed;inset:0;z-index:31;background:var(--bg,#10141a);display:none;flex-direction:column;direction:rtl;color:#e8edf2;font-size:13px}#cn-sheet.open{display:flex}'
    + '#cn-sheet .top{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #33404f}#cn-sheet .top b{flex:1;font-size:15px}'
    + '#cn-sheet .body{flex:1;overflow:auto;padding:10px}#cn-sheet table{width:100%;border-collapse:collapse}#cn-sheet td,#cn-sheet th{padding:4px 6px;border-bottom:1px solid #26303c;text-align:right}'
    + '#cn-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}#cn-chips button{min-height:40px;padding:0 10px;border-radius:9px;background:#1b222c;border:2px solid #33404f;color:#fff;font-weight:600}#cn-chips button.on{border-color:var(--c)}'
    + '#cn-sheet button.act{min-height:42px;padding:0 12px;border-radius:9px;background:#27415c;border:1px solid #4b6a8a;color:#fff;font-weight:600;margin:3px 0 3px 6px}#cn-sheet h5{margin:12px 0 4px;font-size:13px;color:#9fb3c8}';

  const R_ = rep => '60 سنة · 6% · سماح سنتان · الفائدة على الرصيد المتبقي فقط';
  function chInfo(c) { return env.cn().channelInfo(c); }
  function seg(c) { return { cls: c.status === 'FAULT' ? '#ff8a7a' : c.status === 'CLOSED' ? '#ffd27a' : '#8dffb0' }; }

  function pumpRows(cn, ch, segId) {
    const rows = []; for (const p of cn.pumps.values()) { if (p.ch !== ch || (segId && p.seg !== segId)) continue; const g = cn.seg.get(p.seg); if (!g) continue; const from = p.dir === 1 ? g.a : g.b, to = p.dir === 1 ? g.b : g.a;
      rows.push('<tr><td>' + p.st + ' · ' + p.seg + '</td><td>' + (p.fault ? '<span style="color:#ff8a7a">معطّلة</span>' : p.flow > 0 ? 'تعمل ' + num(p.pIn, 0) + '→' + num(p.pOut, 0) + ' psi · ' + num(p.flow, 0) + ' bbl/يوم' : 'جاهزة') + '</td><td>' + (p.dir === 1 ? 'أمامي' : 'عكسي') + ' · يدفع من ' + from + ' إلى ' + to + '</td><td><button class="act cn-pdir" data-p="' + p.id + '">↔ عكس</button><button class="act cn-pflt" data-p="' + p.id + '">' + (p.fault ? '🔧' : '⚠') + '</button></td></tr>'); }
    return rows.length ? '<table>' + rows.join('') + '</table>' : '<div class="k">لا مضخات على هذا الجزء.</div>';
  }
  function render() {
    const cn = env.cn(), el = document.getElementById('cn-body'); if (!cn || !el) return; const CLS = env.CEN.CLASS, rep = env.company.centralReport && env.company.centralReport(), c = chInfo(sel);
    let h = '<div id="cn-chips">' + env.CEN.CHANNELS.map(k => { const i = chInfo(k); return '<button data-ch="' + k + '" class="' + (k === sel ? 'on' : '') + '" style="--c:' + env.CEN.COLOR[k] + '"><span style="color:' + env.CEN.COLOR[k === 'CRUDE' ? 'CRUDE' : k] + ';text-shadow:0 0 2px #fff">●</span> ' + NAME[k] + ' · ' + (ST[i.status] || i.status) + '</button>'; }).join('') + '</div>';
    h += '<table><tr><td>الحالة</td><td style="color:' + seg(c).cls + '">' + (ST[c.status] || c.status) + (c.hasFault ? ' · مقطع مقطوع' : '') + '</td></tr>'
      + '<tr><td>التدفق الآن</td><td>' + num(c.flow, 0) + ' bbl/يوم</td></tr><tr><td>السعة التصميمية للمقطع</td><td>' + CLS.capacity.toLocaleString() + ' bbl/يوم</td></tr>'
      + '<tr><td>الضغط (متوسط مرجّح)</td><td>' + num(c.pressure, 0) + ' psi (الأقصى ' + CLS.maxPressure + ')</td></tr>'
      + '<tr><td>الاتجاه</td><td>' + (c.dir > 0 ? 'من الشمال/الغرب نحو الجنوب/الشرق (a→b)' : c.dir < 0 ? 'عكس اتجاه الرسم (b→a)' : c.flow > 0 ? 'متوازن' : 'لا حركة') + '</td></tr>'
      + '<tr><td>الكمية داخل الشبكة</td><td>' + num(c.qty, 0) + ' bbl</td></tr><tr><td>المضخات</td><td>' + c.pumpsOk + ' / ' + c.pumps + ' سليمة</td></tr><tr><td>إجمالي ما نُقل</td><td>' + num(c.moved, 0) + ' bbl</td></tr></table>'
      + '<div><button class="act" id="cn-open">' + (c.state === 'CLOSED' ? '▶ فتح القناة' : '⏸ إغلاق القناة') + '</button><button class="act" id="cn-flt">' + (c.fault ? '🔧 إصلاح عطل القناة' : '⚠ محاكاة عطل بالقناة') + '</button><button class="act" id="cn-pump">' + (c.pumpsOk < c.pumps ? '🔧 إصلاح المضخات' : '⚠ تعطيل مضخات القناة') + '</button></div>';
    h += '<h5>مضخات القناة (ثنائية الاتجاه)</h5>' + pumpRows(cn, sel) + '<div class="k">المضخة تدفع المنتج في اتجاه واحد على مقطعها وتتجاوزها الحركة المعاكسة بلا دعم ضغط. «عكس» يبدّل السحب والطرد.</div>';
    h += '<h5>فرع جديد</h5><div class="k">اضغط الزر ثم المس أي نقطة على الأنبوب المركزي: يُبنى موقع ربط مسجَّل داخل المحرك ثم تصل منه بالأنبوب العادي إلى المنشأة.</div><button class="act" id="cn-tap">🔀 إنشاء فرع من نقطة على الخط</button>';
    if (rep) { h += '<h5>المال والقرض</h5><table><tr><td>قيمة الشبكة (أصل)</td><td>' + fmt(rep.asset) + '</td></tr><tr><td>رصيد أصل الدين</td><td>' + fmt(rep.loan) + (rep.open ? '' : ' (مُسدَّد)') + '</td></tr><tr><td>الفائدة المستحقة حتى الآن هذا الشهر</td><td>' + fmt(rep.accrued) + '</td></tr><tr><td>أصل الدين المسدَّد</td><td>' + fmt(rep.principalRepaid) + (rep.extraRepaid ? ' (منه إضافي ' + fmt(rep.extraRepaid) + ')' : '') + '</td></tr><tr><td>إجمالي الفوائد المدفوعة</td><td>' + fmt(rep.interestPaid) + '</td></tr><tr><td>الفوائد المستقبلية المتبقية</td><td>' + fmt(rep.futureInterest) + '</td></tr><tr><td>فوائد مستقبلية وُفّرت بالسداد المبكر</td><td style="color:#8dffb0">' + fmt(rep.interestSaved) + '</td></tr><tr><td>القسط الشهري' + (rep.inGrace ? ' (بعد السماح)' : '') + '</td><td>' + fmt(rep.instalment) + '</td></tr><tr><td>فائدة الشهر القادم</td><td>' + fmt(rep.nextInterest) + (rep.inGrace ? ' (فترة سماح: فوائد فقط)' : '') + '</td></tr><tr><td>تشغيل / يوم</td><td>' + fmt(rep.opPerDay) + '</td></tr><tr><td>صيانة / يوم</td><td>' + fmt(rep.maintPerDay) + '</td></tr></table>';
      if (rep.open) h += '<h5>سداد مبكر (بلا غرامة)</h5><div><input id="cn-amt" type="number" inputmode="numeric" placeholder="المبلغ بالدولار" style="width:150px;min-height:40px;border-radius:8px;border:1px solid #4b6a8a;background:#1b222c;color:#fff;padding:0 8px"> <button class="act" id="cn-pay">سداد المبلغ</button></div><div>' + [10, 25, 50].map(p => '<button class="act cn-pp" data-p="' + p + '">' + p + '%</button>').join('') + '<button class="act cn-pp" data-p="100">سداد الكل</button></div><div class="k" id="cn-pmsg"></div>';
      const rows = rep.table.rows, pick = rows.length ? [0, 1, 11, 23, 24, 35, 59, 119, 239, 359, 479, 599, rows.length - 1].filter((m, i, a) => m < rows.length && a.indexOf(m) === i) : [];
      h += '<h5>جدول الأقساط المتبقي (' + (R_(rep)) + ')</h5>' + (rows.length ? '<table><tr><th>شهر</th><th>فائدة</th><th>أصل</th><th>قسط</th><th>الرصيد</th></tr>' + pick.map(k => { const r = rows[k]; return '<tr><td>' + r.m + (r.grace ? ' (سماح)' : '') + '</td><td>' + fmt(r.interest) + '</td><td>' + fmt(r.principal) + '</td><td>' + fmt(r.payment) + '</td><td>' + fmt(r.balance) + '</td></tr>'; }).join('') + '</table>' : '<div class="k">لا أقساط متبقية.</div>'); }
    el.innerHTML = h;
  }

  function segInfo(x, y) {
    const cn = env.cn(), tp = cn.tapPoint(x, y); if (!tp) return false; const g = tp.seg; env.state.sel = null; env.state.pipeSel = null;
    let h = '<h4>🛢️ الأنبوب المركزي · ' + (g.kind === 'loop' ? 'حلقة بديلة' : g.kind === 'coast' ? 'وصلة ساحلية' : 'خط رئيسي') + ' ' + g.id + '</h4><table class="kv">';
    for (const c of env.CEN.CHANNELS) { const f = g.f[c]; h += '<tr><td><span style="color:' + env.CEN.COLOR[c] + '">●</span> ' + NAME[c] + '</td><td>' + (g.fault[c] ? '<span style="color:#ff8a7a">مقطوعة</span>' : num(f.flow, 0) + ' bbl/يوم') + '</td></tr>'; }
    h += '</table><div class="row" style="flex-wrap:wrap">' + (tp.atEnd ? '<span class="k">هذه نقطة ربط قائمة (محطة).</span>' : '<button id="cn-here" style="min-height:44px">🔀 فرع هنا</button>') + env.CEN.CHANNELS.map(c => '<button class="cn-cut" data-ch="' + c + '" data-seg="' + g.id + '" style="min-height:36px;border:2px solid ' + env.CEN.COLOR[c] + '">' + (g.fault[c] ? '🔧 ' : '✂ ') + NAME[c] + '</button>').join('') + '</div>';
    const pr = env.CEN.CHANNELS.map(c => pumpRows(cn, c, g.id)).filter(x => x.indexOf('<table>') === 0).join(''); if (pr) h += '<div class="k" style="margin-top:6px">مضخات هذا المقطع:</div>' + pr;
    const $i = document.getElementById('info'); $i.innerHTML = h; $i.dataset.cn = x + ',' + y; env.WP.markDirty(); return true;
  }
  function planAt(x, y, toward) {
    const r = env.CEN.planTap(env.store, env.pipes, x, y, { toward: toward || null }); const $i = document.getElementById('info');
    if (!r.ok) { env.toast(({ cash: 'الرصيد لا يكفي لنقطة الربط (' + fmt(r.cost || 0) + ')', atStation: 'هنا محطة ربط قائمة: اربط منها مباشرة', slope: 'الأرض هنا شديدة الانحدار لبناء محطة ربط', water: 'لا يُبنى على الماء أو الوادي', centralPipe: 'المكان مزدحم بخطوط الأنبوب المركزي: جرّب نقطة أبعد قليلاً', sectorForbidden: 'قطاع هذه النقطة لا يسمح ببناء محطة ربط', notOnCentral: 'هذه النقطة ليست على الأنبوب المركزي', noSpot: 'لا يوجد مكان صالح لمحطة ربط بجانب هذه النقطة' })[r.reason] || 'لا يمكن إنشاء فرع من هذه النقطة'); return false; }
    branch = r; $i.innerHTML = '<h4>🔀 نقطة ربط جديدة</h4><div class="k">ستُبنى محطة ربط 3×3 ملاصقة للخط بـ ' + r.ports + ' منافذ صالحة (قناتان لكل منتج). تُسجَّل كاتصال ميكانيكي بالقنوات الست، ثم تصل منها بأنبوب عادي إلى المنشأة.<br>التكلفة ' + fmt(r.cost) + '</div><div class="row"><button id="cn-ok" style="min-height:46px">✔ بناء</button><button id="cn-no" style="min-height:46px">إلغاء</button></div>'; return true;
  }

  function mount(e) {
    env = e; const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const b = document.createElement('button'); b.id = 'cn-btn'; b.textContent = '🛢️ الشبكة المركزية'; document.body.appendChild(b);
    const s = document.createElement('div'); s.id = 'cn-sheet'; s.innerHTML = '<div class="top"><b>🛢️ الأنبوب المركزي · 6 قنوات</b><button class="act" id="cn-x" style="min-height:40px">إغلاق</button></div><div class="body" id="cn-body"></div>'; document.body.appendChild(s);
    const show = () => { render(); s.classList.add('open'); }; b.onclick = show; s.querySelector('#cn-x').onclick = () => s.classList.remove('open');
    const refresh = () => { if (!s.classList.contains('open')) return; const i = document.getElementById('cn-amt'); if (i && (i.value || document.activeElement === i)) return; render(); };   // never wipe what the player is typing setInterval(refresh, 700);
    s.addEventListener('click', ev => { const t = ev.target.closest('button'); if (!t) return; const cn = env.cn(); if (t.dataset.ch) { sel = t.dataset.ch; render(); return; }
      if (t.id === 'cn-open') { const c = chInfo(sel); cn.setChannel(sel, c.state === 'CLOSED' ? 'OPEN' : 'CLOSED'); env.save(); render(); }
      else if (t.id === 'cn-flt') { cn.setChannelFault(sel, !chInfo(sel).fault); env.save(); render(); }
      else if (t.id === 'cn-pump') { const bad = chInfo(sel).pumpsOk < chInfo(sel).pumps; for (const p of cn.pumps.values()) if (p.ch === sel) cn.setPumpFault(p.id, !bad); env.save(); render(); }
      else if (t.id === 'cn-pay' || t.classList.contains('cn-pp')) { const l = env.company.centralLoan(); if (!l) return; const amt = t.id === 'cn-pay' ? +document.getElementById('cn-amt').value : l.remaining * (+t.dataset.p) / 100, r = env.company.prepayLoan(l.id, t.dataset.p === '100' ? null : amt); env.updateCash(); env.save(); render(); const m = document.getElementById('cn-pmsg'); if (m) m.textContent = r.ok ? 'تم سداد ' + fmt(r.paid) + (r.accrued ? ' + فائدة مستحقة ' + fmt(r.accrued) : '') + ' · وُفّر ' + fmt(r.saved) + ' من الفوائد المستقبلية' : (r.reason === 'cash' ? 'الرصيد لا يكفي (' + fmt(r.need) + ')' : 'مبلغ غير صالح'); }
      else if (t.classList.contains('cn-pdir')) { const p = cn.pumps.get(t.dataset.p); if (p) { cn.setPumpDir(p.id, -p.dir); env.save(); render(); } }
      else if (t.classList.contains('cn-pflt')) { const p = cn.pumps.get(t.dataset.p); if (p) { cn.setPumpFault(p.id, !p.fault); env.save(); render(); } }
      else if (t.id === 'cn-tap') { s.classList.remove('open'); env.state.centralTap = true; env.toast('المس نقطة على الأنبوب المركزي لإنشاء فرع'); } });
    document.getElementById('info').addEventListener('click', ev => { const t = ev.target.closest('button'); if (!t) return; const cn = env.cn(); const $i = document.getElementById('info');
      if (t.id === 'cn-here') { const [x, y] = $i.dataset.cn.split(',').map(Number); planAt(x, y); }
      else if (t.id === 'cn-no') { branch = null; $i.innerHTML = ''; }
      else if (t.id === 'cn-ok' && branch) { const r = env.CEN.commitTap(env.store, env.pipes, branch, { instant: true }); branch = null; if (r.ok) { env.toast('تم تسجيل نقطة الربط · ' + fmt(r.cost)); env.updateCash(); env.save(); env.showBuilding(r.building.id); } else env.toast('تعذّر البناء: ' + (r.reason || '')); env.WP.markDirty(); }
      else if (t.classList.contains('cn-pdir')) { const p = cn.pumps.get(t.dataset.p); if (p) { cn.setPumpDir(p.id, -p.dir); env.save(); const [x, y] = $i.dataset.cn.split(',').map(Number); segInfo(x, y); } }
      else if (t.classList.contains('cn-cut')) { const g = cn.seg.get(t.dataset.seg), c = t.dataset.ch; cn.setFault(g.id, c, !g.fault[c]); env.save(); const [x, y] = $i.dataset.cn.split(',').map(Number); segInfo(x, y); } });
    return { show, render };
  }
  /* a tap on the map: true when the central network consumed it */
  function tap(x, y) { if (!env) return false; const cn = env.cn(); if (!cn || !cn.cen.has(cn.key(x, y))) { if (env.state.centralTap) { env.state.centralTap = false; } return false; }
    if (env.state.centralTap) { env.state.centralTap = false; return planAt(x, y) || true; } return segInfo(x, y); }
  return { draw, mount, tap, render: () => env && render(), NAME };
});
