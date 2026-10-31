/* Oli - world preview renderer (isolated; uses its own camera, NOT the Phase A camera). Three detail levels over chunk bitmaps. */
(function () {
  'use strict';
  const OW = window.OliWorld, CFG = OW.CONFIG, qs = new URLSearchParams(location.search);
  const seed = qs.get('seed') ? +qs.get('seed') : 20260101;
  const world = OW.createWorld({ seed }), C = CFG.CHUNK, CX = CFG.CHUNKS_X, CY = CFG.CHUNKS_Y;
  const cv = document.getElementById('c'), ctx = cv.getContext('2d'), info = document.getElementById('info'), hud = document.getElementById('hud');
  const TC = []; for (const k in CFG.TERRAIN) TC[CFG.TERRAIN[k].id] = CFG.TERRAIN[k].color;
  const SR = world.regions.find(r => r.starter), cam = { x: SR.x0 + 160, y: SR.y0 + 160, z: 0.9 };      // centre in tile coords
  const ui = { reg: true, zone: true, dev: false, heat: false, sel: null, facility: 'well', probe: null };
  let DPR = Math.min(2, window.devicePixelRatio || 1), VW = 0, VH = 0, dirty = true, ready = 0, genQueue = [];
  const bmp = new Map(), heat = new Map();
  const level = () => world.levelForZoom(cam.z);

  // ---- demo discovery state (starter region): a little of every state, so the preview shows what each state looks like
  (function demo() {
    const f = world.regionSites(SR.id).filter(s => s.kind === 'FIELD'), d = world.regionSites(SR.id).filter(s => s.kind === 'DRY');
    f.forEach((s, i) => { if (i < 7) { world.discover(s.id); if (i < 5) { world.survey(s.id); if (i < 3) { world.makeDrillable(s.id); } } } });
    if (f[0]) { f[0].remainingReserve = 0; world.deplete(f[0].id); }
    d.slice(0, 2).forEach(s => { world.discover(s.id); world.survey(s.id); });
    // a few DISCOVERED hints in the neighbouring regions
    for (const rid of [SR.id - 6, SR.id - 1, SR.id + 1, SR.id + 6]) world.regionSites(rid).filter(s => s.kind === 'FIELD').slice(0, 2).forEach(s => world.discover(s.id));
  })();

  // ---- chunk bitmaps (1 px per tile, hillshaded); generated in time slices so the UI never freezes
  function E(x, y) { x = Math.max(0, Math.min(world.W - 1, x)); y = Math.max(0, Math.min(world.H - 1, y)); const ch = world.chunk((x / C) | 0, (y / C) | 0); return ch.elev[(y % C) * C + (x % C)] / 255; }
  function makeBitmap(cx, cy) {
    const ch = world.chunk(cx, cy), cvs = document.createElement('canvas'); cvs.width = cvs.height = C; const g = cvs.getContext('2d'), im = g.createImageData(C, C), d = im.data;
    for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
      const x = cx * C + i, y = cy * C + j, k = j * C + i, col = TC[ch.terrain[k]], e = ch.elev[k] / 255;
      const shade = ((E(x - 1, y) - E(x + 1, y)) + (E(x, y - 1) - E(x, y + 1))) * 5.5;            // light from the north-west
      const f = ch.terrain[k] === 5 ? 1 : 0.72 + e * 0.5 + shade + (OW.hash(seed, x, y) - .5) * .07;
      d[k * 4] = Math.max(0, Math.min(255, col[0] * f)); d[k * 4 + 1] = Math.max(0, Math.min(255, col[1] * f)); d[k * 4 + 2] = Math.max(0, Math.min(255, col[2] * f)); d[k * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0); return cvs;
  }
  function makeHeat(cx, cy) {
    const cvs = document.createElement('canvas'); cvs.width = cvs.height = C / 2; const g = cvs.getContext('2d'), im = g.createImageData(C / 2, C / 2), d = im.data;
    for (let j = 0; j < C / 2; j++) for (let i = 0; i < C / 2; i++) { const p = world.oilProbability(cx * C + i * 2, cy * C + j * 2), k = (j * C / 2 + i) * 4; d[k] = 255; d[k + 1] = 80 + 80 * (1 - p); d[k + 2] = 20; d[k + 3] = Math.min(210, p * 330); }
    g.putImageData(im, 0, 0); return cvs;
  }
  const getBmp = (cx, cy) => { const k = cy * CX + cx; let b = bmp.get(k); if (!b) { b = makeBitmap(cx, cy); bmp.set(k, b); ready++; } return b; };
  const getHeat = (cx, cy) => { const k = cy * CX + cx; let b = heat.get(k); if (!b) { b = makeHeat(cx, cy); heat.set(k, b); } return b; };
  for (let cy = 0; cy < CY; cy++) for (let cx = 0; cx < CX; cx++) genQueue.push([cx, cy]);
  // generate the centre first so the player sees something at once
  genQueue.sort((a, b) => Math.hypot(a[0] * C - cam.x, a[1] * C - cam.y) - Math.hypot(b[0] * C - cam.x, b[1] * C - cam.y));
  function pump() {
    const t0 = performance.now(); while (genQueue.length && performance.now() - t0 < 10) { const [cx, cy] = genQueue.shift(); getBmp(cx, cy); dirty = true; }
    const p = document.getElementById('prog'); if (genQueue.length) { p.textContent = 'Generating world… ' + Math.round(100 * ready / (CX * CY)) + '%'; p.style.display = (ready < 40) ? '' : 'none'; hud.dataset.gen = genQueue.length; } else { p.style.display = 'none'; hud.dataset.gen = 0; }
    requestAnimationFrame(pump);
  }

  // ---- camera / transforms
  const sx = (x, y) => VW / 2 + ((x - y) - (cam.x - cam.y)) * 32 * cam.z, sy = (x, y) => VH / 2 + ((x + y) - (cam.x + cam.y)) * 16 * cam.z;
  function toTile(px, py) { const u = (px - VW / 2) / (32 * cam.z) + (cam.x - cam.y), v = (py - VH / 2) / (16 * cam.z) + (cam.x + cam.y); return { x: (u + v) / 2, y: (v - u) / 2 }; }
  function bounds() { const a = [toTile(0, 0), toTile(VW, 0), toTile(0, VH), toTile(VW, VH)]; return { x0: Math.min(...a.map(p => p.x)), x1: Math.max(...a.map(p => p.x)), y0: Math.min(...a.map(p => p.y)), y1: Math.max(...a.map(p => p.y)) }; }
  function resize() { VW = innerWidth; VH = innerHeight; cv.width = VW * DPR; cv.height = VH * DPR; dirty = true; }
  addEventListener('resize', resize); resize();

  const SIZE = { SMALL: 5, MEDIUM: 8, LARGE: 12, MAJOR: 16 };
  function diamond(x, y, w, h, fill, stroke, lw, dash) {
    ctx.beginPath(); ctx.moveTo(sx(x, y), sy(x, y)); ctx.lineTo(sx(x + w, y), sy(x + w, y)); ctx.lineTo(sx(x + w, y + h), sy(x + w, y + h)); ctx.lineTo(sx(x, y + h), sy(x, y + h)); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); ctx.setLineDash([]); }
  }
  function ellipseIso(x, y, r, fill, stroke, lw, dash) {                                          // a circle in tile space = an ellipse on screen
    ctx.beginPath(); for (let a = 0; a <= 32; a++) { const t = a / 32 * Math.PI * 2, px = x + Math.cos(t) * r, py = y + Math.sin(t) * r; a ? ctx.lineTo(sx(px, py), sy(px, py)) : ctx.moveTo(sx(px, py), sy(px, py)); } ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); ctx.setLineDash([]); }
  }
  function derrick(px, py, s, col) {                                                                // small, resolution independent well glyph (original artwork)
    ctx.save(); ctx.translate(px, py); ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = col; ctx.lineWidth = Math.max(1, s * .12);
    ctx.beginPath(); ctx.arc(0, 0, s * .62, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * .28, s * .3); ctx.lineTo(0, -s * .38); ctx.lineTo(s * .28, s * .3); ctx.moveTo(-s * .16, s * .02); ctx.lineTo(s * .16, s * .02); ctx.stroke(); ctx.restore();
  }
  const SCOL = { DISCOVERED: '#e6c35a', SURVEYED: '#6ec1ff', DRILLABLE: '#4fd18b', DEPLETED: '#8b8b8b' };

  function decorate(b) {                                                                             // close level only: small hand-placed-looking detail, deterministic per tile
    const z = cam.z; if (z < 0.6) return; const x0 = Math.max(0, Math.floor(b.x0)), x1 = Math.min(world.W - 1, Math.ceil(b.x1)), y0 = Math.max(0, Math.floor(b.y0)), y1 = Math.min(world.H - 1, Math.ceil(b.y1));
    if ((x1 - x0) * (y1 - y0) > 9000) return;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const h = OW.hash(seed + 5, x, y); if (h > 0.2) continue; const t = world.tile(x, y), px = sx(x + .5, y + .5), py = sy(x + .5, y + .5), s = 7 * z;
      if (t.terrain === 'ROCKY_GROUND' || t.terrain === 'ROCKY_RIDGE') { ctx.fillStyle = 'rgba(40,30,22,.55)'; ctx.beginPath(); ctx.moveTo(px - s, py); ctx.lineTo(px - s * .3, py - s * .8); ctx.lineTo(px + s * .6, py - s * .5); ctx.lineTo(px + s, py); ctx.closePath(); ctx.fill(); }
      else if (t.terrain === 'SAND_DUNES') { ctx.strokeStyle = 'rgba(150,110,50,.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py + s * .5, s * 1.5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
      else if (t.terrain === 'LOW_VALLEY') { ctx.strokeStyle = 'rgba(70,90,40,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - s * .3, py - s); ctx.moveTo(px, py); ctx.lineTo(px + s * .3, py - s * .9); ctx.stroke(); }
      else if (t.terrain === 'FLAT_DESERT') { ctx.fillStyle = 'rgba(120,90,50,.35)'; ctx.fillRect(px - s * .4, py - s * .15, s * .5, s * .3); ctx.fillRect(px + s * .5, py + s * .2, s * .3, s * .2); }
      else if (t.terrain === 'WATER') { ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.moveTo(px - s, py); ctx.lineTo(px + s, py); ctx.stroke(); }
    }
  }

  function draw() {
    dirty = false; const lv = level(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#0c1015'; ctx.fillRect(0, 0, VW, VH);
    const b = bounds(), c0 = Math.max(0, Math.floor(b.x0 / C)), c1 = Math.min(CX - 1, Math.floor(b.x1 / C)), r0 = Math.max(0, Math.floor(b.y0 / C)), r1 = Math.min(CY - 1, Math.floor(b.y1 / C));
    // chunks: the iso affine transform maps tile (x,y) to screen; each 64x64 bitmap becomes a diamond. 1-tile overlap hides seams.
    ctx.imageSmoothingEnabled = lv === 'FAR';
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const bm = bmp.get(cy * CX + cx); if (!bm) continue; ctx.save(); ctx.setTransform(DPR * 32 * cam.z, DPR * 16 * cam.z, -DPR * 32 * cam.z, DPR * 16 * cam.z, DPR * sx(cx * C, cy * C), DPR * sy(cx * C, cy * C));
      ctx.drawImage(bm, 0, 0, C, C, 0, 0, C + .6, C + .6);
      if (ui.heat) { const h = getHeat(cx, cy); ctx.imageSmoothingEnabled = true; ctx.drawImage(h, 0, 0, C / 2, C / 2, 0, 0, C, C); ctx.imageSmoothingEnabled = lv === 'FAR'; }
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = true;
    if (lv === 'CLOSE') { decorate(b); if (cam.z > 1.1) { ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1; ctx.beginPath(); for (let x = Math.floor(b.x0); x <= b.x1; x++) { ctx.moveTo(sx(x, b.y0), sy(x, b.y0)); ctx.lineTo(sx(x, b.y1), sy(x, b.y1)); } for (let y = Math.floor(b.y0); y <= b.y1; y++) { ctx.moveTo(sx(b.x0, y), sy(b.x0, y)); ctx.lineTo(sx(b.x1, y), sy(b.x1, y)); } ctx.stroke(); } }
    // regions
    if (ui.reg) {
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = (lv === 'FAR' ? '600 13px' : '600 12px') + ' system-ui';
      for (const r of world.regions) { diamond(r.x0, r.y0, r.w, r.h, null, 'rgba(255,255,255,.28)', 1, [6, 5]); if (lv !== 'CLOSE') { const m = r.x0 + r.w / 2, n = r.y0 + r.h / 2, px = sx(m, n), py = sy(m, n); if (px > -60 && px < VW + 60 && py > -20 && py < VH + 20) { ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3; const lab = lv === 'FAR' && cam.z < .012 ? r.name : r.name + ' · ' + r.richness; ctx.strokeText(lab, px, py); ctx.fillText(lab, px, py); if (lv === 'MEDIUM') { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '11px system-ui'; ctx.fillText(r.kind, px, py + 14); ctx.font = '600 12px system-ui'; } } } }
    }
    if (ui.zone && lv !== 'FAR') for (const r of world.regions) { const x0 = r.x0, y0 = r.y0; if (x0 > b.x1 || y0 > b.y1 || x0 + r.w < b.x0 || y0 + r.h < b.y0) continue; for (const z of world.refineryZones(r.id)) { diamond(z.x, z.y, z.w, z.h, 'rgba(150,90,200,.18)', '#b27be0', 1.5, [7, 4]); diamond(z.x - 8, z.y - 8, z.w + 16, z.h + 16, null, 'rgba(178,123,224,.45)', 1, [2, 4]); if (lv === 'MEDIUM' || cam.z < 1.2) { ctx.fillStyle = '#d6b4f5'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('REFINERY ZONE', sx(z.x + z.w / 2, z.y + z.h / 2), sy(z.x + z.w / 2, z.y + z.h / 2)); } } }
    // oil sites. Player view: only what visibleInfo() allows. Dev view: ghost markers for everything.
    for (const r of world.regions) {
      if (r.x0 > b.x1 + 30 || r.y0 > b.y1 + 30 || r.x0 + r.w < b.x0 - 30 || r.y0 + r.h < b.y0 - 30) continue;
      for (const s of world.regionSites(r.id)) {
        if (s.x < b.x0 - 20 || s.x > b.x1 + 20 || s.y < b.y0 - 20 || s.y > b.y1 + 20) continue;
        const st = world.stateOf(s.id), vi = world.visibleInfo(s.id), sel = ui.sel === s.id;
        if (!vi) { if (ui.dev) { ellipseIso(s.x, s.y, s.radius, s.kind === 'DRY' ? 'rgba(160,160,160,.12)' : 'rgba(255,80,40,.18)', s.kind === 'DRY' ? '#9a9a9a' : '#ff6a3d', 1, [3, 3]); } continue; }
        if (st === 'DISCOVERED') { const i = vi.indicator; ellipseIso(i.x, i.y, i.r, 'rgba(230,195,90,.10)', SCOL.DISCOVERED, sel ? 2.5 : 1.5, [5, 4]); if (lv !== 'FAR') { ctx.fillStyle = SCOL.DISCOVERED; ctx.font = '600 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', sx(i.x, i.y), sy(i.x, i.y) + 4); } continue; }
        const col = s.kind === 'DRY' ? '#777' : SCOL[st];
        ellipseIso(s.x, s.y, s.radius, s.kind === 'DRY' ? 'rgba(90,90,90,.08)' : st === 'DEPLETED' ? 'rgba(60,60,60,.16)' : 'rgba(30,20,10,.12)', col, sel ? 3 : 1.6, st === 'SURVEYED' ? [6, 3] : st === 'DRILLABLE' ? null : [2, 3]);
        const sz = Math.max(10, Math.min(22, cam.z * 26)) * (lv === 'FAR' ? .75 : 1), px = sx(s.x, s.y), py = sy(s.x, s.y);
        if (s.kind === 'FIELD') {
          derrick(px, py, sz, col);
          if (lv !== 'FAR') { ctx.fillStyle = '#fff'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3; const t = s.type[0] + s.type.slice(1).toLowerCase() + ' · ' + st.toLowerCase(); ctx.strokeText(t, px, py - sz - 4); ctx.fillText(t, px, py - sz - 4); }
        } else { ctx.strokeStyle = '#999'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px - 6, py - 6); ctx.lineTo(px + 6, py + 6); ctx.moveTo(px + 6, py - 6); ctx.lineTo(px - 6, py + 6); ctx.stroke(); if (lv !== 'FAR') { ctx.fillStyle = '#ccc'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('dry hole', px, py - 12); } }
      }
    }
    // facility probe (footprint to scale)
    if (ui.probe && lv !== 'FAR') { const p = ui.probe, f = CFG.FACILITIES[ui.facility]; diamond(p.x, p.y, f.fp[0], f.fp[1], p.res.ok ? 'rgba(80,220,120,.45)' : 'rgba(240,70,60,.45)', p.res.ok ? '#6dff9a' : '#ff6b60', 2); if (!p.res.ok) { const cx = sx(p.x + f.fp[0] / 2, p.y + f.fp[1] / 2), cy = sy(p.x + f.fp[0] / 2, p.y + f.fp[1] / 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx - 7, cy - 7); ctx.lineTo(cx + 7, cy + 7); ctx.moveTo(cx + 7, cy - 7); ctx.lineTo(cx - 7, cy + 7); ctx.stroke(); } }
    // scale ruler (tiles) + hud
    const px50 = 50 * 32 * cam.z * 2; ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(10, VH - 4, 1, 1);
    hud.textContent = lv + '  zoom ' + cam.z.toFixed(3) + '  view ' + Math.round(b.x1 - b.x0) + ' tiles  chunks ' + ready + '/' + (CX * CY) + '  world ' + world.W + 'x' + world.H + ' (' + world.scale().toFixed(1) + 'x map)';
    document.querySelectorAll('[data-z]').forEach(e => e.classList.toggle('on', e.dataset.z === lv));
  }

  // ---- input (preview-only camera: drag to pan, wheel / pinch to zoom, tap to inspect)
  const ptrs = new Map(); let last = null, moved = 0, pinch = null;
  const clampZ = z => Math.max(CFG.ZOOM.MIN, Math.min(CFG.ZOOM.MAX, z));
  function zoomAt(px, py, nz) { const t = toTile(px, py); cam.z = clampZ(nz); const t2 = toTile(px, py); cam.x += t.x - t2.x; cam.y += t.y - t2.y; keepIn(); dirty = true; }
  function keepIn() { cam.x = Math.max(0, Math.min(world.W, cam.x)); cam.y = Math.max(0, Math.min(world.H, cam.y)); }
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; if (ptrs.size === 2) { const [a, b2] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b2.x, a.y - b2.y), z: cam.z }; } });
  cv.addEventListener('pointermove', e => { const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size >= 2 && pinch) { const [a, b2] = [...ptrs.values()], d = Math.hypot(a.x - b2.x, a.y - b2.y); zoomAt((a.x + b2.x) / 2, (a.y + b2.y) / 2, pinch.z * d / pinch.d); }
    else if (ptrs.size === 1) { const t = toTile(e.clientX, e.clientY), t0 = toTile(e.clientX - dx, e.clientY - dy); cam.x += t0.x - t.x; cam.y += t0.y - t.y; keepIn(); dirty = true; } });
  const up = e => { const was = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (was && ptrs.size === 0 && moved < 8) tap(e.clientX, e.clientY); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinch = null; });
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, cam.z * Math.exp(-e.deltaY * .0015)); }, { passive: false });

  function tap(px, py) {
    const t = toTile(px, py), x = Math.floor(t.x), y = Math.floor(t.y); if (!world.inb(x, y)) return;
    let hit = null; for (const s of world.sitesNear(x, y, 3)) { const vi = world.visibleInfo(s.id); const rr = vi && vi.indicator ? vi.indicator : s; const cxs = vi && vi.indicator ? vi.indicator.x : s.x, cys = vi && vi.indicator ? vi.indicator.y : s.y; const rad = vi && vi.indicator ? vi.indicator.r : s.radius; if ((vi || ui.dev) && Math.hypot(cxs - t.x, cys - t.y) <= rad + 1) { hit = s; break; } }
    const tl = world.tile(x, y), res = world.canBuildAt(ui.facility, x, y); ui.probe = { x, y, res }; ui.sel = hit ? hit.id : null; dirty = true; showInfo(tl, res, hit);
  }
  const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : '' + n;
  function showInfo(tl, res, hit) {
    const T = CFG.TERRAIN[tl.terrain], reg = world.regions[tl.region]; let h = '<h4>' + T.label + ' · region ' + reg.name + ' (' + reg.richness + ', ' + reg.kind + ')</h4><span class="k">tile ' + tl.x + ',' + tl.y + ' · elevation level ' + tl.level + '/7 · slope ' + tl.slope + ' · build cost ×' + T.buildCost + ' · oil odds ×' + T.oilMod + '</span><br>';
    const f = CFG.FACILITIES[ui.facility]; h += '<b>' + ui.facility + '</b> ' + f.fp.join('×') + ': ' + (res.ok ? '<span style="color:#6dff9a">can build</span> (cost ×' + res.costModifier + ')' : '<span style="color:#ff8a80">cannot build: ' + res.reason + '</span>');
    if (hit) { const vi = world.visibleInfo(hit.id), st = world.stateOf(hit.id); h += '<hr style="border:0;border-top:1px solid #33404f"><b>Oil site · ' + st + '</b><br>';
      if (!vi) h += 'Developer view only: the player does not know this site yet.<br><span class="k">' + hit.kind + ' ' + hit.type + ' · reserve ' + fmt(hit.initialReserve) + ' · depth ' + hit.depth + ' m · pressure ' + hit.pressurePotential + ' · quality ' + hit.quality + '</span>';
      else if (st === 'DISCOVERED') h += 'Promising geology. Not surveyed: size, type and depth unknown.';
      else if (vi.dry) h += 'Survey result: no commercial oil.';
      else { h += vi.type + ' field · estimated ' + fmt(vi.estimatedReserve) + ' bbl (range ' + fmt(vi.reserveRange[0]) + '–' + fmt(vi.reserveRange[1]) + ') · pressure ' + vi.pressureClass + ' · quality ' + vi.quality + ' · success ' + Math.round(vi.probability * 100) + '%'; if (vi.depth) h += '<br>depth ' + vi.depth + ' m · drilling estimate ' + vi.estimatedCost + ' (not charged) · remaining ' + fmt(vi.remainingReserve); }
      const nxt = { UNDISCOVERED: 'discover', DISCOVERED: 'survey', SURVEYED: 'makeDrillable', DRILLABLE: 'deplete' }[st]; if (nxt && nxt !== 'deplete') h += '<div class="row"><button data-adv="' + nxt + '" data-id="' + hit.id + '">Advance → ' + nxt + '</button></div>'; }
    info.innerHTML = h;
  }
  info.addEventListener('click', e => { const b = e.target.closest('[data-adv]'); if (!b) return; const r = world[b.dataset.adv](b.dataset.id); dirty = true; const s = world.siteById(b.dataset.id); showInfo(world.tile(s.x, s.y), ui.probe.res, s); if (!r.ok) info.insertAdjacentHTML('beforeend', '<br><span class="k">refused: ' + r.reason + '</span>'); });

  // ---- buttons
  const zlevels = { FAR: 0.012, MEDIUM: 0.35, CLOSE: 1.0 };
  function setLevel(n) { zoomAt(VW / 2, VH / 2, zlevels[n]); }
  document.querySelectorAll('[data-z]').forEach(b => b.onclick = () => setLevel(b.dataset.z));
  const tog = (id, key) => { const el = document.getElementById(id); el.onclick = () => { ui[key] = !ui[key]; el.classList.toggle('on', ui[key]); dirty = true; }; };
  tog('tReg', 'reg'); tog('tZone', 'zone'); tog('tDev', 'dev'); tog('tHeat', 'heat');
  const fac = document.getElementById('fac'); for (const k in CFG.FACILITIES) fac.insertAdjacentHTML('beforeend', '<option value="' + k + '">' + k + ' ' + CFG.FACILITIES[k].fp.join('×') + '</option>'); fac.onchange = () => { ui.facility = fac.value; if (ui.probe) ui.probe.res = world.canBuildAt(ui.facility, ui.probe.x, ui.probe.y); dirty = true; };

  function loop() { if (dirty) draw(); requestAnimationFrame(loop); }
  // test / debug handle
  window.__wp = { world, cam, ui, setLevel, goto(x, y, z) { cam.x = x; cam.y = y; if (z) cam.z = clampZ(z); keepIn(); dirty = true; }, tap, level, ready: () => ready, genLeft: () => genQueue.length, draw, toTile, sx, sy };
  const sp = qs.get('x'); if (sp) { cam.x = +qs.get('x'); cam.y = +qs.get('y'); cam.z = clampZ(+qs.get('z') || .9); }
  if (qs.get('dev')) { ui.dev = true; document.getElementById('tDev').classList.add('on'); }
  requestAnimationFrame(pump); requestAnimationFrame(loop);
})();
