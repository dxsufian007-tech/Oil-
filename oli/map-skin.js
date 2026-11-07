/* OLI EMPIRE - map skin (stage 2). Presentation only: it plugs into the render hooks of world-preview.js (night backdrop, mountains, sector borders + plates, well pins, reserve emblem).
   Same coordinates, same data, same hit-testing: nothing here changes what the map IS, only how it is painted. Off in the developer UI. */
(function () {
  'use strict';
  const wp = window.__wp; if (!wp || !wp.skin) return; const skin = wp.skin, ctx = wp.ctx, A = 'map-assets/';
  const on = () => !document.body.classList.contains('dev');
  const IM = {}; function img(n) { if (IM[n]) return IM[n]; const i = new Image(); i.decoding = 'async'; i.onload = () => { i._ok = 1; wp.markDirty(); }; i.src = A + n + '.webp'; return IM[n] = i; }
  for (const n of ['night', 'pin-green', 'pin-gold', 'pin-blue', 'pin-red', 'platform', 'mtn-1', 'mtn-2', 'mtn-3', 'mtn-4', 'mtn-5', 'mtn-6']) img(n);
  const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const SC = new Map();                                                                               // pre-scaled sprites: one canvas per (image, width bucket); sprites are never scaled down by more than 2x in one step
  function sprite(name, w) { const src = IM[name]; if (!src || !src._ok) return null; const W = Math.max(8, Math.round(w / 8) * 8), key = name + W; let c = SC.get(key); if (c) return c; if (SC.size > 120) SC.clear();
    let cur = src, cw = src.naturalWidth, ch = src.naturalHeight; while (cw / 2 >= W) { const t = document.createElement('canvas'); t.width = cw = Math.round(cw / 2); t.height = ch = Math.round(ch / 2); t.getContext('2d').drawImage(cur, 0, 0, cw, ch); cur = t; }
    c = document.createElement('canvas'); c.width = W; c.height = Math.max(1, Math.round(src.naturalHeight * W / src.naturalWidth)); c.getContext('2d').drawImage(cur, 0, 0, c.width, c.height); SC.set(key, c); return c; }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function plate(text, x, y, h, a) {
    ctx.save(); ctx.globalAlpha = a == null ? 1 : a; ctx.font = '800 ' + Math.round(h * .56) + "px system-ui,'Noto Sans Arabic',sans-serif"; const w = Math.max(h * 1.7, ctx.measureText(text).width + h * .8), x0 = x - w / 2, y0 = y - h / 2;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, '#16284f'); g.addColorStop(1, '#060d22'); rr(x0, y0, w, h, h * .42); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = Math.max(1.5, h * .09);
    const s = ctx.createLinearGradient(0, y0, 0, y0 + h); s.addColorStop(0, '#ffe08a'); s.addColorStop(.5, '#c98a0b'); s.addColorStop(1, '#f5b83a'); ctx.strokeStyle = s; ctx.stroke(); ctx.fillStyle = '#fff1cf'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + h * .04); ctx.restore(); }
  /* background: the night picture, covering the screen (one blit per painted frame) */
  skin.bg = (c, VW, VH) => { if (!on()) return false; const i = IM.night; if (!i || !i._ok) return false; const k = Math.max(VW / i.naturalWidth, VH / i.naturalHeight), w = VW / k, h = VH / k; c.drawImage(i, (i.naturalWidth - w) / 2, (i.naturalHeight - h) / 2, w, h, 0, 0, VW, VH); return true; };
  /* mountains: placed from the terrain ids the overview carries (ROCKY_PLATEAU cells), a deterministic lattice, so every device sees the same ones */
  let RES = null;                                                                                       // the reserve emblem is drawn last (after the sector plates) so nothing covers it
  let MT = [], OVSTEP = 0;
  skin.onOverview = m => { if (!m.ids || m.step < OVSTEP) return; OVSTEP = m.step; const w = m.w, h = m.h, st = m.step, ids = m.ids, out = [], LAT = Math.max(2, Math.round(40 / st));
    for (let j = 1; j < h - 1; j += LAT) for (let i = 1; i < w - 1; i += LAT) { const jx = Math.round((hash(i, j, 1) - .5) * (LAT - 1)), jy = Math.round((hash(i, j, 2) - .5) * (LAT - 1)), ci = Math.min(w - 2, Math.max(1, i + jx)), cj = Math.min(h - 2, Math.max(1, j + jy)), k = cj * w + ci;
      if (ids[k] !== 3) continue; let n = 0; for (const d of [-1, 1, -w, w]) if (ids[k + d] === 3) n++; if (n < 2 || hash(ci, cj, 3) > .72) continue; out.push({ x: ci * st + st / 2, y: cj * st + st / 2, v: 1 + Math.floor(hash(ci, cj, 4) * 6), s: .75 + hash(ci, cj, 5) * .6 }); }
    MT = out.sort((a, b) => (a.x + a.y) - (b.x + b.y)); wp.markDirty(); };
  skin.grade = () => { const z = wp.cam.z, W = wp.world.W, H = wp.world.H, sx = wp.sx, sy = wp.sy; if (z >= .25) return; ctx.save(); ctx.beginPath(); ctx.moveTo(sx(0, 0), sy(0, 0)); ctx.lineTo(sx(W, 0), sy(W, 0)); ctx.lineTo(sx(W, H), sy(W, H)); ctx.lineTo(sx(0, H), sy(0, H)); ctx.closePath(); ctx.clip(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = z < .06 ? .55 : Math.max(0, .55 - (z - .06) * 2.5); ctx.fillStyle = '#ff9a2a'; ctx.fillRect(0, 0, wp.VW(), wp.VH()); ctx.restore(); };
  skin.ground = (lv, b) => { if (!on()) return; skin.grade(); if (!MT.length || wp.cam.z >= .55) return; const z = wp.cam.z, VW = wp.VW(), VH = wp.VH();
    for (const m of MT) { if (m.x < b.x0 - 90 || m.x > b.x1 + 90 || m.y < b.y0 - 90 || m.y > b.y1 + 90) continue; const w = Math.max(70, 2300 * z) * m.s, sp = sprite('mtn-' + m.v, w); if (!sp) continue; const X = wp.sx(m.x, m.y), Y = wp.sy(m.x, m.y); if (X < -w || X > VW + w || Y < -w || Y > VH + w) continue; ctx.drawImage(sp, X - sp.width / 2, Y - sp.height * .82); } };
  /* sectors: gold borders, the world's glowing edge, one plate per sector (A1 ... D6) */
  skin.sectors = (lv, b) => { if (!on()) return; const z = wp.cam.z, W = wp.world.W, H = wp.world.H, sx = wp.sx, sy = wp.sy, VW = wp.VW(), VH = wp.VH();
    const edge = () => { ctx.beginPath(); ctx.moveTo(sx(0, 0), sy(0, 0)); ctx.lineTo(sx(W, 0), sy(W, 0)); ctx.lineTo(sx(W, H), sy(W, H)); ctx.lineTo(sx(0, H), sy(0, H)); ctx.closePath(); };
    if (z < .2) { const t = Math.max(5, Math.min(16, 1100 * z)), A = [sx(W, 0), sy(W, 0)], B = [sx(W, H), sy(W, H)], C = [sx(0, H), sy(0, H)];       // the slab's thickness under the two front edges
      const g = ctx.createLinearGradient(0, Math.min(A[1], B[1], C[1]), 0, Math.max(A[1], B[1], C[1]) + t); g.addColorStop(0, '#8a5a12'); g.addColorStop(1, '#1b1205'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(C[0], C[1] + t); ctx.lineTo(B[0], B[1] + t); ctx.lineTo(A[0], A[1] + t); ctx.closePath(); ctx.fill(); }
    ctx.save(); ctx.lineJoin = 'round'; edge(); ctx.strokeStyle = 'rgba(255,160,30,.22)'; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = 'rgba(255,205,90,.95)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,205,90,.5)'; ctx.lineWidth = 1.1; ctx.beginPath(); for (const r of wp.world.regions) { if (r.x0 > b.x1 + 20 || r.y0 > b.y1 + 20 || r.x0 + r.w < b.x0 - 20 || r.y0 + r.h < b.y0 - 20) continue; ctx.moveTo(sx(r.x0, r.y0), sy(r.x0, r.y0)); ctx.lineTo(sx(r.x0 + r.w, r.y0), sy(r.x0 + r.w, r.y0)); ctx.lineTo(sx(r.x0 + r.w, r.y0 + r.h), sy(r.x0 + r.w, r.y0 + r.h)); ctx.lineTo(sx(r.x0, r.y0 + r.h), sy(r.x0, r.y0 + r.h)); ctx.lineTo(sx(r.x0, r.y0), sy(r.x0, r.y0)); } ctx.stroke(); ctx.restore();
    let rx = -1e9, ry = -1e9; if (RES) { rx = sx(RES.rz.x + RES.rz.w / 2, RES.rz.y + RES.rz.h / 2); ry = sy(RES.rz.x + RES.rz.w / 2, RES.rz.y + RES.rz.h / 2); }
    if (z < .35) for (const r of wp.world.regions) { const X = sx(r.x0 + r.w / 2, r.y0 + r.h / 2), Y = sy(r.x0 + r.w / 2, r.y0 + r.h / 2); if (X < -40 || X > VW + 40 || Y < -20 || Y > VH + 20 || Math.hypot(X - rx, Y - ry) < 48) continue; plate(r.name, X, Y, z < .05 ? 18 : 16, r.unlocked ? 1 : .6); }
    drawReserve(); };
  /* well pins: green = ready to drill, gold = producing, blue = surveyed, red = depleted */
  const PIN = { DRILLABLE: 'pin-green', PRODUCING: 'pin-gold', SURVEYED: 'pin-blue', DEPLETED: 'pin-red' };
  skin.pin = (px, py, sz, st, sel, lv) => { if (!on()) return 0; const n = PIN[st]; if (!n) return 0; const h = Math.round(Math.max(lv === 'FAR' ? 13 : 24, Math.min(46, sz * 1.9))), sp = sprite(n, h * .82); if (!sp) return 0; if (sel) { ctx.save(); ctx.strokeStyle = '#ffd45e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(px, py - h * .62, h * .6, 0, 7); ctx.stroke(); ctx.restore(); } ctx.drawImage(sp, px - sp.width / 2, py - sp.height); return sp.height; };
  /* the Strategic Reserve: the golden pumpjack platform */
    skin.reserveFar = rz => { if (!on() || !IM.platform._ok) return false; RES = { rz, lv: 'FAR' }; return true; };
  skin.reserveEmblem = (rz, lv) => { if (!on() || lv === 'CLOSE') return; RES = { rz, lv }; };
  function drawReserve() { if (!RES) return; const { rz, lv } = RES; RES = null; const sp = sprite('platform', lv === 'FAR' ? 44 : 52); if (!sp) return; const X = wp.sx(rz.x + rz.w / 2, rz.y + rz.h / 2), Y = wp.sy(rz.x + rz.w / 2, rz.y + rz.h / 2); ctx.drawImage(sp, X - sp.width / 2, Y - sp.height * .8); plate('الاحتياطي الرئيسي', X, Y - sp.height - 4, lv === 'FAR' ? 20 : 18); }
  /* ground texture: the supplied sand texture, laid on the terrain in world space (it moves and scales with the ground) and blended softly so the terrain colours stay */
  const TX = {}; for (const n of ['sand', 'rock']) { const i = new Image(); i.onload = () => { i._ok = 1; wp.markDirty(); }; i.src = A + 'tex-' + n + '.webp'; TX[n] = i; }
  let pat = null; const TILES = 26;                                                                      // one texture = 26 x 26 tiles
  const oldGround = skin.ground; skin.ground = (lv, b) => { if (!on()) return; const z = wp.cam.z, t = TX.sand;
    if (t && t._ok && z >= .06) { if (!pat) { pat = ctx.createPattern(t, 'repeat'); if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(TILES / 256)); } const a = Math.min(.55, (z - .06) * 3.5), D = wp.dpr();
      ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = a; ctx.setTransform(D * 32 * z, D * 16 * z, -D * 32 * z, D * 16 * z, D * wp.sx(0, 0), D * wp.sy(0, 0)); ctx.fillStyle = pat; ctx.fillRect(Math.max(0, b.x0), Math.max(0, b.y0), Math.min(wp.world.W, b.x1) - Math.max(0, b.x0), Math.min(wp.world.H, b.y1) - Math.max(0, b.y0)); ctx.restore(); }
    oldGround(lv, b); };
  wp.markDirty();
})();
