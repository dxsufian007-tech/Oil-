/* Oli v2 front-end: Phaser draws the world and handles the camera and touch. core.js (OliCore.Game) stays the ONE source of truth:
   buildings, pipe entities (node-to-node), network graph, hydraulics, economy and save data all live there. Nothing here is simulated. */
(() => {
  'use strict';
  const { Game, CFG, idx, inb } = OliCore;
  const W = CFG.GRID_COLS, H = CFG.GRID_ROWS, SAVE_KEY = 'oli2-save', OLD_KEY = 'oli-save-v1';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  const num = n => Math.round(n).toLocaleString('en-US');
  const bar = v => (Math.max(0, +v || 0)).toFixed(1) + T(' بار');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- game state (core) ---------- */
  const game = new Game();
  let saved = null;
  for (const key of [SAVE_KEY, OLD_KEY]) {
    try { const raw = localStorage.getItem(key); if (raw) { const d = JSON.parse(raw); game.load(d.game); saved = key === SAVE_KEY ? d : {}; break; } } catch (e) { game.reset(); }
  }
  const prefs = Object.assign({ sound: 1, music: 1, vib: 1, lang: 'ar', gfx: 'auto' }, (window.OliLang && OliLang.prefs) || {});
  const buzz = ms => { if (prefs.vib && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* not supported */ } };   // short haptic feedback
  // graphics quality: low = 30 fps, no smoothing, fewer oil dots | medium = 60 fps, no smoothing | high = 60 fps, smoothing | auto = picked from the device
  const GFX = (() => { let q = prefs.gfx; if (q === 'auto') q = (navigator.hardwareConcurrency || 4) >= 6 && (window.devicePixelRatio || 1) <= 3 ? 'high' : 'medium';
    return { q, fps: q === 'low' ? 30 : 60, aa: q === 'high', dotGap: q === 'low' ? 60 : 34 }; })();
  const openWholeMap = () => { for (const r of game.s.regions) r.unlocked = true; };   // the whole map is open: no locked regions
  openWholeMap();
  const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ game: game.serialize(), speed: ui.speed, cam: view.cam ? { x: view.cam.scrollX, y: view.cam.scrollY, z: view.cam.zoom } : null })); } catch (e) { /* storage unavailable */ } };

  /* ---------- ONE coordinate system: grid tile <-> world pixel (isometric 64 x 32) ---------- */
  const tc = (x, y) => ({ x: (x - y) * 32, y: (x + y + 1) * 16 });                 // centre of tile (x, y)
  const kc = k => tc(k % W, (k / W) | 0);
  const toTile = (wx, wy) => { const u = wx / 32, v = wy / 16; return { x: Math.floor((u + v) / 2), y: Math.floor((v - u) / 2) }; };
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  /* ---------- UI state ---------- */
  const ui = { speed: saved && typeof saved.speed === 'number' ? saved.speed : 1, tool: null, ptype: 0, kind: 'small', pending: null, a: null, b: null, route: null, sel: null, lastConfirm: 0, routeCache: new Map() };
  const view = { cam: null, scene: null };

  /* ---------- connection-point geometry: the pipe picture is generated from the pipe entity and its NODES ---------- */
  // where a pipe whose end tile is k meets node `id`: the middle of the edge it shares with the building, or the junction tile's centre
  function nodeAnchor(id, k) {
    if (!id) return null;
    if (id[0] === 'J') return kc(+id.slice(1));
    if (id[0] === 'B') {
      const b = game.buildings.find(q => q.id === +id.slice(1)); if (!b) return null;
      const x = k % W, y = (k / W) | 0, own = new Set(game.cellsOf(b));
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (inb(nx, ny) && own.has(idx(nx, ny))) return mid(kc(k), tc(nx, ny)); }
    }
    return null;
  }
  const isHub = k => { const m = game.visualMask(k); let n = 0; for (let d = 0; d < 4; d++) n += (m >> d) & 1; return n >= 3; };
  // The picture of a pipe = one PIECE per tile, built only from the pipe entity (its tiles) and its two NODES:
  //   piece i runs from where it enters tile i to where it leaves it. Entry / exit are the middles of tile edges (there the pipe is always straight,
  //   so neighbouring pieces meet end to end with no gap and no overlap); the first / last piece starts / ends exactly on the node's connection point.
  //   A turn inside a tile is a smooth curve; a junction tile keeps its exact centre, where the other pipe passes.
  const CURVE_STEPS = 8;
  function pipeGeom(cells, aId, bId) {
    const n = cells.length, C = cells.map(kc), hub = cells.map(isHub);
    const sA = nodeAnchor(aId, cells[0]), eA = nodeAnchor(bId, cells[n - 1]);
    const near = (p, q) => Math.abs(p.x - q.x) < .01 && Math.abs(p.y - q.y) < .01;
    const pieces = [];
    for (let i = 0; i < n; i++) {
      const c = C[i];
      const entry = i > 0 ? mid(C[i - 1], c) : (sA && !near(sA, c) ? sA : c);
      const exit = i < n - 1 ? mid(c, C[i + 1]) : (eA && !near(eA, c) ? eA : c);
      const turn = Math.abs((c.x - entry.x) * (exit.y - c.y) - (c.y - entry.y) * (exit.x - c.x)) > 1;
      let pts;
      if (turn && !hub[i]) {                                                     // the curve leaves and joins the straight parts along their exact direction (no kink, no wedge)
        const q = (t) => { const u = 1 - t; return { x: u * u * entry.x + 2 * u * t * c.x + t * t * exit.x, y: u * u * entry.y + 2 * u * t * c.y + t * t * exit.y }; };
        pts = [entry, { x: entry.x + (c.x - entry.x) * .04, y: entry.y + (c.y - entry.y) * .04 }];
        for (let j = 1; j < CURVE_STEPS; j++) pts.push(q(j / CURVE_STEPS));
        pts.push({ x: exit.x + (c.x - exit.x) * .04, y: exit.y + (c.y - exit.y) * .04 }, exit);
      }
      else pts = [entry, c, exit].filter((p, j, arr) => j === 0 || !near(p, arr[j - 1]));
      if (pts.length < 2) pts = [c, c];
      pieces.push({ k: cells[i], pts, depth: 16 + c.y, turn });
    }
    const pts = []; for (const pc of pieces) for (const p of pc.pts) if (!pts.length || !near(p, pts[pts.length - 1])) pts.push(p);
    return { pieces, pts, start: pts[0], end: pts[pts.length - 1], startNode: aId, endNode: bId, startCap: !sA, endCap: !eA };
  }
  // a preview route may begin / end ON an existing pipe tile (the junction): that tile belongs to the other pipe, the new pipe starts from its centre
  function routeCells(r) {
    let cells = r.cells.map(c => idx(c[0], c[1])); const fresh = new Set(r.fresh);
    if (cells.length > 1 && !fresh.has(cells[0])) cells = cells.slice(1);
    if (cells.length > 1 && !fresh.has(cells[cells.length - 1])) cells = cells.slice(0, -1);
    return cells;
  }

  /* ---------- Phaser scene ---------- */
  class WorldScene extends Phaser.Scene {
    constructor() { super('world'); }
    preload() {
      const A = window.ART || {}; this.artOk = new Set();
      for (const [k, v] of Object.entries(A.spr || {})) { this.textures.addBase64(k, v.src); this.artOk.add(k); }
      if (A.pump) { this.textures.addBase64('pumpX', A.pump.x); this.textures.addBase64('pumpY', A.pump.y); }
    }
    create() {
      view.scene = this; const cam = view.cam = this.cameras.main;
      cam.setBackgroundColor('#123a52');
      view.bounds = { x: -H * 32 - 48, y: -48, w: (W + H) * 32 + 96, h: (W + H) * 16 + 96 };          // the whole world diamond and a thin margin: nothing beyond
      this.input.addPointer(2);
      this.makeGround();
      this.fxG = this.add.graphics().setDepth(5e5);         // oil moving in pipes (each frame, a few dots); dots behind a building are skipped
      this.prevG = this.add.graphics().setDepth(6e5).setAlpha(.82);   // the route preview, above everything (redrawn only when the route changes)
      this.placeG = this.add.graphics().setDepth(5.9e5);    // building preview: footprint cells + connection points (redrawn only when the preview moves to another tile)
      this.markG = this.add.graphics().setDepth(1e6);       // node marks / selection
      this.sprites = new Map(); this.ghost = null; this.netSig = ''; this.groundSig = '';
      if (saved && saved.cam) { cam.setZoom(clamp(saved.cam.z || 1, camApi.minZoom(), Z_MAX)); cam.setScroll(saved.cam.x, saved.cam.y); camApi.clamp(); }
      else { const a = game.areas.find(q => q.st === 2 && q.kind !== 'empty') || game.areas[0], A = CFG.EXPLORE.AREA, p = tc(a.ax * A + A / 2, a.ay * A + A / 2); cam.setZoom(.9); cam.centerOn(p.x, p.y); camApi.clamp(); }
      setupInput(this);
      this.time.addEvent({ delay: 250, loop: true, callback: refreshHud });
      this.time.addEvent({ delay: 5000, loop: true, callback: save });
      refreshHud(); updateHint();
    }
    // ground: one isometric tilemap, the tileset is drawn once from the sand art; Phaser culls off-screen tiles
    makeGround() {
      const N = 8, TW = 66, TH = 34, cv = document.createElement('canvas'); cv.width = TW * N; cv.height = TH; const g = cv.getContext('2d');   // each tile 1 px bigger than the diamond on all sides: neighbours overlap, no hairline seams
      const sand = this.textures.exists('sand') ? this.textures.get('sand').getSourceImage() : null;
      const cols = ['#e0b46e', '#dfb36d', '#e1b56f', '#c79c60', '#dcb06b', '#2b6f93', '#b39f80', '#a88d64'];   // near-identical sand so the grid does not show   // sand x3, oil field, explored dry, water, rock, locked
      for (let i = 0; i < N; i++) {
        g.save(); g.translate(i * TW, 0); g.beginPath(); g.moveTo(33, 0); g.lineTo(66, 17); g.lineTo(33, 34); g.lineTo(0, 17); g.closePath(); g.clip();
        g.fillStyle = cols[i]; g.fillRect(0, 0, TW, TH);
        if (sand && i !== 5) { g.globalAlpha = .45; g.drawImage(sand, 0, 0, TW, TH); g.globalAlpha = 1; }
        g.translate(1, 1);
        if (i === 3) { g.fillStyle = 'rgba(60,35,10,.16)'; for (let j = 0; j < 5; j++) g.fillRect(12 + j * 9, 12 + (j % 3) * 3, 2, 2); }
        if (i === 7) { g.fillStyle = 'rgba(20,30,45,.22)'; g.fillRect(0, 0, 64, 32); }
        g.restore();
      }
      this.textures.addCanvas('groundset', cv);
      // an isometric map must be BORN isometric (its cull / convert functions are chosen in the constructor)
      const md = new Phaser.Tilemaps.MapData({ width: W, height: H, tileWidth: 64, tileHeight: 32, orientation: Phaser.Tilemaps.Orientation.ISOMETRIC, format: Phaser.Tilemaps.Formats.ARRAY_2D });
      const map = new Phaser.Tilemaps.Tilemap(this, md);
      const ts = map.addTilesetImage('groundset', 'groundset', 66, 34, 0, 0, 0);   // 66x34 images on a 64x32 grid; the layer is shifted 1 px up-left (works in WebGL AND Canvas)
      this.ground = map.createBlankLayer('ground', ts, -33, -1).setDepth(0);
      this.paintGround(true);
    }
    groundIndex(x, y) {
      const k = idx(x, y), a = game.areaAt(x, y);
      if (game.map.water[k]) return 5;
      if (game.map.block[k]) return 6;
      if (a && !game.regionOpen(a.region)) return 7;
      if (a && a.st === 2) return a.kind !== 'empty' && a.remaining > 0 ? 3 : 4;
      const h = ((x * 73856093) ^ (y * 19349663)) >>> 0; return h % 3;
    }
    paintGround(force) {
      const sig = game.s.regions.map(r => +r.unlocked).join('') + game.areas.filter(a => a.st === 2).length;
      if (!force && sig === this.groundSig) return; this.groundSig = sig;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.ground.putTileAt(this.groundIndex(x, y), x, y);
    }
    update(t, dms) {
      let left = Math.min(dms / 1000, .25) * ui.speed; while (left > 1e-6) { const d = Math.min(left, .25); game.step(d); left -= d; }   // game speed: pause / 1x / 2x / 3x
      if (view.glide) { if (touch.busy()) view.glide = null; else view.glide(t); }       // the Touch Controller is the only thing that moves the camera while a finger is on the map
      if ((t | 0) % 1000 < dms) this.paintGround(false);
      this.syncBuildings(); this.drawPipes(); this.drawFlow(t); this.drawMarks(t);
    }
    /* buildings: one image each, kept in step with game.buildings (ids), depth = ground point, so nearer ones are in front */
    syncBuildings() {
      const live = new Set();
      for (const b of game.buildings) {
        live.add(b.id); let s = this.sprites.get(b.id); const key = spriteKey(b);
        if (!s || s.texture.key !== key) { if (s) s.destroy(); s = this.add.image(0, 0, key); this.sprites.set(b.id, s); }
        const mv = ui.move && ui.move.id === b.id ? ui.move : null;
        placeSprite(s, b.type, mv ? mv.x : b.x, mv ? mv.y : b.y, b);
        s.setAlpha(mv ? .8 : game.s.time < b.ready ? .6 : 1); if (mv) s.setTint(mv.ok ? 0xa8ffc8 : 0xff8a80); else if (s.tintTopLeft !== 0xffffff) s.clearTint();
      }
      for (const [id, s] of this.sprites) if (!live.has(id)) { s.destroy(); this.sprites.delete(id); }
    }
    /* built pipes: drawn from the pipe ENTITIES (core lines) and their node anchors; redrawn only when the network changes */
    drawPipes() {
      const sig = game.netVersion + ':' + game.lines.length + ':' + game.buildings.length + ':' + game.lines.reduce((t, L) => t + L.a + L.b, '');
      if (sig === this.netSig) return; this.netSig = sig;
      this.pool = this.pool || []; let used = 0; this.geoms = [];
      const take = d => { let g = this.pool[used]; if (!g) { g = this.add.graphics(); this.pool.push(g); } used++; g.clear(); g.setDepth(d).setVisible(true); return g; };
      this.pieceDepth = new Map();
      for (const L of game.lines) {
        const geo = pipeGeom(L.cells, L.a, L.b), sc = L.type ? 1.3 : 1; geo.line = L; this.geoms.push(geo); measure(geo);
        geo.pieces.forEach((pc, i) => {
          const g = take(10 + pc.depth); drawPiece(g, pc, sc, null, 1);
          if (i === 0) endFitting(g, geo, true, sc); if (i === geo.pieces.length - 1) endFitting(g, geo, false, sc);
          if (!pc.turn && !isHub(pc.k) && i % 3 === 1 && geo.pieces.length > 2) collarAt(g, pc.pts, sc);
          this.pieceDepth.set(pc.k, 10 + pc.depth);
        });
      }
      for (const L of game.lines) for (const k of L.cells) if (isHub(k)) { const g = take(10 + kc(k).y + 16 + 34); drawHub(g, kc(k)); }   // above the pieces of the neighbouring tiles, so its ring is whole
      for (let i = used; i < this.pool.length; i++) this.pool[i].clear().setVisible(false);
    }
    /* oil: dots moving along each pipe stretch at a speed proportional to that stretch's real flow (currentFlow from the simulation), in the
       solver's flow direction; a stretch with no flow has no dots. One Graphics object is redrawn per frame (no objects created per frame). */
    drawFlow(t) {
      const g = this.fxG; g.clear(); this.fxDots = 0; if (!this.geoms) return;
      if (!this.fxCache || t - this.fxAt > 200 || this.fxGeoms !== this.geoms) { this.fxCache = new Map(); for (const geo of this.geoms) this.fxCache.set(geo, flowStretches(geo.line)); this.fxAt = t; this.fxGeoms = this.geoms; }
      const gap = GFX.dotGap;
      g.fillStyle(0xffb41f, .95);
      for (const geo of this.geoms) {
        const n = geo.line.cells.length, per = geo.len / Math.max(1, n);
        for (const st of this.fxCache.get(geo) || []) {
          if (!(st.flow > 0) || !st.dir) continue;
          const d0 = st.i0 * per, d1 = (st.i1 + 1) * per, off = (t / 1000 * st.speed) % gap, r = 3 + 2 * Math.min(1, st.usage);
          for (let d = off; d < d1 - d0; d += gap) { const p = pointAt(geo, st.dir > 0 ? d0 + d : d1 - d); if (this.hiddenByBuilding(p)) continue; g.fillCircle(p.x, p.y - 2, r); this.fxDots++; }
        }
      }
    }
    hiddenByBuilding(p) {
      const t = toTile(p.x, p.y), pd = inb(t.x, t.y) ? (this.pieceDepth.get(idx(t.x, t.y)) || 0) : 0;
      for (const s of this.sprites.values()) if (s.depth > pd && s.getBounds().contains(p.x, p.y)) return true;
      return false;
    }
    drawMarks(t) {
      const g = this.markG; g.clear();
      if (ui.tool === 'pipe') {                                                  // every connection node glows softly; the chosen start is gold
        const pulse = .45 + .3 * Math.sin(t / 220);
        for (const b of game.buildings) footprint(g, b, 'B' + b.id === ui.a ? 0xffb41f : 0xffffff, 'B' + b.id === ui.a ? .9 : pulse * .6);
        if (ui.a && ui.a[0] === 'J') ring(g, kc(+ui.a.slice(1)), 0xffb41f, .95);
        if (ui.b) { const n = game.nodeById(ui.b); if (n) n.kind === 'b' ? footprint(n.b && n.b, n.b, ui.route && ui.route.ok ? 0x2fd27a : 0xff5a4f, .95) : ring(g, kc(n.k), ui.route && ui.route.ok ? 0x2fd27a : 0xff5a4f, .95); }
      }
      if (game.vlist && game.vlist.size) for (const k of game.vlist) {                // valve marks: colour = the valve's real state
        if (!game.pipe[k]) continue; const v = game.valve[k], p = kc(k), col = v === 3 ? 0xff5a4f : v === 2 ? 0xffb41f : 0x2fd27a, open = game.valvePos[k];
        g.fillStyle(0x0d1620, .95); g.fillRect(p.x - 8, p.y - 12, 16, 16); g.lineStyle(2, col, 1); g.strokeRect(p.x - 8, p.y - 12, 16, 16);
        g.fillStyle(col, 1); g.fillRect(p.x - 5, p.y - 9, 10, Math.max(2, 10 * (1 - open) + 2));
      }
      for (const b of game.buildings) if (b.type === 'pump') {                      // pump status dot: from pumpStep's state
        const p = tc(b.x, b.y), st = b.state, col = st === 'RUNNING' ? 0x2fd27a : st === 'STARTING' ? 0xffd84a : st === 'OVERLOAD' ? 0xff5a4f : st === 'STARVED' ? 0xffb41f : 0x8a98a8;
        g.fillStyle(0x0d1620, .95); g.fillCircle(p.x, p.y - 44, 7); g.fillStyle(col, 1); g.fillCircle(p.x, p.y - 44, 5);
      }
      if (ui.sel && ui.sel.kind === 'line' && ui.sel.k != null && game.valve[ui.sel.k]) ring(g, kc(ui.sel.k), 0x7cd7ff, .95);
      if (ui.sel && ui.sel.kind === 'b') { const b = game.buildings.find(q => q.id === ui.sel.id); if (b) footprint(g, b, 0x7cd7ff, .95); }
      if (ui.sel && ui.sel.kind === 'line' && this.geoms) { const geo = this.geoms.find(q => q.line.id === ui.sel.id); if (geo) { g.lineStyle(4, 0x7cd7ff, .9); g.strokePoints(geo.pts, false, false); } }
      if (this.buildFx) {                                                        // construction: a light runs along the new pipe once
        const f = (t - this.buildFx.t0) / 700, geo = this.geoms && this.geoms.find(q => q.line.id === this.buildFx.id);
        if (f >= 1 || !geo) this.buildFx = null; else { const p = pointAt(geo, geo.len * f); g.fillStyle(0xfff3c4, 1 - f * .5); g.fillCircle(p.x, p.y - 2, 9); g.fillStyle(0xffb41f, .9); g.fillCircle(p.x, p.y - 2, 5); }
      }
      if (ui.dragging && view.tip) {                                            // the pipe end: follows the finger, and eases onto the target once acquired (visual only)
        const geo = this.previewGeom, r = ui.route, ok = r && r.ok, col = ok ? 0x2fd27a : r && r.free && r.clear ? 0xffd27a : 0xff5a4f;
        const goal = ok && geo && geo.pts.length ? geo.pts[geo.pts.length - 1] : view.tip;
        const d = view.tipDraw || { x: view.tip.x, y: view.tip.y };
        if (!ok && !view.tipEasing) { d.x = goal.x; d.y = goal.y; }                 // free: the pipe end is glued to the finger (no lag)
        else {                                                                    // attracted (or letting go): glide, never faster than TIP_MAX px per frame - no jump
          let mx = (goal.x - d.x) * ASSIST.EASE, my = (goal.y - d.y) * ASSIST.EASE; const ml2 = Math.hypot(mx, my); if (ml2 > ASSIST.TIP_MAX) { mx *= ASSIST.TIP_MAX / ml2; my *= ASSIST.TIP_MAX / ml2; }
          d.x += mx; d.y += my; view.tipEasing = ok || Math.hypot(goal.x - d.x, goal.y - d.y) > 1.5;
        }
        view.tipDraw = d;
        if (geo && geo.pts.length && !ok) { const e = geo.pts[geo.pts.length - 1]; g.lineStyle(3, col, .8); g.lineBetween(e.x, e.y, d.x, d.y); }
        if (ok) { g.lineStyle(2, 0x2fd27a, .6); g.lineBetween(view.tip.x, view.tip.y, d.x, d.y); }          // a thin tether from the finger to the connection it is attracted to
        g.fillStyle(col, .35); g.fillCircle(d.x, d.y, ok ? 11 : 15); g.lineStyle(3, col, .95); g.strokeCircle(d.x, d.y, ok ? 11 : 15);
        if (view.bad && view.bad.n) { const q = nodePoint(view.bad.n); g.lineStyle(2, 0xff5a4f, .55); g.strokeEllipse(q.x, q.y, 46, 23); }
        if (ok && ui.b) { const n = game.nodeById(ui.b); if (n) { const q = nodePoint(n), pu = .5 + .5 * Math.sin(t / 140); g.lineStyle(2.5, 0x2fd27a, .5 + .4 * pu); g.strokeEllipse(q.x, q.y, n.kind === 'b' ? 92 + 8 * pu : 40 + 6 * pu, n.kind === 'b' ? 46 + 4 * pu : 20 + 3 * pu); } }
      }
      if (this.flash) { const f = (t - this.flash.t0) / 420, n = game.nodeById(this.flash.id); if (f >= 1 || !n) this.flash = null; else {
        g.lineStyle(5, 0xfff3c4, 1 - f); if (n.kind === 'b') { const [fw, fh] = game.footprintOf(n.b.type), c = tc(n.b.x + (fw - 1) / 2, n.b.y + (fh - 1) / 2); g.strokeEllipse(c.x, c.y, (fw * 64 + 30) * (1 + .25 * f), (fh * 32 + 15) * (1 + .25 * f)); }
        else { const c = tc(n.x, n.y); g.strokeEllipse(c.x, c.y, 40 * (1 + .4 * f), 20 * (1 + .4 * f)); } } }
      if (this.ripple) { const f = (t - this.ripple.t0) / 320; if (f >= 1) this.ripple = null; else { g.lineStyle(3 / view.cam.zoom, 0xffffff, .7 * (1 - f)); g.strokeEllipse(this.ripple.x, this.ripple.y, (16 + 40 * f) / view.cam.zoom * 1.6, (8 + 20 * f) / view.cam.zoom * 1.6); } }
      for (const b of game.buildings) if (b.type === 'tank') {                   // fill bar above each tank (real inventory)
        const p = tc(b.x + .5, b.y + .5), f = clamp(b.amt / game.tankCap(b), 0, 1);
        const by = p.y - 96; g.fillStyle(0x0d1620, .8); g.fillRoundedRect(p.x - 20, by, 40, 7, 3.5); if (f > .01) { g.fillStyle(f > .95 ? 0xff5a4f : f > .75 ? 0xffb41f : 0x2fd27a, 1); g.fillRoundedRect(p.x - 19, by + 1, Math.max(5, 38 * f), 5, 2.5); }
      }
    }
  }

  /* ---------- drawing helpers ---------- */
  function spriteKey(b) {
    if (b.type === 'tank') return ['tank1', 'tank2', 'tank3'][clamp((b.level || 1) - 1, 0, 2)];
    if (b.type === 'pump') return (b.dir || 0) < 2 ? 'pumpX' : 'pumpY';
    return b.kind === 'large' ? 'wellL' : b.kind === 'medium' ? 'wellM' : (b.id & 1) ? 'wellS2' : 'wellS';
  }
  const PUMP_MAIN_SCALE = 1.2;
  function placeSprite(s, type, x, y, b) {
    const src = s.texture.getSourceImage(), ar = src.height / src.width;
    if (type === 'tank') { const dw = [138, 154, 166][clamp(((b && b.level) || 1) - 1, 0, 2)], dh = dw * ar, gx = (x - y) * 32, gy = (x + y + 2) * 16 + 5; s.setDisplaySize(dw, dh).setOrigin(.5, (dh - dw * .22) / dh).setPosition(gx, gy).setDepth(10 + gy); }
    else if (type === 'pump') {                                                 // inline pump: the pipe axis of the picture passes exactly through the tile centre (origin = that point), 2x texture shown at half size
      const P = (window.ART && ART.pump) || {}, flip = s.texture.key === 'pumpY', ox = (P.px != null ? (flip ? P.w - P.px : P.px) / P.w : .5), oy = P.py != null ? P.py / P.h : .6, p = tc(x, y);
      const pt = b && b.hadPipe ? b.hadPipe[2] : game.pipeType[idx(x, y)], f = pt ? PUMP_MAIN_SCALE : 1;      // on a main pipe the picture is a little bigger: its flanges then cover the join to the thicker pipe
      s.setDisplaySize(src.width / 2 * f, src.height / 2 * f).setOrigin(ox, oy).setPosition(p.x, p.y).setDepth(10 + p.y + 52);   // above the pipe pieces on both sides (they are drawn at 26 + their y), so the pump body covers them and the pipes continue from its flanges
    }
    else { const dw = { large: 118, medium: 108 }[b && b.kind] || 96, dh = dw * ar, p = tc(x, y), gy = p.y + 6; s.setDisplaySize(dw, dh).setOrigin(.5, (dh - dw * .2) / dh).setPosition(p.x, gy).setDepth(10 + gy); }
  }
  // one tile's piece: dark outline, steel body, light top line. Butt ends: pieces meet on a straight part, end to end, with no seam; inside a curve the joins are filled.
  const LAYERS = [[16, 0x23282e], [11.5, 0x4b535c]];
  function drawPiece(g, pc, sc, tint, alpha) {
    const P = pc.pts;
    const layers = tint ? [[17, tint, .45], [11.5, tint, .85]] : LAYERS.map(l => [l[0], l[1], 1]);
    for (const [w0, c, a] of layers) {
      const w = w0 * sc; g.lineStyle(w, c, a * alpha); g.beginPath(); g.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length; i++) g.lineTo(P[i].x, P[i].y); g.strokePath();
      if (P.length > 2) { g.fillStyle(c, a * alpha); for (let i = 1; i < P.length - 1; i++) g.fillCircle(P[i].x, P[i].y, w / 2); }
    }
    if (!tint) { g.lineStyle(3 * sc, 0x8e98a3, alpha); g.beginPath(); g.moveTo(P[0].x, P[0].y - 3 * sc); for (let i = 1; i < P.length; i++) g.lineTo(P[i].x, P[i].y - 3 * sc); g.strokePath(); }
  }
  const unit = (p, q) => { const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; };
  // a bolted collar ACROSS the pipe (perpendicular to it) at p
  function collar(g, p, d, sc, big) {
    const nx = -d.y, ny = d.x, r = (big ? 11.5 : 9.5) * sc, w = big ? 7 : 5;
    g.lineStyle(w + 2.5, 0x23282e, 1); g.lineBetween(p.x - nx * r, p.y - ny * r, p.x + nx * r, p.y + ny * r);
    g.lineStyle(w, 0xf5a30c, 1); g.lineBetween(p.x - nx * (r - 1.2), p.y - ny * (r - 1.2), p.x + nx * (r - 1.2), p.y + ny * (r - 1.2));
  }
  function collarAt(g, P, sc) { const c = P[Math.floor(P.length / 2)], d = unit(P[0], P[P.length - 1]); collar(g, c, d, sc, false); }
  // the fitting at a pipe end: a flange exactly ON the building's connection point, or a cap on an open end (a junction end is covered by the hub)
  function endFitting(g, geo, atStart, sc) {
    const P = geo.pts, n = P.length, p = atStart ? P[0] : P[n - 1], q = atStart ? P[1] : P[n - 2], node = atStart ? geo.startNode : geo.endNode, cap = atStart ? geo.startCap : geo.endCap;
    if (node && node[0] === 'B') { const d = unit(q, p); collar(g, { x: p.x - d.x * 3, y: p.y - d.y * 3 }, d, sc, true); }
    else if (cap) { g.fillStyle(0x23282e, 1); g.fillCircle(p.x, p.y, 8.5 * sc); g.fillStyle(0x5a636d, 1); g.fillCircle(p.x, p.y, 5.5 * sc); }
  }
  function drawHub(g, p) { g.fillStyle(0x23282e, 1); g.fillCircle(p.x, p.y, 11); g.fillStyle(0x5a636d, 1); g.fillCircle(p.x, p.y, 8); g.lineStyle(2.6, 0xf5a30c, 1); g.strokeCircle(p.x, p.y, 11); g.lineStyle(2.4, 0xd6291d, 1); g.strokeEllipse(p.x, p.y - 10, 15, 7); }
  function measure(geo) { geo.cum = [0]; for (let i = 1; i < geo.pts.length; i++) geo.cum.push(geo.cum[i - 1] + Math.hypot(geo.pts[i].x - geo.pts[i - 1].x, geo.pts[i].y - geo.pts[i - 1].y)); geo.len = geo.cum[geo.cum.length - 1]; }
  /* the oil animation reads the simulation: a pipe is cut into stretches where the flow is the same (between two graph nodes); each stretch gets
     its currentFlow, its direction along the pipe (+1 = from end a to end b) and a dot speed proportional to the flow */
  const FLOW_PX = 4.5, FLOW_PX_MAX = 240;                        // screen px/s per bbl/min of real flow (0 flow = no movement)
  const flowSpeed = f => Math.min(FLOW_PX_MAX, FLOW_PX * Math.max(0, f || 0));
  function flowStretches(L) {
    const net = game.net, cells = L.cells, n = cells.length, out = [];
    const key = k => { const sg = game.graphSegment(k); return sg ? sg.id : 'N' + k; };
    const dirAt = m => { const f = net.fnext[cells[m]]; if (f < 0) return 0; if (m + 1 < n && f === cells[m + 1]) return 1; if (m > 0 && f === cells[m - 1]) return -1; return m === n - 1 ? 1 : m === 0 ? -1 : 0; };
    for (let i = 0; i < n;) {
      const id = key(cells[i]); let j = i; while (j + 1 < n && key(cells[j + 1]) === id) j++;
      let flow = 0, cap = Infinity, dir = 0;
      for (let m = i; m <= j; m++) { const k = cells[m]; if (net.live[k] !== 1) { flow = 0; break; } flow = Math.max(flow, net.flowK[k] || 0); cap = Math.min(cap, game.pipeCapacity(k)); if (!dir) dir = dirAt(m); }
      if (flow <= 1e-3) flow = 0;
      out.push({ i0: i, i1: j, flow, dir: flow ? dir || 1 : 0, speed: flowSpeed(flow), usage: cap > 0 && cap < Infinity ? flow / cap : 0 });
      i = j + 1;
    }
    return out;
  }
  function pointAt(geo, d) { let i = 1; while (i < geo.cum.length - 1 && geo.cum[i] < d) i++; const a = geo.pts[i - 1], b = geo.pts[i], s = geo.cum[i] - geo.cum[i - 1] || 1, f = clamp((d - geo.cum[i - 1]) / s, 0, 1); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; }
  function footprint(g, b, col, a) {
    const [fw, fh] = game.footprintOf(b.type), p0 = { x: (b.x - b.y) * 32, y: (b.x + b.y) * 16 };
    const pts = [p0, { x: p0.x + fw * 32, y: p0.y + fw * 16 }, { x: p0.x + fw * 32 - fh * 32, y: p0.y + fw * 16 + fh * 16 }, { x: p0.x - fh * 32, y: p0.y + fh * 16 }];
    view.scene.markG.lineStyle(3, col, a); view.scene.markG.strokePoints(pts, true, true);
  }
  function ring(g, p, col, a) { g.lineStyle(3, col, a); g.strokeEllipse(p.x, p.y, 34, 17); }

  /* ---------- input: one pipeline for touch and mouse. 1 finger = pan, 2 fingers = pinch, a tap (moved < 10 px) = an action ---------- */
  /* ---------- camera: our own exact math (no stale matrix), strict bounds, zoom limits ---------- */
  const Z_MAX = 1.8, Z_MIN_ABS = .45, TAP_PX = 12, PICK_PX = 34;
  // construction assist (world pixels; one tile is ~36 world px). The ONLY place these numbers live.
  const ASSIST = {
    SNAP_NORMAL: 56,        // a valid target this close to the finger (or its edge) can attract the pipe
    SNAP_STRONG: 28,        // this close: it wins regardless of the drag direction
    KEEP: 1.3,              // hysteresis: the current target stays while the finger is within KEEP x SNAP_NORMAL (no flicker between two targets)
    DIR_WEIGHT: .6,         // how much the drag direction counts against plain distance
    CANDIDATES: 4,          // at most this many targets get a real route check per finger tile (cheap, never per frame)
    EASE: .35,              // per-frame easing of the drawn pipe tip toward an acquired target (visual only)
    TIP_MAX: 16,            // the drawn pipe end moves at most this many world px per frame while it glides to / from a target
    BEHIND: -.3,            // a target behind the moving finger (cos below this) and not under it is ignored
    PLACE_RADIUS: 2,        // a building preview is pulled to a valid tile within this many tiles
    PLACE_KEEP: 1.25        // a snapped preview stays on its spot while the finger is within this x the radius (no flicker)
  };
  const camApi = {
    // world point under a screen point, from the CURRENT scroll / zoom (Phaser zooms about the view centre)
    s2w(sx, sy) { const c = view.cam; return { x: c.scrollX + c.width / 2 + (sx - c.width / 2) / c.zoom, y: c.scrollY + c.height / 2 + (sy - c.height / 2) / c.zoom }; },
    w2s(wx, wy) { const c = view.cam; return { x: (wx - c.scrollX - c.width / 2) * c.zoom + c.width / 2, y: (wy - c.scrollY - c.height / 2) * c.zoom + c.height / 2 }; },
    minZoom() { const c = view.cam, B = view.bounds; return Math.min(c.width / B.w, c.height / B.h); },     // zoom out until the WHOLE map fits on the screen
    setZoomAt(z, sx, sy, wx, wy) {                                    // zoom with the world point (wx, wy) staying exactly under the screen point (sx, sy)
      const c = view.cam; z = clamp(z, camApi.minZoom(), Z_MAX); c.setZoom(z);
      c.setScroll(wx - c.width / 2 - (sx - c.width / 2) / z, wy - c.height / 2 - (sy - c.height / 2) / z); camApi.clamp();
    },
    clamp() {                                                         // strict bounds: the view always stays inside the playable world
      const c = view.cam, B = view.bounds, vw = c.width / c.zoom, vh = c.height / c.zoom;
      const ax = c.scrollX + c.width / 2, ay = c.scrollY + c.height / 2;
      const cx = vw >= B.w ? B.x + B.w / 2 : clamp(ax, B.x + vw / 2, B.x + B.w - vw / 2), cy = vh >= B.h ? B.y + B.h / 2 : clamp(ay, B.y + vh / 2, B.y + B.h - vh / 2);   // a view larger than the world keeps the world centred
      c.setScroll(cx - c.width / 2, cy - c.height / 2);
    },
    follow(w, sx, sy) { const c = view.cam; c.setScroll(w.x - c.width / 2 - (sx - c.width / 2) / c.zoom, w.y - c.height / 2 - (sy - c.height / 2) / c.zoom); camApi.clamp(); },
    focus(wx, wy, ms = 450) {                                         // smooth glide to a point (never a teleport); a new touch cancels it, and it never starts while a finger is on the map
      if (touch.busy()) return;
      const c = view.cam, sx0 = c.scrollX, sy0 = c.scrollY, tx = wx - c.width / 2, ty = wy - c.height / 2, t0 = view.scene.time.now;
      view.glide = t => { const f = clamp((t - t0) / ms, 0, 1), e = f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2; c.setScroll(sx0 + (tx - sx0) * e, sy0 + (ty - sy0) * e); camApi.clamp(); if (f >= 1) view.glide = null; };
    }
  };
  /* ---------- Touch controller: the ONLY place touch / mouse input is handled (Phaser pointers; no DOM touch handlers on the map).
     One state at a time:
       IDLE          no finger on the map
       PAN           one finger on empty map (or on a building that is not selected): the map moves 1:1 with the finger, from the first pixel.
                     Lifted after moving less than TAP_PX in total (and never pinched) = a tap (select). A drag never becomes a tap.
       PINCH         two fingers: zoom about their midpoint; the world point under the midpoint stays under it
       PIPE_DRAG     finger down on a connection with the pipe tool: only the pipe follows the finger, the camera never moves
       BUILDING_DRAG finger down with a building tool (new building), or on the SELECTED well / tank (move it): only the building follows
     Transitions: PAN + 2nd finger -> PINCH (fresh snapshot). PINCH - one finger -> PAN from that finger's CURRENT position (no stale delta).
     PIPE_DRAG / BUILDING_DRAG + 2nd finger before the first one moved -> the drag is cancelled, PINCH. After it moved, extra fingers are ignored.
     Camera maths after rex CameraController (PanScroll + PinchZoom), MIT License, Copyright (c) 2018 Rex - https://github.com/rexrainbow/phaser3-rex-notes :
       pan:   scroll -= fingerDelta / zoom             (incremental: at a map edge the clamp never leaves a dead zone)
       pinch: zoom *= distance / previousDistance;  scroll so the focus world point is under the current midpoint (incremental too) ---------- */
  const TOUCH = { IDLE: 'IDLE', PAN: 'PAN', PINCH: 'PINCH', PIPE_DRAG: 'PIPE_DRAG', BUILDING_DRAG: 'BUILDING_DRAG', BUILDING_PLACEMENT: 'BUILDING_PLACEMENT' };
  /* BUILDING_PLACEMENT (Phase B) = a building tool is armed (well / tank / pump) and no finger is on the map. It is the resting state while placing:
     touch -> BUILDING_DRAG (preview follows the finger) -> release (valid = build) -> back to BUILDING_PLACEMENT or IDLE. It never moves the camera. */
  const touch = { state: TOUCH.IDLE, log: [] };
  const restState = () => (ui.tool && ui.tool !== 'pipe' ? TOUCH.BUILDING_PLACEMENT : TOUCH.IDLE);
  touch.busy = () => touch.state !== TOUCH.IDLE && touch.state !== TOUCH.BUILDING_PLACEMENT;      // a finger is on the map
  touch.sync = () => { if (!touch.busy()) { const r = restState(); if (r !== touch.state) { touch.log.push(touch.state + '>' + r); if (touch.log.length > 40) touch.log.shift(); touch.state = r; } } };
  function setupInput(scene) {
    const cam = view.cam, ptr = new Map();        // pointer id -> { x, y, px, py (previous), sx, sy (where it went down) }
    let g = null;                                  // the gesture of the current state
    const go = (state, data) => { touch.log.push(touch.state + '>' + state); if (touch.log.length > 40) touch.log.shift(); touch.state = state; g = data || null; };
    const two = () => { const a = [...ptr.values()]; return [a[0], a[1]]; };
    const panScroll = (dx, dy) => { cam.setScroll(cam.scrollX - dx / cam.zoom, cam.scrollY - dy / cam.zoom); camApi.clamp(); };
    const startPinch = () => {                      // a fresh snapshot: nothing from the previous gesture is reused
      const [a, b] = two(), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      go(TOUCH.PINCH, { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, focus: camApi.s2w(mx, my), moved: true }); scene.ripple = null;
    };
    const startPan = (id, q, moved) => { q.px = q.x; q.py = q.y; go(TOUCH.PAN, { id, moved: !!moved }); };
    scene.input.on('pointerdown', p => {
      view.glide = null;
      ptr.set(p.id, { x: p.x, y: p.y, px: p.x, py: p.y, sx: p.x, sy: p.y });
      if (ptr.size === 1) {
        const w = camApi.s2w(p.x, p.y), cell = toTile(w.x, w.y);
        scene.ripple = { x: w.x, y: w.y, t0: scene.time.now };
        if (ui.tool === 'pipe') {
          const n = pickNode(cell, w, p);
          if (ui.a && !ui.dragging && (!n || n.id !== ui.a)) { go(TOUCH.PIPE_DRAG, { id: p.id, moved: false }); ui.dragging = true; ui.dragKey = ''; ui.routeCache = new Map(); pipeDragMove(p); return; }   // a pipe is attached already: this touch continues it
          if (n) { go(TOUCH.PIPE_DRAG, { id: p.id, moved: false }); pipeDragStart(n); return; }                                                                             // grab a connection: a new pipe starts here
        }
        if (ui.tool && ui.tool !== 'pipe') { go(TOUCH.BUILDING_DRAG, { id: p.id, kind: 'new', before: ui.pending ? { x: ui.pending.x, y: ui.pending.y } : null, moved: false }); placeAt(cell, w); return; }
        if (!ui.tool && ui.sel && ui.sel.kind === 'b') {                                                     // touching the SELECTED well / tank grabs it to move it
          const b = game.buildings.find(q => q.id === ui.sel.id), n = b && (b.type === 'well' || b.type === 'tank') ? pickNode(cell, w, p) : null;
          if (n && n.kind === 'b' && n.b === b) { go(TOUCH.BUILDING_DRAG, { id: p.id, kind: 'move', moved: false }); moveStart(b, cell); return; }
        }
        startPan(p.id, ptr.get(p.id), false);
        return;
      }
      if (ptr.size === 2) {
        if (touch.state === TOUCH.PAN) return startPinch();
        if (touch.state === TOUCH.PIPE_DRAG && !g.moved) { pipeDragEnd(true); return startPinch(); }
        if (touch.state === TOUCH.BUILDING_DRAG && !g.moved) { if (g.kind === 'move') moveEnd(true); else { ui.pending = g.before; showGhost(); updateConfirm(); } return startPinch(); }
      }
      // a third finger, or a second one during a drag that already moved: ignored
    });
    scene.input.on('pointermove', p => {
      const q = ptr.get(p.id); if (!q || !p.isDown) return;
      q.px = q.x; q.py = q.y; q.x = p.x; q.y = p.y;
      if (touch.state === TOUCH.PINCH) {
        if (ptr.size < 2) return;
        const [a, b] = two(); if (p.id !== [...ptr.keys()][0] && p.id !== [...ptr.keys()][1]) return;
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        camApi.setZoomAt(cam.zoom * d / g.d, mx, my, g.focus.x, g.focus.y);              // zoom about the midpoint; the focus world point follows the midpoint (two-finger pan too)
        g.d = d; g.focus = camApi.s2w(mx, my);                                              // incremental: after a clamp (zoom limit / map edge) nothing is owed, so nothing jumps
        return;
      }
      if (!g || g.id !== p.id) return;
      if (Math.hypot(p.x - q.sx, p.y - q.sy) > TAP_PX) g.moved = true;
      if (touch.state === TOUCH.PAN) { panScroll(q.x - q.px, q.y - q.py); if (g.moved) scene.ripple = null; return; }   // 1:1 with the finger
      if (touch.state === TOUCH.PIPE_DRAG) { pipeDragMove(p); return; }
      if (touch.state === TOUCH.BUILDING_DRAG) { const w = camApi.s2w(p.x, p.y), c = toTile(w.x, w.y); if (g.kind === 'move') moveTo(c); else placeAt(c, w); }
    });
    const up = p => {
      const q = ptr.get(p.id); if (!q) return; ptr.delete(p.id);
      const st = touch.state, d = g;
      if (st === TOUCH.PINCH) {
        if (ptr.size >= 2) return startPinch();                                            // three fingers -> two: a new snapshot
        if (ptr.size === 1) { const [id, r] = [...ptr.entries()][0]; return startPan(id, r, true); }   // continue as PAN from where that finger IS now
        return go(restState());
      }
      if (!d || d.id !== p.id) return;
      go(restState());                                                                      // fingers that remain belong to no gesture: ignored until lifted
      if (st === TOUCH.PIPE_DRAG) return pipeDragEnd();
      if (st === TOUCH.BUILDING_DRAG) { if (d.kind === 'move') moveEnd(false); else placeRelease(); return; }
      if (st === TOUCH.PAN && !d.moved) { const w = camApi.s2w(p.x, p.y); onTap(toTile(w.x, w.y), w, p); }   // a drag never turns into a tap
    };
    scene.input.on('pointerup', up); scene.input.on('pointerupoutside', up);
    scene.input.on('wheel', (p, o, dx, dy) => { const w = camApi.s2w(p.x, p.y); camApi.setZoomAt(cam.zoom * (dy > 0 ? .9 : 1.1), p.x, p.y, w.x, w.y); });
    window.addEventListener('blur', () => { ptr.clear(); if (touch.state === TOUCH.PIPE_DRAG) pipeDragEnd(true); if (touch.state === TOUCH.BUILDING_DRAG && g && g.kind === 'move') moveEnd(true); go(restState()); });
    scene.scale.on('resize', () => camApi.clamp());
    document.addEventListener('contextmenu', e => e.preventDefault());           // a long press never opens a menu
    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  }
  /* moving the selected well / tank: the sprite follows the finger (keeping the spot where it was grabbed), green = can go there, red = cannot;
     release on a valid spot = core.moveBuilding (same rules as building there); otherwise it stays where it was */
  function moveStart(b, cell) { game.beginMove(b.id); ui.move = { id: b.id, dx: cell.x - b.x, dy: cell.y - b.y, x: b.x, y: b.y, ok: false, reason: 'sameSpot' }; }
  function moveTo(cell) {
    const m = ui.move; if (!m) return; const x = cell.x - m.dx, y = cell.y - m.dy; if (x === m.x && y === m.y) return;
    const r = game.canMove(m.id, x, y); m.x = x; m.y = y; m.ok = !!r.ok; m.reason = r.reason;
  }
  function moveEnd(abort) {
    const m = ui.move; ui.move = null; game.endMove(); if (!m) return;
    if (!abort && m.ok) { const r = game.moveBuilding(m.id, m.x, m.y); if (r.ok) { toast(T('تم نقل المبنى'), 'good'); buzz(20); renderPanel(); save(); return; } m.reason = r.reason; }
    if (!abort && m.reason && m.reason !== 'sameSpot') toast(why(m.reason), 'bad');
  }

  /* ---------- pipe dragging: grab a connection, the pipe follows the finger, the route updates live, release builds ---------- */
  function pipeDragStart(n) {
    ui.a = n.id; ui.b = null; ui.route = null; ui.dragging = true; ui.dragKey = ''; ui.routeCache = new Map(); view.tipDraw = null; view.tipEasing = false; view.bad = null; view.motion = null; view.tip = null;
    view.scene.flash = { id: n.id, t0: view.scene.time.now };
    drawPreview(); updateConfirm(); setHint(T('اسحب الأنبوب إلى خزان أو أنبوب أو مضخة، ثم ارفع إصبعك'));
  }
  /* ---------- magnetic assist: which connection is the player dragging TOWARD? ----------
     Candidates = connection nodes near the finger: buildings (measured to their footprint edge) and pipe tiles (junction / pipe end).
     Score = distance / SNAP_NORMAL + DIR_WEIGHT x (1 - cos(angle between the drag direction and the direction to the candidate)).
     Only VALID targets can attract: each of the best few gets a real route check (core.routeNodes, cached for this drag) and the first
     valid one wins. The current target is kept while the finger stays within KEEP x SNAP_NORMAL (no flicker). Invalid targets never attract. */
  const nodePoint = n => n.kind === 'b' ? (() => { const [fw, fh] = game.footprintOf(n.b.type); return tc(n.b.x + (fw - 1) / 2, n.b.y + (fh - 1) / 2); })() : tc(n.x, n.y);
  const nodeReach = n => n.kind === 'b' ? game.footprintOf(n.b.type)[0] * 26 : 0;            // a building is "reached" at its edge, not only its centre
  // the networks a node already belongs to (a pipe tile: its network; a building: the networks of the pipes touching it)
  function nodeNets(n) {
    const out = new Set(), add = k => { const c = game.net.compOf[k]; if (c >= 0 && game.pipe[k]) out.add(c); };
    if (n.kind === 'j') add(n.k);
    else for (const k of game.cellsOf(n.b)) { const x = k % W, y = (k / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(x + dx, y + dy)) add(idx(x + dx, y + dy)); }
    return out;
  }
  function routeTo(id) { const c = ui.routeCache; if (!c.has(id)) c.set(id, game.routeNodes(ui.a, id, ui.ptype)); return c.get(id); }
  function magnetTarget(w) {
    const A = game.nodeById(ui.a); if (!A) return { target: null };
    const start = nodePoint(A), mv = view.motion && Math.hypot(view.motion.x, view.motion.y) > 3 ? view.motion : { x: w.x - start.x, y: w.y - start.y };   // the direction the finger is MOVING (fallback: start -> finger)
    const ml = Math.hypot(mv.x, mv.y) || 1;
    const cell = toTile(w.x, w.y), R = Math.ceil(ASSIST.SNAP_NORMAL * ASSIST.KEEP / 30) + 2, seen = new Set(), cand = [];
    const startNets = nodeNets(A); let sawSame = null;
    const sameNet = n => { if (!startNets.size) return false; for (const c of nodeNets(n)) if (startNets.has(c)) return true; return false; };
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const n = game.nodeAt(cell.x + dx, cell.y + dy); if (!n || n.id === ui.a || seen.has(n.id)) continue; seen.add(n.id);
      if (sameNet(n)) { if (!sawSame) sawSame = n; continue; }                     // already joined to the start through the network: a second link would be a duplicate / loop
      const q = nodePoint(n), d = Math.max(0, Math.hypot(q.x - w.x, q.y - w.y) - nodeReach(n)), keep = n.id === ui.b ? ASSIST.SNAP_NORMAL * ASSIST.KEEP : ASSIST.SNAP_NORMAL;
      if (d > keep) continue;
      const to = { x: q.x - w.x, y: q.y - w.y }, tl = Math.hypot(to.x, to.y), inside = tl <= nodeReach(n) + 8;
      const cos = inside ? 1 : (to.x * mv.x + to.y * mv.y) / ((tl || 1) * ml);    // ahead of the moving finger = 1, beside = 0, behind (already passed) = -1
      if (!inside && cos < ASSIST.BEHIND) continue;                                // the finger has passed it and is moving away: that is not where the player wants to go
      let score = d / ASSIST.SNAP_NORMAL + ASSIST.DIR_WEIGHT * (1 - cos);
      if (d <= ASSIST.SNAP_STRONG && cos > -.2) score -= 2;                       // strong snap: right at the finger and not behind it
      if (n.id === ui.b) score -= .35;                                            // the current target is sticky
      if (n.kind === 'j') score += .15;                                           // a building beats a pipe at the same spot
      cand.push({ n, score, d });
    }
    cand.sort((a, b) => a.score - b.score);
    let bad = null;
    for (const c of cand.slice(0, ASSIST.CANDIDATES)) { const r = routeTo(c.n.id); if (r.ok) return { target: c.n, route: r, d: c.d }; if (!bad) bad = { n: c.n, reason: r.reason }; }
    if (!bad && sawSame) { const q = nodePoint(sawSame); if (Math.max(0, Math.hypot(q.x - w.x, q.y - w.y) - nodeReach(sawSame)) <= ASSIST.SNAP_NORMAL) bad = { n: sawSame, reason: 'sameNet' }; }   // say why it does not attract
    return { target: null, bad };
  }
  function pipeDragMove(p) {
    if (!ui.a) return;
    const w = camApi.s2w(p.x, p.y), cell = toTile(w.x, w.y);
    if (view.tip) { const dx = w.x - view.tip.x, dy = w.y - view.tip.y; if (Math.hypot(dx, dy) > 2) { const m = view.motion || { x: dx, y: dy }; view.motion = { x: m.x * .6 + dx * .4, y: m.y * .6 + dy * .4 }; } }   // smoothed finger direction
    view.tip = w;
    const key = cell.x + ',' + cell.y + (ui.b ? ':' + ui.b : '');               // targets are re-ranked only when the finger enters another tile (cheap, never per frame)
    if (key === ui.dragKey) return; ui.dragKey = key;
    const m = magnetTarget(w);
    view.bad = m.bad && !m.target ? m.bad : null;
    if (m.target) {
      if (ui.b !== m.target.id) { view.scene.flash = { id: m.target.id, t0: view.scene.time.now }; buzz(12); }     // target acquired: a short pulse (and a tiny vibration)
      ui.b = m.target.id; ui.route = m.route;                                      // the route auto-completes to the exact node
    } else { ui.b = null; ui.route = freeRoute(ui.a, cell); }
    drawPreview(); liveLabel();
  }
  // the pipe from the start node toward a plain tile (not a node yet): cheap judge only (no network rebuild), shown so the pipe follows the finger
  function freeRoute(aId, cell) {
    const A = game.nodeById(aId); if (!A || !inb(cell.x, cell.y)) return { ok: false, reason: 'needTarget', cells: [], fresh: [], cost: 0, a: aId, b: null };
    const ports = game.nodePorts(A); if (!ports.length) return { ok: false, reason: 'noPort', cells: [], fresh: [], cost: 0, a: aId, b: null };
    let port = ports[0], bd = 1e9; for (const q of ports) { const d = Math.abs(q[0] - cell.x) + Math.abs(q[1] - cell.y); if (d < bd) { bd = d; port = q; } }
    const L = xf => { const out = [[port[0], port[1]]]; let x = port[0], y = port[1]; const sx = () => { while (x !== cell.x) { x += Math.sign(cell.x - x); out.push([x, y]); } }, sy = () => { while (y !== cell.y) { y += Math.sign(cell.y - y); out.push([x, y]); } }; if (xf) { sx(); sy(); } else { sy(); sx(); } return out; };
    const r1 = game.evalRoute(L(Math.abs(cell.x - port[0]) >= Math.abs(cell.y - port[1])), ui.ptype), r = r1.ok ? r1 : (() => { const r2 = game.evalRoute(L(Math.abs(cell.x - port[0]) < Math.abs(cell.y - port[1])), ui.ptype); return r2.ok ? r2 : r1; })();
    return Object.assign({}, r, { a: aId, b: null, free: true, clear: r.ok, ok: false, reason: r.ok ? 'needTarget' : r.reason });
  }
  function liveLabel() {
    const r = ui.route; if (!r) return;
    if (r.ok) setHint((game.s.cash < r.cost ? why('cash') + ' · ' : T('ارفع إصبعك للتوصيل بـ') + nodeName(game.nodeById(ui.b)) + ' · ') + r.fresh.length + T(' قطعة · ') + money(r.cost));
    else setHint(view.bad ? why(view.bad.reason) + ' (' + nodeName(view.bad.n) + ')' : r.free && r.clear ? T('ارفع لبناء أنبوب بطرف مفتوح · ') + r.fresh.length + T(' قطعة · ') + money(r.cost) + T(' — أو اسحب نحو خزان/أنبوب') : why(r.reason));
  }
  function pipeDragEnd(abort) {
    const tipW = view.tip; ui.dragging = false; view.tip = null;
    const r = ui.route;
    if (!abort && tipW && ui.a) {                                                // released back on the start point = cancel (nothing built, nothing paid)
      const A = game.nodeById(ui.a), q = A ? nodePoint(A) : null;
      if (q && Math.hypot(q.x - tipW.x, q.y - tipW.y) <= nodeReach(A) + ASSIST.SNAP_STRONG) { toast(T('أُلغي الأنبوب'), ''); cancel(); updateHint(); return; }
    }
    if (!abort && r && r.ok && ui.b && game.s.cash >= r.cost) {                // valid: build right away (one transaction, exactly the previewed route)
      const res = game.buildLine(r);
      if (res.ok) {
        toast(T('تم بناء الأنبوب · ') + res.segments + T(' قطعة · ') + money(res.cost), 'good');
        view.scene.netSig = ''; view.scene.drawPipes(); view.scene.buildFx = res.line ? { id: res.line.id, t0: view.scene.time.now } : null; buzz(30);
        ui.a = ui.b = null; ui.route = null; ui.dragKey = ''; view.scene.prevG.clear(); view.scene.previewGeom = null; updateConfirm(); setHint(T('المس بئراً أو خزاناً أو أنبوباً واسحب أنبوباً جديداً')); save(); return;
      }
      ui.route = Object.assign({}, r, { ok: false, reason: res.reason });
    }
    if (!abort && r && r.free && r.clear && r.cells && r.cells.length > 1 && game.s.cash >= r.cost) {   // free ground, clear path: build the pipe with an OPEN end
      const res = game.buildRoute({ ok: true, cells: r.cells }, ui.ptype);
      if (res.ok) {
        toast(T('أنبوب بطرف مفتوح · ') + res.segments + T(' قطعة · ') + money(res.cost) + T(' · يمكن إكماله لاحقاً من طرفه'), 'good');
        view.scene.netSig = ''; view.scene.drawPipes(); view.scene.buildFx = res.line ? { id: res.line.id, t0: view.scene.time.now } : null;
        cancel(); updateHint(); save(); return;
      }
      ui.route = Object.assign({}, r, { clear: false, reason: res.reason });
    }
    // not valid: nothing is built or charged and the pipe goes back where it came from (no preview, no attached start); the pipe tool stays on
    if (r && !abort) toast((r.ok || (r.free && r.clear)) && game.s.cash < r.cost ? why('cash') : r.free && r.clear ? T('لم يُبنَ شيء: الأنبوب قصير جداً') : why(r.reason), 'bad');
    cancel(); updateHint();
  }
  /* Building preview under the finger (Phase B). Exact tile when it is valid; otherwise the best valid tile within PLACE_RADIUS: score = distance
     - a bonus for touching an open pipe end (a compatible connection); invalid tiles never attract. Hysteresis: a snapped spot is kept while it stays valid and
     within PLACE_KEEP x the radius, so the preview does not flicker between two spots. Nothing here touches the simulation or the network. */
  function placeAt(cell, w) {
    if (!inb(cell.x, cell.y)) return; let c = cell, snapped = false;
    if (!game.canPlace(ui.tool, c.x, c.y).ok) {
      const u = w ? w.x / 32 : cell.x, v = w ? w.y / 16 : cell.y, hint = w ? { fx: (u + v) / 2 - .5, fy: (v - u) / 2 - .5 } : null, keep = ui.pending;
      const best = game.snapPlacement(ui.tool, c.x, c.y, ASSIST.PLACE_RADIUS, hint);
      if (best) { c = { x: best.x, y: best.y }; snapped = true; }
      if (keep && ui.snapped && hint && !(keep.x === c.x && keep.y === c.y) && game.canPlace(ui.tool, keep.x, keep.y).ok && Math.hypot(keep.x - hint.fx, keep.y - hint.fy) <= ASSIST.PLACE_RADIUS * ASSIST.PLACE_KEEP) {
        const kc = ui.tool === 'pump' ? 0 : game.pipeContacts(ui.tool, keep.x, keep.y).filter(q => q.end).length;
        if (!best || kc >= best.compat) { c = { x: keep.x, y: keep.y }; snapped = true; }
      }
    }
    if (ui.pending && ui.pending.x === c.x && ui.pending.y === c.y) return;
    ui.snapped = snapped; ui.pending = { x: c.x, y: c.y }; showGhost(); updateConfirm(); setHint('');
  }
  function placeRelease() {                                                    // release = build when the (attracted) spot is valid; otherwise nothing happens and the reason shows
    if (!ui.pending) return; const pl = game.placement(ui.tool, ui.pending.x, ui.pending.y, ui.kind);
    if (pl.ok) { ui.lastConfirm = 0; confirmAction(); return; }
    toast(pl.state === 'UNAFFORDABLE' ? why('cash') : why(pl.reason), 'bad'); updateConfirm();
  }
  function setHint(t) { const h = $('#hint'); h.hidden = !t; if (t) h.textContent = t; }

  /* ---------- actions ---------- */
  // Touch target for a connection node: generous on screen (PICK_PX around the finger), but the node itself stays the exact logical point.
  // Order: a pipe tile right under the finger > the building whose picture is under the finger > the nearest building / pipe within PICK_PX.
  function pickNode(cell, w, p) {
    if (inb(cell.x, cell.y) && game.pipe[idx(cell.x, cell.y)]) return game.nodeAt(cell.x, cell.y);
    if (inb(cell.x, cell.y) && game.occ[idx(cell.x, cell.y)]) return game.nodeAt(cell.x, cell.y);
    let best = null, bd = 1e9;
    for (const b of game.buildings) { const s = view.scene.sprites.get(b.id); if (s && s.getBounds().contains(w.x, w.y)) { const d = Math.abs(s.y - w.y); if (d < bd) { bd = d; best = b; } } }
    if (best) return game.nodeById('B' + best.id);
    const sp = p ? { x: p.x, y: p.y } : camApi.w2s(w.x, w.y); let near = null, nd = PICK_PX;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const n = game.nodeAt(cell.x + dx, cell.y + dy); if (!n) continue;
      const c = n.kind === 'b' ? tc(n.b.x + (game.footprintOf(n.b.type)[0] - 1) / 2, n.b.y + (game.footprintOf(n.b.type)[1] - 1) / 2) : tc(n.x, n.y), q = camApi.w2s(c.x, c.y), d = Math.hypot(q.x - sp.x, q.y - sp.y) - (n.kind === 'b' ? 12 : 0);
      if (d < nd) { nd = d; near = n; }
    }
    return near;
  }
  const nodeName = n => !n ? '' : n.kind === 'j' ? T('أنبوب') : n.b.type === 'well' ? T('بئر') : n.b.type === 'tank' ? T('خزان') : T('مضخة');
  const REASON = {
    noMove: T('لا يمكن نقل هذا المبنى'), occupied: T('المكان مشغول بمنشأة أخرى'), overlap: T('المبنى يتداخل مع منشأة أخرى'), pipe: T('يوجد أنبوب في هذا المكان'), touchesPipe: T('يلامس أنبوبًا فيتصل به بالخطأ: ضعه عند طرف أنبوب مفتوح أو ابتعد'), water: T('لا يمكن البناء على الماء'), blocked: T('أرض صخرية: لا يمكن البناء هنا'), locked: T('هذه المنطقة مقفلة'), outside: T('خارج حدود الخريطة'), edge: T('المبنى يخرج عن حدود الخريطة'),
    notExplored: T('الآبار تُبنى فقط على أرض فيها نفط (البقع الداكنة)'), noOil: T('لا يوجد نفط في هذه الأرض'), depleted: T('نفد النفط في هذه الأرض'), cash: T('النقد غير كافٍ'),
    sameNode: T('اختر نقطة وصول مختلفة عن نقطة البداية'), duplicate: T('هاتان النقطتان متصلتان بأنبوب أصلاً'), badNode: T('نقطتا الاتصال غير متوافقتين'), sameNet: T('متصلان أصلاً عبر الشبكة نفسها (اتصال ثانٍ يصنع حلقة مكررة)'),
    noPort: T('لا توجد نقطة اتصال متاحة في هذا المبنى (كل جوانبه مشغولة): اختر أحد أنابيبه'), noRoute: T('لا يوجد مسار صالح بين هاتين النقطتين'),
    crossBuilding: T('المسار مسدود بمبنى'), crossPipe: T('المسار مسدود بأنبوب آخر'), pipeTouch: T('المسار مسدود: يلامس شبكة أخرى'), ambiguous: T('المسار مسدود عند نقطة الوصول'), pumpSide: T('المسار مسدود: المضخة تتصل من طرفيها فقط'),
    badLink: T('لم يُبنَ الأنبوب: نهايته لا تطابق نقطة الاتصال (لم يُخصم شيء)'), nothing: T('لا يوجد شيء هنا'), pumpSpace: T('المضخة تُبنى فوق أنبوب'), nooil: T('لا يوجد نفط في الخزانات للبيع'), pickNode: T('اضغط على بئر أو خزان أو مضخة أو أنبوب') };
  const why = r => REASON[r] || (T('تعذّر التنفيذ (') + r + ')');

  function onTap(cell, w, p) {
    if (!inb(cell.x, cell.y)) return;
    if (ui.tool === 'pipe') return tapPipe(cell, w, p);
    if (ui.tool) { ui.pending = { x: cell.x, y: cell.y }; showGhost(); updateConfirm(); return; }
    const n = pickNode(cell, w, p);                                             // select mode
    if (n && n.kind === 'b') select({ kind: 'b', id: n.b.id });
    else if (n && n.kind === 'j') { const L = game.lineAt(n.k); select(L ? { kind: 'line', id: L.id, k: n.k } : null); }
    else select(null);
  }
  function tapPipe(cell, w, p) {
    const n = pickNode(cell, w, p);
    if (!n) return toast(why('pickNode'), 'bad');
    view.scene.flash = { id: n.id, t0: view.scene.time.now };                  // short highlight on the tapped node
    if (!ui.a) { ui.a = n.id; ui.b = null; ui.route = null; toast(T('البداية: ') + nodeName(n) + T('. الآن اضغط على نقطة الوصول')); updateHint(); return; }
    if (n.id === ui.a && !ui.b) return cancel();
    if (n.id === ui.b) return;                                                  // the same destination again changes nothing; only ✓ builds
    ui.b = n.id; ui.route = game.routeNodes(ui.a, ui.b, ui.ptype);             // routing happens HERE (on a tap), never per frame
    drawPreview(); updateConfirm(); updateHint();
    if (!ui.route.ok) toast(why(ui.route.reason), 'bad'); else if (game.s.cash < ui.route.cost) toast(why('cash'), 'bad');
  }
  function drawPreview() {
    const g = view.scene.prevG; g.clear(); const r = ui.route; if (!r || !r.cells || !r.cells.length || !routeCells(r).length) return;
    const geo = pipeGeom(routeCells(r), r.a, r.b), ok = r.ok && game.s.cash >= r.cost, sc = ui.ptype ? 1.3 : 1, col = ok ? 0x2fd27a : r.free && r.clear ? 0xffd27a : 0xff5a4f;
    view.scene.previewGeom = geo;
    for (const pc of geo.pieces) drawPiece(g, pc, sc, col, 1);
  }
  function showGhost() {
    const sc = view.scene; if (sc.ghost) { sc.ghost.destroy(); sc.ghost = null; } if (sc.placeG) sc.placeG.clear();
    if (!ui.tool || ui.tool === 'pipe' || !ui.pending) return;
    const fake = { type: ui.tool, x: ui.pending.x, y: ui.pending.y, kind: ui.kind, level: 1, id: 0 }, s = sc.add.image(0, 0, spriteKey(fake));
    placeSprite(s, ui.tool, fake.x, fake.y, fake); const pl = game.placement(ui.tool, fake.x, fake.y, ui.kind); s.setAlpha(.75).setTint(pl.ok ? 0xa8ffc8 : 0xff8a80); sc.ghost = s;
    drawPlacement(pl);
  }
  // the footprint cells (the real occupancy, not the picture) and the connection points the building will have; green = can be built, red = cannot
  function drawPlacement(pl) {
    const g = view.scene.placeG; if (!g) return; g.clear(); const col = pl.ok ? 0x6fe39a : pl.state === 'UNAFFORDABLE' ? 0xffd166 : 0xff6b5f;
    for (const [cx, cy] of pl.cells) { if (!inb(cx, cy)) continue; const c = tc(cx, cy); g.fillStyle(col, .22).lineStyle(2, col, .9).beginPath().moveTo(c.x, c.y - 16).lineTo(c.x + 32, c.y).lineTo(c.x, c.y + 16).lineTo(c.x - 32, c.y).closePath().fillPath().strokePath(); }
    if (!pl.ok && pl.state !== 'UNAFFORDABLE') return;
    let dir = 0; if (ui.tool === 'pump') { const x = ui.pending.x, y = ui.pending.y, h = (inb(x + 1, y) && game.pipe[idx(x + 1, y)]) || (inb(x - 1, y) && game.pipe[idx(x - 1, y)]); dir = game.pumpAutoDir(x, y, h ? 'h' : 'v'); }
    for (const q of game.connectionPoints(ui.tool, ui.pending.x, ui.pending.y, dir)) {
      if (!inb(q.x, q.y) || game.occ[idx(q.x, q.y)]) continue; const a = tc(q.from[0], q.from[1]), b = tc(q.x, q.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      g.fillStyle(q.role === 'out' ? 0xffb74d : q.role === 'in' ? 0x4fc3f7 : 0xffffff, 1).lineStyle(1.5, 0x10202e, 1).fillCircle(mx, my, 4.5).strokeCircle(mx, my, 4.5);
    }
  }
  function updateConfirm() {
    const box = $('#confirm'); let txt = '', ok = false;
    if (ui.tool === 'pipe') {
      if (!ui.a || ui.dragging) { box.hidden = true; return; }
      const r = ui.route; txt = !r ? T('اسحب الأنبوب إلى وجهته') : r.free && r.clear ? T('اسحب الأنبوب حتى يصل إلى خزان أو أنبوب أو مضخة') : r.ok && game.s.cash < r.cost ? why('cash') : why(r.reason); ok = false;
      box.hidden = false; box.dataset.ok = '0'; $('#cf-text').textContent = txt; $('#cf-ok').hidden = true; return;
    }
    $('#cf-ok').hidden = false;
    if (ui.tool && ui.pending) {
      const pl = game.placement(ui.tool, ui.pending.x, ui.pending.y, ui.kind); ok = pl.ok;
      const nm = ui.tool === 'well' ? T('بئر') : ui.tool === 'tank' ? T('خزان') : T('مضخة'), cash = game.s.cash, money3 = nm + ' · ' + T('التكلفة') + ' ' + money(pl.cost) + ' · ' + T('الرصيد') + ' ' + money(cash) + ' ← ' + money(cash - pl.cost);   // COST / BALANCE / AFTER BUILD (nothing is charged before the build)
      txt = pl.ok ? money3 + (ui.snapped ? ' · ' + T('ملتصق بأقرب مكان صالح') : '') : pl.state === 'UNAFFORDABLE' ? why('cash') + ' · ' + T('التكلفة') + ' ' + money(pl.cost) + ' · ' + T('الرصيد') + ' ' + money(cash) : why(pl.reason);
    } else { box.hidden = true; return; }
    box.hidden = false; box.dataset.ok = ok ? '1' : '0'; $('#cf-text').textContent = txt; $('#cf-ok').disabled = !ok;
  }
  function confirmAction() {
    const now = performance.now(); if (now - ui.lastConfirm < 400) return; ui.lastConfirm = now;       // one press = one transaction
    if (ui.tool === 'pipe') {
      const r = game.buildLine(ui.route); if (!r.ok) { toast(why(r.reason), 'bad'); return; }
      toast(T('تم بناء الأنبوب · ') + r.segments + T(' قطعة · ') + money(r.cost), 'good'); view.scene.netSig = ''; view.scene.drawPipes();
      view.scene.buildFx = r.line ? { id: r.line.id, t0: view.scene.time.now } : null;
      const id = r.line && r.line.id; setTool(null); if (id) select({ kind: 'line', id }); save(); return;
    }
    if (ui.tool && ui.pending) {
      const r = game.place(ui.tool, ui.pending.x, ui.pending.y, ui.kind); if (!r.ok) { toast(why(r.reason), 'bad'); return; }
      toast(T('تم البناء · ') + money(r.cost), 'good'); const id = r.building.id; setTool(null); select({ kind: 'b', id }); save();
    }
  }
  function cancel() { ui.pending = null; ui.snapped = false; ui.a = ui.b = null; ui.route = null; ui.dragging = false; ui.dragKey = ''; view.tip = null; if (view.scene) { view.scene.prevG.clear(); view.scene.previewGeom = null; showGhost(); } updateConfirm(); updateHint(); }
  function setTool(t, ptype) {
    ui.tool = t; if (ptype != null) ui.ptype = ptype; cancel();
    $$('#buildmenu button').forEach(b => b.classList.toggle('on', b.dataset.tool === t && (t !== 'pipe' || +b.dataset.ptype === ui.ptype)));
    $('#buildmenu').hidden = !t && !$('#b-build').classList.contains('on');
    if (!t) { $('#b-build').classList.remove('on'); $('#buildmenu').hidden = true; }
    if (t) select(null); touch.sync(); updateHint();
  }
  function select(s) { ui.sel = s; renderPanel(); }
  function renderPanel() {
    const p = $('#panel'), s = ui.sel; if (!s) { p.hidden = true; return; }
    let title = '', rows = [], btns = [];
    if (s.kind === 'b') {
      const b = game.buildings.find(q => q.id === s.id); if (!b) { ui.sel = null; p.hidden = true; return; }
      if (b.type === 'well') { const h = game.wellHyd(b); title = T('بئر نفط'); rows = [[T('الإنتاج الممكن'), h.productionPotential.toFixed(1) + T(' برميل/د')], [T('التدفق الحالي'), h.currentFlow.toFixed(1) + T(' برميل/د')], [T('ضغط المكمن'), bar(h.reservoirPressure)], [T('ضغط رأس البئر'), bar(h.wellHeadPressure)], [T('متصل بخزان'), game.isWellConnected(b) ? T('نعم') : T('لا')], [T('الحالة'), Math.round((b.condition || 0) * 100) + '%']]; }
      else if (b.type === 'tank') { const h = game.tankHyd(b); title = T('خزان'); rows = [[T('المخزون'), num(h.inventory) + T(' برميل')], [T('السعة'), num(h.capacity) + T(' برميل')], [T('الامتلاء'), Math.round(h.fillRatio * 100) + '%'], [T('الضغط الخلفي'), bar(h.backPressure)], [T('التدفق الداخل'), h.currentInflow.toFixed(1) + T(' برميل/د')], [T('المستوى'), b.level]]; }
      else if (b.type === 'pump') {
        const h = game.pumpHyd(b), SL = pumpStateText();
        title = T('مضخة') + ' #' + b.id;
        rows = [[T('الحالة'), SL[h.state] || h.state, 'p-' + h.state.toLowerCase()], [T('التدفق'), h.flow.toFixed(1) + ' / ' + h.maxFlow.toFixed(0) + T(' برميل/د')], [T('ضغط الدخول'), bar(h.pressureIn)], [T('ضغط الخروج'), bar(h.pressureOut)],
          [T('دفع الضغط'), '+' + bar(h.boost)], [T('رأس المضخة'), h.head.toFixed(0) + ' / ' + h.headMax.toFixed(0) + T(' م')], [T('تكلفة التشغيل'), '$' + h.costPerMin.toFixed(2) + T('/د') + ' · ' + h.kw.toFixed(0) + ' kW'], [T('التكلفة الإجمالية'), '$' + h.costTotal.toFixed(1)]];
        btns = [['pumpToggle', h.enabled ? T('إيقاف') : T('تشغيل')], ['pumpFlip', T('عكس الاتجاه')], ['remove', T('إزالة'), 'danger']];
        if (b.level < game.maxLevel(b)) btns.splice(2, 0, ['pumpUp', T('ترقية') + ' · ' + money(game.upgradeCost(b))]);
        $('#pn-title').textContent = title; paintPanel(rows, btns); return;
      }
      btns = [['remove', T('إزالة'), 'danger']];
    } else if (s.kind === 'line') {
      const L = game.lines.find(q => q.id === s.id); if (!L) { ui.sel = null; p.hidden = true; return; }
      const i = game.lineHyd(L, s.k), nm = id => id[0] === 'B' ? nodeName(game.nodeById(id)) : id[0] === 'J' ? T('وصلة') : T('نهاية مفتوحة'), lv = { normal: T('طبيعي'), busy: T('مشغول'), high: T('مرتفع'), bottleneck: T('اختناق') }[i.usageLevel];
      title = (L.type ? T('أنبوب رئيسي') : T('أنبوب فرعي')) + ' #' + L.id;
      const on = i.currentFlow > 0.05, vk = valveTile(L, s.k), vh = vk != null && game.valve[vk] ? game.valveHyd(vk) : null, up = game.pipeUpgradeInfo(L.cells[0]);
      rows = [[T('من'), nm(i.from || L.a)], [T('إلى'), nm(i.to || L.b)], [T('التدفق'), i.currentFlow.toFixed(1) + T(' برميل/د')], [T('السعة'), i.capacity.toFixed(0) + T(' برميل/د')], [T('الاستخدام'), Math.round(i.usage * 100) + '% · ' + lv, 'u-' + i.usageLevel],
        [T('ضغط الدخول'), bar(i.pressureIn)], [T('ضغط الخروج'), bar(i.pressureOut)], [T('فقد الضغط'), bar(i.pressureLoss)],
        [T('الحالة'), { OPEN: T('طرف مفتوح'), CONNECTED: T('متصل'), BUILDING: T('قيد البناء'), INVALID: T('غير صالح') }[i.state] || i.state], [T('الطول'), Math.round(i.length) + T(' م · ') + L.cells.length + T(' قطعة')]];
      if (vh) rows.push([T('الصمام'), VST()[vh.status] || vh.status, 'v-' + vh.status.toLowerCase()], [T('تدفق الصمام'), vh.flow.toFixed(1) + T(' برميل/د')], [T('ضغط قبل الصمام'), bar(vh.pressureBefore)], [T('ضغط بعد الصمام'), bar(vh.pressureAfter)]);
      btns = [];
      if (up && !up.maxed) btns.push(['pipeUp', T('ترقية الأنبوب') + ' · ' + money(up.cost)]);
      if (vk != null) { if (!vh) btns.push(['valveAdd', T('إضافة صمام') + ' · ' + money(CFG.COST.valve)]); else btns.push(['valve1', VST().OPEN, game.valve[vk] === 1 ? 'on' : ''], ['valve2', VST().PARTIAL, game.valve[vk] === 2 ? 'on' : ''], ['valve3', VST().CLOSED, game.valve[vk] === 3 ? 'on' : ''], ['valve0', T('إزالة الصمام')]); }
      btns.push(['removeLine', T('إزالة الأنبوب'), 'danger']);
    }
    $('#pn-title').textContent = title; paintPanel(rows, btns);
  }
  /* The panel is refreshed 4x a second with live numbers. The DOM is only rewritten when the text really changed - a button that is replaced
     while a finger is on it would lose the touch (no click), so buttons are left alone unless the set of buttons changed. */
  let panelRows = '', panelBtns = '';
  function paintPanel(rows, btns) {
    const p = $('#panel'), r = rows.map(r => '<li' + (r[2] ? ' class="' + r[2] + '"' : '') + '><small>' + r[0] + '</small><b>' + r[1] + '</b></li>').join(''),
      b = btns.map(b => '<button type="button" class="' + (b[2] || '') + '" data-act="' + b[0] + '">' + b[1] + '</button>').join('');
    if (r !== panelRows) { panelRows = r; $('#pn-rows').innerHTML = r; }
    if (b !== panelBtns) { panelBtns = b; $('#pn-btns').innerHTML = b; }
    p.hidden = false;
  }
  const pumpStateText = () => ({ OFF: T('متوقفة'), STARTING: T('تبدأ'), RUNNING: T('تعمل'), STARVED: T('جائعة (بلا نفط)'), OVERLOAD: T('حمل زائد'), STOPPED: T('واقفة (لا مكان للنفط)') });
  const VST = () => ({ OPEN: T('مفتوح'), PARTIAL: T('جزئي'), CLOSED: T('مغلق'), MOVING: T('يتحرك') });
  // the tile a valve goes on: the tapped tile if it is a plain pipe tile of this line, else the middle one
  function valveTile(L, k) { const ok = q => q != null && game.pipe[q] && !game.occ[q]; if (ok(k) && L.cells.includes(k)) return k; const m = L.cells[L.cells.length >> 1]; return ok(m) ? m : null; }
  function panelAct(a) {
    const s = ui.sel; if (!s) return;
    if (a === 'remove') { const b = game.buildings.find(q => q.id === s.id); if (b) { const r = game.removeAt(b.x, b.y); toast(T('تمت الإزالة · استرجاع ') + money(r.refund || 0)); } }
    if (a === 'pumpToggle') { const b = game.buildings.find(q => q.id === s.id); if (b) game.setPumpEnabled(b, b.enabled === false); renderPanel(); save(); return; }
    if (a === 'pumpFlip') { const b = game.buildings.find(q => q.id === s.id); if (b) game.flipPump(b); renderPanel(); save(); return; }
    if (a === 'pumpUp') { const b = game.buildings.find(q => q.id === s.id), r = b && game.upgrade ? game.upgrade(b) : { ok: false, reason: 'nothing' }; if (!r.ok) toast(why(r.reason), 'bad'); renderPanel(); save(); return; }
    if (a === 'pipeUp') { const L = game.lines.find(q => q.id === s.id), r = L ? game.upgradePipes(L.cells[0]) : { ok: false, reason: 'nothing' }; toast(r.ok ? T('تمت ترقية الأنبوب · ') + money(r.cost) : why(r.reason), r.ok ? 'good' : 'bad'); renderPanel(); save(); return; }
    if (a === 'valveAdd' || /^valve[0-3]$/.test(a)) {
      const L = game.lines.find(q => q.id === s.id), vk = L ? valveTile(L, s.k) : null; if (vk == null) return;
      const r = game.setValve(vk, a === 'valveAdd' ? 1 : +a.slice(5)); if (!r.ok) toast(why(r.reason), 'bad'); else if (a === 'valveAdd') toast(T('أُضيف صمام · ') + money(r.cost || 0), 'good');
      renderPanel(); save(); return;
    }
    if (a === 'removeLine') { const L = game.lines.find(q => q.id === s.id); if (L) { let ref = 0; for (const k of L.cells.slice()) { const r = game.removeAt(k % W, (k / W) | 0); ref += r.refund || 0; } toast(T('أُزيل الأنبوب · استرجاع ') + money(ref)); } }
    select(null); save();
  }
  function refreshHud() {
    $('#h-cash').textContent = money(game.s.cash); $('#h-oil').textContent = num(game.oilTotal()) + T(' برميل'); $('#h-price').textContent = money(game.s.price);
    $$('#buildmenu button').forEach(b => { const c = b.dataset.tool === 'well' ? CFG.WELL_KINDS.small.cost : b.dataset.tool === 'tank' ? CFG.COST.tank : b.dataset.tool === 'pump' ? CFG.COST.pump : b.dataset.ptype === '1' ? CFG.COST.pipeMain : CFG.COST.pipe; b.classList.toggle('poor', game.s.cash < c); });
    paintWarnings();
    if (ui.sel) renderPanel();
  }
  /* warning bar: exactly game.warnings (set by the simulation after each solve); the DOM is only touched when the list changes */
  let warnSig = '';
  function warnText(w) {
    const pc = v => Math.round((v || 0) * 100) + '%';
    switch (w.code) {
      case 'BOTTLENECK': return T('اختناق: أنبوب #') + w.id + ' · ' + pc(w.value);
      case 'HIGH_PRESSURE': return T('ضغط عالٍ: ') + bar(w.value);
      case 'LOW_PRESSURE': return T('ضغط منخفض: البئر #') + w.id + T(' يعطي ') + pc(w.value) + T(' من طاقته');
      case 'PUMP_STARVED': return T('مضخة #') + w.id + T(' جائعة: لا يصلها نفط');
      case 'TANK_BACKPRESSURE': return T('ضغط خلفي: خزان #') + w.id + ' · ' + bar(w.value);
      case 'VALVE_CLOSED': return T('صمام مغلق على الأنبوب #') + w.id;
    }
    return w.code;
  }
  function paintWarnings() {
    const arr = game.warnings || [], sig = arr.map(w => w.code + w.id + (w.value != null ? Math.round(w.value * 20) : '')).join('|');
    if (sig === warnSig) return; warnSig = sig;
    const el = $('#warns'); el.hidden = !arr.length;
    el.innerHTML = arr.slice(0, 3).map((w, i) => '<button type="button" class="w-' + w.code.toLowerCase() + '" data-w="' + i + '">' + warnText(w) + '</button>').join('') + (arr.length > 3 ? '<span>+' + (arr.length - 3) + '</span>' : '');
  }
  function warnTap(i) {
    const w = (game.warnings || [])[i]; if (!w) return;
    if (w.kind === 'line' || w.kind === 'valve') select({ kind: 'line', id: w.id, k: w.k });
    else if (w.kind === 'b') select({ kind: 'b', id: w.id });
  }
  function updateHint() {
    const h = $('#hint'); let s = '';
    if (ui.tool === 'pipe') s = !ui.a ? T('المس بئراً أو خزاناً أو مضخة أو أنبوباً واسحب. للإلغاء: أرجع الأنبوب إلى بدايته وارفع') : '';
    else if (ui.tool === 'well') s = ui.pending ? '' : T('المس الخريطة واسحب البئر إلى البقع الداكنة (أرض فيها نفط)');
    else if (ui.tool) s = ui.pending ? '' : T('المس الخريطة واسحب المبنى إلى مكانه');
    h.hidden = !s; h.textContent = s;
  }
  let toastT = 0;
  function toast(msg, cls) { const t = $('#toast'); t.textContent = msg; t.className = cls || ''; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }

  /* ---------- DOM controls ---------- */
  $('#b-build').addEventListener('click', () => { const on = !$('#b-build').classList.contains('on'); $('#b-build').classList.toggle('on', on); $('#buildmenu').hidden = !on; if (!on) setTool(null); else select(null); });
  $$('#buildmenu button').forEach(b => b.addEventListener('click', () => { const t = b.dataset.tool, pt = t === 'pipe' ? +b.dataset.ptype : null; if (ui.tool === t && (t !== 'pipe' || pt === ui.ptype)) return; setTool(t, pt); $('#b-build').classList.add('on'); $('#buildmenu').hidden = false; }));
  $$('#buildmenu [data-cost]').forEach(e => { const k = e.dataset.cost; e.textContent = k === 'well' ? T('من ') + money(CFG.WELL_KINDS.small.cost) : k === 'pipe' ? money(CFG.COST.pipe) + T('/قطعة') : k === 'pipeMain' ? money(CFG.COST.pipeMain) + T('/قطعة') : money(CFG.COST[k]); });
  $$('#buildmenu i[data-art]').forEach(i => { const k = i.dataset.art, a = window.ART && (ART.spr[k] || (k === 'pumpX' && ART.pump && { src: ART.pump.x })); if (a) i.style.backgroundImage = 'url(' + a.src + ')'; });
  $('#cf-ok').addEventListener('click', confirmAction);
  $('#cf-no').addEventListener('click', () => { cancel(); if (ui.tool !== 'pipe') { /* keep the tool so the player can tap another spot */ } });
  $('#pn-close').addEventListener('click', () => select(null));
  $('#warns').addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (b) warnTap(+b.dataset.w); });
  $('#pn-btns').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) panelAct(b.dataset.act); });
  // Focus: glide (never teleport) to the selected building / pipe, or else to the facility nearest the screen centre
  function focusTarget() {
    if (ui.sel && ui.sel.kind === 'b') { const b = game.buildings.find(q => q.id === ui.sel.id); if (b) { const [fw, fh] = game.footprintOf(b.type); return tc(b.x + (fw - 1) / 2, b.y + (fh - 1) / 2); } }
    if (ui.sel && ui.sel.kind === 'line') { const L = game.lines.find(q => q.id === ui.sel.id); if (L) return kc(L.cells[Math.floor(L.cells.length / 2)]); }
    const c = view.cam, mid = camApi.s2w(c.width / 2, c.height / 2); let best = null, bd = 1e18;
    for (const b of game.buildings) { const q = tc(b.x, b.y), d = (q.x - mid.x) ** 2 + (q.y - mid.y) ** 2; if (d < bd) { bd = d; best = q; } }
    return best;
  }
  $('#b-focus').addEventListener('click', () => { const p = focusTarget(); if (!p) return toast(T('لا توجد منشآت بعد'), 'bad'); camApi.focus(p.x, p.y - 30); });
  /* ---------- settings: sound, music, vibration, language, graphics quality, restart. Saved on the device (oli2-prefs). ---------- */
  const st = $('#settings'), dlg = $('#dialog');
  const savePrefs = () => { try { localStorage.setItem('oli2-prefs', JSON.stringify(prefs)); } catch (e) { /* storage unavailable */ } };
  const paintSettings = () => $$('#settings [data-pref]').forEach(g => g.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(prefs[g.dataset.pref]) === b.dataset.v)));
  $('#b-settings').addEventListener('click', () => { if (st.hidden) { setTool(null); select(null); paintSettings(); } st.hidden = !st.hidden; });
  $('#st-close').addEventListener('click', () => { st.hidden = true; });
  $$('#settings [data-pref]').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const k = g.dataset.pref, v = k === 'lang' || k === 'gfx' ? b.dataset.v : +b.dataset.v;
    if (prefs[k] === v) return; prefs[k] = v; savePrefs(); paintSettings(); buzz(20);
    if (k === 'lang' || k === 'gfx') { save(); location.reload(); return; }          // language / graphics are set when the game starts: save the game and restart it
    toast(T('تم حفظ الإعداد'), 'good');
  }));
  $('#st-reset').addEventListener('click', () => { dlg.hidden = false; });
  $('#dl-no').addEventListener('click', () => { dlg.hidden = true; });
  $('#dl-yes').addEventListener('click', () => {
    dlg.hidden = true; game.reset(); openWholeMap(); select(null); setTool(null); view.scene.netSig = ''; view.scene.paintGround(true);
    const a = game.areas.find(q => q.st === 2 && q.kind !== 'empty') || game.areas[0], A = CFG.EXPLORE.AREA, p = tc(a.ax * A + A / 2, a.ay * A + A / 2); view.cam.setZoom(.9); view.cam.centerOn(p.x, p.y); camApi.clamp();
    save(); st.hidden = true; toast(T('بدأت لعبة جديدة'), 'good'); refreshHud();
  });
  $('#b-sell').addEventListener('click', () => { const n = game.oilTotal(), c0 = game.s.cash, r = game.sell(n); if (!r.ok) return toast(why(r.reason), 'bad'); toast(T('بيع ') + num(n) + T(' برميل · +') + money(game.s.cash - c0), 'good'); refreshHud(); save(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('beforeunload', save);

  /* ---------- start ---------- */
  new Phaser.Game({ type: /[?&]canvas\b/.test(location.search) ? Phaser.CANVAS : Phaser.AUTO, parent: 'world', backgroundColor: '#123a52', scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight }, scene: WorldScene, input: { activePointers: 3 }, render: { antialias: GFX.aa, roundPixels: false }, fps: { target: GFX.fps, limit: GFX.fps === 30 ? 30 : 0 } });

  // test / debug handle (read-only use by the automated tests)
  window.__v2 = { touch, prefs, GFX, game, ui, flowStretches, flowSpeed, renderPanel, view, camApi, pickNode, magnetTarget, freeRoute, pipeDragMove, pipeDragStart, tc, toTile, pipeGeom, nodeAnchor, setTool, select, confirmAction, cancel, save };
})();
