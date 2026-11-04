/* Oli — map layers UI (Phase 6): the «طبقات الخريطة» menu, the drawing of the layers on the world canvas, the details panel and the geological section.
 * All data comes from OliMapLayers (map-layers.js), which reads the real game. This file only draws and lets the player switch layers on and off.
 * Performance: the data of a layer is built for a view a little larger than the screen and reused while the camera stays inside it (and for at most 300 ms of game time). */
(function () {
  'use strict';
  const WP = window.__wp, LAB = window.__lab, ML = window.OliMapLayers; if (!WP || !LAB || !ML) return;
  const world = WP.world, ctx = WP.ctx, cam = WP.cam, hooks = WP.hooks, sx = WP.sx, sy = WP.sy, $ = id => document.getElementById(id);
  const layers = ML.create({ world, store: LAB.store, pipes: LAB.pipes, sim: LAB.sim, ts: LAB.ts }), DEFS = layers.DEFS, KEY = 'oli-map-layers';
  const ui = { open: false, sec: null, pick: null }, cache = new Map(), nf = n => Math.round(n).toLocaleString('en-US');
  try { const saved = JSON.parse(localStorage.getItem(KEY) || '[]'); for (const id of saved) layers.set(id, true); } catch (e) { /* storage may be unavailable */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify([...layers.on])); } catch (e) { /* ignore */ } };

  /* ------------------------------------------------------------------ the menu */
  const css = document.createElement('style'); css.textContent =
    '#lyBtn{border-color:#4b5a6b}#lyPanel{display:none;position:absolute;right:8px;top:56px;width:min(290px,86vw);max-height:62%;overflow:auto;background:rgba(27,34,44,.97);border:1px solid #4b5a6b;border-radius:12px;padding:8px;z-index:7;direction:rtl}' +
    '#lyPanel h4{margin:2px 4px 6px;font-size:14px}#lyPanel .ly{display:flex;align-items:center;gap:8px;width:100%;text-align:right;margin:3px 0;min-height:42px;padding:6px 8px;background:#222b37}' +
    '#lyPanel .ly.on{background:#2c3a4b;border-color:var(--c)}#lyPanel .sw{flex:0 0 auto;width:26px;height:26px;border-radius:7px;background:var(--c);display:flex;align-items:center;justify-content:center;color:#111;font-weight:700;font-size:14px;opacity:.45}' +
    '#lyPanel .ly.on .sw{opacity:1}#lyPanel .nm{flex:1}#lyPanel .st{font-size:11px;color:var(--mut)}#lyPanel .lg{display:flex;flex-wrap:wrap;gap:4px 10px;padding:2px 6px 6px;font-size:11px;color:var(--mut)}' +
    '#lyPanel .lg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-left:4px;vertical-align:-1px}#lyPanel .nt{font-size:11px;color:#ffd27a;padding:0 8px 4px}' +
    '#secPanel{display:none;position:absolute;left:6px;right:6px;bottom:6px;height:48%;background:rgba(18,23,30,.98);border:1px solid #4b5a6b;border-radius:12px;z-index:8;direction:rtl}#secPanel canvas{position:static;width:100%;height:calc(100% - 34px);display:block}' +
    '#secPanel .hd{display:flex;align-items:center;gap:8px;padding:4px 10px;height:34px;font-weight:600}#secPanel .hd span{flex:1;font-size:12px;color:var(--mut);font-weight:400}#secPanel button{min-height:28px;padding:2px 10px}';
  document.head.appendChild(css);
  const bar = $('bar'), btn = document.createElement('button'); btn.id = 'lyBtn'; btn.textContent = 'طبقات الخريطة'; bar.insertBefore(btn, bar.firstChild);
  const panel = document.createElement('div'); panel.id = 'lyPanel'; document.body.appendChild(panel);
  const secPanel = document.createElement('div'); secPanel.id = 'secPanel'; secPanel.innerHTML = '<div class="hd"><b>مقطع جيولوجي</b><span id="secInfo"></span><button id="secClose">إغلاق</button></div><canvas id="secCv"></canvas>'; document.body.appendChild(secPanel);
  function renderMenu() {
    let h = '<h4>طبقات الخريطة</h4>';
    for (const id of layers.IDS) { const d = DEFS[id], on = layers.on.has(id), st = layers.stats.byLayer[id]; h += '<button class="ly' + (on ? ' on' : '') + '" data-ly="' + id + '" style="--c:' + d.color + '"><span class="sw">' + d.icon + '</span><span class="nm">' + d.ar + '</span><span class="st">' + (on ? (st ? st.items + ' عنصر' : 'مفعّلة') : 'متوقفة') + '</span></button>';
      if (on) { h += '<div class="lg">' + layers.legend(id).map(l => '<span><i style="background:' + l[0] + '"></i>' + l[1] + '</span>').join('') + '</div>'; const n = cache.get(id); if (n && n.note) h += '<div class="nt">' + n.note + '</div>'; } }
    h += '<div class="row"><button id="lySec">مقطع جيولوجي تحت الأرض</button><button id="lyOff">إيقاف الكل</button></div>' + (ui.pick ? '<div class="nt">' + (ui.pick.a ? 'اضغط على النقطة الثانية من المقطع' : 'اضغط على النقطة الأولى من المقطع') + '</div>' : '');
    panel.innerHTML = h;
  }
  btn.onclick = () => { ui.open = !ui.open; panel.style.display = ui.open ? 'block' : 'none'; btn.classList.toggle('on', ui.open); if (ui.open) renderMenu(); };
  panel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ly) { layers.toggle(b.dataset.ly); cache.delete(b.dataset.ly); persist(); }
    else if (b.id === 'lyOff') { for (const id of layers.IDS) layers.set(id, false); cache.clear(); persist(); }
    else if (b.id === 'lySec') { ui.pick = ui.pick ? null : { a: null }; ui.sec = null; secPanel.style.display = 'none'; if (ui.pick) { LAB.toast('اضغط على نقطتين على الخريطة لرسم المقطع الجيولوجي'); } }
    renderMenu(); WP.markDirty();
  });
  $('secClose').onclick = () => { secPanel.style.display = 'none'; ui.sec = null; ui.pick = null; WP.markDirty(); if (ui.open) renderMenu(); };

  /* ------------------------------------------------------------------ drawing */
  const now = () => performance.now();
  function dataFor(id, vb) {
    const c = cache.get(id), t = now(), simT = LAB.store.time || 0;
    if (c && t - c.t < 300 && c.simT === simT && vb.x0 >= c.v.x0 && vb.y0 >= c.v.y0 && vb.x1 <= c.v.x1 && vb.y1 <= c.v.y1 && Math.abs(c.z - cam.z) / cam.z < .15) return c;
    const mx = (vb.x1 - vb.x0) * .25, my = (vb.y1 - vb.y0) * .25, v = { x0: vb.x0 - mx, y0: vb.y0 - my, x1: vb.x1 + mx, y1: vb.y1 + my, z: cam.z }, r = layers.features(id, v);
    const n = { t, simT, v, z: cam.z, items: r.items, note: r.note || null }; cache.set(id, n); return n;
  }
  function diamond(x, y, w, h) { ctx.beginPath(); ctx.moveTo(sx(x, y), sy(x, y)); ctx.lineTo(sx(x + w, y), sy(x + w, y)); ctx.lineTo(sx(x + w, y + h), sy(x + w, y + h)); ctx.lineTo(sx(x, y + h), sy(x, y + h)); ctx.closePath(); }
  function ellipse(x, y, r) { ctx.beginPath(); for (let a = 0; a <= 28; a++) { const t = a / 28 * Math.PI * 2, px = x + Math.cos(t) * r, py = y + Math.sin(t) * r; a ? ctx.lineTo(sx(px, py), sy(px, py)) : ctx.moveTo(sx(px, py), sy(px, py)); } ctx.closePath(); }
  let labels = 0, placed = [];
  function label(txt, x, y, color, size) {
    if (!txt || labels >= 36) return; ctx.font = '600 ' + (size || 11) + 'px system-ui'; ctx.textAlign = 'center'; const w = ctx.measureText(txt).width, sz = size || 11, r = [x - w / 2 - 2, y - sz, x + w / 2 + 2, y + 3];
    for (const q of placed) if (r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]) return;      // a label never lies over another one: the first (lower layer) wins
    placed.push(r); labels++; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(txt, x, y); ctx.fillStyle = color || '#fff'; ctx.fillText(txt, x, y); }
  function arrows(pts, col) {
    let acc = 0; const gap = Math.max(26, 60 * cam.z); for (let i = 1; i < pts.length; i++) {
      const x0 = sx(pts[i - 1][0], pts[i - 1][1]), y0 = sy(pts[i - 1][0], pts[i - 1][1]), x1 = sx(pts[i][0], pts[i][1]), y1 = sy(pts[i][0], pts[i][1]), d = Math.hypot(x1 - x0, y1 - y0); acc += d; if (acc < gap) continue; acc = 0;
      const a = Math.atan2(y1 - y0, x1 - x0), s = Math.max(4, 6 * cam.z); ctx.beginPath(); ctx.moveTo(x1 + Math.cos(a) * s, y1 + Math.sin(a) * s); ctx.lineTo(x1 + Math.cos(a + 2.5) * s, y1 + Math.sin(a + 2.5) * s); ctx.lineTo(x1 + Math.cos(a - 2.5) * s, y1 + Math.sin(a - 2.5) * s); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    }
  }
  function drawItem(it, lv, vb) {
    const near = (x, y) => x > vb.x0 - 30 && x < vb.x1 + 30 && y > vb.y0 - 30 && y < vb.y1 + 30, big = cam.z >= .35;
    switch (it.k) {
      case 'cell': { if (!near(it.x, it.y)) return; diamond(it.x, it.y, it.s, it.s); ctx.globalAlpha = it.a || .4; ctx.fillStyle = it.c; ctx.fill(); ctx.globalAlpha = 1; return; }
      case 'rect': { if (it.x > vb.x1 || it.y > vb.y1 || it.x + it.w < vb.x0 || it.y + it.h < vb.y0) return; diamond(it.x, it.y, it.w, it.h); ctx.globalAlpha = it.a || .15; ctx.fillStyle = it.fill; ctx.fill(); ctx.globalAlpha = 1; ctx.setLineDash(it.dash || []); ctx.strokeStyle = it.stroke || it.fill; ctx.lineWidth = it.w2 || 1.5; ctx.stroke(); ctx.setLineDash([]);
        if (it.label && lv !== 'CLOSE') { const cx = it.x + it.w / 2, cy = it.y + it.h / 2, X = sx(cx, cy), Y = sy(cx, cy); if (X > 0 && X < innerWidth && Y > 40 && Y < innerHeight - 100) label(it.label, X, Y, '#fff', lv === 'FAR' ? 10 : 12); } return; }
      case 'ell': { if (!near(it.x, it.y)) return; ellipse(it.x, it.y, it.r); ctx.fillStyle = it.fill; ctx.fill(); ctx.setLineDash(it.dash || []); ctx.strokeStyle = it.stroke; ctx.lineWidth = it.w || 1.5; ctx.stroke(); ctx.setLineDash([]);
        if (it.gauge && it.ratio != null && big) { const X = sx(it.x, it.y), Y = sy(it.x, it.y) + 16, w = 46; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(X - w / 2, Y, w, 5); ctx.fillStyle = '#ffb030'; ctx.fillRect(X - w / 2, Y, w * it.ratio, 5); ctx.fillStyle = '#4fc3f7'; ctx.fillRect(X - w / 2, Y + 6, w * (it.pr == null ? 1 : it.pr), 3); }
        if (it.label && cam.z >= .2) label(it.label, sx(it.x, it.y), sy(it.x, it.y) - Math.max(10, it.r * 8 * cam.z), '#fff', 10); return; }
      case 'line': { if (!it.pts.length) return; const p0 = it.pts[0]; if (!near(p0[0], p0[1]) && !near(it.pts[it.pts.length - 1][0], it.pts[it.pts.length - 1][1]) && !near(it.pts[it.pts.length >> 1][0], it.pts[it.pts.length >> 1][1])) return;
        ctx.beginPath(); it.pts.forEach((p, i) => i ? ctx.lineTo(sx(p[0], p[1]), sy(p[0], p[1])) : ctx.moveTo(sx(p[0], p[1]), sy(p[0], p[1]))); ctx.setLineDash(it.dash || []); ctx.strokeStyle = it.c; ctx.lineWidth = Math.max(1.2, (it.w || 2) * Math.min(1.6, Math.max(.6, cam.z))); ctx.stroke(); ctx.setLineDash([]);
        if (it.arrow) arrows(it.pts, it.c); if (it.label && it.jam && big) { const m = it.pts[it.pts.length >> 1]; label(it.label, sx(m[0], m[1]), sy(m[0], m[1]) - 8, '#ffb0a8', 10); } return; }
      case 'bld': { if (!near(it.x, it.y)) return; diamond(it.x, it.y, it.w, it.h); ctx.strokeStyle = it.c; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = .22; ctx.fillStyle = it.c; ctx.fill(); ctx.globalAlpha = 1; return; }
      case 'dot': { if (!near(it.x, it.y)) return; const X = sx(it.x, it.y), Y = sy(it.x, it.y), r = Math.max(4, (it.r || 6) * Math.min(1.5, Math.max(.7, cam.z * 1.2)));
        ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fillStyle = it.c; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#111'; ctx.stroke(); if (it.sym) { ctx.fillStyle = '#111'; ctx.font = '700 ' + Math.round(r * 1.2) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(it.sym, X, Y + r * .4); }
        if (it.label && cam.z >= .5) label(it.label, X, Y - r - 4, it.c, 10); return; }
    }
  }
  const prevAfter = hooks.afterOverlays;
  hooks.afterOverlays = (lv, vb) => {
    if (prevAfter) prevAfter(lv, vb);
    if (layers.on.size) { labels = 0; placed = []; const t0 = now(); ctx.save(); ctx.lineJoin = 'round'; for (const id of layers.IDS) if (layers.on.has(id)) { const d = dataFor(id, vb); for (const it of d.items) drawItem(it, lv, vb); } ctx.restore(); layers.stats.drawMs = now() - t0; }
    if (ui.pick && ui.pick.a) { const a = ui.pick.a, b = ui.pick.b || a; ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 5]); ctx.beginPath(); ctx.moveTo(sx(a.x, a.y), sy(a.x, a.y)); ctx.lineTo(sx(b.x, b.y), sy(b.x, b.y)); ctx.stroke(); ctx.setLineDash([]); for (const p of [a, ui.pick.b]) if (p) { ctx.beginPath(); ctx.arc(sx(p.x, p.y), sy(p.x, p.y), 7, 0, 7); ctx.fillStyle = '#ffd24a'; ctx.fill(); } }
    if (ui.sec) { const a = ui.sec.a, b = ui.sec.b; ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx(a.x, a.y), sy(a.x, a.y)); ctx.lineTo(sx(b.x, b.y), sy(b.x, b.y)); ctx.stroke(); }
  };

  /* ------------------------------------------------------------------ tap: details of what the layers show, and the section picker */
  const prevTap = hooks.tap;
  hooks.tap = (px, py) => {
    const t = WP.toTile(px, py);
    if (ui.pick) {
      const p = { x: t.x, y: t.y }; if (!ui.pick.a) { ui.pick.a = p; } else { ui.pick.b = p; const s = layers.section(ui.pick.a, ui.pick.b, 64); if (s) { ui.sec = s; ui.pick = null; showSection(s); } else { LAB.toast('النقطتان متقاربتان جدًا'); ui.pick.b = null; } }
      renderMenu(); WP.markDirty(); return true;
    }
    const used = prevTap ? prevTap(px, py) : false;
    if (layers.on.size) { const res = layers.inspect(t.x, t.y); if (res.length) { const info = $('info'); let h = '<hr style="border:0;border-top:1px solid #33404f">'; for (const r of res) h += '<h4>' + r.title + '</h4><table class="kv">' + r.rows.map(q => '<tr><td>' + q[0] + '</td><td>' + q[1] + '</td></tr>').join('') + '</table>'; if (used) { const extra = res.filter(r => r.kind !== 'pipe' && r.kind !== 'building'); if (extra.length) info.insertAdjacentHTML('beforeend', '<hr style="border:0;border-top:1px solid #33404f">' + extra.map(r => '<h4>' + r.title + '</h4><table class="kv">' + r.rows.map(q => '<tr><td>' + q[0] + '</td><td>' + q[1] + '</td></tr>').join('') + '</table>').join('')); } else info.innerHTML = h.replace(/^<hr[^>]*>/, ''); return true; } }
    return used;
  };

  /* ------------------------------------------------------------------ the geological section */
  function showSection(s) {
    secPanel.style.display = 'block'; $('secInfo').textContent = 'الطول ' + nf(s.lengthM) + ' م · الصدوع ' + s.faults.length + ' · الحقول ' + s.fields.length + ' · الآبار ' + s.wells.length;
    const cv = $('secCv'), dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || innerWidth - 12, h = cv.clientHeight || 200; cv.width = w * dpr; cv.height = h * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = 44, R = 10, T = 14, Bm = 22, pw = w - L - R, ph = h - T - Bm; let maxD = 1800; for (const f of s.fields) maxD = Math.max(maxD, f.bottom + 500); for (const p of s.points) maxD = Math.max(maxD, p.stack[3][1] + 300); maxD = Math.min(s.maxDepth, maxD);
    const top = Math.max(...s.points.map(p => p.surface)), sc = ph / (maxD + top * .5), X = t => L + t * pw, Y = (surf, d) => T + ((top - surf) * .5 + d) * sc * 1;   // ground relief at half the vertical scale of depth
    g.fillStyle = '#10151b'; g.fillRect(0, 0, w, h);
    const order = ['ALLUVIUM', 'LIMESTONE', 'CAPROCK', 'RESERVOIR', 'SOURCE', 'BASEMENT'];
    for (let li = 0; li < 6; li++) {
      g.beginPath(); s.points.forEach((p, i) => { const x = X(p.t), y = Y(p.surface, Math.min(maxD, p.stack[li][0])); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      for (let i = s.points.length - 1; i >= 0; i--) { const p = s.points[i]; g.lineTo(X(p.t), Y(p.surface, Math.min(maxD, p.stack[li][1]))); } g.closePath();
      const idx = li === 0 ? (s.points[0].terrain === 'WATER_WADI' ? 'WATER' : 'ALLUVIUM') : order[li], col = (s.rocks[li === 0 ? 'ALLUVIUM' : idx] || s.rocks.ALLUVIUM).color; g.fillStyle = 'rgb(' + col.join(',') + ')'; g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.stroke();
    }
    g.beginPath(); s.points.forEach((p, i) => { const x = X(p.t), y = Y(p.surface, 0); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    for (const f of s.faults) { const p = s.points[Math.round(f.t * (s.points.length - 1))]; g.strokeStyle = '#ff5c5c'; g.lineWidth = 2; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(X(f.t), Y(p.surface, 0)); g.lineTo(X(f.t) + 6, Y(p.surface, maxD)); g.stroke(); g.setLineDash([]); g.fillStyle = '#ff9d9d'; g.font = '11px system-ui'; g.textAlign = 'center'; g.fillText('صدع ' + f.throwM + ' م', X(f.t), T + 10); }
    for (const f of s.fields) { const p = s.points[Math.round(f.t * (s.points.length - 1))], x0 = X(Math.max(0, f.t - f.halfWidth / s.lengthM / 1)), x1 = X(Math.min(1, f.t + f.halfWidth / s.lengthM)), y0 = Y(p.surface, f.top), y1 = Y(p.surface, f.bottom), fill = f.fill == null ? 1 : f.fill;
      g.fillStyle = 'rgba(40,24,8,.9)'; g.fillRect(x0, y0, x1 - x0, (y1 - y0) * fill); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x0, y0 + (y1 - y0) * fill, x1 - x0, (y1 - y0) * (1 - fill)); g.strokeStyle = '#ffb030'; g.lineWidth = 2; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = '#fff'; g.font = '600 11px system-ui'; g.textAlign = 'center'; g.fillText('حقل · ' + (f.depth != null ? nf(f.depth) + ' م' : 'عمق غير معروف') + (f.fill != null ? ' · متبقٍ ' + Math.round(f.fill * 100) + '%' : ''), (x0 + x1) / 2, y0 - 4); }
    for (const q of s.wells) { const inField = s.fields.some(f => Math.abs(f.t - q.t) * s.lengthM <= f.halfWidth); const p = s.points[Math.round(q.t * (s.points.length - 1))], d = q.depth || 800, x = X(q.t); g.strokeStyle = q.out > 0 ? '#6dff9a' : '#ff8a80'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, Y(p.surface, 0) - 8); g.lineTo(x, Y(p.surface, d)); g.stroke(); g.beginPath(); g.arc(x, Y(p.surface, d), 3.5, 0, 7); g.fillStyle = g.strokeStyle; g.fill(); if (!inField) { g.fillStyle = '#fff'; g.font = '10px system-ui'; g.fillText(nf(d) + ' م', x, Y(p.surface, d) + 13); } }
    g.fillStyle = '#9aa3ad'; g.font = '10px system-ui'; g.textAlign = 'right'; for (let d = 0; d <= maxD; d += maxD > 3000 ? 1000 : 500) { const yy = T + d * sc; g.fillText(nf(d) + ' م', L - 4, yy + 3); g.strokeStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(L, yy); g.lineTo(w - R, yy); g.stroke(); }
    g.textAlign = 'center'; g.fillText('0', L, h - 6); g.fillText(nf(s.lengthM) + ' م', w - R - 14, h - 6);
  }
  window.__layers = { layers, ui, cache, renderMenu, showSection };
  renderMenu(); WP.markDirty();
})();
