/* Oli — NETWORK DIAGNOSTICS screen (فاحص الشبكة): the panel, the map overlay and the jump to a fault.
 * All data comes from OliNetDiag.run() (network-diag.js), which only READS the game.  The inspection runs when the player taps «فحص الشبكة» / «إعادة الفحص» - never per frame.
 * The map overlay is drawn from the stored report (cheap polylines and markers); it never touches the simulation.
 *   html(report, state)  pure: the panel as an HTML string (also used by the tests)        */
(function (root) {
  'use strict';
  const ND = typeof require === 'function' && typeof module !== 'undefined' ? require('./network-diag.js') : root.OliNetDiag;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = n => String(n).padStart(2, '0'), SEV = ND.SEV;

  function html(rep, st) {
    st = st || {}; if (!rep) return '<div class="nd-h">فاحص الشبكة</div><p class="nd-p">يفحص هذا النظام الشبكة كاملة (كل الأنابيب والمنشآت وليس الجزء الظاهر على الشاشة) ويحدّد مكان كل عطل وسببه. هو للتشخيص فقط: لا يصلح شيئاً ولا يغيّر التدفق.</p><button class="nd-go" data-nd="scan">فحص الشبكة الآن</button>';
    const S = rep.stats, bad = st.stale ? '<div class="nd-stale">تغيّرت الشبكة منذ آخر فحص — أعد الفحص لتحديث النتائج.</div>' : '';
    const grade = S.health >= 95 ? '#34c759' : S.health >= 75 ? '#ffd60a' : S.health >= 50 ? '#ff9500' : '#ff3b30';
    let h = '<div class="nd-h">فاحص الشبكة <button class="nd-x" data-nd="close">✕</button></div>' + bad
      + '<div class="nd-sum"><div class="nd-big" style="color:' + grade + '">' + S.health + '%<small>سلامة الشبكة</small></div><table class="nd-t">'
      + '<tr><td>العناصر المفحوصة</td><td>' + S.checked + '</td></tr><tr><td>الاتصالات السليمة</td><td>' + S.healthyConnections + ' من ' + S.connections + '</td></tr>'
      + '<tr><td>الأعطال المؤكدة</td><td style="color:#ff6b61">' + S.faults + '</td></tr><tr><td>التحذيرات</td><td style="color:#ffd60a">' + S.warnings + '</td></tr></table></div>';
    for (const n of rep.notes) h += '<div class="nd-note">' + esc(n) + '</div>';
    h += '<div class="nd-row"><button class="nd-go" data-nd="scan">إعادة الفحص</button><button data-nd="ok" class="' + (st.showOk === false ? '' : 'on') + '">إظهار السليم (أخضر)</button></div>';
    if (!rep.faults.length) return h + '<p class="nd-p" style="color:#34c759">لم يُعثر على أي عطل أو تحذير في ' + S.checked + ' عنصراً. كل الاتصالات سليمة.</p>';
    h += '<div class="nd-list">'; const shown = rep.faults.slice(0, st.limit || 200);
    for (const f of shown) { const sv = SEV[f.severity], open = st.sel === f.no, col = f.confirmed ? sv.color : '#ffd60a';
      h += '<div class="nd-f' + (open ? ' sel' : '') + '" style="border-color:' + col + '"><button class="nd-fh" data-nd="go" data-n="' + f.no + '"><b>' + (f.confirmed ? 'العطل رقم ' : 'تحذير رقم ') + num(f.no) + '</b> <span class="nd-sv" style="background:' + col + '">' + sv.ar + '</span><div class="nd-s">' + esc(f.kindAr) + ' · ' + esc(f.element.label) + ' · ' + esc(f.zone) + '</div></button>';
      if (open) h += '<table class="nd-d"><tr><td>النوع</td><td>' + esc(f.kindAr) + (f.confirmed ? ' (مؤكد)' : ' (تحذير يحتاج مراجعة)') + '</td></tr><tr><td>الخطورة</td><td>' + sv.ar + '</td></tr><tr><td>العنصر</td><td>' + esc(f.element.label) + ' · المعرّف ' + esc(f.element.id) + '</td></tr>'
        + '<tr><td>المنطقة</td><td>' + esc(f.zone) + '</td></tr><tr><td>الإحداثيات</td><td dir="ltr">(' + f.x + ', ' + f.y + ')</td></tr><tr><td>السابق في التدفق</td><td>' + esc(f.prev || '—') + '</td></tr><tr><td>اللاحق في التدفق</td><td>' + esc(f.next || '—') + '</td></tr>'
        + '<tr><td>السبب</td><td>' + esc(f.cause) + '</td></tr><tr><td>التأثير</td><td>' + esc(f.effect) + '</td></tr><tr><td>الإصلاح المقترح</td><td>' + esc(f.fix) + '</td></tr></table>';
      h += '</div>'; }
    if (rep.faults.length > shown.length) h += '<button data-nd="more" class="nd-go">عرض المزيد (' + (rep.faults.length - shown.length) + ' متبقية)</button>';
    return h + '</div>';
  }

  const api = { html };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OliNetDiagUI = api;
  if (typeof window === 'undefined' || !window.__wp || !window.__lab) return;

  /* ------------------------------------------------------------------ browser wiring */
  const WP = window.__wp, LAB = window.__lab, hooks = WP.hooks, ctx = WP.ctx, cam = WP.cam, sx = WP.sx, sy = WP.sy, $ = id => document.getElementById(id);
  const DEFS = (window.OliBuildings || {}).DEFS, st = { open: false, rep: null, sel: null, showOk: true, limit: 200, rev: -1, n: -1, stale: false }, ov = { lines: [], marks: [] };
  const css = document.createElement('style'); css.textContent = '#ndBtn{border-color:#4b5a6b}#ndPanel{display:none;position:absolute;left:8px;top:104px;width:min(340px,92vw);max-height:calc(100% - 270px);overflow:auto;background:rgba(27,34,44,.97);border:1px solid #4b5a6b;border-radius:12px;padding:8px;z-index:7;direction:rtl;color:#e8eef5;font-size:13px}'
    + '#ndPanel .nd-h{font-weight:700;font-size:15px;margin:2px 2px 8px;display:flex;justify-content:space-between;align-items:center}#ndPanel button{font:inherit;color:inherit;background:#222b37;border:1px solid #3b4756;border-radius:8px;padding:6px 10px;min-height:38px}#ndPanel button.on{background:#2c3a4b;border-color:#34c759}'
    + '#ndPanel .nd-x{min-height:30px;padding:2px 8px}#ndPanel .nd-go{width:100%;margin:6px 0;background:#2a5a8a;border-color:#4b8fd0}#ndPanel .nd-p{margin:8px 4px;line-height:1.6}#ndPanel .nd-sum{display:flex;gap:10px;align-items:center}#ndPanel .nd-big{font-size:30px;font-weight:800;text-align:center;min-width:92px}#ndPanel .nd-big small{display:block;font-size:11px;font-weight:400;color:#9aa8b8}'
    + '#ndPanel .nd-t{flex:1;border-collapse:collapse}#ndPanel .nd-t td{padding:2px 4px;border-bottom:1px solid #2d3948}#ndPanel .nd-row{display:flex;gap:6px}#ndPanel .nd-row button{flex:1}#ndPanel .nd-note,#ndPanel .nd-stale{font-size:11px;color:#ffd27a;margin:4px 2px}#ndPanel .nd-f{border-right:4px solid;border-radius:8px;background:#1d2631;margin:5px 0;overflow:hidden}'
    + '#ndPanel .nd-fh{width:100%;text-align:right;background:transparent;border:0;padding:7px 9px}#ndPanel .nd-sv{display:inline-block;color:#111;border-radius:6px;padding:0 7px;font-size:11px;font-weight:700;margin-right:6px}#ndPanel .nd-s{font-size:11px;color:#9aa8b8;margin-top:3px}#ndPanel .nd-f.sel{background:#243040}#ndPanel .nd-d{width:100%;border-collapse:collapse;font-size:12px}#ndPanel .nd-d td{padding:4px 9px;vertical-align:top;border-top:1px solid #2d3948}#ndPanel .nd-d td:first-child{white-space:nowrap;color:#9aa8b8}';
  document.head.appendChild(css);
  const bar = $('bar'), btn = document.createElement('button'); btn.id = 'ndBtn'; btn.textContent = 'فاحص الشبكة'; bar.insertBefore(btn, bar.firstChild);
  const panel = document.createElement('div'); panel.id = 'ndPanel'; document.body.appendChild(panel);
  const locate = (x, y) => { try { const w = WP.world, id = w.regionIdAt(x, y); return id == null ? null : w.regionLabel(id); } catch (e) { return null; } };
  const stale = () => !!st.rep && (LAB.pipes.rev !== st.rev || LAB.store.items.size !== st.n);
  const render = () => { st.stale = stale(); panel.innerHTML = html(st.rep, st); panel.style.display = st.open ? 'block' : 'none'; WP.markDirty(); };
  function scan() {
    const t0 = performance.now(); st.rep = ND.run(LAB.store, LAB.pipes, { sim: LAB.sim, locate }); st.rev = LAB.pipes.rev; st.n = LAB.store.items.size; st.sel = null; st.ms = performance.now() - t0;
    const rep = st.rep, L = LAB.pipes.lines; ov.lines = []; ov.marks = [];
    const sevOf = new Map(); for (const f of rep.faults) if (f.element.type === 'PIPE') { const cur = sevOf.get(f.element.id); if (!cur || SEV[f.severity].rank < SEV[cur.severity].rank || (cur.confirmed === false && f.confirmed)) sevOf.set(f.element.id, f); }
    for (const id of rep.healthyLines) { const l = L.get(id); if (l && l.path.length) ov.lines.push({ pts: l.path.map(p => [p[0] + .5, p[1] + .5]), c: ND.OK_COLOR, w: 2, ok: true }); }
    for (const [id, f] of sevOf) { const l = L.get(id); if (l && l.path.length) ov.lines.push({ pts: l.path.map(p => [p[0] + .5, p[1] + .5]), c: f.confirmed ? SEV[f.severity].color : '#ffd60a', w: 3.5, no: f.no }); }
    for (const f of rep.faults) ov.marks.push({ x: f.x + .5, y: f.y + .5, c: f.confirmed ? SEV[f.severity].color : '#ffd60a', no: f.no, f });
    LAB.toast && LAB.toast('اكتمل الفحص: ' + rep.stats.faults + ' عطل · ' + rep.stats.warnings + ' تحذير'); render();
  }
  function select(no) {
    const f = st.rep && st.rep.faults.find(z => z.no === no); if (!f) return; st.sel = no; WP.goto(f.x + .5, f.y + .5, Math.max(cam.z, 0.9)); render();
    const el = panel.querySelector('.nd-f.sel'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }
  btn.addEventListener('click', () => { st.open = !st.open; if (st.open && !st.rep) scan(); else render(); });
  panel.addEventListener('click', e => { const el = e.target.closest('[data-nd]'); if (!el) return; const a = el.dataset.nd;
    if (a === 'scan') scan(); else if (a === 'close') { st.open = false; render(); } else if (a === 'ok') { st.showOk = !st.showOk; render(); } else if (a === 'more') { st.limit += 200; render(); } else if (a === 'go') { const n = +el.dataset.n; if (st.sel === n) { st.sel = null; render(); } else select(n); } });

  const prevAfter = hooks.afterOverlays;
  hooks.afterOverlays = (lv, vb) => {
    if (prevAfter) prevAfter(lv, vb);
    if (!st.open || !st.rep) return; const near = (x, y) => x > vb.x0 - 40 && x < vb.x1 + 40 && y > vb.y0 - 40 && y < vb.y1 + 40;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const it of ov.lines) { if (it.ok && st.showOk === false) continue; const p0 = it.pts[0], p1 = it.pts[it.pts.length - 1], pm = it.pts[it.pts.length >> 1]; if (!near(p0[0], p0[1]) && !near(p1[0], p1[1]) && !near(pm[0], pm[1])) continue;
      ctx.beginPath(); it.pts.forEach((p, i) => i ? ctx.lineTo(sx(p[0], p[1]), sy(p[0], p[1])) : ctx.moveTo(sx(p[0], p[1]), sy(p[0], p[1]))); ctx.globalAlpha = it.ok ? .75 : 1; ctx.strokeStyle = it.c; ctx.lineWidth = Math.max(1.5, it.w * Math.min(1.6, Math.max(.7, cam.z))); ctx.stroke(); ctx.globalAlpha = 1; }
    const sel = st.sel; for (const m of ov.marks) { if (!near(m.x, m.y)) continue; const X = sx(m.x, m.y), Y = sy(m.x, m.y), r = (m.no === sel ? 11 : 7) * Math.min(1.4, Math.max(.8, cam.z * 1.1));
      if (m.no === sel) { const f = m.f; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.arc(X, Y, r + 9, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        if (f.element.type === 'BUILDING' && DEFS) { const b = LAB.store.get(f.element.id), d = b && DEFS[b.d]; if (d) { const w = (b.r & 1) ? d.footprint[1] : d.footprint[0], h = (b.r & 1) ? d.footprint[0] : d.footprint[1]; ctx.beginPath(); ctx.moveTo(sx(b.x, b.y), sy(b.x, b.y)); ctx.lineTo(sx(b.x + w, b.y), sy(b.x + w, b.y)); ctx.lineTo(sx(b.x + w, b.y + h), sy(b.x + w, b.y + h)); ctx.lineTo(sx(b.x, b.y + h), sy(b.x, b.y + h)); ctx.closePath(); ctx.strokeStyle = m.c; ctx.lineWidth = 3; ctx.stroke(); } } }
      ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fillStyle = m.c; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#111'; ctx.stroke(); if (cam.z >= .5 || m.no === sel) { ctx.fillStyle = '#111'; ctx.font = '700 ' + Math.round(r * 1.1) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(m.no), X, Y + r * .38); } }
    ctx.restore();
  };
  const prevTap = hooks.tap;
  hooks.tap = (px, py) => { if (st.open && st.rep) { const t = WP.toTile(px, py); let best = null, bd = 2.2; for (const m of ov.marks) { const d = Math.hypot(m.x - t.x, m.y - t.y); if (d < bd) { bd = d; best = m; } } if (best) { select(best.no); return true; } }
    return prevTap ? prevTap(px, py) : false; };
  window.__netdiag = { st, ov, scan, select, render, panel };
})(typeof window !== 'undefined' ? window : globalThis);
