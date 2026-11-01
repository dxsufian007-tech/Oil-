/* Oli - world preview renderer (isolated; own camera, NOT the Phase A camera). Original code. Three detail levels:
   FAR    z < 0.2  : one pre-composited overview image (z < 0.06) or 1 px/tile chunk images (only the visible chunks are drawn)
   MEDIUM 0.2-0.6  : 2 px/tile chunk images, fields, zones, tracks, labels
   CLOSE  >= 0.6   : 3 px/tile chunk images + ground detail, wells, footprints to scale
   Colours are interpolated between tiles (worldmap.renderChunkRGBA) so no tile grid shows. */
(function () {
  'use strict';
  const OW = window.OliWorld, CFG = OW.CONFIG, qs = new URLSearchParams(location.search);
  const seed = qs.get('seed') ? +qs.get('seed') : 20260101;
  const world = OW.createWorld({ seed, external: true }), C = CFG.CHUNK, CX = CFG.CHUNKS_X, CY = CFG.CHUNKS_Y;
  const cv = document.getElementById('c'), ctx = cv.getContext('2d'), info = document.getElementById('info'), hud = document.getElementById('hud');
  const SR = world.regions.find(r => r.starter), cam = { x: SR.x0 + 160, y: SR.y0 + 160, z: 0.9 };
  const DEVUI = /[?&]lab=1/.test(location.search) || (function () { try { return localStorage.getItem('oli-labui') === '1'; } catch (_) { return false; } })(), ST_AR = { DRILLABLE: 'جاهز للحفر', PRODUCING: 'ينتج', DISCOVERED: 'مكتشف', SURVEYED: 'تم مسحه', UNDISCOVERED: '' };
  const ui = { reg: DEVUI, zone: true, dev: false, heat: false, sel: null, facility: 'well', probe: null, scale: false };
  let DPR = Math.min(+qs.get('dpr') || 2, window.devicePixelRatio || 1), VW = 0, VH = 0, dirty = true;
  const level = () => world.levelForZoom(cam.z);
  const stats = { imgs: 0, regions: 0 };

  // ---- engines: the world is computed in Web Workers (images + overview in one, region data in another). Fallback (no Worker, or ?noworker): the same code on this thread, sliced with setTimeout.
  const USE_WORKER = !!window.Worker && !qs.get('noworker');
  function makeEngine(onReply) {
    if (USE_WORKER) { const w = new Worker('world-worker.js'); w.onmessage = e => onReply(e.data); w.onerror = e => { stats.workerError = String(e.message || e); }; return { post: (m, tr) => w.postMessage(m, tr || []) }; }
    const full = OW.createWorld({ seed }); let inited = true;
    return { post: m => setTimeout(() => {
      if (m.t === 'init') return onReply({ t: 'ready' });
      if (m.t === 'overview') { const o = full.renderOverview(m.step); onReply({ t: 'overview', w: o.w, h: o.h, step: o.step, rgba: o.rgba }); }
      else if (m.t === 'img') { const rgba = full.renderChunkRGBA(m.cx, m.cy, m.k), ch = full.exportChunk(m.cx, m.cy); onReply({ t: 'img', cx: m.cx, cy: m.cy, k: m.k, rgba, chunk: ch }); }
      else if (m.t === 'region') onReply({ t: 'region', d: full.regionData(m.rid) });
      else if (m.t === 'heat') { const n = 32, a = new Uint8ClampedArray(n * n * 4); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const p = full.oilProbability(m.cx * 64 + i * 2, m.cy * 64 + j * 2), q = (j * n + i) * 4; a[q] = 255; a[q + 1] = 80 + 80 * (1 - p); a[q + 2] = 20; a[q + 3] = Math.min(210, p * 330); } onReply({ t: 'heat', cx: m.cx, cy: m.cy, rgba: a }); }
    }, 0) };
  }
  // images (k px per tile): FAR chunk images 1 px/tile, MEDIUM 2, CLOSE 3 - small caches, built on demand
  const lo = new Map(), hi = { 2: new Map(), 3: new Map() }, MAXC = { 1: 150, 2: 60, 3: 30 }, heat = new Map();
  const imgOf = k => k === 1 ? lo : hi[k];
  function toCanvas(rgba, w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0); return c; }
  const OV_Z = 0.025, OV_W = Math.round((CFG.CHUNKS_X + CFG.CHUNKS_Y) * C * 32 * OV_Z), OV_H = Math.round((CFG.CHUNKS_X + CFG.CHUNKS_Y) * C * 16 * OV_Z), OV_EX = CFG.CHUNKS_Y * C * 32 * OV_Z;
  const ov = document.createElement('canvas'); ov.width = OV_W; ov.height = OV_H; const ovg = ov.getContext('2d'); let ovStep = 99;
  const need = new Map(), regNeed = new Set(), busy = { img: false, reg: false }, DEMO_REGIONS = [SR.id, SR.id - 6, SR.id - 1, SR.id + 1, SR.id + 6]; let demoDone = false, ready = { img: false, reg: false }, ovQueue = [16, 8, 4];
  function onImg(m) {
    if (m.t === 'ready') { ready.img = true; return; }
    busy.img = false; dirty = true;
    if (m.t === 'overview') { ovStep = m.step; const c = toCanvas(m.rgba, m.w, m.h); ovg.save(); ovg.setTransform(1, 0, 0, 1, 0, 0); ovg.clearRect(0, 0, OV_W, OV_H); ovg.setTransform(m.step * 32 * OV_Z, m.step * 16 * OV_Z, -m.step * 32 * OV_Z, m.step * 16 * OV_Z, OV_EX, 0); ovg.imageSmoothingEnabled = true; ovg.drawImage(c, 0, 0, m.w, m.h, 0, 0, m.w + .7, m.h + .7); ovg.restore(); stats.overviewMs = Math.round(performance.now()); }
    else if (m.t === 'img') { const key = m.cy * CX + m.cx, mp = imgOf(m.k); mp.set(key, toCanvas(m.rgba, C * m.k, C * m.k)); while (mp.size > MAXC[m.k]) mp.delete(mp.keys().next().value); world.injectChunk(m.chunk); need.delete(m.k + ':' + key); stats.imgs++; stats.lastImgAt = performance.now(); }
    else if (m.t === 'heat') { heat.set(m.cy * CX + m.cx, toCanvas(m.rgba, 32, 32)); need.delete('h:' + (m.cy * CX + m.cx)); }
  }
  function onReg(m) {
    if (m.t === 'ready') { ready.reg = true; return; }
    busy.reg = false; dirty = true; if (m.t === 'region') { world.injectRegion(m.d); regNeed.delete(m.d.rid); stats.regions++; if (!demoDone && DEMO_REGIONS.every(r => world.hasRegion(r))) { applyDemo(); } if (DEMOALL) openAll(m.d.rid); }
  }
  const imgEng = makeEngine(onImg), regEng = makeEngine(onReg); imgEng.post({ t: 'init', seed }); regEng.post({ t: 'init', seed });
  /* DEMO build: every oil field of every region is drillable, every region is unlocked, all regions load (flag from the demo APK, ?demo=1 or localStorage oli-demo=1) */
  const DEMOALL = !!(window.OLI_DEMO || /[?&]demo=1/.test(location.search) || (function () { try { return localStorage.getItem('oli-demo') === '1'; } catch (_) { return false; } })()); window.OLI_DEMO = DEMOALL;
  const openAll = rid => { const R = world.regions[rid]; if (R) R.unlocked = true; for (const q of world.regionSites(rid)) if (q.kind === 'FIELD') { let g = 0; while (['UNDISCOVERED', 'DISCOVERED', 'SURVEYED'].includes(world.stateOf(q.id)) && g++ < 4) { const st = world.stateOf(q.id); (st === 'UNDISCOVERED' ? world.discover : st === 'DISCOVERED' ? world.survey : world.makeDrillable)(q.id); } } };
  for (const r of DEMO_REGIONS) regNeed.add(r); if (DEMOALL) for (const r of world.regions) regNeed.add(r.id);
  function applyDemo() {                                   // a little of every discovery state in the starter region so the preview shows each look
    demoDone = true; const all = world.regionSites(SR.id), f = all.filter(s => s.kind === 'FIELD'), d = all.filter(s => s.kind === 'DRY');
    f.forEach((s, i) => { if (i < 8) { world.discover(s.id); if (i < 6) { world.survey(s.id); if (i < 4) { world.makeDrillable(s.id); if (i < 3) world.startProducing(s.id); } } } });
    if (f[0] && !DEMOALL) { f[0].remainingReserve = 0; world.deplete(f[0].id); }
    d.slice(0, 2).forEach(s => { world.discover(s.id); world.survey(s.id); });
    for (const rid of [SR.id - 6, SR.id - 1, SR.id + 1, SR.id + 6]) world.regionSites(rid).filter(s => s.kind === 'FIELD').slice(0, 2).forEach(s => world.discover(s.id));
    stats.demoMs = Math.round(performance.now());
  }
  function schedule() {                                    // one job at a time per engine, nearest to the screen centre first; the main thread only posts messages
    if (ready.img && !busy.img) {
      if (ovQueue.length) { busy.img = true; imgEng.post({ t: 'overview', step: ovQueue.shift() }); }
      else { let best = null, bd = 1e12; for (const [k, v] of need) { const d = Math.hypot(v.cx * C + C / 2 - cam.x, v.cy * C + C / 2 - cam.y); if (d < bd) { bd = d; best = [k, v]; } } if (best) { busy.img = true; if (best[1].t === 'heat') imgEng.post({ t: 'heat', cx: best[1].cx, cy: best[1].cy }); else imgEng.post({ t: 'img', cx: best[1].cx, cy: best[1].cy, k: best[1].k }); } }
    }
    if (ready.reg && !busy.reg && regNeed.size) { let best = null, bd = 1e12; for (const r of regNeed) { const R = world.regions[r], d = Math.hypot(R.x0 + R.w / 2 - cam.x, R.y0 + R.h / 2 - cam.y) - (DEMO_REGIONS.includes(r) && !demoDone ? 1e6 : 0); if (d < bd) { bd = d; best = r; } } if (best != null) { busy.reg = true; regEng.post({ t: 'region', rid: best }); } }
    if (!stats.genDoneMs && !ovQueue.length && !busy.img && demoDone) stats.genDoneMs = Math.round(performance.now());
    const p = document.getElementById('prog'); p.style.display = (ovStep === 99) ? '' : 'none'; p.textContent = 'جارٍ تجهيز العالم…';
    requestAnimationFrame(schedule);
  }
  const wantImg = (cx, cy, k) => { const key = cy * CX + cx; if (!imgOf(k).has(key)) { need.set(k + ':' + key, { cx, cy, k }); return false; } return true; };
  const wantRegion = rid => { if (!world.hasRegion(rid)) regNeed.add(rid); };
  const pendingJobs = () => ovQueue.length + need.size + regNeed.size + (busy.img || busy.reg ? 1 : 0);

  // ---- camera / transforms
  const sx = (x, y) => VW / 2 + ((x - y) - (cam.x - cam.y)) * 32 * cam.z, sy = (x, y) => VH / 2 + ((x + y) - (cam.x + cam.y)) * 16 * cam.z;
  function toTile(px, py) { const u = (px - VW / 2) / (32 * cam.z) + (cam.x - cam.y), v = (py - VH / 2) / (16 * cam.z) + (cam.x + cam.y); return { x: (u + v) / 2, y: (v - u) / 2 }; }
  function bounds() { const a = [toTile(0, 0), toTile(VW, 0), toTile(0, VH), toTile(VW, VH)]; return { x0: Math.min(...a.map(p => p.x)), x1: Math.max(...a.map(p => p.x)), y0: Math.min(...a.map(p => p.y)), y1: Math.max(...a.map(p => p.y)) }; }
  function resize() { VW = innerWidth; VH = innerHeight; cv.width = VW * DPR; cv.height = VH * DPR; dirty = true; }
  addEventListener('resize', resize); resize();

  function poly(pts, fill, stroke, lw, dash) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); ctx.setLineDash([]); } }
  const dia = (x, y, w, h) => [[sx(x, y), sy(x, y)], [sx(x + w, y), sy(x + w, y)], [sx(x + w, y + h), sy(x + w, y + h)], [sx(x, y + h), sy(x, y + h)]];
  const diamond = (x, y, w, h, fill, stroke, lw, dash) => poly(dia(x, y, w, h), fill, stroke, lw, dash);
  function ellipseIso(x, y, r, fill, stroke, lw, dash) { ctx.beginPath(); for (let a = 0; a <= 32; a++) { const t = a / 32 * Math.PI * 2, px = x + Math.cos(t) * r, py = y + Math.sin(t) * r; a ? ctx.lineTo(sx(px, py), sy(px, py)) : ctx.moveTo(sx(px, py), sy(px, py)); } ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); ctx.setLineDash([]); } }
  function derrick(px, py, s, col) { ctx.save(); ctx.translate(px, py); ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = col; ctx.lineWidth = Math.max(1, s * .12); ctx.beginPath(); ctx.arc(0, 0, s * .62, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * .28, s * .3); ctx.lineTo(0, -s * .38); ctx.lineTo(s * .28, s * .3); ctx.moveTo(-s * .16, s * .02); ctx.lineTo(s * .16, s * .02); ctx.stroke(); ctx.restore(); }
  const SCOL = { DISCOVERED: '#e6c35a', SURVEYED: '#6ec1ff', DRILLABLE: '#4fd18b', PRODUCING: '#ffb347', DEPLETED: '#8b8b8b' };

  // ---- ground detail (CLOSE only): sparse rocks, ripples, scrub - light, deterministic, drawn only for the visible tiles
  function decorate(b) {
    const z = cam.z; if (z < 0.6) return; const x0 = Math.max(0, Math.floor(b.x0)), x1 = Math.min(world.W - 1, Math.ceil(b.x1)), y0 = Math.max(0, Math.floor(b.y0)), y1 = Math.min(world.H - 1, Math.ceil(b.y1)); if ((x1 - x0) * (y1 - y0) > 9000) return;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const h = OW.hash(seed + 5, x, y); if (h > 0.22) continue; const t = world.tile(x, y); if (!t) continue; const jx = OW.hash(seed + 6, x, y) - .5, jy = OW.hash(seed + 7, x, y) - .5, px = sx(x + .5 + jx * .8, y + .5 + jy * .8), py = sy(x + .5 + jx * .8, y + .5 + jy * .8), s = 6 * z;
      if (t.terrain === 'ROCKY_GROUND' || t.terrain === 'ROCKY_PLATEAU') { const big = h < .05; ctx.fillStyle = 'rgba(30,22,16,.28)'; ctx.beginPath(); ctx.ellipse(px + s * .3, py + s * .15, s * (big ? 1.5 : .9), s * (big ? .6 : .35), 0, 0, 7); ctx.fill(); ctx.fillStyle = big ? 'rgba(120,98,78,.95)' : 'rgba(140,114,90,.9)'; ctx.beginPath(); ctx.moveTo(px - s, py); ctx.lineTo(px - s * .35, py - s * (big ? 1.5 : .8)); ctx.lineTo(px + s * .6, py - s * (big ? 1.1 : .55)); ctx.lineTo(px + s, py); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,240,220,.18)'; ctx.beginPath(); ctx.moveTo(px - s * .35, py - s * (big ? 1.5 : .8)); ctx.lineTo(px + s * .6, py - s * (big ? 1.1 : .55)); ctx.lineTo(px, py - s * .2); ctx.closePath(); ctx.fill(); }
      else if (t.terrain === 'SAND_DUNES') { ctx.strokeStyle = 'rgba(150,108,52,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py + s * .5, s * 1.8, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
      else if (t.terrain === 'VALLEY') { ctx.strokeStyle = 'rgba(88,92,48,.8)'; ctx.lineWidth = 1; ctx.beginPath(); for (let q = -1; q <= 1; q++) { ctx.moveTo(px + q * s * .35, py); ctx.lineTo(px + q * s * .6, py - s * (.9 + q * q * -.2)); } ctx.stroke(); }
      else if (t.terrain === 'FLAT_DESERT') { ctx.fillStyle = 'rgba(120,88,50,.30)'; ctx.fillRect(px - s * .4, py - s * .12, s * .5, s * .22); ctx.fillRect(px + s * .5, py + s * .2, s * .3, s * .16); }
    }
  }

  // ---- scale chart: every facility drawn to its true footprint and a height, in one row, next to a well and a pipe
  const FAC_ORDER = ['well', 'pump', 'valve', 'pumpStation', 'tank', 'crudeStorage', 'gasStorage', 'dieselStorage', 'gasolineStorage', 'separation', 'power', 'exportTerminal', 'hq', 'refinery'];
  function shade(c, f) { return 'rgb(' + c.map(v => Math.max(0, Math.min(255, Math.round(v * f)))).join(',') + ')'; }
  function box(x, y, w, h, hz, col) {
    const H = hz * 36 * cam.z, A = [sx(x, y), sy(x, y)], B = [sx(x + w, y), sy(x + w, y)], Cc = [sx(x + w, y + h), sy(x + w, y + h)], D = [sx(x, y + h), sy(x, y + h)], up = p => [p[0], p[1] - H];
    poly([D, Cc, up(Cc), up(D)], shade(col, .72), 'rgba(0,0,0,.35)', 1); poly([B, Cc, up(Cc), up(B)], shade(col, .86), 'rgba(0,0,0,.35)', 1); poly([up(A), up(B), up(Cc), up(D)], shade(col, 1.08), 'rgba(0,0,0,.35)', 1);
  }
  function cyl(x, y, w, h, hz, col) {
    const cxT = x + w / 2, cyT = y + h / 2, r = Math.min(w, h) / 2 * .94, X = sx(cxT, cyT), Y = sy(cxT, cyT), rx = r * 32 * 1.4142 * cam.z, ry = r * 16 * 1.4142 * cam.z, H = hz * 36 * cam.z;
    ctx.fillStyle = shade(col, .8); ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(X, Y, rx, ry, 0, 0, 7); ctx.fill(); ctx.fillRect(X - rx, Y - H, rx * 2, H); ctx.strokeRect(X - rx, Y - H, rx * 2, H);
    const g = ctx.createLinearGradient(X - rx, 0, X + rx, 0); g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.25)'); ctx.fillStyle = g; ctx.fillRect(X - rx, Y - H, rx * 2, H);
    ctx.fillStyle = shade(col, 1.12); ctx.beginPath(); ctx.ellipse(X, Y - H, rx, ry, 0, 0, 7); ctx.fill(); ctx.stroke();
  }
  function sphere(x, y, w, h, hz, col) { const X = sx(x + w / 2, y + h / 2), Y = sy(x + w / 2, y + h / 2), r = Math.min(w, h) / 2 * 32 * 1.4142 * cam.z * .9, H = r * 1.0; const g = ctx.createRadialGradient(X - r * .3, Y - H - r * .3, r * .1, X, Y - H, r); g.addColorStop(0, shade(col, 1.3)); g.addColorStop(1, shade(col, .65)); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(X, Y, r, r * .5, 0, 0, 7); ctx.fill(); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y - H, r, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke(); }
  function derrickBig(x, y, w, h, hz, col) { const X = sx(x + w / 2, y + h / 2), Y = sy(x + w / 2, y + h / 2), H = hz * 36 * cam.z, bw = 12 * cam.z * 1.1; ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(X, Y, bw * 1.2, bw * .6, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = Math.max(1, 1.6 * cam.z); ctx.beginPath(); ctx.moveTo(X - bw, Y); ctx.lineTo(X, Y - H); ctx.lineTo(X + bw, Y); ctx.moveTo(X - bw * .55, Y - H * .45); ctx.lineTo(X + bw * .55, Y - H * .45); ctx.moveTo(X - bw * .75, Y - H * .22); ctx.lineTo(X + bw * .75, Y - H * .22); ctx.stroke(); ctx.fillStyle = col; ctx.fillRect(X - 2 * cam.z, Y - H - 3 * cam.z, 4 * cam.z, 5 * cam.z); }
  function pumpJack(x, y, w, h, hz, col) { box(x + .15, y + .15, .7, .7, .35, [90, 90, 94]); const X = sx(x + .5, y + .5), Y = sy(x + .5, y + .5) - 14 * cam.z; ctx.strokeStyle = '#d98b1e'; ctx.lineWidth = 3 * cam.z; ctx.beginPath(); ctx.moveTo(X - 14 * cam.z, Y + 4 * cam.z); ctx.lineTo(X + 12 * cam.z, Y - 5 * cam.z); ctx.stroke(); ctx.beginPath(); ctx.arc(X - 14 * cam.z, Y + 4 * cam.z, 3 * cam.z, 0, 7); ctx.fillStyle = '#d98b1e'; ctx.fill(); }
  function towers(x, y, w, h, hz, col) { box(x, y, w, h, .25, [120, 120, 124]); const n = Math.max(2, Math.floor(w)); for (let i = 0; i < n; i++) cyl(x + .5 + i * (w - 1) / Math.max(1, n - 1) - .35, y + h / 2 - .35, .7, .7, hz * (.7 + .3 * ((i * 7) % 3) / 2), [170, 172, 176]); }
  function refinery(x, y, w, h, hz, col) { box(x, y, w, h, .12, [128, 124, 118]); for (let i = 0; i < 5; i++) cyl(x + .6 + i * 1.3, y + 1.0, .9, .9, 1.1 + (i % 3) * .5, [188, 190, 194]); for (let i = 0; i < 3; i++) cyl(x + 1 + i * 2.4, y + 3.4, 1.2, 1.2, 1.2, [200, 160, 90]); cyl(x + w - 1.7, y + h - 2, 1.0, 1.0, 3.0, [160, 160, 165]); box(x + .5, y + h - 1.4, 2.2, .9, .8, [150, 110, 90]); }
  function stack(x, y, w, h, hz, col) { box(x, y, w, h, .9, [150, 150, 154]); cyl(x + w - 1.1, y + h - 1.1, .8, .8, hz, [190, 186, 180]); }
  const SHAPE = { derrick: derrickBig, pump: pumpJack, valve: (x, y, w, h, hz, c) => { box(x + .3, y + .3, .4, .4, .3, [150, 40, 40]); }, box: box, cyl: cyl, sphere: sphere, tower: towers, refinery: refinery, stack: stack };
  const FCOL = { EXTRACTION: [200, 150, 60], TRANSPORT: [128, 140, 150], STORAGE: [188, 188, 190], PROCESSING: [170, 172, 176], INFRASTRUCTURE: [150, 140, 126], CORPORATE: [140, 150, 160] };
  function drawScaleChart() {
    const b0 = { x: Math.round(cam.x - 11), y: Math.round(cam.y - 13) }; diamond(b0.x - 2, b0.y - 2, 26, 30, 'rgba(214,190,140,.97)', 'rgba(0,0,0,.4)', 2);
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5; for (let i = -2; i <= 24; i += 2) { ctx.beginPath(); ctx.moveTo(sx(b0.x + i, b0.y - 2), sy(b0.x + i, b0.y - 2)); ctx.lineTo(sx(b0.x + i, b0.y - 1.2), sy(b0.x + i, b0.y - 1.2)); ctx.stroke(); }   // ruler: one tick per 2 tiles (24 m)
    const items = []; let rx = b0.x, ry = b0.y + 1, rowH = 0;
    for (const k of FAC_ORDER) { const f = CFG.FACILITIES[k], w = f.fp[0], h = f.fp[1]; if (rx + w > b0.x + 22) { rx = b0.x; ry += rowH + 3; rowH = 0; } items.push({ k, f, x: rx, y: ry }); rx += w + 2; rowH = Math.max(rowH, h); }
    // a pipe next to the well: 0.18 tile wide, 6 tiles long
    const pw = CFG.SCALE.PIPE_TILE; items.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    for (const it of items) { const [shp, hz] = it.f.look, fn = SHAPE[shp]; diamond(it.x, it.y, it.f.fp[0], it.f.fp[1], 'rgba(80,60,40,.18)', 'rgba(60,40,20,.55)', 1, [3, 3]); fn(it.x, it.y, it.f.fp[0], it.f.fp[1], hz, FCOL[it.f.cat]); }
    for (const it of items) { const X = sx(it.x + it.f.fp[0] / 2, it.y + it.f.fp[1] + .4), Y = sy(it.x + it.f.fp[0] / 2, it.y + it.f.fp[1] + .4); ctx.font = '600 ' + Math.max(9, 11 * Math.min(1.4, cam.z)) + 'px system-ui'; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3; const t = it.k + ' ' + it.f.fp[0] + '×' + it.f.fp[1]; ctx.strokeText(t, X, Y + 12 * cam.z); ctx.fillStyle = '#222'; ctx.fillText(t, X, Y + 12 * cam.z); }
    const wl = items.find(i => i.k === 'well'); if (wl) { diamond(wl.x + 1.4, wl.y + .5 - pw / 2, 6, pw, '#6b6f75', '#2b2b2b', 1); }
    ctx.fillStyle = '#222'; ctx.font = '600 12px system-ui'; ctx.textAlign = 'left'; ctx.fillText('1 tile = ' + CFG.SCALE.TILE_M + ' m · pipe = ' + pw + ' tile · all footprints in tiles (well 1×1, pump 1×1, tank 2×2 are the game values)', sx(b0.x, b0.y - 1), sy(b0.x, b0.y - 1) - 6);
  }

  // ---- tracks / zones / sites overlay
  function overlays(lv, b) {
    if (ui.reg) {
      ctx.lineWidth = 1; ctx.font = '600 12px system-ui';
      for (const r of world.regions) { diamond(r.x0, r.y0, r.w, r.h, null, 'rgba(255,255,255,.30)', 1, [6, 5]); if (lv !== 'CLOSE') { const m = r.x0 + r.w / 2, n = r.y0 + r.h / 2, px = sx(m, n), py = sy(m, n); if (px > -80 && px < VW + 80 && py > -20 && py < VH + 20) { ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3; const lab = lv === 'FAR' && cam.z < .012 ? r.name : r.name + ' · ' + r.richness; ctx.strokeText(lab, px, py); ctx.fillText(lab, px, py); if (lv === 'MEDIUM') { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '11px system-ui'; ctx.fillText(r.kind, px, py + 14); ctx.font = '600 12px system-ui'; } } } }
    }
    const near = r => !(r.x0 > b.x1 + 30 || r.y0 > b.y1 + 30 || r.x0 + r.w < b.x0 - 30 || r.y0 + r.h < b.y0 - 30);
    if (lv !== 'FAR') for (const r of world.regions) if (near(r)) for (const t of world.tracks(r.id)) { ctx.strokeStyle = 'rgba(196,164,112,.75)'; ctx.lineWidth = Math.max(1.5, 3.2 * cam.z); ctx.setLineDash([]); ctx.beginPath(); t.pts.forEach((p, i) => i ? ctx.lineTo(sx(p[0], p[1]), sy(p[0], p[1])) : ctx.moveTo(sx(p[0], p[1]), sy(p[0], p[1]))); ctx.stroke(); }
    if (ui.zone && lv !== 'FAR') for (const r of world.regions) { if (!near(r)) continue;
      for (const z of world.refineryZones(r.id)) { diamond(z.x, z.y, z.w, z.h, 'rgba(150,90,200,.16)', '#b27be0', 1.5, [7, 4]); diamond(z.x - 8, z.y - 8, z.w + 16, z.h + 16, null, 'rgba(178,123,224,.45)', 1, [2, 4]); ctx.fillStyle = '#e0c6f7'; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 3; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; const X = sx(z.x + z.w / 2, z.y + z.h / 2), Y = sy(z.x + z.w / 2, z.y + z.h / 2); ctx.strokeText('REFINERY ZONE', X, Y); ctx.fillText(DEVUI ? 'REFINERY ZONE' : 'منطقة المصافي', X, Y); }
      for (const z of world.tankZones(r.id)) { diamond(z.x, z.y, z.w, z.h, 'rgba(70,150,200,.15)', '#6ab6e6', 1.3, [5, 4]); ctx.fillStyle = '#cfeaff'; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 3; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; const X = sx(z.x + z.w / 2, z.y + z.h / 2), Y = sy(z.x + z.w / 2, z.y + z.h / 2); if (lv === 'MEDIUM' || cam.z < 1.3) { ctx.strokeText('TANK FARM', X, Y); ctx.fillText(DEVUI ? 'TANK FARM' : 'منطقة الخزانات', X, Y); } }
      for (const p of world.strategicPoints(r.id)) { const X = sx(p.x, p.y), Y = sy(p.x, p.y); ctx.fillStyle = p.kind === 'EXPORT_COAST' ? '#ffd166' : '#ffffff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X, Y - 9); ctx.lineTo(X + 7, Y); ctx.lineTo(X, Y + 9); ctx.lineTo(X - 7, Y); ctx.closePath(); ctx.fill(); ctx.stroke(); if (lv !== 'FAR' && cam.z < 1.3) { ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3; const t = DEVUI ? (p.kind === 'EXPORT_COAST' ? 'EXPORT SITE' : 'HUB') : (p.kind === 'EXPORT_COAST' ? 'موقع تصدير' : 'نقطة تجميع'); ctx.strokeText(t, X, Y - 13); ctx.fillText(t, X, Y - 13); } } }
    for (const r of world.regions) {
      if (!near(r)) continue;
      for (const s of world.regionSites(r.id)) {
        if (s.x < b.x0 - 20 || s.x > b.x1 + 20 || s.y < b.y0 - 20 || s.y > b.y1 + 20) continue;
        const st = world.stateOf(s.id), vi = world.visibleInfo(s.id), sel = ui.sel === s.id;
        if (!vi) { if (ui.dev) ellipseIso(s.x, s.y, s.radius, s.kind === 'DRY' ? 'rgba(160,160,160,.12)' : 'rgba(255,80,40,.18)', s.kind === 'DRY' ? '#9a9a9a' : '#ff6a3d', 1, [3, 3]); continue; }
        if (st === 'DISCOVERED') { const i = vi.indicator; ellipseIso(i.x, i.y, i.r, 'rgba(230,195,90,.10)', SCOL.DISCOVERED, sel ? 2.5 : 1.5, [5, 4]); if (lv !== 'FAR') { ctx.fillStyle = SCOL.DISCOVERED; ctx.font = '600 13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', sx(i.x, i.y), sy(i.x, i.y) + 4); } continue; }
        const col = s.kind === 'DRY' ? '#777' : SCOL[st];
        ellipseIso(s.x, s.y, s.radius, s.kind === 'DRY' ? 'rgba(90,90,90,.07)' : st === 'DEPLETED' ? 'rgba(60,60,60,.14)' : st === 'PRODUCING' ? 'rgba(255,170,60,.12)' : 'rgba(30,20,10,.10)', col, sel ? 3 : 1.6, st === 'SURVEYED' ? [6, 3] : st === 'DRILLABLE' || st === 'PRODUCING' ? null : [2, 3]);
        const sz = Math.max(CFG.SCALE.ICON_MIN_PX, Math.min(CFG.SCALE.ICON_MAX_PX, cam.z * 26)) * (lv === 'FAR' ? .75 : 1), px = sx(s.x, s.y), py = sy(s.x, s.y);
        if (s.kind === 'FIELD') { derrick(px, py, sz, col); if (lv !== 'FAR') { ctx.fillStyle = '#fff'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3; const t = DEVUI ? s.type[0] + s.type.slice(1).toLowerCase() + ' · ' + st.toLowerCase() : '⛰️ حقل نفط' + (ST_AR[st] ? ' · ' + ST_AR[st] : ''); ctx.strokeText(t, px, py - sz - 4); ctx.fillText(t, px, py - sz - 4); } }
        else { ctx.strokeStyle = '#999'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px - 6, py - 6); ctx.lineTo(px + 6, py + 6); ctx.moveTo(px + 6, py - 6); ctx.lineTo(px - 6, py + 6); ctx.stroke(); if (lv !== 'FAR') { ctx.fillStyle = '#ccc'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('dry hole', px, py - 12); } }
      }
    }
  }

  let missingHi = 0;
  function draw() {
    dirty = false; const lv = level(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.lineJoin = 'round'; ctx.fillStyle = '#0c1015'; ctx.fillRect(0, 0, VW, VH);
    const b = bounds(), c0 = Math.max(0, Math.floor(b.x0 / C)), c1 = Math.min(CX - 1, Math.floor(b.x1 / C)), r0 = Math.max(0, Math.floor(b.y0 / C)), r1 = Math.min(CY - 1, Math.floor(b.y1 / C));
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; missingHi = 0;
    if (!stats.firstDrawMs && ovStep < 99) stats.firstDrawMs = Math.round(performance.now());
    if (cam.z < 0.5) {                                  // the overview image as the backdrop (and the whole picture at FAR): only the visible part is drawn
      const z = cam.z, Xc = (cam.x - cam.y) * 32, Yc = (cam.x + cam.y) * 16, sc = z / OV_Z, ox = VW / 2 + (-OV_EX / OV_Z - Xc) * z, oy = VH / 2 + (0 - Yc) * z;
      let sx0 = Math.max(0, -ox / sc), sy0 = Math.max(0, -oy / sc), sx1 = Math.min(OV_W, (VW - ox) / sc), sy1 = Math.min(OV_H, (VH - oy) / sc);
      if (sx1 > sx0 && sy1 > sy0) ctx.drawImage(ov, sx0, sy0, sx1 - sx0, sy1 - sy0, ox + sx0 * sc, oy + sy0 * sc, (sx1 - sx0) * sc, (sy1 - sy0) * sc);
    }
    if (cam.z >= 0.06) {
      const kk = lv === 'FAR' ? 1 : lv === 'MEDIUM' ? 2 : 3, mp = imgOf(kk);
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        let bm = mp.get(cy * CX + cx); if (!bm) { wantImg(cx, cy, kk); missingHi++; bm = kk > 1 ? lo.get(cy * CX + cx) : null; } if (!bm) continue;
        ctx.save(); ctx.setTransform(DPR * 32 * cam.z, DPR * 16 * cam.z, -DPR * 32 * cam.z, DPR * 16 * cam.z, DPR * sx(cx * C, cy * C), DPR * sy(cx * C, cy * C)); ctx.drawImage(bm, 0, 0, bm.width, bm.height, 0, 0, C + .6, C + .6);
        if (ui.heat) { const hb = heat.get(cy * CX + cx); if (hb) ctx.drawImage(hb, 0, 0, 32, 32, 0, 0, C, C); else need.set('h:' + (cy * CX + cx), { t: 'heat', cx, cy }); } ctx.restore();
      }
    }
    if (lv === 'CLOSE') decorate(b);
    overlays(lv, b);
    if (hooks.afterOverlays) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); hooks.afterOverlays(lv, b); }
    if (ui.scale) drawScaleChart();
    if (ui.probe && lv !== 'FAR') { const p = ui.probe, f = CFG.FACILITIES[ui.facility]; diamond(p.x, p.y, f.fp[0], f.fp[1], p.res.ok ? 'rgba(80,220,120,.45)' : 'rgba(240,70,60,.45)', p.res.ok ? '#6dff9a' : '#ff6b60', 2); if (!p.res.ok) { const cx = sx(p.x + f.fp[0] / 2, p.y + f.fp[1] / 2), cy = sy(p.x + f.fp[0] / 2, p.y + f.fp[1] / 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx - 7, cy - 7); ctx.lineTo(cx + 7, cy + 7); ctx.moveTo(cx + 7, cy - 7); ctx.lineTo(cx - 7, cy + 7); ctx.stroke(); } }
    if (hooks.top) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); hooks.top(lv, b); }
    hud.textContent = lv + '  zoom ' + cam.z.toFixed(3) + '  view ' + Math.round(b.x1 - b.x0) + ' tiles  images ' + stats.imgs + ' · jobs ' + pendingJobs() + '  world ' + world.W + '×' + world.H + ' tiles = ' + (world.W * CFG.SCALE.TILE_M / 1000).toFixed(1) + '×' + (world.H * CFG.SCALE.TILE_M / 1000).toFixed(1) + ' km (' + world.scale().toFixed(1) + '× the current map)';
    document.querySelectorAll('[data-z]').forEach(e => e.classList.toggle('on', e.dataset.z === lv));
    if (missingHi) { dirty = true; }
  }
  // ---- input (preview-only camera: drag to pan, wheel / pinch to zoom, tap to inspect)
  const ptrs = new Map(); let moved = 0, pinch = null;
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

  const hooks = {};                                           // Phase 2 hooks (building lab): afterOverlays(lv,b) draws buildings, top(lv,b) draws the ghost, tap(px,py) returns true when it used the tap
  function tap(px, py) {
    if (hooks.tap && hooks.tap(px, py)) return;
    const t = toTile(px, py), x = Math.floor(t.x), y = Math.floor(t.y); if (!world.inb(x, y)) return;
    let hit = null; for (const s of world.sitesNear(x, y, 3)) { const vi = world.visibleInfo(s.id), ind = vi && vi.indicator, cxs = ind ? ind.x : s.x, cys = ind ? ind.y : s.y, rad = ind ? ind.r : s.radius; if ((vi || ui.dev) && Math.hypot(cxs - t.x, cys - t.y) <= rad + 1) { hit = s; break; } }
    const tl = world.tile(x, y); if (!tl) { wantImg((x / C) | 0, (y / C) | 0, 1); document.getElementById('info').textContent = 'جارٍ تحميل هذا الجزء من العالم…'; return; } const res = world.canBuildAt(ui.facility, x, y); ui.probe = { x, y, res }; ui.sel = hit ? hit.id : null; dirty = true; showInfo(tl, res, hit);
  }
  const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : '' + n;
  function showInfo(tl, res, hit) {
    const T = CFG.TERRAIN[tl.terrain], reg = world.regions[tl.region]; let h = '<h4>' + T.label + ' · region ' + reg.name + ' (' + reg.richness + ', ' + reg.kind + ')</h4><span class="k">tile ' + tl.x + ',' + tl.y + ' · elevation level ' + tl.level + '/7 · slope ' + tl.slope + ' · build cost ×' + T.buildCost + ' · oil odds ×' + T.oilMod + '</span><br>';
    const f = CFG.FACILITIES[ui.facility]; h += '<b>' + ui.facility + '</b> ' + f.fp.join('×') + ': ' + (res.ok ? '<span style="color:#6dff9a">can build</span> (cost ×' + res.costModifier + ')' : '<span style="color:#ff8a80">cannot build: ' + res.reason + '</span>');
    if (hit) { const vi = world.visibleInfo(hit.id), st = world.stateOf(hit.id); h += '<hr style="border:0;border-top:1px solid #33404f"><b>Oil site · ' + st + '</b><br>';
      if (!vi) h += 'Developer view only: the player does not know this site yet.<br><span class="k">' + hit.kind + ' ' + hit.type + ' · reserve ' + fmt(hit.initialReserve) + ' · depth ' + hit.depth + ' m · pressure ' + hit.pressurePotential + ' · quality ' + hit.quality + '</span>';
      else if (st === 'DISCOVERED') h += 'Promising geology. Not surveyed: size, type and depth unknown.';
      else if (vi.dry) h += 'Survey result: no commercial oil.';
      else { h += vi.type + ' field · estimated ' + fmt(vi.estimatedReserve) + ' bbl (range ' + fmt(vi.reserveRange[0]) + '–' + fmt(vi.reserveRange[1]) + ') · pressure ' + vi.pressureClass + ' · quality ' + vi.quality + ' · success ' + Math.round(vi.probability * 100) + '%'; if (vi.depth) h += '<br>depth ' + vi.depth + ' m · drilling estimate ' + vi.estimatedCost + ' (not charged) · remaining ' + fmt(vi.remainingReserve) + ' · depleted ' + vi.depletionPct + '%'; }
      const nxt = { UNDISCOVERED: 'discover', DISCOVERED: 'survey', SURVEYED: 'makeDrillable', DRILLABLE: 'startProducing' }[st]; if (nxt && !(vi && vi.dry && nxt === 'makeDrillable')) h += '<div class="row"><button data-adv="' + nxt + '" data-id="' + hit.id + '">Advance → ' + nxt + '</button></div>'; }
    info.innerHTML = h;
  }
  info.addEventListener('click', e => { const b = e.target.closest('[data-adv]'); if (!b) return; const r = world[b.dataset.adv](b.dataset.id); dirty = true; const s = world.siteById(b.dataset.id); showInfo(world.tile(s.x, s.y), ui.probe.res, s); if (!r.ok) info.insertAdjacentHTML('beforeend', '<br><span class="k">refused: ' + r.reason + '</span>'); });

  const zlevels = { FAR: 0.0045, MEDIUM: 0.35, CLOSE: 1.0 };
  function setLevel(n) { zoomAt(VW / 2, VH / 2, zlevels[n]); }
  document.querySelectorAll('[data-z]').forEach(b => b.onclick = () => setLevel(b.dataset.z));
  const tog = (id, key) => { const el = document.getElementById(id); el.onclick = () => { ui[key] = !ui[key]; el.classList.toggle('on', ui[key]); if (key === 'scale' && ui[key]) { cam.z = .3; } dirty = true; }; };
  tog('tReg', 'reg'); tog('tZone', 'zone'); tog('tDev', 'dev'); tog('tHeat', 'heat'); tog('tScale', 'scale');
  const fac = document.getElementById('fac'); for (const k in CFG.FACILITIES) fac.insertAdjacentHTML('beforeend', '<option value="' + k + '">' + k + ' ' + CFG.FACILITIES[k].fp.join('×') + '</option>'); fac.onchange = () => { ui.facility = fac.value; if (ui.probe) ui.probe.res = world.canBuildAt(ui.facility, ui.probe.x, ui.probe.y); dirty = true; };

  cv.addEventListener('contextlost', () => { stats.ctxLost = (stats.ctxLost || 0) + 1; }); cv.addEventListener('contextrestored', () => { dirty = true; });
  // adaptive resolution: if real frames (not draw calls) are slow, the canvas resolution drops step by step (never below 0.75) so panning stays smooth on weak GPUs; it never goes up again within a session
  const ft = []; let lastT = 0; stats.dprChanges = 0;
  function adapt(now) { if (lastT && dirty) { ft.push(now - lastT); if (ft.length >= 12) { const m = ft.slice().sort((a, b) => a - b)[6]; ft.length = 0; if (m > 34 && DPR > 0.76 && !qs.get('fixdpr')) { DPR = Math.max(0.75, DPR * 0.72); stats.dprChanges++; resize(); } } } lastT = dirty ? now : 0; }
  function loop(now) { adapt(now); if (dirty) { const t = performance.now(); draw(); stats.lastDraw = performance.now() - t; } requestAnimationFrame(loop); }
  window.__wp = { hooks, ctx, bounds, markDirty: () => { dirty = true; }, VW: () => VW, VH: () => VH, dpr: () => DPR, setDpr(v) { DPR = v; resize(); }, world, cam, ui, stats, setLevel, goto(x, y, z) { cam.x = x; cam.y = y; if (z) cam.z = clampZ(z); keepIn(); dirty = true; }, tap, level, ready: () => stats.imgs, genLeft: () => (demoDone && !ovQueue.length ? 0 : 1) + (busy.img || busy.reg ? 1 : 0), idle: () => pendingJobs() === 0 && demoDone, pending: pendingJobs, draw, toTile, sx, sy, hiLeft: () => missingHi };
  const sp = qs.get('x'); if (sp) { cam.x = +qs.get('x'); cam.y = +qs.get('y'); cam.z = clampZ(+qs.get('z') || .9); }
  if (qs.get('dev')) { ui.dev = true; document.getElementById('tDev').classList.add('on'); }
  if (qs.get('scale')) { ui.scale = true; document.getElementById('tScale').classList.add('on'); }
  if (DEVUI) { info.innerHTML = 'World <b>' + world.W + '×' + world.H + ' tiles</b> = ' + (world.W * CFG.SCALE.TILE_M / 1000).toFixed(1) + '×' + (world.H * CFG.SCALE.TILE_M / 1000).toFixed(1) + ' km (1 tile = ' + CFG.SCALE.TILE_M + ' m), <b>' + world.scale().toFixed(1) + '×</b> the current 140×88 map · 24 regions · 600 chunks. Tap the map: a tile shows terrain and whether the selected facility fits. Tap an oil field to see what the player may know.'; } else info.textContent = 'اضغط على حقل نفط لتبدأ، أو على أي مبنى لترى تفاصيله.';
  requestAnimationFrame(schedule); requestAnimationFrame(loop);
})();
